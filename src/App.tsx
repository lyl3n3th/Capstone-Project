import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdmissionHome from "./pages/admission/AdmissionHome";
import AdmissionStep1 from "./pages/admission/AdmissionStep1";
import AdmissionStep2 from "./pages/admission/AdmissionStep2";
import AdmissionStep3 from "./pages/admission/AdmissionStep3";
import AdmissionStep4 from "./pages/admission/AdmissiontStep4";
import AdmissionStep5 from "./pages/admission/AdmissionStep5";

import { StudentProvider } from "./contexts";
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

function App() {
  const appProps = {
    onLogout: () => {},
    loggedInUsername: "Liza Mae Guyo",
    loggedInRole: "Admin" as const,
    canAccessBackup: true,
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* Public admission home */}
        <Route path="/" element={<AdmissionHome />} />
        <Route path="/admission" element={<AdmissionHome />} />
        <Route path="/enroll" element={<AdmissionStep1 />} />
        <Route path="/information" element={<AdmissionStep2 />} />
        <Route path="/requirements" element={<AdmissionStep3 />} />
        <Route path="/confirmation" element={<AdmissionStep4 />} />
        <Route path="/scholarship-exam" element={<AdmissionStep5 />} />

        {/* Private student side */}
        <Route
          path="/student/login"
          element={
            <StudentProvider>
              <StudentLogin />
            </StudentProvider>
          }
        />
        <Route
          path="/student/registration"
          element={
            <StudentProvider>
              <StudentRegistration />
            </StudentProvider>
          }
        />
        <Route
          path="/student/home"
          element={
            <StudentProvider>
              <StudentHome />
            </StudentProvider>
          }
        />
        <Route
          path="/student/profile"
          element={
            <StudentProvider>
              <StudentProfile />
            </StudentProvider>
          }
        />
        <Route
          path="/student/grades"
          element={
            <StudentProvider>
              <StudentGrades />
            </StudentProvider>
          }
        />
        <Route
          path="/student/subjects"
          element={
            <StudentProvider>
              <StudentSubjects />
            </StudentProvider>
          }
        />
        <Route
          path="/student/enrollment"
          element={
            <StudentProvider>
              <StudentEnrollment />
            </StudentProvider>
          }
        />
        {/* Private admin side */}
        <Route
          path="/admin/students"
          element={<AdminStudents {...appProps} />}
        />
        <Route
          path="/admin/dashboard"
          element={<AdminDashboard {...appProps} />}
        />
        <Route
          path="/admin/enrollees"
          element={<AdminEnrollees {...appProps} />}
        />
        <Route path="/admin/grades" element={<AdminGrades {...appProps} />} />
        <Route path="/admin/alumni" element={<AdminAlumni {...appProps} />} />
        <Route path="/admin/reports" element={<AdminReports {...appProps} />} />
        <Route path="/admin/backup" element={<AdminBackup {...appProps} />} />
        <Route path="/admin/trash" element={<AdminTrash {...appProps} />} />

        {/* Staff login */}
        <Route path="/staff/login" element={<StaffLogin />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
