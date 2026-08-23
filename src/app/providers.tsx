import type { ReactNode } from 'react';
import { HelmetProvider } from 'react-helmet-async';

import { AuthProvider } from '../features/auth/AuthContext';
import { ToastProvider } from '../components/Toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <HelmetProvider>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </HelmetProvider>
  );
}
