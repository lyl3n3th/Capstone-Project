import { useMemo, useState } from "react";
import { FaPaperPlane, FaTrash, FaPaperclip } from "react-icons/fa";
import { FiMenu, FiX } from "react-icons/fi";
import { BsPaperclip, BsX } from "react-icons/bs";
import { ToastContainer } from "../../components/common/Toast";
import AdminSidebar from "../../components/admin/AdminSidebar";
import { useAuth } from "../../hooks/useAuth";
import {
  createReport,
  fetchSentReports,
  type ReportRecord,
} from "../../services/reportApi";
import "../../styles/admin/admin-reports.css";

interface ReportProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface ReportFormData {
  subject: string;
  message: string;
  attachmentName: string;
  attachmentFile: File | null;
}

interface SentReportItem {
  id: string;
  senderName: string;
  branchName: string;
  subject: string;
  message: string;
  attachmentUrl?: string;
  attachmentName?: string;
  isReviewed: boolean;
  reviewedAt: string | null;
  createdAt: string;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const getFileNameFromUrl = (url?: string) => {
  if (!url) {
    return "";
  }

  const path = url.split("?")[0];
  const parts = path.split("/");
  return decodeURIComponent(parts[parts.length - 1] || "");
};

const mapApiReport = (report: ReportRecord): SentReportItem => ({
  id: report.id,
  senderName: report.sender_name,
  branchName: report.branch_name,
  subject: report.subject,
  message: report.message,
  attachmentUrl: report.attachment_url || undefined,
  attachmentName: getFileNameFromUrl(report.attachment_url) || undefined,
  isReviewed: report.is_reviewed,
  reviewedAt: report.reviewed_at,
  createdAt: report.created_at,
});

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "Not yet reviewed";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  const year = parsed.getFullYear();
  const hours = parsed.getHours();
  const minutes = `${parsed.getMinutes()}`.padStart(2, "0");
  const meridiem = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${month}/${day}/${year} ${displayHour}:${minutes} ${meridiem}`;
};

export default function AdminReports({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: ReportProps) {
  const { currentUser } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSentReportsModalOpen, setIsSentReportsModalOpen] = useState(false);
  const [isLoadingSentReports, setIsLoadingSentReports] = useState(false);
  const [sentReports, setSentReports] = useState<SentReportItem[]>([]);
  const [formData, setFormData] = useState<ReportFormData>({
    subject: "",
    message: "",
    attachmentName: "",
    attachmentFile: null,
  });

  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const handleSidebarToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFormData((prev) => ({
      ...prev,
      attachmentName: file ? file.name : "",
      attachmentFile: file || null,
    }));
  };

  const handleClear = () => {
    setFormData({
      subject: "",
      message: "",
      attachmentName: "",
      attachmentFile: null,
    });

    const fileInput = document.getElementById(
      "report-file",
    ) as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const loadSentReports = async () => {
    try {
      setIsLoadingSentReports(true);
      const records = await fetchSentReports();
      setSentReports(records.map(mapApiReport));
    } catch (error) {
      console.error("Failed to load sent reports", error);
      addToast(
        error instanceof Error ? error.message : "Failed to load sent reports.",
        "error",
      );
    } finally {
      setIsLoadingSentReports(false);
    }
  };

  const handleOpenSentReportsModal = () => {
    setIsSentReportsModalOpen(true);
    void loadSentReports();
  };

  const handleCloseSentReportsModal = () => {
    setIsSentReportsModalOpen(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.subject.trim() || !formData.message.trim()) {
      addToast("Please fill in the subject and message fields.", "error");
      return;
    }

    if (!currentUser?.branch) {
      addToast("Unable to determine the logged-in branch.", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      const createdReport = await createReport({
        branch: currentUser.branch,
        subject: formData.subject.trim(),
        message: formData.message.trim(),
        attachment: formData.attachmentFile,
      });
      setSentReports((prev) => [mapApiReport(createdReport), ...prev]);
      addToast("Report submitted successfully!", "success");
      handleClear();
    } catch (error) {
      console.error("Failed to submit report", error);
      addToast(
        error instanceof Error ? error.message : "Failed to submit report.",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const pendingReviewCount = useMemo(
    () => sentReports.filter((report) => !report.isReviewed).length,
    [sentReports],
  );

  const reviewedCount = sentReports.length - pendingReviewCount;

  const sortedSentReports = useMemo(
    () =>
      [...sentReports].sort((left, right) => {
        if (left.isReviewed !== right.isReviewed) {
          return left.isReviewed ? 1 : -1;
        }

        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }),
    [sentReports],
  );

  return (
    <div className="dashboard-layout">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <AdminSidebar
        isOpen={isSidebarOpen}
        onClose={handleSidebarClose}
        onLogout={onLogout}
        loggedInUsername={loggedInUsername}
        loggedInRole={loggedInRole}
        canAccessBackup={canAccessBackup}
      />

      <button
        className="menu-toggle"
        onClick={handleSidebarToggle}
        aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
      >
        {isSidebarOpen ? <FiX /> : <FiMenu />}
      </button>

      <main className="report-content">
        <header className="page-header report-page-header">
          <div>
            <h1>System Reports</h1>
            <p>Generate and send branch reports, then track their review status.</p>
          </div>
          <button
            type="button"
            className="report-secondary-btn"
            onClick={handleOpenSentReportsModal}
          >
            Sent Reports
          </button>
        </header>

        <div className="report-form-card">
          <div className="report-form-header">
            <h3>Send Report</h3>
            <p>Prepare and send a report with optional file attachments.</p>
          </div>

          <form className="report-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="subject">
                Subject<span className="required">*</span>
              </label>
              <input
                id="subject"
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                placeholder="Enter report subject"
              />
            </div>

            <div className="form-group">
              <label htmlFor="message">
                Message<span className="required">*</span>
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                placeholder="Write your report message here"
                rows={8}
              />
            </div>

            <div className="form-group">
              <label htmlFor="report-file">Attachments</label>

              <label htmlFor="report-file" className="file-upload-box">
                <span className="upload-icon">
                  <FaPaperclip />
                </span>
                <span className="upload-title">
                  {formData.attachmentName
                    ? formData.attachmentName
                    : "Choose Files"}
                </span>
                <span className="upload-subtext">
                  Upload documents, spreadsheets, or images
                </span>
              </label>

              <input
                id="report-file"
                type="file"
                className="file-input"
                onChange={handleFileChange}
              />
            </div>

            <div className="report-form-actions">
              <button type="submit" className="send-btn" disabled={isSubmitting}>
                <FaPaperPlane />
                {isSubmitting ? "Sending Report..." : "Send Report"}
              </button>
              <button type="button" className="clear-btn" onClick={handleClear}>
                <FaTrash /> Clear
              </button>
            </div>
          </form>
        </div>
      </main>

      {isSentReportsModalOpen ? (
        <div className="report-modal-overlay" onClick={handleCloseSentReportsModal}>
          <div
            className="report-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="report-modal-header">
              <div>
                <h2>Sent Reports</h2>
                <p>Track which reports are still pending review from the area manager.</p>
              </div>
              <button
                type="button"
                className="report-modal-close"
                onClick={handleCloseSentReportsModal}
                aria-label="Close sent reports"
              >
                <BsX />
              </button>
            </div>

            <div className="report-modal-body">
              <div className="report-modal-summary">
                <div className="report-modal-stat">
                  <span>Total Sent</span>
                  <strong>{sentReports.length}</strong>
                </div>
                <div className="report-modal-stat pending">
                  <span>Pending Review</span>
                  <strong>{pendingReviewCount}</strong>
                </div>
                <div className="report-modal-stat reviewed">
                  <span>Reviewed</span>
                  <strong>{reviewedCount}</strong>
                </div>
              </div>

              <div className="report-modal-table-wrapper">
                <table className="report-status-table">
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Status</th>
                      <th>Sent</th>
                      <th>Reviewed</th>
                      <th>Attachment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingSentReports ? (
                      <tr>
                        <td colSpan={5} className="report-status-empty">
                          Loading sent reports...
                        </td>
                      </tr>
                    ) : sortedSentReports.length > 0 ? (
                      sortedSentReports.map((report) => (
                        <tr key={report.id}>
                          <td>
                            <div className="report-status-report-cell">
                              <strong>{report.subject}</strong>
                              <span>
                                {report.senderName} | {report.branchName}
                              </span>
                              <p>{report.message}</p>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`report-status-badge ${report.isReviewed ? "reviewed" : "pending"}`}
                            >
                              {report.isReviewed ? "Reviewed" : "Pending Review"}
                            </span>
                          </td>
                          <td>{formatDateTime(report.createdAt)}</td>
                          <td>{formatDateTime(report.reviewedAt)}</td>
                          <td>
                            {report.attachmentUrl ? (
                              <button
                                type="button"
                                className="report-attachment-link"
                                onClick={() =>
                                  window.open(
                                    report.attachmentUrl,
                                    "_blank",
                                    "noopener,noreferrer",
                                  )
                                }
                              >
                                <BsPaperclip />
                                {report.attachmentName || "Open file"}
                              </button>
                            ) : (
                              <span className="report-no-attachment">No file</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="report-status-empty">
                          No reports have been sent yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
