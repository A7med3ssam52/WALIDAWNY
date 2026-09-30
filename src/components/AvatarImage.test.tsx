import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AvatarImage } from './AvatarImage';

describe('AvatarImage', () => {
  it('renders the signed photo when a path is set', async () => {
    render(
      <AvatarImage
        path="user-test-1/avatar.jpg"
        alt="الصورة الشخصية"
        className="h-10 w-10 rounded-full"
        fallback={<span>أ</span>}
      />,
    );

    const img = await screen.findByTestId('avatar-image');
    expect(img).toHaveAttribute(
      'src',
      'https://storage.test/avatars/user-test-1/avatar.jpg?signed=1',
    );
    expect(img).toHaveAttribute('alt', 'الصورة الشخصية');
    expect(screen.queryByText('أ')).not.toBeInTheDocument();
  });

  it('resolves Cloudinary pointers through the signed-url Edge Function', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/functions/v1/avatar-signed-url')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ signed_url: 'https://res.cloudinary.test/avatar.jpg?signed=1' }),
        };
      }
      throw new Error(`unexpected fetch: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <AvatarImage
        path="cloudinary:user-test-1/avatar.jpg:1788000000"
        alt="الصورة الشخصية"
        className="h-10 w-10 rounded-full"
        fallback={<span>أ</span>}
      />,
    );

    const img = await screen.findByTestId('avatar-image');
    expect(img).toHaveAttribute('src', 'https://res.cloudinary.test/avatar.jpg?signed=1');
    vi.unstubAllGlobals();
  });

  it('renders the fallback when no path is set', () => {
    render(
      <AvatarImage
        path={null}
        alt="الصورة الشخصية"
        className="h-10 w-10 rounded-full"
        fallback={<span>أ</span>}
      />,
    );

    expect(screen.getByText('أ')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
  });
});
