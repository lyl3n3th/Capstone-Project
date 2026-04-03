import { useState } from "react";
import { FaPaperPlane, FaTrash, FaPaperclip } from "react-icons/fa";
import { ToastContainer } from "../../components/common/Toast";
import AdminSidebar from "../../components/admin/AdminSidebar";
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
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

export default function AdminReports({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: ReportProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [formData, setFormData] = useState<ReportFormData>({
    subject: "",
    message: "",
    attachmentName: "",
  });

  // Toast functions
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
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFormData((prev) => ({
      ...prev,
      attachmentName: file ? file.name : "",
    }));
  };

  const handleClear = () => {
    setFormData({
      subject: "",
      message: "",
      attachmentName: "",
    });

    const fileInput = document.getElementById(
      "report-file",
    ) as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.subject.trim() || !formData.message.trim()) {
      addToast("Please fill in the subject and message fields.", "error");
      return;
    }

    addToast("Report submitted successfully!", "success");

    handleClear();
  };

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
        {isSidebarOpen ? "✕" : "☰"}
      </button>

      {/* Main content */}
      <main className="report-content">
        <header className="page-header">
          <h1>System Reports</h1>
          <p>Generate and view summary reports of school data.</p>
        </header>

        {/* Report Form */}
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
              <button type="submit" className="send-btn">
                <FaPaperPlane /> Send Report
              </button>
              <button type="button" className="clear-btn" onClick={handleClear}>
                <FaTrash /> Clear
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
