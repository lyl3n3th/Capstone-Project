import React, { useState, useEffect, useMemo } from "react";
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
import {
  fetchInboxReports,
  fetchTrashReports,
  moveReportToTrash,
  permanentlyDeleteReport,
  restoreReport,
  type ReportRecord,
} from "../../services/reportApi";
import "../../styles/manager/area-managerReports.css";

const REVIEWED_REPORTS_STORAGE_KEY = "am-reviewed-report-ids";

interface Report {
  id: string;
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

const getFileNameFromUrl = (url?: string) => {
  if (!url) {
    return "";
  }

  const path = url.split("?")[0];
  const parts = path.split("/");
  return decodeURIComponent(parts[parts.length - 1] || "");
};

const mapApiReport = (report: ReportRecord): Report => ({
  id: report.id,
  user: report.sender_name,
  branch: report.branch_name,
  time: report.created_at,
  title: report.subject,
  text: report.message,
  file_url: report.attachment_url || undefined,
  file_name: getFileNameFromUrl(report.attachment_url) || undefined,
});

const readReviewedReportIds = () => {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const rawValue = window.localStorage.getItem(REVIEWED_REPORTS_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return Array.from(
      new Set(
        parsedValue.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        ),
      ),
    );
  } catch (error) {
    console.error("Failed to read reviewed report ids", error);
    return [];
  }
};

// Helper: format any date/time string → MM/DD/YYYY
const formatDateTime = (value: string): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const suffix = hours >= 12 ? "PM" : "AM";
    const twelveHour = hours % 12 || 12;
    return `${mm}/${dd}/${yyyy} ${twelveHour}:${minutes} ${suffix}`;
  }
  return "â€”";
};

const AreaManagerReports: React.FC<ReportsPageProps> = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [trash, setTrash] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [reviewedIds, setReviewedIds] = useState<string[]>(readReviewedReportIds);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
    try {
      const [inboxReports, trashReports] = await Promise.all([
        fetchInboxReports(),
        fetchTrashReports(),
      ]);
      const nextReports = inboxReports.map(mapApiReport);
      const nextTrash = trashReports.map(mapApiReport);

      setReports(nextReports);
      setTrash(nextTrash);
      setSelectedReport((current) => {
        if (!current) {
          return nextReports[0] || null;
        }

        return (
          nextReports.find((report) => report.id === current.id) ||
          nextTrash.find((report) => report.id === current.id) ||
          null
        );
      });
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      REVIEWED_REPORTS_STORAGE_KEY,
      JSON.stringify(reviewedIds),
    );
  }, [reviewedIds]);

  const filteredReports = useMemo(() => {
    return reports.filter(
      (r) =>
        r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.user.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [reports, searchTerm]);

  const pendingReviewCount = useMemo(
    () => reports.filter((report) => !reviewedIds.includes(report.id)).length,
    [reports, reviewedIds],
  );

  const reviewedCount = useMemo(
    () => reports.filter((report) => reviewedIds.includes(report.id)).length,
    [reports, reviewedIds],
  );

  const reportStatusRows = useMemo(() => {
    return [...filteredReports].sort((firstReport, secondReport) => {
      const firstIsReviewed = reviewedIds.includes(firstReport.id);
      const secondIsReviewed = reviewedIds.includes(secondReport.id);

      if (firstIsReviewed !== secondIsReviewed) {
        return firstIsReviewed ? 1 : -1;
      }

      return (
        new Date(secondReport.time).getTime() -
        new Date(firstReport.time).getTime()
      );
    });
  }, [filteredReports, reviewedIds]);

  const selectedReportIsReviewed = selectedReport
    ? reviewedIds.includes(selectedReport.id)
    : false;

  const handleSelectReport = (report: Report) => {
    setSelectedReport(report);
    setShowDetail(true);
  };

  const handleToggleReviewStatus = (reportId: string) => {
    setReviewedIds((currentIds) =>
      currentIds.includes(reportId)
        ? currentIds.filter((currentId) => currentId !== reportId)
        : [...currentIds, reportId],
    );
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

  const toggleSelectOne = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleMoveToTrash = async (ids: string[]) => {
    const message =
      ids.length === 1
        ? "Move this report to trash?"
        : `Move ${ids.length} reports to trash?`;
    if (!window.confirm(message)) {
      return;
    }

    try {
      await Promise.all(ids.map((id) => moveReportToTrash(id)));
      await fetchReports();
      setSelectedIds([]);
      if (selectedReport && ids.includes(selectedReport.id)) {
        setShowDetail(false);
      }
      addToast(`Moved ${ids.length} report(s) to trash`, "success");
    } catch (error) {
      console.error("Failed to move reports to trash", error);
      addToast("Failed to move report(s) to trash", "error");
    }
  };

  const handleRestoreFromTrash = async (id: string) => {
    if (!window.confirm("Restore this report to your inbox?")) {
      return;
    }

    try {
      await restoreReport(id);
      await fetchReports();
      addToast("Report restored successfully", "success");
    } catch (error) {
      console.error("Failed to restore report", error);
      addToast("Failed to restore report", "error");
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (
      window.confirm(
        "This action cannot be undone. Permanently delete this report?",
      )
    ) {
      try {
        await permanentlyDeleteReport(id);
        await fetchReports();
        setReviewedIds((currentIds) =>
          currentIds.filter((currentId) => currentId !== id),
        );
        if (selectedReport?.id === id) {
          setSelectedReport(null);
          setShowDetail(false);
        }
        addToast("Report permanently deleted", "success");
      } catch (e) {
        console.error("Failed to permanently delete report", e);
        addToast("Failed to delete from server", "error");
      }
    }
  };

  const handleEmptyTrash = async () => {
    if (
      window.confirm(
        "Are you sure you want to permanently delete all items in trash?",
      )
    ) {
      try {
        const trashIds = trash.map((item) => item.id);
        await Promise.all(trash.map((item) => permanentlyDeleteReport(item.id)));
        await fetchReports();
        setReviewedIds((currentIds) =>
          currentIds.filter((currentId) => !trashIds.includes(currentId)),
        );
        if (selectedReport && trash.some((item) => item.id === selectedReport.id)) {
          setSelectedReport(null);
          setShowDetail(false);
        }
        addToast("Trash emptied successfully", "success");
      } catch (error) {
        console.error("Failed to empty trash", error);
        addToast("Failed to empty trash", "error");
      }
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
                Inbox: {reports.length} | Pending Review: {pendingReviewCount}
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

        <div className="am-reports-main-grid">
          <aside className="am-reports-status-pane">
            <div className="am-reports-status-card">
              <div className="am-reports-status-header">
                <div>
                  <h3>Review Status Table</h3>
                  <p>
                    Track which inbox reports are still pending review and
                    which ones have already been reviewed.
                  </p>
                </div>
              </div>

              <div className="am-reports-status-summary">
                <div className="am-reports-status-stat pending">
                  <span className="am-reports-status-stat-label">
                    Pending Review
                  </span>
                  <strong>{pendingReviewCount}</strong>
                </div>
                <div className="am-reports-status-stat reviewed">
                  <span className="am-reports-status-stat-label">Reviewed</span>
                  <strong>{reviewedCount}</strong>
                </div>
              </div>

              <div className="am-reports-status-table-wrapper">
                <table className="am-reports-status-table">
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportStatusRows.length > 0 ? (
                      reportStatusRows.map((report) => {
                        const isReviewed = reviewedIds.includes(report.id);

                        return (
                          <tr
                            key={report.id}
                            className={
                              selectedReport?.id === report.id
                                ? "active"
                                : undefined
                            }
                            onClick={() => handleSelectReport(report)}
                          >
                            <td>
                              <div className="am-reports-status-report">
                                <strong>{report.title}</strong>
                                <span>
                                  {report.user} | {report.branch}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span
                                className={`am-reports-status-badge ${isReviewed ? "reviewed" : "pending"}`}
                              >
                                {isReviewed ? "Reviewed" : "Pending"}
                              </span>
                            </td>
                            <td>
                              <span className="am-reports-status-date">
                                {formatDateTime(report.time)}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={3}>
                          <div className="am-reports-status-empty">
                            No reports match the current search.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </aside>

          <div className="am-reports-split-view">
            <div className="am-reports-list-pane">
              <div className="am-reports-list-search-container">
                <div className="am-reports-search-bar">
                  <BsSearch className="am-reports-search-icon" />
                  <input
                    type="text"
                    placeholder="Search reports..."
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
                          <span className="am-reports-sender">
                            {report.user}
                          </span>
                          <span className="am-reports-time">
                            {formatDateTime(report.time)}
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
                    <div className="am-reports-detail-actions">
                      <button
                        className={`am-reports-review-toggle-btn ${selectedReportIsReviewed ? "is-reviewed" : "is-pending"}`}
                        onClick={() =>
                          handleToggleReviewStatus(selectedReport.id)
                        }
                      >
                        {selectedReportIsReviewed
                          ? "Mark as Pending"
                          : "Mark as Reviewed"}
                      </button>
                      <button
                        className="am-reports-detail-delete-btn"
                        onClick={() => handleMoveToTrash([selectedReport.id])}
                      >
                        <BsTrash3 />
                      </button>
                    </div>
                  </div>
                  <div className="am-reports-info-bar">
                    <div className="am-reports-info-chip">
                      <strong>From:</strong> {selectedReport.user}
                    </div>
                    <div className="am-reports-info-chip">
                      <strong>Branch:</strong> {selectedReport.branch}
                    </div>
                    <div className="am-reports-info-chip">
                      <strong>Date:</strong> {formatDateTime(selectedReport.time)}
                    </div>
                    <div
                      className={`am-reports-info-chip am-reports-info-chip-status ${selectedReportIsReviewed ? "reviewed" : "pending"}`}
                    >
                      <strong>Status:</strong>{" "}
                      {selectedReportIsReviewed
                        ? "Reviewed"
                        : "Pending Review"}
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
                          if (selectedReport.file_url) {
                            window.open(
                              selectedReport.file_url,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }
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
                                {formatDateTime(item.time)}
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
