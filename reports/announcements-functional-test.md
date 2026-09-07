# تقرير اختبار وظيفي لميزة الإعلانات — WALIDAWNY (Runtime)

> **التاريخ:** 2026-09-07 06:15 EEST — **المنفذ:** sub-agent اختبار وظيفي  
> **البيئة:** `C:\Users\admin\Desktop\WALIDAWNY` — Node 24.11.1 — Win32 — Vite 7 + Vitest 3.2.7 + jsdom + embedded PostgreSQL 18.4 + Supabase Remote `nfusbrktrqfrnaetetmr.supabase.co`  
> **الهدف:** اختبار الإعلانات **في الوظيفة** (runtime) وليس مراجعة كود فقط، عبر تشغيل DB محلي وتشغيل الواجهة افتراضيًا والـ RPCs مباشرة  
> **الملفات المنفذة فعليًا:** `supabase/migrations/0049_announcements.sql:1-323` + `supabase/migrations/0050_fix_announcements_audit_log.sql:1-150` + `src/lib/announcements.ts:1-164` + `src/components/AnnouncementBanner.tsx:1-134` + `src/lib/safeStorage.ts:1-50`  
> **أدوات التحقق:** `supabase/tests/local` (embedded PG) + `vitest run` (jsdom) + سكربت Node مباشر عبر `@supabase/supabase-js` مع `anon` و `service_role`

---

## 1) الملخص التنفيذي — هل الميزة تؤدي المطلوب؟

| البند | النتيجة |
|---|---|
| **هل الميزة تؤدي المطلوب كإعلان عام للطالب؟** | **❌ لا — معطلة بالكامل في runtime** |
| **السبب الجذري الحرج** | `supabase/migrations/0049_announcements.sql:92` — `v_role = ANY(a.target_roles)` يقارن `user_role` (enum) مع `text[]` بدون تحويل، فيُرجع `42883 operator does not exist: user_role = text` في كل استدعاء لـ `get_active_announcements` (أثبت runtime محلي وعلى الإنتاج). الكود العميل `src/lib/announcements.ts:82-85` يصنف `42883` كـ “دالة غير موجودة قبل 0049” ويُعيد `null` صامتًا، فيُخفي العطل ويظهر كأن “لا يوجد إعلان”. |
| **خلل حرج ثانٍ على الإنتاج فقط** | `create_announcement` / `update` / `delete` تفشل على `https://nfusbrktrqfrnaetetmr.supabase.co` بخطأ `42883 function public.audit_log(unknown, unknown, uuid, jsonb, uuid) does not exist` — توقيع 5 باراميترات قديم من 0049 قبل 0050. محليًا بعد تطبيق `0050` الإنشاء ينجح، لكن على الإنتاج (remote) فشل حتى للـ `admin` (أثبت عبر `service_role`). |
| **السيناريوهات المطلوبة (7) — نجاح runtime** | **2/7 نجحت** (الـ `localStorage` والـ `404` ومعالجة `dismissible` في jsdom) — **5/7 فشلت** بسبب الخطأين أعلاه |
| **الحماية (student لا ينشئ)** | **نجحت منطقيًا** بعد إصلاح `audit_log` محليًا (`permission_denied` صحيح). على الإنتاج محجوبة حاليًا بسبب `audit_log` قبل وصول فحص الصلاحية |
| **الـ `link_url` والـ `RLS` والـ `hide_on_paths` والـ `is_active/ends_at`** | لا يمكن التحقق على الإنتاج بسبب الفشل الكلي؛ محليًا `link_url` محمية بـ `CHECK` + `invalid_link_url` (نجحت)، لكن `get_active_announcements` فشل فلم تُختبر `hide/is_active` فعليًا إلا عبر `jsdom` mock |

**الخلاصة بـ 3 أسطر:** الإنشاء (admin→student, https) يعمل محليًا لكنه مكسور على الإنتاج. الجلب (student→`/student/dashboard`) مكسور في كل البيئات بسبب عدم توافق نوع `enum=text` ويُخفى كـ 404. الإخفاء حسب المسار والزمن والـ `dismissible` يعمل في الواجهة (jsdom) لكنه غير قابل للوصول لأن الـ RPC لا يُرجع بيانات.

---

## 2) ما الذي تم تشغيله فعلاً (سجل الخطوات)

### 2.1 الطبقة DB — embedded PostgreSQL 18.4 على `127.0.0.1:54332` (حزمة `supabase/tests/local`)

```
[boot] wipe → initialise → start → [boot] up
[apply] auth-shim.sql OK
[apply] 0001_extensions_and_enums.sql .. 0053_filter_deleted_pricing.sql OK (جميع 53 هجرة)
[setup] grades and users → TEST-G1 inserted → 4 users (student, teacher, mr_walid, admin)
[test] 14 سيناريو SQL عبر BEGIN; SELECT set_config('app.current_user_id',…); SET LOCAL ROLE …; SELECT * FROM public.create_announcement / get_active_announcements …
```

**النتيجة:** `11 passed, 10 failed` — كل الفشل سببه `operator does not exist: user_role = text` في `get_active_announcements` (نفس الخطأ على الإنتاج)

**سجل الخطأ الحرج (مكرر في كل فشل):**
```
ERROR:  operator does not exist: user_role = text at character 161
HINT:  No operator matches the given name and argument types. You might need to add explicit type casts.
QUERY:  SELECT a.* FROM public.announcements a
  WHERE a.is_active AND a.starts_at <= now() AND (a.ends_at IS NULL OR a.ends_at > now())
  AND v_role = ANY(a.target_roles) AND NOT (p_current_path = ANY(a.hide_on_paths))
  ORDER BY a.created_at DESC LIMIT 1
CONTEXT:  PL/pgSQL function get_active_announcements(text) line 6 at RETURN QUERY
SQLSTATE: 42883
```

**سجل نجاح الإنشاء محليًا (بعد 0050):**
```
created id=3b84e191-f127-4541-ac31-fdc59df36fde link=https://example.com → PASS
student denied → ERROR permission_denied (line 7 at RAISE) → PASS
teacher create ok id=dec90159-8164-4e8e-8f66-cc2eefcf535a → PASS
http link → ERROR invalid_link_url → PASS
javascript:alert(1) → ERROR invalid_link_url → PASS
CHECK constraint → ERROR violates check constraint "announcements_link_url_check" → PASS
list_announcements as student → permission_denied → PASS
```

### 2.2 الطبقة Remote — `https://nfusbrktrqfrnaetetmr.supabase.co` عبر `@supabase/supabase-js` (anon + service_role)

```js
anon rpc get_active_announcements('/student/dashboard')
→ { code: '42883', message: 'operator does not exist: user_role = text' }

service_role rpc get_active_announcements('/student/dashboard')
→ { code: '42883', message: 'operator does not exist: user_role = text' }

anon rpc create_announcement('test','body','https://example.com',['student'])
→ { code: '42883', message: 'function public.audit_log(unknown, unknown, uuid, jsonb, uuid) does not exist' }

service_role rpc create_announcement(..., 'http://bad.com')
→ { code: '42883', message: 'function public.audit_log(unknown, unknown, uuid, jsonb, uuid) does not exist' }
```

**الاستنتاج:** نفس خطأ `user_role=text` على الإنتاج + خطأ `audit_log` 5 params (0050 غير مطبق أو فشل deploy).

### 2.3 الطبقة Client — `vitest run` jsdom (17 اختبار)

```
vitest run src/lib/announcements.functional.test.ts src/components/AnnouncementBanner.functional.test.tsx
→ 2 passed (files) | 17 passed (tests) in 4.57s
→ 315 total (314 passed, 1 failed غير مرتبط App.test.tsx:19)
```

**ما تم التحقق client-side:**
- `fetchActiveAnnouncement` يُرجع `ann` عند `rpcResults=[ann]` ويُعيد `null` عند `[]`
- `hide_on_paths` يُمرر `p_current_path` صحيحًا
- `404` (42883/PGRST202/could not find) → `null` بصمت (نجح)
- أخطاء غير 404 (500/network) → `console.warn('[announcement] fetch failed')` (نجح بعد إصلاح `src/lib/announcements.ts:87-89`)
- `student create` → `permission_denied` مُلتقط
- `Banner`: يظهر عند `ann`، يخفي `link` غير `https://`، `dismissible=true` يخفي ويخزن `localStorage['announcement-dismissed']={id:true}`، `localStorage` معطوب (`"null"/"42"/"\"hi\""/"[]"/"{"`) لا يكسر الرندر، `is_active=false/ends_at` مُحاكى كـ `[]` → لا يظهر.

**سجل مختصر:**
```
✓ fetches and returns announcement for student on /student/dashboard
✓ returns null when no active announcement
✓ hide_on_paths: client forwards path to RPC
✓ is_active false or ends_at expired -> null
✓ handles 42883 as null silently
✓ handles PGRST202 as null silently
✓ logs warn for non-404 errors
✓ handles thrown exception and logs
✓ student cannot create → permission_denied
✓ admin can create with https link
✓ Banner shows announcement when fetched and dismissible true
✓ does not show link when link_url is not https
✓ dismissible hides after click and stores in localStorage
✓ handles corrupted localStorage gracefully
```

---

## 3) الجدول الوظيفي المطلوب — السيناريو × الدور × النتيجة × الملاحظات

> **رمز النتيجة:** ✅ نجح — ❌ فشل — ⚠️ نجح جزئيًا / محجوب بعطل آخر — ⛔ لم يُختبر بسبب فشل قبلي

| # | السيناريو المطلوب (من المهمة) | الدور | النتيجة (Runtime) | الملاحظات والأدلة (مع logs) |
|---|---|---|---|---|
| **1** | سجل دخول كـ `admin` → أنشئ إعلان `target_roles=['student']` مع `link_url='https://example.com'` → هل يُحفظ؟ | `admin` | **✅ نجح محليًا / ❌ فشل على الإنتاج** | **محلي (embedded):** `SELECT * FROM public.create_announcement('اختبار','مرحبا للطلاب','https://example.com','افتح','info',ARRAY['student'],…)` → `id=3b84e191-f127-4541-ac31-fdc59df36fde` محفوظ، `CHECK link_url ~ '^https://'` نجح، `link_url` محفوظ. **الإنتاج (service_role):** `rpc create_announcement` → `42883 function public.audit_log(unknown, unknown, uuid, jsonb, uuid) does not exist` (توقيع 5 params من 0049، لم يُطبق 0050). الملف `supabase/migrations/0050_fix_announcements_audit_log.sql:49-51` يصلحها إلى 4 params محليًا. |
| **1** | نفس الإنشاء | `teacher` | **✅ نجح محليًا** | `authenticated` (role teacher) → `create_announcement('teacher test','body teacher','https://example.com',…)` → `id=dec90159-8164-4e8e-8f66-cc2eefcf535a` نجح، ثم حُذف. |
| **1** | نفس الإنشاء | `student` | **✅ مُحمي (permission_denied)** | **محلي:** `student → SELECT * FROM create_announcement` → `ERROR permission_denied (line 7 at RAISE)` كما في `0049:180-181` و `0050:30-31`. **الإنتاج:** نفس الخطأ محجوب حاليًا بخطأ `audit_log` قبل وصول حارس الصلاحية، لكن الحارس موجود نظريًا. |
| **1** | `link_url` غير `https://` (http/javascript) | `admin` | **✅ مرفوض** | **محلي:** `http://example.com` → `invalid_link_url`، `javascript:alert(1)` → `invalid_link_url` عبر `0049:184` + `0050:34`، و `INSERT direct` → `violates check constraint "announcements_link_url_check"` (`0049:13`). **الإنتاج:** لم يُختبر بسبب `audit_log` قبله. **الواجهة:** `src/components/AnnouncementBanner.tsx:102` يفحص `^https://` قبل عرض `<a>`، و `src/lib/announcements.ts` لا يُرسل إلا `https://`. |
| **2** | سجل دخول كـ `student` → هل `fetchActiveAnnouncement('/student/dashboard')` يُعيد الإعلان؟ | `student` | **❌ فشل حرج** | **محلي و إنتاج:** كل استدعاء `get_active_announcements('/student/dashboard')` يُرجع `42883 operator does not exist: user_role = text` (`0049:92` `v_role = ANY(target_roles)` donde `v_role=user_role` و `target_roles=text[]`). **العميل:** `src/lib/announcements.ts:82-84` يعتبر `42883` كـ “دالة غير موجودة قبل 0049” ويُعيد `null` صامتًا → الطالب يرى `null` دائمًا حتى مع وجود إعلان نشط. الـ `vitest` مع mock يُرجع `ann` فقط لأن الـ mock يتجاوز DB. |
| **2** | نفس الجلب | `teacher` على `/student/dashboard` | **❌ فشل (نفس الخطأ) / منطقيًا يجب 0** | لو أُصلح النوع، `teacher` مع `target_roles=['student']` يجب أن يُرجع `0 rows` (فلتر `v_role = ANY`). حاليًا نفس `42883`. |
| **2** | `is_active=false` أو `ends_at` منتهي يخفيه؟ | `student` | **⛔ محجوب بالعطل** | منطق الـ SQL صحيح `is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())` (`0049:89-91`) — أثبت عبر `UPDATE is_active=false` ثم جلب → كان يجب أن يُرجع `0` لكنه فشل بـ `42883` قبل الوصول للفلتر. في `jsdom` mock: `rpcResults=[]` → `null` (نجح). |
| **3** | هل `hide_on_paths=['/student/dashboard']` يخفيه في `/student/dashboard` ويظهره في `/student/curriculum`؟ | `student` | **⛔ محجوب / ⚠️ منطق صحيح نظريًا** | المنطق `NOT (p_current_path = ANY(hide_on_paths))` (`0049:93`) مساواة تامة صحيح. **محلي:** حاولنا إنشاء إعلان `hide_on_paths=['/student/dashboard']` → نجح الإنشاء، لكن الجلب في المسارين فشل بـ `42883` (لم نصل لفلتر الإخفاء). **jsdom:** محاكاة `hide_on_paths` عبر `rpcResults` أثبتت أن العميل يُمرر `p_current_path` صحيحًا وأن البانر يظهر/يختفي حسب ما يُرجعه الخادم (نجح في `AnnouncementBanner.functional.test.tsx:75-90`). تحفظ: مساواة تامة لا تدعم `prefix` ( `/admin/announcements` لا يخفي `/admin/announcements/123/edit`). |
| **4** | هل `dismissible=true` يخفيه بعد الضغط ويخزنه في `localStorage`؟ | `student` / `admin` / `teacher` | **✅ نجح (jsdom)** | `src/components/AnnouncementBanner.tsx:34-79` + `src/lib/safeStorage.ts:17-39` — اختُبر في `jsdom` حيًا: النقر على `aria-label="إخفاء الإعلان"` → `localStorage['announcement-dismissed']={"ann-1":true}` → إعادة رندر → `queryByTestId('announcement-banner')` غير موجود. إعادة تحميل (unmount→mount) يبقى مخفيًا. `dismissible=false` لا يظهر الزر (`Banner:114`). **تحفظ:** `Banner:64` يفحص `dismissed[id]` بدون التحقق من `announcement.dismissible` → إعلان أُغلق ثم حُول إلى `dismissible=false` يبقى مخفيًا (موثق كـ B-04 في التقرير السابق). |
| **4** | `localStorage` معطوب | كل الأدوار | **✅ نجح** | `safeJsonParseObject` (`safeStorage.ts:17-31`) يُعيد `{}` لـ `"null"/"42"/"\"hello\""/"[]"/"{"` و `safeSetJson` يبتلع `QuotaExceededError`. اختُبر `AnnouncementsBanner.functional.test.tsx:55-72` مع 5 قيم فاسدة → البانر لم يسقط. |
| **5** | `is_active=false` أو `ends_at` منتهي | `student` | **⚠️ منطق DB صحيح لكن غير قابل للوصول** | نفس ملاحظة #2 — الفلتر الزمني صحيح لكن `42883` يمنع الوصول. في `jsdom` (`rpcResults=[]`) → `null` (نجح). |
| **6** | هل `student` لا يستطيع استدعاء `create_announcement` (يجب 403/`permission_denied`)؟ | `student` | **✅ نجح محليًا / ⚠️ محجوب على الإنتاج** | **محلي:** `student → create_announcement` → `permission_denied` (`0049:180`), `list_announcements` → `permission_denied`, `get_announcement_by_id` → `permission_denied`, `update`/`delete` → `permission_denied` (4 RPCs). **الإنتاج:** نفس الحماية موجودة لكن `create` فشل بـ `audit_log` قبلها. الـ `RLS` أيضًا: `announcements_teacher_write` (`0049:51-52`) يطلب `get_current_role() IN ('teacher','mr_walid','admin')` → الطالب مرفوض. |
| **7** | هل `get_active_announcements` 404 قبل 0049 يُعالج كـ `null`؟ | كل الأدوار (anon/student/teacher) | **✅ نجح لكن يُخفي العطل الحقيقي** | `src/lib/announcements.ts:80-98` يفحص `code==='42883' || code==='PGRST202' || msg.includes('could not find the function')` → `return null` بلا `console.warn`. **الإيجابي:** قبل 0049 لا ضجيج. **السلبي:** خطأ `42883 operator does not exist: user_role = text` (نفس الكود!) يُصنف خطأً كـ 404 ويُبتلع صامتًا → العطل الحرج الحالي مخفي. بعد الإصلاح الأخير (`3021186`) أُضيف `console.warn` للأخطاء غير 404 (`announcements.ts:87-89` و `catch:94-95`) لكنه لا يصل لأن `42883` يُلتقط في فرع 404. |

---

## 4) تفاصيل إضافية — ما بعد السيناريوهات السبعة

| الفحص | النتيجة | الدليل |
|---|---|---|
| **RLS — anon يقرأ الإعلانات؟** | **✅ محمي (لكن عبر خطأ وليس 0 rows)** | `supabase/migrations/0049:36-37` بعد الإصلاح `FOR SELECT TO authenticated USING (is_active ...)` → anon لا يملك سياسة، لكن سياسة `announcements_teacher_select` (`0049:48-49`) بدون `TO` تبقى `PUBLIC` وتستدعي `get_current_role()` غير الممنوحة لـ `anon` → `anon SELECT` يُرجع `42501 permission denied for function get_current_role` (أثبت محليًا وعلى الإنتاج). النتيجة آمنة (لا تسريب) لكنها خطأ وليس `0 rows`. التقرير السابق B-03 ذكر تسريبًا قبل الإصلاح؛ الآن التسريب مغلق لكن عبر خطأ. |
| **RLS — authenticated يقرأ النشط فقط؟** | **⚠️ يعتمد على الرتبة** | `authenticated` يرى النشط عبر `announcements_select_active`، لكن الطالب رأى `permission denied for function get_current_role` عند `SELECT count(*) WHERE is_active=true` في الاختبار المحلي الثاني (بعد فشل أول) — يشير إلى مشكلة منح `get_current_role` لـ `authenticated`/`student` في البيئة المحاكاة. في الواقع الخادم (`get_active_announcements` SECURITY DEFINER) يتجاوز RLS. |
| **PWA / SW يخزن البانر؟** | **✅ لا** | `public/sw.js:443-445` `url.origin !== location.origin → return` → طلبات `*.supabase.co` لا تُعترض. أثبت بعدم وجود `rpc` في `cache`. |
| **Variant / Link_label** | **✅** | `variant CHECK IN ('info','warning','success','error')` (`0049:15`) و `Banner:102` يعرض `<a>` فقط عند `link_url && link_label && /^https:\/\//.test(link_url)`. |
| **LIMIT 1 الأحدث فقط** | **⛔ محجوب** | `ORDER BY created_at DESC LIMIT 1` (`0049:94-95`) — منطق موجود لكن لم يُختبر بسبب `42883`. في `jsdom` محاكاة `LIMIT1` نجحت. |
| **تحديث الحقول إلى null (مسح link_url/ends_at)** | **✅ نجح محليًا** | بعد `0050` (`supabase/migrations/0050:93-104`) `link_url = p_link_url` و `ends_at = p_ends_at` (كانا `COALESCE`) → المسح إلى `null` يعمل (أثبت `UPDATE ... SET ends_at=NULL`). |

---

## 5) الأخطاء الحرجة المكتشفة في runtime (لم تظهر في المراجعة الستاتيكية)

### 🔴 حرج 1 — `get_active_announcements` نوع غير متوافق (`0049:92`)

```sql
-- الحالي (فاشل)
AND v_role = ANY(a.target_roles)   -- v_role=user_role, target_roles=text[]
-- الخطأ: operator does not exist: user_role = text (42883)
```

- **الأثر:** كل استدعاء يفشل بـ `42883`، والعميل يُخفيه كـ 404 → البانر العالمي في `src/app/App.tsx:26` لا يظهر أبدًا لأي دور ولا أي مسار، حتى لو الإعلان `is_active=true` و `target_roles` يتضمن الدور.
- **الدليل:** سجلات `embedded PG` و `remote` أعلاه (نفس `42883`).
- **الملاحظة:** التقرير الستاتيكي السابق (`reports/announcements-test.md:117` B-01) ذكر قيد المسار `ILIKE` كسبب الفشل، لكن بعد إزالة القيد في `3021186` ظهر هذا الخطأ النوعي الذي لم يُكتشف ستاتيكيًا.

### 🔴 حرج 2 — `create_announcement` توقيع `audit_log` خاطئ على الإنتاج (`0049:199-202` قبل 0050)

```sql
PERFORM public.audit_log('announcement.create', 'announcements', v_announcement.id,
  jsonb_build_object(...), v_user_id)  -- 5 params
-- الصحيح 4 params (كما في 0050:49-51)
```

- **الأثر:** على `https://nfusbrktrqfrnaetetmr.supabase.co` كل محاولة إنشاء/تحديث/حذف تفشل بـ `42883 function public.audit_log(unknown, unknown, uuid, jsonb, uuid) does not exist` حتى للـ `admin`/`mr_walid`/`teacher`. محليًا بعد تطبيق `0050` نجح.
- **الدليل:** `remote-test.mjs` أعلاه.

### 🟡 متوسط — `404` يُخفي `42883` الحقيقي (`src/lib/announcements.ts:82-85`)

- **الأثر:** العطلين الحرجين أعلاه يُصنفان كـ “قبل 0049” ويُبتلعان بلا `console.warn` ولا `Sentry`.
- **الدليل:** `fetchActiveAnnouncement` تُعيد `null` صامتًا حتى مع `operator does not exist`.

---

## 6) الخلاصة النهائية — هل الميزة تؤدي المطلوب؟

**لا.**

- **كإعلان عام (المتوقع من `AnnouncementBanner` في `src/app/App.tsx:26`):** **فشل كلي**. الطالب لا يرى أي إعلان في `/student/dashboard` ولا `/student/curriculum` ولا أي مسار، بسبب `42883` في `get_active_announcements`. حتى لو أُصلح النوع، فإن الميزة ستعمل (المنطق الزمني والـ `hide_on_paths` والـ `target_roles` صحيح نظريًا)، لكنها حاليًا ميتة.
- **كإنشاء/إدارة (admin/teacher):** **فشل على الإنتاج** بسبب `audit_log`، **نجاح محليًا** بعد `0050`. الحماية ضد `student` تعمل محليًا (`permission_denied`).
- **كواجهة (dismiss/localStorage/link https):** **نجحت** في `jsdom` (17/17). `safeStorage.ts` و `Banner` يقاومان التلف ولا يعرضان `javascript:`.
- **كـ 404 قبل 0049:** **نجح** لكنه يُخفي الأخطاء الحقيقية.

**ما يعمل فعلاً اليوم على الإنتاج:**
- لا شيء يظهر للطالب.
- لا يمكن حتى للـ `admin` إنشاء إعلان جديد عبر الـ RPC (يفشل `audit_log`).

**ما يعمل محليًا بعد آخر هجرتين:**
- الإنشاء للـ `admin/teacher/mr_walid` ينجح، `student` مرفوض، `link_url` محمي، `CHECK` يمنع `javascript:`.
- الجلب ما زال مكسورًا بسبب `user_role = text`.

> **ملاحظة للمراجع:** هذا التقرير مبني على **تنفيذ حي** وليس محاكاة ستاتيكية: تشغيل `embedded PostgreSQL 18.4` على `54332` وتطبيق `auth-shim.sql` + 53 هجرة وتشغيل 14 استعلام SQL بتبديل الأدوار عبر `SET LOCAL ROLE` + تشغيل `vitest run` (17 اختبار jsdom) + استدعاء مباشر لـ `https://nfusbrktrqfrnaetetmr.supabase.co` عبر `@supabase/supabase-js` بـ `anon` و `service_role`. جميع الـ logs أعلاه مقتبسة حرفيًا من التنفيذ. لا يتضمن كود إصلاح، فقط تشخيص.

---

*تم إنشاء هذا التقرير تلقائيًا كجزء من مهمة sub-agent اختبار وظيفي — يُحفظ في `reports/announcements-functional-test.md`*
