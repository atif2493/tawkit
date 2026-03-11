/**
 * aplBuilder.js
 * Builds the APL datasource and RenderDocument directive for Echo Show.
 * Uses inline APL document when provided (bundled in lambda/apl/).
 */

const path = require('path');
const fs = require('fs');
const { getNextPrayer, formatTo12Hr, formatCountdown, getCountdownUrgency, getPrayerStatuses } = require('./countdownService');

const COLORS = {
  background: '#0D1B2A', gold: '#D4AF37', white: '#FFFFFF', dimmed: '#4A4A4A',
  amber: '#FFA500', red: '#FF4444', hadithText: '#E8E8E8', accent: '#4ECDC4',
  cardBg: '#1A2A3A', nextHighlight: '#2A3F54',
};

let _cachedAplDocument = null;

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

function buildDatasource(prayerTimes, timezone) {
  const next = getNextPrayer(prayerTimes, timezone);
  const statuses = getPrayerStatuses(prayerTimes, timezone);
  const urgency = getCountdownUrgency(next.minutesUntil);
  const countdownColor = { normal: COLORS.white, warning: COLORS.amber, urgent: COLORS.red }[urgency];

  return {
    type: 'object',
    properties: {
      appName: 'تـوقيت',
      cityName: prayerTimes.city,
      madhab: prayerTimes.madhab || 'Hanafi',
      hijriDate: prayerTimes.hijri?.formattedAr || '',
      hijriDateEn: prayerTimes.hijri?.formatted || '',
      gregorianDate: prayerTimes.gregorian?.formatted || '',
      prayers: [
        { key: 'fajr', nameAr: 'الفجر', nameEn: 'Fajr', time: formatTo12Hr(prayerTimes.fajr), time24: prayerTimes.fajr, status: statuses.fajr, isNext: statuses.fajr === 'next' },
        { key: 'dhuhr', nameAr: 'الظهر', nameEn: 'Dhuhr', time: formatTo12Hr(prayerTimes.dhuhr), time24: prayerTimes.dhuhr, status: statuses.dhuhr, isNext: statuses.dhuhr === 'next' },
        { key: 'asr', nameAr: 'العصر', nameEn: 'Asr', time: formatTo12Hr(prayerTimes.asr), time24: prayerTimes.asr, status: statuses.asr, isNext: statuses.asr === 'next', note: '(حنفي)' },
        { key: 'maghrib', nameAr: 'المغرب', nameEn: 'Maghrib', time: formatTo12Hr(prayerTimes.maghrib), time24: prayerTimes.maghrib, status: statuses.maghrib, isNext: statuses.maghrib === 'next' },
        { key: 'isha', nameAr: 'العشاء', nameEn: 'Isha', time: formatTo12Hr(prayerTimes.isha), time24: prayerTimes.isha, status: statuses.isha, isNext: statuses.isha === 'next' },
      ],
      nextPrayer: {
        nameAr: next.nameAr, nameEn: next.name, time: next.time12hr,
        countdown: formatCountdown(next.secondsUntil), secondsUntil: next.secondsUntil, minutesUntil: next.minutesUntil,
        countdownColor, urgency, isTomorrow: next.allPassed,
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
    token: 'tawkitMainScreen',
    datasources: { tawkitData: datasource },
  };

  if (document) {
    directive.document = document;
  } else {
    directive.document = { type: 'Link', src: 'doc://alexa/apl/documents/tawkitMainScreen' };
  }
  return directive;
}

function buildSpeechText(prayerTimes, timezone) {
  if (prayerTimes.error) {
    return "I'm sorry, I couldn't fetch prayer times right now. Please check your internet connection.";
  }
  const next = getNextPrayer(prayerTimes, timezone);
  const countdown = formatCountdown(next.secondsUntil);
  return `Prayer times for ${prayerTimes.city}. Fajr at ${formatTo12Hr(prayerTimes.fajr)}, Dhuhr at ${formatTo12Hr(prayerTimes.dhuhr)}, Asr at ${formatTo12Hr(prayerTimes.asr)}, Maghrib at ${formatTo12Hr(prayerTimes.maghrib)}, Isha at ${formatTo12Hr(prayerTimes.isha)}. Next prayer is ${next.name} in ${countdown}.`;
}

module.exports = { buildDatasource, buildAplDirective, buildSpeechText, loadAplDocument, COLORS };
