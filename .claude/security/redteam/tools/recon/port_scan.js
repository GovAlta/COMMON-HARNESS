#!/usr/bin/env node
// Port scanning. Dispatch: nmap (richest: -sV -sC) → Node TCP-connect scan over TOP_PORTS.
// Native fallback returns the same {port, protocol, state, service, version, banner} shape.

import dns from "node:dns";
import { whichBin, runBin, requireArg, TOP_PORTS, SERVICE_BY_PORT, tcpProbe, poolMap } from "./_runner.js";

function parseNmapXml(xmlStr, target) {
  const hostMatch = xmlStr.match(/<host\b[^>]*>([\s\S]*?)<\/host>/);
  if (!hostMatch) return { target, status: "down", ports: [] };
  const hostBlock = hostMatch[1];

  const statusMatch = hostBlock.match(/<status\b[^>]*state="([^"]*)"[^>]*\/?>/);
  const status = statusMatch ? statusMatch[1] : "unknown";

  const addrMatch = hostBlock.match(/<address\b[^>]*addr="([^"]*)"[^>]*\/?>/);
  const ip = addrMatch ? addrMatch[1] : target;

  const ports = [];
  const portRegex = /<port\b[^>]*protocol="([^"]*)"[^>]*portid="([^"]*)"[^>]*>([\s\S]*?)<\/port>/g;
  let portMatch;
  while ((portMatch = portRegex.exec(hostBlock)) !== null) {
    const protocol = portMatch[1];
    const portId = parseInt(portMatch[2], 10);
    const portBlock = portMatch[3];

    const stateMatch = portBlock.match(/<state\b[^>]*state="([^"]*)"[^>]*\/?>/);
    const state = stateMatch ? stateMatch[1] : "unknown";

    const svcMatch = portBlock.match(/<service\b([^>]*)\/?>/);
    let serviceName = "", version = "", banner = "";
    if (svcMatch) {
      const attrs = svcMatch[1];
      const nameM = attrs.match(/\bname="([^"]*)"/);
      const productM = attrs.match(/\bproduct="([^"]*)"/);
      const versionM = attrs.match(/\bversion="([^"]*)"/);
      const extraM = attrs.match(/\bextrainfo="([^"]*)"/);
      serviceName = nameM ? nameM[1] : "";
      const product = productM ? productM[1] : "";
      const ver = versionM ? versionM[1] : "";
      version = `${product} ${ver}`.trim();
      banner = extraM ? extraM[1] : "";
    }

    const portInfo = {
      port: portId, protocol, state,
      service: serviceName, version, banner,
    };

    const scripts = [];
    const scriptRegex = /<script\b[^>]*id="([^"]*)"[^>]*output="([^"]*)"[^>]*\/?>/g;
    let scriptMatch;
    while ((scriptMatch = scriptRegex.exec(portBlock)) !== null) {
      scripts.push({ id: scriptMatch[1], output: scriptMatch[2] });
    }
    if (scripts.length) portInfo.nmap_scripts = scripts;
    ports.push(portInfo);
  }

  const result = { target, ip, status, ports, source: "nmap" };
  return result;
}

function tryBinary(target) {
  if (!whichBin("nmap")) return null;
  const res = runBin("nmap", [
    "-sV", "-sC", "-T3", "-Pn", "--open",
    "--top-ports", "1000",
    "-oX", "-",
    target,
  ], { timeout: 300000 });
  if (res.killed) return { error: "nmap scan timed out (5 min limit)", target };
  const out = res.stdout || "";
  if (!out) return { error: (res.stderr || "").trim() || "nmap produced no output", target };
  return parseNmapXml(out, target);
}

async function resolveHost(host) {
  // If it's already an IP, return as-is
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return host;
  try {
    const { address } = await dns.promises.lookup(host, { family: 4 });
    return address;
  } catch {
    return host; // fall through and let connect fail
  }
}

async function tryNative(target) {
  const ip = await resolveHost(target);

  const results = await poolMap(TOP_PORTS, 32, async (port) => {
    return await tcpProbe(target, port, 1500);
  });

  const ports = results
    .filter((r) => r.state === "open")
    .map((r) => {
      const svc = SERVICE_BY_PORT[r.port] || "";
      const banner = (r.banner || "").trim().replace(/[\r\n\t]/g, " ").slice(0, 200);
      return {
        port: r.port,
        protocol: "tcp",
        state: "open",
        service: svc,
        version: "",
        banner,
      };
    })
    .sort((a, b) => a.port - b.port);

  return {
    target,
    ip,
    status: ports.length > 0 ? "up" : "down-or-filtered",
    ports,
    source: "node:tcp-connect",
    note: `Scanned ${TOP_PORTS.length} TCP ports; install nmap for full service/version + script coverage`,
  };
}

async function scan(target) {
  const fromBin = tryBinary(target);
  if (fromBin) return fromBin;
  return await tryNative(target);
}

const target = requireArg(process.argv, "port_scan.js", "<target>");
scan(target)
  .then((r) => { console.log(JSON.stringify(r, null, 2)); })
  .catch((e) => {
    console.log(JSON.stringify({ error: e.message, target }, null, 2));
    process.exit(2);
  });
