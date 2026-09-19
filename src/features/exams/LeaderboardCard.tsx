import { Crown } from 'lucide-react';

import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import type { GeneralExamLeaderboardRow } from '../../types/database';

const RANK_STYLES: Record<number, string> = {
  1: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
  2: 'bg-slate-300/10 text-slate-200 border-slate-300/25',
  3: 'bg-orange-400/10 text-orange-300 border-orange-400/25',
};

function formatScore(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

interface LeaderboardCardProps {
  rows: GeneralExamLeaderboardRow[] | null;
  highlightStudentId?: string | null;
  totalScore?: number | null;
  title?: string;
}

export function LeaderboardCard({
  rows,
  highlightStudentId,
  totalScore,
  title = 'قايمة الأوائل',
}: LeaderboardCardProps) {
  if (rows === null) {
    return (
      <Card title={title}>
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card title={title}>
        <EmptyState title="لا توجد محاولات بعد" description="كن أول من يدخل الامتحان" />
      </Card>
    );
  }

  return (
    <Card title={title} subtitle={totalScore != null ? `الدرجة الكلية: ${formatScore(totalScore)}` : undefined}>
      <ol className="flex flex-col gap-2">
        {rows.map((row) => {
          const isMe = highlightStudentId != null && row.student_id === highlightStudentId;
          const rankStyle = RANK_STYLES[row.rank] ?? 'bg-white/4 text-foreground-muted border-white/8';
          return (
            <li
              key={row.student_id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                isMe ? 'border-primary/50 bg-primary/10' : 'border-white/6 bg-white/3'
              }`}
            >
              <span
                aria-label={`المركز ${row.rank}`}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-black ${rankStyle}`}
              >
                {row.rank <= 3 ? (
                  <span className="flex items-center gap-0.5">
                    {row.rank === 1 ? <Crown aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                    {row.rank}
                  </span>
                ) : (
                  row.rank
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground">
                  {row.student_name || 'طالب'}
                  {isMe ? ' (أنت)' : ''}
                </span>
                <span className="block text-xs text-foreground-subtle">
                  {row.status === 'graded' ? 'تم التصحيح' : 'بانتظار التصحيح'}
                </span>
              </span>
              <span className="shrink-0 text-sm font-black text-foreground">
                {formatScore(row.final_score)}
                {totalScore != null && row.final_score != null ? (
                  <span className="font-bold text-foreground-subtle"> / {formatScore(totalScore)}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
