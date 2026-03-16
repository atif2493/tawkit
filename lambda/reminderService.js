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
/**
 * Get the raw address object from Alexa Device Address API.
 * Returns { city, stateOrRegion, countryCode, postalCode, ... } or null.
 */
async function getDeviceAddressRaw(handlerInput) {
  try {
    const { deviceId } = handlerInput.requestEnvelope.context.System.device;
    const deviceAddressClient = handlerInput.serviceClientFactory.getDeviceAddressServiceClient();
    const address = await deviceAddressClient.getFullAddress(deviceId);

    if (address && (address.addressLine1 || address.city)) {
      console.log(`[reminderService] Device address: ${address.city}, ${address.stateOrRegion}, ${address.countryCode}`);
      return address;
    }
    console.log('[reminderService] Device address empty or not set');
    return null;
  } catch (err) {
    console.warn('[reminderService] Could not get device address:', err.message);
    return null;
  }
}

async function getDeviceAddress(handlerInput) {
  const address = await getDeviceAddressRaw(handlerInput);
  if (!address) return null;
  const parts = [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.stateOrRegion,
    address.postalCode,
    address.countryCode,
  ].filter(Boolean);
  return parts.join(', ');
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
    { name: 'Asar', time: prayerTimes.asr },
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

/**
 * Set Ramadan-specific reminders (suhoor, iftar, zakat).
 * @param {object} handlerInput - Alexa handler input
 * @param {object} prayerTimes - { fajr, sunrise, maghrib } in "HH:MM" 24hr
 * @param {string} timezone
 * @param {object} ramadanContext - from getRamadanContext()
 */
async function setRamadanReminders(handlerInput, prayerTimes, timezone, ramadanContext) {
  if (!ramadanContext.isRamadan) return { success: true, count: 0 };

  let reminderApiClient;
  try {
    reminderApiClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
  } catch (err) {
    console.warn('[reminderService] Reminders not available for Ramadan:', err.message);
    return { success: false, reason: 'no_permission' };
  }

  const now = new Date();
  const nowStr = now.toLocaleString('en-US', { timeZone: timezone });
  const localNow = new Date(nowStr);
  const diffMs = now.getTime() - localNow.getTime();
  let remindersSet = 0;

  function buildReminderDate(timeStr, offsetMinutes) {
    const [hh, mm] = timeStr.split(':').map(Number);
    const d = new Date(localNow);
    d.setHours(hh, mm, 0, 0);
    const reminderLocal = new Date(d.getTime() - offsetMinutes * 60000);
    if (reminderLocal <= localNow) return null;
    return new Date(reminderLocal.getTime() + diffMs);
  }

  async function setReminder(text, timeStr, offsetMinutes) {
    const utcDate = buildReminderDate(timeStr, offsetMinutes);
    if (!utcDate) return;
    try {
      await createReminder(reminderApiClient, text, utcDate);
      remindersSet++;
    } catch (err) {
      console.error(`[reminderService] Ramadan reminder failed:`, err.message);
    }
  }

  // Suhoor reminders (before Fajr)
  await setReminder('Suhoor time — 1 hour before Fajr. Start your meal.', prayerTimes.fajr, 60);
  await setReminder('30 minutes left for Suhoor. Finish eating soon.', prayerTimes.fajr, 30);
  await setReminder('Suhoor ending soon! 10 minutes until Fajr. Stop eating!', prayerTimes.fajr, 10);
  await setReminder('Fajr has entered. Stop eating. May Allah accept your fast.', prayerTimes.fajr, 0);

  // Iftar reminders (before Maghrib)
  await setReminder('Iftar in 15 minutes. Prepare to break your fast.', prayerTimes.maghrib, 15);
  await setReminder('Almost time! Iftar in 5 minutes.', prayerTimes.maghrib, 5);
  await setReminder('Maghrib has entered. Break your fast! Bismillah.', prayerTimes.maghrib, 0);

  // Zakat reminder (day 25-30, at Dhuhr)
  if (ramadanContext.zakat.show) {
    await setReminder('Remember to pay Zakat al-Fitr before Eid prayer.', prayerTimes.dhuhr || '12:30', 0);
  }

  console.log(`[reminderService] Set ${remindersSet} Ramadan reminders`);
  return { success: true, count: remindersSet };
}

module.exports = { setPrayerReminders, setRamadanReminders, getTravelTime, buildReminderText, getDeviceAddressRaw, REMINDER_OFFSETS };
