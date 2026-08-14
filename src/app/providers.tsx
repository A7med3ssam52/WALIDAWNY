import type { ReactNode } from 'react';

import { AuthProvider } from '../features/auth/AuthContext';
import { ToastProvider } from '../components/Toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  );
}
