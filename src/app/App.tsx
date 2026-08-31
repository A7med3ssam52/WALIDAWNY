import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { ConfigErrorScreen } from '../features/auth/ConfigErrorScreen';
import { isSupabaseConfigured } from '../lib/supabase';
import { BackgroundUploadBanner } from '../components/BackgroundUploadBanner';
import { InstallPrompt } from '../components/InstallPrompt';
import { Providers } from './providers';
import { AppRoutes } from './router';

export function App() {
  useEffect(() => {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
    if (document.body) document.body.dir = 'rtl';
  }, []);

  if (!isSupabaseConfigured) {
    return <ConfigErrorScreen />;
  }

  return (
    <BrowserRouter>
      <Providers>
        <AppRoutes />
        <BackgroundUploadBanner />
        <InstallPrompt />
      </Providers>
    </BrowserRouter>
  );
}
