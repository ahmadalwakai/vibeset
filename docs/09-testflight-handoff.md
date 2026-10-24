# Vibeset — First TestFlight handoff · تسليم النسخة التجريبية الأولى

Prepared 24 October 2026. This packet contains listing, beta and reviewer copy for the native features implemented in `mobile/`, plus the evidence still needed for submission. **The owner prioritizes the native iPhone app alongside remaining web/provider launch work.** Local verification is recorded in [README](../README.md) and [mobile/README](../mobile/README.md); remaining release gates are in [docs/08](08-quality-checklists.md). Source code and local checks do not establish a signed iOS build, device results or Apple approval.

أُعدّت هذه الحزمة في 24 أكتوبر 2026، وتضم نصوص صفحة التطبيق والنسخة التجريبية والمراجعة للميزات المنفّذة في `mobile/`، مع الأدلة المتبقية للتسليم. **الأولوية من المالك: تطبيق iPhone الأصلي بالتوازي مع استكمال الخدمات وإطلاق الويب.** نتائج التحقق المحلي في [README](../README.md) و[دليل التطبيق](../mobile/README.md)، وشروط الإطلاق في [docs/08](08-quality-checklists.md). وجود الكود ونجاح الفحوص المحلية لا يثبتان بناء iOS موقّعًا أو نتائج الأجهزة أو موافقة Apple.

## 1. Current state · الحالة الحالية

- **Web:** implemented and locally verified; provider configuration, the performance budget, device checks and human legal review remain separate release gates. `npm run audit:bundles` reports an existing build; `npm run check:bundles` additionally fails at or above 180,000 gzip bytes on either Home locale. Neither command builds the app, and the check is not wired into CI while the budget remains unmet.
- **Native:** implemented screens are Explore, Saved, Widgets, Settings and theme detail. They use the actual public API, device-local favourites, native Photos saving/share sheets, EN/AR and light/dark/system appearance, and a small/medium calendar-and-time widget with a native-refresh provider. Detail also offers anonymous report submission, local theme hiding and creator blocking; Settings manages blocked creators. Native Studio, icon export, account sync, uploads, weather, countdowns and other widget types are absent. Local TypeScript/lint, **157 tests in eight files**, the Expo dependency check and a fresh iOS Hermes export (1,030 modules, 3.2 MB, four assets) passed. The eighth test file executes the actual Expo widget runtime/registry bundlers and validates the serialized layout. Root web typecheck/lint and **2,357 tests in 187 files** passed in the latest UGC check (zero skips; test duration 260.79 seconds), followed by a successful 222-path production web build. Isolated test-database cleanup was confirmed: all non-limiter tables were empty. No successful native compilation, `.app`, IPA, simulator screenshots or device result is established. See [docs/07 §7](07-roadmap-phase2-native.md#7-first-testflight-readiness--24-october-2026).
- **الويب:** منفّذ ومتحقق منه محليًا، مع بقاء إعداد الخدمات وميزانية الأداء واختبارات الأجهزة والمراجعة القانونية البشرية شروطًا مستقلة. الأمر `npm run audit:bundles` يعرض تقرير البناء الموجود، ويفشل `npm run check:bundles` إذا بلغ JavaScript المضغوط لصفحة البداية 180,000 بايت أو تجاوزها في أي لغة. لا ينفّذ أي منهما بناءً جديدًا، ولم يُربط الفحص بـ CI ما دامت الميزانية غير مستوفاة.
- **التطبيق الأصلي:** الشاشات المنفّذة هي التصفّح والمحفوظات والودجت والإعدادات وتفاصيل الثيم، مع API فعلي ومفضلة محلية وحفظ في الصور ومشاركة أصلية والعربية والإنجليزية والمظهر الفاتح والداكن ومظهر النظام، وودجت تقويم ووقت بالحجمين الصغير والمتوسط. تتيح التفاصيل إرسال بلاغ دون حساب وإخفاء ثيم وحظر مصمم محليًا، وتدير الإعدادات قائمة الحظر. لا تشمل النسخة استوديو أصليًا أو تصدير أيقونات أو مزامنة حسابات أو رفع صور أو طقسًا أو عدًا تنازليًا أو أنواع ودجت أخرى. نجحت فحوص الأنواع والتنسيق البرمجي و**157 اختبارًا في ثمانية ملفات** وفحص توافق Expo وتصدير iOS Hermes جديد (1,030 وحدة و3.2 MB وأربعة أصول). يشغّل ملف الاختبار الثامن حازمَي بيئة ودجت Expo وسجلّها الفعليين ويفحص التخطيط المتسلسل. ونجحت فحوص الأنواع والتنسيق للويب و**2,357 اختبارًا في 187 ملفًا** دون تخطٍّ، واستغرقت الاختبارات 260.79 ثانية، ثم نجح بناء الويب الإنتاجي بـ222 مسارًا. تأكد تنظيف قاعدة الاختبار المعزولة: كانت كل الجداول غير الخاصة بحدود الطلبات فارغة. لم يثبت نجاح بناء أصلي أو إنتاج `.app` أو IPA أو لقطات محاكي أو نتائج جهاز. التسلسل في [docs/07 §7](07-roadmap-phase2-native.md#7-first-testflight-readiness--24-october-2026).

**Mac build evidence:** the first real `ios-native-simulator` build failed on architecture configuration; commit `a859314` corrected that configuration. Build 2 passed its checks, macOS iOS prebuild and CocoaPods, then failed during ExpoWidgets bundling with exit 65. The exact error, `Unable to resolve ../../lib/render/spec from widgets/model.ts`, was also reproduced locally. The source fix separates dependency-free empty widget props, keeps the model import type-only at registration and uses named relative JSON imports to avoid stubbed runtime/interop dependencies. Both actual Expo bundlers and the serialized layout now pass locally. The macOS rerun remains pending: these results do not prove Swift/provider compilation or produce an app/extension artifact.

**دليل بناء Mac:** فشلت المحاولة الفعلية الأولى لمسار `ios-native-simulator` بسبب إعداد المعمارية، وصحّحه التعديل `a859314`. اجتازت المحاولة الثانية الفحوص وتوليد مشروع iOS على macOS وCocoaPods، ثم فشلت أثناء حزم ExpoWidgets بالرمز 65. تطابق الخطأ `Unable to resolve ../../lib/render/spec from widgets/model.ts` مع إعادة إنتاج محلية. يفصل الإصلاح خصائص الودجت الفارغة الخالية من اعتماد وقت التشغيل، ويبقي استيراد النموذج للنوع فقط عند التسجيل، ويستخدم استيرادات JSON مسماة ونسبية لتجنب الاعتمادات والمساعدات المستبدلة في سجل Expo. نجح الحازمان الفعليان وفحص التخطيط المتسلسل محليًا. ما زالت إعادة المحاولة على macOS معلّقة؛ ولا تثبت هذه النتائج ترجمة Swift أو إنتاج تطبيق أو امتداد.

## 2. App Store listing draft · مسودة صفحة App Store

The following copy matches the current native source. The English (U.K.) and Arabic listing and beta descriptions were saved in App Store Connect before the latest report/hide/block wording below; those revised bodies must be synced and rechecked against the compiled build. Name and subtitle each allow 30 characters. Description allows 4,000 characters, promotional text 170 characters and keywords **100 UTF-8 bytes**, including Arabic text. Use plain text in the description. [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/), [version fields](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/).

النصوص التالية تطابق كود التطبيق الحالي. حُفظ وصفا صفحة التطبيق والنسخة التجريبية بالإنجليزية البريطانية والعربية قبل الإضافة الأخيرة لنصوص الإبلاغ والحظر والإخفاء أدناه؛ يلزم تحديث الأجسام المعدّلة لدى Apple ومراجعتها مع البناء الفعلي. حد الكلمات المفتاحية بالبايت لا بعدد الحروف؛ القائمتان أدناه ضمن الحد. بيانات النسخة التجريبية في القسم التالي مستقلة عن هذه الصفحة.

| Field · الحقل                                  | English (U.K.)                                                                                                                                           | العربية                                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Name · الاسم                                   | Vibeset                                                                                                                                                  | Vibeset                                                                                                               |
| Subtitle · العنوان الفرعي                      | Wallpapers & Calendar Widgets                                                                                                                            | خلفيات وودجت تقويم                                                                                                    |
| Promotional text · النص الترويجي               | Find a wallpaper for your mood, keep your favourites close and style your calendar widget. Browse in English or Arabic, with light and dark appearances. | اختر خلفية تناسب مزاجك، واحتفظ بمفضلاتك، ونسّق ودجت التقويم. تصفّح بالعربية أو الإنجليزية مع المظهر الفاتح أو الداكن. |
| Keywords · الكلمات المفتاحية                   | wallpaper,calendar,widget,aesthetic,theme,homescreen,personalize                                                                                         | خلفيات,تقويم,ودجت,ثيمات,تخصيص                                                                                         |
| Feedback/support email · بريد الملاحظات والدعم | ahmadalwakai@gmx.com                                                                                                                                     | ahmadalwakai@gmx.com                                                                                                  |
| Public operator · المشغّل المعلن               | Ahmad Alwakai                                                                                                                                            | Ahmad Alwakai                                                                                                         |

Measured limits: subtitle EN 29 / AR 18 characters; promotional text EN 152 / AR 117 characters; keywords EN 64 / AR 54 UTF-8 bytes. Suggested category: **Graphics & Design** primary, **Lifestyle** optional secondary, subject to the owner's final selection for this build. These are proposed metadata choices, not claims of a native editing tool. [Apple category guidance](https://developer.apple.com/app-store/categories/).

### English description

```text
Your phone. Your mood.

Find a look that feels like you with Vibeset wallpapers and a calendar widget styled to match.

EXPLORE YOUR NEXT LOOK
Browse published themes, search by name and switch between Trending, New and Popular. Open a theme to see its wallpaper and details.

KEEP YOUR FAVOURITES CLOSE
Save themes with the heart and return to them in Saved. Your favourites are kept on this device; no account is required.

SAVE OR SHARE A WALLPAPER
Save an available phone wallpaper to Photos, or open the iPhone share sheet. You choose where it goes and set it as your wallpaper using iOS.

STYLE YOUR CALENDAR
Apply a theme's colours to the Vibeset calendar-and-time widget, then add its small or medium size from the Home Screen widget gallery. The installed widget follows your device's date and time.

MAKE IT COMFORTABLE
Choose English or Arabic, with right-to-left app layouts in Arabic. Use a light appearance, a dark appearance or your system setting.

CHOOSE WHAT YOU SEE
Report a theme from its detail screen, hide it on this device, or block its credited creator. Manage blocked creators in Settings. Reporting sends your selected reason and optional details for moderation; hiding and blocking are local choices.

An internet connection is needed to load the catalogue and download wallpapers. This version keeps favourites locally and does not sync them between devices. Widget refresh timing is managed by iOS. Reapply the widget theme after changing the app language.

Questions or feedback: ahmadalwakai@gmx.com
```

### الوصف العربي

```text
هاتفك. مزاجك.

اختر مظهرًا يشبهك مع خلفيات Vibeset وودجت تقويم بألوان متناسقة.

اكتشف مظهرك التالي
تصفّح الثيمات المنشورة، وابحث بالاسم، وتنقّل بين الرائج والجديد والأكثر شعبية. افتح أي ثيم لمشاهدة خلفيته وتفاصيله.

احتفظ بمفضلاتك قريبًا
احفظ الثيمات بالقلب، ثم عد إليها في المحفوظات. تُحفظ مفضلاتك على هذا الجهاز، ولا تحتاج إلى حساب.

احفظ خلفية أو شاركها
احفظ خلفية الهاتف المتاحة في تطبيق الصور، أو افتح قائمة المشاركة الأصلية في iPhone. أنت تختار وجهتها، وتعيّنها خلفية باستخدام أدوات iOS.

نسّق تقويمك
طبّق ألوان الثيم على ودجت التقويم والوقت من Vibeset، ثم أضفه بالحجم الصغير أو المتوسط من معرض ودجت الشاشة الرئيسية. يتبع الودجت المثبّت تاريخ جهازك ووقته.

اختر ما يريحك
استخدم العربية بواجهة من اليمين إلى اليسار، أو اختر الإنجليزية. حدّد المظهر الفاتح أو الداكن، أو اتبع إعداد النظام.

اختر ما يظهر لك
أرسل بلاغًا من تفاصيل الثيم، أو أخفه على هذا الجهاز، أو احظر المصمم المنسوب إليه. أدر قائمة المصممين المحظورين من الإعدادات. يرسل البلاغ السبب المختار والتفاصيل الاختيارية للمراجعة، بينما الإخفاء والحظر اختيارات محلية.

تحتاج إلى اتصال بالإنترنت لتحميل الدليل وتنزيل الخلفيات. تحفظ هذه النسخة المفضلة محليًا ولا تزامنها بين الأجهزة. يدير iOS مواعيد تحديث الودجت. أعد تطبيق ثيم الودجت بعد تغيير لغة التطبيق.

للأسئلة والملاحظات: ahmadalwakai@gmx.com
```

The first App Store version has no “What's New” field; keep build-specific beta testing instructions below instead. Category, copyright rightsholder and live Support/Privacy URLs must be confirmed in §4. Do not include beta labels in the eventual public listing. [Version fields](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/).

## 3. TestFlight and reviewer copy · نصوص TestFlight والمراجعة

Apple requires a beta description for external testing; the feedback address is also the reply-to address for tester invitations. Enter the English and Arabic descriptions in their separate localizations. A first beta does not need an already approved public screenshot set: TestFlight's optional invitation artwork is drawn from an approved App Store version. [Test information](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information/).

يلزم وصف للنسخة التجريبية قبل الاختبار الخارجي، ويُستخدم بريد الملاحظات أيضًا للرد على رسائل الدعوة. أدخل كل لغة في موضعها. لا تَعِد هذه النصوص باجتياز المراجعة أو نجاح اختبارات الأجهزة.

### English beta description

```text
Try the first native Vibeset iPhone beta: browse the real published theme catalogue, save favourites on this device, save or share an available phone wallpaper, and apply a theme to a small or medium calendar-and-time Home Screen widget.

From theme details you can submit a concern without an account, hide a theme or block its credited creator locally. Settings lets you unblock creators. Reports go to the service's moderation queue; local hiding and blocking do not themselves remove content for other people.

The app supports English and Arabic, plus light, dark and system appearances. No account is required. Catalogue browsing and wallpaper downloads need an internet connection. Favourites are local to this device. Add the widget from the iPhone widget gallery after applying a theme; reapply it after changing the app language.

This beta does not include native Studio, icon export, account sync, uploads, weather or other widget types. Please test the features listed in What to Test for this build.

Feedback: ahmadalwakai@gmx.com. Include the build number, iPhone model, iOS version, language, steps and expected result. Remove private photos, passwords and other personal content from attachments.
```

### وصف النسخة التجريبية بالعربية

```text
جرّب النسخة التجريبية الأولى من تطبيق Vibeset الأصلي على iPhone: تصفّح الدليل الفعلي للثيمات المنشورة، واحفظ المفضلة على هذا الجهاز، واحفظ خلفية هاتف متاحة أو شاركها، وطبّق ثيمًا على ودجت تقويم ووقت بالحجم الصغير أو المتوسط على الشاشة الرئيسية.

من تفاصيل الثيم، يمكنك إرسال بلاغ دون حساب، أو إخفاء الثيم أو حظر مصممه المنسوب إليه محليًا. تتيح الإعدادات إلغاء حظر المصممين. يصل البلاغ إلى قائمة الإشراف في الخدمة؛ ولا يزيل الحظر والإخفاء المحليان المحتوى للآخرين تلقائيًا.

يدعم التطبيق العربية والإنجليزية والمظهر الفاتح والداكن ومظهر النظام، ولا يحتاج إلى حساب. يتطلب تصفّح الدليل وتنزيل الخلفيات اتصالًا بالإنترنت. المفضلة محلية لهذا الجهاز. بعد تطبيق الثيم، أضف الودجت من معرض ودجت iPhone، وأعد تطبيقه بعد تغيير لغة التطبيق.

لا تشمل هذه النسخة استوديو أصليًا أو تصدير أيقونات أو مزامنة حسابات أو رفع صور أو طقسًا أو أنواع ودجت أخرى. يرجى اختبار الميزات المحددة في تعليمات هذا البناء.

للملاحظات: ahmadalwakai@gmx.com. أرفق رقم البناء وطراز iPhone وإصدار iOS واللغة والخطوات والنتيجة المتوقعة. احذف الصور الخاصة وكلمات المرور والمحتوى الشخصي الآخر من المرفقات.
```

### English “What to Test”

```text
1. Launch, close and reopen the app. Check English and Arabic, text sizes, VoiceOver, right-to-left layouts and light/dark/system appearances.
2. Browse Explore, search with at least two characters, change the sort and load more themes. Try a connection failure and Retry. Confirm details match the selected theme.
3. Add and remove favourites, open Saved, then relaunch. Check that favourites remain on this device and unavailable public themes are handled clearly.
4. Save an available phone wallpaper to Photos. Test allowing and denying the save permission. Open and cancel the native share sheet. Confirm the app does not claim a cancelled share was delivered.
5. Apply a theme, add both small and medium Vibeset widgets from the Home Screen gallery, and compare colours, date and time. Check relaunch, offline display, a local-midnight/month change and clearing the theme. Change language and reapply the widget. Record any delayed iOS refresh.
6. With agreed disposable test content and test services, submit one report and confirm it reaches the administrator queue. Try cancellation, a connection failure and a rate-limit error without treating them as successful submission. Hide a theme, block a credited creator, relaunch and verify the local filters; unblock in Settings. Check hiding/blocking a selected widget clears its selection. Do not put private information in report details.

Send the build number, device/iOS version, language and reproducible steps to ahmadalwakai@gmx.com. Remove personal content from screenshots.
```

### تعليمات الاختبار بالعربية

```text
1. افتح التطبيق وأغلقه ثم أعد فتحه. اختبر العربية والإنجليزية وأحجام النص وVoiceOver واتجاه الواجهة والمظهر الفاتح والداكن ومظهر النظام.
2. تصفّح الدليل، وابحث بحرفين على الأقل، وغيّر الترتيب وحمّل المزيد. اختبر انقطاع الاتصال وإعادة المحاولة، وتأكد من مطابقة التفاصيل للثيم المختار.
3. أضف ثيمات إلى المفضلة وأزلها، وافتح المحفوظات ثم أعد تشغيل التطبيق. تأكد من بقاء المفضلة على الجهاز ومن وضوح حالة الثيم الذي لم يعد متاحًا للعامة.
4. احفظ خلفية هاتف متاحة في الصور، وجرّب منح إذن الحفظ ورفضه. افتح قائمة المشاركة الأصلية ثم ألغها. تأكد من عدم عرض نجاح إرسال عند إلغاء المشاركة.
5. طبّق ثيمًا وأضف ودجت Vibeset بالحجمين الصغير والمتوسط من معرض الشاشة الرئيسية. قارن الألوان والتاريخ والوقت. اختبر إعادة التشغيل والعرض دون اتصال وتغيّر اليوم أو الشهر محليًا ومسح الثيم. غيّر اللغة ثم أعد تطبيق الودجت، وسجّل أي تأخر في تحديث iOS.
6. باستخدام محتوى وخدمات اختبار مؤقتة متفق عليها، أرسل بلاغًا واحدًا وتحقق من وصوله إلى قائمة المشرف. اختبر الإلغاء وانقطاع الاتصال وخطأ حد الطلبات دون اعتبارها نجاح إرسال. أخفِ ثيمًا واحظر مصممه المنسوب إليه، ثم أعد التشغيل وافحص المرشحات المحلية وألغِ الحظر من الإعدادات. تحقق من مسح اختيار الودجت عند إخفاء ثيمه أو حظر مصممه. لا تكتب معلومات خاصة في تفاصيل البلاغ.

أرسل رقم البناء والجهاز وإصدار iOS واللغة وخطوات تكرار المشكلة إلى ahmadalwakai@gmx.com. احذف المحتوى الشخصي من اللقطات.
```

### English reviewer notes

```text
Vibeset is a native iPhone app for browsing published wallpapers and styling a calendar-and-time Home Screen widget. No sign-in, demo account or payment is required to access this build's features.

Review path: Explore → open a theme → Save wallpaper to Photos / Share wallpaper / Use for my calendar. Saved contains device-local favourites. Widgets shows the selected calendar theme and instructions for adding the small or medium Vibeset Calendar widget from the iPhone Home Screen gallery. Add the actual widget to review the extension; the in-app calendar is a preview. Widget refresh timing is controlled by iOS.

Content controls: theme detail offers Report theme, Hide theme and, when a creator is credited, Block creator. Report submits a theme ID, reason and optional text to the existing moderated service without sign-in. Hide/block filters are stored locally, including across relaunch; Settings lists blocked creators and provides Unblock. They do not themselves remove published content for everyone. Public privacy text describes local preferences, report data and salted IP abuse-prevention metadata.

Settings provides English/Arabic, light/dark/system appearance, privacy, terms, copyright credits and support. Photos access is requested only when saving a wallpaper, using add-only access. The app does not request photo-library reading, camera, contacts or location access.

The public catalogue and wallpaper files are loaded over HTTPS. The widget uses locally shared theme tokens and device date/time. This build has no native Studio, icon exporter, accounts, uploads, ads or in-app purchases. It does not automatically change the iPhone wallpaper or installed app icons.

Feedback and support: ahmadalwakai@gmx.com
```

### ملاحظات المراجع بالعربية

```text
Vibeset تطبيق iPhone أصلي لتصفّح الخلفيات المنشورة وتنسيق ودجت تقويم ووقت على الشاشة الرئيسية. لا تتطلب ميزات هذا البناء تسجيل دخول أو حسابًا تجريبيًا أو دفعًا.

مسار المراجعة: التصفّح ← فتح ثيم ← حفظ الخلفية في الصور أو مشاركتها أو استخدامها للتقويم. تعرض المحفوظات المفضلة المحلية للجهاز. يعرض تبويب الودجت الثيم المختار وتعليمات إضافة Vibeset Calendar بالحجم الصغير أو المتوسط من معرض الشاشة الرئيسية. أضف الودجت الفعلي لمراجعة الامتداد؛ التقويم داخل التطبيق معاينة. يتحكم iOS في مواعيد تحديث الودجت.

أدوات المحتوى: تتيح التفاصيل الإبلاغ عن الثيم أو إخفاءه، وحظر المصمم عند نسبته إليه. يرسل البلاغ معرّف الثيم والسبب ونصًا اختياريًا إلى خدمة الإشراف الموجودة دون تسجيل دخول. تُحفظ مرشحات الحظر والإخفاء محليًا وتبقى بعد إعادة التشغيل؛ وتعرض الإعدادات قائمة المصممين المحظورين مع إلغاء الحظر. لا تزيل هذه الاختيارات المحتوى المنشور للجميع تلقائيًا. يوضح نص الخصوصية التفضيلات المحلية وبيانات البلاغ ومعلومات منع الإساءة المشتقة من عنوان IP بالتجزئة مع قيمة سرية.

تتضمن الإعدادات العربية والإنجليزية والمظهر الفاتح والداكن ومظهر النظام وروابط الخصوصية والشروط والتراخيص والدعم. يُطلب إذن الصور عند حفظ خلفية فقط، بصلاحية إضافة الصور دون قراءة المكتبة. لا يطلب التطبيق قراءة الصور أو الكاميرا أو جهات الاتصال أو الموقع.

يُحمّل الدليل العام وملفات الخلفيات عبر HTTPS. يستخدم الودجت بيانات الثيم المشتركة محليًا وتاريخ الجهاز ووقته. لا يتضمن البناء استوديو أصليًا أو تصدير أيقونات أو حسابات أو رفعًا أو إعلانات أو مشتريات داخل التطبيق. ولا يغيّر خلفية iPhone أو أيقونات التطبيقات تلقائيًا.

للملاحظات والدعم: ahmadalwakai@gmx.com
```

Use the English reviewer notes in the review field; the Arabic version is available for an Arabic-speaking reviewer or correspondence. Sign-in/demo-account access was marked not required. The responsible review contacts were saved privately in Apple; do not copy their phone or private details here. Notes allow 4,000 characters and must not contain credentials. [Beta review fields](https://developer.apple.com/documentation/appstoreconnectapi/betaappreviewdetail/attributes-data.dictionary), [international phone format update](https://developer.apple.com/help/app-store-connect/release-notes/).

الاسم والبريد العامان معتمدان في [`lib/legal.ts`](../lib/legal.ts). بريد الملاحظات هو `ahmadalwakai@gmx.com`، لكن يلزم التحقق من استقباله للرسائل. لا تُنسخ هواتف العضوية أو عناوينها إلى هذه الوثيقة؛ تُدخل بيانات التواصل الخاصة بالمراجعة لدى Apple فقط.

## 4. Record decisions and remaining facts · قرارات السجل والحقائق المتبقية

Browser verification on 24 October 2026 confirmed an active individual Apple Developer membership and seller **AHMAD AWAD ALWAKAI**. The **Vibeset app record was created**, Apple ID **`6826572844`**, with **English (U.K.)**, **SKU `vibeset-ios-001`**, main Bundle ID **`com.ahmadalwakai.vibeset`** and limited user access (owner/admin access retained). The main and widget-extension identifiers and App Group **`group.com.ahmadalwakai.vibeset`** were registered. The record is at [App Store Connect](https://appstoreconnect.apple.com/apps/6826572844/distribution/info); this is not a live public App Store listing. A paid-schedule update banner was observed; this is not evidence that new terms were accepted. No Mac build or upload is established by record creation.

English (U.K.) and Arabic localizations and listing/beta descriptions are saved, with the report/hide/block copy revisions in §§2–3 still to sync. Review and beta contacts are saved privately, and no sign-in is required. Public App Store release is set to manual. The internal **Vibeset Internal** group contains one owner and zero builds, with automatic distribution disabled. The team API key **VibesetCodemagic** was created with approved **App Manager** access and its Codemagic Developer Portal integration is connected. The proposed `VibesetDistribution` certificate and matching profiles still await operator approval; their creation is not verified. The connected API integration does not configure signing profiles or a signed upload workflow; no key identifiers, issuer identifiers or key material belong in this packet. Both app and extension have the App Group assigned. Public HTTPS Support and Privacy URLs are still missing, and age-rating/App Privacy declarations have not been submitted.

أكد التحقق من واجهة Apple في 24 أكتوبر 2026 عضوية فردية فعالة واسم البائع **AHMAD AWAD ALWAKAI**. **أُنشئ سجل Vibeset** برقم Apple **`6826572844`**، واللغة الأساسية **English (U.K.)** وSKU **`vibeset-ios-001`** ومعرّف **`com.ahmadalwakai.vibeset`** ووصول مستخدمين محدود مع بقاء وصول المالك والمديرين. سُجّلت معرّفات التطبيق والامتداد وApp Group **`group.com.ahmadalwakai.vibeset`**. رابط السجل ليس صفحة عامة متاحة في المتجر. ظهور تنبيه لتحديث اتفاقية مدفوعة لا يثبت قبول شروط جديدة، وإنشاء السجل لا يثبت البناء أو الرفع.

حُفظت اللغتان الإنجليزية البريطانية والعربية ووصفا صفحة التطبيق والنسخة التجريبية، مع بقاء مزامنة نصوص الإبلاغ والإخفاء والحظر المحدّثة في القسمين 2–3. حُفظت جهات التواصل داخل Apple على نحو خاص، وتسجيل الدخول غير مطلوب. ضُبط الإصدار العام على الإطلاق اليدوي. تضم مجموعة **Vibeset Internal** الداخلية مالكًا واحدًا وصفر بناء، مع تعطيل التوزيع التلقائي. أُنشئ مفتاح الفريق **VibesetCodemagic** بصلاحية **App Manager** المعتمدة، واتصل تكامل Developer Portal في Codemagic. ما زال إنشاء شهادة `VibesetDistribution` المقترحة وملفاتها الموافقة ينتظر موافقة المالك، ولم يثبت إنشاؤها. لا يعني اتصال API إعداد ملفات التوقيع أو مسار رفع موقّع، ولا تُحفظ هنا معرّفات المفاتيح أو المُصدر أو مادة المفتاح. عُيّنت App Group للتطبيق والامتداد. ما زالت روابط HTTPS العامة للدعم والخصوصية مفقودة، ولم تُرسل إقرارات التصنيف العمري وخصوصية التطبيق.

Apple requires the app record before uploading a build and the Account Holder's latest applicable agreement before adding an app. The record requires platform, name, primary language, Bundle ID, SKU and user-access choice. The SKU is immutable after creation; the uploaded bundle must match the registered Bundle ID. [Create an app record](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/), [identifier fields](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/).

| Still needed · المطلوب          | Exact evidence/decision · الدليل أو القرار                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple signing                   | Record the exact registered widget-extension identifier in signing configuration; verify its App Group assignment, app/extension entitlements, team/profile match and increasing build number. Registered records alone do not establish signed entitlements. توثيق معرّف الامتداد الدقيق والتحقق من App Group والصلاحيات وتطابق ملفات التوقيع وتسلسل البناء.                                                                                                   |
| Review contact                  | Contacts are saved privately in Apple. Verify monitoring/reachability before submission; no private telephone/contact record is reproduced here. حُفظت البيانات داخل Apple؛ يبقى التحقق من إمكانية التواصل ومتابعة الرسائل دون نسخ البيانات الخاصة هنا.                                                                                                                                                                                                         |
| Live service and website URLs   | Verify the actual HTTPS API/CDN and working localized privacy/support URLs on the chosen deployment. Native routes currently open `/legal/privacy`, `/legal/terms`, `/legal/copyright` (Arabic: `/ar/legal/...`). A mailto button alone does not establish a Support website. تحقق من الروابط المنشورة فعلًا؛ زر البريد وحده ليس موقع دعم.                                                                                                                      |
| Public metadata choices         | Confirm category, availability, copyright rightsholder and any custom EULA; align the record's version with the actual native version/build (`0.1.0` in current source). Public operator name is not by itself proof of exclusive rights. تأكيد التصنيف والتوفر وصاحب الحقوق والترخيص وتطابق الإصدار مع البناء الفعلي.                                                                                                                                          |
| Native privacy policy alignment | EN/AR Terms and Privacy source now distinguish web static decor from native WidgetKit and explain local favourites/blocked handles/hidden IDs, App Group data, Photos/share/cache files, API/CDN requests and anonymous report data with salted IP hashes. Publish the policy at the required HTTPS URL and obtain qualified review; source copy is not a declaration approval. وُوئم النصان مع سلوك التطبيق والبلاغات؛ يبقى النشر عبر HTTPS والمراجعة المؤهلة. |
| Privacy/export/age declarations | Complete §7 using the final binary, actual service retention and content. Do not invent “no data collected”, exemption, age rating or legal compliance answers. إكمال التصريحات من الوقائع لا الافتراضات.                                                                                                                                                                                                                                                       |
| Native delivery                 | Prove unsigned app/extension compilation, then signing/archive/IPA, Apple processing, tester assignment and a real device installation. These are separate outcomes. إثبات البناء والتوقيع والرفع والمعالجة والتعيين والتثبيت كلًا على حدة.                                                                                                                                                                                                                     |

The catalogue includes reviewed creator content. Native report submission reuses the website's feature gate, optional-session ban checks, five-per-hour user/IP budget and transactional moderation queue. Local hiding/blocking is a display choice, not a server-wide moderation action. Verify deployed reporting, filtering, timely human responses and the published contact process against [Apple §§1.2–1.2.1](https://developer.apple.com/app-store/review/guidelines/#user-generated-content); adding controls alone does not establish acceptance.

يتضمن الدليل محتوى مصممين خاضعًا للمراجعة. تستخدم بلاغات التطبيق أذونات الخدمة وحدودها وقائمة الإشراف نفسها، بينما الحظر والإخفاء محليان ولا يشكلان إجراء إشراف عامًا. يبقى التحقق من الإبلاغ المنشور وترشيح المحتوى والاستجابة البشرية والتواصل وفق إرشادات Apple؛ وجود الأدوات وحده ليس ضمان قبول.

Keep certificates, private keys, `.p8` material, passwords and private membership contact details out of this document. Beta delivery must not silently enable public App Store submission. External testing needs beta review; an uploaded build is not an approved or installed build. [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

## 5. Reusable asset packet · الأصول القابلة لإعادة الاستخدام

| Existing source · المصدر الموجود                                                      | Handoff use · الاستخدام                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`public/brand/app-icon-1024.png`](../public/brand/app-icon-1024.png)                 | Existing validated opaque 1024 × 1024 sRGB source for native icon tooling; no baked rounded corners. مصدر موجود ومتحقّق منه للأيقونة، معتم ودون زوايا دائرية مدمجة.                                                                                                             |
| [`public/brand/app-icon.svg`](../public/brand/app-icon.svg)                           | Square vector master. المصدر المتجهي المربّع.                                                                                                                                                                                                                                   |
| [`public/brand/logo-mark.svg`](../public/brand/logo-mark.svg)                         | Transparent white sparkle symbol; use a contrasting background. رمز نجمة أبيض بخلفية شفافة، يحتاج خلفية متباينة.                                                                                                                                                                |
| [`public/brand/README.md`](../public/brand/README.md)                                 | Existing regeneration instructions and web/PWA export inventory. تعليمات التوليد والأصول الخاصة بالويب وPWA.                                                                                                                                                                    |
| [`content/fonts.ts`](../content/fonts.ts), `assets/fonts/*/OFL.txt`                   | Six local font families with their OFL notices; retain licences and choose Arabic-capable families where required. ست عائلات خطوط محلية مع تراخيصها؛ تُحفظ التراخيص ويُختار خط يدعم العربية عند الحاجة.                                                                         |
| [`mobile/assets/app-icon.png`](../mobile/assets/app-icon.png), `mobile/assets/fonts/` | The native config already references the copied icon. Native startup bundles Readex Pro, Fraunces and El Messiri with their OFL notices; the other web families are not all bundled in this version. إعداد التطبيق مرتبط بالأيقونة، وتضم النسخة ثلاثة خطوط مرخّصة مع إشعاراتها. |
| `public/glyphs/v1/`, [`scripts/generate-glyphs.ts`](../scripts/generate-glyphs.ts)    | Existing 1,432 generic glyphs in six weights; retain Phosphor attribution/MIT licence and the brand-logo exclusion. رموز عامة بالأوزان الستة مع حفظ الترخيص واستبعاد شعارات العلامات التجارية.                                                                                  |

Web/PWA icons and social cards are not native screenshots. The native icon is configured in source; generated asset-catalogue and installed-icon validation still require the Mac build. Do not create a replacement logo or bake rounded corners into the master.

أيقونات PWA وبطاقات المشاركة ليست لقطات للتطبيق الأصلي. الأيقونة مرتبطة في الكود، لكن يلزم التحقق من كتالوج الأصول الناتج وأيقونة التطبيق المثبّت بعد بناء Mac. لا تُستبدل الهوية الحالية ولا تُدمج الزوايا الدائرية في الأصل.

## 6. Real native screenshot plan · خطة لقطات التطبيق الفعلية

**No native screenshots have been produced by this packet.** Capture the compiled app and installed widget in an iOS simulator or on an iPhone. Do not use browser screenshots, synthetic catalogue rows, rendered phone mockups or generated images as evidence of the native UI. Use real published, licensed artwork; if the live catalogue is empty, resolve content readiness before claiming a populated catalogue.

**لا تتضمن هذه الحزمة لقطات أصلية من التطبيق.** تُلتقط من النسخة المترجمة والودجت المثبّت في محاكي iOS أو iPhone، وبمحتوى منشور حقيقي مرخّص. لا تُستبدل بلقطات ويب أو بيانات مصطنعة أو صور هاتف مولّدة.

Apple currently accepts 1–10 JPEG/PNG screenshots per device size, without alpha. Its required-size summary lists Dynamic Island **medium**; prepare a portrait **1206 × 2622** set and a **1320 × 2868** large-display set, checking the actual App Store Connect wells before upload. Both sizes appear in the current specifications. The app currently declares iPhone-only support. Recheck future requirements if submission is delayed: the page schedules iPhone Duo screenshot requirements for April 2027 for iOS 27.1 SDK builds or later. [Current screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

Prepare the following sequence separately in English and Arabic. Five captures per size and language are planned; no preview video is needed for this first packet. Screenshot captions below are optional marketing text, not claims of completed capture.

| Order | Actual capture                                                                                | English caption            | العنوان العربي             |
| ----- | --------------------------------------------------------------------------------------------- | -------------------------- | -------------------------- |
| 1     | Explore with real published themes and working thumbnail images                               | Find your everyday mood    | اكتشف ما يشبه مزاجك        |
| 2     | Detail of an actually downloadable phone wallpaper                                            | A wallpaper to make yours  | خلفية على ذوقك             |
| 3     | Saved with themes genuinely favourited through the app                                        | Keep your favourites close | مفضلاتك قريبة منك          |
| 4     | Widgets tab after a successful theme apply; keep its preview label visible                    | A calendar in your colours | تقويم بألوانك              |
| 5     | Clean simulator/device Home Screen with the actual Vibeset small and medium widgets installed | Bring your calendar home   | تقويمك على الشاشة الرئيسية |

For Arabic, switch the app language and **reapply** the widget before capture. Confirm real text, RTL navigation, safe areas, large text and matching theme colours. The app preview is not proof that the WidgetKit extension works; capture the installed extension separately. Use a clean Home Screen without private photos, notifications, account details or third-party artwork used without permission.

في العربية، غيّر اللغة وأعد تطبيق الثيم على الودجت قبل الالتقاط. افحص النص والاتجاه والحواف وحجم الخط والألوان. معاينة التطبيق ليست دليلًا على عمل الامتداد؛ تُلتقط الودجت المثبّتة أيضًا، دون صور أو إشعارات أو بيانات خاصة.

On macOS, a screenshot command after installing and navigating the actual build is `xcrun simctl io booted screenshot --type=png <output-path>`. Choose simulator models that natively produce the accepted dimensions; do not stretch another device's UI to imitate them. Inspect output dimensions/alpha and every image visually. Record commit, version/build, simulator/device, iOS runtime, locale, public theme slug/asset version and widget family alongside the files. Permission prompts and failures belong in QA evidence, not this marketing sequence.

## 7. Privacy, age rating and compliance worksheet · ورقة الخصوصية والتصنيف

These are observed implementation facts and unresolved declaration inputs, **not pre-completed Apple answers**. The final app and its actual third-party/service practices control the answers. A public privacy-policy URL is required; App Privacy responses must cover the app and integrated partners and stay current. [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/).

هذه وقائع من التنفيذ ومدخلات تحتاج تحققًا، وليست إجابات جاهزة لدى Apple. يجب أن تغطي الإجابات النسخة الفعلية وممارسات الخدمات والحزم، مع سياسة منشورة تصف التطبيق الأصلي فعلًا.

| Observed native behaviour                                                                                                                                                                                                                    | Submission consequence / remaining evidence                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No native account, sign-in, ad SDK or app-level tracking calls are implemented. Public API/media requests omit credentials.                                                                                                                  | Do not claim account sync, in-app account deletion or ad tracking functionality. Inspect the final dependency/privacy-manifest inventory rather than inferring the absence of all collection from this fact.                                           |
| AsyncStorage key `vibeset:native-preferences:v1` stores locale, appearance, up to 500 favourite theme IDs, hidden theme IDs, blocked creators' public handles/display names and selected widget summary.                                     | These preferences are device-local, not a cloud account or a moderation ban. Favourite IDs are nevertheless sent to the public API in catalogue `ids` queries; do not claim they never leave the device.                                               |
| Searches, theme/detail/ID queries and CDN image/download requests leave the device.                                                                                                                                                          | Confirm actual host/CDN request logging, retention, access, purposes and linking before selecting data types. Search terms and IP/request metadata need review; transient request servicing and retained logs must be distinguished.                   |
| Explicit Submit sends a canonical theme ID, reason and optional plain-text details through `POST /api/v1/reports`. Successful anonymous reports are stored with a salted IP hash for moderation/abuse prevention; requests omit credentials. | Report text and retained moderation metadata must be assessed for App Privacy. Credential omission does not make the request anonymous to infrastructure or mean no data is collected. The form advises against unnecessary private/sensitive details. |
| Photos permission is add-only and requested when the user chooses Save. No library reading, camera, contacts or location is requested in this version.                                                                                       | Verify the installed localized permission prompt and permission-denied flow. Saving a supplied wallpaper is not evidence that users' photo libraries are uploaded.                                                                                     |
| Wallpaper bytes use per-operation cache files for native save/share; cleanup is attempted afterward. The OS may retain an open/cache copy.                                                                                                   | Check the real device behaviour. Sharing uses the user's chosen external destination; closing the share sheet does not confirm delivery.                                                                                                               |
| Widget tokens and selected theme metadata are shared locally with the extension through its App Group. Widget rendering uses device date/time and no widget network request.                                                                 | Verify actual entitlements, native storage and final extension privacy manifests. Do not label shared local tokens as a synced account.                                                                                                                |
| TestFlight distributes the beta and provides Apple tester/crash/feedback tooling.                                                                                                                                                            | Review Apple's beta disclosures and the configured feedback contact separately from the app's own storage/network behaviour.                                                                                                                           |

Apple's “collected” definition concerns off-device data accessible beyond real-time request servicing; it includes integrated third parties. Therefore **do not select “No data collected” without assessing stored reports/salted IP metadata, API/CDN logging and final SDK practices**. Lack of automatic statistics does not settle that declaration. Do not assume a support/reporting exception without checking Apple's conditions. [Apple privacy definitions](https://developer.apple.com/app-store/app-privacy-details/).

ترسل البلاغات نصًا اختياريًا ومعرّف الثيم والسبب، وتحتفظ الخدمة ببيانات الإشراف والقيمة المشتقة من IP. لا يعني غياب الإحصاءات التلقائية عدم جمع البيانات، ولا يحسم وحده إجابات خصوصية Apple؛ يلزم تقييم البلاغات وسجلات الخدمات والحزم الفعلية.

**Age rating:** complete the current questionnaire using both native capabilities and the actual remotely supplied catalogue, including reviewed creator contributions. There is no in-app chat, arbitrary web browsing, upload flow, gambling or medical advice in the current source; that does not answer content-frequency questions about all served artwork. The existing Terms restrict the **creator programme** to adults, not every visitor. Do not infer either a universal 18+ requirement or a 4+ rating. If an applicable EULA imposes a higher minimum than Apple's calculated rating, Apple requires a higher override. Do not select Made for Kids by default. [Age-rating questionnaire and overrides](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/).

**التصنيف العمري:** تُراجع قدرات التطبيق والمحتوى الفعلي القادم من الخادم، بما فيه مساهمات المصممين المراجَعة. شرط البلوغ في الشروط يخص برنامج المصممين، ولا يحدد تلقائيًا عمر كل زائر. لا يُفترض تصنيف 4+ أو 18+ ولا فئة الأطفال دون الإجابات الفعلية.

**Export compliance:** the source uses HTTPS and platform services, but this does not by itself establish Apple's encryption answer or an exemption. Review the final app/extension and bundled libraries, then provide the applicable declaration/documentation through Apple. [Beta export-compliance guide](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-export-compliance-information-for-beta-builds/).

## 8. Delivery evidence to append · أدلة التسليم التي تُضاف لاحقًا

- Native compile, archive/signing and IPA evidence, with app/extension identifiers matching the record.
- Apple upload and processing outcome; export-compliance disposition; internal/external tester group and build assignment.
- Actual iPhone install and §3 test results, including widget refresh, EN/AR, permissions, offline/error recovery and accessibility. Do not publish an Accessibility Nutrition Label based on web or source-only checks.
- Screenshot file inventory/provenance from §6 and verified privacy/support destinations.
- Separate first external Beta App Review approval, if external testing is used. TestFlight builds expire after 90 days. [TestFlight stages](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

يُسجّل البناء والتوقيع والرفع والمعالجة والتصريحات وتعيين المختبرين والتثبيت الفعلي ونتائج الاختبار كلًا على حدة. لا يعني نجاح مرحلة نجاح المراحل التالية، ولا تتضمن هذه الوثيقة ضمانًا لموافقة Apple أو موعدها.
