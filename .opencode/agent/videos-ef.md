---
description: يبني تحديثات الـ Edge Functions لميزة «فيديوهات متعددة + يوتيوب» — create-video-upload-session (إزالة قاعدة الرفع المعلق الواحد) + get-video-playback-url (video_id اختياري) + تحديث اختبارات Deno.
mode: subagent
---

# Sub Agent: videos-ef

## الفكرة (الميزة كاملة)

المدرس يرفع أكتر من فيديو للدرس (Bunny) ويضيف فيديوهات يوتيوب، والرفع مستمر في الخلفية. انت مسؤول عن **طبقة الـ Edge Functions فقط** لتعديلين:

1. `create-video-upload-session`: السماح بأكتر من رفع معلق لنفس الدرس (فيديوهات متعددة).
2. `get-video-playback-url`: قبول `video_id` اختياري لتشغيل أي فيديو محدد (بجانب الأساسي الافتراضي).

## نطاقك (ملكك حصرياً — ممنوع تلمس غيرها)

1. **`supabase/functions/create-video-upload-session/index.ts`** + **`index_test.ts`**
2. **`supabase/functions/get-video-playback-url/index.ts`** + **`index_test.ts`**
3. **ممنوع تماماً:** `supabase/migrations/*` (ملك videos-db)، `src/**` (ملك agents الواجهة)، أي EF تاني (upload-board/delete-pdf/...)، config.toml

## اقرأ قبل الكتابة

- `supabase/functions/create-video-upload-session/index.ts` — كتلة الـ orphan rule (سطر ~542-565: فحص `pendingCount` ثم `lesson_has_pending_upload`) + قسم الـ error mapping (~655) + التعليق الرأسي (سطر ~16-17).
- `supabase/functions/create-video-upload-session/index_test.ts` — الاختبارات: `pending upload exists -> 422 lesson_has_pending_upload` (~268) و `wrapper lesson_has_pending_upload -> 422 + cleanup` (~382) + أي اختبار يعتمد عليهما.
- `supabase/functions/get-video-playback-url/index.ts` — التحقق الحالي (الدرس + access + الأساسي ready) وبناء الـ playback URL.
- `supabase/functions/get-video-playback-url/index_test.ts` — بنية الاختبارات.
- `supabase/functions/_test_helpers.ts` — الـ stub client.

## المطلوب بالتفصيل

### create-video-upload-session

1. **احذف كتلة الـ orphan rule** (فحص `pendingCount` → `lesson_has_pending_upload`) بالكامل — رفعان معلقان لنفس الدرس مسموحان الآن. حدّث التعليق الرأسي (البنود 2 و 16-17) و error map.
2. **التعامل مع wrapper `lesson_has_pending_upload`** في error mapping: لو رجع خطأ `lesson_has_pending_upload` من الـ RPC (ميجريشن قديم لم يُنشر بعد) — الإبقاء على الـ mapping صحي (لا يحصل في الواقع بعد 0042، لكن لا تحذفه إن كان الاختبار يغطيه — **الأفضل: احذف الاختبار الخاص به وأبقِ الـ mapping دفاعياً**).
3. **حدّث الاختبارات:**
   - احذف/استبدل اختبار `pending upload exists -> 422` باختبار جديد: وجود pending واحد **لا يمنع** جلسة ثانية → `create` ينجح (RPC يُستدعى، Bunny يُستدعى).
   - احذف اختبار `wrapper lesson_has_pending_upload -> 422 + cleanup`.
   - تأكد أن باقي الاختبارات (replace/cancel/validation) تمر بدون تغيير.

### get-video-playback-url

1. **اقبل `video_id` اختياري** في الـ query (GET الحالي) — مع `lesson_id` كما هو.
2. **المنطق:**
   - نفس بوابة الوصول الحالية (get_my_lesson_access + درس غير محذوف + staff/student).
   - `video_id` محدد: الفيديو لازم من نفس الدرس + غير محذوف + `status='ready'` (`video_not_found`/`wrong_lesson`/`video_not_ready`) + **`source='bunny'`** (يوتيوب → 422 `youtube_video` — لا يُشغَّل عبر Bunny).
   - بدون `video_id`: السلوك الحالي (الأساسي ready) — backward compat.
   - الرد: `{ playback_url, video_id, lesson_id }` بالفيديو الفعلي المستخدم.
3. **حدّث الاختبارات:** كل الحالية تمر + أضف: video_id لفيديو غير أساسي ready → 200 بصفته، video_id من درس آخر → 422/404، video_id غير ready → video_not_ready، video_id لفيديو يوتيوب → 422 youtube_video.

## التحقق

`deno test supabase/functions/create-video-upload-session` و `deno test supabase/functions/get-video-playback-url` ثم `deno test supabase/functions` كامل (لا فشل — الرقم النهائي ≥ 293).

## القواعد

- لا comments جديدة غير ضرورية؛ حدّث التعليقات القديمة التي تصف سلوكاً تغيّر.
- لا تشغّل git commit/push — التحميل مركزي لاحقاً.
- لا تغيّر شكل الردود الناجحة إلا بإضافة ما هو مذكور صراحةً أعلاه.