import { describe, expect, it } from 'vitest';

import {
  compressAvatarImage,
  compressSuggestionImage,
  validateAvatarImage,
  validateSuggestionImage,
} from './imageCompress';

function makeFile(type: string, size: number): File {
  const bytes = new Uint8Array(Math.max(1, Math.min(size, 64)));
  return new File([bytes], `test.${type.split('/')[1] ?? 'bin'}`, { type });
}

describe('validateSuggestionImage', () => {
  it('accepts jpeg/png/webp within the size limit', () => {
    expect(validateSuggestionImage(makeFile('image/jpeg', 1024))).toBeNull();
    expect(validateSuggestionImage(makeFile('image/png', 1024))).toBeNull();
    expect(validateSuggestionImage(makeFile('image/webp', 1024))).toBeNull();
  });

  it('rejects unsupported types', () => {
    expect(validateSuggestionImage(makeFile('image/gif', 1024))).toMatch(/JPG/);
    expect(validateSuggestionImage(makeFile('application/pdf', 1024))).toMatch(/JPG/);
  });

  it('rejects empty and oversized files', () => {
    expect(validateSuggestionImage(new File([], 'empty.jpg', { type: 'image/jpeg' }))).toMatch(/فارغ/);
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    expect(validateSuggestionImage(big)).toMatch(/5MB/);
  });
});

describe('compressSuggestionImage', () => {
  it('falls back to the original file when canvas is unavailable (jsdom)', async () => {
    const file = makeFile('image/png', 2048);
    await expect(compressSuggestionImage(file)).resolves.toBe(file);
  });
});

describe('validateAvatarImage', () => {
  it('accepts jpeg/png/webp within the 2MB limit', () => {
    expect(validateAvatarImage(makeFile('image/jpeg', 1024))).toBeNull();
    expect(validateAvatarImage(makeFile('image/png', 1024))).toBeNull();
    expect(validateAvatarImage(makeFile('image/webp', 1024))).toBeNull();
  });

  it('rejects unsupported types', () => {
    expect(validateAvatarImage(makeFile('image/gif', 1024))).toMatch(/JPG/);
  });

  it('rejects empty and oversized files', () => {
    expect(validateAvatarImage(new File([], 'empty.jpg', { type: 'image/jpeg' }))).toMatch(/فارغ/);
    const big = new File([new Uint8Array(3 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    expect(validateAvatarImage(big)).toMatch(/2MB/);
  });
});

describe('compressAvatarImage', () => {
  it('falls back to the original file when canvas is unavailable (jsdom)', async () => {
    const file = makeFile('image/jpeg', 2048);
    await expect(compressAvatarImage(file)).resolves.toBe(file);
  });
});
