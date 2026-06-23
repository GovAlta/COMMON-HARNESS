#!/usr/bin/env node
// WHOIS lookup. Dispatch: whois binary (richest) → whois-json npm package → structured error.
// Output fields normalized regardless of source.

import { whichBin, runBin, requireArg } from "./_runner.js";

function extract(pattern, text, defaultVal = "") {
  const m = text.match(pattern);
  return m ? m[1].trim() : defaultVal;
}

function parseRaw(raw, domain) {
  const nsMatches = raw.matchAll(/Name Server:\s*(.+)/gi);
  const nameServers = [...new Set(
    [...nsMatches].map((m) => m[1].trim().toLowerCase())
  )].sort();

  return {
    target: domain,
    source: "whois",
    registrar: extract(/Registrar:\s*(.+)/i, raw),
    creation_date: extract(/Creat(?:ion|ed)\s*Date:\s*(.+)/i, raw),
    expiry_date: extract(/(?:Expir(?:y|ation)\s*Date|Registry Expiry Date):\s*(.+)/i, raw),
    updated_date: extract(/Updated Date:\s*(.+)/i, raw),
    registrant_org: extract(/Registrant Organi[sz]ation:\s*(.+)/i, raw),
    registrant_country: extract(/Registrant Country:\s*(.+)/i, raw),
    name_servers: nameServers,
    dnssec: extract(/DNSSEC:\s*(.+)/i, raw),
    raw_summary: raw.slice(0, 3000),
  };
}

function tryBinary(domain) {
  if (!whichBin("whois")) return null;
  const res = runBin("whois", [domain], { timeout: 30000 });
  if (res.killed) return { error: "whois timed out", target: domain };
  const raw = res.stdout || res.stderr || "";
  if (!raw.trim()) return null;
  return parseRaw(raw, domain);
}

function pickAny(obj, keys) {
  if (!obj || typeof obj !== "object") return "";
  const lower = {};
  for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k];
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v != null && v !== "") return Array.isArray(v) ? v.join(", ") : String(v);
  }
  return "";
}

async function tryNative(domain) {
  // whois-json: pure-JS WHOIS client. Connects directly to TCP/43.
  let whoisJson;
  try {
    const mod = await import("whois-json");
    whoisJson = mod.default || mod;
  } catch {
    return null;
  }

  let data;
  try {
    data = await whoisJson(domain, { follow: 3, timeout: 15000 });
  } catch (e) {
    return { error: `whois-json failed: ${e.message}`, target: domain };
  }
  if (!data || typeof data !== "object") {
    return { error: "whois-json returned no data", target: domain };
  }

  // whois-json normalizes some keys but variants exist; probe several.
  const registrar = pickAny(data, ["registrar", "sponsoringRegistrar"]);
  const creation = pickAny(data, ["creationDate", "createdDate", "created", "registered"]);
  const expiry = pickAny(data, [
    "registryExpiryDate", "registrarRegistrationExpirationDate",
    "expiresOn", "expiryDate", "expirationDate", "expires",
  ]);
  const updated = pickAny(data, ["updatedDate", "lastUpdated"]);
  const org = pickAny(data, ["registrantOrganization", "registrantOrg"]);
  const country = pickAny(data, ["registrantCountry"]);
  const dnssec = pickAny(data, ["dnssec"]);

  // Name servers can come as one combined string or multiple keys
  let ns = [];
  const nsStr = pickAny(data, ["nameServer", "nameservers", "nameservers1"]);
  if (nsStr) {
    ns = nsStr.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  for (const k of Object.keys(data)) {
    if (/^nameserver/i.test(k)) {
      const v = data[k];
      if (Array.isArray(v)) ns.push(...v.map((x) => String(x).toLowerCase()));
      else if (typeof v === "string") ns.push(v.toLowerCase());
    }
  }
  ns = [...new Set(ns)].sort();

  return {
    target: domain,
    source: "whois-json",
    registrar,
    creation_date: creation,
    expiry_date: expiry,
    updated_date: updated,
    registrant_org: org,
    registrant_country: country,
    name_servers: ns,
    dnssec,
    raw_summary: JSON.stringify(data).slice(0, 3000),
  };
}

async function lookup(domain) {
  const fromBin = tryBinary(domain);
  if (fromBin) return fromBin;
  const fromNative = await tryNative(domain);
  if (fromNative) return fromNative;
  return {
    error: "whois binary not in PATH and whois-json package not installed (npm install whois-json)",
    target: domain,
    registrar: "",
    name_servers: [],
    raw_summary: "",
  };
}

const domain = requireArg(process.argv, "whois_lookup.js", "<domain>");
lookup(domain)
  .then((r) => { console.log(JSON.stringify(r, null, 2)); })
  .catch((e) => {
    console.log(JSON.stringify({ error: e.message, target: domain }, null, 2));
    process.exit(2);
  });
