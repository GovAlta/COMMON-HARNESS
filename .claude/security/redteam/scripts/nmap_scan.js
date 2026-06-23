#!/usr/bin/env node
/**
 * Run a port scan against a target IP or domain.
 *
 * Strategy:
 *   1. If `nmap` is on PATH, use it (richer output: service/version, scripts).
 *   2. Otherwise, fall back to a Node-native TCP-connect scan against a
 *      curated set of well-known ports.
 *
 * Usage:
 *   node nmap_scan.js <ip-or-domain> [--ports 1-1024] [--top-ports]
 */

import { execFileSync } from 'node:child_process';
import net from 'node:net';
import dns from 'node:dns/promises';

// Top ~50 well-known ports — covers HTTP(S), SSH, DB, mail, cache, etc.
// Used when no port range is supplied and nmap is not on PATH.
const TOP_PORTS = [
  21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 161, 389, 443, 445,
  465, 587, 631, 636, 873, 993, 995, 1025, 1080, 1194, 1433, 1521, 1723,
  2049, 2375, 2376, 3000, 3306, 3389, 5000, 5432, 5601, 5900, 6379, 8000,
  8008, 8080, 8081, 8443, 8888, 9000, 9090, 9200, 27017, 50000,
];

const COMMON_SERVICE = {
  21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'dns',
  80: 'http', 110: 'pop3', 111: 'rpcbind', 135: 'msrpc', 139: 'netbios-ssn',
  143: 'imap', 161: 'snmp', 389: 'ldap', 443: 'https', 445: 'microsoft-ds',
  465: 'smtps', 587: 'submission', 631: 'ipp', 636: 'ldaps', 873: 'rsync',
  993: 'imaps', 995: 'pop3s', 1080: 'socks', 1194: 'openvpn',
  1433: 'mssql', 1521: 'oracle', 1723: 'pptp', 2049: 'nfs',
  2375: 'docker', 2376: 'docker-tls', 3000: 'http-alt', 3306: 'mysql',
  3389: 'rdp', 5000: 'http-alt', 5432: 'postgresql', 5601: 'kibana',
  5900: 'vnc', 6379: 'redis', 8000: 'http-alt', 8008: 'http',
  8080: 'http-proxy', 8081: 'http-alt', 8443: 'https-alt', 8888: 'http-alt',
  9000: 'http-alt', 9090: 'http-alt', 9200: 'elasticsearch',
  27017: 'mongodb', 50000: 'sap',
};

// ── helpers ────────────────────────────────────────────────────────

function parsePortArg(argv) {
  const i = argv.indexOf('--ports');
  if (i < 0) return null;
  const range = argv[i + 1];
  if (!range) return null;
  if (range.includes('-')) {
    const [lo, hi] = range.split('-').map(Number);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo && hi <= 65535) {
      const out = [];
      for (let p = lo; p <= hi; p++) out.push(p);
      return out;
    }
  } else {
    const list = range.split(',').map(Number).filter((p) => Number.isInteger(p) && p > 0 && p <= 65535);
    if (list.length) return list;
  }
  return null;
}

async function resolveTarget(target) {
  // Already an IP?
  if (net.isIP(target)) return target;
  try {
    const { address } = await dns.lookup(target, { family: 0 });
    return address;
  } catch {
    return target;
  }
}

function probePort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const done = (state, banner = '') => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch {}
      resolve({ port: String(port), state, banner });
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => {
      // Try to read a banner — many services send something on connect
      let banner = '';
      const bannerTimer = setTimeout(() => done('open', banner.trim()), 400);
      sock.on('data', (chunk) => {
        banner += chunk.toString('utf8', 0, Math.min(chunk.length, 256));
        if (banner.length >= 128) {
          clearTimeout(bannerTimer);
          done('open', banner.trim());
        }
      });
      sock.on('end', () => {
        clearTimeout(bannerTimer);
        done('open', banner.trim());
      });
    });
    sock.once('timeout', () => done('filtered'));
    sock.once('error', (err) => {
      const code = err && err.code;
      if (code === 'ECONNREFUSED') done('closed');
      else done('filtered');
    });
    try {
      sock.connect(port, host);
    } catch {
      done('filtered');
    }
  });
}

async function scanNative(target, ports) {
  const ip = await resolveTarget(target);
  const portList = ports && ports.length ? ports : TOP_PORTS;
  // Limit concurrency so we don't drown a small host.
  const concurrency = 32;
  const results = [];
  let next = 0;
  async function worker() {
    while (next < portList.length) {
      const p = portList[next++];
      // eslint-disable-next-line no-await-in-loop
      const r = await probePort(ip, p);
      if (r.state === 'open') {
        results.push({
          port: String(p),
          protocol: 'tcp',
          state: 'open',
          service: COMMON_SERVICE[p] || '',
          version: '',
          banner: r.banner,
          extra_info: '',
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, portList.length) }, () => worker()));
  results.sort((a, b) => Number(a.port) - Number(b.port));
  return { target, ip, status: 'up', ports: results, scanner: 'node-native' };
}

// ── nmap-based scanning ────────────────────────────────────────────

function isNmapAvailable() {
  try {
    execFileSync('nmap', ['--version'], { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

function scanWithNmap(target, ports) {
  const args = ['-sV', '-sC', '-T3', '-Pn', '--open'];
  if (ports && ports.length) {
    // Compress consecutive ranges for nmap's -p
    args.push('-p', ports.join(','));
  } else {
    args.push('--top-ports', '100');
  }
  args.push(target);
  let out;
  try {
    out = execFileSync('nmap', args, { encoding: 'utf-8', timeout: 5 * 60 * 1000 });
  } catch (e) {
    return { target, ip: target, status: 'unknown', ports: [], error: String(e && e.message || e), scanner: 'nmap' };
  }
  return parseNmap(out, target);
}

function parseNmap(stdout, target) {
  const ports = [];
  const lines = stdout.split(/\r?\n/);
  let addr = '';
  for (const line of lines) {
    const addrMatch = line.match(/Nmap scan report for [^(]*\(?([\d.:a-fA-F]+)\)?/);
    if (addrMatch) addr = addrMatch[1];
    const portMatch = line.match(/^(\d+)\/(tcp|udp)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/);
    if (portMatch) {
      ports.push({
        port: portMatch[1],
        protocol: portMatch[2],
        state: portMatch[3],
        service: portMatch[4],
        version: (portMatch[5] || '').trim(),
        banner: '',
        extra_info: '',
      });
    }
  }
  return { target, ip: addr || target, status: 'up', ports, scanner: 'nmap' };
}

// ── CLI ───────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    process.stderr.write(`Usage: ${process.argv[1]} <ip-or-domain> [--ports 1-1024]\n`);
    process.exit(1);
  }
  const target = argv[0];
  const ports = parsePortArg(argv);

  let output;
  if (isNmapAvailable()) {
    output = scanWithNmap(target, ports);
  } else {
    output = await scanNative(target, ports);
  }
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(`nmap_scan failed: ${err.message || err}\n`);
  process.exit(2);
});
