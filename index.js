/**
 * index.js — Tawkit Echo Alexa Skill
 * Main Lambda handler for the Alexa skill.
 *
 * Handles:
 *   LaunchRequest   → Show prayer times screen + speak summary
 *   PrayerTimesIntent → Same as launch
 *   EventBridge     → Scheduled refresh at each prayer time (Adhan trigger)
 *   AMAZON.HelpIntent / AMAZON.StopIntent / SessionEndedRequest
 */

const Alexa = require('ask-sdk-core');
const { getPrayerTimes }    = require('./prayerService');
const { getCurrentContent } = require('./contentService');
const { buildDatasource, buildAplDirective, buildSpeechText } = require('./aplBuilder');
const { CONFIG }            = require('./prayerService');

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Check if the current device supports APL (Echo Show, Echo Spot)
 */
function supportsAPL(handlerInput) {
  const interfaces = Alexa.getSupportedInterfaces(handlerInput.requestEnvelope);
  return !!interfaces['Alexa.Presentation.APL'];
}

/**
 * Build and return the full prayer times response (APL + speech)
 */
async function buildPrayerTimesResponse(handlerInput) {
  const timezone    = CONFIG.timezone;
  const prayerTimes = await getPrayerTimes();
  const content     = getCurrentContent(timezone);
  const datasource  = buildDatasource(prayerTimes, timezone);
  const speechText  = buildSpeechText(prayerTimes, timezone);

  const response = handlerInput.responseBuilder.speak(speechText);

  // Add APL visual if device supports it (Echo Show)
  if (supportsAPL(handlerInput)) {
    response.addDirective(buildAplDirective(datasource, content));
  }

  return response.getResponse();
}

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

/**
 * LaunchRequest — user opens skill ("Alexa, open Tawkit")
 */
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    console.log('[LaunchRequestHandler] Handling LaunchRequest');
    return buildPrayerTimesResponse(handlerInput);
  },
};

/**
 * PrayerTimesIntent — "Alexa, ask Tawkit for prayer times"
 */
const PrayerTimesIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'PrayerTimesIntent';
  },
  async handle(handlerInput) {
    console.log('[PrayerTimesIntentHandler] Handling PrayerTimesIntent');
    return buildPrayerTimesResponse(handlerInput);
  },
};

/**
 * NextPrayerIntent — "Alexa, ask Tawkit what is the next prayer"
 */
const NextPrayerIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'NextPrayerIntent';
  },
  async handle(handlerInput) {
    console.log('[NextPrayerIntentHandler] Handling NextPrayerIntent');
    const timezone    = CONFIG.timezone;
    const prayerTimes = await getPrayerTimes();
    const { getNextPrayer, formatCountdown, formatTo12Hr } = require('./countdownService');

    if (prayerTimes.error) {
      return handlerInput.responseBuilder
        .speak("I'm sorry, I couldn't get prayer times right now.")
        .getResponse();
    }

    const next = getNextPrayer(prayerTimes, timezone);
    const speech = `The next prayer is ${next.name} at ${next.time12hr}, ` +
                   `in ${formatCountdown(next.secondsUntil)}.`;

    return handlerInput.responseBuilder
      .speak(speech)
      .getResponse();
  },
};

/**
 * AMAZON.HelpIntent
 */
const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speech = 'Tawkit shows prayer times for ' + CONFIG.city +
      '. You can say: show prayer times, or what is the next prayer.';
    return handlerInput.responseBuilder.speak(speech).getResponse();
  },
};

/**
 * AMAZON.StopIntent / AMAZON.CancelIntent
 */
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

/**
 * SessionEndedRequest
 */
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log('[SessionEndedRequestHandler] Session ended:',
      JSON.stringify(handlerInput.requestEnvelope.request.reason));
    return handlerInput.responseBuilder.getResponse();
  },
};

/**
 * Error Handler — catches all unhandled errors
 */
const ErrorHandler = {
  canHandle() { return true; },
  handle(handlerInput, error) {
    console.error('[ErrorHandler]', error.message, error.stack);
    return handlerInput.responseBuilder
      .speak('Sorry, I had trouble processing that. Please try again.')
      .getResponse();
  },
};

// ─── LAMBDA EXPORT ────────────────────────────────────────────────────────────

/**
 * Main Lambda handler
 * Handles both Alexa Skill requests AND EventBridge scheduled triggers
 */
exports.handler = async (event, context) => {

  // EventBridge scheduled event (prayer time trigger)
  // source: 'aws.events' or custom source 'tawkit.scheduler'
  if (event.source === 'aws.events' || event['detail-type'] === 'TawkitPrayerTime') {
    console.log('[EventBridge] Prayer time trigger received:', JSON.stringify(event));
    // In v2: trigger Proactive Events API for Adhan notification here
    // For now: just refresh cache
    const { clearCache } = require('./prayerService');
    clearCache();
    const prayerTimes = await getPrayerTimes(true);
    console.log('[EventBridge] Cache refreshed. Next prayer data:', prayerTimes.hijri?.formatted);
    return { statusCode: 200, body: 'Cache refreshed' };
  }

  // Midnight reset trigger
  if (event['detail-type'] === 'TawkitMidnightReset') {
    console.log('[EventBridge] Midnight reset — clearing cache');
    const { clearCache } = require('./prayerService');
    clearCache();
    return { statusCode: 200, body: 'Cache cleared' };
  }

  // Standard Alexa Skill request
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
