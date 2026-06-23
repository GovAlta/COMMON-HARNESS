#!/usr/bin/env node
/**
 * Parse a ZAP HTML report into clean JSON for AI agent consumption.
 *
 * Usage:
 *   node zap_parse.js <zap-report.html>
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STRIP_TAGS = /<[^>]+>/g;

function _text(el, $) {
  if (!el || el.length === 0) return '';
  // cheerio .text() gives clean text
  return $(el).text().trim();
}

function _extractField(table, fieldName, $) {
  const trs = $(table).children('tr');
  for (let i = 0; i < trs.length; i++) {
    const tr = trs.eq(i);
    const th = tr.find('th[scope="row"]');
    if (th.length && _text(th, $) === fieldName) {
      const td = tr.find('td');
      return td.length ? _text(td, $) : '';
    }
  }
  return '';
}

function _extractCwes(table, $) {
  const cwes = [];
  const trs = $(table).children('tr');
  for (let i = 0; i < trs.length; i++) {
    const tr = trs.eq(i);
    const th = tr.find('th[scope="row"]');
    if (th.length && _text(th, $) === 'Alert tags') {
      const td = tr.find('td');
      if (td.length) {
        td.find('a').each((_, a) => {
          const href = $(a).attr('href') || '';
          if (href.includes('cwe.mitre.org')) {
            cwes.push(_text($(a), $));
          }
        });
      }
      break;
    }
  }
  return cwes;
}

async function parse(filePath) {
  const html = await readFile(filePath, 'utf-8');
  const $ = cheerio.load(html);

  // Scan metadata
  const header = $('header');
  let rawDate = 'unknown';
  header.find('span').each((_, span) => {
    const t = $(span).text().trim();
    if (t.startsWith('on ')) {
      rawDate = t;
    }
  });
  const scanDate = rawDate.startsWith('on ') ? rawDate.slice(3) : rawDate;

  const sites = [];
  $('ul.sites-list .site').each((_, el) => {
    sites.push($(el).text().trim());
  });

  // Alert summary from the alert-type-counts table
  const summary = { high: 0, medium: 0, low: 0, informational: 0 };
  const typeTable = $('table.alert-type-counts-table');
  if (typeTable.length) {
    typeTable.find('tbody tr').each((_, tr) => {
      const riskTd = $(tr).find('td.risk-level');
      if (riskTd.length) {
        const risk = riskTd.text().trim().toLowerCase();
        if (risk in summary) {
          summary[risk] += 1;
        }
      }
    });
  }

  // Parse alert detail blocks within the #alerts section
  const alertsSection = $('section#alerts');
  if (!alertsSection.length) {
    return {
      target: sites[0] || 'unknown',
      scan_date: scanDate,
      alert_summary: summary,
      alerts: [],
    };
  }

  const alerts = {};

  // Walk through each risk/confidence group
  alertsSection.find('li[id^="alerts--risk"]').each((_, riskGroup) => {
    const h3 = $(riskGroup).find('h3').first();
    if (!h3.length) return;

    const riskSpans = h3.find('span.risk-level');
    const confSpans = h3.find('span.confidence-level');
    const risk = riskSpans.length ? riskSpans.first().text().trim() : 'Unknown';
    const confidence = confSpans.length ? confSpans.first().text().trim() : 'Unknown';

    // Each alert type within this group
    $(riskGroup).find('h5').each((_, h5El) => {
      const a = $(h5El).find('a');
      if (!a.length) return;
      const alertName = a.text().trim();

      // Each instance under this alert type (sibling <ol>)
      const ol = $(h5El).next('ol');
      if (!ol.length) return;

      ol.find('details').each((_, details) => {
        const summaryEl = $(details).find('summary');
        const methodUrl = summaryEl.length ? summaryEl.text().trim() : '';
        let method = 'GET';
        let url = methodUrl;
        if (methodUrl.includes(' ')) {
          method = methodUrl.split(' ', 1)[0];
          url = methodUrl.slice(method.length + 1);
        }

        const table = $(details).find('table.alerts-table');
        if (!table.length) return;

        const description = _extractField(table, 'Alert description', $);
        const solution = _extractField(table, 'Solution', $);
        const parameter = _extractField(table, 'Parameter', $) || null;
        const evidence = _extractField(table, 'Evidence', $) || null;
        const otherInfo = _extractField(table, 'Other info', $) || null;
        const cwes = _extractCwes(table, $);

        const instance = {
          method,
          url,
          parameter,
          evidence,
        };
        if (otherInfo) {
          instance.other_info = otherInfo;
        }

        if (!(alertName in alerts)) {
          alerts[alertName] = {
            name: alertName,
            risk,
            confidence,
            cwes,
            description,
            solution,
            instances: [],
          };
        }

        alerts[alertName].instances.push(instance);
      });
    });
  });

  return {
    target: sites[0] || 'unknown',
    scan_date: scanDate,
    alert_summary: summary,
    alerts: Object.values(alerts),
  };
}

// ── CLI ──────────────────────────────────────────────────────────

if (process.argv.length !== 3) {
  process.stderr.write(`Usage: ${process.argv[1]} <zap-report.html>\n`);
  process.exit(1);
}

const output = await parse(process.argv[2]);
console.log(JSON.stringify(output, null, 2));
