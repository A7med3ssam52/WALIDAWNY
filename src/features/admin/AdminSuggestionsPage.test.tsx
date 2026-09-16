import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  expectRpcCall,
  getRpcCalls,
  makeGrade,
  makeProfile,
  makeSuggestion,
  mockState,
  resetMockState,
  setAuthenticatedAdmin,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

function seedRows() {
  mockState.grades.push(makeGrade({ id: 'grade-1', name: 'الصف الأول' }));
  mockState.profiles.push(
    makeProfile({ id: 'student-1', full_name: 'طالب واحد', phone: '01001112222', grade_id: 'grade-1' }),
  );
  mockState.suggestions.push(
    makeSuggestion({
      id: 'sug-1',
      student_id: 'student-1',
      kind: 'issue',
      title: 'مشكلة في الفيديو',
      status: 'new',
    }),
    makeSuggestion({
      id: 'sug-2',
      student_id: 'student-1',
      kind: 'suggestion',
      title: 'فكرة جديدة',
      status: 'planned',
    }),
  );
}

describe('AdminSuggestionsPage', () => {
  beforeEach(() => {
    resetMockState();
    setAuthenticatedAdmin();
    seedRows();
  });

  it('renders the inbox with student identity and filters', async () => {
    renderApp('/admin/suggestions');

    const row = await screen.findByTestId('suggestion-row-sug-1');
    expect(within(row).getByText('طالب واحد')).toBeInTheDocument();
    expect(within(row).getByText('مشكلة في الفيديو')).toBeInTheDocument();
    expect(within(row).getByText('الصف الأول')).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-row-sug-2')).toBeInTheDocument();
  });

  it('applies kind and status filters', async () => {
    const user = userEvent.setup();
    renderApp('/admin/suggestions');

    await screen.findByTestId('suggestion-row-sug-1');
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'issue');

    await waitFor(() => {
      const calls = getRpcCalls().filter((call) => call.fn === 'list_suggestions');
      expect(calls[calls.length - 1]?.args).toMatchObject({ p_kind: 'issue' });
    });
  });

  it('updates the status and notifies the student', async () => {
    const user = userEvent.setup();
    renderApp('/admin/suggestions');

    const statusSelect = await screen.findByTestId('suggestion-status-sug-1');
    await user.selectOptions(statusSelect, 'planned');

    await waitFor(() =>
      expect(expectRpcCall('update_suggestion_status')).toEqual({
        p_suggestion_id: 'sug-1',
        p_status: 'planned',
      }),
    );
    expect(await screen.findByText('تم تحديث الحالة وإشعار الطالب')).toBeInTheDocument();
  });

  it('renders the mobile cards with the full readable content', async () => {
    renderApp('/admin/suggestions');

    const card = await screen.findByTestId('suggestion-card-sug-1');
    expect(within(card).getByText('مشكلة في الفيديو')).toBeInTheDocument();
    expect(within(card).getByText('طالب واحد')).toBeInTheDocument();
    expect(within(card).getByText('مشكلة')).toBeInTheDocument();
    expect(within(card).getByTestId('suggestion-status-card-sug-1')).toHaveValue('new');
    expect(within(card).getAllByText('جديد').length).toBeGreaterThan(0);
  });

  it('updates the status from the mobile card', async () => {
    const user = userEvent.setup();
    renderApp('/admin/suggestions');

    const statusSelect = await screen.findByTestId('suggestion-status-card-sug-2');
    await user.selectOptions(statusSelect, 'done');

    await waitFor(() =>
      expect(expectRpcCall('update_suggestion_status')).toEqual({
        p_suggestion_id: 'sug-2',
        p_status: 'done',
      }),
    );
  });

  it('deletes a suggestion after confirmation', async () => {
    const user = userEvent.setup();
    renderApp('/admin/suggestions');

    const row = await screen.findByTestId('suggestion-row-sug-1');
    await user.click(within(row).getByRole('button', { name: /حذف مشاركة/ }));
    await user.click(screen.getByRole('button', { name: 'حذف نهائي' }));

    await waitFor(() =>
      expect(expectRpcCall('delete_suggestion')).toEqual({ p_suggestion_id: 'sug-1' }),
    );
    expect(await screen.findByText('تم حذف المشاركة')).toBeInTheDocument();
  });

  it('deletes a suggestion from the mobile card after confirmation', async () => {
    const user = userEvent.setup();
    renderApp('/admin/suggestions');

    const card = await screen.findByTestId('suggestion-card-sug-2');
    await user.click(within(card).getByRole('button', { name: /حذف مشاركة/ }));
    await user.click(screen.getAllByRole('button', { name: 'حذف نهائي' })[0]);

    await waitFor(() =>
      expect(expectRpcCall('delete_suggestion')).toEqual({ p_suggestion_id: 'sug-2' }),
    );
  });

  it('saves the open/close config and messages', async () => {
    const user = userEvent.setup();
    renderApp('/admin/suggestions');

    await screen.findByTestId('suggestions-config-save');
    await user.click(screen.getByTestId('suggestions-config-save'));

    await waitFor(() =>
      expect(expectRpcCall('set_app_setting')).toMatchObject({ p_key: 'suggestions_open' }),
    );
    expect(await screen.findByText('تم حفظ إعدادات المقترحات')).toBeInTheDocument();
  });
});
