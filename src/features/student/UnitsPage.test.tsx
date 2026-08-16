import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  makeGrade,
  makeUnit,
  makeUnitCode,
  makeUnitPricing,
  makeUnitPurchase,
  mockState,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('UnitsPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: 'grade-1' });
    mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
    mockState.units.push(
      makeUnit({ id: 'unit-1', grade_id: 'grade-1', name: 'الوحدة الأولى', status: 'published' }),
      makeUnit({ id: 'unit-2', grade_id: 'grade-1', name: 'الوحدة الثانية', status: 'published' }),
      makeUnit({ id: 'unit-draft', grade_id: 'grade-1', name: 'الوحدة المخفية', status: 'draft' }),
    );
    mockState.unitPricing.push(
      makeUnitPricing({ id: 'pricing-1', unit_id: 'unit-1' }),
      makeUnitPricing({ id: 'pricing-2', unit_id: 'unit-2' }),
    );
    mockState.unitPurchases.push(makeUnitPurchase({ id: 'purchase-1', unit_id: 'unit-1' }));
  });

  it('shows only published units with the purchased section and open link', async () => {
    renderApp('/student/units');

    expect(await screen.findByRole('heading', { name: 'وحداتي' })).toBeInTheDocument();
    expect(await screen.findByText('الوحدة الأولى')).toBeInTheDocument();
    expect(screen.getByText('مدفوعة')).toBeInTheDocument();
    expect(screen.getByTestId('open-unit-unit-1')).toHaveAttribute(
      'href',
      '/student/curriculum?unit=unit-1',
    );
    expect(screen.queryByText('الوحدة المخفية')).not.toBeInTheDocument();
  });

  it('shows locked units with the price and a whatsapp CTA', async () => {
    renderApp('/student/units');

    expect(await screen.findByText('الوحدة الثانية')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تواصل لتفعيل الوحدة' })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/201000000000'),
    );
  });

  it('activates a unit after redeeming a valid code', async () => {
    mockState.unitCodes.push(makeUnitCode({ id: 'code-1', unit_id: 'unit-2' }));
    renderApp('/student/units');

    fireEvent.change(await screen.findByLabelText('كود التفعيل'), {
      target: { value: 'WLDN-ABCD-EFGH-JKLM' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تفعيل' }));

    expect(expectRpcCall('redeem_unit_code')).toEqual({ p_code: 'WLDN-ABCD-EFGH-JKLM' });
    expect(await screen.findByText('تم تفعيل الوحدة بنجاح')).toBeInTheDocument();
    expect(await screen.findByTestId('open-unit-unit-2')).toHaveAttribute(
      'href',
      '/student/curriculum?unit=unit-2',
    );
  });

  it('shows a clear error when redeeming an invalid code', async () => {
    renderApp('/student/units');

    fireEvent.change(await screen.findByLabelText('كود التفعيل'), {
      target: { value: 'WLDN-BAD-CODE-0000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تفعيل' }));

    expect(await screen.findByText('الكود غير صالح')).toBeInTheDocument();
  });

  it('prompts to set the grade when the student has no grade', async () => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: null });
    renderApp('/student/units');

    expect(await screen.findByText(/لم يتم تحديد صفك الدراسي/)).toBeInTheDocument();
  });
});
