# Functional Design Document (FDD)
## My Prayer Time — Islamic Prayer Times Alexa Skill
### Version 1.1 | March 2026

---

## 1. Overview

### 1.1 Purpose
My Prayer Time is an Alexa Skill with APL (Alexa Presentation Language) visual display, designed to run on Amazon Echo Show devices. It displays Islamic prayer times, live countdown to next prayer, automatic Adhan audio at prayer times, Iftar dua during Ramadan, location-aware prayer calculations, voice Q&A for family interaction, and rotating Quran verses & Hadiths — as a persistent full-screen display on Echo Show.

### 1.2 Motivation
- The existing Tawkit offline HTML/JS app (`m2body.js`) is intentionally obfuscated and cannot run natively on Echo Show
- Echo Show's Silk Browser does not maintain persistence through screensaver
- A native Alexa Skill with APL persists on the Echo Show screen
- Target users: Muslim households wanting a dedicated always-visible prayer times display
- Family-friendly: Kids can ask voice questions about Eid, iftar, suhoor, etc.

### 1.3 Madhab & Location
- **Juristic School:** Configurable (`school=0` Shafi'i default, `school=1` Hanafi) — affects Asr prayer time only
- **Location Detection:** Alexa Device Address API (auto-detects user's city/state/country)
- **Fallback City:** Apex, NC, USA (via environment variables)
- **API endpoint:** `timingsByCity` — AlAdhan resolves coordinates automatically from city name
- **Timezone:** Auto-mapped from US state abbreviation (50 states + DC)

### 1.4 Scope

| In Scope (v1.0-1.1) | Out of Scope (v2+) |
|---|---|
| Prayer times display (5 daily prayers) | Multi-mosque admin portal |
| Live countdown to next prayer (circle widget) | User accounts / login |
| Automatic Adhan audio via SSML at prayer time | Azkar post-prayer screens |
| Separate Fajr Adhan (Makkah, Sheikh Ali Mullah) | Custom CSV prayer time upload |
| Iftar dua auto-play after Maghrib (Ramadan) | Screen themes / backgrounds |
| Location-aware via Device Address API | Multi-device Adhan broadcasting |
| Voice Q&A (Eid, iftar, suhoor, hijri date) | English translations of Hadiths |
| Quran verse / Hadith rotation | Iqama countdown timer |
| Hijri + Gregorian date display with moon phase | Multiple language support |
| Ramadan companion (suhoor/iftar/last 10/zakat) | DynamoDB user preferences |
| Dhul Hijjah banners (Arafah, Eid, Tashreeq) | Admin web UI |
| Jumuah (Friday) prayer card | Madhab selection UI |
| Iqama times display per prayer | |
| Prayer reminders with travel time (Google Maps) | |
| Permissions consent card for location setup | |

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Echo Show Device                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           APL Full-Screen Display                    │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  Header: Title | Hijri Date | [Countdown ⭕]  │   │   │
│  │  │  Ramadan Banners (fast day, iftar, last 10)  │   │   │
│  │  │  Large Clock + Gregorian Date                │   │   │
│  │  │  Prayer Cards: Fajr|Dhuhr|Asar|Maghrib|Isha │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └──────────────────────┬──────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │ Alexa Infrastructure
┌─────────────────────────▼───────────────────────────────────┐
│                     AWS Lambda (Node.js 20.x)                │
│   ├── Device Address API → get user's location              │
│   ├── AlAdhan API → fetch prayer times for location         │
│   ├── Build APL datasource + SSML adhan audio               │
│   ├── Voice Q&A intent handlers                             │
│   └── Reminder service (prayer + Ramadan reminders)         │
└───┬─────────────────────┬────────────────────┬──────────────┘
    │                     │                    │
┌───▼────────┐  ┌─────────▼──────┐  ┌─────────▼──────────────┐
│  AlAdhan   │  │  EventBridge   │  │    S3 Bucket            │
│  API       │  │  (5 prayer +   │  │  - adhan.mp3 (2:53)     │
│  (Free,    │  │   midnight     │  │  - adhan-fajr.mp3 (4:02)│
│  no auth)  │  │   reset rules) │  │  - iftar-dua-2.mp3      │
└────────────┘  └────────────────┘  │  - noop.mp4             │
                                    └─────────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Justification |
|---|---|---|
| Skill Frontend | APL 2024.1 | Native Echo Show full-screen support |
| Backend | Node.js 20.x Lambda | ASK SDK v2 support, lightweight |
| Prayer Data | AlAdhan.com REST API | Free, reliable, no auth needed |
| Location | Alexa Device Address API | Auto-detects user address from device registration |
| Scheduling | Amazon EventBridge | Cron-based prayer time triggers + midnight reset |
| Audio | SSML `<audio>` tags + S3 | Keeps APL screen visible during playback |
| Content | JSON flat files bundled in Lambda | Hadiths, Quran verses, Ramadan duas |
| IaC | AWS SAM | Lightweight, Alexa-native |
| Skill Deploy | ASK CLI (SMAPI) | Interaction model deployment |

### 2.3 Data Flow

```
1. User says "Alexa, open My Prayer Time"
2. LaunchRequest → Lambda invoked
3. Lambda calls Device Address API → gets user's city/state/country
4. Lambda maps US state to IANA timezone
5. Lambda calls AlAdhan API with user's location → gets prayer times
6. Lambda builds APL datasource (prayers, countdown, Ramadan context, content)
7. APL rendered full-screen on Echo Show
8. Every 15 seconds: APL handleTick fires SendEvent("PING")
9. Lambda receives PING → re-renders APL with updated countdown/time
10. At prayer time: PING detects match → plays adhan via SSML <audio>
11. At Maghrib (Ramadan): adhan + 2s pause + iftar dua plays
12. Session stays alive indefinitely via PING keep-alive
```

### 2.4 Adhan Playback Flow

```
PING fires (every 15s) → checkAdhanTime()
  |
  Is current time within 1-min window of any prayer? → NO → normal re-render
  |
  YES → Has this prayer's adhan already played? → YES → skip
  |
  NO → Build SSML:
    Normal prayer: <speak><audio src="adhan.mp3"/></speak>
    Fajr:          <speak><audio src="adhan-fajr.mp3"/></speak>
    Maghrib+Ramadan: <speak><audio src="adhan.mp3"/><break time="2s"/><audio src="iftar-dua-2.mp3"/></speak>
  |
  Set cooldown (_adhanPlayingUntil = now + 5 minutes)
  |
  During cooldown: PINGs keep session alive but skip re-render
  |
  After cooldown: next PING re-renders APL normally
```

**Why SSML instead of AudioPlayer:**
- AudioPlayer directive takes over the Echo Show screen (hides APL, shows audio player UI)
- AudioPlayer events (PlaybackFinished) are out-of-session — cannot send APL directives in response
- Lambda instances may differ between Play and PlaybackFinished events (cold starts)
- SSML `<audio>` keeps APL screen visible during playback and maintains session

---

## 3. Functional Requirements

### 3.1 Location Detection

**FR-001: Auto-Detect User Location**
- On first launch, call Alexa Device Address API to get device's registered address
- Extract city, stateOrRegion, countryCode from address object
- Map US state abbreviation to IANA timezone (all 50 states + DC)
- Cache device location per Lambda warm instance
- Fall back to environment variables if permission not granted

**FR-002: Location Permission Prompt**
- If Device Address permission not granted, speak setup instructions
- Show Alexa Permissions Consent Card (`read::alexa:device:all:address`)
- Continue showing prayer times for default location

### 3.2 Prayer Times Display

**FR-003: Display 5 Daily Prayer Times**
- Display Fajr, Dhuhr, Asar, Maghrib, Eaisha times in 12-hour AM/PM format
- Highlight the next prayer card with green border/background
- Display iqama time below each prayer time
- Show Jumuah card on Fridays with two khutbah times

**FR-004: Prayer Time Source**
- Endpoint: `https://api.aladhan.com/v1/timingsByCity`
- Parameters: `city`, `country`, `state`, `method`, `school` (from device location or env vars)
- Cache key: `{date}:{city}:{state}:{country}` — invalidates on date or location change
- Fallback: Return cached times if API unavailable

### 3.3 Countdown Timer

**FR-005: Next Prayer Countdown**
- Display countdown in circle widget (absolute positioned, top-right)
- Format: `Xh Xm` or `NOW` when active
- Show prayer name and "at X:XX PM" below countdown
- Circle: 145dp diameter, green border, light green background
- Update every 15 seconds via PING

### 3.4 Adhan Audio

**FR-006: Automatic Adhan at Prayer Time**
- Play adhan via SSML `<audio>` within 1-minute window of prayer time
- Fajr: Makkah Fajr adhan (Sheikh Ali Mullah, 4:02)
- Dhuhr/Asr/Maghrib/Isha: Standard adhan (2:53)
- 5-minute cooldown prevents duplicate playback
- APL screen remains visible during playback
- Duplicate prevention: `_lastAdhanPlayed` tracks `{prayerName}-{time}` key

**FR-007: Iftar Dua Auto-Play (Ramadan)**
- At Maghrib during Ramadan, chain iftar dua after adhan in SSML:
  `<audio adhan/><break 2s/><audio iftar-dua-2.mp3/>`
- Dua: "Dhahaba az-zama'u, wabtallatil-'urooq, wa thabatal-ajru in sha Allah" (23 seconds)
- Two dua MP3s available on S3 (iftar-dua-1.mp3 and iftar-dua-2.mp3)

### 3.5 Voice Q&A

**FR-008: Eid Countdown**
- Intent: `EidCountdownIntent`
- Triggers: "How many days to Eid?", "When does Ramadan end?", etc.
- Response: Current Ramadan day, days remaining, Eid estimate date
- Outside Ramadan: "We are not currently in Ramadan"

**FR-009: Iftar Time**
- Intent: `IftarTimeIntent`
- Triggers: "When is iftar?", "What time is Maghrib?", etc.
- During Ramadan with iftar banner: Maghrib time + countdown
- Otherwise: Maghrib prayer time

**FR-010: Suhoor Time**
- Intent: `SuhoorTimeIntent`
- Triggers: "When is suhoor?", "What time is Fajr?", etc.
- During Ramadan with suhoor banner: Fajr time + countdown + reminder
- Otherwise: Fajr prayer time

**FR-011: Hijri Date**
- Intent: `HijriDateIntent`
- Triggers: "What is the Islamic date?", "What day of Ramadan?", etc.
- Response: Full hijri date + Ramadan day number if applicable

**FR-012: Session Continuity**
- All voice Q&A intents keep session open (`withShouldEndSession(false)`)
- Users can ask follow-up questions without re-opening the skill
- Reprompt: "Ask me another question."

### 3.6 Hadith / Quran Verse Rotation

**FR-013: Content Rotation**
- Display one Hadith or Quran verse (selected at render time)
- Content source: `content.json` bundled in Lambda
- Total pool: ~120 items (100 Hadiths + 17 Quran verses/duas + 3 messages)
- Language: Arabic text
- Rotation order: Sequential (not random) to ensure all content shown

### 3.7 Ramadan Companion

**FR-014: Ramadan Banners**
- Auto-detected from Hijri month (Ramadan = month 9)
- Banners displayed left-aligned, width 73vw (avoids countdown circle)
- **Fast Day banner**: "Fast Day X of 30 · Eid al-Fitr in ~Y days (~Mar Z)"
- **Suhoor banner**: "Suhoor ends in Xh Ym · Fajr at X:XX AM" (with urgency colors)
- **Iftar banner**: "Iftar in Xh Ym · Maghrib at X:XX PM" + Arabic dua (maxLines: 2)
- **Last 10 Nights**: "Night X of Last 10 · Seek Laylat al-Qadr!" + dua
- **Zakat reminder**: Days 25-30: "Remember to pay Zakat al-Fitr before Eid prayer"
- Banner spacing: 14dp, font: 21dp (Arabic dua: 19dp)

**FR-015: Iftar Dua Display**
- Arabic dua text shown in iftar banner when `showDua` is true
- `maxLines: 2` with `wrap: "wrap"` to prevent overflow

### 3.8 Dhul Hijjah & Hajj

**FR-016: Dhul Hijjah Banners**
- Auto-detected from Hijri month (Dhul Hijjah = month 12)
- **First 10 Days**: "Day X of Dhul Hijjah · Best 10 Days of the Year"
- **Hajj Countdown**: Days until 9th Dhul Hijjah
- **Day of Arafah** (9th): Fasting recommendation
- **Eid al-Adha** (10th): "Eid al-Adha Mubarak!" + Arabic greeting
- **Days of Tashreeq** (11th-13th): Takbeer reminder

### 3.9 Date Display

**FR-017: Dual Calendar Display**
- Gregorian: "Sunday, 15 March 2026" (below clock)
- Hijri: "26 Ramadan 1447" (header, right side) with moon phase emoji
- City name + madhab displayed under Hijri date
- Font sizes: moon 28dp, Hijri 22dp, city 17dp (with `shrink: 1`)

### 3.10 Persistent Display

**FR-018: Screen Persistence**
- APL `handleTick` fires SendEvent("PING") every 15 seconds
- Lambda responds to PING with re-rendered APL + `withShouldEndSession(false)`
- Silent `noop.mp4` video plays in background (1px, off-screen) for keep-alive
- Screen stays on My Prayer Time until user says "Alexa, stop"

---

## 4. Non-Functional Requirements

### 4.1 Performance
- APL initial render: < 2 seconds
- Prayer time API response: < 500ms (AlAdhan)
- Device Address API: < 300ms (cached per warm instance)
- Countdown update latency: ≤ 15 seconds drift (PING interval)
- Adhan trigger accuracy: within 1-minute window of prayer time

### 4.2 Availability
- AlAdhan API uptime: 99.5% (community-maintained, historically reliable)
- Lambda cold start: < 1 second (Node.js, minimal dependencies)
- Graceful degradation: Show cached times if API call fails
- Location fallback: Env var defaults if Device Address API unavailable

### 4.3 Cost
| Resource | Free Tier Limit | Expected Usage | Cost |
|---|---|---|---|
| Lambda invocations | 1M/month | ~122K/month | $0 |
| Lambda compute | 400K GB-sec/month | ~30K GB-sec/month | $0 |
| EventBridge events | 14M/month | ~200/month | $0 |
| S3 storage | 5GB | ~5MB | $0 |
| S3 requests | 20K GET/month | ~500/month | $0 |
| CloudWatch Logs | 5GB ingest | ~20MB/month | $0 |
| **Total** | | | **$0/month** |
| **Post free-tier** | | | **~$0.10/month** |

### 4.4 Security
- Device Address: Read-only, user must explicitly grant permission
- No PII stored in Lambda or S3
- No DynamoDB (stateless Lambda)
- S3 bucket: Public read on `audio/*` prefix only
- IAM: Lambda role with least-privilege
- SKILL_ID validation on all requests

---

## 5. APL Screen Design

### 5.1 Main Screen Layout (Echo Show — 1280x800)

```
┌──────────────────────────────────────────────────────────┐
│ ☪ My Prayer Time          🌔 26 Ramadan 1447            │
│                            Apex · Hanafi    ┌─────────┐ │
│ ─────────────────────────────────────────── │  1h 43m │ │
│ 🌙 Fast Day 26 · Eid in ~5 days (~Mar 20)  │ ━━━━━━━ │ │
│ 🍽️ Iftar in 1h 43m · Maghrib at 7:23 PM    │ Maghrib │ │
│ ✨ Night 6 of Last 10 · Arabic dua...       │at 7:23PM│ │
│ 💰 Remember Zakat al-Fitr                   └─────────┘ │
│                                                          │
│                    5:36 PM                               │
│              Sunday, 15 March 2026                       │
│                                                          │
│ ┌──────┐┌──────┐┌──────┐┌────────┐┌──────┐             │
│ │ Fajr ││Dhuhr ││ Asar ││Maghrib ││Eaisha│             │
│ │6:16AM││1:24PM││4:48PM││ 7:23PM ││8:33PM│             │
│ │Iqama ││Iqama ││Iqama ││ Iqama  ││Iqama │             │
│ │6:30AM││1:30PM││5:30PM││ 7:25PM ││9:15PM│             │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Color Scheme
| Element | Color | Hex |
|---|---|---|
| Background | Cream | `#FDF5E6` |
| Primary green (title, borders) | Dark green | `#0D7039` |
| Prayer card background | Light grey | `#F0F0F0` |
| Next prayer highlight | Green tint | `rgba(13,112,57,0.12)` |
| Clock text | Dark | `#24332A` |
| Subtitle text | Grey | `#50575C` |
| Hijri date | Gold | `#95773E` |
| Countdown circle border | Green | `#0D7039` |
| Suhoor/Iftar urgent | Red | `#DB655E` |
| Suhoor/Iftar warning | Gold | `#D8B65F` |
| Last 10 nights | Gold | `#D8B65F` |
| Separator line | Green | `#0D7039` |

### 5.3 Typography
- App title: Bold, 40.5dp, green
- Clock: Light (200 weight), 104.5dp
- Prayer card name: Bold, 24dp
- Prayer card time: Bold, 26dp
- Iqama time: Bold, 22dp, green
- Banner text: Bold, 21dp
- Arabic dua text: 19dp
- Hijri date: 22dp, gold
- Countdown in circle: Bold, 30dp

### 5.4 Key APL Properties
- Countdown circle: `position: "absolute"`, `right: "4vw"`, `top: "14vh"`, 145dp diameter
- Ramadan/Dhul Hijjah banners: `width: "73vw"` (avoids circle overlap)
- Banner container: `wrap: "wrap"`, Arabic text `maxLines: 2`
- Prayer cards: `height: "34vh"`, `justifyContent: "spaceEvenly"`
- Clock section: `grow: 1` (fills remaining vertical space)
- PING interval: 15 seconds via `handleTick`

---

## 6. API Contracts

### 6.1 Alexa Device Address API
```
Client: handlerInput.serviceClientFactory.getDeviceAddressServiceClient()
Method: getFullAddress(deviceId)

Response fields used:
  address.city           → "Apex"
  address.stateOrRegion  → "NC"
  address.countryCode    → "US"
  address.postalCode     → "27502"

Permission required: alexa::devices:all:address:full:read
```

### 6.2 AlAdhan API
```
Endpoint: GET https://api.aladhan.com/v1/timingsByCity/{date}
Params:
  city     = "{deviceCity}"     (from Device Address or env var)
  country  = "{deviceCountry}"
  state    = "{deviceState}"
  method   = 2      (ISNA — North America)
  school   = 0      (Shafi'i default, configurable)

Response fields used:
  data.timings.Fajr    → "05:12"
  data.timings.Dhuhr   → "12:31"
  data.timings.Asr     → "16:15"
  data.timings.Maghrib → "18:19"
  data.timings.Isha    → "19:45"
  data.date.hijri.day        → "10"
  data.date.hijri.month.en   → "Ramadan"
  data.date.hijri.year       → "1447"

Cache key: {date}:{city}:{state}:{country}
```

### 6.3 Google Maps Directions API (Optional)
```
Endpoint: GET https://maps.googleapis.com/maps/api/directions/json
Params:
  origin      = "{deviceAddress}" or HOME_ADDRESS env var
  destination = MOSQUE_ADDRESS env var
  key         = GOOGLE_MAPS_API_KEY env var
  departure_time = now
  traffic_model  = best_guess

Response: duration_in_traffic.value (seconds) → converted to minutes
Fallback: TRAVEL_TIME_FALLBACK env var (default 12 minutes)
```

---

## 7. S3 Audio Files

| File | Size | Duration | Source | Used For |
|---|---|---|---|---|
| `adhan.mp3` | 1.0 MB | 2:53 | Standard adhan | Dhuhr, Asr, Maghrib, Isha |
| `adhan-fajr.mp3` | 2.8 MB | 4:02 | Sheikh Ali Mullah, Makkah (Internet Archive) | Fajr |
| `iftar-dua-1.mp3` | 197 KB | 0:08 | NooreSunnat.com | Allahumma inni laka sumtu... |
| `iftar-dua-2.mp3` | 548 KB | 0:23 | Internet Archive | Dhahaba az-zama'u... (**default**) |
| `noop.mp4` | 3.5 KB | -- | Generated | Silent video for APL keep-alive |

---

## 8. Interaction Model (Voice Intents)

| Intent | Sample Utterances | Slots |
|---|---|---|
| `PrayerTimesIntent` | "prayer times", "show prayer times", "salah times" | None |
| `NextPrayerIntent` | "next prayer", "when is the next prayer" | None |
| `EidCountdownIntent` | "how many days to Eid", "when does Ramadan end" | None |
| `IftarTimeIntent` | "when is iftar", "what time is maghrib" | None |
| `SuhoorTimeIntent` | "when is suhoor", "what time is fajr" | None |
| `HijriDateIntent` | "what is the Islamic date", "what day of Ramadan" | None |
| `AMAZON.HelpIntent` | "help" | Built-in |
| `AMAZON.StopIntent` | "stop" | Built-in |
| `AMAZON.CancelIntent` | "cancel" | Built-in |
| `AMAZON.FallbackIntent` | (unrecognized) | Built-in |
| `AMAZON.PauseIntent` | "pause" | Required for AudioPlayer |
| `AMAZON.ResumeIntent` | "resume" | Required for AudioPlayer |

---

## 9. Project File Structure

```
tawkit/
├── lambda/                      # Lambda handler (SAM CodeUri: ./lambda)
│   ├── index.js                 # Entry point: handlers, adhan SSML, PING, voice Q&A, location
│   ├── prayerService.js         # AlAdhan API + caching + location override
│   ├── contentService.js        # Hadith/verse sequential rotation
│   ├── countdownService.js      # Next prayer countdown + formatting
│   ├── aplBuilder.js            # APL datasource + directive builder
│   ├── reminderService.js       # Reminders + Device Address API + Google Maps travel time
│   ├── ramadanService.js        # Ramadan context (suhoor, iftar, last 10, zakat, eid countdown)
│   ├── hajjService.js           # Dhul Hijjah context (Arafah, Eid al-Adha, Tashreeq)
│   ├── hijriService.js          # Hijri date fallback calculation
│   ├── apl/
│   │   ├── mainScreen.json      # APL document (absolute circle, tick keep-alive, 73vw banners)
│   │   └── widget.json          # Echo Show home widget
│   ├── content/
│   │   ├── content.json         # 120+ Hadiths & Quran verses
│   │   └── ramadan.json         # Ramadan duas (suhoor intention, iftar, laylat al-qadr)
│   └── package.json
├── skill-package/
│   ├── skill.json               # Manifest (APL + AudioPlayer + Device Address permission)
│   └── interactionModels/custom/en-US.json  # 6 custom + 6 built-in intents
├── template.yaml                # AWS SAM (Lambda, S3, EventBridge, 18+ parameters)
├── events/launch.json           # Test event for sam local invoke
├── scripts/                     # deploy.sh, port-ahadith.js, port-slides.js
├── CLAUDE.md                    # AI context file
├── FDD.md                       # This document
└── README.md                    # Project documentation
```

---

## 10. Constraints & Known Limitations

| Constraint | Impact | Mitigation |
|---|---|---|
| SSML audio 240-second limit | Fajr adhan (4:02) is within limit | Monitor if limit changes |
| Adhan 5-minute cooldown | Screen may show stale data during cooldown | Cooldown covers longest adhan + buffer |
| Device Address requires permission | Users must grant in Alexa app | Permissions consent card + spoken instructions |
| US timezone mapping only | Non-US falls back to env var | Add international timezone detection in v2 |
| No multi-device adhan | Only plays on device running skill | Echo speaker pair may work; Alexa SDK limitation |
| Lambda cold starts | Location lost, re-fetched on next PING | Cached per warm instance; transparent to user |
| AlAdhan API community-maintained | Occasional downtime | Cache last successful response in Lambda memory |
| PING every 15 seconds | ~122K Lambda invocations/month | Within free tier; ~$0.06/month post free-tier |

---

## 11. v2 Roadmap (Post-Launch)

- [ ] Multi-device Adhan broadcasting (pending Alexa SDK support)
- [ ] International timezone auto-detection (non-US countries)
- [ ] Calculation method selection UI (ISNA, MWL, Egyptian, etc.)
- [ ] Madhab selection UI (Hanafi/Shafi'i toggle)
- [ ] English translations of Hadiths
- [ ] Iqama countdown timer (after adhan)
- [ ] Azkar screen post-prayer
- [ ] Custom prayer time adjustments (+/- minutes per prayer)
- [ ] DynamoDB for user preferences persistence
- [ ] Multiple language support (Arabic, Urdu)
- [ ] Alexa certification for public skill store

---

*Document Owner: Atif Jaffery*
*Last Updated: March 2026*
*Status: v1.1 — Development*
