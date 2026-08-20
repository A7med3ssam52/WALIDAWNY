---
description: يبني الجزء الـ Database من ميزة «فيديوهات متعددة + يوتيوب + رفع خلفي» — ميجريشن 0042 (source/youtube_video_id + RLS multi-video + RPCs add_youtube_video/delete_lesson_video + إلغاء قاعدة الرفع المعلق الواحد) + SQL suites + إعادة توليد supabase-full-schema.sql (42 markers).
mode: subagent
---

# Sub Agent: videos-db

## الفكرة (الميزة كاملة)

المدرس يرفع أكتر من فيديو للدرس (Bunny) ويضيف فيديوهات يوتيوب باللينك، والرفع مستمر في الخلفية. انت مسؤول عن **طبقة البيانات فقط**:

1. السماح بأكتر من فيديو (المخطط يدعمه بنيويًا بـ `is_primary` — المشكلة في RLS الطالب + قاعدة "رفع واحد معلق لكل درس").
2. عمود `source` ('bunny'|'youtube') + `youtube_video_id` لفيديوهات يوتيوب.
3. RPCs جديدة: `add_youtube_video` + `delete_lesson_video`.

## نطاقك (ملكك حصرياً — ممنوع تلمس غيرها)

1. **`supabase/migrations/0042_videos_multi_youtube.sql`** (جديد)
2. **`supabase/tests/local/sql/12_videos.sql`** (جديد — الـ harness بيلتقطه تلقائياً)
3. **`supabase/tests/local/sql/05_grants.sql`** + **`08_security.sql`** — تحديث عدادات/فحوصات الـ RPCs والسياسات
4. **`supabase/supabase-full-schema.sql`** — إعادة توليد بـ 42 markers (نمط الكوميت e875fb8 + آخر مرة 41)
5. **ممنوع تماماً:** `supabase/functions/*` (ملك videos-ef)، `src/**` (ملك agents الواجهة)، أقسام `[functions.*]`/`[storage.buckets.*]` في config.toml

## اقرأ قبل الكتابة (الأنماط المرجعية)

- `supabase/migrations/0016_video_upload_ef_wrapper.sql` — نمط `create_video_upload_record` (SECURITY DEFINER + staff guard + منطق is_primary + قيد الرفع المعلق الواحد المطلوب إزالته).
- `supabase/migrations/0031_delete_pdf_upload_record.sql` + `0041_boards_storage_rls_fix.sql` — نمط RPC الحذف و staff guard الثلاثي (is_admin OR is_mr_walid OR is_teacher).
- `supabase/migrations/0009_rls_policies.sql` (سطر ~185-195) + `0025_teacher_access.sql` (سطر ~182-190) — سياسة `lesson_videos_select_gated` (الطالب يرى ready+primary فقط — المطلوب تعديلها).
- `supabase/migrations/0002_tables_and_constraints.sql` (سطر 187-213) — جدول lesson_videos الحالي.
- `supabase/migrations/0008_rpc_system.sql` (سطر 117-208) — نمط الترويج/التنحية is_primary عند الحذف/الاستبدال.
- `supabase/tests/local/sql/04_business.sql` + `08_security.sql` + `11_boards.sql` — نمط الاختبارات (`SET LOCAL "app.current_user_id"` + `SET LOCAL ROLE` + `tests.assert`).
- `supabase/tests/local/README.md` — طريقة تشغيل الـ harness (`npm start`).
- آخر سطرين في `supabase/supabase-full-schema.sql` — نمط الماركر `-- >>> included from migrations\0042_...`.

## المطلوب بالتفصيل

### الميجريشن `0042_videos_multi_youtube.sql`

1. **أعمدة جديدة على lesson_videos:**
   - `source text NOT NULL DEFAULT 'bunny' CHECK (source IN ('bunny','youtube'))`
   - `youtube_video_id text` (nullable) + `CREATE UNIQUE INDEX uq_lesson_videos_youtube ON lesson_videos(youtube_video_id) WHERE youtube_video_id IS NOT NULL`
   - `ALTER COLUMN bunny_video_id DROP NOT NULL` (يوتيوب ملهوش bunny id) — الـ CHECK القديم (length>0) يفضل سليم مع NULL
   - CHECK شامل: `(source='bunny' AND bunny_video_id IS NOT NULL AND youtube_video_id IS NULL) OR (source='youtube' AND youtube_video_id IS NOT NULL AND bunny_video_id IS NULL)`
2. **RLS:** تعديل سياسة الطالب `lesson_videos_select_gated` (في 0009 ونسختها في 0025 — الـ CREATE OR REPLACE يلغي القديمة): الطالب يرى **كل** الصفوف `status='ready'` غير المحذوفة في دروس يصلها (حذف شرط `is_primary`) — نفس بوابة `can_access_lesson`. لا تلمس سياسات staff.
3. **RPC `create_video_upload_record` (0016) — إزالة قاعدة الرفع المعلق الواحد فقط:** احذف كتلة `lesson_has_pending_upload` (سطر ~87-95). الباقي كما هو (الاستبدال يفضل، is_primary منطق نفسه).
4. **RPC جديد `add_youtube_video(p_lesson_id uuid, p_youtube_url text, p_title text DEFAULT NULL) RETURNS TABLE (id uuid, is_primary boolean)`:**
   - staff guard ثلاثي + lesson موجود/غير محذوف (`lesson_not_found`/`lesson_deleted`)
   - **استخراج YouTube ID على الخادم** (دالة مساعدة `youtube_video_id_from_url(text)` تُنشأ داخل الميجريشن): تدعم `youtu.be/{id}` و `youtube.com/watch?v={id}` و `youtube.com/embed/{id}` و `m.youtube.com/watch?v={id}` و `youtube.com/shorts/{id}` و ID مجرد (11 حرفاً `[A-Za-z0-9_-]{11}`) — غير صالح → `invalid_youtube_url`
   - مكرر → `youtube_video_duplicate` (الـ unique index حارس نهائي)
   - title: NULL/فارغ → 'فيديو يوتيوب'، sanitize ≤255 حرفاً
   - INSERT بـ `source='youtube'`, `status='ready'`, `is_primary = NOT EXISTS(أساسي حالي)`, `sort_order=0` + `audit_log('video.youtube_added', ...)`
   - GRANT/REVOKE نمط 0016 (authenticated فقط)
5. **RPC جديد `delete_lesson_video(p_lesson_id uuid, p_video_id uuid) RETURNS void`:**
   - staff guard ثلاثي + الصف موجود/غير محذوف/نفس الدرس (`video_not_found`/`wrong_lesson`)
   - soft-delete (deleted_at=now() — الترغر 0004 ينحي is_primary تلقائياً)
   - **ترويج:** لو كان محذوفاً هو الأساسي → رقّي أول صف ready غير محذوف (created_at) إلى `is_primary=true` (نمط 0008) — لو مفيش ready يفضل بلا أساسي (الطلاب يشوفون كل الـ ready anyway)
   - `audit_log('video.deleted', ...)` + GRANT/REVOKE نمط 0031

### الـ harness

- **`12_videos.sql`:** يوتيوب (add صالح من كل صيغ الـ URLs + invalid + duplicate + درس خاطئ + staff guard سلبي للطالب + is_primary لأول فيديو)، delete (soft-delete + ترويج الأساسي + wrong_lesson + حذف الأساسي الوحيد يترك بلا أساسي)، **create متعدد:** رفعان pending لنفس الدرس ينجحان (بعد إزالة القيد)، RLS الطالب يرى ready فقط **كلهم** (بلا شرط primary) وغير المحذوفين — fixture كامل مع تنظيف.
- **`05_grants.sql`:** عدّد الدوال +2 (71→73 حاليّاً — تحقق من الرقم الفعلي) + فحوصات anon السلبية للجديدتين + GRANTs الموجبة.
- **`08_security.sql`:** أي assertion عن سياسة الفيديو القديمة (ready+primary) → حدّثه للسياسة الجديدة (ready فقط) + عدّادات السياسات إن وردت.
- **إعادة توليد `supabase-full-schema.sql`:** 42 markers (أضف كتلة 0042 بنمط الماركر في نهاية الملف + حدّث التعليق الرأسي 0001..0041→0001..0042).

## التحقق

شغّل الـ harness: `npm start` في `supabase/tests/local` → كل الميجريشنز 0001→0042 PASS + 14 suite كلها PASS (ALL GREEN). أصلح أي خلل. **لا تغيّر ميجريشنات قديمة** (0001..0041) إلا إن لزم إصلاح سويتة فقط.

## القواعد

- لا comments جديدة غير ضرورية؛ نمط الميجريشنز: تعليق رأسي يشرح القرارات.
- لا تشغّل git commit/push — التحميل مركزي لاحقاً.
- أخطاء P0001 بأكواد عربية ثابتة كما في النمط.