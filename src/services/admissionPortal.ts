export const ADMISSION_PORTAL_STATUS_STORAGE_KEY =
  "aics-admission-portal-status";
export const ADMISSION_PORTAL_STATUS_UPDATED_EVENT =
  "aics-admission-portal-status-updated";
export const ADMISSION_PORTAL_OPEN_DESCRIPTION =
  "New admission forms are currently available. Applicants can use the Enroll Now button to start a new submission.";
export const ADMISSION_PORTAL_CLOSED_DESCRIPTION =
  "You can still visit this page and track an application below, but new admission forms stay unavailable until admissions are reopened.";

export type AdmissionPortalStatusRecord = {
  isOpen: boolean;
  closeOnDate: string;
  updatedAt: string;
};

export type AdmissionPortalStatusSnapshot = AdmissionPortalStatusRecord & {
  isAutoClosed: boolean;
};

const ADMISSION_CLOSE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getDefaultAdmissionPortalStatus = (): AdmissionPortalStatusRecord => ({
  isOpen: true,
  closeOnDate: "",
  updatedAt: "",
});

const normalizeAdmissionCloseOnDate = (value: string | null | undefined) => {
  const trimmedValue = value?.trim() ?? "";

  if (!trimmedValue || !ADMISSION_CLOSE_DATE_PATTERN.test(trimmedValue)) {
    return "";
  }

  const [year, month, day] = trimmedValue
    .split("-")
    .map((datePart) => Number.parseInt(datePart, 10));
  const parsedDate = new Date(year, month - 1, day);

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return "";
  }

  return trimmedValue;
};

const getAdmissionCloseDateCutoff = (closeOnDate: string) => {
  const normalizedCloseOnDate = normalizeAdmissionCloseOnDate(closeOnDate);

  if (!normalizedCloseOnDate) {
    return null;
  }

  const [year, month, day] = normalizedCloseOnDate
    .split("-")
    .map((datePart) => Number.parseInt(datePart, 10));

  return new Date(year, month - 1, day, 23, 59, 59, 999);
};

const resolveAdmissionPortalStatus = (
  status: AdmissionPortalStatusRecord,
): AdmissionPortalStatusSnapshot => {
  const closeOnDate = normalizeAdmissionCloseOnDate(status.closeOnDate);
  const cutoff = getAdmissionCloseDateCutoff(closeOnDate);
  const isAutoClosed = Boolean(
    status.isOpen && cutoff && Date.now() > cutoff.getTime(),
  );

  return {
    isOpen: status.isOpen && !isAutoClosed,
    closeOnDate,
    updatedAt: status.updatedAt,
    isAutoClosed,
  };
};

const readStoredAdmissionPortalStatus = (): AdmissionPortalStatusRecord => {
  if (typeof window === "undefined") {
    return getDefaultAdmissionPortalStatus();
  }

  const rawValue = window.localStorage.getItem(
    ADMISSION_PORTAL_STATUS_STORAGE_KEY,
  );

  if (!rawValue) {
    return getDefaultAdmissionPortalStatus();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<AdmissionPortalStatusRecord>;

    return {
      isOpen: parsedValue.isOpen ?? true,
      closeOnDate: normalizeAdmissionCloseOnDate(parsedValue.closeOnDate),
      updatedAt: parsedValue.updatedAt ?? "",
    };
  } catch (error) {
    console.warn("Failed to parse admission portal status", error);
    return getDefaultAdmissionPortalStatus();
  }
};

export const getAdmissionPortalStatus = () =>
  resolveAdmissionPortalStatus(readStoredAdmissionPortalStatus());

export const isAdmissionPortalOpen = () => getAdmissionPortalStatus().isOpen;

export const setAdmissionPortalStatus = ({
  isOpen,
  closeOnDate = "",
}: {
  isOpen: boolean;
  closeOnDate?: string | null;
}) => {
  if (typeof window === "undefined") {
    return resolveAdmissionPortalStatus(getDefaultAdmissionPortalStatus());
  }

  const nextStatus: AdmissionPortalStatusRecord = {
    isOpen,
    closeOnDate: isOpen ? normalizeAdmissionCloseOnDate(closeOnDate) : "",
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(
    ADMISSION_PORTAL_STATUS_STORAGE_KEY,
    JSON.stringify(nextStatus),
  );
  window.dispatchEvent(
    new CustomEvent(ADMISSION_PORTAL_STATUS_UPDATED_EVENT, {
      detail: nextStatus,
    }),
  );

  return resolveAdmissionPortalStatus(nextStatus);
};

export const setAdmissionPortalOpen = (
  isOpen: boolean,
  closeOnDate?: string | null,
) => setAdmissionPortalStatus({ isOpen, closeOnDate });

export const formatAdmissionCloseDate = (closeOnDate: string) => {
  const normalizedCloseOnDate = normalizeAdmissionCloseOnDate(closeOnDate);

  if (!normalizedCloseOnDate) {
    return "";
  }

  const [year, month, day] = normalizedCloseOnDate
    .split("-")
    .map((datePart) => Number.parseInt(datePart, 10));

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
};
