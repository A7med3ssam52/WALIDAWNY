# تقرير اختبار رفع الفيديوهات و PDF

**التاريخ:** 2026-08-17 | **البيئة:** Windows 11 + Node v24.11.1 + Deno 2.9.5 (محلي: static analysis + اختبارات آلية) | **النتيجة الإجمالية:** به أخطاء

## ملخص
- عدد الأخطاء: **8** أخطاء (0 حرجة CRITICAL / 5 متوسطة MAJOR / 3 طفيفة MINOR)
- ما تم اختباره:
  - **فيديو:** الواجهة LessonAssetsPage.tsx (مراحل الرفع، TUS، استئناف، إلغاء، معالجة أخطاء عربية)، rpc.ts، Edge Functions الخمس (create-video-upload-session، bunny-video-webhook، get-video-playback-url، recheck-video-states، get-video-thumbnail-url)، الأنواع، والـ wrappers في migrations (0015/0016/0017/0008/0025/0028).
  - **PDF:** upload-pdf EF، finalize_pdf_upload، get-pdf-signed-url، ومسار الواجهة.
  - **اختبارات آلية:** npm run test (239/239 نجحت)، npm run typecheck (نظيف)، npm run lint (نظيف)، deno test على 6 وظائف (142/142 نجحت).
  - **فحص ساكن:** سطرًا بسطر للواجهة وطبقة البيانات وEdge Functions والـ migrations المرتبطة.

## الأخطاء المكتشفة

### [MAJOR] — مسار "إعادة المحاولة" (resume) لرفع الفيديو مكسور بنيويًا: يُمرَّر نقطة نهاية TUS الأساسية كـ uploadUrl
- **الملف:** src/features/walid/LessonAssetsPage.tsx:482-484 (مع node_modules/tus-js-client/lib/upload.js:434-438 و 661-705)
- **الوصف:** عند فشل رفع TUS (بعد استنفاد retryDelays) يضغط المستخدم "إعادة المحاولة" فيستدعي retryVideoUpload ثم startTusUpload(session, file, true) بإنشاء new TusUpload(file, { uploadUrl: session.upload_url }). قيمة session.upload_url هي الثابت BUNNY_TUS_ENDPOINT = https://video.bunnycdn.com/tusupload (النقطة الأساسية)، وليست عنوان المورد الفعلي للرفع. في tus-js-client، وجود uploadUrl يجعل _startSingleUpload يرسل HEAD إلى ذلك العنوان ويتوقع رأس Upload-Offset؛ النقطة الأساسية ليست مورد رفع، وبما أن endpoint غير مُمرَّر في هذا الفرع (السطر 685-693) تصل tus إلى _emitHttpError (tus: unable to resume upload...) ثم onError → "فشل رفع الفيديو. حاول مرة أخرى" — أي أن الاستئناف لا يمكن أن ينجح أبدًا. آلية الاستئناف الصحيحة (fingerprint في localStorage) تُستدعى فقط عند تمرير endpoint دون uploadUrl.
- **التكرار (Reproduction):** 1) ابدأ رفع فيديو واقطع الشبكة حتى يفشل (تظهر رسالة "فشل رفع الفيديو"). 2) أعد الشبكة واضغط "إعادة المحاولة". 3) يفشل الرفع فورًا مجددًا.
- **المتوقع (Expected):** استئناف الرفع من آخر Upload-Offset (عبر endpoint + fingerprint المخزن، أو عبر التقاط upload.url من المحاولة السابقة).
- **الفعلي (Actual):** HEAD إلى https://video.bunnycdn.com/tusupload → خطأ → فشل دائم.
- **الأثر:** ميزة الاستئناف (متطلب صريح في Phase 5) لا تعمل إطلاقًا؛ على الشبكات المتقطعة يضطر المستخدم للإلغاء وإعادة الرفع من الصفر في كل مرة.
- **اقتراح أولي:** في فرع الـ resume مرّر endpoint: session.upload_url بدل uploadUrl (سيستعيد tus الـ upload URL المخزن من المحاولة الأولى)، أو احفظ tusUploadRef.current.url بعد start() الأول ومرّره كـ uploadUrl.

### [MAJOR] — "معاينة" الفيديو في لوحة الموظف لا تعمل على Chrome/Firefox: الرابط الناتج HLS يُشغَّل عبر عنصر video خام بدون hls.js
- **الملف:** src/features/walid/LessonAssetsPage.tsx:1001-1005 مع supabase/functions/_shared/bunny.ts:260-264
- **الوصف:** get-video-playback-url يعيد رابط HLS master playlist (https://zone/videoId/playlist.m3u8). النافذة المنبثقة للمعاينة تستخدم عنصر video خامًا مع src، بينما صفحة الطالب تستخدم VideoPlayer (الذي يحقن hls.js). متصفحات سطح المكتب الحديثة (Chrome/Firefox/Edge) لا تدعم HLS نطقيًا داخل video.
- **التكرار (Reproduction):** افتح معاينة فيديو جاهز على Chrome لسطح المكتب → شاشة سوداء بلا تشغيل (تعمل على Safari وChrome أندرويد فقط).
- **المتوقع (Expected):** تشغيل HLS عبر hls.js (إعادة استخدام VideoPlayer في المودال).
- **الفعلي (Actual):** عنصر video بلا مصدر قابل للتشغيل على معظم متصفحات سطح المكتب.
- **الأثر:** ميزة المراجعة (staff QA preview) معطلة للموظفين على المتصفحات الشائعة.
- **اقتراح أولي:** استبدال video src بمكوّن VideoPlayer الموجود (يدعم hls.js مع fallback).

### [MAJOR] — بعد نجاح رفع الفيديو تعلق واجهة الرفع في حالة done ولا يمكن رفع فيديو آخر إلا بإعادة تحميل الصفحة
- **الملف:** src/features/walid/LessonAssetsPage.tsx:467-471 (onSuccess يضبط stage=done) مع السطر 734 (فرع التصيير) و 548-551 (openNewVideoPicker)
- **الوصف:** onSuccess يضبط stage إلى done. فرع العرض (stage === idle أو stage === failed) يعرض أزرار الاختيار/الرفع فقط؛ في done يُعرض شريط التقدم "تم الرفع — جاري المعالجة" بلا أي زر، وopenNewVideoPicker (الذي لا يصفّر stage) غير قابل للوصول لأن زر "رفع فيديو جديد" غير معروض. لا يوجد أي مسار يعيد stage إلى idle (الإلغاء وحده يفعل، وزر الإلغاء غير ظاهر في done).
- **التكرار (Reproduction):** ارفع فيديو بنجاح → يظهر "تم الرفع — جاري المعالجة" إلى الأبد → لا يمكن رفع فيديو ثانٍ أو استبدال آخر دون تحديث الصفحة (F5).
- **المتوقع (Expected):** العودة تلقائيًا إلى حالة idle بعد نجاح الرفع (مع بقاء الحالة ظاهرة في قائمة الفيديوهات).
- **الفعلي (Actual):** تعلق الواجهة في done حتى إعادة التحميل.
- **الأثر:** تجربة مستخدم مكسورة في المسار السعيد الرئيسي؛ أي رفع ناجح يجمّد أداة الرفع.
- **اقتراح أولي:** في onSuccess اضبط stage إلى idle (مع الاحتفاظ بالـ toast وإعادة تحميل القائمة)، أو اجعل openNewVideoPicker يصفّر stage ويكون متاحًا في كل الحالات غير النشطة.

### [MAJOR] — لا يوجد abort للرفع عند مغادرة الصفحة: جلسة الرفع تُترك معلقة وقد تُقفل الدرس نهائيًا
- **الملف:** src/features/walid/LessonAssetsPage.tsx:287-288 و 356-373 (لا يوجد useEffect cleanup يستدعي tusUploadRef.current.abort عند unmount)
- **الوصف:** عند مغادرة صفحة ملفات الدرس (تنقل SPA أو إغلاق التبويب) أثناء رفع TUS لا يُستدعى abort إطلاقًا. في التنقل داخل SPA يستمر الرفع في الخلفية بلا أي واجهة تحكم (اختفى زر الإلغاء)؛ عند إغلاق التبويب يُقطع الطلب تاركًا رفعًا جزئيًا على Bunny (حالة 0/queued) بلا webhook لاحق — تمامًا السيناريو الذي صُمم له action=cancel في create-video-upload-session (MED-2) لكن الواجهة لا تطلقه.
- **التكرار (Reproduction):** ابدأ رفع فيديو → انتقل إلى صفحة أخرى (أو أغلق التبويب) → عد لاحقًا: الصف عالق pending_upload وقاعدة orphan (0016) تمنع أي جلسة جديدة، وrecheck-video-states يعتبر حالة Bunny 0 no-op فلا يحرّره.
- **المتوقع (Expected):** إلغاء الرفع وتحرير الجلسة عند مغادرة الصفحة (abort + cancelVideoUploadSession)، أو تحذير المستخدم قبل المغادرة.
- **الفعلي (Actual):** الصف يبقى pending_upload إلى الأبد.
- **الأثر:** قفل دائم لرفع الفيديوهات على الدرس حتى تدخل يدوي (EF/DB) — ويرتبط مباشرة بالخطأ التالي.
- **اقتراح أولي:** useEffect cleanup يستدعي abort مع إفراغ tusUploadRef، واستدعاء cancelVideoUploadSession عند توفر session.

### [MAJOR] — لا يوجد زر إلغاء للصفوف المعلقة في قائمة الفيديوهات: جلسة مهجورة تُقفل الدرس بلا مخرج من الواجهة
- **الملف:** src/features/walid/LessonAssetsPage.tsx:692-717 (أزرار الصف: معاينة/استبدال للـ ready فقط — لا زر إلغاء للـ pending_upload)
- **الوصف:** cancelVideoUpload يعمل فقط على الجلسة الموجودة في ذاكرة videoUpload.session. بعد إعادة تحميل الصفحة (أو مع جلسة متروكة من تبويب آخر/انهيار متصفح) تكون session = null، ويُعرض الصف المعلق في القائمة بشارة "قيد الرفع" دون أي زر إلغاء/حذف، وبدء رفع جديد يُرفض بـ lesson_has_pending_upload. النتيجة: الدرس ممنوع من رفع فيديو جديد إلى الأبد (لا webhook ولا recheck يحرّران حالة pending_upload مع Bunny status 0).
- **التكرار (Reproduction):** 1) ارفع فيديو واقطعه قبل أي بايت (أو أغلق التبويب). 2) أعد فتح الصفحة: الصف معلق pending_upload، لا زر إلغاء، وكل محاولة رفع جديدة تفشل برسالة "يوجد رفع قيد التنفيذ بالفعل لهذا الدرس".
- **المتوقع (Expected):** زر إلغاء/تحرير على صف pending_upload في القائمة يستدعي cancelVideoUploadSession(lessonId, video.id).
- **الفعلي (Actual):** لا مخرج من الواجهة — يتطلب تدخلًا يدويًا (استدعاء EF أو حذف صف).
- **الأثر:** قفل دائم لميزة رفع الفيديو على الدرس المتأثر؛ لا يمكن للموظف التعافي ذاتيًا.
- **اقتراح أولي:** إضافة زر "إلغاء" بجانب صفوف pending_upload يستدعي cancelVideoUploadSession (الـ EF جاهز — المشكلة في الواجهة فقط).

### [MINOR] — فشل رفع PDF يترك صفًا شبحًا (ghost row) دائمًا بلا أي وسيلة تنظيف أو إعادة محاولة
- **الملف:** src/features/walid/LessonAssetsPage.tsx:408-428 (لا retry لـ finalizePdfUpload ولا مسح للصف عند فشل uploadPdfBytes) مع السطر 938-963 (قائمة PDF بلا زر حذف) و supabase/functions/upload-pdf/index.ts (لا orphan rule لـ PDF)
- **الوصف:** إذا فشل uploadPdfBytes (PUT) أو finalizePdfUpload (RPC)، تُترك سجلات lesson_pdfs بـ is_ready=false إلى الأبد: handleUpload يعيد الحالة إلى idle ويمسح الملف، ولا يوجد زر حذف في قائمة "ملفات PDF الحالية" ولا إلغاء أثناء الرفع (خلافًا لمسار الفيديو). كما لا توجد قاعدة تمنع تراكم أكثر من صف معلق واحد للدرس (0015 لا يفحص وجود pending سابق).
- **التكرار (Reproduction):** ارفع ملفًا ثم افصل الشبكة عند PUT → تظهر رسالة "فشل رفع الملف إلى التخزين" ويبقى صف "قيد الرفع" دائمًا في القائمة.
- **المتوقع (Expected):** إمكانية إلغاء/حذف الصف المعلق، أو إعادة محاولة الـ finalize، أو قاعدة orphan تحل محل الصف القديم.
- **الفعلي (Actual):** صفوف "قيد الرفع" متراكمة دائمة (لا تؤثر على الطلاب بسبب RLS — مرئية للموظف فقط — لكنها تشوش القائمة وتترك كائنات في Storage بلا إدارة).
- **الأثر:** فوضى بيانات تدريجية في lesson_pdfs مع عدم القدرة على التنظيف من الواجهة.
- **اقتراح أولي:** زر حذف/إلغاء للصفوف غير الجاهزة (مع حذف كائن Storage عبر EF)، أو إعادة محاولة finalizePdfUpload للصف الأخير غير الجاهز.

### [MINOR] — بيانات TUS metadata تصرّح دائمًا بـ filetype video/mp4 حتى لملفات WebM/MOV
- **الملف:** supabase/functions/create-video-upload-session/index.ts:723-726
- **الوصف:** الـ EF يعيد metadata ثابتًا filetype=video/mp4 بينما الواجهة تسمح بـ mp4/webm/mov (السطر 156-157). يُرسل Upload-Metadata إلى Bunny بنوع خاطئ للملفات غير MP4 (Bunny يكتشف الصيغة الفعلية من البايتات عادة، لذا الأثر محدود).
- **المتوقع (Expected):** filetype مشتق من نوع الملف الفعلي (يُمرَّر من العميل أو يُكتشف من الامتداد).
- **الفعلي (Actual):** كل الرفعات تُعلن mp4.
- **الأثر:** وصف مضلل في جلسة الرفع؛ احتمال تأثير على تلميحات الترميز في حالات نادرة.
- **اقتراح أولي:** قبول file_type اختياري في body الـ EF والتحقق منه ضمن القائمة المسموحة.

### [MINOR] — نافذة توقيع TUS ساعة واحدة فقط مقابل حد أقصى 2 جيجابايت: رفع بطيء قد يفشل في منتصفه
- **الملف:** supabase/functions/create-video-upload-session/index.ts:96 (TUS_SIGNATURE_TTL_SECONDS = 3600) مع src/features/walid/LessonAssetsPage.tsx:201 (MAX_VIDEO_SIZE = 2 GiB)
- **الوصف:** ملف 2 جيجابايت على اتصال ~5 ميجابت/ثانية يستغرق نحو 55 دقيقة — قريب جدًا من حد الساعة. عند انتهاء AuthorizationExpire يرفض Bunny استمرار الرفع، ومسار الاستئناف مكسور أصلًا (الخطأ MAJOR الأول)، فلا خيار سوى الإلغاء وإعادة الرفع.
- **المتوقع (Expected):** TTL أطول (مثل 24 ساعة) أو تجديد التوقيع.
- **الفعلي (Actual):** رفض الرفع بعد انتهاء التوقيع دون رسالة واضحة للمستخدم.
- **الأثر:** فشل رفعات كبيرة على اتصالات بطيئة.
- **اقتراح أولي:** رفع TTL إلى 86400 أو تجديد التوقيع عبر EF عند الاقتراب من الانتهاء.

## ما تم اختباره وسليم (Positive results)
- **الاختبارات الآلية كاملة خضراء:** 239/239 (vitest) شاملة LessonAssetsPage.test.tsx (20 اختبارًا: رفع end-to-end، استبدال، إلغاء، أخطاء عربية، polling، thumbnails الموقعة) وVideoPlayer.test.tsx (6). typecheck و lint نظيفان تمامًا (لا أخطاء قائمة مسبقًا).
- **اختبارات Deno 142/142 خضراء** على 6 وظائف: create-video-upload-session (33)، get-video-playback-url (23)، recheck-video-states (15)، bunny-video-webhook (24)، get-pdf-signed-url (18)، upload-pdf (29) — تغطي التحقق من JWT، الأدوار، قواعد orphan، الإلغاء، التسلسلات القانونية للحالات، التوقيعات (vectors مثبتة)، وحالات الخطأ.
- **المسار السعيد لرفع الفيديو سليم:** إنشاء الجلسة (EF) ← TUS upload مع progress ← نجاح ← معالجة ← polling كل 4 ثوانٍ ← جاهز. الترويسات (AuthorizationSignature/Expire/LibraryId/VideoId) متوافقة مع صيغة Bunny الموثقة، وchunkSize 8MiB مع retryDelays معقولان.
- **قاعدة orphan (جلسة معلقة واحدة لكل درس)** مفروضة مرتين (EF + wrapper 0016) بشكل صحيح، وتحرير الجلسة عبر action=cancel (0017) يعمل في مساره المدعوم (عند توفر الجلسة في الذاكرة) مع حذف best-effort لكائن Bunny.
- **استبدال الفيديو:** يرسل old_video_id، والـ wrapper يتحقق (ready + نفس الدرس)، والديموشن/الترقية إلى primary عند الوصول إلى ready في set_video_status (0008) مع إعادة توجيه progress (A11) سليمة.
- **رفع PDF:** مسار EF (تحقق اسم/حجم، حجز الصف، createSignedUploadUrl على bucket خاص بـ policy مربوط بالصف 0015) ثم PUT مباشر ثم finalize_pdf_upload (ترقية primary) سليم؛ رفض غير-PDF وحجم > 50MB قبل الرفع يعمل.
- **تسليم PDF للطالب:** get-pdf-signed-url student-only (S7)، حل الأساسي الجاهز فقط (MED-7)، رابط موقّع 15 دقيقة عبر service role — سليم.
- **تشغيل الطالب:** get-video-playback-url يطبق بوابة الوصول (شراء مدى الحياة أو درس تجريبي عبر get_my_lesson_access) + رابط HLS موقع HS256 مقفل بالـ IP (صيغة تحققت مقابل pull zone) — سليم، وVideoPlayer يستخدم hls.js مع استئناف الموضع.
- **الاتساق:** notify_new_content أُعيد بناؤه في 0028 على unit_purchases (لا مرجع عالق لجدول subscriptions المحذوف)، ودور teacher مضاف لجميع wrappers الرفع في 0025.
- **رسائل الخطأ العربية** شاملة في VIDEO_ERROR_MESSAGES/PDF_ERROR_MESSAGES وتتوافق مع أكواد الـ EFs (الاختبارات تؤكد ذلك).

## ملاحظات إضافية
- upload-pdf يردّ expires_in: 60 (السطر 82) لكنه لا يمرر أي TTL إلى createSignedUploadUrl (السطر 391-393) — القيمة المُعلنة قد لا تطابق TTL الفعلي للرابط الموقّع. العميل يتجاهلها حاليًا، لكنها مضللة للصيانة المستقبلية.
- لا يوجد تحقق من الحجم على الخادم لرفع الفيديو (الحد 2GiB في الواجهة فقط)؛ عميل معدل يمكنه تجاوزه عبر TUS — يُنصح بإضافة حد عند إنشاء الجلسة أو عبر ترويسة Upload-Length في الـ EF عند توفرها.
- اختبار resume في LessonAssetsPage.test.tsx:426-461 يتحقق من تمرير الخيارات فقط ولا يحاكي سلوك خادم TUS الحقيقي، لذا لم يكشف الخطأ MAJOR الأول — يُنصح باختبار وحدة يحاكي رفض HEAD على النقطة الأساسية.
- أولوية الإصلاح المقترحة: (1) مسار الاستئناف ← (2) إدارة الجلسات المعلقة عند المغادرة/القائمة ← (3) معاينة HLS ← (4) تعليق الواجهة بعد النجاح ← ثم MINORs.
