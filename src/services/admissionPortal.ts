import type { AdmissionBranchCode } from "../types/application";
import {
  admissionBranches,
  fetchAdmissionBranches,
  normalizeBranchCode,
  type AdmissionBranchOption,
} from "./admission";
import { supabase } from "../lib/supabase";

export const ADMISSION_PORTAL_STATUS_STORAGE_KEY =
  "aics-admission-portal-status";
const ADMISSION_PORTAL_BRANCHES_STORAGE_KEY = "aics-admission-portal-branches";
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

type SupabaseErrorLike = {
  details?: string | null;
  hint?: string | null;
  message: string;
};

type AdmissionPortalStatusRow = {
  branch: string;
  is_open: boolean;
  close_on_date: string | null;
  updated_at: string;
};

const ADMISSION_CLOSE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_ADMISSION_BRANCH_CODE: AdmissionBranchCode =
  admissionBranches[0].code;

const getErrorMessage = (error: SupabaseErrorLike) =>
  error.details
    ? `${error.message} ${error.details}`.trim()
    : error.hint
      ? `${error.message} ${error.hint}`.trim()
      : error.message;

const getDefaultAdmissionPortalStatus = (): AdmissionPortalStatusRecord => ({
  isOpen: true,
  closeOnDate: "",
  updatedAt: "",
});

const normalizeAdmissionPortalBranchOptions = (
  branches: AdmissionBranchOption[],
) =>
  branches
    .map((branch) => ({
      code: normalizeBranchCode(branch.code),
      name: branch.name.trim(),
    }))
    .filter((branch) => branch.code && branch.name);

const readCachedAdmissionPortalBranches = () => {
  if (typeof window === "undefined") {
    return [...admissionBranches];
  }

  const rawValue = window.localStorage.getItem(
    ADMISSION_PORTAL_BRANCHES_STORAGE_KEY,
  );
  if (!rawValue) {
    return [...admissionBranches];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as AdmissionBranchOption[];
    const branches = Array.isArray(parsedValue)
      ? normalizeAdmissionPortalBranchOptions(parsedValue)
      : [];

    return branches.length > 0 ? branches : [...admissionBranches];
  } catch (error) {
    console.warn("Failed to parse admission portal branches", error);
    return [...admissionBranches];
  }
};

const writeCachedAdmissionPortalBranches = (
  branches: AdmissionBranchOption[],
) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedBranches = normalizeAdmissionPortalBranchOptions(branches);
  window.localStorage.setItem(
    ADMISSION_PORTAL_BRANCHES_STORAGE_KEY,
    JSON.stringify(
      normalizedBranches.length > 0 ? normalizedBranches : admissionBranches,
    ),
  );
};

const getAdmissionPortalBranches = () => readCachedAdmissionPortalBranches();

const formatFallbackBranchName = (branchCode: AdmissionBranchCode) =>
  branchCode
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || branchCode;

const getAdmissionPortalBranchName = (branchCode: AdmissionBranchCode) =>
  getAdmissionPortalBranches().find((branch) => branch.code === branchCode)
    ?.name ?? formatFallbackBranchName(branchCode);

const createAdmissionPortalStatusStore = (
  record: AdmissionPortalStatusRecord = getDefaultAdmissionPortalStatus(),
) =>
  Object.fromEntries(
    getAdmissionPortalBranches().map((branch) => [
      branch.code,
      { ...record },
    ]),
  ) as Record<AdmissionBranchCode, AdmissionPortalStatusRecord>;

export const resolveAdmissionPortalBranchCode = (
  branch: string | null | undefined,
): AdmissionBranchCode | null => {
  const normalizedBranch = branch?.trim().toLowerCase() ?? "";

  if (!normalizedBranch) {
    return null;
  }

  const matchedBranch = getAdmissionPortalBranches().find(
    (candidate) =>
      candidate.code === normalizedBranch ||
      candidate.name.trim().toLowerCase() === normalizedBranch,
  );

  return matchedBranch?.code ?? normalizeBranchCode(normalizedBranch);
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
        getAdmissionPortalBranches().map((branch) => [
          branch.code,
          normalizeStoredAdmissionPortalStatus(parsedStore[branch.code]),
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

export const fetchAndCacheAdmissionPortalStatuses = async () => {
  const admissionBranchOptions = await fetchAdmissionBranches();
  writeCachedAdmissionPortalBranches(admissionBranchOptions);
  const branches = getAdmissionPortalBranches();
  const { data, error } = await supabase
    .rpc("list_admission_portal_statuses")
    .returns<AdmissionPortalStatusRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const store = readStoredAdmissionPortalStore();
  (Array.isArray(data) ? data : []).forEach((row) => {
    const branchCode =
      branches.find(
        (branch) =>
          branch.code === normalizeBranchCode(row.branch) ||
          branch.name.trim().toLowerCase() === row.branch.trim().toLowerCase(),
      )?.code ?? resolveAdmissionPortalBranchCode(row.branch);

    if (!branchCode) {
      return;
    }

    store[branchCode] = normalizeStoredAdmissionPortalStatus({
      isOpen: row.is_open,
      closeOnDate: row.close_on_date || "",
      updatedAt: row.updated_at,
    });
  });

  writeStoredAdmissionPortalStore(store);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ADMISSION_PORTAL_STATUS_UPDATED_EVENT));
  }
  return getAdmissionPortalOverview();
};

const getBranchStatusSnapshot = (
  branchCode: AdmissionBranchCode,
  status: AdmissionPortalStatusRecord,
): AdmissionPortalBranchStatus => ({
  branchCode,
  branchName: getAdmissionPortalBranchName(branchCode),
  ...resolveAdmissionPortalStatus(status),
});

export const getAdmissionPortalStatus = (branch: string | null | undefined) => {
  const branchCode = resolveAdmissionPortalBranchCode(branch);

  if (!branchCode) {
    return null;
  }

  const store = readStoredAdmissionPortalStore();
  return getBranchStatusSnapshot(
    branchCode,
    normalizeStoredAdmissionPortalStatus(store[branchCode]),
  );
};

export const getAdmissionPortalOverview = (): AdmissionPortalOverview => {
  const store = readStoredAdmissionPortalStore();
  const branches = getAdmissionPortalBranches().map((branch) =>
    getBranchStatusSnapshot(
      branch.code,
      normalizeStoredAdmissionPortalStatus(store[branch.code]),
    ),
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
  void supabase
    .rpc("upsert_admission_portal_status", {
      p_branch: getAdmissionPortalBranchName(branchCode),
      p_is_open: nextStatus.isOpen,
      p_close_on_date: nextStatus.closeOnDate,
    })
    .then(({ error }) => {
      if (error) {
        console.warn(
          "Unable to sync admission portal status to Supabase; local status was updated.",
          error,
        );
      }
    });
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
