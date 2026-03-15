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
const { setPrayerReminders, setRamadanReminders } = require('./reminderService');
const { getRamadanContext } = require('./ramadanService');
const { timeToMinutes, getCurrentTimeStr } = require('./countdownService');

// Track which prayer's adhan has been played (per Lambda warm instance)
let _lastAdhanPlayed = '';
let _adhanPlayingUntil = 0; // timestamp (ms) — suppress PINGs while adhan is playing

const ADHAN_DURATION_MS = 180000; // 3 minutes — full adhan is ~2:53

const S3_BUCKET = process.env.S3_BUCKET || 'my-prayer-time-content-357977905088';
const S3_REGION = 'us-east-1';
const ADHAN_NORMAL_URL = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/audio/adhan.mp3`;
const ADHAN_FAJR_URL = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/audio/adhan-fajr.mp3`;

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

async function buildPrayerTimesResponse(handlerInput) {
  const timezone = CONFIG.timezone;
  const prayerTimes = await getPrayerTimes();
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

  const response = handlerInput.responseBuilder.speak(speechText);
  if (supportsAPL(handlerInput)) {
    response.addDirective(buildAplDirective(datasource, content, aplDocument));
  }
  // Set a simple card for home screen / Alexa app
  response.withSimpleCard('My Prayer Time', `Next: ${datasource.properties.nextPrayer.nameEn} at ${datasource.properties.nextPrayer.time} (${datasource.properties.nextPrayer.countdown})\n\nFajr: ${datasource.properties.prayers[0].time}\nDhuhr: ${datasource.properties.prayers[1].time}\nAsr: ${datasource.properties.prayers[2].time}\nMaghrib: ${datasource.properties.prayers[3].time}\nEaisha: ${datasource.properties.prayers[4].time}`);
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
    const prayerTimes = await getPrayerTimes();
    const { getNextPrayer, formatCountdown, formatTo12Hr } = require('./countdownService');
    if (prayerTimes.error) {
      return handlerInput.responseBuilder.speak("I'm sorry, I couldn't get prayer times right now.").getResponse();
    }
    const next = getNextPrayer(prayerTimes, CONFIG.timezone);
    const speech = `The next prayer is ${next.name} at ${next.time12hr}, in ${formatCountdown(next.secondsUntil)}.`;
    return handlerInput.responseBuilder.speak(speech).getResponse();
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speech = 'My Prayer Time shows prayer times for ' + CONFIG.city + '. You can say: show prayer times, or what is the next prayer.';
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
    const timezone = CONFIG.timezone;
    const prayerTimes = await getPrayerTimes();
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

      // Use AudioPlayer directive — plays on device media channel, not interrupted by PINGs
      response.addDirective({
        type: 'AudioPlayer.Play',
        playBehavior: 'REPLACE_ALL',
        audioItem: {
          stream: {
            url: adhanUrl,
            token: `adhan-${adhan.prayerName}-${Date.now()}`,
            offsetInMilliseconds: 0,
          },
          metadata: {
            title: `${adhan.prayerName} Adhan`,
            subtitle: 'My Prayer Time',
          },
        },
      });
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
      // Adhan finished — clear cooldown so PINGs resume normally
      _adhanPlayingUntil = 0;
      console.log('[index] Adhan playback finished — resuming normal PINGs');
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
      HelpIntentHandler,
      CancelAndStopIntentHandler,
      SessionEndedRequestHandler,
    )
    .addErrorHandlers(ErrorHandler)
    .withSkillId(process.env.SKILL_ID || '')
    .create();

  return skill.invoke(event, context);
};
