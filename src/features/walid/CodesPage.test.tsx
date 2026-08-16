import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  expectRpcCall,
  makeGrade,
  makeUnit,
  makeUnitCode,
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

async function generateCodes(user: ReturnType<typeof userEvent.setup>, count = '2') {
  await user.type(await screen.findByLabelText('عدد الأكواد (1 - 500)'), count);
  await user.click(screen.getByRole('button', { name: 'توليد الأكواد' }));
}

describe('CodesPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid();
    seedUnit();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates the count range client-side and does not call the RPC', async () => {
    const user = userEvent.setup();
    renderApp('/walid/codes');

    await user.type(await screen.findByLabelText('عدد الأكواد (1 - 500)'), '501');
    await user.click(screen.getByRole('button', { name: 'توليد الأكواد' }));

    expect(await screen.findByText('يجب أن يكون العدد بين 1 و 500')).toBeInTheDocument();
    expect(expectRpcCall('create_unit_codes_for_staff')).toBeUndefined();
  });

  it('generates codes for the selected unit via the RPC', async () => {
    const user = userEvent.setup();
    renderApp('/walid/codes');

    await generateCodes(user);

    await waitFor(() => {
      expect(expectRpcCall('create_unit_codes_for_staff')).toEqual({
        p_unit_id: 'unit-1',
        p_count: 2,
        p_note: null,
      });
    });
    expect(await screen.findByText('تم توليد 2 كود بنجاح')).toBeInTheDocument();
  });

  it('renders the generated codes with the copy button and copies them to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderApp('/walid/codes');

    await generateCodes(user);

    expect(await screen.findByText('تم توليد 2 كود بنجاح')).toBeInTheDocument();
    expect(
      screen.getByText((content) => /WLDN-000001\s+WLDN-000002/.test(content)),
    ).toBeInTheDocument();
    expect(screen.getByText('الكود ظاهر لك فقط — احفظه قبل مغادرة الصفحة.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'نسخ' }));

    expect(writeText).toHaveBeenCalledWith('WLDN-000001\nWLDN-000002');
    expect(await screen.findByText('تم نسخ الأكواد')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تم النسخ ✓' })).toBeInTheDocument();
  });

  it('shows the existing codes for the selected unit and revokes one with the confirm modal', async () => {
    mockState.unitCodes.push(
      makeUnitCode({ id: 'code-1', code: 'WLDN-AAAA-BBBB-CCCC', unit_id: 'unit-1', note: 'دفعة أولى' }),
      makeUnitCode({
        id: 'code-2',
        code: 'WLDN-DDDD-EEEE-FFFF',
        unit_id: 'unit-1',
        status: 'used',
        used_by: 'student-1',
      }),
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
      expect(expectRpcCall('revoke_unit_code')).toEqual({ p_code_id: 'code-1' });
    });
    expect(await screen.findByText('تم إلغاء الكود')).toBeInTheDocument();
    expect(
      await within(screen.getByTestId('code-row-code-1')).findByText('ملغي'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('code-row-code-1')).queryByRole('button', { name: 'إلغاء' }),
    ).not.toBeInTheDocument();
  });

  it('marks used codes as used without a revoke action', async () => {
    mockState.unitCodes.push(
      makeUnitCode({ id: 'code-2', code: 'WLDN-DDDD-EEEE-FFFF', unit_id: 'unit-1', status: 'used' }),
    );
    renderApp('/walid/codes');

    const row = await screen.findByTestId('code-row-code-2');
    expect(within(row).getByText('مستخدم')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'إلغاء' })).not.toBeInTheDocument();
  });

  it('surfaces the unit_not_found RPC error as an Arabic message', async () => {
    mockRpcError('create_unit_codes_for_staff', 'unit_not_found');
    const user = userEvent.setup();
    renderApp('/walid/codes');

    await generateCodes(user);

    expect(await screen.findByText('الوحدة المختارة غير موجودة')).toBeInTheDocument();
    expect(screen.queryByText(/تم توليد/)).not.toBeInTheDocument();
  });

  it('shows the empty state when the selected unit has no codes yet', async () => {
    renderApp('/walid/codes');

    expect(await screen.findByText('لا توجد أكواد لهذه الوحدة بعد')).toBeInTheDocument();
  });

  it('shows the empty state when there are no priced units', async () => {
    mockState.unitPricing = [];
    renderApp('/walid/codes');

    expect(await screen.findByText('لا توجد وحدات مسعّرة')).toBeInTheDocument();
  });
});
