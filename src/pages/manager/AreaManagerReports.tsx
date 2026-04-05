import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  BsEnvelopePaperFill,
  BsTrash3,
  BsFileEarmarkPdf,
  BsSearch,
  BsCheckSquareFill,
  BsSquare,
  BsArrowLeft,
  BsArrowCounterclockwise,
  BsX,
} from "react-icons/bs";
import { MdOutlineMarkEmailUnread, MdDeleteSweep } from "react-icons/md";
import { ToastContainer } from "../../components/common/Toast";
import "../../styles/manager/area-managerReports.css";

interface Report {
  id: number;
  user: string;
  branch: string;
  time: string;
  title: string;
  text: string;
  file_url?: string;
  file_name?: string;
}

interface ReportsPageProps {
  onLogout?: () => void;
  loggedInUsername?: string;
  loggedInRole?: "Admin" | "Registrar" | "Area Manager";
  canAccessBackup?: boolean;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

// Mock reports with "Kenneth Pogi" as the text content
const MOCK_REPORTS: Report[] = [
  // Payroll Reports
  {
    id: 1,
    user: "Kenneth Lyle Sohot",
    branch: "Taytay Branch",
    time: new Date().toISOString(),
    title: "March 2025 Payroll Summary Report",
    text: "Kenneth Pogi",
    file_name: "march_2025_payroll_summary.pdf",
  },
  {
    id: 2,
    user: "Neil John Velasco",
    branch: "Bacoor Branch",
    time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    title: "February 2025 Payroll Report",
    text: "Kenneth Pogi",
    file_name: "feb_2025_payroll_bacoor.pdf",
  },
  {
    id: 3,
    user: "Hener Verdida",
    branch: "GMA Branch",
    time: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    title: "Q1 2025 Payroll Audit Report",
    text: "Kenneth Pogi",
    file_name: "q1_2025_payroll_audit.pdf",
  },

  // Marketing Reports
  {
    id: 4,
    user: "Kenneth Lyle Sohot",
    branch: "Taytay Branch",
    time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    title: "Digital Marketing Campaign Performance - March 2025",
    text: "Kenneth Pogi",
    file_name: "digital_marketing_march_2025.pdf",
  },
  {
    id: 5,
    user: "Neil John Velasco",
    branch: "Bacoor Branch",
    time: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    title: "Social Media Engagement Report Q1 2025",
    text: "Kenneth Pogi",
    file_name: "social_media_q1_2025.pdf",
  },
  {
    id: 6,
    user: "Hener Verdida",
    branch: "GMA Branch",
    time: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    title: "Marketing Budget Utilization Report",
    text: "Kenneth Pogi",
    file_name: "marketing_budget_2025.pdf",
  },

  // Enrollment Reports
  {
    id: 7,
    user: "Kenneth Lyle Sohot",
    branch: "Taytay Branch",
    time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    title: "First Semester Enrollment Summary 2025",
    text: "Kenneth Pogi",
    file_name: "enrollment_summary_2025.pdf",
  },
  {
    id: 8,
    user: "Neil John Velasco",
    branch: "Bacoor Branch",
    time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    title: "New Student Registration Report",
    text: "Kenneth Pogi",
    file_name: "new_students_registration.pdf",
  },
  {
    id: 9,
    user: "Hener Verdida",
    branch: "GMA Branch",
    time: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    title: "Enrollment Projections for 2nd Semester",
    text: "Kenneth Pogi",
    file_name: "enrollment_projections.pdf",
  },
];

// Mock trash data
const MOCK_TRASH: Report[] = [
  {
    id: 101,
    user: "Kenneth Lyle Sohot",
    branch: "Taytay Branch",
    time: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    title: "Old Payroll Report - December 2024",
    text: "Kenneth Pogi",
    file_name: "old_payroll_dec2024.pdf",
  },
  {
    id: 102,
    user: "Neil John Velasco",
    branch: "Bacoor Branch",
    time: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    title: "Old Marketing Report - Q4 2024",
    text: "Kenneth Pogi",
    file_name: "old_marketing_q4_2024.pdf",
  },
];

const USE_MOCK_DATA = true;

// Helper: format any date/time string → MM/DD/YYYY
const formatDate = (value: string): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const yyyy = today.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};

const AreaManagerReports: React.FC<ReportsPageProps> = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [trash, setTrash] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  const fetchReports = async () => {
    if (USE_MOCK_DATA) {
      setTimeout(() => {
        setReports(MOCK_REPORTS);
        setTrash(MOCK_TRASH);
        setLoading(false);
      }, 500);
      return;
    }

    try {
      const res = await axios.get("http://127.0.0.1:8000/api/dashboard-stats/");
      setReports(res.data.reports || []);
    } catch (e) {
      console.error(e);
      addToast("Failed to load reports", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const filteredReports = useMemo(() => {
    return reports.filter(
      (r) =>
        r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.user.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [reports, searchTerm]);

  const handleSelectReport = (report: Report) => {
    setSelectedReport(report);
    setShowDetail(true);
  };

  const toggleSelectAll = () => {
    if (
      selectedIds.length === filteredReports.length &&
      filteredReports.length > 0
    ) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredReports.map((r) => r.id));
    }
  };

  const toggleSelectOne = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleMoveToTrash = (ids: number[]) => {
    const message =
      ids.length === 1
        ? "Move this report to trash?"
        : `Move ${ids.length} reports to trash?`;
    if (window.confirm(message)) {
      const itemsToMove = reports.filter((r) => ids.includes(r.id));
      setTrash((prev) => [...prev, ...itemsToMove]);
      setReports((prev) => prev.filter((r) => !ids.includes(r.id)));
      setSelectedIds([]);
      if (selectedReport && ids.includes(selectedReport.id)) {
        setSelectedReport(null);
        setShowDetail(false);
      }
      addToast(`Moved ${ids.length} report(s) to trash`, "success");
    }
  };

  const handleRestoreFromTrash = (id: number) => {
    if (window.confirm("Restore this report to your inbox?")) {
      const item = trash.find((r) => r.id === id);
      if (item) {
        setReports((prev) => [item, ...prev]);
        setTrash((prev) => prev.filter((r) => r.id !== id));
        addToast("Report restored successfully", "success");
      }
    }
  };

  const handlePermanentDelete = async (id: number) => {
    if (
      window.confirm(
        "This action cannot be undone. Permanently delete this report?",
      )
    ) {
      if (USE_MOCK_DATA) {
        setTrash((prev) => prev.filter((r) => r.id !== id));
        addToast("Report permanently deleted", "success");
      } else {
        try {
          await axios.delete(`http://127.0.0.1:8000/api/delete-report/${id}/`);
          setTrash((prev) => prev.filter((r) => r.id !== id));
          addToast("Report permanently deleted", "success");
        } catch (e) {
          addToast("Failed to delete from server", "error");
        }
      }
    }
  };

  const handleEmptyTrash = () => {
    if (
      window.confirm(
        "Are you sure you want to permanently delete all items in trash?",
      )
    ) {
      setTrash([]);
      addToast("Trash emptied successfully", "success");
    }
  };

  if (loading) {
    return <div className="am-reports-loading">Loading Reports...</div>;
  }

  return (
    <div className="am-reports-wrapper">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div
        className={`am-reports-container ${showDetail ? "detail-open" : ""}`}
      >
        <header className="am-reports-header">
          <div className="am-reports-header-left">
            {showDetail && (
              <button
                className="am-reports-mobile-back-btn"
                onClick={() => setShowDetail(false)}
              >
                <BsArrowLeft />
              </button>
            )}
            <div className="am-reports-title-group">
              <h2>
                <BsEnvelopePaperFill className="am-reports-title-icon" />{" "}
                Reports
              </h2>
              <span className="am-reports-msg-count">
                Inbox: {reports.length}
              </span>
            </div>
          </div>
          <div
            className={`am-reports-header-right ${showDetail ? "hidden-on-mobile" : ""}`}
          >
            <button
              className="am-reports-trash-toggle-btn"
              onClick={() => setShowTrashModal(true)}
            >
              <BsTrash3 /> Trash ({trash.length})
            </button>
          </div>
        </header>

        <div className="am-reports-split-view">
          <div className="am-reports-list-pane">
            <div className="am-reports-list-search-container">
              <div className="am-reports-search-bar">
                <BsSearch className="am-reports-search-icon" />
                <input
                  type="text"
                  placeholder="Search inbox..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="am-reports-list-controls">
                <button
                  className="am-reports-select-all-btn"
                  onClick={toggleSelectAll}
                >
                  {selectedIds.length === filteredReports.length &&
                  filteredReports.length > 0 ? (
                    <BsCheckSquareFill className="am-reports-chk-active" />
                  ) : (
                    <BsSquare className="am-reports-chk-inactive" />
                  )}
                  <span>Select All</span>
                </button>
                {selectedIds.length > 0 && (
                  <button
                    className="am-reports-mass-del-btn"
                    onClick={() => handleMoveToTrash(selectedIds)}
                  >
                    <BsTrash3 /> Move to Trash ({selectedIds.length})
                  </button>
                )}
              </div>
            </div>

            <div className="am-reports-scroll-list">
              {filteredReports.length > 0 ? (
                filteredReports.map((report) => (
                  <div
                    key={report.id}
                    className={`am-reports-card-item ${selectedReport?.id === report.id ? "active" : ""}`}
                    onClick={() => handleSelectReport(report)}
                  >
                    <div
                      className="am-reports-selection-overlay"
                      onClick={(e) => toggleSelectOne(e, report.id)}
                    >
                      {selectedIds.includes(report.id) ? (
                        <BsCheckSquareFill className="am-reports-chk-active" />
                      ) : (
                        <BsSquare className="am-reports-chk-inactive" />
                      )}
                    </div>
                    <div className="am-reports-card-body">
                      <div className="am-reports-card-top">
                        <span className="am-reports-sender">{report.user}</span>
                        <span className="am-reports-time">
                          {formatDate(report.time)}
                        </span>
                      </div>
                      <div className="am-reports-card-title">
                        {report.title}
                      </div>
                      <div className="am-reports-card-branch">
                        {report.branch}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="am-reports-empty-state">
                  <BsEnvelopePaperFill size={48} />
                  <p>No reports found</p>
                </div>
              )}
            </div>
          </div>

          <div className="am-reports-detail-pane">
            {selectedReport ? (
              <div className="am-reports-full-content">
                <div className="am-reports-detail-header">
                  <h1 className="am-reports-detail-title">
                    {selectedReport.title}
                  </h1>
                  <button
                    className="am-reports-detail-delete-btn"
                    onClick={() => handleMoveToTrash([selectedReport.id])}
                  >
                    <BsTrash3 />
                  </button>
                </div>
                <div className="am-reports-info-bar">
                  <div className="am-reports-info-chip">
                    <strong>From:</strong> {selectedReport.user}
                  </div>
                  <div className="am-reports-info-chip">
                    <strong>Branch:</strong> {selectedReport.branch}
                  </div>
                  <div className="am-reports-info-chip">
                    <strong>Date:</strong> {formatDate(selectedReport.time)}
                  </div>
                </div>
                <div className="am-reports-text-body">
                  {selectedReport.text}
                </div>
                {selectedReport.file_name && (
                  <div className="am-reports-attachment-box">
                    <div className="am-reports-file-info">
                      <BsFileEarmarkPdf className="am-reports-pdf-icon" />
                      <div className="am-reports-file-text-group">
                        <p className="am-reports-file-name">
                          {selectedReport.file_name}
                        </p>
                        <p className="am-reports-file-type">PDF Document</p>
                      </div>
                    </div>
                    <button
                      className="am-reports-download-btn"
                      onClick={() => {
                        addToast("Download started", "success");
                      }}
                    >
                      Download
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="am-reports-select-prompt">
                <MdOutlineMarkEmailUnread
                  size={80}
                  className="am-reports-prompt-icon"
                />
                <h3>Select a Message</h3>
                <p>Choose a report from the list to view its contents.</p>
              </div>
            )}
          </div>
        </div>

        {/* Trash Modal */}
        {showTrashModal && (
          <div
            className="am-reports-modal-overlay"
            onClick={() => setShowTrashModal(false)}
          >
            <div
              className="am-reports-trash-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="am-reports-modal-header">
                <div className="am-reports-modal-title">
                  <BsTrash3 className="am-reports-modal-icon" />
                  <h3>Trash Bin</h3>
                </div>
                <div className="am-reports-modal-actions">
                  <button
                    className="am-reports-modal-close"
                    onClick={() => setShowTrashModal(false)}
                  >
                    <BsX size={22} />
                  </button>
                </div>
              </div>

              <div className="am-reports-modal-body">
                <div className="am-reports-trash-summary">
                  <p>
                    Currently showing <strong>{trash.length}</strong> deleted{" "}
                    {trash.length === 1 ? "report" : "reports"}
                  </p>
                  {trash.length > 0 && (
                    <button
                      className="am-reports-empty-trash-btn"
                      onClick={handleEmptyTrash}
                    >
                      <MdDeleteSweep size={16} /> Empty Trash
                    </button>
                  )}
                </div>

                {trash.length === 0 ? (
                  <div className="am-reports-trash-empty">
                    <BsTrash3 size={50} />
                    <p>Your trash is empty</p>
                  </div>
                ) : (
                  <div className="am-reports-trash-table-wrapper">
                    <table className="am-reports-trash-table">
                      <thead>
                        <tr>
                          <th>Report Title</th>
                          <th className="col-sender">Sender</th>
                          <th className="col-branch">Branch</th>
                          <th className="col-date">Date Sent</th>
                          <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trash.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <span className="am-reports-trash-title">
                                {item.title}
                              </span>
                            </td>
                            <td className="col-sender">{item.user}</td>
                            <td className="col-branch">
                              <span className="am-reports-trash-branch-badge">
                                {item.branch}
                              </span>
                            </td>
                            <td className="col-date">
                              <span className="am-reports-trash-date">
                                {formatDate(item.time)}
                              </span>
                            </td>
                            <td>
                              <div className="am-reports-trash-actions">
                                <button
                                  className="am-reports-restore-btn"
                                  onClick={() =>
                                    handleRestoreFromTrash(item.id)
                                  }
                                >
                                  <BsArrowCounterclockwise />
                                  <span className="btn-label">Restore</span>
                                </button>
                                <button
                                  className="am-reports-perm-delete-btn"
                                  onClick={() => handlePermanentDelete(item.id)}
                                >
                                  <BsTrash3 />
                                  <span className="btn-label">Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AreaManagerReports;
