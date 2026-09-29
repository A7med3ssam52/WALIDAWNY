import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { resetMockState } from './supabase-mock';

resetMockState();

// jsdom لا يدعم Canvas — mock عام يمنع ضوضاء "Not implemented"
// في كل اختبار يرسم PhysicsBackground أو أي canvas آخر.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

afterEach(() => {
  cleanup();
});
