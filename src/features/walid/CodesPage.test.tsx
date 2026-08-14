import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  expectRpcCall,
  makeCode,
  makeGrade,
  makePlan,
  makeProfile,
  mockState,
  resetMockState,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

function seedPlan() {
  mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
  mockState.pricingPlans.push(
    makePlan({
      id: 'plan-1',
      grade_id: 'grade-1',
      duration_days: 30,
      base_price: 300,
      platform_fee: 50,
      total_price: 350,
    }),
  );
}

async function generateCodes(user: ReturnType<typeof userEvent.setup>, count = '2') {
  await user.type(await screen.findByLabelText('عدد الأكواد (1 - 500)'), count);
  await user.click(screen.getByRole('button', { name: 'توليد الأكواد' }));
}

describe('CodesPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid();
    seedPlan();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        codes: [
          {
            code: 'WLDN-AAAA-BBBB-CCCC',
            plan: 'monthly',
            status: 'active',
            created_at: '2026-06-01T00:00:00Z',
            note: null,
          },
          {
            code: 'WLDN-DDDD-EEEE-FFFF',
            plan: 'monthly',
            status: 'active',
            created_at: '2026-06-01T00:00:00Z',
            note: null,
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates the count range client-side and does not call the function', async () => {
    const user = userEvent.setup();
    renderApp('/walid/codes');

    await user.type(await screen.findByLabelText('عدد الأكواد (1 - 500)'), '501');
    await user.click(screen.getByRole('button', { name: 'توليد الأكواد' }));

    expect(await screen.findByText('يجب أن يكون العدد بين 1 و 500')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the Edge Function with the session token and the expected payload', async () => {
    const user = userEvent.setup();
    renderApp('/walid/codes');

    await generateCodes(user);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://test-project.supabase.co/functions/v1/generate-subscription-codes',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ plan_id: 'plan-1', count: 2 }),
        }),
      );
    });
  });

  it('renders the generated codes with the copy button and copies them to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderApp('/walid/codes');

    await generateCodes(user);

    expect(await screen.findByText('تم توليد 2 كود')).toBeInTheDocument();
    expect(
      screen.getByText((content) => /WLDN-AAAA-BBBB-CCCC\s+WLDN-DDDD-EEEE-FFFF/.test(content)),
    ).toBeInTheDocument();
    expect(screen.getByText('الكود ظاهر لك فقط — احفظه قبل مغادرة الصفحة.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'نسخ' }));

    expect(writeText).toHaveBeenCalledWith('WLDN-AAAA-BBBB-CCCC\nWLDN-DDDD-EEEE-FFFF');
    expect(await screen.findByText('تم نسخ الأكواد')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تم النسخ ✓' })).toBeInTheDocument();
  });

  it('shows the generated codes in the plan list and revokes one with the confirm modal', async () => {
    mockState.subscriptionCodes.push(
      makeCode({ id: 'code-1', code: 'WLDN-AAAA-BBBB-CCCC', note: 'دفعة أولى' }),
      makeCode({ id: 'code-2', code: 'WLDN-DDDD-EEEE-FFFF', status: 'used', used_by: 'student-1' }),
    );
    const user = userEvent.setup();
    renderApp('/walid/codes');

    const rowOne = await screen.findByTestId('code-row-code-1');
    expect(within(rowOne).getByText('متاح')).toBeInTheDocument();
    expect(within(rowOne).getByText('دفعة أولى')).toBeInTheDocument();

    await user.click(within(rowOne).getByRole('button', { name: 'إلغاء' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('WLDN-AAAA-BBBB-CCCC');
    await user.click(screen.getByRole('button', { name: 'نعم، إلغاء' }));

    await waitFor(() => {
      expect(expectRpcCall('revoke_subscription_code')).toEqual({ p_code_id: 'code-1' });
    });
    expect(await screen.findByText('تم إلغاء الكود')).toBeInTheDocument();
    expect(
      await within(screen.getByTestId('code-row-code-1')).findByText('ملغي'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('code-row-code-1')).queryByRole('button', { name: 'إلغاء' }),
    ).not.toBeInTheDocument();
  });

  it('resolves and shows the name of the student who redeemed each used code', async () => {
    mockState.subscriptionCodes.push(
      makeCode({ id: 'code-2', code: 'WLDN-DDDD-EEEE-FFFF', status: 'used', used_by: 'student-1' }),
    );
    mockState.profiles.push(makeProfile({ id: 'student-1', full_name: 'طالب مستخدم' }));
    renderApp('/walid/codes');

    expect(await screen.findByText('طالب مستخدم')).toBeInTheDocument();
    expect(screen.getByText('مستخدم')).toBeInTheDocument();
  });

  it('surfaces the plan_inactive error from the Edge Function as an Arabic message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: { code: 'plan_inactive' } }),
    });
    const user = userEvent.setup();
    renderApp('/walid/codes');

    await generateCodes(user);

    expect(await screen.findByText('الخطة غير متاحة حالياً')).toBeInTheDocument();
    expect(screen.queryByText(/تم توليد/)).not.toBeInTheDocument();
  });

  it('shows the empty state when the plan has no codes yet', async () => {
    renderApp('/walid/codes');

    expect(await screen.findByText('لا توجد أكواد لهذه الخطة بعد')).toBeInTheDocument();
  });

  it('shows the empty state when there are no active plans', async () => {
    mockState.pricingPlans = [];
    renderApp('/walid/codes');

    expect(await screen.findByText('لا توجد خطط نشطة')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
