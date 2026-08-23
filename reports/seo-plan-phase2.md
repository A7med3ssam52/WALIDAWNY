# خطة SEO للوصول للمركز #1 — WALIDAWNY — المرحلة 2 من 4

> **المنصة:** WALIDAWNY — منصة مستر وليد عونى التعليمية (نموذج شراء دائم للوحدة بكود `WLDN-XXXX`)  
> **الدومين المستهدف:** `https://walidawny.com` (متغير بيئة `VITE_SITE_URL`)  
> **الحالة الراهنة:** SPA بـ Vite + React 19 + CSR فقط — صفحة واحدة قابلة للفهرسة `/` — تقييم SEO الحالي **2/10**  
> **الجمهور:** طلاب إعدادي/ثانوي مصر + أولياء أمور — نوايا بحث: `وليد عونى` / `منصة وليد عونى` / `كود تفعيل` / `شرح منهج تالتة اعدادي`  
> **الهدف النهائي:** المركز #1 على Google لـ Brand Keywords خلال 14 يوم + Top 3 لـ Category Keywords خلال 30 يوم + ظهور FAQ Rich Results  
> **تاريخ الخطة:** 23 أغسطس 2026 — **المُنفّذ التالي:** Agent التنفيذ (المرحلة 3)  
> **الموقع المطلق للوثيقة:** `C:\Users\admin\Desktop\WALIDAWNY\SEO-PLAN-PHASE2.md`

---

## 0) ملخص تنفيذي — ما الذي يمنعنا من #1 اليوم؟

| # | العائق الحالي | الأثر على الترتيب | إصلاح الخطة |
|---|---|---|---|
| 1 | لا `sitemap.xml` ولا `robots.txt` | Google لا يكتشف الصفحات بفعالية | توليد sitemap + robots + إرسال GSC — P0 |
| 2 | لا `canonical` ولا `hreflang` ولا `og:*` | تشتت إشارات، لا Rich Preview | Helmet + canonical ديناميكي + hreflang ar-EG — P0 |
| 3 | عنوان ثابت `<title>وليد عونى</title>` ووصف 62 حرف فقط | CTR منخفض، لا استهداف كلمات | عناوين فريدة 55-60 حرف + وصف 150-155 حرف — P0 |
| 4 | SPA + CSR فقط، لا SSR/SSG/Prerender | محتوى فارغ عند الزحف بدون JS | Prerender للصفحات العامة فقط — P0 |
| 5 | `vite.config.ts:17-36` CSP مكسور (يبحث عن `#047857` غير موجود + `script-src 'self'` يمنع Inline Vite) | كسر CSP في الإنتاج / تحذيرات | إصلاح CSP + نقل إلى Headers في `vercel.json` — P0 |
| 6 | لا Structured Data | لا Rich Results إطلاقاً | JSON-LD (Organization, Course, FAQPage...) — P1 |
| 7 | `hls.js@1.6.17` محمّل في الـ Landing bundle، لا Code Splitting | LCP و TTI ضعيفان | Lazy + `manualChunks` — P1 |
| 8 | 3 عائلات خطوط بدون `display=swap` (Cairo, Changa, Tajawal) | CLS و FOIT | إضافة `&display=swap` + `font-display: swap` + preload — P1 |
| 9 | Landing 567 سطر بمحتوى تسويقي عام فقط، لا FAQ/مدونة/Long-form | لا استهداف Long-tail | صفحات عامة جديدة + FAQ + مدونة تعليمية غير كاشفة للمحتوى المحمي — P1/P2 |
| 10 | لا GSC / GA4 / GTM / Verification | لا قياس ولا فهرسة | ربط كامل + verification — P0 |

> **المبدأ الذهبي:** المحتوى المحمي (وحدات/دروس/فيديوهات/ملفات) **لا يُكشف إطلاقاً** للزحف. الصفحات العامة الجديدة تستخدم **Teasers وصفية** فقط (عناوين الوحدات + وصف عام + أسعار) بدون كشف فيديو أو PDF.

---

## 1) البنية المستهدفة بعد التنفيذ

### 1.1 شجرة الصفحات العامة القابلة للفهرسة (Public Surface)

```
/                           → Landing الرئيسية (محسّنة)
/about                      → عن المنصة والمستر وليد عونى
/how-it-works               → كيف تبدأ رحلتك (خطوات + فيديو تعريفي عام)
/subjects                   → المواد والصفوف المتاحة (فهرس Teaser)
/subjects/:gradeSlug        → صفحة صف دراسي (مثال: /subjects/third-prep) — Teaser فقط
/pricing                    → الأسعار المفصلة (نفس بيانات getPublicUnitPrices لكن SEO-optimized)
/faq                        → الأسئلة الشائعة (FAQPage Rich Result)
/contact                    → تواصل (واتساب + نموذج) — Local SEO
/blog                       → مدونة تعليمية (Long-form بدون كشف محتوى محمي)
/blog/:slug                 → مقال فردي
/privacy                    → سياسة الخصوصية (ثقة + E-E-A-T)
/terms                      → الشروط والأحكام
/sitemap.xml                → خريطة الموقع
/robots.txt                 → توجيه الزحف
/og-image.jpg               → صورة OG 1200×630
```

> **خلف Auth (محظور من الفهرسة):** `/login`, `/register`, `/student/*`, `/walid/*`, `/admin/*` → `noindex, nofollow` + `Disallow` في robots.

### 1.2 متغيرات البيئة الجديدة المطلوبة

| المتغير | المكان | القيمة | الاستخدام |
|---|---|---|---|
| `VITE_SITE_URL` | `C:\Users\admin\Desktop\WALIDAWNY\.env.production` + `.env.local` + `.env.example` | `https://walidawny.com` | canonical, sitemap, OG url, JSON-LD |
| `VITE_GSC_VERIFICATION` | `.env.production` | `token من GSC` | meta verification |
| `VITE_GA4_ID` | `.env.production` | `G-XXXXXXX` | GA4 |

---

## 2) Technical SEO — الأساس الزاحف

> الهدف العام: جعل الموقع **قابل للاكتشاف + قابل للزحف + قابل للفهرسة + آمن** بدون كسر SPA أو PWA.

| # | البند | الهدف | الإجراء الدقيق (خطوة بخطوة) | الملفات التي ستتعدل (مسارات مطلقة) | الأولوية | الوقت | KPI للقياس |
|---|---|---|---|---|---|---|---|
| T-01 | إنشاء `robots.txt` | توجيه الزحف وحماية المحتوى المحمي | 1. إنشاء `C:\Users\admin\Desktop\WALIDAWNY\public\robots.txt` بمحتوى: `User-agent: *\nAllow: /\nDisallow: /student/\nDisallow: /walid/\nDisallow: /admin/\nDisallow: /login\nDisallow: /register\nSitemap: https://walidawny.com/sitemap.xml` <br>2. تحديث `C:\Users\admin\Desktop\WALIDAWNY\vercel.json` لاستثناء `robots.txt` و `sitemap.xml` من الـ rewrite: `{"rewrites":[{"source":"/(sitemap.xml|robots.txt|og-image.jpg|icons/.*|manifest.webmanifest|sw.js)","destination":"/$1"}, ...]}` أو استخدام `rewrites` + `headers` بشكل صحيح | `C:\Users\admin\Desktop\WALIDAWNY\public\robots.txt` (جديد)<br>`C:\Users\admin\Desktop\WALIDAWNY\vercel.json` | **P0** | 1 ساعة | `https://walidawny.com/robots.txt` يعود 200 + يظهر في GSC |
| T-02 | إنشاء `sitemap.xml` ديناميكي | فهرسة سريعة لكل الصفحات العامة | 1. تثبيت `vite-plugin-sitemap` أو سكربت Node يولد `public/sitemap.xml` عند `build`<br>2. توليد URLs من مصفوفة الصفحات العامة + `lastmod` + `changefreq=weekly` + `priority` (1.0 للـ `/`, 0.8 لـ /pricing /subjects, 0.6 للباقي)<br>3. إضافة سكربت `scripts/generate-sitemap.mjs` يقرأ `VITE_SITE_URL` ويكتب `dist/sitemap.xml` بعد البناء<br>4. التأكد من وجود `sitemap.xml` في `dist/` بعد `npm run build` | `C:\Users\admin\Desktop\WALIDAWNY\scripts\generate-sitemap.mjs` (جديد)<br>`C:\Users\admin\Desktop\WALIDAWNY\package.json` (scripts)<br>`C:\Users\admin\Desktop\WALIDAWNY\vite.config.ts` (hook buildEnd)<br>`C:\Users\admin\Desktop\WALIDAWNY\public\sitemap.xml` (أو dist) | **P0** | 2-3 ساعات | GSC → Sitemaps: `Success` + عدد URLs = 10-12 + `Discovered` يرتفع |
| T-03 | Canonical ديناميكي لكل مسار | منع Duplicate Content بسبب SPA rewrites | 1. تثبيت `react-helmet-async@^2.0.5`<br>2. تغليف App بـ `<HelmetProvider>` في `C:\Users\admin\Desktop\WALIDAWNY\src\app\providers.tsx`<br>3. إنشاء Hook `useCanonical()` + كومبوننت `SeoHead` يضع `<link rel="canonical" href="https://walidawny.com{pathname}" />`<br>4. استدعاؤه في كل صفحة عامة (Landing, About, FAQ...) | `C:\Users\admin\Desktop\WALIDAWNY\package.json`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\app\providers.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\components\SeoHead.tsx` (جديد)<br>`C:\Users\admin\Desktop\WALIDAWNY\src\features\public\LandingPage.tsx`<br>وصفحات `src/features/public/*.tsx` الجديدة | **P0** | 2 ساعات | فحص View Source: كل URL له canonical واحد صحيح + لا self-canonical مكرر |
| T-04 | hreflang + lang/dir | استهداف عربي-مصر | 1. في `SeoHead`: إضافة `<html lang="ar" dir="rtl">` ديناميكي + `<link rel="alternate" hreflang="ar-EG" href="...">` + `<link rel="alternate" hreflang="x-default" href="...">`<br>2. التأكد من `index.html:2` يبقى `lang="ar" dir="rtl"` كـ fallback | `C:\Users\admin\Desktop\WALIDAWNY\index.html`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\components\SeoHead.tsx` | **P0** | 1 ساعة | GSC → International Targeting: 0 أخطاء hreflang |
| T-05 | إصلاح CSP المكسور | أمان + عدم كسر التحميل | **المشكلة الحالية `C:\Users\admin\Desktop\WALIDAWNY\vite.config.ts:30-31`:** يبحث عن `<meta name="theme-color" content="#047857" />` بينما الملف الحقيقي فيه `#070513` (السطر 10 في `index.html`) لذا لا يُحقن CSP إطلاقاً. + `script-src 'self'` بدون `unsafe-inline` يكسر Vite inline scripts.<br>**الإجراء:**<br>1. حذف بلوجن `inject-csp` الحالي<br>2. نقل CSP إلى `vercel.json` كـ HTTP Header (أفضل من meta):<br>`"headers":[{"source":"/(.*)","headers":[{"key":"Content-Security-Policy","value":"default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https://*.b-cdn.net https://video.bunnycdn.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.b-cdn.net https://video.bunnycdn.com https://www.google-analytics.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}]}]`<br>3. اختبار أن Google Fonts + Bunny + Supabase + GA4 تعمل بدون حظر | `C:\Users\admin\Desktop\WALIDAWNY\vite.config.ts`<br>`C:\Users\admin\Desktop\WALIDAWNY\vercel.json`<br>`C:\Users\admin\Desktop\WALIDAWNY\index.html` (إزالة meta CSP لو وجد) | **P0** | 2 ساعات | Console: 0 أخطاء CSP + Lighthouse Best Practices 100 + Fonts/Supabase/Bunny تحمل بنجاح |
| T-06 | Prerender للصفحات العامة (حل مشكلة CSR فقط) | محتوى HTML جاهز للزحف بدون JS | **الخيار الموصى به (بدون SSR كامل):** `vite-plugin-prerender` أو سكربت `react-snap` بديل بسيط.<br>1. تثبيت `vite-plugin-prerender` أو كتابة سكربت `scripts/prerender.mjs` يستخدم `playwright`/`puppeteer` لفتح `http://localhost:4173/` و `/about` و `/faq` ... وحفظ HTML في `dist/` (مثال: `dist/index.html`, `dist/about/index.html`)<br>2. إضافة `prerenderRoutes = ["/", "/about", "/how-it-works", "/pricing", "/faq", "/contact", "/subjects", "/privacy", "/terms"]` (بدون محتوى محمي)<br>3. التأكد أن `vercel.json` يخدم الملفات المسبقة قبل الـ rewrite (الترتيب مهم)<br>4. التحقق بـ `curl https://walidawny.com/ | grep "<h1"` يجد H1 بدون JS<br>**بديل مستقبلي P3:** ترحيل إلى Next.js/Remix SSR إذا نما المحتوى كثيراً | `C:\Users\admin\Desktop\WALIDAWNY\package.json`<br>`C:\Users\admin\Desktop\WALIDAWNY\vite.config.ts`<br>`C:\Users\admin\Desktop\WALIDAWNY\scripts\prerender.mjs` (جديد)<br>`C:\Users\admin\Desktop\WALIDAWNY\vercel.json` | **P0** | 6-8 ساعات | `view-source:https://walidawny.com/` يحتوي H1 + نص Landing كامل بدون JS + GSC → Live Test: `Page is indexed` |
| T-07 | noindex للصفحات المحمية | حماية المحتوى المحمي من الفهرسة | 1. في `SeoHead` إضافة `noindex, nofollow` شرطياً إذا `location.pathname` يبدأ بـ `/student` أو `/walid` أو `/admin` أو `/login` أو `/register`<br>2. التأكد أن `robots.txt` + `meta robots` متطابقان | `C:\Users\admin\Desktop\WALIDAWNY\src\components\SeoHead.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\app\router.tsx` (إضافة SeoHead للـ guards) | **P0** | 1 ساعة | GSC → Coverage: 0 صفحات محمية مفهرسة + `site:walidawny.com inurl:student` = 0 |
| T-08 | Redirects + Trailing Slash + 404 SEO | منع تشتت + تحسين تجربة الزحف | 1. توحيد Canonical بدون `/` نهائي (إلا `/`)<br>2. في `vercel.json` إضافة `cleanUrls: true` و `trailingSlash: false`<br>3. تحسين `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\NotFoundPage.tsx`: إضافة `SeoHead` بعنوان `404 — الصفحة غير موجودة | وليد عونى` + `noindex` + رابط داخلي للـ `/` + Structured Data Breadcrumb | `C:\Users\admin\Desktop\WALIDAWNY\vercel.json`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\features\public\NotFoundPage.tsx` | **P1** | 1.5 ساعة | لا Duplicate بسبب `/` vs `//` + صفحة 404 لا تُفهرس + معدل ارتداد 404 ينخفض |
| T-09 | Headers أمان + SEO | ثقة + ترتيب غير مباشر | إضافة Headers في `vercel.json`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=()` | `C:\Users\admin\Desktop\WALIDAWNY\vercel.json` | **P1** | 30 دقيقة | Security Headers: A على securityheaders.com + Lighthouse Best Practices 100 |
| T-10 | تحسين PWA بدون تضارب SEO | الحفاظ على PWA الممتاز الحالي | التأكد أن `sw.js` لا يعترض `sitemap.xml/robots.txt` (NetworkFirst) + تحديث `manifest.webmanifest` بإضافة `start_url: "/?utm_source=pwa"` لتتبع منفصل | `C:\Users\admin\Desktop\WALIDAWNY\public\sw.js`<br>`C:\Users\admin\Desktop\WALIDAWNY\public\manifest.webmanifest` | **P1** | 1 ساعة | PWA Lighthouse 100 + لا اعتراض لملفات SEO |

---

## 3) On-Page SEO — تحسين كل صفحة لتكون #1

> الهدف: كل URL عام له **عنوان فريد + وصف فريد + تسلسل عناوين H صحيح + روابط داخلية + صور بـ alt + OG**

| # | البند | الهدف | الإجراء الدقيق | الملفات التي ستتعدل | الأولوية | الوقت | KPI |
|---|---|---|---|---|---|---|---|
| O-01 | نظام Titles & Descriptions ديناميكي | CTR عالي + استهداف كلمات | **إنشاء `src/lib/seo.ts` مركزي:**<br>```ts\nexport const SEO = {\n  home: { title: "وليد عونى | منصة تعليمية متكاملة لطلاب إعدادي وثانوي", description: "منصة وليد عونى التعليمية — شرح منهج إعدادي وثانوي، وحدات مدى الحياة بكود WLDN، متابعة تقدم، فيديوهات حصرية ودعم واتساب مباشر." },\n  about: { title: "عن وليد عونى | مدرس و مطور منصة WALIDAWNY", description: "تعرف على مستر وليد عونى ونهجه التعليمي — منصة WALIDAWNY تمنحك وحدات مدى الحياة وشرح منهجي مبسط." },\n  pricing: { title: "أسعار الوحدات | منصة وليد عونى — شراء دائم WLDN", description: "أسعار وحدات وليد عونى — شراء مرة واحدة مدى الحياة أو تفعيل بكود WLDN. اطلع على أسعار كل صف ووحدة." },\n  // ... لكل صفحة\n}\n```<br>قواعد: Title 50-60 حرف عربي، Description 145-155 حرف، يتضمن كلمة مفتاحية رئيسية في أول 20 حرف. | `C:\Users\admin\Desktop\WALIDAWNY\src\lib\seo.ts` (جديد)<br>`C:\Users\admin\Desktop\WALIDAWNY\src\components\SeoHead.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\features\public\LandingPage.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\index.html` (إزالة title/description الثابت والاعتماد على Helmet) | **P0** | 3 ساعات | CTR في GSC يرتفع من ~1% إلى 4%+ خلال 14 يوم + كل صفحة لها Title فريد (فحص Screaming Frog) |
| O-02 | تسلسل Headings (H1→H2→H3) | فهم دلالي لمحركات البحث | **Landing الحالي:** H1 واحد فقط (`platformName`) صحيح لكن H2 مكرر بدون H3.<br>**الإجراء:**<br>1. في `LandingPage.tsx:290-294` اجعل H1 يتضمن كلمة مفتاحية: `<h1>وليد عونى — منصة تعليمية لطلاب إعدادي وثانوي</h1>` (بدل الاسم فقط)<br>2. كل سكشن له H2 واحد: `لماذا وليد عونى؟`, `كيف تبدأ رحلتك؟`, `أسعار الوحدات`, `الأسئلة الشائعة` (جديد)<br>3. داخل كل كارت H3<br>4. إنشاء صفحات جديدة كلها تبدأ بـ H1 فريد | `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\LandingPage.tsx`<br>وصفحات `src/features/public/*.tsx` الجديدة | **P0** | 2 ساعات | فحص W3C: تسلسل H صحيح 100% + لا H1 مكرر + Lighthouse SEO 100 |
| O-03 | Meta OG + Twitter Cards | معاينة غنية عند المشاركة (واتساب/فيسبوك) | في `SeoHead` إضافة:<br>`og:type=website`, `og:locale=ar_EG`, `og:site_name=وليد عونى`, `og:title`, `og:description`, `og:url`, `og:image=https://walidawny.com/og-image.jpg` (1200×630), `og:image:alt`, `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`<br>إنشاء `public/og-image.jpg` بتصميم: شعار + "وليد عونى — منصة تعليمية" + ألوان Aurora | `C:\Users\admin\Desktop\WALIDAWNY\src\components\SeoHead.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\public\og-image.jpg` (جديد)<br>`C:\Users\admin\Desktop\WALIDAWNY\index.html` (إزالة theme-color مكرر) | **P0** | 2 ساعات (1 للمصمم) | Facebook Sharing Debugger + Twitter Card Validator: 0 أخطاء + صورة تظهر 1200×630 |
| O-04 | الروابط الداخلية (Internal Linking) | توزيع PageRank + زحف أعمق | 1. في Landing Footer إضافة Nav SEO: روابط لـ `/about`, `/how-it-works`, `/subjects`, `/pricing`, `/faq`, `/contact`, `/blog`<br>2. Breadcrumbs في كل صفحة عامة فرعية (مثال: الرئيسية > المواد > تالتة إعدادي)<br>3. ربط متبادل: من `/pricing` إلى `/faq#codes` (كود التفعيل)، من Landing إلى `/subjects`<br>4. لا روابط لصفحات محمية (لا تمرر Link Juice لمحظور) | `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\LandingPage.tsx` (FooterNav)<br>`C:\Users\admin\Desktop\WALIDAWNY\src\components\Breadcrumbs.tsx` (جديد)<br>`C:\Users\admin\Desktop\WALIDAWNY\src\app\router.tsx` | **P1** | 2 ساعات | متوسط الروابط الداخلية لكل صفحة = 8-12 + GSC → Links → Internal Links يرتفع |
| O-05 | صور + Alt + Lazy | إتاحة + سرعة + Image SEO | 1. إضافة `alt` وصفي عربي لكل `<img>` (إن وجدت مستقبلاً) — مثال: `alt="شرح منهج تالتة إعدادي — وليد عونى"`<br>2. إضافة `loading="lazy"` و `decoding="async"` لكل صورة غير Hero<br>3. تحويل `og-image.jpg` + أيقونات إلى `webp` مع fallback<br>4. إضافة `width` + `height` لمنع CLS | `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\LandingPage.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\public\icons\*`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\components\*.tsx` (أي كومبوننت فيه صور) | **P1** | 1.5 ساعة | Lighthouse → Accessibility 100 + CLS < 0.1 + Google Images يظهر `og-image` |
| O-06 | تحسين Landing النصي الحالي (بدون كشف محمي) | استهداف Long-tail من الصفحة الرئيسية | **الحالي:** نص تسويقي عام فقط (62 حرف وصف).<br>**الإجراء:**<br>1. إضافة سكشن جديد قبل الفوتر: **FAQ مصغر (4 أسئلة)** + رابط `اعرض كل الأسئلة ← /faq` (يُغذي FAQPage Structured Data)<br>2. إضافة سكشن **"ماذا ستتعلم؟"** بفقرة 120 كلمة تتضمن كلمات: `منهج تالتة إعدادي`, `تانية إعدادي`, `أولى ثانوي`, `شرح مبسط`, `كود تفعيل WLDN`, `وحدات مدى الحياة` (بدون كشف دروس)<br>3. تحويل النص إلى `<p>` دلالي وليس `div` فقط | `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\LandingPage.tsx` | **P1** | 3 ساعات | كثافة كلمات براند 2-3% + ظهور Landing لـ 5+ استعلامات Long-tail خلال 21 يوم |
| O-07 | 404 + صفحات تسجيل محسّنة | عدم تسريب ترتيب | `LoginPage` و `RegisterPage` حالياً `GuestOnly` لكن قابلة للفهرسة — أضف `noindex` لها (لا قيمة SEO) + عنوان فريد: `تسجيل الدخول | وليد عونى` | `C:\Users\admin\Desktop\WALIDAWNY\src\features\auth\LoginPage.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\features\auth\RegisterPage.tsx` | **P1** | 1 ساعة | `site:walidawny.com inurl:login` لا يظهر بعد 7 أيام |

---

## 4) Content SEO — استراتيجية المحتوى للوصول لـ #1

> الهدف: السيطرة على **Brand + Category + Long-tail + FAQ** بدون كشف محتوى محمي.

### 4.1 خريطة الكلمات المفتاحية (Keyword Map)

| النوع | أمثلة كلمات (بحث شهري تقديري مصر) | الصفحة المستهدفة | النية | الأولوية |
|---|---|---|---|---|
| **Brand** | `وليد عونى`, `وليد عوني`, `منصة وليد عونى`, `مستر وليد عونى`, `walid awny` | `/` (Landing) + `/about` | Navigational | **P0** — يجب أن تكون #1 خلال 7 أيام |
| **Brand + Transactional** | `كود تفعيل وليد عونى`, `WLDN كود`, `تفعيل وحدة وليد عونى`, `شراء وحدة وليد عونى` | `/pricing` + `/faq#codes` + `/how-it-works` | Transactional | P0 |
| **Category** | `منصة تعليمية إعدادي`, `منصة تعليمية ثانوي`, `شرح منهج إعدادي`, `دروس أونلاين مصر` | `/subjects` + `/` | Commercial | P1 |
| **Long-tail (صفوف)** | `شرح منهج تالتة إعدادي ترم أول`, `منهج تانية إعدادي وليد عونى`, `شرح أولى ثانوي`, `مراجعة تالتة إعدادي` | `/subjects/:gradeSlug` (Teaser) + `/blog/:slug` | Informational | P1 |
| **FAQ / People Also Ask** | `هل كود WLDN مدى الحياة؟`, `كيف أفعل الوحدة؟`, `هل المنصة بديلة للدروس الخصوصية؟`, `طرق الدفع؟`, `هل يوجد واتساب دعم؟` | `/faq` (FAQPage Rich Result) | Informational | P0 |
| **Local/Trust** | `مدرس إعدادي القاهرة`, `أفضل منصة إعدادي مصر`, `وليد عونى عنوان` | `/contact` + `/about` | Local | P2 |

### 4.2 الصفحات الجديدة المقترحة — بدون كشف محتوى محمي

| # | المسار | الهدف SEO | المحتوى (Teaser فقط) — لا كشف فيديو/ملف | الكلمات المستهدفة | عدد الكلمات | الأولوية | الوقت |
|---|---|---|---|---|---|---|---|
| C-01 | `/about` | E-E-A-T + Brand | سيرة مستر وليد عونى (تعليم، خبرة، فلسفة شرح مبسط) + صور عامة + شهادات/إنجازات + CTA للتسجيل — **لا يوجد جدول دروس** | `وليد عونى`, `مستر وليد عونى سيرة` | 600-800 | P1 | 4 ساعات |
| C-02 | `/how-it-works` | Transactional — تحويل | 3 خطوات مفصلة + فيديو تعريفي عام (YouTubeEmbed public) + شرح كود WLDN-XXXX + FAQ مصغر | `كود تفعيل`, `كيف أبدأ` | 500 | P1 | 3 ساعات |
| C-03 | `/subjects` | Category Hub | شبكة كروت للصفوف (إعدادي 1-3، ثانوي 1-3) — كل كارت: اسم الصف + وصف عام 30 كلمة + عدد الوحدات (رقم فقط) + رابط للتفصيل — **لا أسماء دروس تفصيلية** | `منصة إعدادي`, `مواد ثانوي` | 400 | P1 | 3 ساعات |
| C-04 | `/subjects/:gradeSlug` (×4-6 صفحات) | Long-tail Grade | H1: `شرح منهج تالتة إعدادي — وليد عونى` + فقرة 200 كلمة عن المنهج بشكل عام + قائمة وحدات بالأسماء فقط (بدون محتوى) + أسعار الوحدات + CTA واتساب — مثال: `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\GradeLandingPage.tsx` ديناميكي | `شرح تالتة إعدادي`, `منهج تانية إعدادي` | 350/صفحة | P1 | 6 ساعات |
| C-05 | `/pricing` | Transactional — مقارنة | جدول أسعار مجمع (نفس `getPublicUnitPrices` لكن مع SEO: H2 لكل صف، H3 لكل وحدة، FAQ أسفل الجدول) + شرح رسوم المنصة + ضمان مدى الحياة | `أسعار وليد عونى`, `شراء وحدة` | 500 | P1 | 3 ساعات |
| C-06 | `/faq` | FAQ Rich Result — #1 سريع | 12-15 سؤال/جواب منظمة بـ Accordion + JSON-LD FAQPage — أسئلة حقيقية من الطلاب (كود، دفع، واتساب، مدى الحياة، استرجاع) | `كود WLDN`, `هل المنصة آمنة` | 1200 | **P0** | 4 ساعات |
| C-07 | `/contact` | Local + Trust | واتساب مباشر + ساعات العمل + نموذج تواصل (Formspree أو Supabase public) + خريطة (اختيارية) — NAP ثابت | `تواصل وليد عونى` | 300 | P1 | 2 ساعات |
| C-08 | `/blog` + `/blog/:slug` (3 مقالات أولية) | Long-form — Authority | مقالات 800-1000 كلمة: `كيف تذاكر تالتة إعدادي بذكاء`, `أخطاء شائعة في الامتحانات وكيف تتجنبها`, `لماذا الشراء الدائم أفضل من الاشتراك الشهري` — **بدون كشف دروس** + صور + CTA داخلي | Long-tail تعليمي | 800/مقال | P2 | 8 ساعات |
| C-09 | `/privacy` + `/terms` | E-E-A-T + Trust | سياسة خصوصية وشروط (قالب قانوني عربي) — توقيع وتاريخ تحديث | — | 600/صفحة | P1 | 2 ساعات |

> **قاعدة ذهبية للمحتوى المحمي:** أي صفحة عامة تعرض **اسم الوحدة + اسم الصف + السعر فقط**. لا تعرض: عنوان درس تفصيلي، وصف فيديو، ملف PDF، رابط Bunny، مدة الفيديو، نسبة الإنجاز. هذه تبقى خلف Auth.

### 4.3 تقويم المحتوى — أول 30 يوم

| الأسبوع | الإنتاج | النشر | الهدف |
|---|---|---|---|
| 1 | `/faq` + تحسين Landing (FAQ مصغر) | فوري بعد P0 | الظهور في PAA + FAQ Rich Result |
| 2 | `/about` + `/how-it-works` + `/pricing` + `/subjects` | دفعـة واحدة + Sitemap ping | تغطية Brand + Transactional |
| 3 | `/subjects/:gradeSlug` ×4 + `/contact` + `/privacy` + `/terms` | تدريجي (صفحة/يوم) | Long-tail Grade |
| 4 | 3 مقالات Blog + تحديث Landing بمقطع "ماذا ستتعلم" | مقال كل 2-3 أيام | Authority + Internal Linking |

### 4.4 KPIs المحتوى

| KPI | أداة | هدف 30 يوم |
|---|---|---|
| عدد الصفحات المفهرسة (Coverage) | GSC | 12-15 صفحة |
| متوسط ترتيب Brand Keywords | GSC → Performance | #1 لـ 5/5 كلمات Brand |
| ظهور FAQ Rich Results | GSC → Enhancements | 3+ أسئلة تظهر بـ Rich |
| زيارات عضوية (Organic Clicks) | GA4 | 500+ زيارة/شهر أول (من الصفر) |
| CTR للـ Landing | GSC | ≥4% |

---

## 5) Structured Data — Rich Results

> الهدف: تحويل نتائج البحث العادية إلى **Rich Results** (نجوم، FAQ، Breadcrumbs، Video).

| # | النوع | الصفحات | الهدف | الإجراء الدقيق + مثال JSON-LD | الملفات | الأولوية | الوقت | KPI |
|---|---|---|---|---|---|---|---|
| S-01 | `Organization` + `EducationalOrganization` | كل الصفحات (global) | Knowledge Panel + Brand | إضافة JSON-LD في `SeoHead` (global):<br>```json\n{\n  "@context":"https://schema.org",\n  "@type":"EducationalOrganization",\n  "name":"وليد عونى",\n  "alternateName":"WALIDAWNY",\n  "url":"https://walidawny.com",\n  "logo":"https://walidawny.com/icons/icon-512.png",\n  "image":"https://walidawny.com/og-image.jpg",\n  "description":"منصة وليد عونى التعليمية — شرح منهج إعدادي وثانوي، وحدات مدى الحياة بكود WLDN.",\n  "sameAs":["https://wa.me/201XXXXXXXXX","https://www.facebook.com/...","https://www.youtube.com/..."],\n  "address":{"@type":"PostalAddress","addressCountry":"EG","addressRegion":"Cairo"}\n}\n``` | `C:\Users\admin\Desktop\WALIDAWNY\src\components\SeoHead.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\lib\seo.ts` | **P0** | 1.5 ساعة | Rich Results Test: Valid + GSC → Enhancements يظهر Organization |
| S-02 | `WebSite` + `SearchAction` | `/` | Sitelinks Search Box | ```json\n{"@type":"WebSite","name":"وليد عونى","url":"https://walidawny.com","potentialAction":{"@type":"SearchAction","target":"https://walidawny.com/search?q={search_term_string}","query-input":"required name=search_term_string"}}\n``` (حتى لو لا يوجد /search فعلي، يبقى placeholder) | `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\LandingPage.tsx` (عبر SeoHead) | P1 | 30 دقيقة | يظهر مربع بحث تحت النتيجة في Google |
| S-03 | `BreadcrumbList` | كل صفحة فرعية (`/about`, `/subjects/:grade`, `/blog/:slug`) | Breadcrumbs في SERP | توليد ديناميكي من `Breadcrumbs.tsx`:<br>```json\n{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"الرئيسية","item":"https://walidawny.com/"},{"@type":"ListItem","position":2,"name":"المواد","item":"https://walidawny.com/subjects"},{"@type":"ListItem","position":3,"name":"تالتة إعدادي","item":"https://walidawny.com/subjects/third-prep"}]}\n``` | `C:\Users\admin\Desktop\WALIDAWNY\src\components\Breadcrumbs.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\components\SeoHead.tsx` | **P1** | 1 ساعة | Breadcrumbs تظهر في SERP بدل URL عادي |
| S-04 | `Course` | `/subjects/:gradeSlug` + `/pricing` (Teaser) | Course Rich Result | لكل صف/وحدة (Teaser):<br>```json\n{"@type":"Course","name":"تالتة إعدادي — وحدة 1: الجبر","description":"شرح مبسط لوحدة الجبر لطلاب تالتة إعدادي — متاح مدى الحياة بكود WLDN.","provider":{"@type":"EducationalOrganization","name":"وليد عونى","sameAs":"https://walidawny.com"},"offers":{"@type":"Offer","price":"149","priceCurrency":"EGP","availability":"https://schema.org/InStock","url":"https://walidawny.com/pricing"}}\n```<br>**تحذير:** لا تضع `hasCourseInstance` بفيديو أو `courseCode` حقيقي — Teaser فقط. | `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\GradeLandingPage.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\lib\seo.ts` | P1 | 2 ساعات | Course Rich Result يظهر (السعر + المزود) |
| S-05 | `FAQPage` | `/faq` + FAQ مصغر في `/` | FAQ Rich Result (أهم مصدر CTR) | 12-15 سؤال:<br>```json\n{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"هل كود WLDN مدى الحياة؟","acceptedAnswer":{"@type":"Answer","text":"نعم، شراء الوحدة مرة واحدة يفتحها مدى الحياة بدون اشتراك شهري. الكود بصيغة WLDN-XXXX يُفعل مرة واحدة."}}]}\n```<br>يجب أن يطابق النص الظاهر في الصفحة حرفياً. | `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\FaqPage.tsx` (جديد) | **P0** | 2 ساعات | 3+ أسئلة تظهر كـ FAQ Rich في SERP خلال 7-14 يوم |
| S-06 | `VideoObject` | `/how-it-works` (فيديو تعريفي عام فقط) | Video Rich Result | لفيديو YouTube العام (ليس Bunny المحمي):<br>```json\n{"@type":"VideoObject","name":"كيف تبدأ رحلتك في منصة وليد عونى","description":"شرح 90 ثانية لخطوات التسجيل وتفعيل الوحدة بكود WLDN.","thumbnailUrl":"https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg","uploadDate":"2026-08-23","contentUrl":"https://www.youtube.com/watch?v=VIDEO_ID","embedUrl":"https://www.youtube.com/embed/VIDEO_ID"}\n``` | `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\HowItWorksPage.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\components\YouTubeEmbed.tsx` | P2 | 1 ساعة | Video thumbnail يظهر في SERP |
| S-07 | `Article` / `BlogPosting` | `/blog/:slug` | Article Rich Result | لكل مقال: `headline`, `author: وليد عونى`, `datePublished`, `image`, `articleBody` (مقتطف) | `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\BlogPostPage.tsx` | P2 | 1 ساعة | Article Rich يظهر مع تاريخ وصورة |

> **التحقق الإلزامي بعد كل Structured Data:** اختبار عبر `https://validator.schema.org/` + `https://search.google.com/test/rich-results` + GSC → Enhancements. أي خطأ = إصلاح فوري.

---

## 6) Off-Page / Authority — بناء الثقة خارج الموقع

| # | البند | الهدف | الإجراء الدقيق | الملفات/المنصات | الأولوية | الوقت | KPI |
|---|---|---|---|---|---|---|---|
| F-01 | Google Search Console + Bing Webmaster | فهرسة + مراقبة | 1. إنشاء Property `https://walidawny.com` (Domain + URL prefix) في GSC<br>2. التحقق عبر `meta name="google-site-verification"` (من `VITE_GSC_VERIFICATION`) أو DNS TXT<br>3. إرسال `sitemap.xml`<br>4. إعداد Bing Webmaster بنفس الطريقة<br>5. تفعيل Email alerts للأخطاء | `C:\Users\admin\Desktop\WALIDAWNY\index.html` (meta verification)<br>`C:\Users\admin\Desktop\WALIDAWNY\src\components\SeoHead.tsx`<br>GSC + Bing dashboards | **P0** | 1 ساعة | GSC: Verified + Sitemap Success + 0 Coverage errors |
| F-02 | Google Analytics 4 + GTM | قياس سلوك + تحويل | 1. إنشاء GA4 Property + Data Stream `https://walidawny.com`<br>2. تثبيت `gtag.js` عبر `SeoHead` (أو GTM):<br>```html\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-XXXX');</script>\n```<br>3. إضافة CSP exception لـ `googletagmanager.com` و `google-analytics.com` (تم في T-05)<br>4. إعداد Conversions: `register_click`, `whatsapp_click`, `pricing_view` | `C:\Users\admin\Desktop\WALIDAWNY\src\components\SeoHead.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\index.html`<br>`C:\Users\admin\Desktop\WALIDAWNY\vercel.json` | **P0** | 1.5 ساعة | GA4: Realtime يظهر زيارات + Events تُسجل + GSC مرتبط بـ GA4 |
| F-03 | ملفات تعريف اجتماعية موثقة | E-E-A-T + Backlinks اجتماعية | 1. إنشاء/توثيق: Facebook Page, YouTube Channel, WhatsApp Business, TikTok, Instagram — كلها باسم `وليد عونى` و `WALIDAWNY`<br>2. وضع رابط `https://walidawny.com` في كل Bio + `sameAs` في Organization JSON-LD<br>3. نشر 3 فيديوهات قصيرة تعريفية (Reels) تربط للمنصة | خارج الكود — لكن `C:\Users\admin\Desktop\WALIDAWNY\src\lib\seo.ts` (sameAs) + `LandingPage.tsx` (أيقونات سوشيال) | **P1** | 4 ساعات (محتوى) | 5 Profiles نشطة + كلها تربط للدومين + Knowledge Panel يبدأ يظهر |
| F-04 | بناء Backlinks آمن (بدون Spam) | Authority + ترتيب | **مسموح فقط White-hat:**<br>1. تسجيل المنصة في أدلة تعليمية مصرية (مثال: دليل مدارس، منصات تعليمية)<br>2. مقال ضيف (Guest Post) في مدونة تعليمية عربية (1-2 مقال)<br>3. مشاركة `/blog` مقالات في جروبات فيسبوك تعليمية + Reddit r/Egypt<br>4. **ممنوع:** شراء روابط، PBN، تعليقات سبام، تبادل روابط جماعي | خارج الكود — تتبع في `reports/backlinks-log.md` (جديد) | P2 | مستمر 2 ساعة/أسبوع | Referring Domains: 5+ خلال 30 يوم + Domain Rating يبدأ يرتفع (Ahrefs) |
| F-05 | إدارة السمعة + Reviews | Trust + Local Pack | 1. إنشاء Google Business Profile (لو يوجد مقر/سنتر) — فئة `Educational institution`<br>2. طلب 10 تقييمات من طلاب حقيقيين (5 نجوم)<br>3. إضافة `AggregateRating` JSON-LD بعد 10 تقييمات | `C:\Users\admin\Desktop\WALIDAWNY\src\lib\seo.ts` (AggregateRating) | P2 | 2 ساعات | 10 Reviews + متوسط 4.8+ + ظهور في Local Pack لـ "مدرس إعدادي" |
| F-06 | مراقبة الروابط المكسورة + Mention | حماية Authority | إعداد تنبيه Google Alerts لـ `وليد عونى` + `walidawny` + فحص شهري بـ Ahrefs/Majestic | `C:\Users\admin\Desktop\WALIDAWNY\scripts\check-links.mjs` (اختياري) | P2 | 30 دقيقة/شهر | 0 Broken Backlinks + الرد على كل Mention خلال 48 ساعة |

---

## 7) Local / Arabic SEO — السيطرة على البحث العربي-المصري

| # | البند | الهدف | الإجراء الدقيق | الملفات | الأولوية | الوقت | KPI |
|---|---|---|---|---|---|---|---|
| L-01 | `lang` + `hreflang` + `og:locale` | استهداف `ar-EG` | 1. `index.html:2` → `<html lang="ar" dir="rtl">` (موجود صحيح — الحفاظ عليه)<br>2. في `SeoHead`: `og:locale=ar_EG` + `og:locale:alternate=en_US` (لو وجد إنجليزي مستقبلاً)<br>3. `hreflang="ar-EG"` + `x-default` لكل صفحة<br>4. `meta name="language" content="Arabic"` | `C:\Users\admin\Desktop\WALIDAWNY\index.html`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\components\SeoHead.tsx` | **P0** | 30 دقيقة | GSC → Language: ar-EG يظهر + مشاركة واتساب تظهر `ar_EG` |
| L-02 | كتابة عربية سليمة (إملاء + تشكيل خفيف) | مطابقة استعلامات المستخدمين | 1. توحيد كتابة الاسم: `وليد عونى` (بالياء المعقودة) في كل Title/H1/JSON-LD — مع إضافة `alternateName` يتضمن `وليد عوني` (بالياء العادية) لالتقاط كلتا الكتابتين<br>2. استخدام مصطلحات يبحث عنها الطلاب حرفياً: `تالتة إعدادي` (وليس `الثالث الإعدادي`), `كود التفعيل`, `شرح المنهج`<br>3. وصف 62 حرف الحالي يُستبدل بوصف 150 حرف يتضمن `مصر`, `إعدادي`, `ثانوي` | `C:\Users\admin\Desktop\WALIDAWNY\src\lib\seo.ts`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\features\public\LandingPage.tsx` | **P0** | 1 ساعة | ظهور لـ `وليد عوني` و `وليد عونى` معاً + CTR يرتفع للكتابتين |
| L-03 | NAP + LocalBusiness (لو وجد مقر) | Local Pack | في `/contact` إضافة: الاسم، العنوان (حي/مدينة)، الهاتف (نفس واتساب)، ساعات العمل — بصيغة ثابتة في كل مكان + JSON-LD `LocalBusiness` أو `EducationalOrganization` مع `address` | `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\ContactPage.tsx` (جديد) | P1 | 1.5 ساعة | NAP متطابق في كل مكان + GBP يظهر |
| L-04 | RTL + خطوط عربية محسّنة | تجربة مستخدم عربية | التأكد أن كل صفحة جديدة تستخدم `dir="rtl"` + خطوط Tajawal/Cairo/Changa مع `display=swap` (انظر P-03) + اختبار القراءة على موبايل | `C:\Users\admin\Desktop\WALIDAWNY\index.html`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\index.css` | P1 | 30 دقيقة | Lighthouse Accessibility 100 + لا كسر RTL |
| L-05 | محتوى بلهجة مصرية مبسطة | تقارب مع نية البحث | كتابة FAQ والمقالات بلهجة بيضاء مصرية مبسطة (مثال: `إزاي أفعل الكود؟` بجانب `كيف أفعل الكود؟`) — يلتقط استعلامات عامية | `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\FaqPage.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\features\public\BlogPostPage.tsx` | P2 | 1 ساعة | ظهور لـ استعلامات عامية في GSC → Queries |

---

## 8) Performance — Core Web Vitals (LCP, INP, CLS)

> الهدف: **LCP < 2.5s, INP < 200ms, CLS < 0.1** على موبايل 4G — شرط أساسي للترتيب #1 (Page Experience).

| # | البند | الهدف | الإجراء الدقيق | الملفات | الأولوية | الوقت | KPI |
|---|---|---|---|---|---|---|---|
| P-01 | Code Splitting + Lazy Routes | تقليل JS الأولي من ~400KB إلى <150KB | 1. تحويل كل Route في `C:\Users\admin\Desktop\WALIDAWNY\src\app\router.tsx` إلى `React.lazy(() => import(...))` + `<Suspense fallback={<Spinner>}>`<br>2. في `vite.config.ts` إضافة `build.rollupOptions.output.manualChunks = { vendor: ['react','react-dom','react-router-dom'], supabase: ['@supabase/supabase-js'], ui: ['lucide-react'] }`<br>3. التأكد أن `/` لا يحمّل كود `/walid/*` أو `/student/*` | `C:\Users\admin\Desktop\WALIDAWNY\src\app\router.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\vite.config.ts`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\app\App.tsx` | **P1** | 3 ساعات | Lighthouse Performance: 90+ → 95+ + JS الأولي <150KB (Network tab) |
| P-02 | إزالة `hls.js` من Landing Bundle | LCP أسرع بـ 300-500ms | **الحالي:** `hls.js@1.6.17` في `package.json:23` يُحمّل مع Landing حتى لو لا يوجد فيديو.<br>**الإجراء:**<br>1. إزالة `import Hls from 'hls.js'` الثابت من `C:\Users\admin\Desktop\WALIDAWNY\src\components\VideoPlayer.tsx`<br>2. تحويله إلى `const Hls = (await import('hls.js')).default` ديناميكي داخل `useEffect` فقط عند الحاجة<br>3. إضافة `/* viteChunkName: "hls" */` لعزل Chunk<br>4. التأكد أن Landing لا يطلب `hls.js` إطلاقاً (Network → filter hls) | `C:\Users\admin\Desktop\WALIDAWNY\src\components\VideoPlayer.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\vite.config.ts` (manualChunks) | **P1** | 2 ساعات | Landing JS يقل ~80KB + LCP يتحسن 0.4s + لا طلب hls في Landing |
| P-03 | إصلاح خطوط Google Fonts | إزالة FOIT + CLS | **الحالي `C:\Users\admin\Desktop\WALIDAWNY\index.html:23-24`:** رابط بدون `display=swap` + 3 عائلات (Cairo 4 أوزان + Changa 3 + Tajawal 4 = 11 وزن!)<br>**الإجراء:**<br>1. تغيير الرابط إلى: `https://fonts.googleapis.com/css2?family=Cairo:wght@700;800&family=Changa:wght@700&family=Tajawal:wght@400;700&display=swap` (تقليل الأوزان من 11 إلى 5 — توفير ~60KB)<br>2. إضافة `<link rel="preload" as="style" href="...">` + `<link rel="preconnect" ...>` موجود صحيح — الإبقاء<br>3. في `src/index.css:14-15` إضافة `font-display: swap` ضمن `@font-face` لو استخدمت خطوط محلية مستقبلاً<br>4. اختبار FOIT: Lighthouse → Avoid invisible text | `C:\Users\admin\Desktop\WALIDAWNY\index.html`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\index.css` | **P1** | 1 ساعة | Lighthouse → Diagnostics: 0 `Ensure text remains visible` + CLS <0.05 + توفير 60KB |
| P-04 | تحسين صور + Lazy + Preload Hero | LCP <2.5s | 1. ضغط `og-image.jpg` إلى <120KB (Squoosh, 85% quality, 1200×630)<br>2. Preload صورة Hero لو وجدت: `<link rel="preload" as="image" href="/og-image.jpg">`<br>3. كل صور المحتوى: `loading="lazy"` + `decoding="async"` + `width/height`<br>4. تحويل أيقونات PNG إلى WebP مع fallback | `C:\Users\admin\Desktop\WALIDAWNY\public\og-image.jpg`<br>`C:\Users\admin\Desktop\WALIDAWNY\index.html`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\features\public\LandingPage.tsx` | P1 | 1.5 ساعة | LCP: من ~3.2s إلى <2.5s (Lighthouse Mobile) + Total Image Weight <300KB |
| P-05 | تقليل CSS + إزالة Unused | FCP أسرع | 1. تفعيل `tailwindcss` purge (موجود تلقائياً في v4) — التأكد أن `dist/assets/*.css` <50KB<br>2. إزالة Keyframes غير مستخدمة من `src/index.css` لو لم تُستعمل في الصفحات العامة<br>3. استخدام `content-visibility: auto` للسكاشن أسفل الطي (Pricing, FAQ) | `C:\Users\admin\Desktop\WALIDAWNY\src\index.css`<br>`C:\Users\admin\Desktop\WALIDAWNY\vite.config.ts` (cssCodeSplit) | P2 | 1 ساعة | CSS <50KB + FCP <1.8s |
| P-06 | Prefetch + Preconnect ذكي | INP + TTI | 1. إضافة `preconnect` لـ `https://*.supabase.co` و `https://video.bunnycdn.com` فقط في الصفحات التي تحتاجها (Student/Walid) — لا تضعها في Landing العام<br>2. إضافة `<link rel="prefetch" href="/about">` في Landing (Hover prefetch لصفحات عامة)<br>3. استخدام `fetchpriority="high"` لصورة Hero/H1 | `C:\Users\admin\Desktop\WALIDAWNY\index.html`<br>`C:\Users\admin\Desktop\WALIDAWNY\src\features\public\LandingPage.tsx` | P2 | 1 ساعة | INP <200ms + TTI <3s |
| P-07 | قياس مستمر CWV | مراقبة | 1. تثبيت `web-vitals` وإرسال LCP/INP/CLS إلى GA4:<br>`import {onLCP,onINP,onCLS} from 'web-vitals'; onLCP(console.log);`<br>2. إعداد CrUX Dashboard في GSC + PageSpeed Insights API مراقبة أسبوعية | `C:\Users\admin\Desktop\WALIDAWNY\src\main.tsx`<br>`C:\Users\admin\Desktop\WALIDAWNY\package.json` | P1 | 1 ساعة | CrUX: 75th percentile LCP <2.5s خلال 28 يوم |

---

## 9) خطة التنفيذ — 4 مراحل زمنية

### المرحلة P0 — حرج — الأسبوع 1 (الأساس الذي بدونه لا فهرسة)

> **الهدف:** من 2/10 إلى 6/10 — موقع قابل للفهرسة + يظهر لـ Brand Keywords في الصفحة الأولى.

| اليوم | المهام | الملفات الرئيسية | المخرجات القابلة للتحقق |
|---|---|---|---|
| 1 | T-01 robots.txt + T-02 sitemap + T-03 canonical + T-04 hreflang + O-01 titles/descriptions + تثبيت `react-helmet-async` | `public/robots.txt`, `scripts/generate-sitemap.mjs`, `src/components/SeoHead.tsx`, `src/lib/seo.ts`, `src/app/providers.tsx`, `vercel.json` | `https://walidawny.com/robots.txt` 200 + sitemap 10 URLs + كل صفحة لها canonical صحيح |
| 2 | T-05 إصلاح CSP + T-07 noindex للمحمي + T-08 404 + O-03 OG/Twitter + إنشاء `og-image.jpg` | `vite.config.ts`, `vercel.json`, `src/features/public/NotFoundPage.tsx`, `public/og-image.jpg`, `index.html` | 0 أخطاء CSP + OG يظهر في Debugger + /login noindex |
| 3 | T-06 Prerender للصفحات العامة (Landing + About skeleton + FAQ skeleton) + O-02 Headings | `scripts/prerender.mjs`, `vite.config.ts`, `src/features/public/LandingPage.tsx` | `curl` بدون JS يجد H1 + نص كامل + view-source يحتوي وصف 150 حرف |
| 4 | F-01 GSC + Bing + F-02 GA4 + T-10 PWA check + L-01/L-02 Arabic | `index.html`, `src/components/SeoHead.tsx`, GSC dashboards | GSC Verified + Sitemap Submitted + GA4 Realtime يعمل |
| 5 | O-06 تحسين Landing (FAQ مصغر 4 أسئلة + فقرة "ماذا ستتعلم" 120 كلمة) + S-01 Organization + S-05 FAQPage (مصغر) | `src/features/public/LandingPage.tsx`, `src/lib/seo.ts` | Landing يحتوي 4 FAQ + JSON-LD Valid + Rich Results Test Pass |
| 6-7 | اختبار شامل + إصلاح أخطاء + إرسال Indexing Request لـ `/` في GSC + مراقبة | كل الملفات | GSC → URL Inspection: `URL is on Google` + Lighthouse SEO 100 + Performance 90+ |

**KPIs نهاية P0:**
- GSC: 1 صفحة مفهرسة (`/`) خلال 48 ساعة (Request Indexing)
- Lighthouse SEO: 100
- 0 أخطاء Coverage
- ظهور لـ `وليد عونى` في الصفحة 1 (موضع 5-10) خلال 7 أيام

---

### المرحلة P1 — مهم — الأسبوع 2 (التوسع العام + Rich Results)

> **الهدف:** من 6/10 إلى 8/10 — 10-12 صفحة مفهرسة + FAQ Rich + Course Rich + Brand #1.

| اليوم | المهام | الملفات | المخرجات |
|---|---|---|---|
| 8-9 | إنشاء صفحات `/about`, `/how-it-works`, `/pricing` (كاملة SEO) + O-04 Internal Linking + S-03 Breadcrumb + S-04 Course (Teaser) | `src/features/public/AboutPage.tsx` (جديد)<br>`src/features/public/HowItWorksPage.tsx` (جديد)<br>`src/features/public/PricingPage.tsx` (جديد — منفصل عن `src/features/walid/PricingPage.tsx`)<br>`src/components/Breadcrumbs.tsx`<br>`src/app/router.tsx` | 3 صفحات جديدة + كلها canonical + Breadcrumb JSON-LD Valid + sitemap محدث 7 URLs |
| 10-11 | إنشاء `/subjects` Hub + `/subjects/:gradeSlug` ×4 (تالتة/تانية/أولى إعدادي + أولى ثانوي) + `/contact` + `/faq` كاملة (12 سؤال) + S-05 FAQPage كامل | `src/features/public/SubjectsPage.tsx`<br>`src/features/public/GradeLandingPage.tsx`<br>`src/features/public/FaqPage.tsx`<br>`src/features/public/ContactPage.tsx` | 7 صفحات جديدة + FAQPage 12 سؤال + sitemap 12 URL + كل صفحة H1 فريد + Course JSON-LD |
| 12 | `/privacy` + `/terms` + S-01/S-02 WebSite + S-03 Breadcrumb لكل الصفحات + تحديث FooterNav بروابط داخلية | `src/features/public/PrivacyPage.tsx`<br>`src/features/public/TermsPage.tsx`<br>`src/lib/seo.ts` | Footer يحتوي 8 روابط + Breadcrumb في كل صفحة فرعية |
| 13 | P-01 Code Splitting + P-02 hls.js lazy + P-03 Fonts display=swap + P-04 Images + P-07 web-vitals | `src/app/router.tsx` (lazy)<br>`src/components/VideoPlayer.tsx` (dynamic import)<br>`index.html` (fonts)<br>`vite.config.ts` (manualChunks)<br>`src/main.tsx` (web-vitals) | JS الأولي <150KB + لا hls في Landing + Lighthouse Performance 95+ + LCP <2.5s |
| 14 | اختبار شامل: Rich Results Test لكل صفحة + GSC Sitemap resubmit + طلب فهرسة لكل URL جديد + إصلاح أخطاء | كل الصفحات | GSC → Sitemaps: 12 URL Discovered + Rich Results: 0 Errors + Brand Keyword #1 |

**KPIs نهاية P1:**
- GSC: 12 URL مفهرسة
- Brand Keywords: #1 لـ `وليد عونى` + `منصة وليد عونى` (المركز 1-2)
- FAQ Rich: 3+ أسئلة تظهر في SERP
- Lighthouse Performance: 90+ (Mobile)
- Organic Clicks: 50-100/أسبوع

---

### المرحلة P2 — تحسين — الأسبوع 3-4 (المحتوى الطويل + Performance نهائي + Authority)

> **الهدف:** من 8/10 إلى 9.5/10 — Top 3 لـ Category Keywords + Authority + CWV ممتاز.

| الأسبوع | المهام | الملفات | المخرجات |
|---|---|---|---|
| 3 (يوم 15-21) | C-08 Blog: 3 مقالات (800 كلمة/مقال) + S-07 Article JSON-LD + O-05 صور Alt + P-05 CSS + P-06 Prefetch + L-05 لهجة مصرية | `src/features/public/BlogPage.tsx` (جديد)<br>`src/features/public/BlogPostPage.tsx` (جديد)<br>`src/data/blog.ts` (جديد — محتوى Markdown/JSON)<br>`src/index.css` | 3 مقالات منشورة + sitemap 15 URL + كل مقال H1 + Article JSON-LD + Internal Links من Landing/Blog |
| 3 | F-03 سوشيال (5 بروفايلات) + F-04 Backlinks (5 روابط) + F-05 GBP + تحديث Organization sameAs | `src/lib/seo.ts` (sameAs)<br>`src/features/public/LandingPage.tsx` (Social icons) | 5 Profiles + 5 Referring Domains + GBP Verified |
| 4 (يوم 22-28) | تحسين CWV نهائي: قياس CrUX + إصلاح LCP/INP/CLS المتبقي + إضافة `content-visibility` + ضغط صور نهائي + PWA audit | `src/index.css`<br>`public/og-image.jpg`<br>`src/main.tsx` | CrUX LCP <2.5s (75th) + CLS <0.1 + INP <200ms |
| 4 | تدقيق SEO شامل: Screaming Frog crawl (15 URL) + إصلاح 0 Broken Links + تحديث sitemap lastmod + GSC Coverage 0 errors + GA4 Conversions | `scripts/generate-sitemap.mjs`<br>`reports/seo-audit-week4.md` (جديد) | تقرير تدقيق + 0 Broken + 0 Duplicate Title + Organic 500/شهر |

**KPIs نهاية P2:**
- Organic Clicks: 500+/شهر
- Category Keywords: Top 3 لـ `منصة تعليمية إعدادي` + `شرح تالتة إعدادي`
- Referring Domains: 5+
- CWV: أخضر في GSC → Page Experience (Good)
- Lighthouse: Performance 95+ / SEO 100 / Accessibility 100 / Best Practices 100

---

### المرحلة P3 — مستقبلي — بعد الشهر الأول (السيطرة الكاملة)

> **الهدف:** من 9.5/10 إلى 10/10 — #1 لكل الكلمات + Authority مستدام.

| # | البند | الهدف | الإجراء | الملفات | الوقت | KPI |
|---|---|---|---|---|---|---|
| P3-01 | ترحيل إلى SSR/SSG (Next.js أو Astro) | فهرسة لحظية + Streaming | عند وصول 50+ صفحة عامة، ترحيل Landing/Blog/Subjects إلى Next.js App Router مع ISR (revalidate 3600s) — يحافظ على Supabase + Bunny | مشروع جديد `walidawny-next` — خارج نطاق P0-P2 | 2-3 أسابيع | TTFB <200ms + ISR |
| P3-02 | نظام CMS للمدونة (Sanity/Contentlayer) | نشر مستمر بدون كود | ربط `/blog` بـ Headless CMS + Webhook يعيد توليد sitemap | `src/data/blog.ts` → CMS API | 1 أسبوع | مقال/أسبوع بدون مطور |
| P3-03 | فيديو SEO متقدم (Bunny → YouTube Teaser) | Video Pack #1 | نشر Teaser 30 ثانية لكل وحدة على YouTube (عام) + ربطه بـ `VideoObject` في `/subjects/:grade` — الفيديو الكامل يبقى Bunny محمي | `src/components/YouTubeEmbed.tsx` + YouTube Studio | مستمر | Video Rich لـ 10+ وحدات |
| P3-04 | International + إنجليزي (اختياري) | توسع | إضافة `/en` + `hreflang en-EG` + ترجمة Landing | `src/features/public/*` + `src/lib/seo.ts` | 1 أسبوع | ظهور لـ `walid awny platform` |
| P3-05 | A/B Testing للعناوين | CTR + تحويل | اختبار Title/Description عبر GSC + GA4 (مثال: `وليد عونى — منصة تالتة إعدادي` vs `منصة وليد عونى التعليمية`) | `src/lib/seo.ts` + GA4 Experiments | مستمر | CTR +0.5% كل اختبار |
| P3-06 | Programmatic SEO (آلي للصفوف) | تغطية كل الصفوف تلقائياً | توليد `/subjects/:grade/:unit` Teaser آلياً من `getPublicUnitPrices` (اسم الوحدة + وصف عام + سعر) — بدون كشف دروس | `scripts/generate-grade-pages.mjs` | 1 أسبوع | 20+ صفحة Teaser مفهرسة |

---

## 10) مصفوفة الملفات — ماذا سيتغير وأين؟

| الملف (مسار مطلق) | العملية | المرحلة | الوصف |
|---|---|---|---|
| `C:\Users\admin\Desktop\WALIDAWNY\package.json` | تعديل | P0 | إضافة `react-helmet-async`, `web-vitals`, `vite-plugin-sitemap` (أو سكربت), `playwright` (prerender اختياري) + scripts `generate:sitemap`, `prerender` |
| `C:\Users\admin\Desktop\WALIDAWNY\index.html` | تعديل | P0/P1 | إزالة title/description الثابت (نقله لـ Helmet) + تحديث Google Fonts رابط `&display=swap` وتقليل الأوزان + إضافة preload + إزالة CSP meta المكسور |
| `C:\Users\admin\Desktop\WALIDAWNY\vite.config.ts` | تعديل | P0/P1 | حذف `inject-csp` المكسور + إضافة `manualChunks` + `cssCodeSplit` + hook `generate-sitemap`/`prerender` |
| `C:\Users\admin\Desktop\WALIDAWNY\vercel.json` | تعديل | P0 | إضافة `headers` (CSP + Security) + `rewrites` مستثناة + `cleanUrls` + `trailingSlash` |
| `C:\Users\admin\Desktop\WALIDAWNY\.env.example` | تعديل | P0 | إضافة `VITE_SITE_URL`, `VITE_GSC_VERIFICATION`, `VITE_GA4_ID` |
| `C:\Users\admin\Desktop\WALIDAWNY\.env.production` | تعديل | P0 | تعيين القيم الحقيقية |
| `C:\Users\admin\Desktop\WALIDAWNY\.env.local` | تعديل | P0 | تعيين `VITE_SITE_URL=http://localhost:5173` للتطوير |
| `C:\Users\admin\Desktop\WALIDAWNY\src\app\providers.tsx` | تعديل | P0 | تغليف بـ `<HelmetProvider>` |
| `C:\Users\admin\Desktop\WALIDAWNY\src\app\router.tsx` | تعديل | P0/P1 | تحويل Routes إلى `React.lazy` + إضافة Routes جديدة للصفحات العامة + `<Suspense>` |
| `C:\Users\admin\Desktop\WALIDAWNY\src\components\SeoHead.tsx` | **جديد** | P0 | كومبوننت مركزي: title, description, canonical, og:*, twitter:*, hreflang, robots, JSON-LD |
| `C:\Users\admin\Desktop\WALIDAWNY\src\components\Breadcrumbs.tsx` | **جديد** | P1 | Breadcrumbs UI + JSON-LD BreadcrumbList |
| `C:\Users\admin\Desktop\WALIDAWNY\src\lib\seo.ts` | **جديد** | P0 | مصدر وحيد للحقيقة: SEO titles/descriptions + Organization + sameAs + keywords |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\LandingPage.tsx` | تعديل | P0/P1 | H1 محسن + H2/H3 + FAQ مصغر + فقرة 120 كلمة + SeoHead + Breadcrumb + OG |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\NotFoundPage.tsx` | تعديل | P0 | SeoHead noindex + عنوان 404 + Breadcrumb + رابط داخلي |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\auth\LoginPage.tsx` | تعديل | P1 | SeoHead noindex + title فريد |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\auth\RegisterPage.tsx` | تعديل | P1 | SeoHead noindex |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\AboutPage.tsx` | **جديد** | P1 | صفحة عن المنصة — 600 كلمة + SeoHead + Breadcrumb + Organization |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\HowItWorksPage.tsx` | **جديد** | P1 | كيف تبدأ + VideoObject (YouTube عام) |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\PricingPage.tsx` | **جديد** | P1 | أسعار عامة — منفصل عن `src/features/walid/PricingPage.tsx` (الخاص بلوحة التحكم) |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\SubjectsPage.tsx` | **جديد** | P1 | Hub المواد |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\GradeLandingPage.tsx` | **جديد** | P1 | صفحة صف دراسي ديناميكية Teaser + Course JSON-LD |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\FaqPage.tsx` | **جديد** | P0/P1 | 12 سؤال + FAQPage JSON-LD + Accordion |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\ContactPage.tsx` | **جديد** | P1 | تواصل + LocalBusiness JSON-LD |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\BlogPage.tsx` | **جديد** | P2 | فهرس مدونة |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\BlogPostPage.tsx` | **جديد** | P2 | مقال فردي + Article JSON-LD |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\PrivacyPage.tsx` | **جديد** | P1 | سياسة خصوصية |
| `C:\Users\admin\Desktop\WALIDAWNY\src\features\public\TermsPage.tsx` | **جديد** | P1 | شروط |
| `C:\Users\admin\Desktop\WALIDAWNY\src\components\VideoPlayer.tsx` | تعديل | P1 | dynamic import لـ `hls.js` |
| `C:\Users\admin\Desktop\WALIDAWNY\src\components\YouTubeEmbed.tsx` | تعديل | P1 | إضافة `title` + `loading="lazy"` + `VideoObject` support |
| `C:\Users\admin\Desktop\WALIDAWNY\src\index.css` | تعديل | P1/P2 | `content-visibility` + تنظيف Keyframes غير مستخدمة |
| `C:\Users\admin\Desktop\WALIDAWNY\src\main.tsx` | تعديل | P1 | تتبع web-vitals → GA4 |
| `C:\Users\admin\Desktop\WALIDAWNY\public\robots.txt` | **جديد** | P0 | توجيه الزحف |
| `C:\Users\admin\Desktop\WALIDAWNY\public\sitemap.xml` | **جديد** (أو dist) | P0 | خريطة موقع |
| `C:\Users\admin\Desktop\WALIDAWNY\public\og-image.jpg` | **جديد** | P0 | 1200×630 <120KB |
| `C:\Users\admin\Desktop\WALIDAWNY\public\manifest.webmanifest` | تعديل | P1 | start_url + تتبع PWA |
| `C:\Users\admin\Desktop\WALIDAWNY\public\sw.js` | تعديل | P1 | عدم اعتراض ملفات SEO |
| `C:\Users\admin\Desktop\WALIDAWNY\scripts\generate-sitemap.mjs` | **جديد** | P0 | توليد sitemap عند build |
| `C:\Users\admin\Desktop\WALIDAWNY\scripts\prerender.mjs` | **جديد** | P0 | Prerender للصفحات العامة |
| `C:\Users\admin\Desktop\WALIDAWNY\src\data\blog.ts` | **جديد** | P2 | محتوى مدونة (JSON/Markdown) |

---

## 11) قوائم التحقق النهائية (Checklists) للـ Agent المنفذ

### 11.1 Checklist قبل الإطلاق (Pre-launch) — يجب أن تكون كلها ✅

- [ ] `https://walidawny.com/robots.txt` يعود 200 ويحتوي `Sitemap:`
- [ ] `https://walidawny.com/sitemap.xml` يعود 200 ويحتوي 12+ URL بـ `lastmod`
- [ ] كل URL عام له `<link rel="canonical">` واحد صحيح (بدون duplicate)
- [ ] كل URL عام له `hreflang="ar-EG"` + `x-default`
- [ ] `view-source:https://walidawny.com/` يحتوي H1 + وصف 150 حرف بدون JS
- [ ] `https://walidawny.com/` → Lighthouse SEO 100, Performance 90+, Accessibility 100
- [ ] 0 أخطاء CSP في Console
- [ ] OG Debugger: صورة 1200×630 تظهر بدون أخطاء
- [ ] Rich Results Test: Organization Valid + FAQPage Valid + Breadcrumb Valid + Course Valid
- [ ] GSC: Verified + Sitemap Success + 0 Coverage errors
- [ ] GA4: Realtime يظهر + Events `whatsapp_click` تُسجل
- [ ] `site:walidawny.com inurl:student` = 0 نتائج
- [ ] لا `hls.js` يُحمّل في Landing (Network tab)
- [ ] Fonts: `display=swap` + 5 أوزان فقط + `Ensure text remains visible` Pass
- [ ] كل الصفحات الجديدة لها H1 فريد + Title 50-60 حرف + Description 145-155 حرف

### 11.2 Checklist بعد الإطلاق (Post-launch) — الأسبوع 1-4

- [ ] يوم 1: Request Indexing لـ `/` + 3 صفحات رئيسية في GSC
- [ ] يوم 3: فحص GSC → Coverage: 1 صفحة مفهرسة
- [ ] يوم 7: فحص ترتيب `وليد عونى` (يجب أن يكون صفحة 1)
- [ ] يوم 14: GSC → Performance: 100+ Clicks + CTR 4%+
- [ ] يوم 14: Rich Results: FAQ يظهر في SERP (اختبار `وليد عونى كود تفعيل`)
- [ ] يوم 28: GSC → Page Experience: Good (CWV أخضر)
- [ ] يوم 30: تقرير `reports/seo-audit-month1.md` + خطة الشهر الثاني

---

## 12) المخاطر + الميتجاشيون (Risks)

| الخطر | الاحتمال | الأثر | التخفيف |
|---|---|---|---|
| الدومين `walidawny.com` غير محجوز/غير مشير لـ Vercel | متوسط | لا فهرسة إطلاقاً | حجز الدومين فوراً + ضبط DNS (A/CNAME لـ Vercel) + تفعيل HTTPS + اختبار `https://walidawny.com` قبل أي SEO |
| Prerender يكسر PWA أو CSR | منخفض | صفحات بيضاء | Prerender للصفحات العامة فقط + اختبار `npm run build && npm run preview` + E2E `playwright` |
| CSP الجديد يحظر Bunny/Supabase/GA4 | متوسط | فيديو/بيانات لا تحمل | اختبار كل خدمة بعد تعديل CSP + إضافة `https://*.b-cdn.net` و `googletagmanager.com` صراحة |
| كشف محتوى محمي عن طريق الخطأ (SEO Teaser) | منخفض لكن حرج | تسريب حقوق + خرق نموذج العمل | مراجعة كل صفحة عامة: **فقط اسم الوحدة + السعر** — لا دروس/فيديو/ملف + Code Review إجباري |
| منافسة شرسة على `شرح تالتة إعدادي` (منصات كبيرة) | عالي | صعوبة Top 3 | التركيز أولاً على Brand (#1 مضمون) ثم Long-tail دقيق (`وليد عونى تالتة إعدادي` أسهل من `شرح تالتة إعدادي` عام) + محتوى فريد + FAQ |
| تأخر فهرسة (Google Sandbox) | متوسط | ترتيب متأخر | إرسال Sitemap + Request Indexing يدوي + Backlinks سريعة + مشاركة سوشيال لتسريع الاكتشاف |
| تضخم Bundle بعد إضافة صفحات جديدة | منخفض | LCP يتدهور | Code Splitting إجباري + مراقبة Bundle Size في كل PR (`bundlesize` check) |

---

## 13) KPIs Dashboard — كيف نقيس النجاح؟

| الفئة | KPI | أداة | هدف P0 (أسبوع 1) | هدف P1 (أسبوع 2) | هدف P2 (شهر 1) | هدف P3 (شهر 3) |
|---|---|---|---|---|---|---|
| **الفهرسة** | صفحات مفهرسة | GSC → Coverage | 1 | 12 | 15 | 30+ |
| **الترتيب Brand** | `وليد عونى` | GSC → Performance (Avg Position) | 5-10 | **#1** | #1 (stable) | #1 + Sitelinks |
| **الترتيب Category** | `منصة تعليمية إعدادي` | GSC | 20+ | 10-15 | Top 3 | #1 |
| **CTR** | متوسط CTR | GSC | 1-2% | 3-4% | 4-6% | 6%+ |
| **Rich Results** | FAQ/Course/Breadcrumb | GSC → Enhancements | 1 (FAQ مصغر) | 3+ | 5+ | 10+ |
| **زيارات عضوية** | Clicks | GSC + GA4 | 10-20/أسبوع | 100/أسبوع | 500/شهر | 2000/شهر |
| **CWV** | LCP / INP / CLS | GSC → Page Experience + CrUX | LCP <3s | LCP <2.5s | Good (أخضر) | Good مستقر |
| **Lighthouse** | Performance / SEO | Lighthouse CI | SEO 100 / Perf 90 | Perf 95 | Perf 95+ | Perf 95+ |
| **Backlinks** | Referring Domains | Ahrefs / GSC → Links | 0 | 2 | 5+ | 15+ |
| **تحويل** | `whatsapp_click` + `register` | GA4 Events | قياس فقط | 5% من الزيارات | 8% | 10%+ |

---

## 14) تعليمات مباشرة لـ Agent التنفيذ (المرحلة 3)

> **اقرأ هذا أولاً قبل كتابة أي كود:**

1. **لا تبدأ بكود قبل قراءة هذه الوثيقة كاملة + فحص `C:\Users\admin\Desktop\WALIDAWNY\index.html` و `vite.config.ts` و `vercel.json` و `src/app/router.tsx` و `src/features/public/LandingPage.tsx` الحالي.**
2. **نفّذ P0 أولاً بالترتيب المذكور (T-01 → T-10). لا تقفز لـ P1 قبل إغلاق كل Checklist P0.**
3. **كل تعديل يجب أن يحافظ على:** PWA يعمل + Auth يعمل + Supabase `nfusbrktrqfrnaetetmr` يعمل + Bunny يعمل + RTL لا ينكسر + التصميم Aurora Night لا يتغير.
4. **استخدم `react-helmet-async` وليس `react-helmet` (الأخير deprecated).**
5. **لا تكشف أي محتوى محمي:** راجع `DATABASE.md` و `SECURITY.md` — Teaser فقط.
6. **بعد كل مرحلة:** شغّل `npm run build` + `npm run preview` + `npx tsc --noEmit` + `npm test` + Lighthouse + Rich Results Test + `curl` بدون JS. أي فشل = إصلاح فوري قبل المتابعة.
7. **احفظ تقرير تنفيذ بعد كل مرحلة في `C:\Users\admin\Desktop\WALIDAWNY\reports\seo-phase3-p0-report.md` (وهكذا P1/P2).**
8. **الدومين:** استخدم `VITE_SITE_URL` من البيئة — لا تكتب `walidawny.com` Hardcoded إلا كـ fallback.

---

## 15) الملحق — أمثلة عناوين ووصف جاهزة (Copy-Paste)

| الصفحة | Title (50-60 حرف) | Description (145-155 حرف) |
|---|---|---|
| `/` | وليد عونى \| منصة تعليمية متكاملة لطلاب إعدادي وثانوي | منصة وليد عونى التعليمية — شرح منهج إعدادي وثانوي بأسلوب مبسط، وحدات مدى الحياة بكود WLDN، متابعة تقدم لحظية ودعم واتساب مباشر. ابدأ الآن. |
| `/about` | عن وليد عونى \| مدرس و مطور منصة WALIDAWNY | تعرف على مستر وليد عونى — خبرة في تبسيط مناهج إعدادي وثانوي، فلسفة تعليمية تركز على الفهم والمتابعة المستمرة عبر منصة WALIDAWNY. |
| `/how-it-works` | كيف تبدأ رحلتك \| منصة وليد عونى — كود WLDN | 3 خطوات لتبدأ: أنشئ حسابك، فعّل وحدتك بكود WLDN-XXXX، تابع دروسك. شرح بالفيديو + دعم واتساب لحظي. |
| `/subjects` | المواد والصفوف \| منصة وليد عونى — إعدادي وثانوي | تصفح كل الصفوف المتاحة في منصة وليد عونى — إعدادي وثانوي — وحدات منظمة، أسعار واضحة، شراء دائم مدى الحياة. |
| `/subjects/third-prep` | شرح منهج تالتة إعدادي \| وليد عونى — وحدات مدى الحياة | شرح منهج تالتة إعدادي كامل مع وليد عونى — وحدات منظمة، فيديوهات حصرية، كود تفعيل WLDN مدى الحياة ومتابعة تقدم. |
| `/pricing` | أسعار الوحدات \| وليد عونى — شراء دائم بدون اشتراك | أسعار وحدات وليد عونى — ادفع مرة واحدة وافتح وحدتك مدى الحياة. اطلع على سعر كل وحدة ورسوم المنصة وكود التفعيل WLDN. |
| `/faq` | الأسئلة الشائعة \| منصة وليد عونى — كود WLDN والدفع | كل إجاباتك عن منصة وليد عونى: هل الكود مدى الحياة؟ كيف أفعل الوحدة؟ طرق الدفع؟ الدعم عبر واتساب؟ اقرأ FAQ الكاملة. |
| `/contact` | تواصل معنا \| وليد عونى — واتساب ودعم مباشر | تواصل مع منصة وليد عونى عبر واتساب مباشر — دعم فني ودراسي، ساعات العمل، والرد خلال ساعات. نحن هنا لمساعدتك. |
| `/blog` | مدونة وليد عونى \| نصائح مذاكرة ومراجعات إعدادي وثانوي | مقالات تعليمية من وليد عونى — كيف تذاكر بذكاء، أخطاء الامتحانات، مراجعات تالتة إعدادي — بدون كشف محتوى المنصة المحمي. |

---

## 16) المراجع والأدوات الإلزامية للتنفيذ

| الأداة | الرابط | الاستخدام |
|---|---|---|
| Google Search Console | https://search.google.com/search-console | فهرسة + Coverage + Performance |
| Rich Results Test | https://search.google.com/test/rich-results | تحقق Structured Data |
| Schema Validator | https://validator.schema.org/ | تحقق JSON-LD |
| PageSpeed Insights | https://pagespeed.web.dev/ | CWV + Lighthouse |
| OG Debugger (Facebook) | https://developers.facebook.com/tools/debug/ | معاينة OG |
| Twitter Card Validator | https://cards-dev.twitter.com/validator | معاينة Twitter |
| Security Headers | https://securityheaders.com/ | فحص CSP/Headers |
| Screaming Frog (مجاني حتى 500 URL) | https://www.screamingfrog.co.uk/seo-spider/ | زحف محلي قبل الإطلاق |
| Ahrefs Webmaster Tools (مجاني) | https://ahrefs.com/webmaster-tools | Backlinks + Keywords |

---

> **نهاية الخطة — المرحلة 2 من 4.**  
> هذه الوثيقة هي **المرجع الوحيد** لـ Agent التنفيذ. أي انحراف عنها يجب أن يُوثق ويُبرر في تقرير التنفيذ.  
> **المالك:** فريق WALIDAWNY — **الحالة:** جاهزة للتنفيذ ✅ — **الخطوة التالية:** تسليم لـ Agent التنفيذ (المرحلة 3) لبدء P0 فوراً.

