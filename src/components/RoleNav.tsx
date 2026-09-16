import { useAuth } from '../features/auth/AuthContext';
import { AdminNav } from './AdminNav';
import { StaffNav } from './StaffNav';

export function RoleNav() {
  const { role } = useAuth();
  // Assistant renders StaffNav, which internally narrows to assistantItems
  // (curriculum + exams). Admin keeps the dedicated AdminNav.
  return role === 'admin' ? <AdminNav /> : <StaffNav />;
}
