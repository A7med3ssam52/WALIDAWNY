import { Navigate, Route, Routes } from 'react-router-dom';

import { GuestOnly, ProtectedRoute, RoleGuard } from '../components/guards';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { LandingPage } from '../features/public/LandingPage';
import { NotFoundPage } from '../features/public/NotFoundPage';
import { StudentChangePasswordPage } from '../features/student/StudentChangePasswordPage';
import { StudentCurriculumPage } from '../features/student/StudentCurriculumPage';
import { StudentDashboardPage } from '../features/student/StudentDashboardPage';
import { StudentLessonPage } from '../features/student/StudentLessonPage';
import { StudentNotificationsPage } from '../features/student/StudentNotificationsPage';
import { StudentProfilePage } from '../features/student/StudentProfilePage';
import { StudentSubscriptionsPage } from '../features/student/StudentSubscriptionsPage';
import { CodesPage } from '../features/walid/CodesPage';
import { CurriculumPage } from '../features/walid/CurriculumPage';
import { ExamsPage } from '../features/walid/ExamsPage';
import { GradesPage } from '../features/walid/GradesPage';
import { LessonAssetsPage } from '../features/walid/LessonAssetsPage';
import { PricingPage } from '../features/walid/PricingPage';
import { StudentDetailPage } from '../features/walid/StudentDetailPage';
import { StudentListPage } from '../features/walid/StudentListPage';
import { TrashPage } from '../features/walid/TrashPage';
import { WalidDashboardPage } from '../features/walid/WalidDashboardPage';
import { AuditLogPage } from '../features/admin/AuditLogPage';
import { RolesPage } from '../features/admin/RolesPage';
import { AdminNav } from '../components/AdminNav';

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <GuestOnly>
            <LandingPage />
          </GuestOnly>
        }
      />
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/student" element={<RoleGuard allow={['student']} />}>
          <Route index element={<Navigate to="/student/dashboard" replace />} />
          <Route path="dashboard" element={<StudentDashboardPage />} />
          <Route path="profile" element={<StudentProfilePage />} />
          <Route path="password" element={<StudentChangePasswordPage />} />
          <Route path="subscriptions" element={<StudentSubscriptionsPage />} />
          <Route path="curriculum" element={<StudentCurriculumPage />} />
          <Route path="lessons/:lessonId" element={<StudentLessonPage />} />
          <Route path="notifications" element={<StudentNotificationsPage />} />
        </Route>
        <Route path="/walid" element={<RoleGuard allow={['mr_walid', 'admin', 'teacher']} />}>
          <Route index element={<Navigate to="/walid/dashboard" replace />} />
          <Route path="dashboard" element={<WalidDashboardPage />} />
          <Route path="students" element={<StudentListPage />} />
          <Route path="students/trash" element={<TrashPage />} />
          <Route path="students/:studentId" element={<StudentDetailPage />} />
          <Route path="grades" element={<GradesPage />} />
          <Route path="curriculum" element={<CurriculumPage />} />
          <Route path="exams" element={<ExamsPage />} />
          <Route path="lessons/:lessonId" element={<LessonAssetsPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="codes" element={<CodesPage />} />
        </Route>
        <Route path="/admin" element={<RoleGuard allow={['admin']} />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<WalidDashboardPage nav={<AdminNav />} />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="roles" element={<RolesPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
