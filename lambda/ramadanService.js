/**
 * ramadanService.js
 * Ramadan companion logic — suhoor/iftar countdown, last 10 nights,
 * Laylat al-Qadr, zakat reminders, and fasting duas.
 * Designed for future extensibility to other Islamic months (Dhul Hijja, Muharram).
 */

const path = require('path');
const fs = require('fs');
const { timeToMinutes, getCurrentTimeStr, formatCountdown, formatTo12Hr } = require('./countdownService');

let _cachedContent = null;

function loadRamadanContent() {
  if (_cachedContent) return _cachedContent;
  try {
    const filePath = path.join(__dirname, 'content', 'ramadan.json');
    _cachedContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return _cachedContent;
  } catch (err) {
    console.error('[ramadanService] Failed to load ramadan.json:', err.message);
    return null;
  }
}

function getFastingUrgency(minutesLeft) {
  if (minutesLeft <= 5) return 'urgent';
  if (minutesLeft <= 15) return 'warning';
  return 'normal';
}

/**
 * Get suhoor context — relevant from midnight until Fajr.
 */
function getSuhoorContext(fajrTime, timezone) {
  const nowMinutes = timeToMinutes(getCurrentTimeStr(timezone));
  const fajrMinutes = timeToMinutes(fajrTime);

  // Suhoor window: midnight (0:00) to Fajr
  const isInWindow = nowMinutes < fajrMinutes;
  if (!isInWindow) {
    return { showBanner: false, minutesLeft: 0, countdown: '', urgency: 'normal' };
  }

  const minutesLeft = fajrMinutes - nowMinutes;
  const content = loadRamadanContent();

  return {
    showBanner: true,
    endTime: fajrTime,
    endTime12hr: formatTo12Hr(fajrTime),
    minutesLeft,
    countdown: formatCountdown(minutesLeft * 60),
    urgency: getFastingUrgency(minutesLeft),
    dua: content ? content.suhoorDua : null,
  };
}

/**
 * Get iftar context — relevant from sunrise until Maghrib.
 */
function getIftarContext(maghribTime, sunriseTime, timezone) {
  const nowMinutes = timeToMinutes(getCurrentTimeStr(timezone));
  const maghribMinutes = timeToMinutes(maghribTime);
  const sunriseMinutes = timeToMinutes(sunriseTime);

  // Iftar window: sunrise to Maghrib (fasting hours)
  const isInWindow = nowMinutes >= sunriseMinutes && nowMinutes < maghribMinutes;
  if (!isInWindow) {
    return { showBanner: false, minutesLeft: 0, countdown: '', urgency: 'normal' };
  }

  const minutesLeft = maghribMinutes - nowMinutes;
  const content = loadRamadanContent();

  return {
    showBanner: true,
    time: maghribTime,
    time12hr: formatTo12Hr(maghribTime),
    minutesLeft,
    countdown: formatCountdown(minutesLeft * 60),
    urgency: getFastingUrgency(minutesLeft),
    showDua: minutesLeft <= 30,
    dua: content ? content.iftarDua : null,
  };
}

/**
 * Get last 10 nights context — active when hijri day >= 21.
 */
function getLastTenNightsContext(hijriDay) {
  const day = parseInt(hijriDay) || 0;
  const isActive = day >= 21;
  if (!isActive) {
    return { isActive: false, isOddNight: false, message: '', dua: null, verse: null };
  }

  const content = loadRamadanContent();
  const oddNights = content ? content.lastTenNights.oddNights : [21, 23, 25, 27, 29];
  const isOddNight = oddNights.includes(day);

  return {
    isActive: true,
    isOddNight,
    nightNumber: day - 20,
    messageAr: content ? content.lastTenNights.messageAr : '',
    messageEn: content ? content.lastTenNights.messageEn : '',
    verse: content ? content.lastTenNights.laylatalQadr : null,
    dua: content ? content.lastTenNights.dua : null,
  };
}

/**
 * Get zakat reminder context — active from day 25 onward.
 */
function getZakatContext(hijriDay) {
  const day = parseInt(hijriDay) || 0;
  const content = loadRamadanContent();
  const startDay = content ? content.zakatReminder.startDay : 25;

  if (day < startDay) {
    return { show: false, messageAr: '', messageEn: '' };
  }

  return {
    show: true,
    messageAr: content ? content.zakatReminder.messageAr : '',
    messageEn: content ? content.zakatReminder.messageEn : '',
  };
}

/**
 * Main entry point — get full Ramadan context.
 * @param {object} prayerTimes — { fajr, sunrise, maghrib, hijri: { day, month } }
 * @param {string} timezone
 */
function getRamadanContext(prayerTimes, timezone) {
  const hijriDay = parseInt(prayerTimes.hijri?.day || '0');
  const hijriMonth = (prayerTimes.hijri?.month || '').toLowerCase();
  const isRamadan = hijriMonth === 'ramadan' || hijriMonth === 'ramaḍān';

  if (!isRamadan) {
    return {
      isRamadan: false,
      hijriDay: 0,
      ramadanText: '',
      suhoor: { showBanner: false },
      iftar: { showBanner: false },
      lastTenNights: { isActive: false, isOddNight: false },
      zakat: { show: false },
      eidCountdown: '',
      eidEstDate: '',
      daysToEid: 0,
      showEidCountdown: false,
      spiritualReminder: null,
    };
  }

  const suhoor = getSuhoorContext(prayerTimes.fajr, timezone);
  const iftar = getIftarContext(prayerTimes.maghrib, prayerTimes.sunrise || prayerTimes.fajr, timezone);
  const lastTenNights = getLastTenNightsContext(hijriDay);
  const zakat = getZakatContext(hijriDay);

  // Eid countdown
  let eidCountdown = '';
  let eidEstDate = '';
  let daysToEid = 0;
  if (hijriDay > 0) {
    daysToEid = 30 - hijriDay + 1;
    const eidDate = new Date();
    eidDate.setDate(eidDate.getDate() + daysToEid);
    const eidMonth = eidDate.toLocaleString('en-US', { month: 'short', timeZone: timezone });
    const eidDay = eidDate.toLocaleString('en-US', { day: 'numeric', timeZone: timezone });
    eidCountdown = `Eid al-Fitr in ~${daysToEid} day${daysToEid !== 1 ? 's' : ''}`;
    eidEstDate = `~${eidMonth} ${eidDay}`;
  }

  // Pick a spiritual reminder based on the day
  const content = loadRamadanContent();
  let spiritualReminder = null;
  if (content && content.spiritualReminders.length > 0) {
    const idx = (hijriDay - 1) % content.spiritualReminders.length;
    spiritualReminder = content.spiritualReminders[idx];
  }

  return {
    isRamadan: true,
    hijriDay,
    ramadanText: `Fast Day ${hijriDay} of 30`,
    suhoor,
    iftar,
    lastTenNights,
    zakat,
    eidCountdown,
    eidEstDate,
    daysToEid,
    showEidCountdown: hijriDay > 0,
    spiritualReminder,
  };
}

module.exports = { getRamadanContext, getSuhoorContext, getIftarContext, getLastTenNightsContext, getZakatContext, loadRamadanContent };
