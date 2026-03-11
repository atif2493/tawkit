/**
 * countdownService.js
 * Prayer time utilities and next-prayer countdown logic.
 *
 * Time utility functions ported from Tawkit v9.61 (m2body.js):
 *   timeToMinutes() ← v9347263()
 *   addMinutesToTime() ← v9392163()
 *   addOneHour() ← v9377363()
 *   subtractOneHour() ← v9377463()
 */

const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

const PRAYER_NAMES_AR = {
  Fajr:    'الفجر',
  Dhuhr:   'الظهر',
  Asr:     'العصر',
  Maghrib: 'المغرب',
  Isha:    'العشاء',
};

/**
 * Ported from Tawkit v9347263(v9510663)
 * Convert "HH:MM" string to total minutes
 * @param {string} timeStr - e.g. "14:30"
 * @returns {number} total minutes from midnight
 */
function timeToMinutes(timeStr) {
  const hours   = parseInt(timeStr.substr(0, 2));
  const minutes = parseInt(timeStr.substr(3, 2));
  return (hours * 60) + minutes;
}

/**
 * Ported from Tawkit v9392163(time, offsetMinutes)
 * Add (or subtract) N minutes to a "HH:MM" string
 * @param {string} timeStr - e.g. "14:30"
 * @param {number} offsetMinutes - can be negative
 * @returns {string} new time as "HH:MM"
 */
function addMinutesToTime(timeStr, offsetMinutes) {
  let totalMinutes = timeToMinutes(timeStr) + offsetMinutes;

  // Handle day overflow/underflow
  if (totalMinutes < 0)    totalMinutes += 1440;
  if (totalMinutes >= 1440) totalMinutes -= 1440;

  const hh = ('0' + Math.floor(totalMinutes / 60)).slice(-2);
  const mm = ('0' + (totalMinutes % 60)).slice(-2);
  return `${hh}:${mm}`;
}

/**
 * Ported from Tawkit v9377363() — add one hour to a time string
 * @param {string} timeStr - "HH:MM"
 * @returns {string}
 */
function addOneHour(timeStr) {
  const parts = timeStr.split(':');
  const hh = ('0' + (parseInt(parts[0]) + 1)).slice(-2);
  return `${hh}:${parts[1]}`;
}

/**
 * Ported from Tawkit v9377463() — subtract one hour from a time string
 * @param {string} timeStr - "HH:MM"
 * @returns {string}
 */
function subtractOneHour(timeStr) {
  const parts = timeStr.split(':');
  const hh = ('0' + (parseInt(parts[0]) - 1)).slice(-2);
  return `${hh}:${parts[1]}`;
}

/**
 * Convert "HH:MM" (24hr) to 12-hour display format
 * @param {string} timeStr - "14:30"
 * @returns {string} "2:30 PM"
 */
function formatTo12Hr(timeStr) {
  const parts  = timeStr.split(':');
  let   hours  = parseInt(parts[0]);
  const mins   = parts[1];
  const ampm   = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${mins} ${ampm}`;
}

/**
 * Get current time as "HH:MM" in a given timezone
 * @param {string} timezone - e.g. "America/New_York"
 * @returns {string} "HH:MM"
 */
function getCurrentTimeStr(timezone) {
  const now = new Date();
  const opts = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone };
  return now.toLocaleTimeString('en-GB', opts); // en-GB gives HH:MM format
}

/**
 * Calculate which prayer is next and how many seconds until it
 * Logic mirrors Tawkit's main ticker loop logic
 *
 * @param {object} times - { fajr, dhuhr, asr, maghrib, isha } all "HH:MM"
 * @param {string} timezone - IANA timezone string
 * @returns {object} { name, nameAr, time, time12hr, secondsUntil, minutesUntil, allPassed }
 */
function getNextPrayer(times, timezone) {
  const nowStr     = getCurrentTimeStr(timezone);
  const nowMinutes = timeToMinutes(nowStr);

  const prayers = [
    { name: 'Fajr',    time: times.fajr    },
    { name: 'Dhuhr',   time: times.dhuhr   },
    { name: 'Asr',     time: times.asr     },
    { name: 'Maghrib', time: times.maghrib },
    { name: 'Isha',    time: times.isha    },
  ];

  // Find first prayer whose time > now (same logic as Tawkit's ticker)
  for (const prayer of prayers) {
    const prayerMinutes = timeToMinutes(prayer.time);
    if (prayerMinutes > nowMinutes) {
      const diffMinutes = prayerMinutes - nowMinutes;
      return {
        name:         prayer.name,
        nameAr:       PRAYER_NAMES_AR[prayer.name],
        time:         prayer.time,
        time12hr:     formatTo12Hr(prayer.time),
        secondsUntil: diffMinutes * 60,
        minutesUntil: diffMinutes,
        hoursUntil:   Math.floor(diffMinutes / 60),
        minsRemaining: diffMinutes % 60,
        allPassed:    false,
      };
    }
  }

  // All prayers passed for today → next is tomorrow's Fajr
  // Seconds until midnight + Fajr minutes
  const midnightMinutes = 1440;
  const fajrMinutes     = timeToMinutes(times.fajr);
  const diffMinutes     = (midnightMinutes - nowMinutes) + fajrMinutes;

  return {
    name:         'Fajr',
    nameAr:       PRAYER_NAMES_AR['Fajr'],
    time:         times.fajr,
    time12hr:     formatTo12Hr(times.fajr),
    secondsUntil: diffMinutes * 60,
    minutesUntil: diffMinutes,
    hoursUntil:   Math.floor(diffMinutes / 60),
    minsRemaining: diffMinutes % 60,
    allPassed:    true,   // flag: this is tomorrow's Fajr
  };
}

/**
 * Format countdown for display on APL widget
 * Matches Tawkit's countdown display style
 * @param {number} secondsUntil
 * @returns {string} e.g. "1h 23m" or "45m" or "< 1m"
 */
function formatCountdown(secondsUntil) {
  const totalMins = Math.floor(secondsUntil / 60);
  if (totalMins < 1)  return '< 1m';
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Get urgency level for countdown color on APL
 * Mirrors Tawkit's ucCounterColorAlert behavior
 * @param {number} minutesUntil
 * @returns {'normal'|'warning'|'urgent'}
 */
function getCountdownUrgency(minutesUntil) {
  if (minutesUntil <= 1)  return 'urgent';   // red  #FF4444
  if (minutesUntil <= 10) return 'warning';  // amber #FFA500
  return 'normal';                            // white #FFFFFF
}

/**
 * Build a status map of which prayers are past/current/upcoming today
 * Used to dim past prayers — mirrors Tawkit's ucDimmPastPrayers behavior
 * @param {object} times
 * @param {string} timezone
 * @returns {object} { fajr: 'past'|'next'|'upcoming', ... }
 */
function getPrayerStatuses(times, timezone) {
  const nowStr     = getCurrentTimeStr(timezone);
  const nowMinutes = timeToMinutes(nowStr);
  const next       = getNextPrayer(times, timezone);

  const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const result  = {};

  let foundNext = false;
  for (const key of prayers) {
    const pMinutes = timeToMinutes(times[key]);
    const name     = key.charAt(0).toUpperCase() + key.slice(1);

    if (name === next.name && !next.allPassed) {
      result[key] = 'next';
      foundNext = true;
    } else if (pMinutes < nowMinutes && !foundNext) {
      result[key] = 'past';
    } else {
      result[key] = foundNext ? 'upcoming' : 'past';
    }
  }

  // Edge: all passed today — Isha is most recent, Fajr is next (tomorrow)
  if (next.allPassed) {
    prayers.forEach(k => result[k] = 'past');
    result['fajr'] = 'next';
  }

  return result;
}

module.exports = {
  timeToMinutes,
  addMinutesToTime,
  addOneHour,
  subtractOneHour,
  formatTo12Hr,
  getCurrentTimeStr,
  getNextPrayer,
  formatCountdown,
  getCountdownUrgency,
  getPrayerStatuses,
  PRAYER_NAMES,
  PRAYER_NAMES_AR,
};
