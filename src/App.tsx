import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
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
import StudentEvaluation from "./pages/student/StudentEvaluation.tsx";
import StudentLogin from "./pages/student/StudentLogin.tsx";

import AdminDashboard from "./pages/admin/AdminDashboard.tsx";
import AdminStudents from "./pages/admin/AdminStudents.tsx";
import AdminGrades from "./pages/admin/AdminGrades.tsx";
import AdminEnrollees from "./pages/admin/AdminEnrollees.tsx";
import AdminAlumni from "./pages/admin/AdminAlumni.tsx";
import AdminReports from "./pages/admin/AdminReports.tsx";
import AdminBackup from "./pages/admin/AdminBackup.tsx";
import AdminArchive from "./pages/admin/AdminTrash.tsx";

import RegistrarDashboard from "./pages/registrar/RegistrarDashboard.tsx";

import AreaManagerDashboard from "./pages/manager/AreaManagerDashboard.tsx";
import AreaManagerStudents from "./pages/manager/AreaManagerStudents.tsx";
import AreaManagerStaffAccounts from "./pages/manager/AreaManagerStaffAccounts.tsx";
import AreaManagerReports from "./pages/manager/AreaManagerReports.tsx";
import BackupScheduler from "./components/admin/BackupScheduler";
import InstructorLayout from "./components/instructor/InstructorLayout";
import InstructorHome from "./pages/instructor/InstructorHome";
import InstructorStudents from "./pages/instructor/InstructorStudents";
import InstructorGrades from "./pages/instructor/InstructorGrades";
import InstructorGradeChanges from "./pages/instructor/InstructorGradeChanges";

import StaffLogin from "./pages/staff/StaffLogin.tsx";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PublicOnlyRoute from "./components/auth/PublicOnlyRoute";
import {
  useAdmissionPortalOverview,
  useAdmissionPortalStatus,
} from "./hooks/useAdmissionPortalStatus";
import {
  DEFAULT_ADMISSION_BRANCH_CODE,
  resolveAdmissionPortalBranchCode,
} from "./services/admissionPortal";
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

function StaffConnectionGuard({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const [shouldReturnToLogin, setShouldReturnToLogin] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const returnToStaffLogin = () => {
      logout();
      setShouldReturnToLogin(true);
    };

    if (!window.navigator.onLine) {
      returnToStaffLogin();
      return;
    }

    window.addEventListener("offline", returnToStaffLogin);

    return () => {
      window.removeEventListener("offline", returnToStaffLogin);
    };
  }, [logout]);

  if (shouldReturnToLogin) {
    return <Navigate to="/staff/login" replace />;
  }

  return <>{children}</>;
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
      <StaffConnectionGuard>{children}</StaffConnectionGuard>
    </ProtectedRoute>
  );
}

function AdminPortalRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute
      allowedRoles={["admin", "registrar"]}
      loginPath="/staff/login"
    >
      <StaffConnectionGuard>{children}</StaffConnectionGuard>
    </ProtectedRoute>
  );
}

function AdmissionApplicationRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const branchParam = new URLSearchParams(location.search).get("branch");
  const resolvedBranchCode = resolveAdmissionPortalBranchCode(branchParam);
  const { isAnyOpen: isAnyAdmissionBranchOpen } = useAdmissionPortalOverview();
  const { isOpen: isSelectedBranchOpen } = useAdmissionPortalStatus(
    resolvedBranchCode ?? DEFAULT_ADMISSION_BRANCH_CODE,
  );

  if (branchParam && !resolvedBranchCode) {
    return <Navigate to="/enroll" replace />;
  }

  if (resolvedBranchCode && !isSelectedBranchOpen) {
    return <Navigate to="/enroll" replace />;
  }

  if (!resolvedBranchCode && !isAnyAdmissionBranchOpen) {
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
        element={<Navigate to="/student/login" replace />}
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
        path="/student/evaluation"
        element={
          <StudentPortalRoute>
            <StudentEvaluation />
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
        <Route path="archive" element={<AdminArchive {...adminProps} />} />
        <Route
          path="trash"
          element={<Navigate to="/admin/archive" replace />}
        />
      </Route>

      <Route
        path="/instructor"
        element={
          <StaffPortalRoute allowedRoles={["instructor"]}>
            <InstructorLayout />
          </StaffPortalRoute>
        }
      >
        <Route index element={<Navigate to="/instructor/home" replace />} />
        <Route path="home" element={<InstructorHome />} />
        <Route path="students" element={<InstructorStudents />} />
        <Route path="grades" element={<InstructorGrades />} />
        <Route path="grade-changes" element={<InstructorGradeChanges />} />
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
