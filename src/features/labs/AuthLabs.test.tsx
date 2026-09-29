import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../test/utils';
import { LAB_AUTH_VARIANTS } from './auth/authLabsData';

describe('AuthLabsGallery', () => {
  it('renders all five variant cards with login/register links', async () => {
    renderApp('/labs/auth');

    expect(await screen.findByTestId('labs-auth-gallery', {}, { timeout: 5000 })).toBeInTheDocument();
    for (const variant of LAB_AUTH_VARIANTS) {
      expect(screen.getByTestId(`labs-auth-card-${variant.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`labs-auth-link-login${variant.id}`)).toHaveAttribute(
        'href',
        variant.loginPath,
      );
      expect(screen.getByTestId(`labs-auth-link-register${variant.id}`)).toHaveAttribute(
        'href',
        variant.registerPath,
      );
    }
  });
});

describe.each(LAB_AUTH_VARIANTS)('Auth lab variant $id', (variant) => {
  it(`renders login${variant.id} with Arabic RTL form and mock submit`, async () => {
    renderApp(variant.loginPath);

    expect(await screen.findByTestId(`labs-login${variant.id}`, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByLabelText('البريد الإلكتروني')).toBeInTheDocument();
    expect(screen.getByLabelText('كلمة المرور')).toBeInTheDocument();
    const submit = screen.getByTestId(`labs-login${variant.id}-submit`);
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
  });

  it(`renders register${variant.id} with grade selection and mock submit`, async () => {
    renderApp(variant.registerPath);

    expect(
      await screen.findByTestId(`labs-register${variant.id}`, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('الاسم بالكامل')).toBeInTheDocument();
    expect(screen.getByLabelText('رقم الهاتف')).toBeInTheDocument();
    if (variant.id === '3') {
      // Grade chips live on the last step of the stepped flow.
      fireEvent.click(screen.getByTestId('labs-register3-next'));
      fireEvent.click(screen.getByTestId('labs-register3-next'));
    }
    fireEvent.click(screen.getByTestId(`labs-register${variant.id}-grade-grade-1`));
    expect(screen.getByTestId(`labs-register${variant.id}-grade-grade-1`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const submit = screen.getByTestId(`labs-register${variant.id}-submit`);
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
  });
});

describe('Auth lab register3 stepper', () => {
  it('walks through the three mock steps', async () => {
    renderApp('/labs/register3');

    expect(await screen.findByTestId('labs-register3', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByTestId('labs-register3-steps')).toBeInTheDocument();
    expect(screen.queryByTestId('labs-register3-submit')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('labs-register3-next'));
    fireEvent.click(screen.getByTestId('labs-register3-next'));

    expect(screen.getByTestId('labs-register3-submit')).toBeInTheDocument();
    expect(screen.getByTestId('labs-register3-back')).toBeInTheDocument();
  });
});
