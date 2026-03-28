import { useState, useEffect, useRef } from "react";
import { IoMenu } from "react-icons/io5";
import {
  FaCalendarAlt,
  FaGraduationCap,
  FaCheckCircle,
  FaSpinner,
} from "react-icons/fa";
import {
  MdOutlineDriveFolderUpload,
  MdDownload,
  MdFileUpload,
} from "react-icons/md";
import { IoDocumentText } from "react-icons/io5";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import { useStudent } from "../../contexts/StudentContext";
import { ToastContainer } from "../../components/common/Toast";
import "../../styles/main.css";

const useToast = () => {
  const [toasts, setToasts] = useState<
    Array<{
      id: string;
      message: string;
      type: "success" | "error" | "info" | "warning";
    }>
  >([]);

  const addToast = (
    message: string,
    type: "success" | "error" | "info" | "warning",
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return { toasts, addToast, removeToast };
};

function StudentEnrollment() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { student, isLoading } = useStudent();
  const [uploadedFiles, setUploadedFiles] = useState<
    Record<string, { name: string; url?: string }>
  >({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [eligibilityStatus, setEligibilityStatus] = useState({
    grade11Completed: true,
    academicYear: "2025-2026",
    passed: true,
    strand: "TVL - ICT",
  });
  const [enrollmentStatus, setEnrollmentStatus] = useState({
    status: "Pending",
    enrollmentDate: "-",
    semester: "-",
    gradeLevel: "-",
  });
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { toasts, addToast, removeToast } = useToast();

  const handleMenuClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  const handleLogout = () => {
    console.log("Logging out...");
    addToast("Logging out...", "info");
  };

  const handleFileUpload = async (docType: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setUploadingId(docType);

      try {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setUploadedFiles((prev) => ({
          ...prev,
          [docType]: { name: file.name, url: URL.createObjectURL(file) },
        }));
        addToast(`${docType} uploaded successfully!`, "success");
      } catch (error) {
        console.error("Upload failed:", error);
        addToast("Upload failed. Please try again.", "error");
      } finally {
        setUploadingId(null);
      }
    };

    input.click();
  };

  const handleDownloadClearance = () => {
    const clearanceText = `STUDENT CLEARANCE FORM
    ${"=".repeat(50)}
    
    Student Name: ${student?.firstName} ${student?.lastName}
    Student Number: ${student?.studentNumber}
    Strand: ${eligibilityStatus.strand}
    Academic Year: ${eligibilityStatus.academicYear}
    
    ${"=".repeat(50)}
    
    CLEARANCE STATUS:
    
    ☐ Instructor Clearance
    ☐ Faculty Clearance  
    ☐ Registrar Clearance
    ☐ Department Clearance
    
    ${"=".repeat(50)}
    
    Note: This clearance requires physical signatures from authorized personnel.
    Downloaded clearance is not valid without complete signatures.
    
    Generated on: ${new Date().toLocaleDateString()}
    `;

    const blob = new Blob([clearanceText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clearance_${student?.studentNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addToast("Clearance downloaded successfully!", "success");
  };

  const handleEnroll = () => {
    if (!eligibilityStatus.grade11Completed) {
      addToast(
        "You are not eligible to enroll. Please complete Grade 11 first.",
        "warning",
      );
      return;
    }

    if (!uploadedFiles["grade11_certificate"]) {
      addToast(
        "Please upload your Grade 11 Certificate of Grades before enrolling.",
        "warning",
      );
      return;
    }

    if (!uploadedFiles["clearance"]) {
      addToast("Please upload your clearance before enrolling.", "warning");
      return;
    }

    addToast(
      "Enrollment submitted successfully! Waiting for registrar approval.",
      "success",
    );
  };

  const handleDownloadConfirmation = () => {
    if (enrollmentStatus.status !== "Approved") {
      addToast(
        "Enrollment confirmation is only available after approval.",
        "warning",
      );
      return;
    }

    const confirmationText = `ENROLLMENT CONFIRMATION
    ${"=".repeat(50)}
    
    Asian Institute of Computer Studies
    Bacoor Branch
    
    ${"=".repeat(50)}
    
    Student Name: ${student?.firstName} ${student?.lastName}
    Student Number: ${student?.studentNumber}
    Strand: ${eligibilityStatus.strand}
    Grade Level: Grade 12
    Semester: 1st Semester
    Academic Year: ${eligibilityStatus.academicYear}
    
    ${"=".repeat(50)}
    
    ASSIGNED SUBJECTS:
    
    1. MTH122 - Statistics and Probability
    2. CP1122 - Computer Programming 2 (Java NC II)
    3. EAP122 - English for Academic and Professional Purposes
    4. PEH122 - Physical Education and Health 2
    
    ${"=".repeat(50)}
    
    Enrollment Status: ${enrollmentStatus.status}
    Enrollment Date: ${new Date().toLocaleDateString()}
    
    This confirms that the student is officially enrolled for the upcoming semester.
    
    Registrar's Signature: ___________________
    Date: ${new Date().toLocaleDateString()}
    `;

    const blob = new Blob([confirmationText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enrollment_confirmation_${student?.studentNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addToast("Enrollment confirmation downloaded!", "success");
  };

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sidebarOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [sidebarOpen]);

  // Check if mobile on resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [sidebarOpen]);

  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const studentData = {
    name: student?.firstName + " " + student?.lastName || "Hener C. Verdida",
    id: student?.studentNumber || "20221131",
    progrm: student?.programType || "SHS",
    strand: student?.program || "TVL - ICT",
    section: "IC2DA",
  };

  if (isLoading && !student) {
    return (
      <div className="s-portal">
        <div style={{ minHeight: "100vh" }}></div>
      </div>
    );
  }

  const assignedSubjects = [
    {
      code: "MTH122",
      title: "Statistics and Probability",
      semester: "First Semester",
    },
    {
      code: "CP1122",
      title: "Computer Programming 2 (Java NC II)",
      semester: "First Semester",
    },
    {
      code: "EAP122",
      title: "English for Academic and Professional Purposes",
      semester: "First Semester",
    },
    {
      code: "PEH122",
      title: "Physical Education and Health 2",
      semester: "First Semester",
    },
  ];

  return (
    <div className="s-portal">
      {/* Toast Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div ref={sidebarRef}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={handleSidebarClose}
          activePage="enrollment"
          onLogout={handleLogout}
        />
      </div>

      {sidebarOpen && (
        <div className="s-overlay" onClick={handleSidebarClose}></div>
      )}

      <div className="s-main">
        <Header
          title="Enrollment"
          onMenuClick={handleMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />

        <main className="s-content">
          {/* Welcome Banner */}
          <div className="s-welcome-banner">
            <h1>Enrollment</h1>
          </div>

          {/* Enrollment Eligibility & Student Information Row */}
          <div className="s-enrollment-row">
            {/* Enrollment Eligibility Card */}
            <div className="s-enrollment-card s-eligibility-card">
              <h3>Enrollment Eligibility</h3>
              <div className="s-eligibility-item">
                <span className="s-eligibility-label">
                  Grade 11 Completion Status:
                </span>
                <span
                  className={`s-eligibility-value ${eligibilityStatus.grade11Completed ? "s-status-completed" : "s-status-pending"}`}
                >
                  {eligibilityStatus.grade11Completed
                    ? "Completed"
                    : "Not Completed"}
                </span>
              </div>
              <div className="s-eligibility-item">
                <span className="s-eligibility-label">Academic Year:</span>
                <span className="s-eligibility-value">
                  {eligibilityStatus.academicYear}
                </span>
              </div>
              <div className="s-eligibility-item">
                <span className="s-eligibility-label">
                  Eligibility for Grade 12:
                </span>
                <span
                  className={`s-eligibility-value ${eligibilityStatus.passed ? "s-status-completed" : "s-status-pending"}`}
                >
                  {eligibilityStatus.passed ? "Passed" : "Not Eligible"}
                </span>
              </div>
              <div className="s-eligibility-item">
                <span className="s-eligibility-label">Strand:</span>
                <span className="s-eligibility-value">
                  {eligibilityStatus.strand}
                </span>
              </div>
            </div>

            {/* Student Information Card */}
            <div className="s-enrollment-card s-student-info-card">
              <h3>Student Information</h3>
              <div className="s-student-info-item">
                <span className="s-info-label">Student Number:</span>
                <span className="s-info-value">{studentData.id}</span>
              </div>
              <div className="s-student-info-item">
                <span className="s-info-label">Student Name:</span>
                <span className="s-info-value">{studentData.name}</span>
              </div>
              <div className="s-student-info-item">
                <span className="s-info-label">Year & Section:</span>
                <span className="s-info-value">{studentData.section}</span>
              </div>
              <div className="s-student-info-item">
                <span className="s-info-label">Strand:</span>
                <span className="s-info-value">{studentData.strand}</span>
              </div>
            </div>
          </div>

          {/* Note Card */}
          <div className="s-note-card">
            <div className="s-note-icon">
              <IoDocumentText />
            </div>
            <div className="s-note-content">
              <p>
                The clearance may be downloaded through the system; however,
                students are still required to personally visit the school to
                obtain the necessary physical signatures from authorized
                personnel. The downloaded clearance is not considered valid
                without complete signatures.
              </p>
            </div>
          </div>

          {/* Requirements Upload Section */}
          <div className="s-requirements-section">
            <h3>Enrollment & Requirements</h3>
            <div className="s-requirements-grid">
              <div className="s-requirement-item">
                <span className="s-requirement-label">
                  Grade 11 Certificate of Grades
                </span>
                <div className="s-requirement-actions">
                  {uploadedFiles["grade11_certificate"] && (
                    <span className="s-file-name">
                      📎 {uploadedFiles["grade11_certificate"].name}
                    </span>
                  )}
                  <button
                    className="s-upload-btn"
                    onClick={() => handleFileUpload("grade11_certificate")}
                    disabled={uploadingId === "grade11_certificate"}
                  >
                    {uploadingId === "grade11_certificate" ? (
                      <FaSpinner className="s-spin" />
                    ) : (
                      <MdFileUpload />
                    )}
                    {uploadingId === "grade11_certificate"
                      ? " Uploading..."
                      : " Upload"}
                  </button>
                </div>
              </div>
              <div className="s-requirement-item">
                <span className="s-requirement-label">Clearance</span>
                <div className="s-requirement-actions">
                  <button
                    className="s-download-btn-small"
                    onClick={handleDownloadClearance}
                  >
                    <MdDownload /> Download
                  </button>
                  {uploadedFiles["clearance"] && (
                    <span className="s-file-name">
                      📎 {uploadedFiles["clearance"].name}
                    </span>
                  )}
                  <button
                    className="s-upload-btn"
                    onClick={() => handleFileUpload("clearance")}
                    disabled={uploadingId === "clearance"}
                  >
                    {uploadingId === "clearance" ? (
                      <FaSpinner className="s-spin" />
                    ) : (
                      <MdFileUpload />
                    )}
                    {uploadingId === "clearance" ? " Uploading..." : " Upload"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Assigned Subjects Table */}
          <div className="s-subjects-section">
            <h3>Assigned Subjects (Grade 12)</h3>
            <div className="s-table-wrapper">
              <table className="s-enrollment-table">
                <thead>
                  <tr>
                    <th>Subject Code</th>
                    <th>Subject Title</th>
                    <th>Semester</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedSubjects.map((subject, index) => (
                    <tr key={index}>
                      <td className="s-subject-code">{subject.code}</td>
                      <td className="s-subject-title">{subject.title}</td>
                      <td className="s-subject-semester">{subject.semester}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Note Card for Approval */}
          <div className="s-note-card s-warning-note">
            <div className="s-note-icon">
              <FaCheckCircle />
            </div>
            <div className="s-note-content">
              <p>
                The pending approval status ensures that enrollment is validated
                by the registrar before granting academic access, preventing
                errors and unauthorized enrollment.
              </p>
              <p className="s-notice-text">
                Notice: Pending Approval - Cannot Download Enrollment
                Confirmation
              </p>
            </div>
          </div>

          {/* Enrollment Status Table */}
          <div className="s-status-section">
            <h3>Enrollment Status</h3>
            <div className="s-table-wrapper">
              <table className="s-enrollment-table">
                <thead>
                  <tr>
                    <th>Enrollment Date</th>
                    <th>Semester</th>
                    <th>Grade Level</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{enrollmentStatus.enrollmentDate}</td>
                    <td>{enrollmentStatus.semester}</td>
                    <td>Grade 12</td>
                    <td>
                      <span
                        className={`s-status-badge ${enrollmentStatus.status === "Approved" ? "s-status-approved" : "s-status-pending"}`}
                      >
                        {enrollmentStatus.status}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="s-enrollment-actions">
            <button className="s-enroll-btn" onClick={handleEnroll}>
              Enroll
            </button>
            <button
              className="s-download-confirmation-btn"
              onClick={handleDownloadConfirmation}
              disabled={enrollmentStatus.status !== "Approved"}
            >
              <MdDownload /> Download Enrollment Confirmation
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

export default StudentEnrollment;
