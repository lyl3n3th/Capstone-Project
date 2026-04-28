import {
  normalizeBranchName,
  readBranchScopedData,
  writeBranchScopedData,
  type AdminAttachment,
} from "./adminStorage";
import { supabase } from "../lib/supabase";
import type { EnrollmentRequestedLoadRecord } from "./enrollmentLoadPlanner";
import { stripLegacyMockEnrollmentRequestRecords } from "./legacyMockData";

export type EnrollmentRequestStatus = "Pending" | "Approved" | "Rejected";

export interface EnrollmentIrregularRequestRecord {
  mode: "own_schedule" | "section_assignment";
  requestedSectionId?: string;
  requestedSectionCode?: string;
}

export interface EnrollmentRequestRecord {
  id: string;
  branch: string;
  studentNumber: string;
  trackingNumber?: string;
  fullName: string;
  program: string;
  strandOrCourse?: string;
  currentYearLevel: string;
  currentSemester?: string;
  requestedYearLevel: string;
  academicYear: string;
  semester: string;
  enrollmentStatus: EnrollmentRequestStatus;
  requestDate: string;
  enrollmentDate?: string;
  updatedAt?: string;
  notes?: string;
  rejectionReason?: string;
  attachments?: AdminAttachment[];
  requestedLoad?: EnrollmentRequestedLoadRecord;
  irregularRequest?: EnrollmentIrregularRequestRecord;
}

export interface EnrollmentRequirementItem {
  key: string;
  name: string;
  required: boolean;
}

export const ENROLLMENT_REQUEST_STORAGE_SCOPE = "enrollment-requests";
export const ENROLLMENT_REQUESTS_UPDATED_EVENT =
  "aics-enrollment-requests-updated";
const ENROLLMENT_REQUEST_ATTACHMENT_BUCKET = "admission-requirements";
const ENROLLMENT_REQUEST_ATTACHMENT_URL_TTL_SECONDS = 60 * 60;

const REGULAR_ENROLLMENT_REQUIREMENTS: EnrollmentRequirementItem[] = [
  {
    key: "semester_grades_certificate",
    name: "Semester Grades Certificate",
    required: true,
  },
  {
    key: "clearance",
    name: "Clearance",
    required: true,
  },
];

type SupabaseErrorLike = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
};

type EnrollmentRequestRow = {
  id: string;
  student_number: string;
  tracking_number: string | null;
  academic_year: string;
  semester: string;
  enrollment_status: EnrollmentRequestStatus;
  payload: EnrollmentRequestRecord | null;
};

export interface EnrollmentRequestAttachmentUploadInput {
  trackingNumber?: string | null;
  studentNumber?: string | null;
  academicYear: string;
  semester: string;
  requirementKey: string;
  file: File;
}

const sanitizeStorageSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";

const sanitizeFileName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_");

const getErrorMessage = (error: SupabaseErrorLike) =>
  error.details
    ? `${error.message} ${error.details}`.trim()
    : error.hint
      ? `${error.message} ${error.hint}`.trim()
      : error.message;

const getSingleRow = <T,>(data: unknown): T | null => {
  if (Array.isArray(data)) {
    return data.length > 0 ? (data[0] as T) : null;
  }

  if (data && typeof data === "object" && !("error" in data)) {
    return data as T;
  }

  return null;
};

const createEnrollmentRequestAttachmentUrl = async (
  storagePath: string,
  storageBucket = ENROLLMENT_REQUEST_ATTACHMENT_BUCKET,
) => {
  const { data, error } = await supabase.storage
    .from(storageBucket)
    .createSignedUrl(
      storagePath,
      ENROLLMENT_REQUEST_ATTACHMENT_URL_TTL_SECONDS,
    );

  if (error || !data?.signedUrl) {
    console.warn("Failed to sign enrollment request attachment URL", error);
    return "#";
  }

  return data.signedUrl;
};

export const uploadEnrollmentRequestAttachment = async ({
  trackingNumber,
  studentNumber,
  academicYear,
  semester,
  requirementKey,
  file,
}: EnrollmentRequestAttachmentUploadInput): Promise<AdminAttachment> => {
  const safeFileName = sanitizeFileName(file.name);
  const ownerKey = sanitizeStorageSegment(
    trackingNumber?.trim() || studentNumber?.trim() || "student",
  );
  const storagePath = [
    "enrollment-requests",
    ownerKey,
    sanitizeStorageSegment(academicYear),
    sanitizeStorageSegment(semester),
    sanitizeStorageSegment(requirementKey),
    `${Date.now()}-${safeFileName}`,
  ].join("/");

  const { error: uploadError } = await supabase.storage
    .from(ENROLLMENT_REQUEST_ATTACHMENT_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) {
    throw new Error(getErrorMessage(uploadError));
  }

  return {
    name: file.name,
    type: file.type || "file",
    url: await createEnrollmentRequestAttachmentUrl(storagePath),
    storagePath,
    storageBucket: ENROLLMENT_REQUEST_ATTACHMENT_BUCKET,
    uploadedAt: new Date().toISOString(),
  };
};

export const hydrateEnrollmentRequestAttachments = async (
  attachments?: AdminAttachment[],
) => {
  if (!attachments?.length) {
    return attachments;
  }

  return Promise.all(
    attachments.map(async (attachment) => {
      if (!attachment.storagePath) {
        return attachment;
      }

      return {
        ...attachment,
        url: await createEnrollmentRequestAttachmentUrl(
          attachment.storagePath,
          attachment.storageBucket || ENROLLMENT_REQUEST_ATTACHMENT_BUCKET,
        ),
      };
    }),
  );
};

export const hydrateEnrollmentRequestRecordAttachments = async (
  request: EnrollmentRequestRecord,
): Promise<EnrollmentRequestRecord> => ({
  ...request,
  attachments: await hydrateEnrollmentRequestAttachments(request.attachments),
});

const getRequestSortValue = (request: EnrollmentRequestRecord) => {
  const timestamp =
    request.updatedAt || request.enrollmentDate || request.requestDate;
  const parsedValue = Date.parse(timestamp);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const sortEnrollmentRequests = (requests: EnrollmentRequestRecord[]) =>
  [...requests].sort(
    (left, right) =>
      getRequestSortValue(right) - getRequestSortValue(left) ||
      right.requestDate.localeCompare(left.requestDate) ||
      right.id.localeCompare(left.id),
  );

const matchesStudentRequest = (
  request: EnrollmentRequestRecord,
  studentNumber?: string | null,
  trackingNumber?: string | null,
) => {
  if (
    trackingNumber &&
    request.trackingNumber &&
    request.trackingNumber === trackingNumber
  ) {
    return true;
  }

  return Boolean(studentNumber) && request.studentNumber === studentNumber;
};

export const getRegularEnrollmentRequirementItems = () =>
  REGULAR_ENROLLMENT_REQUIREMENTS.map((item) => ({ ...item }));

const mapEnrollmentRequestRow = (
  row: EnrollmentRequestRow,
  branch: string,
): EnrollmentRequestRecord => {
  const resolvedBranch = normalizeBranchName(row.payload?.branch || branch);

  return {
    ...(row.payload ?? {
      id: row.id,
      branch: resolvedBranch,
      studentNumber: row.student_number,
      trackingNumber: row.tracking_number || undefined,
      fullName: "",
      program: "",
      currentYearLevel: "",
      requestedYearLevel: "",
      academicYear: row.academic_year,
      semester: row.semester,
      enrollmentStatus: row.enrollment_status,
      requestDate: new Date().toLocaleDateString(),
    }),
    id: row.id,
    branch: resolvedBranch,
    studentNumber: row.student_number || row.payload?.studentNumber || "",
    trackingNumber:
      row.tracking_number || row.payload?.trackingNumber || undefined,
    academicYear: row.academic_year,
    semester: row.semester,
    enrollmentStatus: row.enrollment_status,
  };
};

const sanitizeEnrollmentRequestAttachments = (attachments?: AdminAttachment[]) =>
  attachments?.map((attachment) => ({
    ...attachment,
    url: attachment.storagePath ? "#" : attachment.url,
  }));

const sanitizeEnrollmentRequestForStorage = (
  request: EnrollmentRequestRecord,
): EnrollmentRequestRecord => ({
  ...request,
  branch: normalizeBranchName(request.branch),
  attachments: sanitizeEnrollmentRequestAttachments(request.attachments),
});

const mergeEnrollmentRequestAttachmentUrls = (
  attachments?: AdminAttachment[],
  referenceAttachments?: AdminAttachment[],
) =>
  attachments?.map((attachment, index) => {
    const referenceAttachment = referenceAttachments?.[index];

    return {
      ...attachment,
      url:
        attachment.url && attachment.url !== "#"
          ? attachment.url
          : referenceAttachment?.storagePath === attachment.storagePath
            ? referenceAttachment?.url || attachment.url
            : attachment.url,
    };
  });

const isSameEnrollmentRequestRecord = (
  left: EnrollmentRequestRecord,
  right: EnrollmentRequestRecord,
) =>
  left.id === right.id ||
  (left.academicYear === right.academicYear &&
    left.semester === right.semester &&
    (matchesStudentRequest(left, right.studentNumber, right.trackingNumber) ||
      matchesStudentRequest(right, left.studentNumber, left.trackingNumber)));

const findEnrollmentRequestIndex = (
  requests: EnrollmentRequestRecord[],
  request: EnrollmentRequestRecord,
) => requests.findIndex((candidate) => isSameEnrollmentRequestRecord(candidate, request));

const shouldSyncLocalEnrollmentRequest = (
  localRequest: EnrollmentRequestRecord,
  remoteRequest?: EnrollmentRequestRecord | null,
) => {
  if (!remoteRequest) {
    return true;
  }

  const localTimestamp = getRequestSortValue(localRequest);
  const remoteTimestamp = getRequestSortValue(remoteRequest);

  if (localTimestamp !== remoteTimestamp) {
    return localTimestamp > remoteTimestamp;
  }

  return (
    JSON.stringify(sanitizeEnrollmentRequestForStorage(localRequest)) !==
    JSON.stringify(sanitizeEnrollmentRequestForStorage(remoteRequest))
  );
};

const listEnrollmentRequestsFromSupabase = async (branch: string) => {
  const { data, error } = await supabase
    .rpc("list_enrollment_requests", {
      p_branch: branch,
    })
    .returns<EnrollmentRequestRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  return sortEnrollmentRequests(
    (Array.isArray(data) ? data : []).map((row) =>
      mapEnrollmentRequestRow(row, branch),
    ),
  );
};

const upsertEnrollmentRequestToSupabase = async (
  request: EnrollmentRequestRecord,
) => {
  const resolvedBranch = normalizeBranchName(request.branch);
  const sanitizedRequest = sanitizeEnrollmentRequestForStorage(request);
  const { data, error } = await supabase
    .rpc("upsert_enrollment_request", {
      p_payload: sanitizedRequest,
    })
    .returns<EnrollmentRequestRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<EnrollmentRequestRow>(data);
  if (!row) {
    throw new Error("Supabase did not return the saved enrollment request.");
  }

  return mapEnrollmentRequestRow(row, resolvedBranch);
};

export const readEnrollmentRequestsForBranch = (branch?: string | null) =>
  sortEnrollmentRequests(
    stripLegacyMockEnrollmentRequestRecords(
      readBranchScopedData<EnrollmentRequestRecord[]>(
        ENROLLMENT_REQUEST_STORAGE_SCOPE,
        normalizeBranchName(branch),
      ) ?? [],
    ),
  );

export const fetchEnrollmentRequests = async (branch?: string | null) => {
  const resolvedBranch = normalizeBranchName(branch);
  const localRequests = readEnrollmentRequestsForBranch(resolvedBranch);
  const remoteRequests = await listEnrollmentRequestsFromSupabase(resolvedBranch);
  const requestsToSync = localRequests.filter((localRequest) => {
    const matchingRemoteRequest =
      remoteRequests.find((remoteRequest) =>
        isSameEnrollmentRequestRecord(localRequest, remoteRequest),
      ) ?? null;

    return shouldSyncLocalEnrollmentRequest(localRequest, matchingRemoteRequest);
  });

  if (requestsToSync.length > 0) {
    await Promise.all(
      requestsToSync.map((request) => upsertEnrollmentRequestToSupabase(request)),
    );
  }

  const nextRequests =
    requestsToSync.length > 0
      ? await listEnrollmentRequestsFromSupabase(resolvedBranch)
      : remoteRequests;

  writeEnrollmentRequestsForBranch(resolvedBranch, nextRequests);
  return nextRequests;
};

export const writeEnrollmentRequestsForBranch = (
  branch: string | null | undefined,
  requests: EnrollmentRequestRecord[],
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const sortedRequests = sortEnrollmentRequests(
    stripLegacyMockEnrollmentRequestRecords(requests),
  );

  writeBranchScopedData(
    ENROLLMENT_REQUEST_STORAGE_SCOPE,
    resolvedBranch,
    sortedRequests,
  );

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(ENROLLMENT_REQUESTS_UPDATED_EVENT, {
        detail: { branch: resolvedBranch },
      }),
    );
  }

  return sortedRequests;
};

export const getEnrollmentRequestForStudent = ({
  branch,
  studentNumber,
  trackingNumber,
  academicYear,
  semester,
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
  academicYear?: string | null;
  semester?: string | null;
}) => {
  const requests = readEnrollmentRequestsForBranch(branch);

  return (
    requests.find((request) => {
      if (!matchesStudentRequest(request, studentNumber, trackingNumber)) {
        return false;
      }

      if (academicYear && request.academicYear !== academicYear) {
        return false;
      }

      if (semester && request.semester !== semester) {
        return false;
      }

      return true;
    }) ?? null
  );
};

export const getLatestEnrollmentRequestForStudent = ({
  branch,
  studentNumber,
  trackingNumber,
  status,
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
  status?: EnrollmentRequestStatus | null;
}) =>
  readEnrollmentRequestsForBranch(branch).find((request) => {
    if (!matchesStudentRequest(request, studentNumber, trackingNumber)) {
      return false;
    }

    if (status && request.enrollmentStatus !== status) {
      return false;
    }

    return true;
  }) ?? null;

export const getLatestApprovedEnrollmentRequestForStudent = ({
  branch,
  studentNumber,
  trackingNumber,
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
}) =>
  getLatestEnrollmentRequestForStudent({
    branch,
    studentNumber,
    trackingNumber,
    status: "Approved",
  });

export const getLatestApprovedIrregularEnrollmentRequestForStudent = ({
  branch,
  studentNumber,
  trackingNumber,
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
}) => {
  const request = getLatestApprovedEnrollmentRequestForStudent({
    branch,
    studentNumber,
    trackingNumber,
  });

  return request?.irregularRequest ? request : null;
};

export const hasLatestApprovedIrregularEnrollmentRequestForStudent = ({
  branch,
  studentNumber,
  trackingNumber,
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
}) =>
  Boolean(
    getLatestApprovedIrregularEnrollmentRequestForStudent({
      branch,
      studentNumber,
      trackingNumber,
    }),
  );

export const saveEnrollmentRequest = async (request: EnrollmentRequestRecord) => {
  const savedRequest = await upsertEnrollmentRequestToSupabase(request);
  const nextRequest: EnrollmentRequestRecord = {
    ...savedRequest,
    attachments: mergeEnrollmentRequestAttachmentUrls(
      savedRequest.attachments,
      request.attachments,
    ),
  };
  const resolvedBranch = normalizeBranchName(nextRequest.branch);
  const existingRequests = readEnrollmentRequestsForBranch(resolvedBranch);
  const existingIndex = findEnrollmentRequestIndex(existingRequests, nextRequest);
  const nextRequests =
    existingIndex >= 0
      ? existingRequests.map((record, index) =>
          index === existingIndex ? nextRequest : record,
        )
      : [nextRequest, ...existingRequests];

  writeEnrollmentRequestsForBranch(resolvedBranch, nextRequests);
  return nextRequest;
};
