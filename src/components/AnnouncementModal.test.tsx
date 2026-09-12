import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import type { Announcement } from '../lib/announcements';

vi.mock('../lib/announcements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/announcements')>();
  return {
    ...actual,
    fetchActiveAnnouncement: vi.fn(),
  };
});

import { fetchActiveAnnouncement } from '../lib/announcements';

import { AnnouncementModal } from './AnnouncementModal';

const DISMISS_KEY = 'announcement-dismissed';

function makeAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'ann-1',
    title: 'وحدة جديدة متاحة الآن',
    body: 'تم فتح وحدة جديدة مع ملازم PDF وسبورات تفاعلية.',
    link_url: 'https://example.com/units',
    link_label: 'عرض الوحدة',
    variant: 'info',
    target_roles: ['student'],
    hide_on_paths: [],
    starts_at: new Date().toISOString(),
    ends_at: null,
    is_active: true,
    dismissible: true,
    signature_name: 'الإدارة',
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderModal() {
  return render(
    <MemoryRouter initialEntries={['/student/dashboard']}>
      <AnnouncementModal />
    </MemoryRouter>,
  );
}

describe('AnnouncementModal — العرض الرسمي بالترويسة المتدرجة', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchActiveAnnouncement).mockReset();
  });

  it('يعرض الإعلان النشط داخل Modal مع التوقيع', async () => {
    vi.mocked(fetchActiveAnnouncement).mockResolvedValue(makeAnnouncement());
    renderModal();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('وحدة جديدة متاحة الآن')).toBeInTheDocument();
    expect(screen.getByTestId('announcement-modal')).toBeInTheDocument();
    expect(screen.getByTestId('ad-signature')).toHaveTextContent('الإدارة');
    expect(fetchActiveAnnouncement).toHaveBeenCalledWith('/student/dashboard');
  });

  it('لا يعرض شيئاً عند عدم وجود إعلان نشط', async () => {
    vi.mocked(fetchActiveAnnouncement).mockResolvedValue(null);
    renderModal();

    await waitFor(() => {
      expect(fetchActiveAnnouncement).toHaveBeenCalled();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('يحترم الإخفاء السابق المحفوظ ولا يعرض الإعلان مجدداً', async () => {
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ 'ann-1': true }));
    vi.mocked(fetchActiveAnnouncement).mockResolvedValue(makeAnnouncement());
    renderModal();

    await waitFor(() => {
      expect(fetchActiveAnnouncement).toHaveBeenCalled();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('زر الإغلاق يخفي الإعلان ويحفظ الإخفاء', async () => {
    vi.mocked(fetchActiveAnnouncement).mockResolvedValue(makeAnnouncement());
    renderModal();

    await screen.findByRole('dialog');
    fireEvent.click(screen.getByTestId('announcement-modal-close'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '{}')).toEqual({ 'ann-1': true });
  });

  it('الإعلان غير القابل للإخفاء يُغلق دون حفظ ولا يحبس المستخدم', async () => {
    vi.mocked(fetchActiveAnnouncement).mockResolvedValue(
      makeAnnouncement({ dismissible: false }),
    );
    renderModal();

    await screen.findByRole('dialog');
    // لا يوجد زر X للشريط العلوي
    expect(screen.queryByTestId('announcement-modal-close')).not.toBeInTheDocument();
    // زر "لاحقاً" داخل التصميم يغلق دون حفظ
    fireEvent.click(screen.getByRole('button', { name: 'لاحقاً' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(DISMISS_KEY)).toBeNull();
  });

  it('يعرض توقيع الإعلان عربياً بخط اليد دون أي نص لاتيني', async () => {
    vi.mocked(fetchActiveAnnouncement).mockResolvedValue(
      makeAnnouncement({ signature_name: 'م / وليد عوني' }),
    );
    renderModal();

    await screen.findByRole('dialog');
    const signature = screen.getByTestId('ad-signature');
    expect(signature).toHaveTextContent('م / وليد عوني');
    expect(signature).toHaveTextContent('التوقيع');
    // عربي فقط: لا أثر للتوقيع اللاتيني القديم
    expect(signature.textContent).not.toMatch(/[A-Za-z]/);
    // خط اليد
    expect(signature.querySelector('.font-signature')).not.toBeNull();
  });

  it('يستخدم الإدارة كتوقيع احتياطي عند غياب توقيع الإعلان', async () => {
    vi.mocked(fetchActiveAnnouncement).mockResolvedValue(
      makeAnnouncement({ signature_name: '   ' }),
    );
    renderModal();

    await screen.findByRole('dialog');
    expect(screen.getByTestId('ad-signature')).toHaveTextContent('الإدارة');
  });
});
