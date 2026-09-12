import { lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, StudentProvider } from "./contexts";
import BackupScheduler from "./components/admin/BackupScheduler";
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

const AdmissionHome = lazy(() => import("./pages/admission/AdmissionHome"));
const AdmissionStep1 = lazy(() => import("./pages/admission/AdmissionStep1"));
const AdmissionStep2 = lazy(() => import("./pages/admission/AdmissionStep2"));
const AdmissionStep3 = lazy(() => import("./pages/admission/AdmissionStep3"));
const AdmissionStep4 = lazy(() => import("./pages/admission/AdmissiontStep4"));
const AdmissionStep5 = lazy(() => import("./pages/admission/AdmissionStep5"));
const StudentHome = lazy(() => import("./pages/student/StudentHome"));
const StudentProfile = lazy(() => import("./pages/student/StudentProfile"));
const StudentGrades = lazy(() => import("./pages/student/StudentGrades"));
const StudentSubjects = lazy(() => import("./pages/student/StudentSubjects"));
const StudentEnrollment = lazy(() => import("./pages/student/StudentEnrollment"));
const StudentEvaluation = lazy(() => import("./pages/student/StudentEvaluation"));
const StudentLogin = lazy(() => import("./pages/student/StudentLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminStudents = lazy(() => import("./pages/admin/AdminStudents"));
const AdminGrades = lazy(() => import("./pages/admin/AdminGrades"));
const AdminEnrollees = lazy(() => import("./pages/admin/AdminEnrollees"));
const AdminAlumni = lazy(() => import("./pages/admin/AdminAlumni"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports"));
const AdminBackup = lazy(() => import("./pages/admin/AdminBackup"));
const AdminArchive = lazy(() => import("./pages/admin/AdminTrash"));
const RegistrarDashboard = lazy(() => import("./pages/registrar/RegistrarDashboard"));
const AreaManagerDashboard = lazy(
  () => import("./pages/manager/AreaManagerDashboard"),
);
const AreaManagerStudents = lazy(
  () => import("./pages/manager/AreaManagerStudents"),
);
const AreaManagerStaffAccounts = lazy(
  () => import("./pages/manager/AreaManagerStaffAccounts"),
);
const AreaManagerReports = lazy(
  () => import("./pages/manager/AreaManagerReports"),
);
const InstructorLayout = lazy(
  () => import("./components/instructor/InstructorLayout"),
);
const InstructorHome = lazy(() => import("./pages/instructor/InstructorHome"));
const InstructorStudents = lazy(
  () => import("./pages/instructor/InstructorStudents"),
);
const InstructorGrades = lazy(() => import("./pages/instructor/InstructorGrades"));
const InstructorGradeChanges = lazy(
  () => import("./pages/instructor/InstructorGradeChanges"),
);
const StaffLogin = lazy(() => import("./pages/staff/StaffLogin"));
const ManagerLayout = lazy(
  () => import("./components/manager/ManagerLayout"),
);

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
        <Suspense
          fallback={
            <div role="status" aria-live="polite">
              Loading page…
            </div>
          }
        >
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
