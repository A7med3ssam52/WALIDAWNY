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

  it('shows mr_walid the price table with edit controls but no admin fee card', async () => {
    setAuthenticatedWalid();
    seedUnit();
    renderApp('/walid/pricing');

    expect(await screen.findByText('الصف الأول')).toBeInTheDocument();
    expect(await screen.findByText('الوحدة الأولى')).toBeInTheDocument();
    expect(await screen.findByText('350 ج.م')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تعديل' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ السعر' })).toBeInTheDocument();
    expect(screen.queryByText('رسوم المنصة الثابتة')).not.toBeInTheDocument();
  });

  it('shows the total auto-calculated from base price + fixed platform fee', async () => {
    setAuthenticatedWalid();
    mockState.platformFee = 100;
    seedUnit();
    renderApp('/walid/pricing');

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('السعر الأساسي (ج.م)'), '500');
    expect(await screen.findByText('600 ج.م')).toBeInTheDocument();
  });

  it('saves a unit price via set_unit_price (base only) and shows a success toast', async () => {
    setAuthenticatedWalid();
    seedUnit();
    const user = userEvent.setup();
    renderApp('/walid/pricing');

    await user.type(await screen.findByLabelText('السعر الأساسي (ج.م)'), '500');
    await user.click(screen.getByRole('button', { name: 'حفظ السعر' }));

    await waitFor(() => {
      expect(expectRpcCall('set_unit_price')).toEqual({
        p_unit_id: 'unit-1',
        p_base_price: 500,
      });
    });
    expect(await screen.findByText('تم حفظ سعر الوحدة بنجاح')).toBeInTheDocument();
  });

  it('surfaces the unit_not_found RPC error as an Arabic message', async () => {
    setAuthenticatedWalid();
    seedUnit();
    mockRpcError('set_unit_price', 'unit_not_found');
    const user = userEvent.setup();
    renderApp('/walid/pricing');

    await user.type(await screen.findByLabelText('السعر الأساسي (ج.م)'), '500');
    await user.click(screen.getByRole('button', { name: 'حفظ السعر' }));

    expect(await screen.findByText('الوحدة غير موجودة')).toBeInTheDocument();
  });

  it('shows the admin the fee card and saves the fixed platform fee', async () => {
    setAuthenticatedWalid({ role: 'admin' });
    seedUnit();
    const user = userEvent.setup();
    renderApp('/walid/pricing');

    expect(await screen.findByText('رسوم المنصة الثابتة')).toBeInTheDocument();
    await user.clear(await screen.findByLabelText('الرسوم الثابتة (ج.م)'));
    await user.type(screen.getByLabelText('الرسوم الثابتة (ج.م)'), '100');
    await user.click(screen.getByRole('button', { name: 'حفظ رسوم المنصة' }));

    await waitFor(() => {
      expect(expectRpcCall('set_platform_fee')).toEqual({ p_fee: 100 });
    });
    expect(
      await screen.findByText('تم حفظ رسوم المنصة — ستُضاف على كل الوحدات'),
    ).toBeInTheDocument();
  });
});
