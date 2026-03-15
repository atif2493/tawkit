/**
 * reminderService.js
 * Creates Alexa Reminders for upcoming prayers with dynamic travel time.
 * Uses Google Maps Directions API for real-time traffic-based travel estimates.
 */

const https = require('https');

const REMINDER_OFFSETS = [15, 10, 5, 0]; // minutes before prayer

/**
 * Get the device's full address from Alexa Device Address API.
 * Returns a formatted address string, or null if unavailable.
 */
async function getDeviceAddress(handlerInput) {
  try {
    const { deviceId } = handlerInput.requestEnvelope.context.System.device;
    const deviceAddressClient = handlerInput.serviceClientFactory.getDeviceAddressServiceClient();
    const address = await deviceAddressClient.getFullAddress(deviceId);

    if (address && (address.addressLine1 || address.city)) {
      const parts = [
        address.addressLine1,
        address.addressLine2,
        address.city,
        address.stateOrRegion,
        address.postalCode,
        address.countryCode,
      ].filter(Boolean);
      const formatted = parts.join(', ');
      console.log(`[reminderService] Device address: ${formatted}`);
      return formatted;
    }
    console.log('[reminderService] Device address empty or not set');
    return null;
  } catch (err) {
    console.warn('[reminderService] Could not get device address:', err.message);
    return null;
  }
}

/**
 * Fetch travel time (in minutes) from Google Maps Directions API with traffic.
 * Uses device address as origin if available, falls back to HOME_ADDRESS env var.
 * Falls back to TRAVEL_TIME_FALLBACK env var or 12 minutes if API fails.
 */
async function getTravelTime(handlerInput) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const destination = process.env.MOSQUE_ADDRESS;
  const fallback = parseInt(process.env.TRAVEL_TIME_FALLBACK) || 12;

  // Try device address first, then fall back to env var
  let origin = null;
  if (handlerInput) {
    origin = await getDeviceAddress(handlerInput);
  }
  if (!origin) {
    origin = process.env.HOME_ADDRESS;
  }

  if (!apiKey || !origin || !destination) {
    console.log('[reminderService] Missing Maps config, using fallback:', fallback);
    return fallback;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&departure_time=now&traffic_model=best_guess&key=${encodeURIComponent(apiKey)}`;
    const data = await httpGet(url);
    const parsed = JSON.parse(data);

    if (parsed.routes && parsed.routes.length > 0) {
      const leg = parsed.routes[0].legs[0];
      // Use duration_in_traffic if available, otherwise regular duration
      const seconds = (leg.duration_in_traffic || leg.duration).value;
      const minutes = Math.ceil(seconds / 60);
      console.log(`[reminderService] Travel time: ${minutes} min (traffic-aware) from ${origin}`);
      return minutes;
    }
    console.warn('[reminderService] No routes found, using fallback');
    return fallback;
  } catch (err) {
    console.error('[reminderService] Maps API error:', err.message);
    return fallback;
  }
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Build reminder text for a given prayer and offset.
 */
function buildReminderText(prayerName, offsetMinutes, travelMinutes) {
  if (offsetMinutes === 0) {
    return `${prayerName} prayer time has arrived. It takes about ${travelMinutes} minutes to reach the mosque.`;
  }
  const leaveNote = offsetMinutes <= travelMinutes
    ? ' You should leave now!'
    : ` Leave in about ${offsetMinutes - travelMinutes} minutes.`;
  return `${prayerName} prayer is in ${offsetMinutes} minutes. Travel to mosque: ${travelMinutes} minutes.${leaveNote}`;
}

/**
 * Create an absolute-time Alexa reminder.
 * @param {object} reminderApiClient - from handlerInput.serviceClientFactory.getReminderManagementServiceClient()
 * @param {string} text - reminder text
 * @param {Date} scheduledTime - when to fire
 */
async function createReminder(reminderApiClient, text, scheduledTime) {
  const reminderRequest = {
    requestTime: new Date().toISOString(),
    trigger: {
      type: 'SCHEDULED_ABSOLUTE',
      scheduledTime: scheduledTime.toISOString().replace(/\.\d{3}Z$/, ''),
      timeZoneId: process.env.PRAYER_TIMEZONE || 'America/New_York',
    },
    alertInfo: {
      spokenInfo: {
        content: [{ locale: 'en-US', text }],
      },
    },
    pushNotification: { status: 'ENABLED' },
  };

  return reminderApiClient.createReminder(reminderRequest);
}

/**
 * Delete all existing reminders (clean slate before setting new ones).
 */
async function clearReminders(reminderApiClient) {
  try {
    const existing = await reminderApiClient.getReminders();
    if (existing && existing.alerts) {
      for (const alert of existing.alerts) {
        try {
          await reminderApiClient.deleteReminder(alert.alertToken);
        } catch (e) {
          // Ignore individual delete failures
        }
      }
    }
  } catch (err) {
    console.warn('[reminderService] Could not clear reminders:', err.message);
  }
}

/**
 * Set reminders for all upcoming prayers.
 * @param {object} handlerInput - Alexa handler input
 * @param {object} prayerTimes - { fajr, dhuhr, asr, maghrib, isha } in "HH:MM" 24hr
 * @param {string} timezone
 */
async function setPrayerReminders(handlerInput, prayerTimes, timezone) {
  let reminderApiClient;
  try {
    reminderApiClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
  } catch (err) {
    console.warn('[reminderService] Reminders not available (permissions?):', err.message);
    return { success: false, reason: 'no_permission' };
  }

  const travelMinutes = await getTravelTime(handlerInput);

  // Clear old reminders
  await clearReminders(reminderApiClient);

  const now = new Date();
  const nowStr = now.toLocaleString('en-US', { timeZone: timezone });
  const localNow = new Date(nowStr);

  const prayers = [
    { name: 'Fajr', time: prayerTimes.fajr },
    { name: 'Dhuhr', time: prayerTimes.dhuhr },
    { name: 'Asr', time: prayerTimes.asr },
    { name: 'Maghrib', time: prayerTimes.maghrib },
    { name: 'Eaisha', time: prayerTimes.isha },
  ];

  let remindersSet = 0;

  for (const prayer of prayers) {
    const [hh, mm] = prayer.time.split(':').map(Number);
    // Build a Date in local timezone for this prayer
    const prayerDate = new Date(localNow);
    prayerDate.setHours(hh, mm, 0, 0);

    for (const offset of REMINDER_OFFSETS) {
      const reminderDate = new Date(prayerDate.getTime() - offset * 60000);

      // Skip if reminder time is in the past
      if (reminderDate <= localNow) continue;

      // Convert local reminder time back to UTC for the API
      const diffMs = now.getTime() - localNow.getTime();
      const reminderUTC = new Date(reminderDate.getTime() + diffMs);

      const text = buildReminderText(prayer.name, offset, travelMinutes);

      try {
        await createReminder(reminderApiClient, text, reminderUTC);
        remindersSet++;
      } catch (err) {
        console.error(`[reminderService] Failed to set ${prayer.name} -${offset}min:`, err.message);
        if (err.statusCode === 401 || err.statusCode === 403) {
          return { success: false, reason: 'no_permission' };
        }
      }
    }
  }

  console.log(`[reminderService] Set ${remindersSet} reminders (travel: ${travelMinutes}min)`);
  return { success: true, count: remindersSet, travelMinutes };
}

module.exports = { setPrayerReminders, getTravelTime, buildReminderText, REMINDER_OFFSETS };
