import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthContext';
import type { UserRole } from '../types/database';
import { Button } from './Button';
import { Card } from './Card';
import { Spinner } from './Spinner';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="جاري التحقق من الحساب" />
    </div>
  );
}

function AuthErrorCard({
  kind,
  onRetry,
  onSignOut,
}: {
  kind: 'profile' | 'bootstrap';
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const title = kind === 'profile' ? 'تعذر تحميل بيانات الحساب' : 'تعذر الاتصال بالخادم';
  const subtitle =
    kind === 'profile' ? 'حدثت مشكلة أثناء تحميل بياناتك' : 'حدثت مشكلة أثناء الاتصال بالخادم';
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card title={title} subtitle={subtitle}>
        <div className="flex flex-col gap-3">
          <Button onClick={onRetry}>إعادة المحاولة</Button>
          <Button variant="secondary" onClick={onSignOut}>
            تسجيل الخروج
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function ProtectedRoute() {
  const { loading, profileLoading, bootstrapError, session, retryBootstrap, signOut } = useAuth();
  const location = useLocation();

  if (loading || profileLoading) {
    return <LoadingScreen />;
  }
  if (bootstrapError) {
    return (
      <AuthErrorCard kind="bootstrap" onRetry={retryBootstrap} onSignOut={() => void signOut()} />
    );
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <Outlet />;
}

const roleHome: Record<UserRole, string> = {
  student: '/student/dashboard',
  teacher: '/walid/dashboard',
  mr_walid: '/walid/students',
  admin: '/admin/dashboard',
};

export function RoleGuard({ allow }: { allow: UserRole[] }) {
  const {
    loading,
    profileLoading,
    bootstrapError,
    session,
    role,
    refreshProfile,
    retryBootstrap,
    signOut,
  } = useAuth();
  const location = useLocation();

  if (loading || profileLoading) {
    return <LoadingScreen />;
  }
  if (bootstrapError) {
    return (
      <AuthErrorCard kind="bootstrap" onRetry={retryBootstrap} onSignOut={() => void signOut()} />
    );
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (!role) {
    return (
      <AuthErrorCard kind="profile" onRetry={() => void refreshProfile()} onSignOut={() => void signOut()} />
    );
  }
  if (!allow.includes(role)) {
    return <Navigate to={roleHome[role]} replace />;
  }
  return <Outlet />;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { loading, profileLoading, bootstrapError, session, role, retryBootstrap, signOut } =
    useAuth();

  if (loading || profileLoading) {
    return <LoadingScreen />;
  }
  if (bootstrapError) {
    return (
      <AuthErrorCard kind="bootstrap" onRetry={retryBootstrap} onSignOut={() => void signOut()} />
    );
  }
  if (session) {
    const target = role ? roleHome[role] : '/student/dashboard';
    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
}