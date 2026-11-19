import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { ConfigErrorScreen } from '../features/auth/ConfigErrorScreen';
import { isSupabaseConfigured } from '../lib/supabase';
import { BackgroundUploadBanner } from '../components/BackgroundUploadBanner';
import { InstallPrompt } from '../components/InstallPrompt';
import { AnnouncementModal } from '../components/AnnouncementModal';
import { Providers } from './providers';
import { AppRoutes } from './router';
import { MaintenancePage } from '../features/maintenance/MaintenancePage';

/**
 * Build-time kill switch for the whole platform (VITE_MAINTENANCE_MODE=true).
 * When enabled every route renders the security-lockdown notice instead of the
 * app — no router, no auth, no bypass. To lift the lockdown set the var to
 * "false" (or remove it) and redeploy.
 */
const isMaintenanceMode = import.meta.env.VITE_MAINTENANCE_MODE === 'true';

export function App() {
  useEffect(() => {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
    if (document.body) document.body.dir = 'rtl';
  }, []);

  if (isMaintenanceMode) {
    return <MaintenancePage />;
  }

  if (!isSupabaseConfigured) {
    return <ConfigErrorScreen />;
  }

  return (
    <BrowserRouter>
      <Providers>
        <AnnouncementModal />
        <AppRoutes />
        <BackgroundUploadBanner />
        <InstallPrompt />
      </Providers>
    </BrowserRouter>
  );
}
