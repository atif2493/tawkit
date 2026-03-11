# CLAUDE.md — Project AI Context
## Tawkit Echo | Alexa Skill for Echo Show
> This file gives AI assistants (Claude, Cursor, Copilot) full project context.
> **Source of truth:** Synced from README.md + FDD.md. When those change, update this file so memory stays current.

---

## WHAT THIS PROJECT IS

An Amazon Alexa Skill that displays Islamic prayer times on Amazon Echo Show as a **persistent home screen widget**. Think of it as a spiritual clock — always visible, always accurate.

**Inspired by:** [tawkit.net](https://www.tawkit.net) — an offline HTML/JS prayer times app for mosque displays. We are NOT porting that code (it's obfuscated). We are rebuilding the core features natively for Echo Show.

---

## WHAT WE DECIDED (Design Decisions Log)

| Decision | Rationale |
|---|---|
| **APL Widget, not PWA** | PWA in Silk Browser loses persistence when Echo Show screensaver activates. Widget persists. |
| **AlAdhan.com API** | Free, no API key, reliable, returns Hijri date too. Supports city-name lookup. |
| **City-based location (not lat/lng)** | `timingsByCity` endpoint is simpler — user provides `city=Apex&state=NC&country=US`, API resolves coords. |
| **Default city: Apex, NC** | User's home city. Easily overridden via env vars. |
| **Hanafi madhab (`school=1`)** | User's madhab. Only affects Asr time (later). All other prayers unchanged. |
| **No DynamoDB in v1** | Single home location, no user accounts. Lambda is stateless — config via env vars only. |
| **No adhan-js library** | AlAdhan API does the calculation. We just parse the response. |
| **SAM over CDK** | Simpler for Alexa skill deployment. ASK CLI integrates well with SAM. |
| **Sequential content rotation** | Ensures all Hadiths/verses are shown, no repetition. Better than random. |
| **S3 for audio** | Adhan MP3 files served from S3 via pre-signed URLs. Secure, cheap. |
| **Content from original Tawkit** | Ported `ahadith.js` (100 hadiths) + `messages-slides.js` (17 verses) into `content/content.json`. |

---

## WHAT THE ORIGINAL TAWKIT CODEBASE LOOKS LIKE

We analyzed the downloaded Tawkit v9.61 source files. Key findings:

```
index.html          1,488 lines  — full single-page app
m2body.js         190,644 bytes  — OBFUSCATED (1,740 unique obfuscated vars like v9483963)
m1prime.js         12,100 bytes  — OBFUSCATED initialization
style0/1/2.css     ~5,700 lines  — CSS (not reusable for APL)
wcsv.js            35,074 bytes  — Pre-computed prayer times CSV (365 rows, London example)
ahadith.js         10,661 bytes  — 100+ Hadiths in Arabic ✅ REUSABLE
messages-slides.js  3,802 bytes  — 17 Quran verses/duas ✅ REUSABLE
messages-bottom.js  3,256 bytes  — 20 scrolling announcements ✅ REUSABLE
settings-defaults.js 6,033 bytes — All config defaults ✅ REFERENCE for features
countries.js       10,661 bytes  — City/country list for prayer time lookup
```

**Reusable content has been ported to:** `content/content.json`

**Prayer time approach in original Tawkit:** Uses pre-computed CSV (wcsv.js) — NOT algorithmic. Mosques upload their own verified yearly times. We use AlAdhan API instead which gives us auto-calculation.

**tawkit-9 folder in repo:** Reference only (e.g. `tawkit-9/data/` with country/location data). Do not use for runtime; Tawkit Echo uses AlAdhan API + content.json.

---

## KEY PEOPLE & CONTEXT

- **Developer:** Atif Jaffery — Principal Solutions Architect, expert in AWS/Azure/GCP, C programming background, good JavaScript/Node.js capability
- **Use case:** Personal home use (default location: Apex, NC, USA)
- **Device:** Amazon Echo Show (has screen, runs Alexa)
- **IDE:** Cursor (with AI coding assistance)

---

## LOCATION & MADHAB CONFIG (Defaults)

```javascript
city:     'Apex'               // Default city
state:    'NC'                 // North Carolina
country:  'US'                 // United States
timezone: 'America/New_York'
method:   2                    // ISNA — standard for North America
school:   1                    // Hanafi madhab (affects Asr only — later time)
```

### Why Hanafi?
`school=1` in AlAdhan API applies the Hanafi juristic ruling for Asr:
- **Hanafi Asr** starts when an object's shadow = 2x its height (later, typically 4–4:30pm)
- **Shafi Asr** starts when shadow = 1x height (earlier, typically 3:30–4pm)
- All other prayers (Fajr, Dhuhr, Maghrib, Isha) are **identical** between the two schools

### AlAdhan City-Based API Call
```
GET https://api.aladhan.com/v1/timingsByCity
  ?city=Apex
  &country=US
  &state=NC
  &method=2
  &school=1
```
No lat/lng needed — AlAdhan resolves coordinates from city name automatically.

**Location via environment (v1):** Template.yaml passes: `PRAYER_CITY`, `PRAYER_STATE`, `PRAYER_COUNTRY`, `PRAYER_METHOD`, `PRAYER_SCHOOL`, `PRAYER_TIMEZONE`, `SKILL_ID`, `S3_BUCKET`. Lambda reads these; defaults (Apex, NC, US, method=2, school=1) are in SAM Parameters.

---

## PRAYER NAMES (used consistently throughout codebase)

| Key | Arabic | Display |
|---|---|---|
| `fajr` | الفجر | Fajr |
| `dhuhr` | الظهر | Dhuhr |
| `asr` | العصر | Asr |
| `maghrib` | المغرب | Maghrib |
| `isha` | العشاء | Isha |

Note: Tawkit original uses `FAJR, SHRQ, DOHR, ASSR, MGRB, ISHA` — we use cleaner standard names.

---

## ALADHAN API — QUICK REFERENCE

```
GET https://api.aladhan.com/v1/timingsByCity/{date}
  ?city=Apex&country=US&state=NC&method=2&school=1

Key parameters:
  method=2   → ISNA calculation (North America standard)
  school=1   → Hanafi madhab (Asr later) ← always use this

Key response fields:
  data.timings.Fajr       "05:12"  (24hr local time)
  data.timings.Dhuhr      "12:31"
  data.timings.Asr        "16:15"  ← Hanafi Asr (later than Shafi ~15:48)
  data.timings.Maghrib    "18:19"
  data.timings.Isha       "19:45"
  data.date.hijri.day     "10"
  data.date.hijri.month.en "Ramadan"
  data.date.hijri.year    "1447"
```

No API key needed. Rate limit: generous for personal use.

---

## CURRENT STATUS

- [x] FDD.md, README.md, CLAUDE.md written
- [x] **lambda/** — index.js, prayerService.js, contentService.js, countdownService.js, aplBuilder.js, hijriService.js; apl/mainScreen.json + content/content.json bundled; package.json (ask-sdk-core)
- [x] **content/** — content.json (hadiths + verses); audio/ placeholder (.gitkeep)
- [x] **apl/** — mainScreen.json, widget.json, styles.json
- [x] **skill-package/** — skill.json, interactionModels/custom/en-US.json
- [x] **events/** — launch.json for sam local invoke
- [x] **scripts/** — deploy.sh, port-ahadith.js, port-slides.js
- [x] template.yaml (TawkitFunction, S3, EventBridge, Parameters)
- [x] Root package.json (test, install:lambda, build, local:invoke)
- [ ] content/audio/ — add adhan-fajr.mp3, adhan-normal.mp3 for Adhan playback
- [ ] EventBridge — placeholder cron times in template; v2 = dynamic
- [ ] Additional tests, Alexa certification — TODO

---

## KNOWN CONSTRAINTS

1. **Adhan auto-play**: Alexa restricts autonomous audio. User must enable the skill once and opt into notifications. Adhan triggers via Proactive Events API after that.
2. **Widget refresh**: APL-W refresh rate is limited. Countdown may drift up to 60 seconds. Acceptable.
3. **Echo Show screensaver**: Widget persists through it (this was the whole reason we chose widget over PWA).
4. **AlAdhan API**: Community-maintained. Cache last successful response in Lambda `/tmp` for resilience.
5. **Alexa certification**: Takes 3-5 business days. Submit early.

---

## WHAT NOT TO BUILD (explicitly out of scope for v1)

- ❌ Multi-user / multi-mosque support
- ❌ Admin web portal
- ❌ User authentication
- ❌ Custom CSV prayer times upload
- ❌ Iqama countdown
- ❌ Jumah special display
- ❌ Screen themes / backgrounds
- ❌ English translations of Hadiths
- ❌ Azkar post-prayer screen
- ❌ Madhab selection UI (Hanafi is fixed default in v1)
- ❌ Lat/lng input — city name is sufficient via `timingsByCity` endpoint

All of the above are v2+ features. Do not add complexity to v1.

---

## HOW TO RUN LOCALLY

```bash
# Install dependencies
npm install && cd lambda && npm install && cd ..

# Test Lambda locally (requires SAM CLI)
sam local invoke TawkitFunction --event events/launch.json

# Run unit tests
npm test

# Deploy
sam build && sam deploy
ask deploy
```

---

## FILES AI SHOULD NEVER MODIFY

- `content/content.json` — Hadith/Quran content (religious text, must be accurate)
- `template.yaml` IAM roles section — security sensitive
- `.env` — never exists in repo, never create it

---

## HELPFUL LINKS

- [APL Reference](https://developer.amazon.com/docs/alexa-presentation-language/apl-overview.html)
- [ASK SDK v2 Docs](https://developer.amazon.com/docs/alexa/alexa-skills-kit-sdk-for-nodejs/overview.html)
- [AlAdhan API Docs](https://aladhan.com/prayer-times-api)
- [Alexa Home Widgets Guide](https://developer.amazon.com/docs/alexa/home-cards/understand-alexa-home-cards.html)
- [AWS SAM Docs](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
- [Alexa Skill Certification Checklist](https://developer.amazon.com/docs/alexa/custom-skills/certification-requirements-for-custom-skills.html)
- [Tawkit.net](https://www.tawkit.net) — Original inspiration (do not copy code)

---

## PROJECT STRUCTURE (KEY PATHS)

**Current layout (built per README/FDD):**

```
<repo root>/
├── lambda/                  # SAM CodeUri: ./lambda
│   ├── index.js, prayerService.js, contentService.js, countdownService.js, aplBuilder.js, hijriService.js
│   ├── apl/mainScreen.json  # APL doc (sent inline by Lambda)
│   ├── content/content.json # Bundled for deploy
│   └── package.json
├── apl/                     # Source APL (mainScreen, widget, styles)
├── content/                 # Source content + content/audio/ for Adhan MP3s
├── skill-package/          # skill.json + interactionModels/custom/en-US.json
├── events/launch.json       # Test event: sam local invoke TawkitFunction
├── scripts/                 # deploy.sh, port-ahadith.js, port-slides.js
├── template.yaml            # TawkitFunction, ContentBucket, EventBridge
├── package.json             # npm test, install:lambda, build, local:invoke
├── docs/                    # ADRs, runbooks
├── Archive Files/           # Legacy/reference
└── tawkit-9/                # Reference: original Tawkit data
```
