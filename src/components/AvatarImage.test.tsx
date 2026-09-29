import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
