import { describe, expect, it } from 'vitest';

import { isValidEgyptianPhone, normalizePhone, toCanonicalPhone, validateArabicFullName } from './validation';

describe('normalizePhone', () => {
  it('strips spaces, dashes and dots', () => {
    expect(normalizePhone('010 1234 5678')).toBe('01012345678');
    expect(normalizePhone('010-1234-5678')).toBe('01012345678');
    expect(normalizePhone('010.1234.5678')).toBe('01012345678');
  });

  it('converts Arabic-Indic digits', () => {
    expect(normalizePhone('٠١٠١٢٣٤٥٦٧٨')).toBe('01012345678');
  });

  it('converts Persian digits', () => {
    expect(normalizePhone('۰۱۰۱۲۳۴۵۶۷۸')).toBe('01012345678');
  });

  it('strips hidden Unicode formatting characters', () => {
    expect(normalizePhone('01012345678\u200f')).toBe('01012345678');
    expect(normalizePhone('\u200e01012345678')).toBe('01012345678');
    expect(normalizePhone('\u200b01012345678\u200f')).toBe('01012345678');
  });

  it('normalizes the 0020 international prefix', () => {
    expect(normalizePhone('00201012345678')).toBe('201012345678');
  });

  it('drops the leading plus', () => {
    expect(normalizePhone('+201012345678')).toBe('201012345678');
    expect(normalizePhone('+20 10 1234 5678')).toBe('201012345678');
  });
});

describe('isValidEgyptianPhone', () => {
  it.each(['01012345678', '01112345678', '01212345678', '01512345678'])(
    'accepts national format %s',
    (phone) => {
      expect(isValidEgyptianPhone(phone)).toBe(true);
    },
  );

  it.each(['+201012345678', '+20 10 1234 5678', '201012345678'])(
    'accepts international format %s',
    (phone) => {
      expect(isValidEgyptianPhone(phone)).toBe(true);
    },
  );

  it('accepts the 0020 international dialing prefix', () => {
    expect(isValidEgyptianPhone('00201012345678')).toBe(true);
    expect(isValidEgyptianPhone('00201212345678')).toBe(true);
  });

  it('accepts numbers with hidden formatting characters', () => {
    expect(isValidEgyptianPhone('01012345678\u200f')).toBe(true);
    expect(isValidEgyptianPhone('\u200e01112345678')).toBe(true);
    expect(isValidEgyptianPhone('٠١٠١٢٣٤٥٦٧٨')).toBe(true);
  });

  it.each(['0101234567', '2012345678', '10012345678', '010123456789', '0123456789', ''])(
    'rejects invalid number %s',
    (phone) => {
      expect(isValidEgyptianPhone(phone)).toBe(false);
    },
  );
});

describe('toCanonicalPhone', () => {
  it('converts national format to +20', () => {
    expect(toCanonicalPhone('01012345678')).toBe('+201012345678');
  });

  it('keeps international format', () => {
    expect(toCanonicalPhone('+201012345678')).toBe('+201012345678');
    expect(toCanonicalPhone('201012345678')).toBe('+201012345678');
  });

  it('converts the 0020 prefix to +20', () => {
    expect(toCanonicalPhone('00201012345678')).toBe('+201012345678');
  });
});

describe('validateArabicFullName', () => {
  it('accepts three or more Arabic parts', () => {
    expect(validateArabicFullName('أحمد محمد علي')).toBeNull();
    expect(validateArabicFullName('  أحمد   محمد   علي  إبراهيم ')).toBeNull();
  });

  it('rejects empty and single/double names', () => {
    expect(validateArabicFullName('')).toBe('الاسم الكامل مطلوب');
    expect(validateArabicFullName('أحمد')).toMatch(/ثلاثيًا/);
    expect(validateArabicFullName('أحمد محمد')).toMatch(/ثلاثيًا/);
  });

  it('rejects non-Arabic parts', () => {
    expect(validateArabicFullName('أحمد Mohamed علي')).toMatch(/العربية/);
    expect(validateArabicFullName('أحمد محمد 123')).toMatch(/العربية/);
    expect(validateArabicFullName('أحمد-محمد علي حسن')).toMatch(/العربية/);
  });
});