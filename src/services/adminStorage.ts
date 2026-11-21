Warning: truncated output (original token count: 41987)
Total output lines: 5089

import type {
  AdmissionApplicationSummary,
  AdmissionDiscountSource,
  AdmissionDraft,
} from "../types/application";
import { supabase } from "../lib/supabase";
import { withSignedUrlRequestLimit } from "./storageRequestLimiter";
import {
  fetchBranchDirectory,
  findRegisteredBranch,
  findBranchByStudentPrefix,
} from "./branchDirectory";
import {
  getAdmissionRequirements,
  getEstimatedCollegeTuition,
  normalizeAdmissionYearLevel,
  normalizeBranchCode,
} from "./admission";
import {
  buildEnrollmentSubjectKey,
  type EnrollmentRetakeChoiceGroup,
  type EnrollmentRetakeRequestItem,
} from "./enrollmentLoadPlanner";
import type { StoredStudentGradeRecord } from "./studentGrades";
import { stripLegacyMockStudentRecords } from "./legacyMockData";
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/user";
import {
  toDisplayCapitalization,
  toNameCapitalization,
} from "../utils/textFormatting";

export type AdminBranchName = string;

export type AdminApplicantStatus = "Pending" | "Approved" | "Rejected";

export interface AdminAttachment {
  name: string;
  type: string;
  url: string;
  reviewStatus?: "Pending" | "Approved" | "Rejected";
  storagePath?: string;
  storageBucket?: string;
  uploadedAt?: string;
}

export interface AdminPersonalInformation {
  fullName: string;
  birthDate: string;
  contactNumber: string;
  program: string;
  guardianName: string;
  email: string;
  address: string;
  yearLevel: string;
  guardianContact: string;
  middleName?: string;
  sex?: string;
  civilStatus?: string;
  lastSchoolAttended?: string;
  yearCompletion?: string;
  requestedYearLevel?: string;
  strandOrCourse?: string;
}

export interface AdminEnrolleeRecord {
  recordId?: number;
  id: string;
  trackingNumber: string;
  studentNumber?: string;
  fullName: string;
  program: string;
  yearLevel: string;
  strandOrCourse: string;
  applicationDate: string;
  academicYear?: string;
  documentsSubmitted: number;
  totalDocuments: number;
  status: AdminApplicantStatus;
  branch: string;
  studentStatus: string;
  honorLabel?: string | null;
  honorDiscountPercentage?: number;
  appliedForScholarship?: boolean;
  scholarshipExamScore?: number | null;
  effectiveDiscountPercentage?: number;
  effectiveDiscountSource?: AdmissionDiscountSource;
  requestedOwnSchedule?: boolean;
  ownScheduleRequestStatus?: "Pending" | "Approved" | "Rejected";
  ownScheduleRequestSubmittedAt?: string;
  ownScheduleAcademicYear?: string;
  ownScheduleSemester?: string;
  ownScheduleDecisionAt?: string;
  rejectionReason?: string;
  personalInfo: AdminPersonalInformation;
  attachments?: AdminAttachment[];
  convertedAt?: string;
  archivedAt?: string;
  archivedByRole?: "Admin" | "Registrar";
}

export interface StudentStorageRecord {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  importAcademicYear?: string;
  importSemester?: string;
  importAcademicStanding?: "Regular" | "Irregular";
  lastSchoolAttended?: string;
  yearCompletion?: string;
  recordId?: number;
  id: string;
  name: string;
  program: string;
  yearLevel: string;
  section?: string;
  shsTrackType?: string;
  strandOrCourse?: string;
  documentSubmitted: string;
  contact: string;
  email: string;
  address: string;
  status: "Complete" | "Incomplete" | "Archived" | "Graduated";
  branch: string;
  trackingNumber?: string;
  studentStatus?: string;
  requestedOwnSchedule?: boolean;
  ownScheduleRequestStatus?: "Pending" | "Approved" | "Rejected";
  ownScheduleAcademicYear?: string;
  ownScheduleSemester?: string;
  ownScheduleSelectionStatus?:
    | "Not Submitted"
    | "Pending Approval"
    | "Approved"
    | "Rejected";
  birthDate?: string;
  guardianName?: string;
  guardianContact?: string;
  gender?: "Male" | "Female";
  civilStatus?: string;
}

interface DeletedStoredStudentMarker {
  branch: string;
  studentNumber?: string;
  trackingNumber?: string;
  name?: string;
  deletedAt: string;
}

export interface StudentPortalSubject {
  id: string;
  code: string;
  title: string;
  units?: number;
  instructorId?: string;
  section?: string;
  schedule: string;
  room: string;
  professor: string;
  days: string;
  time: string;
  semester: string;
  academicYear: string;
}

export interface StudentPortalCredentialItem {
  code: string;
  name: string;
  isSubmitted: boolean;
  reviewStatus: "Pending" | "Approved" | "Rejected";
  statusLabel: string;
  url?: string;
}

export interface StudentPortalCredentialSummary {
  total: number;
  submitted: number;
  pending: number;
  approved: number;
  rejected: number;
  overallStatus: string;
}

export interface StudentSubjectPlanItem {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  units?: number;
}

export interface StudentScheduledAssignmentSlot {
  day: string;
  startTime: string;
  endTime: string;
  room: string;
}

export interface StudentScheduledAssignmentItem {
  assignmentId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  units?: number;
  instructorId?: string;
  instructorName?: string;
  sectionId?: string;
  sectionCode?: string;
  schedule: StudentScheduledAssignmentSlot[];
  academicYear: string;
  semester: string;
}

export interface StudentSubjectPlanRecord {
  id: string;
  enrolleeId?: string;
  trackingNumber?: string;
  studentNumber?: string;
  semester: string;
  academicYear: string;
  assignedSubjects: StudentSubjectPlanItem[];
  creditedSubjects: StudentSubjectPlanItem[];
  scheduledAssignments?: StudentScheduledAssignmentItem[];
  notes?: string;
  updatedAt: string;
  source:
    | "transferee_validation"
    | "irregular_assignment"
    | "student_schedule_request"
    | "enrollment_request";
}

export interface StudentScheduleChoiceGroup {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  units?: number;
  assignmentOptions: StudentScheduledAssignmentItem[];
}

export interface EnrollmentSectionChoice {
  id: string;
  code: string;
  program: string;
  yearLevel: string;
  semester: string;
  strand?: string;
  section?: string;
  currentEnrollees: number;
  maxCapacity: number;
  availableSlots: number;
  scheduledAssignmentCount: number;
}

export interface StudentSectionChoice {
  id: string;
  code: string;
  program: string;
  yearLevel: string;
  semester: string;
  strand?: string;
  section?: string;
  currentEnrollees: number;
  maxCapacity: number;
  hasCapacityLimit: boolean;
  availableSlots: number | null;
  isFull: boolean;
}

export interface StudentSectionUpdateResult {
  student: StudentStorageRecord;
  previousSection: string;
  nextSection: string;
  didChange: boolean;
}

export interface StudentScheduleSelectionRequestRecord {
  id: string;
  studentNumber: string;
  trackingNumber?: string;
  studentName: string;
  branch: string;
  program: string;
  yearLevel: string;
  strandOrCourse?: string;
  academicYear: string;
  semester: string;
  status: "Pending" | "Approved" | "Rejected";
  selections: StudentScheduledAssignmentItem[];
  submittedAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedByRole?: "Admin" | "Registrar";
}

type StoredAcademicSubject = {
  id: string;
  code: string;
  name: string;
  units?: number;
  program: string;
  yearLevel: string;
  semester: string;
  strand?: string;
  prerequisiteSubjectIds?: string[];
};

type StoredSchedule = {
  day: string;
  startTime: string;
  endTime: string;
  room: string;
};

type StoredSubjectAssignment = {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  instructorId: string;
  instructorName: string;
  sectionId: string;
  sectionCode: string;
  schedule: StoredSchedule[];
  academicYear: string;
  semester: string;
};

type StoredClassSection = {
  id: string;
  code: string;
  program?: string;
  yearLevel?: string;
  semester?: string;
  strand?: string;
  section?: string;
  currentEnrollees?: number;
  maxCapacity?: number;
  enrolleeIds?: string[];
};

type StoredEnrollmentIrregularRequestRecord = {
  mode: "own_schedule" | "section_assignment";
  requestedSectionId?: string;
  requestedSectionCode?: string;
};

type StoredEnrollmentRequestRecord = {
  id: string;
  branch: string;
  studentNumber: string;
  trackingNumber?: string;
  requestedYearLevel: string;
  academicYear: string;
  semester: string;
  enrollmentStatus: "Pending" | "Approved" | "Rejected";
  requestDate: string;
  enrollmentDate?: string;
  updatedAt?: string;
  irregularRequest?: StoredEnrollmentIrregularRequestRecord;
};

const STUDENT_STORAGE_KEY = "aics-students";
const DELETED_STUDENT_STORAGE_KEY = "aics-deleted-students";
const BRANCH_STORAGE_PREFIX = "aics-admin";
const DEFAULT_BRANCH: AdminBranchName = "Bacoor";
const DEFAULT_COLLEGE_COURSE = "BSE - Bachelor of Entrepreneurship";
const DEFAULT_SECTION_SEMESTER = "1st Semester";
const STORED_SEMESTER_ORDER = [
  "1st Semester",
  "2nd Semester",
  "Summer",
] as const;
const STUDENT_NUMBER_FLOOR = 261000;
const STUDENT_NUMBER_SUFFIX_LENGTH = 6;
const REQUIREMENTS_BUCKET = "admission-requirements";
const ENROLLMENT_REQUEST_STORAGE_SCOPE = "enrollment-requests";
export const STORED_STUDENTS_UPDATED_EVENT = "aics:stored-students-updated";

type SupabaseRequirementFileRow = {
  file_name: string;
  mime_type: string | null;
  requirement_code: string;
  requirement_name: string;
  storage_bucket: string;
  storage_path: string;
  uploaded_at: string;
};

type SupabaseAdminAdmissionQueueRow = {
  academic_year?: string | null;
  address: string;
  application_id: string;
  application_status: string;
  applied_for_scholarship: boolean;
  branch_code: string;
  branch_name: string;
  civil_status: string;
  created_at: string;
  current_step: number;
  email: string;
  effective_discount_percentage: number | string;
  effective_discount_source: AdmissionDiscountSource | string | null;
  first_name: string;
  honor_discount_percentage: number | string;
  honor_label: string | null;
  last_name: string;
  last_school_attended?: string | null;
  middle_name: string | null;
  phone_number: string;
  program_level: string;
  program_name: string;
  requested_year_level: string | null;
  rejection_reason: string | null;
  requirement_files: SupabaseRequirementFileRow[] | null;
  requirements_uploaded_at: string | null;
  requested_own_schedule: boolean;
  scholarship_exam_score: number | string | null;
  sex: string;
  student_status_label: string;
  submitted_at: string | null;
  track_name: string;
  tracking_number: string;
  updated_at: string;
  year_completion: number;
  student_number: string | null;
  portal_account_registered: boolean | null;
  own_schedule_request_status: string | null;
  own_schedule_request_submitted_at: string | null;
  own_schedule_request_decided_at: string | null;
};

type SupabaseAdmissionAcademicYearRow = {
  academic_year: string | null;
  tracking_number: string;
};

const readStorageItem = <T,>(key: string): T | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch (error) {
    console.error(`Failed to parse storage key: ${key}`, error);
    return null;
  }
};

const writeStorageItem = (key: string, value: unknown) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
};

const toIsoDateString = (value?: string | null) => {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toISOString().slice(0, 10);
};

const toOptionalNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const splitFullName = (fullName: string) => {
  const normalizedName = fullName.trim().replace(/\s+/g, " ");
  const parts = normalizedName.split(" ").filter(Boolean);

  if (parts.length < 2) {
    return {
      firstName: normalizedName,
      middleName: "",
      lastName: "",
    };
  }

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const middleName = parts.slice(1, -1).join(" ");

  return { firstName, middleName, lastName };
};

const mapProgramNameToAdminProgram = (programName: string) =>
  programName === "Senior High School" ? "SHS" : "College";

const mapAdminProgramToAdmissionProgram = (program: string) =>
  program === "SHS" ? "Senior High School" : "College";

const getInitialYearLevel = (
  program: string,
  studentStatus: string,
  requestedYearLevel?: string | null,
) => {
  const programName = mapAdminProgramToAdmissionProgram(program);
  const normalizedRequestedYearLevel = normalizeAdmissionYearLevel(
    programName,
    requestedYearLevel,
  );

  if (studentStatus === "Transferee" && normalizedRequestedYearLevel) {
    return normalizedRequestedYearLevel;
  }

  if (program === "SHS") {
    return "Grade 11";
  }

  if (studentStatus === "Transferee") {
    return "1st Year";
  }

  return "1st Year";
};

const resolveShsTrackType = (strandOrCourse: string) => {
  const normalizedValue = strandOrCourse.toLowerCase();

  if (normalizedValue.includes("ict") || normalizedValue.includes("industrial")) {
    return "Technical Professional Track";
  }

  return "Academic Track";
};

export const normalizeBranchName = (branch?: string | null): AdminBranchName => {
  const trimmedBranch = branch?.trim();
  const normalizedBranch = trimmedBranch?.toLowerCase();

  const registered = trimmedBranch && findRegisteredBranch(trimmedBranch);
  if (registered) return registered.name;

  if (!normalizedBranch) {
    return DEFAULT_BRANCH;
  }

  if (normalizedBranch === "taytay" || normalizedBranch === "taytay branch") {
    return "Taytay";
  }

  if (
    normalizedBranch === "gma" ||
    normalizedBranch.includes("general mariano alvarez")
  ) {
    return "GMA";
  }

  if (normalizedBranch === "bacoor" || normalizedBranch === "bacoor branch") {
    return "Bacoor";
  }

  return toDisplayCapitalization(trimmedBranch || DEFAULT_BRANCH);
};

export const getStudentNumberPrefix = (branch?: string | null) => {
  const normalizedBranch = normalizeBranchName(branch);
  const registered = findRegisteredBranch(normalizedBranch);
  if (!registered) throw new Error(`Student-number settings for ${normalizedBranch} are unavailable. Reload the page.`);
  return registered.student_number_prefix;
};

export const getBranchFromStudentNumber = (
  studentNumber?: string | null,
): AdminBranchName | null => {
  const sanitizedValue = studentNumber
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!sanitizedValue) {
    return null;
  }

  const prefixMatch = sanitizedValue.match(/^([A-Z]{3})/);

  if (!prefixMatch) {
    return null;
  }

  return findBranchByStudentPrefix(prefixMatch[1])?.name ?? null;
};

export interface InstructorEvaluationStatusRecord {
  instructorId: string;
  isOpen: boolean;
  updatedAt: string;
}

export type InstructorEvaluationStatusMap = Record<
  string,
  InstructorEvaluationStatusRecord
>;

export interface EvaluationQuestionRecord {
  id: string;
  text: string;
  type?: "rating" | "essay";
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationQuestionCategoryRecord {
  id: string;
  name: string;
  questions: EvaluationQuestionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface InstructorEvaluationSubmissionRecord {
  id: string;
  instructorId: string;
  instructorName: string;
  studentNumber: string;
  studentName: string;
  yearLevel: string;
  section: string;
  academicYear: string;
  semester: string;
  subjectIds: string[];
  subjectCodes: string[];
  responses: Record<string, number | string>;
  submittedAt: string;
}

const getStudentNumberSequenceValue = (
  studentNumber?: string | null,
  branch?: string | null,
) => {
  const normalizedStudentNumber = studentNumber?.trim().toUpperCase();

  if (!normalizedStudentNumber) {
    return null;
  }

  const formattedMatch = normalizedStudentNumber.match(/^([A-Z]{3})-(\d{6})$/);

  if (formattedMatch) {
    const [, prefix, suffix] = formattedMatch;

    if (branch && prefix !== getStudentNumberPrefix(branch)) {
      return null;
    }

    const parsedValue = Number.parseInt(suffix, 10);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  const digitsOnly = normalizedStudentNumber.replace(/\D/g, "");

  if (digitsOnly.length !== STUDENT_NUMBER_SUFFIX_LENGTH) {
    return null;
  }

  const parsedValue = Number.parseInt(digitsOnly, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const studentNumbersMatch = (
  leftValue?: string | null,
  rightValue?: string | null,
  branch?: string | null,
) => {
  if (!leftValue || !rightValue) {
    return false;
  }

  const leftSequence = getStudentNumberSequenceValue(leftValue, branch);
  const rightSequence = getStudentNumberSequenceValue(rightValue, branch);

  if (leftSequence !== null && rightSequence !== null) {
    return leftSequence === rightSequence;
  }

  return leftValue.trim().toUpperCase() === rightValue.trim().toUpperCase();
};

export const formatStudentNumber = (
  branch: string | null | undefined,
  value: number | string,
) => {
  const prefix = getStudentNumberPrefix(branch);
  const digitsOnly = String(value).replace(/\D/g, "").slice(0, 6);
  const paddedSuffix = digitsOnly.padStart(STUDENT_NUMBER_SUFFIX_LENGTH, "0");

  return `${prefix}-${paddedSuffix}`;
};

export const normalizeStudentNumberInput = (
  value: string,
  branch?: string | null,
) => {
  const trimmedValue = value.trim().toUpperCase();

  if (!trimmedValue) {
    return "";
  }

  const digitsOnly = trimmedValue
    .replace(/\D/g, "")
    .slice(0, STUDENT_NUMBER_SUFFIX_LENGTH);

  const explicitNumber = trimmedValue.replace(/[^A-Z0-9]/g, "").match(/^([A-Z]{3})(\d{1,6})$/);
  if (explicitNumber) return `${explicitNumber[1]}-${explicitNumber[2]}`;

  if (branch) {
    if (!digitsOnly) {
      return "";
    }

    return formatStudentNumber(branch, digitsOnly);
  }

  const sanitizedValue = trimmedValue.replace(/[^A-Z0-9]/g, "");
  const prefixedMatch = sanitizedValue.match(/^([A-Z]{0,3})(\d{0,6})$/);

  if (prefixedMatch && prefixedMatch[1]) {
    const [, prefix, suffix] = prefixedMatch;

    if (prefix.length === 3) {
      return suffix ? `${prefix}-${suffix}` : prefix;
    }

    return `${prefix}${suffix}`;
  }

  return digitsOnly;
};

export const isValidStudentNumber = (
  value: string,
  branch?: string | null,
) => {
  const normalizedValue = normalizeStudentNumberInput(value, branch);

  if (!branch) {
    const match = normalizedValue.match(/^([A-Z]{3})-\d{6}$/);
    return Boolean(match && findBranchByStudentPrefix(match[1])?.is_active);
  }

  if (!findRegisteredBranch(branch)?.is_active) return false;
  const prefix = getStudentNumberPrefix(branch);
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(
    `^${escapedPrefix}-\\d{${STUDENT_NUMBER_SUFFIX_LENGTH}}$`,
  ).test(normalizedValue);
};

export const getStudentNumberExample = (branch?: string | null) =>
  branch
    ? formatStudentNumber(branch, STUDENT_NUMBER_FLOOR + 1)
    : "BAC-261001";

export const getBranchStorageKey = (scope: string, branch?: string | null) =>
  `${BRANCH_STORAGE_PREFIX}:${scope}:${normalizeBranchName(branch).toLowerCase()}`;

export const getKnownAdminBranches = (): AdminBranchName[] => {
  const branches = new Set<AdminBranchName>([DEFAULT_BRANCH]);

  readStoredStudents().forEach((student) => {
    branches.add(normalizeBranchName(student.branch));
  });

  if (typeof window !== "undefined") {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);

      if (!storageKey?.startsWith(`${BRANCH_STORAGE_PREFIX}:`)) {
        continue;
      }

      const branch = storageKey.split(":").slice(2).join(":");
      if (branch) {
        branches.add(normalizeBranchName(branch));
      }
    }
  }

  return Array.from(branches).sort((left, right) => left.localeCompare(right));
};

export const readBranchScopedData = <T,>(
  scope: string,
  branch?: string | null,
): T | null => readStorageItem<T>(getBranchStorageKey(scope, branch));

const SUPABASE_MIRRORED_BRANCH_SCOPES = new Set([
  "enrollees",
  "section-assignments",
  "transferee-evaluations",
  "instructor-departments",
  "instructor-grade-change-requests",
  "instructor-grade-change-error-history",
  "grade-change-request-settings",
]);

// Student plans and schedule requests have normalized Supabase tables of their
// own. Keep their branch-scoped cache in local storage without also writing a
// second, whole-snapshot copy to branch_local_storage_records.
const MAX_CONCURRENT_BRANCH_SCOPED_SYNCS = 4;

type PendingBranchScopedSync = {
  branch: string;
  scope: string;
  payload: unknown;
  queued: boolean;
  inFlight: boolean;
};

const pendingBranchScopedSyncs = new Map<string, PendingBranchScopedSync>();
let activeBranchScopedSyncs = 0;
let branchScopedSyncDrainScheduled = false;

const drainBranchScopedSyncQueue = () => {
  for (const [key, sync] of pendingBranchScopedSyncs) {
    if (activeBranchScopedSyncs >= MAX_CONCURRENT_BRANCH_SCOPED_SYNCS) {
      return;
    }
    if (!sync.queued || sync.inFlight) {
      continue;
    }

    sync.queued = false;
    sync.inFlight = true;
    activeBranchScopedSyncs += 1;
    const payload = sync.payload;

    void (async () => {
      try {
        const { error } = await supabase.rpc("upsert_branch_local_storage_record", {
          p_branch: sync.branch,
          p_scope: sync.scope,
          p_payload: payload,
        });
        if (error) {
          console.warn(
            `Unable to sync ${sync.scope} to Supabase; local cache was updated.`,
            error,
          );
        }
      } catch (error) {
        console.warn(
          `Unable to sync ${sync.scope} to Supabase; local cache was updated.`,
          error,
        );
      } finally {
        sync.inFlight = false;
        activeBranchScopedSyncs -= 1;

        if (!sync.queued && pendingBranchScopedSyncs.get(key) === sync) {
          pendingBranchScopedSyncs.delete(key);
        }
        drainBranchScopedSyncQueue();
      }
    })();
  }
};

const scheduleBranchScopedSyncDrain = () => {
  if (branchScopedSyncDrainScheduled) {
    return;
  }
  branchScopedSyncDrainScheduled = true;
  queueMicrotask(() => {
    branchScopedSyncDrainScheduled = false;
    drainBranchScopedSyncQueue();
  });
};

const queueBranchScopedSync = (scope: string, branch: string, payload: unknown) => {
  const key = JSON.stringify([branch, scope]);
  let sync = pendingBranchScopedSyncs.get(key);

  if (!sync) {
    sync = {
      branch,
      scope,
      payload,
      queued: true,
      inFlight: false,
    };
    pendingBranchScopedSyncs.set(key, sync);
  } else {
    sync.payload = payload;
    sync.queued = true;
  }

  scheduleBranchScopedSyncDrain();
};

const getBranchScopeSupabaseErrorMessage = (error: {
  details?: string | null;
  hint?: string | null;
  message: string;
}) =>
  error.details
    ? `${error.message} ${error.details}`.trim()
    : error.hint
      ? `${error.message} ${error.hint}`.trim()
      : error.message;

export const fetchAndCacheBranchScopedData = async <T,>(
  scope: string,
  branch?: string | null,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase.rpc("get_branch_local_storage_record", {
    p_branch: resolvedBranch,
    p_scope: scope,
  });

  if (error) {
    throw new Error(getBranchScopeSupabaseErrorMessage(error));
  }

  if (data === null || typeof data === "undefined") {
    return readBranchScopedData<T>(scope, resolvedBranch);
  }

  writeStorageItem(getBranchStorageKey(scope, resolvedBranch), data);
  return data as T;
};

export const writeBranchScopedData = (
  scope: string,
  branch: string | null | undefined,
  value: unknown,
  options: { skipSupabaseSync?: boolean } = {},
) => {
  const resolvedBranch = normalizeBranchName(branch);
  writeStorageItem(getBranchStorageKey(scope, resolvedBranch), value);

  if (options.skipSupabaseSync || !SUPABASE_MIRRORED_BRANCH_SCOPES.has(scope)) {
    return;
  }

  queueBranchScopedSync(scope, resolvedBranch, value);
};

const INSTRUCTOR_EVALUATION_STATUS_SCOPE = "instructor-evaluations";
const EVALUATION_QUESTIONNAIRE_SCOPE = "evaluation-questionnaire";
const EVALUATION_SUBMISSIONS_SCOPE = "evaluation-submissions";
export const INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT =
  "aics:instructor-evaluation-submissions-updated";

export const readInstructorEvaluationStatuses = (
  branch?: string | null,
): InstructorEvaluationStatusMap =>
  readBranchScopedData<InstructorEvaluationStatusMap>(
    INSTRUCTOR_EVALUATION_STATUS_SCOPE,
    branch,
  ) ?? {};

export const setInstructorEvaluationStatus = ({
  branch,
  instructorId,
  isOpen,
}: {
  branch?: string | null;
  instructorId: string;
  isOpen: boolean;
}) => {
  const nextStatuses = {
    ...readInstructorEvaluationStatuses(branch),
    [instructorId]: {
      instructorId,
      isOpen,
      updatedAt: new Date().toISOString(),
    },
  };

  writeBranchScopedData(
    INSTRUCTOR_EVALUATION_STATUS_SCOPE,
    branch,
    nextStatuses,
  );

  return nextStatuses;
};

export const fetchInstructorEvaluationStatuses = async (
  branch?: string | null,
): Promise<InstructorEvaluationStatusMap> => {
  const normalizedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .from("instructor_evaluation_statuses")
    .select("instructor_id,is_open,updated_at")
    .eq("branch", normalizedBranch);

  if (error) {
    throw new Error(error.message);
  }

  const statuses = (data ?? []).reduce<InstructorEvaluationStatusMap>(
    (nextStatuses, row) => ({
      ...nextStatuses,
      [row.instructor_id]: {
        instructorId: row.instructor_id,
        isOpen: Boolean(row.is_open),
        updatedAt: row.updated_at || new Date().toISOString(),
      },
    }),
    {},
  );

  writeBranchScopedData(INSTRUCTOR_EVALUATION_STATUS_SCOPE, branch, statuses);
  return statuses;
};

export const saveInstructorEvaluationStatusToBackend = async ({
  branch,
  instructorId,
  isOpen,
}: {
  branch?: string | null;
  instructorId: string;
  isOpen: boolean;
}) => {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("instructor_evaluation_statuses")
    .upsert(
      {
        branch: normalizeBranchName(branch),
        instructor_id: instructorId,
        is_open: isOpen,
        updated_at: updatedAt,
      },
      { onConflict: "branch,instructor_id" },
    );

  if (error) {
    throw new Error(error.message);
  }
};

export const readEvaluationQuestionnaire = (
  branch?: string | null,
): EvaluationQuestionCategoryRecord[] =>
  readBranchScopedData<EvaluationQuestionCategoryRecord[]>(
    EVALUATION_QUESTIONNAIRE_SCOPE,
    branch,
  ) ?? [];

export const writeEvaluationQuestionnaire = (
  branch: string | null | undefined,
  categories: EvaluationQuestionCategoryRecord[],
) => {
  writeBranchScopedData(EVALUATION_QUESTIONNAIRE_SCOPE, branch, categories);
  return categories;
};

export const fetchEvaluationQuestionnaire = async (
  branch?: string | null,
): Promise<EvaluationQuestionCategoryRecord[]> => {
  const normalizedBranch = normalizeBranchName(branch);
  const { data: categories, error: categoryError } = await supabase
    .from("evaluation_questionnaire_categories")
    .select("id,name,created_at,updated_at,sort_order")
    .eq("branch", normalizedBranch)
    .order("sort_order", { ascending: true });

  if (categoryError) {
    throw new Error(categoryError.message);
  }

  const categoryIds = (categories ?? []).map((category) => category.id);
  const { data: questions, error: questionError } = await supabase
    .from("evaluation_questionnaire_questions")
    .select("id,category_id,text,question_type,created_at,updated_at,sort_order")
    .eq("branch", normalizedBranch)
    .in("category_id", categoryIds.length > 0 ? categoryIds : [""]);

  if (questionError) {
    throw new Error(questionError.message);
  }

  const questionsByCategory = new Map<string, EvaluationQuestionRecord[]>();

  (questions ?? [])
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    .forEach((question) => {
      const existingQuestions = questionsByCategory.get(question.category_id) ?? [];
      existingQuestions.push({
        id: question.id,
        text: question.text,
        type: question.question_type === "essay" ? "essay" : "rating",
        createdAt: question.created_at,
        updatedAt: question.updated_at,
      });
      questionsByCategory.set(question.category_id, existingQuestions);
    });

  const questionnaire = (categories ?? []).map((category) => ({
    id: category.id,
    name: category.name,
    questions: questionsByCategory.get(category.id) ?? [],
    createdAt: category.created_at,
    updatedAt: category.updated_at,
  }));

  writeEvaluationQuestionnaire(branch, questionnaire);
  return questionnaire;
};

export const saveEvaluationQuestionnaireToBackend = async (
  branch: string | null | undefined,
  categories: EvaluationQuestionCategoryRecord[],
) => {
  const normalizedBranch = normalizeBranchName(branch);
  const { data: existingCategories, error: existingCategoryError } =
    await supabase
      .from("evaluation_questionnaire_categories")
      .select("id")
      .eq("branch", normalizedBranch);

  if (existingCategoryError) {
    throw new Error(existingCategoryError.message);
  }

  const nextCategoryIds = new Set(categories.map((category) => category.id));
  const staleCategoryIds = (existingCategories ?? [])
    .map((category) => category.id)
    .filter((categoryId) => !nextCategoryIds.has(categoryId));

  if (staleCategoryIds.length > 0) {
    const { error } = await supabase
      .from("evaluation_questionnaire_categories")
      .delete()
      .in("id", staleCategoryIds);

    if (error) {
      throw new Error(error.message);
    }
  }

  if (categories.length > 0) {
    const { error: categoryError } = await supabase
      .from("evaluation_questionnaire_categories")
      .upsert(
        categories.map((category, index) => ({
          id: category.id,
          branch: normalizedBranch,
          name: category.name,
          sort_order: index,
          created_at: category.createdAt,
          updated_at: category.updatedAt,
        })),
      );

    if (categoryError) {
      throw new Error(categoryError.message);
    }
  }

  const nextQuestionIds = new Set(
    categories.flatMap((category) =>
      category.questions.map((question) => question.id),
    ),
  );
  const { data: existingQuestions, error: existingQuestionError } =
    await supabase
      .from("evaluation_questionnaire_questions")
      .select("id")
      .eq("branch", normalizedBranch);

  if (existingQuestionError) {
    throw new Error(existingQuestionError.message);
  }

  const staleQuestionIds = (existingQuestions ?? [])
    .map((question) => question.id)
    .filter((questionId) => !nextQuestionIds.has(questionId));

  if (staleQuestionIds.length > 0) {
    const { error } = await supabase
      .from("evaluation_questionnaire_questions")
      .delete()
      .in("id", staleQuestionIds);

    if (error) {
      throw new Error(error.message);
    }
  }

  const questionRows = categories.flatMap((category) =>
    category.questions.map((question, index) => ({
      id: question.id,
      category_id: category.id,
      branch: normalizedBranch,
      text: question.text,
      question_type: question.type || "rating",
      sort_order: index,
      created_at: question.createdAt,
      updated_at: question.updatedAt,
    })),
  );

  if (questionRows.length > 0) {
    const { error } = await supabase
      .from("evaluation_questionnaire_questions")
      .upsert(questionRows);

    if (error) {
      throw new Error(error.message);
    }
  }
};

export const readInstructorEvaluationSubmissions = (
  branch?: string | null,
): InstructorEvaluationSubmissionRecord[] =>
  readBranchScopedData<InstructorEvaluationSubmissionRecord[]>(
    EVALUATION_SUBMISSIONS_SCOPE,
    branch,
  ) ?? [];

export const saveInstructorEvaluationSubmission = (
  branch: string | null | undefined,
  submission: InstructorEvaluationSubmissionRecord,
) => {
  const existingSubmissions = readInstructorEvaluationSubmissions(branch);
  const nextSubmissions = [
    ...existingSubmissions.filter((record) => record.id !== submission.id),
    submission,
  ];

  writeBranchScopedData(EVALUATION_SUBMISSIONS_SCOPE, branch, nextSubmissions);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT),
    );
  }

  return nextSubmissions;
};

export const fetchInstructorEvaluationSubmissions = async (
  branch?: string | null,
): Promise<InstructorEvaluationSubmissionRecord[]> => {
  const normalizedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .from("instructor_evaluation_submissions")
    .select("*")
    .eq("branch", normalizedBranch);

  if (error) {
    throw new Error(error.message);
  }

  const submissions = (data ?? []).map((row) => ({
    id: row.id,
    instructorId: row.instructor_id,
    instructorName: row.instructor_name,
    studentNumber: row.student_number,
    studentName: row.student_name,
    yearLevel: row.year_level,
    section: row.section,
    academicYear: row.academic_year,
    semester: row.semester,
    subjectIds: row.subject_ids ?? [],
    subjectCodes: row.subject_codes ?? [],
    responses: row.responses ?? {},
    submittedAt: row.submitted_at,
  }));

  writeBranchScopedData(EVALUATION_SUBMISSIONS_SCOPE, branch, submissions);
  return submissions;
};

export const saveInstructorEvaluationSubmissionToBackend = async (
  branch: string | null | undefined,
  submission: InstructorEvaluationSubmissionRecord,
) => {
  const { error } = await supabase
    .from("instructor_evaluation_submissions")
    .upsert({
      id: submission.id,
      branch: normalizeBranchName(branch),
      instructor_id: submission.instructorId,
      instructor_name: submission.instructorName,
      student_number: submission.studentNumber,
      student_name: submission.studentName,
      year_level: submission.yearLevel,
      section: submission.section,
      academic_year: submission.academicYear,
      semester: submission.semester,
      subject_ids: submission.subjectIds,
      subject_codes: submission.subjectCodes,
      responses: submission.responses,
      submitted_at: submission.submittedAt,
    });

  if (error) {
    throw new Error(error.message);
  }
};

export const getCurrentSession = () =>
  readStorageItem<AuthSession>(AUTH_STORAGE_KEY);

export const getCurrentBranch = () =>
  normalizeBranchName(getCurrentSession()?.user.branch);

const normalizeDeletedStudentMarkerValue = (value?: string | null) =>
  (value || "").trim().toUpperCase();

const readDeletedStoredStudentMarkers = (): DeletedStoredStudentMarker[] =>
  readStorageItem<DeletedStoredStudentMarker[]>(DELETED_STUDENT_STORAGE_KEY) ?? [];

const writeDeletedStoredStudentMarkers = (
  markers: DeletedStoredStudentMarker[],
) => {
  const markerMap = new Map<string, DeletedStoredStudentMarker>();

  markers.forEach((marker) => {
    const branch = normalizeBranchName(marker.branch);
    const studentNumber = normalizeDeletedStudentMarkerValue(
      marker.studentNumber,
    );
    const trackingNumber = normalizeDeletedStudentMarkerValue(
      marker.trackingNumber,
    );
    if (!studentNumber && !trackingNumber) {
      return;
    }

    const key = [branch, studentNumber, trackingNumber].join("::");
    markerMap.set(key, {
      branch,
      studentNumber: studentNumber || undefined,
      trackingNumber: trackingNumber || undefined,
      deletedAt: marker.deletedAt || new Date().toISOString(),
    });
  });

  writeStorageItem(DELETED_STUDENT_STORAGE_KEY, Array.from(markerMap.values()));
};

export const isStoredStudentDeleted = (
  student: Pick<
    StudentStorageRecord,
    "branch" | "id" | "trackingNumber" | "name"
  > &
    Partial<Pick<StudentStorageRecord, "status">>,
) => {
  const branch = normalizeBranchName(student.branch);
  const studentNumber = normalizeDeletedStudentMarkerValue(student.id);
  const trackingNumber = normalizeDeletedStudentMarkerValue(student.trackingNumber);

  // Names are not unique. Ignore name matches in both new and legacy markers.
  return readDeletedStoredStudentMarkers().some((marker) => {
    if (normalizeBranchName(marker.branch) !== branch) {
      return false;
    }

    const markerStudentNumber = normalizeDeletedStudentMarkerValue(
      marker.studentNumber,
    );
    const markerTrackingNumber = normalizeDeletedStudentMarkerValue(
      marker.trackingNumber,
    );
    return Boolean(
      (studentNumber && markerStudentNumber === studentNumber) ||
        (trackingNumber && markerTrackingNumber === trackingNumber),
    );
  });
};

export const rememberDeletedStoredStudent = (
  student: Pick<StudentStorageRecord, "branch" | "id" | "trackingNumber" | "name">,
) => {
  writeDeletedStoredStudentMarkers([
    ...readDeletedStoredStudentMarkers(),
    {
      branch: normalizeBranchName(student.branch),
      studentNumber: student.id,
      trackingNumber: student.trackingNumber,
      deletedAt: new Date().toISOString(),
    },
  ]);
};

export const forgetDeletedStoredStudent = (
  student: Pick<StudentStorageRecord, "branch" | "id" | "trackingNumber" | "name">,
) => forgetDeletedStoredStudents([student]);

// A record returned by the shared database may be a newly imported student
// reusing a deleted student's number. Browser markers only protect cached data.
export const forgetDeletedStoredStudents = (
  students: Pick<StudentStorageRecord, "branch" | "id" | "trackingNumber" | "name">[],
) => {
  if (!students.length) return;
  const identities = new Set<string>();
  for (const student of students) {
    const branch = normalizeBranchName(student.branch);
    const studentNumber = normalizeDeletedStudentMarkerValue(stu…21987 tokens truncated…el,
        semester: normalizedSemester,
        strand: section.strand,
        section: section.section,
        currentEnrollees,
        maxCapacity,
        availableSlots: Math.max(maxCapacity - currentEnrollees, 0),
        scheduledAssignmentCount,
      };
    })
    .sort(
      (left, right) =>
        left.code.localeCompare(right.code) ||
        right.availableSlots - left.availableSlots,
    );
};

export const getStudentSectionChoices = ({
  branch,
  program,
  yearLevel,
  strandOrCourse,
  currentSectionCode,
}: {
  branch?: string | null;
  program: string;
  yearLevel: string;
  strandOrCourse?: string | null;
  currentSectionCode?: string | null;
}): StudentSectionChoice[] => {
  const resolvedBranch = normalizeBranchName(branch);
  const normalizedCurrentSectionCode =
    normalizeStoredSectionCode(currentSectionCode);
  const storedSections =
    readBranchScopedData<StoredClassSection[]>("class-sections", resolvedBranch) ??
    [];
  const studentSectionCounts = getStoredStudentSectionCounts(
    readStoredStudents(),
    resolvedBranch,
  );
  const storedAssignments =
    readBranchScopedData<StoredSubjectAssignment[]>(
      "subject-assignments",
      resolvedBranch,
    ) ?? [];

  return storedSections
    .filter((section) => {
      const sectionProgram = section.program || program;
      const sectionYearLevel = section.yearLevel || yearLevel;
      const sectionStrandOrCourse =
        sectionProgram === "College"
          ? section.strand || DEFAULT_COLLEGE_COURSE
          : section.strand || "All";

      return (
        normalizeStoredSectionCode(section.code) === normalizedCurrentSectionCode ||
        (sectionProgram === program &&
          yearLevelsMatch(sectionYearLevel, yearLevel) &&
          matchesStrandOrCourse(sectionStrandOrCourse, strandOrCourse))
      );
    })
    .map((section) => {
      const currentEnrollees =
        studentSectionCounts.get(normalizeStoredSectionCode(section.code)) ?? 0;
      const parsedMaxCapacity = Number(section.maxCapacity ?? 0);
      const hasCapacityLimit =
        Number.isFinite(parsedMaxCapacity) && parsedMaxCapacity > 0;
      const maxCapacity = hasCapacityLimit
        ? Math.max(currentEnrollees, parsedMaxCapacity)
        : currentEnrollees;
      const semester = normalizeStoredSemester(
        section.semester ||
          storedAssignments.find(
            (assignment) =>
              assignment.sectionId === section.id ||
              normalizeStoredSectionCode(assignment.sectionCode) ===
                normalizeStoredSectionCode(section.code),
          )?.semester,
      );

      return {
        id: section.id,
        code: normalizeStoredSectionCode(section.code) || section.code,
        program: section.program || program,
        yearLevel: section.yearLevel || yearLevel,
        semester,
        strand: section.strand,
        section: section.section,
        currentEnrollees,
        maxCapacity,
        hasCapacityLimit,
        availableSlots: hasCapacityLimit
          ? Math.max(maxCapacity - currentEnrollees, 0)
          : null,
        isFull: hasCapacityLimit && currentEnrollees >= maxCapacity,
      };
    })
    .sort((left, right) => {
      const leftIsCurrent =
        normalizeStoredSectionCode(left.code) === normalizedCurrentSectionCode;
      const rightIsCurrent =
        normalizeStoredSectionCode(right.code) === normalizedCurrentSectionCode;

      if (leftIsCurrent !== rightIsCurrent) {
        return leftIsCurrent ? -1 : 1;
      }

      if (left.semester !== right.semester) {
        return left.semester.localeCompare(right.semester);
      }

      return left.code.localeCompare(right.code);
    });
};

export const updateStoredStudentSection = ({
  branch,
  studentNumber,
  trackingNumber,
  nextSectionCode,
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
  nextSectionCode: string;
}): StudentSectionUpdateResult | null => {
  const resolvedBranch = normalizeBranchName(branch);
  const normalizedNextSectionCode =
    normalizeStoredSectionCode(nextSectionCode);

  if (!normalizedNextSectionCode) {
    throw new Error("Choose a section before saving.");
  }

  const storedStudents = readStoredStudents();
  const targetStudent = storedStudents.find((student) => {
    const matchesBranch = normalizeBranchName(student.branch) === resolvedBranch;
    const matchesStudentNumber =
      Boolean(studentNumber) && student.id === studentNumber;
    const matchesTrackingNumber =
      Boolean(trackingNumber) && student.trackingNumber === trackingNumber;

    return matchesBranch && (matchesStudentNumber || matchesTrackingNumber);
  });

  if (!targetStudent) {
    return null;
  }

  const previousSection = normalizeStoredSectionCode(targetStudent.section);
  if (previousSection === normalizedNextSectionCode) {
    return {
      student: targetStudent,
      previousSection,
      nextSection: normalizedNextSectionCode,
      didChange: false,
    };
  }

  const storedSections =
    readBranchScopedData<StoredClassSection[]>("class-sections", resolvedBranch) ??
    [];
  const targetSection = storedSections.find(
    (section) =>
      normalizeStoredSectionCode(section.code) === normalizedNextSectionCode,
  );

  if (!targetSection) {
    throw new Error(
      `Section ${normalizedNextSectionCode} is not available for ${resolvedBranch}.`,
    );
  }

  const targetSectionProgram = targetSection.program || targetStudent.program;
  const targetSectionYearLevel =
    targetSection.yearLevel || targetStudent.yearLevel;
  const targetSectionStrandOrCourse =
    targetSectionProgram === "College"
      ? targetSection.strand || DEFAULT_COLLEGE_COURSE
      : targetSection.strand || "All";

  if (targetSectionProgram !== targetStudent.program) {
    throw new Error(
      `${normalizedNextSectionCode} does not match the student's program.`,
    );
  }

  if (!yearLevelsMatch(targetSectionYearLevel, targetStudent.yearLevel)) {
    throw new Error(
      `${normalizedNextSectionCode} does not match the student's year level.`,
    );
  }

  if (
    !matchesStrandOrCourse(
      targetSectionStrandOrCourse,
      targetStudent.strandOrCourse,
    )
  ) {
    throw new Error(
      `${normalizedNextSectionCode} does not match the student's strand or course.`,
    );
  }

  const currentStudentSectionCounts = getStoredStudentSectionCounts(
    storedStudents,
    resolvedBranch,
  );
  const isAlreadyLinkedToTarget = previousSection === normalizedNextSectionCode;
  const targetCurrentEnrollees =
    currentStudentSectionCounts.get(normalizedNextSectionCode) ?? 0;
  const parsedTargetCapacity = Number(targetSection.maxCapacity ?? 0);
  const hasTargetCapacityLimit =
    Number.isFinite(parsedTargetCapacity) && parsedTargetCapacity > 0;
  const targetCapacity = hasTargetCapacityLimit
    ? Math.max(targetCurrentEnrollees, parsedTargetCapacity)
    : Number.POSITIVE_INFINITY;

  if (!isAlreadyLinkedToTarget && targetCurrentEnrollees >= targetCapacity) {
    throw new Error(`${normalizedNextSectionCode} is already full.`);
  }

  const updatedStudent: StudentStorageRecord = {
    ...targetStudent,
    section: normalizedNextSectionCode,
  };
  const nextStudents = storedStudents.map((student) =>
    student === targetStudent ? updatedStudent : student,
  );
  writeStoredStudents(nextStudents);

  const nextSections = applyStoredStudentSectionCounts(
    storedSections,
    nextStudents,
    resolvedBranch,
  );
  writeBranchScopedData("class-sections", resolvedBranch, nextSections);

  return {
    student: updatedStudent,
    previousSection,
    nextSection: normalizedNextSectionCode,
    didChange: true,
  };
};

export const getEnrollmentRetakeChoiceGroups = ({
  branch,
  program,
  strandOrCourse,
  semester,
  academicYear,
  subjects,
}: {
  branch?: string | null;
  program: string;
  strandOrCourse?: string;
  semester: string;
  academicYear?: string;
  subjects: EnrollmentRetakeRequestItem[];
}): EnrollmentRetakeChoiceGroup[] => {
  const resolvedBranch = normalizeBranchName(branch);
  const storedSubjects =
    readBranchScopedData<StoredAcademicSubject[]>("subjects", resolvedBranch) ?? [];
  const storedAssignments =
    readBranchScopedData<StoredSubjectAssignment[]>(
      "subject-assignments",
      resolvedBranch,
    ) ?? [];
  const resolvedAcademicYear =
    academicYear || storedAssignments[0]?.academicYear || "2026-2027";
  const normalizedSemester = normalizeStoredSemester(semester);

  return subjects
    .map((item) => {
      const normalizedSubjectCode = item.subjectCode.trim().toUpperCase();
      const subjectKey = buildEnrollmentSubjectKey({
        code: item.subjectCode,
        title: item.subjectTitle,
      });
      const matchingSubjects = storedSubjects.filter(
        (subject) =>
          subject.program === program &&
          matchesStrandOrCourse(
            resolveStoredSubjectStrandOrCourse(subject),
            strandOrCourse,
          ) &&
          (subject.code.trim().toUpperCase() === normalizedSubjectCode ||
            buildEnrollmentSubjectKey({
              code: subject.code,
              title: subject.name,
            }) === subjectKey),
      );
      const preferredSubject =
        matchingSubjects.find(
          (subject) => normalizeStoredSemester(subject.semester) === normalizedSemester,
        ) ?? matchingSubjects[0];
      const matchingSubjectIds = new Set(
        matchingSubjects.map((subject) => subject.id),
      );
      const assignmentOptions = storedAssignments
        .filter(
          (assignment) =>
            assignment.academicYear === resolvedAcademicYear &&
            normalizeStoredSemester(assignment.semester) === normalizedSemester &&
            (matchingSubjectIds.has(assignment.subjectId) ||
              assignment.subjectCode.trim().toUpperCase() === normalizedSubjectCode),
        )
        .map((assignment) => {
          const assignmentSubjectDetails =
            matchingSubjects.find(
              (subject) =>
                assignment.subjectId === subject.id ||
                assignment.subjectCode === subject.code,
            ) ?? preferredSubject;

          return {
            assignmentId: assignment.id,
            subjectId:
              assignment.subjectId ||
              assignmentSubjectDetails?.id ||
              item.subjectId ||
              item.subjectCode,
            subjectCode: assignment.subjectCode,
            subjectName: assignment.subjectName,
            units: assignmentSubjectDetails?.units,
            instructorId: assignment.instructorId,
            instructorName: assignment.instructorName,
            sectionId: assignment.sectionId,
            sectionCode: assignment.sectionCode,
            schedule: assignment.schedule,
            academicYear: assignment.academicYear,
            semester: normalizeStoredSemester(assignment.semester),
          };
        })
        .sort(
          (left, right) =>
            left.subjectCode.localeCompare(right.subjectCode) ||
            (left.sectionCode || "").localeCompare(right.sectionCode || ""),
        );

      return {
        subjectId: preferredSubject?.id || item.subjectId || item.subjectCode,
        subjectCode: item.subjectCode,
        subjectName: item.subjectTitle,
        units: preferredSubject?.units,
        assignmentOptions,
        evaluation: item.evaluation,
        gradingPeriods: item.gradingPeriods,
      };
    })
    .sort(
      (left, right) =>
        left.subjectCode.localeCompare(right.subjectCode) ||
        left.subjectName.localeCompare(right.subjectName),
    );
};

export const getStudentScheduleChoiceGroups = ({
  branch,
  program,
  yearLevel,
  strandOrCourse,
  semester,
  academicYear,
  gradeRecords,
  creditedSubjects = [],
  strictScope = false,
}: {
  branch?: string | null;
  program: string;
  yearLevel: string;
  strandOrCourse?: string;
  semester: string;
  academicYear?: string;
  gradeRecords?: StoredStudentGradeRecord[];
  creditedSubjects?: StudentSubjectPlanItem[];
  strictScope?: boolean;
}): StudentScheduleChoiceGroup[] => {
  const resolvedBranch = normalizeBranchName(branch);
  const storedSubjects =
    (
      readBranchScopedData<StoredAcademicSubject[]>("subjects", resolvedBranch) ?? []
    ).map((subject) => ({
      ...subject,
      semester: normalizeStoredSemester(subject.semester),
    }));
  const storedAssignments =
    (
      readBranchScopedData<StoredSubjectAssignment[]>(
        "subject-assignments",
        resolvedBranch,
      ) ?? []
    ).map((assignment) => ({
      ...assignment,
      semester: normalizeStoredSemester(assignment.semester),
    }));
  const resolvedAcademicYear =
    academicYear || storedAssignments[0]?.academicYear || "2026-2027";
  const normalizedSemester = normalizeStoredSemester(semester);
  const matchingTermAssignments = storedAssignments.filter(
    (assignment) =>
      assignment.academicYear === resolvedAcademicYear &&
      assignment.semester === normalizedSemester,
  );
  const semesterFallbackAssignments =
    matchingTermAssignments.length > 0 || strictScope
      ? matchingTermAssignments
      : storedAssignments.filter(
          (assignment) => assignment.semester === normalizedSemester,
        );
  const hasGradeEligibilityContext = Array.isArray(gradeRecords) || creditedSubjects.length > 0;
  const subjectYearLevelFilter = hasGradeEligibilityContext
    ? (subject: StoredAcademicSubject) =>
        subjectIsAtOrBeforeYearLevel(subject, yearLevel)
    : (subject: StoredAcademicSubject) =>
        yearLevelsMatch(subject.yearLevel, yearLevel);
  const exactSubjectMatches = storedSubjects.filter(
    (subject) =>
      subject.program === program &&
      subjectYearLevelFilter(subject) &&
      subject.semester === normalizedSemester &&
      matchesStrandOrCourse(
        resolveStoredSubjectStrandOrCourse(subject),
        strandOrCourse,
      ),
  );
  const matchedSubjects =
    exactSubjectMatches.length > 0 || strictScope
      ? exactSubjectMatches
      : storedSubjects.filter(
          (subject) =>
            subject.program === program &&
            subjectYearLevelFilter(subject) &&
            subject.semester === normalizedSemester,
        );
  const creditedSubjectCodes = new Set(creditedSubjects.map(
    (item) => normalizeStoredSubjectCompletionCode(item.subjectCode),
  ));
  const completedSubjectCodes = getCompletedSubjectCodes(gradeRecords ?? []);
  creditedSubjectCodes.forEach((code) => completedSubjectCodes.add(code));
  const latestGradeRecordsBySubjectCode =
    getLatestTerminalGradeRecordsBySubjectCode(gradeRecords ?? []);
  const relaxedSubjectMatches = hasGradeEligibilityContext
    ? matchedSubjects.filter(
        (subject) =>
          !subjectIsCompletedByGrades(subject, completedSubjectCodes) &&
          subjectPrerequisitesArePassed({
            subject,
            subjects: storedSubjects,
            latestGradeRecordsBySubjectCode,
            creditedSubjectCodes,
          }),
      )
    : matchedSubjects;

  if (matchedSubjects.length === 0 && strictScope) return [];
  if (matchedSubjects.length === 0) {
    const assignmentGroups = new Map<string, StudentScheduleChoiceGroup>();

    semesterFallbackAssignments.forEach((assignment) => {
      const subjectKey =
        assignment.subjectId || assignment.subjectCode.trim().toUpperCase();
      const existingGroup = assignmentGroups.get(subjectKey);
      const nextOption: StudentScheduledAssignmentItem = {
        assignmentId: assignment.id,
        subjectId: assignment.subjectId || subjectKey,
        subjectCode: assignment.subjectCode,
        subjectName: assignment.subjectName,
        instructorId: assignment.instructorId,
        instructorName: assignment.instructorName,
        sectionId: assignment.sectionId,
        sectionCode: assignment.sectionCode,
        schedule: assignment.schedule,
        academicYear: assignment.academicYear,
        semester: assignment.semester,
      };

      if (existingGroup) {
        existingGroup.assignmentOptions.push(nextOption);
        return;
      }

      assignmentGroups.set(subjectKey, {
        subjectId: assignment.subjectId || subjectKey,
        subjectCode: assignment.subjectCode,
        subjectName: assignment.subjectName,
        assignmentOptions: [nextOption],
      });
    });

    return Array.from(assignmentGroups.values())
      .map((group) => ({
        ...group,
        assignmentOptions: group.assignmentOptions.sort(
          (left, right) =>
            left.subjectCode.localeCompare(right.subjectCode) ||
            (left.sectionCode || "").localeCompare(right.sectionCode || ""),
        ),
      }))
      .sort(
        (left, right) =>
          left.subjectCode.localeCompare(right.subjectCode) ||
          left.subjectName.localeCompare(right.subjectName),
      );
  }

  if (relaxedSubjectMatches.length === 0) {
    return [];
  }

  return relaxedSubjectMatches
    .sort(compareStoredSubjectSequence)
    .map((subject) => ({
      subjectId: subject.id,
      subjectCode: subject.code,
      subjectName: subject.name,
      units: subject.units,
      assignmentOptions: semesterFallbackAssignments
        .filter((assignment) =>
          storedSubjectMatchesAssignment(subject, assignment),
        )
        .map((assignment) => ({
          assignmentId: assignment.id,
          subjectId: assignment.subjectId,
          subjectCode: assignment.subjectCode,
          subjectName: assignment.subjectName,
          units: subject.units,
          instructorId: assignment.instructorId,
          instructorName: assignment.instructorName,
          sectionId: assignment.sectionId,
          sectionCode: assignment.sectionCode,
          schedule: assignment.schedule,
          academicYear: assignment.academicYear,
          semester: normalizeStoredSemester(assignment.semester),
        }))
        .sort(
          (left, right) =>
            left.subjectCode.localeCompare(right.subjectCode) ||
            (left.sectionCode || "").localeCompare(right.sectionCode || ""),
        ),
    }))
    .sort(
      (left, right) =>
        left.subjectCode.localeCompare(right.subjectCode) ||
        left.subjectName.localeCompare(right.subjectName),
    );
};

export const getStudentScheduleSelectionRequest = ({
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
  const resolvedBranch = normalizeBranchName(branch);
  const normalizedStudentNumber = studentNumber
    ? studentNumber.trim().toUpperCase()
    : "";
  const normalizedSemester = semester ? normalizeStoredSemester(semester) : "";
  const normalizedAcademicYear = academicYear?.trim() || "";
  const requests =
    readBranchScopedData<StudentScheduleSelectionRequestRecord[]>(
      "student-schedule-requests",
      resolvedBranch,
    ) ?? [];

  return (
    requests.find((request) => {
      const matchesTrackingNumber = Boolean(
        trackingNumber &&
        request.trackingNumber &&
          request.trackingNumber === trackingNumber,
      );
      const matchesTerm =
        (!normalizedAcademicYear ||
          request.academicYear.trim() === normalizedAcademicYear) &&
        (!normalizedSemester ||
          normalizeStoredSemester(request.semester) === normalizedSemester);

      if (matchesTrackingNumber) {
        return matchesTerm;
      }

      return (
        Boolean(normalizedStudentNumber && request.studentNumber) &&
        request.studentNumber.trim().toUpperCase() ===
          normalizedStudentNumber &&
        matchesTerm
      );
    }) ?? null
  );
};

export const saveStudentScheduleSelectionRequest = (
  request: StudentScheduleSelectionRequestRecord,
) => {
  const resolvedBranch = normalizeBranchName(request.branch);
  const existingRequests =
    readBranchScopedData<StudentScheduleSelectionRequestRecord[]>(
      "student-schedule-requests",
      resolvedBranch,
    ) ?? [];
  const normalizedRequestStudentNumber = request.studentNumber.trim().toUpperCase();
  const existingIndex = existingRequests.findIndex(
    (record) =>
      record.id === request.id ||
      (record.studentNumber.trim().toUpperCase() ===
        normalizedRequestStudentNumber &&
        record.semester === request.semester &&
        record.academicYear === request.academicYear),
  );
  const nextRequests =
    existingIndex >= 0
      ? existingRequests.map((record, index) =>
          index === existingIndex ? request : record,
        )
      : [request, ...existingRequests];

  writeBranchScopedData("student-schedule-requests", resolvedBranch, nextRequests);
  return request;
};

export const updateStoredStudentOwnScheduleState = ({
  branch,
  studentNumber,
  trackingNumber,
  updates,
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
  updates: Partial<
    Pick<
      StudentStorageRecord,
      | "requestedOwnSchedule"
      | "ownScheduleRequestStatus"
      | "ownScheduleAcademicYear"
      | "ownScheduleSemester"
      | "ownScheduleSelectionStatus"
    >
  >;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  let updatedStudent: StudentStorageRecord | null = null;

  const nextStudents = readStoredStudents().map((student) => {
    const matchesBranch = normalizeBranchName(student.branch) === resolvedBranch;
    const matchesStudentNumber =
      studentNumber && student.id === studentNumber && matchesBranch;
    const matchesTrackingNumber =
      trackingNumber &&
      student.trackingNumber === trackingNumber &&
      matchesBranch;

    if (!matchesStudentNumber && !matchesTrackingNumber) {
      return student;
    }

    updatedStudent = {
      ...student,
      ...updates,
    };

    return updatedStudent;
  });

  if (!updatedStudent) {
    return null;
  }

  writeStoredStudents(nextStudents);
  return updatedStudent;
};

export const getDefaultBranchEnrollees = (
  branch: string | null | undefined,
): AdminEnrolleeRecord[] => {
  void branch;
  return [];
};

const getSignedRequirementUrl = async (
  storagePath: string,
  storageBucket?: string | null,
) => {
  const bucketName = storageBucket || REQUIREMENTS_BUCKET;
  const { data, error } = await withSignedUrlRequestLimit(() =>
    supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, 60 * 60),
  );

  if (error) {
    console.warn("Failed to sign requirement file URL", error);
    return "#";
  }

  return data.signedUrl;
};

const mapSupabaseApplicantToAdminRecord = async (
  row: SupabaseAdminAdmissionQueueRow,
): Promise<AdminEnrolleeRecord> => {
  const fullName = [row.first_name, row.middle_name, row.last_name]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .join(" ")
    .trim();
  const program = mapProgramNameToAdminProgram(row.program_name);
  const yearLevel = getInitialYearLevel(
    program,
    row.student_status_label,
    row.requested_year_level,
  );
  const requirements = getAdmissionRequirements(
    row.student_status_label,
    row.program_name,
    row.honor_label || "No Honor",
  );
  const requirementFiles = Array.isArray(row.requirement_files)
    ? row.requirement_files
    : [];
  const scholarshipExamScore = toOptionalNumber(row.scholarship_exam_score);
  const requestedOwnSchedule = Boolean(row.requested_own_schedule);
  const ownScheduleRequestStatus = requestedOwnSchedule
    ? row.own_schedule_request_status === "Approved" ||
      row.own_schedule_request_status === "Rejected" ||
      row.own_schedule_request_status === "Pending"
      ? row.own_schedule_request_status
      : "Pending"
    : undefined;
  const attachments = await Promise.all(
    requirements.map(async (requirement) => {
      const uploadedFile = requirementFiles.find(
        (file) => file.requirement_code === requirement.code,
      );

      if (!uploadedFile) {
        return {
          name: requirement.name,
          type: "pending",
          url: "#",
          reviewStatus: "Pending" as const,
        };
      }

      return {
        name: requirement.name,
        type: uploadedFile.mime_type || "file",
        url: await getSignedRequirementUrl(
          uploadedFile.storage_path,
          uploadedFile.storage_bucket || REQUIREMENTS_BUCKET,
        ),
        storagePath: uploadedFile.storage_path,
        storageBucket: uploadedFile.storage_bucket || REQUIREMENTS_BUCKET,
        uploadedAt: uploadedFile.uploaded_at,
        reviewStatus: "Pending" as const,
      };
    }),
  );
  const tuitionEstimate = getEstimatedCollegeTuition({
    honorLabel: row.honor_label,
    honorCertificateApproved: hasApprovedHonorCertificate(attachments),
    appliedForScholarship: row.applied_for_scholarship,
    scholarshipExamScore,
  });

  return {
    id: row.tracking_number,
    trackingNumber: row.tracking_number,
    studentNumber: row.student_number || undefined,
    fullName,
    program,
    yearLevel,
    strandOrCourse: row.track_name,
    applicationDate: toIsoDateString(row.submitted_at || row.updated_at),
    academicYear: row.academic_year?.trim() || undefined,
    documentsSubmitted: requirementFiles.length,
    totalDocuments: requirements.length,
    status:
      row.application_status === "accepted"
        ? "Approved"
        : row.application_status === "rejected"
          ? "Rejected"
          : "Pending",
    rejectionReason: row.rejection_reason || undefined,
    branch: normalizeBranchName(row.branch_name || row.branch_code),
    studentStatus: row.student_status_label,
    honorLabel: row.honor_label || "No Honor",
    honorDiscountPercentage: tuitionEstimate.honorDiscountPercentage,
    appliedForScholarship: row.applied_for_scholarship,
    scholarshipExamScore,
    effectiveDiscountPercentage: tuitionEstimate.effectiveDiscountPercentage,
    effectiveDiscountSource: tuitionEstimate.effectiveDiscountSource,
    requestedOwnSchedule,
    ownScheduleRequestStatus,
    ownScheduleRequestSubmittedAt:
      row.own_schedule_request_submitted_at || undefined,
    ownScheduleDecisionAt: row.own_schedule_request_decided_at || undefined,
    personalInfo: {
      fullName,
      birthDate: "",
      contactNumber: row.phone_number || "",
      program,
      guardianName: "",
      email: row.email || "",
      address: row.address || "",
      yearLevel,
      guardianContact: "",
      middleName: row.middle_name || "",
      sex: row.sex || "",
      civilStatus: row.civil_status || "",
      lastSchoolAttended: row.last_school_attended || "",
      yearCompletion:
        row.year_completion === null || row.year_completion === undefined
          ? ""
          : String(row.year_completion),
      requestedYearLevel: row.requested_year_level || yearLevel,
      strandOrCourse: row.track_name || "",
    },
    attachments,
  };
};

export const fetchSupabaseAdmissionApplicants = async (
  branch: string | null | undefined,
) => {
  await fetchBranchDirectory();
  const branchName = normalizeBranchName(branch);
  const branchCode =
    findRegisteredBranch(branchName)?.code ?? normalizeBranchCode(branchName);
  const [queueResult, academicYearResult] = await Promise.all([
    supabase
      .rpc("get_admin_admission_queue", {
        p_branch_code: branchCode,
      })
      .returns<SupabaseAdminAdmissionQueueRow[]>(),
    supabase
      .rpc("list_admission_academic_years", {
        p_branch_code: branchCode,
      })
      .returns<SupabaseAdmissionAcademicYearRow[]>(),
  ]);

  if (queueResult.error) {
    throw new Error(queueResult.error.message);
  }

  if (academicYearResult.error) {
    throw new Error(academicYearResult.error.message);
  }

  const academicYearByTrackingNumber = new Map(
    (Array.isArray(academicYearResult.data) ? academicYearResult.data : []).map(
      (row) => [row.tracking_number.trim().toUpperCase(), row.academic_year],
    ),
  );
  const queueRows = (Array.isArray(queueResult.data) ? queueResult.data : [])
    .filter(
    (row) => row.application_status !== "draft",
    )
    .map((row) => ({
      ...row,
      academic_year:
        academicYearByTrackingNumber.get(
          row.tracking_number.trim().toUpperCase(),
        ) ?? null,
    }));
  const applicantRecords = await Promise.all(
    queueRows.map(mapSupabaseApplicantToAdminRecord),
  );
  const persisted = await fetchAndCacheBranchScopedData<AdminEnrolleeRecord[]>("enrollees", branch);
  const merged = mergeAdminEnrolleeRecords(applicantRecords, persisted ?? []);
  // Keep list loading to the admission queue and cached records. Fetching each
  // uploaded document's review decision here creates an RPC burst; details
  // refresh those decisions when an administrator opens an applicant.
  const records = merged.map(record =>
    normalizeAdminEnrolleeCapitalization(applyCredentialReviewDecisions(record, branch)),
  );
  writeBranchScopedData("enrollees", branch, records, { skipSupabaseSync: true });
  return records;
};

export const upsertSubmittedApplicant = ({
  application,
  draft,
}: {
  application: AdmissionApplicationSummary;
  draft: AdmissionDraft | null;
}) => {
  const branch = normalizeBranchName(application.branchName || draft?.branch);
  const storageKey = getBranchStorageKey("enrollees", branch);
  const existingApplicants =
    (
      readStorageItem<AdminEnrolleeRecord[]>(storageKey) ??
      getDefaultBranchEnrollees(branch)
    ).map(normalizeAdminEnrolleeCapitalization);
  const fullName = [draft?.fname || application.firstName, draft?.middle_name, draft?.lname || application.lastName]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .join(" ")
    .trim();
  const program = mapProgramNameToAdminProgram(application.programName);
  const strandOrCourse = application.trackName;
  const yearLevel = getInitialYearLevel(
    program,
    application.studentStatus,
    draft?.requested_year_level ||
      draft?.requestedYearLevel ||
      application.requestedYearLevel,
  );
  const honorLabel = draft?.honor || application.honorLabel || "No Honor";
  const requirementList = getAdmissionRequirements(
    application.studentStatus,
    application.programName,
    honorLabel,
  );
  const tuitionEstimate = getEstimatedCollegeTuition({
    honorLabel,
    honorCertificateApproved: false,
    appliedForScholarship: Boolean(
      draft?.apply_scholarship ?? application.appliedForScholarship,
    ),
    scholarshipExamScore: application.scholarshipExamScore,
  });
  const existingApplicantIndex = existingApplicants.findIndex(
    (applicant) => applicant.trackingNumber === application.trackingNumber,
  );
  const existingApplicant =
    existingApplicantIndex >= 0 ? existingApplicants[existingApplicantIndex] : null;
  const isCollegeTransfereeApplicant =
    application.programLevel === "college" &&
    application.studentStatus.trim().toLowerCase() === "transferee";
  const requestedOwnSchedule =
    !isCollegeTransfereeApplicant &&
    (Boolean(draft?.requestOwnSchedule) ||
      Boolean(existingApplicant?.requestedOwnSchedule));
  const ownScheduleRequestStatus = requestedOwnSchedule
    ? existingApplicant?.ownScheduleRequestStatus || "Pending"
    : undefined;
  const ownScheduleRequestSubmittedAt =
    requestedOwnSchedule
      ? existingApplicant?.ownScheduleRequestSubmittedAt ||
        application.submittedAt ||
        application.updatedAt
      : undefined;
  const applicantRecord: AdminEnrolleeRecord = normalizeAdminEnrolleeCapitalization({
    id: application.trackingNumber,
    trackingNumber: application.trackingNumber,
    fullName: fullName || `${application.firstName} ${application.lastName}`.trim(),
    program,
    yearLevel,
    strandOrCourse,
    applicationDate: toIsoDateString(application.submittedAt || application.updatedAt),
    academicYear: application.academicYear || draft?.academicYear,
    documentsSubmitted: 0,
    totalDocuments: requirementList.length,
    status: "Pending",
    branch,
    studentStatus: application.studentStatus,
    honorLabel,
    honorDiscountPercentage: tuitionEstimate.honorDiscountPercentage,
    appliedForScholarship: Boolean(
      draft?.apply_scholarship ?? application.appliedForScholarship,
    ),
    scholarshipExamScore: application.scholarshipExamScore,
    effectiveDiscountPercentage: tuitionEstimate.effectiveDiscountPercentage,
    effectiveDiscountSource: tuitionEstimate.effectiveDiscountSource,
    requestedOwnSchedule,
    ownScheduleRequestStatus,
    ownScheduleRequestSubmittedAt,
    personalInfo: {
      fullName: fullName || `${application.firstName} ${application.lastName}`.trim(),
      birthDate: "",
      contactNumber: draft?.contact || application.phoneNumber || "",
      program,
      guardianName: "",
      email: draft?.email || application.email || "",
      address: draft?.address || application.address || "",
      yearLevel,
      guardianContact: "",
      middleName: draft?.middle_name || draft?.mname || application.middleName || "",
      sex: draft?.sex || application.sex || "",
      civilStatus: draft?.civil_status || application.civilStatus || "",
      lastSchoolAttended:
        draft?.last_school_attended ||
        draft?.lastSchool ||
        application.lastSchoolAttended ||
        "",
      yearCompletion:
        draft?.year_completion ||
        draft?.yearCompletion ||
        application.yearCompletion ||
        "",
      requestedYearLevel:
        draft?.requested_year_level ||
        draft?.requestedYearLevel ||
        application.requestedYearLevel ||
        yearLevel,
      strandOrCourse,
    },
    attachments: [],
  });

  const nextApplicants =
    existingApplicantIndex >= 0
      ? existingApplicants.map((applicant, index) =>
          index === existingApplicantIndex
            ? {
                ...applicant,
                ...applicantRecord,
                studentNumber: applicant.studentNumber,
                status: applicant.status,
                convertedAt: applicant.convertedAt,
                requestedOwnSchedule,
                ownScheduleRequestStatus,
                ownScheduleRequestSubmittedAt,
                ownScheduleAcademicYear: applicant.ownScheduleAcademicYear,
                ownScheduleSemester: applicant.ownScheduleSemester,
                ownScheduleDecisionAt: applicant.ownScheduleDecisionAt,
              }
            : applicant,
        )
      : [applicantRecord, ...existingApplicants];

  writeStorageItem(
    storageKey,
    nextApplicants.map(normalizeAdminEnrolleeCapitalization),
  );
  return nextApplicants;
};

export const isCollegeTransferee = (student: {
  program?: string | null;
  studentStatus?: string | null;
}) => student.program?.trim().toLowerCase() === "college" &&
  student.studentStatus?.trim().toLowerCase() === "transferee";

export const promoteApplicantToStoredStudent = (
  applicant: AdminEnrolleeRecord,
) => {
  const normalizedApplicant = normalizeAdminEnrolleeCapitalization(
    isCollegeTransferee(applicant) ? {
      ...applicant,
      requestedOwnSchedule: true,
      ownScheduleRequestStatus: "Approved",
    } : applicant,
  );
  const existingStudents = readStoredStudents();
  const existingStudent = findStoredStudent({
    branch: normalizedApplicant.branch,
    studentNumber: normalizedApplicant.studentNumber,
    trackingNumber: normalizedApplicant.trackingNumber,
  });
  const studentNumber =
    existingStudent?.id ||
    normalizedApplicant.studentNumber ||
    getNextStudentNumber(normalizedApplicant.branch, existingStudents);
  const { firstName, middleName, lastName } = splitFullName(
    normalizedApplicant.fullName,
  );
  const applicantSex = normalizedApplicant.personalInfo.sex;
  const resolvedGender =
    applicantSex === "Male" || applicantSex === "Female"
      ? applicantSex
      : existingStudent?.gender;

  const studentRecord: StudentStorageRecord = {
    id: studentNumber,
    name:
      normalizedApplicant.fullName ||
      [firstName, middleName, lastName].filter(Boolean).join(" "),
    program: normalizedApplicant.program,
    yearLevel: normalizedApplicant.yearLevel,
    section: isCollegeTransferee(normalizedApplicant) ? "" : existingStudent?.section || "",
    shsTrackType:
      normalizedApplicant.program === "SHS"
        ? resolveShsTrackType(normalizedApplicant.strandOrCourse)
        : "",
    strandOrCourse: normalizedApplicant.strandOrCourse,
    documentSubmitted: normalizedApplicant.applicationDate,
    contact: normalizedApplicant.personalInfo.contactNumber,
    email: normalizedApplicant.personalInfo.email,
    address: normalizedApplicant.personalInfo.address,
    lastSchoolAttended:
      normalizedApplicant.personalInfo.lastSchoolAttended ||
      existingStudent?.lastSchoolAttended,
    yearCompletion:
      normalizedApplicant.personalInfo.yearCompletion ||
      existingStudent?.yearCompletion,
    status:
      normalizedApplicant.documentsSubmitted >= normalizedApplicant.totalDocuments
        ? "Complete"
        : "Incomplete",
    branch: normalizeBranchName(normalizedApplicant.branch),
    trackingNumber: normalizedApplicant.trackingNumber,
    studentStatus: normalizedApplicant.studentStatus,
    requestedOwnSchedule: normalizedApplicant.requestedOwnSchedule,
    ownScheduleRequestStatus: normalizedApplicant.ownScheduleRequestStatus,
    ownScheduleAcademicYear: normalizedApplicant.ownScheduleAcademicYear,
    ownScheduleSemester: normalizedApplicant.ownScheduleSemester,
    ownScheduleSelectionStatus:
      normalizedApplicant.ownScheduleRequestStatus === "Approved"
        ? "Not Submitted"
        : undefined,
    birthDate: normalizedApplicant.personalInfo.birthDate,
    guardianName: normalizedApplicant.personalInfo.guardianName,
    guardianContact: normalizedApplicant.personalInfo.guardianContact,
    gender: resolvedGender,
    civilStatus:
      existingStudent?.civilStatus ||
      normalizedApplicant.personalInfo.civilStatus ||
      "Single",
  };

  const nextStudents = existingStudent
    ? existingStudents.map((student) =>
        student.id === existingStudent.id &&
        normalizeBranchName(student.branch) ===
          normalizeBranchName(existingStudent.branch)
          ? { ...student, ...studentRecord }
          : student,
      )
    : [studentRecord, ...existingStudents];

  writeStoredStudents(nextStudents);

  const updatedApplicant: AdminEnrolleeRecord = {
    ...normalizedApplicant,
    studentNumber,
    status: "Approved",
    convertedAt: new Date().toISOString(),
  };

  return { applicant: updatedApplicant, student: studentRecord };
};

