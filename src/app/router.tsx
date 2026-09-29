import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { GuestOnly, ProtectedRoute, RoleGuard } from '../components/guards';
import { Spinner } from '../components/Spinner';
import { SuspendedAccountGate } from '../components/SuspendedAccountGate';
import { useAuth } from '../features/auth/AuthContext';
import { ErrorBoundary } from './ErrorBoundary';
import { lazyWithRetry } from './lazyWithRetry';

// Public — lazy for code splitting (Landing excludes hls.js chunk)
const LandingPage = lazyWithRetry(() => import('../features/public/LandingPage').then((m) => ({ default: m.LandingPage })));
const AboutPage = lazyWithRetry(() => import('../features/public/AboutPage').then((m) => ({ default: m.AboutPage })));
const HowItWorksPage = lazyWithRetry(() => import('../features/public/HowItWorksPage').then((m) => ({ default: m.HowItWorksPage })));
const SubjectsPage = lazyWithRetry(() => import('../features/public/SubjectsPage').then((m) => ({ default: m.SubjectsPage })));
const GradeLandingPage = lazyWithRetry(() => import('../features/public/GradeLandingPage').then((m) => ({ default: m.GradeLandingPage })));
const PricingPublicPage = lazyWithRetry(() => import('../features/public/PricingPublicPage').then((m) => ({ default: m.PricingPublicPage })));
const FaqPage = lazyWithRetry(() => import('../features/public/FaqPage').then((m) => ({ default: m.FaqPage })));
const ContactPage = lazyWithRetry(() => import('../features/public/ContactPage').then((m) => ({ default: m.ContactPage })));
const PrivacyPage = lazyWithRetry(() => import('../features/public/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazyWithRetry(() => import('../features/public/TermsPage').then((m) => ({ default: m.TermsPage })));
const NotFoundPage = lazyWithRetry(() => import('../features/public/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const LabsExamPage = lazyWithRetry(() => import('../features/labs/LabsExamPage').then((m) => ({ default: m.LabsExamPage })));
const LabsRedesignPage = lazyWithRetry(() => import('../features/labs/LabsRedesignPage').then((m) => ({ default: m.LabsRedesignPage })));
const NewUiPage = lazyWithRetry(() => import('../features/labs/NewUiPage').then((m) => ({ default: m.NewUiPage })));
const CurriLabsPage = lazyWithRetry(() => import('../features/labs/CurriLabsPage').then((m) => ({ default: m.CurriLabsPage })));
const AuthLabsGallery = lazyWithRetry(() =>
  import('../features/labs/auth/AuthLabsGallery').then((m) => ({ default: m.AuthLabsGallery })),
);
const LabsLogin1 = lazyWithRetry(() => import('../features/labs/auth/variant1').then((m) => ({ default: m.Login1 })));
const LabsRegister1 = lazyWithRetry(() => import('../features/labs/auth/variant1').then((m) => ({ default: m.Register1 })));
const LabsLogin2 = lazyWithRetry(() => import('../features/labs/auth/variant2').then((m) => ({ default: m.Login2 })));
const LabsRegister2 = lazyWithRetry(() => import('../features/labs/auth/variant2').then((m) => ({ default: m.Register2 })));
const LabsLogin3 = lazyWithRetry(() => import('../features/labs/auth/variant3').then((m) => ({ default: m.Login3 })));
const LabsRegister3 = lazyWithRetry(() => import('../features/labs/auth/variant3').then((m) => ({ default: m.Register3 })));
const LabsLogin4 = lazyWithRetry(() => import('../features/labs/auth/variant4').then((m) => ({ default: m.Login4 })));
const LabsRegister4 = lazyWithRetry(() => import('../features/labs/auth/variant4').then((m) => ({ default: m.Register4 })));
const LabsLogin5 = lazyWithRetry(() => import('../features/labs/auth/variant5').then((m) => ({ default: m.Login5 })));
const LabsRegister5 = lazyWithRetry(() => import('../features/labs/auth/variant5').then((m) => ({ default: m.Register5 })));

// Auth — keep lazy too but small
const LoginPage = lazyWithRetry(() => import('../features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazyWithRetry(() => import('../features/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })));

// Student
const StudentDashboardPage = lazyWithRetry(() => import('../features/student/StudentDashboardPage').then((m) => ({ default: m.StudentDashboardPage })));
const StudentProfilePage = lazyWithRetry(() => import('../features/student/StudentProfilePage').then((m) => ({ default: m.StudentProfilePage })));
const StudentChangePasswordPage = lazyWithRetry(() => import('../features/student/StudentChangePasswordPage').then((m) => ({ default: m.StudentChangePasswordPage })));
const UnitsPage = lazyWithRetry(() => import('../features/student/UnitsPage').then((m) => ({ default: m.UnitsPage })));
const StudentCurriculumPage = lazyWithRetry(() => import('../features/student/StudentCurriculumPage').then((m) => ({ default: m.StudentCurriculumPage })));
const StudentLessonPage = lazyWithRetry(() => import('../features/student/StudentLessonPage').then((m) => ({ default: m.StudentLessonPage })));
const GeneralExamsListPage = lazyWithRetry(() => import('../features/student/GeneralExamsListPage').then((m) => ({ default: m.GeneralExamsListPage })));
const GeneralExamTakePage = lazyWithRetry(() => import('../features/student/GeneralExamTakePage').then((m) => ({ default: m.GeneralExamTakePage })));
const StudentNotificationsPage = lazyWithRetry(() => import('../features/student/StudentNotificationsPage').then((m) => ({ default: m.StudentNotificationsPage })));
const StudentSuggestionsPage = lazyWithRetry(() => import('../features/student/StudentSuggestionsPage').then((m) => ({ default: m.StudentSuggestionsPage })));
const StudentPresenceGate = lazyWithRetry(() =>
  import('../features/student/StudentPresenceGate').then((m) => ({ default: m.StudentPresenceGate })),
);

// Walid / Teacher
const WalidDashboardPage = lazyWithRetry(() => import('../features/walid/WalidDashboardPage').then((m) => ({ default: m.WalidDashboardPage })));
const ReportsPage = lazyWithRetry(() => import('../features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const StudentListPage = lazyWithRetry(() => import('../features/walid/StudentListPage').then((m) => ({ default: m.StudentListPage })));
const TrashPage = lazyWithRetry(() => import('../features/walid/TrashPage').then((m) => ({ default: m.TrashPage })));
const StudentDetailPage = lazyWithRetry(() => import('../features/walid/StudentDetailPage').then((m) => ({ default: m.StudentDetailPage })));
const GradesPage = lazyWithRetry(() => import('../features/walid/GradesPage').then((m) => ({ default: m.GradesPage })));
const CurriculumPage = lazyWithRetry(() => import('../features/walid/CurriculumPage').then((m) => ({ default: m.CurriculumPage })));
const CurriculumUnitsPage = lazyWithRetry(() => import('../features/walid/CurriculumUnitsPage').then((m) => ({ default: m.CurriculumUnitsPage })));
const CurriculumLessonsPage = lazyWithRetry(() => import('../features/walid/CurriculumLessonsPage').then((m) => ({ default: m.CurriculumLessonsPage })));
const ExamsPage = lazyWithRetry(() => import('../features/walid/ExamsPage').then((m) => ({ default: m.ExamsPage })));
const GeneralExamsPage = lazyWithRetry(() => import('../features/walid/GeneralExamsPage').then((m) => ({ default: m.GeneralExamsPage })));
const GeneralExamDetailPage = lazyWithRetry(() => import('../features/walid/GeneralExamDetailPage').then((m) => ({ default: m.GeneralExamDetailPage })));
const LessonAssetsPage = lazyWithRetry(() => import('../features/walid/LessonAssetsPage').then((m) => ({ default: m.LessonAssetsPage })));
const PricingPage = lazyWithRetry(() => import('../features/walid/PricingPage').then((m) => ({ default: m.PricingPage })));
const CodesPage = lazyWithRetry(() => import('../features/walid/CodesPage').then((m) => ({ default: m.CodesPage })));
const WalidAnnouncementsListPage = lazyWithRetry(() => import('../features/walid/AnnouncementsListPage').then((m) => ({ default: m.WalidAnnouncementsListPage })));
const WalidAnnouncementFormPage = lazyWithRetry(() => import('../features/walid/AnnouncementFormPage').then((m) => ({ default: m.WalidAnnouncementFormPage })));

// Admin
const AuditLogPage = lazyWithRetry(() => import('../features/admin/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const RolesPage = lazyWithRetry(() => import('../features/admin/RolesPage').then((m) => ({ default: m.RolesPage })));
const AnnouncementsListPage = lazyWithRetry(() => import('../features/admin/AnnouncementsListPage').then((m) => ({ default: m.AnnouncementsListPage })));
const AdminSuggestionsPage = lazyWithRetry(() => import('../features/admin/AdminSuggestionsPage').then((m) => ({ default: m.AdminSuggestionsPage })));
const AnnouncementFormPage = lazyWithRetry(() => import('../features/admin/AnnouncementFormPage').then((m) => ({ default: m.AnnouncementFormPage })));
const PresencePage = lazyWithRetry(() => import('../features/admin/PresencePage').then((m) => ({ default: m.PresencePage })));
const StudentPresenceHistoryPage = lazyWithRetry(() =>
  import('../features/admin/StudentPresenceHistoryPage').then((m) => ({ default: m.StudentPresenceHistoryPage })),
);

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <Spinner label="جاري التحميل" />
    </div>
  );
}

// Assistant lands on exams (core workspace); other staff land on dashboard.
// Runs inside the outer /walid RoleGuard, so role is already resolved.
function WalidIndexRedirect() {
  const { role } = useAuth();
  if (role === 'assistant') {
    return <Navigate to="/walid/exams" replace />;
  }
  return <Navigate to="/walid/dashboard" replace />;
}

export function AppRoutes() {
  return (
    <ErrorBoundary>
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
        {/* Labs: interactive demo (noindex, no backend, no persistence) */}
        <Route path="/labs/exam" element={<LabsExamPage />} />
        <Route path="/labs/redesign" element={<LabsRedesignPage />} />
        <Route path="/labs/newui" element={<NewUiPage />} />
        <Route path="/labs/curri" element={<CurriLabsPage />} />
        <Route path="/labs/auth" element={<AuthLabsGallery />} />
        <Route path="/labs/login1" element={<LabsLogin1 />} />
        <Route path="/labs/register1" element={<LabsRegister1 />} />
        <Route path="/labs/login2" element={<LabsLogin2 />} />
        <Route path="/labs/register2" element={<LabsRegister2 />} />
        <Route path="/labs/login3" element={<LabsLogin3 />} />
        <Route path="/labs/register3" element={<LabsRegister3 />} />
        <Route path="/labs/login4" element={<LabsLogin4 />} />
        <Route path="/labs/register4" element={<LabsRegister4 />} />
        <Route path="/labs/login5" element={<LabsLogin5 />} />
        <Route path="/labs/register5" element={<LabsRegister5 />} />

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
            <Route element={<SuspendedAccountGate />}>
              <Route path="profile" element={<StudentProfilePage />} />
              <Route path="password" element={<StudentChangePasswordPage />} />
              <Route element={<StudentPresenceGate />}>
                <Route index element={<Navigate to="/student/dashboard" replace />} />
                <Route path="dashboard" element={<StudentDashboardPage />} />
                <Route path="units" element={<UnitsPage />} />
                <Route path="curriculum" element={<StudentCurriculumPage />} />
                <Route path="lessons/:lessonId" element={<StudentLessonPage />} />
                <Route path="exams" element={<GeneralExamsListPage />} />
                <Route path="exams/:examId" element={<GeneralExamTakePage />} />
                <Route path="notifications" element={<StudentNotificationsPage />} />
                <Route path="suggestions" element={<StudentSuggestionsPage />} />
              </Route>
            </Route>
          </Route>
          {/* Staff: single /walid guard (mr_walid / admin / teacher / assistant).
              A duplicate /walid Route here used to redirect-loop assistants
              (the first guard always won). Restricted pages are nested under
              an inner staff-only guard instead. */}
          <Route path="/walid" element={<RoleGuard allow={['mr_walid', 'admin', 'teacher', 'assistant']} />}>
            <Route index element={<WalidIndexRedirect />} />
            {/* Assistant-allowed: curriculum (read-only UI) + exams + lesson assets */}
            <Route path="curriculum" element={<CurriculumPage />} />
            <Route path="curriculum/:gradeId" element={<CurriculumUnitsPage />} />
            <Route path="curriculum/:gradeId/:unitId" element={<CurriculumLessonsPage />} />
            <Route path="exams" element={<ExamsPage />} />
            <Route path="general-exams" element={<GeneralExamsPage />} />
            <Route path="general-exams/:examId" element={<GeneralExamDetailPage />} />
            <Route path="lessons/:lessonId" element={<LessonAssetsPage />} />
            {/* Staff-only (no assistant): dashboard/reports/students/grades/pricing/codes/announcements */}
            <Route element={<RoleGuard allow={['mr_walid', 'admin', 'teacher']} />}>
              <Route path="dashboard" element={<WalidDashboardPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="students" element={<StudentListPage />} />
              <Route path="students/trash" element={<TrashPage />} />
              <Route path="students/:studentId" element={<StudentDetailPage />} />
              <Route path="grades" element={<GradesPage />} />
              <Route path="pricing" element={<PricingPage />} />
              <Route path="codes" element={<CodesPage />} />
              <Route path="announcements" element={<WalidAnnouncementsListPage />} />
              <Route path="announcements/new" element={<WalidAnnouncementFormPage />} />
              <Route path="announcements/:id/edit" element={<WalidAnnouncementFormPage />} />
            </Route>
          </Route>
          <Route path="/admin" element={<RoleGuard allow={['admin']} />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<WalidDashboardPage />} />
            <Route path="presence" element={<PresencePage />} />
            <Route path="presence/:studentId" element={<StudentPresenceHistoryPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="audit" element={<AuditLogPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="announcements" element={<AnnouncementsListPage />} />
            <Route path="suggestions" element={<AdminSuggestionsPage />} />
            <Route path="announcements/new" element={<AnnouncementFormPage />} />
            <Route path="announcements/:id/edit" element={<AnnouncementFormPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
