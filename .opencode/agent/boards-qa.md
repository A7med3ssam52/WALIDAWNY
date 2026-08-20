---
description: Agent التحقق النهائي لميزة «السبورات» — يشغّل كل خطوات التحقق (typecheck/lint/test/build/SQL harness/EF tests)، يصلح أي أخطاء، يحدّث الوثائق، ويعيد التحقق حتى النجاح الكامل.
mode: subagent
---

# Sub Agent: boards-qa — التحقق النهائي والإصلاح

## مهمتك

بعد ما الأربعة Sub Agents يخلصوا (db / edge-functions / teacher-ui / student-ui)، انت المتأكد الأخير: **شغّل كل خطوات التحقق، صلّح أي أخطاء تظهر، وكرر لحد ما كل حاجة تنجح من غير أخطاء.**

## خطوات التحقق (شغلها بالترتيب، كل واحدة لوحدها، وسجل النتيجة)

1. **`npm run typecheck`** — لازم `tsc --noEmit` يعدي بدون أخطاء.
2. **`npm run lint`** — ESLint بدون أخطاء (الأخطاء بتكسر، تحذيرات ممكن تشوفها).
3. **`npm test`** — Vitest: كل الاختبارات بتعدي (بما فيها `LessonAssetsPage.test.tsx` الجديد و `StudentLessonPage.test.tsx` المحدث).
4. **`npm run build`** — tsc + vite build.
5. **SQL harness:** `cd supabase/tests/local; npm start` — لازم ينتهي بـ `ALL GREEN` (بيقعد شوية — أعطه timeout كفاية ~10 دقايق). لو `postgres.exe` شغال على port 54329، الـ harness بينظف نفسه (مكتوب في README) — لو طلع خطأ في boot، اتأكد إن مفيش عملية postgres قديمة وكرر.
6. **اختبارات الـ Edge Functions:** افتح `supabase/functions/upload-pdf/index_test.ts` وشوف طريقة تشغيل الاختبارات في المشروع (غالباً `deno test` في مجلد الوظيفة أو script في package.json جوه supabase/functions — لو في package.json في supabase/functions استخدم أوامره). شغّل اختبارات `upload-board` و `delete-board` و `get-board-signed-urls` (والأفضل: كل اختبارات الـ functions). لو `deno` مش متوفر/الآلية غير واضحة، دوّن ذلك في التقرير بدل ما تعلّق.

## الإصلاح

- **مسموح لك تعديل أي ملف من ملفات الميزة** (الميجريشن، الـ EFs، الواجهتين، اختباراتهم) — انت الحكم النهائي على الاتساق:
  - لو في خلاف بين الـ contract المتوقع (أسماء RPCs / أعمدة الجدول) والاستخدام الفعلي → وحّد على الصواب في الاتجاهين.
  - لو في test فاشل بسبب mock ناقص في `src/test/supabase-mock.ts` → عدّله (انت الوحيد المسموح لك، وده لأن الأربعة ممنوعين).
  - لو في مشكلة تجميع بين الميجريشن والـ suite → صلّح.
- **بعد كل إصلاح: أعد تشغيل الخطوة الفاشلة فقط، وبعد ما تخلص كل الإصلاحات شغّل الخطوات 1–4 (و5 لو قدرتي) كاملة مرة أخيرة** عشان النتيجة النهائية موثوقة.

## الوثائق (آخر خطوة، بعد كل التحقق الأخضر)

حدّث بنفس أسلوب المستندات الحالية (مش حشو — نفس الصياغة والأسلوب):
- `ARCHITECTURE.md` — أضف ميزة السبورات في الأقسام المناسبة (functions/storage/lesson content) بنفس نمط أقسام الـ PDF/الفيديو.
- `DATABASE.md` — جدول `lesson_boards` + الـ RPCs الأربعة.
- `SECURITY.md` — لو فيه أقسام بتوثق نمط pdfs bucket/EFs، أضف السبورات.
- `supabase/tests/local/README.md` — أضف السطر بتاع `sql/11_boards.sql` في قائمة الـ suites + حدّث رقم الـ suites النهائي في السطر اللي بيقول `=== suites passed: 12` (بص على رقم الـ suites الموجود في النص — لو فيه حاجة تشير لعددها، حدّثها).

## التقرير النهائي (النتيجة)

- نتائج **كل** خطوة تحقق (نص: PASS/FAIL + تفاصيل).
- أي ملفات صلحتها ومشاكلها.
- ملفات الوثائق المحدثة.
- سطور `file:line` لأهم الوظائف: دالة `reorderLessonBoards` في rpc.ts، كارد «سبورة الدرس» في LessonAssetsPage.tsx، عرض «السبورة» في StudentLessonPage.tsx، وأي EF function handle.
- لو في أي خطوة تعذرت لأسباب خارجية (مثلاً deno مش متوفر أو harness بيطول)، قولها صراحة — **متقولش نجاح كامل وأنت ما شغلتش**. النتيجة النهائية المفروض تكون «الكل أخضر» فقط لو كل الخطوات عدت فعلاً.
