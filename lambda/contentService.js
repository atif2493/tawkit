/**
 * contentService.js
 * Hadith and Quran verse rotation.
 * Content from Tawkit v9.61 ahadith.js + messages-slides.js.
 * Rotation is sequential; content path: ../content/content.json (from lambda/ = repo content/).
 */

const fs   = require('fs');
const path = require('path');

let _content = null;

function loadContent() {
  if (_content) return _content;
  try {
    // Load from lambda/content/ (bundled) or repo content/ (local dev)
  const filePath = fs.existsSync(path.join(__dirname, 'content', 'content.json'))
    ? path.join(__dirname, 'content', 'content.json')
    : path.join(__dirname, '..', 'content', 'content.json');
    _content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`[contentService] Loaded ${_content.hadiths.length} hadiths, ${_content.verses.length} verses`);
  } catch (err) {
    console.error('[contentService] Failed to load content.json:', err.message);
    _content = {
      hadiths: [{ id: 1, text: 'قالَ ﷺ : خيركم من تعلم القرآن وعلمه' }],
      verses:  [{ id: 1, text: '﴿ رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الآخِرَةِ حَسَنَةً ﴾', ref: 'البقرة: 201' }],
    };
  }
  return _content;
}

function buildContentPool() {
  const content = loadContent();
  const pool = [];
  for (const h of content.hadiths) pool.push({ type: 'hadith', text: h.text, ref: null });
  for (const v of content.verses) pool.push({ type: 'verse', text: v.text, ref: v.ref || null });
  return pool;
}

function getContentAtIndex(index) {
  const pool = buildContentPool();
  const safeIndex = ((index % pool.length) + pool.length) % pool.length;
  const item = pool[safeIndex];
  return {
    text: item.text, ref: item.ref, type: item.type,
    index: safeIndex, nextIndex: (safeIndex + 1) % pool.length, poolSize: pool.length,
  };
}

function getCurrentContent(timezone) {
  const now = new Date();
  const localTimeStr = now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: timezone
  });
  const [hh, mm, ss] = localTimeStr.split(':').map(Number);
  const totalSeconds = (hh * 3600) + (mm * 60) + ss;
  const slotIndex = Math.floor(totalSeconds / 30);
  return getContentAtIndex(slotIndex);
}

function getPoolSize() {
  return buildContentPool().length;
}

module.exports = { getCurrentContent, getContentAtIndex, getPoolSize, loadContent };
