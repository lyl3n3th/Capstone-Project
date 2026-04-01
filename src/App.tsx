import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdmissionHome from "./pages/admission/AdmissionHome";
import AdmissionStep1 from "./pages/admission/AdmissionStep1";
import AdmissionStep2 from "./pages/admission/AdmissionStep2";
import AdmissionStep3 from "./pages/admission/AdmissionStep3";
import AdmissionStep4 from "./pages/admission/AdmissiontStep4";
import AdmissionStep5 from "./pages/admission/AdmissionStep5";

import { AuthProvider, StudentProvider } from "./contexts";
import StudentHome from "./pages/student/StudentHome.tsx";
import StudentProfile from "./pages/student/StudentProfile.tsx";
import StudentGrades from "./pages/student/StudentGrades.tsx";
import StudentSubjects from "./pages/student/StudentSubjects.tsx";
import StudentEnrollment from "./pages/student/StudentEnrollment.tsx";
import StudentLogin from "./pages/student/StudentLogin.tsx";
import StudentRegistration from "./pages/student/StudentRegistration.tsx";

import AdminDashboard from "./pages/admin/AdminDashboard.tsx";
import AdminStudents from "./pages/admin/AdminStudents.tsx";
import AdminGrades from "./pages/admin/AdminGrades.tsx";
import AdminEnrollees from "./pages/admin/AdminEnrollees.tsx";
import AdminAlumni from "./pages/admin/AdminAlumni.tsx";
import AdminReports from "./pages/admin/AdminReports.tsx";
import AdminBackup from "./pages/admin/AdminBackup.tsx";
import AdminTrash from "./pages/admin/AdminTrash.tsx";

import StaffLogin from "./pages/staff/StaffLogin.tsx";
import TestSupabase from "./components/TestSupabase";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PublicOnlyRoute from "./components/auth/PublicOnlyRoute";
import { useAuth } from "./hooks/useAuth";
import { STAFF_PORTAL_ROLES } from "./types/user";

function StudentPortalRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={["student"]} loginPath="/student/login">
      <StudentProvider>{children}</StudentProvider>
    </ProtectedRoute>
  );
}

function StaffPortalRoute({
  children,
  allowedRoles = STAFF_PORTAL_ROLES,
}: {
  children: ReactNode;
  allowedRoles?: typeof STAFF_PORTAL_ROLES;
}) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles} loginPath="/staff/login">
      {children}
    </ProtectedRoute>
  );
}

function AppRoutes() {
  const { currentUser, logout } = useAuth();

  const appProps = {
    onLogout: logout,
    loggedInUsername: currentUser?.displayName || "Administrator",
    loggedInRole: currentUser?.role === "registrar" ? ("Registrar" as const) : ("Admin" as const),
    canAccessBackup:
      currentUser?.role === "admin" || currentUser?.role === "manager",
  };

  return (
    <Routes>
      <Route path="/" element={<AdmissionHome />} />
      <Route path="/admission" element={<AdmissionHome />} />
      <Route path="/enroll" element={<AdmissionStep1 />} />
      <Route path="/information" element={<AdmissionStep2 />} />
      <Route path="/requirements" element={<AdmissionStep3 />} />
      <Route path="/confirmation" element={<AdmissionStep4 />} />
      <Route path="/scholarship-exam" element={<AdmissionStep5 />} />

      <Route
        path="/student/login"
        element={
          <PublicOnlyRoute>
            <StudentLogin />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/student/registration"
        element={
          <PublicOnlyRoute>
            <StudentRegistration />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/student/home"
        element={
          <StudentPortalRoute>
            <StudentHome />
          </StudentPortalRoute>
        }
      />
      <Route
        path="/student/profile"
        element={
          <StudentPortalRoute>
            <StudentProfile />
          </StudentPortalRoute>
        }
      />
      <Route
        path="/student/grades"
        element={
          <StudentPortalRoute>
            <StudentGrades />
          </StudentPortalRoute>
        }
      />
      <Route
        path="/student/subjects"
        element={
          <StudentPortalRoute>
            <StudentSubjects />
          </StudentPortalRoute>
        }
      />
      <Route
        path="/student/enrollment"
        element={
          <StudentPortalRoute>
            <StudentEnrollment />
          </StudentPortalRoute>
        }
      />

      <Route
        path="/admin/students"
        element={
          <StaffPortalRoute>
            <AdminStudents {...appProps} />
          </StaffPortalRoute>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <StaffPortalRoute>
            <AdminDashboard {...appProps} />
          </StaffPortalRoute>
        }
      />
      <Route
        path="/admin/enrollees"
        element={
          <StaffPortalRoute>
            <AdminEnrollees {...appProps} />
          </StaffPortalRoute>
        }
      />
      <Route
        path="/admin/grades"
        element={
          <StaffPortalRoute>
            <AdminGrades {...appProps} />
          </StaffPortalRoute>
        }
      />
      <Route
        path="/admin/alumni"
        element={
          <StaffPortalRoute>
            <AdminAlumni {...appProps} />
          </StaffPortalRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <StaffPortalRoute>
            <AdminReports {...appProps} />
          </StaffPortalRoute>
        }
      />
      <Route
        path="/admin/backup"
        element={
          <StaffPortalRoute allowedRoles={["admin", "manager"]}>
            <AdminBackup {...appProps} />
          </StaffPortalRoute>
        }
      />
      <Route
        path="/admin/trash"
        element={
          <StaffPortalRoute>
            <AdminTrash {...appProps} />
          </StaffPortalRoute>
        }
      />

      <Route
        path="/staff/login"
        element={
          <PublicOnlyRoute>
            <StaffLogin />
          </PublicOnlyRoute>
        }
      />

      <Route path="/student" element={<Navigate to="/student/home" replace />} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/staff" element={<Navigate to="/staff/login" replace />} />
      <Route path="/test-supabase" element={<TestSupabase />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
