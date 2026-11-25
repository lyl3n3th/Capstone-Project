import { useState, useRef, useEffect } from "react";
import {
  FaMapMarkerAlt,
  FaEnvelope,
  FaEdit,
  FaSave,
  FaTimes,
} from "react-icons/fa";
import { IoPersonSharp } from "react-icons/io5";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import StudentLoadingShell from "../../components/common/StudentLoadingShell";
import { useStudent } from "../../hooks/useStudent";
import type { Student } from "../../types/student";
import {
  getStudentCredentialOverview,
} from "../../services/adminStorage";
import {
  getAdmissionDiscountSource,
  getAdmissionDiscountSourceLabel,
  getEffectiveAdmissionDiscountPercentage,
} from "../../services/admission";
import {
  buildStudentBalanceSummary,
  STUDENT_PAYMENTS_UPDATED_EVENT,
} from "../../services/studentPayments";
import { getStudentBillingSummary } from "../../services/studentBilling";
import "../../styles/main.css";
import { ToastContainer } from "../../components/common/Toast"; // Import Toast components
import {
  formatContactNumber,
  getContactNumberDigits,
} from "../../utils/contactNumber";

// Custom hook for toast management
const useToast = () => {
  const toastCounterRef = useRef(0);
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
    toastCounterRef.current += 1;
    const id = `student-profile-toast-${toastCounterRef.current}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto remove after 3 seconds
    setTimeout(() => {
      removeToast(id);
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return { toasts, addToast, removeToast };
};

function StudentProfile() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    student,
    subjects,
    currentTerm,
    isLoading,
    error,
    updateStudent,
  } = useStudent();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Student>>({});
  const [isSaving, setIsSaving] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { toasts, addToast, removeToast } = useToast(); // Initialize toast hook
  const [paymentRecordsVersion, setPaymentRecordsVersion] = useState(0);

  useEffect(() => {
    const handleStudentPaymentsUpdated = () => {
      setPaymentRecordsVersion((previousValue) => previousValue + 1);
    };

    window.addEventListener(
      STUDENT_PAYMENTS_UPDATED_EVENT,
      handleStudentPaymentsUpdated,
    );

    return () => {
      window.removeEventListener(
        STUDENT_PAYMENTS_UPDATED_EVENT,
        handleStudentPaymentsUpdated,
      );
    };
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [sidebarOpen]);

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
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [sidebarOpen]);

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

  const handleEdit = () => {
    setEditForm({
      ...(student || {}),
      contactNumber: formatContactNumber(student?.contactNumber),
      guardianContact: formatContactNumber(student?.guardianContact),
    });
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditForm(student || {});
    addToast("Edit cancelled", "info");
  };

  const handleSaveEdit = async () => {
    const contactNumbers = [editForm.contactNumber, editForm.guardianContact];
    if (
      contactNumbers.some(
        (contactNumber) =>
          contactNumber && getContactNumberDigits(contactNumber).length !== 11,
      )
    ) {
      addToast("Contact numbers must contain exactly 11 digits.", "error");
      return;
    }

    setIsSaving(true);
    try {
      await updateStudent({
        ...editForm,
        contactNumber: getContactNumberDigits(editForm.contactNumber),
        guardianContact: getContactNumberDigits(editForm.guardianContact),
      });
      setEditing(false);
      addToast("Profile updated successfully!", "success");
    } catch {
      addToast("Failed to update profile", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  // Get current date for header
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  // Prepare student data for header
  const studentData = {
    name: student ? `${student.firstName} ${student.lastName}` : "Loading...",
    id: student?.studentNumber || "",
    progrm: student?.programType || "",
  };
  const currentAcademicYear =
    currentTerm?.academicYear ||
    subjects[0]?.academicYear ||
    student?.ownScheduleAcademicYear ||
    "2026-2027";
  const currentSemester =
    currentTerm?.semester ||
    subjects[0]?.semester ||
    student?.ownScheduleSemester ||
    "1st Semester";
  const currentTermSubjects = subjects.filter(
    (subject) =>
      subject.academicYear === currentAcademicYear &&
      subject.semester === currentSemester,
  );
  const tuitionPerUnit = 600;
  const balanceFormatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });
  const credentialOverview = student
    ? getStudentCredentialOverview(student)
    : null;
  const honorCertificateApproved = Boolean(
    credentialOverview?.items.some(
      (item) =>
        item.name.trim().toLowerCase() === "honor certificate" &&
        item.reviewStatus === "Approved",
    ),
  );
  const effectiveDiscountPercentage = getEffectiveAdmissionDiscountPercentage({
    honorLabel: credentialOverview?.applicantRecord.honorLabel || "No Honor",
    honorCertificateApproved,
    appliedForScholarship: Boolean(
      credentialOverview?.applicantRecord.appliedForScholarship ||
        typeof credentialOverview?.applicantRecord.scholarshipExamScore ===
          "number",
    ),
    scholarshipExamScore:
      credentialOverview?.applicantRecord.scholarshipExamScore ?? null,
  });
  const effectiveDiscountSourceLabel = getAdmissionDiscountSourceLabel(
    getAdmissionDiscountSource({
      honorLabel: credentialOverview?.applicantRecord.honorLabel || "No Honor",
      honorCertificateApproved,
      appliedForScholarship: Boolean(
        credentialOverview?.applicantRecord.appliedForScholarship ||
          typeof credentialOverview?.applicantRecord.scholarshipExamScore ===
            "number",
      ),
      scholarshipExamScore:
        credentialOverview?.applicantRecord.scholarshipExamScore ?? null,
    }),
  );
  void paymentRecordsVersion;
  const studentBalanceSummary = student
    ? getStudentBillingSummary({
        student,
        subjects,
        academicYear: currentAcademicYear,
        semester: currentSemester,
      })
    : {
        ...buildStudentBalanceSummary({ totalAssessment: 0, payments: [] }),
        totalUnits: 0,
      };

  // Show nothing while loading the first time
  if (isLoading && !student) {
    return (
      <StudentLoadingShell
        activePage="profile"
        currentDate={currentDate}
        headerTitle="My Profile"
        onLogout={handleLogout}
        onMenuClick={handleMenuClick}
        onSidebarClose={handleSidebarClose}
        portalClassName="s-profile"
        skeletonTitle="Profile"
        studentData={studentData}
        variant="form"
        sidebarOpen={sidebarOpen}
      />
    );
  }

  if (error) {
    return (
      <div className="s-portal s-profile">
        <div className="s-error-container">
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="s-portal s-profile">
        <div className="s-error-container">No profile data found</div>
      </div>
    );
  }

  return (
    <div className="s-portal s-profile">
      {/* Toast Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Sidebar Component */}
      <div ref={sidebarRef}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={handleSidebarClose}
          activePage="profile"
          onLogout={handleLogout}
        />
      </div>

      {/* Overlay for mobile when sidebar is open */}
      {sidebarOpen && (
        <div className="s-overlay" onClick={handleSidebarClose}></div>
      )}

      {/* Main Content */}
      <div className="s-main">
        <Header
          title="My Profile"
          onMenuClick={handleMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />

        <main className="s-profile-content">
          {student.programType !== "SHS" && (
            <div className="s-card s-home-balance s-profile-balance">
              <div className="s-card-header1">
                <h3>Balance Overview</h3>
              </div>
              <div className="s-balance-content">
                <div className="s-balance-amount">
                  {studentBalanceSummary.totalAssessment > 0
                    ? balanceFormatter.format(studentBalanceSummary.currentBalance)
                    : "Pending Assessment"}
                </div>
                <p>
                  {currentTermSubjects.length > 0
                    ? `${currentTermSubjects.length} official subject(s) loaded for ${currentSemester}.`
                    : "No official subject load has been posted yet."}
                </p>
                <p>
                  {balanceFormatter.format(studentBalanceSummary.totalPaid)} paid
                  of {balanceFormatter.format(studentBalanceSummary.totalAssessment)}
                </p>
                <p>
                  {studentBalanceSummary.totalUnits} unit(s) at{" "}
                  {balanceFormatter.format(tuitionPerUnit)} per unit
                </p>
                {effectiveDiscountPercentage > 0 ? (
                  <p>
                    {effectiveDiscountPercentage}% {effectiveDiscountSourceLabel}{" "}
                    applied
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {/* Edit Mode Controls */}
          {editing && (
            <div className="s-edit-actions">
              <button
                className="s-save-btn"
                onClick={handleSaveEdit}
                disabled={isSaving}
              >
                <FaSave /> {isSaving ? "Saving..." : "Save Changes"}
              </button>
              <button className="s-cancel-btn" onClick={handleCancelEdit}>
                <FaTimes /> Cancel
              </button>
            </div>
          )}

          {/* Personal Information Section */}
          <div className="s-profile-section">
            <div className="s-profile-section-heading">
              <h2 className="s-section-title-with-icon">
                <IoPersonSharp /> Personal Information
              </h2>
              {!editing && (
                <button type="button" className="s-edit-btn" onClick={handleEdit}>
                  <FaEdit /> Edit Profile
                </button>
              )}
            </div>
            <div className="s-profile-grid">
              <div className="s-profile-field">
                <label>First Name:</label>
                {editing ? (
                  <input
                    type="text"
                    value={editForm.firstName || ""}
                    onChange={(e) =>
                      handleInputChange("firstName", e.target.value)
                    }
                  />
                ) : (
                  <span>{student.firstName}</span>
                )}
              </div>
              <div className="s-profile-field">
                <label>Middle Name:</label>
                {editing ? (
                  <input
                    type="text"
                    value={editForm.middleName || ""}
                    onChange={(e) =>
                      handleInputChange("middleName", e.target.value)
                    }
                  />
                ) : (
                  <span>{student.middleName || "-"}</span>
                )}
              </div>
              <div className="s-profile-field">
                <label>Last Name:</label>
                {editing ? (
                  <input
                    type="text"
                    value={editForm.lastName || ""}
                    onChange={(e) =>
                      handleInputChange("lastName", e.target.value)
                    }
                  />
                ) : (
                  <span>{student.lastName}</span>
                )}
              </div>
              <div className="s-profile-field">
                <label>Sex:</label>
                {editing ? (
                  <select
                    value={editForm.gender || ""}
                    onChange={(e) =>
                      handleInputChange("gender", e.target.value)
                    }
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                ) : (
                  <span>{student.gender}</span>
                )}
              </div>
              <div className="s-profile-field">
                <label>Civil Status:</label>
                {editing ? (
                  <input
                    type="text"
                    value={editForm.civilStatus || ""}
                    onChange={(e) =>
                      handleInputChange("civilStatus", e.target.value)
                    }
                  />
                ) : (
                  <span>{student.civilStatus || "Single"}</span>
                )}
              </div>
            </div>
          </div>

          {/* Address Section */}
          <div className="s-profile-section">
            <h2 className="s-section-title-with-icon">
              <FaMapMarkerAlt /> Address
            </h2>
            <div className="s-profile-grid">
              <div className="s-profile-field s-full-width">
                <label>Complete Address:</label>
                {editing ? (
                  <textarea
                    rows={3}
                    value={editForm.address || ""}
                    onChange={(e) =>
                      handleInputChange("address", e.target.value)
                    }
                    placeholder="Enter your complete address"
                  />
                ) : (
                  <span>{student.address || "-"}</span>
                )}
              </div>
            </div>
          </div>

          {/* Contact Information Section */}
          <div className="s-profile-section">
            <h2 className="s-section-title-with-icon">
              <FaEnvelope /> Contact Info
            </h2>
            <div className="s-profile-grid">
              <div className="s-profile-field">
                <label>Email:</label>
                {editing ? (
                  <input
                    type="email"
                    value={editForm.email || ""}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                  />
                ) : (
                  <span>{student.email}</span>
                )}
              </div>
              <div className="s-profile-field">
                <label>Mobile #:</label>
                {editing ? (
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={13}
                    value={editForm.contactNumber || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "contactNumber",
                        formatContactNumber(e.target.value),
                      )
                    }
                  />
                ) : (
                  <span>{formatContactNumber(student.contactNumber)}</span>
                )}
              </div>
              <div className="s-profile-field">
                <label>Guardian Name:</label>
                {editing ? (
                  <input
                    type="text"
                    value={editForm.guardianName || ""}
                    onChange={(e) =>
                      handleInputChange("guardianName", e.target.value)
                    }
                  />
                ) : (
                  <span>{student.guardianName || "-"}</span>
                )}
              </div>
              <div className="s-profile-field">
                <label>Guardian Contact:</label>
                {editing ? (
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={13}
                    value={editForm.guardianContact || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "guardianContact",
                        formatContactNumber(e.target.value),
                      )
                    }
                  />
                ) : (
                  <span>{formatContactNumber(student.guardianContact) || "-"}</span>
                )}
              </div>
            </div>
          </div>

          <div className="s-profile-section">
            <h2 className="s-section-title-with-icon">
              <IoPersonSharp /> Academic Record
            </h2>
            <div className="s-profile-grid">
              <div className="s-profile-field">
                <label>Student Number:</label>
                <span>{student.studentNumber}</span>
              </div>
              <div className="s-profile-field">
                <label>Section:</label>
                <span>{student.section || "TBA"}</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default StudentProfile;
