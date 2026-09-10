import { Outlet } from 'react-router-dom';

import { usePresenceHeartbeat } from './usePresenceHeartbeat';

export function StudentPresenceGate() {
  usePresenceHeartbeat();
  return <Outlet />;
}
