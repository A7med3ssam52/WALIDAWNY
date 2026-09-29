import { useEffect, useState } from 'react';
import { Pause, Play, Timer, Users } from 'lucide-react';

import { LAB_FUN_ROOMS } from './funLabsData';
import { FunShell } from './mockKit';
import { cn } from '../../../lib/cn';

/**
 * Labs fun variant 1 — غرف مذاكرة حية.
 * Room cards with live presence, shared pomodoro timer, quick reactions.
 * No open chat by design (student safety). UI mock only.
 */

const REACTIONS = [
  { id: 'like', icon: '👍', label: 'عاش', start: 12 },
  { id: 'fire', icon: '🔥', label: 'حماس', start: 8 },
  { id: 'clap', icon: '👏', label: 'برافو', start: 5 },
];

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function RoomTimer({ minutes, seconds }: { minutes: number; seconds: number }) {
  const [left, setLeft] = useState(minutes * 60 + seconds);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span data-testid="fun-room-timer" className="font-display text-2xl font-black tabular-nums text-foreground">
      {pad(Math.floor(left / 60))}:{pad(left % 60)}
    </span>
  );
}

export function Fun1() {
  const [joined, setJoined] = useState<string[]>(['room-1']);
  const [paused, setPaused] = useState(false);
  const [reacts, setReacts] = useState<Record<string, number>>({});

  const toggleJoin = (id: string) =>
    setJoined((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));

  return (
    <FunShell testId="labs-fun1">
      {/* Shared pomodoro banner */}
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-medium">
        <div className="flex items-center gap-4 p-5">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong">
            <Timer className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black text-foreground-subtle">جلسة التركيز المشتركة</p>
            <RoomTimer minutes={LAB_FUN_ROOMS[0].minutesLeft} seconds={LAB_FUN_ROOMS[0].secondsLeft} />
          </div>
          <button
            type="button"
            data-testid="fun-pomodoro-toggle"
            aria-pressed={paused}
            onClick={() => setPaused((p) => !p)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
            aria-label={paused ? 'استئناف المؤقت' : 'إيقاف المؤقت مؤقتًا'}
          >
            {paused ? <Play aria-hidden="true" className="h-5 w-5" /> : <Pause aria-hidden="true" className="h-5 w-5" />}
          </button>
        </div>
        <p className="border-t border-border-muted px-5 py-2.5 text-[11px] text-foreground-subtle">
          {paused ? 'المؤقت متوقف — خد نفسك وارجع' : '٢٣ طالب بيذاكروا معاك دلوقتي — كمّل، فاضل القليل'}
        </p>
      </div>

      {/* Rooms */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {LAB_FUN_ROOMS.map((room) => {
          const inside = joined.includes(room.id);
          return (
            <article
              key={room.id}
              data-testid={`fun-room-${room.id}`}
              className={cn(
                'overflow-hidden rounded-3xl border bg-surface shadow-medium transition-colors',
                inside ? 'border-primary-strong' : 'border-border',
              )}
            >
              <div className="p-5 pb-4" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${room.accent} 16%, transparent), transparent 70%)` }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-black text-foreground-muted">{room.subject}</span>
                  <span className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black',
                    room.phase === 'focus' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                  )}>
                    <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', room.phase === 'focus' ? 'animate-pulse bg-success' : 'bg-warning')} />
                    {room.phase === 'focus' ? 'تركيز' : 'راحة'}
                  </span>
                </div>
                <h4 className="mt-3 font-display text-base font-black leading-7 text-foreground">{room.name}</h4>
                <p className="mt-0.5 text-xs text-foreground-muted">بإشراف {room.host}</p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex -space-x-2 space-x-reverse" aria-hidden="true">
                    {room.memberNames.slice(0, 5).map((n) => (
                      <span key={n} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-primary-soft text-[11px] font-black text-primary-strong">
                        {n.charAt(0)}
                      </span>
                    ))}
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-foreground-muted">
                    <Users aria-hidden="true" className="h-3.5 w-3.5" />
                    {room.members + (inside ? 0 : 0)} بيذاكروا
                  </span>
                </div>
              </div>
              <div className="border-t border-border-muted p-3">
                <div className="flex gap-1.5" role="group" aria-label={`تفاعلات ${room.name}`}>
                  {REACTIONS.map((r) => {
                    const count = (reacts[`${room.id}-${r.id}`] ?? r.start);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        data-testid={`fun-react-${room.id}-${r.id}`}
                        onClick={() => setReacts((prev) => ({ ...prev, [`${room.id}-${r.id}`]: count + 1 }))}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-border bg-surface-muted/50 px-2 py-2 text-xs font-black text-foreground-muted transition-colors hover:border-primary/40 hover:text-foreground"
                      >
                        <span aria-hidden="true">{r.icon}</span>
                        <span className="tabular-nums">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  data-testid={`fun-join-${room.id}`}
                  aria-pressed={inside}
                  onClick={() => toggleJoin(room.id)}
                  className={cn(
                    'mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-black transition-colors',
                    inside ? 'border border-success/40 bg-success/10 text-success' : 'btn-primary',
                  )}
                >
                  {inside ? '✓ أنت جوّه — اخرج' : 'انضم للغرفة'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <p className="rounded-2xl border border-dashed border-border bg-surface p-4 text-center text-xs leading-6 text-foreground-subtle">
        بدون شات مفتوح — حضور وتفاعلات جاهزة فقط، والغرف بإشراف الأستاذ
      </p>
    </FunShell>
  );
}
