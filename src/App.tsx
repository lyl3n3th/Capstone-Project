import type { ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
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

import RegistrarDashboard from "./pages/registrar/RegistrarDashboard.tsx";

import AreaManagerDashboard from "./pages/manager/AreaManagerDashboard.tsx";
import AreaManagerStudents from "./pages/manager/AreaManagerStudents.tsx";
import AreaManagerStaffAccounts from "./pages/manager/AreaManagerStaffAccounts.tsx";
import AreaManagerReports from "./pages/manager/AreaManagerReports.tsx";
import BackupScheduler from "./components/admin/BackupScheduler";

import StaffLogin from "./pages/staff/StaffLogin.tsx";
import TestSupabase from "./components/TestSupabase";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PublicOnlyRoute from "./components/auth/PublicOnlyRoute";
import { useAdmissionPortalStatus } from "./hooks/useAdmissionPortalStatus";
import { useAuth } from "./hooks/useAuth";
import { STAFF_PORTAL_ROLES } from "./types/user";

// Import Layouts
import ManagerLayout from "./components/manager/ManagerLayout";

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

function AdminPortalRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute
      allowedRoles={["admin", "registrar"]}
      loginPath="/staff/login"
    >
      {children}
    </ProtectedRoute>
  );
}

function AdmissionApplicationRoute({ children }: { children: ReactNode }) {
  const { isOpen: isAdmissionPortalOpen } = useAdmissionPortalStatus();

  if (!isAdmissionPortalOpen) {
    return <Navigate to="/admission" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { currentUser, logout } = useAuth();

  // Admin props
  const adminProps = {
    onLogout: logout,
    loggedInUsername: currentUser?.displayName || "Administrator",
    loggedInRole:
      currentUser?.role === "registrar"
        ? ("Registrar" as const)
        : ("Admin" as const),
    canAccessBackup:
      currentUser?.role === "admin" || currentUser?.role === "manager",
  };

  // Area Manager props
  const areaManagerProps = {
    onLogout: logout,
    loggedInUsername: currentUser?.displayName || "Area Manager",
    loggedInRole: "Area Manager" as const,
    canAccessBackup: currentUser?.role === "manager",
  };

  return (
    <Routes>
      {/* Public Admission Routes */}
      <Route path="/" element={<AdmissionHome />} />
      <Route path="/admission" element={<AdmissionHome />} />
      <Route
        path="/enroll"
        element={
          <AdmissionApplicationRoute>
            <AdmissionStep1 />
          </AdmissionApplicationRoute>
        }
      />
      <Route
        path="/information"
        element={
          <AdmissionApplicationRoute>
            <AdmissionStep2 />
          </AdmissionApplicationRoute>
        }
      />
      <Route
        path="/requirements"
        element={
          <AdmissionApplicationRoute>
            <AdmissionStep3 />
          </AdmissionApplicationRoute>
        }
      />
      <Route path="/confirmation" element={<AdmissionStep4 />} />
      <Route path="/scholarship-exam" element={<AdmissionStep5 />} />

      {/* Student Routes */}
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

      {/* Admin Routes with Layout */}
      <Route
        path="/admin"
        element={
          <AdminPortalRoute>
            <Outlet />
          </AdminPortalRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard {...adminProps} />} />
        <Route path="students" element={<AdminStudents {...adminProps} />} />
        <Route path="enrollees" element={<AdminEnrollees {...adminProps} />} />
        <Route path="grades" element={<AdminGrades {...adminProps} />} />
        <Route path="alumni" element={<AdminAlumni {...adminProps} />} />
        <Route
          path="reports"
          element={
            <ProtectedRoute allowedRoles={["admin"]} loginPath="/staff/login">
              <AdminReports {...adminProps} />
            </ProtectedRoute>
          }
        />
        <Route path="backup" element={<AdminBackup {...adminProps} />} />
        <Route path="trash" element={<AdminTrash {...adminProps} />} />
      </Route>

      {/* Registrar Routes with Layout */}
      <Route
        path="/registrar"
        element={
          <AdminPortalRoute>
            <Outlet />
          </AdminPortalRoute>
        }
      >
        <Route index element={<Navigate to="/registrar/dashboard" replace />} />
        <Route
          path="dashboard"
          element={<RegistrarDashboard {...adminProps} />}
        />
      </Route>

      {/* Area Manager Routes with Layout */}
      <Route
        path="/manager"
        element={
          <StaffPortalRoute allowedRoles={["manager"]}>
            <ManagerLayout {...areaManagerProps} />
          </StaffPortalRoute>
        }
      >
        <Route index element={<Navigate to="/manager/dashboard" replace />} />
        <Route
          path="dashboard"
          element={<AreaManagerDashboard {...areaManagerProps} />}
        />
        <Route path="students" element={<AreaManagerStudents />} />
        <Route path="staff-accounts" element={<AreaManagerStaffAccounts />} />

        <Route
          path="reports"
          element={<AreaManagerReports {...areaManagerProps} />}
        />
      </Route>

      {/* Staff Login */}
      <Route
        path="/staff/login"
        element={
          <PublicOnlyRoute>
            <StaffLogin />
          </PublicOnlyRoute>
        }
      />

      {/* Test Routes */}
      <Route path="/test-supabase" element={<TestSupabase />} />

      {/* Redirects */}
      <Route
        path="/student"
        element={<Navigate to="/student/home" replace />}
      />
      <Route path="/staff" element={<Navigate to="/staff/login" replace />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BackupScheduler />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
