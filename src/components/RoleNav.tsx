import { useAuth } from '../features/auth/AuthContext';
import { AdminNav } from './AdminNav';
import { StaffNav } from './StaffNav';

export function RoleNav() {
  const { role } = useAuth();
  return role === 'admin' ? <AdminNav /> : <StaffNav />;
}
