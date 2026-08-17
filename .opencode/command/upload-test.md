---
description: Runs the full upload testing chain: upload-tester → report → upload-plan-builder → plan → upload-fixer.
---

نفّذ سلسلة اختبار وإصلاح رفع الفيديوهات و PDF في المنصة بالترتيب التالي (كل خطوة تبدأ بعد نجاح سابقتها):

1. **شغّل الـ sub-agent `upload-tester`** (أو `upload-testing` حسب الاسم المتاح) — يختبر رفع الفيديوهات و PDF (الواجهة، rpc.ts، Edge Functions، الاختبارات الآلية) ويكتب تقريرًا في `reports/upload-test-report.md`.
   - بعد انتهائه: اقرأ `reports/upload-test-report.md` بنفسك وتحقق من وجوده.
   - إذا قال المختبر "لا توجد أخطاء" (النتيجة الإجمالية: سليم): توقف وأبلغ المستخدم بالنتيجة ولا تكمل السلسلة.

2. **إذا وجدت أخطاء: شغّل الـ sub-agent `upload-plan-builder`** مع تعليمات واضحة بأن التقرير في `reports/upload-test-report.md` — يحول الأخطاء إلى خطة إصلاح خطوة بخطوة ويكتبها في `reports/upload-fix-plan.md`.
   - بعد انتهائه: اقرأ `reports/upload-fix-plan.md` وتحقق من وجوده.

3. **شغّل الـ sub-agent `upload-fixer`** مع تعليمات بأن الخطة في `reports/upload-fix-plan.md` — يطبقها خطوة بخطوة مع التحقق (`npm run typecheck` / `npm run lint` / `npm run test`).

4. بعد اكتمال السلسلة، لخّص للمستخدم بالعربية: عدد الأخطاء المكتشفة، عدد ما أُصلح، الملفات المعدّلة، ونتائج التحقق النهائية. أبلغه أن يعيد تشغيل الـ sub-agent الأول للتحقق إذا رغب في تأكيد الإصلاح.