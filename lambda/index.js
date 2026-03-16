/**
 * index.js — My Prayer Time Alexa Skill
 * Main Lambda handler. Handles LaunchRequest, PrayerTimesIntent, NextPrayerIntent,
 * EventBridge (prayer time + midnight reset), Help/Stop/Cancel, SessionEnded, Error.
 */

const Alexa = require('ask-sdk');
const { getPrayerTimes } = require('./prayerService');
const { getCurrentContent } = require('./contentService');
const { buildDatasource, buildAplDirective, buildWidgetDirective, buildSpeechText, loadAplDocument } = require('./aplBuilder');
const { CONFIG } = require('./prayerService');
const { setPrayerReminders, setRamadanReminders, getDeviceAddressRaw } = require('./reminderService');
const { getRamadanContext } = require('./ramadanService');
const { timeToMinutes, getCurrentTimeStr } = require('./countdownService');

// Track which prayer's adhan has been played (per Lambda warm instance)
let _lastAdhanPlayed = '';
let _adhanPlayingUntil = 0; // timestamp (ms) — suppress PINGs while adhan is playing
let _playIftarDuaNext = false; // flag to queue iftar dua after Maghrib adhan

const ADHAN_DURATION_MS = 300000; // 5 minutes — covers Fajr adhan (4:02) + buffer

const S3_BUCKET = process.env.S3_BUCKET || 'my-prayer-time-content-357977905088';
const S3_REGION = 'us-east-1';
const ADHAN_NORMAL_URL = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/audio/adhan.mp3`;
const ADHAN_FAJR_URL = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/audio/adhan-fajr.mp3`;
const IFTAR_DUA_URL = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/audio/iftar-dua-2.mp3`;

/**
 * Check if it's time to play adhan. Returns { shouldPlay, prayerName, isFajr } or null.
 * Triggers within a 1-minute window of the prayer time.
 */
function checkAdhanTime(prayerTimes, timezone) {
  const nowMinutes = timeToMinutes(getCurrentTimeStr(timezone));
  const prayers = [
    { name: 'Fajr', time: prayerTimes.fajr, isFajr: true },
    { name: 'Dhuhr', time: prayerTimes.dhuhr, isFajr: false },
    { name: 'Asar', time: prayerTimes.asr, isFajr: false },
    { name: 'Maghrib', time: prayerTimes.maghrib, isFajr: false },
    { name: 'Eaisha', time: prayerTimes.isha, isFajr: false },
  ];

  for (const prayer of prayers) {
    const prayerMinutes = timeToMinutes(prayer.time);
    // Within 1 minute window (PING fires every 15s so we'll catch it)
    const diff = nowMinutes - prayerMinutes;
    if (diff >= 0 && diff < 1) {
      // Check if we already played this prayer's adhan
      const key = `${prayer.name}-${prayer.time}`;
      if (_lastAdhanPlayed !== key) {
        _lastAdhanPlayed = key;
        return { shouldPlay: true, prayerName: prayer.name, isFajr: prayer.isFajr };
      }
    }
  }
  return { shouldPlay: false };
}

/**
 * Check if adhan is currently playing (suppress PING re-renders during playback).
 */
function isAdhanPlaying() {
  return Date.now() < _adhanPlayingUntil;
}

function supportsAPL(handlerInput) {
  const interfaces = Alexa.getSupportedInterfaces(handlerInput.requestEnvelope);
  return !!interfaces['Alexa.Presentation.APL'];
}

// US state abbreviation → IANA timezone (most common timezone per state)
const US_STATE_TIMEZONES = {
  'AL': 'America/Chicago', 'AK': 'America/Anchorage', 'AZ': 'America/Phoenix',
  'AR': 'America/Chicago', 'CA': 'America/Los_Angeles', 'CO': 'America/Denver',
  'CT': 'America/New_York', 'DE': 'America/New_York', 'FL': 'America/New_York',
  'GA': 'America/New_York', 'HI': 'Pacific/Honolulu', 'ID': 'America/Boise',
  'IL': 'America/Chicago', 'IN': 'America/Indiana/Indianapolis', 'IA': 'America/Chicago',
  'KS': 'America/Chicago', 'KY': 'America/New_York', 'LA': 'America/Chicago',
  'ME': 'America/New_York', 'MD': 'America/New_York', 'MA': 'America/New_York',
  'MI': 'America/Detroit', 'MN': 'America/Chicago', 'MS': 'America/Chicago',
  'MO': 'America/Chicago', 'MT': 'America/Denver', 'NE': 'America/Chicago',
  'NV': 'America/Los_Angeles', 'NH': 'America/New_York', 'NJ': 'America/New_York',
  'NM': 'America/Denver', 'NY': 'America/New_York', 'NC': 'America/New_York',
  'ND': 'America/Chicago', 'OH': 'America/New_York', 'OK': 'America/Chicago',
  'OR': 'America/Los_Angeles', 'PA': 'America/New_York', 'RI': 'America/New_York',
  'SC': 'America/New_York', 'SD': 'America/Chicago', 'TN': 'America/Chicago',
  'TX': 'America/Chicago', 'UT': 'America/Denver', 'VT': 'America/New_York',
  'VA': 'America/New_York', 'WA': 'America/Los_Angeles', 'WV': 'America/New_York',
  'WI': 'America/Chicago', 'WY': 'America/Denver', 'DC': 'America/New_York',
};

/**
 * Extract location from device address for prayer time lookup.
 * Returns { city, state, country, timezone } or null if unavailable.
 */
async function getDeviceLocation(handlerInput) {
  try {
    const address = await getDeviceAddressRaw(handlerInput);
    if (!address || !address.city) return null;

    const city = address.city;
    const state = address.stateOrRegion || '';
    const country = address.countryCode || 'US';
    // Look up timezone from state (US) or fall back to env var default
    const timezone = (country === 'US' && state && US_STATE_TIMEZONES[state.toUpperCase()])
      ? US_STATE_TIMEZONES[state.toUpperCase()]
      : CONFIG.timezone;

    console.log(`[index] Device location: ${city}, ${state}, ${country} → timezone: ${timezone}`);
    return { city, state, country, timezone };
  } catch (err) {
    console.warn('[index] Could not resolve device location:', err.message);
    return null;
  }
}

// Cache device location per Lambda warm instance (address doesn't change often)
let _deviceLocation = null;
let _deviceLocationFetched = false;

async function buildPrayerTimesResponse(handlerInput) {
  // Get device location on first invocation, cache for subsequent PINGs
  if (!_deviceLocationFetched) {
    _deviceLocation = await getDeviceLocation(handlerInput);
    _deviceLocationFetched = true;
  }

  const timezone = _deviceLocation ? _deviceLocation.timezone : CONFIG.timezone;
  const prayerTimes = await getPrayerTimes(false, _deviceLocation);
  const content = getCurrentContent(timezone);
  const datasource = buildDatasource(prayerTimes, timezone);
  const speechText = buildSpeechText(prayerTimes, timezone);
  const aplDocument = loadAplDocument();

  // Set prayer reminders (non-blocking — don't fail the response if reminders fail)
  try {
    const reminderResult = await setPrayerReminders(handlerInput, prayerTimes, timezone);
    if (reminderResult.success) {
      console.log(`[index] Set ${reminderResult.count} reminders (travel: ${reminderResult.travelMinutes}min)`);
    } else {
      console.log(`[index] Reminders skipped: ${reminderResult.reason}`);
    }

    // Set Ramadan reminders if in Ramadan
    const ramadanContext = getRamadanContext(prayerTimes, timezone);
    if (ramadanContext.isRamadan) {
      const ramadanResult = await setRamadanReminders(handlerInput, prayerTimes, timezone, ramadanContext);
      if (ramadanResult.success) {
        console.log(`[index] Set ${ramadanResult.count} Ramadan reminders`);
      }
    }
  } catch (err) {
    console.warn('[index] Reminder setup failed (non-fatal):', err.message);
  }

  // If device location not available, add setup instructions to speech (first launch only)
  let finalSpeech = speechText;
  if (!_deviceLocation) {
    finalSpeech += ' Note: I\'m showing prayer times for the default location, ' + CONFIG.city + '. To get prayer times for your area, please grant Device Address permission in the Alexa app under My Prayer Time skill settings, and make sure your home address is set.';
  }

  const response = handlerInput.responseBuilder.speak(finalSpeech);
  if (supportsAPL(handlerInput)) {
    response.addDirective(buildAplDirective(datasource, content, aplDocument));
  }

  // Show setup card if location permission not granted, otherwise show prayer times card
  if (!_deviceLocation) {
    response.withAskForPermissionsConsentCard(['read::alexa:device:all:address']);
  } else {
    response.withSimpleCard('My Prayer Time', `Next: ${datasource.properties.nextPrayer.nameEn} at ${datasource.properties.nextPrayer.time} (${datasource.properties.nextPrayer.countdown})\n\nFajr: ${datasource.properties.prayers[0].time}\nDhuhr: ${datasource.properties.prayers[1].time}\nAsr: ${datasource.properties.prayers[2].time}\nMaghrib: ${datasource.properties.prayers[3].time}\nEaisha: ${datasource.properties.prayers[4].time}`);
  }

  // Keep session open — reprompt keeps Alexa listening, tick handler resets the timeout
  response.reprompt(' ');
  response.withShouldEndSession(false);
  return response.getResponse();
}

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    return buildPrayerTimesResponse(handlerInput);
  },
};

const PrayerTimesIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'PrayerTimesIntent';
  },
  async handle(handlerInput) {
    return buildPrayerTimesResponse(handlerInput);
  },
};

const NextPrayerIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'NextPrayerIntent';
  },
  async handle(handlerInput) {
    if (!_deviceLocationFetched) {
      _deviceLocation = await getDeviceLocation(handlerInput);
      _deviceLocationFetched = true;
    }
    const timezone = _deviceLocation ? _deviceLocation.timezone : CONFIG.timezone;
    const prayerTimes = await getPrayerTimes(false, _deviceLocation);
    const { getNextPrayer, formatCountdown, formatTo12Hr } = require('./countdownService');
    if (prayerTimes.error) {
      return handlerInput.responseBuilder.speak("I'm sorry, I couldn't get prayer times right now.").getResponse();
    }
    const next = getNextPrayer(prayerTimes, timezone);
    const speech = `The next prayer is ${next.name} at ${next.time12hr}, in ${formatCountdown(next.secondsUntil)}.`;
    return handlerInput.responseBuilder.speak(speech).reprompt('Ask me another question.').withShouldEndSession(false).getResponse();
  },
};

const EidCountdownIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'EidCountdownIntent';
  },
  async handle(handlerInput) {
    if (!_deviceLocationFetched) {
      _deviceLocation = await getDeviceLocation(handlerInput);
      _deviceLocationFetched = true;
    }
    const timezone = _deviceLocation ? _deviceLocation.timezone : CONFIG.timezone;
    const prayerTimes = await getPrayerTimes(false, _deviceLocation);
    const ramadan = getRamadanContext(prayerTimes, timezone);

    let speech;
    if (ramadan.isRamadan) {
      const daysLeft = 30 - parseInt(ramadan.hijriDay);
      if (daysLeft <= 0) {
        speech = `Today is the last day of Ramadan! Eid al-Fitr is tomorrow inshaAllah. Eid Mubarak!`;
      } else if (daysLeft === 1) {
        speech = `There is 1 day left in Ramadan. Eid al-Fitr is in about 2 days, estimated around ${ramadan.eidEstDate}. Make the most of these last moments!`;
      } else {
        speech = `Today is day ${ramadan.hijriDay} of Ramadan. There are about ${daysLeft} days left. ${ramadan.eidCountdown}, estimated around ${ramadan.eidEstDate}.`;
      }
    } else {
      speech = `We are not currently in Ramadan. The next Eid will come when Ramadan begins again inshaAllah.`;
    }
    return handlerInput.responseBuilder.speak(speech).reprompt('Ask me another question.').withShouldEndSession(false).getResponse();
  },
};

const IftarTimeIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'IftarTimeIntent';
  },
  async handle(handlerInput) {
    if (!_deviceLocationFetched) {
      _deviceLocation = await getDeviceLocation(handlerInput);
      _deviceLocationFetched = true;
    }
    const timezone = _deviceLocation ? _deviceLocation.timezone : CONFIG.timezone;
    const prayerTimes = await getPrayerTimes(false, _deviceLocation);
    const { formatTo12Hr } = require('./countdownService');
    const ramadan = getRamadanContext(prayerTimes, timezone);

    const maghribTime = formatTo12Hr(prayerTimes.maghrib);
    let speech;
    if (ramadan.isRamadan && ramadan.iftar.showBanner) {
      speech = `Iftar is at ${maghribTime}, in ${ramadan.iftar.countdown}. Almost time to break your fast!`;
    } else if (ramadan.isRamadan) {
      speech = `Maghrib and iftar time today is at ${maghribTime}.`;
    } else {
      speech = `Maghrib prayer is at ${maghribTime}.`;
    }
    return handlerInput.responseBuilder.speak(speech).reprompt('Ask me another question.').withShouldEndSession(false).getResponse();
  },
};

const SuhoorTimeIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'SuhoorTimeIntent';
  },
  async handle(handlerInput) {
    if (!_deviceLocationFetched) {
      _deviceLocation = await getDeviceLocation(handlerInput);
      _deviceLocationFetched = true;
    }
    const timezone = _deviceLocation ? _deviceLocation.timezone : CONFIG.timezone;
    const prayerTimes = await getPrayerTimes(false, _deviceLocation);
    const { formatTo12Hr } = require('./countdownService');
    const ramadan = getRamadanContext(prayerTimes, timezone);

    const fajrTime = formatTo12Hr(prayerTimes.fajr);
    let speech;
    if (ramadan.isRamadan && ramadan.suhoor.showBanner) {
      speech = `Suhoor ends at ${fajrTime}, in ${ramadan.suhoor.countdown}. Make sure to eat and drink before Fajr!`;
    } else if (ramadan.isRamadan) {
      speech = `Fajr is at ${fajrTime}. Suhoor must be completed before Fajr time.`;
    } else {
      speech = `Fajr prayer is at ${fajrTime}.`;
    }
    return handlerInput.responseBuilder.speak(speech).reprompt('Ask me another question.').withShouldEndSession(false).getResponse();
  },
};

const HijriDateIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'HijriDateIntent';
  },
  async handle(handlerInput) {
    if (!_deviceLocationFetched) {
      _deviceLocation = await getDeviceLocation(handlerInput);
      _deviceLocationFetched = true;
    }
    const timezone = _deviceLocation ? _deviceLocation.timezone : CONFIG.timezone;
    const prayerTimes = await getPrayerTimes(false, _deviceLocation);
    const ramadan = getRamadanContext(prayerTimes, timezone);

    const hijriDate = prayerTimes.hijri?.formatted || 'unknown';
    let speech = `Today's Islamic date is ${hijriDate}.`;
    if (ramadan.isRamadan) {
      speech += ` It is day ${ramadan.hijriDay} of Ramadan.`;
    }
    return handlerInput.responseBuilder.speak(speech).reprompt('Ask me another question.').withShouldEndSession(false).getResponse();
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const city = _deviceLocation ? _deviceLocation.city : CONFIG.city;
    const speech = 'My Prayer Time shows prayer times for ' + city + '. You can ask: show prayer times, what is the next prayer, when is iftar, when is suhoor, how many days to Eid, or what is the hijri date.';
    return handlerInput.responseBuilder.speak(speech).getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent' ||
       Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.speak('').getResponse();
  },
};

const UserEventPingHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) === 'Alexa.Presentation.APL.UserEvent') {
      const args = handlerInput.requestEnvelope.request.arguments || [];
      return args[0] === 'PING';
    }
    return false;
  },
  async handle(handlerInput) {
    const timezone = _deviceLocation ? _deviceLocation.timezone : CONFIG.timezone;
    const prayerTimes = await getPrayerTimes(false, _deviceLocation);
    const response = handlerInput.responseBuilder;

    // If adhan is currently playing, do NOT re-render APL or speak — just keep session alive
    if (isAdhanPlaying()) {
      console.log('[index] PING — adhan playing, suppressing re-render');
      response.reprompt(' ');
      response.withShouldEndSession(false);
      return response.getResponse();
    }

    console.log('[index] PING keep-alive received — re-rendering APL');
    const content = getCurrentContent(timezone);
    const datasource = buildDatasource(prayerTimes, timezone);
    const aplDocument = loadAplDocument();

    if (supportsAPL(handlerInput)) {
      response.addDirective(buildAplDirective(datasource, content, aplDocument));
    }

    // Check if it's adhan time — play adhan audio via AudioPlayer
    const adhan = checkAdhanTime(prayerTimes, timezone);
    if (adhan.shouldPlay) {
      console.log(`[index] ADHAN TIME — Playing adhan for ${adhan.prayerName}`);
      const adhanUrl = adhan.isFajr ? ADHAN_FAJR_URL : ADHAN_NORMAL_URL;
      // Set cooldown so subsequent PINGs don't interrupt the adhan
      _adhanPlayingUntil = Date.now() + ADHAN_DURATION_MS;

      // Play adhan via SSML <audio> — keeps APL screen visible and session alive
      const ramadan = getRamadanContext(prayerTimes, timezone);
      const isIftarAdhan = (adhan.prayerName === 'Maghrib' && ramadan.isRamadan);

      let ssml = `<speak><audio src="${adhanUrl}" />`;
      if (isIftarAdhan) {
        console.log('[index] Will play iftar dua after Maghrib adhan');
        ssml += `<break time="2s"/><audio src="${IFTAR_DUA_URL}" />`;
      }
      ssml += '</speak>';
      response.speak(ssml);
    }

    response.reprompt(' ');
    response.withShouldEndSession(false);
    return response.getResponse();
  },
};

// AudioPlayer event handlers (required when AUDIO_PLAYER interface is enabled)
const AudioPlayerHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope).startsWith('AudioPlayer.');
  },
  handle(handlerInput) {
    const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
    console.log(`[index] AudioPlayer event: ${requestType}`);

    if (requestType === 'AudioPlayer.PlaybackFinished') {
      _adhanPlayingUntil = 0;
      console.log('[index] Audio playback finished — cooldown cleared');
    }

    return handlerInput.responseBuilder.getResponse();
  },
};

// PlaybackController events (pause/play buttons)
const PlaybackControllerHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope).startsWith('PlaybackController.');
  },
  handle(handlerInput) {
    // Stop adhan if user presses pause
    _adhanPlayingUntil = 0;
    return handlerInput.responseBuilder.getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(handlerInput, error) {
    console.error('[ErrorHandler]', error.message, error.stack);
    return handlerInput.responseBuilder.speak('Sorry, I had trouble processing that. Please try again.').getResponse();
  },
};

exports.handler = async (event, context) => {
  if (event.source === 'aws.events' || event['detail-type'] === 'MyPrayerTimePrayerTime') {
    const { clearCache } = require('./prayerService');
    clearCache();
    await getPrayerTimes(true);
    return { statusCode: 200, body: 'Cache refreshed' };
  }
  if (event['detail-type'] === 'MyPrayerTimeMidnightReset') {
    const { clearCache } = require('./prayerService');
    clearCache();
    return { statusCode: 200, body: 'Cache cleared' };
  }

  if (!process.env.SKILL_ID) {
    console.warn('[index] WARNING: SKILL_ID env var is not set — request signature validation disabled');
  }

  const skill = Alexa.SkillBuilders.standard()
    .addRequestHandlers(
      AudioPlayerHandler,
      PlaybackControllerHandler,
      UserEventPingHandler,
      LaunchRequestHandler,
      PrayerTimesIntentHandler,
      NextPrayerIntentHandler,
      EidCountdownIntentHandler,
      IftarTimeIntentHandler,
      SuhoorTimeIntentHandler,
      HijriDateIntentHandler,
      HelpIntentHandler,
      CancelAndStopIntentHandler,
      SessionEndedRequestHandler,
    )
    .addErrorHandlers(ErrorHandler)
    .withSkillId(process.env.SKILL_ID || '')
    .create();

  return skill.invoke(event, context);
};
