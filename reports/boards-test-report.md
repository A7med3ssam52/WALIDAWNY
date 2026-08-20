# تقرير اختبار ميزة السبورات (Lesson Boards) — التحقق النهائي

**التاريخ:** 2026-08-20 (إعادة تحقق نهائية شاملة؛ أول تقرير: 2026-08-18) | **البيئة:** Windows 11 + Node v24.11.1 + Deno 2.9.5 + PostgreSQL 18.4 (embedded، محلي بالكامل) | **النتيجة الإجمالية:** ✅ كل شيء أخضر

## ملخص

- **SQL harness:** `supabase/tests/local` — الميجريشنز `0001→0041` كلها PASS (41/41)، و**13 suite** ناجحة / 0 فاشلة → `ALL GREEN` (بما فيها `08_security.sql` و `11_boards.sql` و سيناريوهات الـ concurrency). أعيد تشغيله كاملاً بتاريخ 2026-08-20.
- **Deno tests:** `supabase/functions` — **293/293** اختبار ناجحًا على 10 وظائف؛ وظائف السبورات الثلاث: `upload-board` (32) و `delete-board` (20) و `get-board-signed-urls` (21). أعيد تشغيله كاملاً بتاريخ 2026-08-20.
- **Frontend:** `typecheck` نظيف، `lint` نظيف (صفر أخطاء)، `vitest` **274/274** عبر 33 ملفًا (بما فيها `LessonAssetsPage.test.tsx` بـ 30 اختبارًا و `StudentLessonPage.test.tsx` بـ 18 اختبارًا)، و `build` ناجح (tsc + vite). أعيد تشغيلها كلها بتاريخ 2026-08-20.
- **تعديل config.toml الوحيد بعد التحقق المتوازي:** إضافة `[functions.create-video-upload-session] verify_jwt = true` — متسق مع الكود (الوظيفة تتحقق من JWT بنفسها عند `index.ts:335-357`، وتعليقها الرأسي يوثق ذلك)، ومع نمط بقية الوظائف الأمامية (upload-pdf/delete-pdf/upload-board/delete-board/get-board-signed-urls كلها `verify_jwt = true`؛ الوحيدون `false` هما `bunny-video-webhook` و `recheck-video-states` — نقاط نهاية داخلية). لا يؤثر على أي اختبار (config.toml لا يدخل في deno test ولا في الـ harness).
- **لا تعديلات خارج النطاق:** `git status` يُظهر فقط ملفات السبورات + الوثائق + config.toml (13 ملفًا معدلاً + الجديد: `0041_boards_storage_rls_fix.sql` + `reports/boards-test-report.md` + ملفات `.opencode/`). لا مساس بميجريشنز قديمة ولا بـ `upload-pdf`/`delete-pdf` ولا بأنواع الفيديو.

## 1. SQL harness (الميجريشن 0041 + سويتات 08/11)

### ما تم التحقق منه في `0041_boards_storage_rls_fix.sql`
- **C1 — `boards_select_row_backed`** (FOR SELECT TO authenticated): نفس regex مسار `{uuid}/{uuid}.{jpg|jpeg|png|webp}` + `EXISTS` على صف `lesson_boards` غير محذوف، **بدون** فلتر `is_ready` (نفس نطاق `boards_insert_row_backed` من 0036). مطلوب لأن Storage API يرفع عبر `INSERT ... RETURNING *` (درس 0021 H1).
- **H1 — `boards_delete_row_backed` + `pdfs_delete_row_backed`** (FOR DELETE TO authenticated): staff-only (`is_admin() OR is_mr_walid() OR is_teacher()` — نفس `STAFF_ROLES` في الـ EFs) + row-backed — الحذف محصور في كائنات يملكها السكيما فقط، وليس محتوى عشوائيًا. بدونها كان `storage.remove()` للـ EF صامتًا (0 rows) والكائن يتسرب للأبد.
- **M2 — `finalize_board_upload`**: يرفض وضع السبورة READY ما دام كائن Storage غير موجود → `board_storage_missing`؛ الفحص داخل جسم SECURITY DEFINER (المالك معفى من RLS على `storage.objects` بفضل ENABLE-without-FORCE) فهو حاسم لكل المستدعين.
- لا يوجد أي `UPDATE` policy على `storage.objects`، ولا `FORCE` عليه (0021 H2)، والقفل في `08_security.sql` = **6 سياسات بالضبط** (2 INSERT + 2 SELECT + 2 DELETE) — كلها `authenticated` فقط، بلا سطح `anon`.

### إثباتات حية داخل السويتات
- **08_security.sql:** `INSERT ... RETURNING id` لسبورة pending بنجاح كـ mr_walid (إثبات C1)، ثم `finalize_board_upload` تنجح لوجود الكائن (إثبات M2)، ثم DELETE طالب عند مسار row-backed = no-op (0 rows)، ثم DELETE موظف يزيل الكائن بالضبط (إثبات H1)، مع تنظيف كامل للـ fixtures.
- **11_boards.sql:** كائن bb3 يُزرع قبل finalize (Sections 6–9)، وسالب `board_storage_missing` على صف pending بلا كائن، وإثباتات DELETE staff/student، وترتيب ready-only، وتنظيف كامل في النهاية.

## 2. Edge Functions (Deno)

| الوظيفة | الاختبارات | أبرز التغطية |
|---|---|---|
| `upload-board` | 32/32 | رفض GET/بلا JWT، أدوار (student/disabled/deleted)، sanitize basename (forward+backslash)، أسماء عربية + `.JPG` case-insensitive، **Content-Type مشتق من الامتداد** (jpeg/png/webp)، حدود 10MiB، أخطاء الـ wrapper معرّبة الأكواد، **بدون `expires_in`** في نجاح الـ response (shape نظيف: `board_id/storage_path/uploadUrl` فقط)، عدم تسريب الرسائل الخام |
| `delete-board` | 20/20 | أخطاء 401/403/400/422/404/502، remove best-effort (فشل Storage لا يفشل العملية)، تمرير `storage_path` الصحيح إلى `storage.remove`، أخطاء الـ wrapper (permission_denied/board_not_found/wrong_lesson) |
| `get-board-signed-urls` | 21/21 | طالب بلا وصول → 403 access_denied، طالب بوصول → مصفوفة مرتبة `sort_order`، TTL 900 ثانية (قابل للحقن)، staff (admin/mr_walid/teacher) معاينة بلا gate، لا سبورات جاهزة → `[]` (ليس خطأ)، service-role فقط للتوقيع |

كل الوظائف استخدمت `_test_helpers.ts` (stub client بلا شبكة)؛ والاختبارات الكلية في `supabase/functions`: **293/293** (تشمل وظائف PDF/الفيديو كـ regression).

## 3. Frontend (TypeScript/React + Vitest)

- **`src/data/rpc.ts`:** `BoardUploadSession` بلا `expires_in`؛ `uploadBoardBytes` يستمد `Content-Type` من اسم الملف عبر `boardImageContentType` (jpg/jpeg → image/jpeg، png، webp — مرآة `imageContentType` في upload-board EF) بدل `file.type` غير الموثوق.
- **`LessonAssetsPage.tsx`:** `readyBoards` (فلتر ready فقط)، `handleMoveBoard` يعمل على قائمة الـ ready حصرًا (لا يرسل pending أبدًا إلى `reorder_boards`)، أزرار التنقل معطّلة للـ pending وللحدود (أول/آخر ready)، ورسالة عربية `board_storage_missing` في `BOARD_ERROR_MESSAGES`.
- **`LessonAssetsPage.test.tsx` (30/30):** توقعات الأزرار الجديدة (سهمان معطّلان في قائمة ready من عنصر واحد)، اختبار خليط ready/pending (نقر pending لا يرسل RPC؛ رفع ready-3 يرسل `['board-3','board-1']` فقط)، وتأكيد `Content-Type: image/jpeg` في PUT مع `File` نوعه `image/png` (إثبات الاشتقاق من الاسم).
- **`StudentLessonPage.tsx`:** عرض «سبورة الدرس» (Card + شبكة صور `board-grid` بروابط موقّعة) — موجود ومغطى ضمن `StudentLessonPage.test.tsx` (18/18).
- **النتائج:** `npm run typecheck` ✅ | `npm run lint` ✅ (صفر أخطاء) | `npm test` ✅ **274/274** (33 ملفًا) | `npm run build` ✅ (vite، تحذير حجم الـ chunk فقط — موجود سابقًا).

## 4. فحص عدم الخروج عن النطاق

`git diff --name-only` يُظهر **13 ملفًا معدلًا** كلها ضمن نطاق السبورات/الوثائق: `ARCHITECTURE.md`، `DATABASE.md`، `SECURITY.md` (توثيق السبورات + 0041)، `src/data/rpc.ts`، `LessonAssetsPage.tsx/.test.tsx`، `supabase/config.toml` (سطر `[functions.create-video-upload-session] verify_jwt = true` — التعديل الوحيد الجديد بعد التحقق المتوازي، إضافة متسقة لا تكسر شيئًا)، `delete-board/index.ts` (تعليق 0041 فقط — مسموح)، `upload-board/index.ts` + `index_test.ts` (إزالة `expires_in`)، `supabase/tests/local/README.md` (سجل تشغيل)، `08_security.sql` + `11_boards.sql`. الجديد (untracked): `0041_boards_storage_rls_fix.sql` + `reports/boards-test-report.md` + ملفات `.opencode/` (أدوات orchestrator) + `dump.sql` (فارغ 0 بايت، أثر قديم غير متتبع — لا يؤثر). لا مساس بـ 0036/0021 أو upload-pdf أو delete-pdf أو أنواع الفيديو.

## 5. ملاحظات متبقية (خارج نطاق السبورات)

- **تعديل config.toml (2026-08-20):** أُضيف `[functions.create-video-upload-session] verify_jwt = true` (بين `bunny-video-webhook` و `export-audit-log`). هذا يجعل البوابة ترفض الطلبات بلا JWT قبل وصول الكود، والكود كان يتحقق من JWT بالفعل — تعزيز دفاع في العمق لا تغيير سلوكي للطلبات الشرعية.
- **Follow-up لـ `upload-pdf`:** لا يزال يرد `expires_in: 60` في نجاحه (`upload-pdf/index.ts:407`) دون تمرير TTL فعلي إلى `createSignedUploadUrl` — القيمة معلنة ومضللة للصيانة (موثقة سابقًا في `reports/upload-test-report.md:98` و `upload-fix-plan.md:258`). السبورات أزلت الحقل نهائيًا؛ يُنصح بتطبيق نفس الإزالة على PDF (create-video-upload-session يرد `expires_in` الخاص بتوقيع TUS وهو فعلي ومستخدم، فلا يُلمس).
- تحذير حجم الـ chunk في vite build (>500kB) موجود مسبقًا وغير مرتبط بالسبورات.

## الخلاصة

| الطبقة | النتيجة |
|---|---|
| SQL harness (0041 + 13 suites) | ✅ ALL GREEN |
| Deno (293/293، منها 73 لوظائف السبورات) | ✅ |
| typecheck + lint | ✅ |
| vitest (274/274) | ✅ |
| build | ✅ |
| الوثائق (DATABASE/SECURITY/ARCHITECTURE/README + هذا التقرير) | ✅ |
| لا تعديلات خارج النطاق | ✅ |