#!/usr/bin/env node
/**
 * Prerender public routes — generates static HTML for crawlers (T-06).
 * Reads dist/index.html template and injects per-route SEO from src/lib/seo.ts (via manual mapping)
 * to produce dist/<route>/index.html without needing a browser.
 * This satisfies "view-source:https://walidawny.com/about contains H1" without JS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const SITE_URL = process.env.VITE_SITE_URL?.replace(/\/$/, '') || 'https://walidawny.com';

// Must match src/lib/seo.ts SEO keys and GRADE_MAP
const ROUTES = [
  { path: '/', file: 'index.html', title: 'منصة وليد عونى التعليمية | دروس مصورة وملازم PDF لكل الصفوف', desc: 'منصة وليد عونى التعليمية المصرية — منهج منظم لطلاب ثانوية عامة، فيديوهات شرح مبسطة، ملازم PDF وسبورات تفاعلية مع تفعيل فوري بكود WLDN. ابدأ الآن.', h1: 'منصة وليد عوني لطلاب ثانوية عامة' },
  { path: '/about', title: 'عن وليد عونى | سيرة المدرس ومنهج WALIDAWNY التعليمي', desc: 'تعرف على مستر وليد عونى وخبرته في تدريس الإعدادي والثانوي — فلسفة شرح مبسط، منهج منظم، وحدات مدى الحياة بكود WLDN ودعم واتساب مباشر لطلاب مصر بثقة.', h1: 'عن منصة وليد عونى' },
  { path: '/how-it-works', title: 'كيف تبدأ رحلتك | خطوات التسجيل وتفعيل كود WLDN — وليد عونى', desc: 'اعرف كيف تبدأ في منصة وليد عونى بخطوات بسيطة — إنشاء حساب، تفعيل الوحدة بكود WLDN-XXXX، مشاهدة الفيديوهات ومتابعة التقدم ودعم واتساب فوري. رحلتك الآن.', h1: 'كيف تبدأ رحلتك؟' },
  { path: '/subjects', title: 'المواد والصفوف | مناهج الإعدادي والثانوي — وليد عونى', desc: 'تصفح مواد وصفوف منصة وليد عونى — مناهج تالتة وتانية وأولى إعدادي وأولى ثانوي، وحدات منظمة وأسعار واضحة وتفعيل مدى الحياة بكود WLDN لكل وحدة. اختر الآن.', h1: 'المواد والصفوف' },
  { path: '/subjects/first-prep', title: 'شرح منهج الصف الأول الإعدادي — وليد عونى | وحدات مدى الحياة', desc: 'شرح منهج الصف الأول الإعدادي على منصة وليد عونى — وحدات منظمة، فيديوهات مبسطة، ملازم PDF وسبورات تفاعلية مع تفعيل مدى الحياة بكود WLDN لكل وحدة. ابدأ الآن.', h1: 'شرح منهج الصف الأول الإعدادي' },
  { path: '/subjects/second-prep', title: 'شرح منهج الصف الثاني الإعدادي — وليد عونى | وحدات مدى الحياة', desc: 'شرح منهج الصف الثاني الإعدادي على منصة وليد عونى — وحدات منظمة، فيديوهات عالية الجودة، ملازم PDF وسبورات مع كود تفعيل WLDN مدى الحياة. ابدأ رحلتك الآن.', h1: 'شرح منهج الصف الثاني الإعدادي' },
  { path: '/subjects/third-prep', title: 'شرح منهج الصف الثالث الإعدادي — وليد عونى | وحدات مدى الحياة', desc: 'شرح منهج الصف الثالث الإعدادي ترم أول وثان على منصة وليد عونى — وحدات شاملة، مراجعات مركزة، ملازم PDF وسبورات مع تفعيل مدى الحياة بكود WLDN. ابدأ الآن.', h1: 'شرح منهج الصف الثالث الإعدادي' },
  { path: '/subjects/first-secondary', title: 'شرح منهج الصف الأول الثانوي — وليد عونى | وحدات مدى الحياة', desc: 'شرح منهج الصف الأول الثانوي على منصة وليد عونى — وحدات منظمة وتقدم متابع، فيديوهات وملازم PDF مع تفعيل فوري بكود WLDN لكل وحدة مع دعم مباشر. ابدأ الآن.', h1: 'شرح منهج الصف الأول الثانوي' },
  { path: '/pricing', title: 'أسعار الوحدات المحدثة | شراء دائم بكود WLDN — وليد عونى', desc: 'أسعار وحدات وليد عونى المحدثة — شراء مرة واحدة مدى الحياة بدون اشتراك شهري، تفعيل فوري بكود WLDN، وحدات الإعدادي والثانوي بأسعار واضحة وضمان كامل.', h1: 'أسعار الوحدات' },
  { path: '/faq', title: 'الأسئلة الشائعة | كود WLDN والدفع والدعم — وليد عونى', desc: 'إجابات شاملة عن منصة وليد عونى — هل كود WLDN مدى الحياة؟ كيف أفعل الوحدة؟ طرق الدفع؟ دعم واتساب؟ استرجاع؟ كل ما يهم طلاب الإعدادي والثانوي قبل الشراء.', h1: 'الأسئلة الشائعة' },
  { path: '/contact', title: 'تواصل معنا | واتساب ودعم مباشر — منصة وليد عونى الآن', desc: 'تواصل مع منصة وليد عونى عبر واتساب مباشر — دعم فني ودراسي سريع، ساعات عمل مرنة، رد خلال دقائق لمساعدتك في التفعيل والمنهج لكل الصفوف بجانبك دوماً.', h1: 'تواصل معنا' },
  { path: '/privacy', title: 'سياسة الخصوصية | حماية بياناتك في منصة وليد عونى التعليمية', desc: 'سياسة الخصوصية لمنصة وليد عونى — كيف نحمي بياناتك الشخصية، استخدام ملفات الارتباط، حقوقك في الوصول والحذف والتزامنا بمعايير الأمان لطلاب مصر بثقة.', h1: 'سياسة الخصوصية' },
  { path: '/terms', title: 'الشروط والأحكام | قواعد استخدام منصة وليد عونى التعليمية', desc: 'الشروط والأحكام لمنصة وليد عونى — قواعد إنشاء الحساب، شراء الوحدات بكود WLDN، حقوق الملكية، الاستخدام المسموح وضمان مدى الحياة لكل وحدة. اقرأ بعناية.', h1: 'الشروط والأحكام' },
];

function injectMeta(html, route) {
  // Replace title and description and canonical / og
  let out = html;
  out = out.replace(/<title>.*?<\/title>/s, `<title>${route.title}</title>`);
  out = out.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${route.desc}" />`);
  // Fallback for multiline meta
  out = out.replace(/<meta\s*\n\s*name="description"\s*\n\s*content="[^"]*"\s*\n\s*\/>/s, `<meta name="description" content="${route.desc}" />`);
  // Also replace og:title, og:description, twitter
  out = out.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/, `<meta property="og:title" content="${route.title}" />`);
  out = out.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/, `<meta property="og:description" content="${route.desc}" />`);
  out = out.replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/, `<meta property="og:url" content="${SITE_URL}${route.path}" />`);
  out = out.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/, `<link rel="canonical" href="${SITE_URL}${route.path}" />`);
  out = out.replace(/<link\s+rel="alternate"\s+hreflang="ar-EG"\s+href="[^"]*"\s*\/>/, `<link rel="alternate" hreflang="ar-EG" href="${SITE_URL}${route.path}" />`);
  out = out.replace(/<link\s+rel="alternate"\s+hreflang="x-default"\s+href="[^"]*"\s*\/>/, `<link rel="alternate" hreflang="x-default" href="${SITE_URL}${route.path}" />`);
  // Inject H1 comment for crawler visibility check (view-source should contain H1 text)
  // Already the SPA will render H1 via JS, but we add a noscript fallback for crawlers without JS
  const h1Fallback = `<noscript><h1>${route.h1}</h1><p>${route.desc}</p></noscript>`;
  out = out.replace('</head>', `  ${h1Fallback}\n  </head>`);
  return out;
}

async function prerender() {
  if (!fs.existsSync(dist)) {
    console.warn('⚠️  dist not found — run `npm run build` first. Skipping prerender.');
    return;
  }
  const templatePath = path.join(dist, 'index.html');
  if (!fs.existsSync(templatePath)) {
    console.warn('⚠️  dist/index.html not found');
    return;
  }
  const template = fs.readFileSync(templatePath, 'utf8');
  for (const route of ROUTES) {
    if (route.path === '/') continue; // already index.html
    const outDir = path.join(dist, route.path.slice(1));
    fs.mkdirSync(outDir, { recursive: true });
    const html = injectMeta(template, route);
    const outPath = path.join(outDir, 'index.html');
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`✅ prerendered ${route.path} → ${path.relative(root, outPath)}`);
  }
  // Also ensure root index.html has correct meta (already does)
  console.log(`✅ prerender complete: ${ROUTES.length} routes`);
}

prerender().catch((e) => {
  console.error('Prerender failed:', e);
  process.exit(1);
});
