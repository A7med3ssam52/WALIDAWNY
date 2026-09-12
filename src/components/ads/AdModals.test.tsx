import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AD_DESIGNS, AdModalShell, DEFAULT_AD_CONTENT, type AdVariant } from './index';

const VARIANTS: AdVariant[] = ['info', 'success', 'warning', 'error'];

describe('AdModalShell', () => {
  it('يعرض المحتوى مع role=dialog ويغلق بزر الإغلاق', () => {
    const onClose = vi.fn();
    render(
      <AdModalShell open label="إعلان تجريبي" onClose={onClose}>
        <p>محتوى الإعلان</p>
      </AdModalShell>,
    );
    expect(screen.getByRole('dialog', { name: 'إعلان تجريبي' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ad-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('يغلق بـ Escape عند dismissible', () => {
    const onClose = vi.fn();
    render(
      <AdModalShell open label="إعلان" onClose={onClose}>
        <p>نص</p>
      </AdModalShell>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('لا يعرض شيئاً عندما open=false', () => {
    const { container } = render(
      <AdModalShell open={false} label="مغلق" onClose={() => undefined}>
        <p>مخفي</p>
      </AdModalShell>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('يدعم المواضع الخمسة عبر data-placement', () => {
    const placements = ['center', 'top', 'bottom', 'side', 'fullscreen'] as const;
    for (const placement of placements) {
      const { unmount } = render(
        <AdModalShell open label="x" onClose={() => undefined} placement={placement} testId={`ad-${placement}`}>
          <p>x</p>
        </AdModalShell>,
      );
      expect(screen.getByTestId(`ad-${placement}`)).toHaveAttribute('data-placement', placement);
      unmount();
    }
  });
});

describe('AD_DESIGNS — الـ20 تصميم', () => {
  it('يحتوي على 20 تصميماً بأرقام 1..20 ومعرفات فريدة', () => {
    expect(AD_DESIGNS).toHaveLength(20);
    const ids = new Set(AD_DESIGNS.map((d) => d.id));
    expect(ids.size).toBe(20);
    const numbers = AD_DESIGNS.map((d) => d.number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it.each(AD_DESIGNS.map((d) => [d.number, d.id, d.name]))(
    'التصميم %i (%s — %s) يعرض العنوان مع كل الأنواع الأربعة',
    (_num, id) => {
      const design = AD_DESIGNS.find((d) => d.id === id)!;
      const noop = () => undefined;
      for (const variant of VARIANTS) {
        const { unmount } = render(
          <design.component
            content={{ ...DEFAULT_AD_CONTENT, title: `عنوان ${id} ${variant}`, variant }}
            onClose={noop}
            miniature
          />,
        );
        expect(screen.getByText(`عنوان ${id} ${variant}`)).toBeInTheDocument();
        unmount();
      }
    },
  );

  it.each(AD_DESIGNS.map((d) => [d.number, d.id]))(
    'التصميم %i (%s) يعرض التوقيع عند تفعيله ويخفيه عند التعطيل',
    (_num, id) => {
      const design = AD_DESIGNS.find((d) => d.id === id)!;
      const noop = () => undefined;
      const { unmount } = render(
        <design.component content={{ ...DEFAULT_AD_CONTENT, showSignature: true }} onClose={noop} miniature />,
      );
      expect(screen.getByTestId('ad-signature')).toBeInTheDocument();
      unmount();

      const second = render(
        <design.component content={{ ...DEFAULT_AD_CONTENT, showSignature: false }} onClose={noop} miniature />,
      );
      expect(second.queryByTestId('ad-signature')).not.toBeInTheDocument();
      second.unmount();
    },
  );

  it('روابط https فقط تُعرض — الروابط غير الآمنة تُحجب', () => {
    const first = AD_DESIGNS[0];
    const noop = () => undefined;
    const { unmount } = render(
      <first.component
        content={{ ...DEFAULT_AD_CONTENT, link_url: 'http://evil.example', link_label: 'رابط' }}
        onClose={noop}
        miniature
      />,
    );
    expect(screen.queryByText('رابط')).not.toBeInTheDocument();
    unmount();
  });
});
