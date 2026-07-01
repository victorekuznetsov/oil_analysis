#!/usr/bin/env node
'use strict';
/**
 * Regenerate dashboard_final.html from fresh source data, headlessly.
 *
 * Reuses the exact same pure JS transform functions the dashboard already
 * runs client-side when a human drags a CSV into the "📂 Обновить" / "🔧
 * Отказы" modals (see automation/report_engine.js, extracted verbatim from
 * the template). This guarantees the regenerated report matches what the
 * in-browser manual update would have produced, byte-for-byte in logic.
 *
 * Usage:
 *   node build_dashboard.js \
 *     --template dashboard_final.html \
 *     --oil-csv out/oil_samples.csv \
 *     --norms-csv out/norms.csv \
 *     --fleet-pct out/fleet_pct.json \
 *     --fail-csv out/oil_failures.csv \
 *     --out dashboard_updated.html
 *
 * --norms-csv, --fleet-pct, --fail-csv are optional; when omitted the
 * template's own embedded defaults are kept for that piece.
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const engine = require('./report_engine.js');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

// Finds `const NAME=` in `html` and replaces the JS literal that follows,
// returning the new html. Handles quoted strings, template literals and
// balanced-brace object/array literals; respects nested quotes.
function spliceConst(html, name, kind, newLiteralText) {
  let si = -1;
  for (const kw of ['const', 'let']) {
    for (const sep of ['=', ' = ']) {
      const marker = `${kw} ${name}${sep}`;
      const idx = html.indexOf(marker);
      if (idx >= 0) { si = idx + marker.length; break; }
    }
    if (si >= 0) break;
  }
  if (si < 0) throw new Error(`marker not found for ${name}`);

  let ei;
  if (kind === 'quoted') {
    if (html[si] !== '"') throw new Error(`${name}: expected " at splice point`);
    ei = html.indexOf('";', si + 1) + 2;
    if (ei < 2) throw new Error(`${name}: closing "; not found`);
  } else if (kind === 'backtick') {
    if (html[si] !== '`') throw new Error(`${name}: expected backtick at splice point`);
    ei = html.indexOf('`;', si + 1) + 2;
    if (ei < 2) throw new Error(`${name}: closing \`; not found`);
  } else if (kind === 'brace') {
    if (html[si] !== '{' && html[si] !== '[') throw new Error(`${name}: expected { or [ at splice point`);
    const open = html[si], close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false, j = si;
    for (; j < html.length; j++) {
      const c = html[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) { j++; break; } }
    }
    if (html[j] !== ';') throw new Error(`${name}: expected ; after literal`);
    ei = j + 1;
  } else {
    throw new Error(`unknown kind ${kind}`);
  }

  return html.slice(0, si) + newLiteralText + html.slice(ei);
}

function gzipBase64(obj) {
  const json = JSON.stringify(obj);
  const gz = zlib.gzipSync(Buffer.from(json, 'utf-8'));
  return gz.toString('base64');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const req of ['template', 'oil-csv', 'out']) {
    if (!args[req]) { console.error(`missing --${req}`); process.exit(1); }
  }

  let html = fs.readFileSync(args.template, 'utf-8');

  const oilCsvText = fs.readFileSync(args['oil-csv'], 'utf-8');
  const normsCsvText = args['norms-csv']
    ? fs.readFileSync(args['norms-csv'], 'utf-8')
    : engine.NORMS_CSV_EMBEDDED;

  const rows = engine._parseCSV(oilCsvText);
  if (!rows.length) throw new Error('oil CSV produced 0 rows - check headers');
  console.error(`parsed ${rows.length} oil sample rows`);

  const normMap = engine._parseNorms(normsCsvText);
  console.error(`norms table: ${Object.keys(normMap).length} (model|node) keys`);

  const DB = engine._buildDB(rows, normMap);
  engine._postProcessDB(DB, normMap);
  const PRED_DATA = engine._buildPredData(rows, normMap);

  const brandCount = Object.keys(DB).length;
  let machCount = 0, probeCount = 0;
  for (const b of Object.values(DB)) for (const m of Object.values(b)) {
    machCount++;
    for (const ps of Object.values(m.nodes)) probeCount += ps.length;
  }
  console.error(`built DB: ${brandCount} brands, ${machCount} machines, ${probeCount} samples`);

  if (args['norms-csv']) {
    html = spliceConst(html, 'NORMS_CSV_EMBEDDED', 'backtick', '`' + normsCsvText.trimEnd() + '`;');
  }

  if (args['fleet-pct']) {
    const pct = JSON.parse(fs.readFileSync(args['fleet-pct'], 'utf-8'));
    html = spliceConst(html, 'FLEET_P90', 'brace', JSON.stringify(pct.p90) + ';');
    html = spliceConst(html, 'FLEET_P95', 'brace', JSON.stringify(pct.p95) + ';');
  }

  html = spliceConst(html, 'PRED_DATA', 'brace', JSON.stringify(PRED_DATA) + ';');

  if (args['fail-csv']) {
    const failCsvText = fs.readFileSync(args['fail-csv'], 'utf-8');
    const failRows = engine._parseFailCSV(failCsvText);
    const FAIL_DATA = engine._buildFailData(failRows);
    const evts = Object.values(FAIL_DATA).reduce((s, a) => s + a.length, 0);
    console.error(`built FAIL_DATA: ${Object.keys(FAIL_DATA).length} machine|node keys, ${evts} events`);
    html = spliceConst(html, 'FAIL_DATA', 'brace', JSON.stringify(FAIL_DATA) + ';');
  }

  const b64 = gzipBase64(DB);
  html = spliceConst(html, 'DATA_B64', 'quoted', `"${b64}";`);

  fs.mkdirSync(path.dirname(args.out) || '.', { recursive: true });
  fs.writeFileSync(args.out, html, 'utf-8');
  console.error(`wrote ${args.out} (${(html.length / 1e6).toFixed(1)} MB)`);
}

main();
