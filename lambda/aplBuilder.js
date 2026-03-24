/**
 * aplBuilder.js
 * Builds the APL datasource and RenderDocument directive for Echo Show.
 * Uses inline APL document when provided (bundled in lambda/apl/).
 */

const path = require('path');
const fs = require('fs');
const { getNextPrayer, formatTo12Hr, formatCountdown, formatCountdownSpeech, getCountdownUrgency, getPrayerStatuses, addMinutesToTime, timeToMinutes } = require('./countdownService');
const { getRamadanContext } = require('./ramadanService');
const { getDhulHijjahContext } = require('./hajjService');

const COLORS = {
  background: '#0D1B2A', gold: '#D4AF37', white: '#FFFFFF', dimmed: '#4A4A4A',
  amber: '#FFA500', red: '#FF4444', hadithText: '#E8E8E8', accent: '#4ECDC4',
  cardBg: '#1A2A3A', nextHighlight: '#2A3F54',
};

let _cachedAplDocument = null;
let _cachedWidgetDocument = null;

/**
 * Load APL main screen document from lambda/apl/mainScreen.json (bundled with Lambda).
 */
function loadAplDocument() {
  if (_cachedAplDocument) return _cachedAplDocument;
  try {
    const docPath = path.join(__dirname, 'apl', 'mainScreen.json');
    _cachedAplDocument = JSON.parse(fs.readFileSync(docPath, 'utf8'));
    return _cachedAplDocument;
  } catch (err) {
    console.error('[aplBuilder] Failed to load mainScreen.json:', err.message);
    return null;
  }
}

/**
 * Load APL widget document from lambda/apl/widget.json (bundled with Lambda).
 */
function loadWidgetDocument() {
  if (_cachedWidgetDocument) return _cachedWidgetDocument;
  try {
    const docPath = path.join(__dirname, 'apl', 'widget.json');
    _cachedWidgetDocument = JSON.parse(fs.readFileSync(docPath, 'utf8'));
    return _cachedWidgetDocument;
  } catch (err) {
    console.error('[aplBuilder] Failed to load widget.json:', err.message);
    return null;
  }
}

function getMoonPhaseEmoji(hijriDay) {
  const day = parseInt(hijriDay) || 1;
  if (day <= 1)  return '🌑';
  if (day <= 4)  return '🌒';
  if (day <= 8)  return '🌓';
  if (day <= 12) return '🌔';
  if (day <= 16) return '🌕';
  if (day <= 20) return '🌖';
  if (day <= 23) return '🌗';
  if (day <= 27) return '🌘';
  return '🌑';
}

/**
 * Get iqama times. Fajr/Dhuhr/Asr/Isha are fixed times from env vars.
 * Maghrib MUST be a dynamic offset (minutes after sunset adhan), never a fixed clock time,
 * because sunset changes every day. IQAMA_MAGHRIB env var = minutes after adhan (default 5).
 * @param {object} prayerTimes - needed to compute Maghrib iqama from actual sunset time
 */
function getIqamaTimes(prayerTimes) {
  // Maghrib: offset in minutes after the actual prayer time (sunset varies daily)
  const maghribOffsetMins = parseInt(process.env.IQAMA_MAGHRIB || '10', 10);
  const maghribAdhan = prayerTimes && prayerTimes.maghrib ? prayerTimes.maghrib : null;
  const maghribIqama = maghribAdhan
    ? addMinutesToTime(maghribAdhan, maghribOffsetMins)
    : addMinutesToTime('19:30', maghribOffsetMins); // safe fallback (never shown if API is up)

  return {
    fajr:    process.env.IQAMA_FAJR  || '06:30',
    dhuhr:   process.env.IQAMA_DHUHR || '13:30',
    asr:     process.env.IQAMA_ASR   || '17:30',
    maghrib: maghribIqama,            // computed: adhan + offset minutes
    isha:    process.env.IQAMA_ISHA  || '21:15',
  };
}

function getJumuahTimes() {
  return {
    jumuah1: process.env.JUMUAH_1 || '12:15',
    jumuah2: process.env.JUMUAH_2 || '13:30',
  };
}

function buildDatasource(prayerTimes, timezone) {
  const iqama = getIqamaTimes(prayerTimes);
  const next = getNextPrayer(prayerTimes, timezone, iqama);
  const statuses = getPrayerStatuses(prayerTimes, timezone, iqama);
  const urgency = next.isActive ? 'urgent' : getCountdownUrgency(next.minutesUntil);
  const countdownColor = { normal: COLORS.white, warning: COLORS.amber, urgent: COLORS.red }[urgency];
  const jumuah = getJumuahTimes();
  const now = new Date();
  const dayOfWeek = parseInt(now.toLocaleString('en-US', { weekday: 'narrow', timeZone: timezone }), 10);
  const isFriday = now.toLocaleString('en-US', { weekday: 'long', timeZone: timezone }) === 'Friday';

  // Get full Ramadan context from ramadanService
  const ramadan = getRamadanContext(prayerTimes, timezone);

  // Get Dhul Hijjah / Hajj context
  const dhulHijjah = getDhulHijjahContext(prayerTimes, timezone);

  return {
    type: 'object',
    properties: {
      appName: 'تـوقيت',
      cityName: prayerTimes.city,
      madhab: prayerTimes.madhab || 'Hanafi',
      hijriDate: prayerTimes.hijri?.formattedAr || '',
      hijriDateEn: prayerTimes.hijri?.formatted || '',
      gregorianDate: prayerTimes.gregorian?.formatted || '',
      currentTime: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }),
      moonPhase: getMoonPhaseEmoji(prayerTimes.hijri?.day),
      isRamadan: ramadan.isRamadan,
      ramadanDay: ramadan.hijriDay,
      ramadanText: ramadan.ramadanText,
      showEidCountdown: ramadan.showEidCountdown,
      eidCountdown: ramadan.eidCountdown,
      eidEstDate: ramadan.eidEstDate,
      // Dhul Hijjah / Hajj fields
      isDhulHijjah: dhulHijjah.isDhulHijjah,
      dhulHijjah: dhulHijjah,
      // Ramadan companion fields
      suhoor: ramadan.suhoor,
      iftar: ramadan.iftar,
      lastTenNights: ramadan.lastTenNights,
      zakat: ramadan.zakat,
      spiritualReminder: ramadan.spiritualReminder,
      prayers: [
        { key: 'fajr', nameAr: 'الفجر', nameEn: 'Fajr', time: formatTo12Hr(prayerTimes.fajr), iqama: formatTo12Hr(iqama.fajr), time24: prayerTimes.fajr, status: statuses.fajr, isNext: statuses.fajr === 'next' || statuses.fajr === 'active', isActive: statuses.fajr === 'active' },
        { key: 'dhuhr', nameAr: 'الظهر', nameEn: 'Dhuhr', time: formatTo12Hr(prayerTimes.dhuhr), iqama: formatTo12Hr(iqama.dhuhr), time24: prayerTimes.dhuhr, status: statuses.dhuhr, isNext: statuses.dhuhr === 'next' || statuses.dhuhr === 'active', isActive: statuses.dhuhr === 'active' },
        { key: 'asr', nameAr: 'العصر', nameEn: 'Asar', time: formatTo12Hr(prayerTimes.asr), iqama: formatTo12Hr(iqama.asr), time24: prayerTimes.asr, status: statuses.asr, isNext: statuses.asr === 'next' || statuses.asr === 'active', isActive: statuses.asr === 'active', note: '(حنفي)' },
        { key: 'maghrib', nameAr: 'المغرب', nameEn: 'Maghrib', time: formatTo12Hr(prayerTimes.maghrib), iqama: formatTo12Hr(iqama.maghrib), time24: prayerTimes.maghrib, status: statuses.maghrib, isNext: statuses.maghrib === 'next' || statuses.maghrib === 'active', isActive: statuses.maghrib === 'active' },
        { key: 'isha', nameAr: 'العشاء', nameEn: 'Eaisha', time: formatTo12Hr(prayerTimes.isha), iqama: formatTo12Hr(iqama.isha), time24: prayerTimes.isha, status: statuses.isha, isNext: statuses.isha === 'next' || statuses.isha === 'active', isActive: statuses.isha === 'active' },
      ],
      isFriday: isFriday,
      jumuah1: formatTo12Hr(jumuah.jumuah1),
      jumuah2: formatTo12Hr(jumuah.jumuah2),
      nextPrayer: {
        nameAr: next.nameAr, nameEn: next.name, time: next.time12hr,
        countdown: next.isActive ? 'NOW' : formatCountdown(next.secondsUntil),
        secondsUntil: next.secondsUntil, minutesUntil: next.minutesUntil,
        countdownColor, urgency, isTomorrow: next.allPassed,
        isActive: !!next.isActive,
        iqamaTime: next.iqamaTime12hr || '',
        iqamaMinutesUntil: next.iqamaMinutesUntil || 0,
      },
      colors: COLORS,
      hasError: !!prayerTimes.error,
      errorMsg: prayerTimes.error || '',
    }
  };
}

/**
 * Build APL RenderDocument directive.
 * @param {object} datasource - from buildDatasource()
 * @param {object} content - current Hadith/verse from contentService
 * @param {object} [aplDocument] - optional; if provided, sent inline (no skill-package APL needed)
 */
function buildAplDirective(datasource, content, aplDocument) {
  datasource.properties.content = { text: content.text, ref: content.ref || '', type: content.type || 'hadith' };

  const document = aplDocument || loadAplDocument();
  const directive = {
    type: 'Alexa.Presentation.APL.RenderDocument',
    token: 'myPrayerTimeMainScreen',
    datasources: { myPrayerTimeData: datasource },
  };

  if (document) {
    directive.document = document;
  } else {
    directive.document = { type: 'Link', src: 'doc://alexa/apl/documents/myPrayerTimeMainScreen' };
  }
  return directive;
}

/**
 * Build APL widget directive for Echo Show home screen widget.
 */
function buildWidgetDirective(datasource) {
  const document = loadWidgetDocument();
  const directive = {
    type: 'Alexa.Presentation.APL.RenderDocument',
    token: 'myPrayerTimeWidget',
    datasources: { widgetData: datasource },
  };
  if (document) {
    directive.document = document;
  }
  return directive;
}

function buildSpeechText(prayerTimes, timezone) {
  if (prayerTimes.error) {
    return "I'm sorry, I couldn't fetch prayer times right now. Please check your internet connection.";
  }
  const iqama = getIqamaTimes(prayerTimes);
  const next = getNextPrayer(prayerTimes, timezone, iqama);
  const statuses = getPrayerStatuses(prayerTimes, timezone, iqama);
  const countdown = formatCountdownSpeech(next.secondsUntil);
  const ramadan = getRamadanContext(prayerTimes, timezone);

  // If a prayer is currently active (between adhan and iqama), announce it
  if (next.isActive) {
    let speech = `${next.name} prayer time has started. Iqama at your masjid is at ${next.iqamaTime12hr}.`;
    // During Ramadan at Maghrib — break your fast!
    if (ramadan.isRamadan && next.name === 'Maghrib') {
      speech += ' Break your fast! Bismillah.';
    }
    return speech;
  }

  // Ramadan-specific speech additions
  let ramadanSpeech = '';
  if (ramadan.isRamadan) {
    if (ramadan.suhoor.showBanner) {
      ramadanSpeech = ` Suhoor ends in ${formatCountdownSpeech(ramadan.suhoor.minutesLeft * 60)} at ${ramadan.suhoor.endTime12hr}. Remember your fasting intention.`;
    } else if (ramadan.iftar.showBanner) {
      ramadanSpeech = ` Iftar in ${formatCountdownSpeech(ramadan.iftar.minutesLeft * 60)} at ${ramadan.iftar.time12hr}.`;
    }
    if (ramadan.lastTenNights.isActive) {
      ramadanSpeech += ' Tonight is one of the last ten nights of Ramadan. Seek Laylat al-Qadr.';
    }
    if (ramadan.zakat.show) {
      ramadanSpeech += " Don't forget Zakat al-Fitr before Eid.";
    }
  }

  // Dhul Hijjah speech
  const dhulHijjah2 = getDhulHijjahContext(prayerTimes, timezone);
  let hajjSpeech = '';
  if (dhulHijjah2.isDhulHijjah) {
    if (dhulHijjah2.isEidAlAdha) {
      hajjSpeech = ' Eid al-Adha Mubarak!';
    } else if (dhulHijjah2.isArafah) {
      hajjSpeech = ' Today is the Day of Arafah. Fasting is highly recommended.';
    } else if (dhulHijjah2.isFirstTenDays) {
      hajjSpeech = ` ${dhulHijjah2.firstTenText}. Increase your good deeds.`;
    }
  }

  return `Next prayer is ${next.name} at ${next.time12hr}, in ${countdown}.${ramadanSpeech}${hajjSpeech}`;
}

module.exports = { buildDatasource, buildAplDirective, buildWidgetDirective, buildSpeechText, loadAplDocument, loadWidgetDocument, COLORS };
