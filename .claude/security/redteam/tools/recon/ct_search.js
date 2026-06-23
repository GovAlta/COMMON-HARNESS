#!/usr/bin/env node
/**
 * Certificate transparency log search via crt.sh. Designed to be called by an AI agent.
 */

import https from "node:https";

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "recon-agent/1.0" }, timeout: 30000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("crt.sh returned invalid JSON"));
        }
      });
    });
    req.on("error", (e) => reject(new Error(`crt.sh request failed: ${e.message}`)));
    req.on("timeout", () => { req.destroy(); reject(new Error("crt.sh request timed out")); });
  });
}

async function search(domain) {
  const url = `https://crt.sh/?q=%25.${domain}&output=json`;

  let data;
  try {
    data = await fetchJSON(url);
  } catch (e) {
    return { error: e.message, target: domain };
  }

  const hostnames = new Set();
  const issuers = new Set();
  const entries = [];

  for (const entry of data) {
    const nameValue = entry.name_value || "";
    for (let name of nameValue.split("\n")) {
      name = name.trim().toLowerCase().replace(/^\*\./, "");
      if (name && (name.endsWith(`.${domain}`) || name === domain)) {
        hostnames.add(name);
      }
    }

    const issuer = entry.issuer_name || "";
    if (issuer) {
      issuers.add(issuer);
    }

    const notBefore = entry.not_before || "";
    const notAfter = entry.not_after || "";
    if (notBefore) {
      entries.push({
        common_name: entry.common_name || "",
        name_value: nameValue,
        issuer,
        not_before: notBefore,
        not_after: notAfter,
        serial_number: entry.serial_number || "",
      });
    }
  }

  return {
    target: domain,
    total_certificates: data.length,
    unique_hostnames: [...hostnames].sort(),
    total_unique_hostnames: hostnames.size,
    issuers: [...issuers].sort(),
    recent_entries: entries.slice(0, 50),
  };
}

if (process.argv.length !== 3) {
  process.stderr.write(`Usage: ${process.argv[1]} <domain>\n`);
  process.exit(1);
}

search(process.argv[2]).then((result) => {
  console.log(JSON.stringify(result, null, 2));
});
