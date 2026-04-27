import { AUTH_STORAGE_KEY, type AuthSession } from "../types/user";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

export interface ReportRecord {
  id: string;
  sender: string | null;
  sender_name: string;
  branch_name: string;
  subject: string;
  message: string;
  attachment_url: string;
  is_deleted: boolean;
  is_reviewed: boolean;
  reviewed_at: string | null;
  created_at: string;
}

export interface CreateReportPayload {
  branch: string;
  subject: string;
  message: string;
  attachment?: File | null;
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
        | { detail?: string; errors?: Record<string, string[]>; branch?: string[] }
        | undefined;
      if (data?.detail) {
        message = data.detail;
      } else if (data?.branch?.[0]) {
        message = data.branch[0];
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

export async function fetchInboxReports() {
  const response = await fetch(`${API_BASE_URL}/api/manager/reports/inbox/`, {
    headers: buildHeaders(),
  });

  return parseJsonResponse<ReportRecord[]>(response);
}

export async function fetchTrashReports() {
  const response = await fetch(`${API_BASE_URL}/api/manager/reports/trash/`, {
    headers: buildHeaders(),
  });

  return parseJsonResponse<ReportRecord[]>(response);
}

export async function fetchSentReports() {
  const response = await fetch(`${API_BASE_URL}/api/manager/reports/sent/`, {
    headers: buildHeaders(),
  });

  return parseJsonResponse<ReportRecord[]>(response);
}

export async function createReport(payload: CreateReportPayload) {
  const formData = new FormData();
  formData.append("branch", payload.branch);
  formData.append("subject", payload.subject);
  formData.append("message", payload.message);

  if (payload.attachment) {
    formData.append("attachment", payload.attachment);
  }

  const response = await fetch(`${API_BASE_URL}/api/manager/reports/`, {
    method: "POST",
    headers: buildHeaders(),
    body: formData,
  });

  return parseJsonResponse<ReportRecord>(response);
}

export async function moveReportToTrash(reportId: string) {
  const response = await fetch(
    `${API_BASE_URL}/api/manager/reports/${reportId}/soft-delete/`,
    {
      method: "PATCH",
      headers: buildHeaders("application/json"),
      body: "{}",
    },
  );

  return parseJsonResponse<ReportRecord>(response);
}

export async function restoreReport(reportId: string) {
  const response = await fetch(
    `${API_BASE_URL}/api/manager/reports/${reportId}/restore/`,
    {
      method: "PATCH",
      headers: buildHeaders("application/json"),
      body: "{}",
    },
  );

  return parseJsonResponse<ReportRecord>(response);
}

export async function updateReportReviewStatus(
  reportId: string,
  isReviewed: boolean,
) {
  const response = await fetch(
    `${API_BASE_URL}/api/manager/reports/${reportId}/review-status/`,
    {
      method: "PATCH",
      headers: buildHeaders("application/json"),
      body: JSON.stringify({ is_reviewed: isReviewed }),
    },
  );

  return parseJsonResponse<ReportRecord>(response);
}

export async function permanentlyDeleteReport(reportId: string) {
  const response = await fetch(`${API_BASE_URL}/api/manager/reports/${reportId}/`, {
    method: "DELETE",
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to permanently delete the report.");
  }
}
