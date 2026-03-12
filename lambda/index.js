/**
 * index.js — My Prayer Time Alexa Skill
 * Main Lambda handler. Handles LaunchRequest, PrayerTimesIntent, NextPrayerIntent,
 * EventBridge (prayer time + midnight reset), Help/Stop/Cancel, SessionEnded, Error.
 */

const Alexa = require('ask-sdk-core');
const { getPrayerTimes } = require('./prayerService');
const { getCurrentContent } = require('./contentService');
const { buildDatasource, buildAplDirective, buildSpeechText, loadAplDocument } = require('./aplBuilder');
const { CONFIG } = require('./prayerService');

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

  const response = handlerInput.responseBuilder.speak(speechText);
  if (supportsAPL(handlerInput)) {
    response.addDirective(buildAplDirective(datasource, content, aplDocument));
  }
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

  const skill = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
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
