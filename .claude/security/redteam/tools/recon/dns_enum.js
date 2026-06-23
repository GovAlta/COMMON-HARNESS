#!/usr/bin/env node
// DNS record enumeration. Dispatch: dig (richest) → Node dns.promises (cross-platform).
// AXFR/DNSSEC have limited Node-native support — flagged with notes in the output.

import dns from "node:dns";
import { whichBin, runBin, requireArg } from "./_runner.js";

function parseDig(output) {
  if (!output) return [];
  return output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function tryBinary(domain) {
  if (!whichBin("dig")) return null;
  const recordTypes = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA"];
  const results = { target: domain, source: "dig" };

  for (const rtype of recordTypes) {
    const res = runBin("dig", ["+short", domain, rtype], { timeout: 30000 });
    const key = rtype !== "SOA" ? `${rtype.toLowerCase()}_records` : "soa_record";
    const raw = res.ok ? res.stdout.trim() : "";
    if (rtype === "SOA") {
      results[key] = raw || "";
    } else {
      results[key] = parseDig(raw);
    }
  }

  results.zone_transfer_possible = false;
  for (const ns of results.ns_records || []) {
    const nsHost = ns.replace(/\.$/, "");
    const axfr = runBin("dig", [`@${nsHost}`, domain, "AXFR", "+short"], { timeout: 15000 });
    if (axfr.ok && axfr.stdout && axfr.stdout.split(/\r?\n/).length > 2) {
      results.zone_transfer_possible = true;
      results.zone_transfer_ns = nsHost;
      break;
    }
  }

  const dnssec = runBin("dig", ["+dnssec", "+short", domain, "DNSKEY"], { timeout: 15000 });
  const dnssecOut = dnssec.ok ? dnssec.stdout : "";
  results.dnssec_enabled = !!(dnssecOut && !dnssecOut.includes("DNSKEY") && dnssecOut.length > 10);

  return results;
}

async function safeResolve(method, domain) {
  try {
    return await method.call(dns.promises, domain);
  } catch {
    return null;
  }
}

async function tryNative(domain) {
  const r = dns.promises;
  const results = { target: domain, source: "node:dns" };

  const a = await safeResolve(r.resolve4, domain);
  results.a_records = Array.isArray(a) ? a : [];

  const aaaa = await safeResolve(r.resolve6, domain);
  results.aaaa_records = Array.isArray(aaaa) ? aaaa : [];

  const mx = await safeResolve(r.resolveMx, domain);
  results.mx_records = Array.isArray(mx)
    ? mx.map((m) => `${m.priority} ${m.exchange}`)
    : [];

  const ns = await safeResolve(r.resolveNs, domain);
  results.ns_records = Array.isArray(ns) ? ns : [];

  const txt = await safeResolve(r.resolveTxt, domain);
  results.txt_records = Array.isArray(txt) ? txt.map((parts) => parts.join("")) : [];

  const cname = await safeResolve(r.resolveCname, domain);
  results.cname_records = Array.isArray(cname) ? cname : [];

  const soa = await safeResolve(r.resolveSoa, domain);
  if (soa && typeof soa === "object") {
    results.soa_record = `${soa.nsname} ${soa.hostmaster} ${soa.serial} ${soa.refresh} ${soa.retry} ${soa.expire} ${soa.minttl}`;
  } else {
    results.soa_record = "";
  }

  // AXFR — not testable from pure Node without a third-party DNS lib
  results.zone_transfer_possible = false;
  results.zone_transfer_note = "AXFR not testable without dig";

  // DNSSEC — Node's dns module doesn't surface DNSKEY records directly.
  // We can only confirm SOA resolves, which is a weak proxy.
  results.dnssec_enabled = false;
  results.dnssec_note = "DNSKEY lookup unsupported by node:dns; install dig for definitive answer";

  return results;
}

async function enumerate(domain) {
  const fromBin = tryBinary(domain);
  if (fromBin) return fromBin;
  return await tryNative(domain);
}

const domain = requireArg(process.argv, "dns_enum.js", "<domain>");
enumerate(domain)
  .then((r) => { console.log(JSON.stringify(r, null, 2)); })
  .catch((e) => {
    console.log(JSON.stringify({ error: e.message, target: domain }, null, 2));
    process.exit(2);
  });
