import React, { useEffect, useMemo, useState } from "react";
import {
  BsArrowCounterclockwise,
  BsArrowLeft,
  BsCheckSquareFill,
  BsEnvelopePaperFill,
  BsFileEarmarkPdf,
  BsSearch,
  BsSquare,
  BsTrash3,
  BsX,
} from "react-icons/bs";
import { MdDeleteSweep, MdOutlineMarkEmailUnread } from "react-icons/md";
import { ToastContainer } from "../../components/common/Toast";
import {
  fetchInboxReports,
  fetchTrashReports,
  moveReportToTrash,
  permanentlyDeleteReport,
  restoreReport,
  updateReportReviewStatus,
  type ReportRecord,
} from "../../services/reportApi";
import "../../styles/manager/area-managerReports.css";

interface Report {
  id: string;
  user: string;
  branch: string;
  time: string;
  title: string;
  text: string;
  file_url?: string;
  file_name?: string;
  isReviewed: boolean;
  reviewedAt: string | null;
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

type ReportStatusFilter = "all" | "pending" | "reviewed";

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
  isReviewed: report.is_reviewed,
  reviewedAt: report.reviewed_at,
});

const formatDateTime = (value?: string | null): string => {
  if (!value) return "-";
  const dateValue = new Date(value);
  if (!Number.isNaN(dateValue.getTime())) {
    const mm = String(dateValue.getMonth() + 1).padStart(2, "0");
    const dd = String(dateValue.getDate()).padStart(2, "0");
    const yyyy = dateValue.getFullYear();
    const hours = dateValue.getHours();
    const minutes = String(dateValue.getMinutes()).padStart(2, "0");
    const suffix = hours >= 12 ? "PM" : "AM";
    const twelveHour = hours % 12 || 12;
    return `${mm}/${dd}/${yyyy} ${twelveHour}:${minutes} ${suffix}`;
  }
  return "-";
};

const updateMatchingReport = (items: Report[], updatedReport: Report) =>
  items.map((item) => (item.id === updatedReport.id ? updatedReport : item));

const AreaManagerReports: React.FC<ReportsPageProps> = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [trash, setTrash] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [isUpdatingReviewStatus, setIsUpdatingReviewStatus] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  const replaceReportInState = (updatedReport: Report) => {
    setReports((current) => updateMatchingReport(current, updatedReport));
    setTrash((current) => updateMatchingReport(current, updatedReport));
    setSelectedReport((current) =>
      current?.id === updatedReport.id ? updatedReport : current,
    );
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
    } catch (error) {
      console.error(error);
      addToast("Failed to load reports", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReports();
  }, []);

  const inboxCount = reports.length;

  const pendingReviewCount = useMemo(
    () => reports.filter((report) => !report.isReviewed).length,
    [reports],
  );

  const reviewedCount = inboxCount - pendingReviewCount;

  const filteredReports = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return reports.filter((report) => {
      const matchesSearch =
        !normalizedSearch ||
        report.title.toLowerCase().includes(normalizedSearch) ||
        report.user.toLowerCase().includes(normalizedSearch) ||
        report.branch.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "pending" && !report.isReviewed) ||
        (statusFilter === "reviewed" && report.isReviewed);

      return matchesSearch && matchesStatus;
    });
  }, [reports, searchTerm, statusFilter]);

  const displayedReports = useMemo(
    () =>
      [...filteredReports].sort((left, right) => {
        if (left.isReviewed !== right.isReviewed) {
          return left.isReviewed ? 1 : -1;
        }

        return new Date(right.time).getTime() - new Date(left.time).getTime();
      }),
    [filteredReports],
  );

  const selectedReportIsReviewed = selectedReport?.isReviewed ?? false;

  const handleSelectReport = (report: Report) => {
    setSelectedReport(report);
    setShowDetail(true);
  };

  const handleToggleReviewStatus = async (report: Report) => {
    try {
      setIsUpdatingReviewStatus(true);
      const updated = mapApiReport(
        await updateReportReviewStatus(report.id, !report.isReviewed),
      );
      replaceReportInState(updated);
      addToast(
        updated.isReviewed
          ? "Report marked as reviewed."
          : "Report returned to pending review.",
        "success",
      );
    } catch (error) {
      console.error("Failed to update review status", error);
      addToast("Failed to update review status", "error");
    } finally {
      setIsUpdatingReviewStatus(false);
    }
  };

  const toggleSelectAll = () => {
    if (
      selectedIds.length === filteredReports.length &&
      filteredReports.length > 0
    ) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredReports.map((report) => report.id));
    }
  };

  const toggleSelectOne = (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
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
        if (selectedReport?.id === id) {
          setSelectedReport(null);
          setShowDetail(false);
        }
        addToast("Report permanently deleted", "success");
      } catch (error) {
        console.error("Failed to permanently delete report", error);
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
        if (selectedReport && trashIds.includes(selectedReport.id)) {
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
            {showDetail ? (
              <button
                className="am-reports-mobile-back-btn"
                onClick={() => setShowDetail(false)}
              >
                <BsArrowLeft />
              </button>
            ) : null}
            <div className="am-reports-title-group">
              <h2>
                <BsEnvelopePaperFill className="am-reports-title-icon" />
                Reports
              </h2>
              <span className="am-reports-msg-count">
                Inbox: {inboxCount} | Pending Review: {pendingReviewCount}
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

        <section className="am-reports-summary-band">
          <button
            type="button"
            className={`am-reports-summary-card ${statusFilter === "all" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            <span className="am-reports-summary-label">Inbox</span>
            <strong>{inboxCount}</strong>
            <p>All active reports waiting in the inbox.</p>
          </button>
          <button
            type="button"
            className={`am-reports-summary-card pending ${statusFilter === "pending" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("pending")}
          >
            <span className="am-reports-summary-label">Pending Review</span>
            <strong>{pendingReviewCount}</strong>
            <p>Focus on reports that still need your review.</p>
          </button>
          <button
            type="button"
            className={`am-reports-summary-card reviewed ${statusFilter === "reviewed" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("reviewed")}
          >
            <span className="am-reports-summary-label">Reviewed</span>
            <strong>{reviewedCount}</strong>
            <p>Reports already checked and cleared by the manager.</p>
          </button>
        </section>

        <div className="am-reports-split-view am-reports-split-view-wide">
          <div className="am-reports-list-pane">
            <div className="am-reports-list-search-container">
              <div className="am-reports-search-bar">
                <BsSearch className="am-reports-search-icon" />
                <input
                  type="text"
                  placeholder="Search reports..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>

              <div className="am-reports-filter-row">
                <button
                  type="button"
                  className={`am-reports-filter-chip ${statusFilter === "all" ? "active" : ""}`}
                  onClick={() => setStatusFilter("all")}
                >
                  All ({inboxCount})
                </button>
                <button
                  type="button"
                  className={`am-reports-filter-chip pending ${statusFilter === "pending" ? "active" : ""}`}
                  onClick={() => setStatusFilter("pending")}
                >
                  Pending ({pendingReviewCount})
                </button>
                <button
                  type="button"
                  className={`am-reports-filter-chip reviewed ${statusFilter === "reviewed" ? "active" : ""}`}
                  onClick={() => setStatusFilter("reviewed")}
                >
                  Reviewed ({reviewedCount})
                </button>
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
                {selectedIds.length > 0 ? (
                  <button
                    className="am-reports-mass-del-btn"
                    onClick={() => handleMoveToTrash(selectedIds)}
                  >
                    <BsTrash3 /> Move to Trash ({selectedIds.length})
                  </button>
                ) : null}
              </div>
            </div>

            <div className="am-reports-scroll-list">
              {displayedReports.length > 0 ? (
                displayedReports.map((report) => (
                  <div
                    key={report.id}
                    className={`am-reports-card-item ${selectedReport?.id === report.id ? "active" : ""} ${report.isReviewed ? "is-reviewed" : "is-pending"}`}
                    onClick={() => handleSelectReport(report)}
                  >
                    <div
                      className="am-reports-selection-overlay"
                      onClick={(event) => toggleSelectOne(event, report.id)}
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
                          {formatDateTime(report.time)}
                        </span>
                      </div>
                      <div className="am-reports-card-title">{report.title}</div>
                      <div className="am-reports-card-meta">
                        <span className="am-reports-card-branch">
                          {report.branch}
                        </span>
                        <span
                          className={`am-reports-card-status ${report.isReviewed ? "reviewed" : "pending"}`}
                        >
                          {report.isReviewed ? "Reviewed" : "Pending Review"}
                        </span>
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
                      onClick={() => handleToggleReviewStatus(selectedReport)}
                      disabled={isUpdatingReviewStatus}
                    >
                      {isUpdatingReviewStatus
                        ? "Updating..."
                        : selectedReportIsReviewed
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
                    {selectedReportIsReviewed ? "Reviewed" : "Pending Review"}
                  </div>
                  <div className="am-reports-info-chip">
                    <strong>Reviewed At:</strong>{" "}
                    {selectedReport.reviewedAt
                      ? formatDateTime(selectedReport.reviewedAt)
                      : "Not yet reviewed"}
                  </div>
                </div>
                <div className="am-reports-text-body">{selectedReport.text}</div>
                {selectedReport.file_name ? (
                  <div className="am-reports-attachment-box">
                    <div className="am-reports-file-info">
                      <BsFileEarmarkPdf className="am-reports-pdf-icon" />
                      <div className="am-reports-file-text-group">
                        <p className="am-reports-file-name">
                          {selectedReport.file_name}
                        </p>
                        <p className="am-reports-file-type">Attached report file</p>
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
                ) : null}
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

        {showTrashModal ? (
          <div
            className="am-reports-modal-overlay"
            onClick={() => setShowTrashModal(false)}
          >
            <div
              className="am-reports-trash-modal"
              onClick={(event) => event.stopPropagation()}
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
                  {trash.length > 0 ? (
                    <button
                      className="am-reports-empty-trash-btn"
                      onClick={handleEmptyTrash}
                    >
                      <MdDeleteSweep size={16} /> Empty Trash
                    </button>
                  ) : null}
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
                                  onClick={() => handleRestoreFromTrash(item.id)}
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
        ) : null}
      </div>
    </div>
  );
};

export default AreaManagerReports;
