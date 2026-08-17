# خطة إصلاح أخطاء رفع الفيديوهات و PDF

**المصدر:** تقرير اختبار (2026-08-17) — `reports/upload-test-report.md` | **عدد الأخطاء المشمولة:** 8 (5 MAJOR / 3 MINOR) | **الأخطاء المستثناة:** لا يوجد

## أولويات التنفيذ
1. (MAJOR) مسار "إعادة المحاولة" (resume) لرفع الفيديو مكسور بنيويًا — `uploadUrl` خاطئ
2. (MAJOR) تعليق الواجهة في حالة `done` بعد نجاح الرفع (لا يمكن رفع فيديو آخر)
3. (MAJOR) لا abort للرفع عند مغادرة الصفحة (جلسة معلقة تُقفل الدرس)
4. (MAJOR) لا زر إلغاء للصفوف المعلقة في قائمة الفيديوهات
5. (MAJOR) معاينة الفيديو (HLS) لا تعمل على Chrome/Firefox
6. (MINOR) فشل رفع PDF يترك صفًا شبحًا بلا وسيلة تنظيف
7. (MINOR) TUS metadata يصرّح دائمًا بـ video/mp4 لملفات WebM/MOV
8. (MINOR) نافذة توقيع TUS ساعة واحدة فقط (رفع بطيء > 1GB يفشل)

**الاعتماديات:** الخطوة 3 و 4 مستقلتان لكنهما في نفس الملف (LessonAssetsPage.tsx) — يُنفَّذان بالترتيب لتجنب تعارض الأسطر. الخطوة 8 تعتمد على إعادة حساب vector التوقيع في الاختبار (القيمة الجديدة محسوبة مسبقًا أدناه). باقي الخطوات مستقلة.

---

## الخطوات

### الخطوة 1: إصلاح مسار الاستئناف (resume) — يصلح: [MAJOR] resume مكسور بنيويًا
- **الهدف:** عند "إعادة المحاولة" يستأنف TUS الرفع من آخر Upload-Offset بدلًا من الفشل الفوري.
- **الملفات:**
  - `src/features/walid/LessonAssetsPage.tsx` (سطر 483)
  - `src/features/walid/LessonAssetsPage.test.tsx` (سطر 452-453)
- **التغييرات المطلوبة:**
  1. في السطر 483، استبدل `uploadUrl: session.upload_url` بـ `endpoint: session.upload_url` في فرع الـ resume فقط:
     ```ts
     const upload = resume
       ? new TusUpload(file, { ...baseOptions, endpoint: session.upload_url })
       : new TusUpload(file, { ...baseOptions, endpoint: session.upload_url });
     ```
     (يمكن دمج الفرعين في سطر واحد بعد التعديل — الاختيار متروك للمنفذ، المهم: كلا الفرعين يستخدم `endpoint`.)
     **لماذا:** `session.upload_url` هو ثابت `BUNNY_TUS_ENDPOINT` (النقطة الأساسية وليست مورد رفع). تمريره كـ `uploadUrl` يجعل tus يرسل HEAD للنقطة الأساسية ويتوقع `Upload-Offset` فيفشل دائمًا. بتمريره كـ `endpoint`، يبحث tus-js-client عن الـ fingerprint المخزن في localStorage (نفس الملف + نفس endpoint من المحاولة الأولى — وهو موجود لأن `removeFingerprintOnSuccess: true` لا يحذفه إلا عند النجاح) ويستأنف من آخر Upload-Offset عبر HEAD/PATCH للمورد الصحيح.
  2. حدّث الاختبار في `LessonAssetsPage.test.tsx` (سطر 452-453) ليعكس السلوك الجديد:
     ```ts
     expect(retryUpload.options.endpoint).toBe(TUS_ENDPOINT);
     expect(retryUpload.options.uploadUrl).toBeUndefined();
     ```
- **التحقق (Verification):** `npm run test -- LessonAssetsPage` (يجب أن يمر الاختبار المُحدَّث وكل اختبارات الملف)، ثم `npm run typecheck`.
- **مخاطر/تنبيهات:** لا تغيّر شيئًا آخر في `baseOptions` (chunkSize/retryDelays/removeFingerprintOnSuccess تبقى كما هي). انتبه: الاختبار الحالي (سطر 452-453) يفحص القيم المعاكسة — تحديثه إجباري وإلا فشل. ملاحظة: الاختبار لا يحاكي خادم TUS حقيقي (يختبر الخيارات فقط) — إضافة اختبار يحاكي رفض HEAD على النقطة الأساسية مستحسن (انظر "ملاحظات خارج النطاق").

---

### الخطوة 2: العودة إلى idle تلقائيًا بعد نجاح الرفع — يصلح: [MAJOR] تعلق الواجهة في done
- **الهدف:** بعد نجاح الرفع تعود أداة الرفع إلى حالة idle فورًا (مع بقاء الصف ظاهرًا في القائمة وحالة المعالجة) بحيث يمكن رفع فيديو آخر دون إعادة تحميل الصفحة.
- **الملفات:**
  - `src/features/walid/LessonAssetsPage.tsx` (سطر 467-471 و 168 و 789-790)
  - `src/features/walid/LessonAssetsPage.test.tsx` (سطر 341-345)
- **التغييرات المطلوبة:**
  1. في `onSuccess` (سطر 467-471)، استبدل `setVideoUpload((prev) => ({ ...prev, stage: 'done', progress: 100 }))` بـ:
     ```ts
     onSuccess: () => {
       tusUploadRef.current = null;
       setVideoUpload(INITIAL_VIDEO_UPLOAD);
       showToast('تم رفع الفيديو — جاري المعالجة');
       void loadVideos();
     },
     ```
     `INITIAL_VIDEO_UPLOAD` (المُعرَّف سطر 182) يصفّر stage→idle و file و session و mode و oldVideoId — وهذا يجعل فرع العرض (سطر 734: `idle || failed`) يظهر "رفع فيديو جديد" فورًا.
  2. نظّف الحالة الميتة: أزل `'done'` من اتحاد `VideoUploadStage` (سطر 168)، وأزل فرع `videoUpload.stage === 'done'` من التصيير (سطر 789-790) مع رسالته "تم الرفع — جاري المعالجة" (الـ toast هو المصدر الوحيد الآن).
- **التحقق (Verification):** `npm run test -- LessonAssetsPage` — حدّث الاختبار في سطر 341-345: بعد `fireSuccess` تحقق من ظهور زر "رفع فيديو جديد" مرة أخرى (بدلًا من رسالة "تم الرفع — جاري المعالجة") مع بقاء `video-row-video-new-1` وشارة "قيد المعالجة". ثم `npm run typecheck`.
- **مخاطر/تنبيهات:** لا تحذف `showToast('تم رفع الفيديو — جاري المعالجة')` — هو الإشعار الوحيد المتبقي للمستخدم. لا تلمس polling (سطر 365-373) — يعمل على `anyVideoActive`. إذا بقي أي مرجع لـ `'done'` في الملف بعد التنظيف فسيكشفه typecheck.

---

### الخطوة 3: إلغاء الرفع وتحرير الجلسة عند مغادرة الصفحة — يصلح: [MAJOR] لا abort عند unmount
- **الهدف:** عند مغادرة الصفحة (تنقل SPA أو إغلاق تبويب) أثناء رفع TUS: إيقاف الرفع وتحرير جلسة الخادم حتى لا تُقفل الجلسة `pending_upload` الدرس.
- **الملفات:** `src/features/walid/LessonAssetsPage.tsx` (بجانب useEffect سطر 356-361، وداخل `startVideoUpload` سطر 503-505، و`onSuccess` سطر 467-471، و`cancelVideoUpload` سطر 531-546)
- **التغييرات المطلوبة:**
  1. أضف ref يتتبع الجلسة النشطة: `const activeVideoSessionRef = useRef<VideoUploadSession | null>(null);` بجانب `tusUploadRef` (سطر 288).
  2. حدّثه في المواضع الثلاثة:
     - في `startVideoUpload` بعد نجاح `createVideoUploadSession` (سطر 504): `activeVideoSessionRef.current = session;`
     - في `onSuccess` (سطر 468): `activeVideoSessionRef.current = null;`
     - في `cancelVideoUpload` (سطر 533): `activeVideoSessionRef.current = null;`
  3. أضف useEffect cleanup جديد (بجانب useEffect سطر 356-361):
     ```ts
     useEffect(() => {
       return () => {
         const upload = tusUploadRef.current;
         if (upload) {
           void upload.abort().catch(() => undefined);
           tusUploadRef.current = null;
         }
         const session = activeVideoSessionRef.current;
         if (lessonId && session) {
           activeVideoSessionRef.current = null;
           void cancelVideoUploadSession(lessonId, session.video_id).catch(() => undefined);
         }
       };
     }, [lessonId]);
     ```
     لا تستدعِ أي setState داخل الـ cleanup (المكوّن قد يكون مفكوكًا). `cancelVideoUploadSession` (الموجودة في `src/data/rpc.ts` سطر 519) تستدعي الـ EF بـ `action: cancel` والـ wrapper `delete_video_upload_record` (0017) يحرر الجلسة.
- **التحقق (Verification):** `npm run typecheck` ثم `npm run test -- LessonAssetsPage` (اختبارات unmount الحالية إن وجدت + عدم كسر اختبار الإلغاء سطر 463+). تحقق يدوي: ابدأ رفعًا وانتقل لصفحة أخرى ثم عد — يجب ألا يظهر صف `pending_upload` عالق، ويمكن بدء رفع جديد فورًا.
- **مخاطر/تنبيهات:** لا تضف `videoUpload` كاعتماد (dependency) للـ useEffect — الاعتماد `[lessonId]` فقط والقراءة عبر الـ ref. لا تستدعِ `showToast` في الـ cleanup. لا تكرر الإلغاء في `cancelVideoUpload` (الزر) — الـ cleanup يعمل فقط عند المغادرة.

---

### الخطوة 4: زر إلغاء للصفوف المعلقة في قائمة الفيديوهات — يصلح: [MAJOR] لا مخرج للجلسة المهجورة
- **الهدف:** صف `pending_upload` (جلسة مهجورة من تبويب/جلسة سابقة) يحمل زر "إلغاء" يحرر الجلسة فورًا من الواجهة.
- **الملفات:** `src/features/walid/LessonAssetsPage.tsx` (سطر 692-717، ومع الحالات سطر 279-285، ومع الدوال بجانب `handleDeleteComment` سطر 343-354)
- **التغييرات المطلوبة:**
  1. أضف حالة `const [cancellingVideoId, setCancellingVideoId] = useState<string | null>(null);` بجانب الحالات (سطر 280-281).
  2. أضف دالة (بجانب `handleDeleteComment`):
     ```ts
     const handleCancelPendingVideo = async (video: LessonVideo) => {
       if (!lessonId) {
         return;
       }
       setCancellingVideoId(video.id);
       try {
         await cancelVideoUploadSession(lessonId, video.id);
         showToast('تم إلغاء الرفع');
         await loadVideos();
       } catch (err) {
         showToast(videoErrorMessage(err), 'error');
       } finally {
         setCancellingVideoId(null);
       }
     };
     ```
  3. في منطقة أزرار الصف (سطر 697-716)، أضف قبل/بعد زر "معاينة" زرًا لصفوف `pending_upload` فقط (الـ wrapper `delete_video_upload_record` 0017 يقبل `pending_upload` حصرًا — لا تعرضه لحالات أخرى):
     ```tsx
     {video.status === 'pending_upload' ? (
       <Button
         size="sm"
         variant="danger"
         icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
         onClick={() => void handleCancelPendingVideo(video)}
         disabled={cancellingVideoId === video.id}
       >
         {cancellingVideoId === video.id ? 'جاري الإلغاء...' : 'إلغاء'}
       </Button>
     ) : null}
     ```
     (أيقونة `Trash2` مستوردة بالفعل في سطر 4.)
- **التحقق (Verification):** `npm run typecheck` + `npm run test -- LessonAssetsPage`. تحقق يدوي: كرر سيناريو التقرير (اقطع الرفع قبل أي بايت، أعد فتح الصفحة) — يجب أن يظهر الزر ويحرر الدرس فورًا (يعيد `loadVideos` ويختفي الصف لأن الـ wrapper يحذف الصف).
- **مخاطر/تنبيهات:** لا تعرض الزر لحالات `uploading/processing` — الـ wrapper يرفضها بـ `video_not_pending` (رسالة "جلسة الرفع لم تعد قيد الانتظار"). لا تغيّر شرط `ready` لزرّي معاينة/استبدال.

---

### الخطوة 5: تشغيل معاينة HLS عبر VideoPlayer — يصلح: [MAJOR] معاينة سوداء على Chrome/Firefox
- **الهدف:** معاينة الفيديو في المودال تشغّل HLS على كل المتصفحات عبر hls.js (مثل صفحة الطالب).
- **الملفات:**
  - `src/features/walid/LessonAssetsPage.tsx` (سطر 1001-1005 + import سطر 1-33)
  - `src/features/walid/LessonAssetsPage.test.tsx` (سطر 518-551)
- **التغييرات المطلوبة:**
  1. أضف import: `import { VideoPlayer } from '../../components/VideoPlayer';` (في مجموعة imports سطر 1-33).
  2. استبدل عنصر `<video>` (سطر 1001-1005) بـ:
     ```tsx
     <div className="glass-card overflow-hidden rounded-2xl border-white/15 p-1.5">
       <VideoPlayer src={preview.url} />
     </div>
     ```
     (أبقِ الحاوية الخارجية `glass-card` كما هي؛ `VideoPlayer` يرندر `<video>` داخليًا بكلاس خاص به — لا تنقل className الموجود إلى عنصر آخر.)
  3. حدّث اختبار المعاينة (سطر 518-551): أضف `vi.mock('hls.js', ...)` في أعلى ملف الاختبار (إرجاع فئة Hls مزيفة بها `loadSource/attachMedia/on/destroy`) بحيث `Hls.isSupported()` يعيد true، واستبدل فحص `document.querySelector('video')` بفحص أن `loadSource` استُدعي بـ `playback_url` (المودال ما زال يظهر). في بيئة jsdom `canPlayType` يعيد '' و`Hls.isSupported()` يعيد false بدون mock — لهذا الـ mock إجباري وليس تجميليًا.
- **التحقق (Verification):** `npm run test -- LessonAssetsPage` + `npm run test -- VideoPlayer` (غير متأثر — تحقق فقط) + `npm run typecheck`. تحقق يدوي على Chrome/Firefox لسطح المكتب: المعاينة تشغّل الفيديو.
- **مخاطر/تنبيهات:** لا تحذف `preview?.loading` / `preview?.error` فروع المودال (سطر 993-998) — تبقى كما هي. لا تستخدم `VideoPlayer` خارج المودال. تأكد أن mock الاختبار لا يكسر اختبارات أخرى في الملف (mock عام على مستوى الملف).

---

### الخطوة 6: زر حذف للصفوف غير الجاهزة في قائمة PDF — يصلح: [MINOR] صفوف PDF الشبحية
- **الهدف:** صفوف `lesson_pdfs` بـ `is_ready=false` (بعد فشل PUT/finalize) قابلة للحذف من الواجهة مع تنظيف كائن Storage — بلا تراكم دائم.
- **الملفات (جديدة + معدلة):**
  - `supabase/migrations/0031_delete_pdf_upload_record.sql` (جديد)
  - `supabase/functions/delete-pdf/index.ts` (جديد)
  - `supabase/config.toml` (إضافة `[functions.delete-pdf]`)
  - `src/data/rpc.ts` (دالة جديدة بجانب `uploadPdf` سطر 478)
  - `src/features/walid/LessonAssetsPage.tsx` (سطر 938-963 + حالات/دوال)
  - `supabase/tests/local/sql/05_grants.sql` (سطر 70-76 و 58-59)
- **التغييرات المطلوبة:**
  1. **migration جديد** `0031_delete_pdf_upload_record.sql` — بنمط 0017 حرفيًا (`SECURITY DEFINER` + `SET search_path = public` + staff guard `is_admin() OR is_mr_walid()` + أخطاء P0001):
     - `pdf_not_found` (الصف غير موجود أو soft-deleted)، `wrong_lesson`، `pdf_not_pending` (الصف `is_ready` — لا حذف للجاهز).
     - `DELETE FROM public.lesson_pdfs WHERE id = p_pdf_id;` (حذف فعلي — الصف غير الجاهز بلا قيمة) + `audit_log('pdf.upload_cancelled', 'lesson_pdf', ...)`.
     - `REVOKE EXECUTE ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated;` (نمط 0017 سطر 78-80).
     - التوقيع: `delete_pdf_upload_record(p_lesson_id uuid, p_pdf_id uuid)`.
  2. **EF جديد** `supabase/functions/delete-pdf/index.ts` — بنمط upload-pdf (createClient + `jsonResponse/preflightResponse` من `../_shared/cors.ts` + STAFF_ROLES):
     - POST + JWT: تحقق role من profiles (staff فقط: admin/mr_walid/teacher).
     - body: `{ lesson_id, pdf_id }` (UUID validation مثل upload-pdf).
     - اقرأ الصف عبر `select` (مع `eq('id', pdf_id)` و `eq('lesson_id', lesson_id)` و `is('deleted_at', null)`) — إن لم يوجد: 404 `pdf_not_found`.
     - حذف كائن Storage best-effort: `client.storage.from('pdfs').remove([row.storage_path])` (تجاهل الخطأ — لا يفشل الحذف إن لم يوجد الكائن).
     - استدعاء `client.rpc('delete_pdf_upload_record', { p_lesson_id, p_pdf_id })` — إن أخطأ: اعكس الأخطاء (`permission_denied`→403، `wrong_lesson`/`pdf_not_pending`/`pdf_not_found`→422/404، وإلا 502 `function_error`).
     - نجاح: `{ deleted: true, pdf_id }` (200).
  3. **config.toml:** أضف `[functions.delete-pdf]` / `verify_jwt = true` (بعد سطر 6 نمطًا).
  4. **rpc.ts:** أضف:
     ```ts
     export async function deletePdfUpload(lessonId: string, pdfId: string): Promise<void> {
       await invokeFunction('delete-pdf', {
         method: 'POST',
         body: { lesson_id: lessonId, pdf_id: pdfId },
       });
     }
     ```
  5. **LessonAssetsPage.tsx:** استورد `deletePdfUpload` (سطر 19-33)؛ أضف حالة `deletingPdfId`؛ دالة `handleDeletePdf(pdf)` بنمط `handleDeleteComment` (سطر 343-354: try/catch مع `pdfErrorMessage` + `showToast('تم حذف الملف')` + `loadPdfs` + finally)؛ وفي صف PDF (سطر 953-959) أضف زر "حذف" (`variant="danger"` + `Trash2`) بجانب البادجات لصفوف `!pdf.is_ready` فقط (الجاهز لا يُحذف — الـ wrapper يرفضه).
  6. **05_grants.sql:** حدّث سطر 70-76: `count(*) = 64` ← `65` مع التعليق "the full client allowlist (65 functions)"، وأضف فحص anon بنمط سطر 58-59: `delete_pdf_upload_record(uuid, uuid) NOT executable`، وسطر GRANT موجب بنمط بقية الدوال.
- **التحقق (Verification):** `npm run typecheck` + `npm run test -- LessonAssetsPage` + `deno test supabase/functions/delete-pdf` (إن أضاف المنفذ اختبارات) + تشغيل اختبارات SQL المحلية إن وُجدت (`supabase/tests/local`) — والأهم تحديث 05_grants وإلا فشل اختبار count. تحقق يدوي: ارفع PDF واقطع الشبكة عند PUT → يظهر الصف "قيد الرفع" → الزر يحذفه ويختفي من القائمة.
- **مخاطر/تنبيهات:** لا تلمس صفوف `is_ready` الجاهزة. لا تحذف الـ storage object قبل نجاح التحقق من الصلاحية (JWT + الصف موجود). إن فشل حذف storage (كائن غير موجود) — تجاهل الخطأ ولا تفشل العملية. الحفاظ على رسائل الخطأ العربية عبر `pdfErrorMessage` الحالية (سطر 115-121) — أضف `pdf_not_found`/`pdf_not_pending` لمفاتيحها إن لم تكونا موجودتين (راجع `PDF_ERROR_MESSAGES` سطر 58-74 — `pdf_not_found` موجودة؛ أضف `pdf_not_pending`).

---

### الخطوة 7: filetype حقيقي في TUS metadata — يصلح: [MINOR] كل الرفعات تُعلن mp4
- **الهدف:** `Upload-Metadata` يصرّح بنوع الملف الفعلي (WebM/MOV) بدل mp4 الثابت.
- **الملفات:** `supabase/functions/create-video-upload-session/index.ts` (سطر 723-726 + دالة مساعدة بجانب `parseSessionBody` سطر 239)
- **التغييرات المطلوبة:**
  1. أضف دالة pure مصدّرة (بجانب `sanitizeTitle`/`parseSessionBody` — قابلة للاختبار):
     ```ts
     export function detectVideoFileType(fileName: string | null): string {
       const name = fileName ?? '';
       if (/\.webm$/i.test(name)) return 'video/webm';
       if (/\.mov$/i.test(name)) return 'video/quicktime';
       return 'video/mp4';
     }
     ```
  2. في كتلة `metadata` (سطر 723-726) استبدل الثابت:
     ```ts
     metadata: {
       filetype: detectVideoFileType(fileName),
       title,
     },
     ```
     (المتغير `fileName` — المُهيأ في سطر 401 من `file_name` — في النطاق عند هذه النقطة؛ إن كان null يعود mp4.)
  3. (مستحسن) أضف اختبار Deno في `index_test.ts`: `detectVideoFileType('a.webm') === 'video/webm'`، `'a.mov' → video/quicktime`، `'a.mp4'`/`null` → `video/mp4` — بنمط اختبارات الـ helpers الموجودة (سطر 97+).
- **التحقق (Verification):** `deno test supabase/functions/create-video-upload-session` (الاختبارات القائمة تمر — لا يوجد اختبار يفحص filetype حاليًا) + تأكد من استيراد الدالة في ملف الاختبار (سطر 6).
- **مخاطر/تنبيهات:** لا تغيّر شكل الـ response (يبقى `metadata.filetype` سلسلة). لا تطلب `file_type` من العميل (الاستنتاج من الامتداد يحقق الهدف بأدنى تدخل — لا تغيير في rpc.ts أو الواجهة أو اختباراتها).

---

### الخطوة 8: تمديد نافذة توقيع TUS إلى 24 ساعة — يصلح: [MINOR] فشل الرفع البطيء بعد ساعة
- **الهدف:** الرفعات الكبيرة (حتى 2GiB) على الاتصالات البطيئة لا تنقطع بانتهاء `AuthorizationExpire`.
- **الملفات:**
  - `supabase/functions/create-video-upload-session/index.ts` (سطر 96)
  - `supabase/functions/create-video-upload-session/index_test.ts` (سطر 403 و 407 و 410)
- **التغييرات المطلوبة:**
  1. في السطر 96: `export const TUS_SIGNATURE_TTL_SECONDS = 86400;` (مع تحديث التعليق: `// 24 hour upload window`).
  2. حدّث الاختبارات الثلاثة في `index_test.ts` (الاختبار "success returns TUS session" سطر 389-428) — مع `nowUnix = 1750000000` (سطر 76) و`apiKey = 'test-api-key'` (سطر 65):
     - سطر 403: `assertEqual(body.expires_in, 86400);`
     - سطر 407: `assertEqual(body.tus_headers.AuthorizationExpire, 1750086400);` (1750000000 + 86400)
     - سطر 410: استبدل التوقيع بالقيمة الجديدة المحسوبة مسبقًا (SHA-256 لـ `725671test-api-key175008640012345678-1234-1234-1234-123456789abc`):
       ```
       5fce0ef2f52104293d8fb9a8b06c26786fb6e3408f291c6a99579397e466923e
       ```
       (تحقق مسبق: التوقيع الحالي `38cecc0d...` يطابق نفس الصيغة مع expire=1750003600 — القيمة الجديدة أعلاه مبنية بنفس الخوارزمية `sha256Hex(libraryId + apiKey + expire + videoId)` من `_shared/bunny.ts` سطر 114-121.)
- **التحقق (Verification):** `deno test supabase/functions/create-video-upload-session` (33 اختبارًا — الـ vectors المحدثة تمر) — هذا يثبت أن التوقيع الجديد صحيح حسابيًا.
- **مخاطر/تنبيهات:** لا توجد قيمة أخرى في المشروع تعتمد على `1750003600` (تحققت — الوحيدة في سطر 407). لا تغيّر `AuthorizationExpire` في الاختبارات دون تغيير التوقيع في نفس الخطوة (كلاهما مرتبط). لا تلمس `nowUnix` في الاختبار (سطر 76).

---

## القواعد العامة للتنفيذ (تنتقل كما هي إلى upload-fixer)
- بعد كل خطوة شغّل `npm run typecheck`، وبعد خطوات الواجهة `npm run test -- LessonAssetsPage`، وبعد خطوات الـ EF `deno test` للمجلد المتأثر.
- لا تضع comments جديدة في الكود إلا عند الضرورة (نمط المشروع: تعليقات وصفية موجزة فوق الدوال المساعدة الجديدة فقط).
- حافظ على رسائل الخطأ العربية الحالية (`VIDEO_ERROR_MESSAGES`/`PDF_ERROR_MESSAGES`) ولا تغيّر نصوصها.
- لا تغيّر سلوكًا خارج نطاق الخطأ المعالج في كل خطوة (لا RTL، لا تنسيق، لا إعادة هيكلة).
- أبقِ الاتفاقيات الحالية: `useCallback` للدوال المستخدمة في effects، `void` للـ promises المتعمدة، أسماء متغيرات camelCase، الاختبارات بنمط الملفات الموجودة.
- لا تعدّل `src/data/rpc.ts` إلا لإضافة الدالة الجديدة (خطوة 6) — لا تغيّر التواقيع الموجودة (`createVideoUploadSession`/`cancelVideoUploadSession`/`uploadPdf` تبقى كما هي).
- الترتيب إلزامي (1→8) لأن الخطوتين 3 و 4 تعدّلان نفس الملف، ولأن اختبارات الخطوة 1 و 2 و 5 تتشارك نفس ملف الاختبار.

## ملاحظات خارج نطاق الخطة (لا تُنفَّذ ضمن هذه الخطوات — من التقرير)
1. `upload-pdf` يردّ `expires_in: 60` (سطر 82) لكنه لا يمرر TTL إلى `createSignedUploadUrl` (سطر 391-393) — قيمة مضللة للصيانة؛ العميل يتجاهلها حاليًا.
2. لا يوجد تحقق من الحجم على الخادم لرفع الفيديو (حد 2GiB في الواجهة فقط) — عميل معدل يمكنه تجاوزه عبر TUS.
3. اختبار resume الحالي (`LessonAssetsPage.test.tsx` سطر 426-461) لا يحاكي سلوك خادم TUS — يُنصح باختبار وحدة يحاكي رفض HEAD على النقطة الأساسية (مرتبط بالخطوة 1).
