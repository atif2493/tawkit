# Tawkit Echo
### Islamic Prayer Times — Amazon Echo Show Alexa Skill

A native Alexa Skill with APL display for Amazon Echo Show that shows Islamic prayer times, live countdown to next prayer, automatic Adhan audio at prayer times, Ramadan companion features, Dhul Hijjah/Hajj banners, and rotating Quran verses & Hadiths. Inspired by [tawkit.net](https://www.tawkit.net).

---

## Features

| Feature | Status |
|---|---|
| 5 Daily prayer times (Fajr, Dhuhr, Asr, Maghrib, Isha) | v1.0 |
| Live countdown to next prayer | v1.0 |
| Automatic Adhan audio at each prayer time (AudioPlayer) | v1.0 |
| Separate Fajr Adhan audio | v1.0 |
| Iqama times display per prayer | v1.0 |
| Rotating Hadiths & Quran verses (Arabic) | v1.0 |
| Hijri + Gregorian date display with moon phase | v1.0 |
| Persistent full-screen display (APL tick keep-alive) | v1.0 |
| Ramadan companion (Suhoor/Iftar countdown, last 10 nights, Zakat) | v1.0 |
| Dhul Hijjah banners (First 10 Days, Arafah, Eid al-Adha, Tashreeq) | v1.0 |
| Jumuah (Friday) prayer times display | v1.0 |
| Prayer reminders with travel time to mosque (Google Maps) | v1.0 |
| Cream background with light grey prayer cards UI | v1.0 |
| Shafi'i Asr calculation (configurable) | v1.0 |
| User-configurable location | v2.0 |
| Multi-device Adhan (Echo Dots) | v2.0 |

---

## Architecture

```
AlAdhan API (free) --> AWS Lambda --> Alexa APL Display (Echo Show)
                           |
                    EventBridge (fires at each prayer time)
                           |
                     S3 (Adhan MP3s + content JSON)
```

**How the persistent display works:**
```
User opens skill --> LaunchRequest --> APL rendered full-screen
  |
Every 15 seconds: APL handleTick fires SendEvent("PING")
  |
Lambda receives PING --> re-renders APL with updated countdown
  |
Session stays alive --> APL stays on screen --> repeat forever
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
| Amazon Developer Account | — | [developer.amazon.com](https://developer.amazon.com) |
| AWS Account | — | [aws.amazon.com](https://aws.amazon.com) |

---

## Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/yourname/tawkit-echo.git
cd tawkit-echo
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

| Parameter | Default | Description |
|---|---|---|
| `PrayerCity` | Apex | City name |
| `PrayerState` | NC | State/province |
| `PrayerCountry` | US | Country code |
| `PrayerMethod` | 2 | Calculation method (2=ISNA for North America) |
| `PrayerSchool` | 0 | 0=Shafi'i (earlier Asr), 1=Hanafi (later Asr) |
| `PrayerTimezone` | America/New_York | IANA timezone |
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

### 4. Upload Adhan Audio to S3
```bash
# Adhan audio must be MP3, mono, 22050Hz, 48kbps for Alexa compatibility
aws s3 cp audio/adhan.mp3      s3://my-prayer-time-content-ACCOUNTID/audio/
aws s3 cp audio/adhan-fajr.mp3 s3://my-prayer-time-content-ACCOUNTID/audio/
```

### 5. Deploy
```bash
sam build && sam deploy --guided   # First time
sam build && sam deploy            # Subsequent deploys
```

### 6. Enable on Echo Show
1. Open Alexa app on your phone
2. Search for **"My Prayer Time"**
3. Enable the skill
4. Say: "Alexa, open My Prayer Time"

---

## Adhan Auto-Play

Adhan plays automatically at each prayer time using the Alexa AudioPlayer interface:

- **Fajr**: Special Fajr adhan audio (`adhan-fajr.mp3`)
- **Dhuhr, Asr, Maghrib, Isha**: Standard adhan (`adhan.mp3`)
- Adhan triggers within a 1-minute window of the prayer time
- 3-minute cooldown prevents PING re-renders from interrupting playback
- Playback pause button stops adhan and clears cooldown

Audio files are served from S3 with a public read policy on the `audio/*` prefix.

---

## Ramadan Companion

During Ramadan (auto-detected from Hijri date), the display shows:

- **Suhoor banner**: Countdown to Fajr with "stop eating" reminders
- **Iftar banner**: Countdown to Maghrib
- **Last 10 Nights**: Special reminder to seek Laylat al-Qadr
- **Zakat al-Fitr**: Reminder during days 25-30
- **Eid countdown**: Days remaining until Eid al-Fitr
- **Suhoor/Iftar reminders**: Alexa reminders at 60/30/10 minutes before Fajr, 15/5/0 minutes before Maghrib

---

## Dhul Hijjah & Hajj

During Dhul Hijjah (auto-detected from Hijri date):

- **First 10 Days**: Banner encouraging increased good deeds
- **Hajj Countdown**: Days until 9th Dhul Hijjah
- **Day of Arafah** (9th): Fasting recommendation banner
- **Eid al-Adha** (10th): Eid Mubarak banner
- **Days of Tashreeq** (11th-13th): Takbeer reminder

---

## Project Structure

```
tawkit-echo/
├── lambda/                      # Lambda handler (SAM CodeUri: ./lambda)
│   ├── index.js                 # Alexa skill entry point + adhan + PING handler
│   ├── prayerService.js         # AlAdhan API + prayer times caching
│   ├── contentService.js        # Hadith/verse sequential rotation
│   ├── countdownService.js      # Next prayer countdown + formatting
│   ├── aplBuilder.js            # APL datasource + directive builder
│   ├── reminderService.js       # Prayer reminders + Google Maps travel time
│   ├── ramadanService.js        # Ramadan context detection
│   ├── hajjService.js           # Dhul Hijjah/Hajj context detection
│   ├── hijriService.js          # Hijri date fallback
│   ├── apl/
│   │   ├── mainScreen.json      # APL document (sent inline, tick keep-alive)
│   │   └── widget.json          # Echo Show home widget
│   ├── content/content.json     # Hadiths & verses (bundled for deploy)
│   └── package.json
├── content/                     # Source content + audio
│   ├── content.json             # 120+ Hadiths & Quran verses
│   └── audio/                   # Adhan MP3 files
├── skill-package/
│   ├── skill.json               # Alexa skill manifest (APL + AudioPlayer)
│   └── interactionModels/custom/en-US.json
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

### Madhab (Juristic School) — Asr Prayer Only

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
```

---

## Key References

- [Alexa APL Documentation](https://developer.amazon.com/docs/alexa-presentation-language/apl-overview.html)
- [Alexa Skill Kit SDK (Node.js)](https://github.com/alexa/alexa-skills-kit-sdk-for-nodejs)
- [AlAdhan Prayer Times API](https://aladhan.com/prayer-times-api)
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [Tawkit.net](https://www.tawkit.net) — Original inspiration

---

## License

Personal use only. Not for commercial distribution.
Adhan audio files: Use royalty-free recordings only.
Hadith content: Public domain Islamic texts.

---

## Acknowledgements

- [Tawkit.net](https://www.tawkit.net) — for the inspiration and content (Hadiths, duas, design concepts)
- [AlAdhan.com](https://aladhan.com) — for the free prayer times API
- Amazon Alexa APL Team — for Echo Show widget support

---

*Built for the Muslim community*
