/**
 * Mock data for /labs/fun — isolated demo content, no backend, no persistence.
 * Five gentle engagement concepts for students (no luck mechanics, no harsh
 * pressure): live study rooms, question of the day, gentle streak, friendly
 * weekly challenge, effort badges.
 */

export interface LabRoom {
  id: string;
  name: string;
  subject: string;
  members: number;
  memberNames: string[];
  phase: 'focus' | 'break';
  minutesLeft: number;
  secondsLeft: number;
  host: string;
  accent: string;
}

export const LAB_FUN_ROOMS: LabRoom[] = [
  {
    id: 'room-1',
    name: 'مراجعة الكهربية — ليلة الامتحان',
    subject: 'فيزياء ٣ث',
    members: 7,
    memberNames: ['أحمد', 'مريم', 'يوسف', 'حبيبة', 'عمر', 'سلمى', '+١'],
    phase: 'focus',
    minutesLeft: 24,
    secondsLeft: 59,
    host: 'أ. وليد',
    accent: 'var(--color-chart-1)',
  },
  {
    id: 'room-2',
    name: 'حل مسائل المغناطيسية',
    subject: 'فيزياء ٣ث',
    members: 4,
    memberNames: ['كريم', 'نور', 'زياد', '+١'],
    phase: 'focus',
    minutesLeft: 11,
    secondsLeft: 20,
    host: 'كريم',
    accent: 'var(--color-chart-2)',
  },
  {
    id: 'room-3',
    name: 'استراحة — دردشة خفيفة',
    subject: 'عام',
    members: 12,
    memberNames: ['فارس', 'جنى', 'مالك', 'رؤى', '+٨'],
    phase: 'break',
    minutesLeft: 4,
    secondsLeft: 30,
    host: 'أ. وليد',
    accent: 'var(--color-gold)',
  },
];

export interface LabDailyQuestion {
  prompt: string;
  choices: string[];
  correctIndex: number;
  answeredCount: number;
  correctPercent: number;
  explanation: string;
}

export const LAB_FUN_QUESTION: LabDailyQuestion = {
  prompt: 'سلك مستقيم يمر به تيار كهربي — عند مضاعفة شدة التيار، ماذا يحدث لكثافة الفيض المغناطيسي عند نقطة ثابتة؟',
  choices: ['تتضاعف', 'تقل للنصف', 'تبقى ثابتة', 'تصبح صفرًا'],
  correctIndex: 0,
  answeredCount: 240,
  correctPercent: 68,
  explanation: 'كثافة الفيض تتناسب طرديًا مع شدة التيار (B ∝ I) — قانون أمبير للسلك المستقيم.',
};

export const LAB_FUN_STREAK = {
  currentDays: 6,
  freezeAvailable: true,
  totalMinutesWeek: 320,
  week: [
    { day: 'سبت', done: true },
    { day: 'أحد', done: true },
    { day: 'اثنين', done: true },
    { day: 'ثلاثاء', done: true },
    { day: 'أربعاء', done: true },
    { day: 'خميس', done: true },
    { day: 'جمعة', done: false, today: true },
  ],
};

export const LAB_FUN_CHALLENGE = {
  title: 'تحدي الأسبوع — ٣ث فيزياء',
  target: 500,
  current: 350,
  unit: 'درس مكتمل',
  daysLeft: 3,
  contributors: 42,
  contributorNames: ['أ', 'م', 'ي', 'ح', 'ع', '+'],
};

export interface LabBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  hint?: string;
}

export const LAB_FUN_BADGES: LabBadge[] = [
  { id: 'badge-1', name: 'المثابر', description: 'ذاكر ٧ أيام متتالية', icon: '🔥', earned: true },
  { id: 'badge-2', name: 'المراجع', description: 'راجع ١٠ دروس قديمة', icon: '📚', earned: true },
  { id: 'badge-3', name: 'مساعد الزملاء', description: 'سؤالك أفاد ٥ زملاء', icon: '🤝', earned: true },
  { id: 'badge-4', name: 'صائد الفجر', description: 'ذاكر قبل ٦ صباحًا ٣ مرات', icon: '🌅', earned: false, hint: 'مرة واحدة متبقية' },
  { id: 'badge-5', name: 'وحش الامتحانات', description: 'أنهِ ٥ امتحانات عامة', icon: '🏆', earned: false, hint: 'امتحانان متبقيان' },
  { id: 'badge-6', name: 'المركّز', description: 'أكمل ١٠ جلسات بومودورو', icon: '🎯', earned: false, hint: '٣ جلسات متبقية' },
];

export interface LabFunVariantMeta {
  id: string;
  name: string;
  tagline: string;
  traits: string[];
  bestFor: string;
}

export const LAB_FUN_VARIANTS: LabFunVariantMeta[] = [
  {
    id: '1',
    name: 'غرف مذاكرة حية',
    tagline: 'كروت غرف باين فيها مين بيذاكر + مؤقت بومودورو مشترك + تفاعلات جاهزة — بدون شات مفتوح',
    traits: ['إحساس جماعي', 'يطوّل القعدة', 'آمن بدون شات'],
    bestFor: 'الاختيار الأول — أكبر تأثير على وقت البقاء في المنصة',
  },
  {
    id: '2',
    name: 'سؤال اليوم',
    tagline: 'سؤال MCQ واحد يوميًا ياخد دقيقة + نسبة اللي جاوبوا صح — سبب يومي للرجوع',
    traits: ['دقيقة واحدة', 'عادة يومية', 'تنافس لطيف'],
    bestFor: 'أرخص فكرة تنفيذًا وأسرع عائد على الزيارات اليومية',
  },
  {
    id: '3',
    name: 'سلسلة لطيفة',
    tagline: 'عدّاد أيام متتالية مع يوم تجميد أسبوعي ورسالة طمأنة عند الانقطاع — بدون عقاب',
    traits: ['بدون ضغط', 'يوم تجميد', 'تشجيع دائم'],
    bestFor: 'بناء العادة اليومية بدون ما نضغط طلاب الثانوية',
  },
  {
    id: '4',
    name: 'تحدي الأسبوع الودي',
    tagline: 'هدف جماعي للصف وشريط تقدم مشترك — الكل كسبان ومفيش خاسر ولا ترتيب',
    traits: ['جماعي', 'مفيش خاسر', 'روح الصف'],
    bestFor: 'تقوية انتماء الدفعة وتحريك الكسلانين بلطف',
  },
  {
    id: '5',
    name: 'شارات المجهود',
    tagline: 'شارات على الاستمرار والمراجعة ومساعدة الزملاء — على المجهود مش على الترتيب',
    traits: ['مكافأة معنوية', 'على المجهود', 'تجميع ممتع'],
    bestFor: 'تحفيز طويل المدى للطلاب اللي بيجمعوا الإنجازات',
  },
];
