# CLAUDE.md — Project AI Context
## My Prayer Time | Alexa Skill for Echo Show
> This file gives AI assistants (Claude, Cursor, Copilot) full project context.
> **Source of truth:** Synced from README.md + FDD.md. When those change, update this file so memory stays current.

---

## WHAT THIS PROJECT IS

An Amazon Alexa Skill that displays Islamic prayer times on Amazon Echo Show as a **persistent home screen widget**. Think of it as a spiritual clock — always visible, always accurate. Now with location-aware prayer times, automatic adhan + iftar dua playback, and voice Q&A for the family.

**Inspired by:** [tawkit.net](https://www.tawkit.net) — an offline HTML/JS prayer times app for mosque displays. We are NOT porting that code (it's obfuscated). We are rebuilding the core features natively for Echo Show.

---

## WHAT WE DECIDED (Design Decisions Log)

| Decision | Rationale |
|---|---|
| **APL Widget, not PWA** | PWA in Silk Browser loses persistence when Echo Show screensaver activates. Widget persists. |
| **AlAdhan.com API** | Free, no API key, reliable, returns Hijri date too. Supports city-name lookup. |
| **City-based location (not lat/lng)** | `timingsByCity` endpoint is simpler — API resolves coords from city name. |
| **Alexa Device Address API for location** | Auto-detects user's city/state/country. Falls back to env var defaults. |
| **US state-to-timezone mapping** | Maps all 50 US states + DC to IANA timezones. Fallback for non-US: env var. |
| **Default city: Apex, NC** | Developer's home city. Fallback when Device Address permission not granted. |
| **SSML `<audio>` for adhan (not AudioPlayer)** | AudioPlayer takes over the screen and kills APL session. SSML keeps APL visible. |
| **Iftar dua chained in SSML** | `<audio adhan/><break 2s/><audio dua/>` — plays sequentially in one response. |
| **Token-based state (not Lambda memory)** | Lambda instances aren't guaranteed between events. Encode state in AudioPlayer tokens. |
| **No DynamoDB** | Single home location via Device Address API. No user accounts needed. |
| **SAM over CDK** | Simpler for Alexa skill deployment. ASK CLI integrates well with SAM. |
| **Sequential content rotation** | Ensures all Hadiths/verses are shown, no repetition. Better than random. |
| **S3 for audio** | Adhan MP3s + Iftar dua served from S3. Public read on `audio/*` prefix. |

---

## KEY PEOPLE & CONTEXT

- **Developer:** Atif Jaffery — Principal Solutions Architect, expert in AWS/Azure/GCP, C programming background, good JavaScript/Node.js capability
- **Use case:** Personal home use (default location: Apex, NC, USA)
- **Device:** Amazon Echo Show (has screen, runs Alexa)
- **IDE:** Cursor (with AI coding assistance)
- **Family uses the skill** — kids ask voice questions about Eid, iftar, etc.

---

## LOCATION & PRAYER TIME FLOW

### Location Detection (Priority Order)
1. **Alexa Device Address API** — auto-detects city/state/country from device registration
2. **Environment variable fallback** — `PRAYER_CITY`, `PRAYER_STATE`, `PRAYER_COUNTRY`
3. **Hardcoded defaults** — Apex, NC, US

### Timezone Resolution
- US states mapped to IANA timezones in `index.js` (`US_STATE_TIMEZONES` object)
- Non-US countries fall back to `PRAYER_TIMEZONE` env var
- Device location cached per Lambda warm instance (`_deviceLocation`)

### AlAdhan API Call
```
GET https://api.aladhan.com/v1/timingsByCity/{date}
  ?city={deviceCity}&country={deviceCountry}&state={deviceState}
  &method=2&school=0
```

### Cache Key
Prayer times cached by: `{date}:{city}:{state}:{country}` — changes when location or date changes.

---

## ADHAN PLAYBACK ARCHITECTURE

**Method:** SSML `<audio>` tags (NOT AudioPlayer directive)

```
PING fires every 15s --> checkAdhanTime() --> within 1-min window?
  |
  YES --> build SSML: <speak><audio src="adhan.mp3"/></speak>
  |
  Is Maghrib + Ramadan? --> chain iftar dua:
    <speak><audio src="adhan.mp3"/><break time="2s"/><audio src="iftar-dua-2.mp3"/></speak>
  |
  Set _adhanPlayingUntil = now + 5 minutes (cooldown)
  |
  PINGs during cooldown: keep session alive, skip re-render
  |
  After cooldown: next PING re-renders APL normally
```

**Why SSML instead of AudioPlayer:**
- AudioPlayer takes over the screen (shows audio player UI, hides APL)
- AudioPlayer events are out-of-session (can't send APL directives in response)
- Lambda instance may change between Play and PlaybackFinished events
- SSML keeps APL screen visible during playback

### S3 Audio Files
| File | Size | Duration | Source |
|---|---|---|---|
| `adhan.mp3` | 1.0 MB | 2:53 | Standard adhan |
| `adhan-fajr.mp3` | 2.8 MB | 4:02 | Makkah, Sheikh Ali Mullah (Internet Archive) |
| `iftar-dua-1.mp3` | 197 KB | 0:08 | Allahumma inni laka sumtu... (NooreSunnat) |
| `iftar-dua-2.mp3` | 548 KB | 0:23 | Dhahaba az-zama'u... (Internet Archive) — **default** |
| `noop.mp4` | 3.5 KB | -- | Silent video for APL keep-alive |

---

## VOICE Q&A INTENTS

| Intent | Trigger Phrases | Response |
|---|---|---|
| `EidCountdownIntent` | "How many days to Eid?" | Days left in Ramadan + Eid estimate |
| `IftarTimeIntent` | "When is iftar?" | Maghrib time + countdown |
| `SuhoorTimeIntent` | "When is suhoor?" | Fajr time + countdown |
| `HijriDateIntent` | "What is the Islamic date?" | Hijri date + Ramadan day |
| `NextPrayerIntent` | "When is the next prayer?" | Next prayer name + time + countdown |
| `PrayerTimesIntent` | "Show prayer times" | Full APL re-render + speech |

All intents keep session open (`withShouldEndSession(false)`) for follow-up questions.

---

## APL LAYOUT STRUCTURE

The main screen uses absolute positioning for the countdown circle:

```
Container (100vw x 100vh, column)
├── Header row (title left, hijri date right)
├── Green separator line (2dp)
├── Countdown circle (ABSOLUTE: right 4vw, top 14vh, 145dp)
├── Ramadan banners (column, left-aligned, 73vw to avoid circle)
│   ├── Fast Day / Eid countdown
│   ├── Suhoor or Iftar countdown
│   ├── Last 10 Nights + dua (maxLines: 2)
│   └── Zakat reminder
├── Clock + date (centered, grow: 1)
└── Prayer cards row (5 prayers + Jumuah on Friday, height: 34vh)
```

Key APL decisions:
- `handleTick` fires PING every 15 seconds
- Countdown circle uses `position: "absolute"` to float over content
- Ramadan/Dhul Hijjah banners width `73vw` to avoid overlapping circle
- Arabic text has `maxLines: 2` and `wrap: "wrap"` to prevent overflow
- Banner font size: 21dp, Arabic dua: 19dp
- Prayer cards: fixed `34vh` (not `grow:1` which broke layout)

---

## PRAYER NAMES (used consistently throughout codebase)

| Key | Arabic | Display |
|---|---|---|
| `fajr` | الفجر | Fajr |
| `dhuhr` | الظهر | Dhuhr |
| `asr` | العصر | Asar |
| `maghrib` | المغرب | Maghrib |
| `isha` | العشاء | Eaisha |

---

## CURRENT STATUS

- [x] Lambda: index.js, prayerService.js, contentService.js, countdownService.js, aplBuilder.js, hijriService.js, reminderService.js, ramadanService.js, hajjService.js
- [x] APL: mainScreen.json (absolute circle, tick keep-alive), widget.json
- [x] Content: content.json (hadiths + verses), ramadan.json (duas)
- [x] Audio: adhan.mp3, adhan-fajr.mp3, iftar-dua-1.mp3, iftar-dua-2.mp3, noop.mp4
- [x] Skill: skill.json (APL + AudioPlayer + Device Address permissions)
- [x] Intents: PrayerTimes, NextPrayer, EidCountdown, IftarTime, SuhoorTime, HijriDate + built-ins
- [x] Location: Device Address API with US state timezone mapping
- [x] Adhan: SSML audio at each prayer time + iftar dua at Maghrib during Ramadan
- [x] Ramadan: Suhoor/Iftar/LastTen/Zakat banners + Eid countdown
- [x] Dhul Hijjah: First 10 Days, Arafah, Eid al-Adha, Tashreeq banners
- [x] EventBridge: Triggers at each prayer time + midnight reset
- [ ] Alexa certification (development mode only)
- [ ] Multi-device adhan broadcasting

---

## KNOWN CONSTRAINTS

1. **SSML audio limit**: Alexa SSML has a 240-second limit on `<audio>` playback. Fajr adhan (4:02) is within this limit.
2. **Adhan cooldown**: 5-minute cooldown prevents PINGs from re-rendering during adhan. If adhan is shorter, screen may show stale data for remaining cooldown.
3. **Device Address API**: Requires user to grant permission in Alexa app. Falls back to env var defaults if not granted.
4. **US timezone mapping only**: Non-US locations fall back to `PRAYER_TIMEZONE` env var. International timezone detection not implemented.
5. **No multi-device adhan**: Alexa Skills Kit doesn't support pushing audio to multiple devices simultaneously. Echo speaker pair may work for paired devices.
6. **Lambda cold starts**: Device location is cached per warm instance but lost on cold start. First PING after cold start re-fetches location.
7. **AlAdhan API**: Community-maintained. Cache last successful response in Lambda memory for resilience.

---

## HOW TO RUN LOCALLY

```bash
# Install dependencies
npm install && cd lambda && npm install && cd ..

# Test Lambda locally (requires SAM CLI)
sam local invoke MyPrayerTimeFunction --event events/launch.json

# Run unit tests
npm test

# Deploy Lambda
sam build && sam deploy --stack-name tawkit-echo --resolve-s3 --no-confirm-changeset --no-fail-on-empty-changeset --capabilities CAPABILITY_IAM

# Deploy interaction model
ask smapi set-interaction-model --skill-id amzn1.ask.skill.XXXX --stage development --locale en-US --interaction-model "$(cat skill-package/interactionModels/custom/en-US.json)"
```

---

## FILES AI SHOULD NEVER MODIFY

- `content/content.json` — Hadith/Quran content (religious text, must be accurate)
- `lambda/content/ramadan.json` — Ramadan duas (religious text, must be accurate)
- `template.yaml` IAM roles section — security sensitive
- `.env` — never exists in repo, never create it

---

## PROJECT STRUCTURE (KEY PATHS)

```
tawkit/
├── lambda/                      # SAM CodeUri: ./lambda
│   ├── index.js                 # Entry point: handlers, adhan, PING, voice Q&A, location
│   ├── prayerService.js         # AlAdhan API + caching + location override
│   ├── contentService.js        # Hadith/verse rotation
│   ├── countdownService.js      # Next prayer countdown + formatting
│   ├── aplBuilder.js            # APL datasource + directive builder
│   ├── reminderService.js       # Reminders + Device Address API + Google Maps
│   ├── ramadanService.js        # Ramadan context (suhoor, iftar, last 10, zakat)
│   ├── hajjService.js           # Dhul Hijjah context (Arafah, Eid, Tashreeq)
│   ├── hijriService.js          # Hijri date fallback calculation
│   ├── apl/mainScreen.json      # APL document (absolute circle, tick keep-alive)
│   ├── apl/widget.json          # Echo Show home widget
│   ├── content/content.json     # Hadiths & verses (bundled for deploy)
│   └── content/ramadan.json     # Ramadan duas (suhoor, iftar, laylat al-qadr)
├── skill-package/
│   ├── skill.json               # Manifest (APL + AudioPlayer + Device Address)
│   └── interactionModels/custom/en-US.json  # 6 custom + 6 built-in intents
├── template.yaml                # AWS SAM (Lambda, S3, EventBridge, Parameters)
├── events/launch.json           # Test event
├── CLAUDE.md                    # This file (AI context)
└── README.md                    # Project documentation
```

---

## HELPFUL LINKS

- [APL Reference](https://developer.amazon.com/docs/alexa-presentation-language/apl-overview.html)
- [ASK SDK v2 Docs](https://developer.amazon.com/docs/alexa/alexa-skills-kit-sdk-for-nodejs/overview.html)
- [AlAdhan API Docs](https://aladhan.com/prayer-times-api)
- [Alexa Device Address API](https://developer.amazon.com/docs/custom-skills/device-address-api.html)
- [AWS SAM Docs](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
- [Tawkit.net](https://www.tawkit.net) — Original inspiration (do not copy code)
