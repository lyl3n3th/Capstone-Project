import { useMemo, useRef, useState } from "react";
import {
  FaDatabase,
  FaClock,
  FaTrash,
  FaDownload,
  FaUndo,
  FaSave,
  FaPlus,
  FaCalendarAlt,
  FaHdd,
} from "react-icons/fa";
import { ToastContainer } from "../../components/common/Toast";
import AdminSidebar from "../../components/admin/AdminSidebar";
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
  type: "Manual" | "Automated";
  createdBy: string;
  status: "Success" | "Failed" | "In Progress";
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

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

  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [backupTime, setBackupTime] = useState("10:00");
  const [retentionDays, setRetentionDays] = useState("30");

  const [backups, setBackups] = useState<BackupItem[]>([
    {
      id: "BK-20260315-001",
      name: "Backup_2026-03-15_08-45",
      date: "March 15, 2026 08:45 AM",
      size: "1.2 GB",
      type: "Manual",
      createdBy: "Liza Mae Guyo",
      status: "Success",
    },
    {
      id: "BK-20260314-002",
      name: "Backup_2026-03-14_23-30",
      date: "March 14, 2026 11:30 PM",
      size: "980 MB",
      type: "Automated",
      createdBy: "System (Auto)",
      status: "Success",
    },
    {
      id: "BK-20260313-003",
      name: "Backup_2026-03-13_21-15",
      date: "March 13, 2026 09:15 PM",
      size: "1.1 GB",
      type: "Manual",
      createdBy: "Liza Mae Guyo",
      status: "Success",
    },
  ]);

  // Toast functions
  const addToast = (message: string, type: Toast["type"]) => {
    toastCounterRef.current += 1;
    const id = `backup-toast-${toastCounterRef.current}`;
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

  const lastBackup = useMemo(() => {
    return backups.length > 0 ? backups[0] : null;
  }, [backups]);

  const handleCreateBackup = () => {
    const date = new Date();

    const newBackup: BackupItem = {
      id: `BK-${date.toISOString().slice(0, 10).replace(/-/g, "")}-${String(
        backups.length + 1,
      ).padStart(3, "0")}`,
      name: `Backup_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}_${String(date.getHours()).padStart(2, "0")}-${String(
        date.getMinutes(),
      ).padStart(2, "0")}`,
      date: date.toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      size: `${(0.8 + ((backups.length + 1) % 5) * 0.1).toFixed(1)} GB`,
      type: "Manual",
      createdBy: displayName,
      status: "Success",
    };

    setBackups((prev) => [newBackup, ...prev]);
    addToast("Backup created successfully!", "success");
  };

  const handleSaveSettings = () => {
    addToast("Backup settings saved successfully!", "success");
  };

  const handleRestore = (backupName: string) => {
    addToast(`Restore started for ${backupName}`, "info");
  };

  const handleDownload = (backupName: string) => {
    addToast(`Download started for ${backupName}`, "info");
  };

  const handleDelete = (backupId: string, backupName: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this backup?",
    );
    if (!confirmed) return;

    setBackups((prev) => prev.filter((backup) => backup.id !== backupId));
    addToast(`Backup "${backupName}" deleted successfully`, "success");
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
      <main className="backup-content">
        <header className="page-header">
          <h1>Backup Management</h1>
          <p>Create, restore, and manage student data backups</p>
        </header>

        {/* Top backup management section */}
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
                  onChange={(e) => setBackupTime(e.target.value)}
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
                  onChange={(e) => setRetentionDays(e.target.value)}
                />
                <small>
                  Backups older than this will be automatically deleted
                </small>
              </div>
            </div>

            <div className="settings-actions">
              <button
                className="save-settings-btn"
                onClick={handleSaveSettings}
              >
                <FaSave /> Save Settings
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
                <p>{lastBackup ? lastBackup.date : "No backup available"}</p>
                {lastBackup && <small>Size: {lastBackup.size}</small>}
              </div>
            </div>

            <button
              className="summary-card create-backup-card"
              onClick={handleCreateBackup}
            >
              <div className="summary-icon blue">
                <FaPlus />
              </div>
              <div className="summary-text">
                <h4>Create Backup</h4>
                <p>Create a manual backup of all student data</p>
              </div>
            </button>
          </div>
        </div>

        {/* Backup history */}
        <div className="table-container">
          <div className="backup-table-header">
            <h3>Backup History</h3>
          </div>

          <table className="backup-table">
            <thead>
              <tr>
                <th>Backup Name</th>
                <th>Date & Time</th>
                <th>Size</th>
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
                    <td>{backup.size}</td>
                    <td>
                      <span
                        className={`type-badge ${backup.type.toLowerCase()}`}
                      >
                        {backup.type}
                      </span>
                    </td>
                    <td className="created-by-cell">{backup.createdBy}</td>
                    <td>
                      <span
                        className={`status-badge ${backup.status.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {backup.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        <button
                          className="action-btn restore"
                          onClick={() => handleRestore(backup.name)}
                          title="Restore backup"
                        >
                          <FaUndo /> Restore
                        </button>
                        <button
                          className="action-btn download"
                          onClick={() => handleDownload(backup.name)}
                          title="Download backup"
                        >
                          <FaDownload /> Download
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => handleDelete(backup.id, backup.name)}
                          title="Delete backup"
                        >
                          <FaTrash /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="no-results">
                    No backups available yet.
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
