#!/usr/bin/env node
/**
 * port-slides.js — Migrate Tawkit messages-slides.js → content/content.json (verses array)
 * Run from repo root. Reads from path; outputs JSON for verses key.
 * Usage: node scripts/port-slides.js [path/to/messages-slides.js]
 *
 * Original: Tawkit v9.61 messages-slides.js (Quran/dua text + ref)
 * Output: { "verses": [ { "id": 1, "text": "...", "ref": "..." }, ... ] }
 */

const fs = require('fs');

function main() {
  const inputPath = process.argv[2];
  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error('Usage: node scripts/port-slides.js <path/to/messages-slides.js>');
    process.exit(1);
  }
  const raw = fs.readFileSync(inputPath, 'utf8');
  const verses = [];
  let id = 1;
  const textRegex = /text:\s*["']([^"']+)["']/g;
  const refRegex = /ref:\s*["']([^"']*)["']/g;
  const texts = [...raw.matchAll(textRegex)].map(m => m[1]);
  const refs = [...raw.matchAll(refRegex)].map(m => m[1]);
  for (let i = 0; i < texts.length; i++) {
    verses.push({ id: id++, text: texts[i], ref: refs[i] || '' });
  }
  const out = { verses, _source: 'Ported from messages-slides.js', _license: 'Islamic public domain texts' };
  console.log(JSON.stringify(out, null, 2));
}

main();
