import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  makeGrade,
  makeUnit,
  makeUnitPricing,
  mockRpcError,
  mockState,
  resetMockState,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

function seedUnit() {
  mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
  mockState.units.push(
    makeUnit({ id: 'unit-1', grade_id: 'grade-1', name: 'الوحدة الأولى', status: 'published' }),
  );
  mockState.unitPricing.push(makeUnitPricing({ id: 'pricing-1', unit_id: 'unit-1' }));
}

describe('PricingPage', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('shows mr_walid the read-only banner with no edit controls', async () => {
    setAuthenticatedWalid();
    seedUnit();
    renderApp('/walid/pricing');

    expect(
      await screen.findByText('وضع القراءة فقط — إدارة الأسعار متاحة للمدير فقط'),
    ).toBeInTheDocument();
    expect(await screen.findByText('الصف الأول')).toBeInTheDocument();
    expect(await screen.findByText('الوحدة الأولى')).toBeInTheDocument();
    expect(await screen.findByText('350 ج.م')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حفظ السعر' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعديل' })).not.toBeInTheDocument();
  });

  it('shows admin the create form with the total auto-calculated', async () => {
    setAuthenticatedWalid({ role: 'admin' });
    seedUnit();
    renderApp('/walid/pricing');

    expect(await screen.findByLabelText('السعر الأساسي (ج.م)')).toBeInTheDocument();
    expect(
      screen.queryByText('وضع القراءة فقط — إدارة الأسعار متاحة للمدير فقط'),
    ).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('السعر الأساسي (ج.م)'), '500');
    await user.type(screen.getByLabelText('رسوم المنصة (ج.م)'), '100');
    expect(await screen.findByText('600 ج.م')).toBeInTheDocument();
  });

  it('saves a unit price via set_unit_price and shows a success toast', async () => {
    setAuthenticatedWalid({ role: 'admin' });
    seedUnit();
    const user = userEvent.setup();
    renderApp('/walid/pricing');

    await user.type(await screen.findByLabelText('السعر الأساسي (ج.م)'), '500');
    await user.type(screen.getByLabelText('رسوم المنصة (ج.م)'), '100');
    await user.click(screen.getByRole('button', { name: 'حفظ السعر' }));

    await waitFor(() => {
      expect(expectRpcCall('set_unit_price')).toEqual({
        p_unit_id: 'unit-1',
        p_base_price: 500,
        p_platform_fee: 100,
      });
    });
    expect(await screen.findByText('تم حفظ سعر الوحدة بنجاح')).toBeInTheDocument();
    expect(await screen.findByText('600 ج.م')).toBeInTheDocument();
  });

  it('surfaces the unit_not_found RPC error as an Arabic message', async () => {
    setAuthenticatedWalid({ role: 'admin' });
    seedUnit();
    mockRpcError('set_unit_price', 'unit_not_found');
    const user = userEvent.setup();
    renderApp('/walid/pricing');

    await user.type(await screen.findByLabelText('السعر الأساسي (ج.م)'), '500');
    await user.type(screen.getByLabelText('رسوم المنصة (ج.م)'), '100');
    await user.click(screen.getByRole('button', { name: 'حفظ السعر' }));

    expect(await screen.findByText('الوحدة غير موجودة')).toBeInTheDocument();
  });
});
