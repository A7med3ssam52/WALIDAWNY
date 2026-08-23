import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getRpcCalls,
  makeDashboardStats,
  mockState,
  resetMockState,
  setAuthenticatedAdmin,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

const seededStats = makeDashboardStats({
  students: { total: 42, active: 40, disabled: 2, deleted: 1, new_this_month: 5 },
  purchases: { total: 30, staff_revenue_this_month: 3500, platform_fee_total: 10500 },
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
  by_grade: [
    { grade_name: 'الصف الأول', students: 20, purchases: 15, revenue: 5000 },
    { grade_name: 'الصف الثاني', students: 22, purchases: 14, revenue: 4500 },
  ],
  top_units: [
    { unit_name: 'الوحدة الأولى', purchases: 12, revenue: 4200 },
    { unit_name: 'الوحدة الثانية', purchases: 8, revenue: 2800 },
  ],
  recent_purchases: [
    {
      student_name: 'أحمد محمد',
      grade_name: 'الصف الأول',
      unit_name: 'الوحدة الأولى',
      total_price: 350,
      purchased_at: '2026-08-10T10:00:00Z',
    },
  ],
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
    // Staff revenue excludes platform fees
    expect(screen.getByText('إيرادات مستر وليد')).toBeInTheDocument();
    expect(screen.getByText('3500 ج.م')).toBeInTheDocument();
    // Platform revenue is admin-only, hidden from mr_walid
    expect(screen.queryByText('إجمالي إيرادات المنصة')).not.toBeInTheDocument();
    expect(screen.queryByText('10500 ج.م')).not.toBeInTheDocument();
    expect(getRpcCalls().some((call) => call.fn === 'get_dashboard_stats')).toBe(true);
  });

  it('shows platform revenue only to admin', async () => {
    resetMockState();
    setAuthenticatedAdmin();
    mockState.dashboardStats = seededStats;
    renderApp('/admin/dashboard');

    expect(await screen.findByText('إجمالي إيرادات المنصة')).toBeInTheDocument();
    expect(screen.getByText('10500 ج.م')).toBeInTheDocument();
  });

  it('renders the content cards', async () => {
    renderApp('/walid/dashboard');

    expect(await screen.findByText('31')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('27')).toBeInTheDocument();
  });

  it('renders the by-grade table with students, purchases and revenue', async () => {
    renderApp('/walid/dashboard');

    expect(await screen.findByText('15')).toBeInTheDocument();
    expect(screen.getByText('الطلاب والمشتريات حسب الصف')).toBeInTheDocument();
    expect(screen.getByText('الصف الأول')).toBeInTheDocument();
    expect(screen.getByText('الصف الثاني')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('5000 ج.م')).toBeInTheDocument();
  });

  it('renders the top units and recent purchases', async () => {
    renderApp('/walid/dashboard');

    expect(await screen.findByText('الوحدات الأكثر مبيعًا')).toBeInTheDocument();
    expect(screen.getByText('أحدث المشتريات')).toBeInTheDocument();
    expect(screen.getByText('أحمد محمد')).toBeInTheDocument();
    expect(screen.getAllByText('الوحدة الأولى').length).toBeGreaterThan(0);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders engagement stats', async () => {
    renderApp('/walid/dashboard');

    expect(await screen.findByText('مشاركة الطلاب')).toBeInTheDocument();
    expect(screen.getAllByText('18').length).toBeGreaterThan(0);
    expect(screen.getAllByText('120').length).toBeGreaterThan(0);
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
