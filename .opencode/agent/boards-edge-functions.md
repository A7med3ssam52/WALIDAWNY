---
description: يبني الـ Edge Functions لميزة «السبورات» — upload-board، delete-board، get-board-signed-urls + index_test.ts لكل واحدة + سطور [functions.*] في config.toml.
mode: subagent
---

# Sub Agent: boards-edge-functions

## الفكرة (الميزة كاملة)

السبورات = صور يرفعها المدرس جوا كل درس (حذف + ترتيب + معاينة)، والصور بتتعرض للطالب في نفس تبويب «الدرس». انت مسؤول عن **الـ Edge Functions فقط**.

## نطاقك (ملكك حصرياً — ممنوع تلمس غيرها)

1. `supabase/functions/upload-board/` (index.ts + index_test.ts) — جديد
2. `supabase/functions/delete-board/` (index.ts + index_test.ts) — جديد
3. `supabase/functions/get-board-signed-urls/` (index.ts + index_test.ts) — جديد
4. `supabase/config.toml` — سطور **`[functions.upload-board]` و `[functions.delete-board]` و `[functions.get-board-signed-urls]` فقط** (verify_jwt = true). **لا تلمس قسم storage/buckets — ملك Agent تاني.**

## اقرأ قبل الكتابة (الأنماط المرجعية)

- `supabase/functions/upload-pdf/index.ts` — **النموذج الرئيسي**: هيكل deps/defaultDeps + `sanitizeFileName` + parse body + JWT verify + staff guard + `createSignedUploadUrl` + Error envelope `{error:{code,message}}` + CORS من `../_shared/cors.ts` + قسم `if (import.meta.main)`.
- `supabase/functions/delete-pdf/index.ts` — نمط الحذف (staff guard + RPC soft delete + storage remove).
- `supabase/functions/get-pdf-signed-url/index.ts` — نمط العرض: gate الطالب عبر `get_my_lesson_access` + `createSignedUrl` (TTL 900s) على bucket خاص.
- `supabase/functions/upload-pdf/index_test.ts` و `get-pdf-signed-url/index_test.ts` — نمط الاختبارات (deps mock + حالات نجاح/فشل + codes).
- `supabase/config.toml` — سطور `[functions.upload-pdf]` الموجودة.

## المطلوب بالتفصيل

### 1) `upload-board/index.ts`

- POST `{ lesson_id, file_name, file_size? }`.
- نفس تسلسل upload-pdf: OPTIONS → POST only → JWT من Authorization → `client.auth.getUser` → profile (role, status, deleted_at) → **staff roles `admin`/`mr_walid`/`teacher`** + active + غير محذوف → body validation:
  - `lesson_id` UUID صالح.
  - `file_name`: sanitize (basename، ممنوع control chars، allowlist `[\p{L}\p{N} _.\-]`، طول ≤255، **امتداد واحد من jpg/jpeg/png/webp**) — `invalid_file_name` / `unsupported_image_type`.
  - `file_size` عدد صحيح غير سالب ≤ 10MiB — `file_too_large`.
- درس موجود وغير محذوف (`lesson_not_found` 404 / `lesson_deleted` 422).
- استدعِ `create_board_upload_record` بالـ RPC (الأربع معاملات) → خد `id` و `storage_path` — فشل → `board_reservation_failed` 502 (مع معالجة `permission_denied` → 403).
- `createSignedUploadUrl(storage_path, { contentType: mime })` على bucket **`boards`** (الميم من الامتداد: jpg/jpeg→image/jpeg, png→image/png, webp→image/webp) → فشل → `upload_url_failed` 502.
- نجاح → `{ uploadUrl, board_id, storage_path, expires_in }` (TTL 60s).
- ثوابت مسمّاة من الأعلى (MAX_IMAGE_SIZE_BYTES=10MiB، IMAGE_BUCKET='boards'، STAFF_ROLES...). `console.error` بدون أسرار.

### 2) `delete-board/index.ts`

- POST `{ lesson_id, board_id }` → نفس الفحوصات (JWT/staff/active) → validation UUIDs → استدعِ `delete_board_upload_record(p_board_id)` (معالجة `permission_denied` → 403، `board_not_found` → 404، غيره → `deletion_failed` 502) → بعد نجاح الـ RPC احذف الـ object من storage (`remove` بنمط delete-pdf؛ فشل الحذف من storage → `storage_cleanup_failed` 502 مع إرجاع نجاح الـ RPC مش مشكلة).
- نجاح → `{ deleted: true, board_id }`.

### 3) `get-board-signed-urls/index.ts`

- POST `{ lesson_id }` (UUID) → JWT → profile نشط (لا يحتاج staff).
- **طالب:** استدعِ `get_my_lesson_access(p_lesson_id)` → `has_access = false` → `access_denied` 403. ثم اجلب الصفوف `is_ready = true` وغير المحذوفة مرتبة `sort_order asc` (select مباشر — الـ RLS بيساعد).
- **staff:** اجلب نفس القائمة من غير gate (معاينة المدرس).
- أي دور آخر → `forbidden`.
- `createSignedUrl(path, 900)` لكل صف → `{ boards: [{ board_id, original_name, sort_order, signed_url }], lesson_id }`.
- لا صفوف → `{ boards: [], lesson_id }` (مش error — الطالب اللي مفيش صور عنده).
- Codes: `unauthorized, forbidden, account_inactive_or_deleted, invalid_json, validation_error, access_denied, internal_error`.

### 4) `index_test.ts` لكل وظيفة

نسخ سلوك اختبارات `upload-pdf/index_test.ts` و `get-pdf-signed-url/index_test.ts` بالظبط (mocked deps: makeClient بسلوكات قابلة للتحكم، حالات: مفيش JWT → 401، student → 403/forbidden، staff ناجح → 200 بالشكل الصحيح، امتداد مرفوض → 422، درس مش موجود → 404، access_denied للطالب بلا شراء، إلخ). اختبارات `handle()` مباشرة من غير import.meta.main.

### 5) config.toml

أضف الثلاثة blocks بـ `verify_jwt = true` (انسخ نمط `[functions.upload-pdf]`).

## قيود

- ممنوع تعديل أي ملف خارج نطاقك. الـ RPCs الأربعة (`create_board_upload_record`... الخ) بيكتبها Agent تاني في ميجريشن 0035 — **اعتمد أسمائها كما هي**.
- مش هتقرأ ميجريشن 0035 (لسه بيتكتب بالتوازي) — اعتمد على الـ contract المحدد في prompt الـ orchestrator: أسماء RPCs: `create_board_upload_record(p_lesson_id, p_original_name, p_size_bytes, p_mime_type)` ترجع صف، `finalize_board_upload(p_board_id)`, `delete_board_upload_record(p_board_id)`, `reorder_boards(p_lesson_id, p_board_ids)`. جدول `lesson_boards` بأعمدة: `id, lesson_id, storage_path, original_name, size_bytes, mime_type, sort_order, is_ready, deleted_at, created_at, updated_at`.

## النتيجة النهائية

قائمة الملفات + ملخص كل EF (endpoint، codes، shape الرد) + نتائج أي اختبار شغلته لو تقدر.
