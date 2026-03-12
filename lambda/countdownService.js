/**
 * countdownService.js
 * Prayer time utilities and next-prayer countdown logic.
 * Time utilities ported from Tawkit v9.61 (m2body.js).
 */

const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const PRAYER_NAMES_AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };

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

function getNextPrayer(times, timezone) {
  const nowStr = getCurrentTimeStr(timezone);
  const nowMinutes = timeToMinutes(nowStr);
  const prayers = [
    { name: 'Fajr', time: times.fajr }, { name: 'Dhuhr', time: times.dhuhr },
    { name: 'Asr', time: times.asr }, { name: 'Maghrib', time: times.maghrib },
    { name: 'Isha', time: times.isha },
  ];

  for (const prayer of prayers) {
    const prayerMinutes = timeToMinutes(prayer.time);
    if (prayerMinutes > nowMinutes) {
      const diffMinutes = prayerMinutes - nowMinutes;
      return {
        name: prayer.name, nameAr: PRAYER_NAMES_AR[prayer.name],
        time: prayer.time, time12hr: formatTo12Hr(prayer.time),
        secondsUntil: diffMinutes * 60, minutesUntil: diffMinutes,
        hoursUntil: Math.floor(diffMinutes / 60), minsRemaining: diffMinutes % 60,
        allPassed: false,
      };
    }
  }

  const midnightMinutes = 1440;
  const fajrMinutes = timeToMinutes(times.fajr);
  const diffMinutes = (midnightMinutes - nowMinutes) + fajrMinutes;
  return {
    name: 'Fajr', nameAr: PRAYER_NAMES_AR['Fajr'], time: times.fajr, time12hr: formatTo12Hr(times.fajr),
    secondsUntil: diffMinutes * 60, minutesUntil: diffMinutes,
    hoursUntil: Math.floor(diffMinutes / 60), minsRemaining: diffMinutes % 60,
    allPassed: true,
  };
}

function formatCountdown(secondsUntil) {
  const totalMins = Math.floor(secondsUntil / 60);
  if (totalMins < 1) return '< 1m';
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getCountdownUrgency(minutesUntil) {
  if (minutesUntil <= 1) return 'urgent';
  if (minutesUntil <= 10) return 'warning';
  return 'normal';
}

function getPrayerStatuses(times, timezone) {
  const nowMinutes = timeToMinutes(getCurrentTimeStr(timezone));
  const next = getNextPrayer(times, timezone);
  const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const result = {};
  let foundNext = false;

  for (const key of prayers) {
    const pMinutes = timeToMinutes(times[key]);
    const name = key.charAt(0).toUpperCase() + key.slice(1);
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
    prayers.forEach(k => result[k] = 'past');
    result['fajr'] = 'next';
  }
  return result;
}

module.exports = {
  timeToMinutes, addMinutesToTime, addOneHour, subtractOneHour, formatTo12Hr,
  getCurrentTimeStr, getNextPrayer, formatCountdown, getCountdownUrgency, getPrayerStatuses,
  PRAYER_NAMES, PRAYER_NAMES_AR,
};
