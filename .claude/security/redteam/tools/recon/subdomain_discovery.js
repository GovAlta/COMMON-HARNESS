#!/usr/bin/env node
// Subdomain discovery. Dispatch: subfinder + crt.sh + DNS bruteforce wordlist.
// crt.sh and bruteforce are always-on; subfinder is optional. Native fallback de-duplicates.

import dns from "node:dns";
import https from "node:https";
import { whichBin, runBin, requireArg, poolMap } from "./_runner.js";

// Bundled common-subdomain wordlist (~50 entries)
const SUBDOMAIN_WORDLIST = [
  "www", "mail", "ftp", "smtp", "pop", "imap", "webmail", "admin", "administrator",
  "api", "api-v1", "api-v2", "app", "apps", "auth", "sso", "oauth", "login",
  "dev", "development", "staging", "stage", "stg", "test", "testing", "qa", "uat",
  "preprod", "prod", "production",
  "m", "mobile", "cdn", "static", "assets", "media", "img", "images",
  "db", "database", "mysql", "postgres", "mongo", "redis", "elastic", "elasticsearch",
  "kibana", "grafana", "metrics", "monitoring", "status", "health",
  "git", "gitlab", "github", "jenkins", "ci", "cd", "build",
  "vpn", "remote", "intranet", "internal", "private", "secret",
  "blog", "shop", "store", "support", "help", "docs", "wiki",
  "beta", "alpha", "canary", "demo", "sandbox",
  "ns", "ns1", "ns2", "dns",
  "backup", "old", "legacy", "archive",
];

function tryBinary(domain) {
  if (!whichBin("subfinder")) return [];
  const res = runBin("subfinder", ["-d", domain, "-silent"], { timeout: 120000 });
  if (!res.stdout) return [];
  return res.stdout.split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean);
}

function crtSh(domain) {
  return new Promise((resolve) => {
    const url = `https://crt.sh/?q=%25.${domain}&output=json`;
    const req = https.get(url, { headers: { "User-Agent": "recon-agent/1.0" }, timeout: 30000 }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          const names = new Set();
          for (const entry of data) {
            for (let n of (entry.name_value || "").split("\n")) {
              n = n.trim().toLowerCase().replace(/^\*\./, "");
              if (n.endsWith(`.${domain}`) || n === domain) names.add(n);
            }
          }
          resolve({ subs: [...names].sort(), error: null });
        } catch (e) {
          resolve({ subs: [], error: `crt.sh: ${e.message}` });
        }
      });
    });
    req.on("error", (e) => resolve({ subs: [], error: `crt.sh: ${e.message}` }));
    req.on("timeout", () => { req.destroy(); resolve({ subs: [], error: "crt.sh timed out" }); });
  });
}

async function bruteforceDns(domain) {
  const candidates = SUBDOMAIN_WORDLIST.map((w) => `${w}.${domain}`);
  const found = [];
  await poolMap(candidates, 24, async (host) => {
    try {
      const { address } = await dns.promises.lookup(host, { family: 4 });
      if (address) found.push(host);
    } catch {
      // NXDOMAIN or no record — skip
    }
  });
  return found;
}

async function discover(domain) {
  const allSubs = {};
  const errors = [];

  const sfSubs = tryBinary(domain);
  for (const s of sfSubs) (allSubs[s] ||= []).push("subfinder");

  const { subs: ctSubs, error: ctErr } = await crtSh(domain);
  if (ctErr) errors.push(ctErr);
  for (const s of ctSubs) (allSubs[s] ||= []).push("crt.sh");

  const bfSubs = await bruteforceDns(domain);
  for (const s of bfSubs) (allSubs[s] ||= []).push("dns_bruteforce");

  const interesting = [
    "admin", "staging", "stage", "dev", "test", "api",
    "internal", "vpn", "mail", "ftp", "db", "database",
    "jenkins", "gitlab", "jira", "grafana", "kibana",
    "elastic", "mongo", "redis", "console", "dashboard",
    "debug", "backup", "old", "legacy", "beta", "uat",
  ];

  const subdomains = [];
  for (const hostname of Object.keys(allSubs).sort()) {
    const sources = [...new Set(allSubs[hostname])];
    const prefix = hostname.split(`.${domain}`)[0];
    const isInteresting = interesting.some((pat) => prefix.includes(pat));
    subdomains.push({ hostname, sources, interesting: isInteresting });
  }

  return {
    target: domain,
    total_unique: Object.keys(allSubs).length,
    subdomains,
    sources_used: [
      whichBin("subfinder") ? "subfinder" : null,
      "crt.sh",
      "dns_bruteforce",
    ].filter(Boolean),
    errors: errors.length ? errors : null,
  };
}

const domain = requireArg(process.argv, "subdomain_discovery.js", "<domain>");
discover(domain)
  .then((r) => { console.log(JSON.stringify(r, null, 2)); })
  .catch((e) => {
    console.log(JSON.stringify({ error: e.message, target: domain }, null, 2));
    process.exit(2);
  });
