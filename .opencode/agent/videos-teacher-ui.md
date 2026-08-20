---
description: يبني واجهة المدرس لميزة «فيديوهات متعددة + يوتيوب» — LessonAssetsPage (قائمة كل الفيديوهات + رفع متعدد عبر uploadManager + حذف فيديو + نموذج إضافة يوتيوب) + rpc.ts (addYoutubeVideo/deleteLessonVideo + source/youtube_video_id في listLessonVideos) + أنواع + اختبارات.
mode: subagent
---

# Sub Agent: videos-teacher-ui

## الفكرة (الميزة كاملة)

المدرس يرفع أكتر من فيديو للدرس (Bunny عبر الرفع الخلفي — محرك جاهز من agent سابق) ويضيف فيديوهات يوتيوب باللينك، ويدير القائمة (حذف/إلغاء/معاينة/بادجات). انت مسؤول عن **واجهة المدرس فقط**.

## نطاقك (ملكك حصرياً — ممنوع تلمس غيرها)

1. **`src/features/walid/LessonAssetsPage.tsx`** + **`LessonAssetsPage.test.tsx`** — قسم الفيديوهات.
2. **`src/data/rpc.ts`** — **دوالك فقط:** `addYoutubeVideo(lessonId, url, title?)` و `deleteLessonVideo(lessonId, videoId)` (استدعاء rpc مباشر) + توسعة `listLessonVideos` لتشمل `source, youtube_video_id, title` في الـ select.
3. **`src/types/database.ts`** — `LessonVideo`: `+ source: 'bunny'|'youtube'` و `+ youtube_video_id: string | null` و `bunny_video_id: string | null`.
4. **ممنوع تماماً:** `supabase/migrations/*`، `supabase/functions/*`، `src/features/student/*`، `src/upload/*` (استخدم API الـ manager الجاهز)، `public/sw.js`، `src/app/App.tsx`.

## اقرأ قبل الكتابة

- `src/features/walid/LessonAssetsPage.tsx` — قسم الفيديوهات كاملاً (~200-260، ~640-879، ~940-1120) + `src/upload/uploadManager.ts` (API: enqueueVideoUpload/cancelJob/subscribe/getSnapshot — من agent سابق، جاهز).
- `src/features/walid/LessonAssetsPage.test.tsx` — نمط الـ mocks (incl. uploadManager mock الموجود).
- `src/data/rpc.ts` — `listLessonVideos` (~653-670) + `createVideoUploadSession` (~635).
- نمط قسم السبورات/PDF في نفس الصفحة (Card + قوائم + رسائل عربية) للالتزام بالتصميم.

## المطلوب بالتفصيل

### rpc.ts + types

1. `listLessonVideos`: أضف `source, youtube_video_id, title` للـ select (و `bunny_video_id` يفضل nullable). الترتيب الحالي (`is_primary desc, created_at asc`) يبقى.
2. `addYoutubeVideo(lessonId, url, title?)` → `rpc('add_youtube_video', { p_lesson_id, p_youtube_url, p_title })`.
3. `deleteLessonVideo(lessonId, videoId)` → `rpc('delete_lesson_video', { p_lesson_id, p_video_id })`.
4. `types/database.ts`: LessonVideo + `source` و `youtube_video_id` و `bunny_video_id: string | null`.
5. **انتبه:** agent آخر يعدّل `getPlaybackUrl(lessonId, videoId?)` في نفس الملف بالتوازي — لا تلمس دالة getPlaybackUrl أو أي دالة أخرى.

### LessonAssetsPage — قسم الفيديوهات

1. **القائمة:** اعرض كل الفيديوهات (ready/pending_upload/processing/failed/replaced):
   - بادجات: «أساسي» (is_primary) + حالة (قيد الرفع/قيد المعالجة/جاهز/فشل).
   - Thumbnail للـ bunny ready (المكوّن VideoThumbnail الموجود).
   - أزرار: معاينة (ready bunny → `getPlaybackUrl(lessonId, video.id)` — استخدم التوقيع الجديد مع videoId)، إلغاء (pending — `handleCancelPendingVideo` الموجود)، **حذف (جديد — كل الحالات عدا... كلها: ready/pending/processing/failed)** عبر `deleteLessonVideo` + Modal تأكيد + رسائل عربية (`video.not_found`/`wrong_lesson` → خريطة أخطاء `VIDEO_ERROR_MESSAGES` + fallback).
2. **الرفع المتعدد:** زر «إضافة فيديو» مفتوح دائماً (حتى مع وجود ready) — اختيار ملف → `createVideoUploadSession(lessonId, 'create')` → `manager.enqueueVideoUpload({lessonId, file, session})` → الصف يظهر فوراً كـ pending مع تقدم حي من snapshot الـ manager (صفّي بدرس). **لا تستخدم mode replace** (المتعدد يغني عنه — أزل منطق confirmReplace أو اتركه معطلاً؛ الأفضل إزالته).
   - اعرض نصاً صغيراً: «الرفع مستمر في الخلفية — يمكنك مغادرة الصفحة وسيكتمل الرفع تلقائياً».
3. **يوتيوب:** نموذج «إضافة فيديو من يوتيوب» (URL + عنوان اختياري):
   - تحقق client-side (regex: youtu.be/، youtube.com/watch?v=، embed/، shorts/، ID مجرد) → خطأ عربي إن غير صالح.
   - نجاح → `addYoutubeVideo` → toast «تمت إضافة الفيديو» → loadVideos.
   - أخطاء الـ RPC (`invalid_youtube_url`/`youtube_video_duplicate`/`lesson_not_found`) → رسائل عربية.
   - الفيديو المضاف يظهر في القائمة بحالة ready + بادج يوتيوب (أيقونة Play/ExternalLink).
4. **تحديث الاختبارات:** قائمة متعددة (ready+pending معاً)، تقدم حي من manager snapshot، إضافة يوتيوب (صالح/غير صالح/مكرر)، حذف فيديو (تأكيد + نجاح + خطأ)، إلغاء pending، معاينة بغير الأساسي تستدعي getPlaybackUrl بـ videoId، عدم كسر اختبارات PDF/سبورات/تعليقات.

## التحقق

- `npm run typecheck` + `npm run lint` + `npm run test -- LessonAssetsPage` + `npm run test` كامل (لا فشل — احترس: اختبارات StudentLessonPage تستخدم rpc.ts أيضاً).

## القواعد

- حافظ على كل رسائل الخطأ العربية الموجودة (`VIDEO_ERROR_MESSAGES`) وأضف مفاتيح جديدة بنفس النمط.
- لا comments جديدة غير ضرورية.
- لا تشغّل git commit/push — التحميل مركزي لاحقاً.