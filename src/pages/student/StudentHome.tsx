import { IoPersonSharp } from "react-icons/io5";
import { FaCalendarAlt } from "react-icons/fa";
import { MdFormatListBulleted } from "react-icons/md";
import { useState, useEffect, useRef } from "react";
import { IoDocumentText } from "react-icons/io5";
import { MdFileUpload, MdRefresh } from "react-icons/md";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import { useStudent } from "../../hooks/useStudent";
import { syncStudentCredentialUpload } from "../../services/adminStorage";
import { uploadAdmissionRequirementFile } from "../../services/admission";
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

function StudentHome() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const {
    student,
    subjects,
    credentialItems,
    credentialSummary,
    isLoading,
    refreshStudent,
  } = useStudent();
  const { toasts, addToast, removeToast } = useToast();
  const [selectedCredentialFiles, setSelectedCredentialFiles] = useState<
    Record<string, File>
  >({});
  const [isSubmittingCredentials, setIsSubmittingCredentials] = useState(false);
  const [selectingCredentialCode, setSelectingCredentialCode] = useState<
    string | null
  >(null);

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
      setSelectedCredentialFiles((prev) => ({
        ...prev,
        [requirementCode]: file,
      }));
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
        const file = selectedCredentialFiles[item.code];
        if (!file) {
          continue;
        }

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
      if (window.innerWidth > 768 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (window.innerWidth > 768) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;

    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [sidebarOpen]);

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

  const currentAcademicYear = subjects[0]?.academicYear || "2026-2027";
  const currentSemester = subjects[0]?.semester || "1st Semester";
  const pendingUploadCount = credentialItems.filter(
    (item) => selectedCredentialFiles[item.code],
  ).length;

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

    if (statusLabel === "Needs Reupload" || statusLabel === "Pending Submission") {
      return "warning";
    }

    return "pending";
  };

  const canUploadCredential = (statusLabel: string) =>
    statusLabel === "Pending Submission" || statusLabel === "Needs Reupload";

  if (isLoading) {
    return (
      <div className="s-portal">
        <div style={{ minHeight: "100vh" }}></div>
      </div>
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
          onMenuClick={handleMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />

        <main className="s-content">
          <div className="s-welcome-banner">
            <h1>Dashboard</h1>
          </div>

          <div className="s-dashboard-grid">
            <div className="s-groupc">
              <div className="s-card">
                <div className="s-card-header">
                  <div className="s-box-icon">
                    <FaCalendarAlt />
                  </div>
                  <h3>Current Academic Year</h3>
                </div>
                <div className="s-card-value">{currentAcademicYear}</div>
              </div>

              <div className="s-card g2">
                <div className="s-card-header">
                  <div className="s-box-icon">
                    <MdFormatListBulleted />
                  </div>
                  <h3>Current Semester</h3>
                </div>
                <div className="s-card-value">{currentSemester}</div>
              </div>

              <div className="s-card g2">
                <div className="s-card-header">
                  <div className="s-box-icon">
                    <IoPersonSharp />
                  </div>
                  <h3>Credential Status</h3>
                </div>
                <div className="s-card-value">
                  {credentialSummary?.overallStatus || student?.status || "Regular"}
                </div>
              </div>
            </div>

            <div className="s-card">
              <div className="s-card-header1">
                <h3>
                  {student
                    ? `${student.firstName} ${student.lastName}`
                    : "Student"}
                </h3>
                <span className="s-str-p">{student?.program || "Program TBA"}</span>
              </div>
              <div className="s-card-value1">Student Number:</div>
              <div className="s-card-label1">
                {student?.studentNumber || "20221131"}
              </div>
              <div className="s-card-value1">Section:</div>
              <div className="s-card-label1">{student?.section || "TBA"}</div>
              <div className="s-card-value1">Email:</div>
              <div className="s-card-label1">
                {student?.email || "student@aics.edu.ph"}
              </div>
            </div>

            <div className="s-card">
              <div className="s-card-header1">
                <h3>News & Announcement</h3>
              </div>
              <div className="s-news-content">
                <p>No new announcements</p>
              </div>
            </div>
          </div>

          <div className="s-credential-header">
            <div className="s-icon-ac">
              <div className="s-co">
                <IoDocumentText />
              </div>
              <h2 className="s-section-title">Credential Status</h2>
            </div>
            <button
              className="s-submit-docs-btn"
              onClick={() => void handleRefreshCredentials()}
            >
              <MdRefresh /> Refresh Status
            </button>
          </div>

          {credentialSummary && (
            <div className="s-note-card">
              <div className="s-note-content">
                <p>
                  {credentialSummary.submitted}/{credentialSummary.total} admission
                  credentials submitted. {credentialSummary.pending} still pending.
                </p>
                {pendingUploadCount > 0 && (
                  <p>{pendingUploadCount} credential file(s) ready to submit.</p>
                )}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: "16px",
            }}
          >
            <button
              className="s-submit-docs-btn"
              onClick={() => void handleSubmitCredentials()}
              disabled={isSubmittingCredentials || pendingUploadCount === 0}
            >
              <MdFileUpload />{" "}
              {isSubmittingCredentials ? "Submitting..." : "Submit Credentials"}
            </button>
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
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer">
                          View submitted file
                        </a>
                      ) : selectedCredentialFiles[item.code] ? (
                        <span className="s-file-name">
                          Ready to submit: {selectedCredentialFiles[item.code].name}
                        </span>
                      ) : (
                        <span className="s-file-name">
                          {item.isSubmitted
                            ? "Submitted record is on file"
                            : "No uploaded file yet"}
                        </span>
                      )}
                    </div>
                    {canUploadCredential(item.statusLabel) && (
                      <div style={{ marginTop: "8px" }}>
                        <button
                          type="button"
                          className="s-submit-docs-btn"
                          style={{ padding: "8px 14px", fontSize: "13px" }}
                          onClick={() => handleSelectCredentialFile(item.code)}
                          disabled={
                            isSubmittingCredentials ||
                            selectingCredentialCode === item.code
                          }
                        >
                          <MdFileUpload />{" "}
                          {selectingCredentialCode === item.code
                            ? "Choosing..."
                            : item.statusLabel === "Needs Reupload"
                              ? "Replace File"
                              : "Choose File"}
                        </button>
                      </div>
                    )}
                  </div>
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
        </main>
      </div>
    </div>
  );
}

export default StudentHome;
