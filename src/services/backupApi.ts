import { strFromU8, unzipSync } from "fflate";
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/user";
import {
  getCurrentBranch,
  dedupeStoredStudents,
  forgetDeletedStoredStudent,
  normalizeBranchName,
  normalizeStudentNumberInput,
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
const BACKUP_RESTORE_MARKER_KEY = "aics-backup-restore-marker";
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
  email?: string;
  becameAlumniOn: string;
  studentSnapshot?: StudentStorageRecord;
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

export interface BackupRestoreMarker {
  branch: string;
  appliedAt: string;
  studentCount: number;
  alumniCount: number;
  snapshotFormat: string;
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

export const isCachedAlumniStudent = ({
  studentNumber,
  trackingNumber,
  branch,
}: {
  studentNumber?: string | null;
  trackingNumber?: string | null;
  branch?: string | null;
}) => {
  const resolvedBranch = branch ? normalizeBranchName(branch) : undefined;
  const normalizedStudentNumber =
    normalizeStudentNumberInput(studentNumber || "", resolvedBranch) ||
    normalizeStudentNumberInput(studentNumber || "");
  const normalizedTrackingNumber = trackingNumber?.trim().toUpperCase();

  if (!normalizedStudentNumber && !normalizedTrackingNumber) {
    return false;
  }

  return readCachedAlumni().some((record) => {
    const recordBranch = record.studentSnapshot?.branch
      ? normalizeBranchName(record.studentSnapshot.branch)
      : undefined;
    const branchMatches =
      !resolvedBranch || !recordBranch || recordBranch === resolvedBranch;
    const recordStudentNumber =
      normalizeStudentNumberInput(record.id, recordBranch || resolvedBranch) ||
      normalizeStudentNumberInput(record.id);
    const recordTrackingNumber =
      record.studentSnapshot?.trackingNumber?.trim().toUpperCase();

    return (
      branchMatches &&
      ((normalizedStudentNumber &&
        recordStudentNumber === normalizedStudentNumber) ||
        (normalizedTrackingNumber &&
          recordTrackingNumber === normalizedTrackingNumber))
    );
  });
};

export const persistAlumniBackupCache = (records: AlumniBackupRecord[]) => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(ALUMNI_BACKUP_CACHE_KEY, JSON.stringify(records));
};

export const readBackupRestoreMarker = (): BackupRestoreMarker | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(BACKUP_RESTORE_MARKER_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as BackupRestoreMarker;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error("Failed to parse backup restore marker", error);
    return null;
  }
};

export const clearBackupRestoreMarker = () => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(BACKUP_RESTORE_MARKER_KEY);
};

const rememberBackupRestoreApplied = (marker: BackupRestoreMarker) => {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(BACKUP_RESTORE_MARKER_KEY, JSON.stringify(marker));
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

  const normalizedStatus = status === "Archived" ? "Complete" : status;
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

const mergeAlumniBackupRecords = (
  existingRecords: AlumniBackupRecord[],
  nextRecords: AlumniBackupRecord[],
) => {
  const alumniById = new Map(
    existingRecords.map((record) => [record.id, record] as const),
  );

  nextRecords.forEach((record) => {
    if (!alumniById.has(record.id)) {
      alumniById.set(record.id, record);
    }
  });

  return Array.from(alumniById.values());
};

const buildBackupSnapshot = () => {
  const branch = getCurrentBranch();
  const branchStudents = dedupeStoredStudents(readStoredStudents()).filter(
    (student) => normalizeBranchName(student.branch) === branch,
  );
  const students = branchStudents.filter((student) => {
    const status = (student.status || "").toLowerCase();
    return status !== "archived";
  });
  const alumni = mergeAlumniBackupRecords(readCachedAlumni(), []);

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

const getDownloadFileName = (
  response: Response,
  fallbackFileName: string,
) => {
  const contentDisposition = response.headers.get("Content-Disposition") || "";
  const utfMatch = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1]);
  }

  const plainMatch = contentDisposition.match(/filename\s*=\s*"?(.*?)"?(?:;|$)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallbackFileName;
};

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

export async function uploadBackupArchive(file: File) {
  const formData = new FormData();
  formData.append("archive", file);

  const response = await fetch(`${API_BASE_URL}/api/admin/backup/upload/`, {
    method: "POST",
    headers: buildHeaders(),
    body: formData,
  });

  return parseJsonResponse<BackupHistoryRecord>(response);
}

const parseBackupArchiveJsonArray = <T>(
  archiveEntries: Record<string, Uint8Array>,
  memberName: string,
) => {
  const member = archiveEntries[memberName];

  if (!member) {
    throw new Error(`Backup ZIP is missing ${memberName}.`);
  }

  const parsedValue = JSON.parse(strFromU8(member)) as unknown;

  if (!Array.isArray(parsedValue)) {
    throw new Error(`Backup ZIP member ${memberName} must contain a JSON array.`);
  }

  return parsedValue as T[];
};

export async function restoreLocalBackupArchive(file: File) {
  let archiveEntries: Record<string, Uint8Array>;

  try {
    archiveEntries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("Upload a valid ZIP backup file.");
  }

  const manifestMember = archiveEntries["metadata/manifest.json"];

  if (!manifestMember) {
    throw new Error("Backup ZIP must include metadata/manifest.json.");
  }

  let manifest: Record<string, unknown>;

  try {
    const parsedManifest = JSON.parse(strFromU8(manifestMember)) as unknown;

    if (
      !parsedManifest ||
      typeof parsedManifest !== "object" ||
      Array.isArray(parsedManifest)
    ) {
      throw new Error("Backup ZIP manifest must be a JSON object.");
    }

    manifest = parsedManifest as Record<string, unknown>;
  } catch {
    throw new Error("Backup ZIP contains an invalid manifest file.");
  }

  const snapshotFormat = String(manifest.snapshot_format || "sql").toLowerCase();
  if (snapshotFormat !== "json") {
    throw new Error("Only JSON snapshot backup ZIPs can be restored locally.");
  }

  const currentBranch = getCurrentBranch();
  const backupBranch = String(manifest.branch || currentBranch).trim();
  if (backupBranch && backupBranch.toLowerCase() !== currentBranch.toLowerCase()) {
    throw new Error(
      `This backup belongs to branch "${backupBranch}", not "${currentBranch}".`,
    );
  }

  const snapshot: BackupSnapshotPayload = {
    branch: backupBranch || currentBranch,
    snapshot_format: "json",
    students: parseBackupArchiveJsonArray<StudentStorageRecord>(
      archiveEntries,
      "data/students.json",
    ),
    alumni: parseBackupArchiveJsonArray<AlumniBackupRecord>(
      archiveEntries,
      "data/alumni.json",
    ),
  };

  applyBackupSnapshot(snapshot);
  return snapshot;
}

export async function downloadBackupArchive(
  backupHistoryId: string,
  fallbackFileName = "backup.zip",
) {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/backup/history/${backupHistoryId}/download/`,
    {
      headers: buildHeaders(),
    },
  );

  if (!response.ok) {
    let message = "Failed to download backup ZIP.";
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

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = getDownloadFileName(response, fallbackFileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl);
  }, 0);
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
  const restoredStudents = dedupeStoredStudents(snapshot.students || []);
  const otherBranchStudents = readStoredStudents().filter(
    (student) =>
      normalizeBranchName(student.branch) !== currentBranch,
  );

  restoredStudents.forEach((student) => {
    forgetDeletedStoredStudent({
      branch: student.branch || currentBranch,
      id: student.id,
      trackingNumber: student.trackingNumber,
      name: student.name,
    });
  });

  writeStoredStudents([...otherBranchStudents, ...restoredStudents]);
  persistAlumniBackupCache(snapshot.alumni || []);
  rememberBackupRestoreApplied({
    branch: normalizeBranchName(snapshot.branch || currentBranch),
    appliedAt: new Date().toISOString(),
    studentCount: restoredStudents.length,
    alumniCount: (snapshot.alumni || []).length,
    snapshotFormat: snapshot.snapshot_format || "",
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(BACKUP_RESTORE_APPLIED_EVENT, {
        detail: {
          branch: snapshot.branch,
          students: restoredStudents,
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
