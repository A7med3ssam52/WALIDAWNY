import type { ReactNode } from 'react';
import { HelmetProvider } from 'react-helmet-async';

import { AuthProvider } from '../features/auth/AuthContext';
import { ToastProvider } from '../components/Toast';
import { ThemeProvider } from '../theme/ThemeContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}
