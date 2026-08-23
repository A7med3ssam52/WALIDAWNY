import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { GuestOnly, ProtectedRoute, RoleGuard } from '../components/guards';
import { Spinner } from '../components/Spinner';

// Public — lazy for code splitting (Landing excludes hls.js chunk)
const LandingPage = lazy(() => import('../features/public/LandingPage').then((m) => ({ default: m.LandingPage })));
const AboutPage = lazy(() => import('../features/public/AboutPage').then((m) => ({ default: m.AboutPage })));
const HowItWorksPage = lazy(() => import('../features/public/HowItWorksPage').then((m) => ({ default: m.HowItWorksPage })));
const SubjectsPage = lazy(() => import('../features/public/SubjectsPage').then((m) => ({ default: m.SubjectsPage })));
const GradeLandingPage = lazy(() => import('../features/public/GradeLandingPage').then((m) => ({ default: m.GradeLandingPage })));
const PricingPublicPage = lazy(() => import('../features/public/PricingPublicPage').then((m) => ({ default: m.PricingPublicPage })));
const FaqPage = lazy(() => import('../features/public/FaqPage').then((m) => ({ default: m.FaqPage })));
const ContactPage = lazy(() => import('../features/public/ContactPage').then((m) => ({ default: m.ContactPage })));
const PrivacyPage = lazy(() => import('../features/public/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('../features/public/TermsPage').then((m) => ({ default: m.TermsPage })));
const NotFoundPage = lazy(() => import('../features/public/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

// Auth — keep lazy too but small
const LoginPage = lazy(() => import('../features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })));

// Student
const StudentDashboardPage = lazy(() => import('../features/student/StudentDashboardPage').then((m) => ({ default: m.StudentDashboardPage })));
const StudentProfilePage = lazy(() => import('../features/student/StudentProfilePage').then((m) => ({ default: m.StudentProfilePage })));
const StudentChangePasswordPage = lazy(() => import('../features/student/StudentChangePasswordPage').then((m) => ({ default: m.StudentChangePasswordPage })));
const UnitsPage = lazy(() => import('../features/student/UnitsPage').then((m) => ({ default: m.UnitsPage })));
const StudentCurriculumPage = lazy(() => import('../features/student/StudentCurriculumPage').then((m) => ({ default: m.StudentCurriculumPage })));
const StudentLessonPage = lazy(() => import('../features/student/StudentLessonPage').then((m) => ({ default: m.StudentLessonPage })));
const StudentNotificationsPage = lazy(() => import('../features/student/StudentNotificationsPage').then((m) => ({ default: m.StudentNotificationsPage })));

// Walid / Teacher
const WalidDashboardPage = lazy(() => import('../features/walid/WalidDashboardPage').then((m) => ({ default: m.WalidDashboardPage })));
const ReportsPage = lazy(() => import('../features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const StudentListPage = lazy(() => import('../features/walid/StudentListPage').then((m) => ({ default: m.StudentListPage })));
const TrashPage = lazy(() => import('../features/walid/TrashPage').then((m) => ({ default: m.TrashPage })));
const StudentDetailPage = lazy(() => import('../features/walid/StudentDetailPage').then((m) => ({ default: m.StudentDetailPage })));
const GradesPage = lazy(() => import('../features/walid/GradesPage').then((m) => ({ default: m.GradesPage })));
const CurriculumPage = lazy(() => import('../features/walid/CurriculumPage').then((m) => ({ default: m.CurriculumPage })));
const CurriculumUnitsPage = lazy(() => import('../features/walid/CurriculumUnitsPage').then((m) => ({ default: m.CurriculumUnitsPage })));
const CurriculumLessonsPage = lazy(() => import('../features/walid/CurriculumLessonsPage').then((m) => ({ default: m.CurriculumLessonsPage })));
const ExamsPage = lazy(() => import('../features/walid/ExamsPage').then((m) => ({ default: m.ExamsPage })));
const LessonAssetsPage = lazy(() => import('../features/walid/LessonAssetsPage').then((m) => ({ default: m.LessonAssetsPage })));
const PricingPage = lazy(() => import('../features/walid/PricingPage').then((m) => ({ default: m.PricingPage })));
const CodesPage = lazy(() => import('../features/walid/CodesPage').then((m) => ({ default: m.CodesPage })));

// Admin
const AuditLogPage = lazy(() => import('../features/admin/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const RolesPage = lazy(() => import('../features/admin/RolesPage').then((m) => ({ default: m.RolesPage })));

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <Spinner label="جاري التحميل" />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public SEO surface — accessible without auth, indexable */}
        <Route
          path="/"
          element={
            <GuestOnly>
              <LandingPage />
            </GuestOnly>
          }
        />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/subjects" element={<SubjectsPage />} />
        <Route path="/subjects/:gradeSlug" element={<GradeLandingPage />} />
        <Route path="/pricing" element={<PricingPublicPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />

        {/* Auth — noindex */}
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

        {/* Protected */}
        <Route element={<ProtectedRoute />}>
          <Route path="/student" element={<RoleGuard allow={['student']} />}>
            <Route index element={<Navigate to="/student/dashboard" replace />} />
            <Route path="dashboard" element={<StudentDashboardPage />} />
            <Route path="profile" element={<StudentProfilePage />} />
            <Route path="password" element={<StudentChangePasswordPage />} />
            <Route path="units" element={<UnitsPage />} />
            <Route path="curriculum" element={<StudentCurriculumPage />} />
            <Route path="lessons/:lessonId" element={<StudentLessonPage />} />
            <Route path="notifications" element={<StudentNotificationsPage />} />
          </Route>
          <Route path="/walid" element={<RoleGuard allow={['mr_walid', 'admin', 'teacher']} />}>
            <Route index element={<Navigate to="/walid/dashboard" replace />} />
            <Route path="dashboard" element={<WalidDashboardPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="students" element={<StudentListPage />} />
            <Route path="students/trash" element={<TrashPage />} />
            <Route path="students/:studentId" element={<StudentDetailPage />} />
            <Route path="grades" element={<GradesPage />} />
            <Route path="curriculum" element={<CurriculumPage />} />
            <Route path="curriculum/:gradeId" element={<CurriculumUnitsPage />} />
            <Route path="curriculum/:gradeId/:unitId" element={<CurriculumLessonsPage />} />
            <Route path="exams" element={<ExamsPage />} />
            <Route path="lessons/:lessonId" element={<LessonAssetsPage />} />
            <Route path="pricing" element={<PricingPage />} />
            <Route path="codes" element={<CodesPage />} />
          </Route>
          <Route path="/admin" element={<RoleGuard allow={['admin']} />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<WalidDashboardPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="audit" element={<AuditLogPage />} />
            <Route path="roles" element={<RolesPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
