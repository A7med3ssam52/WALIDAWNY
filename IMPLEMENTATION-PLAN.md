# خطة تنفيذ تحويل WALIDAWNY من نظام الاشتراكات إلى الشراء الدائم لكل وحدة

> **نطاق هذه الخطة:** استبدال نظام الاشتراكات الزمني (subscriptions / pricing_plans / subscription_codes / code_redemptions) بنظام شراء **دائم (lifetime)** لكل وحدة تعليمية عبر **أكواد (codes)** فقط — بلا منح يدوي وبلا دفع إلكتروني؛ الطالب يطلب الكود عبر **واتساب** ويدخّله في التطبيق.
>
> **قاعدة صارمة:** لا يجوز تعديل أي ملف سوى هذا الملف. كل التغييرات تُنفَّذ وفق ما هو موصوف هنا، وبالترتيب المذكور.
> **أسلوب الترحيل:** المخطط الحالي مبني على ترحيلات تراكمية (migrations) لا تُعدَّل أبداً؛ كل الإزالات والإضافات تتم في ترحيلات **جديدة** (0028/0029/0030)، ويُعاد توليد `supabase-full-schema.sql` في النهاية.

---

## 1) نظرة عامة والمعمارية المستهدفة

### 1.1 الموجز التنفيذي

- **الحالة الحالية:** طالب يشتري اشتراكاً زمنياً لوحدة كاملة بفترة صلاحية (`expires_at`) عبر كود مرتبط بخطة (`pricing_plans`) لها `duration_days`. الاشتراك النشط يفتح **كل** وحدات صفّه.
- **الوضع المستهدف:** كل **وحدة** لها سعر دائم (`unit_pricing`)؛ الطالب يفكّ كوداً واحداً (`unit_codes`) **يفتح وحدة واحدة فقط مدى الحياة** (`unit_purchases` بلا أي `expires_at`). الدرس التجريبي (`lessons.is_trial`) يبقى قابلاً للفتح بدون شراء. لا يوجد "باقة شاملة".
- **جهة الاتصال:** لا دفع إلكتروني؛ واجهة الطالب تعرض السعر وزر "اطلب الكود عبر واتساب" (رسالة افتراضية من `app_settings`)، وإدخال الكود وتفعيله.

### 1.2 المصطلحات والمعرّفات التقنية

| المصطلح | المعرّف | المعنى |
|---|---|---|
| سعر الوحدة | `unit_pricing` | سعر دائم لوحدة (سعر أساس + رسوم منصة = الإجمالي) |
| كود الوحدة | `unit_codes` | كود `WLDN-…` يرتبط بسعر وحدة ويفتحها مرة واحدة |
| شراء الوحدة | `unit_purchases` | سجل شراء دائم (طالب × وحدة)؛ حالة `active` أو `void` |
| حالة الكود | `code_status` | موجودة ولا تتغير: `available / used / revoked` |
| حالة الشراء | `unit_purchase_status` | جديدة: `active / void` |
| الوصول للدرس | `can_access_lesson(lesson_id)` | ربح لدرس = منشور + صفّ نشط + شراء نشط للوحدة أو درس تجريبي |

### 1.3 المعمارية النهائية (بعد كل المراحل)

```
auth.users ── profiles (grade_id, role, status)
                │
                ├── grades (is_active, deleted_at)
                │      └── units (status, deleted_at)
                │            ├── lessons (status, deleted_at, is_trial)
                │            │     ├── lesson_videos / lesson_pdfs
                │            │     ├── progress (حصة من وحدات مشتراة فقط)
                │            │     └── exams / exam_questions / exam_attempts / exam_answers   [المرحلة 6]
                │            │     └── lesson_comments                                       [المرحلة 7]
                │            └── unit_pricing (base_price + platform_fee = total_price)
                │                   └── unit_codes (code_status)
                │                          └── unit_purchases (unit_purchase_status, student_id)  ← دائم
                └── notifications / audit_logs
```

**قاعدة وصول الدرس (المرحلة 1 فصاعداً):**

```sql
can_access_lesson(p_lesson_id)
  = lesson منشور وغير محذوف
    و unit تابعته منشورة وغير محذوفة
    و صف الطالب نشط وغير محذوف
    و (lesson.is_trial = true
       OR EXISTS (unit_purchases حيث student_id = الطالب و unit_id = وحدة الدرس و status = 'active'))
```

---

## 2) المرحلة 0: الفحوصات المسبقة

قبل أي تغيير نتحقق (لا تُكتب هذه الفحوصات في ملفات المشروع):

1. **التحقق من نقطة البداية النظيفة:**
   - `git status` → يجب أن تكون الشجرة نظيفة.
   - `git log --oneline -3` → آخر commit مرجعي `20f9bf5`.
2. **نصب الأدوات المتوفرة (تُستدعى فقط وليس تسجيلاً):**
   - Frontend: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test` (vitest).
   - Edge Functions: `deno test` داخل كل مجلد دالة (المجلدات `*-test` إن وُجدت و `index_test.ts`).
   - Harness محلي: `cd supabase/tests/local; npm start`.
   - إعادة توليد المخطط: `node scripts/regen-schema.mjs`.
3. **جرد المستندات المرجعية المطلوب تحديثها لاحقاً (المرحلة 5):**
   `README.md`, `.env.example`, `DATABASE.md`, `SECURITY.md`, `ARCHITECTURE.md`, `BLUEPRINT.md`, `TESTING.md`, `STYLE.md`, أي `UI-*.md`.
4. **تسجيل الأعداد المرجعية الحالية (للمقارنة في المرحلة 8):**
   - عدد الجداول: 14 → بعد التغيير 13.
   - عدد الأنواع enum: 7 → بعد المرحلة 1 يبقى 7 (حذف `subscription_status` + إضافة `unit_purchase_status`)؛ العدد النهائي بعد المرحلتين 6 و7 (إضافة `exam_question_type` و`exam_attempt_status` و`comment_status`) يصبح **10** — تحدَّث الأرقام في المرحلة 8.
   - قائمة الدوال المكشوفة لـ `authenticated`: 44 RPC + `get_public_settings` + 5 helpers (وفق `05_grants.sql`) → تتغير بعد الترحيل (تحدَّث الأرقام في المرحلة 4).
   - عدد الدوال الطرفية: 10 مجلدات → بعد الحذف 8 + إضافة 1 = 9.
5. **نقطة قرار محفورة:** أي ملف/مرجع قديم غير مذكور صراحةً في هذه الخطة ويشير إلى (`subscriptions | pricing_plans | subscription_codes | code_redemptions | subscription_* | expiry_warning_days | expires_at`) يُعدّ **خللاً** ويُعالج ضمن "تدقيق ZERO LEFTOVERS" (المرحلة 8) — لا تُحذف المراجع بصمت.

---

## 3) المرحلة 1: قاعدة البيانات — ترحيل `0028_units_purchase.sql`

> ترحيل واحد جديد كامل يُنشأ في `supabase/migrations/0028_units_purchase.sql`. لا تُعدَّل أي ملفات 0001–0027. كل العمليات أدناه تُنفَّذ **بنفس الترتيب** داخل الملف.

### 3.1 ترتيب العمليات داخل 0028 (الترتيب حرج)

```
1. إنشاء enum unit_purchase_status (ترقيع إضافي — لا تعارض)
2. حذف صفوف notifications القديمة + تنظيف app_settings ('expiry_warning_days')
3. إعادة بناء notification_type — يجب أن تسبق الحذف (ALTER COLUMN TYPE يفشل مع بقاء قيم قديمة)
4. إنشاء الجداول الجديدة: unit_pricing → unit_codes → unit_purchases (+ فهارس + قيود + triggers updated_at)
5. تعديل lessons: إضافة is_trial + فهرس فريد جزئي
6. توسيع قائمة تطبيق set_updated_at (من 0004) وتحديث audit inventory (من 0005) — عبر CREATE OR REPLACE/ALTER داخل 0028
7. إعادة كتابة can_access_lesson + إنشاء set_lesson_trial
8. إنشاء دوال الوحدات الجديدة ثم DROP دوال الاشتراك (حتى لا يعلق الترحيل بمراجع)
9. إعادة كتابة v_lesson_access / v_student_progress_summary / v_dashboard_metrics (دون أي اعتماد على v_active_subscriptions)، **ثم** إزالة v_active_subscriptions بعدها (لأن v_dashboard_metrics معرّف فوقه — الحذف قبل إعادة الكتابة يفشل)
10. إعادة كتابة get_dashboard_stats عبر CREATE OR REPLACE واحد (لا يُحذف إطلاقاً — يبقي المنح)
11. إعادة كتابة notify_new_content (الجمهور = مشترو الوحدة)
12. حذف الجداول القديمة (بعد كل المراجع): code_redemptions → subscriptions → subscription_codes → pricing_plans
13. حذف enum subscription_status (آخر خطوة بعد حذف الجدول)
14. المنح (GRANT) للدوال الجديدة + المنع التام (REVOKE) لأي بقايا
15. استبدال أي CHECK/قيود enumeration على notifications.entity_type / audit_logs.entity_type
```

### 3.2 أنواع ENUM

**أ) `unit_purchase_status` جديد:**

```sql
CREATE TYPE public.unit_purchase_status AS ENUM ('active', 'void');
```

**ب) إعادة بناء `notification_type`** (إزالة الاشتراكية + إضافة `unit_activated`):

القيمة الحالية: `subscription_activated, subscription_expiring, subscription_expired, new_content, system`.
القيمة المستهدفة (قبل المرحلتين 6 و7): `new_content, unit_activated, system`.

```sql
DELETE FROM public.notifications WHERE type IN
    ('subscription_activated', 'subscription_expiring', 'subscription_expired');

CREATE TYPE public.notification_type_new AS ENUM ('new_content', 'unit_activated', 'system');

ALTER TABLE public.notifications
    ALTER COLUMN type TYPE public.notification_type_new
    USING (type::text::public.notification_type_new);

DROP TYPE public.notification_type;
ALTER TYPE public.notification_type_new RENAME TO notification_type;
```

> ملاحظة: المرحلتان 6 و7 تضيفان لاحقاً (`ALTER TYPE ... ADD VALUE`) القيم `exam_submitted, exam_graded` ثم `lesson_comment, comment_reply`. لا تُضف الآن.

**ج) حذف `subscription_status`** (في نهاية الملف بعد حذف جدول `subscriptions`):

```sql
DROP TYPE IF EXISTS public.subscription_status;
```

### 3.3 الجداول الجديدة (DDL كامل)

```sql
CREATE TABLE public.unit_pricing (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id      uuid NOT NULL UNIQUE REFERENCES public.units(id) ON DELETE CASCADE,
    base_price   numeric(10, 2) NOT NULL CHECK (base_price >= 0),
    platform_fee numeric(10, 2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
    total_price  numeric(10, 2) GENERATED ALWAYS AS (base_price + platform_fee) STORED,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.unit_codes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            text NOT NULL UNIQUE CHECK (code ~ '^WLDN-[A-Z0-9]{8,12}$'),
    unit_pricing_id uuid NOT NULL REFERENCES public.unit_pricing(id) ON DELETE RESTRICT,
    status          public.code_status NOT NULL DEFAULT 'available',
    created_by      uuid NOT NULL REFERENCES auth.users(id),
    used_at         timestamptz,
    used_by         uuid REFERENCES public.profiles(id),
    revoked_at      timestamptz,
    revoked_by      uuid REFERENCES auth.users(id),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX unit_codes_pricing_id_idx    ON public.unit_codes(unit_pricing_id);
CREATE INDEX unit_codes_status_idx        ON public.unit_codes(status);

CREATE TABLE public.unit_purchases (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    unit_id       uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
    base_price    numeric(10, 2) NOT NULL CHECK (base_price >= 0),
    platform_fee  numeric(10, 2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
    total_price   numeric(10, 2) GENERATED ALWAYS AS (base_price + platform_fee) STORED,
    code_id       uuid REFERENCES public.unit_codes(id) ON DELETE SET NULL,
    status        public.unit_purchase_status NOT NULL DEFAULT 'active',
    purchased_at  timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX unit_purchases_student_unit_uniq ON public.unit_purchases(student_id, unit_id);
CREATE INDEX unit_purchases_student_idx ON public.unit_purchases(student_id);
CREATE INDEX unit_purchases_unit_idx    ON public.unit_purchases(unit_id);

-- أرقام الأسعار تُنقل (snapshot) من unit_pricing لحظة التفعيل (قرار P12).
-- لا يوجد أي عمود expires_at / duration_days في أي جدول جديد.
```

**updated_at trigger:** إضافة `unit_pricing` و `unit_codes` فقط إلى قائمة تطبيق `set_updated_at` المعرّفة في `0004` (تعديل يضيف السطرين فقط، لا يمسّ غيرها). **`unit_purchases` لا تُضاف** — ليس بها عمود `updated_at` و `set_updated_at()` يكتب `NEW.updated_at` بلا شرط، فإضافتها ستكسر أي UPDATE عليها.

**audit inventory (0005):** تحديث أي تعداد/خريطة `entity_type` (إن وُجدت CHECK أو CASE أو جدول مرجعي داخل `0005`/`0019`) بحذف `subscription / subscription_code / pricing_plan` وإضافة `unit_pricing / unit_codes / unit_purchases`. قيم `audit_log` الجديدة المستخدمة فعلاً: `unit_purchase.create` (تفعيل كود)، `unit_code.revoke`، `unit_pricing.set`، `unit.trial_set`.

### 3.4 تعديل `lessons` — الدرس التجريبي

```sql
ALTER TABLE public.lessons
    ADD COLUMN is_trial boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX lessons_trial_unique
    ON public.lessons(unit_id)
    WHERE is_trial AND deleted_at IS NULL;
```

```sql
CREATE OR REPLACE FUNCTION public.set_lesson_trial(p_lesson_id uuid, p_is_trial boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin() OR public.is_mr_walid() OR public.is_teacher()) THEN
        RAISE EXCEPTION 'permission_denied';
    END IF;
    IF p_lesson_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'lesson_not_found';
    END IF;
    -- المسح الذري للتجريبي السابق في نفس الوحدة (قرار D)
    UPDATE public.lessons SET is_trial = (id = p_lesson_id AND p_is_trial)
    WHERE unit_id = (SELECT unit_id FROM public.lessons WHERE id = p_lesson_id)
      AND deleted_at IS NULL;
    PERFORM public.audit_log('unit.trial_set', 'lesson', p_lesson_id,
        jsonb_build_object('is_trial', p_is_trial));
END $$;

REVOKE EXECUTE ON FUNCTION public.set_lesson_trial(uuid, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_lesson_trial(uuid, boolean) TO authenticated;
```

### 3.5 إعادة كتابة `can_access_lesson` (قرار D)

```sql
CREATE OR REPLACE FUNCTION public.can_access_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN false;
    END IF;
    IF public.is_admin() OR public.is_mr_walid() OR public.is_teacher() THEN
        RETURN EXISTS (SELECT 1 FROM public.lessons WHERE id = p_lesson_id AND deleted_at IS NULL);
    END IF;
    RETURN EXISTS (
        SELECT 1
        FROM public.lessons l
        JOIN public.units u      ON u.id = l.unit_id
        JOIN public.profiles p   ON p.id = v_uid
        JOIN public.grades g     ON g.id = p.grade_id
        WHERE l.id = p_lesson_id
          AND l.deleted_at IS NULL AND l.status = 'published'
          AND u.deleted_at IS NULL AND u.status = 'published'
          AND g.is_active AND g.deleted_at IS NULL
          AND p.deleted_at IS NULL AND p.status = 'active'
          AND (l.is_trial OR EXISTS (
              SELECT 1 FROM public.unit_purchases up
              WHERE up.student_id = v_uid
                AND up.unit_id = u.id
                AND up.status = 'active'
          ))
    );
END $$;

COMMENT ON FUNCTION public.can_access_lesson(uuid) IS
    'Lesson access: staff see any live lesson; students need published lesson+unit in their own active grade, plus an active unit purchase OR a trial lesson.';
-- المنح الحالية (authenticated فقط) تبقى كما هي في 0010.
```

### 3.6 دوال الاشتراك المحذوفة (DROP — بعد ضمان عدم مراجع)

تُحذف بالاسم التام مع توقيعها الأصلي (تظهر في 0006/0007/0014/0018/0025):

```sql
DROP FUNCTION IF EXISTS public.redeem_subscription_code(text);
DROP FUNCTION IF EXISTS public.get_my_subscriptions();
DROP FUNCTION IF EXISTS public.get_my_current_subscription();
DROP FUNCTION IF EXISTS public.revoke_subscription_code(uuid);
DROP FUNCTION IF EXISTS public.create_manual_subscription(uuid, uuid, timestamptz, text);
DROP FUNCTION IF EXISTS public.set_pricing_plan(uuid, integer, numeric, numeric, boolean);
DROP FUNCTION IF EXISTS public.delete_pricing_plan(uuid);
DROP FUNCTION IF EXISTS public.expire_subscriptions();
DROP FUNCTION IF EXISTS public.generate_codes_internal(uuid, integer, text);   -- صيغة الاشتراك
DROP FUNCTION IF EXISTS public.create_codes_for_staff(uuid, integer, text);    -- صيغة الاشتراك (0014)
```
> ملاحظة: التوقيعات أعلاه مطابقة للمصدر (0006/0007/0010/0014/0025) — `set_pricing_plan(p_plan_id uuid, p_duration_days integer, p_base_price numeric, p_platform_fee numeric, p_is_active boolean)`. عند التنفيذ تحقق من كل توقيع في مصدره قبل DROP؛ أي توقيع خاطئ يجعل `DROP IF EXISTS` صامتاً ويترك الدالة موجودة (يلتقطها تدقيق المرحلة 8).
> ملاحظة: `get_dashboard_stats` **لا يُحذف** — يُعاد تعريفه عبر `CREATE OR REPLACE` في §3.9 (يُحافظ ذلك على منح EXECUTE الموجود).

> القاعدة: أي دالة اشتراك لم تُسجَّل هنا يلتقطها تدقيق المرحلة 8.

### 3.7 دوال الوحدات الجديدة (التواقيع + الأخطاء)

**أ) الدوال الطلابية:**

```sql
-- تفعيل كود الوحدة
CREATE OR REPLACE FUNCTION public.redeem_unit_code(p_code text)
RETURNS public.unit_purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$ ... $$;

-- قائمة شراءاتي
CREATE OR REPLACE FUNCTION public.get_my_unit_purchases()
RETURNS SETOF public.unit_purchases ... $$;

-- حالة وصول درس محدد (الواجهة + الدوال الطرفية)
CREATE OR REPLACE FUNCTION public.get_my_lesson_access(p_lesson_id uuid)
RETURNS jsonb
STABLE SECURITY DEFINER ... $$;
-- الناتج: {"has_access": bool, "has_purchase": bool, "is_trial": bool,
--          "unit_id": uuid, "unit_name": text, "price": numeric}
```

**قائمة أخطاء `redeem_unit_code` (النهائية والمطلوبة نصاً حرفياً):**
- `code_not_found` — الكود غير موجود.
- `code_revoked` — الكود ملغى.
- `code_already_used` — الكود مستخدم مسبقاً.
- `no_grade_assigned` — الطالب بلا صف.
- `unit_not_found` — لا يوجد `unit_pricing` للكود (وضع مكسور).
- `unit_inactive` — السعر غير نشط أو الوحدة غير منشورة.
- `unit_not_in_student_grade` — الوحدة من صف آخر.
- `unit_already_purchased` — الطالب يملك شراءً نشطاً لهذه الوحدة.
- (`invalid_count` تُستخدم فقط في مسار توليد الأكواد §3.7-ب، ليست خطأ تفعيل.)

**منطق `redeem_unit_code` المطلوب:**
```
1. btrim(p_code)؛ إذا كان فارغاً → code_not_found
2. جلب unit_codes + unit_pricing + units بالكود
3. تحقق: سجل موجود → code_not_found
4. unit_pricing.is_active والوحدة موجودة ومنشورة (status='published'، deleted_at IS NULL) → unit_inactive
5. status='revoked' → code_revoked
6. status='used' → code_already_used
7. صف الطالب: role='student'، deleted_at IS NULL؛ grade_id موجود → no_grade_assigned
8. units.grade_id = الطالب.grade_id → unit_not_in_student_grade
9. شراء نشط موجود (student_id, unit_id, status='active') → unit_already_purchased
10. INSERT unit_purchases (snapshot: الأسعار من unit_pricing؛ code_id؛ status='active')
11. UPDATE unit_codes SET status='used', used_at=now(), used_by=الطالب
12. audit_log('unit_purchase.create', 'unit_purchases', id, {unit_id, price})
13. INSERT notifications(user_id, 'unit_activated', 'unit_purchases', purchase_id,
    title='تم تفعيل الوحدة', body=اسم الوحدة, dedup_key='unit_activated:'||id)
```

**ب) دوال الأكواد (فريق الإدارة — staff: admin + mr_walid + teacher):**

```sql
-- توليد داخلي (لا منح عميلية عليه؛ يعزى المنشئ عبر auth.uid() أو app.system_actor_id)
CREATE OR REPLACE FUNCTION public.create_unit_codes_internal(
    p_unit_pricing_id uuid, p_count integer, p_note text DEFAULT NULL)
RETURNS SETOF public.unit_codes ... $$;
-- أخطاء: unit_pricing_not_found / unit_inactive / invalid_count (1..500)

-- واجهة staff آمنة فوق الدالة الداخلية (بديل create_codes_for_staff)
CREATE OR REPLACE FUNCTION public.create_unit_codes_for_staff(
    p_unit_id uuid, p_count integer, p_note text DEFAULT NULL)
RETURNS SETOF public.unit_codes ... $$;
-- أخطاء: unit_not_found (لا وحدة أو لا يوجد unit_pricing) / unit_inactive / invalid_count

CREATE OR REPLACE FUNCTION public.list_codes_by_unit(p_unit_id uuid)
RETURNS SETOF public.unit_codes ... $$;         -- unit_not_found إن لم توجد الوحدة

CREATE OR REPLACE FUNCTION public.revoke_unit_code(p_code_id uuid)
RETURNS void ... $$;
-- أخطاء: code_not_found / code_already_used (لا يُلغى كود مستخدم) / code_not_revocable
```

**صيغة الكود:** `WLDN-` متبوعاً بـ 8–12 خانة `A-Z0-9` (توليد عشوائي آمن `gen_random_bytes` + خوارزمية أبجدية مختلطة، بدون أحرف ملتبسة). فحص التفرد عبر قيد UNIQUE مع إعادة محاولة عند التصادم.

**ج) دوال الأسعار:**

```sql
-- ADMIN ONLY (قرار J: المعلم لا يعدّل الأسعار)
CREATE OR REPLACE FUNCTION public.set_unit_price(
    p_unit_id uuid, p_base_price numeric(10,2), p_platform_fee numeric(10,2) DEFAULT 0)
RETURNS void ... $$;
-- upsert على unit_id؛ أخطاء: unit_not_found / invalid_price (سالب) / permission_denied
-- المعلم: IF NOT is_admin() → permission_denied

CREATE OR REPLACE FUNCTION public.list_unit_pricing()
RETURNS SETOF ... $$;            -- staff فقط (كل الصفوف مع الوحدة والصف)

CREATE OR REPLACE FUNCTION public.get_public_unit_prices()
RETURNS TABLE (
    unit_id uuid, unit_name text, grade_name text,
    base_price numeric(10, 2), platform_fee numeric(10, 2), total_price numeric(10, 2)
) ... $$;
-- anon + authenticated: فقط is_active ووحدة منشورة على صف نشط (قرار M).
-- يرجع اسم الوحدة والصف مع السعر — الشكل الذي يستهلكه الفرونت (UnitPricingWithUnit).
```

**د) دوال الإحصائيات (staff):**

```sql
CREATE OR REPLACE FUNCTION public.list_all_unit_purchases(p_student_id uuid DEFAULT NULL)
RETURNS SETOF public.unit_purchases ... $$;
CREATE OR REPLACE FUNCTION public.unit_purchase_stats()
RETURNS jsonb ... $$;
```

### 3.8 العرض views

> **ترتيب إلزامي:** أعد تعريف `v_dashboard_metrics` أولاً بدون الاعتماد على `v_active_subscriptions` (إزالة الاعتماد)، **وبعدها** احذف `v_active_subscriptions` — الحذف قبل إعادة الكتابة يفشل بسبب الاعتماد.

```sql
-- (1) إعادة تعريف كل عروض الطالب/الإحصائيات بدون اشتراكات:
-- v_lesson_access: نفس الاسم والتوقيع، يعتمد على can_access_lesson الجديدة (SECURITY INVOKER يبقى؛ المنع في 0026 يبقى)
-- v_student_progress_summary: لا يُحتسب سوى دروس الوحدات المشتراة (قرار E):
--   unit_purchases النشطة للطالب + دروس الوحدة، مع استبعاد is_trial من البسط والمقام
-- v_dashboard_metrics: بدون أي عمود اشتراك؛ يُغذّى من unit_purchases

-- (2) بعد إعادة التعريف أعلاه — الحذف:
DROP VIEW IF EXISTS public.v_active_subscriptions;
```
- **`v_lesson_stats` / `v_audit_log`**: يبقى `v_audit_log` كما هو؛ `v_lesson_stats` يُفحص فقط للتأكد من عدم إشارته لأعمدة محذوفة (إن أشار → إعادة تعريف بدونها).

### 3.9 `get_dashboard_stats` (إعادة الكتابة الموحدة)

تعريف واحد جديد يحل محل نسختي 0018 و 0025 (CREATE OR REPLACE فوق النسخة المتبقية):

```sql
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb ... AS $$
-- students: كما هي (total/active/disabled/deleted/new_this_month)
-- purchases: {total, total_revenue, revenue_this_month}
-- by_grade: [{grade_name, students, purchases, revenue}]
-- top_units: [{unit_name, purchases, revenue}] (أعلى 5)
-- recent_purchases: [{student_name, grade_name, unit_name, total_price, purchased_at}] (آخر 5)
-- content: كما هي  | engagement: كما هي
$$;
```

> لا تبقى أي مفاتيح: `subscriptions`, `expiring_7d`, `expired`, `codes`, `recent_subscriptions`, `upcoming_expirations`, `active_subscribers`.

### 3.10 `notify_new_content` (إعادة الكتابة — قرار I)

```sql
CREATE OR REPLACE FUNCTION public.notify_new_content(p_lesson_id uuid)
RETURNS void ... AS $$
DECLARE
    v_unit uuid;
BEGIN
    SELECT unit_id INTO v_unit FROM public.lessons WHERE id = p_lesson_id;
    IF v_unit IS NULL THEN RAISE EXCEPTION 'lesson_not_found'; END IF;

    INSERT INTO public.notifications (user_id, type, entity_type, entity_id, title, body, dedup_key)
    SELECT up.student_id, 'new_content', 'lesson', p_lesson_id,
           'محتوى جديد', l.title,
           'new_content:' || p_lesson_id || ':' || up.student_id
    FROM public.unit_purchases up
    JOIN public.lessons l ON l.id = p_lesson_id
    WHERE up.unit_id = v_unit
      AND up.status = 'active'
      AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.dedup_key = 'new_content:' || p_lesson_id || ':' || up.student_id
      );
END $$;
```

### 3.11 حذف الجداول القديمة (الترتيب إجباري)

```sql
DROP TABLE IF EXISTS public.code_redemptions;
DROP TABLE IF EXISTS public.subscriptions;
DROP TABLE IF EXISTS public.subscription_codes;
DROP TABLE IF EXISTS public.pricing_plans;
```

### 3.12 تنظيف app_settings

```sql
DELETE FROM public.app_settings WHERE key = 'expiry_warning_days';
```

### 3.13 المنح (GRANT) — مصفوفة محدثة

| الدالة | anon | authenticated | ملاحظة |
|---|---|---|---|
| `redeem_unit_code(text)` | ✗ | ✓ | طالب فقط داخل الدالة |
| `get_my_unit_purchases()` | ✗ | ✓ | |
| `get_my_lesson_access(uuid)` | ✗ | ✓ | تُستخدم من الدوال الطرفية عبر user-JWT |
| `get_public_unit_prices()` | ✓ | ✓ | landing عام |
| `get_public_settings()` | ✓ | ✓ | موجودة |
| `list_active_grades()` | ✓ | ✓ | موجودة |
| `set_unit_price(uuid, numeric, numeric)` | ✗ | ✓ | admin داخل الدالة فقط |
| `list_unit_pricing()` | ✗ | ✓ | staff داخل الدالة |
| `list_codes_by_unit(uuid)` | ✗ | ✓ | staff |
| `revoke_unit_code(uuid)` | ✗ | ✓ | staff |
| `create_unit_codes_for_staff(uuid, int, text)` | ✗ | ✓ | staff |
| `create_unit_codes_internal(...)` | ✗ | ✗ | لا منح (داخلية فقط) |
| `list_all_unit_purchases(uuid)` | ✗ | ✓ | staff |
| `unit_purchase_stats()` | ✗ | ✓ | staff |
| `set_lesson_trial(uuid, boolean)` | ✗ | ✓ | staff |

**قواعد المنح الحاسمة:**
- كل دالة جديدة: `REVOKE EXECUTE ... FROM PUBLIC` أولاً، ثم `GRANT ... TO authenticated`.
- `is_admin()/is_mr_walid()/is_teacher()/can_access_lesson()` تبقى منحها `authenticated` فقط (مطلوبة لتقييم سياسات RLS — توثيق harness).
- **لا دالة اشتراك تبقى ممنوحة لأحد.**

### 3.14 RLS للجداول الجديدة (سياسات مسماة — نفس أسلوب 0009/0025)

```sql
-- unit_pricing (نفس نمط pricing_plans في 0025: staff أو طالب صفّ الوحدة؛ anon لا يمسّ
-- دوال المساعدة الخمسة إطلاقاً — وصوله حصري عبر RPC get_public_unit_prices)
unit_pricing_select_staff_or_active_students  FOR SELECT  USING (
    public.is_admin() OR public.is_mr_walid() OR public.is_teacher()
    OR (
        public.is_student() AND is_active
        AND unit_id IN (SELECT id FROM public.units
            WHERE status = 'published' AND deleted_at IS NULL
              AND grade_id = (SELECT grade_id FROM public.profiles WHERE id = (select auth.uid()))
              AND grade_id IN (SELECT id FROM public.grades WHERE is_active AND deleted_at IS NULL))
    )
);

-- unit_codes
unit_codes_select_staff                      FOR SELECT  USING (public.is_admin() OR public.is_mr_walid() OR public.is_teacher());

-- unit_purchases
unit_purchases_select_own_or_staff           FOR SELECT  USING (student_id = (select auth.uid()) OR public.is_admin() OR public.is_mr_walid() OR public.is_teacher());
unit_purchases_insert_via_rpc                FOR INSERT WITH CHECK (false);  -- درع احتياطي: لا إدراج خام
```

> ملاحظة: RLS تُفعل `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` للجداول الثلاثة. **لا توجد سياسات DML** (لا INSERT/UPDATE/DELETE) لأي دور على أي من الجداول الثلاثة — الكتابة كلها حصرية عبر دوال SECURITY DEFINER (`set_unit_price`، `create_unit_codes_for_staff`/الدالة الداخلية، `revoke_unit_code`، `redeem_unit_code`). سياسة `unit_purchases_insert_via_rpc` الصفرية درع دفاع إضافي ضد أي إدراج خام.
> **anon:** لا تنفيذ لأي من دوال المساعدة في أي سياسة (تسبب `permission denied` داخل التعبير)؛ وصول anon للأسعار يكون فقط عبر RPC `get_public_unit_prices()` (SECURITY DEFINER يمر عبر RLS). الطالب العادي يرى أسعار وحدات صفّه فقط عبر سياسة SELECT أعلاه.

### 3.15 فحوصات هذه المرحلة (معايير النجاح)

1. `supabase/tests/local/sql/01_schema.sql` — بعد إعادة كتابته في المرحلة 4، لكن كضبط مبكر: `npm start` لا يكسر عند تطبيق 0028 (بعد تحديث مؤقت لـ 01..08 لاحقاً؛ في هذه المرحلة يُفحص فقط تطبيق الترحيلات على خادم نظيف).
2. التحقق اليدوي بلغة SQL (اختياري ضمن الـ harness):
   - `to_regtype('public.subscription_status') IS NULL`.
   - `to_regtype('public.unit_purchase_status') IS NOT NULL`.
   - `can_access_lesson` يعيد true للدرس التجريبي وfalse بدونه.
   - تفعيل الكود نفسه مرتين → `code_already_used` و `unit_already_purchased`.
   - `get_dashboard_stats()` لا يحتوي أي مفتاح `subscription`.

---

## 4) المرحلة 2: الدوال الطرفية Edge Functions

### 4.1 الحذف

- حذف المجلد `supabase/functions/expire-subscriptions/` بالكامل (`index.ts` + `index_test.ts`).
- حذف المجلد `supabase/functions/generate-subscription-codes/` بالكامل.

### 4.2 تعديل `supabase/config.toml`

إزالة السطرين 6–7 (`[functions.expire-subscriptions]` و `verify_jwt = false`). النتيجة:

```toml
project_id = "nfusbrktrqfrnaetetmr"

[functions]
enabled = true
```

### 4.3 دالة جديدة `generate-unit-codes`

`supabase/functions/generate-unit-codes/index.ts` + `index_test.ts`:

- **الإدخال:** `{ unit_id: string, count: number, note?: string }` عبر POST.
- **التحقق:** استدعاء RPC `create_unit_codes_for_staff(unit_id, count, note)` بترخيص المستخدم نفسه (forwarding verified user JWT) — لا service_role.
- **الاستجابة:** `{ ok: true, codes: string[] }`؛ الأخطاء تُعكس حرفياً من RPC: `unit_not_found`, `unit_inactive`, `invalid_count`.
- **الاختبار:** يتحقق من رفض غير staff (403), رفض count خارج 1..500, ونجاح التوليد على fixture.

### 4.4 إعادة كتابة بوابات الطالب الثلاث

`supabase/functions/get-video-playback-url/index.ts`, `get-video-thumbnail-url/index.ts`, `get-pdf-signed-url/index.ts` (+ `index_test.ts` لكل منها):

- استبدال كل استعلام `subscriptions` مباشرة باستدعاء RPC `get_my_lesson_access(p_lesson_id)`.
- إذا `has_access = false` → `403 { error: 'access_denied' }`.
- الاحتفاظ بكل بقية التحقق الحالية (bucket, object, MIME, expiry لأسماء توقيعات URL).
- **قاعدة:** لا يجوز أن يظهر `subscriptions` أو `expires_at` في أي من الملفات الثلاثة أو اختباراتها.

### 4.5 بقية الدوال (لا تغيير)

`bunny-video-webhook`, `recheck-video-states`, `create-video-upload-session`, `upload-pdf`, `export-audit-log` — تبقى كما هي. `recheck-video-states` لا تزال تستخدم `INTERNAL_JOB_TOKEN` من `.env` (لا تُحذف؛ تُوثَّق في README).

### 4.6 معايير النجاح

- `deno test` لكل مجلد دالة (بما فيها الجديدة والمعدّلة) يمر.
- `grep -R "expire-subscriptions\|generate-subscription-codes\|subscriptions\|pricing_plan" supabase/functions` → لا نتائج في الدوال الثلاث المعدّلة (المتبقية قد تكون صفرية كلية).

---

## 5) المرحلة 3: الواجهة الأمامية Frontend

> الترتيب إجباري: **الأنواع → طبقة البيانات → المكونات → الصفحات → التوجيه والتنقل → الـ mock → اختبارات vitest**.

### 5.1 `src/types/database.ts`

- **حذف الأنواع:** `SubscriptionStatus`, `SubscriptionSource`, `Subscription`, `SubscriptionWithPlan`, `PricingPlan`, `PricingPlanWithGrade`, `SubscriptionCode`, `CodeWithStudent`, `DashboardSubscriptionsStats`, `DashboardRecentSubscription`.
- **إضافة الأنواع:**
  ```ts
  type UnitPurchaseStatus = 'active' | 'void';
  interface UnitPricing { id: string; unit_id: string; base_price: number; platform_fee: number; total_price: number; is_active: boolean; }
  interface UnitPricingWithUnit extends UnitPricing { unit_name: string; grade_name: string; }
  interface UnitCode { id: string; code: string; unit_pricing_id: string; status: CodeStatus; created_by: string; used_at: string | null; used_by: string | null; revoked_at: string | null; note: string | null; }
  interface UnitCodeWithUnit extends UnitCode { unit_name: string; }
  interface UnitPurchase { id: string; student_id: string; unit_id: string; base_price: number; platform_fee: number; total_price: number; code_id: string | null; status: UnitPurchaseStatus; purchased_at: string; }
  interface UnitPurchaseWithUnit extends UnitPurchase { unit_name: string; grade_name: string; }
  interface LessonAccessInfo { has_access: boolean; has_purchase: boolean; is_trial: boolean; unit_id: string | null; unit_name: string | null; price: number | null; }
  interface UnitPurchaseStats { total_purchases: number; total_revenue: number; revenue_this_month: number; by_grade: Array<{ grade_name: string; purchases: number; revenue: number }>; top_units: Array<{ unit_name: string; purchases: number; revenue: number }>; }
  ```
- **`NotificationType`:** استبدال `subscription_activated | subscription_expiring | subscription_expired` بقيمة `'unit_activated'` (تُبقى `new_content`, `system`).
- **`DashboardStats`:** استبدال `subscriptions` بـ `purchases: { total; total_revenue; revenue_this_month }`؛ استبدال `recent_subscriptions` بـ `recent_purchases: DashboardRecentPurchase[]`؛ استبدال `upcoming_expirations` بحذفه؛ `by_grade` يصبح `{ grade_name; students; purchases; revenue }`؛ إضافة `top_units`.
- **مخطّطات الجداول (end of file):** حذف مخطّطات `pricing_plans / subscriptions / subscription_codes` وإضافة `unit_pricing / unit_codes / unit_purchases`.

### 5.2 `src/data/rpc.ts`

- **حذف الدوال:** `redeemSubscriptionCode`, `getMySubscriptions`, `getMyCurrentSubscription`, `revokeSubscriptionCode`, `createManualSubscription`, `setPricingPlan`, `deletePricingPlan`, `createCodesForStaff`, `listCodes` (صيغة الاشتراك).
- **`getDashboardStats`:** الاسم يبقى كما هو لكن الناتج يتغير ليطابق المخطط الجديد (المفاتيح `purchases / top_units / recent_purchases` بدل مفاتيح الاشتراك) — تحديث النوع فقط.
- **إضافة الدوال:**
  ```ts
  redeemUnitCode(code: string): Promise<UnitPurchase>;
  getMyUnitPurchases(): Promise<UnitPurchaseWithUnit[]>;
  getMyLessonAccess(lessonId: string): Promise<LessonAccessInfo>;
  getPublicUnitPrices(): Promise<UnitPricingWithUnit[]>;
  setUnitPrice(unitId: string, basePrice: number, platformFee: number): Promise<void>;
  listUnitPricing(): Promise<UnitPricingWithUnit[]>;
  listCodesByUnit(unitId: string): Promise<UnitCodeWithUnit[]>;
  revokeUnitCode(codeId: string): Promise<void>;
  createUnitCodesForStaff(unitId: string, count: number, note?: string): Promise<UnitCode[]>;
  listAllUnitPurchases(studentId?: string): Promise<UnitPurchaseWithUnit[]>;
  unitPurchaseStats(): Promise<UnitPurchaseStats>;  // النوع UnitPurchaseStats يعكس jsonb القادم من unit_purchase_stats()
```
- كل اسم RPC الجديد يطابق اسم الدالة في Postgres حرفياً (`redeem_unit_code`, `get_my_unit_purchases`, `get_my_lesson_access`, `get_public_unit_prices`, `set_unit_price`, `list_unit_pricing`, `list_codes_by_unit`, `revoke_unit_code`, `create_unit_codes_for_staff`, `list_all_unit_purchases`, `unit_purchase_stats`).

### 5.3 المكونات `src/components`

- `StatusBadge`: إزالة شارات `subscription_*`؛ إضافة شارة شراء (`active`/`void`) وشارات كود (`available/used/revoked` قائمة).
- إضافة `PriceTag` (سعر + "شراء دائم") و `RedeemCodeForm` (حقل كود + زر تفعيل + تعيين أخطاء) و `LockedUnitCard` (قفل + سعر + زر واتساب).
- `StudentNav`: إعادة تسمية "اشتراكاتي" → "وحداتي"؛ الـ icon والمسار `units`.
- `StaffNav`: إعادة تسمية/إضافة "أكواد الوحدات" و "أسعار الوحدات".
- `useToast` موجودة؛ تُستخدم لكل رسائل الخطأ.

### 5.4 الصفحات

**أ) `src/features/student/StudentSubscriptionsPage.tsx` → `UnitsPage.tsx`** (يُعاد تسمية الملف والمسار):
- تعرض وحدات صف الطالب عبر `listActiveGrades` + `getMyUnitPurchases`.
- كل وحدة: بطاقة فيها الاسم، الحالة (مشتراة/متاحة/تجريبية)، السعر (من `getPublicUnitPrices`).
- **وحدة مشتراة:** زر "افتح الوحدة" → `StudentCurriculumPage` مع `unitId` مركّز.
- **وحدة غير مشتراة:** السعر + زر "اطلب الكود عبر واتساب" (يفتح `https://wa.me/<whatsapp_number>?text=<whatsapp_default_message + unit name>`) + `RedeemCodeForm`.
- **خطأ التفعيل** → toast بعربية واضحة لكل كود خطأ من §3.7.
- **نجاح التفعيل** → تحديث القائمة فوراً + toast "تم تفعيل الوحدة بنجاح".

**ب) `src/features/student/StudentDashboardPage.tsx`:**
- استبدال بطاقة الاشتراك النشط/المنتهي ببطاقة "وحداتي المشتراة" (عدد + مجموع).
- `progress` يُجمع على دروس الوحدات المشتراة فقط (قرار E).
- أرقام `getDashboardStats` غير مستخدمة هنا (استخدام الطالب فقط لوحداته).

**ج) `src/features/student/StudentCurriculumPage.tsx`:**
- الوحدات المشتراة تُفتح؛ غير المشتراة تُعرض مع `LockedUnitCard` بدل الدخول.
- فتح درس: استدعاء `getMyLessonAccess(lessonId)` قبل عرض المحتوى؛ في حال `!has_access` تُعرض شاشة القفل.

**د) `src/features/student/StudentLessonPage.tsx`:**
- تبويبات: "الدرس" (فيديو/PDF)، "الاختبارات" (المرحلة 6)، "التعليقات" (المرحلة 7).
- عند `!has_access` → شاشة "هذه الوحدة غير مفعّلة" + زر واتساب + نموذج كود (لا تُحمَّل الفيديوهات/الـ PDF إطلاقاً).

**هـ) `src/features/walid/CodesPage.tsx`:**
- إعادة التسمية "أكواد الوحدات": اختيار وحدة (قائمة من `listUnitPricing`)، عدد الأكواد، توليد عبر `createUnitCodesForStaff`، عرض النتائج مع أزرار نسخ، قائمة أكواد الوحدة `listCodesByUnit` مع زر إلغاء `revokeUnitCode` (الكود المستخدم لا يُلغى — رسالة `code_already_used`).

**و) `src/features/walid/PricingPage.tsx`:**
- إعادة التسمية "أسعار الوحدات": جدول وحدات مع سعر أساس/رسوم/إجمالي.
- **admin فقط:** نموذج تعديل السعر (`setUnitPrice`)؛ **teacher:** عرض فقط (قرار J).

**ز) `src/features/walid/WalidDashboardPage.tsx`:** استخدام الشكل الجديد `DashboardStats` (بطاقات المشتريات/الإيرادات/أعلى الوحدات/آخر المشتريات).

**ح) `src/features/walid/StudentDetailPage.tsx`:** قسم الاشتراكات → قسم "مشتريات الوحدات" عبر `listAllUnitPurchases(studentId)`.

**ط) `src/features/public/LandingPage.tsx`:** قسم أسعار عام (`getPublicUnitPrices`) لكل صف مع سعر الوحدة + زر واتساب موحّد (قرار M). لا تجربة عامة.

### 5.5 التوجيه والتنقل

- `src/app/router.tsx`: استبدال `<Route path="subscriptions" element={<StudentSubscriptionsPage/>}>` (سطر 62) بمسار `units` مع `UnitsPage`؛ تحديث الاستيراد (سطر 14).
- `src/components/guards.tsx`: لا تغيير منطقي (الأدوار نفسها)، لكن يُفحص ألا يشير لأي صفحة محذوفة.

### 5.6 `src/test/supabase-mock.ts`

- استبدال `subscriptions / pricingPlans / subscriptionCodes` بـ `unitPricing / unitCodes / unitPurchases` (بنية `MockState`).
- تحديث `rpcCalls` mock: إزالة دوال الاشتراك وإضافة دوال الوحدات بقيم افتراضية قابلة للتخصيص.
- تحديث بيانات البذرة (fixtures) لتعكس وحدة مشتراة + وحدة مجانية/تجريبية + أكواد في كل الحالات.
- `MockSession` و `auth` يبقيان كما هما (لا علاقة بالاشتراكات).
- **أي اختبار يستدعي دالة اشتراك محذوفة يُحذف أو يُستبدل.**

### 5.7 اختبارات vitest

- تحديث كل `.test.tsx` يشير إلى أنواع/صفحات/دوال محذوفة.
- اختبارات جديدة: `UnitsPage` (تفعيل ناجح/فاشل بكل الأخطاء)، `CodesPage` (توليد/إلغاء)، `PricingPage` (تعديل admin، عرض teacher)، `LandingPage` (أسعار + واتساب)، `StudentLessonPage` (حالة القفل)، `getMyLessonAccess` بوابة.

### 5.8 معايير النجاح

- `npm run typecheck` و `npm run lint` و `npm run build` و `npm run test` — كلها تمر.
- لا ملف في `src/` يحوي النمط `subscription|pricing_plan|subscription_code|code_redemption|expires_at` (تدقيق المرحلة 8 يؤكدها بالآلة).

---

## 6) المرحلة 4: اختبارات SQL (`supabase/tests/local/sql/`)

> إعادة كتابة الملفات الثمانية كاملة لتعكس المخطط الجديد. مبدأ الـ harness (README): كل suite في معاملة واحدة؛ الفشل يرجع غير صفري.

### 6.1 `01_schema.sql`
- الجداول: 13 (حذف 4، إضافة 3).
- enums: 7؛ `subscription_status` غير موجود، `unit_purchase_status` موجود، قيم `notification_type` = `new_content, unit_activated, system`.
- `lessons.is_trial` موجود + الفهرس الجزئي الفريد.
- `unit_pricing.total_price` عمود مولّد (GENERATED STORED) ويحقق `= base + platform`.
- `v_active_subscriptions` غير موجود؛ `v_lesson_access` و `v_dashboard_metrics` بلا أعمدة اشتراك.

### 6.2 `02_roles.sql`
- بناء الـ fixtures: صف G + وحدتان (وحدة مشتراة + وحدة مجانية) + `unit_pricing` + أكواد `WLDN-…` + طلاب (منهم من اشترى ومن لم يشترِ).
- ترتيب التنظيف: `unit_purchases → unit_codes → unit_pricing → lessons → units → profiles → grades → audit_logs → auth.users`.

### 6.3 `03_rls.sql`
- مصفوفة `SET LOCAL ROLE` + `app.current_user_id` للجداول الجديدة (unit_pricing/unit_codes/unit_purchases).
- مصفوفة وصول الدرس بالدور (student مع شراء / trial / بدون، staff دائماً).

### 6.4 `04_business.sql`
- مصفوفة تفعيل الأكواد: كل خطأ §3.7 (code_not_found, code_revoked, code_already_used, no_grade_assigned, unit_not_found, unit_inactive, unit_not_in_student_grade, unit_already_purchased).
- **Idempotency:** التفعيل مرتين → الخطأ الثاني `unit_already_purchased`؛ الكود نفسه → `code_already_used`.
- **Void:** لا يوجد مسار void في v1 للعميل؛ يُختبر فقط أنه لا يمكن إدراج purchase مباشرة (سياسة `insert_via_rpc`).
- دلالات `progress` على الوحدات المشتراة فقط واستبعاد trial.
- `set_unit_price`: admin ينجح، teacher → `permission_denied` (قرار J).
- `notify_new_content` يُنشئ إشعاراً لمشتري الوحدة فقط، و `dedup_key` يمنع التكرار.
- أثر `redeem_unit_code`: إنشاء إشعار `unit_activated`.

### 6.5 `05_grants.sql`
- **anon** = 3 دوال قابلة للتنفيذ: `get_public_settings`, `list_active_grades`, `get_public_unit_prices`.
- **authenticated** = قائمة الدوال الجديدة (§3.13) + `get_public_settings` + `list_active_grades` + helpers الخمسة، وعدم وجود أي دالة `subscription*`.
- تحقق: anon لا يستطيع `redeem_unit_code` ولا `update_own_profile`.

### 6.6 `06_dashboard_stats.sql`
- Fixtures ذاتية (Grade إحصائي `80000000-…` + student + unit + pricing + purchase).
- تحقق من وجود `purchases.total / total_revenue / revenue_this_month / top_units / recent_purchases` وعدم وجود مفاتيح الاشتراك.

### 6.7 `07_audit_logs.sql`
- أحداث `unit_purchase.create`, `unit_code.revoke`, `unit_pricing.set`, `unit.trial_set` مسجلة بالشخص الصحيح وبدون PII.
- لا تسجيل لأي entity من نوع `subscription*`.

### 6.8 `08_security.sql`
- الدوال الجديدة كلها `SECURITY DEFINER` مع `search_path = public`.
- لا منح عميلية على `create_unit_codes_internal` و `can_access_lesson` (authenticated فقط).
- لا مرجع لأي كائن محذوف.

### 6.9 معايير النجاح
- `cd supabase/tests/local; npm start` → `ALL GREEN` على **كل** ملفات `sql/` المدرجة في `run-tests.mjs` (01..08 بعد المرحلة 4). إذا كان `run-tests.mjs` يسرد الملفات صراحةً فحدِّث قائمته عند إضافة `09_exams.sql` و `10_comments.sql`.

---

## 7) المرحلة 5: إعادة توليد المخطط + الوثائق

### 7.1 إعادة توليد `supabase-full-schema.sql`
```powershell
node scripts/regen-schema.mjs
```
- يجب أن تنتهي بـ `regen OK: <bytes> bytes, <N> markers, LF-only, no BOM (range 0001..0028)`.
- تحقق يدوي: الملف لا يحتوي `subscription_status` ولا `v_active_subscriptions` ولا `expiry_warning_days`.

### 7.2 الوثائق (بحث واستبدال محكم، لا حذف عشوائي)
- `README.md`: مقطع الاشتراكات → مقطع "الشراء الدائم لكل وحدة"؛ تدفق الطالب (اطلب الكود عبر واتساب ← فعّل)؛ الاحتفاظ بذكر `INTERNAL_JOB_TOKEN` (لا يزال مستخدماً بـ `recheck-video-states`)؛ حذف ذكر `expire-subscriptions` و `generate-subscription-codes`.
- `.env.example`: حذف أي متغير خاص بالدالة المحذوفة (إن وُجد)؛ إبقاء `INTERNAL_JOB_TOKEN`.
- `DATABASE.md`: أقسام الجداول/enums/RPCs/views/SECURITY.md/Audit تُحدَّث للمخطط الجديد.
- `SECURITY.md`: قسم الاشتراكات والوصول يُعاد صياغته على أساس "الشراء الدائم + trial".
- `ARCHITECTURE.md`, `BLUEPRINT.md`, `TESTING.md`, `STYLE.md`, `UI-*.md`: أي ذكر `subscription` يُحدَّث أو يُحذف حسب السياق.
- `supabase/tests/local/README.md`: تحديث قائمة الـ suites ووصف `01…08`.

### 7.3 معايير النجاح
- `node scripts/regen-schema.mjs` يمر بعد الترحيل.
- `grep -ril "subscription" docs/*.md` → صفر نتائج في المستندات (بعد استبدال العناوين).

---

## 8) المرحلة 6: الاختبارات الامتحانات Exams — ترحيل `0029_exams.sql`

### 8.1 المخطط

```sql
CREATE TYPE public.exam_question_type AS ENUM ('mcq', 'essay');

CREATE TABLE public.exams (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id    uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    title        text NOT NULL,
    sort_order   integer NOT NULL DEFAULT 0,
    passing_score integer NOT NULL DEFAULT 50 CHECK (passing_score BETWEEN 0 AND 100),
    deleted_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.exam_questions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id      uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    type         public.exam_question_type NOT NULL DEFAULT 'mcq',
    prompt       text NOT NULL,
    choices      jsonb,             -- MCQ: ["أ","ب","ج","د"]
    correct_index integer,          -- MCQ: فهرس الصحيح (0-based)
    max_score    numeric(5,2) NOT NULL DEFAULT 1 CHECK (max_score > 0),
    sort_order   integer NOT NULL DEFAULT 0
);

CREATE TABLE public.exam_attempts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id      uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status       text NOT NULL CHECK (status IN ('submitted','graded')) DEFAULT 'submitted',
    auto_score   numeric(5,2),     -- مجموع درجات MCQ (تلقائي)
    manual_score numeric(5,2),     -- تقدير الأسئلة المقالية
    final_score  numeric(5,2),     -- النهائي بعد التصحيح
    graded_by    uuid REFERENCES public.profiles(id),
    graded_at    timestamptz,
    submitted_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (exam_id, student_id)
);

CREATE TABLE public.exam_answers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id   uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    question_id  uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
    choice_index integer,          -- MCQ
    answer_text  text,             -- essay
    score        numeric(5,2)      -- بعد التصحيح
);
```

### 8.2 القواعد
- **الوصول:** الدوال تُقيّد بـ `can_access_lesson(exam.lesson_id)`؛ الطالب لا يرى أسئلة درس لا يملك وصوله إليه.
- **الإدراج/التعديل:** staff فقط (admin/mr_walid/teacher).
- **التصحيح:** MCQ تلقائي فوراً؛ المقالي يدوي عبر دالة `grade_exam_attempt` (teacher)؛ عند اكتمال الكل يُحسب `final_score` وتُرسل `exam_graded` للطالب.
- **الإشعارات:** `exam_submitted` (للمعلمين المشرفين)، `exam_graded` (للطالب). تُضاف القيمتان إلى `notification_type` عبر `ALTER TYPE ... ADD VALUE` (قيم `exams` و `exam_submitted` في ملف 0029).
- **RLS + grants:** نفس النمط (SELECT own/staff للـ attempts/answers؛ staff DML؛ لا إدراج مباشر للطلاب).

### 8.3 الواجهة
- `StudentLessonPage` تبويب "الاختبارات": قائمة الاختبارات، بدء محاولة واحدة (قيد UNIQUE)، أسئلة MCQ + مقالي، إرسال → `exam_submitted`، عرض النتيجة بعد التصحيح.
- `StaffLessonAssetsPage` (أو صفحة معلم جديدة): إنشاء/تعديل اختبار وأسئلته، تصحيح المقالي، عرض النتائج.

### 8.4 الاختبارات
- `sql/09_exams.sql` جديد (يُضاف للـ README والـ harness): مصفوفة وصول، تصحيح MCQ تلقائي، منع محاولة ثانية، إشعاران.

---

## 9) المرحلة 7: التعليقات Comments — ترحيل `0030_comments.sql`

### 9.1 المخطط

```sql
CREATE TABLE public.lesson_comments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id    uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    author_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_id    uuid REFERENCES public.lesson_comments(id) ON DELETE CASCADE,
    body         text NOT NULL CHECK (length(btrim(body)) > 0 AND length(btrim(body)) <= 1000),
    status       text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','removed')),
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lesson_comments_lesson_idx ON public.lesson_comments(lesson_id);
```

### 9.2 القواعد
- **الوصول:** رؤية التعليقات لقراءة الدرس (من له `can_access_lesson` أو staff).
- **الكتابة:** student صاحب وصول + staff؛ **حذف/إخفاء:** الطالب يحذف تعليقه فقط، teacher/admin/mr_walid يحذف أي تعليق.
- **الإشعارات:** `lesson_comment` (لصاحب تعليق أصلي عند رد)، `comment_reply` (عند رد على تعليق). تُضاف القيمتان إلى `notification_type`.
- **RLS:** `lesson_comments_select_gated`, `lesson_comments_insert_gated`, `lesson_comments_update_own_or_staff`, `lesson_comments_delete_own_or_staff`.
- دوال: `add_lesson_comment`, `delete_lesson_comment`, `list_lesson_comments`.

### 9.3 الواجهة
- `StudentLessonPage` تبويب "التعليقات": قائمة + إضافة + حذف تعليقه + رد.
- صفحة staff: مشاهدة كل تعليقات الدرس وحذف المخالف.

### 9.4 الاختبارات
- `sql/10_comments.sql`: الوصول، الحذف الذاتي، حذف staff، الإشعاران، حد الطول.

---

## 10) المرحلة 8: التحقق النهائي + تدقيق ZERO LEFTOVERS

### 10.1 الأوامر الكاملة (بالترتيب، كلها يجب أن تمر)

```powershell
# 1. قاعدة البيانات (معايير التحقق)
cd supabase/tests/local; npm install; npm start        # ALL GREEN على كل ملفات sql/ المدرجة في run-tests.mjs (01..08 ثم +09 +10)

# 2. إعادة توليد المخطط (بعد كل مرحلة تضيف ترحيلاً: بعد 5 و6 و7)
cd ..\..\..; node scripts/regen-schema.mjs             # range 0001..0030 بعد المرحلة 7

# 3. الدوال الطرفية
deno test supabase/functions/generate-unit-codes
deno test supabase/functions/get-video-playback-url
deno test supabase/functions/get-video-thumbnail-url
deno test supabase/functions/get-pdf-signed-url
deno test supabase/functions/bunny-video-webhook
deno test supabase/functions/recheck-video-states
deno test supabase/functions/create-video-upload-session
deno test supabase/functions/upload-pdf
deno test supabase/functions/export-audit-log

# 4. الواجهة الأمامية
npm run typecheck
npm run lint
npm run build
npm run test
```

### 10.2 تدقيق ZERO LEFTOVERS (قائمة الأنماط — يجب أن تكون صفرية)

**أ) الأنماط المحظورة إجمالاً (غالبية الحالات تُحذف نهائياً):**

| النمط | ملاحظة |
|---|---|
| `subscriptions` (كمعرّف/اسم جدول) | لا يبقى في src/ و supabase/functions و supabase/migrations و docs |
| `pricing_plans` / `pricing_plan` | حذف كامل |
| `subscription_codes` | حذف كامل |
| `code_redemptions` | حذف كامل |
| `subscription_status` | enum محذوف |
| `expiry_warning_days` | حذف من app_settings والكود |
| `expires_at` | لا يبقى في أي نوع/واجهة/دالة طالب |
| `v_active_subscriptions` | العرض محذوف |
| `recent_subscriptions` / `upcoming_expirations` | مفاتيح dashboard محذوفة |
| `expire_subscriptions` / `expire-subscriptions` | دالة + EF محذوفتان + config.toml |
| `generate-subscription-codes` / `generate_codes_internal` | EF + دالة داخليتان محذوفتان |
| `redeem_subscription_code` / `get_my_subscriptions` / `get_my_current_subscription` / `create_manual_subscription` / `revoke_subscription_code` / `set_pricing_plan` / `delete_pricing_plan` / `create_codes_for_staff` | كل دوال الاشتراك محذوفة |
| `subscription_activated` / `subscription_expiring` / `subscription_expired` | قيم enum محذوفة من DB والأنواع والمكتبة الأمامية |

**ب) الأدوات:** البحث عبر أداة Grep لكل مجلد (`src`, `supabase/functions`, `supabase/migrations`, `supabase/tests/local`, `docs`, `scripts`, الجذر) — لا `rg` (غير مثبت) ولا `Select-String -Recurse` (بطيء ويؤدي إلى timeout)؛ تُستخدم أداة Grep حصراً.

**ج) حصيلة التحقق اليدوي:**
- `supabase-full-schema.sql`: لا `subscription` ولا `v_active_subscriptions` ولا `expiry_warning_days` ولا `expires_at`.
- `supabase/config.toml`: لا `[functions.expire-subscriptions]`.
- قائمة الدوال في `src/data/rpc.ts` تطابق قائمة RPC في 05_grants الجديد.
- `git status` بعد التنفيذ: لا ملفات مشروع معدّلة خارج ما ورد في هذه الخطة.

### 10.3 قائمة حذف الملفات النهائية

- `supabase/functions/expire-subscriptions/index.ts`, `index_test.ts` (مجلد كامل)
- `supabase/functions/generate-subscription-codes/index.ts`, `index_test.ts` (مجلد كامل)
- `src/features/student/StudentSubscriptionsPage.tsx` (يستبدله `UnitsPage.tsx`)

---

## 11) أوامر المراحل ومعايير النجاح (ملخص تنفيذي للتنفيذ)

| المرحلة | الملفات/الأوامر | معيار النجاح |
|---|---|---|
| **0** فحوصات مسبقة | `git status` نظيف؛ تأكيد الأعداد المرجعية | لا تعديل مسبق؛ الأساس 20f9bf5 |
| **1** قاعدة البيانات | إنشاء `0028_units_purchase.sql` | تطبيق الترحيلات على harness نظيف؛ كل الأخطاء §3.7 تعمل |
| **2** الدوال الطرفية | حذف 2، إضافة `generate-unit-codes`، إعادة كتابة 3 بوابات، تعديل config.toml | `deno test` يمر لكل دالة؛ صفر مراجع `subscription` في الفولدر |
| **3** الواجهة | types → rpc → components → pages → router/navs → mock → vitest | typecheck + lint + build + test تنجح |
| **4** اختبارات SQL | إعادة كتابة `sql/01..08` | `npm start` → `ALL GREEN` |
| **5** المخطط + الوثائق | `regen-schema.mjs` + تحديث الوثائق | regen يمر؛ صفر `subscription` في docs وschema |
| **6** الامتحانات | `0029_exams.sql` + واجهة + `sql/09_exams.sql` + regen | suite تمر؛ إشعاران يعملان |
| **7** التعليقات | `0030_comments.sql` + واجهة + `sql/10_comments.sql` + regen | suite تمر؛ الحذف الذاتي/staff صحيح |
| **8** تحقق نهائي | كل أوامر §10.1 + تدقيق §10.2 | كل الأوامر تمر؛ صفر LEFTOVERS |

**تعريف الانتهاء (Definition of Done):**
1. `npm run typecheck && npm run lint && npm run build && npm run test` — خضراء.
2. `cd supabase/tests/local; npm start` — `ALL GREEN` بكل الـ suites.
3. `deno test` لجميع الدوال الطرفية — خضراء.
4. `node scripts/regen-schema.mjs` — `regen OK` مع range حتى آخر ترحيل.
5. تدقيق ZERO LEFTOVERS — صفر نتائج لكل الأنماط المحظورة.
6. لا تعديل على أي ملف 0001–0027 (ترحيلات قديمة تُترك كما هي، كل شيء عبر 0028/0029/0030).
