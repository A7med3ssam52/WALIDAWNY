import { Skeleton } from '../../components/Skeleton';
import { getRpcErrorCode } from '../../data/rpc';

const CURRICULUM_ERROR_MESSAGES: Record<string, string> = {
  unit_not_found: 'الوحدة غير موجودة',
  lesson_not_found: 'الدرس غير موجود',
  access_denied: 'ليست لديك صلاحية',
  permission_denied: 'ليست لديك صلاحية',
};

export function curriculumErrorMessage(error: unknown, unitContext = true): string {
  const code = getRpcErrorCode(error);
  if (code && CURRICULUM_ERROR_MESSAGES[code]) {
    return CURRICULUM_ERROR_MESSAGES[code];
  }
  if (code && code.includes('duplicate key value')) {
    return unitContext ? 'يوجد وحدة بنفس الاسم في هذا الصف' : 'تعذر تنفيذ العملية. حاول مرة أخرى';
  }
  return 'تعذر تنفيذ العملية. حاول مرة أخرى';
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-md" />
      ))}
    </div>
  );
}

export function OrderChip({ order, active = false }: { order: number; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold ${
        active
          ? 'border-indigo-400/40 bg-indigo-500/20 text-indigo-200'
          : 'border-white/10 bg-white/5 text-foreground-subtle'
      }`}
    >
      {order}
    </span>
  );
}
