/*
Tawkit app default settings
Here you can set the default settings when app starts 1st time.
---------------------------------------------------------------
Documentation Here ---> https://settings.tawkit.net/help.html
----------------------------------------------------------------
*/
let JS_DATA =
{
ucUseImportedTimes: 0,
ucLangNOW: 'AR',			// always UPPER-CASE !!!
ucMosqueName: 'إسم المسجد',
ucNowCityCODE: 'sa.makkah', // always lower-case !!!
ucAyatsLANG: 'ar',			// always lower-case !!!
ucIsMarqueeOn: 0,
ucIsMeteoOn: 1,
ucMeteoWithPrayers: 0,
ucIsForHome: 0,
ucUserThemeBG: 0,
ucAddZeroToAMPM: 0,
ucHr5BoxesOnly: 0,
ucDohaScreenSaver: 0,
ucIshaScreenSaver: 0,
ucDohrXminutesAsr: 0,
ucJomoaOnHRscreen: 0,
ucJomoaFixedTime: 'AUTO',
ucAzkar5minPicture: 0,
ucAzkarBGwhite: 0,
ucVrNamesInMiddle: 0,
ucScreenFont: 'Amiri',
ucClockFont: 'FreeSerifBold',
ucTimesFont: 'FreeSerifBold',
ucAzkarFont: 'TAHA',
ucAzkarSabahOn: 1,
ucAzkarAsrOn: 1,
ucAzkarMaghribOn: 1,
ucAzkarIshaOn: 0,
ucCounterLastMinute: 0,
ucFullScreenCounter: 0,
ucShowIqamaScreen: 0,
ucHrNamesInMiddle: 1,
ucDimmPastPrayers: 0,
ucDateUpRightInHR: 0,
ucVerifyInternet: 0,
ucForcedVertical: 0,
ucJomoaDimmBefore: 2,
ucJomoaDimmAfter: 30,
ucAzanIqamaByVoice: 0,
ucShortAzanActive: 0,
ucShortIqamaActive: 0,
ucIsArabicDigits: 0,
ucRamadanDoIsha30min: 0,
ucInSummerAdd1Hour: 0,
ucForce1HourMore: 0,
ucForce1HourLess: 0,
ucActivate24Hours: 0,
ucClockIsFull: 0,
ucAzkarActive: 1,
ucSlidesActive: 0,
ucIqamaFullTimes: 0,
ucIqamaCounter: 1,
ucAthanMinutesFAJR: 0,
ucAthanMinutesSHRQ: 0,
ucAthanMinutesDOHR: 0,
ucAthanMinutesASSR: 0,
ucAthanMinutesMGRB: 0,
ucAthanMinutesISHA: 0,
ucPrayDurationFAJR: 9,
ucPrayDurationDOHR: 8,
ucPrayDurationASSR: 8,
ucPrayDurationMGRB: 7,
ucPrayDurationISHA: 9,
ucIqamaFAJR: 10,
ucIqamaSHRQ: 15,
ucIqamaDOHR: 10,
ucIqamaASSR: 10,
ucIqamaMGRB: 10,
ucIqamaISHA: 10,
ucFixedIqamaFAJR: '',
ucFixedIqamaDOHR: '',
ucFixedIqamaASSR: '',
ucFixedIqamaISHA: '',
ucMeteoLatitude: 21.3890824,
ucMeteoLongitude: 39.8579118,
ucWcsvIsActive: 0,
ucPsFlag: 1,
ucCounterColorAlert: 1,
ucTimesBgShadows: 1,
ucCloseMobilePlease: '﻿من فضلك أغلق الهاتف',
ucIqamaHadith: 0,
ucSemiTransparentBgs: 1,
ucPrimaryAzanMinutes: 0,
ucBlackScreenShowsClock: 1,
ucBlackScreenShowsDate: 0,
ucBlackScreenInPraying: 1,
ucActivateJomoaAzan: 0,
ucShowAzanWindow: 1,
ucUseBigNextPrayCounter: 0,
ucSlidesRandom: 1,
ucActivateEidFITR: 0,
ucActivateEidADHA: 0,
ucTimeOfEidFITR: '﻿08:00',
ucTimeOfEidADHA: '﻿07:00',
ucThemesActiveType: 0,
ucThemes4eachSalat: "7|13|0|16|33|4",
ucThemes4EveryDays: "5|8|31|16|7|3|27",
ucThemesMyBGsLista: "4,6,8,9,18",
ucHijriDateFixer: 0,
ucSlidesViewTime: 15,
ucTawkitViewTime: 12,
ucLocalHoursAdjustment: 0,
ucMiniCounterOnLeftInVR: 1,
ucUserFilesACTIVE: 0,
ucAlertLastMinute: 1,
ucVrMiniTitlesVisible: 1, // titles in VR  ( Salat Azan Iqama )
ucShowNightPrayers: 1,
ucRemindersActive: 0,
ucRamadanDaysLeft: 1,
ucMovingMessagesSpeed: 55,   // speed of bottom screen moving text , choose between 40 and 70
ucRepeatMainAzkarOnce: 0,   // azkar repeating on screen,    0 = norepeat  ,  1 = repeat once   , 2 = twice  
}

//----------------------------------------------------------------------
//--------- INTERNAL MANUAL SETTINGS ------------------------------
const JS_5minAzkarSemiTransparent = 1;      // make background of Azkar picture semi-transparent  0 or 1

const JS_MainAzkarViewTime	= 18; // 18 seconds of viewing each main Azkar
const JS_SabahMasaaViewTime	= 25; // 25 seconds of viewing each Azkar Sabah/Masaa


const JS_Minutes_BeforeAZAN_ToChange_Theme = 1;

const JS_AZAN_WINDOW_SHOW_TIME = 60; // 60 seconds to keep showing Azan window (if option enabled)

const JS_DuaAfterAZAN	= "الدعاء بين الأذان والإقامة لا يرد";
const JS_IqamaRULE		= "قالَ ﷺ : إذا أُقيمت الصَّلاةُ فلا تقوموا حتى ترَوني قد خرجتُ";
const JS_AFTERAZAN		= "اللهم رب هذه الدعوة التامة، والصلاة القائمة، آت محمدًا الوسيلة والفضيلة، وابعثه المقام المحمود الذي وعدته";
//----------------------------------------------------------------------
const JS_RepeatAzkar	= "إعادة الأذكار مرة واحدة بعد الانتهاء | Repeat Azkar once";


const JS_YOU_USE_24HOURS	= "<div>Use 24H, eg: for 1:30pm, you write 13:30</div>";

const JS_DIGITS_MAPS =
{
map_AR	: ["&#1632;", "&#1633;", "&#1634;", "&#1635;", "&#1636;", "&#1637;", "&#1638;", "&#1639;", "&#1640;", "&#1641;"],
map_BN	: ["&#2534;", "&#2535;", "&#2536;", "&#2537;", "&#2538;", "&#2539;", "&#2540;", "&#2541;", "&#2542;", "&#2543;"],
map_HI	: ["&#2406;", "&#2407;", "&#2408;", "&#2409;", "&#2410;", "&#2411;", "&#2412;", "&#2413;", "&#2414;", "&#2415;"],
map_AF	: ["&#1776;", "&#1777;", "&#1778;", "&#1779;", "&#1780;", "&#1781;", "&#1782;", "&#1783;", "&#1784;", "&#1785;"], //AF dari
map_PA	: ["&#1776;", "&#1777;", "&#1778;", "&#1779;", "&#1780;", "&#1781;", "&#1782;", "&#1783;", "&#1784;", "&#1785;"], // same as AF
map_PS	: ["&#1776;", "&#1777;", "&#1778;", "&#1779;", "&#1780;", "&#1781;", "&#1782;", "&#1783;", "&#1784;", "&#1785;"], // same as AF
map_KU	: ["&#1776;", "&#1777;", "&#1778;", "&#1779;", "&#1780;", "&#1781;", "&#1782;", "&#1783;", "&#1784;", "&#1785;"], // same as AF
map_UR	: ["&#1776;", "&#1777;", "&#1778;", "&#1779;", "&#1780;", "&#1781;", "&#1782;", "&#1783;", "&#1784;", "&#1785;"], // same as AF
map_FA	: ["&#1776;", "&#1777;", "&#1778;", "&#1779;", "&#1780;", "&#1781;", "&#1782;", "&#1783;", "&#1784;", "&#1785;"], // same as AF
map_TH	: ["&#3664;", "&#3665;", "&#3666;", "&#3667;", "&#3668;", "&#3669;", "&#3670;", "&#3671;", "&#3672;", "&#3673;"],
};


const JS_COLORS_FOR_DARK_THEMES		= "#FFFFFF|#DDC091|#BEAF97|#000000";
const JS_COLORS_FOR_LIGHT_THEMES	= "#462412|#A45015|#6D5646|#F8F5F0";



