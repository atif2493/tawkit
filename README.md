# My Prayer Time
### Islamic Prayer Times — Amazon Echo Show Alexa Skill

A native Alexa Skill with APL display for Amazon Echo Show that shows Islamic prayer times, live countdown to next prayer, automatic Adhan audio at prayer times, Iftar dua auto-play, location-aware prayer times, voice Q&A, Ramadan companion features, Dhul Hijjah/Hajj banners, and rotating Quran verses & Hadiths. Inspired by [tawkit.net](https://www.tawkit.net).

---

## Features

| Feature | Status |
|---|---|
| 5 Daily prayer times (Fajr, Dhuhr, Asr, Maghrib, Isha) | v1.0 |
| Live countdown to next prayer (circle widget) | v1.0 |
| Automatic Adhan audio at each prayer time (SSML audio) | v1.0 |
| Separate Fajr Adhan audio (Makkah, Sheikh Ali Mullah) | v1.0 |
| Iftar dua auto-play after Maghrib adhan during Ramadan | v1.1 |
| Location-aware prayer times (Alexa Device Address API) | v1.1 |
| Voice Q&A (Eid countdown, iftar/suhoor time, hijri date) | v1.1 |
| Iqama times display per prayer | v1.0 |
| Rotating Hadiths & Quran verses (Arabic) | v1.0 |
| Hijri + Gregorian date display with moon phase | v1.0 |
| Persistent full-screen display (APL tick keep-alive) | v1.0 |
| Ramadan companion (Suhoor/Iftar countdown, last 10 nights, Zakat) | v1.0 |
| Dhul Hijjah banners (First 10 Days, Arafah, Eid al-Adha, Tashreeq) | v1.0 |
| Jumuah (Friday) prayer times display | v1.0 |
| Prayer reminders with travel time to mosque (Google Maps) | v1.0 |
| Permissions consent card for location setup | v1.1 |
| Cream background with light grey prayer cards UI | v1.0 |
| Multi-device Adhan (Echo speaker pair) | v2.0 |

---

## Architecture

```
Alexa Device Address API --> AWS Lambda --> AlAdhan API (free)
                                 |
                          Alexa APL Display (Echo Show)
                                 |
                          EventBridge (fires at each prayer time)
                                 |
                           S3 (Adhan MP3s + Iftar Dua + content JSON)
```

**How the persistent display works:**
```
User opens skill --> LaunchRequest --> APL rendered full-screen
  |
  +--> Device Address API --> get user's city/state/country
  |
  +--> AlAdhan API --> fetch prayer times for user's location
  |
Every 15 seconds: APL handleTick fires SendEvent("PING")
  |
Lambda receives PING --> re-renders APL with updated countdown
  |
At prayer time: SSML <audio> plays adhan (screen stays visible)
  |
At Maghrib (Ramadan): adhan + 2s pause + iftar dua auto-plays
  |
Session stays alive --> APL stays on screen --> repeat
```

The screen stays on My Prayer Time until the user says "Alexa, stop".

**Monthly AWS Cost: ~$0** (within free tier)

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20.x | [nodejs.org](https://nodejs.org) |
| AWS CLI | v2 | [aws.amazon.com/cli](https://aws.amazon.com/cli) |
| ASK CLI | v2 | `npm install -g ask-cli` |
| AWS SAM CLI | latest | [docs.aws.amazon.com/sam](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) |
| Amazon Developer Account | -- | [developer.amazon.com](https://developer.amazon.com) |
| AWS Account | -- | [aws.amazon.com](https://aws.amazon.com) |

---

## Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/atif2493/tawkit.git
cd tawkit
npm install
cd lambda && npm install
```

### 2. Configure AWS & Alexa
```bash
aws configure
ask configure
```

### 3. Configure Location & Madhab
Edit SAM parameters in `template.yaml` or override at deploy time:
```bash
sam deploy --parameter-overrides \
  "AlexaSkillId=amzn1.ask.skill.XXXX \
   PrayerCity=Apex \
   PrayerState=NC \
   PrayerCountry=US \
   PrayerSchool=0 \
   PrayerTimezone=America/New_York"
```

> **Note:** Location is now auto-detected via Alexa Device Address API. These env vars serve as fallback defaults when the user hasn't granted location permission.

| Parameter | Default | Description |
|---|---|---|
| `PrayerCity` | Apex | Fallback city name |
| `PrayerState` | NC | Fallback state/province |
| `PrayerCountry` | US | Fallback country code |
| `PrayerMethod` | 2 | Calculation method (2=ISNA for North America) |
| `PrayerSchool` | 0 | 0=Shafi'i (earlier Asr), 1=Hanafi (later Asr) |
| `PrayerTimezone` | America/New_York | Fallback IANA timezone |
| `IqamaFajr` | 06:30 | Iqama time (24hr) |
| `IqamaDhuhr` | 13:30 | Iqama time (24hr) |
| `IqamaAsr` | 17:30 | Iqama time (24hr) |
| `IqamaMaghrib` | 19:25 | Iqama time (24hr) |
| `IqamaIsha` | 21:15 | Iqama time (24hr) |
| `Jumuah1` | 12:15 | First Jumuah khutbah time |
| `Jumuah2` | 13:30 | Second Jumuah khutbah time |
| `HomeAddress` | Apex, NC | Origin for travel time |
| `MosqueAddress` | Apex Mosque, 733 Center St... | Mosque address for travel time |
| `GoogleMapsApiKey` | (empty) | Google Maps Directions API key |
| `TravelTimeFallback` | 12 | Fallback travel time in minutes |

### 4. Upload Audio to S3
```bash
aws s3 cp audio/adhan.mp3        s3://my-prayer-time-content-ACCOUNTID/audio/
aws s3 cp audio/adhan-fajr.mp3   s3://my-prayer-time-content-ACCOUNTID/audio/
aws s3 cp audio/iftar-dua-1.mp3  s3://my-prayer-time-content-ACCOUNTID/audio/
aws s3 cp audio/iftar-dua-2.mp3  s3://my-prayer-time-content-ACCOUNTID/audio/
aws s3 cp audio/noop.mp4         s3://my-prayer-time-content-ACCOUNTID/audio/
```

### 5. Deploy
```bash
sam build && sam deploy --guided   # First time
sam build && sam deploy            # Subsequent deploys
```

### 6. Deploy Interaction Model
```bash
ask smapi set-interaction-model \
  --skill-id amzn1.ask.skill.XXXX \
  --stage development \
  --locale en-US \
  --interaction-model "$(cat skill-package/interactionModels/custom/en-US.json)"
```

### 7. Enable on Echo Show
1. Open Alexa app on your phone
2. Search for **"My Prayer Time"**
3. Enable the skill
4. Grant **Device Address** permission (Settings > My Prayer Time > Permissions)
5. Ensure your home address is set in the Alexa app
6. Say: "Alexa, open My Prayer Time"

---

## Location-Aware Prayer Times

The skill automatically detects the user's location using the **Alexa Device Address API**:

1. On first launch, the skill requests the device's registered address
2. Extracts city, state, and country from the address
3. Maps US states to correct IANA timezones (all 50 states + DC)
4. Fetches prayer times from AlAdhan API for the user's actual location
5. Falls back to env var defaults if permission not granted

If location permission is not granted, Alexa will:
- Speak a message explaining how to enable it
- Show a **Permissions Consent Card** in the Alexa app
- Continue showing prayer times for the default location

---

## Adhan Auto-Play

Adhan plays automatically at each prayer time using SSML `<audio>` tags:

- **Fajr**: Makkah Fajr adhan (Sheikh Ali Mullah, 4:02)
- **Dhuhr, Asr, Maghrib, Isha**: Standard adhan (2:53)
- **Maghrib during Ramadan**: Adhan + 2s pause + Iftar Dua #2 (23s)
- Adhan triggers within a 1-minute window of the prayer time
- 5-minute cooldown prevents PINGs from interrupting playback
- APL screen stays visible during playback (no AudioPlayer takeover)
- Screen auto-updates on next PING after adhan finishes

### S3 Audio Files
| File | Duration | Description |
|---|---|---|
| `adhan.mp3` | 2:53 | Standard adhan for Dhuhr, Asr, Maghrib, Isha |
| `adhan-fajr.mp3` | 4:02 | Makkah Fajr adhan (Sheikh Ali Mullah) |
| `iftar-dua-1.mp3` | 0:08 | Allahumma inni laka sumtu... |
| `iftar-dua-2.mp3` | 0:23 | Dhahaba az-zama'u... (default, plays at Maghrib) |
| `noop.mp4` | -- | Silent video for APL keep-alive |

---

## Voice Q&A

While the skill is open, users can ask questions verbally:

| Question | Example phrases |
|---|---|
| Eid countdown | "How many days to Eid?", "When does Ramadan end?" |
| Iftar time | "When is iftar?", "What time is Maghrib?" |
| Suhoor time | "When is suhoor?", "What time is Fajr?" |
| Hijri date | "What is the Islamic date?", "What day of Ramadan?" |
| Next prayer | "When is the next prayer?" |
| All times | "Show prayer times" |
| Help | "Help" (lists all available questions) |

The session stays open after each answer so users can ask follow-up questions.

---

## Ramadan Companion

During Ramadan (auto-detected from Hijri date), the display shows:

- **Suhoor banner**: Countdown to Fajr with urgency colors
- **Iftar banner**: Countdown to Maghrib with Arabic dua text
- **Last 10 Nights**: Special reminder to seek Laylat al-Qadr with dua
- **Zakat al-Fitr**: Reminder during days 25-30
- **Eid countdown**: Days remaining until Eid al-Fitr
- **Iftar dua auto-play**: After Maghrib adhan, plays "Dhahaba az-zama'u..." dua
- **Suhoor/Iftar reminders**: Alexa reminders at configurable intervals

---

## Dhul Hijjah & Hajj

During Dhul Hijjah (auto-detected from Hijri date):

- **First 10 Days**: Banner encouraging increased good deeds
- **Hajj Countdown**: Days until 9th Dhul Hijjah
- **Day of Arafah** (9th): Fasting recommendation banner
- **Eid al-Adha** (10th): Eid Mubarak banner
- **Days of Tashreeq** (11th-13th): Takbeer reminder

---

## APL Screen Layout

```
+----------------------------------------------------------+
| My Prayer Time          moon Hijri Date   [Countdown]    |
| ---------------------------------------------------      |  Circle (abs pos)
| Ramadan banners (left-aligned, 73vw)      [  1h 43m ]   |  right: 4vw
| - Fast Day / Eid countdown                [ Maghrib ]    |  top: 14vh
| - Iftar/Suhoor countdown                  [at 7:23PM]   |
| - Last 10 Nights + dua                                   |
| - Zakat reminder                                         |
|                                                          |
|                    5:36 PM                               |
|              Sunday, 15 March 2026                       |
|                                                          |
| [Fajr]  [Dhuhr]  [Asar]  [Maghrib]  [Eaisha]  [Jumuah] |
| 6:16AM   1:24PM  4:48PM   7:23PM    8:33PM    (Friday)  |
| Iqama    Iqama   Iqama    Iqama     Iqama               |
| 6:30AM   1:30PM  5:30PM   7:25PM    9:15PM              |
+----------------------------------------------------------+
```

---

## Project Structure

```
tawkit/
├── lambda/                      # Lambda handler (SAM CodeUri: ./lambda)
│   ├── index.js                 # Alexa skill entry point + adhan + PING + voice Q&A
│   ├── prayerService.js         # AlAdhan API + prayer times caching + location override
│   ├── contentService.js        # Hadith/verse sequential rotation
│   ├── countdownService.js      # Next prayer countdown + formatting
│   ├── aplBuilder.js            # APL datasource + directive builder
│   ├── reminderService.js       # Prayer reminders + Device Address API + Google Maps
│   ├── ramadanService.js        # Ramadan context detection
│   ├── hajjService.js           # Dhul Hijjah/Hajj context detection
│   ├── hijriService.js          # Hijri date fallback
│   ├── apl/
│   │   ├── mainScreen.json      # APL document (absolute circle, tick keep-alive)
│   │   └── widget.json          # Echo Show home widget
│   ├── content/
│   │   ├── content.json         # Hadiths & verses (bundled for deploy)
│   │   └── ramadan.json         # Ramadan duas (suhoor, iftar, laylat al-qadr)
│   └── package.json
├── content/                     # Source content + audio
│   ├── content.json             # 120+ Hadiths & Quran verses
│   └── audio/                   # Adhan + Iftar dua MP3 files
├── skill-package/
│   ├── skill.json               # Alexa skill manifest (APL + AudioPlayer + Device Address)
│   └── interactionModels/custom/en-US.json  # 6 custom intents + built-in intents
├── events/
│   └── launch.json              # Test event for sam local invoke
├── scripts/
│   ├── deploy.sh
│   ├── port-ahadith.js
│   └── port-slides.js
├── template.yaml                # AWS SAM (Lambda, S3, EventBridge)
├── CLAUDE.md                    # AI context file
├── FDD.md                       # Functional Design Document
└── README.md
```

---

## Prayer Time Calculation Methods

The AlAdhan API supports multiple calculation methods. Set via `PrayerMethod` parameter:

| Method # | Authority | Best For |
|---|---|---|
| 1 | University of Islamic Sciences, Karachi | Pakistan, Afghanistan |
| 2 | ISNA (Islamic Society of North America) | **USA, Canada** (default) |
| 3 | Muslim World League | Europe, Far East |
| 4 | Umm Al-Qura, Makkah | Saudi Arabia |
| 5 | Egyptian General Authority | Egypt, Africa |

### Madhab (Juristic School) -- Asr Prayer Only

| School | Madhab | Asr Time | Notes |
|---|---|---|---|
| `PrayerSchool=0` | **Shafi'i** | Earlier (~3:30-4:00 PM) | **Default** |
| `PrayerSchool=1` | Hanafi | Later (~4:15-5:00 PM) | Shadow = 2x object height |

> Only Asr is affected by the school setting. Fajr, Dhuhr, Maghrib, and Isha are identical for both.

---

## Local Development

```bash
# Test Lambda locally with SAM
sam local invoke MyPrayerTimeFunction --event events/launch.json

# Watch logs
sam logs -n my-prayer-time --stack-name tawkit-echo --tail

# Run unit tests
npm test

# Deploy interaction model
ask smapi set-interaction-model --skill-id SKILL_ID --stage development --locale en-US --interaction-model "$(cat skill-package/interactionModels/custom/en-US.json)"
```

---

## Key References

- [Alexa APL Documentation](https://developer.amazon.com/docs/alexa-presentation-language/apl-overview.html)
- [Alexa Skill Kit SDK (Node.js)](https://github.com/alexa/alexa-skills-kit-sdk-for-nodejs)
- [AlAdhan Prayer Times API](https://aladhan.com/prayer-times-api)
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [Alexa Device Address API](https://developer.amazon.com/docs/custom-skills/device-address-api.html)
- [Tawkit.net](https://www.tawkit.net) -- Original inspiration

---

## License

Personal use only. Not for commercial distribution.
Adhan audio: Makkah Fajr adhan (Sheikh Ali Mullah) via Internet Archive.
Iftar dua audio: NooreSunnat.com and Internet Archive.
Hadith content: Public domain Islamic texts.

---

## Acknowledgements

- [Tawkit.net](https://www.tawkit.net) -- for the inspiration and content (Hadiths, duas, design concepts)
- [AlAdhan.com](https://aladhan.com) -- for the free prayer times API
- [Internet Archive](https://archive.org) -- for Fajr adhan and Iftar dua audio
- Amazon Alexa APL Team -- for Echo Show widget support

---

*Built for the Muslim community*
