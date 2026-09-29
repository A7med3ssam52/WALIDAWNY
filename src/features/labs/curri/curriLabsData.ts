/**
 * Mock data for /labs/curri — isolated demo content, no backend, no persistence.
 * Mirrors StudentCurriculumPage shapes (Grade → Unit → Lesson + trial + locked)
 * so the 5 lab variants can be compared on identical content.
 */

export type LabLessonStatus = 'completed' | 'in-progress' | 'new' | 'locked' | 'trial-open';

export interface LabLesson {
  id: string;
  title: string;
  duration: string;
  status: LabLessonStatus;
  isTrial?: boolean;
}

export interface LabUnit {
  id: string;
  name: string;
  icon: string;
  lessons: LabLesson[];
  locked?: boolean;
  price?: string;
  isFree?: boolean;
  accent: string;
}

export const LAB_CURRI_GRADE = 'الصف الثالث الثانوي — فيزياء';
export const LAB_CURRI_OVERALL = { completed: 17, total: 25, percent: 68 };

export const LAB_CURRI_TRIALS: LabLesson[] = [
  { id: 'trial-1', title: 'مقدمة الكهربية — الدرس التمهيدي', duration: '12:40', status: 'trial-open', isTrial: true },
  { id: 'trial-2', title: 'قانون أوم — شرح + مسائل', duration: '18:05', status: 'trial-open', isTrial: true },
];

export const LAB_CURRI_UNITS: LabUnit[] = [
  {
    id: 'unit-1',
    name: 'الوحدة الأولى — الكهربية',
    icon: '⚡',
    accent: 'var(--color-chart-1)',
    lessons: [
      { id: 'u1-l1', title: 'التيار الكهربي وشدة التيار', duration: '22:10', status: 'completed' },
      { id: 'u1-l2', title: 'فرق الجهد والمقاومة', duration: '19:45', status: 'completed' },
      { id: 'u1-l3', title: 'قانون أوم وتطبيقاته', duration: '25:30', status: 'completed' },
      { id: 'u1-l4', title: 'توصيل المقاومات — توالي وتوازي', duration: '28:12', status: 'in-progress' },
      { id: 'u1-l5', title: 'قانون كيرشوف — مسائل متقدمة', duration: '31:00', status: 'new' },
      { id: 'u1-l6', title: 'القدرة الكهربية واستهلاك الطاقة', duration: '17:20', status: 'new' },
    ],
  },
  {
    id: 'unit-2',
    name: 'الوحدة الثانية — المغناطيسية',
    icon: '🧲',
    accent: 'var(--color-chart-2)',
    lessons: [
      { id: 'u2-l1', title: 'المجال المغناطيسي للتيار المستقيم', duration: '24:00', status: 'completed' },
      { id: 'u2-l2', title: 'القوة المغناطيسية على سلك', duration: '21:15', status: 'in-progress' },
      { id: 'u2-l3', title: 'عزم الازدواج — الجلفانومتر', duration: '26:40', status: 'new' },
      { id: 'u2-l4', title: 'الحث الكهرومغناطيسي', duration: '29:55', status: 'new' },
    ],
  },
  {
    id: 'unit-3',
    name: 'الوحدة الثالثة — الفيزياء الحديثة',
    icon: '🔒',
    accent: 'var(--color-gold)',
    locked: true,
    price: '150 ج',
    lessons: [
      { id: 'u3-l1', title: 'النظرية الذرية — تمهيد مجاني', duration: '14:20', status: 'trial-open', isTrial: true },
      { id: 'u3-l2', title: 'الطيف الذري وطاقة الفوتون', duration: '23:10', status: 'locked' },
      { id: 'u3-l3', title: 'الليزر وتطبيقاته', duration: '20:35', status: 'locked' },
      { id: 'u3-l4', title: 'الأشعة السينية', duration: '18:50', status: 'locked' },
    ],
  },
  {
    id: 'unit-4',
    name: 'الوحدة الرابعة — التيار المتردد',
    icon: '🎁',
    accent: 'var(--color-chart-3)',
    isFree: true,
    lessons: [
      { id: 'u4-l1', title: 'مفهوم التيار المتردد', duration: '16:00', status: 'new' },
      { id: 'u4-l2', title: 'دوائر المقاومة والمكثف', duration: '22:30', status: 'new' },
    ],
  },
];

export interface LabCurriVariantMeta {
  id: string;
  name: string;
  tagline: string;
  traits: string[];
  bestFor: string;
}

export const LAB_CURRI_VARIANTS: LabCurriVariantMeta[] = [
  {
    id: '1',
    name: 'رحلة Timeline',
    tagline: 'خط زمني رأسي متصل — كل وحدة محطة في رحلتك، والخط بيتملي مع تقدمك',
    traits: ['مرتب وهادئ', 'التقدم واضح', 'مثالي للموبايل'],
    bestFor: 'لو عايز إحساس الإنجاز والترتيب بدون زحمة',
  },
  {
    id: '2',
    name: 'شبكة البطاقات',
    tagline: 'كروت وحدات شبكية بأغلفة ملونة وحلقة تقدم — أشيك وألطف بصريًا',
    traits: ['ملون ومبهج', 'الوحدات متساوية', 'دعوة للاستكشاف'],
    bestFor: 'لو عايز الصفحة تبان غنية وتعرض كل الوحدات مرة واحدة',
  },
  {
    id: '3',
    name: 'أكورديون مريح',
    tagline: 'تطوير لطيف للشكل الحالي — هيدر ثابت + بحث + فلاتر، نفس المنطق بدون كسر',
    traits: ['آمن وسريع', 'بحث وفلترة', 'بدون تغيير API'],
    bestFor: 'لو عايز تحسين مضمون بدون مخاطرة — ترشيحي الأول للتعميم',
  },
  {
    id: '4',
    name: 'لوحة مقسمة',
    tagline: 'قائمة وحدات يمين + دروس شمال — عملي ومنظم زي لوحات الإدارة',
    traits: ['منظم جدًا', 'ممتاز للديسكتوب', 'وصول سريع'],
    bestFor: 'لو الطالب عنده وحدات كتير وعايز يتنقل بسرعة',
  },
  {
    id: '5',
    name: 'خريطة الطريق',
    tagline: 'مسار متعرج بالنقط زي Duolingo — كل درس خطوة، والمقفول قفل يستنى التفعيل',
    traits: ['مرِح ومحفز', 'محبوب من الطلاب', 'إحساس لعبة'],
    bestFor: 'لو عايز ألطف وأمتع تجربة — خصوصًا لصغار السن',
  },
];
