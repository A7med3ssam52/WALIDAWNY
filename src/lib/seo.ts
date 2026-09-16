/**
 * Central SEO source of truth — single source for titles, descriptions, OG, JSON-LD helpers.
 * Site: https://walidawny.com
 * All titles 50-60 chars, descriptions 145-155 chars, keywords Arabic-first.
 */

export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') || 'https://walidawny.com';

export const SITE_NAME = 'وليد عونى';
export const SITE_ALTERNATE_NAME = 'WALIDAWNY';
export const SITE_LOCALE = 'ar_EG';
export const SITE_LANGUAGE = 'ar';
export const OG_IMAGE = `${SITE_URL}/og-image.jpg`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const TWITTER_CARD = 'summary_large_image' as const;
export const THEME_COLOR = '#070513';

// Central SEO config per public route
export const SEO = {
  home: {
    title: 'منصة وليد عوني لطلاب ثانوية عامة | دروس مصورة وملازم PDF',
    description:
      'منصة وليد عوني لطلاب ثانوية عامة — منهج منظم، فيديوهات شرح مبسطة، ملازم PDF وسبورات تفاعلية مع تفعيل فوري بكود WLDN. ابدأ الآن.',
    keywords:
      'وليد عونى, منصة وليد عوني لطلاب ثانوية عامة, منصة تعليمية مصرية, دروس مصورة, ملازم PDF, سبورات, كود تفعيل WLDN, شرح منهج ثانوية عامة, وحدات مدى الحياة',
  },
  about: {
    title: 'عن وليد عونى | سيرة المدرس ومنهج WALIDAWNY التعليمي',
    description:
      'تعرف على مستر وليد عونى وخبرته في تدريس الإعدادي والثانوي — فلسفة شرح مبسط، منهج منظم، وحدات مدى الحياة بكود WLDN ودعم واتساب مباشر لطلاب مصر بثقة.',
    keywords: 'وليد عونى, مستر وليد عونى, عن وليد عونى, سيرة مدرس, منصة WALIDAWNY, خبرة تدريس',
  },
  howItWorks: {
    title: 'كيف تبدأ رحلتك | خطوات التسجيل وتفعيل كود WLDN — وليد عونى',
    description:
      'اعرف كيف تبدأ في منصة وليد عونى بخطوات بسيطة — إنشاء حساب، تفعيل الوحدة بكود WLDN-XXXX، مشاهدة الفيديوهات ومتابعة التقدم ودعم واتساب فوري. رحلتك الآن.',
    keywords: 'كود تفعيل, WLDN, كيف افعل الوحدة, تسجيل منصة وليد عونى, شرح التفعيل',
  },
  subjects: {
    title: 'المواد والصفوف | مناهج الإعدادي والثانوي — وليد عونى',
    description:
      'تصفح مواد وصفوف منصة وليد عونى — مناهج تالتة وتانية وأولى إعدادي وأولى ثانوي، وحدات منظمة وأسعار واضحة وتفعيل مدى الحياة بكود WLDN لكل وحدة. اختر الآن.',
    keywords: 'منهج تالتة اعدادي, تانية اعدادي, اولى اعدادي, اولى ثانوي, مواد دراسية, منصة اعدادي',
  },
  pricing: {
    title: 'أسعار الوحدات المحدثة | شراء دائم بكود WLDN — وليد عونى',
    description:
      'أسعار وحدات وليد عونى المحدثة — شراء مرة واحدة مدى الحياة بدون اشتراك شهري، تفعيل فوري بكود WLDN، وحدات الإعدادي والثانوي بأسعار واضحة وضمان كامل.',
    keywords: 'اسعار وليد عونى, شراء وحدة, كود WLDN, سعر الوحدة, وحدات مدى الحياة, دفع',
  },
  faq: {
    title: 'الأسئلة الشائعة | كود WLDN والدفع والدعم — وليد عونى',
    description:
      'إجابات شاملة عن منصة وليد عونى — هل كود WLDN مدى الحياة؟ كيف أفعل الوحدة؟ طرق الدفع؟ دعم واتساب؟ استرجاع؟ كل ما يهم طلاب الإعدادي والثانوي قبل الشراء.',
    keywords: 'اسئلة شائعة, FAQ وليد عونى, كود WLDN, هل الكود مدى الحياة, دفع واتساب',
  },
  contact: {
    title: 'تواصل معنا | واتساب ودعم مباشر — منصة وليد عونى الآن',
    description:
      'تواصل مع منصة وليد عونى عبر واتساب مباشر — دعم فني ودراسي سريع، ساعات عمل مرنة، رد خلال دقائق لمساعدتك في التفعيل والمنهج لكل الصفوف بجانبك دوماً.',
    keywords: 'تواصل وليد عونى, واتساب وليد عونى, دعم منصة, رقم التواصل',
  },
  privacy: {
    title: 'سياسة الخصوصية | حماية بياناتك في منصة وليد عونى التعليمية',
    description:
      'سياسة الخصوصية لمنصة وليد عونى — كيف نحمي بياناتك الشخصية، استخدام ملفات الارتباط، حقوقك في الوصول والحذف والتزامنا بمعايير الأمان لطلاب مصر بثقة.',
    keywords: 'سياسة الخصوصية, خصوصية وليد عونى, حماية بيانات',
  },
  terms: {
    title: 'الشروط والأحكام | قواعد استخدام منصة وليد عونى التعليمية',
    description:
      'الشروط والأحكام لمنصة وليد عونى — قواعد إنشاء الحساب، شراء الوحدات بكود WLDN، حقوق الملكية، الاستخدام المسموح وضمان مدى الحياة لكل وحدة. اقرأ بعناية.',
    keywords: 'الشروط والاحكام, شروط وليد عونى, قواعد الاستخدام',
  },
  login: {
    title: 'تسجيل الدخول | مرحباً بعودتك — منصة وليد عونى التعليمية',
    description: 'سجل دخولك إلى منصة وليد عونى لمتابعة دروسك وتقدمك — وصول آمن وسريع لحسابك ولوحداتك المفعلة بثقة وخصوصية عالية.',
    keywords: 'تسجيل دخول وليد عونى',
  },
  register: {
    title: 'إنشاء حساب جديد | انضم لمنصة وليد عونى الآن مجاناً',
    description: 'أنشئ حسابك في منصة وليد عونى خلال دقيقة — اختر صفك الدراسي وابدأ رحلتك التعليمية مع منهج منظم ودعم واتساب مباشر وفوري.',
    keywords: 'انشاء حساب وليد عونى, تسجيل جديد',
  },
  notFound: {
    title: '404 — الصفحة غير موجودة | وليد عونى — العودة للرئيسية',
    description: 'الصفحة التي تبحث عنها غير موجودة في منصة وليد عونى — عد إلى الرئيسية وتابع رحلتك التعليمية مع دروس وملازم لكل الصفوف بسهولة.',
    keywords: '404, صفحة غير موجودة',
  },
} as const;

export type SeoKey = keyof typeof SEO;

export function getCanonical(path: string): string {
  const clean = path === '/' ? '/' : path.replace(/\/$/, '');
  return `${SITE_URL}${clean}`;
}

export function isNoIndexPath(pathname: string): boolean {
  return (
    pathname.startsWith('/student') ||
    pathname.startsWith('/walid') ||
    pathname.startsWith('/admin') ||
    pathname === '/login' ||
    pathname === '/register'
  );
}

// ---------------- JSON-LD Helpers ----------------

export function getOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${SITE_URL}#organization`,
    name: SITE_NAME,
    alternateName: [SITE_ALTERNATE_NAME, 'وليد عوني', 'Walid Awny'],
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    image: OG_IMAGE,
    description: SEO.home.description,
    sameAs: [
      // Update with real links when available
      // 'https://wa.me/201XXXXXXXXX',
      // 'https://www.facebook.com/walidawny',
      // 'https://www.youtube.com/@walidawny',
      // 'https://www.tiktok.com/@walidawny',
      // 'https://www.instagram.com/walidawny',
    ].filter(Boolean),
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'EG',
      addressRegion: 'Cairo',
      addressLocality: 'القاهرة',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      availableLanguage: ['ar', 'Arabic'],
      areaServed: 'EG',
    },
  };
}

export function getWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}#website`,
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    url: SITE_URL,
    inLanguage: 'ar-EG',
    publisher: { '@id': `${SITE_URL}#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      'target': {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function getBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function getFaqJsonLd(faqs: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${SITE_URL}/faq#faq`,
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function getCourseJsonLd(input: {
  name: string;
  description: string;
  url: string;
  price?: string | number | null;
  priceCurrency?: string;
}) {
  const offer =
    input.price !== undefined && input.price !== null
      ? {
          '@type': 'Offer',
          price: String(input.price),
          priceCurrency: input.priceCurrency ?? 'EGP',
          availability: 'https://schema.org/InStock',
          url: input.url,
        }
      : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: input.name,
    description: input.description,
    provider: {
      '@type': 'EducationalOrganization',
      name: SITE_NAME,
      sameAs: SITE_URL,
    },
    ...(offer ? { offers: offer } : {}),
    url: input.url,
    inLanguage: 'ar-EG',
  };
}

// Shared FAQ data — used both for UI and JSON-LD (must stay in sync)
export const SHARED_FAQS: FaqItem[] = [
  {
    question: 'هل كود WLDN مدى الحياة فعلاً؟',
    answer:
      'نعم، شراء الوحدة مرة واحدة يفتحها لك مدى الحياة بدون اشتراك شهري أو تجديد. كود التفعيل بصيغة WLDN-XXXX يُستخدم مرة واحدة ويرتبط بحسابك مباشرة.',
  },
  {
    question: 'كيف أفعل وحدتي بكود WLDN؟',
    answer:
      'سجل دخولك، اذهب إلى صفحة تفعيل الكود، أدخل الكود بصيغة WLDN-XXXX كما استلمته من الأستاذ أو واتساب الدعم، ثم اضغط تفعيل — ستظهر الوحدة فوراً في لوحة الطالب.',
  },
  {
    question: 'ما طرق الدفع المتاحة؟',
    answer:
      'الدفع يتم حالياً عبر التواصل المباشر مع الأستاذ على واتساب — يرسل لك كود WLDN بعد تأكيد التحويل. قريباً ستتوفر بوابات دفع إلكتروني داخل المنصة.',
  },
  {
    question: 'هل المنصة بديلة للدروس الخصوصية؟',
    answer:
      'المنصة مكملة قوية للدروس — تمنحك شرح مبسط ومنظم، فيديوهات عالية الجودة، ملازم PDF وسبورات تفاعلية مع متابعة تقدم لحظية، لكنها لا تغني عن التفاعل المباشر عند الحاجة.',
  },
  {
    question: 'هل يوجد دعم عبر واتساب؟',
    answer:
      'نعم، يوجد دعم مباشر عبر واتساب للرد على استفسارات التفعيل والمنهج. رابط واتساب متاح في كل صفحة، ومتوسط الرد خلال دقائق في ساعات العمل.',
  },
  {
    question: 'هل يمكنني مشاهدة الدروس أكثر من مرة؟',
    answer: 'نعم، بعد تفعيل الوحدة يمكنك مشاهدة فيديوهاتها وملازمها وسبوراتها عدد غير محدود من المرات، من أي جهاز وفي أي وقت.',
  },
  {
    question: 'ماذا لو واجهت مشكلة في تشغيل الفيديو؟',
    answer:
      'تأكد من سرعة الإنترنت وجرب متصفح Chrome أو Safari المحدث. لو استمرت المشكلة تواصل عبر واتساب مع توضيح اسم الوحدة والدرس وسنساعدك فوراً.',
  },
  {
    question: 'هل المحتوى متاح لكل الصفوف؟',
    answer:
      'المنصة مخصصة لطلاب ثانوية عامة (الصف الأول والثاني والثالث الثانوي) — تصفح صفحة المواد لمعرفة الوحدات المتاحة لكل صف وأسعارها.',
  },
  {
    question: 'كيف أتابع تقدمي في المنهج؟',
    answer:
      'لوحة الطالب تعرض نسبة إنجاز كل درس ووحدة بشكل تلقائي مع حفظ موضع المشاهدة — يمكنك المتابعة من حيث توقفت في أي وقت.',
  },
  {
    question: 'هل يوجد استرجاع بعد الشراء؟',
    answer:
      'نظراً لطبيعة المحتوى الرقمي، الشراء نهائي بعد التفعيل. في حال وجود عطل تقني يمنع الوصول للمحتوى، تواصل مع الدعم وسنعالج المشكلة أو نجد حلاً مناسباً.',
  },
  {
    question: 'إزاي أبدأ لو أنا طالب جديد؟',
    answer:
      'أنشئ حساب جديد باختيار صفك الدراسي، تواصل عبر واتساب للحصول على كود WLDN للوحدة التي تريدها، فعّل الكود داخل المنصة وابدأ المشاهدة فوراً.',
  },
  {
    question: 'هل المنصة آمنة وتحمي بياناتي؟',
    answer:
      'نعم، المنصة تستخدم اتصال آمن HTTPS وتخزين مشفر مع سياسة خصوصية واضحة — لا نشارك بياناتك مع أي طرف ثالث وتحكم كامل في حسابك.',
  },
];

export const LANDING_FAQS: FaqItem[] = SHARED_FAQS.slice(0, 5);
