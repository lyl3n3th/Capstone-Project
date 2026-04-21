export const ADMISSION_PORTAL_STATUS_STORAGE_KEY =
  "aics-admission-portal-status";
export const ADMISSION_PORTAL_STATUS_UPDATED_EVENT =
  "aics-admission-portal-status-updated";
export const ADMISSION_PORTAL_OPEN_DESCRIPTION =
  "New admission forms are currently available. Applicants can use the Enroll Now button to start a new submission.";
export const ADMISSION_PORTAL_CLOSED_DESCRIPTION =
  "You can still visit this page and track an application below, but new admission forms stay unavailable until the portal is opened.";

type AdmissionPortalStatusRecord = {
  isOpen: boolean;
  updatedAt: string;
};

const getDefaultAdmissionPortalStatus = (): AdmissionPortalStatusRecord => ({
  isOpen: true,
  updatedAt: "",
});

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
      updatedAt: parsedValue.updatedAt ?? "",
    };
  } catch (error) {
    console.warn("Failed to parse admission portal status", error);
    return getDefaultAdmissionPortalStatus();
  }
};

export const getAdmissionPortalStatus = () => readStoredAdmissionPortalStatus();

export const isAdmissionPortalOpen = () => getAdmissionPortalStatus().isOpen;

export const setAdmissionPortalOpen = (isOpen: boolean) => {
  if (typeof window === "undefined") {
    return getDefaultAdmissionPortalStatus();
  }

  const nextStatus: AdmissionPortalStatusRecord = {
    isOpen,
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

  return nextStatus;
};
