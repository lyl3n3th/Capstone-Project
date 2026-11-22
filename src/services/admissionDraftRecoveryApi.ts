const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

type DraftRecoveryPayload = {
  email: string;
  firstName: string;
  lastName: string;
};

type DraftRecoveryErrorResponse = {
  detail?: string;
  errors?: Record<string, string[]>;
};

const requestDraftRecovery = async <T>(path: string, body: object): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}/api/admissions/draft-recovery/${path}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = "Unable to verify the unfinished application right now.";
    try {
      const payload = (await response.json()) as DraftRecoveryErrorResponse;
      if (payload.detail) {
        message = payload.detail;
      } else if (payload.errors) {
        message = Object.values(payload.errors)[0]?.[0] || message;
      }
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
};

export const requestAdmissionDraftRecoveryCode = (
  payload: DraftRecoveryPayload,
) => requestDraftRecovery<{ message: string }>("start", payload);

export const verifyAdmissionDraftRecoveryCode = (
  payload: DraftRecoveryPayload & { code: string },
) => requestDraftRecovery<{ tracking_number: string }>("verify", payload);
