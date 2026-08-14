import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  makeCode,
  makeGrade,
  makePlan,
  makeSubscription,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('StudentSubscriptionsPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: 'grade-1' });
    mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
    mockState.pricingPlans.push(makePlan({ id: 'plan-1', grade_id: 'grade-1', duration_days: 30 }));
  });

  it('shows the empty history state and an inactive-subscription hint', async () => {
    renderApp('/student/subscriptions');

    expect(
      await screen.findByText('لا توجد اشتراكات بعد — استخدم كود التفعيل'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('لا يوجد اشتراك نشط بعد — استخدم كود التفعيل بالأسفل.'),
    ).toBeInTheDocument();
  });

  it('renders the current-status card with an Arabic countdown for an active subscription', async () => {
    mockState.subscriptions.push(
      makeSubscription({
        id: 'sub-current',
        expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      }),
    );
    renderApp('/student/subscriptions');

    const card = await screen.findByText('متبقي 30 يوم');
    expect(card).toBeInTheDocument();
    expect(screen.getAllByText('الصف الأول — 30 يومًا').length).toBeGreaterThan(0);
    expect(screen.getAllByText('نشط').length).toBeGreaterThan(0);
  });

  it('shows the expired state when the latest subscription is over', async () => {
    mockState.subscriptions.push(
      makeSubscription({
        id: 'sub-old',
        status: 'expired',
        expires_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      }),
    );
    renderApp('/student/subscriptions');

    expect(await screen.findByText('انتهى')).toBeInTheDocument();
    expect(screen.getByText(/انتهى اشتراكك في/)).toBeInTheDocument();
    const row = screen.getByTestId('subscription-row-sub-old');
    expect(within(row).getByText('منتهي')).toBeInTheDocument();
    expect(within(row).getByText('كود تفعيل')).toBeInTheDocument();
  });

  it('redeems a valid code, shows a success toast and refreshes the list', async () => {
    mockState.subscriptionCodes.push(makeCode({ id: 'code-1', code: 'WLDN-ABCD-EFGH-JKLM' }));
    const user = userEvent.setup();
    renderApp('/student/subscriptions');

    await user.type(await screen.findByLabelText('كود التفعيل'), 'wldn-abcd-efgh-jklm');
    await user.click(screen.getByRole('button', { name: 'تفعيل' }));

    await waitFor(() => {
      expect(expectRpcCall('redeem_subscription_code')).toEqual({ p_code: 'wldn-abcd-efgh-jklm' });
    });
    expect(await screen.findByText('تم تفعيل الاشتراك بنجاح')).toBeInTheDocument();
    expect(mockState.subscriptionCodes[0].status).toBe('used');
    expect(mockState.subscriptionCodes[0].used_by).toBe('user-test-1');
    expect(await screen.findByTestId('subscription-row-sub-created-1')).toBeInTheDocument();
  });

  it('maps an unknown code to the correct Arabic error', async () => {
    const user = userEvent.setup();
    renderApp('/student/subscriptions');

    await user.type(await screen.findByLabelText('كود التفعيل'), 'WLDN-XXXX-XXXX-XXXX');
    await user.click(screen.getByRole('button', { name: 'تفعيل' }));

    expect(await screen.findByText('الكود غير صالح')).toBeInTheDocument();
  });

  it('maps an already-used code to the correct Arabic error', async () => {
    mockState.subscriptionCodes.push(
      makeCode({ id: 'code-1', code: 'WLDN-ABCD-EFGH-JKLM', status: 'used' }),
    );
    const user = userEvent.setup();
    renderApp('/student/subscriptions');

    await user.type(await screen.findByLabelText('كود التفعيل'), 'WLDN-ABCD-EFGH-JKLM');
    await user.click(screen.getByRole('button', { name: 'تفعيل' }));

    expect(await screen.findByText('تم استخدام هذا الكود بالفعل')).toBeInTheDocument();
  });

  it('maps an active-subscription conflict to the correct Arabic error', async () => {
    mockState.subscriptions.push(makeSubscription({ id: 'sub-active' }));
    mockState.subscriptionCodes.push(makeCode({ id: 'code-1', code: 'WLDN-ABCD-EFGH-JKLM' }));
    const user = userEvent.setup();
    renderApp('/student/subscriptions');

    await user.type(await screen.findByLabelText('كود التفعيل'), 'WLDN-ABCD-EFGH-JKLM');
    await user.click(screen.getByRole('button', { name: 'تفعيل' }));

    expect(await screen.findByText('لديك اشتراك نشط بالفعل')).toBeInTheDocument();
  });
});
