import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  makeCode,
  makeGrade,
  makePlan,
  mockState,
  resetMockState,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

function seedPlans() {
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

describe('PricingPage', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('shows mr_walid the read-only banner with no edit controls', async () => {
    setAuthenticatedWalid();
    seedPlans();
    renderApp('/walid/pricing');

    expect(
      await screen.findByText('وضع القراءة فقط — إدارة الأسعار متاحة للمدير فقط'),
    ).toBeInTheDocument();
    expect(await screen.findByText('الصف الأول')).toBeInTheDocument();
    expect(await screen.findByText('30 يوم')).toBeInTheDocument();
    expect(await screen.findByText('350 ج.م')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حفظ الخطة' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعديل' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف' })).not.toBeInTheDocument();
  });

  it('shows admin the create form with the total auto-calculated', async () => {
    setAuthenticatedWalid({ role: 'admin' });
    seedPlans();
    renderApp('/walid/pricing');

    expect(await screen.findByLabelText('السعر الأساسي (ج.م)')).toBeInTheDocument();
    expect(
      screen.queryByText('وضع القراءة فقط — إدارة الأسعار متاحة للمدير فقط'),
    ).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('المدة (أيام)'), '60');
    await user.type(screen.getByLabelText('السعر الأساسي (ج.م)'), '500');
    await user.type(screen.getByLabelText('رسوم المنصة (ج.م)'), '100');
    expect(await screen.findByText('600 ج.م')).toBeInTheDocument();
  });

  it('saves a plan via set_pricing_plan and shows a success toast', async () => {
    setAuthenticatedWalid({ role: 'admin' });
    seedPlans();
    const user = userEvent.setup();
    renderApp('/walid/pricing');

    await user.type(await screen.findByLabelText('المدة (أيام)'), '60');
    await user.type(screen.getByLabelText('السعر الأساسي (ج.م)'), '500');
    await user.type(screen.getByLabelText('رسوم المنصة (ج.م)'), '100');
    await user.click(screen.getByRole('button', { name: 'حفظ الخطة' }));

    await waitFor(() => {
      expect(expectRpcCall('set_pricing_plan')).toEqual({
        p_grade_id: 'grade-1',
        p_duration_days: 60,
        p_base_price: 500,
        p_platform_fee: 100,
        p_is_active: true,
      });
    });
    expect(await screen.findByText('تم حفظ الخطة بنجاح')).toBeInTheDocument();
    expect(await screen.findByText('60 يوم')).toBeInTheDocument();
  });

  it('deletes an unreferenced plan outright with the hard-delete toast', async () => {
    setAuthenticatedWalid({ role: 'admin' });
    seedPlans();
    const user = userEvent.setup();
    renderApp('/walid/pricing');

    const row = await screen.findByTestId('plan-row-plan-1');
    await user.click(within(row).getByRole('button', { name: 'حذف' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('ستُحذف نهائيًا');
    await user.click(screen.getByRole('button', { name: 'نعم، حذف' }));

    await waitFor(() => {
      expect(expectRpcCall('delete_pricing_plan')).toEqual({ p_plan_id: 'plan-1' });
    });
    expect(await screen.findByText('تم حذف الخطة بنجاح')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-row-plan-1')).not.toBeInTheDocument();
  });

  it('deactivates a referenced plan and communicates the difference', async () => {
    setAuthenticatedWalid({ role: 'admin' });
    seedPlans();
    mockState.subscriptionCodes.push(makeCode({ id: 'code-1', pricing_plan_id: 'plan-1' }));
    const user = userEvent.setup();
    renderApp('/walid/pricing');

    const row = await screen.findByTestId('plan-row-plan-1');
    await user.click(within(row).getByRole('button', { name: 'حذف' }));
    await user.click(screen.getByRole('button', { name: 'نعم، حذف' }));

    expect(
      await screen.findByText('الخطة مرتبطة باشتراكات أو أكواد سابقة — تم إيقافها بدلاً من حذفها'),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('plan-row-plan-1')).toBeInTheDocument();
    expect(within(screen.getByTestId('plan-row-plan-1')).getByText('موقفة')).toBeInTheDocument();
  });
});
