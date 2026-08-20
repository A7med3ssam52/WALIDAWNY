---
description: يبني محرك «الرفع في الخلفية» — Upload Manager (singleton) + تمديد public/sw.js (IndexedDB jobs + TUS يدوي عبر fetch + استئناف تلقائي + بث تقدم) + tusCore + swBridge + Wake Lock + تكامل LessonAssetsPage + اختبارات.
mode: subagent
---

# Sub Agent: background-upload

## الفكرة (الميزة كاملة)

رفع الفيديو (TUS → Bunny) يستمر في الخلفية على الموبايل والديسكتوب: ما يموتش مع مغادرة الصفحة أو إغلاق التبويب، ويستأنف تلقائياً (TUS resumable) — الهدف «الرفع يكمّل أثناء النوم». انت مسؤول عن **محرك الرفع الخلفي كاملاً**:

- تمديد `public/sw.js` (الموجود كـ cache shell) ليقوم بالرفع: قائمة مهام في IndexedDB + بروتوكول TUS يدوي عبر `fetch` (HEAD للـ offset + PATCH للشرائح) + بث التقدم + استئناف تلقائي عند activate.
- `Upload Manager` (singleton في التطبيق) يملك دورة حياة المهام ويوصل SW بالواجهة، مع fallback في الصفحة (لو SW غير مدعوم).
- تكامل الحد الأدنى في `LessonAssetsPage.tsx` (نفس سيناريو فيديو واحد — agent تاني هيعيد بناء الواجهة للمتعدد لاحقاً).

## نطاقك (ملكك حصرياً — ممنوع تلمس غيرها)

1. **`src/upload/tusCore.ts`** (جديد) — بروتوكول TUS نقي بـ fetch (قابل للاختبار).
2. **`src/upload/swBridge.ts`** (جديد) — رسائل التطبيق↔SW.
3. **`src/upload/uploadManager.ts`** (جديد) — الـ singleton.
4. **`public/sw.js`** — تمديد (الإبقاء على منطق الـ cache الحالي وإضافة كتلة الرفع).
5. **`src/upload/uploadManager.test.ts`** + **`src/upload/tusCore.test.ts`** (جديدان).
6. **`src/features/walid/LessonAssetsPage.tsx`** + **`LessonAssetsPage.test.tsx`** — الاستبدال المحدود: TusUpload ← manager (نفس تدفق فيديو واحد).
7. **`src/app/App.tsx`** — تركيب `<BackgroundUploadBanner />` (مكوّن جديد في `src/components/`).
8. **`src/types/database.ts`** — لا تغيّر (إضافة source/youtube ملك agents تانيين — **لا تلمسه**).
9. **ممنوع تماماً:** `supabase/migrations/*`، `supabase/functions/*`، `src/features/student/*`، `src/data/rpc.ts` (استخدم `createVideoUploadSession`/`cancelVideoUploadSession` الموجودة كما هي).

## اقرأ قبل الكتابة

- `public/sw.js` الحالي (cache shell) — لازم تحافظ عليه.
- `src/features/walid/LessonAssetsPage.tsx` — `startTusUpload` (~746-780)، `startVideoUpload` (~782-801)، `retryVideoUpload` (~803-821)، `cancelVideoUpload` (~823-839)، الـ refs (~359-361)، cleanup الـ unmount (~603-616).
- `src/features/walid/LessonAssetsPage.test.tsx` — اختبارات الرفع الحالية (TusUpload mock، resume test، cancel test).
- `src/types/database.ts` — `VideoUploadSession` (tus_headers/meta) و `LessonVideo`.
- `src/lib/pwa.ts` — `registerServiceWorker` (PROD فقط).

## المطلوب بالتفصيل

### 1) `src/upload/tusCore.ts` — بروتوكول TUS نقي

- `tusHead(endpoint, headers): Promise<number>` → `Upload-Offset` (0 لو غير موجود).
- `tusPatchChunk(endpoint, offset, chunk: Blob, headers): Promise<number>` → offset الجديد من رأس الرد.
- `uploadFileTus({endpoint, headers, file, chunkSize, onProgress, signal, maxRetries}): Promise<void>`:
  - HEAD أولاً (استئناف من offset محفوظ)، ثم حلقات PATCH بشرائح 8MiB مع `Content-Type: application/offset+octet-stream` و `Upload-Offset` + رؤوس الجلسة (AuthorizationSignature/Expire/LibraryId/VideoId).
  - retry بـ backoff [0,1000,3000,5000] للأخطاء الشبكية/5xx (حد أقصى للمحاولات) — يرمي خطأ نهائياً بعدها (القابلية للاستئناف تبقى).
  - `AbortSignal` يوقف بسرعة.
- كل الدوال تستخدم `fetch` (متاحة في SW والـ tests مع mock).

### 2) `public/sw.js` — كتلة الرفع (تضاف للـ cache shell الموجود)

- **IndexedDB:** `walid-uploads` / store `jobs` (مفاتيح: jobId). قيمة المهمة: `{ jobId, lessonId, videoId, endpoint, headers, metadata, fileName, fileSize, file: File, offset, status }`.
- **message handler:**
  - `{type:'upload-start', job}` → خزّن + `runUploadJob(job)` (الـ File يصل عبر structured clone).
  - `{type:'upload-cancel', jobId}` → AbortController + حذف المهمة + بث `upload-cancelled`.
  - `{type:'get-jobs'}` → رد `{type:'jobs-snapshot', jobs:[ملخص بلا File]}` عبر `event.ports[0].postMessage`.
- **`runUploadJob(job)`:** نفس خوارزمية tusCore (نسخة مدمجة داخل الـ SW — `importScripts` ممنوع هنا، نفّذ HEAD/PATCH يدوياً بـ fetch داخل الملف): استئناف من offset المحفوظ، تحديث التقدم في IDB، بث `upload-progress` لكل `clients` (progress=bytesSent/bytesTotal)، نجاح → بث `upload-success` + حذف المهمة من IDB، فشل نهائي → بث `upload-failed` مع إبقاء المهمة (تستأنف لاحقاً).
- **activate:** بعد `clients.claim()` → امسح المهام بحالة رفع نشطة وأعد تشغيلها (استئناف تلقائي بعد إغلاق التبويب/الموبايل).
- احذر: handler الـ fetch الموجود لا يعترض غير GET — آمن مع PATCH/POST.

### 3) `src/upload/swBridge.ts`

- `isSupported()` / `getController(): Promise<ServiceWorker|null>` (مع `navigator.serviceWorker.ready`).
- `sendMessage(msg): Promise<unknown>` (إنشاء MessageChannel اختياري) — كل الرسائل تيبّد، مع graceful degradation عند غياب SW.

### 4) `src/upload/uploadManager.ts` — الـ singleton

- `type VideoUploadJob = { jobId, lessonId, videoId, fileName, fileSize, progress, bytesSent, bytesTotal, stage: 'queued'|'uploading'|'paused'|'done'|'failed'|'cancelled', error: string|null }`.
- `enqueueVideoUpload({lessonId, file, session}): Promise<string>` — jobId = `crypto.randomUUID()`؛ يسجل المهمة في localStorage (`walid-upload-jobs` — meta فقط، بلا File)؛ SW مدعوم → `upload-start` وإلا fallback داخلي: `uploadFileTus` في الصفحة بنفس lifecycle؛ يبث snapshot.
- `cancelJob(jobId)` — SW cancel / abort fallback + `cancelVideoUploadSession(lessonId, videoId)` best-effort (rpc) + يبث.
- `subscribe(listener)` / `getSnapshot()` — بث snapshot كامل عند كل تغيير.
- `resumeOnLoad()` — تُستدعى من banner/الواجهة عند التحميل: `get-jobs` من SW → مصالحة مع localStorage (مهام انتهت أثناء الغياب → done) → بث.
- **Wake Lock:** أثناء وجود أي مهمة نشطة → `navigator.wakeLock.request('screen')` (best-effort، release عند الخمول، إعادة عند visibilitychange) — «الرفع يكمّل والموبايل نايم».
- Prune: مهام done/failed أقدم من 7 أيام تُحذف من localStorage.

### 5) `src/components/BackgroundUploadBanner.tsx` (جديد)

- يعرض شريطاً صغيراً أسفل/أعلى الصفحة (يُركَّب في App.tsx داخل Providers) عند وجود مهام نشطة: «جاري رفع N فيديو في الخلفية — progress٪ لكل مهمة + زر إلغاء». يستهلك `uploadManager.subscribe`.

### 6) تكامل `LessonAssetsPage.tsx` (الحد الأدنى — فيديو واحد)

- استبدل `TusUpload` بـ `uploadManager`: `startVideoUpload` → session (rpc كما هي) → `manager.enqueueVideoUpload(...)`؛ اشترك في snapshot وصفّي مهام هذا الدرس → قدّمها لـ `videoUpload` (progress/stage done→toast+INITIAL+loadVideos / failed→VIDEO_ERROR_MESSAGES.upload_failed).
- `cancelVideoUpload` → `manager.cancelJob` (مع أخذ jobId من الحالة).
- **احذف** useEffect الـ cleanup الخاص بالـ unmount (الرفع يستمر الآن) + refs الـ tus/activeSession.
- **حدّث الاختبارات:** mock `../upload/uploadManager` (enqueue/cancel/subscribe) — استبدل اختبارات TusUpload بـ: enqueue يُستدعى بـ (lessonId,file,session)، التقدم يُحدّث الواجهة من snapshot، success → toast+إعادة تعيين، cancel → manager.cancelJob + rpc. لو اختبار الـ resume الحالي لا ينطبق (توس انتهى من الصفحة) → استبدله باختبار استدعاء enqueue مع session كاملة.

## التحقق

- `npm run typecheck` + `npm run lint` + `npm run test -- LessonAssetsPage` + `npm run test -- uploadManager` + `npm run test -- tusCore` + `npm run test` كامل (لا فشل).
- `npm run build` — تأكد أن `public/sw.js` يُنسخ في dist كما هو (vite ينسخ public تلقائياً).

## القواعد

- لا comments جديدة غير ضرورية؛ لكن **تعليقاً صغيراً فوق كل دالة عامة** (نمط المشروع).
- لا تشغّل git commit/push — التحميل مركزي لاحقاً.
- `localStorage` في SW متاح — لكن الـ File يُخزَّن في IDB فقط.
- لا تغيّر سلوك رفع PDF/سبورات أو معاينة الفيديو.