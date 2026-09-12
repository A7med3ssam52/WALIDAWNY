import type { ComponentType } from 'react';

export type AdVariant = 'info' | 'success' | 'warning' | 'error';

export type AdPlacement = 'center' | 'top' | 'bottom' | 'side' | 'fullscreen';

export type AdSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AdContent {
  title: string;
  body: string;
  link_url?: string | null;
  link_label?: string | null;
  variant: AdVariant;
  /** إظهار التوقيع أسفل الإعلان */
  showSignature?: boolean;
  /** اسم الموقّع — افتراضي: إدارة منصة وليد عوني */
  signatureName?: string;
  /** صفة الموقّع — افتراضي: إدارة المنصة */
  signatureTitle?: string;
}

export interface AdDesignProps {
  content: AdContent;
  onClose: () => void;
  /** وضع مصغّر داخل بطاقات المعاينة (بدون حركات ثقيلة) */
  miniature?: boolean;
}

export interface AdDesignMeta {
  id: string;
  number: number;
  name: string;
  description: string;
  bestFor: string;
  placement: AdPlacement;
  size: AdSize;
  component: ComponentType<AdDesignProps>;
}

export const DEFAULT_AD_CONTENT: AdContent = {
  title: 'إعلان مهم من المنصة',
  body: 'تم فتح وحدة جديدة في منهج الصف الثالث الثانوي مع ملازم PDF وسبورات تفاعلية. ادخل الآن وتابع دروسك من حيث توقفت.',
  link_url: 'https://example.com',
  link_label: 'عرض التفاصيل',
  variant: 'info',
  showSignature: true,
  signatureName: 'إدارة منصة وليد عوني',
  signatureTitle: 'التوقيع الرسمي للإدارة',
};
