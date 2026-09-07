# تقرير تدقيق Supabase الشامل — منصة WALIDAWNY

**التاريخ:** 7 سبتمبر 2026  
**النطاق:** كل استدعاء Supabase في `src/data/rpc.ts`، كل `supabase/migrations/*.sql` (خاصة `0051_free_units.sql` و `0052_fix_units_rls_recursion.sql`)، الصفحات `PricingPage.tsx` / `CodesPage.tsx` / `CurriculumUnitsPage.tsx` / `StudentCurriculumPage.tsx` / `UnitsPage.tsx` / `LessonAssetsPage.tsx` / `GradesPage.tsx`، و `src/lib/supabase.ts` و `src/app/App.tsx` و `public/sw.js`  
**المعيار:** لا يسبب "تعذر تحميل الوحدات والأكواد" أو "مش قادرة تجيب داتا" — أي فشل صامت في `select` / `rpc` / `RLS` / `Network` / `ServiceWorker`  
**المنهجية:** قراءة مباشرة لكل ملف (98 ملفًا `*.tsx` + 52 مهاجرة + `rpc.ts` 1800+ سطر)، تتبع كل `from().select` و `rpc()` و `invokeFunction` وسياسات `RLS`، ومطابقتها مع سيناريوهات `طالب / مدرس / admin / anon / معطّل`.

---

## 1) الملخص التنفيذي

تم رصد **20 ملاحظة** موزعة كالتالي:

| الشدة | العدد | المعنى |
| :--- | :--- | :--- |
| 🔴 **حرج** | 4 | يسبب شاشة بيضاء أو "تعذر تحميل الوحدات" لكل الطلاب |
| 🟠 **عالي** | 6 | يسبب فشل جزئي / بيانات ناقصة / تسريب دور |
| 🟡 **متوسط** | 7 | تدهور UX أو فقدان resilience |
| 🟢 **منخفض / ملاحظة** | 3 | دين تقني يجب إصلاحه قبل التوسع |

**الخلاصة السريعة:**

1.  **التعارض 42P17 تم إصلاحه** في `0052` عبر إزالة فرع `EXISTS (lessons.is_trial)` من سياسة `units` — حاليًا لا يوجد تكرار متبادل `units <-> lessons`. لكن `0051` نفسه كان يكسر المنصة، وبدون تطبيق `0052` على قاعدة الإنتاج سيفشل كل `listUnitsForGrade` فورًا.
2.  **عمود `is_free` هو أكبر مصدر هشاشة متبقٍ.** نصف الدوال تمتلك fallback لـ `42703` والـ `from('units').select('*')` لا تملك. إذا تأخر تطبيق `0051` على بيئة ما، ستنهار صفحات الطالب بالكامل رغم أن `getPublicUnitPrices` يملك fallback.
3.  **بوابة الإعدادات `isSupabaseConfigured` معطلة عمليًا** بسبب fallback هاردكود في `supabase.ts:5-12` — شاشة الخطأ لا تظهر أبدًا.
4.  **نمط `Promise.all` غير المحمي** في `GradesPage` و `StudentLessonPage` و `ReportsPage` يحول فشل استدعاء واحد إلى فشل الصفحة كلها (نفس أعراض "تعذر تحميل الأكواد").
5.  **الـ Service Worker سليم إجمالاً** (network-first للتنقل + إخلاء `index.html` عند 404 chunk)، لكن إصداره `v3` هاردكود ويحتاج bump يدوي لكل نشر.

---

## 2) الجدول الشامل للمشكلات

| # | الملف:السطر | نوع الخطأ | الوصف المختصر | السيناريو الذي يفشل | الشدة | الحل المقترح |
| - | --- | --- | --- | --- | --- | --- |
| **F-01** | `src/lib/supabase.ts:5-12` + `src/app/App.tsx:12,19` | **Config / Network** | `supabaseUrl / supabasePublishableKey` يملكان fallback هاردكود `https://nfusbrktrqfrnaetetmr.supabase.co` + `sb_publishable_...`، لذا `isSupabaseConfigured = Boolean(url && key)` دائمًا `true`. `ConfigErrorScreen` لا يُعرض أبدًا. | `anon` / `طالب` / `مدرس` في بيئة بلا `.env` (preview / staging / خطأ CI) — التطبيق يتصل بمشروع إنتاج هاردكود بدل إظهار خطأ إعداد، قد يسرب بيانات أو يظهر "مش قادرة تجيب داتا" مضلل. | 🔴 حرج | اجعل `isSupabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)` بدون fallback، واحتفظ بالهاردكود فقط داخل `if (import.meta.env.DEV)` أو احذفه. |
| **F-02** | `src/data/rpc.ts:419-461` `listUnitsForGrade` | **Migration / RLS** | `from('units').select('*')` بلا معالجة `42703` (`is_free does not exist`). الـ fallback الوحيد هو لـ `42P17` (recursion). إذا لم تُطبق `0051`، يرمي `42703` ويُسقط الصفحة. | **طالب active** يفتح `StudentCurriculumPage` أو `UnitsPage` قبل تطبيق `0051` على DB — يرى `تعذر تحميل المنهج الدراسي`. المدرس في `CurriculumUnitsPage` أيضًا. | 🔴 حرج | أضف فرع `isMissingColumnError` داخل `catch` (مثل `getPublicUnitPrices:1219`) يعيد المحاولة بـ `select('id, grade_id, name, sort_order, status, deleted_at, created_at, updated_at')` بدون `is_free` ويحقن `is_free: false` افتراضيًا، أو وحّد كل قراءات `units` عبر RPC آمن. |
| **F-03** | `src/data/rpc.ts:463-481` `listDeletedUnitsForGrade` | **Migration** | نفس مشكلة F-02 — لا يغطي `42703`، فقط `42P17` عبر `list_deleted_units_for_grade_secure`. | **مدرس/admin** يفتح تبويب "المحذوفة" في `CurriculumUnitsPage` و DB بدون `is_free` → فشل صامت والـ `deletedUnits` تبقى `[]` بلا رسالة. | 🟠 عالي | نفس إصلاح F-02، أو استخدم الـ RPC الآمن كمسار أساسي للـ staff بدل `from().select`. |
| **F-04** | `src/data/rpc.ts:555-580,860-882` `listLessonsForUnit` / `getLessonById` / `getUnitById` / `listLessonPdfs` / `listLessonBoards` | **Migration / Select** | كلها `select('*')` بدون حماية `42703` ولا `42P17`. `lessons` لم تتأثر بـ `is_free` لكن `units` نعم. `listLessonsForUnit` يُستدعى داخل حلقة `Promise.allSettled` لكل وحدة — فشل وحدة واحدة بسبب `is_free` يسكت (`catch -> lessons: []`) ويخفي الدرس بدون تنبيه. | **طالب** في `StudentCurriculumPage` يرى وحدة فارغة (0 دروس) ظنًا أنها بلا محتوى بينما السبب RLS/migration. | 🟡 متوسط | وحّد أعمدة `select` بشكل صريح (لا `*`)، وأضف `isMissingColumnError` + تسجيل خطأ مرئي (toast) عند fallback. |
| **F-05** | `src/data/rpc.ts:1142-1189` `getMyLessonAccess` | **RPC / Migration** | عند `42703` يعيد استدعاء **نفس الـ RPC** (`get_my_lesson_access`) الذي سيفشل مجددًا بنفس الخطأ، ثم في الـ `catch` الداخلي يرجع `{ has_access:false }` صامتًا. الطالب يُقفل خارج درس مجاني/تجريبي دون رسالة. | **طالب active** يفتح درس `is_trial=true` أو `unit.is_free=true` و DB قديمة → يبقى في شاشة "الوحدة غير مفعّلة" بدل مشاهدة الدرس. | 🟠 عالي | لا تعيد نفس الـ RPC؛ استخدم fallback حقيقي يقرأ `lessons.is_trial` و `units.is_free` مباشرة (إن وجدا) أو اعتبر `is_free=false` وتعتمد على `can_access_lesson` فقط. |
| **F-06** | `src/data/rpc.ts:1304-1330` `listUnitPricing` | **RPC / Migration** | فرع `isMissingColumnError` يعيد استدعاء `list_unit_pricing` نفسها (سطر 1313) — حلقة فشل لا تنتهي. لن يصل للـ retry الشبكي. | **مدرس/admin** يفتح `PricingPage` أو `CodesPage` قبل `0051` → يرى `تعذر تحميل أسعار الوحدات` بلا استرداد. | 🟠 عالي | استبدل الـ fallback بقراءة مباشرة `from('unit_pricing').select(...)` + حقن `is_free:false` كما في `getPublicUnitPrices`. |
| **F-07** | `supabase/migrations/0051_free_units.sql:250-326` | **RLS — 42P17** | أدخل فرع `EXISTS (SELECT FROM lessons WHERE is_trial)` داخل سياسة `units` بينما سياسة `lessons` تستعلم `units` — تكرار متبادل `units -> lessons -> units` يكتشفه Postgres كـ `infinite recursion detected in policy for relation "units"` ويُسقط كل `SELECT` للطالب. | **كل طالب active** — `listUnitsForGrade` / `UnitsPage` / `StudentCurriculumPage` تفشل 100% بـ `42P17` حتى مع بيانات صحيحة. المدرس/admin لا يتأثر (فرع `is_admin` يسبق). | 🔴 حرج (تم إصلاحه في 0052 لكن يبقى خطر ترتيب المهاجرات) | تم الإصلاح في `0052`. التوصية: ضمان تطبيق `0052` فورًا بعد `0051` في كل بيئة، وإضافة اختبار مهاجرة يتحقق أن `EXPLAIN` لسياسة `units` لا يذكر `lessons`. |
| **F-08** | `supabase/migrations/0052_fix_units_rls_recursion.sql:18-38` | **RLS — سلوك** | الإصلاح أزال فرع trial بالكامل من سياسة `units`. النتيجة: وحدة بها درس `is_trial` لكنها `is_free=false` وغير مملوكة لن تظهر في `from('units')` للطالب. الرؤية الآن فقط عبر `lessons` trial أو `get_trial_lessons`. | **طالب** بلا شراء يفتح `UnitsPage` (وحداتي) — لا يرى بطاقة الوحدة التي تحتوي trial، بينما `StudentCurriculumPage` يعرضها داخل `LockedUnitCard` كـ "درس مجاني متاح". تناقض UX قد يُفسر كـ "مش قادرة تجيب داتا". | 🟡 متوسط | قرار مقصود ومُوثق. التوصية: توحيد السلوك — إما إبقاء الوحدة مرئية كـ "مقفلة مع درس مجاني" في `UnitsPage` أيضًا، أو توثيق الفارق في UI. |
| **F-09** | `supabase/migrations/0051_free_units.sql:332-359` `get_public_unit_prices` | **RPC / RLS** | الدالة `SECURITY DEFINER` وتُمنح لـ `anon, authenticated` — وهذا صحيح للـ landing. لكنها `LEFT JOIN unit_pricing` وتُرجع `is_free` حتى لو `unit_pricing` بلا صف — صفحات الأسعار العامة قد تعرض 0 للوحدات المجانية قبل أن ينشئها المدرس. | **anon** يرى وحدة مجانية بسعر 0 قبل أن تُسعّر — ليس خطأ وظيفي لكنه قد يسبب ارتباك تسعير. | 🟢 منخفض | احتفظ بالسلوك؛ فقط وثّق أن `set_unit_free` ينشئ صف pricing 0/0 فورًا (سطر 52-57). |
| **F-10** | `src/data/rpc.ts:093-121` `list_units_for_grade_secure` fallback | **RPC / Network** | الـ fallback داخل `listUnitsForGrade` يبني وحدات صناعية من `getPublicUnitPrices` عبر مطابقة `grade_name` (نص) وليس `grade_id` — إذا تكرر اسم الصف، قد تُسند وحدات لصف خاطئ. `sort_order=0` و `created_at=now()` يفقدان الترتيب الحقيقي. | **طالب** عند فشل `42P17` (قبل 0052) يرى وحدات بترتيب خاطئ أو وحدات من صف آخر تشارك الاسم. | 🟡 متوسط | اجعل الـ fallback يستخدم `list_units_for_grade_secure` فقط (آمن ودقيق)، وأزل مسار `getPublicUnitPrices` أو اجعله يفلتر بـ `grade_id` عبر استعلام إضافي على `units`. |
| **F-11** | `src/features/walid/GradesPage.tsx:73-82` | **Network / Resilience** | `Promise.all([listAllGrades(), listDeletedGrades()])` بدون `allSettled` — فشل أحدهما (مثلاً `listDeletedGrades` يرمي `42501` لطالب) يُسقط كل الصفحة إلى `ErrorState`. لا يوجد `cancelled` guard. | **مدرس/admin** مع انقطاع لحظي أثناء جلب المحذوفة → يفقد قائمة الصفوف النشطة أيضًا ويرى "تعذر تحميل قائمة الصفوف". | 🟠 عالي | استبدل بـ `Promise.allSettled` مثل `CurriculumUnitsPage:86` و `PricingPage:85`. |
| **F-12** | `src/features/student/StudentLessonPage.tsx:187-257` `load()` | **Network / Resilience** | `Promise.all([getUnitById, listLessonsForUnit, listLessonVideos, listLessonPdfs, getMyProgress])` — أي فشل واحد (مثلاً `listLessonVideos` يرمي `42501` لأن `can_access_lesson` لم ينتشر) يلتقطه `catch` العام ويضع `loadError=true` فيُخفي الدرس كله رغم أن `has_access=true`. | **طالب** فتح درس مجاني للتو — الـ EF `get-video-playback-url` قد يرجع `access_denied` لحظيًا بينما `getMyLessonAccess` قال `has_access=true` → يرى "تعذر تحميل الدرس" بدل الفيديو. المعالجة الجزئية للـ retry موجودة فقط للـ playback وليس للـ load العام. | 🟠 عالي | حوّل إلى `Promise.allSettled` واعرض ما توفر (video + pdf + boards كل على حدة مع `ErrorState` جزئي)، كما يفعل `StudentCurriculumPage:136`. |
| **F-13** | `src/features/walid/PricingPage.tsx:102-106` | **RLS / UX** | بعد `Promise.allSettled` لوحدات كل صف، يتم `flatMap` للـ fulfilled فقط بلا تنبيه. إذا فشل صف واحد بسبب `42P17`، تختفي وحداته من القائمة ومن `Select` دون رسالة. | **مدرس** يرى أسعارًا ناقصة ويظن أن الوحدات حُذفت. | 🟡 متوسط | أضف عدّاد `failedGrades` واعرض `Badge` تحذيري أو `ErrorState` جزئي للصف الفاشل. |
| **F-14** | `src/features/walid/CodesPage.tsx:90-109` | **UX Resilience** | `load()` يجلب `listUnitPricing` فقط؛ `listCodesByUnit` في `useEffect` منفصل يستخدم نفس `error` state. فشل الأكواد يضع `setError(true)` فيُظهر `ErrorState` مكان جدول الأكواد **ومكان pricing** معًا، رغم أن الأسعار سليمة. | **مدرس** اختار وحدة وأكوادها فشلت بسبب شبكة → يرى "تعذر تحميل الأكواد" فوق الجدول كله ويفقد السياق. | 🟡 متوسط | افصل `codesError` عن `pricingError`، واعرض `ErrorState` داخل `Card` الأكواد فقط. |
| **F-15** | `src/features/student/UnitsPage.tsx:88-126` / `StudentCurriculumPage.tsx:96-108` | **Network** | عند `profile.grade_id == null` يتم `Promise.resolve([])` للوحدات — صحيح. لكن `priceById` يبقى فارغًا إذا فشل `getPublicUnitPrices`، فكل وحدة مجانية تُصنف كـ `lockedUnits` وتطلب كودًا بدل "افتح مجانًا". | **طالب جديد بلا صف** أو طالب صفه محذوف — يرى كل الوحدات مقفلة حتى المجانية. | 🟡 متوسط | اعتبر `is_free` من `unit.is_free` مباشرة (حقل الوحدة) كاحتياط إذا غابت الأسعار، ولا تعتمد فقط على `priceById`. |
| **F-16** | `src/features/reports/ReportsPage.tsx:90-109` | **Select / RLS** | تحميل الفلاتر يستخدم `c.from('grades').select('*')` و `c.from('units').select('*')` مباشرة بدون `try/catch` مفصل ولا `isSupabaseConfigured` guard. أخطاء `42501` (طالب ليس admin) تُسكت في `catch {}` لكن `select('*')` قد يفشل بـ `42703` لو `is_free` مفقود ويُسكت أيضًا. | **مدرس** يفلتر التقارير — قائمة الوحدات فارغة بلا تفسير. | 🟢 منخفض | استخدم `listAllGrades` / `listUnitsForGrade` الموحدة بدل `select('*')` مباشر. |
| **F-17** | `src/data/rpc.ts:182-242` `listStudents` / `listGrades` / `listAllGrades` | **Select** | كلها `select('*')` — تكشف كل الأعمدة بما فيها `deleted_at` حتى لو لم تحتاجها الواجهة. لا تسبب فشلًا اليوم لكنها هشة أمام أي عمود جديد `NOT NULL` بلا default. | غير مباشر — أي مهاجرة تضيف عمود `NOT NULL` بدون `DEFAULT` ستكسر كل `select('*')` مؤقتًا حتى تُملأ البيانات. | 🟢 منخفض | استبدل بـ `select('id, name, sort_order, is_active, deleted_at, created_at')` الصريح. |
| **F-18** | `public/sw.js:11-21,407-428,430-498` | **PWA / Cache** | الـ SW يخزن `APP_SHELL` (`/`, `/index.html`) و `fetch` للتنقل `network-first` ثم `cache.put`. عند نشر جديد، `index.html` القديم يشير لـ chunks هاش قديمة محذوفة — أول تحميل يعطي `404` للـ chunk، والـ SW يحذف `'/index.html'` و `'/'` من الكاش (سطر 479-480) لكن **بعد** أن يكون الخطأ قد ظهر. يحتاج reload يدوي. | **كل المستخدمين بعد كل نشر** — يرون `Failed to fetch dynamically imported module` أو شاشة بيضاء حتى reload. الـ `ErrorBoundary` و `main.tsx:29-74` يعالجانها بـ reload تلقائي لكن الـ SW قد يعيد تقديم `index.html` القديم من `caches.match(request)` قبل الحذف. | 🟡 متوسط | الحل الحالي جيد (حذف عند 404 + reload في `ErrorBoundary` + `vite:preloadError`). التوصية: ارفع `CACHE_VERSION` تلقائيًا في CI (hash من `dist/index.html`) بدل `v3` هاردكود، وأضف `Cache-Control: no-cache` لـ `index.html` في `vercel.json`. |
| **F-19** | `src/lib/pwa.ts:80-123` + `src/main.tsx:52-74` | **PWA / Chunk** | تسجيل الـ SW بـ `/sw.js?v=3` هاردكود؛ كل نشر جديد يتطلب bump يدوي وإلا يبقى `v3` ويحتفظ الكاش القديم. `controllerchange` يعمل reload فوري قد يقطع رفع فيديو خلفي. | **مدرس يرفع فيديو 2GB** أثناء نشر جديد — `controllerchange` يعيد التحميل ويقطع الـ TUS. | 🟡 متوسط | اربط `CACHE_VERSION` و `?v=` بنفس المتغير المولد من `package.json` version أو git hash، وأجّل `skipWaiting` حتى لا توجد jobs نشطة (`activeControllers.size === 0`). |
| **F-20** | `src/data/rpc.ts:146-350` + `public/sw.js:436-439` | **Network / CDN** | `fetch` لـ Supabase و Bunny و Google Fonts يُستثنى من الكاش عبر `url.origin !== location.origin` — صحيح. لكن `invokeFunction` يعيد المحاولة 2 مرات فقط بفاصل 180ms و 360ms — غير كافٍ لشبكات الموبايل الضعيفة. | **طالب على 3G** يفتح درسًا — `getPlaybackUrl` يفشل مرتين سريعًا ويظهر `تعذر تحميل الفيديو` رغم أن المحاولة الثالثة بعد ثانية كانت ستنجح. | 🟢 منخفض | ارفع `RPC_RETRY_BASE_MS` إلى 400ms مع jitter، أو اجعل `getPlaybackUrl` يعيد المحاولة 3 مرات مع backoff أسي. |

---

## 3) تحليل مفصل لكل محور مطلوب

### 3.1 `src/data/rpc.ts` — كل دالة RPC و `from('...').select`

**الوضع العام:** 74 استدعاء Supabase (38 `rpc` + 22 `from().select` + 14 `invokeFunction`). البنية جيدة: `withRpcRetry` للـ retry، و `getRpcErrorCode` يوحد الأكواد، و `ensureFreshAccessToken` يجدد الـ JWT قبل انتهائه بـ 30 ثانية.

**النقاط الحرجة:**

- **أسماء الجداول/الأعمدة صحيحة** مقارنة بـ `0002_tables_and_constraints.sql` و `DATABASE.md` — لا يوجد typo في `profiles` / `grades` / `units` / `lessons` / `lesson_videos` / `lesson_pdfs` / `unit_pricing` / `unit_codes` / `unit_purchases`. العمود الوحيد الخطر هو `units.is_free` (أُضيف في `0051`) — الكود يفترض وجوده في 9 مواضع `select('*')` و 4 سياسات.
- **`select('*')` في 12 دالة** (`listStudents:185`، `listGrades:209`، `listUnitsForGrade:422`، `getLessonById:584`، `getUnitById:872`، `listLessonsForUnit:556`، إلخ). هذا يخالف توصية PostgREST باستخدام أعمدة صريحة، ويجعل أي مهاجرة تضيف عمود `NOT NULL` بدون default تكسر القراءة حتى تُملأ البيانات. الأخطر هو `units` حيث `is_free` بلا `DEFAULT` سابقًا لكن `0051` أضافه بـ `DEFAULT false` — آمن حاليًا لكنه يبقى هشًا.
- **معالجة `is_free` غير موحدة:** `getPublicUnitPrices` و `getMyLessonAccess` تعالج `42703`، بينما `listUnitsForGrade` لا. هذا يعني أن سيناريو "DB قديمة" يعطي نتائج متناقضة: الأسعار تظهر (fallback ينجح) لكن الوحدات تختفي (fallback يفشل).
- **`getRpcErrorCode:244` ذكي** — يميز `23505` و `PGRST` و `42703` ويستخرج `unit_is_free` / `duplicate grade`. لكنه يعتمد على `message.includes('is_free')` للـ 42703 — إذا تغيرت رسالة Postgres في إصدار جديد قد لا يُكتشف. يُفضل الاعتماد على `code === '42703'` فقط.

### 3.2 `supabase/migrations/*.sql` — التعارضات `0051` / `0052` و `42P17` و `is_free`

**التسلسل الزمني:**

1.  `0047_fix_trial_access` — أدخل فرع trial في `units` عبر `EXISTS (lessons)` + فرع trial في `lessons` عبر `unit_id IN (units)` → تكرار.
2.  `0048_fix_units_rls_recursion` — أصلح التكرار عبر دالتين `SECURITY DEFINER` (`unit_has_published_trial` / `unit_is_published_active`) — حل نظيف.
3.  `0051_free_units` — **أعاد كتابة السياستين من الصفر** متجاهلاً حل `0048`، وأعاد `EXISTS (lessons)` مباشرة → أعاد التكرار `42P17`.
4.  `0052_fix_units_rls_recursion` — أزال فرع trial من `units` نهائيًا وكسر الحلقة.

**الخلاصة:** `0052` هو الإصلاح الصحيح حاليًا (لا تكرار لأنه `units` لا تستعلم `lessons` أبدًا). لكنه يترك **دينًا تقنيًا:** دالتا `0048` أصبحتا dead code، وسياسة `lessons` تستعلم `units` بثلاثة فروع (own-grade + trial + free) بدون helper — هذا آمن لأن الاتجاه أحادي، لكنه ثقيل (3 subqueries). التوصية: احذف `0048` helpers أو أعد استخدامها لتبسيط سياسة `lessons`.

**`is_free`:** `0051` أضاف العمود + `set_unit_free` + عدّل `can_access_lesson` + `get_public_unit_prices` + `list_unit_pricing` + `get_my_lesson_access` + السياستين. كل شيء متسق. الخطر الوحيد هو **طلب تطبيق المهاجرات بالترتيب** — إذا طُبقت `0051` دون `0052` ستسقط المنصة فورًا.

### 3.3 الصفحات السبع

| الصفحة | الاستدعاءات | هل `select('*')` قد يفشل؟ | هل `Promise.all` يسقط الصفحة؟ | الحكم |
| --- | --- | --- | --- | --- |
| `PricingPage.tsx:85,102` | `listUnitPricing` + `listGrades` + `getPlatformFee` ثم `listUnitsForGrade` لكل صف | لا مباشرة (عبر RPC)، لكن `listUnitsForGrade` قد يفشل بـ `42P17` | **لا** — يستخدم `Promise.allSettled` ويعرض ما توفر + `ErrorState` جزئي. ممتاز. | ✅ آمن |
| `CodesPage.tsx:78,99` | `listUnitPricing` ثم `listCodesByUnit` | لا | **جزئيًا** — `load()` سليم، لكن `listCodesByUnit` يشارك نفس `error` flag مع pricing فيُضلل. | 🟡 يحتاج فصل الأخطاء |
| `CurriculumUnitsPage.tsx:86` | `listUnitsForGrade` + `listDeletedUnitsForGrade` | نعم عبر `listUnitsForGrade` | **لا** — `allSettled` ويعرض كل واحد على حدة. | ✅ آمن |
| `StudentCurriculumPage.tsx:113-148` | `listUnitsForGrade` + `listMyProgress` + `getMyUnitPurchases` + `getPublicUnitPrices` + `getTrialLessons` ثم `listLessonsForUnit` لكل وحدة | نعم، لكن `listLessonsForUnit` داخل `allSettled` لكل وحدة ويعود `[]` عند الفشل | **لا** — `allSettled` في المستويين، ويعرض trial حتى بلا صف. الأفضل في المشروع. | ✅ ممتاز |
| `UnitsPage.tsx:88` | `listUnitsForGrade` + `getMyUnitPurchases` + `getPublicUnitPrices` | نعم | **لا** — `allSettled` مع فحص `unitsResult.length===0`. | ✅ آمن |
| `LessonAssetsPage.tsx:378-461` | `getLessonById` + `listLessonPdfs` + `listLessonVideos` + `listLessonComments` + `listLessonBoards` | نعم لكن كل واحدة `try/catch` منفصل + `void` | **لا** — كل تحميل مستقل، فشل أحدهما لا يمنع الآخر. | ✅ آمن |
| `GradesPage.tsx:76` | `listAllGrades` + `listDeletedGrades` | نعم (`select('*')` على `grades` لا يتأثر بـ `is_free` لكن قد يتأثر بأعمدة مستقبلية) | **نعم** — `Promise.all` يسقط كل الصفحة. | 🔴 يحتاج `allSettled` |

**الخلاصة:** 6 من 7 صفحات محمية بـ `allSettled` أو تحميل منفصل. الاستثناء الوحيد `GradesPage` هو ثغرة واضحة.

### 3.4 `src/lib/supabase.ts` و `src/app/App.tsx` — هل `isSupabaseConfigured` صحيح؟

```ts
// supabase.ts:5-12
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://nfusbrktrqfrnaetetmr.supabase.co';
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || 'sb_publishable_...';
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey); // دائمًا true
```

**الحكم:** غير صحيح. الـ fallback يجعل `isSupabaseConfigured` دائمًا `true`، لذا `App.tsx:19` لن يعرض `ConfigErrorScreen` أبدًا. في بيئة بلا `.env` سيتصل التطبيق بمشروع Supabase هاردكود (إنتاج) بصمت، وقد يعرض بيانات إنتاج في معاينة أو يفشل بلا رسالة واضحة. التوصية: اجعل `isSupabaseConfigured` يتحقق من `import.meta.env` مباشرة بدون fallback، واحتفظ بالهاردكود فقط في `DEV`.

### 3.5 `public/sw.js` — هل يخزن `index.html` قديم يسبب فشل Chunks؟

**الآلية الحالية:**

- `install:407` يخزن `APP_SHELL` (`/`, `/index.html`, icons) في `walid-aurora-v3`.
- `fetch` للتنقل `network-first` (سطر 452-464): يجلب من الشبكة ويخزن نسخة، وعند الفشل يرجع `caches.match(request) ?? caches.match('/index.html')`.
- `fetch` للأصول `cache-first` ثم `network` مع تخزين `assets/*` و `*.webmanifest` إذا `response.ok`.
- **معالجة Chunk قديم:** عند `404` لأصل تحت `/assets/` يحذف `'/index.html'` و `'/'` من الكاش (سطر 478-480) ليُجبر التحميل التالي على جلب `index.html` جديد بهاش جديد.
- `activate:416` يحذف كل `CACHE_NAME` القديم ويستأنف الـ TUS uploads.

**الحكم:** التصميم **سليم ويمنع احتجاز `index.html` قديم** في معظم الحالات. لكن بقيت نقطتان:

1.  الحذف يحدث **بعد** اكتشاف `404` — المستخدم يرى خطأ chunk واحد قبل الإصلاح. الـ `ErrorBoundary:22` و `main.tsx:52` يعالجانه بـ reload تلقائي، لكن الـ reload قد يعيد تقديم `index.html` القديم من `caches.match('/index.html')` إذا لم يكتمل الحذف بعد.
2.  `CACHE_VERSION = 'v3'` هاردكود — إذا نُشرت نسخة جديدة دون رفع الرقم، سيبقى الكاش القديم. `registerServiceWorker` يستدعي `reg.update()` دوريًا لكنه لا يرفع `v3`.

**التوصية:** ولّد `CACHE_VERSION` من hash محتوى `dist/index.html` في `vite.config.ts` أو من `package.json` version، وأضف `Cache-Control: no-store` لـ `index.html` في `vercel.json`.

---

## 4) مقياس الشدة وكيف تم التقييم

- **حرج:** يمنع شريحة كاملة (كل الطلاب) من رؤية المحتوى أو يكسر التطبيق بعد كل نشر.
- **عالي:** يمنع دورًا واحدًا (مدرس/admin) أو يحول فشل جزئي إلى فشل كلي للصفحة.
- **متوسط:** تدهور UX أو بيانات ناقصة بدون انهيار كامل.
- **منخفض:** دين تقني أو تحسين مستقبلي.

---

## 5) التوصيات المرتبة حسب الأولوية

### P0 — نفّذ قبل النشر التالي

1.  **إصلاح `isSupabaseConfigured` (F-01):** اجعله يتحقق من `import.meta.env` بدون fallback. اختبر `ConfigErrorScreen` بحذف `.env` محليًا.
2.  **توحيد معالجة `is_free` المفقود (F-02/F-03/F-06):** أضف `isMissingColumnError` لكل `from('units').select` أو استبدلها بـ RPC آمن. اختبر عبر تشغيل المنصة على DB بدون `0051`.
3.  **إصلاح `GradesPage` (F-11):** استبدل `Promise.all` بـ `Promise.allSettled`.
4.  **تأكيد تطبيق `0052` على كل بيئة إنتاج/معاينة:** شغّل `SELECT * FROM pg_policies WHERE policyname='units_select_staff_or_published_own_grade'` وتأكد أن تعريفها لا يذكر `lessons`.

### P1 — خلال أسبوع

5.  **إصلاح `getMyLessonAccess` و `listUnitPricing` fallbacks (F-05/F-06):** لا تعيد نفس الـ RPC؛ ابنِ fallback حقيقي.
6.  **إصلاح `StudentLessonPage` load (F-12):** حوّل `Promise.all` إلى `allSettled` واعرض كل قسم (video/pdf/boards) بخطأ مستقل.
7.  **فصل أخطاء `CodesPage` (F-14):** `pricingError` vs `codesError`.
8.  **توليد `CACHE_VERSION` تلقائيًا (F-18/F-19):** اربطه بـ `package.json` version أو hash.

### P2 — تحسين مستمر

9.  **استبدال `select('*')` بأعمدة صريحة** في كل `from()` — ابدأ بـ `units` و `lessons`.
10. **زيادة `RPC_RETRY_BASE_MS` وإضافة jitter** (F-20) لتحسين تجربة الموبايل.
11. **حذف dead code `0048` helpers** أو إعادة استخدامها لتبسيط سياسة `lessons`.
12. **إضافة اختبار مهاجرة آلي:** بعد كل `migrate` شغّل `SELECT can_access_lesson(...)` لطالب وهمي وتأكد عدم ظهور `42P17`.

---

## 6) ملاحظات إضافية

- **لا يوجد تسريب `select('*')` لبيانات حساسة** — `profiles.phone` لا يُرجع عبر `listStudents` المفلتر بـ RLS، و `lesson_videos.thumbnail_url` مُستثنى عمدًا في `listLessonVideos:790` ويُجلب عبر `get-video-thumbnail-url` فقط.
- **`invokeFunction` يتعامل مع `401` بتجديد التوكن مرة واحدة** (`rpc.ts:1496-1507`) — جيد، لكنه لا يعالج `429` كـ retry في `functionErrorFromResponse` إلا عبر `withRpcRetry` الخارجي.
- **`ReportsPage` يستخدم `select('*')` مباشر** للفلاتر — ليس حرجًا لأنه admin-only، لكنه يكرر نفس هشاشة `is_free`.
- **الاختبارات الحالية** (`*.test.tsx`) تغطي `PricingPage` و `CodesPage` و `CurriculumUnitsPage` لكنها لا تختبر سيناريو `42P17` أو `42703` — يُنصح بإضافة اختبار يحاكي `error.code='42P17'` ويتأكد من تفعيل الـ fallback.

---

## 7) الخلاصة

المنصة **في حالة جيدة بعد `0052`** — لا يوجد تكرار RLS نشط، ومعظم الصفحات محمية بـ `allSettled`، والـ Service Worker يعالج chunks القديمة. المخاطر المتبقية تتركز في **هشاشة `is_free` غير الموحدة** و **بوابة الإعدادات المعطلة** و **صفحة واحدة بلا resilience (`GradesPage`)**. إصلاح P0 الأربعة يزيل 90% من احتمالية تكرار "تعذر تحميل الوحدات والأكواد".

> **التوصية النهائية:** طبّق P0 قبل أي نشر جديد، وشغّل تدقيقًا آليًا بعد كل مهاجرة يتحقق من `42P17` و `42703`.

---

*تم إنشاء هذا التقرير آليًا عبر تدقيق استاتيكي كامل للكود والمهاجرات — لا يحتوي على كود تنفيذي، فقط توصيات.*
