import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ComponentType } from 'react';

import type { AdVariant } from './types';

interface VariantTheme {
  label: string;
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  /** لون الأيقونة */
  iconText: string;
  /** خلفية حاوية الأيقونة */
  iconBg: string;
  /** حد متدرج علوي / شريط */
  accentBar: string;
  /** زر أساسي */
  primaryBtn: string;
  /** توهج للخلفية */
  glow: string;
  /** شارة النوع */
  badge: string;
}

export const VARIANT_THEME: Record<AdVariant, VariantTheme> = {
  info: {
    label: 'معلومات',
    Icon: Info,
    iconText: 'text-sky-300',
    iconBg: 'bg-sky-500/15 border-sky-400/25',
    accentBar: 'from-sky-400 via-cyan-400 to-indigo-500',
    primaryBtn:
      'bg-gradient-to-l from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 shadow-[0_12px_30px_-10px_rgba(56,189,248,0.7)]',
    glow: 'bg-sky-500/20',
    badge: 'bg-sky-500/15 text-sky-200 border-sky-400/25',
  },
  success: {
    label: 'نجاح',
    Icon: CheckCircle2,
    iconText: 'text-emerald-300',
    iconBg: 'bg-emerald-500/15 border-emerald-400/25',
    accentBar: 'from-emerald-400 via-green-400 to-teal-500',
    primaryBtn:
      'bg-gradient-to-l from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-[0_12px_30px_-10px_rgba(16,185,129,0.7)]',
    glow: 'bg-emerald-500/20',
    badge: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25',
  },
  warning: {
    label: 'تحذير',
    Icon: AlertTriangle,
    iconText: 'text-amber-300',
    iconBg: 'bg-amber-500/15 border-amber-400/25',
    accentBar: 'from-amber-400 via-orange-400 to-yellow-500',
    primaryBtn:
      'bg-gradient-to-l from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-[0_12px_30px_-10px_rgba(245,158,11,0.7)]',
    glow: 'bg-amber-500/20',
    badge: 'bg-amber-500/15 text-amber-200 border-amber-400/25',
  },
  error: {
    label: 'خطأ',
    Icon: XCircle,
    iconText: 'text-rose-300',
    iconBg: 'bg-rose-500/15 border-rose-400/25',
    accentBar: 'from-rose-500 via-red-500 to-orange-500',
    primaryBtn:
      'bg-gradient-to-l from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 shadow-[0_12px_30px_-10px_rgba(244,63,94,0.7)]',
    glow: 'bg-rose-500/20',
    badge: 'bg-rose-500/15 text-rose-200 border-rose-400/25',
  },
};

export const VARIANT_LABELS: Record<AdVariant, string> = {
  info: 'معلومات',
  success: 'نجاح',
  warning: 'تحذير',
  error: 'خطأ',
};
