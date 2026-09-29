/**
 * Mock data for /labs/redesign — "Manara" concept preview.
 * UI-only: no backend, no persistence, placeholder labels only.
 */

export interface RedesignUnit {
  id: string;
  category: string;
  title: string;
  duration: string;
  lessons: string;
  status: 'متاحة' | 'مقفولة';
  instructor: string;
  initials: string;
}

export interface RedesignQuote {
  id: string;
  text: string;
  name: string;
  context: string;
}

export const REDESIGN_STATS = [
  { id: 'stat-units', value: '٢٤', label: 'وحدة منظمة' },
  { id: 'stat-lessons', value: '١٨٠', label: 'درساً مصوراً' },
  { id: 'stat-activation', value: 'مدى الحياة', label: 'تفعيل واحد' },
] as const;

export const REDESIGN_UNITS: RedesignUnit[] = [
  { id: 'redesign-unit-1', category: 'الصف الأول', title: 'عنوان تجريبي للوحدة الأولى — سطران للمعاينة فقط', duration: '١س ٣٠د', lessons: '٦ دروس', status: 'متاحة', instructor: 'م. تجريبي', initials: '١' },
  { id: 'redesign-unit-2', category: 'الصف الثاني', title: 'عنوان تجريبي للوحدة الثانية — سطران للمعاينة فقط', duration: '٢س ١٠د', lessons: '٨ دروس', status: 'متاحة', instructor: 'م. تجريبي', initials: '٢' },
  { id: 'redesign-unit-3', category: 'الصف الثالث', title: 'عنوان تجريبي للوحدة الثالثة — سطران للمعاينة فقط', duration: '١س ٤٥د', lessons: '٥ دروس', status: 'مقفولة', instructor: 'م. تجريبي', initials: '٣' },
  { id: 'redesign-unit-4', category: 'الصف الأول', title: 'عنوان تجريبي للوحدة الرابعة — سطران للمعاينة فقط', duration: '٣س ٢٠د', lessons: '١٠ دروس', status: 'متاحة', instructor: 'م. تجريبي', initials: '٤' },
  { id: 'redesign-unit-5', category: 'الصف الثاني', title: 'عنوان تجريبي للوحدة الخامسة — سطران للمعاينة فقط', duration: '٢س ٠٠د', lessons: '٧ دروس', status: 'مقفولة', instructor: 'م. تجريبي', initials: '٥' },
  { id: 'redesign-unit-6', category: 'الصف الثالث', title: 'عنوان تجريبي للوحدة السادسة — سطران للمعاينة فقط', duration: '١س ١٥د', lessons: '٤ دروس', status: 'متاحة', instructor: 'م. تجريبي', initials: '٦' },
  { id: 'redesign-unit-7', category: 'الصف الأول', title: 'عنوان تجريبي للوحدة السابعة — سطران للمعاينة فقط', duration: '٢س ٤٠د', lessons: '٩ دروس', status: 'متاحة', instructor: 'م. تجريبي', initials: '٧' },
  { id: 'redesign-unit-8', category: 'الصف الثالث', title: 'عنوان تجريبي للوحدة الثامنة — سطران للمعاينة فقط', duration: '١س ٥٠د', lessons: '٦ دروس', status: 'مقفولة', instructor: 'م. تجريبي', initials: '٨' },
];

export const REDESIGN_TOP_STUDENTS: string[] = [
  'الطالب ١', 'الطالب ٢', 'الطالب ٣', 'الطالب ٤',
  'الطالب ٥', 'الطالب ٦', 'الطالب ٧', 'الطالب ٨',
  'الطالب ٩', 'الطالب ١٠', 'الطالب ١١', 'الطالب ١٢',
];

export const REDESIGN_QUOTES: RedesignQuote[] = [
  { id: 'redesign-quote-1', text: 'نص تجريبي قصير لرأي طالب — سطر واحد للمعاينة البصرية فقط.', name: 'طالب تجريبي ١', context: 'سياق تجريبي' },
  { id: 'redesign-quote-2', text: 'نص تجريبي قصير لرأي طالب — سطر واحد للمعاينة البصرية فقط.', name: 'طالب تجريبي ٢', context: 'سياق تجريبي' },
  { id: 'redesign-quote-3', text: 'نص تجريبي قصير لرأي طالب — سطر واحد للمعاينة البصرية فقط.', name: 'طالب تجريبي ٣', context: 'سياق تجريبي' },
];

export const REDESIGN_STEPS = [
  { id: 'step-1', number: '٠١', title: 'أنشئ حسابك', description: 'سطر تجريبي واحد لوصف الخطوة الأولى.' },
  { id: 'step-2', number: '٠٢', title: 'فعّل وحدتك', description: 'سطر تجريبي واحد لوصف الخطوة الثانية.' },
  { id: 'step-3', number: '٠٣', title: 'تابع دروسك', description: 'سطر تجريبي واحد لوصف الخطوة الثالثة.' },
] as const;
