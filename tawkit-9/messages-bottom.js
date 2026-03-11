/*
Announcements on screen bottom (auto-scrollable)
--------------------------------------------
Messages of this file are loaded only once on first time application started in your browser,
after that, app will load what is saved by browser (this file messages + user input messages in app)


Every message should end with °°
Example : 

JS_ADMIN_MESSAGES += "a|b|c°°";

a = 1 or 0  ( on / Off )
b = day of showing message ( DAILY , JOMOA, 10/01 )
c = the message to show

--------------------------------------------
You can add as many messages as you want.
*/

let JS_ADMIN_MESSAGES  = "";
JS_ADMIN_MESSAGES += "1|DAILY|قالَ ﷺ : خيركم من تعلم القرآن وعلمه°°";
JS_ADMIN_MESSAGES += "1|DAILY|المرجو إغلاق الهاتف عند دخول المسجد°°";
JS_ADMIN_MESSAGES += "1|DAILY|لاحول ولا قوة إلاَّ بالله °°";
JS_ADMIN_MESSAGES += "1|DAILY|قالَ ﷺ : يسروا ولا تعسروا، وبشروا ولا تنفروا°°";
JS_ADMIN_MESSAGES += "1|DAILY|قالَ ﷺ : مَن كان يؤمن بالله واليوم الآخر فليقل خيرًا أو ليصمت°°";
JS_ADMIN_MESSAGES += "1|DAILY|قالَ ﷺ : ركعتا الفجر خير من الدنيا وما فيها°°";
JS_ADMIN_MESSAGES += "1|DAILY|قالَ ﷺ : مِنْ حُسْنِ إِسْلَامِ الْمَرْءِ تَرْكُهُ مَا لَا يَعْنِيهِ°°";
JS_ADMIN_MESSAGES += "1|10/01|الله أكبر الله أكبر لا إله إلا الله، الله أكبر الله أكبر ولله الحمد°°";
JS_ADMIN_MESSAGES += "1|DAILY|قالَ ﷺ : إياكم والظن، فإن الظن أكذب الحديث°°";
JS_ADMIN_MESSAGES += "1|DAILY|سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ العَظِيم°°";
JS_ADMIN_MESSAGES += "1|JOMOA|قالَ ﷺ  :  في يوم الجمعة ساعة لا يوافقها مسلم وهو قائم يصلي يسأل الله خيرًا إلا أعطاه°°";
JS_ADMIN_MESSAGES += "1|10/01|تقبل الله منا ومنكم صالح الأعمال°°";
JS_ADMIN_MESSAGES += "1|10DLHJ|تذكير بالأيام العشر من ذي الحجة --- قالَ رسُولُ اللَّهِ ﷺ: مَا مِنْ أَيامٍ العَمَلُ الصَّالحُ فِيها أَحَبُّ إِلى اللَّهِ مِنْ هذِهِ الأَيَّامِ°°";
JS_ADMIN_MESSAGES += "1|12/10|الله أكبر الله أكبر لا إله إلا الله، الله أكبر الله أكبر ولله الحمد°°";
JS_ADMIN_MESSAGES += "1|12/11|الله أكبر الله أكبر لا إله إلا الله، الله أكبر الله أكبر ولله الحمد°°";
JS_ADMIN_MESSAGES += "1|12/12|الله أكبر الله أكبر لا إله إلا الله، الله أكبر الله أكبر ولله الحمد°°";
JS_ADMIN_MESSAGES += "1|12/13|الله أكبر الله أكبر لا إله إلا الله، الله أكبر الله أكبر ولله الحمد°°";


let STRt3 = localStorage.getItem('STORAGE_ADMIN_MESSAGES'); 
if(STRt3) {JS_ADMIN_MESSAGES = STRt3;}
JS_BOTTOM_MSGS = JS_ADMIN_MESSAGES.split("°°");



