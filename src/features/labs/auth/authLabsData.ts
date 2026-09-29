import { BarChart3, MessageCircle, Video } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * /labs/auth shared mock data — UI only, no backend, no persistence.
 * Mirrors the real auth field set (Arabic labels) so lab variants can be
 * compared against production screens.
 */

export interface LabGrade {
  id: string;
  name: string;
}

export const LAB_GRADES: LabGrade[] = [
  { id: 'grade-1', name: 'الصف الأول الثانوي' },
  { id: 'grade-2', name: 'الصف الثاني الثانوي' },
  { id: 'grade-3', name: 'الصف الثالث الثانوي' },
];

export interface LabValueProp {
  title: string;
  description: string;
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

export const LAB_VALUE_PROPS: LabValueProp[] = [
  {
    title: 'دروس مصورة بجودة عالية',
    description: 'محتوى حصري منشور بعناية لمتابعة المذاكرة خطوة بخطوة',
    Icon: Video,
  },
  {
    title: 'متابعة مستمرة للتقدم',
    description: 'اعرف نسبة إنجازك في كل درس ووحدة بمجرد فتح المنصة',
    Icon: BarChart3,
  },
  {
    title: 'تواصل مباشر مع الأستاذ',
    description: 'أي استفسار؟ الأستاذ بجانبك دائمًا عبر واتساب',
    Icon: MessageCircle,
  },
];

export interface LabVariantMeta {
  id: string;
  name: string;
  description: string;
  loginPath: string;
  registerPath: string;
}

export const LAB_AUTH_VARIANTS: LabVariantMeta[] = [
  {
    id: '1',
    name: 'سبليت كلاسيكي',
    description: 'لوحة جانبية داكنة بنقاط البيع + نموذج بجانبها — تطوير مباشر للتصميم الحالي',
    loginPath: '/labs/login1',
    registerPath: '/labs/register1',
  },
  {
    id: '2',
    name: 'بطاقة مركزية هادئة',
    description: 'بطاقة نحيفة متمركزة على خلفية منقوشة — تركيز كامل على النموذج',
    loginPath: '/labs/login2',
    registerPath: '/labs/register2',
  },
  {
    id: '3',
    name: 'خطوات متدرجة',
    description: 'التسجيل على 3 خطوات بمؤشر تقدم — تقليل الاحتكاك في الاستمارة الطويلة',
    loginPath: '/labs/login3',
    registerPath: '/labs/register3',
  },
  {
    id: '4',
    name: 'زجاجي عائم',
    description: 'بطاقة عائمة فوق شبكة متدرجة مطفية — إحساس عصري فاخر',
    loginPath: '/labs/login4',
    registerPath: '/labs/register4',
  },
  {
    id: '5',
    name: 'تطبيقي مباشر',
    description: 'عنوان ضخم وزر عريض وبطاقات اختيار — لغة تطبيقات الجوال',
    loginPath: '/labs/login5',
    registerPath: '/labs/register5',
  },
];

export const LAB_DEMO_ERROR = 'بيانات الدخول غير صحيحة — عرض تجريبي، لا يتم إرسال أي بيانات';
