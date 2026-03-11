/**
 * contentService.js
 * Hadith and Quran verse rotation.
 *
 * Content sourced directly from Tawkit v9.61:
 *   - ahadith.js     → content.hadiths  (64 hadiths)
 *   - messages-slides.js → content.verses  (14 verses/duas)
 *
 * Rotation is sequential (not random), matching Tawkit's display approach —
 * ensures all content is shown before repeating.
 */

const fs   = require('fs');
const path = require('path');

// Load content once at Lambda cold start
let _content = null;

function loadContent() {
  if (_content) return _content;
  try {
    const filePath = path.join(__dirname, '..', 'content', 'content.json');
    _content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`[contentService] Loaded ${_content.hadiths.length} hadiths, ${_content.verses.length} verses`);
  } catch (err) {
    console.error('[contentService] Failed to load content.json:', err.message);
    // Fallback minimal content if file unavailable (e.g. Lambda packaging issue)
    _content = {
      hadiths: [{ id: 1, text: 'قالَ ﷺ : خيركم من تعلم القرآن وعلمه' }],
      verses:  [{ id: 1, text: '﴿ رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الآخِرَةِ حَسَنَةً ﴾', ref: 'البقرة: 201' }],
    };
  }
  return _content;
}

/**
 * Build the full combined pool: all hadiths then all verses
 * Matches Tawkit's JS_AHADITH array followed by JS_SLIDES_DATA
 * @returns {Array<{text, ref?, type}>}
 */
function buildContentPool() {
  const content = loadContent();
  const pool = [];

  // Hadiths first (from ahadith.js)
  for (const h of content.hadiths) {
    pool.push({ type: 'hadith', text: h.text, ref: null });
  }

  // Verses/duas second (from messages-slides.js)
  for (const v of content.verses) {
    pool.push({ type: 'verse', text: v.text, ref: v.ref || null });
  }

  return pool;
}

/**
 * Get content item at a given index (sequential rotation)
 * Index wraps around the full pool — same behavior as Tawkit
 *
 * @param {number} index - current content index (stored in session/EventBridge)
 * @returns {{ text, ref, type, nextIndex }}
 */
function getContentAtIndex(index) {
  const pool = buildContentPool();
  const safeIndex = ((index % pool.length) + pool.length) % pool.length;
  const item = pool[safeIndex];

  return {
    text:      item.text,
    ref:       item.ref,
    type:      item.type,
    index:     safeIndex,
    nextIndex: (safeIndex + 1) % pool.length,
    poolSize:  pool.length,
  };
}

/**
 * Get content based on current time-of-day for natural rotation
 * Uses minutes-since-midnight to pick index — no persistent state needed.
 * This is simpler than DynamoDB for a stateless Lambda.
 *
 * Content changes every 30 seconds, matching Tawkit's slide duration.
 *
 * @param {string} timezone - IANA timezone
 * @returns {{ text, ref, type, index }}
 */
function getCurrentContent(timezone) {
  const now = new Date();

  // Get local time components
  const localTimeStr = now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: timezone
  });

  const [hh, mm, ss] = localTimeStr.split(':').map(Number);
  const totalSeconds = (hh * 3600) + (mm * 60) + ss;

  // Change content every 30 seconds (matches Tawkit's JS_SabahMasaaViewTime = 25s)
  const slotIndex = Math.floor(totalSeconds / 30);

  return getContentAtIndex(slotIndex);
}

/**
 * Get total number of content items in pool
 */
function getPoolSize() {
  return buildContentPool().length;
}

module.exports = {
  getCurrentContent,
  getContentAtIndex,
  getPoolSize,
  loadContent,
};
