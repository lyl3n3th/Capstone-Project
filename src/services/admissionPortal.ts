import type { AdmissionBranchCode } from "../types/application";
import { admissionBranches } from "./admission";

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

export type AdmissionPortalBranchStatus = AdmissionPortalStatusSnapshot & {
  branchCode: AdmissionBranchCode;
  branchName: string;
};

export type AdmissionPortalOverview = {
  branches: AdmissionPortalBranchStatus[];
  openBranches: AdmissionPortalBranchStatus[];
  closedBranches: AdmissionPortalBranchStatus[];
  isAnyOpen: boolean;
  latestUpdatedAt: string;
};

type AdmissionPortalStatusStore = Partial<
  Record<AdmissionBranchCode, Partial<AdmissionPortalStatusRecord>>
>;

const ADMISSION_CLOSE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_ADMISSION_BRANCH_CODE: AdmissionBranchCode =
  admissionBranches[0].code;

const ADMISSION_BRANCH_CODES = admissionBranches.map(
  (branch) => branch.code,
) as AdmissionBranchCode[];

const ADMISSION_BRANCH_NAME_BY_CODE = Object.fromEntries(
  admissionBranches.map((branch) => [branch.code, branch.name]),
) as Record<AdmissionBranchCode, string>;

const getDefaultAdmissionPortalStatus = (): AdmissionPortalStatusRecord => ({
  isOpen: true,
  closeOnDate: "",
  updatedAt: "",
});

const createAdmissionPortalStatusStore = (
  record: AdmissionPortalStatusRecord = getDefaultAdmissionPortalStatus(),
) =>
  Object.fromEntries(
    ADMISSION_BRANCH_CODES.map((branchCode) => [branchCode, { ...record }]),
  ) as Record<AdmissionBranchCode, AdmissionPortalStatusRecord>;

export const resolveAdmissionPortalBranchCode = (
  branch: string | null | undefined,
): AdmissionBranchCode | null => {
  const normalizedBranch = branch?.trim().toLowerCase() ?? "";

  if (!normalizedBranch) {
    return null;
  }

  const matchedBranch = admissionBranches.find(
    (candidate) =>
      candidate.code === normalizedBranch ||
      candidate.name.trim().toLowerCase() === normalizedBranch,
  );

  return matchedBranch?.code ?? null;
};

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

  // The selected date is the first day admissions are closed.
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const resolveAdmissionPortalStatus = (
  status: AdmissionPortalStatusRecord,
): AdmissionPortalStatusSnapshot => {
  const closeOnDate = normalizeAdmissionCloseOnDate(status.closeOnDate);
  const cutoff = getAdmissionCloseDateCutoff(closeOnDate);
  const isAutoClosed = Boolean(
    status.isOpen && cutoff && Date.now() >= cutoff.getTime(),
  );

  return {
    isOpen: status.isOpen && !isAutoClosed,
    closeOnDate,
    updatedAt: status.updatedAt,
    isAutoClosed,
  };
};

const normalizeStoredAdmissionPortalStatus = (
  value: Partial<AdmissionPortalStatusRecord> | null | undefined,
): AdmissionPortalStatusRecord => ({
  isOpen: value?.isOpen ?? true,
  closeOnDate: normalizeAdmissionCloseOnDate(value?.closeOnDate),
  updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : "",
});

const isLegacyAdmissionPortalStatusRecord = (
  value: unknown,
): value is Partial<AdmissionPortalStatusRecord> =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      ("isOpen" in value || "closeOnDate" in value || "updatedAt" in value),
  );

const readStoredAdmissionPortalStore = () => {
  if (typeof window === "undefined") {
    return createAdmissionPortalStatusStore();
  }

  const rawValue = window.localStorage.getItem(
    ADMISSION_PORTAL_STATUS_STORAGE_KEY,
  );

  if (!rawValue) {
    return createAdmissionPortalStatusStore();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;

    if (isLegacyAdmissionPortalStatusRecord(parsedValue)) {
      return createAdmissionPortalStatusStore(
        normalizeStoredAdmissionPortalStatus(parsedValue),
      );
    }

    if (parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
      const parsedStore = parsedValue as AdmissionPortalStatusStore;

      return Object.fromEntries(
        ADMISSION_BRANCH_CODES.map((branchCode) => [
          branchCode,
          normalizeStoredAdmissionPortalStatus(parsedStore[branchCode]),
        ]),
      ) as Record<AdmissionBranchCode, AdmissionPortalStatusRecord>;
    }
  } catch (error) {
    console.warn("Failed to parse admission portal status", error);
  }

  return createAdmissionPortalStatusStore();
};

const writeStoredAdmissionPortalStore = (
  store: Record<AdmissionBranchCode, AdmissionPortalStatusRecord>,
) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    ADMISSION_PORTAL_STATUS_STORAGE_KEY,
    JSON.stringify(store),
  );
};

const getBranchStatusSnapshot = (
  branchCode: AdmissionBranchCode,
  status: AdmissionPortalStatusRecord,
): AdmissionPortalBranchStatus => ({
  branchCode,
  branchName: ADMISSION_BRANCH_NAME_BY_CODE[branchCode],
  ...resolveAdmissionPortalStatus(status),
});

export const getAdmissionPortalStatus = (branch: string | null | undefined) => {
  const branchCode = resolveAdmissionPortalBranchCode(branch);

  if (!branchCode) {
    return null;
  }

  const store = readStoredAdmissionPortalStore();
  return getBranchStatusSnapshot(branchCode, store[branchCode]);
};

export const getAdmissionPortalOverview = (): AdmissionPortalOverview => {
  const store = readStoredAdmissionPortalStore();
  const branches = ADMISSION_BRANCH_CODES.map((branchCode) =>
    getBranchStatusSnapshot(branchCode, store[branchCode]),
  );
  const openBranches = branches.filter((branch) => branch.isOpen);
  const closedBranches = branches.filter((branch) => !branch.isOpen);
  const latestUpdatedAt = branches.reduce((latestTimestamp, branch) => {
    if (!branch.updatedAt) {
      return latestTimestamp;
    }

    if (!latestTimestamp) {
      return branch.updatedAt;
    }

    return Date.parse(branch.updatedAt) > Date.parse(latestTimestamp)
      ? branch.updatedAt
      : latestTimestamp;
  }, "");

  return {
    branches,
    openBranches,
    closedBranches,
    isAnyOpen: openBranches.length > 0,
    latestUpdatedAt,
  };
};

export const isAdmissionPortalOpen = (branch?: string | null) => {
  if (branch) {
    return getAdmissionPortalStatus(branch)?.isOpen ?? false;
  }

  return getAdmissionPortalOverview().isAnyOpen;
};

export const setAdmissionPortalStatus = ({
  branch,
  isOpen,
  closeOnDate = "",
}: {
  branch: string;
  isOpen: boolean;
  closeOnDate?: string | null;
}) => {
  const branchCode =
    resolveAdmissionPortalBranchCode(branch) ?? DEFAULT_ADMISSION_BRANCH_CODE;
  const store = readStoredAdmissionPortalStore();
  const nextStatus: AdmissionPortalStatusRecord = {
    isOpen,
    closeOnDate: isOpen ? normalizeAdmissionCloseOnDate(closeOnDate) : "",
    updatedAt: new Date().toISOString(),
  };
  const nextStore = {
    ...store,
    [branchCode]: nextStatus,
  };

  writeStoredAdmissionPortalStore(nextStore);
  window.dispatchEvent(
    new CustomEvent(ADMISSION_PORTAL_STATUS_UPDATED_EVENT, {
      detail: {
        branchCode,
        status: nextStatus,
      },
    }),
  );

  return getBranchStatusSnapshot(branchCode, nextStatus);
};

export const setAdmissionPortalOpen = (
  branch: string,
  isOpen: boolean,
  closeOnDate?: string | null,
) => setAdmissionPortalStatus({ branch, isOpen, closeOnDate });

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
