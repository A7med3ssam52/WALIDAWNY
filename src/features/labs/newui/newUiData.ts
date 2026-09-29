/**
 * Mock data for /labs/newui — isolated demo content, no backend, no persistence.
 * Shared by the three candidate card systems (A/B/C) so the comparison is fair:
 * same numbers, same rows, different visual language only.
 */

export type DemoTone = 'green' | 'purple' | 'gold' | 'blue';

export interface DemoKpi {
  id: string;
  label: string;
  value: string;
  delta: string;
  up: boolean;
  tone: DemoTone;
  icon: 'users' | 'sales' | 'revenue' | 'lessons';
}

export interface DemoBar {
  label: string;
  value: number;
}

export interface DemoPurchase {
  id: string;
  student: string;
  meta: string;
  price: string;
}

export interface DemoUnitRow {
  id: string;
  unit: string;
  sales: number;
  revenue: string;
}

export const DEMO_KPIS: DemoKpi[] = [
  {
    id: 'students',
    label: 'الطلاب',
    value: '1,248',
    delta: '+32 هذا الشهر',
    up: true,
    tone: 'green',
    icon: 'users',
  },
  {
    id: 'sales',
    label: 'وحدات مباعة',
    value: '342',
    delta: '+18 هذا الأسبوع',
    up: true,
    tone: 'purple',
    icon: 'sales',
  },
  {
    id: 'revenue',
    label: 'الإيرادات',
    value: '48,500 ج.م',
    delta: '+12% عن الشهر الماضي',
    up: true,
    tone: 'gold',
    icon: 'revenue',
  },
  {
    id: 'lessons',
    label: 'دروس مكتملة',
    value: '1,120',
    delta: '-4% عن الأسبوع الماضي',
    up: false,
    tone: 'blue',
    icon: 'lessons',
  },
];

export const DEMO_BARS: DemoBar[] = [
  { label: 'السبت', value: 12 },
  { label: 'الأحد', value: 19 },
  { label: 'الاثنين', value: 8 },
  { label: 'الثلاثاء', value: 24 },
  { label: 'الأربعاء', value: 16 },
  { label: 'الخميس', value: 29 },
  { label: 'الجمعة', value: 21 },
];

export const DEMO_PURCHASES: DemoPurchase[] = [
  { id: 'p1', student: 'أحمد محمد', meta: 'الثالث الثانوي · الوحدة الأولى', price: '250 ج.م' },
  { id: 'p2', student: 'مريم خالد', meta: 'الثالث الثانوي · الوحدة الثانية', price: '300 ج.م' },
  { id: 'p3', student: 'يوسف علي', meta: 'الثاني الثانوي · الوحدة الأولى', price: '200 ج.م' },
];

export const DEMO_UNITS: DemoUnitRow[] = [
  { id: 'u1', unit: 'الوحدة الأولى — الكيمياء العضوية', sales: 96, revenue: '24,000 ج.م' },
  { id: 'u2', unit: 'الوحدة الثانية — الاتزان الكيميائي', sales: 74, revenue: '22,200 ج.م' },
  { id: 'u3', unit: 'الوحدة الثالثة — الكهربية', sales: 51, revenue: '15,300 ج.م' },
  { id: 'u4', unit: 'الوحدة الرابعة — العناصر الانتقالية', sales: 33, revenue: '9,900 ج.م' },
];

export interface NewUiVariantMeta {
  id: 'a' | 'b' | 'c';
  name: string;
  tagline: string;
  traits: string[];
}

export const NEWUI_VARIANTS: NewUiVariantMeta[] = [
  {
    id: 'a',
    name: 'الاتجاه A — Editorial',
    tagline: 'شريط علوي ملوّن حسب نوع الكارت + رأس تحريري واضح + تسلسل هرمي قوي',
    traits: ['شريط علوي ملوّن', 'زوايا 24px', 'ظل متوسط', 'عنوان + وصف لكل كارت'],
  },
  {
    id: 'b',
    name: 'الاتجاه B — Flat Minimal',
    tagline: 'حدود شعرية رفيعة + زوايا صغيرة + بدون ظلال — أنظف وأهدأ شكل SaaS',
    traits: ['بدون ظلال', 'زوايا 12px', 'أيقونات بدون خلفية', 'كثافة أعلى'],
  },
  {
    id: 'c',
    name: 'الاتجاه C — Premium Glow',
    tagline: 'توهج لوني خفيف + حافة علوية متدرجة + ظل مضيء — أفخم حضور',
    traits: ['توهج حول الأيقونات', 'حافة متدرجة', 'ظل مضيء', 'زوايا 20px'],
  },
];
