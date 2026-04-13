import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaCalendarAlt,
  FaClock,
  FaDatabase,
  FaHdd,
  FaPlus,
  FaSave,
  FaTrash,
  FaUndo,
} from "react-icons/fa";
import AdminSidebar from "../../components/admin/AdminSidebar";
import { ToastContainer } from "../../components/common/Toast";
import {
  applyBackupSnapshot,
  createManualBackup,
  deleteBackup,
  fetchBackupHistory,
  fetchBackupSnapshot,
  fetchBackupSettings,
  fetchBackupStatus,
  saveBackupSettings,
  startBackupRestore,
  type BackupHistoryRecord,
} from "../../services/backupApi";
import "../../styles/admin/admin-backup.css";

interface BackupProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface BackupItem {
  id: string;
  name: string;
  date: string;
  size: string;
  studentCount: number;
  alumniCount: number;
  type: "Manual" | "Automated";
  createdBy: string;
  status: "Success" | "Failed" | "In Progress";
  progress: number;
  rawStatus: BackupHistoryRecord["status"];
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const POLLABLE_STATUSES: BackupHistoryRecord["status"][] = ["pending", "in_progress"];

export default function AdminBackup({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: BackupProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const displayName = loggedInUsername.trim() || "Administrator";
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounterRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);

  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [backupTime, setBackupTime] = useState("10:00");
  const [retentionDays, setRetentionDays] = useState("30");
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  const addToast = (message: string, type: Toast["type"]) => {
    toastCounterRef.current += 1;
    const id = `backup-toast-${toastCounterRef.current}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const mapBackupRecord = (record: BackupHistoryRecord): BackupItem => ({
    id: record.id,
    name: record.backup_filename,
    date: new Date(record.creation_date).toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    size:
      typeof record.metadata?.record_count === "number"
        ? `${record.metadata.record_count} records`
        : typeof record.metadata?.media_count === "number"
          ? `${record.metadata.media_count} files`
          : "-",
    studentCount:
      typeof record.metadata?.student_count === "number"
        ? record.metadata.student_count
        : 0,
    alumniCount:
      typeof record.metadata?.alumni_count === "number"
        ? record.metadata.alumni_count
        : 0,
    type: record.backup_type === "automated" ? "Automated" : "Manual",
    createdBy: record.created_by_name || displayName,
    status:
      record.status === "completed"
        ? "Success"
        : record.status === "failed"
          ? "Failed"
          : "In Progress",
    progress: record.progress,
    rawStatus: record.status,
  });

  const loadBackupData = async (showErrorToast = true) => {
    try {
      setIsLoading(true);
      const [settings, history] = await Promise.all([
        fetchBackupSettings(),
        fetchBackupHistory(),
      ]);

      setAutoBackupEnabled(settings.is_enabled);
      setBackupTime(settings.automated_time.slice(0, 5));
      setRetentionDays(String(settings.retention_days));
      setBackups(
        history
          .filter(
            (entry) =>
              entry.backup_type === "manual" || entry.backup_type === "automated",
          )
          .map(mapBackupRecord),
      );
    } catch (error) {
      console.error(error);
      if (showErrorToast) {
        addToast(
          error instanceof Error ? error.message : "Failed to load backup page data.",
          "error",
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBackupData(false);

    return () => {
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const hasRunningBackup = backups.some((backup) =>
      POLLABLE_STATUSES.includes(backup.rawStatus),
    );

    if (!hasRunningBackup) {
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    if (refreshTimerRef.current) {
      return;
    }

    refreshTimerRef.current = window.setInterval(() => {
      void loadBackupData(false);
    }, 4000);
  }, [backups]);

  const handleSidebarToggle = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  const lastBackup = useMemo(() => {
    return backups.length > 0 ? backups[0] : null;
  }, [backups]);

  const hasIncompleteManualBackup = backups.some(
    (backup) =>
      backup.type === "Manual" &&
      POLLABLE_STATUSES.includes(backup.rawStatus),
  );

  const handleCreateBackup = async () => {
    try {
      setIsCreatingBackup(true);
      const createdBackup = await createManualBackup();
      const mappedBackup = mapBackupRecord(createdBackup);
      setBackups((prev) => [mappedBackup, ...prev.filter((item) => item.id !== mappedBackup.id)]);
      await loadBackupData(false);
      addToast("Manual backup started and saved to history.", "success");
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Failed to create backup.",
        "error",
      );
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setIsSavingSettings(true);
      const parsedRetentionDays = Number.parseInt(retentionDays, 10);
      await saveBackupSettings({
        automated_time: backupTime,
        retention_days:
          Number.isFinite(parsedRetentionDays) && parsedRetentionDays > 0
            ? parsedRetentionDays
            : 30,
        is_enabled: autoBackupEnabled,
      });
      await loadBackupData(false);
      addToast("Backup settings saved successfully.", "success");
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Failed to save backup settings.",
        "error",
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleRestore = async (backupId: string, backupName: string) => {
    try {
      const restoreJob = await startBackupRestore(backupId);
      addToast(`Restore started for ${backupName}.`, "info");

      const restorePoll = window.setInterval(async () => {
        try {
          const restoreStatus = await fetchBackupStatus(restoreJob.id);
          if (restoreStatus.status === "completed") {
            window.clearInterval(restorePoll);
            const snapshot = await fetchBackupSnapshot(backupId);
            if (snapshot.snapshot_format === "json") {
              applyBackupSnapshot(snapshot);
            }
            addToast(`Restore completed for ${backupName}.`, "success");
          } else if (restoreStatus.status === "failed") {
            window.clearInterval(restorePoll);
            addToast(
              restoreStatus.error_message || `Restore failed for ${backupName}.`,
              "error",
            );
          }
        } catch (error) {
          window.clearInterval(restorePoll);
          addToast(
            error instanceof Error
              ? error.message
              : "Failed to track restore progress.",
            "error",
          );
        }
      }, 3000);
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Failed to start restore.",
        "error",
      );
    }
  };

  const handleDelete = async (backupId: string, backupName: string) => {
    const confirmed = window.confirm(
      `Delete backup "${backupName}"? This will remove it from the backup history.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteBackup(backupId);
      await loadBackupData(false);
      addToast(`Backup "${backupName}" deleted.`, "success");
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Failed to delete backup.",
        "error",
      );
    }
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
        {isSidebarOpen ? "X" : "Menu"}
      </button>

      <main className="backup-content">
        <header className="page-header">
          <h1>Backup Management</h1>
          <p>Create, restore, and manage student data backups</p>
        </header>

        <div className="backup-top-grid">
          <div className="settings-card">
            <div className="settings-header">
              <h3>
                <FaDatabase /> Automated Backup Settings
              </h3>
            </div>

            <div className="toggle-row">
              <div>
                <h4>Enable Automated Backup</h4>
                <p>Automatically create backups on a daily schedule</p>
              </div>

              <button
                type="button"
                className={`toggle-switch ${autoBackupEnabled ? "enabled" : ""}`}
                onClick={() => setAutoBackupEnabled((prev) => !prev)}
                aria-label="Toggle automated backup"
              >
                <span className="toggle-knob"></span>
              </button>
            </div>

            <div className="settings-form">
              <div className="form-group">
                <label htmlFor="backup-time">
                  <FaClock /> Daily Backup Time
                </label>
                <input
                  id="backup-time"
                  type="time"
                  value={backupTime}
                  onChange={(event) => setBackupTime(event.target.value)}
                />
                <small>Time when automated backup will run</small>
              </div>

              <div className="form-group">
                <label htmlFor="retention-days">
                  <FaCalendarAlt /> Backup Retention Period (Days)
                </label>
                <input
                  id="retention-days"
                  type="number"
                  min="1"
                  value={retentionDays}
                  onChange={(event) => setRetentionDays(event.target.value)}
                />
                <small>
                  Backups older than this will be automatically deleted
                </small>
              </div>
            </div>

            <div className="settings-actions">
              <button
                className="save-settings-btn"
                onClick={() => void handleSaveSettings()}
                disabled={isSavingSettings}
              >
                <FaSave /> {isSavingSettings ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>

          <div className="backup-side-cards">
            <div className="summary-card last-backup-card">
              <div className="summary-icon green">
                <FaHdd />
              </div>
              <div>
                <h4>Last Backup</h4>
                <p>
                  {isLoading
                    ? "Loading backups..."
                    : lastBackup
                      ? lastBackup.date
                      : "No backup available"}
                </p>
                {lastBackup && <small>Size: {lastBackup.size}</small>}
                {lastBackup ? (
                  <small>
                    Students: {lastBackup.studentCount} | Alumni: {lastBackup.alumniCount}
                  </small>
                ) : null}
              </div>
            </div>

            <button
              className="summary-card create-backup-card"
              onClick={() => void handleCreateBackup()}
              disabled={isCreatingBackup || hasIncompleteManualBackup}
            >
              <div className="summary-icon blue">
                <FaPlus />
              </div>
              <div className="summary-text">
                <h4>Create Backup</h4>
                <p>
                  {isCreatingBackup
                    ? "Starting manual backup..."
                    : hasIncompleteManualBackup
                      ? "Delete or finish the current manual backup first"
                      : "Create a manual backup of all student data"}
                </p>
              </div>
            </button>
          </div>
        </div>

        <div className="table-container">
          <div className="backup-table-header">
            <h3>Backup History</h3>
          </div>

          <table className="backup-table">
            <thead>
              <tr>
                <th>Backup Name</th>
                <th>Date & Time</th>
                <th>Contents</th>
                <th>Type</th>
                <th>Created By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.length > 0 ? (
                backups.map((backup) => (
                  <tr key={backup.id}>
                    <td className="backup-name-cell">{backup.name}</td>
                    <td className="date-cell">{backup.date}</td>
                    <td>
                      Students: {backup.studentCount} | Alumni: {backup.alumniCount}
                    </td>
                    <td>
                      <span className={`type-badge ${backup.type.toLowerCase()}`}>
                        {backup.type}
                      </span>
                    </td>
                    <td className="created-by-cell">{backup.createdBy}</td>
                    <td>
                      <span
                        className={`status-badge ${backup.status
                          .toLowerCase()
                          .replace(/\s+/g, "-")}`}
                      >
                        {backup.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        <button
                          className="action-btn restore"
                          onClick={() => void handleRestore(backup.id, backup.name)}
                          title="Restore backup"
                          disabled={backup.rawStatus !== "completed"}
                        >
                          <FaUndo /> Restore
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => void handleDelete(backup.id, backup.name)}
                          title="Delete backup"
                        >
                          <FaTrash /> Delete
                        </button>
                      </div>
                      {POLLABLE_STATUSES.includes(backup.rawStatus) ? (
                        <small>{backup.progress}% complete</small>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="no-results">
                    {isLoading ? "Loading backups..." : "No backups available yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
