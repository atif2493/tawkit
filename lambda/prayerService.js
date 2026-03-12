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
let _cache = null;

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

function getTodayDateStr() {
  const now = new Date();
  const dd  = String(now.getDate()).padStart(2, '0');
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function buildApiUrl(dateStr) {
  const params = new URLSearchParams({
    city:    CONFIG.city,
    country: CONFIG.country,
    state:   CONFIG.state,
    method:  CONFIG.method,
    school:  CONFIG.school,
  });
  return `https://api.aladhan.com/v1/timingsByCity/${dateStr}?${params.toString()}`;
}

function parseApiResponse(data) {
  if (!data || !data.data || !data.data.timings || !data.data.date) {
    throw new Error('AlAdhan API response missing required fields (data.timings or data.date)');
  }
  const requiredTimings = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  for (const key of requiredTimings) {
    if (!data.data.timings[key]) {
      throw new Error(`AlAdhan API response missing timing: ${key}`);
    }
  }
  const t = data.data.timings;
  const d = data.data.date;

  return {
    fajr:    t.Fajr,
    sunrise: t.Sunrise,
    dhuhr:   t.Dhuhr,
    asr:     t.Asr,
    maghrib: t.Maghrib,
    isha:    t.Isha,
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
    city:     CONFIG.city,
    timezone: CONFIG.timezone,
    madhab:   'Hanafi',
    method:   'ISNA',
    fetchedAt: new Date().toISOString(),
  };
}

async function getPrayerTimes(forceRefresh = false) {
  const today = getTodayDateStr();

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
    _cache = times;
    console.log('[prayerService] Fetched OK — Asr (Hanafi):', times.asr, '| City:', times.city);
    return times;
  } catch (error) {
    console.error('[prayerService] API fetch failed:', error.message);
    if (_cache) {
      console.warn('[prayerService] Using cached fallback');
      return _cache;
    }
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

function clearCache() {
  _cache = null;
  console.log('[prayerService] Cache cleared');
}

module.exports = { getPrayerTimes, clearCache, CONFIG };
