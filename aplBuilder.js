/**
 * aplBuilder.js
 * Builds the APL datasource and document directive for Echo Show.
 *
 * Visual design reference: Tawkit v9.61 style1.css + index.html
 * Color palette from FDD.md (tawkit-inspired dark theme)
 */

const { getNextPrayer, formatTo12Hr, formatCountdown, getCountdownUrgency, getPrayerStatuses } = require('./countdownService');

// ─── COLOR CONSTANTS (from FDD — Tawkit-inspired palette) ─────────────────────
const COLORS = {
  background:      '#0D1B2A',   // deep navy
  gold:            '#D4AF37',   // prayer time gold
  white:           '#FFFFFF',   // next prayer highlight
  dimmed:          '#4A4A4A',   // past prayers
  amber:           '#FFA500',   // countdown warning < 10m
  red:             '#FF4444',   // countdown urgent < 1m
  hadithText:      '#E8E8E8',   // soft white
  accent:          '#4ECDC4',   // teal header
  cardBg:          '#1A2A3A',   // slightly lighter card background
  nextHighlight:   '#2A3F54',   // highlight box for next prayer
};

/**
 * Build the full APL datasource payload
 * This is the data that drives the APL template
 */
function buildDatasource(prayerTimes, timezone) {
  const next     = getNextPrayer(prayerTimes, timezone);
  const statuses = getPrayerStatuses(prayerTimes, timezone);
  const urgency  = getCountdownUrgency(next.minutesUntil);

  const countdownColor = {
    normal:  COLORS.white,
    warning: COLORS.amber,
    urgent:  COLORS.red,
  }[urgency];

  return {
    type: 'object',
    properties: {
      // Header
      appName:      'تـوقيت',
      cityName:     prayerTimes.city,
      madhab:       prayerTimes.madhab,   // "Hanafi"

      // Dates
      hijriDate:    prayerTimes.hijri.formattedAr,   // "10 رمضان 1447"
      hijriDateEn:  prayerTimes.hijri.formatted,     // "10 Ramadan 1447"
      gregorianDate: prayerTimes.gregorian.formatted, // "Tuesday, 10 March 2026"

      // Prayer times grid (5 prayers)
      prayers: [
        {
          key:     'fajr',
          nameAr:  'الفجر',
          nameEn:  'Fajr',
          time:    formatTo12Hr(prayerTimes.fajr),
          time24:  prayerTimes.fajr,
          status:  statuses.fajr,  // 'past' | 'next' | 'upcoming'
          isNext:  statuses.fajr === 'next',
        },
        {
          key:     'dhuhr',
          nameAr:  'الظهر',
          nameEn:  'Dhuhr',
          time:    formatTo12Hr(prayerTimes.dhuhr),
          time24:  prayerTimes.dhuhr,
          status:  statuses.dhuhr,
          isNext:  statuses.dhuhr === 'next',
        },
        {
          key:     'asr',
          nameAr:  'العصر',
          nameEn:  'Asr',
          time:    formatTo12Hr(prayerTimes.asr),
          time24:  prayerTimes.asr,
          status:  statuses.asr,
          isNext:  statuses.asr === 'next',
          note:    '(حنفي)',  // Hanafi label on Asr
        },
        {
          key:     'maghrib',
          nameAr:  'المغرب',
          nameEn:  'Maghrib',
          time:    formatTo12Hr(prayerTimes.maghrib),
          time24:  prayerTimes.maghrib,
          status:  statuses.maghrib,
          isNext:  statuses.maghrib === 'next',
        },
        {
          key:     'isha',
          nameAr:  'العشاء',
          nameEn:  'Isha',
          time:    formatTo12Hr(prayerTimes.isha),
          time24:  prayerTimes.isha,
          status:  statuses.isha,
          isNext:  statuses.isha === 'next',
        },
      ],

      // Next prayer countdown
      nextPrayer: {
        nameAr:        next.nameAr,
        nameEn:        next.name,
        time:          next.time12hr,
        countdown:     formatCountdown(next.secondsUntil),
        secondsUntil:  next.secondsUntil,
        minutesUntil:  next.minutesUntil,
        countdownColor,
        urgency,
        isTomorrow:    next.allPassed,
      },

      // Colors for APL template
      colors: COLORS,

      // Error state
      hasError: !!prayerTimes.error,
      errorMsg:  prayerTimes.error || '',
    }
  };
}

/**
 * Build the APL RenderDocument directive for Alexa response
 * References the external APL document (apl/mainScreen.json)
 *
 * @param {object} datasource - from buildDatasource()
 * @param {object} content - current Hadith/verse from contentService
 * @returns {object} Alexa APL directive
 */
function buildAplDirective(datasource, content) {
  // Inject content into datasource
  datasource.properties.content = {
    text:  content.text,
    ref:   content.ref || '',
    type:  content.type,  // 'hadith' or 'verse'
  };

  return {
    type:     'Alexa.Presentation.APL.RenderDocument',
    token:    'tawkitMainScreen',
    document: {
      type:    'Link',
      src:     'doc://alexa/apl/documents/tawkitMainScreen',
    },
    datasources: {
      tawkitData: datasource,
    },
  };
}

/**
 * Build a simple speech response for voice interaction
 * Used when user says "Alexa, open Tawkit" or asks for prayer times
 *
 * @param {object} prayerTimes
 * @param {string} timezone
 * @returns {string} SSML speech text
 */
function buildSpeechText(prayerTimes, timezone) {
  if (prayerTimes.error) {
    return "I'm sorry, I couldn't fetch prayer times right now. Please check your internet connection.";
  }

  const next = getNextPrayer(prayerTimes, timezone);
  const countdown = formatCountdown(next.secondsUntil);

  return `Prayer times for ${prayerTimes.city}. ` +
    `Fajr at ${formatTo12Hr(prayerTimes.fajr)}, ` +
    `Dhuhr at ${formatTo12Hr(prayerTimes.dhuhr)}, ` +
    `Asr at ${formatTo12Hr(prayerTimes.asr)}, ` +
    `Maghrib at ${formatTo12Hr(prayerTimes.maghrib)}, ` +
    `Isha at ${formatTo12Hr(prayerTimes.isha)}. ` +
    `Next prayer is ${next.name} in ${countdown}.`;
}

module.exports = { buildDatasource, buildAplDirective, buildSpeechText, COLORS };
