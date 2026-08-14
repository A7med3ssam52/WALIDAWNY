import { BrowserRouter } from 'react-router-dom';

import { ConfigErrorScreen } from '../features/auth/ConfigErrorScreen';
import { isSupabaseConfigured } from '../lib/supabase';
import { InstallPrompt } from '../components/InstallPrompt';
import { Providers } from './providers';
import { AppRoutes } from './router';

export function App() {
  if (!isSupabaseConfigured) {
    return <ConfigErrorScreen />;
  }

  return (
    <BrowserRouter>
      <Providers>
        <AppRoutes />
        <InstallPrompt />
      </Providers>
    </BrowserRouter>
  );
}
