import { describe, expect, it } from 'vitest';

import { isProfileComplete, isStudentNameComplete } from './profileCompletion';

describe('profileCompletion', () => {
  it('requires a triple Arabic name', () => {
    expect(isStudentNameComplete({ full_name: 'أحمد محمد علي' })).toBe(true);
    expect(isStudentNameComplete({ full_name: 'أحمد محمد' })).toBe(false);
    expect(isStudentNameComplete({ full_name: 'Ahmed Mohamed Ali' })).toBe(false);
    expect(isStudentNameComplete(null)).toBe(false);
  });

  it('requires both name and avatar for students', () => {
    const student = (overrides: object) =>
      ({ role: 'student', full_name: 'أحمد محمد علي', avatar_path: 'u/avatar.jpg', ...overrides }) as never;
    expect(isProfileComplete(student({}))).toBe(true);
    expect(isProfileComplete(student({ avatar_path: null }))).toBe(false);
    expect(isProfileComplete(student({ full_name: 'أحمد محمد' }))).toBe(false);
    expect(isProfileComplete(null)).toBe(false);
  });

  it('treats non-students as complete', () => {
    expect(isProfileComplete({ role: 'admin', full_name: 'x', avatar_path: null } as never)).toBe(true);
    expect(isProfileComplete({ role: 'teacher', full_name: 'x', avatar_path: null } as never)).toBe(true);
  });
});
