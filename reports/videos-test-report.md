# تقرير اختبار ميزة «فيديوهات متعددة + يوتيوب + رفع خلفي» — التحقق النهائي

**التاريخ:** 2026-08-21 | **البيئة:** Windows + Node v24 + Deno 2.9.5 + PostgreSQL 18.4 (embedded، محلي بالكامل) | **النتيجة الإجمالية:** ✅ كل شيء أخضر (أُعيد التحقق بالكامل من الصفر — لم يتطلب أي إصلاح)

## ملخص

- **SQL harness:** `supabase/tests/local` — الميجريشنز `0001→0042` كلها PASS (42/42)، و**14 suite** ناجحة / 0 فاشلة → `ALL GREEN` (السويتات `01..12` + سيناريوا الـ concurrency: `upsert_progress` و `redeem_unit_code`).
- **Deno tests:** `supabase/functions` — **299/299** اختبار ناجحًا (0 فشل). الوظيفتان المحدّثتان لهذه الميزة: `create-video-upload-session` (33) و `get-video-playback-url` (30).
- **Frontend:** `typecheck` نظيف، `lint` نظيف (صفر أخطاء)، `vitest` **307/307** عبر 36 ملفًا (بما فيها `LessonAssetsPage.test.tsx` بـ 34 اختبارًا — أُعيد تشغيلها وحدها مرتين للتأكد من ثباتها — و `upload/tusCore.test.ts` و `upload/uploadManager.test.ts` و `YouTubeEmbed.test.tsx`)، و `build` ناجح (tsc + vite) مع وجود `dist/sw.js` (14,352 بايت) في المخرجات.
- **`supabase/supabase-full-schema.sql`:** 42 marker (`-- >>> included from migrations\00XX_*.sql`) بالترتيب 0001→0042 + التعليق الرأسي الرأسي لكل ميجريشن — مطابق.
- **لا تعديلات خارج النطاق:** `git status` — راجع القسم 5.

## 1. SQL harness (الميجريشن 0042 + سويتة 12_videos الجديدة)

### ما تم التحقق منه في `0042_videos_multi_youtube.sql`
- **C1 — أعمدة `source` / `youtube_video_id`:** `source text NOT NULL DEFAULT 'bunny'` + `youtube_video_id text`، `bunny_video_id` يفقد NOT NULL (مع بقاء CHECK الطول)، CHECK متقاطع `lesson_videos_source_check` (bunny ⇔ bunny_video_id موجود / youtube ⇔ youtube_video_id موجود)، وفهرس جزئي `uq_lesson_videos_youtube (youtube_video_id) WHERE NOT NULL` (تفرد عالمي يشمل soft-deleted).
- **C2 — سياسة الطالب `lesson_videos_select_gated`:** أُعيد إنشاؤها بشرط `is_primary` **محذوف** — الطالب يرى كل فيديو `status='ready' AND deleted_at IS NULL` في درس يمكنه الوصول إليه (مع إبقاء فرع الـ teacher من 0025).
- **C3 — `create_video_upload_record`:** أُعيد إنشاؤها بإزالة كتلة `lesson_has_pending_upload` فقط (رفع متوازٍ متعدد مسموح) — باقي الجسم (guard/قواعد replace/منطق primary/audit) كما هو.
- **C4 — `add_youtube_video`:** RPC موظف جديد — استخراج الـ id **خادمي** عبر `youtube_video_id_from_url` (youtu.be/، watch?v=، /embed/، /shorts/، m. subdomain، id مجرد)، أخطاء `invalid_youtube_url`/`youtube_video_duplicate` (فحص مسبق + الفهرس الجزئي كحارس نهائي عبر unique_violation)، أول فيديو يأخذ `is_primary`، `status='ready'` فورًا، عنوان افتراضي «فيديو يوتيوب»، audit `video.youtube_added`، grant authenticated فقط.
- **C5 — `delete_lesson_video`:** RPC موظف جديد — soft-delete (0004 يمسح is_primary في نفس المعاملة)، وعند حذف primary يُرقَّى أقدم شقيق ready غير محذوف (نمط 0008)، أخطاء `video_not_found`/`wrong_lesson`، audit `video.deleted`، grant authenticated فقط.

### إثباتات حية داخل السويتات
- **12_videos.sql (جديد):** صفوف youtube بـ `source`/`youtube_video_id`، رفض CHECK للاقتران الخاطئ، تفرد youtube عالمي، `add_youtube_video` (أول فيديو → primary، أخطاء invalid/duplicate/lesson_not_found، عنوان افتراضي عربي)، `delete_lesson_video` (حذف primary → ترقية الشقيق؛ حذف غير primary لا يرقّي؛ wrong_lesson/video_not_found)، ورؤية الطالب **لكل** الفيديوهات الجاهزة (المتعدد) لا primary فقط، ورفعان معلقان متوازيان في نفس الدرس (C3).
- **03_rls.sql / 04_business.sql / 05_grants.sql / 08_security.sql (محدّثة):** سياسة SELECT الجديدة (لا is_primary)، وأخطاء add/delete الجديدة، وـ grants (authenticated يملك `add_youtube_video`/`delete_lesson_video`، anon/العموم محرومان، `youtube_video_id_from_url` بلا grants).

## 2. Edge Functions (Deno)

| الوظيفة | الاختبارات | أبرز التغطية لهذه الميزة |
|---|---|---|
| `create-video-upload-session` | 33/33 | **سماح الرفع المتعدد**: إنشاء جلستين pending لنفس الدرس ينجح كلاهما (4042 C3)؛ بقية مسارات create/replace/cancel كاملة (رفض أدوار، حدود MIME/حجم، أخطاء معرّبة الأكواد، shape نظيف للـ response، لا تسريب رسائل خام) |
| `get-video-playback-url` | 30/30 | **video_id اختياري**: بلا video_id → primary ready كما سابقًا؛ بـ video_id → يتحقق (نفس الدرس، غير محذوف، ready، source='bunny')؛ أخطاء `video_not_found` (404) / `wrong_lesson` (422) / `video_not_ready` (409) / `youtube_video` (422 — فيديو يوتيوب غير قابل للتشغيل عبر CDN)؛ طالب لا يستطيع حل غير primary عبر RLS |
| باقي الوظائف (11) | 233/233 | regression كامل: bunny-video-webhook 24، delete-board 20، delete-pdf 20، export-audit-log 13، generate-unit-codes 22، get-board-signed-urls 21، get-pdf-signed-url 18، get-video-thumbnail-url 22، recheck-video-states 15، upload-board 32، upload-pdf 29 (+ _shared 29) |

المجموع الكلي: **299/299** (تشغيل كامل لـ `deno test supabase/functions`).

## 3. Frontend (TypeScript/React + Vitest)

- **`src/upload/` (جديد):** `tusCore.ts` (TUS نقي قابل للحقن: HEAD offset + PATCH مع retry/backoff لـ 5xx) و `uploadManager.ts` (singleton يدير دورة الجوبات، يثبّت meta فقط في localStorage لا الـ File، Wake Lock أثناء النشاط، استئناف عبر SW، إلغاء عبر `cancelVideoUploadSession`) و `swBridge.ts` (كشف الدعم + postMessage) — مع `tusCore.test.ts` (12) و `uploadManager.test.ts` (9).
- **`public/sw.js`:** محرك رفع خلفي — الجوبات في IndexedDB (`walid-uploads/jobs`)، TUS يدوي (HEAD/PATCH)، استئناف تلقائي عند activate، البث للواجهة عبر رسائل.
- **`src/components/BackgroundUploadBanner.tsx` (جديد):** شريط حالة الرفع الخلفي يُركَّب في `App.tsx` (بجانب InstallPrompt).
- **`LessonAssetsPage.tsx` (+34 اختبارًا):** قائمة فيديوهات متعددة، رفع متعدد (إنشاء جلسات متوازية → tusCore/uploadManager → SW خلفي)، حذف، إضافة يوتيوب باللينك، رسائل عربية؛ **أُعيد تشغيل السويتة وحدها مرتين: 34/34 في كل مرة** (لا تقلّب).
- **`StudentLessonPage.tsx`:** قائمة كل فيديوهات الدرس الجاهزة — primary في المشغّل الرئيسي + بقية الفيديوهات (Bunny عبر `getPlaybackUrl(videoId)` أو `YouTubeEmbed` لليوتيوب) بشارة «يوتيوب»/«Bunny».
- **`src/data/rpc.ts`:** `addYoutubeVideo`/`deleteLessonVideo` (RPC) + `getPlaybackUrl(lessonId, videoId?)` (EF query) — **تحقق التماسك مع السباق السابق**: كلا مجموعتي الدوال موجودتان ولا تعارض (كلا الهدفين يعمل). `src/types/database.ts`: `LessonVideo` بلا تعارض (source/youtube_video_id إلخ) — مطابق لـ 0042.
- **النتائج:** `npm run typecheck` ✅ | `npm run lint` ✅ (صفر أخطاء) | `npm test` ✅ **307/307** (36 ملفًا) | `npm run build` ✅ + `dist/sw.js` موجود ✅ (تحذير حجم الـ chunk >500kB موجود مسبقًا).

## 4. supabase-full-schema.sql

- **42/42 marker** (`-- >>> included from migrations\00XX_*.sql`) بالترتيب 0001→0042، والتعليق الرأسي لكل ميجريشن (الترويسة تذكر `0001..0042`)، وملف `0042_videos_multi_youtube.sql` مُضمَّن كاملًا (C1..C5) — **لم يتطلب أي إصلاح**.

## 5. فحص عدم الخروج عن النطاق (git status)

`git diff --name-only` (المعدَّل): `public/sw.js`، `src/app/App.tsx`، `src/data/rpc.ts`، `StudentLessonPage.tsx/.test.tsx`، `LessonAssetsPage.tsx/.test.tsx`، `src/test/supabase-mock.ts`، `src/types/database.ts`، EFان (`create-video-upload-session` + `get-video-playback-url` بكود واختباراتهما)، `supabase-full-schema.sql` (إعادة توليد بـ 42 marker)، وسويتات harness المصرَّح بها فقط: `03_rls.sql` / `04_business.sql` / `05_grants.sql` / `08_security.sql`. الجديد (untracked): `0042_videos_multi_youtube.sql`، `12_videos.sql`، `src/upload/`، `BackgroundUploadBanner.tsx`، `YouTubeEmbed.tsx` + اختباراهما، `reports/videos-test-report.md`، وملفات `.opencode/agent/` (توجيهات agents) + `dump.sql` (أثر قديم 0 بايت — لم يلمسه أحد، خارج النطاق ويُتجاهل).

**لا مساس** بميجريشنات 0001..0041 ولا بأي EF خارج `create-video-upload-session`/`get-video-playback-url` (بلا تغيير في upload-pdf/delete-board إلخ — سجل git يؤكد ذلك).

## 6. ملاحظات متبقية

- **الرفع الخلفي يعتمد على تسجيل SW** (`navigator.serviceWorker.register` — موجود مسبقًا في الكود الأساسي)؛ على متصفحات دون دعم SW/IndexedDB يقع النظام تلقائيًا إلى الرفع المباشر (fallback) — لا فقدان وظيفة.
- فيديوهات يوتيوب لا تمر بـ `bunny-video-webhook` (لا دورة معالجة) — `status='ready'` لحظيًا؛ التشغيل عبر `YouTubeEmbed` وليس CDN Bunny (وثّق `get-video-playback-url` رفضها بـ `youtube_video`).
- تحذير حجم الـ chunk في vite build (>500kB) موجود مسبقًا وغير مرتبط بهذه الميزة.
- `dump.sql` غير متتبع (0 بايت، أثر قديم) — يمكن حذفه بأمان خارج هذا النطاق.

## الخلاصة

| الطبقة | النتيجة |
|---|---|
| SQL harness (0042 + 14 suites) | ✅ ALL GREEN |
| Deno (299/299، منها 63 لوظيفتي الميزة) | ✅ |
| typecheck + lint | ✅ |
| vitest (307/307، 36 ملفًا) | ✅ |
| build + dist/sw.js | ✅ |
| supabase-full-schema.sql (42 markers) | ✅ |
| الوثائق (DATABASE/SECURITY/ARCHITECTURE/README + هذا التقرير) | ✅ |
| لا تعديلات خارج النطاق | ✅ |