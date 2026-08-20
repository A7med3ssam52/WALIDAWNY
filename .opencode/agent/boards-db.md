---
description: يبني الجزء الـ Database/Storage من ميزة «السبورات» — ميجريشن 0035 (جدول lesson_boards + RPCs + RLS) + SQL test suite 11_boards.sql + bucket boards في config.toml.
mode: subagent
---

# Sub Agent: boards-db

## الفكرة (الميزة كاملة)

السبورات = صور يرفعها المدرس جوا كل درس (حذف + ترتيب + معاينة)، والصور بتتعرض للطالب في نفس تبويب «الدرس» تحت الفيديو والملف. انت مسؤول عن **طبقة البيانات فقط**.

## نطاقك (ملكك حصرياً — ممنوع تلمس غيرها)

1. **`supabase/migrations/0035_lesson_boards.sql`** (جديد)
2. **`supabase/tests/local/sql/11_boards.sql`** (جديد — الـ harness بيلتقطه تلقائياً بالترتيب)
3. **`supabase/config.toml`** — سطر/بلوك **bucket `boards` فقط** (نفس نمط bucket `pdfs` الموجود: خاص، بدون سياسات عامة، مع `file_size_limit` ~10MiB). **لا تلمس سطور `[functions.*]` — ملك Agent تاني.**

## اقرأ قبل الكتابة (الأنماط المرجعية)

- `supabase/migrations/0015_pdf_upload_ef_wrapper.sql` — نمط `create_pdf_upload_record` (SECURITY DEFINER + search_path pin + staff guard + توليد storage_path server-side).
- `supabase/migrations/0031_delete_pdf_upload_record.sql` — نمط RPC الحذف (soft delete).
- `supabase/migrations/0002_tables_and_constraints.sql` + `0009_rls_policies.sql` — نمط الجداول (updated_at trigger، RLS، سياسات lesson_pdfs للطالب/staff) و `can_access_lesson` / `get_my_lesson_access`.
- `supabase/tests/local/sql/04_business.sql` (قسم الـ PDF، ~1475) + `08_security.sql` — نمط الاختبارات (`SET LOCAL "app.current_user_id"` + `SET LOCAL ROLE` + `tests.assert`/`tests.expect_count`).
- `supabase/tests/local/auth-shim.sql` — شوف شكل `tests.*` helpers والمستخدمين المتاحين (fixtures في `sql/02_roles.sql`).
- `supabase/config.toml` — قسم storage الحالي.

## المطلوب بالتفصيل

### الميجريشن `0035_lesson_boards.sql`

1. **جدول:**
   ```sql
   create table if not exists public.lesson_boards (
     id uuid primary key default gen_random_uuid(),
     lesson_id uuid not null references public.lessons(id) on delete cascade,
     storage_path text not null unique,
     original_name text not null,
     size_bytes bigint,
     mime_type text not null,
     sort_order integer not null default 0,
     is_ready boolean not null default false,
     deleted_at timestamptz,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );
   ```
2. `updated_at` trigger بنمط 0002 + index على `(lesson_id)` + **partial unique index على `(lesson_id, sort_order)` حيث `deleted_at is null`** (بنمط الـ partial unique بتاع lesson_pdfs.is_primary).
3. **RLS:** `enable row level security` + سياسات بنمط `lesson_pdfs` بالظبط:
   - staff (admin / mr_walid / teacher) → يرى كل الصفوف غير المحذوفة.
   - طالب → يرى فقط `is_ready = true` غير المحذوفة في دروس يصلها (استخدم نفس دوال الـ RLS المستخدمة في سياسات lesson_pdfs — راجع 0009 و 0025).
   - **ممنوع** سياسات INSERT/UPDATE/DELETE (FORCE RLS — الكتابة كلها عبر RPCs).
4. **4 RPCs** (كلها SECURITY DEFINER + `set search_path = ''` + staff guard + audit logging بنمط 0031):
   - `create_board_upload_record(p_lesson_id uuid, p_original_name text, p_size_bytes bigint, p_mime_type text)` returns `lesson_boards`:
     - يتحقق: درس موجود وغير محذوف (`lesson_not_found` / `lesson_deleted`).
     - يطهر الاسم: ياخد basename فقط، يرفض control chars، الحد الأقصى 255 حرفاً، **الامتداد لازم واحد من `.jpg/.jpeg/.png/.webp`** (`invalid_file_name` / `unsupported_image_type`).
     - يبني `storage_path = '{lesson_id}/{uuid}.{ext}'` (الامتداد من الاسم) — مفيش أي مسار من العميل.
     - `sort_order` التالي = `coalesce(max(sort_order), 0) + 1` بين غير المحذوفين لنفس الدرس.
     - `is_ready = false`، `mime_type = p_mime_type` (او مشتق من الامتداد لو null).
     - يرجع الصف كاملاً (لأن EF محتاج `id` و `storage_path`).
   - `finalize_board_upload(p_board_id uuid)` — staff guard: `is_ready = true` (مفيش primary — كل الصور بتظهر).
   - `delete_board_upload_record(p_board_id uuid)` — staff guard: soft delete `deleted_at = now()` (مش physical).
   - `reorder_boards(p_lesson_id uuid, p_board_ids uuid[])` — staff guard: تحقق إن القائمة = بالظبط كل الصفوف غير المحذوفة الجاهزة للدرس (نفس الحجم والمجموعة)، وحدّث `sort_order` بالتسلسل 1..n بالترتيب الممرر. أي مخالفة → `validation_error`.
5. **الأذونات:** REVOKE من PUBLIC (بنمط 0010) + GRANT EXECUTE للـ 4 RPCs لـ `authenticated` فقط. `anon` ممنوع.
6. راجع `0005_audit_trigger_and_internal_functions.sql` و `0031` — لو فيه قائمة جداول للـ audit trigger/الامتدادات، أضف `lesson_boards` فيها بنفس الأسلوب.

### SQL suite `11_boards.sql`

بنمط الـ suites الموجودة بالظبط (fixtures بـ UUIDs مخصصة بلا تعارض مع الموجود، بنمط أقسام 04_business):
- **Schema asserts:** الجدول والأعمدة والـ partial unique index و RLS enabled وعدم وجود سياسات كتابة.
- **Fixture:** درس (استخدم درس موجود في fixtures أو أنشئ واحد)، صفوف boards بحالات مختلفة (ready / not ready / deleted).
- **RLS matrix:** anon ممنوع قراءة، طالب بدون شراء ممنوع، طالب مشترك يرى الجاهز فقط، staff يرى الكل غير المحذوف، disabled ممنوع.
- **Behavior:** create → يرجع storage_path بصيغة `{lesson_id}/{uuid}.{ext}` و sort_order متتابع؛ امتداد غير مسموح مرفوض؛ درس مش موجود/محذوف مرفوض؛ finalize بيخلي is_ready true؛ reorder بيغيّر الترتيب صح + يرفض قائمة ناقصة/زائدة/مكررة؛ delete soft delete؛ anon/student ممنوعون من كل الـ RPCs.
- ختم بـ `tests.assert` أو `tests.expect_count` بشكل صريح لآخر حالة.

## قيود

- ممنوع تعديل أي ملف غير المذكور في نطاقك. الأساس (database.ts / rpc.ts / supabase-mock.ts) جاهز — مبني بانتظار ميجريشنك.
- اتبع نمط التعليقات التوثيقية في الميجريشنز الحالية.
- مش هتقدر تشغّل الـ harness لوحدك أكيد (الـ QA بيشغله آخر) — بس تأكد إن SQL منطقياً سليم ومتسق مع 0009/0015/0025.

## النتيجة النهائية

قائمة الملفات اللي عدّلتها + ملخص الـ RPCs والسياسات + أي قرارات تصميم اتخذتها (مثال: مكان الـ audit).
