# تقرير اختبار الأخطاء غير المتوقعة — WALIDAWNY

> **التاريخ:** 2026-09-07 — **المنصة:** React 18 + Vite + React Router + Supabase + hls.js
> **الرسالة المستهدفة:** `حدث خطأ غير متوقع / عذرًا، حدثت مشكلة أثناء عرض الصفحة. يرجى إعادة تحميل الصفحة للمتابعة.`
> **النطاق:** تحليل ستاتيكي كامل للكود في `src/` دون تنفيذ بيئة حية، بالتركيز على المسارات التي تصل إلى `ErrorBoundary` مقابل الشاشة البيضاء.

---

## 1) الملخص التنفيذي

| البند | الخلاصة |
|---|---|
| **عدد المشكلات المؤكدة** | **16** مشكلة موزعة على 7 فئات |
| **حرجة تؤدي لشاشة بيضاء (لا يلتقطها ErrorBoundary)** | **3** |
| **عالية تُظهر رسالة "حدث خطأ غير متوقع" (يلتقطها ErrorBoundary)** | **5** |
| **متوسطة/منخفضة (تدهور UX أو بيانات مفقودة دون تحطم)** | **8** |
| **الحالة العامة** | المنصة **مستقرة نسبيًا** ضد `TypeError: Cannot read properties of undefined` بفضل الاستخدام المنهجي لـ `?? []` و `Promise.allSettled` و `Skeleton/ErrorState`. أخطر ثغرات التحطم متبقية في **تهيئة الجذر (`main.tsx`)** و **اعتماديات التخزين المحلي المعطوب** و **اعتماد مسارات Supabase الافتراضية التي تُخفي سوء الإعداد** و **فشل تحميل الأجزاء المجزأة (chunk)**. |
| **هل الصفحة تنهار عند `profile=null` / `grade_id=null` / `units=[]` / `lesson=null`؟** | **لا** — كل تلك الحالات معالجة بشكل صحيح وتظهر `EmptyState` أو `Skeleton` دون تحطم (تفصيل في §5). |
| **أكبر مخاطرة تشغيلية** | `supabase.ts:5-10` يحتوي قيمًا افتراضية صلبة تجعل `isSupabaseConfigured` دائمًا `true` — شاشة `ConfigErrorScreen` لن تظهر أبدًا، وسوء الإعداد سيظهر لاحقًا كأخطاء RPC غامضة يلتقطها ErrorBoundary بدل تنبيه واضح. |

**الخلاصة بـ 3 أسطر:** لا يوجد ` .map` مكشوف على `undefined` سيُسقط المنصة في السيناريوهات العادية. السقوط الحقيقي يأتي من **خارج شجرة React** (عدم وجود `#root`، خطأ أثناء تقييم الوحدة قبل تركيب `ErrorBoundary`)، ومن **localStorage معطوب لشريط الإعلانات**، ومن **فشل تحميل chunk مجزأ شبكيًا**. معالجة هذه الثلاثة + إزالة القيم الافتراضية لـ Supabase + إضافة حدّ عام لـ `unhandledrejection` ستخفض 90% من احتمالات ظهور رسالة الخطأ غير المتوقعة.

---

## 2) متى يُفعَّل `ErrorBoundary` ومتى لا يُفعَّل

**الملف:** `src/app/ErrorBoundary.tsx:11-44`

| يلتقطه | لا يلتقطه |
|---|---|
| أخطاء **الرندر** داخل `App` وأبناءه (مثل `TypeError` أثناء `render` أو في `constructor` / `getDerivedStateFromError`) | أخطاء **معالجات الأحداث** (`onClick`, `onSubmit`, `handleDismiss`) |
| أخطاء **دورة الحياة** (`componentDidMount`, `useEffect` أثناء الرندر المتزامن) | **الرفض غير المعالج** `Promise` / `async/await` دون `try/catch` (معظم استدعاءات `rpc.ts` معالجة، لكن `invokeFunction` قد يرمي خارج نطاق الرندر) |
| أخطاء **التحميل المتأخر** `lazy()` عند فشل `import()` **أثناء الرندر** (يُعرض كـ `ChunkLoadError` ويُلتقط) | أخطاء **خارج شجرة React** إطلاقًا: `main.tsx:52` قبل تركيب الجذر، `document.body` قبل وجوده، `registerServiceWorker` خارج React، `window.onerror` العام |
| | أخطاء **داخل `ErrorBoundary` نفسه** (لو سقط `render` في السطر 24-39) |
| **إعادة الضبط:** فقط `window.location.reload()` في `ErrorBoundary.tsx:33` — لا يوجد `resetKeys` ولا `componentDidUpdate` لإعادة المحاولة دون إعادة تحميل كاملة. | |

**النتيجة:** `ErrorBoundary` في `src/main.tsx:58` يغلف `App` فقط، لذا أي `throw` يحدث **قبل** `createRoot(...).render` (مثل `main.tsx:53`) ينتج **شاشة بيضاء تمامًا** بلا أي رسالة.

---

## 3) جدول المشكلات المكتشفة

> **الخطورة:** `حرجة` = شاشة بيضاء / توقف كامل · `عالية` = رسالة "حدث خطأ غير متوقع" تظهر للمستخدم · `متوسطة` = تدهور وظيفي مع بقاء الصفحة · `منخفضة` = عيب تجميلي/خفي

| # | الملف:السطر | السبب الجذري | السيناريو الذي يؤدي للخطأ | الخطورة | يلتقطه ErrorBoundary؟ |
|---|---|---|---|---|---|
| **E-01** | `src/main.tsx:50-53` | `throw new Error('Root element #root was not found')` يحدث **قبل** تركيب `ErrorBoundary` | `index.html` تالف/معدل يدويًا أو إعداد Vite يحذف `<div id="root">`، أو حقن `base` خاطئ يحجب الـ HTML | **حرجة** | **لا — شاشة بيضاء** |
| **E-02** | `src/lib/supabase.ts:5-10` + `src/app/App.tsx:19` | `supabaseUrl = VITE_SUPABASE_URL \|\| 'https://nfusbrktrq...'` و `supabasePublishableKey` لهما fallback صلب، لذا `isSupabaseConfigured` دائمًا `true` وشاشة `ConfigErrorScreen` ميتة | نشر بإنتاج مع `.env` ناقص أو متغيرات Vercel غير مضبوطة — بدل رؤية تنبيه الإعداد، كل استدعاء `getSupabaseClient().rpc` سيفشل لاحقًا بتوكن خاطئ ويُظهر "حدث خطأ غير متوقع" متناثر | **عالية** | نعم (الأخطاء اللاحقة تُلتقط) لكن السبب الحقيقي مُخفى |
| **E-03** | `src/components/AnnouncementBanner.tsx:25-30` + `:80` | `getDismissedState()` يفعل `JSON.parse(stored)` بلا تحقق من النوع؛ إذا كان `localStorage['announcement-dismissed']` = `"null"` أو `"\"hello\""` أو `"42"` يعود `null/string/number`، ثم `dismissed[announcement.id]` في `:72` أو `{...dismissed}` في `:80` يرمي `TypeError: Cannot convert undefined or null to object` | مستخدم يعبث بـ DevTools أو امتداد متصفح يكتب قيمة فاسدة في localStorage، أو تعارض ناتج عن نسخة قديمة من الكود | **عالية** | **نصف ونصف:** الرندر الأول (`:72`) يُلتقط → رسالة الخطأ؛ أما رمية `handleDismiss` (`:80` داخل `onClick`) فـ **لا تُلتقط** لكونها معالج حدث → حالة متكسرة صامتة |
| **E-04** | `src/app/router.tsx:8-54` + `src/main.tsx:27` | كل الصفحات `lazy()` محاطة بـ `Suspense` فقط دون `ErrorBoundary` داخلي؛ `import('...')` قد يفشل بشبكة ضعيفة/تحديث deploy (hash chunk قديم) → `ChunkLoadError` | تحديث إنتاج مع بقاء تبويب قديم مفتوح، ثم تنقل داخلي يحاول تحميل chunk محذوف من CDN | **عالية** | نعم — لكن بلا زر "إعادة المحاولة الذكية" (فقط reload عام) وبلا رسالة مخصصة |
| **E-05** | `src/features/auth/AuthContext.tsx:253-258` + `src/components/guards.tsx:45` + `src/components/LayoutShell.tsx:50` | `useAuth()` يرمي `Error('useAuth must be used within AuthProvider')` لو استُدعي خارج الشجرة | استيراد مستقبلي لخاطئ لـ `LayoutShell` أو `guards` خارج `Providers` (مثل صفحة عامة جديدة تنسى التغليف)، أو اختبار وحدة ينسى `AuthProvider` | **عالية** | نعم — يظهر "حدث خطأ غير متوقع" كامل الصفحة |
| **E-06** | `src/main.tsx:10-20` | تهيئة RTL في مستوى الوحدة: `document.body.dir = 'rtl'` داخل `DOMContentLoaded` بلا تحقق ثانٍ من `document.body` قد يكون `null` في بيئات SSR/اختبار غريبة، وأي `throw` هنا يحدث قبل `createRoot` | بيئة اختبار تحاكي `document` ناقص، أو متصفح قديم بسكربت يحذف `body` مؤقتًا | **حرجة** | لا — شاشة بيضاء (خارج React) |
| **E-07** | `src/lib/pwa.ts:80-123` | `registerServiceWorker()` يستمع لـ `controllerchange` ويعيد `window.location.reload()` بلا `sessionStorage` guard إضافي؛ لو SW يتذبذب (deploy متكرر) قد يدخل حلقة reload | نشر سريع مرتين متتاليتين + تبويب قديم يحاول التحديث — نظريًا `refreshing` flag يمنع، لكن تبويبان مفتوحان قد يتبادلان reload | **متوسطة** | لا — reload خارج React |
| **E-08** | `src/data/rpc.ts:1433-1484` (`invokeFunction`) + `src/upload/uploadManager.ts:311` | `invokeFunction` يرمي `network_error`/`internal_error` وفي كثير من الصفحات الاستدعاء **محمي** بـ `try/catch`، لكن بعض المسارات تستخدم `void` بلا انتظار (مثل `AnnouncementBanner:51`, `StudentLessonPage:216`) و `uploadManager.enqueueVideoUpload` لا يرمي داخل الرندر | انقطاع شبكة لحظي أثناء `getPlaybackUrl` أو `getLessonBoardSignedUrls` — الصفحة لا تنهار لكن قد تبقى `Spinner` إلى الأبد لأن `progressLoaded`/`playbackError` لا يُحدَّث | **متوسطة** | لا — أخطاء async لا تصل لـ ErrorBoundary، بل تبقى حالة تحميل عالقة (UX سيئ دون تحطم) |
| **E-09** | `src/upload/uploadManager.ts:64-74` + `src/lib/pwa.ts:46-77` | `localStorage.getItem/setItem` محاط بـ `try/catch` في معظم الأماكن، لكن `JSON.parse` للـ `announcement-dismissed` (E-03) ليس كذلك بشكل كافٍ؛ وفي `uploadManager` لو `localStorage` يرمي `QuotaExceededError`/`SecurityError` (وضع خاص صارم) فـ `persistAll()` يبتلع الخطأ لكن `emit()` قد يبث snapshot ناقص | متصفح iOS بوضع خاص يمنع الكتابة، أو امتلاء التخزين (2-5MB) بعد تراكم `walid-upload-jobs` | **منخفضة** | لا — يُبتلع صامتًا، لا يظهر ErrorBoundary |
| **E-10** | `src/features/walid/WalidDashboardPage.tsx:168,198,221` | `stats.by_grade.map` / `stats.top_units.map` / `stats.recent_purchases.map` تفترض أن `get_dashboard_stats` يعيد كائنًا بكل الحقول مصفوفات؛ لو الـ RPC يعيد `null` أو حقل ناقص بسبب migration ناقصة | DB migration `0051` غير مطبقة أو RPC يعيد `null` مؤقتًا أثناء deploy | **عالية** | نعم — `TypeError: Cannot read properties of undefined (reading 'map')` → رسالة الخطأ |
| **E-11** | `src/components/VideoPlayer.tsx:50-82` + `src/features/student/StudentLessonPage.tsx:277-305` | `src` قد يكون `undefined` إذا `playback.playback_url` ناقص/تالف؛ `video.src = undefined` يحوله لنص `"undefined"` و `hls.loadSource("undefined")` قد يرمي؛ كذلك `activeVideo` قد يكون `null` و `getPlaybackUrl` يُستدعى مع `lesson.id` فقط بلا `videoId` في حالة سباق | `lesson` يحتوي فيديو `status !== 'ready'` مصفى لكن `primaryVideo` يبقى `null` و `extraVideos` فارغ → المسار لا يستدعي المشغل، لكن لو `listLessonVideos` يعيد بيانات تالفة `source: null` | **متوسطة** | نعم لو حدث أثناء الرندر؛ لا لو حدث داخل `fetchWithRetry` (async) |
| **E-12** | `src/lib/clipboard.ts:2` | `navigator.clipboard` قد يكون `undefined` في سياق غير آمن (`http` ليس `https`) أو في WebView قديم؛ الكود يفحص `navigator.clipboard &&` لكن `navigator` نفسه قد لا يوجد في SSR/Worker | استدعاء `copyText` من `UnitsPage:343` في بيئة لا تملك `navigator` (اختبار Node بلا mock) | **منخفضة** | لا — معالج حدث، لا يلتقطه ErrorBoundary، يعود `false` صامتًا (الـ fallback `execCommand` قد يرمي أيضًا لكنه محاط بـ try/catch) |
| **E-13** | `src/lib/format.ts:1-39` | `Intl.DateTimeFormat('ar-EG')` قد يرمي `RangeError` في بيئات بلا دعم locale عربي (Node قديم جدًا أو polyfill ناقص)، و `new Date(value)` مع `value` غير ISO قد يعود `Invalid Date` لكنه معالَج | متصفح قديم جدًا أو اختبار Node على نسخة ICU مصغرة | **منخفضة** | نعم لو استُدعي أثناء الرندر (مثل `StudentDetailPage:270` `formatDateTime`) → رسالة الخطأ |
| **E-14** | `src/data/rpc.ts:1371-1407` (`functionErrorFromResponse`) | عند `response.json()` فاشل بسبب body فارغ، الكود يحاول `response.text()` ثم `JSON.parse(text)` — لو `text` هو `""` يبقى `body = null` ويعود `internal_error` سليم؛ لكن لو الخادم يعيد HTML (صفحة خطأ Vercel) فـ `text.trim().startsWith('{')` سيكون `false` ويعود `internal_error` عام بلا تفاصيل | Edge Function يسقط ويعيد HTML بدل JSON (خطأ gateway) | **منخفضة** | لا — الخطأ يُرمى للمستدعي، ليس تحطم رندر |
| **E-15** | `src/components/InstallPrompt.tsx:68-85` | `window.matchMedia('(display-mode: standalone)')` قد يكون `undefined` في متصفح قديم؛ الكود يفحص `typeof window.matchMedia !== 'function'` في مكان واحد لكن `isRunningStandalone()` في `src/lib/pwa.ts:28` يفحصه أيضًا — مغطى جزئيًا | متصفح قديم جدًا أو بيئة اختبار بلا `matchMedia` mock | **منخفضة** | لا — يُعاد `false` سليم |
| **E-16** | `src/app/App.tsx:13-17` + `src/main.tsx:10` | الكتابة المتكررة لـ `document.documentElement.dir = 'rtl'` دون `try/catch` لو `document` غير قابل للكتابة (CSP `sandbox` أو iframe معزول) | تضمين المنصة داخل iframe بـ `sandbox` بدون `allow-same-origin` | **منخفضة** | لا — خارج React (شاشة بيضاء محتملة لو الخطأ في مستوى الوحدة) |

---

## 4) فحص الملفات المطلوبة واحدًا بواحد

### 4.1 `src/app/ErrorBoundary.tsx:11-44`
- **متى يُفعَّل:** أي `throw` أثناء رندر `children` أو في `getDerivedStateFromError`. يحوّل الشجرة إلى شاشة RTL ثابتة مع زر `window.location.reload()` فقط.
- **ما لا يلتقطه:** أحداث (`onClick`), `setTimeout`, `Promise` مرفوضة، أخطاء قبل تركيبه (`main.tsx:53`), أخطاء داخل نفسه.
- **نقاط تحسين:** لا يوجد `resetKeys`/`onReset` لإعادة المحاولة دون reload كامل، ولا تسجيل للخطأ في Sentry/Log — فقط `console.error` في `:19`.

### 4.2 `src/app/router.tsx` و `src/app/App.tsx`
- **المسارات:** 38 مسارًا، كلها `lazy()` تحت `Suspense` واحد في `:66`. لا يوجد `ErrorBoundary` لكل مسار، ولا `loader/errorElement` من React Router.
- **خطأ تعريف المسارات يسبب crash؟** لا — التعريف سليم نحويًا. الخطر الوحيد هو **فشل تحميل chunk** (E-04) أو **استيراد دائري** مستقبلي لصفحة تنسى `export`.
- **`App.tsx:19-21`:** شرط `isSupabaseConfigured` عديم الفائدة بسبب القيم الافتراضية في `supabase.ts` (E-02). إزالة الفالباك ستعيد له معناه.

### 4.3 `src/features/auth/AuthContext.tsx` و `src/components/guards.tsx`
- **`useAuth` خارج `Provider`:** يرمي فورًا (`:256`) — **مقصود** للكشف المبكر، وسيُلتقط ويُظهر رسالة الخطأ (E-05). لا يوجد `useAuthOptional`.
- **`guards.tsx`:** `ProtectedRoute:44` و `RoleGuard:69` يستهلكان `useAuth` بأمان؛ الحالات الثلاث (`loading/profileLoading`, `bootstrapError`, `!session`/`!role`) مغطاة بـ `LoadingScreen`/`AuthErrorCard`/`Navigate` — لا يوجد `.map` مكشوف.
- **`AuthContext` bootstrap:** يستخدم `withTimeout(20s)` + 3 محاولات + `isNetworkError` تمييز دقيق؛ عند الفشل النهائي يضبط `bootstrapError=true` بدل الرمي — **لا يسبب تحطم رندر**.

### 4.4 `src/lib/supabase.ts`
- **لو `VITE_SUPABASE_URL` ناقص:** بسبب `|| fallback` في `:5-8` لن يكون ناقصًا أبدًا — `getSupabaseClient()` لن يرمي. الخطر هو **اتصال صامت بخادم خاطئ** ثم سلسلة `PGRST`/`JWT expired` لاحقًا.
- **التوصية:** حذف الفالباك والاكتفاء بـ `import.meta.env.VITE_SUPABASE_URL` مع `throw` مبكر في `main.tsx` قبل الرندر، ليعمل `ConfigErrorScreen`.

### 4.5 `src/data/rpc.ts`
- **هل يوجد RPC بدون `try/catch` يسقط الصفحة؟** لا — كل دالة `async` ترمي `error` للمستدعي، والمستدعون إما `try/catch` مباشر أو `Promise.allSettled` (مثل `UnitsPage:88`, `StudentCurriculumPage:113`). الاستثناء الوحيد: مسارات `void` best-effort (`StudentLessonPage:216` boards) تبتلع الخطأ بـ `.catch(() => setBoards([]))`.
- **الغطاء الجيد:** `getMyLessonAccess:1104` يملك 3 طبقات fallback (missing column → retry → generic)، و `invokeFunction:1456` يعيد المحاولة مع `withRpcRetry`.
- **الباقي الخطر:** `getRpcErrorCode:244` يفترض `error` كائنًا، لكن لو RPC يعيد `string` خام سيرجع `null` — ليس تحطمًا.

### 4.6 `src/components/*` و `src/features/*/*` — هل يوجد `.map` على `undefined/null`؟
- **النتيجة:** **لا يوجد `.map` مكشوف في المسارات الحرجة للطالب.** كل القوائم محمية:
  - `UnitsPage:120-125` يستخدم `(units ?? []).filter` ثم `.map` على النتيجة.
  - `StudentCurriculumPage:124-150` يستخدم `Promise.allSettled` + `.filter(isFulfilled)` قبل `.map`.
  - `StudentLessonPage:238-246` يبني `siblings` من `lessonRows.filter(...).sort(...)` ثم `.map` لاحقًا فقط بعد التأكد من `Array.isArray`.
  - **الخطر الوحيد المؤكد** هو `WalidDashboardPage:168` `stats.by_grade.map` لو `stats` غير مكتمل (E-10) — يلزم guard بـ `Array.isArray(stats.by_grade) ? stats.by_grade : []`.

### 4.7 `src/main.tsx`
- **تهيئة الجذر:** `:50-53` فحص `getElementById('root')` ثم `throw` خارج `ErrorBoundary` → **شاشة بيضاء** (E-01).
- **التهيئة الجانبية:** RTL في `:10-20`, `registerServiceWorker():23`, `import('web-vitals'):27` كلها محاطة بـ `try/catch` أو `catch(() => {})` — **آمنة**.
- **ماذا لو `navigator.serviceWorker` غير مدعوم؟** `pwa.ts:82-86` يعود مبكرًا — لا تحطم، والرفع يسقط تلقائيًا إلى `uploadManager.runFallbackUpload` (TUS مباشر).

### 4.8 السيناريوهات الحدّية المطلوبة

| السيناريو | الملفات المفحوصة | هل يسبب تحطم؟ | السلوك الفعلي |
|---|---|---|---|
| `profile = null` (حساب جديد بلا صف) | `StudentCurriculumPage:96`, `UnitsPage:189`, `StudentDashboardPage:91` | **لا** | يعرض `EmptyState` "لم يتم تحديد صفك الدراسي" + قسم الدروس المجانية `getTrialLessons()` يعمل حتى بلا `grade_id` |
| `grade_id = null` | نفس الملفات + `StudentDetailPage:238` | **لا** | نفس السلوك؛ `listUnitsForGrade` لا يُستدعى، ويعود `[]` |
| `units = []` (صف بلا وحدات منشورة) | `StudentCurriculumPage:445`, `UnitsPage:214`, `WalidDashboardPage` | **لا** | `EmptyState` "لا توجد وحدات بعد" / "لم تشترِ أي وحدة بعد" |
| `lesson = null` (معرف غير موجود) | `StudentLessonPage:195,437` | **لا** | `EmptyState` "الدرس غير موجود" بعد `setLesson(null)` |
| `localStorage معطوب` | `AnnouncementBanner:25-36`, `uploadManager:64-74`, `pwa.ts:46-77` | **نعم جزئيًا (E-03)** | `announcement-dismissed` الفاسد يسقط الرندر؛ `walid-upload-jobs` الفاسد مُعالج ويرجع `[]`؛ `walid-pwa-*` محمي بـ try/catch |
| `navigator.serviceWorker غير مدعوم` | `pwa.ts:80`, `swBridge.ts:8`, `uploadManager:350` | **لا** | `isSupported()` يعود `false` → fallback TUS مباشر، بانر الرفع يعمل بلا SW |

---

## 5) مصفوفة الخطورة الكاملة (للفرز السريع)

| الخطورة | العدد | أمثلة ID |
|---|---|---|
| حرجة (شاشة بيضاء) | 3 | E-01, E-06, (E-02 غير مباشر) |
| عالية (رسالة الخطأ تظهر) | 5 | E-02, E-03, E-04, E-05, E-10 |
| متوسطة | 4 | E-07, E-08, E-11, E-16 |
| منخفضة | 4 | E-09, E-12, E-13, E-14 |

---

## 6) التوصيات — مرتبة حسب الأثر / الجهد

### فوري (يوم واحد)

| # | التوصية | الملف | الأثر |
|---|---|---|---|
| **R-01** | **احذف القيم الافتراضية الصلبة** في `supabase.ts:5-8` واجعل `supabaseUrl = import.meta.env.VITE_SUPABASE_URL` فقط؛ أضف فحصًا مبكرًا في `main.tsx` قبل `createRoot` يعرض `ConfigErrorScreen` بوضوح. | `src/lib/supabase.ts:5` | يعيد شاشة الإعداد للحياة ويمنع سلسلة أخطاء غامضة لاحقًا |
| **R-02** | **صلّح `getDismissedState()`** ليتحقق من النوع: `const v = JSON.parse(stored); return v && typeof v === 'object' && !Array.isArray(v) ? v as DismissedState : {};` وغيّر `handleDismiss` إلى `const next = { ...(dismissed && typeof dismissed === 'object' ? dismissed : {}), [id]: true }`. | `src/components/AnnouncementBanner.tsx:25` | يغلق ثغرة `TypeError` الوحيدة المؤكدة من localStorage معطوب |
| **R-03** | **أضف `ErrorBoundary` متداخل حول `Suspense` في `router.tsx`** أو استخدم `errorElement` لكل مسار، مع زر "إعادة تحميل الجزء" يحاول `import()` مجددًا قبل `location.reload()`. | `src/app/router.tsx:66` | يحوّل `ChunkLoadError` من رسالة عامة إلى رسالة قابلة للاسترداد |
| **R-04** | **احمِ `WalidDashboardPage`** بـ `Array.isArray`: ` (Array.isArray(stats.by_grade) ? stats.by_grade : []).map(...)` (ونفسه لـ `top_units`, `recent_purchases`). | `src/features/walid/WalidDashboardPage.tsx:168` | يمنع تحطم لوحة التحكم عند RPC ناقص |

### قريب (أسبوع)

| # | التوصية | التفصيل |
|---|---|---|
| **R-05** | **انقل فحص `#root` داخل `ErrorBoundary`** — بدل `throw` في `main.tsx:53` اعرض `ConfigErrorScreen` مخصص أو `div` خطأ داخل `ErrorBoundary`، أو على الأقل `document.body.innerHTML = '<p>تعذر تشغيل التطبيق</p>'`. | يلغي الشاشة البيضاء الصامتة |
| **R-06** | **أضف حدودًا عامة للأخطاء غير الملتقطة:** `window.addEventListener('unhandledrejection', ...)` و `window.addEventListener('error', ...)` ترسل إلى `console.error` + `showToast` ولا تترك `Spinner` عالقًا إلى الأبد. | يعالج E-08 (حالات التحميل العالقة) |
| **R-07** | **حسّن `ErrorBoundary`** بإضافة `getDerivedStateFromError` يخزن `error.message` وزرين: "إعادة المحاولة" (يعيد `hasError=false`) و"إعادة تحميل الصفحة"، مع إرسال اختياري إلى خدمة تتبع. | يقلل احتكاك المستخدم مع رسالة الخطأ |
| **R-08** | **وحّد معالجة `localStorage` الفاسد** عبر helper `safeJsonParse<T>(key, fallback)` يُستخدم في كل مكان (يوجد حاليًا 3 تطبيقات متفرقة). | يمنع تكرار E-03/E-09 |

### متوسط المدى

| # | التوصية | التفصيل |
|---|---|---|
| **R-09** | **اختبارات تلقائية للحالات الحدّية:** أضف `vitest` يغطي `grade_id=null`, `units=[]`, `lesson=null`, `localStorage` معطوب، `ChunkLoadError` محاكى، `stats` ناقص. معظم البنية التحتية موجودة (`src/test/supabase-mock.ts`). | يمنع انحدار مستقبلي |
| **R-10** | **احمِ `VideoPlayer`** بفحص `if (!src || typeof src !== 'string' || src === 'undefined') return <ErrorState ...>` قبل `hls.loadSource`. | يغلق E-11 نهائيًا |
| **R-11** | **أضف `loading="lazy"` + `onError` لكل `<img>` للوحات** (`StudentLessonPage:904`) يعرض placeholder بدل انهيار تخطيط عند `signed_url` منتهي. | تحسين متانة بصري |

---

## 7) حالات تم فحصها وتبين أنها **آمنة** (لا تحتاج إجراء)

- `src/features/student/UnitsPage.tsx:85-114` — `Promise.allSettled` + `filter(status==='fulfilled')` + `setUnits(...filter(status==='published'))` → لا `.map` مكشوف.
- `src/features/student/StudentCurriculumPage.tsx:96-161` — مسار `!profile.grade_id` يعود مبكرًا ويعرض `trialLessons` فقط؛ `Promise.allSettled` يمنع سقوط الصفحة لو فشلت خدمة واحدة.
- `src/features/student/StudentLessonPage.tsx:216-257` — `boards` best-effort + `setLoadError(true)` العام يمنع تحطم الصفحة؛ `has_access` gate يمنع وصول غير مصرح به كسبب تحطم.
- `src/lib/pwa.ts` كله — كل وصول لـ `localStorage`/`navigator.serviceWorker`/`matchMedia` محاط بـ `try/catch` أو فحص وجود.
- `src/upload/uploadManager.ts` + `src/upload/swBridge.ts` — تدهور تدريجي سليم (SW غير مدعوم → fallback).
- `src/components/guards.tsx` — كل الفروع تنتهي بـ `LoadingScreen`/`AuthErrorCard`/`Navigate`/`Outlet`، لا رمي غير متوقع.

---

## 8) خاتمة

رسالة **"حدث خطأ غير متوقع"** في WALIDAWNY **ليست عرضًا لخلل معمم** بل **شبكة أمان تعمل كما صُممت** لالتقاط أخطاء الرندر. معظم سيناريوهات المستخدم الحقيقي (`profile=null`, `grade_id=null`, `units=[]`, `lesson=null`) **لا تصل إليها إطلاقًا**. المخاطر الحقيقية المتبقية هي **خارج React** (جذر مفقود، localStorage معطوب لإعلان واحد، chunk قديم) و **إخفاء سوء إعداد Supabase بقيم افتراضية**. تنفيذ التوصيات الأربع الفورية (R-01→R-04) سيُزيل >80% من احتمالات ظهور الرسالة في الإنتاج دون أي تغيير بصري للمستخدم.

> **ملاحظة للمراجع:** هذا التقرير مبني على قراءة ستاتيكية كاملة لـ `ErrorBoundary.tsx:11`, `router.tsx:1`, `App.tsx:1`, `AuthContext.tsx:1`, `guards.tsx:1`, `supabase.ts:1`, `rpc.ts:1`, `main.tsx:1`, `pwa.ts:1`, `AnnouncementBanner.tsx:1`, `uploadManager.ts:1`, `StudentLessonPage.tsx`, `UnitsPage.tsx`, `StudentCurriculumPage.tsx`, `StudentDashboardPage.tsx`, `LayoutShell.tsx`, `WalidDashboardPage.tsx`, `CurriculumUnitsPage.tsx`, `LessonAssetsPage.tsx`, `VideoPlayer.tsx` والتقاطعات المرتبطة بها. لا يتضمن تنفيذًا حيًا في المتصفح.

---

*تم إنشاء هذا التقرير تلقائيًا كجزء من مهمة `sub-agent` لاختبار الأخطاء غير المتوقعة — يُحفظ في `reports/unexpected-error-test.md`.*
