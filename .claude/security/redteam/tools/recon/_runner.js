// Shared helpers for recon tools — binary detection, Node-native HTTP/TLS, top-ports list.
// Dispatcher pattern: tools try binary first, then Node-native, then structured error.

import { execFileSync, execSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import net from "node:net";

/**
 * Return true if `name` is on PATH. Uses `where` on Windows, `which` elsewhere.
 */
export function whichBin(name) {
  try {
    execSync(
      process.platform === "win32" ? `where ${name}` : `which ${name}`,
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a binary with args, capturing stdout. Returns { ok, stdout, stderr, killed }.
 * Never throws.
 */
export function runBin(name, args, opts = {}) {
  const { timeout = 60000, maxBuffer = 50 * 1024 * 1024, input } = opts;
  try {
    const stdout = execFileSync(name, args, {
      timeout,
      maxBuffer,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      input,
    });
    return { ok: true, stdout: stdout || "", stderr: "", killed: false };
  } catch (e) {
    return {
      ok: false,
      stdout: (e.stdout || "").toString(),
      stderr: (e.stderr || "").toString(),
      killed: !!e.killed,
      code: e.status ?? null,
    };
  }
}

/**
 * Node-native HTTP/HTTPS fetch. Resolves to { ok, status, headers, body, error }.
 * - Follows up to 5 redirects
 * - Treats TLS errors as warnings (rejectUnauthorized: false)
 * - Caps body at maxBytes
 */
export function httpFetch(url, opts = {}) {
  const {
    method = "GET",
    headers = {},
    timeout = 15000,
    maxBytes = 2 * 1024 * 1024,
    followRedirects = true,
    maxRedirects = 5,
    body = null,
  } = opts;

  return new Promise((resolve) => {
    let redirectCount = 0;
    const run = (currentUrl) => {
      let parsed;
      try {
        parsed = new URL(currentUrl);
      } catch (e) {
        resolve({ ok: false, error: `bad URL: ${e.message}`, status: 0, headers: {}, body: "" });
        return;
      }
      const mod = parsed.protocol === "https:" ? https : http;
      const reqOpts = {
        method,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; recon-agent/1.0)",
          ...headers,
        },
        timeout,
        rejectUnauthorized: false,
      };
      const req = mod.request(reqOpts, (res) => {
        const status = res.statusCode || 0;
        const resHeaders = res.headers || {};
        // Handle redirects
        if (followRedirects && [301, 302, 303, 307, 308].includes(status) && resHeaders.location) {
          if (redirectCount >= maxRedirects) {
            res.resume();
            resolve({ ok: true, status, headers: resHeaders, body: "", redirects: redirectCount });
            return;
          }
          redirectCount++;
          const nextUrl = new URL(resHeaders.location, currentUrl).href;
          res.resume();
          run(nextUrl);
          return;
        }
        let chunks = [];
        let received = 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (received <= maxBytes) chunks.push(chunk);
          else if (received > maxBytes && chunks.length) {
            res.destroy();
          }
        });
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            ok: true,
            status,
            headers: resHeaders,
            body: buf.toString("utf-8"),
            redirects: redirectCount,
            finalUrl: currentUrl,
          });
        });
        res.on("error", (e) => {
          resolve({ ok: false, error: e.message, status, headers: resHeaders, body: "" });
        });
      });
      req.on("error", (e) => {
        resolve({ ok: false, error: e.message, status: 0, headers: {}, body: "" });
      });
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, error: "timeout", status: 0, headers: {}, body: "" });
      });
      if (body) req.write(body);
      req.end();
    };
    run(url);
  });
}

/**
 * Probe TLS info via `tls.connect`. Returns { ok, cert, protocol, cipher, error }.
 * Set `secureProtocol` to test a specific protocol version.
 */
export function httpsTlsInfo(host, port = 443, opts = {}) {
  const { servername = host, timeout = 10000, secureProtocol } = opts;
  return new Promise((resolve) => {
    const connectOpts = {
      host,
      port,
      servername,
      rejectUnauthorized: false,
      timeout,
    };
    if (secureProtocol) {
      connectOpts.secureProtocol = secureProtocol;
      // For Node 20: also restrict min/max via minVersion/maxVersion mapping
      const protoMap = {
        TLSv1_method: { minVersion: "TLSv1", maxVersion: "TLSv1" },
        TLSv1_1_method: { minVersion: "TLSv1.1", maxVersion: "TLSv1.1" },
        TLSv1_2_method: { minVersion: "TLSv1.2", maxVersion: "TLSv1.2" },
        TLSv1_3_method: { minVersion: "TLSv1.3", maxVersion: "TLSv1.3" },
      };
      if (protoMap[secureProtocol]) {
        delete connectOpts.secureProtocol;
        Object.assign(connectOpts, protoMap[secureProtocol]);
      }
    }
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };
    const socket = tls.connect(connectOpts, () => {
      try {
        const cert = socket.getPeerCertificate(true);
        const cipher = socket.getCipher();
        const protocol = socket.getProtocol();
        socket.end();
        done({ ok: true, cert, cipher, protocol });
      } catch (e) {
        socket.destroy();
        done({ ok: false, error: e.message });
      }
    });
    socket.on("error", (e) => done({ ok: false, error: e.message }));
    socket.on("timeout", () => { socket.destroy(); done({ ok: false, error: "timeout" }); });
  });
}

/**
 * Top 100 common TCP ports — used by port_scan native fallback.
 * Subset of nmap's --top-ports 1000 weighted list.
 */
export const TOP_PORTS = [
  21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 465, 514, 515,
  587, 631, 636, 873, 990, 993, 995, 1025, 1026, 1027, 1028, 1029, 1080,
  1110, 1234, 1433, 1434, 1521, 1720, 1723, 1755, 1900, 2000, 2001, 2049,
  2121, 2222, 2375, 2376, 2483, 3000, 3001, 3128, 3268, 3306, 3389, 3690,
  4000, 4001, 4040, 4200, 4369, 4443, 4444, 4567, 4848, 4899, 5000, 5001,
  5060, 5222, 5269, 5353, 5432, 5555, 5672, 5800, 5900, 5985, 5986, 6000,
  6379, 6443, 6660, 6667, 7000, 7001, 7777, 8000, 8008, 8080, 8081, 8086,
  8088, 8090, 8181, 8443, 8500, 8888, 9000, 9001, 9042, 9090, 9091, 9100,
  9200, 9300, 9418, 9999, 10000, 11211, 15672, 25565, 27017, 27018, 27019,
  50000, 50070,
];

/**
 * Minimal service name guess by port. Used by native port_scan.
 */
export const SERVICE_BY_PORT = {
  21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp", 53: "dns", 80: "http",
  110: "pop3", 111: "rpcbind", 135: "msrpc", 139: "netbios-ssn", 143: "imap",
  443: "https", 445: "smb", 465: "smtps", 514: "syslog", 515: "printer",
  587: "submission", 631: "ipp", 636: "ldaps", 873: "rsync", 990: "ftps",
  993: "imaps", 995: "pop3s", 1080: "socks", 1433: "mssql", 1521: "oracle",
  1723: "pptp", 2049: "nfs", 2375: "docker", 2376: "docker-tls",
  3000: "http-dev", 3001: "http-dev", 3306: "mysql", 3389: "rdp",
  4369: "epmd", 5000: "http-dev", 5432: "postgresql", 5601: "kibana",
  5672: "amqp", 5900: "vnc", 5985: "winrm", 5986: "winrm-https",
  6379: "redis", 6443: "kubernetes-api", 8000: "http-alt", 8080: "http-alt",
  8081: "http-alt", 8086: "influxdb", 8443: "https-alt", 8888: "http-alt",
  9000: "http-alt", 9042: "cassandra", 9090: "prometheus", 9200: "elasticsearch",
  9300: "elasticsearch-tx", 11211: "memcached", 15672: "rabbitmq-mgmt",
  27017: "mongodb", 27018: "mongodb", 50000: "sap", 50070: "hadoop",
};

/**
 * TCP connect-scan a single port. Resolves to { port, state, banner }.
 * "open" if connect succeeds. "closed" on RST. "filtered" on timeout.
 */
export function tcpProbe(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let banner = "";
    let settled = false;
    const finish = (state) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve({ port, state, banner });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      // For services like SSH/SMTP/FTP the server speaks first — wait briefly
      const wait = setTimeout(() => finish("open"), 400);
      socket.on("data", (data) => {
        banner += data.toString("utf-8", 0, Math.min(data.length, 300));
        if (banner.length > 200) {
          clearTimeout(wait);
          finish("open");
        }
      });
    });
    socket.once("timeout", () => finish("filtered"));
    socket.once("error", (e) => {
      if (e && e.code === "ECONNREFUSED") finish("closed");
      else finish("filtered");
    });
    try {
      socket.connect(port, host);
    } catch {
      finish("filtered");
    }
  });
}

/**
 * Run an async function over `items` with concurrency cap.
 */
export async function poolMap(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (true) {
      const myIdx = idx++;
      if (myIdx >= items.length) return;
      results[myIdx] = await fn(items[myIdx], myIdx);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Read CLI argv and exit with usage if shape doesn't match.
 */
export function requireArg(argv, scriptPath, usage = "<target>") {
  if (argv.length !== 3) {
    process.stderr.write(`Usage: node ${scriptPath} ${usage}\n`);
    process.exit(1);
  }
  return argv[2];
}
