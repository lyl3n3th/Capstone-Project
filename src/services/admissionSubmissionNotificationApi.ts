const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

type SubmissionNotificationErrorResponse = {
  detail?: string;
  errors?: Record<string, string[]>;
};

export type AdmissionNotificationDeliveryStatus =
  | "sent"
  | "not_configured"
  | "failed";

export interface AdmissionNotificationDelivery {
  status: AdmissionNotificationDeliveryStatus;
  destination: string;
  error?: string;
}

export interface AdmissionSubmissionNotificationResponse {
  message: string;
  tracking_number: string;
  deliveries: {
    email: AdmissionNotificationDelivery;
    sms: AdmissionNotificationDelivery;
  };
}

export interface AdmissionDecisionNotificationResponse {
  message: string;
  tracking_number?: string;
  deliveries: {
    email: AdmissionNotificationDelivery;
  };
}

const parseSubmissionNotificationError = async (response: Response) => {
  let message = "Unable to send the tracking number automatically right now.";

  try {
    const payload =
      (await response.json()) as SubmissionNotificationErrorResponse;
    if (payload.detail) {
      message = payload.detail;
    } else if (payload.errors) {
      const firstError = Object.values(payload.errors)[0]?.[0];
      if (firstError) {
        message = firstError;
      }
    }
  } catch {
    message = response.statusText || message;
  }

  throw new Error(message);
};

export interface SendAdmissionSubmissionNotificationPayload {
  trackingNumber: string;
  email?: string;
  mobile?: string;
  firstName?: string;
  lastName?: string;
  applicationStatus?: string;
}

export interface SendAdmissionDecisionNotificationPayload {
  email?: string;
  fullName?: string;
  trackingNumber?: string;
  studentNumber?: string;
  recordType?: "admission" | "enrollment";
  decisionStatus?: "rejected";
  decisionReason: string;
}

export async function sendAdmissionSubmissionNotification(
  payload: SendAdmissionSubmissionNotificationPayload,
) {
  const response = await fetch(
    `${API_BASE_URL}/api/admissions/submission-notification/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    await parseSubmissionNotificationError(response);
  }

  return (await response.json()) as AdmissionSubmissionNotificationResponse;
}

export async function sendAdmissionDecisionNotification(
  payload: SendAdmissionDecisionNotificationPayload,
) {
  const response = await fetch(
    `${API_BASE_URL}/api/admissions/decision-notification/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    await parseSubmissionNotificationError(response);
  }

  return (await response.json()) as AdmissionDecisionNotificationResponse;
}
