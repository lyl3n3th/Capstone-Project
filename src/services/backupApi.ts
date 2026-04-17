import { AUTH_STORAGE_KEY, type AuthSession } from "../types/user";
import {
  getCurrentBranch,
  readStoredStudents,
  writeStoredStudents,
  type StudentStorageRecord,
} from "./adminStorage";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";
const ALUMNI_BACKUP_CACHE_KEY = "aics-admin-alumni-backup-cache";
const ALUMNI_RESTORE_STATUS_CACHE_KEY = "aics-admin-alumni-restore-status-cache";
export const BACKUP_RESTORE_APPLIED_EVENT = "aics-backup-restore-applied";

export interface BackupSettingsRecord {
  branch: string;
  automated_time: string;
  retention_days: number;
  is_enabled: boolean;
  timezone_offset_minutes?: number;
  last_automated_backup_at?: string | null;
  updated_at: string;
}

export interface BackupHistoryRecord {
  id: string;
  branch: string;
  backup_type: "manual" | "automated" | "restore";
  backup_filename: string;
  file_path: string;
  sql_file_path: string;
  storage_bucket: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "deleted";
  progress: number;
  error_message: string;
  task_id: string;
  creation_date: string;
  created_by: number | null;
  created_by_name: string;
  metadata: Record<string, unknown>;
  restored_from: string | null;
  restore_started_at?: string | null;
  restore_finished_at?: string | null;
}

export interface AlumniBackupRecord {
  recordId?: number;
  id: string;
  fullName: string;
  program: string;
  yearGraduated: string;
  contact: string;
  becameAlumniOn: string;
}

export interface BackupSnapshotPayload {
  branch: string;
  snapshot_format: string;
  students: StudentStorageRecord[];
  alumni: AlumniBackupRecord[];
}

export interface BackupSnapshotSyncResult {
  branch: string;
  record_count: number;
  updated_at: string;
  updated_by_name: string;
}

const readAuthSession = (): AuthSession | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as AuthSession;
  } catch (error) {
    console.error("Failed to parse stored auth session", error);
    return null;
  }
};

const buildHeaders = (contentType?: string) => {
  const session = readAuthSession();
  const headers = new Headers();

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  if (session?.user.employeeId) {
    headers.set("X-Employee-Id", session.user.employeeId);
  }

  headers.set("X-User-Role", session?.user.role || "");
  headers.set("X-User-Branch", session?.user.branch || "");
  headers.set("X-User-Name", session?.user.displayName || "");

  return headers;
};

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let message = "Request failed.";

    try {
      const data = (await response.json()) as
        | { detail?: string; errors?: Record<string, string[]> }
        | undefined;
      if (data?.detail) {
        message = data.detail;
      } else if (data?.errors) {
        const firstError = Object.values(data.errors)[0]?.[0];
        if (firstError) {
          message = firstError;
        }
      }
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
};

export const readCachedAlumni = (): AlumniBackupRecord[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = localStorage.getItem(ALUMNI_BACKUP_CACHE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as AlumniBackupRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to parse cached alumni backup data", error);
    return [];
  }
};

export const persistAlumniBackupCache = (records: AlumniBackupRecord[]) => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(ALUMNI_BACKUP_CACHE_KEY, JSON.stringify(records));
};

const readCachedAlumniRestoreStatuses = (): Record<string, StudentStorageRecord["status"]> => {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = localStorage.getItem(ALUMNI_RESTORE_STATUS_CACHE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, StudentStorageRecord["status"]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("Failed to parse cached alumni restore status data", error);
    return {};
  }
};

const persistCachedAlumniRestoreStatuses = (
  records: Record<string, StudentStorageRecord["status"]>,
) => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(
    ALUMNI_RESTORE_STATUS_CACHE_KEY,
    JSON.stringify(records),
  );
};

export const rememberAlumniStudentStatus = (
  studentId: string,
  status: StudentStorageRecord["status"],
) => {
  if (typeof window === "undefined" || !studentId) {
    return;
  }

  const normalizedStatus =
    status === "Archived" || status === "Graduated" ? "Complete" : status;
  const cachedStatuses = readCachedAlumniRestoreStatuses();
  cachedStatuses[studentId] = normalizedStatus;
  persistCachedAlumniRestoreStatuses(cachedStatuses);
};

export const getRememberedAlumniStudentStatus = (
  studentId: string,
): StudentStorageRecord["status"] | undefined => {
  if (!studentId) {
    return undefined;
  }

  return readCachedAlumniRestoreStatuses()[studentId];
};

export const forgetRememberedAlumniStudentStatus = (studentId: string) => {
  if (typeof window === "undefined" || !studentId) {
    return;
  }

  const cachedStatuses = readCachedAlumniRestoreStatuses();
  if (!Object.prototype.hasOwnProperty.call(cachedStatuses, studentId)) {
    return;
  }

  delete cachedStatuses[studentId];
  persistCachedAlumniRestoreStatuses(cachedStatuses);
};

const getClientTimezoneOffsetMinutes = () => new Date().getTimezoneOffset();

const buildClientReferenceTime = () => {
  return new Date().toISOString();
};

const buildBackupSnapshot = () => {
  const branch = getCurrentBranch();
  const seenStudentKeys = new Set<string>();
  const students = readStoredStudents()
    .filter(
      (student) =>
        (student.branch || "").trim().toLowerCase() === branch.toLowerCase() &&
        (student.status || "").toLowerCase() !== "archived",
    )
    .filter((student) => {
      const key = `${(student.branch || "").trim().toLowerCase()}::${student.id}`;
      if (seenStudentKeys.has(key)) {
        return false;
      }
      seenStudentKeys.add(key);
      return true;
    });
  const alumni = readCachedAlumni();

  return { students, alumni };
};

export async function fetchBackupSettings() {
  const response = await fetch(`${API_BASE_URL}/api/admin/backup/settings/`, {
    headers: buildHeaders(),
  });

  return parseJsonResponse<BackupSettingsRecord>(response);
}

export async function saveBackupSettings(payload: {
  automated_time: string;
  retention_days: number;
  is_enabled: boolean;
}) {
  const response = await fetch(`${API_BASE_URL}/api/admin/backup/settings/`, {
    method: "PUT",
    headers: buildHeaders("application/json"),
    body: JSON.stringify({
      ...payload,
      timezone_offset_minutes: getClientTimezoneOffsetMinutes(),
    }),
  });

  return parseJsonResponse<BackupSettingsRecord>(response);
}

export async function fetchBackupHistory() {
  const response = await fetch(`${API_BASE_URL}/api/admin/backup/history/`, {
    headers: buildHeaders(),
  });

  return parseJsonResponse<BackupHistoryRecord[]>(response);
}

export async function createManualBackup(options?: { backupType?: "manual" | "automated" }) {
  const snapshot = buildBackupSnapshot();
  const response = await fetch(`${API_BASE_URL}/api/admin/backup/manual/`, {
    method: "POST",
    headers: buildHeaders("application/json"),
    body: JSON.stringify({
      backup_type: options?.backupType || "manual",
      students: snapshot.students,
      alumni: snapshot.alumni,
    }),
  });

  return parseJsonResponse<BackupHistoryRecord>(response);
}

export async function syncBackupSnapshot() {
  const snapshot = buildBackupSnapshot();
  const response = await fetch(`${API_BASE_URL}/api/admin/backup/snapshot-sync/`, {
    method: "POST",
    headers: buildHeaders("application/json"),
    body: JSON.stringify({
      students: snapshot.students,
      alumni: snapshot.alumni,
      timezone_offset_minutes: getClientTimezoneOffsetMinutes(),
    }),
  });

  return parseJsonResponse<BackupSnapshotSyncResult>(response);
}

export async function dispatchDueAutomatedBackups() {
  const response = await fetch(`${API_BASE_URL}/api/admin/backup/automated/dispatch/`, {
    method: "POST",
    headers: buildHeaders("application/json"),
    body: JSON.stringify({
      reference_time: buildClientReferenceTime(),
      timezone_offset_minutes: getClientTimezoneOffsetMinutes(),
    }),
  });

  return parseJsonResponse<BackupHistoryRecord[]>(response);
}

export async function startBackupRestore(backupHistoryId: string) {
  const response = await fetch(`${API_BASE_URL}/api/admin/backup/restore/`, {
    method: "POST",
    headers: buildHeaders("application/json"),
    body: JSON.stringify({ backup_history_id: backupHistoryId }),
  });

  return parseJsonResponse<BackupHistoryRecord>(response);
}

export async function fetchBackupStatus(backupHistoryId: string) {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/backup/history/${backupHistoryId}/status/`,
    {
      headers: buildHeaders(),
    },
  );

  return parseJsonResponse<BackupHistoryRecord>(response);
}

export async function fetchBackupSnapshot(backupHistoryId: string) {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/backup/history/${backupHistoryId}/snapshot/`,
    {
      headers: buildHeaders(),
    },
  );

  return parseJsonResponse<BackupSnapshotPayload>(response);
}

export function applyBackupSnapshot(snapshot: BackupSnapshotPayload) {
  const currentBranch = getCurrentBranch();
  const otherBranchStudents = readStoredStudents().filter(
    (student) => (student.branch || "").trim().toLowerCase() !== currentBranch.toLowerCase(),
  );

  writeStoredStudents([...otherBranchStudents, ...(snapshot.students || [])]);
  persistAlumniBackupCache(snapshot.alumni || []);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(BACKUP_RESTORE_APPLIED_EVENT, {
        detail: {
          branch: snapshot.branch,
          students: snapshot.students || [],
          alumni: snapshot.alumni || [],
        },
      }),
    );
  }
}

export async function deleteBackup(backupHistoryId: string) {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/backup/history/${backupHistoryId}/`,
    {
      method: "DELETE",
      headers: buildHeaders(),
    },
  );

  if (!response.ok) {
    let message = "Failed to delete backup.";
    try {
      const data = (await response.json()) as { detail?: string } | undefined;
      if (data?.detail) {
        message = data.detail;
      }
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
}
