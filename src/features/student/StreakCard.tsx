import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, PartyPopper, ShieldCheck, Sprout } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { GridCard } from '../../components/GridCard';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { getMyStreak, getRpcErrorCode, useStreakFreeze } from '../../data/rpc';
import { cn } from '../../lib/cn';
import type { MyStreak, StreakFlameStage } from '../../types/database';

const FREEZE_ERROR_MESSAGES: Record<string, string> = {
  freeze_already_used: 'استخدمت تجميد هذا الأسبوع بالفعل',
  no_missed_day: 'أسبوعك كامل — لا يوجد يوم فائت لتجميده',
  freeze_wont_help: 'التجميد لن يفيد هذه المرة — ابدأ سلسلة جديدة',
  access_denied: 'ليست لديك صلاحية',
};

function freezeErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && FREEZE_ERROR_MESSAGES[code]) return FREEZE_ERROR_MESSAGES[code];
  return 'تعذر تفعيل التجميد. حاول مرة أخرى';
}

const FLAME_STYLE: Record<StreakFlameStage, { icon: string; label: string }> = {
  none: { icon: 'text-foreground-subtle', label: 'بدون سلسلة' },
  spark: { icon: 'text-warning', label: 'شرارة' },
  flame: { icon: 'text-warning', label: 'لهب' },
  storm: { icon: 'text-error', label: 'عاصفة نارية' },
};

function weekdayShort(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat('ar', { weekday: 'short' }).format(new Date(`${isoDate}T12:00:00`));
  } catch {
    return '';
  }
}

function daysLeft(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

const MILESTONES: Record<number, string> = {
  7: 'أسبوع كامل من الالتزام! استمر',
  14: 'أسبوعان متتاليان — عاش يا بطل',
  30: 'شهر كامل! قسيمة الإعفاء بقت بتاعتك',
};

/**
 * Student dashboard streak card (0085 gentle streak).
 * Self-fetching and non-fatal: silent skeleton while loading, inline retry
 * on error — the dashboard must never break because of this card.
 */
export function StreakCard() {
  const { showToast } = useToast();
  const [streak, setStreak] = useState<MyStreak | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [freezeBusy, setFreezeBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setStreak(await getMyStreak());
    } catch {
      setStreak(null);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handler = () => {
      void load();
    };
    window.addEventListener('lesson-progress-updated', handler);
    return () => window.removeEventListener('lesson-progress-updated', handler);
  }, [load]);

  const handleFreeze = async () => {
    if (freezeBusy) return;
    setFreezeBusy(true);
    try {
      await useStreakFreeze();
      showToast('تم تجميد اليوم — سلسلتك محفوظة');
      await load();
    } catch (err) {
      showToast(freezeErrorMessage(err), 'error');
    } finally {
      setFreezeBusy(false);
    }
  };

  if (streak === undefined && !failed) {
    return (
      <div data-testid="streak-card-loading" aria-hidden="true">
        <GridCard>
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </GridCard>
      </div>
    );
  }

  if (streak === undefined || streak === null || failed) {
    return (
      <div data-testid="streak-card-error">
        <GridCard>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-foreground-muted">تعذر تحميل سلسلة المذاكرة</p>
            <button
              type="button"
              onClick={() => void load()}
              className="shrink-0 rounded-xl border border-border px-4 py-2 text-xs font-bold text-foreground hover:border-primary/50"
            >
              إعادة المحاولة
            </button>
          </div>
        </GridCard>
      </div>
    );
  }

  const flame = FLAME_STYLE[streak.flame_stage];
  const milestone = MILESTONES[streak.current_days];
  const voucherGranted = streak.voucher.status === 'granted';
  const voucherDays = voucherGranted && streak.voucher.expires_at ? daysLeft(streak.voucher.expires_at) : 0;

  return (
    <section data-testid="streak-card" aria-label="سلسلة المذاكرة">
      <GridCard>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl',
            streak.current_days > 0 ? 'bg-warning/10' : 'bg-surface-muted',
          )}
          aria-hidden="true"
        >
          <Flame
            className={cn(
              'h-7 w-7',
              flame.icon,
              streak.flame_stage === 'storm' && 'h-8 w-8',
              streak.current_days > 0 && 'animate-pulse',
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black text-foreground-subtle">سلسلة المذاكرة · {flame.label}</p>
          {streak.current_days > 0 ? (
            <p className="font-display text-2xl font-black tabular-nums text-foreground" data-testid="streak-count">
              {streak.current_days} <span className="text-sm font-bold text-foreground-muted">{streak.current_days === 1 ? 'يوم' : 'أيام'} متتالية</span>
            </p>
          ) : streak.last_active ? (
            <p className="mt-0.5 text-sm font-bold leading-6 text-foreground">انقطعت؟ عادي جدًا — كمّل النهاردة وابدأ من جديد</p>
          ) : (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-foreground">
              <Sprout aria-hidden="true" className="h-4 w-4 text-success" />
              ابدأ سلسلتك النهاردة — ذاكر أي درس
            </p>
          )}
        </div>
        <button
          type="button"
          data-testid="streak-freeze-btn"
          onClick={() => void handleFreeze()}
          disabled={!streak.freeze_available || freezeBusy}
          title={streak.freeze_available ? 'تجميد يوم فائت من هذا الأسبوع' : 'استخدمت تجميد هذا الأسبوع'}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong',
            streak.freeze_available
              ? 'border-info/40 bg-info/[0.08] text-info hover:bg-info/[0.14]'
              : 'cursor-not-allowed border-border bg-surface-muted text-foreground-subtle',
          )}
        >
          <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          {freezeBusy ? 'جاري...' : streak.freeze_available ? 'تجميد يوم' : 'اتستخدم'}
        </button>
      </div>

      {/* Week dots */}
      <ol data-testid="streak-week" className="mt-4 grid grid-cols-7 gap-1.5" aria-label="أيام الأسبوع">
        {streak.week.map((day) => (
          <li key={day.date} className="flex flex-col items-center gap-1">
            <span
              data-testid={`streak-day-${day.date}`}
              data-active={day.active}
              data-frozen={day.frozen}
              aria-label={`${weekdayShort(day.date)}: ${day.frozen ? 'مجمد' : day.active ? 'نشط' : day.future ? 'قادم' : 'فائت'}`}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-black',
                day.frozen
                  ? 'border-info/50 bg-info/[0.12] text-info'
                  : day.active
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : day.today
                      ? 'border-dashed border-primary-strong bg-primary-soft text-primary-strong'
                      : 'border-border bg-surface-muted text-foreground-subtle',
              )}
            >
              {day.frozen ? <ShieldCheck aria-hidden="true" className="h-4 w-4" /> : weekdayShort(day.date).charAt(0)}
            </span>
          </li>
        ))}
      </ol>

      {/* Milestone celebration (7/14/30 reached) */}
      {milestone ? (
        <div
          data-testid="streak-milestone"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/[0.07] p-3.5"
          role="status"
        >
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
            <PartyPopper className="h-5 w-5" />
          </span>
          <p className="text-sm font-black leading-6 text-foreground">{milestone}</p>
        </div>
      ) : null}

      {/* Voucher banner */}
      {voucherGranted ? (
        <div data-testid="streak-voucher-banner" className="mt-4 rounded-2xl border border-success/30 bg-success/[0.07] p-4">
          <div className="flex items-center gap-2">
            <Badge variant="success">قسيمة إعفاء</Badge>
            <span className="text-xs font-bold tabular-nums text-foreground-muted">صالحة {voucherDays} يوم</span>
          </div>
          <p className="mt-2 text-sm font-bold leading-6 text-foreground">
            كسبت إعفاءً من رسوم المنصة في وحدة واحدة — اختار وحدتك وفعّلها بكود المدرس
          </p>
          <Link
            to="/student/units"
            data-testid="streak-voucher-cta"
            className="btn-primary mt-3 inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-black"
          >
            اختار وحدتك
          </Link>
        </div>
      ) : null}
      </GridCard>
    </section>
  );
}
