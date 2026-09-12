import { describe, expect, it } from 'vitest';

import {
  ADMIN_DEFAULT_SIGNATURE,
  WALID_LOCKED_SIGNATURE,
  isSignatureLockedForRole,
  resolveAnnouncementSignature,
} from './announcements';

describe('announcement signature helpers', () => {
  it('التوقيع مقفول لمستر وليد فقط', () => {
    expect(isSignatureLockedForRole('mr_walid')).toBe(true);
    expect(isSignatureLockedForRole('admin')).toBe(false);
    expect(isSignatureLockedForRole('teacher')).toBe(false);
    expect(isSignatureLockedForRole(null)).toBe(false);
    expect(isSignatureLockedForRole(undefined)).toBe(false);
  });

  it('مستر وليد توقيعه ثابت مهما كانت القيمة المدخلة', () => {
    expect(resolveAnnouncementSignature('mr_walid', 'الإدارة')).toBe(WALID_LOCKED_SIGNATURE);
    expect(resolveAnnouncementSignature('mr_walid', '')).toBe(WALID_LOCKED_SIGNATURE);
    expect(resolveAnnouncementSignature('mr_walid')).toBe('م / وليد عوني');
  });

  it('الأدمن: القيمة المدخلة أو الافتراضي عند الفراغ', () => {
    expect(resolveAnnouncementSignature('admin', '  إدارة المنصة  ')).toBe('إدارة المنصة');
    expect(resolveAnnouncementSignature('admin', '')).toBe(ADMIN_DEFAULT_SIGNATURE);
    expect(resolveAnnouncementSignature('admin')).toBe('الإدارة');
    expect(resolveAnnouncementSignature('teacher', '   ')).toBe('الإدارة');
  });
});
