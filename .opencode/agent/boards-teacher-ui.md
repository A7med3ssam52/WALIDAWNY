---
description: يبني واجهة المدرس لميزة «السبورات» — Card «سبورة الدرس» في LessonAssetsPage.tsx (رفع/حذف/ترتيب/معاينة) + اختباراته.
mode: subagent
---

# Sub Agent: boards-teacher-ui

## الفكرة (الميزة كاملة)

السبورات = صور يرفعها المدرس جوا كل درس، مع إمكانية **حذف، ترتيب، معاينة**، والصور بتتعرض للطالب في تبويب «الدرس». انت مسؤول عن **واجهة المدرس فقط**.

## نطاقك (ملكك حصرياً — ممنوع تلمس غيرها)

1. `src/features/walid/LessonAssetsPage.tsx` (تعديل)
2. `src/features/walid/LessonAssetsPage.test.tsx` (إنشاء جديد)

**ممنوع:** `src/types/database.ts`، `src/data/rpc.ts`، `src/test/supabase-mock.ts` — جاهزة ومكتملة، اعتمد عليها فقط.

## اقرأ قبل الكتابة

- `src/features/walid/LessonAssetsPage.tsx` بالكامل — هيكل الصفحة و Cards الحالية (فيديوهات، رفع PDF، ملفات PDF الحالية، تعليقات) ونمط الـ states و `useToast` و `Modal` و `Skeleton`/`ErrorState`/`EmptyState` و `PDF_ERROR_MESSAGES` و `formatFileSize`.
- `src/data/rpc.ts` — الدوال الجديدة الجاهزة للاستخدام: `listLessonBoards(lessonId)`, `uploadBoard({lessonId,fileName,fileSize?})`, `uploadBoardBytes(uploadUrl, file)`, `finalizeBoardUpload(boardId)`, `deleteBoardUpload(lessonId, boardId)`, `reorderLessonBoards(lessonId, boardIds)`, `getLessonBoardSignedUrls(lessonId)`.
- `src/types/database.ts` — أنواع `LessonBoard` و `LessonBoardSignedUrl`.
- نمط اختبارات صفحة موجودة، مثلاً `src/features/student/StudentLessonPage.test.tsx` و `src/test/utils.tsx` (render helpers).

## المطلوب بالتفصيل

### في `LessonAssetsPage.tsx` — أضف Card جديد «سبورة الدرس»

مكانه: **بعد Card «ملفات PDF الحالية» مباشرة** (آخر الصفحة). محتواه:

1. **القائمة:** اقرا السايند URLs عبر `getLessonBoardSignedUrls(lessonId)` (الـ EF بيرجعهم للمدرس كمان). اعرض **Grid صور** (`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3`) كل بطاقة فيها:
   - `<img src={signed_url} alt={original_name} loading="lazy" className="...rounded-lg object-cover h-28 w-full">` + name + size (`formatFileSize` موجود).
   - أزرار صغيرة: **معاينة** (Eye icon) → Modal بعنوان «معاينة الصورة» يعرض الصورة بحجم كبير (نمط Modal الـ preview بتاع الفيديو الموجود).
   - **ترتيب:** زران صغيران سهم أعلى (ChevronUp) / سهم أسفل (ChevronDown) لكل بطاقة (الأول ممنوع أعلى، الأخير ممنوع أسفل — تعطيل الأزرار دي) → يبنوا `boardIds` الجديد ويعملوا `reorderLessonBoards` ثم reload.
   - **حذف** (Trash2) → Modal تأكيد بنمط «تأكيد استبدال الفيديو» → `deleteBoardUpload(lessonId, boardId)` + toast «تم حذف الصورة» + reload.
   - حالات: `boardsError` → `ErrorState` مع Retry؛ `boards === null` → `Skeleton`؛ صفر → `EmptyState` بعنوان «لا توجد صور سبورة لهذا الدرس بعد» ووصف «ارفع أول صورة من النموذج بالأسفل وستظهر هنا».
2. **الرفع** (تحت القائمة مباشرة): نموذج بنمط رفع الـ PDF بالظبط:
   - input `accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"`.
   - تحقق client-side: امتداد مسموح فقط (jpeg/jpg/png/webp) + حجم ≤ **10 ميجابايت** — رسائل خطأ عربية (مثلاً «يجب اختيار صورة بصيغة JPG أو PNG أو WebP فقط» / «حجم الصورة يتجاوز الحد المسموح (10 ميجابايت)»).
   - زرار «رفع الصورة» (icon ImageUp أو FileUp) → `uploadBoard({lessonId, fileName, fileSize})` → `uploadBoardBytes(session.uploadUrl, file)` → `finalizeBoardUpload(session.board_id)` → toast «تم رفع الصورة بنجاح» → reload.
   - مراحل `requesting/uploading/finalizing` بنمط `STAGE_LABELS` الموجود للـ PDF (أو stage بسيط مع disable للزرار).
   - `BOARD_ERROR_MESSAGES` map عربي بنمط `PDF_ERROR_MESSAGES` يشمل: `lesson_not_found, lesson_deleted, invalid_file_name, unsupported_image_type, file_too_large, validation_error, invalid_json, board_not_found, permission_denied, access_denied, unauthorized, account_inactive_or_deleted, function_error, board_reservation_failed, upload_url_failed, deletion_failed, storage_cleanup_failed` + fallback «تعذر تنفيذ العملية. حاول مرة أخرى».
3. **أزرار/icônes:** استخدم lucide-react (متوفرة) — `Eye`, `Trash2`, `ChevronUp`, `ChevronDown`, `RefreshCw` (تحديث بجانب عنوان الـ Card)، `Image`/`ImageUp` للرفع.
4. `data-testid` على العناصر المهمة: `board-grid`, `board-card-{id}`, `board-img-{id}`, `board-upload-input`, `board-upload-button`, `board-delete-{id}`, `board-move-up-{id}`, `board-move-down-{id}`, `board-preview-{id}`, `board-preview-modal`.

### في `LessonAssetsPage.test.tsx` (جديد)

بنمط اختبارات الصفحات الموجودة (mock عبر `src/test/supabase-mock.ts` + `render` من `src/test/utils.tsx`):
- القائمة الفاضية → EmptyState يظهر.
- بوجود boards (mock يرجع صفين) → بطاقتين بصورهم + أزرارهم.
- رفع ناجح: اختيار ملف صالح → الضغط → mock لـ uploadBoard/uploadBoardBytes/finalizeBoardUpload → toast نجاح + الـ list اتستدعت تاني.
- رفض امتداد غير مسموح برسالة عربية.
- حذف: الضغط على حذف → تأكيد → mock deleteBoardUpload → toast + reload.
- إعادة ترتيب: سهم أعلى على البطاقة التانية → mock reorderLessonBoards بالترتيب المتوقع.

## قيود

- **ممنوع تعديل** سلوك Cards الموجودة (فيديو/PDF/تعليقات) — إضافة فقط.
- كل النصوص بالعربي RTL. استخدم المكونات الموجودة مش مكونات جديدة.
- مش مسموح تلمس `src/test/supabase-mock.ts` — الـ mock جاهز بيدعم الـ boards (لو لاقيت حاجة ناقصة، استخدم mock محلي جوه ملف الاختبار بتاعك — `vi.mock` partial — من غير ما تعدل الملف المشترك).

## النتيجة النهائية

قائمة الملفات + ملخص الـ Card الجديد (الأقسام والحالات) + نتيجة أي اختبار شغلته لو تقدر.
