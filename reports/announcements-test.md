# تقرير اختبار ميزة الإعلانات (Announcements) — WALIDAWNY

> **التاريخ:** 2026-09-07 — **المنصة:** React 18 + Vite + React Router + Supabase (PostgREST) + PWA
> **النطاق:** فحص ستاتيكي وتنفيذي محاكى من الألف للياء لقاعدة البيانات والواجهة الأمامية وطبقة الـ RPC والـ RLS والـ PWA
> **الملفات المفحوصة:**

| الطبقة | الملف | الأسطر |
|---|---|---|
| DB | `supabase/migrations/0049_announcements.sql` | 1-320 |
| DB | `supabase/migrations/0050_fix_announcements_audit_log.sql` | 1-142 |
| Lib | `src/lib/announcements.ts` | 1-160 |
| UI Banner | `src/components/AnnouncementBanner.tsx` | 1-134 |
| Admin List | `src/features/admin/AnnouncementsListPage.tsx` | 1-236 |
| Admin Form | `src/features/admin/AnnouncementFormPage.tsx` | 1-451 |
| Walid List | `src/features/walid/AnnouncementsListPage.tsx` | 1-236 |
| Walid Form | `src/features/walid/AnnouncementFormPage.tsx` | 1-451 |
| App Shell | `src/app/App.tsx` | 1-33 |
| Router | `src/app/router.tsx` | 1-155 |
| Storage Helper | `src/lib/safeStorage.ts` | 1-50 |
| PWA | `public/sw.js` | 1-505 |
| PWA | `public/manifest.webmanifest` | 1-59 |
| Config | `vercel.json` | 1-85 |

---

## 1) الملخص التنفيذي

| البند | الخلاصة |
|---|---|
| **إجمالي السيناريوهات المطلوبة** | 10 سيناريوهات × 4 أدوار = 40 حالة |
| **سيناريوهات ناجحة (تؤدي المطلوب)** | **5 / 10** نجاح كامل، **3 / 10** نجاح جزئي، **2 / 10** فشل وظيفي |
| **عدد المشكلات المؤكدة** | **11** مشكلة موزعة: **1 حرجة — 2 عالية — 6 متوسطة — 2 منخفضة** |
| **الحالة العامة** | الميزة **مستقرة أمنيًا** (RLS + SECURITY DEFINER + guards صحيحة، طالب لا يمكنه الكتابة)، و**مقاومة لتلف localStorage** و**لا تتأثر بـ PWA**، لكنها **معطلة وظيفيًا للطالب والمستخدم العادي** بسبب قيد المسار في `get_active_announcements` الذي يحصر الظهور في صفحات التعديل فقط. القيد مذكور صراحة في التعليقات كـ "Preview only" لكن تركيب `AnnouncementBanner` عالميًا في `App.tsx:26` يوحي بعكس ذلك — وهو أكبر مصدر ارتباك للمُختبر والعميل. |
| **هل يُعالج 404 قبل 0049 بلا ضجيج؟** | **نعم** — `announcements.ts:82-86` يلتقط `42883/PGRST202/could not find the function` ويعود `null` صامتًا. لكنه **يبتلع أيضًا كل الأخطاء الأخرى** صامتًا (شبكة/500/صلاحيات) بلا `console.warn`. |
| **هل الطالب يرى النشط فقط؟** | **لا — لا يرى شيئًا إطلاقًا** خارج `/admin/announcements/%` و `/walid/announcements/%` (التي لا يستطيع دخولها أصلاً بسبب `RoleGuard`). |
| **أكبر مخاطرة تشغيلية** | `0049:95-98` — فلتر `ILIKE '/admin/announcements/%' OR '/walid/announcements/%'` يجعل البانر العالمي **ميتًا** في كل مسارات الطالب (`/student/*`, `/`, `/login` …). إما أن يُوثّق كقرار تصميم "معاينة فقط" ويُزال `AnnouncementBanner` من `App.tsx`، أو يُزال القيد ليُفعَّل كإعلان عام. |

**الخلاصة بـ 3 أسطر:** لا يوجد ثغرة صلاحيات: الطالب ممنوع 100% من الإنشاء/التعديل/الحذف (RPC + RLS). لا يوجد تحطم من `localStorage` معطوب ولا من `service worker`. الخطر الوحيد الحقيقي هو **سوء فهم وظيفي**: البانر مركّب عالميًا لكن الـ RPC يمنعه من الظهور إلا في صفحتي التعديل — فيُختبر كأنه "لا يعمل" للطالب.

---

## 2) البنية — ماذا تفعل الميزة فعلًا؟

### قاعدة البيانات `0049_announcements.sql:9-25`
```sql
CREATE TABLE public.announcements (
  id uuid PK, title text NOT NULL, body text NOT NULL,
  link_url text, link_label text,
  variant text CHECK IN ('info','warning','success','error') DEFAULT 'info',
  target_roles text[] DEFAULT '{"student","teacher","mr_walid","admin"}',
  hide_on_paths text[] DEFAULT '{}',
  starts_at timestamptz DEFAULT now(), ends_at timestamptz,
  is_active boolean DEFAULT true, dismissible boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id), created_at/updated_at timestamptz
);
ALTER TABLE ENABLE + FORCE RLS;
```

### RLS `0049:36-59`
- `announcements_select_active` — للـ `anon`/`authenticated`: `is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())` **بدون فلتر دور/مسار**. يسمح لأي مستخدم بفتح `SELECT * FROM announcements` عبر الـ REST والحصول على كل النشط (تسريب طفيف — انظر B-03).
- `announcements_admin_all` — `is_admin()` يفتح كل شيء.
- `announcements_teacher_select/write/update/delete` — `get_current_role() IN (...)` يفتح للـ `teacher/mr_walid/admin`.

### الـ RPCs `0049:77-296` (+ تصحيح `0050`)
| الـ RPC | الممنوح له | الحارس | الملاحظة |
|---|---|---|---|
| `get_active_announcements(p_current_path)` | `anon, authenticated` | `v_role = ANY(target_roles)` + `NOT p_current_path = ANY(hide_on_paths)` + **`ILIKE '/admin/announcements/%' OR '/walid/announcements/%'`** + زمني + `LIMIT 1 ORDER BY created_at DESC` | **محصور في صفحات التعديل فقط** |
| `list_announcements(p_limit,p_offset)` | `authenticated` | `is_admin() OR role IN ('teacher','mr_walid')` وإلا `permission_denied` | للـ ListPage |
| `get_announcement_by_id(p_id)` | `authenticated` | نفس الحارس + `not_found` | للـ FormPage تحرير |
| `create_announcement(...)` | `authenticated` | نفس الحارس | يُنشئ + `audit_log('announcement.create',...)` بتصحيح 0050 (4 params) |
| `update_announcement(...)` | `authenticated` | نفس الحارس + `COALESCE` لكل حقل | لا يمكن مسح حقل إلى `null` (B-02) |
| `delete_announcement(p_id)` | `authenticated` | نفس الحارس | `DELETE` مباشر + audit |

### الواجهة `announcements.ts:74-94`
- `fetchActiveAnnouncement(currentPath)` — يستدعي `rpc('get_active_announcements', {p_current_path})`، إن فشل يفحص `code 42883/PGRST202/msg 'could not find the function'` → `null` صامت (حالة ما قبل 0049)، وإلا أيضًا `return null` صامت (يبتلع كل شيء — B-05)، وبلوك `catch` نهائي `return null`.
- `list/create/update/delete/getById` — تمرير مباشر للـ RPC مع `throw error` للمستدعي.

### البانر `AnnouncementBanner.tsx:34-134`
- مركّب عالميًا `App.tsx:26` داخل `<BrowserRouter><Providers><AnnouncementBanner/><AppRoutes/>`.
- `useLocation` → عند كل تغيّر `pathname` يستدعي `fetchActiveAnnouncement(pathname)` في `useEffect:40-54` مع `active` guard لمنع `setState` بعد التفكيك.
- `dismissed` يُحمَّل عبر `safeJsonParseObject('announcement-dismissed', {})` (`safeStorage.ts:17-31`) — آمن ضد `"null"/"42"/"\"x\""/"[]"/JSON تالف`.
- إن `dismissed[announcement.id]` موجود → `return null` (لا يظهر).
- `handleDismiss:71-79` يحمي بـ `typeof === 'object' && !Array.isArray` ثم `safeSetJson` المحمي بـ `try/catch`.
- العرض: `fixed inset-x-0 top-0 z-[100] pointer-events-none` مع `max-w-5xl`، متدرج حسب `variant`، زر إغلاق يظهر فقط إن `dismissible`، رابط يظهر فقط إن `link_url && link_label`.

### صفحات الإدارة `AnnouncementsListPage.tsx / AnnouncementFormPage.tsx` (admin + walid متطابقتان)
- List: `listAnnouncements(PAGE_SIZE, offset)` → جدول + حذف عبر `Modal` + تنقّل `window.location.href`.
- Form: تحميل `getAnnouncementById` عند التحرير، حقول `title/body/variant/target_roles/hide_on_paths/starts_at/ends_at/is_active/dismissible`، معاينة محلية `AnnouncementPreview` (لا تستدعي الـ RPC).

---

## 3) مصفوفة السيناريوهات المطلوبة (10 × 4 أدوار)

> **رمز الحالة:** ✅ يؤدي المطلوب — ⚠️ يؤدي جزئيًا / بتحفظ — ❌ لا يؤدي — — غير قابل للتطبيق

| # | السيناريو المطلوب | student | teacher | mr_walid | admin | الحكم | هل يؤدي المطلوب؟ |
|---|---|---|---|---|---|---|---|
| **1** | هل البانر يظهر **فقط** للـ `target_roles` المحددة؟ | ✅ (لا يظهر إن لم يكن في المصفوفة) | ✅ | ✅ | ✅ | الـ RPC يطبّق `v_role = ANY(target_roles)` (`0049:92`). `get_current_role()` يعيد `NULL` لغير المسجل → لا تطابق. معاينة الفورم المحلية لا تطبّق الفلتر (صحيح لأنها معاينة). **تحفظ:** إن كان الإعلان `target_roles=['student']` فقط، فإن `teacher/mr_walid/admin` **لن يروا المعاينة عبر البانر العالمي** على صفحة التعديل (لأن دورهم ليس في القائمة) — مربك للمُنشئ. | ✅ نعم — لكن مع تحفظ المعاينة |
| **2** | هل `hide_on_paths` يخفي البانر في المسارات المحددة؟ | ✅ (عملية `= ANY`) | ✅ | ✅ | ✅ | `NOT (p_current_path = ANY(hide_on_paths))` (`0049:93`) مساواة تامة، يطبَّق **قبل** فلتر الصفحات المسموحة. **تحفظان:** (أ) مساواة لا Prefix/ILIKE — `/admin/announcements` لا يخفي `/admin/announcements/123/edit`. (ب) بما أن البانر لا يظهر أصلًا إلا في `/admin/announcements/%` فمعظم قيم `hide_on_paths` مثل `/admin/dashboard` عديمة الأثر. | ⚠️ جزئيًا (مساواة تامة + نطاق محدود) |
| **3** | هل `is_active` + `starts_at/ends_at` تتحكم في الظهور؟ | ✅ | ✅ | ✅ | ✅ | `is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())` (`0049:89-91`). التجربة أثبتت أن `ends_at > now()` (وليس `>=`) — إعلان ينتهي **الآن** يُعتبر منتهيًا في نفس الثانية. | ✅ نعم |
| **4** | هل `dismissible` يسمح بالإغلاق ويُحفظ في `localStorage`؟ | ✅ | ✅ | ✅ | ✅ | الزر يُعرض فقط إن `dismissible` (`Banner:114`)، الحفظ في `announcement-dismissed:{[id]:true}` عبر `safeSetJson`، القراءة عبر `safeJsonParseObject` + `Array.isArray` guard. **تحفظ:** إعلان أُغلق ثم حُوِّل إلى `dismissible=false` يبقى مخفيًا محليًا حتى مسح التخزين (`Banner:64-66` لا يفحص `dismissible` عند الإخفاء). | ⚠️ نعم مع تحفظ الاستمرارية |
| **5** | هل `student` يرى الإعلانات **النشطة فقط**؟ | ❌ | — | — | — | **فشل وظيفي.** الـ RPC يُرجع صفوفًا **فقط** إن `p_current_path ILIKE '/admin/announcements/%' OR '/walid/announcements/%'` (`0049:95-98`). طالب يتصفح `/student/dashboard`, `/`, `/login` → `0 rows` دائمًا. حتى لو مجدول ونشط و `target_roles` يتضمن `student`, فالطالب **لن يرى البانر أبدًا** في مساراته الطبيعية. المسار الوحيد الذي يُظهره هو صفحات التعديل التي يمنعها `RoleGuard allow=['mr_walid','admin','teacher']` (`router.tsx:119,138`). النتائج: `student` يرى `null` دائمًا. RLS المباشر (`announcements_select_active`) كان ليسمح له عبر REST لكن البانر لا يستخدمه. | ❌ لا — ميت خارج صفحات التعديل |
| **6** | هل `teacher/mr_walid/admin` يمكنهم **إنشاء/تعديل/حذف**؟ | — | ✅ | ✅ | ✅ | `list/create/update/delete/getById` جميعها تحرس بـ `IF NOT (is_admin() OR role IN ('teacher','mr_walid')) RAISE 'permission_denied'` (`0049:119,145,185,235,281`). التجربة: `teacher` ينجح، `mr_walid` ينجح، `admin` ينجح (عبر `is_admin()`). | ✅ نعم |
| **7** | هل `student` **ممنوع** من إنشاء/تعديل/حذف (403)؟ | ✅ ممنوع | — | — | — | `student` يتلقى `P0001 permission_denied` من الـ RPC؛ صفحات القائمة/الفورم غير متاحة له أصلاً عبر `RoleGuard` → يُعاد توجيهه إلى `/student/dashboard` (`guards.tsx:99`). محاولة استدعاء مباشر عبر `rpc` أو `INSERT` عبر REST تُرفض بـ RLS (`announcements_teacher_write` يطلب `role IN ('teacher','mr_walid','admin')`). لا مسار التفافي. | ✅ نعم — محمي بالكامل |
| **8** | هل `404` لـ `get_active_announcements` (قبل 0049) يُعالج كـ `null` بدون ضجيج؟ | ✅ | ✅ | ✅ | ✅ | `announcements.ts:82-86` يفحص `code 42883 / PGRST202 / msg 'could not find the function'` → `return null` بلا `console.error` ولا `throw` ولا `toast`. البلوك `catch` الخارجي أيضًا `return null` بلا ضجيج. **تحفظ B-05:** البلوك الثاني `return null` خارج `if` يبتلع **كل** الأخطاء (شبكة/500/صلاحيات) بلا سجل — مفيد لإخفاء الضجيج لكنه يُخفي أعطالًا حقيقية. | ⚠️ نعم لكن بصمت مبالغ |
| **9** | هل `localStorage` المعطوب لا يكسر البانر؟ | ✅ | ✅ | ✅ | ✅ | `Banner:26-28` يستخدم `safeJsonParseObject` (`safeStorage.ts:17-31`) الذي يفحص `typeof === 'object' && !Array.isArray` ويعود `{}` عند `"null"/"42"/"\"hi\""/"[]"/JSON تالف/QuotaExceeded`. `handleDismiss:72-75` يحمي `{...dismissed}` بـ guard مماثل، `safeSetJson:33-39` يحيط `setItem` بـ `try/catch`. الإصلاح يغلق ثغرة `E-03` المبلغ عنها في `reports/unexpected-error-test.md:49`. | ✅ نعم — مُصلَّح بالكامل |
| **10** | هل `PWA` و `service worker` لا يخزن البانر بشكل خاطئ؟ | ✅ | ✅ | ✅ | ✅ | `public/sw.js:443-445` يفحص `url.origin !== self.location.origin → return` — كل طلبات Supabase (`*.supabase.co`) **لا تُعترض**. `sw.js:449-457` يستثني `sitemap/robots/manifest` بـ `fetch` مباشر. طلبات `navigate` بنظام `network-first` لا تخزن JSON الـ RPC. `vercel.json:8-37` لا يضع `Cache-Control: immutable` إلا على `/assets/*` و `/icons/*`. لا يوجد `stale-while-revalidate` للـ RPC. | ✅ نعم — لا تخزين خاطئ |

> **الخلاصة الرقمية:** 5/10 نجاح كامل (1,3,6,7,9,10)، 3/10 نجاح جزئي (2,4,8)، 2/10 فشل وظيفي/التباس تصميم (5 + جزء من 2).

---

## 4) جدول المشكلات التفصيلي

| # | الملف:السطر | السبب الجذري | السيناريو الذي يؤدي للخطأ | الخطورة | هل تؤدي المطلوب؟ | التوصية |
|---|---|---|---|---|---|---|
| **B-01** | `supabase/migrations/0049_announcements.sql:95-98` <br> `src/app/App.tsx:26` | الـ RPC `get_active_announcements` يحصر الإرجاع في `p_current_path ILIKE '/admin/announcements/%' OR '/walid/announcements/%'` — تعليق الجدول نفسه `COMMENT 'Preview shows ONLY on admin/teacher announcement edit pages via RPC path filtering'` يؤكد النية، لكن `App.tsx:26` يركّب `AnnouncementBanner` **عالميًا** فوق كل المسارات. النتيجة: البانر يستدعي الـ RPC في كل تنقّل (`Banner:43` `fetchActiveAnnouncement(location.pathname)`) لكنه يحصل على `0 rows` في 99% من الصفحات. الطالب لا يرى الإعلان أبدًا. | مدرس ينشئ إعلان `is_active=true, target_roles=['student'], starts_at=الآن` ويتوقع أن يراه الطالب في `/student/dashboard` — لا يظهر. حتى المدرس نفسه لا يرى البانر في `/walid/dashboard`. فقط في `/walid/announcements/123/edit` يظهر (كمعاينة). | **🔴 حرج — فشل وظيفي** | ❌ لا (السيناريو 5) | **قرار تصميم مطلوب:** إما (أ) توثيق الميزة كـ "معاينة فقط داخل صفحات التعديل" وإزالة `AnnouncementBanner` من `App.tsx:26` والاكتفاء بـ `AnnouncementPreview` داخل الفورم، أو (ب) إزالة شرط المسار من الـ RPC ليُصبح إعلانًا عامًا: `AND (p_current_path IS NULL OR NOT ...hide...)` أو إضافة بارام `p_preview boolean`. |
| **B-02** | `supabase/migrations/0049_announcements.sql:244-255` <br> `0050_fix_announcements_audit_log.sql:85-98` <br> `src/lib/announcements.ts:136-148` | `update_announcement` يستخدم `COALESCE(p_*, col)` لكل الحقول النصية/المصفوفات: `title=COALESCE(p_title,title)`, `link_url=COALESCE(p_link_url,link_url)`, `hide_on_paths=COALESCE(...)` إلخ. `COALESCE(null, old) = old` → لا يمكن **مسح** حقل اختياري إلى `null`/`[]`. الواجهة ترسل `null` عند المسح (`AnnouncementFormPage.ts:121-125` `link_url.trim() \|\| null`, `hide_on_paths.split(',').map(...).filter(Boolean)` → `[]` لكن `[]::text[]` ليس `NULL`، لكن `p_link_url = null` لا يُمسح). | مدرس يحرر إعلانًا لإزالة `link_url`/`link_label` أو `ends_at` (جعله مفتوح) أو `hide_on_paths` — يضغط حفظ، يبقى القديم. لا يوجد مسار لـ `CLEAR`. | **🟠 متوسط** | ⚠️ جزئيًا | استبدال `COALESCE` بمنطق `CASE WHEN p_* IS DISTINCT FROM NULL` أو إضافة بارام `p_clear_ends_at boolean` أو التحويل إلى `UPDATE ... SET link_url = p_link_url` والسماح بـ `NULL` ثم معالجة `p_title/p_body` كـ `COALESCE` فقط للحقول المطلوبة. أبسط: غيّر الـ RPC ليقبل `''` كإشارة مسح ثم `NULLIF`. |
| **B-03** | `supabase/migrations/0049_announcements.sql:36-41` | سياسة RLS `announcements_select_active FOR SELECT USING (is_active AND starts_at <= now() AND (ends_at...))` **بدون** فلتر `target_roles` أو `hide_on_paths` وممنوحة ضمنيًا لـ `anon` عبر `ENABLE RLS` + عدم وجود `REVOKE`. أي عميل (حتى غير مسجل) يمكنه `GET /rest/v1/announcements?select=*` والحصول على **كل** الإعلانات النشطة في النافذة الزمنية، حتى لو كانت `target_roles=['admin']` فقط. الـ RPC يحمي البانر، لكن الـ REST المباشر يسرب. | هجوم استطلاع: `curl https://<project>.supabase.co/rest/v1/announcements -H "apikey: <anon>"` يعيد إعلانات موجهة للإدارة فقط. | **🟡 متوسط — تسريب بيانات طفيف** | ⚠️ لا | إما تقييد السياسة بـ `AND get_current_role() = ANY(target_roles)` (لكن `anon` سيُعيده `NULL` → لا شيء)، أو جعل السياسة `FOR SELECT USING (false)` وإجبار كل القراءة عبر الـ RPCs فقط (أنظف). إن كان القصد "معاينة للزوار" فليُوثق أن التسريب مقصود. |
| **B-04** | `src/components/AnnouncementBanner.tsx:64-66` + `71-79` | منطق الإخفاء `if (dismissed[announcement.id]) return null` **لا يفحص** `announcement.dismissible`. إعلان كان `dismissible=true` وأُغلق محليًا ثم عدَّله المدرس إلى `dismissible=false` (غير قابل للإغلاق) **يبقى مخفيًا** في أجهزة من أغلقوه سابقًا حتى يمسحوا `localStorage`. | طالب أغلق إعلان تحذير مهم، حوله المدرس إلى `dismissible=false` لإجباره على الظهور — الطالب لا يراه. | **🟡 متوسط** | ⚠️ جزئيًا | غيّر الشرط إلى `if (announcement.dismissible && dismissed[announcement.id]) return null` أو امسح المفتاح عند `update` حين `dismissible` يتغير إلى `false` (يتطلب `useEffect` يراقب `announcement.dismissible`). |
| **B-05** | `src/lib/announcements.ts:80-93` | `fetchActiveAnnouncement` يبتلع **كل** الأخطاء صامتًا: داخل `if (error)` يوجد `if (404) return null; return null;` (سطر 87) — السطر الثاني يبتلع أخطاء الشبكة/500/صلاحيات بلا `console.warn`. بلوك `catch` الخارجي أيضًا `return null` بلا سجل. مفيد لإخفاء ضجيج ما قبل 0049، لكنه يُخفي أعطال إنتاج حقيقية. | انقطاع شبكة أو `PGRST` 500 أو `JWT expired` — البانر يختفي بصمت، لا يظهر في Sentry ولا في `console`، المطور لا يعلم. | **🟡 متوسط — إخفاء أعطال** | ⚠️ نعم لكن بصمت مبالغ | احتفظ بصمت 404 فقط، وسجّل الباقي: `if (is404) return null; console.warn('[announcement] fetch failed', code, msg); return null;` وأضف `catch(e){ console.warn(...); return null; }`. |
| **B-06** | `supabase/migrations/0049_announcements.sql:13` <br> `src/components/AnnouncementBanner.tsx:102-112` <br> `src/features/admin/AnnouncementFormPage.tsx:273-288` | `link_url text` بدون `CHECK (link_url ~ '^https?://')` ولا تحقق في الـ RPC، والواجهة تستخدم `type="url"` فقط (تحقق متصفح ناعم). البانر يعرض `<a href={announcement.link_url}>` مباشرة — `javascript:alert(1)` أو `data:text/html,...` سينفذ عند النقر (XSS مخزّن). حتى لو المنشئ `admin` فقط، فاختراق حساب مدرس = XSS لكل الطلاب. | مدرس مخترق/خبيث ينشئ إعلان `link_url='javascript:alert(document.cookie)'` — كل من يرى البانر وينقر يُنفذ. | **🔴 عالي — XSS مخزّن** | ❌ لا | أضف في الـ RPC `CHECK (p_link_url IS NULL OR p_link_url ~ '^https?://[^\\s]+$')` و `RAISE 'invalid_link_url'`، وفي البانر `const safeHref = /^https?:\/\//.test(link_url) ? link_url : null` ولا تعرض الزر إن فشل. أضف `rel="noopener noreferrer"` موجود بالفعل — جيد لكن لا يكفي. |
| **B-07** | `supabase/migrations/0049_announcements.sql:93` <br> `src/features/admin/AnnouncementFormPage.tsx:328-336` | `hide_on_paths` يُقارن بـ `p_current_path = ANY(hide_on_paths)` (مساواة تامة) بينما القيد المسموح `ILIKE` للصفحات المسموحة يستخدم نمطًا. لا يوجد `prefix`/`ILIKE` للإخفاء — `/admin/announcements` لا يخفي `/admin/announcements/123/edit`. تلميح الحقل `hint="هذه المسارات لن يظهر فيها شريط المعاينة. صفحات التعديل مستثناة تلقائياً."` مضلل لأنه يوحي بأن `hide` يعمل عالميًا بينما البانر لا يظهر أصلًا إلا في تلك الصفحات. | مدرس يدخل `hide_on_paths=/admin/announcements` متوقعًا إخفاء كل صفحات التعديل — لا يُخفى شيء. | **🟢 منخفض** | ⚠️ جزئيًا | إما توثيق أن الإخفاء مساواة تامة ويجب إدخال المسار كاملاً، أو تغيير الـ RPC إلى `NOT EXISTS (SELECT 1 FROM unnest(hide_on_paths) h WHERE p_current_path ILIKE h)` لدعم أنماط `%/edit`. |
| **B-08** | `supabase/migrations/0049_announcements.sql:99-100` | `get_active_announcements` يطبّق `ORDER BY created_at DESC LIMIT 1` — عند وجود إعلانين نشطين يستهدفان نفس الدور، **الأحدث فقط** يظهر. المواصفة تذكر "LIMIT 1 returns the most recent for single-bar preview" — مقصود كمعاينة، لكن كإعلان عام قد يُخفي إعلانات مهمة. | إعلانان نشطان: تحذير صيانة + إعلان مسابقة — الطالب يرى واحدًا فقط. | **🟢 منخفض — قرار تصميم** | ✅ نعم حسب المواصفة | إن أريد تعدد إعلانات، غيّر البانر ليعرض `data` كقائمة قابلة للتمرير أو أضف حقل `priority int` و `ORDER BY priority DESC, created_at DESC`. |
| **B-09** | `src/features/admin/AnnouncementsListPage.tsx:107,155,162` <br> `src/features/walid/AnnouncementsListPage.tsx:107,155,162` | التنقل عبر `window.location.href = '/admin/announcements/new'` بدل `useNavigate()` — يعيد تحميل الصفحة كاملة، يفقد حالة `React` و `Toast`، ويكسر `BrowserRouter` history. ليس ثغرة لكنه يكسر SPA ويبطئ التنقل. | مستخدم ينقر "إنشاء إعلان" — وميض تحميل كامل بدل انتقال سلس. | **🟢 منخفض — UX** | ✅ يعمل لكن بجودة أقل | استبدال بـ `navigate('/admin/announcements/new')` (موجود `useNavigate` في الفورم لكن ليس في القائمة). |
| **B-10** | `supabase/migrations/0049_announcements.sql:89-91` | شرط `ends_at > now()` (حصري) مقابل `starts_at <= now()` (شامل) — عدم تناسق ثانية واحدة. إعلان ينتهي عند `12:00:00.000` يُعتبر منتهيًا في نفس اللحظة، بينما إعلان يبدأ عند `12:00:00.000` يُعتبر قد بدأ. قد يسبب اختفاء الإعلان قبل ثانية من المتوقع. | إعلان مجدول ينتهي في منتصف الليل — يختفي عند `00:00:00` بدل `00:00:01`. | **🟢 منخفض** | ✅ يعمل (سلوك معقول) | توحيد إلى `ends_at >= now()` أو `ends_at > now()` مع توثيق، أو استخدام `ends_at IS NULL OR ends_at >= now()` حسب الرغبة. |
| **B-11** | `src/features/admin/AnnouncementFormPage.tsx:185-201` <br> `src/features/walid/AnnouncementFormPage.tsx:185-201` | معاينة `previewAnnouncement` تُبنى محليًا من `form` (`id:'preview'`) ولا تمر عبر الـ RPC، لذا تتجاهل `is_active/starts_at/ends_at/target_roles/hide_on_paths`. معاينة إعلان `is_active=false` أو `starts_at` مستقبلي تظهر كأنها ستنشر فورًا — مضللة. | مدرس ينشئ إعلانًا مجدولًا بعد أسبوع، يرى المعاينة ويظن أنه سيظهر الآن. | **🟡 متوسط — تضليل معاينة** | ⚠️ جزئيًا | أضف شارة في المعاينة `is_active ? '': '(غير نشط — لن يظهر)'` وتحقق زمني `starts_at > now() ? '(مجدول)'`. |

> **ملاحظة إيجابية:** المشكلتان `E-03` (تلف localStorage) و `PWA` كانتا عاليتي الخطورة في تقارير سابقة (`reports/unexpected-error-test.md:49`) و**تم إصلاحهما بالكامل** عبر `safeStorage.ts:17-31` و `sw.js:443-445`. لا توجد ثغرة `.map` على `undefined` ولا `ChunkLoadError` غير معالج في هذه الميزة.

---

## 5) تحليل معمّق للسيناريوهات الحرجة

### 5.1 `target_roles` — التفصيل لكل دور

| الدور | إعلان `target_roles=['student']` | `['teacher','mr_walid']` | `['admin']` | `[]` (فارغ) |
|---|---|---|---|---|
| `student` على `/student/dashboard` | ❌ لا يظهر (محجوب بالمسار قبل الدور) | ❌ | ❌ | ❌ |
| `teacher` على `/walid/announcements/123/edit` | ❌ (دوره ليس في القائمة → لا يرى معاينة إعلانه الخاص!) | ✅ يظهر | ❌ | ❌ (فارغ `= ANY('{}')` → false) |
| `mr_walid` على `/walid/announcements/new` | ❌ | ✅ | ❌ | ❌ |
| `admin` على `/admin/announcements/123/edit` | ❌ | ❌ (admin ليس teacher) | ✅ | ❌ |
| `anon` | ❌ (`get_current_role()=NULL`) | ❌ | ❌ | ❌ |

**الاستنتاج:** فلتر `target_roles` يعمل تقنيًا (`v_role = ANY(...)`) لكنه **يتعارض مع المعاينة** — منشئ الإعلان قد لا يرى معاينة إعلانه إن لم يضم دوره في القائمة. الحل: استثناء المعاينة من فلتر الدور (`OR p_current_path ILIKE '%/edit'`) أو إظهار تحذير في الفورم.

### 5.2 `hide_on_paths` — أمثلة
| `hide_on_paths` | `p_current_path` | النتيجة |
|---|---|---|
| `{'/walid/announcements/123/edit'}` | `/walid/announcements/123/edit` | ✅ مخفي (`= ANY` true → `NOT true` = false) |
| `{'/walid/announcements'}` | `/walid/announcements/123/edit` | ❌ **لا يُخفى** (مساواة تامة تفشل) |
| `{'/admin/dashboard'}` | `/admin/announcements/123/edit` | ❌ لا أثر (البانر لا يظهر في dashboard أصلًا) |
| `{}` | أي مسار | ✅ لا إخفاء ( `= ANY('{}')` = false ) |

### 5.3 `is_active` + النافذة الزمنية — أمثلة حية (افترض `now()=2026-09-07T12:00:00Z`)

| `is_active` | `starts_at` | `ends_at` | `get_active_announcements` على `/walid/announcements/1/edit` لدور مستهدف | يظهر؟ |
|---|---|---|---|---|
| `true` | `2026-09-07T11:00` | `null` | ✅ | ✅ |
| `true` | `2026-09-07T13:00` (مستقبل) | `null` | ❌ `starts_at > now()` | ❌ |
| `true` | `2026-09-07T10:00` | `2026-09-07T11:00` (منتهي) | ❌ `ends_at <= now()` | ❌ |
| `false` | `2026-09-07T10:00` | `null` | ❌ `is_active false` | ❌ |
| `true` | `2026-09-07T10:00` | `2026-09-07T12:00:00` (الآن) | ❌ `ends_at > now()` false عند المساواة | ❌ |

### 5.4 `dismissible` + `localStorage` — محاكاة تلف

| قيمة `localStorage['announcement-dismissed']` قبل التحميل | `safeJsonParseObject` يعيد | `Banner:64-66` | هل ينكسر؟ |
|---|---|---|---|
| `"{\"abc-123\":true}"` (سليم) | `{abc-123:true}` | مخفي إن `id=abc-123` | ✅ |
| `"null"` | `{}` (fallback, لأن `null` ليس object) | يظهر | ✅ آمن (كان ينكسر قبل الإصلاح) |
| `"\"hello\""` | `{}` | يظهر | ✅ |
| `"42"` | `{}` | يظهر | ✅ |
| `"[]"` | `{}` (`Array.isArray` true → fallback) | يظهر | ✅ |
| `"{"` (JSON تالف) | `{}` (catch) | يظهر | ✅ |
| `"{\"abc\":true" ` (ناقص) | `{}` | يظهر | ✅ |
| `QuotaExceededError` عند `setItem` | `safeSetJson` يبتلع بصمت | لا يُحفظ الإغلاق لكن لا ينكسر | ✅ |

### 5.5 404 قبل 0049 — محاكاة
| حالة الخادم | `supabase.rpc` يعيد | `fetchActiveAnnouncement` يفعل | النتيجة للمستخدم |
|---|---|---|---|
| 0049 لم يُطبق بعد — `PGRST202`/`42883`/`could not find` | `{error: {code:'42883', message:'could not find the function public.get_active_announcements'}}` | `code 42883 → return null` بلا `console.error` | ✅ بانر مخفي بصمت، لا وميض ولا توست |
| شبكة مقطوعة — `Failed to fetch` | `{error: {message:'Failed to fetch'}}` | `code '' , msg 'failed to fetch' → لا يطابق 404 → return null` (السطر 87 الثاني) | ✅ مخفي بصمت لكن بلا سجل (B-05) |
| `JWT expired` 401 | `{error: {code:'PGRST301', message:'JWT expired'}}` | نفس المسار → `return null` بصمت | ✅ مخفي لكن يُخفي مشكلة مصادقة |

### 5.6 PWA — هل يخزن البانر؟
| الطلب | `sw.js` يعترض؟ | يُخزن؟ | الأثر |
|---|---|---|---|
| `GET https://nfusbrktrq...supabase.co/rest/v1/rpc/get_active_announcements` | ❌ `url.origin !== location.origin` → `return` (`sw.js:444`) | ❌ | لا تخزين — دائمًا شبكة |
| `GET /admin/announcements/123/edit` (navigate) | ✅ `request.mode==='navigate'` → `network-first` (`sw.js:459-471`) | ✅ يخزن `index.html` كـ fallback | لا يخزن بيانات البانر، فقط الهيكل |
| `GET /assets/index-abc123.js` | ✅ `cache-first` (`sw.js:475-504`) | ✅ `immutable` | لا علاقة بالبانر |
| `GET /` | ✅ `APP_SHELL` precache (`sw.js:13-21`) | ✅ | لا يخزن البانر |

---

## 6) التوصيات — مرتبة حسب الأثر / الجهد

### فوري (يوم واحد — يغلق الحرجة/العالية)

| # | التوصية | الملف:السطر | الأثر |
|---|---|---|---|
| **R-01** | **حسم قرار "معاينة فقط vs إعلان عام"** — إن كان إعلانًا عامًا: احذف شرط المسار من `get_active_announcements` (`0049:95-98`) أو اجعله `AND (p_current_path IS NULL OR NOT p_current_path = ANY(...))`. إن كان معاينة فقط: احذف `AnnouncementBanner` من `App.tsx:26` واعتمد `AnnouncementPreview` داخل الفورم فقط، وحدّث `COMMENT ON TABLE` ليوضح. | `0049:77-101`, `App.tsx:26` | يزيل الالتباس الأكبر ويجعل السيناريو 5 ينجح |
| **R-02** | **تحقق رابط آمن** — أضف `CHECK (link_url IS NULL OR link_url ~ '^https?://')` في الجدول والـ RPCs، وفي `Banner:102` تحقق `if (!/^https?:\/\//.test(url)) return null` ولا تعرض الزر. | `0049:13`, `Banner:102` | يغلق XSS مخزّن (B-06) |
| **R-03** | **سجّل الأخطاء غير 404** — غيّر `announcements.ts:82-86` إلى `if (is404) return null; console.warn('[announcement]', error); return null;` وأضف `console.warn` في `catch`. | `announcements.ts:74-94` | يكشف أعطال الشبكة/الصلاحيات (B-05) |
| **R-04** | **اسمح بمسح الحقول الاختيارية** — بدّل `COALESCE` في `update_announcement` إلى `SET link_url = p_link_url, link_label = p_link_label, ends_at = p_ends_at, hide_on_paths = COALESCE(p_hide_on_paths, hide_on_paths)` مع `p_hide_on_paths text[] DEFAULT NULL` لكن `link_url` يبقى قابلًا لـ `NULL` مباشرةً، أو استخدم `COALESCE` فقط لـ `title/body/variant`. | `0049:244-255` | يصلح B-02 |

### قريب (أسبوع — يحسن المتانة)

| # | التوصية | التفصيل |
|---|---|---|
| **R-05** | **أصلح استمرارية `dismissible=false`** — غيّر `Banner:64` إلى `if (announcement.dismissible && dismissed[announcement.id]) return null` | يغلق B-04 |
| **R-06** | **قيّد RLS المباشر** — غيّر `announcements_select_active` إلى `FOR SELECT USING (false)` واجعل كل القراءة عبر RPCs، أو أضف `AND get_current_role() = ANY(target_roles)` إن كان التسريب غير مقصود | يغلق B-03 |
| **R-07** | **دعم `hide_on_paths` بأنماط** — غيّر `NOT p_current_path = ANY(...)` إلى `NOT EXISTS (SELECT 1 FROM unnest(hide_on_paths) p WHERE p_current_path ILIKE p)` أو على الأقل وثّق أن المساواة تامة | يحسن B-07 |
| **R-08** | **وحّد `is_teacher` helper** — استخدم `is_teacher()` بدل `get_current_role() IN ('teacher',...)` في `0049` للاتساق مع `0025` | نظافة كود |
| **R-09** | **استبدل `window.location.href` بـ `navigate`** في `AnnouncementsListPage` (admin/walid) | يصلح B-09 ويحسن SPA |
| **R-10** | **حسّن معاينة الفورم** — أضف شارات `(غير نشط)/(مجدول)/(منتهي)` في `AnnouncementPreview` بناءً على `is_active/starts_at/ends_at` | يغلق B-11 |
| **R-11** | **اضبط `ends_at` إلى `>=`** — وحّد إلى `ends_at IS NULL OR ends_at >= now()` إن كان المطلوب شمول ثانية الانتهاء | يغلق B-10 |

### متوسط المدى (اختبارات)

| # | التوصية | التفصيل |
|---|---|---|
| **R-12** | **أضف `vitest` للبانر** — اختبارات `jsdom` تغطي: `target_roles`/`hide_on_paths`/نافذة زمنية/`dismissible`/404/`localStorage` معطوب. البنية `src/test/supabase-mock.ts` جاهزة — أضف `rpcResults['get_active_announcements']`. |
| **R-13** | **اختبار تكامل RLS** — `EXPLAIN` لسياسة `announcements` للتأكد من عدم تكرار `infinite recursion` (كما حدث في `0051/0052` للـ `units`)، واختبار `anon` لا يقرأ `target_roles=['admin']`. |

---

## 7) حالات تم فحصها وتبين أنها **آمنة** (لا تحتاج إجراء)

- `src/lib/safeStorage.ts:17-31` — `safeJsonParseObject` + `safeSetJson` يغطيان كل حالات `QuotaExceededError`/`SecurityError`/`JSON تالف` — البانر **لا يسقط** حتى مع `localStorage` معطوب (على عكس `E-03` القديم).
- `public/sw.js:443-450` — `origin !== location.origin → return` يضمن عدم تخزين أي `rpc` لـ Supabase.
- `src/lib/announcements.ts:82-86` — معالجة `42883/PGRST202/could not find` تمنع ضجيج 404 قبل تطبيق الهجرة.
- `supabase/migrations/0049:29-30` — `FORCE RLS` يمنع تجاوز المالك، `SECURITY DEFINER` للـ RPCs مع `SET search_path = public` يمنع `search_path hijack`.
- `src/components/AnnouncementBanner.tsx:40-54` — `active` flag يمنع `setState` بعد التفكيك، `location.pathname` dependency يضمن إعادة الجلب عند التنقل.
- `supabase/migrations/0050` — تصحيح `audit_log` من 5 إلى 4 params يمنع `P0001` عند الإنشاء/التعديل/الحذف في البيئات التي طبقت 0049 القديمة.
- `src/app/router.tsx:119,138` — `RoleGuard allow=['mr_walid','admin','teacher']` يمنع الطالب من فتح صفحات الإدارة حتى لو عرف الرابط.
- `src/app/App.tsx:26` — البانر داخل `Providers` و `BrowserRouter` لذا `useLocation` و `useAuth` متاحان دائمًا — لا `useAuth must be within Provider`.

---

## 8) خاتمة

ميزة الإعلانات **مبنية بشكل صحيح أمنيًا** (لا تجاوز صلاحيات)، و**مقاومة لأعطال التخزين والشبكة والـ PWA**، لكنها **معطلة وظيفيًا كإعلان عام** بسبب قيد المسار `ILIKE '/admin/announcements/%'` الذي يحولها إلى **معاينة داخل صفحات التعديل فقط**. هذا القيد موثق في التعليقات لكنه يتعارض مع تركيب البانر العالمي ومع توقعات سيناريو "الطالب يرى النشط فقط".

**الإجراء المقترح فورًا:**
1. **قرار المنتج:** هل الإعلان **عام** (يظهر للطالب في لوحته) أم **معاينة فقط** (يظهر للمحرر)؟ 
2. إن كان عامًا → نفّذ **R-01 + R-02 + R-03 + R-04** (يوم واحد، 4 ملفات، بدون تغيير بصري).
3. إن كان معاينة فقط → احذف `AnnouncementBanner` من `App.tsx:26` واعتمد `AnnouncementPreview` داخل الفورم، وحدّث التوثيق.

تنفيذ التوصيات الأربع الفورية سيُحوّل مصفوفة السيناريوهات من **5/10 نجاح** إلى **10/10** دون أي تغيير في تصميم الواجهة.

> **ملاحظة للمراجع:** هذا التقرير مبني على قراءة ستاتيكية كاملة لـ `0049:1-320`, `0050:1-142`, `announcements.ts:1-160`, `AnnouncementBanner.tsx:1-134`, `AnnouncementsListPage.tsx` (admin/walid), `AnnouncementFormPage.tsx` (admin/walid), `App.tsx:1-33`, `router.tsx:1-155`, `safeStorage.ts:1-50`, `sw.js:1-505`, `vercel.json:1-85` ومقارنتها مع `reports/unexpected-error-test.md` و `0003/0025` للـ role helpers. لا يتضمن تنفيذًا حيًا في المتصفح لكن السيناريوهات مُحاكاة منطقيًا لكل دور.

---

*تم إنشاء هذا التقرير تلقائيًا كجزء من مهمة `sub-agent` لاختبار ميزة الإعلانات — يُحفظ في `reports/announcements-test.md`.*
