#!/usr/bin/env node
/**
 * port-ahadith.js — Migrate Tawkit ahadith.js → content/content.json (hadiths array)
 * Run from repo root. Reads from stdin or path; outputs JSON for hadiths key.
 * Usage: node scripts/port-ahadith.js [path/to/ahadith.js]
 *
 * Original: Tawkit v9.61 ahadith.js (array of Arabic hadith text)
 * Output: { "hadiths": [ { "id": 1, "text": "..." }, ... ] }
 */

const fs = require('fs');
const path = require('path');

function main() {
  const inputPath = process.argv[2];
  let raw = '';
  if (inputPath && fs.existsSync(inputPath)) {
    raw = fs.readFileSync(inputPath, 'utf8');
  } else {
    console.error('Usage: node scripts/port-ahadith.js <path/to/ahadith.js>');
    process.exit(1);
  }

  const hadiths = [];
  const regex = /["']([^"']{10,})["']/g;
  let m;
  let id = 1;
  while ((m = regex.exec(raw)) !== null) {
    hadiths.push({ id: id++, text: m[1].trim() });
  }

  const out = { hadiths, _source: 'Ported from ahadith.js', _license: 'Islamic public domain texts' };
  console.log(JSON.stringify(out, null, 2));
}

main();
