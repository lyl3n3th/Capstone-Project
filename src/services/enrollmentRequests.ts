import {
  normalizeBranchName,
  readBranchScopedData,
  writeBranchScopedData,
  type AdminAttachment,
} from "./adminStorage";
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

export const readEnrollmentRequestsForBranch = (branch?: string | null) =>
  sortEnrollmentRequests(
    stripLegacyMockEnrollmentRequestRecords(
      readBranchScopedData<EnrollmentRequestRecord[]>(
        ENROLLMENT_REQUEST_STORAGE_SCOPE,
        normalizeBranchName(branch),
      ) ?? [],
    ),
  );

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

export const saveEnrollmentRequest = (request: EnrollmentRequestRecord) => {
  const resolvedBranch = normalizeBranchName(request.branch);
  const existingRequests = readEnrollmentRequestsForBranch(resolvedBranch);
  const existingIndex = existingRequests.findIndex(
    (record) =>
      record.id === request.id ||
      (matchesStudentRequest(
        record,
        request.studentNumber,
        request.trackingNumber,
      ) &&
        record.academicYear === request.academicYear &&
        record.semester === request.semester),
  );
  const nextRequests =
    existingIndex >= 0
      ? existingRequests.map((record, index) =>
          index === existingIndex ? request : record,
        )
      : [request, ...existingRequests];

  writeEnrollmentRequestsForBranch(resolvedBranch, nextRequests);
  return request;
};
