---
description: منسّق ميزة «السبورات» (Lesson Boards) في WALIDAWNY — يبني الأساس (الأنواع + rpc + mock)، ثم يطلق 4 Sub Agents متخصصين بالتوازي، ثم Agent اختبار نهائي يتحقق ويراجع حتى النجاح الكامل.
mode: primary
---

# Orchestrator: ميزة السبورات (Lesson Boards)

## الفكرة

**السبورات = صور جوا الدرس:** المدرس (teacher / mr_walid / admin) يرفع صور في صفحة «ملفات الدرس» مع إمكانية **حذف، ترتيب، معاينة**، والصور بتتعرض للطالب **جوه نفس تبويب «الدرس»** (تحت الفيديو والملف) كشبكة صور. لو مفيش صور → مفيش أي حاجة تظهر.

## العقيدة التقنية (وجّهها للـ Sub Agents)

- Stack: React 19 + Vite 7 + TS 5.7 + Tailwind 4 + supabase-js + Vitest 3. **ممنوع مكتبات جديدة.**
- UI بالعربي RTL، استخدم مكونات المشروع (`Card`, `Button`, `Badge`, `Modal`, `EmptyState`, `ErrorState`, `Skeleton`, `Spinner`, `LayoutShell`, `useToast`).
- **الأمان:** ممنوع مسار تخزين من العميل، كل الروابط short-lived signed URLs، الكتابة عبر SECURITY DEFINER RPCs بـ staff guard (نمط `0015` و `upload-pdf` بالظبط)، RLS بـ FORCE RLS على الجدول الجديد، bucket خاص `boards` من غير سياسات objects عامة.
- نمط الرفع: EF `upload-board` (JWT → staff guard → sanitize → `create_board_upload_record` → `createSignedUploadUrl`) → العميل PUT مباشرة → `finalize_board_upload`. نمط العرض: `get-board-signed-urls` (طالب يمر على gate `get_my_lesson_access`، staff يشوف عادي). نمط الحذف: `delete-board` (soft delete + remove object). الترتيب: RPC `reorder_boards` بـ staff guard.
- أخطاء EFs: `{error:{code,message}}` + CORS من `../_shared/cors.ts`. رسائل الـ UI بالعربي.
- المسار المرجعي للأنماط: `supabase/functions/upload-pdf/index.ts` (رفع)، `delete-pdf` (حذف)، `get-pdf-signed-url` (عرض)، `supabase/migrations/0015_pdf_upload_ef_wrapper.sql` (RPC)، `src/features/walid/LessonAssetsPage.tsx` (صفحة المدرس)، `src/features/student/StudentLessonPage.tsx` (صفحة الطالب)، `src/data/rpc.ts`، `src/types/database.ts`، `src/test/supabase-mock.ts`، `supabase/tests/local/sql/` (SQL harness — بيشغّل كل ملفات `sql/*.sql` بالترتيب تلقائياً).

## خطوة 0 (نفذها بنفسك الآن، قبل أي شيء): الأساس المشترك

عدّل هذه الملفات الثلاثة بنفسك (ممنوع أي Sub Agent يلمسها بعد كده — دي الحدود اللي هتفرضها):

1. **`src/types/database.ts`**: أضف
   ```ts
   export type LessonBoard = {
     id: string;
     lesson_id: string;
     storage_path: string;
     original_name: string;
     size_bytes: number | null;
     mime_type: string;
     sort_order: number;
     is_ready: boolean;
     deleted_at: string | null;
     created_at: string;
     updated_at: string;
   };
   ```
   + سجلها في `Database.Tables` + سجل الـ RPCs الأربعة (`create_board_upload_record`, `finalize_board_upload`, `delete_board_upload_record`, `reorder_boards`) في `Database.Functions` + أضف نوع `LessonBoardSignedUrl = { board_id, original_name, sort_order, signed_url }`.

2. **`src/data/rpc.ts`**: أضف (بنمط دوال الـ PDF الموجودة):
   - `listLessonBoards(lessonId)` → select من `lesson_boards` حيث `deleted_at is null` مرتب `sort_order asc`
   - `uploadBoard({ lessonId, fileName, fileSize? })` → invokeFunction `upload-board`
   - `uploadBoardBytes(uploadUrl, file)` → fetch PUT بـ Content-Type من نوع الملف
   - `finalizeBoardUpload(boardId)` → rpc `finalize_board_upload`
   - `deleteBoardUpload(lessonId, boardId)` → invokeFunction `delete-board`
   - `reorderLessonBoards(lessonId, boardIds)` → rpc `reorder_boards`
   - `getLessonBoardSignedUrls(lessonId)` → invokeFunction `get-board-signed-urls`

3. **`src/test/supabase-mock.ts`**: أضف جدول `lesson_boards` والـ rpcs الجديدة للـ mock، بحيث `listLessonBoards` و `getLessonBoardSignedUrls` يرجعوا `[]` افتراضياً (عشان اختبارات الصفحات القديمة تفضل شغالة). هذا الملف ملك الـ teacher/student agents بعد كده مش هيلامسوه — اتأكد إنه مكتمل.

بعد الأساس، شغّل `npm run typecheck` عشان تتأكد إن الأساس سليم قبل ما تطلق الأربعة.

## خطوة 1: أطلق الأربعة Sub Agents بالتوازي

استخدم أداة Task **في رسالة واحدة** بأربع استدعاءات متوازية (استدعاء لكل Agent) — الـ agents هم: `boards-db`، `boards-edge-functions`، `boards-teacher-ui`، `boards-student-ui`. لكل واحد وضح في الـ prompt: الفكرة باختصار + نطاقه بالضبط + الـ files اللي ملكه حصرياً + إنه يقرأ ملفات الأنماط المذكورة في شخصيته قبل الكتابة + إنه يشتغل مستقل تماماً من غير ما يسأل + يختم بقائمة ملفاته المعدلة.

**مصفوفة الملكية (نقلها حرفياً لكل Agent في prompt):**
- `boards-db` يملك: `supabase/migrations/0035_lesson_boards.sql` + `supabase/tests/local/sql/11_boards.sql` + سطر bucket `boards` في `supabase/config.toml` (فقط الـ bucket و storage limits).
- `boards-edge-functions` يملك: `supabase/functions/upload-board/*` + `supabase/functions/delete-board/*` + `supabase/functions/get-board-signed-urls/*` (كود + index_test.ts) + سطور `[functions.*]` الثلاثة في `supabase/config.toml` (verify_jwt فقط، ما يلمسش الـ storage).
- `boards-teacher-ui` يملك: `src/features/walid/LessonAssetsPage.tsx` + إنشاء `src/features/walid/LessonAssetsPage.test.tsx`.
- `boards-student-ui` يملك: `src/features/student/StudentLessonPage.tsx` + `src/features/student/StudentLessonPage.test.tsx`.
- **ممنوع على أي واحد**: `src/types/database.ts`، `src/data/rpc.ts`، `src/test/supabase-mock.ts` (الأساس جاهز — يعتمد عليه).

## خطوة 2: بعد ما الأربعة يخلصوا — أطلق `boards-qa`

استدعي Task واحد لـ `boards-qa` مع: تعليمات شغّل كل خطوات التحقق (typecheck, lint, test, build, SQL harness `cd supabase/tests/local; npm start` لازم `ALL GREEN`، اختبارات الـ EFs بالنمط الموجود في المشروع) + إنه يصلّح أي أخطاء يجيبها في ملفات ملكية كل قسم (هو مسموح له يعدل أي حاجة من ملفات الأقسام الأربعة) + يحدّث الوثائق (`ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md` لو فيه أقسام storage/functions، و`supabase/tests/local/README.md` — عدد الـ suites) + يعيد تشغيل التحقق بعد كل إصلاح لحد ما كل حاجة خضراء + يختم بتقرير نهائي (سطور file:line للوظائف الرئيسية + نتائج كل خطوة).

## خطوة 3: التقرير النهائي للمستخدم

لخص: الملفات الجديدة والمعدلة، نتائج كل خطوة تحقق، وأي ملاحظات/قرارات تصميم اتخذت.

## قواعد تشغيل

- لو أي Sub Agent رجع بنجاح كامل — مفيش حاجة تعيدها بنفسك.
- لو واحد فشل، أعد إطلاقه لوحده بعد إصلاح المشكلة بنفسك (أو وجه الـ QA يصلحها).
- من غير تعليقات زائدة، ومن غير تعديل سلوك الميزات الموجودة.
