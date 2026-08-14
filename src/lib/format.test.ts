import { describe, expect, it } from 'vitest';

import { buildWhatsAppLink, toWhatsAppDigits } from './format';

describe('toWhatsAppDigits', () => {
  it('converts an Egyptian local number to international digits', () => {
    expect(toWhatsAppDigits('01012345678')).toBe('201012345678');
    expect(toWhatsAppDigits('01112345678')).toBe('201112345678');
  });

  it('keeps numbers already in international format', () => {
    expect(toWhatsAppDigits('+201012345678')).toBe('201012345678');
    expect(toWhatsAppDigits('201012345678')).toBe('201012345678');
  });

  it('returns an empty string for empty input', () => {
    expect(toWhatsAppDigits('')).toBe('');
    expect(toWhatsAppDigits(null)).toBe('');
    expect(toWhatsAppDigits(undefined)).toBe('');
  });
});

describe('buildWhatsAppLink', () => {
  it('builds a wa.me link with the international number', () => {
    expect(buildWhatsAppLink('01012345678')).toBe('https://wa.me/201012345678');
  });

  it('appends the encoded default message', () => {
    expect(buildWhatsAppLink('+201012345678', 'مرحبًا')).toBe(
      'https://wa.me/201012345678?text=%D9%85%D8%B1%D8%AD%D8%A8%D9%8B%D8%A7',
    );
  });
});
