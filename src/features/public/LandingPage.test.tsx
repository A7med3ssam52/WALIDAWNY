import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildWhatsAppLink } from '../../lib/format';
import {
  mockRpc,
  mockRpcError,
  resetMockState,
  setAuthenticatedStudent,
} from '../../test/supabase-mock';
import { renderApp } from '../../test/utils';

describe('LandingPage', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('shows the platform name, login and register links, and the WhatsApp CTA', async () => {
    mockRpc('get_public_settings', {
      platform_name: 'منصة مستر وليد عونى التعليمية',
      whatsapp_number: '01000000000',
      whatsapp_default_message: 'مرحبًا، أود التواصل مع الأستاذ',
    });
    renderApp('/');

    expect(await screen.findAllByText('منصة مستر وليد عونى التعليمية')).toHaveLength(2);
    expect(
      screen.getAllByRole('link', { name: 'تسجيل الدخول' }).every((link) =>
        link.hasAttribute('href') ? link.getAttribute('href') === '/login' : false,
      ),
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'إنشاء حساب' })).toHaveAttribute('href', '/register');

    const whatsappLink = await screen.findByRole('link', { name: 'فتح محادثة واتساب' });
    expect(whatsappLink).toHaveAttribute(
      'href',
      buildWhatsAppLink('01000000000', 'مرحبًا، أود التواصل مع الأستاذ'),
    );
  });

  it('does not show the WhatsApp CTA when no number is configured', async () => {
    mockRpc('get_public_settings', {
      platform_name: 'منصة مستر وليد عونى التعليمية',
      whatsapp_number: '',
      whatsapp_default_message: null,
    });
    renderApp('/');

    expect(await screen.findAllByText('منصة مستر وليد عونى التعليمية')).toHaveLength(2);
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'فتح محادثة واتساب' })).not.toBeInTheDocument();
    });
    expect(await screen.findByText('لا يوجد رقم تواصل متاح حاليًا')).toBeInTheDocument();
  });

  it('shows the unit prices section with a whatsapp CTA per unit', async () => {
    mockRpc('get_public_settings', {
      platform_name: 'منصة مستر وليد عونى التعليمية',
      whatsapp_number: '01000000000',
      whatsapp_default_message: 'مرحبًا، أود التواصل مع الأستاذ',
    });
    mockRpc('get_public_unit_prices', [
      {
        unit_id: 'unit-1',
        unit_name: 'الوحدة الأولى',
        grade_name: 'الصف الأول',
        base_price: 300,
        platform_fee: 50,
        total_price: 350,
      },
    ]);
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'أسعار الوحدات' })).toBeInTheDocument();
    expect(await screen.findByText('الوحدة الأولى')).toBeInTheDocument();
    expect(screen.getByText('350 ج.م')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'تواصل لتفعيل الوحدة' })).toHaveLength(1);
  });

  it('shows an error state when the public settings cannot be loaded', async () => {
    mockRpcError('get_public_settings', 'connection failed');
    renderApp('/');

    expect(await screen.findByText('تعذر تحميل إعدادات المنصة')).toBeInTheDocument();
  });

  it('redirects an authenticated student away from the landing page', async () => {
    setAuthenticatedStudent();
    renderApp('/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'لوحة الطالب' })).toBeInTheDocument();
    });
  });
});
