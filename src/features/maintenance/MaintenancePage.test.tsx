import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { mockRpc, resetMockState } from '../../test/supabase-mock';
import { MaintenancePage } from './MaintenancePage';

describe('MaintenancePage', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('يعرض الإخطار الأمني الكامل بدون أي زر إغلاق أو تجاوز', () => {
    render(<MaintenancePage />);

    expect(screen.getByRole('heading', { name: 'الإغلاق المؤقت للمنصة' })).toBeInTheDocument();
    expect(screen.getByText(/مصيدة رقمية عبر واجهات برمجة التطبيقات/)).toBeInTheDocument();
    expect(screen.getByText('الإغلاق المؤقت الكامل')).toBeInTheDocument();
    expect(screen.getByText(/حتى إشعار آخر/)).toBeInTheDocument();

    // No dismiss/bypass affordance anywhere on the screen
    expect(screen.queryByRole('button', { name: /إغلاق|تخطي|موافق|حسناً|فهمت/ })).not.toBeInTheDocument();
    // No navigation links (only external WhatsApp links exist)
    for (const link of screen.queryAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\//);
    }
  });

  it('يعرض رقم الدعم الثابت 01226771154', async () => {
    render(<MaintenancePage />);

    const links = await screen.findAllByRole('link', { name: /تواصل مع الإدارة فوراً عبر واتساب/ });
    expect(links[0]).toHaveAttribute('href', expect.stringContaining('https://wa.me/201226771154'));
    expect(screen.getByText('01226771154')).toBeInTheDocument();
  });

  it('يثبت رقم الدعم حتى لو اختلف الرقم المخزن في الإعدادات، ويعرض اسم المنصة من الإعدادات', async () => {
    mockRpc('get_public_settings', {
      platform_name: 'منصة تجريبية',
      whatsapp_number: '+201999999999',
    });

    render(<MaintenancePage />);

    await waitFor(() => {
      // Platform name renders in the lead paragraph
      expect(screen.getAllByText(/منصة تجريبية/).length).toBeGreaterThan(0);
    });
    const links = screen.getAllByRole('link', { name: /تواصل مع الإدارة فوراً عبر واتساب/ });
    expect(links[0].getAttribute('href')).toContain('wa.me/201226771154');
    expect(screen.getByText('01226771154')).toBeInTheDocument();
    expect(screen.getByText(/إدارة المنصة/)).toBeInTheDocument();
  });
});
