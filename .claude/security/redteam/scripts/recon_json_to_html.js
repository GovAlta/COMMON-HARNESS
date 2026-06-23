#!/usr/bin/env node
/**
 * Converts a Recon deliverable JSON file (RECON-AGENT schema)
 * into a self-contained, human-readable HTML artifact.
 *
 * Usage:
 *   node recon_json_to_html.js <input.json> [output.html]
 *
 * If output.html is omitted, it defaults to the input filename with .html extension.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Severity / assessment helpers ──────────────────────────────────

const SEVERITY_COLORS = {
  CRITICAL:      ['#7f1d1d', '#fecaca', '#dc2626'],
  'P1-CRITICAL': ['#7f1d1d', '#fecaca', '#dc2626'],
  HIGH:          ['#7c2d12', '#fed7aa', '#ea580c'],
  'P2-HIGH':     ['#7c2d12', '#fed7aa', '#ea580c'],
  MEDIUM:        ['#78350f', '#fef08a', '#ca8a04'],
  'P3-MEDIUM':   ['#78350f', '#fef08a', '#ca8a04'],
  LOW:           ['#14532d', '#bbf7d0', '#16a34a'],
  'P4-LOW':      ['#14532d', '#bbf7d0', '#16a34a'],
  INFO:          ['#1e3a5f', '#bfdbfe', '#3b82f6'],
  INFORMATIONAL: ['#1e3a5f', '#bfdbfe', '#3b82f6'],
};

const ASSESSMENT_COLORS = {
  SECURE:        ['badge-green', 'SECURE'],
  secure:        ['badge-green', 'SECURE'],
  GOOD:          ['badge-green', 'GOOD'],
  WEAK:          ['badge-yellow', 'WEAK'],
  weak:          ['badge-yellow', 'WEAK'],
  MISCONFIGURED: ['badge-red', 'MISCONFIGURED'],
  misconfigured: ['badge-red', 'MISCONFIGURED'],
};

const RISK_COLORS = {
  critical: ['badge-red', 'CRITICAL'],
  high:     ['badge-orange', 'HIGH'],
  medium:   ['badge-yellow', 'MEDIUM'],
  low:      ['badge-green', 'LOW'],
  info:     ['badge-blue', 'INFO'],
};

function esc(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function sevBadge(severity) {
  const s = severity.toUpperCase();
  const [dark, light, accent] = SEVERITY_COLORS[s] || ['#334155', '#e2e8f0', '#64748b'];
  return `<span class="badge" style="background:${light};color:${dark};border:1px solid ${accent}">${esc(s)}</span>`;
}

function assessmentBadge(assessment) {
  for (const [key, [cls]] of Object.entries(ASSESSMENT_COLORS)) {
    if (assessment.startsWith(key) || assessment.toUpperCase().startsWith(key.toUpperCase())) {
      return `<span class="badge ${cls}">${esc(assessment)}</span>`;
    }
  }
  return `<span class="badge badge-gray">${esc(assessment)}</span>`;
}

function riskBadge(risk) {
  const [cls] = RISK_COLORS[risk.toLowerCase()] || ['badge-gray'];
  const label = (RISK_COLORS[risk.toLowerCase()] || [, risk.toUpperCase()])[1];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

function boolBadge(val, trueLabel = 'Yes', falseLabel = 'No', trueCls = 'badge-green', falseCls = 'badge-gray') {
  if (val) {
    return `<span class="badge ${trueCls}">${trueLabel}</span>`;
  }
  return `<span class="badge ${falseCls}">${falseLabel}</span>`;
}

function nl2p(text) {
  if (!text) return '';
  let paragraphs = text.split('\n\n').map(p => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) {
    paragraphs = text.split('\n').map(p => p.trim()).filter(Boolean);
  }
  return paragraphs.map(p => `<p>${esc(p)}</p>`).join('');
}

// ── Section builders ───────────────────────────────────────────────

function buildMetadata(meta) {
  const tools = meta.tools_executed || [];
  let toolRows = '';
  for (const t of tools) {
    const name = t.tool || t.name || '';
    const success = t.success != null ? t.success : (t.exit_code === 0);
    const icon = success ? '&#10003;' : '&#10007;';
    const cls = success ? 'status-ok' : 'status-fail';
    const extra = t.error || t.notes || '';
    toolRows += `
        <tr>
          <td><code>${esc(name)}</code></td>
          <td class="center"><span class="${cls}">${icon}</span></td>
          <td>${esc(extra)}</td>
        </tr>`;
  }

  let toolGapsHtml = '';
  const toolGaps = meta.tool_gaps || [];
  if (toolGaps.length) {
    const gapItems = toolGaps.map(g => `<li>${typeof g === 'string' ? esc(g) : esc(JSON.stringify(g))}</li>`).join('');
    toolGapsHtml = `
        <div class="subsection">
          <h3>Tool Gaps</h3>
          <ul class="gap-list">${gapItems}</ul>
        </div>`;
  }

  const risk = meta.overall_risk_signal || '';
  let riskBanner = '';
  if (risk) {
    const riskCls = risk.toLowerCase().replace('informational', 'info');
    riskBanner = `
        <div class="risk-banner risk-${riskCls}">
          <span class="risk-label">Overall Risk Signal</span>
          <span class="risk-value">${esc(risk.toUpperCase())}</span>
        </div>`;
  }

  return `
    <section class="card meta-card">
      <h2>Scan Metadata</h2>
      ${riskBanner}
      <table class="meta-table">
        <tr><td class="label">Target Domain</td><td><code>${esc(meta.target_domain)}</code></td></tr>
        <tr><td class="label">Target IP</td><td><code>${esc(meta.target_ip || 'N/A')}</code></td></tr>
        <tr><td class="label">Target Endpoint</td><td><code>${esc(meta.target_endpoint || '')}</code></td></tr>
        <tr><td class="label">Assessment ID</td><td><code>${esc(meta.assessment_id || '')}</code></td></tr>
        <tr><td class="label">Scan Start</td><td>${esc(meta.scan_start_time || meta.scan_timestamp || '')}</td></tr>
        <tr><td class="label">Scan End</td><td>${esc(meta.scan_end_time || '')}</td></tr>
        <tr><td class="label">Scanner</td><td>${esc(meta.scanner_agent || '')}</td></tr>
      </table>

      <div class="subsection">
        <h3>Tools Executed (${tools.length})</h3>
        <table class="data-table">
          <thead><tr><th>Tool</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>${toolRows}</tbody>
        </table>
      </div>
      ${toolGapsHtml}
    </section>`;
}

function buildExecutiveSummary(summary) {
  let text;
  if (typeof summary === 'object' && summary !== null) {
    text = summary.text || JSON.stringify(summary, null, 2);
  } else {
    text = summary ? String(summary) : '';
  }
  return `
    <section class="card">
      <h2>Executive Summary</h2>
      <div class="narrative">${nl2p(text)}</div>
    </section>`;
}

function buildDns(dns) {
  if (!dns) return '';

  function recordList(records, label) {
    if (!records || !records.length) return '';
    const items = records.map(r => `<li><code>${esc(r)}</code></li>`).join('');
    return `<div class="record-group"><h4>${esc(label)}</h4><ul>${items}</ul></div>`;
  }

  let groups = '';
  groups += recordList(dns.a_records || [], 'A Records');
  groups += recordList(dns.aaaa_records || [], 'AAAA Records');
  groups += recordList(dns.mx_records || [], 'MX Records');
  groups += recordList(dns.ns_records || [], 'NS Records');
  groups += recordList(dns.txt_records || [], 'TXT Records');
  groups += recordList(dns.cname_records || [], 'CNAME Records');

  const soa = dns.soa_record || '';
  const soaHtml = soa ? `<div class="record-group"><h4>SOA Record</h4><code>${esc(soa)}</code></div>` : '';

  const zoneXfer = dns.zone_transfer_possible || false;
  const dnssec = dns.dnssec_enabled || false;

  const flagsHtml = `
    <div class="dns-flags">
      <span>Zone Transfer: ${boolBadge(zoneXfer, 'POSSIBLE', 'Not Possible', 'badge-red', 'badge-green')}</span>
      <span>DNSSEC: ${boolBadge(dnssec, 'Enabled', 'Not Enabled', 'badge-green', 'badge-yellow')}</span>
    </div>`;

  const analysis = dns.analysis || {};
  let analysisHtml = '';
  if (analysis) {
    if (typeof analysis === 'string') {
      analysisHtml = `<div class="subsection"><h3>Analysis</h3><p>${esc(analysis)}</p></div>`;
    } else if (typeof analysis === 'object') {
      const notes = analysis.notes || '';
      let items = '';
      for (const [k, v] of Object.entries(analysis)) {
        if (k === 'notes') continue;
        items += `<li><strong>${esc(k)}:</strong> <code>${esc(String(v))}</code></li>`;
      }
      analysisHtml = `
            <div class="subsection"><h3>Analysis</h3>
              <ul>${items}</ul>
              ${notes ? '<p>' + esc(notes) + '</p>' : ''}
            </div>`;
    }
  }

  return `
    <section class="card">
      <h2>DNS Intelligence</h2>
      ${flagsHtml}
      <div class="record-grid">${groups}</div>
      ${soaHtml}
      ${analysisHtml}
    </section>`;
}

function buildWhois(whois) {
  if (!whois) return '';

  if (whois.available === false && whois.error) {
    return `
        <section class="card">
          <h2>WHOIS Data</h2>
          <div class="info-box info-warning">
            <strong>Not Available:</strong> ${esc(whois.error || '')}
            ${whois.notes ? '<p>' + esc(whois.notes) + '</p>' : ''}
          </div>
        </section>`;
  }

  let rows = '';
  for (const key of ['registrar', 'creation_date', 'expiry_date', 'registrant_org']) {
    const val = whois[key];
    if (val) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      rows += `<tr><td class="label">${esc(label)}</td><td>${esc(val)}</td></tr>`;
    }
  }

  const ns = whois.name_servers || [];
  if (ns.length) {
    const nsItems = ns.map(n => `<code>${esc(n)}</code>`).join(', ');
    rows += `<tr><td class="label">Name Servers</td><td>${nsItems}</td></tr>`;
  }

  const raw = whois.raw_summary || '';
  const rawHtml = raw ? `<div class="subsection"><h3>Raw Summary</h3><pre><code>${esc(raw)}</code></pre></div>` : '';

  const notes = whois.notes || '';
  const notesHtml = notes ? `<p>${esc(notes)}</p>` : '';

  return `
    <section class="card">
      <h2>WHOIS Data</h2>
      <table class="meta-table">${rows}</table>
      ${notesHtml}
      ${rawHtml}
    </section>`;
}

function buildSubdomains(subs) {
  let entries, total, sourcesHtml = '', ctHtml = '', takeoverHtml = '';

  if (Array.isArray(subs)) {
    entries = subs;
    total = subs.length;
  } else if (typeof subs === 'object' && subs !== null) {
    entries = subs.entries || [];
    total = subs.total_discovered != null ? subs.total_discovered : entries.length;

    const sources = subs.sources || [];
    if (sources.length) {
      const chips = sources.map(s => `<span class="badge badge-blue">${esc(s)}</span>`).join(' ');
      sourcesHtml = `<div class="subsection"><h3>Sources</h3><div>${chips}</div></div>`;
    }

    const ct = subs.ct_log_results || {};
    if (ct && Object.keys(ct).length) {
      ctHtml = `
            <div class="subsection"><h3>Certificate Transparency</h3>
              <table class="meta-table">
                <tr><td class="label">Certificates Found</td><td>${ct.total_certificates || 0}</td></tr>
                <tr><td class="label">Unique Hostnames</td><td>${ct.unique_hostnames || 0}</td></tr>
                ${ct.notes ? '<tr><td class="label">Notes</td><td>' + esc(ct.notes) + '</td></tr>' : ''}
              </table>
            </div>`;
    }

    const takeover = subs.subdomain_takeover_candidates || [];
    if (takeover.length) {
      const items = takeover.map(t => `<li>${esc(String(t))}</li>`).join('');
      takeoverHtml = `<div class="subsection"><h3>Subdomain Takeover Candidates</h3><ul class="warning-list">${items}</ul></div>`;
    }
  } else {
    return '';
  }

  let rows = '';
  for (const e of entries) {
    const hostname = e.hostname || e.subdomain || '';
    const interesting = e.interesting || false;
    const intBadge = interesting ? '<span class="badge badge-yellow">Interesting</span>' : '';
    const status = e.http_status || '';
    let statusCls = '';
    if (status) {
      const s = parseInt(status);
      if (s >= 200 && s < 300) statusCls = 'status-ok';
      else if (s >= 300 && s < 400) statusCls = 'status-redirect';
      else if (s >= 400 && s < 500) statusCls = 'status-client-err';
      else if (s >= 500) statusCls = 'status-server-err';
    }

    const techs = e.technologies || [];
    const techChips = techs.length ? techs.map(t => `<code class="tech-chip">${esc(t)}</code>`).join(' ') : '';

    rows += `
        <tr>
          <td><code>${esc(hostname)}</code> ${intBadge}</td>
          <td><code>${esc(e.ip || e.ip_address || '')}</code></td>
          <td>${esc(e.source || '')}</td>
          <td class="center ${status ? 'status-cell ' + statusCls : ''}">${status ? esc(String(status)) : 'N/A'}</td>
          <td>${techChips}</td>
          <td>${esc(e.notes || '')}</td>
        </tr>`;
  }

  return `
    <section class="card">
      <h2>Subdomains <span class="count-badge">${total}</span></h2>
      ${sourcesHtml}
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Hostname</th><th>IP</th><th>Source</th><th>HTTP</th><th>Technologies</th><th>Notes</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${ctHtml}
      ${takeoverHtml}
    </section>`;
}

function buildPorts(ports) {
  let entries, method = '', targetIp = '';

  if (Array.isArray(ports)) {
    entries = ports;
  } else if (typeof ports === 'object' && ports !== null) {
    entries = ports.open_ports || [];
    method = ports.scan_method || '';
    targetIp = ports.target_ip || '';
  } else {
    return '';
  }

  const methodHtml = method ? `<p class="scan-method">Scan method: <code>${esc(method)}</code></p>` : '';

  let rows = '';
  for (const p of entries) {
    const port = p.port || '';
    const protocol = p.protocol || 'tcp';
    const service = p.service || '';
    const version = p.version || '';
    const banner = p.banner || '';
    const risk = p.security_relevance || p.risk_notes || '';

    let riskCls = '';
    if (risk) {
      const rl = risk.toLowerCase();
      if (rl.includes('critical') || rl.includes('primary')) riskCls = 'risk-critical';
      else if (rl.includes('high')) riskCls = 'risk-high';
      else if (rl.includes('medium')) riskCls = 'risk-medium';
    }

    // Nmap scripts
    const scripts = p.nmap_scripts || [];
    let scriptsHtml = '';
    if (scripts.length) {
      const scriptItems = scripts.map(s =>
        `<div class="script-output"><code>${esc(s.id || '')}</code>: <pre>${esc(s.output || '')}</pre></div>`
      ).join('');
      scriptsHtml = `<div class="nmap-scripts">${scriptItems}</div>`;
    }

    const notes = p.notes || '';

    rows += `
        <tr class="${riskCls}">
          <td class="port-num"><code>${esc(String(port))}</code></td>
          <td>${esc(protocol)}</td>
          <td>${esc(service)}</td>
          <td>${version ? esc(String(version)) : ''}</td>
          <td><code class="banner">${banner ? esc(String(banner)) : ''}</code></td>
          <td>${esc(risk)}</td>
          <td>${esc(notes)}${scriptsHtml}</td>
        </tr>`;
  }

  return `
    <section class="card">
      <h2>Port Scan <span class="count-badge">${entries.length} open</span></h2>
      ${methodHtml}
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Port</th><th>Proto</th><th>Service</th><th>Version</th><th>Banner</th><th>Risk</th><th>Notes</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function buildTls(tls) {
  if (!tls) return '';

  const cert = tls.certificate || {};
  let certRows = '';
  const certFields = [
    ['Subject CN', cert.subject_cn || cert.subject || ''],
    ['Issuer CN', cert.issuer_cn || cert.issuer || ''],
    ['Issuer Org', cert.issuer_org || ''],
    ['Root CA', cert.root_ca || ''],
    ['Valid From', cert.valid_from || ''],
    ['Valid Until', cert.valid_until || ''],
    ['Key Algorithm', cert.key_algorithm || cert.key_type || ''],
    ['Key Size', cert.key_size ? String(cert.key_size) : ''],
    ['Signature Algorithm', cert.signature_algorithm || ''],
  ];
  for (const [label, val] of certFields) {
    if (val) {
      certRows += `<tr><td class="label">${esc(label)}</td><td><code>${esc(val)}</code></td></tr>`;
    }
  }

  // Certificate flags
  let certFlags = '';
  const flags = [];
  if (cert.is_expired) flags.push('<span class="badge badge-red">EXPIRED</span>');
  if (cert.is_wildcard) flags.push('<span class="badge badge-blue">Wildcard</span>');
  if (cert.is_self_signed) flags.push('<span class="badge badge-red">Self-Signed</span>');
  if (flags.length) {
    certFlags = `<div class="cert-flags">${flags.join(' ')}</div>`;
  }

  // SAN entries
  const san = cert.san_entries || [];
  let sanHtml = '';
  if (san.length) {
    const sanItems = san.map(s => `<code class="san-chip">${esc(s)}</code>`).join(' ');
    sanHtml = `<div class="subsection"><h3>SAN Entries (${san.length})</h3><div class="san-grid">${sanItems}</div></div>`;
  }

  // Protocols
  const protocols = tls.protocols_supported || tls.protocols || {};
  let protocolsHtml = '';
  if (typeof protocols === 'object' && !Array.isArray(protocols) && Object.keys(protocols).length) {
    let protoItems = '';
    for (const [proto, status] of Object.entries(protocols)) {
      let badge;
      if (typeof status === 'boolean') {
        if ((/1\.0|1\.1|SSLv/.test(proto)) && status) {
          badge = boolBadge(status, 'Supported', 'Not Supported', 'badge-red', 'badge-green');
        } else if ((/1\.2|1\.3/.test(proto)) && status) {
          badge = boolBadge(status, 'Supported', 'Not Supported', 'badge-green', 'badge-red');
        } else {
          badge = boolBadge(status, 'Supported', 'Not Supported', 'badge-yellow', 'badge-green');
        }
      } else {
        badge = `<code>${esc(String(status))}</code>`;
      }
      protoItems += `<tr><td><code>${esc(proto)}</code></td><td>${badge}</td></tr>`;
    }
    protocolsHtml = `
        <div class="subsection"><h3>Protocols</h3>
          <table class="data-table"><thead><tr><th>Protocol</th><th>Status</th></tr></thead>
          <tbody>${protoItems}</tbody></table>
        </div>`;
  } else if (Array.isArray(protocols) && protocols.length) {
    const protoChips = protocols.map(p => `<code class="proto-chip">${esc(p)}</code>`).join(' ');
    protocolsHtml = `<div class="subsection"><h3>Protocols Supported</h3><div>${protoChips}</div></div>`;
  }

  // Weak protocols
  const weakProtos = tls.weak_protocols || [];
  let weakProtoHtml = '';
  if (weakProtos.length) {
    const items = weakProtos.map(p => `<span class="badge badge-red">${esc(p)}</span>`).join(' ');
    weakProtoHtml = `<div class="subsection"><h3>Weak Protocols</h3><div>${items}</div></div>`;
  }

  // Cipher suites
  const ciphers = tls.cipher_suites || tls.cipher_suites_observed || {};
  let cipherHtml = '';
  if (typeof ciphers === 'object' && !Array.isArray(ciphers) && Object.keys(ciphers).length) {
    let cipherSections = '';
    for (const [protoVer, suiteList] of Object.entries(ciphers)) {
      if (Array.isArray(suiteList)) {
        const items = suiteList.map(c => `<li><code>${esc(c)}</code></li>`).join('');
        cipherSections += `<h4>${esc(protoVer)}</h4><ul>${items}</ul>`;
      } else {
        cipherSections += `<h4>${esc(protoVer)}</h4><code>${esc(String(suiteList))}</code>`;
      }
    }
    cipherHtml = `<div class="subsection"><h3>Cipher Suites</h3>${cipherSections}</div>`;
  } else if (Array.isArray(ciphers) && ciphers.length) {
    const items = ciphers.map(c => `<li><code>${esc(c)}</code></li>`).join('');
    cipherHtml = `<div class="subsection"><h3>Cipher Suites</h3><ul>${items}</ul></div>`;
  }

  // Weak ciphers
  const weakCiphers = tls.weak_ciphers || [];
  let weakCipherHtml = '';
  if (weakCiphers.length) {
    const items = weakCiphers.map(c => `<span class="badge badge-red">${esc(c)}</span>`).join(' ');
    weakCipherHtml = `<div class="subsection"><h3>Weak Ciphers</h3><div>${items}</div></div>`;
  }

  // Vulnerabilities
  const vulns = tls.vulnerabilities || [];
  let vulnHtml = '';
  if (typeof vulns === 'object' && !Array.isArray(vulns) && Object.keys(vulns).length) {
    let vulnRows = '';
    for (const [name, status] of Object.entries(vulns)) {
      const statusStr = String(status);
      let badge;
      if (/not_vulnerable|disabled/i.test(statusStr)) {
        badge = '<span class="badge badge-green">Not Vulnerable</span>';
      } else if (/not_tested/i.test(statusStr)) {
        badge = '<span class="badge badge-gray">Not Tested</span>';
      } else if (/vulnerable/i.test(statusStr)) {
        badge = '<span class="badge badge-red">VULNERABLE</span>';
      } else {
        badge = `<code>${esc(statusStr)}</code>`;
      }
      vulnRows += `<tr><td><code>${esc(name)}</code></td><td>${badge}</td><td>${esc(statusStr)}</td></tr>`;
    }
    vulnHtml = `
        <div class="subsection"><h3>Vulnerability Checks</h3>
          <table class="data-table"><thead><tr><th>Test</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>${vulnRows}</tbody></table>
        </div>`;
  } else if (Array.isArray(vulns) && vulns.length) {
    let vulnRows = '';
    for (const v of vulns) {
      vulnRows += `
            <tr>
              <td><code>${esc(v.name || '')}</code></td>
              <td>${sevBadge(v.severity || 'info')}</td>
              <td>${esc(v.description || '')}</td>
            </tr>`;
    }
    vulnHtml = `
        <div class="subsection"><h3>Vulnerabilities</h3>
          <table class="data-table"><thead><tr><th>Name</th><th>Severity</th><th>Description</th></tr></thead>
          <tbody>${vulnRows}</tbody></table>
        </div>`;
  }

  // HSTS and OCSP
  let extras = '';
  const hsts = tls.hsts_header || '';
  const ocsp = tls.ocsp_stapling;
  const assessment = tls.assessment || '';
  const scanTool = tls.scan_tool || '';
  if (hsts || ocsp != null || assessment || scanTool) {
    let extraRows = '';
    if (scanTool) extraRows += `<tr><td class="label">Scan Tool</td><td><code>${esc(scanTool)}</code></td></tr>`;
    if (hsts) extraRows += `<tr><td class="label">HSTS</td><td><code>${esc(hsts)}</code></td></tr>`;
    if (ocsp != null) extraRows += `<tr><td class="label">OCSP Stapling</td><td>${boolBadge(ocsp, 'Enabled', 'Not Enabled')}</td></tr>`;
    if (assessment) extraRows += `<tr><td class="label">Assessment</td><td>${esc(assessment)}</td></tr>`;
    extras = `<table class="meta-table">${extraRows}</table>`;
  }

  return `
    <section class="card">
      <h2>TLS Analysis</h2>
      ${extras}
      <div class="subsection">
        <h3>Certificate</h3>
        ${certFlags}
        <table class="meta-table">${certRows}</table>
      </div>
      ${sanHtml}
      ${protocolsHtml}
      ${weakProtoHtml}
      ${cipherHtml}
      ${weakCipherHtml}
      ${vulnHtml}
    </section>`;
}

function buildHttpHeaders(headers) {
  if (!headers) return '';

  const target = headers.target_url || '';
  const statusCode = headers.status_code || '';

  // Present headers
  const present = headers.headers_present || [];
  let presentRows = '';
  for (const h of present) {
    const assessment = h.assessment || '';
    presentRows += `
        <tr>
          <td><code>${esc(h.name || '')}</code></td>
          <td class="value-cell"><code>${esc(h.value || '')}</code></td>
          <td>${assessmentBadge(assessment)}</td>
          <td>${esc(h.notes || '')}</td>
        </tr>`;
  }

  // Missing headers
  const missing = headers.headers_missing || [];
  let missingRows = '';
  for (const h of missing) {
    const risk = h.risk || 'medium';
    missingRows += `
        <tr>
          <td><code>${esc(h.name || '')}</code></td>
          <td>${riskBadge(risk)}</td>
          <td>${esc(h.recommendation || '')}</td>
        </tr>`;
  }

  // Information leakage
  const leakage = headers.information_leakage || [];
  let leakageHtml = '';
  if (leakage.length) {
    let leakRows = '';
    for (const l of leakage) {
      leakRows += `
            <tr>
              <td><code>${esc(l.header || '')}</code></td>
              <td class="value-cell"><code>${esc(l.value || '')}</code></td>
              <td>${riskBadge(l.risk || 'info')}</td>
              <td>${esc(l.notes || '')}</td>
            </tr>`;
    }
    leakageHtml = `
        <div class="subsection">
          <h3>Information Leakage</h3>
          <table class="data-table">
            <thead><tr><th>Header</th><th>Value</th><th>Risk</th><th>Notes</th></tr></thead>
            <tbody>${leakRows}</tbody>
          </table>
        </div>`;
  }

  // Cookie analysis
  const cookie = headers.cookie_analysis || {};
  let cookieHtml = '';
  if (cookie && Object.keys(cookie).length) {
    let cookieRows = '';
    for (const [k, v] of Object.entries(cookie)) {
      if (k === 'assessment') {
        cookieRows += `<tr><td class="label">${esc(k.charAt(0).toUpperCase() + k.slice(1))}</td><td>${esc(String(v))}</td></tr>`;
      } else {
        cookieRows += `<tr><td class="label">${esc(k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</td><td><code>${esc(String(v))}</code></td></tr>`;
      }
    }
    cookieHtml = `
        <div class="subsection">
          <h3>Cookie Analysis</h3>
          <table class="meta-table">${cookieRows}</table>
        </div>`;
  }

  return `
    <section class="card">
      <h2>HTTP Security Headers</h2>
      <p>Target: <code>${esc(target)}</code> ${statusCode ? '(HTTP ' + esc(String(statusCode)) + ')' : ''}</p>

      <div class="subsection">
        <h3>Present Headers (${present.length})</h3>
        <table class="data-table">
          <thead><tr><th>Header</th><th>Value</th><th>Assessment</th><th>Notes</th></tr></thead>
          <tbody>${presentRows}</tbody>
        </table>
      </div>

      <div class="subsection">
        <h3>Missing Headers (${missing.length})</h3>
        <table class="data-table">
          <thead><tr><th>Header</th><th>Risk</th><th>Recommendation</th></tr></thead>
          <tbody>${missingRows}</tbody>
        </table>
      </div>

      ${leakageHtml}
      ${cookieHtml}
    </section>`;
}

function buildWaf(waf) {
  if (!waf) return '';

  const detected = waf.waf_detected || false;
  const icon = detected ? '&#128737;' : '&#10060;';
  const statusText = detected ? 'WAF Detected' : 'No WAF Detected';
  const statusCls = detected ? 'waf-detected' : 'waf-not-detected';

  let rows = '';
  if (waf.waf_name) rows += `<tr><td class="label">WAF Name</td><td><strong>${esc(waf.waf_name)}</strong></td></tr>`;
  if (waf.confidence) rows += `<tr><td class="label">Confidence</td><td>${esc(waf.confidence)}</td></tr>`;
  if (waf.detection_method || waf.method) rows += `<tr><td class="label">Detection Method</td><td>${esc(waf.detection_method || waf.method || '')}</td></tr>`;
  if (waf.bypass_notes) rows += `<tr><td class="label">Bypass Notes</td><td>${esc(waf.bypass_notes)}</td></tr>`;
  if (waf.notes) rows += `<tr><td class="label">Notes</td><td>${esc(waf.notes)}</td></tr>`;

  return `
    <section class="card">
      <h2>WAF Detection</h2>
      <div class="waf-status ${statusCls}">
        <span class="waf-icon">${icon}</span>
        <span class="waf-text">${statusText}</span>
      </div>
      <table class="meta-table">${rows}</table>
    </section>`;
}

function buildTechnologies(techs) {
  if (!techs || !techs.length) return '';

  let rows = '';
  for (const t of techs) {
    const conf = t.confidence || '';
    const confCls = conf ? `conf-${conf.toLowerCase()}` : '';
    rows += `
        <tr>
          <td><strong>${esc(t.name || '')}</strong></td>
          <td><code>${esc(t.version || '')}</code></td>
          <td><span class="badge badge-blue">${esc(t.category || '')}</span></td>
          <td><span class="conf-badge ${confCls}">${esc(conf)}</span></td>
          <td><code>${esc(t.cpe || '')}</code></td>
          <td>${esc(t.source || '')}</td>
        </tr>`;
  }

  return `
    <section class="card">
      <h2>Technologies <span class="count-badge">${techs.length}</span></h2>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Version</th><th>Category</th><th>Confidence</th><th>CPE</th><th>Source</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function buildEndpoints(endpoints) {
  let entries, total, extraSections = '';

  if (Array.isArray(endpoints)) {
    entries = endpoints;
    total = endpoints.length;
  } else if (typeof endpoints === 'object' && endpoints !== null) {
    entries = endpoints.api_endpoints || [];
    total = endpoints.total_discovered != null ? endpoints.total_discovered : entries.length;

    // SPA routes
    const spaRoutes = endpoints.spa_routes_from_js_bundle || [];
    let spaHtml = '';
    if (spaRoutes.length) {
      const spaItems = spaRoutes.map(r => `<li><code>${typeof r === 'string' ? esc(r) : esc((r.path || String(r)))}</code></li>`).join('');
      spaHtml = `<div class="subsection"><h3>SPA Routes (from JS bundle)</h3><ul>${spaItems}</ul></div>`;
    }

    // Azure endpoints
    const azure = endpoints.azure_endpoints || [];
    let azureHtml = '';
    if (azure.length) {
      const azureItems = azure.map(a => {
        if (typeof a === 'string') return `<li><code>${esc(a)}</code></li>`;
        return `<li><code>${esc(a.url || '')}</code> \u2014 ${esc(a.notes || '')}</li>`;
      }).join('');
      azureHtml = `<div class="subsection"><h3>Azure Endpoints</h3><ul>${azureItems}</ul></div>`;
    }

    // False positives
    const fps = endpoints.false_positives_eliminated || [];
    let fpsHtml = '';
    if (fps.length) {
      let fpRows = '';
      for (const fp of fps) {
        if (typeof fp === 'string') {
          fpRows += `<tr><td><code>${esc(fp)}</code></td><td></td></tr>`;
        } else {
          fpRows += `<tr><td><code>${esc(fp.path || '')}</code></td><td>${esc(fp.reason || '')}</td></tr>`;
        }
      }
      fpsHtml = `
            <div class="subsection"><h3>False Positives Eliminated (${fps.length})</h3>
              <table class="data-table">
                <thead><tr><th>Path</th><th>Reason</th></tr></thead>
                <tbody>${fpRows}</tbody>
              </table>
            </div>`;
    }

    extraSections = spaHtml + azureHtml + fpsHtml;
  } else {
    return '';
  }

  let rows = '';
  for (const e of entries) {
    if (typeof e === 'object') {
      const method = e.method || 'GET';
      const pathStr = e.path || e.url || '';
      const status = e.status_code || '';
      const interesting = e.interesting || false;
      const critical = e.critical || false;
      const auth = e.auth_required;
      const csrf = e.csrf_required;
      const notes = e.notes || '';

      let badges = '';
      if (critical) badges += '<span class="badge badge-red">CRITICAL</span> ';
      if (interesting) badges += '<span class="badge badge-yellow">Interesting</span> ';

      let authHtml = '';
      if (auth != null) authHtml = boolBadge(auth, 'Required', 'None', 'badge-green', 'badge-red');
      let csrfHtml = '';
      if (csrf != null) csrfHtml = boolBadge(csrf, 'Required', 'None', 'badge-green', 'badge-red');

      let statusCls = '';
      if (status) {
        const s = parseInt(status);
        if (s >= 200 && s < 300) statusCls = 'status-ok';
        else if (s >= 300 && s < 400) statusCls = 'status-redirect';
        else if (s >= 400 && s < 500) statusCls = 'status-client-err';
        else if (s >= 500) statusCls = 'status-server-err';
      }

      rows += `
            <tr>
              <td><code class="method-${method.toLowerCase()}">${esc(method)}</code></td>
              <td><code>${esc(pathStr)}</code> ${badges}</td>
              <td class="center ${statusCls}">${status ? esc(String(status)) : ''}</td>
              <td class="center">${authHtml}</td>
              <td class="center">${csrfHtml}</td>
              <td>${esc(notes)}</td>
            </tr>`;
    }
  }

  return `
    <section class="card">
      <h2>Discovered Endpoints <span class="count-badge">${total}</span></h2>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Method</th><th>Path</th><th>Status</th><th>Auth</th><th>CSRF</th><th>Notes</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${extraSections}
    </section>`;
}

function buildCors(cors) {
  if (!cors) return '';

  const assessment = cors.assessment || '';
  const isBad = assessment.toUpperCase().includes('MISCONFIGURED') || cors.arbitrary_origin_accepted;

  let rows = '';
  for (const key of ['access_control_allow_origin', 'access_control_allow_credentials', 'origin_reflection', 'arbitrary_origin_accepted']) {
    const val = cors[key];
    if (val != null) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/Access Control /g, '');
      if (typeof val === 'boolean') {
        rows += `<tr><td class="label">${esc(label)}</td><td>${boolBadge(val)}</td></tr>`;
      } else {
        rows += `<tr><td class="label">${esc(label)}</td><td><code>${esc(String(val))}</code></td></tr>`;
      }
    }
  }

  const evidence = cors.evidence || '';
  const evidenceHtml = evidence ? `<pre><code>${esc(evidence)}</code></pre>` : '';

  return `
    <section class="card">
      <h2>CORS Analysis</h2>
      <div class="info-box ${isBad ? 'info-warning' : 'info-ok'}">
        <p>${esc(assessment)}</p>
      </div>
      <table class="meta-table">${rows}</table>
      ${evidenceHtml}
    </section>`;
}

function buildRateLimiting(rl) {
  if (!rl) return '';

  let sections = '';
  for (const [key, val] of Object.entries(rl)) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      let rows = '';
      for (const [k, v] of Object.entries(val)) {
        rows += `<tr><td class="label">${esc(k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</td><td>${esc(String(v))}</td></tr>`;
      }
      sections += `
            <div class="rl-section">
              <h4>${esc(label)}</h4>
              <table class="meta-table">${rows}</table>
            </div>`;
    } else {
      sections += `<p><strong>${esc(key)}:</strong> ${esc(String(val))}</p>`;
    }
  }

  return `
    <section class="card">
      <h2>Rate Limiting</h2>
      ${sections}
    </section>`;
}

function _severityClass(severity) {
  const s = severity.toUpperCase();
  if (s.includes('CRITICAL')) return 'critical';
  if (s.includes('HIGH')) return 'high';
  if (s.includes('MEDIUM')) return 'medium';
  if (s.includes('LOW')) return 'low';
  return 'info';
}

function buildFindings(findings) {
  if (!findings || !findings.length) return '';

  let cards = '';
  for (const f of findings) {
    const fid = f.id || f.finding_id || '';
    const severity = f.severity || 'MEDIUM';
    const title = f.title || '';
    const category = f.category || '';

    const evidence = f.evidence || '';
    let evidenceHtml = '';
    if (evidence) {
      if (Array.isArray(evidence)) {
        const evItems = evidence.map(e => `<li><code>${esc(e)}</code></li>`).join('');
        evidenceHtml = `<div class="subsection"><h3>Evidence</h3><ul>${evItems}</ul></div>`;
      } else {
        evidenceHtml = `<div class="subsection"><h3>Evidence</h3><pre><code>${esc(String(evidence))}</code></pre></div>`;
      }
    }

    const hypothesis = f.exploitation_hypothesis || '';
    const hypothesisHtml = hypothesis ? `<div class="subsection"><h3>Exploitation Hypothesis</h3><p>${esc(hypothesis)}</p></div>` : '';

    const impact = f.impact || '';
    const impactHtml = impact ? `<div class="subsection"><h3>Impact</h3><p>${esc(impact)}</p></div>` : '';

    const host = f.affected_host || '';
    const port = f.affected_port || '';
    let affected = '';
    if (host || port) {
      affected = `<div class="subsection"><h3>Affected</h3><code>${esc(host)}${port ? ':' + port : ''}</code></div>`;
    }

    cards += `
        <div class="card entry" id="${esc(fid)}">
          <div class="entry-header entry-header-${_severityClass(severity)}">
            <h2>${esc(fid)} \u2014 ${esc(title)}</h2>
            <div class="tags">
              ${sevBadge(severity)}
              <span class="badge badge-blue">${esc(category)}</span>
            </div>
          </div>
          <div class="entry-body">
            <div class="subsection">
              <h3>Description</h3>
              <p>${esc(f.description || '')}</p>
            </div>
            ${impactHtml}
            ${evidenceHtml}
            ${hypothesisHtml}
            ${affected}
          </div>
        </div>`;
  }

  return `
    <div class="findings-section">
      <h2 style="color:#38bdf8;margin:32px 0 16px;font-size:1.4rem;">
        Findings <span class="count-badge">${findings.length}</span>
      </h2>
      ${cards}
    </div>`;
}

function buildPocTargets(targets) {
  if (!targets || !targets.length) return '';

  const sorted = [...targets].sort((a, b) => (a.priority || 99) - (b.priority || 99));
  let rows = '';
  for (const t of sorted) {
    const priority = t.priority || '';
    const fid = t.finding_id || '';
    const url = t.target_url || '';
    const method = t.method || '';
    const hypothesis = t.exploitation_hypothesis || t.hypothesis || '';

    // Payload template
    const payload = t.payload_template || {};
    let payloadHtml = '';
    if (payload && Object.keys(payload).length) {
      const body = payload.body || '';
      const expected = payload.expected_result || '';
      payloadHtml = `
            <div class="payload-detail">
              ${body ? '<div><strong>Body:</strong> <code>' + esc(body) + '</code></div>' : ''}
              ${expected ? '<div><strong>Expected:</strong> ' + esc(expected) + '</div>' : ''}
            </div>`;
    }

    const bypass = t.bypass_notes || '';

    rows += `
        <tr>
          <td class="center priority-${Math.min(parseInt(priority) || 0, 3)}"><strong>P${esc(String(priority))}</strong></td>
          <td><a href="#${esc(fid)}">${esc(fid)}</a></td>
          <td>
            <code>${esc(method)} ${esc(url)}</code>
            ${payloadHtml}
          </td>
          <td>${esc(hypothesis)}</td>
          <td>${esc(bypass)}</td>
        </tr>`;
  }

  return `
    <section class="card">
      <h2>PoC Targets <span class="count-badge">${targets.length}</span></h2>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Priority</th><th>Finding</th><th>Target</th><th>Hypothesis</th><th>Bypass Notes</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function buildAttackSurfaceSummary(summary) {
  if (!summary) return '';

  const overallRisk = summary.overall_risk || '';
  const riskStr = overallRisk.includes('\u2014') ? overallRisk.split('\u2014')[0].trim() : overallRisk;
  const riskCls = _severityClass(riskStr);

  return `
    <section class="card meta-card">
      <h2>Attack Surface Summary</h2>
      <div class="risk-banner risk-${riskCls}">
        <span class="risk-label">Overall Risk</span>
        <span class="risk-value">${esc(overallRisk)}</span>
      </div>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-num">${summary.total_open_ports || 0}</div><div class="stat-label">Open Ports</div></div>
        <div class="stat-box"><div class="stat-num">${summary.total_live_services || 0}</div><div class="stat-label">Live Services</div></div>
        <div class="stat-box"><div class="stat-num">${summary.total_api_endpoints || 0}</div><div class="stat-label">API Endpoints</div></div>
        <div class="stat-box"><div class="stat-num">${summary.total_findings || 0}</div><div class="stat-label">Total Findings</div></div>
      </div>
      <div class="sev-bar">
        <span class="sev-count crit">${summary.critical_findings || 0} Critical</span>
        <span class="sev-count high">${summary.high_findings || 0} High</span>
        <span class="sev-count med">${summary.medium_findings || 0} Medium</span>
        <span class="sev-count low">${summary.low_findings || 0} Low</span>
      </div>
      <table class="meta-table" style="margin-top:12px;">
        <tr><td class="label">Authentication</td><td>${esc(summary.authentication_status || '')}</td></tr>
        <tr><td class="label">WAF Status</td><td>${esc(summary.waf_status || '')}</td></tr>
        <tr><td class="label">TLS Status</td><td>${esc(summary.tls_status || '')}</td></tr>
        <tr><td class="label">Header Security</td><td>${esc(summary.header_security || '')}</td></tr>
      </table>
    </section>`;
}

function buildToc(findings) {
  if (!findings || !findings.length) return '';
  let links = '';
  for (const f of findings) {
    const fid = f.id || f.finding_id || '';
    const severity = f.severity || 'MEDIUM';
    const title = f.title || '';
    const s = severity.toUpperCase();
    const [, , accent] = SEVERITY_COLORS[s] || ['#334155', '#e2e8f0', '#64748b'];
    const dot = `<span class="toc-dot" style="background:${accent}"></span>`;
    links += `<a href="#${esc(fid)}">${dot}${esc(fid)} \u2014 ${esc(title)}</a>\n`;
  }
  return `<nav class="toc"><h3>Jump to Finding</h3>${links}</nav>`;
}

// ── Main HTML assembly ──────────────────────────────────────────────

const CSS = `
:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface2: #334155;
  --border: #475569;
  --text: #e2e8f0;
  --text-muted: #94a3b8;
  --accent: #38bdf8;
  --red: #ef4444;
  --green: #22c55e;
  --orange: #f97316;
  --yellow: #eab308;
  --blue: #3b82f6;
}
*, *::before, *::after { box-sizing: border-box; }
body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  margin: 0;
  padding: 0;
  line-height: 1.6;
}
.container { max-width: 1200px; margin: 0 auto; padding: 24px 20px; }
h1 { font-size: 1.75rem; margin: 0 0 4px 0; }
h2 { font-size: 1.25rem; margin: 0 0 12px 0; color: var(--accent); }
h3 { font-size: 1rem; margin: 0 0 8px 0; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.8rem; }
h4 { font-size: 0.9rem; margin: 12px 0 6px; color: var(--text); }
.header { padding: 32px 0 16px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
.header p { margin: 4px 0; color: var(--text-muted); }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 20px;
  overflow: hidden;
}
.card > h2 { padding: 16px 20px 0; }
.meta-card { padding: 20px; }
.meta-card h2 { padding: 0; }

/* Tables */
.meta-table { width: 100%; border-collapse: collapse; }
.meta-table td { padding: 6px 12px; vertical-align: top; }
.meta-table .label { color: var(--text-muted); white-space: nowrap; width: 200px; font-weight: 600; }
.data-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
.data-table th { background: var(--surface2); color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 12px; text-align: left; }
.data-table td { padding: 8px 12px; border-top: 1px solid var(--border); vertical-align: top; }
.center { text-align: center; }
.table-scroll { overflow-x: auto; }
.value-cell { max-width: 350px; word-break: break-all; }

/* Badges */
.badge { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.03em; vertical-align: middle; }
.badge-green { background: #166534; color: #bbf7d0; border: 1px solid #22c55e; }
.badge-yellow { background: #78350f; color: #fef08a; border: 1px solid #ca8a04; }
.badge-orange { background: #7c2d12; color: #fed7aa; border: 1px solid #ea580c; }
.badge-red { background: #7f1d1d; color: #fecaca; border: 1px solid #dc2626; }
.badge-blue { background: #1e3a5f; color: #bfdbfe; border: 1px solid #3b82f6; }
.badge-gray { background: #374151; color: #d1d5db; border: 1px solid #6b7280; }
.count-badge { background: var(--surface2); color: var(--text-muted); padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; vertical-align: middle; }

.sev-count { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.85rem; margin-right: 6px; }
.sev-count.crit { background: #7f1d1d; color: #fecaca; }
.sev-count.high { background: #7c2d12; color: #fed7aa; }
.sev-count.med  { background: #78350f; color: #fef08a; }
.sev-count.low  { background: #14532d; color: #bbf7d0; }
.sev-bar { margin-top: 4px; }

/* Risk banner */
.risk-banner {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 20px; border-radius: 6px; margin-bottom: 16px;
}
.risk-label { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8; }
.risk-value { font-size: 1.5rem; font-weight: 800; }
.risk-critical { background: rgba(239,68,68,0.15); border: 1px solid var(--red); color: #fca5a5; }
.risk-high { background: rgba(249,115,22,0.15); border: 1px solid var(--orange); color: #fed7aa; }
.risk-medium { background: rgba(234,179,8,0.15); border: 1px solid var(--yellow); color: #fef08a; }
.risk-low { background: rgba(34,197,94,0.15); border: 1px solid var(--green); color: #bbf7d0; }
.risk-info { background: rgba(59,130,246,0.15); border: 1px solid var(--blue); color: #bfdbfe; }

/* Stats grid */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 16px 0; }
.stat-box { background: var(--surface2); border-radius: 6px; padding: 12px; text-align: center; }
.stat-num { font-size: 1.75rem; font-weight: 800; color: var(--accent); }
.stat-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

/* Narrative */
.narrative p { margin: 0 0 12px; padding: 0 20px; font-size: 0.95rem; line-height: 1.7; }
.narrative p:first-child { padding-top: 16px; }
.narrative p:last-child { padding-bottom: 16px; }

/* DNS */
.record-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; padding: 12px 20px; }
.record-group { background: var(--surface2); border-radius: 6px; padding: 12px; }
.record-group h4 { margin: 0 0 6px; color: var(--accent); font-size: 0.85rem; }
.record-group ul { margin: 0; padding-left: 16px; }
.record-group li { font-size: 0.85rem; margin-bottom: 2px; }
.dns-flags { display: flex; gap: 16px; padding: 12px 20px; flex-wrap: wrap; }

/* WAF */
.waf-status { display: flex; align-items: center; gap: 12px; padding: 16px 20px; font-size: 1.1rem; font-weight: 700; }
.waf-icon { font-size: 1.5rem; }
.waf-detected { color: var(--green); }
.waf-not-detected { color: var(--orange); }

/* Entry */
.entry-header { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.entry-header h2 { color: var(--text); margin: 0; }
.entry-header-critical { border-left: 4px solid var(--red); background: rgba(239,68,68,0.08); }
.entry-header-high     { border-left: 4px solid var(--orange); background: rgba(249,115,22,0.08); }
.entry-header-medium   { border-left: 4px solid var(--yellow); background: rgba(234,179,8,0.08); }
.entry-header-low      { border-left: 4px solid var(--green); background: rgba(34,197,94,0.08); }
.entry-header-info     { border-left: 4px solid var(--blue); background: rgba(59,130,246,0.08); }
.entry-body { padding: 0 20px 20px; }
.subsection { margin-top: 16px; padding: 0 20px; }
.tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

/* Code */
pre { background: #0d1117; border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; overflow-x: auto; font-size: 0.82rem; line-height: 1.5; margin: 8px 0; }
code { font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace; font-size: 0.85em; }
.banner { font-size: 0.75em; color: var(--text-muted); }

/* Status indicators */
.status-ok { color: var(--green); font-weight: 700; }
.status-fail { color: var(--red); font-weight: 700; }
.status-redirect { color: var(--yellow); }
.status-client-err { color: var(--orange); }
.status-server-err { color: var(--red); }
.status-cell { font-weight: 600; }

/* Port table risk rows */
.risk-critical td { border-left: 3px solid var(--red); }
.risk-high td { border-left: 3px solid var(--orange); }
.risk-medium td { border-left: 3px solid var(--yellow); }
.port-num code { font-weight: 700; font-size: 1em; }

/* Confidence badges */
.conf-badge { font-size: 0.8rem; padding: 1px 8px; border-radius: 4px; }
.conf-high { background: #166534; color: #bbf7d0; }
.conf-medium { background: #78350f; color: #fef08a; }
.conf-low { background: #374151; color: #d1d5db; }

/* Tech/SAN chips */
.tech-chip, .san-chip, .proto-chip { background: var(--surface2); padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; display: inline-block; margin: 2px; }
.san-grid { display: flex; flex-wrap: wrap; gap: 4px; }

/* Cert flags */
.cert-flags { display: flex; gap: 8px; margin-bottom: 8px; padding: 0 0 8px; border-bottom: 1px solid var(--border); }

/* Method colors */
.method-get { color: var(--green); }
.method-post { color: var(--blue); }
.method-put { color: var(--orange); }
.method-delete { color: var(--red); }
.method-patch { color: var(--yellow); }

/* Payload detail */
.payload-detail { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; }
.payload-detail div { margin-bottom: 2px; }

/* Priority */
.priority-1 { color: var(--red); }
.priority-2 { color: var(--orange); }
.priority-3 { color: var(--yellow); }

/* Info boxes */
.info-box { padding: 12px 16px; border-radius: 6px; margin: 12px 20px; }
.info-warning { background: rgba(234,179,8,0.1); border: 1px solid var(--yellow); }
.info-ok { background: rgba(34,197,94,0.1); border: 1px solid var(--green); }
.info-box p { margin: 0; }

/* Gap/warning lists */
.gap-list li, .warning-list li { margin-bottom: 4px; font-size: 0.9rem; color: var(--orange); }

/* Nmap scripts */
.nmap-scripts { margin-top: 6px; }
.script-output { font-size: 0.8rem; margin-bottom: 4px; }
.script-output pre { margin: 2px 0; padding: 6px 10px; font-size: 0.75rem; }

/* Rate limiting sections */
.rl-section { background: var(--surface2); border-radius: 6px; padding: 12px; margin: 8px 20px; }
.rl-section h4 { margin-top: 0; color: var(--accent); }

/* TOC */
.toc { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
.toc h3 { margin-bottom: 8px; }
.toc a { display: block; color: var(--text); text-decoration: none; padding: 4px 0; font-size: 0.9rem; transition: color 0.15s; }
.toc a:hover { color: var(--accent); }
.toc-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }

/* Scan method */
.scan-method { color: var(--text-muted); font-size: 0.9rem; padding: 8px 20px 0; margin: 0; }

/* Print */
@media print {
  body { background: #fff; color: #1a1a1a; }
  .card { border: 1px solid #ccc; break-inside: avoid; }
  pre { background: #f5f5f5; border: 1px solid #ddd; }
  .entry-header-critical, .entry-header-high, .entry-header-medium, .entry-header-low, .entry-header-info { background: none; }
  .risk-banner { background: none !important; }
}
`;

function generateHtml(data) {
  const meta = data.metadata || {};
  const summary = data.executive_summary || '';
  const dns = data.dns_intelligence || data.dns_records || {};
  const whois = data.whois_data || data.whois || {};
  const subs = data.subdomains || [];
  const ports = data.port_scan || data.ports || [];
  const tls = data.tls_analysis || {};
  const headers = data.http_security_headers || {};
  const waf = data.waf_detection || {};
  const techs = data.technologies || [];
  const endpoints = data.endpoints || data.discovered_endpoints || [];
  const cors = data.cors_analysis || {};
  const rateLimit = data.rate_limiting || {};
  const findings = data.findings || [];
  const pocTargets = data.poc_targets || [];
  const attackSurface = data.attack_surface_summary || {};

  const domain = meta.target_domain || 'Unknown';
  const title = `Recon Report \u2014 ${domain}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reconnaissance Report</h1>
      <p>${esc(domain)} &middot; ${esc(meta.scan_start_time || meta.scan_timestamp || '')}</p>
    </div>

    ${buildMetadata(meta)}
    ${buildExecutiveSummary(summary)}
    ${buildAttackSurfaceSummary(attackSurface)}
    ${buildToc(findings)}
    ${buildDns(dns)}
    ${buildWhois(whois)}
    ${buildSubdomains(subs)}
    ${buildPorts(ports)}
    ${buildTls(tls)}
    ${buildHttpHeaders(headers)}
    ${buildWaf(waf)}
    ${buildTechnologies(techs)}
    ${buildEndpoints(endpoints)}
    ${buildCors(cors)}
    ${buildRateLimiting(rateLimit)}
    ${buildFindings(findings)}
    ${buildPocTargets(pocTargets)}

    <footer style="text-align:center;color:var(--text-muted);padding:24px 0;font-size:0.8rem;">
      Reconnaissance Report generated by RECON-AGENT
    </footer>
  </div>
</body>
</html>`;
}

// ── CLI ─────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.length < 3) {
    process.stderr.write(`Usage: ${process.argv[1]} <input.json> [output.html]\n`);
    process.exit(1);
  }

  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || inputPath.replace(/\.json$/i, '.html');

  let raw;
  try {
    raw = await readFile(inputPath, 'utf-8');
  } catch (err) {
    process.stderr.write(`Error: ${inputPath} not found\n`);
    process.exit(1);
  }

  const data = JSON.parse(raw);
  const html = generateHtml(data);
  await writeFile(outputPath, html, 'utf-8');
  console.log(`HTML report written to: ${outputPath}`);
}

main();
