import { fireEvent, screen, within } from '@testing-library/react';
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

    // PageHeader title is the main heading (h1), LayoutShell title is also h1
    const headings = await screen.findAllByRole('heading', { name: 'وحداتي', level: 1 });
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('الوحدة الأولى')).toBeInTheDocument();
    // Badge text for purchased units is "مملوكة"
    expect(await screen.findByText('مملوكة')).toBeInTheDocument();
    // UnitCard uses onAction handler, not a link with testid
    expect(screen.getByRole('button', { name: 'افتح الوحدة' })).toBeInTheDocument();
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

  it('shows locked units without pricing with a warning message', async () => {
    mockState.units.push(makeUnit({ id: 'unit-no-price', grade_id: 'grade-1', name: 'الوحدة بلا سعر', status: 'published' }));
    renderApp('/student/units');

    const noPriceText = await screen.findByText('الوحدة بلا سعر');
    const noPriceCard = noPriceText.closest('.glass-card') as HTMLElement;
    expect(noPriceCard).toBeInTheDocument();
    expect(within(noPriceCard).getByText('تواصل مع الإدارة لمعرفة السعر وتفعيل الوحدة')).toBeInTheDocument();
    expect(within(noPriceCard).queryByRole('link', { name: 'تواصل لتفعيل الوحدة' })).not.toBeInTheDocument();
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
    // After activation, unit-2 becomes purchased and shows "افتح الوحدة" button
    // Check that unit-2 now has an open button (by finding the button near unit-2 text)
    const unit2Text = await screen.findByText('الوحدة الثانية');
    const unit2Card = unit2Text.closest('.glass-card') as HTMLElement;
    expect(within(unit2Card).getByRole('button', { name: 'افتح الوحدة' })).toBeInTheDocument();
  });

  it('redeems a code directly from a locked unit card', async () => {
    mockState.unitCodes.push(makeUnitCode({ id: 'code-1', unit_id: 'unit-2' }));
    renderApp('/student/units');

    const unit2Text = await screen.findByText('الوحدة الثانية');
    const unit2Card = unit2Text.closest('.glass-card') as HTMLElement;
    fireEvent.change(within(unit2Card).getByLabelText('كود تفعيل الوحدة الثانية'), {
      target: { value: 'WLDN-ABCD-EFGH-JKLM' },
    });
    fireEvent.click(within(unit2Card).getByRole('button', { name: 'تفعيل بالكود' }));

    expect(expectRpcCall('redeem_unit_code')).toEqual({ p_code: 'WLDN-ABCD-EFGH-JKLM' });
    expect(await screen.findByText('تم تفعيل الوحدة بنجاح')).toBeInTheDocument();
    const unit2After = await screen.findByText('الوحدة الثانية');
    const unit2CardAfter = unit2After.closest('.glass-card') as HTMLElement;
    expect(within(unit2CardAfter).getByRole('button', { name: 'افتح الوحدة' })).toBeInTheDocument();
  });

  it('shows a card-level error when redeeming an invalid code from a locked unit card', async () => {
    renderApp('/student/units');

    const unit2Text = await screen.findByText('الوحدة الثانية');
    const unit2Card = unit2Text.closest('.glass-card') as HTMLElement;
    fireEvent.change(within(unit2Card).getByLabelText('كود تفعيل الوحدة الثانية'), {
      target: { value: 'WLDN-BAD-CODE-0000' },
    });
    fireEvent.click(within(unit2Card).getByRole('button', { name: 'تفعيل بالكود' }));

    expect(await within(unit2Card).findByText('الكود غير صالح')).toBeInTheDocument();
  });

  it('shows a clear error when redeeming an invalid code', async () => {
    renderApp('/student/units');

    fireEvent.change(await screen.findByLabelText('كود التفعيل'), {
      target: { value: 'WLDN-BAD-CODE-0000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تفعيل' }));

    expect(await screen.findByText('الكود غير صالح')).toBeInTheDocument();
  });

  it('rejects redeeming a code for a draft unit', async () => {
    mockState.unitPricing.push(
      makeUnitPricing({ id: 'pricing-draft', unit_id: 'unit-draft' }),
    );
    mockState.unitCodes.push(makeUnitCode({ id: 'code-draft', unit_id: 'unit-draft' }));
    renderApp('/student/units');

    fireEvent.change(await screen.findByLabelText('كود التفعيل'), {
      target: { value: 'WLDN-ABCD-EFGH-JKLM' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تفعيل' }));

    expect(await screen.findByText('هذه الوحدة غير متاحة حاليًا')).toBeInTheDocument();
  });

  it('rejects redeeming a code for a unit outside the student grade', async () => {
    mockState.units.push(
      makeUnit({ id: 'unit-3', grade_id: 'grade-2', name: 'وحدة صف آخر', status: 'published' }),
    );
    mockState.unitPricing.push(
      makeUnitPricing({ id: 'pricing-3', unit_id: 'unit-3' }),
    );
    mockState.unitCodes.push(makeUnitCode({ id: 'code-3', unit_id: 'unit-3' }));
    renderApp('/student/units');

    fireEvent.change(await screen.findByLabelText('كود التفعيل'), {
      target: { value: 'WLDN-ABCD-EFGH-JKLM' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تفعيل' }));

    expect(await screen.findByText('هذه الوحدة ليست ضمن صفك الدراسي')).toBeInTheDocument();
  });

  it('rejects redeeming a code for an already purchased unit', async () => {
    mockState.unitCodes.push(makeUnitCode({ id: 'code-1', unit_id: 'unit-1' }));
    renderApp('/student/units');

    fireEvent.change(await screen.findByLabelText('كود التفعيل'), {
      target: { value: 'WLDN-ABCD-EFGH-JKLM' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تفعيل' }));

    expect(await screen.findByText('لقد قمت بتفعيل هذه الوحدة بالفعل')).toBeInTheDocument();
  });

  it('rejects redeeming when the student account is disabled', async () => {
    mockState.profiles.forEach((profile) => {
      if (profile.id === 'user-test-1') {
        profile.status = 'disabled';
      }
    });
    mockState.unitCodes.push(makeUnitCode({ id: 'code-1', unit_id: 'unit-2' }));
    renderApp('/student/units');

    fireEvent.change(await screen.findByLabelText('كود التفعيل'), {
      target: { value: 'WLDN-ABCD-EFGH-JKLM' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تفعيل' }));

    expect(
      await screen.findByText('ليست لديك صلاحية للتفعيل — تأكد من تفعيل حسابك'),
    ).toBeInTheDocument();
  });

  it('prompts to set the grade when the student has no grade', async () => {
    resetMockState();
    setAuthenticatedStudent({ grade_id: null });
    renderApp('/student/units');

    expect(await screen.findByText(/لم يتم تحديد صفك الدراسي/)).toBeInTheDocument();
  });
});
