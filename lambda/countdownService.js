/**
 * countdownService.js
 * Prayer time utilities and next-prayer countdown logic.
 * Time utilities ported from Tawkit v9.61 (m2body.js).
 */

const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Eaisha'];
const PRAYER_NAMES_AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Eaisha: 'العشاء' };

function timeToMinutes(timeStr) {
  const hours = parseInt(timeStr.substring(0, 2));
  const minutes = parseInt(timeStr.substring(3, 5));
  return (hours * 60) + minutes;
}

function addMinutesToTime(timeStr, offsetMinutes) {
  let totalMinutes = timeToMinutes(timeStr) + offsetMinutes;
  if (totalMinutes < 0) totalMinutes += 1440;
  if (totalMinutes >= 1440) totalMinutes -= 1440;
  const hh = ('0' + Math.floor(totalMinutes / 60)).slice(-2);
  const mm = ('0' + (totalMinutes % 60)).slice(-2);
  return `${hh}:${mm}`;
}

function addOneHour(timeStr) {
  const parts = timeStr.split(':');
  const hh = ('0' + ((parseInt(parts[0]) + 1) % 24)).slice(-2);
  return `${hh}:${parts[1]}`;
}

function subtractOneHour(timeStr) {
  const parts = timeStr.split(':');
  const hh = ('0' + ((parseInt(parts[0]) + 23) % 24)).slice(-2);
  return `${hh}:${parts[1]}`;
}

function formatTo12Hr(timeStr) {
  const parts = timeStr.split(':');
  let hours = parseInt(parts[0]);
  const mins = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${mins} ${ampm}`;
}

function getCurrentTimeStr(timezone) {
  const now = new Date();
  const opts = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone };
  return now.toLocaleTimeString('en-GB', opts);
}

/**
 * Get next prayer, considering iqama times.
 * A prayer is "current" (active) from adhan until iqama passes.
 * During that window, the prayer stays focused (not skipped to the next one).
 * @param {object} times - prayer times { fajr, dhuhr, asr, maghrib, isha } in 24hr "HH:MM"
 * @param {string} timezone
 * @param {object} [iqamaTimes] - optional iqama times { fajr, dhuhr, asr, maghrib, isha } in 24hr "HH:MM"
 */
function getNextPrayer(times, timezone, iqamaTimes) {
  const nowStr = getCurrentTimeStr(timezone);
  const nowMinutes = timeToMinutes(nowStr);
  const prayers = [
    { name: 'Fajr', key: 'fajr', time: times.fajr },
    { name: 'Dhuhr', key: 'dhuhr', time: times.dhuhr },
    { name: 'Asr', key: 'asr', time: times.asr },
    { name: 'Maghrib', key: 'maghrib', time: times.maghrib },
    { name: 'Eaisha', key: 'isha', time: times.isha },
  ];

  // Check if any prayer is currently active (between adhan and iqama)
  if (iqamaTimes) {
    for (const prayer of prayers) {
      const adhanMinutes = timeToMinutes(prayer.time);
      const iqamaTime = iqamaTimes[prayer.key];
      if (iqamaTime) {
        const iqamaMinutes = timeToMinutes(iqamaTime);
        if (nowMinutes >= adhanMinutes && nowMinutes <= iqamaMinutes) {
          // Prayer is currently active — focus stays on this prayer
          return {
            name: prayer.name, nameAr: PRAYER_NAMES_AR[prayer.name],
            time: prayer.time, time12hr: formatTo12Hr(prayer.time),
            secondsUntil: 0, minutesUntil: 0,
            hoursUntil: 0, minsRemaining: 0,
            allPassed: false, isActive: true,
            iqamaTime: iqamaTime, iqamaTime12hr: formatTo12Hr(iqamaTime),
            iqamaMinutesUntil: iqamaMinutes - nowMinutes,
          };
        }
      }
    }
  }

  for (const prayer of prayers) {
    const prayerMinutes = timeToMinutes(prayer.time);
    if (prayerMinutes > nowMinutes) {
      const diffMinutes = prayerMinutes - nowMinutes;
      const result = {
        name: prayer.name, nameAr: PRAYER_NAMES_AR[prayer.name],
        time: prayer.time, time12hr: formatTo12Hr(prayer.time),
        secondsUntil: diffMinutes * 60, minutesUntil: diffMinutes,
        hoursUntil: Math.floor(diffMinutes / 60), minsRemaining: diffMinutes % 60,
        allPassed: false, isActive: false,
      };
      if (iqamaTimes && iqamaTimes[prayer.key]) {
        result.iqamaTime = iqamaTimes[prayer.key];
        result.iqamaTime12hr = formatTo12Hr(iqamaTimes[prayer.key]);
      }
      return result;
    }
  }

  const midnightMinutes = 1440;
  const fajrMinutes = timeToMinutes(times.fajr);
  const diffMinutes = (midnightMinutes - nowMinutes) + fajrMinutes;
  const result = {
    name: 'Fajr', nameAr: PRAYER_NAMES_AR['Fajr'], time: times.fajr, time12hr: formatTo12Hr(times.fajr),
    secondsUntil: diffMinutes * 60, minutesUntil: diffMinutes,
    hoursUntil: Math.floor(diffMinutes / 60), minsRemaining: diffMinutes % 60,
    allPassed: true, isActive: false,
  };
  if (iqamaTimes && iqamaTimes.fajr) {
    result.iqamaTime = iqamaTimes.fajr;
    result.iqamaTime12hr = formatTo12Hr(iqamaTimes.fajr);
  }
  return result;
}

function formatCountdown(secondsUntil) {
  const totalMins = Math.floor(secondsUntil / 60);
  if (totalMins < 1) return '< 1m';
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatCountdownSpeech(secondsUntil) {
  const totalMins = Math.floor(secondsUntil / 60);
  if (totalMins < 1) return 'less than 1 minute';
  if (totalMins === 1) return '1 minute';
  if (totalMins < 60) return `${totalMins} minutes`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const hWord = h === 1 ? '1 hour' : `${h} hours`;
  if (m === 0) return hWord;
  const mWord = m === 1 ? '1 minute' : `${m} minutes`;
  return `${hWord} and ${mWord}`;
}

function getCountdownUrgency(minutesUntil) {
  if (minutesUntil <= 1) return 'urgent';
  if (minutesUntil <= 10) return 'warning';
  return 'normal';
}

/**
 * Get prayer statuses considering iqama times.
 * A prayer between adhan and iqama is 'active' (not 'past').
 * @param {object} times - prayer times in 24hr "HH:MM"
 * @param {string} timezone
 * @param {object} [iqamaTimes] - optional iqama times in 24hr "HH:MM"
 */
function getPrayerStatuses(times, timezone, iqamaTimes) {
  const nowMinutes = timeToMinutes(getCurrentTimeStr(timezone));
  const next = getNextPrayer(times, timezone, iqamaTimes);
  const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const result = {};
  let foundNext = false;

  const displayNames = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Eaisha' };
  for (const key of prayers) {
    const pMinutes = timeToMinutes(times[key]);
    const name = displayNames[key];

    // Check if this prayer is currently active (between adhan and iqama)
    if (iqamaTimes && iqamaTimes[key]) {
      const iqamaMinutes = timeToMinutes(iqamaTimes[key]);
      if (nowMinutes >= pMinutes && nowMinutes <= iqamaMinutes) {
        result[key] = 'active';
        foundNext = true;
        continue;
      }
    }

    if (name === next.name && !next.allPassed) {
      result[key] = 'next';
      foundNext = true;
    } else if (pMinutes < nowMinutes && !foundNext) {
      result[key] = 'past';
    } else {
      result[key] = foundNext ? 'upcoming' : 'past';
    }
  }
  if (next.allPassed) {
    prayers.forEach(k => {
      // Don't overwrite 'active' status
      if (result[k] !== 'active') result[k] = 'past';
    });
    if (result['fajr'] !== 'active') result['fajr'] = 'next';
  }
  return result;
}

module.exports = {
  timeToMinutes, addMinutesToTime, addOneHour, subtractOneHour, formatTo12Hr,
  getCurrentTimeStr, getNextPrayer, formatCountdown, formatCountdownSpeech, getCountdownUrgency, getPrayerStatuses,
  PRAYER_NAMES, PRAYER_NAMES_AR,
};
