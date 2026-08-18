import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  makeAuditLog,
  mockState,
  resetMockState,
  setAuthenticatedWalid,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('AuditLogPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedWalid({
      role: 'admin',
      id: 'user-admin-1',
      email: 'admin@example.com',
      full_name: 'المشرف العام',
    });
  });

  it('renders the audit rows with actor, action and entity info', async () => {
    mockState.auditLogs = [
      makeAuditLog({
        id: 'audit-1',
        action: 'grade.create',
        entity_type: 'grades',
        actor_name: 'سارة',
      }),
      makeAuditLog({
        id: 'audit-2',
        action: 'user.role_change',
        entity_type: 'profiles',
        actor_name: 'نظام',
      }),
    ];
    renderApp('/admin/audit');

    expect(await screen.findByRole('heading', { name: 'سجل النشاطات' })).toBeInTheDocument();
    expect(await screen.findByText('إنشاء صف')).toBeInTheDocument();
    expect(screen.getByText('إجراء: user · role_change')).toBeInTheDocument();
    expect(screen.getByText('سارة')).toBeInTheDocument();
    expect(screen.getByText('نظام')).toBeInTheDocument();
    expect(screen.getByText('2 عملية')).toBeInTheDocument();
  });

  it('shows an empty state when there are no audit rows', async () => {
    renderApp('/admin/audit');

    expect(await screen.findByText('لا توجد عمليات مسجلة')).toBeInTheDocument();
  });

  it('filters the list by action text after pressing search', async () => {
    const user = userEvent.setup();
    mockState.auditLogs = [
      makeAuditLog({
        id: 'audit-1',
        action: 'grade.create',
        created_at: '2026-08-01T10:00:00.000Z',
      }),
      makeAuditLog({
        id: 'audit-2',
        action: 'grade.update',
        created_at: '2026-08-02T10:00:00.000Z',
      }),
      makeAuditLog({
        id: 'audit-3',
        action: 'pricing.delete',
        created_at: '2026-08-03T10:00:00.000Z',
      }),
    ];
    renderApp('/admin/audit');

    expect(await screen.findByText('إجراء: pricing · delete')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('مثال: إنشاء صف'), 'grade');
    await user.click(screen.getByRole('button', { name: 'بحث' }));

    await waitFor(() => {
      expect(screen.getByText('إنشاء صف')).toBeInTheDocument();
      expect(screen.getByText('تعديل صف')).toBeInTheDocument();
    });
    expect(screen.queryByText('إجراء: pricing · delete')).not.toBeInTheDocument();
    expect(screen.getByText('2 عملية')).toBeInTheDocument();
  });

  it('filters by entity type from the dropdown', async () => {
    const user = userEvent.setup();
    mockState.auditLogs = [
      makeAuditLog({ id: 'audit-1', action: 'grade.create', entity_type: 'grades' }),
      makeAuditLog({ id: 'audit-2', action: 'student.disable', entity_type: 'profiles' }),
    ];
    renderApp('/admin/audit');

    expect(await screen.findByText('إنشاء صف')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox'), 'grades');
    await user.click(screen.getByRole('button', { name: 'بحث' }));

    await waitFor(() => {
      expect(screen.getByText('إنشاء صف')).toBeInTheDocument();
    });
    expect(screen.queryByText('إجراء: student · disable')).not.toBeInTheDocument();
    expect(screen.getByText('1 عملية')).toBeInTheDocument();
  });

  it('exports the filtered rows as a CSV through the edge function', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        url: 'https://supabase.example/functions/v1/export-audit-log/export.csv',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    mockState.auditLogs = [makeAuditLog({ id: 'audit-1', action: 'grade.create' })];

    renderApp('/admin/audit');
    await screen.findByText('إنشاء صف');

    await user.click(screen.getByRole('button', { name: 'تصدير ملف CSV' }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'https://supabase.example/functions/v1/export-audit-log/export.csv',
        '_blank',
        'noopener,noreferrer',
      );
    });
    const [exportUrl, exportInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: unknown },
    ];
    const payload = JSON.parse(String(exportInit.body));
    expect(exportUrl).toContain('/functions/v1/export-audit-log');
    expect(payload.action).toBeNull();
    expect(payload.entity_type).toBeNull();

    vi.unstubAllGlobals();
    openSpy.mockRestore();
  });

  it('pages through more than one page of rows', async () => {
    const user = userEvent.setup();
    mockState.auditLogs = Array.from({ length: 60 }, (_, index) =>
      makeAuditLog({
        id: `audit-${index + 1}`,
        action: `grade.${index + 1}`,
        created_at: `2026-08-01T${String(index).padStart(2, '0')}:00:00.000Z`,
      }),
    );
    renderApp('/admin/audit');

    expect(await screen.findByText('60 عملية')).toBeInTheDocument();
    expect(screen.getByText('صفحة 1 من 2')).toBeInTheDocument();
    expect(screen.getByTestId('audit-row-audit-60')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'التالي' }));

    await waitFor(() => {
      expect(screen.getByText('صفحة 2 من 2')).toBeInTheDocument();
    });
    expect(screen.getByTestId('audit-row-audit-1')).toBeInTheDocument();
    expect(screen.queryByTestId('audit-row-audit-60')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'السابق' }));
    expect(await screen.findByText('صفحة 1 من 2')).toBeInTheDocument();
  });

  it('shows an error state with retry when the list fails to load', async () => {
    const user = userEvent.setup();
    mockState.rpcErrors['list_audit_logs'] = 'connection failed';
    renderApp('/admin/audit');

    expect(await screen.findByText('تعذر تحميل سجل النشاطات')).toBeInTheDocument();

    mockState.rpcErrors['list_audit_logs'] = '';
    mockState.auditLogs = [makeAuditLog({ id: 'audit-1', action: 'grade.create' })];
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    expect(await screen.findByText('إنشاء صف')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('إنشاء صف')).toBeInTheDocument();
  });
});
