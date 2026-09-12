import { Outlet } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthContext';
import { SuspendedAccountBlock } from './SuspendedAccountBlock';

/**
 * Locks every nested route for suspended students (status === 'disabled').
 * Full lock: no dismiss, no navigation outlet, no sign-out escape —
 * the only action is the WhatsApp support CTA inside the block.
 */
export function SuspendedAccountGate() {
  const { profile } = useAuth();

  if (profile?.role === 'student' && profile.status === 'disabled') {
    return (
      <SuspendedAccountBlock fullName={profile.full_name} reason={profile.suspension_reason} />
    );
  }
  return <Outlet />;
}
