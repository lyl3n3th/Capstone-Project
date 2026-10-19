import { FaEye } from "react-icons/fa";
import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { IoDocumentText } from "react-icons/io5";
import { MdCameraAlt, MdFileUpload, MdRefresh } from "react-icons/md";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import StudentLoadingShell from "../../components/common/StudentLoadingShell";
import StudentHomeSkeleton from "../../components/common/StudentHomeSkeleton";
import { useStudent } from "../../hooks/useStudent";
import { useAuth } from "../../hooks/useAuth";
import { useStoredProfileImage } from "../../hooks/useStoredProfileImage";
import {
  getStudentCredentialOverview,
  syncStudentCredentialUpload,
} from "../../services/adminStorage";
import {
  getAdmissionDiscountSource,
  getAdmissionDiscountSourceLabel,
  getEffectiveAdmissionDiscountPercentage,
  uploadAdmissionRequirementFile,
} from "../../services/admission";
import {
  buildStudentBalanceSummary,
  STUDENT_PAYMENTS_UPDATED_EVENT,
} from "../../services/studentPayments";
import { getStudentBillingSummary } from "../../services/studentBilling";
import "../../styles/main.css";
import { ToastContainer } from "../../components/common/Toast";

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
    const id = `student-home-toast-${toastCounterRef.current}`;
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

type SelectedCredentialFile = {
  file: File;
  previewUrl: string;
};

function StudentHome() {
  const { currentUser } = useAuth();
  const { profileImage, updateProfileImage } = useStoredProfileImage(currentUser);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const profilePictureRef = useRef<HTMLDivElement>(null);
  const profilePictureButtonRef = useRef<HTMLButtonElement>(null);
  const changePictureButtonRef = useRef<HTMLButtonElement>(null);
  const [showPictureMenu, setShowPictureMenu] = useState(false);
  const [isUpdatingPicture, setIsUpdatingPicture] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const {
    student,
    subjects,
    currentTerm,
    credentialItems,
    isLoading,
    refreshStudent,
  } = useStudent();
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    if (!showPictureMenu) return;

    changePictureButtonRef.current?.focus();
    const handleOutside = (event: Event) => {
      if (!profilePictureRef.current?.contains(event.target as Node)) {
        setShowPictureMenu(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowPictureMenu(false);
        profilePictureButtonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("focusin", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("focusin", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showPictureMenu]);

  const handleProfileImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setIsUpdatingPicture(true);
    try {
      await updateProfileImage(file);
      addToast("Profile picture updated.", "success");
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Unable to update profile picture.",
        "error",
      );
    } finally {
      setIsUpdatingPicture(false);
      input.value = "";
    }
  };
  const [selectedCredentialFiles, setSelectedCredentialFiles] = useState<
    Record<string, SelectedCredentialFile>
  >({});
  const selectedCredentialFilesRef = useRef<Record<string, SelectedCredentialFile>>(
    {},
  );
  const [isSubmittingCredentials, setIsSubmittingCredentials] = useState(false);
  const [selectingCredentialCode, setSelectingCredentialCode] = useState<
    string | null
  >(null);
  const [paymentRecordsVersion, setPaymentRecordsVersion] = useState(0);

  const handleMenuClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  const handleRefreshCredentials = async () => {
    await refreshStudent();
    addToast("Credential status refreshed.", "success");
  };

  const handleSelectCredentialFile = (requirementCode: string) => {
    const item = credentialItems.find(
      (credentialItem) => credentialItem.code === requirementCode,
    );

    if (!item) {
      addToast("Credential item not found.", "error");
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";

    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        return;
      }

      setSelectingCredentialCode(requirementCode);
      const previewUrl = URL.createObjectURL(file);
      setSelectedCredentialFiles((prev) => {
        const previousPreviewUrl = prev[requirementCode]?.previewUrl;

        if (previousPreviewUrl) {
          URL.revokeObjectURL(previousPreviewUrl);
        }

        return {
          ...prev,
          [requirementCode]: {
            file,
            previewUrl,
          },
        };
      });
      addToast(`${item.name} selected: ${file.name}`, "info");
      setSelectingCredentialCode(null);
    };

    input.click();
  };

  const handleSubmitCredentials = async () => {
    if (!student?.trackingNumber) {
      addToast(
        "This student account is not yet linked to an admission tracking number.",
        "warning",
      );
      return;
    }

    const stagedItems = credentialItems.filter(
      (item) => selectedCredentialFiles[item.code],
    );

    if (stagedItems.length === 0) {
      addToast(
        "Choose at least one pending credential before submitting.",
        "warning",
      );
      return;
    }

    try {
      setIsSubmittingCredentials(true);

      for (const item of stagedItems) {
        const selectedFile = selectedCredentialFiles[item.code];
        if (!selectedFile) {
          continue;
        }
        const file = selectedFile.file;

        const uploadResult = await uploadAdmissionRequirementFile({
          trackingNumber: student.trackingNumber,
          requirementCode: item.code,
          requirementName: item.name,
          file,
        });

        await syncStudentCredentialUpload({
          branch: student.branch,
          trackingNumber: student.trackingNumber,
          studentNumber: student.studentNumber,
          requirementName: item.name,
          mimeType: file.type,
          storagePath: uploadResult.storagePath,
        });
      }

      Object.values(selectedCredentialFiles).forEach((entry) => {
        URL.revokeObjectURL(entry.previewUrl);
      });
      setSelectedCredentialFiles({});
      await refreshStudent();
      addToast("Credential files submitted successfully.", "success");
    } catch (error) {
      console.error("Failed to submit credential files", error);
      addToast(
        error instanceof Error
          ? error.message
          : "Unable to submit credential files right now.",
        "error",
      );
    } finally {
      setIsSubmittingCredentials(false);
      setSelectingCredentialCode(null);
    }
  };

  useEffect(() => {
    selectedCredentialFilesRef.current = selectedCredentialFiles;
  }, [selectedCredentialFiles]);

  useEffect(() => {
    return () => {
      Object.values(selectedCredentialFilesRef.current).forEach((entry) => {
        URL.revokeObjectURL(entry.previewUrl);
      });
    };
  }, []);

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

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [sidebarOpen]);

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

  const handleLogout = () => {
    console.log("Logging out...");
    addToast("Logging out...", "info");
  };

  // Get current date
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
  const courseName = student?.program.replace(
    /^[A-Za-z][A-Za-z0-9]*(?=\s*[-–—])/,
    (acronym) => acronym.toUpperCase(),
  );

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
  const pendingUploadCount = credentialItems.filter(
    (item) => selectedCredentialFiles[item.code],
  ).length;
  const credentialOverview = student
    ? getStudentCredentialOverview({
        branch: student.branch,
        studentNumber: student.studentNumber,
        trackingNumber: student.trackingNumber,
      })
    : null;
  const honorCertificateApproved = Boolean(
    credentialOverview?.items.some(
      (item) =>
        item.name.trim().toLowerCase() === "honor certificate" &&
        item.reviewStatus === "Approved",
      ),
  );
  const tuitionPerUnit = 600;
  const balanceFormatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });
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
    ? getStudentBillingSummary({ student, subjects, academicYear: currentAcademicYear, semester: currentSemester })
    : { ...buildStudentBalanceSummary({ totalAssessment: 0, payments: [] }), totalUnits: 0 };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "pending":
        return "s-status-pending";
      case "completed":
        return "s-status-completed";
      case "warning":
        return "s-status-warning";
      default:
        return "";
    }
  };

  const getCredentialVisualStatus = (statusLabel: string) => {
    if (statusLabel === "Approved") {
      return "completed";
    }

    if (statusLabel === "Needs Reupload") {
      return "warning";
    }

    return "pending";
  };

  const canUploadCredential = (statusLabel: string) =>
    statusLabel === "Pending Submission" || statusLabel === "Needs Reupload";

  if (isLoading) {
    return (
      <StudentLoadingShell
        activePage="home"
        portalClassName="s-home"
        currentDate={currentDate}
        headerTitle="Dashboard"
        onLogout={handleLogout}
        onMenuClick={handleMenuClick}
        onSidebarClose={handleSidebarClose}
        skeletonTitle="Home"
        studentData={studentData}
        variant="dashboard"
        sidebarOpen={sidebarOpen}
      >
        <StudentHomeSkeleton />
      </StudentLoadingShell>
    );
  }

  return (
    <div className="s-portal s-home">
      {/* Toast Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div ref={sidebarRef}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={handleSidebarClose}
          activePage="home"
          onLogout={handleLogout}
        />
      </div>

      {sidebarOpen && (
        <div className="s-overlay" onClick={handleSidebarClose}></div>
      )}

      <div className="s-main">
        <Header
          title="Dashboard"
          showTitle
          onMenuClick={handleMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />

        <main className="s-content">
          {student && (
            <div className="s-profile-header-card">
              <div className="s-home-picture-wrapper" ref={profilePictureRef}>
              <button
                type="button"
                className="s-profile-avatar-large s-profile-picture-button"
                ref={profilePictureButtonRef}
                onClick={() => setShowPictureMenu((previous) => !previous)}
                aria-label="Change profile picture"
                aria-expanded={showPictureMenu}
                aria-controls={showPictureMenu ? "home-picture-menu" : undefined}
                disabled={isUpdatingPicture}
              >
                {profileImage ? (
                  <img src={profileImage} alt={`${student.firstName} ${student.lastName}`} />
                ) : (
                  `${student.firstName?.charAt(0) || ""}${student.lastName?.charAt(0) || ""}`
                )}
              </button>
              {showPictureMenu && (
                <div id="home-picture-menu" className="s-profile-menu s-home-picture-menu">
                  <button
                    type="button"
                    className="s-profile-action"
                    ref={changePictureButtonRef}
                    onClick={() => {
                      setShowPictureMenu(false);
                      profilePictureButtonRef.current?.focus();
                      profileImageInputRef.current?.click();
                    }}
                  >
                    <MdCameraAlt size={18} /> Change Picture
                  </button>
                </div>
              )}
              <input
                type="file"
                hidden
                ref={profileImageInputRef}
                accept="image/*"
                onChange={handleProfileImageChange}
              />
              </div>
              <div className="s-profile-header-info">
                <div className="s-profile-name-row">
                  <h1>{student.firstName} {student.lastName}</h1>
                </div>
                <div className="s-profile-badges">
                  <span className="s-badge">{student.studentNumber}</span>
                  <span className="s-badge">{student.yearLevel}</span>
                  <span className="s-badge s-badge-success">{student.status}</span>
                </div>
                <p className="s-profile-track">{courseName}</p>
                <p className="s-profile-grade"><strong>Academic Year:</strong> {currentAcademicYear}</p>
                <p className="s-profile-grade"><strong>Semester:</strong> {currentSemester}</p>
              </div>
            </div>
          )}

          <div className="s-dashboard-grid s-home-overview-grid">
            <section className="s-home-credentials" aria-label="Credential uploading">
              <div className="s-credential-header">
                <div className="s-icon-ac">
                  <div className="s-co">
                    <IoDocumentText />
                  </div>
                  <h2 className="s-section-title">Credential Status</h2>
                </div>
                <div className="s-credential-header-actions">
                  <button
                    className="s-submit-docs-btn"
                    onClick={() => void handleRefreshCredentials()}
                  >
                    <MdRefresh /> Refresh Status
                  </button>
                  <button
                    className="s-submit-docs-btn"
                    onClick={() => void handleSubmitCredentials()}
                    disabled={isSubmittingCredentials || pendingUploadCount === 0}
                  >
                    <MdFileUpload />{" "}
                    {isSubmittingCredentials ? "Submitting..." : "Submit Credentials"}
                  </button>
                </div>
              </div>

              <div className="s-activity-list">
                {credentialItems.length > 0 ? (
                  credentialItems.map((item) => (
                    <div className="s-activity-item" key={item.code}>
                      <div className="s-activity-icon">
                        <IoDocumentText />
                      </div>
                      <div className="s-activity-details">
                        <div className="s-activity-title">{item.name}</div>
                        <div className="s-uploaded-file-info">
                          {selectedCredentialFiles[item.code] ? (
                            <span className="s-file-name">
                              Ready to submit:{" "}
                              {selectedCredentialFiles[item.code].file.name}
                            </span>
                          ) : item.url ? (
                            <span className="s-file-name">Document is ready to view</span>
                          ) : (
                            <span className="s-file-name">
                              {item.isSubmitted
                                ? "Submitted record is on file"
                                : "No uploaded file yet"}
                            </span>
                          )}
                        </div>
                      </div>
                      {(canUploadCredential(item.statusLabel) ||
                        selectedCredentialFiles[item.code]?.previewUrl ||
                        item.url) && (
                        <div className="s-activity-actions">
                          {canUploadCredential(item.statusLabel) && (
                            <button
                              type="button"
                              className="s-activity-action-btn"
                              onClick={() => handleSelectCredentialFile(item.code)}
                              disabled={
                                isSubmittingCredentials ||
                                selectingCredentialCode === item.code
                              }
                              title={
                                item.statusLabel === "Needs Reupload"
                                  ? "Replace file"
                                  : "Choose file"
                              }
                              aria-label={
                                item.statusLabel === "Needs Reupload"
                                  ? `Replace ${item.name}`
                                  : `Choose file for ${item.name}`
                              }
                            >
                              {selectingCredentialCode === item.code ? (
                                <span className="s-upload-spinner">
                                  <MdRefresh />
                                </span>
                              ) : (
                                <MdFileUpload />
                              )}
                            </button>
                          )}
                          {(selectedCredentialFiles[item.code]?.previewUrl || item.url) && (
                            <a
                              className="s-activity-action-btn s-activity-action-link"
                              href={selectedCredentialFiles[item.code]?.previewUrl || item.url}
                              target="_blank"
                              rel="noreferrer"
                              title={`View ${item.name}`}
                              aria-label={`View ${item.name}`}
                            >
                              <FaEye />
                            </a>
                          )}
                        </div>
                      )}
                      <span
                        className={`s-activity-status ${getStatusClass(getCredentialVisualStatus(item.statusLabel))}`}
                      >
                        {item.statusLabel}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="s-activity-item">
                    <div className="s-activity-icon">
                      <IoDocumentText />
                    </div>
                    <div className="s-activity-details">
                      <div className="s-activity-title">No linked credential record</div>
                      <div className="s-uploaded-file-info">
                        <span className="s-file-name">
                          Admissions requirement progress will appear here after approval.
                        </span>
                      </div>
                    </div>
                    <span className={`s-activity-status ${getStatusClass("pending")}`}>
                      Not Available
                    </span>
                  </div>
                )}
              </div>
            </section>
            <div className="s-card s-home-balance">
              <div className="s-card-header1">
                <h3>Balance Overview</h3>
              </div>
              <div className="s-balance-content">
                <div className="s-balance-amount">
                  {student?.programType !== "SHS" &&
                  studentBalanceSummary.totalAssessment > 0
                    ? balanceFormatter.format(studentBalanceSummary.currentBalance)
                    : "Pending Assessment"}
                </div>
                <p>
                  {currentTermSubjects.length > 0
                    ? `${currentTermSubjects.length} official subject(s) loaded for ${currentSemester}.`
                    : "No official subject load has been posted yet."}
                </p>
                {student?.programType !== "SHS" ? (
                  <>
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
                  </>
                ) : (
                  <p>
                    SHS billing will appear here after the final subject load is
                    confirmed.
                  </p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default StudentHome;
