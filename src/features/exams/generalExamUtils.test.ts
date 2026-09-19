import { describe, expect, it } from 'vitest';

import {
  formatCountdown,
  fromDateTimeLocalValue,
  getAttemptDeadlineMs,
  getGeneralExamTimeState,
  getRemainingMs,
  toDateTimeLocalValue,
} from './generalExamUtils';

const base = {
  status: 'published' as const,
  starts_at: null,
  ends_at: null,
};

describe('getGeneralExamTimeState', () => {
  it('returns draft/archived verbatim', () => {
    expect(getGeneralExamTimeState({ ...base, status: 'draft' })).toBe('draft');
    expect(getGeneralExamTimeState({ ...base, status: 'archived' })).toBe('archived');
  });

  it('returns open when no window is set', () => {
    expect(getGeneralExamTimeState(base, Date.parse('2026-01-01T00:00:00Z'))).toBe('open');
  });

  it('detects upcoming / live / ended around the window', () => {
    const exam = {
      ...base,
      starts_at: '2026-05-01T10:00:00Z',
      ends_at: '2026-05-01T12:00:00Z',
    };
    expect(getGeneralExamTimeState(exam, Date.parse('2026-05-01T09:00:00Z'))).toBe('upcoming');
    expect(getGeneralExamTimeState(exam, Date.parse('2026-05-01T11:00:00Z'))).toBe('live');
    expect(getGeneralExamTimeState(exam, Date.parse('2026-05-01T13:00:00Z'))).toBe('ended');
  });

  it('treats corrupt date strings as missing (never fake-live)', () => {
    expect(
      getGeneralExamTimeState(
        { ...base, starts_at: 'not-a-date', ends_at: 'also-bad' },
        Date.parse('2026-01-01T00:00:00Z'),
      ),
    ).toBe('open');
  });
});

describe('getAttemptDeadlineMs', () => {
  it('picks the earlier of duration deadline and window end', () => {
    const started = '2026-05-01T10:00:00Z';
    // duration ends 11:00, window ends 12:00 -> duration wins
    expect(getAttemptDeadlineMs(started, 60, '2026-05-01T12:00:00Z')).toBe(
      Date.parse('2026-05-01T11:00:00Z'),
    );
    // window ends 10:30, duration ends 11:00 -> window wins
    expect(getAttemptDeadlineMs(started, 60, '2026-05-01T10:30:00Z')).toBe(
      Date.parse('2026-05-01T10:30:00Z'),
    );
  });

  it('returns null when no bound exists', () => {
    expect(getAttemptDeadlineMs(null, null, null)).toBeNull();
    expect(getAttemptDeadlineMs(null, 60, null)).toBeNull();
  });
});

describe('getRemainingMs', () => {
  it('clamps at zero and passes through null', () => {
    expect(getRemainingMs(null)).toBeNull();
    expect(getRemainingMs(1000, 500)).toBe(500);
    expect(getRemainingMs(1000, 5000)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('formats mm:ss under an hour and hh:mm:ss above', () => {
    expect(formatCountdown(5 * 60_000 + 3_000)).toBe('05:03');
    expect(formatCountdown(2 * 3_600_000 + 5 * 60_000 + 9_000)).toBe('02:05:09');
    expect(formatCountdown(-100)).toBe('00:00');
  });
});

describe('datetime-local conversions', () => {
  it('round-trips through the local input format', () => {
    const iso = '2026-05-01T10:00:00.000Z';
    const local = toDateTimeLocalValue(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const back = fromDateTimeLocalValue(local);
    expect(back).not.toBeNull();
    // minute precision survives the round-trip
    expect(Date.parse(back as string) / 60_000).toBe(Math.floor(Date.parse(iso) / 60_000));
    expect(toDateTimeLocalValue(null)).toBe('');
    expect(fromDateTimeLocalValue('')).toBeNull();
  });
});
