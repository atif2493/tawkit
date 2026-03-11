# Functional Design Document (FDD)
## Tawkit Echo — Islamic Prayer Times Alexa Skill
### Version 1.0 | March 2026

---

## 1. Overview

### 1.1 Purpose
Tawkit Echo is an Alexa Skill with APL (Alexa Presentation Language) visual display, designed to run on Amazon Echo Show devices. It replicates the core functionality of tawkit.net — displaying Islamic prayer times, countdown to next prayer, Adhan audio alerts, and rotating Quran verses/Hadiths — as a persistent home screen widget on Echo Show.

### 1.2 Motivation
- The existing Tawkit offline HTML/JS app (`m2body.js`) is intentionally obfuscated and cannot run natively on Echo Show
- Echo Show's Silk Browser does not maintain persistence through screensaver
- A native Alexa Skill with APL widget persists on the Echo Show home screen
- Target users: Muslim households wanting a dedicated always-visible prayer times display

### 1.3 Madhab & Location
- **Juristic School:** Hanafi (`school=1` in AlAdhan API) — affects Asr prayer time only (later than Shafi/standard)
- **Default City:** Apex, NC, USA
- **Location input:** City name + country + state (no lat/lng required from user)
- **API endpoint used:** `timingsByCity` — AlAdhan resolves coordinates automatically from city name

### 1.4 Scope (v1.0)
| In Scope | Out of Scope |
|---|---|
| Prayer times display (5 daily prayers) | Multi-mosque admin portal |
| Countdown to next prayer | User accounts / login |
| Adhan audio on prayer time | Azkar post-prayer screens |
| Quran verse / Hadith rotation | Iqama countdown |
| Hijri + Gregorian date display | Custom CSV prayer time upload |
| Auto-calculate from location | Screen themes / backgrounds |
| Single fixed home location | Jumah (Friday) special handling |

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Echo Show Device                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              APL Widget (Home Screen)                │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  Prayer Times Grid  |  Next Prayer Countdown  │   │   │
│  │  │  Hadith / Quran Verse (rotating)              │   │   │
│  │  │  Hijri Date | Gregorian Date | Weather        │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └──────────────────────┬──────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │ Alexa Infrastructure
┌─────────────────────────▼───────────────────────────────────┐
│                     AWS Lambda                               │
│   Handler: getPrayerTimes()                                  │
│   - Fetch times from AlAdhan API                            │
│   - Calculate next prayer + countdown                        │
│   - Select Hadith (rotating index)                          │
│   - Build APL datasource payload                            │
└───┬─────────────────────┬────────────────────┬──────────────┘
    │                     │                    │
┌───▼────────┐  ┌─────────▼──────┐  ┌─────────▼──────────┐
│  AlAdhan   │  │  EventBridge   │  │    S3 Bucket        │
│  API       │  │  (5 rules,     │  │  - adhan-fajr.mp3   │
│  (Free,    │  │   one per      │  │  - adhan-normal.mp3 │
│  no auth)  │  │   prayer time) │  │  - content.json     │
└────────────┘  └────────────────┘  └────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Justification |
|---|---|---|
| Skill Frontend | APL 2024.1 + APL-W | Native Echo Show widget support |
| Backend | Node.js 20.x Lambda | ASK SDK v2 support, lightweight |
| Prayer Data | AlAdhan.com REST API | Free, reliable, no auth needed |
| Scheduling | Amazon EventBridge | Cron-based prayer time triggers |
| Audio | Alexa AudioPlayer + S3 | MP3 Adhan delivery |
| Content | JSON flat files in S3 | Hadiths, Quran verses, duas |
| IaC | AWS SAM | Lightweight, Alexa-native |
| CI/CD | GitHub Actions + ASK CLI | Automated deploy pipeline |

### 2.3 Data Flow

```
1. User opens Echo Show → Widget renders on home screen
2. EventBridge triggers Lambda at each prayer time
3. Lambda calls AlAdhan API → gets today's prayer times
4. Lambda calculates next prayer + seconds until it
5. Lambda selects next Hadith (round-robin from S3 JSON)
6. Lambda builds APL datasource → pushes to widget via 
   Alexa Proactive Events API
7. At prayer time → Lambda triggers AudioPlayer → plays Adhan MP3
8. Widget auto-refreshes every 60 seconds for countdown accuracy
```

---

## 3. Functional Requirements

### 3.1 Prayer Times Display

**FR-001: Display 5 Daily Prayer Times**
- Display Fajr, Dhuhr, Asr, Maghrib, Isha times
- Format: 12-hour AM/PM (configurable to 24hr in v2)
- Highlight the current/next prayer visually
- Dim/grey out past prayers for the day

**FR-002: Prayer Time Source**
- Endpoint: `https://api.aladhan.com/v1/timingsByCity`
- Parameters: `city`, `country`, `state`, `method`, `school`
- Calculation method: ISNA (`method=2`) — standard for North America
- Juristic school: **Hanafi** (`school=1`) — gives later Asr time per Hanafi madhab
- Refresh: Once per day at midnight + on skill launch
- Fallback: Cache previous day's times if API unavailable

```
GET https://api.aladhan.com/v1/timingsByCity
  ?city=Apex
  &country=US
  &state=NC
  &method=2
  &school=1        ← Hanafi Asr
```

**FR-003: Location Configuration**
- Default city: **Apex, NC, USA**
- Input: City name + State + Country (human-readable, no lat/lng needed)
- AlAdhan API resolves coordinates automatically from city name
- Configurable via environment variables (`PRAYER_CITY`, `PRAYER_STATE`, `PRAYER_COUNTRY`)
- User-editable location via Alexa account settings (v2)

### 3.2 Countdown Timer

**FR-004: Next Prayer Countdown**
- Display time remaining until next prayer in `Xh Xm` format
- Update every 60 seconds via APL auto-refresh
- When countdown < 10 minutes: change color to amber
- When countdown < 1 minute: change color to red
- After prayer time passes: immediately switch to next prayer

### 3.3 Adhan Audio

**FR-005: Adhan at Prayer Time**
- Play Adhan MP3 automatically at each prayer time
- Fajr prayer: play Fajr-specific Adhan (has "As-salatu khayrun minan-nawm")
- All other prayers: play standard Adhan
- Audio files stored in S3, served via CloudFront
- Duration: ~2 minutes per Adhan
- User can tap screen to stop early

**FR-006: Audio Trigger Mechanism**
- EventBridge rule fires at each prayer time (dynamic, recalculated daily)
- Lambda invokes Alexa Proactive Events API → triggers audio
- Fallback: User voice command "Alexa, play Adhan"

### 3.4 Hadith / Quran Verse Rotation

**FR-007: Content Rotation**
- Display one Hadith or Quran verse at bottom of widget
- Rotate every 30 seconds
- Content source: `content.json` in S3 (ported from `ahadith.js` and `messages-slides.js`)
- Total content pool: ~120 items (100 Hadiths + 17 Quran verses/duas + 3 messages)
- Language: Arabic text with transliteration (v2: English translation)
- Rotation order: Sequential (not random) to ensure all content shown

**FR-008: Content File Structure**
```json
{
  "hadiths": [
    { "id": 1, "text": "قالَ ﷺ : خيركم من تعلم القرآن وعلمه", "source": "البخاري" },
    ...
  ],
  "verses": [
    { "id": 1, "text": "﴿ رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً ﴾", "surah": "البقرة" },
    ...
  ]
}
```

### 3.5 Date Display

**FR-009: Dual Calendar Display**
- Show Gregorian date: "Tuesday, March 10, 2026"
- Show Hijri date: "10 Ramadan 1447" 
- Hijri calculation: Use AlAdhan API's built-in Hijri date field
- No external Hijri library needed

### 3.6 Widget Persistence

**FR-010: Echo Show Home Screen Persistence**
- Widget renders as Alexa Home Screen Widget
- Persists through Echo Show screensaver
- Visible without any voice command or interaction
- Tapping widget → launches full skill view with audio

---

## 4. Non-Functional Requirements

### 4.1 Performance
- Widget initial render: < 2 seconds
- Prayer time API response: < 500ms (AlAdhan SLA)
- Countdown update latency: ≤ 60 seconds drift max
- Adhan trigger accuracy: ± 30 seconds of actual prayer time

### 4.2 Availability
- AlAdhan API uptime: 99.5% (community-maintained, historically reliable)
- Lambda cold start: < 1 second (Node.js, minimal dependencies)
- Graceful degradation: Show cached times if API call fails

### 4.3 Cost
| Resource | Free Tier Limit | Expected Usage | Cost |
|---|---|---|---|
| Lambda invocations | 1M/month | ~4,500/month | $0 |
| EventBridge events | 14M/month | ~150/month | $0 |
| S3 storage | 5GB | <1MB | $0 |
| S3 requests | 20K GET/month | ~300/month | $0 |
| **Total** | | | **$0/month** |

### 4.4 Security
- No PII stored (location is city name in env vars in v1)
- No DynamoDB in v1 (stateless Lambda)
- S3 bucket: private, served via CloudFront signed URLs for audio
- IAM: Lambda role with least-privilege (S3 read, EventBridge read only)

---

## 5. APL Screen Design

### 5.1 Main Widget Layout (Echo Show 10 — 1280×800)

```
┌──────────────────────────────────────────────────────────────┐
│  🕌 TAWKIT                    Tuesday, 10 March 2026         │
│                               10 Ramadan 1447                │
├─────────┬──────────┬──────────┬──────────┬───────────────────┤
│  FAJR   │  DHUHR   │   ASR    │ MAGHRIB  │      ISHA         │
│  05:12  │  12:31   │  15:48   │  18:19   │     19:45         │
│   ✅    │   ✅     │   🔜    │          │                   │
├──────────────────────────────────────────────────────────────┤
│          ⏱  Next Prayer: Asr  —  in  1h 23m  45s            │
│          ████████████████████░░░░░░░░░░░░░░  (progress bar) │
├──────────────────────────────────────────────────────────────┤
│  قالَ ﷺ : خيركم من تعلم القرآن وعلمه                      │
│                                          — رواه البخاري      │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Color Scheme
| Element | Color | Hex |
|---|---|---|
| Background | Deep navy | `#0D1B2A` |
| Prayer time text | Gold | `#D4AF37` |
| Next prayer highlight | Bright white | `#FFFFFF` |
| Past prayer | Dimmed grey | `#4A4A4A` |
| Countdown urgent (<10m) | Amber | `#FFA500` |
| Countdown critical (<1m) | Red | `#FF4444` |
| Hadith text | Soft white | `#E8E8E8` |
| Header | Teal accent | `#4ECDC4` |

### 5.3 Typography
- Prayer times: Bold, 42dp
- Countdown: Bold, 36dp  
- Hadith/Verse: Regular, 22dp, right-to-left for Arabic
- Date: Regular, 20dp

---

## 6. API Contracts

### 6.1 AlAdhan API
```
Endpoint: GET https://api.aladhan.com/v1/timingsByCity/{date}
Params:
  city     = "Apex"
  country  = "US"
  state    = "NC"
  method   = 2      (ISNA — North America)
  school   = 1      (Hanafi — affects Asr only, gives later time)

Response fields used:
  data.timings.Fajr    → "05:12"
  data.timings.Dhuhr   → "12:31"
  data.timings.Asr     → "16:15"  ← Hanafi Asr (later than Shafi "15:48")
  data.timings.Maghrib → "18:19"
  data.timings.Isha    → "19:45"
  data.date.hijri.day        → "10"
  data.date.hijri.month.en   → "Ramadan"
  data.date.hijri.year       → "1447"

Note: school=1 (Hanafi) only changes Asr. All other prayers identical to school=0.
```

### 6.2 Lambda Response to Alexa
```json
{
  "prayerTimes": {
    "fajr": "05:12", "dhuhr": "12:31",
    "asr": "15:48", "maghrib": "18:19", "isha": "19:45"
  },
  "nextPrayer": { "name": "Asr", "time": "15:48", "secondsUntil": 4980 },
  "hijriDate": "10 Ramadan 1447",
  "gregorianDate": "Tuesday, 10 March 2026",
  "hadith": { "text": "قالَ ﷺ : خيركم من تعلم القرآن وعلمه", "source": "البخاري" },
  "contentIndex": 42
}
```

---

## 7. Project File Structure

```
tawkit-echo/
├── README.md
├── FDD.md
├── .cursorrules
├── template.yaml                    # AWS SAM template
├── package.json
│
├── lambda/
│   ├── index.js                     # Main Alexa skill handler
│   ├── prayerService.js             # AlAdhan API integration
│   ├── contentService.js            # Hadith/verse rotation logic
│   ├── hijriService.js              # Hijri date formatting
│   ├── countdownService.js          # Next prayer + countdown calc
│   └── aplBuilder.js                # Builds APL datasource payload
│
├── apl/
│   ├── widget.json                  # APL-W home screen widget
│   ├── mainScreen.json              # Full skill APL screen
│   └── styles.json                  # Shared APL styles
│
├── content/
│   ├── content.json                 # Hadiths + Quran verses
│   └── audio/
│       ├── adhan-fajr.mp3           # Fajr Adhan
│       └── adhan-normal.mp3         # Standard Adhan
│
├── skill-package/
│   ├── skill.json                   # Alexa skill manifest
│   └── interactionModels/
│       └── custom/
│           └── en-US.json           # Voice interaction model
│
├── scripts/
│   ├── port-ahadith.js              # Migrate ahadith.js → content.json
│   ├── port-slides.js               # Migrate messages-slides.js → content.json
│   └── deploy.sh                    # SAM deploy helper
│
└── .github/
    └── workflows/
        └── deploy.yml               # CI/CD pipeline
```

---

## 8. EventBridge Schedule Strategy

```
Daily at midnight (00:00):
  → Lambda fetches tomorrow's prayer times from AlAdhan
  → Calculates exact UTC timestamps for each prayer
  → Creates/updates 5 EventBridge rules dynamically

At each prayer time (dynamic cron):
  → EventBridge fires → Lambda triggered
  → AudioPlayer plays Adhan via Proactive Events API
  → Widget datasource refreshed with new next-prayer info
```

---

## 9. Constraints & Known Limitations

| Constraint | Impact | Mitigation |
|---|---|---|
| Alexa cannot auto-play audio without user consent | Adhan needs one-time skill enable | Document in README setup steps |
| APL-W widget refresh rate limited | Countdown may drift ±60s | Acceptable for prayer time use case |
| AlAdhan API is community-maintained | Occasional downtime possible | Cache last known times in Lambda /tmp |
| Alexa Skill certification takes 3-5 days | Delays initial release | Start cert process early |
| Echo Show sleeps but widget persists | Screen dims but times visible | Expected behavior, not a bug |

---

## 10. v2 Roadmap (Post-Launch)

- [ ] User-configurable city (city/state/country via Alexa settings)
- [ ] Calculation method selection (ISNA, MWL, Egyptian, etc.)
- [ ] Madhab selection (Hanafi/Shafi) — Hanafi is v1 default
- [ ] English translations of Hadiths
- [ ] Iqama countdown (configurable offset after Adhan)
- [ ] Jumah (Friday) special display
- [ ] Multiple language support
- [ ] Azkar screen post-prayer
- [ ] Custom CSV prayer times upload (restore wcsv.js functionality)
- [ ] Admin web UI at tawkit-echo-admin.com

---

*Document Owner: Atif Jaffery*  
*Last Updated: March 2026*  
*Status: Draft v1.0*
