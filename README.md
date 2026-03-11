# 🕌 Tawkit Echo
### Islamic Prayer Times — Amazon Echo Show Alexa Skill

A native Alexa Skill with APL widget for Amazon Echo Show that displays Islamic prayer times, countdown to next prayer, Adhan audio alerts, and rotating Quran verses/Hadiths. Inspired by [tawkit.net](https://www.tawkit.net).

---

## ✨ Features

| Feature | Status |
|---|---|
| 5 Daily prayer times (Fajr, Dhuhr, Asr, Maghrib, Isha) | ✅ v1.0 |
| Countdown to next prayer (live) | ✅ v1.0 |
| Adhan audio at prayer time | ✅ v1.0 |
| Rotating Hadiths & Quran verses (Arabic) | ✅ v1.0 |
| Hijri + Gregorian date display | ✅ v1.0 |
| Echo Show home screen widget (persistent) | ✅ v1.0 |
| Auto prayer time calculation from location | ✅ v1.0 |
| User-configurable location | 🔜 v2.0 |
| English Hadith translations | 🔜 v2.0 |
| Iqama countdown | 🔜 v2.0 |

---

## 🏗️ Architecture

```
AlAdhan API (free) → AWS Lambda → Alexa APL Widget (Echo Show)
                          ↑
                   EventBridge (fires at each prayer time)
                          ↓
                    S3 (Adhan MP3s + content JSON)
```

**Monthly AWS Cost: ~$0** (within free tier)

---

## 📋 Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20.x | [nodejs.org](https://nodejs.org) |
| AWS CLI | v2 | [aws.amazon.com/cli](https://aws.amazon.com/cli) |
| ASK CLI | v2 | `npm install -g ask-cli` |
| AWS SAM CLI | latest | [docs.aws.amazon.com/sam](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) |
| Amazon Developer Account | — | [developer.amazon.com](https://developer.amazon.com) |
| AWS Account | — | [aws.amazon.com](https://aws.amazon.com) |

---

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/yourname/tawkit-echo.git
cd tawkit-echo
npm install
cd lambda && npm install
```

### 2. Configure AWS & Alexa
```bash
# Configure AWS credentials
aws configure

# Configure ASK CLI (links to your Amazon Developer account)
ask configure
```

### 3. Configure Location & Madhab
Edit `lambda/prayerService.js` (or use SAM parameters in template.yaml):
```javascript
const CONFIG = {
  city:     'Apex',              // ← Your city name
  state:    'NC',                // ← Your state/province
  country:  'US',                // ← Your country code
  method:   2,                   // 2=ISNA (North America) — see table below
  school:   1,                   // 1=Hanafi (Asr later), 0=Shafi (Asr earlier)
  timezone: 'America/New_York'   // ← Your timezone
};
```

> **Hanafi vs Shafi Asr:** The only difference between `school=1` (Hanafi) and `school=0` (Shafi) is the Asr prayer time. Hanafi Asr is typically 45–60 minutes later than Shafi. All other prayer times are identical.

### 4. Upload Audio Files
```bash
# Upload Adhan MP3 files to S3
aws s3 cp content/audio/adhan-fajr.mp3   s3://your-bucket-name/audio/
aws s3 cp content/audio/adhan-normal.mp3  s3://your-bucket-name/audio/

# Update S3 bucket name in template.yaml
```

### 5. Deploy
```bash
# Build & deploy AWS resources (Lambda + EventBridge + S3)
sam build
sam deploy --guided   # First time only, follow prompts

# Deploy Alexa Skill
ask deploy
```

### 6. Enable on Echo Show
1. Open Alexa app on your phone
2. Search for **"Tawkit Prayer Times"**
3. Enable the skill
4. On Echo Show: swipe down → **"Add Widget"** → **"Tawkit"**

---

## 🗂️ Project Structure

```
tawkit-echo/
├── lambda/                   # Lambda handler (SAM CodeUri: ./lambda)
│   ├── index.js              # Alexa skill entry point
│   ├── prayerService.js      # AlAdhan API + prayer logic
│   ├── contentService.js     # Hadith/verse rotation
│   ├── countdownService.js   # Next prayer countdown
│   ├── aplBuilder.js         # APL screen builder
│   ├── hijriService.js       # Hijri date fallback
│   ├── apl/mainScreen.json   # APL document (bundled, sent inline)
│   ├── content/content.json # Hadiths & verses (bundled for deploy)
│   └── package.json
├── apl/                      # Source APL (widget, mainScreen, styles)
│   ├── mainScreen.json
│   ├── widget.json           # Echo Show home widget
│   └── styles.json
├── content/                  # Source content + audio
│   ├── content.json          # 120+ Hadiths & Quran verses
│   └── audio/                # Adhan MP3 files (add your own)
├── skill-package/
│   ├── skill.json            # Alexa skill manifest
│   └── interactionModels/custom/en-US.json
├── events/
│   └── launch.json           # Test event for sam local invoke
├── scripts/
│   ├── deploy.sh             # SAM + ASK deploy
│   ├── port-ahadith.js       # Migrate ahadith.js → content
│   └── port-slides.js        # Migrate messages-slides.js → content
├── template.yaml             # AWS SAM infrastructure
├── FDD.md                    # Functional Design Document
└── README.md
```

---

## 🙏 Prayer Time Calculation Methods

The AlAdhan API supports multiple calculation methods. Set `method` in `prayerService.js`:

| Method # | Authority | Best For |
|---|---|---|
| 1 | University of Islamic Sciences, Karachi | Pakistan, Afghanistan |
| 2 | ISNA (Islamic Society of North America) | **USA, Canada** ← default |
| 3 | Muslim World League | Europe, Far East |
| 4 | Umm Al-Qura, Makkah | Saudi Arabia |
| 5 | Egyptian General Authority | Egypt, Africa |

### 🕌 Madhab (Juristic School) — Asr Prayer Only

| school value | Madhab | Asr Time | Notes |
|---|---|---|---|
| `school=1` | **Hanafi** | Later (~45–60 min later) | **Default in this app** |
| `school=0` | Shafi / Standard | Earlier | AlAdhan API default |

> Only Asr is affected by the school setting. Fajr, Dhuhr, Maghrib, and Isha are identical for both.

---

## 🔧 Local Development

```bash
# Test Lambda locally with SAM
sam local invoke TawkitFunction --event events/launch.json

# Watch logs
sam logs -n TawkitFunction --stack-name tawkit-echo --tail
```

### Test Event
Use `events/launch.json` for a LaunchRequest. Optional: create `events/test-event.json` for other request types.

---

## 📦 Content Management

Hadiths and Quran verses are stored in `content/content.json`. This was ported from Tawkit's original `ahadith.js` and `messages-slides.js`.

To add or edit content:
```json
{
  "hadiths": [
    {
      "id": 1,
      "text": "قالَ ﷺ : خيركم من تعلم القرآن وعلمه",
      "source": "رواه البخاري"
    }
  ],
  "verses": [
    {
      "id": 1,
      "text": "﴿ رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الآخِرَةِ حَسَنَةً ﴾",
      "surah": "البقرة: 201"
    }
  ]
}
```

---

## 🚢 Deployment Pipeline

```bash
# GitHub Actions auto-deploys on push to main
# See .github/workflows/deploy.yml

# Manual deploy
./scripts/deploy.sh production
```

---

## 📚 Key References

- [Alexa APL Documentation](https://developer.amazon.com/docs/alexa-presentation-language/apl-overview.html)
- [Alexa Skill Kit SDK (Node.js)](https://github.com/alexa/alexa-skills-kit-sdk-for-nodejs)
- [AlAdhan Prayer Times API](https://aladhan.com/prayer-times-api)
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [Alexa Home Screen Widgets](https://developer.amazon.com/docs/alexa/home-cards/understand-alexa-home-cards.html)
- [Tawkit.net](https://www.tawkit.net) — Original inspiration

---

## 🤝 Contributing

This project is for personal/masjid use. Contributions welcome:
1. Fork the repo
2. Create feature branch: `git checkout -b feature/iqama-countdown`
3. Commit: `git commit -m 'feat: add iqama countdown'`
4. Push & open a Pull Request

---

## 📄 License

Personal use only. Not for commercial distribution.  
Adhan audio files: Use royalty-free recordings only.  
Hadith content: Public domain Islamic texts.

---

## 🙌 Acknowledgements

- [Tawkit.net](https://www.tawkit.net) by the original author — for the inspiration and content (Hadiths, duas, design concepts)
- [AlAdhan.com](https://aladhan.com) — for the free prayer times API
- Amazon Alexa APL Team — for Echo Show widget support

---

*بسم الله الرحمن الرحيم*  
*Built with ❤️ for the Muslim community*
