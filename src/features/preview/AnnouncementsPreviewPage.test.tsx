import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { resetMockState } from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('AnnouncementsPreviewPage — preview/ads', () => {
  it('تعرض الـ20 تصميماً مع لوحة التحكم والتوقيع', async () => {
    resetMockState();
    renderApp('/preview/ads');

    expect(await screen.findByRole('heading', { name: /20 تصميماً لظهور.*الإعلانات في Modal/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'نوع الإعلان' })).toBeInTheDocument();

    // 20 بطاقة
    const grid = await screen.findByTestId('ads-designs-grid');
    expect(grid.querySelectorAll('[data-testid^="ad-design-card-"]')).toHaveLength(20);

    // التوقيع ظاهر افتراضياً في المصغرات
    expect(screen.getAllByTestId('ad-signature').length).toBeGreaterThanOrEqual(20);

    // تبديل النوع إلى نجاح
    fireEvent.click(screen.getByRole('button', { name: /نجاح/ }));
    expect(screen.getByRole('button', { name: /نجاح/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('تفتح التصميم المختار في Modal حقيقي وتغلقه', async () => {
    resetMockState();
    renderApp('/preview/ads');

    await screen.findByTestId('ads-designs-grid');
    const openButtons = screen.getAllByRole('button', { name: 'عرض في Modal' });
    expect(openButtons).toHaveLength(20);

    fireEvent.click(openButtons[0]);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // إغلاق عبر زر الإغلاق
    const closeBtn = screen.getByLabelText('إغلاق الإعلان');
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('إخفاء التوقيع يخفيه من كل المصغرات', async () => {
    resetMockState();
    renderApp('/preview/ads');

    await screen.findByTestId('ads-designs-grid');
    expect(screen.getAllByTestId('ad-signature').length).toBeGreaterThanOrEqual(20);

    fireEvent.click(screen.getByRole('switch', { name: /التوقيع/ }));
    await waitFor(() => {
      expect(screen.queryByTestId('ad-signature')).not.toBeInTheDocument();
    });
  });
});
