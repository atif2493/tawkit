/**
 * hijriService.js
 * Hijri date calculation ported from Tawkit v9.61 (m2body.js).
 * AlAdhan API returns Hijri; this is LOCAL fallback when API is unavailable.
 */

const HIJRI_MONTHS_AR = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
  'جمادى الأولى', 'جمادى الثانية', 'رجب', 'شعبان',
  'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
];

const HIJRI_MONTHS_EN = [
  'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani',
  'Jumada al-Ula', 'Jumada al-Thani', 'Rajab', 'Sha\'ban',
  'Ramadan', 'Shawwal', 'Dhul Qa\'dah', 'Dhul Hijjah'
];

function intPart(floatNum) {
  if (floatNum < -0.0000001) return Math.ceil(floatNum - 0.0000001);
  return Math.floor(floatNum + 0.0000001);
}

function gregorianToHijri(myDate, adjustment = 0) {
  let d = parseInt(myDate.getDate());
  let m = parseInt(myDate.getMonth() + 1);
  let y = parseInt(myDate.getFullYear());
  let jd;

  if ((y > 1582) || ((y === 1582) && (m > 10)) || ((y === 1582) && (m === 10) && (d > 14))) {
    jd = intPart((1461 * (y + 4800 + intPart((m - 14) / 12))) / 4) +
         intPart((367 * (m - 2 - 12 * (intPart((m - 14) / 12)))) / 12) -
         intPart((3 * (intPart((y + 4900 + intPart((m - 14) / 12)) / 100))) / 4) + d - 32075;
  } else {
    jd = 367 * y - intPart((7 * (y + 5001 + intPart((m - 9) / 7))) / 4) +
         intPart((275 * m) / 9) + d + 1729777;
  }

  let l = jd - 1948440 + 10632;
  const n = intPart((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = (intPart((10985 - l) / 5316)) * (intPart((50 * l) / 17719)) +
            (intPart(l / 5670)) * (intPart((43 * l) / 15238));
  l = l - (intPart((30 - j) / 15)) * (intPart((17719 * j) / 50)) -
      (intPart(j / 16)) * (intPart((15238 * j) / 43)) + 29;
  m = intPart((24 * l) / 709);
  d = l - intPart((709 * m) / 24);
  y = 30 * n + j - 30;

  d = d + adjustment;
  if (d < 1)  { d = 30; m--; }
  if (d > 30) { d = 1;  m++; }
  if (m < 1)  m = 12;
  if (m > 12) m = 1;

  return {
    day: d, monthNum: m, monthAr: HIJRI_MONTHS_AR[m - 1], monthEn: HIJRI_MONTHS_EN[m - 1],
    year: y, isRamadan: (m === 9), isDhulHijja: (m === 12), isShaban: (m === 8),
  };
}

function formatHijriDate(date) {
  const h = gregorianToHijri(date);
  return {
    ar: `${h.day} ${h.monthAr} ${h.year}`,
    en: `${h.day} ${h.monthEn} ${h.year}`,
    day: h.day, month: h.monthEn, monthAr: h.monthAr, year: h.year, isRamadan: h.isRamadan,
  };
}

module.exports = { gregorianToHijri, formatHijriDate, HIJRI_MONTHS_AR, HIJRI_MONTHS_EN };
