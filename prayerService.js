/**
 * prayerService.js
 * Fetches prayer times from AlAdhan.com API using city-based lookup.
 * Uses Hanafi madhab (school=1) for Asr calculation.
 *
 * API Docs: https://aladhan.com/prayer-times-api
 */

const https = require('https');
const { formatHijriDate } = require('./hijriService');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  city:     process.env.PRAYER_CITY     || 'Apex',
  state:    process.env.PRAYER_STATE    || 'NC',
  country:  process.env.PRAYER_COUNTRY  || 'US',
  method:   process.env.PRAYER_METHOD   || '2',    // 2 = ISNA (North America)
  school:   process.env.PRAYER_SCHOOL   || '1',    // 1 = Hanafi (affects Asr only)
  timezone: process.env.PRAYER_TIMEZONE || 'America/New_York',
};

// In-memory cache for Lambda warm invocations
// Mirrors Tawkit's approach of caching times for the day
let _cache = null;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Simple HTTPS GET returning parsed JSON
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

/**
 * Get today's date string for AlAdhan API (DD-MM-YYYY)
 */
function getTodayDateStr() {
  const now = new Date();
  const dd  = String(now.getDate()).padStart(2, '0');
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Build AlAdhan timingsByCity URL
 * Uses city name + school=1 (Hanafi) — no lat/lng needed
 *
 * Example:
 *   https://api.aladhan.com/v1/timingsByCity/10-03-2026
 *     ?city=Apex&country=US&state=NC&method=2&school=1
 */
function buildApiUrl(dateStr) {
  const params = new URLSearchParams({
    city:    CONFIG.city,
    country: CONFIG.country,
    state:   CONFIG.state,
    method:  CONFIG.method,
    school:  CONFIG.school,   // 1 = Hanafi Asr
  });
  return `https://api.aladhan.com/v1/timingsByCity/${dateStr}?${params.toString()}`;
}

/**
 * Parse AlAdhan API response into clean prayer times object
 * Maps API field names to our standard keys
 */
function parseApiResponse(data) {
  const t = data.data.timings;
  const d = data.data.date;

  return {
    // Prayer times (24hr HH:MM from API)
    fajr:    t.Fajr,
    sunrise: t.Sunrise,
    dhuhr:   t.Dhuhr,
    asr:     t.Asr,      // Hanafi Asr (later time, school=1)
    maghrib: t.Maghrib,
    isha:    t.Isha,

    // Date info from API
    hijri: {
      day:     d.hijri.day,
      month:   d.hijri.month.en,
      monthAr: d.hijri.month.ar,
      year:    d.hijri.year,
      formatted: `${d.hijri.day} ${d.hijri.month.en} ${d.hijri.year}`,
      formattedAr: `${d.hijri.day} ${d.hijri.month.ar} ${d.hijri.year}`,
    },
    gregorian: {
      day:       d.gregorian.day,
      weekday:   d.gregorian.weekday.en,
      month:     d.gregorian.month.en,
      year:      d.gregorian.year,
      formatted: `${d.gregorian.weekday.en}, ${d.gregorian.day} ${d.gregorian.month.en} ${d.gregorian.year}`,
    },

    // Meta
    city:     CONFIG.city,
    timezone: CONFIG.timezone,
    madhab:   'Hanafi',
    method:   'ISNA',
    fetchedAt: new Date().toISOString(),
  };
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

/**
 * Get today's prayer times for Apex, NC using Hanafi madhab
 * Caches result in Lambda memory for warm invocations
 *
 * @param {boolean} forceRefresh - bypass cache
 * @returns {Promise<object>} prayer times object
 */
async function getPrayerTimes(forceRefresh = false) {
  const today = getTodayDateStr();

  // Return cached times if same day and not forced
  if (!forceRefresh && _cache && _cache._date === today) {
    console.log('[prayerService] Returning cached prayer times for', today);
    return _cache;
  }

  const url = buildApiUrl(today);
  console.log('[prayerService] Fetching prayer times:', url);

  try {
    const json   = await httpsGet(url);

    if (json.code !== 200) {
      throw new Error(`AlAdhan API returned code ${json.code}: ${json.status}`);
    }

    const times  = parseApiResponse(json);
    times._date  = today;

    // Cache in Lambda memory
    _cache = times;
    console.log('[prayerService] Fetched OK — Asr (Hanafi):', times.asr,
                '| City:', times.city, '| Hijri:', times.hijri.formatted);

    return times;

  } catch (error) {
    console.error('[prayerService] API fetch failed:', error.message);

    // Fallback: return cached times from earlier today if available
    if (_cache) {
      console.warn('[prayerService] Using cached fallback times from:', _cache.fetchedAt);
      return _cache;
    }

    // Last resort: return computed Hijri date with null prayer times
    // Lambda will display an error state in APL
    const hijri = formatHijriDate(new Date());
    return {
      fajr: null, dhuhr: null, asr: null, maghrib: null, isha: null,
      hijri: { formatted: hijri.en, formattedAr: hijri.ar },
      gregorian: { formatted: new Date().toDateString() },
      error: error.message,
      city: CONFIG.city,
      timezone: CONFIG.timezone,
    };
  }
}

/**
 * Clear the in-memory cache — called at midnight by EventBridge
 */
function clearCache() {
  _cache = null;
  console.log('[prayerService] Cache cleared');
}

module.exports = { getPrayerTimes, clearCache, CONFIG };
