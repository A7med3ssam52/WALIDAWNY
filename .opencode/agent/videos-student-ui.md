---
description: يبني واجهة الطالب لميزة «فيديوهات متعددة + يوتيوب» — StudentLessonPage (قائمة كل الفيديوهات الجاهزة + VideoPlayer لكل فيديو Bunny + YouTubeEmbed للفيديوهات اليوتيوب) + getPlaybackUrl(videoId اختياري) + مكوّن YouTubeEmbed + اختبارات.
mode: subagent
---

# Sub Agent: videos-student-ui

## الفكرة (الميزة كاملة)

الطالب يشوف **كل** فيديوهات الدرس الجاهزة (bunny + يوتيوب): الأساسي باللاعب الرئيسي كالمعتاد، والباقي في قائمة «فيديوهات الدرس» — كل bunny يُشغَّل عبر VideoPlayer بـ playback URL موقّع من EF (get-video-playback-url مع video_id)، وكل يوتيوب يُعرض بـ iframe embed (youtube-nocookie). انت مسؤول عن **واجهة الطالب فقط**.

## نطاقك (ملكك حصرياً — ممنوع تلمس غيرها)

1. **`src/features/student/StudentLessonPage.tsx`** + **`StudentLessonPage.test.tsx`**.
2. **`src/components/YouTubeEmbed.tsx`** (جديد) + اختباره (أضفه لملف اختبار قائم أو ملف جديد `YouTubeEmbed.test.tsx`).
3. **`src/data/rpc.ts`** — **دالة `getPlaybackUrl` فقط:** التوقيع `getPlaybackUrl(lessonId: string, videoId?: string)` يمرر `video_id` في الـ query عند توفره.
4. **ممنوع تماماً:** `supabase/*`، `src/features/walid/*`، `src/upload/*`، `src/types/database.ts` (غيّرها agents آخرون)، أي دالة rpc أخرى (listLessonVideos بتوسّعها agent آخر بالتوازي — استخدم الـ select الجديد كما سيكون).

## اقرأ قبل الكتابة

- `src/features/student/StudentLessonPage.tsx` — الجلب (~110-195)، `primaryVideo` (~182-184)، التصيير (~455-500)، `handleProgress`/`handleComplete` (~200-300).
- `src/features/student/StudentLessonPage.test.tsx` — mocks الـ fetch الحالية (`get-video-playback-url` في ~112-117).
- `src/components/VideoPlayer.tsx` — نمط المكوّنات.
- `src/types/database.ts` — `LessonVideo` (سيصبح فيه `source` و `youtube_video_id`).

## المطلوب بالتفصيل

### YouTubeEmbed.tsx

- `{ videoId, title?: string }` → `<iframe src="https://www.youtube-nocookie.com/embed/{videoId}" title allowFullScreen className="aspect-video w-full rounded-lg border border-white/15" data-testid="youtube-embed" />` + allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture".
- اختبار: يرندر iframe بـ src الصحيح.

### StudentLessonPage

1. **الجلب:** `videos` (listLessonVideos) → بدل `primaryVideo` فقط، خزّن `primaryVideo` (أول ready is_primary) + `extraVideos = ready غير الأساسي` (بالترتيب الموجود). (بعد تعديل RLS/agent تاني، listLessonVideos سترجع كل الـ ready — الفلترة بأمان: `video.status === 'ready'`).
2. **التصيير:**
   - الأساسي: كما هو (VideoPlayer بـ `getPlaybackUrl(lesson.id, primaryVideo.id)` — مرر videoId صراحةً).
   - **قائمة «فيديوهات الدرس»** (Card جديدة بعد الأساسي، تظهر فقط عند وجود extraVideos):
     - كل صف: عنوان (title — بديل اسم الملف) + بادج يوتيوب/Bunny.
     - bunny: VideoPlayer صغير لكل فيديو مع `getPlaybackUrl(lesson.id, video.id)` — حالات تحميل/خطأ لكل صف مستقلة (فشل أحدهم لا يكسر الباقي) + `video_not_ready` → رسالة «قيد التجهيز».
     - يوتيوب: `YouTubeEmbed videoId={video.youtube_video_id}`.
   - **التقدم:** السلوك الحالي (حفظ position_seconds عبر progress) يبقى للأساسي فقط — الفيديوهات الإضافية بلا حفظ تقدم (بسيطة وواضحة).
   - شروط الوصول الحالية (access_denied card / video_not_ready / تعذر التحميل) تبقى كما هي للأساسي.
3. **تحديث الاختبارات:** الأساسي يستدعي getPlaybackUrl بـ (lesson.id, primaryVideo.id)؛ فيديو إضافي bunny → fetch ثانٍ بـ videoId صحيح + VideoPlayer ثانٍ؛ فيديو إضافي يوتيوب → YouTubeEmbed بـ youtube_video_id؛ فشل playback لأحد الإضافيين لا يكسر الباقي؛ لا تتغير كل اختبارات الوصول/الملفات/السبورات.
   - **انتبه:** اختبارات أخرى في الريبو تستدعي rpc.ts — تأكد أن التغيير (video_id optional) لا يكسر `src/features/student/StudentLessonTabs.test.tsx` أو غيرها.

## التحقق

- `npm run typecheck` + `npm run lint` + `npm run test -- StudentLessonPage` + `npm run test` كامل (لا فشل).

## القواعد

- حافظ على الرسائل العربية الحالية ونمط التصميم (glass-card).
- لا comments جديدة غير ضرورية.
- لا تشغّل git commit/push — التحميل مركزي لاحقاً.