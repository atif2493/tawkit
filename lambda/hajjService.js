/**
 * hajjService.js
 * Dhul Hijjah companion logic — First 10 days, Hajj countdown,
 * Day of Arafah, Eid al-Adha banners.
 */

/**
 * Main entry point — get full Dhul Hijjah context.
 * @param {object} prayerTimes — { hijri: { day, month } }
 * @param {string} timezone
 */
function getDhulHijjahContext(prayerTimes, timezone) {
  const hijriDay = parseInt(prayerTimes.hijri?.day || '0');
  const hijriMonth = (prayerTimes.hijri?.month || '').toLowerCase();
  const isDhulHijjah = hijriMonth === 'dhul hijjah' || hijriMonth === 'dhū al-ḥijjah' || hijriMonth === 'dhu al-hijjah' || hijriMonth === 'dhul-hijjah';

  if (!isDhulHijjah) {
    return {
      isDhulHijjah: false,
      hijriDay: 0,
      isFirstTenDays: false,
      firstTenText: '',
      daysToHajj: 0,
      hajjCountdown: '',
      isHajjDay: false,
      isArafah: false,
      isEidAlAdha: false,
      isTashreeq: false,
      bannerText: '',
    };
  }

  const isFirstTenDays = hijriDay >= 1 && hijriDay <= 10;
  const daysToHajj = hijriDay < 8 ? 8 - hijriDay : 0;
  const isHajjDay = hijriDay >= 8 && hijriDay <= 10;
  const isArafah = hijriDay === 9;
  const isEidAlAdha = hijriDay === 10;
  const isTashreeq = hijriDay >= 11 && hijriDay <= 13;

  // Hajj countdown text
  let hajjCountdown = '';
  if (daysToHajj > 0) {
    hajjCountdown = `Hajj begins in ${daysToHajj} day${daysToHajj !== 1 ? 's' : ''}`;
  } else if (isHajjDay) {
    hajjCountdown = 'Hajj is in progress';
  }

  // First 10 days text
  let firstTenText = '';
  if (isFirstTenDays) {
    firstTenText = `Day ${hijriDay} of Best 10 Days`;
  }

  // Main banner text
  let bannerText = '';
  if (isEidAlAdha) {
    bannerText = 'Eid al-Adha Mubarak!';
  } else if (isArafah) {
    bannerText = 'Day of Arafah — Fasting Recommended';
  } else if (isHajjDay) {
    bannerText = `Hajj Day ${hijriDay - 7} of 3`;
  } else if (isTashreeq) {
    bannerText = `Days of Tashreeq — Day ${hijriDay - 10} of 3`;
  } else if (isFirstTenDays) {
    bannerText = 'Best 10 Days of the Year — Increase Good Deeds';
  }

  // Eid al-Adha countdown (before day 10)
  let eidAdhaCountdown = '';
  if (hijriDay < 10) {
    const daysToEid = 10 - hijriDay;
    eidAdhaCountdown = `Eid al-Adha in ${daysToEid} day${daysToEid !== 1 ? 's' : ''}`;
  }

  return {
    isDhulHijjah: true,
    hijriDay,
    isFirstTenDays,
    firstTenText,
    daysToHajj,
    hajjCountdown,
    isHajjDay,
    isArafah,
    isEidAlAdha,
    isTashreeq,
    bannerText,
    eidAdhaCountdown,
  };
}

module.exports = { getDhulHijjahContext };
