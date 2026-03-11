/**
 * Tests for countdownService.js
 * Logic ported from Tawkit v9.61 — verifying correctness
 */

const {
  timeToMinutes,
  addMinutesToTime,
  addOneHour,
  subtractOneHour,
  formatTo12Hr,
  getNextPrayer,
  formatCountdown,
  getCountdownUrgency,
  getPrayerStatuses,
} = require('../countdownService');

// ─── timeToMinutes (ported from Tawkit v9347263) ──────────────────────────────
describe('timeToMinutes', () => {
  it('converts midnight correctly',   () => expect(timeToMinutes('00:00')).toBe(0));
  it('converts noon correctly',       () => expect(timeToMinutes('12:00')).toBe(720));
  it('converts 14:30 correctly',      () => expect(timeToMinutes('14:30')).toBe(870));
  it('converts 23:59 correctly',      () => expect(timeToMinutes('23:59')).toBe(1439));
  it('converts Hanafi Asr correctly', () => expect(timeToMinutes('16:15')).toBe(975));
});

// ─── addMinutesToTime (ported from Tawkit v9392163) ───────────────────────────
describe('addMinutesToTime', () => {
  it('adds 30 minutes',            () => expect(addMinutesToTime('14:00', 30)).toBe('14:30'));
  it('handles hour rollover',      () => expect(addMinutesToTime('23:45', 30)).toBe('00:15'));
  it('subtracts minutes',          () => expect(addMinutesToTime('05:10', -15)).toBe('04:55'));
  it('handles midnight underflow', () => expect(addMinutesToTime('00:05', -10)).toBe('23:55'));
});

// ─── addOneHour / subtractOneHour (Tawkit v9377363 / v9377463) ─────────────────
describe('addOneHour', () => {
  it('adds one hour correctly', () => expect(addOneHour('14:30')).toBe('15:30'));
});
describe('subtractOneHour', () => {
  it('subtracts one hour correctly', () => expect(subtractOneHour('14:30')).toBe('13:30'));
});

// ─── formatTo12Hr ─────────────────────────────────────────────────────────────
describe('formatTo12Hr', () => {
  it('converts midnight',   () => expect(formatTo12Hr('00:00')).toBe('12:00 AM'));
  it('converts noon',       () => expect(formatTo12Hr('12:00')).toBe('12:00 PM'));
  it('converts afternoon',  () => expect(formatTo12Hr('16:15')).toBe('4:15 PM'));
  it('converts morning',    () => expect(formatTo12Hr('05:12')).toBe('5:12 AM'));
  it('converts 11 PM',      () => expect(formatTo12Hr('23:45')).toBe('11:45 PM'));
});

// ─── formatCountdown ──────────────────────────────────────────────────────────
describe('formatCountdown', () => {
  it('shows < 1m for under a minute', () => expect(formatCountdown(45)).toBe('< 1m'));
  it('shows minutes only',            () => expect(formatCountdown(2700)).toBe('45m'));
  it('shows hours and minutes',       () => expect(formatCountdown(4980)).toBe('1h 23m'));
  it('shows hours only when no mins', () => expect(formatCountdown(7200)).toBe('2h'));
});

// ─── getCountdownUrgency ──────────────────────────────────────────────────────
describe('getCountdownUrgency', () => {
  it('returns urgent for 0 mins',   () => expect(getCountdownUrgency(0)).toBe('urgent'));
  it('returns urgent for 1 min',    () => expect(getCountdownUrgency(1)).toBe('urgent'));
  it('returns warning for 5 mins',  () => expect(getCountdownUrgency(5)).toBe('warning'));
  it('returns warning for 10 mins', () => expect(getCountdownUrgency(10)).toBe('warning'));
  it('returns normal for 11 mins',  () => expect(getCountdownUrgency(11)).toBe('normal'));
  it('returns normal for 60 mins',  () => expect(getCountdownUrgency(60)).toBe('normal'));
});

// ─── getNextPrayer ────────────────────────────────────────────────────────────
describe('getNextPrayer', () => {
  const APEX_TIMES = {
    fajr:    '05:12',
    dhuhr:   '12:31',
    asr:     '16:15',   // Hanafi Asr
    maghrib: '18:19',
    isha:    '19:45',
  };
  const TZ = 'America/New_York';

  it('returns correct prayer name and type', () => {
    const result = getNextPrayer(APEX_TIMES, TZ);
    expect(APEX_TIMES).toHaveProperty(result.name.toLowerCase());
    expect(result.secondsUntil).toBeGreaterThan(0);
  });

  it('returns allPassed=false when prayers remain today', () => {
    // Mock early morning — Fajr hasn't happened
    jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('04:00:00');
    const result = getNextPrayer(APEX_TIMES, TZ);
    expect(result.name).toBe('Fajr');
    expect(result.allPassed).toBe(false);
    jest.restoreAllMocks();
  });

  it('returns allPassed=true and Fajr when all prayers passed', () => {
    jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('22:00:00');
    const result = getNextPrayer(APEX_TIMES, TZ);
    expect(result.name).toBe('Fajr');
    expect(result.allPassed).toBe(true);
    jest.restoreAllMocks();
  });

  it('returns Asr (Hanafi) when between Dhuhr and Asr', () => {
    jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('14:00:00');
    const result = getNextPrayer(APEX_TIMES, TZ);
    expect(result.name).toBe('Asr');
    expect(result.time).toBe('16:15');  // Hanafi Asr time
    jest.restoreAllMocks();
  });
});

// ─── getPrayerStatuses ────────────────────────────────────────────────────────
describe('getPrayerStatuses', () => {
  const TIMES = {
    fajr: '05:12', dhuhr: '12:31', asr: '16:15', maghrib: '18:19', isha: '19:45'
  };
  const TZ = 'America/New_York';

  it('marks Fajr as next in early morning', () => {
    jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('04:00:00');
    const statuses = getPrayerStatuses(TIMES, TZ);
    expect(statuses.fajr).toBe('next');
    expect(statuses.dhuhr).toBe('upcoming');
    jest.restoreAllMocks();
  });

  it('marks passed prayers correctly', () => {
    jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('13:00:00');
    const statuses = getPrayerStatuses(TIMES, TZ);
    expect(statuses.fajr).toBe('past');
    expect(statuses.dhuhr).toBe('past');
    expect(statuses.asr).toBe('next');
    jest.restoreAllMocks();
  });
});
