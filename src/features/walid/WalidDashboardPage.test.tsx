import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getRpcCalls,
  makeDashboardStats,
  mockState,
  resetMockState,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

const seededStats = makeDashboardStats({
  students: { total: 42, active: 40, disabled: 2, deleted: 1, new_this_month: 5 },
  subscriptions: {
    active: 30,
    expiring_7d: 4,
    expired: 12,
    revenue_total: 10500,
    revenue_this_month: 3500,
  },
  content: {
    grades: 3,
    units: 9,
    lessons: 45,
    published_lessons: 31,
    videos: 28,
    videos_ready: 25,
    pdfs: 32,
    pdfs_ready: 27,
  },
  engagement: { students_with_progress: 18, completed_lessons: 120, avg_percent: 61.5 },
  codes: { available: 80, used: 200, revoked: 10 },
  by_grade: [
    { grade_name: 'الصف الأول', students: 20, active_subscribers: 15 },
    { grade_name: 'الصف الثاني', students: 22, active_subscribers: 14 },
  ],
  recent_subscriptions: [
    {
      student_name: 'أحمد محمد',
      grade_name: 'الصف الأول',
      duration_days: 30,
      total_price: 350,
      status: 'active',
      started_at: '2026-08-10T10:00:00Z',
      expires_at: '2026-09-09T10:00:00Z',
    },
  ],
  upcoming_expirations: [{ student_name: 'منى سعيد', expires_at: '2026-08-15T10:00:00Z' }],
});

describe('WalidDashboardPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid();
    mockState.dashboardStats = seededStats;
  });

  it('loads the stats and renders the headline cards', async () => {
    renderApp('/walid/dashboard');

    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('لوحة المعلومات')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('10500 ج.م')).toBeInTheDocument();
    expect(getRpcCalls().some((call) => call.fn === 'get_dashboard_stats')).toBe(true);
  });

  it('renders content and code cards', async () => {
    renderApp('/walid/dashboard');

    expect(await screen.findByText('30')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('27')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText(/مستخدمة: 200/)).toBeInTheDocument();
  });

  it('renders the by-grade table with subscribers', async () => {
    renderApp('/walid/dashboard');

    expect(await screen.findByText('15')).toBeInTheDocument();
    expect(screen.getByText('الطلاب حسب الصف')).toBeInTheDocument();
    expect(screen.getByText('الصف الأول')).toBeInTheDocument();
    expect(screen.getByText('الصف الثاني')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('renders recent subscriptions and upcoming expirations', async () => {
    renderApp('/walid/dashboard');

    expect(await screen.findByText('آخر الاشتراكات')).toBeInTheDocument();
    expect(screen.getByText('أحمد محمد')).toBeInTheDocument();
    expect(screen.getByText('اشتراكات تنتهي قريبًا')).toBeInTheDocument();
    expect(screen.getByText('منى سعيد')).toBeInTheDocument();
  });

  it('renders engagement stats', async () => {
    renderApp('/walid/dashboard');

    expect(await screen.findByText('مشاركة الطلاب')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('%61.5')).toBeInTheDocument();
  });

  it('shows empty states when there is no data yet', async () => {
    mockState.dashboardStats = makeDashboardStats();
    renderApp('/walid/dashboard');

    expect((await screen.findAllByText('لا توجد بيانات بعد')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('0')).length).toBeGreaterThan(0);
  });

  it('shows the error state when the stats call fails', async () => {
    mockState.rpcErrors['get_dashboard_stats'] = 'permission_denied';
    renderApp('/walid/dashboard');

    expect(await screen.findByText('تعذر تحميل بيانات اللوحة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إعادة المحاولة/ })).toBeInTheDocument();
  });
});
