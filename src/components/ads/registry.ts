import type { AdDesignMeta } from './types';
import {
  Design01ClassicCenter,
  Design02TopSheet,
  Design03BottomSheet,
  Design04SideDrawer,
  Design05SplitMedia,
} from './designs/designsA';
import {
  Design06Fullscreen,
  Design07MiniToast,
  Design08NeonRing,
  Design09GradientHeader,
  Design10PulseIcon,
} from './designs/designsB';
import {
  Design11Countdown,
  Design12Celebration,
  Design13DangerStriped,
  Design14WarningGlow,
  Design15InfoGlass,
} from './designs/designsC';
import {
  Design16PromoOffer,
  Design17HeroImage,
  Design18PillCompact,
  Design19DecisionDual,
  Design20OfficialLetter,
} from './designs/designsD';

/**
 * سجل الـ20 تصميم — كل تصميم يحدد موضع الـModal وحجمه المناسب.
 * الأرقام ثابتة لسهولة الإشارة إليها في صفحة preview/ads.
 */
export const AD_DESIGNS: AdDesignMeta[] = [
  { id: 'classic-center', number: 1, name: 'كلاسيك زجاجي وسطي', description: 'التصميم الأساسي المتوازن لكل الإعلانات العامة.', bestFor: 'إعلانات عامة — معلومات ونجاح', placement: 'center', size: 'md', component: Design01ClassicCenter },
  { id: 'top-sheet', number: 2, name: 'شريط علوي منبثق', description: 'ينزل من أعلى الشاشة كموجز سريع لا يعطل التصفح.', bestFor: 'تنبيهات خفيفة أعلى الصفحة', placement: 'top', size: 'md', component: Design02TopSheet },
  { id: 'bottom-sheet', number: 3, name: 'ورقة سفلية (موبايل)', description: 'ورقة سفلية بمقبض سحب وأزرار مريحة للإبهام.', bestFor: 'موبايل — إعلانات ترويجية', placement: 'bottom', size: 'md', component: Design03BottomSheet },
  { id: 'side-drawer', number: 4, name: 'درج جانبي', description: 'لوحة جانبية بمساحة قراءة مريحة للنصوص الطويلة.', bestFor: 'إعلانات مطولة وشروط', placement: 'side', size: 'md', component: Design04SideDrawer },
  { id: 'split-media', number: 5, name: 'مقسم صورة / محتوى', description: 'جانب بصري ملون + محتوى نصي — إحساس إعلاني حقيقي.', bestFor: 'حملات ووحدات جديدة', placement: 'center', size: 'lg', component: Design05SplitMedia },
  { id: 'fullscreen', number: 6, name: 'ملء الشاشة سينمائي', description: 'تجربة غامرة للإعلانات الكبرى والمفاجآت.', bestFor: 'إطلاق كبير — نتائج وخصومات', placement: 'fullscreen', size: 'lg', component: Design06Fullscreen },
  { id: 'mini-toast', number: 7, name: 'توست مصغر', description: 'أصغر Modal — رسالة سريعة تُغلق في ثانية.', bestFor: 'تأكيدات وتنبيهات لحظية', placement: 'center', size: 'sm', component: Design07MiniToast },
  { id: 'neon-ring', number: 8, name: 'حلقة نيون فاخرة', description: 'بلمسة conic-ring المضيئة وهوية المنصة الليلية.', bestFor: 'إعلانات مميزة وفاخرة', placement: 'center', size: 'md', component: Design08NeonRing },
  { id: 'gradient-header', number: 9, name: 'ترويسة متدرجة', description: 'ترويسة ملونة بمنحنى سفلي أنيق حسب النوع.', bestFor: 'تحذير / نجاح / معلومات', placement: 'center', size: 'md', component: Design09GradientHeader },
  { id: 'pulse-icon', number: 10, name: 'أيقونة نابضة', description: 'نبض انتباه حول الأيقونة للتنبيهات العاجلة.', bestFor: 'تنبيه عاجل لا يُتجاهل', placement: 'center', size: 'md', component: Design10PulseIcon },
  { id: 'countdown', number: 11, name: 'عد تنازلي تلقائي', description: 'شريط تقدم + عدّاد 15 ثانية ثم إغلاق تلقائي.', bestFor: 'إعلانات مؤقتة تُغلق وحدها', placement: 'center', size: 'md', component: Design11Countdown },
  { id: 'celebration', number: 12, name: 'احتفالي confetti', description: 'قصاصات ملونة طائرة لأخبار النجاح والتهاني.', bestFor: 'نجاح — تهنئة وتفعيل', placement: 'center', size: 'md', component: Design12Celebration },
  { id: 'danger-striped', number: 13, name: 'خطر مخطط', description: 'شريط تحذيري مخطط وإطار أحمر للأخطاء الحرجة.', bestFor: 'خطأ حرج — إيقاف وتعليق', placement: 'center', size: 'md', component: Design13DangerStriped },
  { id: 'warning-glow', number: 14, name: 'تحذير متوهج', description: 'توهج كهرماني ناعم يحيط بالتحذير دون إزعاج.', bestFor: 'تحذير — مراجعة مطلوبة', placement: 'center', size: 'md', component: Design14WarningGlow },
  { id: 'info-glass', number: 15, name: 'معلومات زجاجية', description: 'زجاج هادئ بلمستين ضوئيتين للمعلومات اليومية.', bestFor: 'معلومات يومية هادئة', placement: 'center', size: 'md', component: Design15InfoGlass },
  { id: 'promo-offer', number: 16, name: 'عرض ترويجي', description: 'بطاقة عرض بشارة هدية وشارات إتاحة.', bestFor: 'خصومات وأكواد WLDN', placement: 'center', size: 'md', component: Design16PromoOffer },
  { id: 'hero-image', number: 17, name: 'بطل بصورة علوية', description: 'مساحة بطل ملونة تعلو النص — حضور إعلاني قوي.', bestFor: 'وحدة جديدة وملازم PDF', placement: 'center', size: 'lg', component: Design17HeroImage },
  { id: 'pill-compact', number: 18, name: 'حبة مضغوطة', description: 'سطر واحد مضغوط: أيقونة + نص + زر.', bestFor: 'تنبيه شريطي داخل Modal', placement: 'center', size: 'md', component: Design18PillCompact },
  { id: 'decision-dual', number: 19, name: 'قرار مزدوج', description: 'زرّان متساويان لاتخاذ قرار واضح وسريع.', bestFor: 'موافقة / تأجيل — CTA مزدوج', placement: 'center', size: 'md', component: Design19DecisionDual },
  { id: 'official-letter', number: 20, name: 'خطاب رسمي بالختم', description: 'ورقة رسمية بختم دائري وتوقيع وتاريخ — أعلى درجات الجدية.', bestFor: 'بيانات رسمية بتوقيع الإدارة', placement: 'center', size: 'lg', component: Design20OfficialLetter },
];

export function getAdDesign(id: string): AdDesignMeta | undefined {
  return AD_DESIGNS.find((d) => d.id === id);
}
