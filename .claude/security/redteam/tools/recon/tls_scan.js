#!/usr/bin/env node
// TLS/SSL analysis. Dispatch: testssl.sh / sslscan (richest) → Node tls.connect() probe.
// Native fallback enumerates TLSv1.0-1.3 protocol support and parses the peer certificate.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { whichBin, runBin, requireArg, httpsTlsInfo } from "./_runner.js";

function parseTestsslJson(data) {
  const result = {
    protocols_supported: [],
    weak_protocols: [],
    cipher_suites: [],
    weak_ciphers: [],
    vulnerabilities: [],
    certificate: {},
  };

  for (const entry of data) {
    const eid = entry.id || "";
    const severity = (entry.severity || "").toUpperCase();
    const finding = entry.finding || "";

    if (eid.startsWith("SSLv") || eid.startsWith("TLS")) {
      if (finding.toLowerCase().includes("offered") || finding.toLowerCase().includes("yes")) {
        result.protocols_supported.push(eid);
        if (["SSLv2", "SSLv3", "TLS1", "TLS1_1"].includes(eid)) {
          result.weak_protocols.push(eid);
        }
      }
    } else if (eid.startsWith("cert_")) {
      const field = eid.replace("cert_", "");
      if (field === "subjectAltName") {
        result.certificate.san_entries = finding.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (field === "notAfter") result.certificate.valid_until = finding;
      else if (field === "notBefore") result.certificate.valid_from = finding;
      else if (field === "commonName") result.certificate.subject = finding;
      else if (field === "issuer") result.certificate.issuer = finding;
      else if (field === "keySize") result.certificate.key_size = finding;
      else if (field === "signatureAlgorithm") result.certificate.signature_algorithm = finding;
      else if (field === "expirationStatus") result.certificate.is_expired = finding.toLowerCase().includes("expired");
      else if (field === "trust") result.certificate.is_self_signed = finding.toLowerCase().includes("self");
    } else if (["CRITICAL", "HIGH", "MEDIUM", "WARN"].includes(severity)) {
      result.vulnerabilities.push({
        name: eid.replace(/_/g, " ").toUpperCase(),
        severity: severity !== "WARN" ? severity.toLowerCase() : "medium",
        description: finding,
      });
    }
  }
  return result;
}

function tryTestssl(hostPort) {
  const testssl = whichBin("testssl.sh") ? "testssl.sh" : (whichBin("testssl") ? "testssl" : null);
  if (!testssl) return null;

  const jsonPath = path.join(os.tmpdir(), `testssl_${Date.now()}_${process.pid}.json`);
  try {
    const res = runBin(testssl, ["--jsonfile", jsonPath, "--warnings", "off", "--color", "0", "-U", hostPort], { timeout: 180000 });
    if (res.killed) return { error: "testssl timed out", target: hostPort };

    if (fs.existsSync(jsonPath) && fs.statSync(jsonPath).size > 0) {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      if (Array.isArray(data)) {
        const r = parseTestsslJson(data);
        r.target = hostPort;
        r.tool = "testssl.sh";
        return r;
      }
    }
    return null;
  } finally {
    try { fs.unlinkSync(jsonPath); } catch { /* ignore */ }
  }
}

function trySslscan(hostPort) {
  if (!whichBin("sslscan")) return null;
  const res = runBin("sslscan", ["--no-colour", hostPort], { timeout: 60000 });
  if (res.killed) return { error: "sslscan timed out", target: hostPort };
  if (!res.stdout) return null;
  return {
    target: hostPort,
    tool: "sslscan",
    raw_output: res.stdout.slice(0, 5000),
    protocols_supported: [],
    vulnerabilities: [],
    certificate: {},
  };
}

function tryBinary(hostPort) {
  return tryTestssl(hostPort) || trySslscan(hostPort);
}

function probePortOpen(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; try { sock.destroy(); } catch { /* */ } resolve(ok); } };
    sock.setTimeout(timeout);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(port, host);
  });
}

function certToJson(cert) {
  if (!cert || !cert.subject) return {};
  const subjectStr = Object.entries(cert.subject || {}).map(([k, v]) => `${k}=${v}`).join(", ");
  const issuerStr = Object.entries(cert.issuer || {}).map(([k, v]) => `${k}=${v}`).join(", ");
  const sans = [];
  if (cert.subjectaltname) {
    for (const part of cert.subjectaltname.split(",")) {
      const trimmed = part.trim();
      // "DNS:example.com" → "example.com"
      const colon = trimmed.indexOf(":");
      sans.push(colon >= 0 ? trimmed.slice(colon + 1) : trimmed);
    }
  }
  const now = Date.now();
  const notAfter = cert.valid_to ? Date.parse(cert.valid_to) : NaN;
  const isExpired = !isNaN(notAfter) && notAfter < now;
  // self-signed: issuer matches subject
  const isSelfSigned = subjectStr && issuerStr && subjectStr === issuerStr;

  return {
    subject: subjectStr,
    issuer: issuerStr,
    valid_from: cert.valid_from || "",
    valid_until: cert.valid_to || "",
    san_entries: sans,
    key_type: cert.asn1Curve || cert.pubkey ? "EC/RSA" : "",
    key_size: cert.bits || 0,
    signature_algorithm: cert.sigalg || "",
    is_expired: isExpired,
    is_self_signed: isSelfSigned,
    fingerprint_sha256: cert.fingerprint256 || "",
  };
}

async function tryNative(hostPort) {
  let host = hostPort, port = 443;
  if (hostPort.includes(":")) {
    const parts = hostPort.split(":");
    host = parts[0];
    port = parseInt(parts[1], 10) || 443;
  }

  // Verify TLS port is reachable
  const reachable = await probePortOpen(host, port, 3000);
  if (!reachable) {
    return {
      target: hostPort, tool: "node:tls",
      certificate: {}, protocols_supported: [], weak_protocols: [],
      cipher_suites: [], weak_ciphers: [], vulnerabilities: [],
      note: `No TLS service listening on ${host}:${port}`,
    };
  }

  // Probe each protocol version
  const protocolTests = [
    { id: "TLSv1", method: "TLSv1_method", weak: true },
    { id: "TLSv1.1", method: "TLSv1_1_method", weak: true },
    { id: "TLSv1.2", method: "TLSv1_2_method", weak: false },
    { id: "TLSv1.3", method: "TLSv1_3_method", weak: false },
  ];
  const protocols_supported = [];
  const weak_protocols = [];
  let cert = null, negotiated_cipher = null;

  for (const t of protocolTests) {
    const info = await httpsTlsInfo(host, port, { servername: host, timeout: 6000, secureProtocol: t.method });
    if (info.ok) {
      protocols_supported.push(t.id);
      if (t.weak) weak_protocols.push(t.id);
      if (!cert && info.cert) cert = info.cert;
      if (!negotiated_cipher && info.cipher) negotiated_cipher = info.cipher;
    }
  }

  // If none negotiated explicitly, try a default connect to gather cert at least
  if (!cert) {
    const info = await httpsTlsInfo(host, port, { servername: host, timeout: 6000 });
    if (info.ok) {
      cert = info.cert;
      negotiated_cipher = info.cipher;
      if (info.protocol && !protocols_supported.includes(info.protocol)) {
        protocols_supported.push(info.protocol);
      }
    }
  }

  const vulnerabilities = [];
  if (weak_protocols.length) {
    vulnerabilities.push({
      name: "WEAK_TLS_PROTOCOL",
      severity: "medium",
      description: `Deprecated protocols offered: ${weak_protocols.join(", ")}`,
    });
  }
  const certJson = certToJson(cert);
  if (certJson.is_expired) {
    vulnerabilities.push({ name: "EXPIRED_CERT", severity: "high", description: `Certificate expired at ${certJson.valid_until}` });
  }
  if (certJson.is_self_signed) {
    vulnerabilities.push({ name: "SELF_SIGNED_CERT", severity: "medium", description: "Certificate is self-signed" });
  }

  const noTls = !cert && protocols_supported.length === 0;
  return {
    target: hostPort,
    tool: "node:tls",
    certificate: certJson,
    protocols_supported,
    weak_protocols,
    cipher_suites: negotiated_cipher ? [negotiated_cipher.name] : [],
    weak_ciphers: [],
    vulnerabilities,
    note: noTls
      ? `Port ${host}:${port} is open but did not complete a TLS handshake (likely HTTP-only or non-TLS protocol)`
      : "Native fallback reports only negotiated cipher per protocol; install testssl.sh for full cipher enumeration",
  };
}

async function analyze(hostPort) {
  if (!hostPort.includes(":")) hostPort = `${hostPort}:443`;
  const fromBin = tryBinary(hostPort);
  if (fromBin) return fromBin;
  return await tryNative(hostPort);
}

const target = requireArg(process.argv, "tls_scan.js", "<host[:port]>");
analyze(target)
  .then((r) => { console.log(JSON.stringify(r, null, 2)); })
  .catch((e) => {
    console.log(JSON.stringify({ error: e.message, target }, null, 2));
    process.exit(2);
  });
