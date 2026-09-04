import type {
  AdmissionApplicationSummary,
  AdmissionDiscountSource,
  AdmissionDraft,
} from "../types/application";
import { supabase } from "../lib/supabase";
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

  if (!normalizedBranch) {
    return DEFAULT_BRANCH;
  }

  if (normalizedBranch.includes("taytay")) {
    return "Taytay";
  }

  if (
    normalizedBranch === "gma" ||
    normalizedBranch.includes("general mariano alvarez")
  ) {
    return "GMA";
  }

  if (normalizedBranch.includes("bacoor")) {
    return "Bacoor";
  }

  return toDisplayCapitalization(trimmedBranch || DEFAULT_BRANCH);
};

const STUDENT_NUMBER_PREFIX_BY_BRANCH: Record<string, string> = {
  Bacoor: "BAC",
  Taytay: "TAY",
  GMA: "GMA",
};

const BRANCH_BY_STUDENT_NUMBER_PREFIX: Record<string, AdminBranchName> = {
  BAC: "Bacoor",
  TAY: "Taytay",
  GMA: "GMA",
};

const buildDynamicStudentNumberPrefix = (branch?: string | null) => {
  const normalizedBranch = normalizeBranchName(branch);
  const compactBranch = normalizedBranch.replace(/[^A-Za-z0-9]/g, "");

  return (compactBranch.slice(0, 3).toUpperCase() || "STD").padEnd(3, "X");
};

export const getStudentNumberPrefix = (branch?: string | null) => {
  const normalizedBranch = normalizeBranchName(branch);

  return (
    STUDENT_NUMBER_PREFIX_BY_BRANCH[normalizedBranch] ||
    buildDynamicStudentNumberPrefix(normalizedBranch)
  );
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

  return BRANCH_BY_STUDENT_NUMBER_PREFIX[prefixMatch[1]] ?? null;
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
    return /^(BAC|TAY|GMA)-\d{6}$/.test(normalizedValue);
  }

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
  "student-subject-plans",
  "student-schedule-requests",
  "instructor-grade-change-requests",
]);

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
) => {
  const resolvedBranch = normalizeBranchName(branch);
  writeStorageItem(getBranchStorageKey(scope, resolvedBranch), value);

  if (!SUPABASE_MIRRORED_BRANCH_SCOPES.has(scope)) {
    return;
  }

  void supabase
    .rpc("upsert_branch_local_storage_record", {
      p_branch: resolvedBranch,
      p_scope: scope,
      p_payload: value,
    })
    .then(({ error }) => {
      if (error) {
        console.warn(
          `Unable to sync ${scope} to Supabase; local cache was updated.`,
          error,
        );
      }
    });
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
    const name = normalizeDeletedStudentMarkerValue(marker.name);

    if (!studentNumber && !trackingNumber && !name) {
      return;
    }

    const key = [branch, studentNumber, trackingNumber, name].join("::");
    markerMap.set(key, {
      branch,
      studentNumber: studentNumber || undefined,
      trackingNumber: trackingNumber || undefined,
      name: name || undefined,
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
  const name = normalizeDeletedStudentMarkerValue(student.name);

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
    const markerName = normalizeDeletedStudentMarkerValue(marker.name);

    return Boolean(
      (studentNumber && markerStudentNumber === studentNumber) ||
        (trackingNumber && markerTrackingNumber === trackingNumber) ||
        (name && markerName === name),
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
      name: student.name,
      deletedAt: new Date().toISOString(),
    },
  ]);
};

export const forgetDeletedStoredStudent = (
  student: Pick<StudentStorageRecord, "branch" | "id" | "trackingNumber" | "name">,
) => {
  const branch = normalizeBranchName(student.branch);
  const studentNumber = normalizeDeletedStudentMarkerValue(student.id);
  const trackingNumber = normalizeDeletedStudentMarkerValue(student.trackingNumber);
  const name = normalizeDeletedStudentMarkerValue(student.name);

  writeDeletedStoredStudentMarkers(
    readDeletedStoredStudentMarkers().filter((marker) => {
      if (normalizeBranchName(marker.branch) !== branch) {
        return true;
      }

      const markerStudentNumber = normalizeDeletedStudentMarkerValue(
        marker.studentNumber,
      );
      const markerTrackingNumber = normalizeDeletedStudentMarkerValue(
        marker.trackingNumber,
      );
      const markerName = normalizeDeletedStudentMarkerValue(marker.name);

      return !(
        (studentNumber && markerStudentNumber === studentNumber) ||
        (trackingNumber && markerTrackingNumber === trackingNumber) ||
        (name && markerName === name)
      );
    }),
  );
};

const normalizeStoredStudentCapitalization = (
  student: StudentStorageRecord,
): StudentStorageRecord => ({
  ...student,
  name: toNameCapitalization(student.name),
  program: toDisplayCapitalization(student.program),
  yearLevel: toDisplayCapitalization(student.yearLevel),
  section: toDisplayCapitalization(student.section),
  shsTrackType: toDisplayCapitalization(student.shsTrackType),
  strandOrCourse: toDisplayCapitalization(student.strandOrCourse),
  address: toDisplayCapitalization(student.address),
  branch: normalizeBranchName(student.branch),
  studentStatus: toDisplayCapitalization(student.studentStatus),
  guardianName: toNameCapitalization(student.guardianName),
  civilStatus: toDisplayCapitalization(student.civilStatus),
});

const isRetainedStoredStudentRecord = (student: StudentStorageRecord) =>
  (student.status as string).trim().toLowerCase() !== "graduated";

const normalizeAdminPersonalInformationCapitalization = (
  personalInfo: AdminPersonalInformation,
): AdminPersonalInformation => ({
  ...personalInfo,
  fullName: toNameCapitalization(personalInfo.fullName),
  middleName: toNameCapitalization(personalInfo.middleName),
  program: toDisplayCapitalization(personalInfo.program),
  guardianName: toNameCapitalization(personalInfo.guardianName),
  address: toDisplayCapitalization(personalInfo.address),
  yearLevel: toDisplayCapitalization(personalInfo.yearLevel),
  sex: toDisplayCapitalization(personalInfo.sex),
  civilStatus: toDisplayCapitalization(personalInfo.civilStatus),
  lastSchoolAttended: toDisplayCapitalization(personalInfo.lastSchoolAttended),
  requestedYearLevel: toDisplayCapitalization(personalInfo.requestedYearLevel),
  strandOrCourse: toDisplayCapitalization(personalInfo.strandOrCourse),
});

const normalizeAdminEnrolleeCapitalization = (
  enrollee: AdminEnrolleeRecord,
): AdminEnrolleeRecord => ({
  ...enrollee,
  fullName: toNameCapitalization(enrollee.fullName),
  program: toDisplayCapitalization(enrollee.program),
  yearLevel: toDisplayCapitalization(enrollee.yearLevel),
  strandOrCourse: toDisplayCapitalization(enrollee.strandOrCourse),
  branch: normalizeBranchName(enrollee.branch),
  studentStatus: toDisplayCapitalization(enrollee.studentStatus),
  personalInfo: normalizeAdminPersonalInformationCapitalization(
    enrollee.personalInfo,
  ),
});

export const readStoredStudents = () =>
  dedupeStoredStudents(
    stripLegacyMockStudentRecords(
      readStorageItem<StudentStorageRecord[]>(STUDENT_STORAGE_KEY) ?? [],
    )
      .map(normalizeStoredStudentCapitalization)
      .filter(isRetainedStoredStudentRecord)
      .filter((student) => !isStoredStudentDeleted(student)),
  );

const normalizeStudentIdentityText = (value?: string | null) =>
  (value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function getStoredStudentDeduplicationKey(student: StudentStorageRecord) {
  const resolvedBranch = normalizeBranchName(student.branch);
  const trackingNumber = student.trackingNumber?.trim().toUpperCase();
  const email = normalizeStudentIdentityText(student.email);
  const name = normalizeStudentIdentityText(student.name);
  const birthDate = normalizeStudentIdentityText(student.birthDate);
  const identity =
    trackingNumber ||
    (email && name ? `email:${email}:${name}` : "") ||
    (name && birthDate ? `name:${name}:${birthDate}` : "") ||
    student.id?.trim().toUpperCase() ||
    email ||
    name;

  return `${resolvedBranch}:${identity}`;
}

const resolveMergedStudentStatus = (
  existingStudent: StudentStorageRecord,
  nextStudent: StudentStorageRecord,
) => {
  const existingStatus = (existingStudent.status || "").trim().toLowerCase();
  const nextStatus = (nextStudent.status || "").trim().toLowerCase();

  if (existingStatus === "archived" || nextStatus === "archived") {
    return "Archived";
  }

  if (existingStatus === "graduated" || nextStatus === "graduated") {
    return "Graduated";
  }

  return nextStudent.status || existingStudent.status;
};

export function dedupeStoredStudents(students: StudentStorageRecord[]) {
  const studentsByKey = new Map<string, StudentStorageRecord>();

  students.forEach((student) => {
    const key = getStoredStudentDeduplicationKey(student);

    if (!key.endsWith(":")) {
      const existingStudent = studentsByKey.get(key);
      studentsByKey.set(
        key,
        existingStudent
          ? {
              ...student,
              id: existingStudent.trackingNumber
                ? existingStudent.id
                : student.trackingNumber
                  ? student.id
                  : existingStudent.id || student.id,
              trackingNumber:
                existingStudent.trackingNumber || student.trackingNumber,
              section: student.section || existingStudent.section,
              requestedOwnSchedule:
                student.requestedOwnSchedule ||
                existingStudent.requestedOwnSchedule,
              ownScheduleRequestStatus:
                student.ownScheduleRequestStatus ||
                existingStudent.ownScheduleRequestStatus,
              ownScheduleAcademicYear:
                student.ownScheduleAcademicYear ||
                existingStudent.ownScheduleAcademicYear,
              ownScheduleSemester:
                student.ownScheduleSemester || existingStudent.ownScheduleSemester,
              ownScheduleSelectionStatus:
                student.ownScheduleSelectionStatus ||
                existingStudent.ownScheduleSelectionStatus,
              status: resolveMergedStudentStatus(existingStudent, student),
            }
          : student,
      );
      return;
    }

    studentsByKey.set(
      `${key}:${studentsByKey.size}`,
      student,
    );
  });

  return Array.from(studentsByKey.values());
}

export const writeStoredStudents = (students: StudentStorageRecord[]) => {
  writeStorageItem(
    STUDENT_STORAGE_KEY,
    dedupeStoredStudents(
      stripLegacyMockStudentRecords(students)
        .map(normalizeStoredStudentCapitalization)
        .filter(isRetainedStoredStudentRecord)
        .filter((student) => !isStoredStudentDeleted(student)),
    ),
  );

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STORED_STUDENTS_UPDATED_EVENT));
  }
};

const normalizeComparableStudentValue = (value?: string | null) =>
  (value || "").trim().toLowerCase();

const getStoredEnrollmentRequestSortValue = (
  request: StoredEnrollmentRequestRecord,
) => {
  const timestamp = request.updatedAt || request.enrollmentDate || request.requestDate;
  const parsedValue = Date.parse(timestamp);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const matchesStoredEnrollmentRequestStudent = (
  request: StoredEnrollmentRequestRecord,
  student: Pick<StudentStorageRecord, "id" | "trackingNumber">,
) => {
  if (
    student.trackingNumber &&
    request.trackingNumber &&
    request.trackingNumber === student.trackingNumber
  ) {
    return true;
  }

  return request.studentNumber === student.id;
};

const getStoredSectionYearCode = (yearLevel: string) => {
  const normalizedValue = yearLevel.trim().toLowerCase();

  if (normalizedValue.includes("grade 12") || normalizedValue.includes("2nd")) {
    return "2";
  }

  if (normalizedValue.includes("grade 11") || normalizedValue.includes("1st")) {
    return "1";
  }

  const yearMatch = normalizedValue.match(/\b([1-4])(st|nd|rd|th)?\b/);
  return yearMatch?.[1] || "1";
};

const buildStoredProgressedBlockSectionCode = ({
  currentSectionCode,
  requestedYearLevel,
}: {
  currentSectionCode?: string;
  requestedYearLevel: string;
}) => {
  const normalizedCode = currentSectionCode?.trim().toUpperCase();

  if (!normalizedCode) {
    return "";
  }

  const requestedYearCode = getStoredSectionYearCode(requestedYearLevel);
  const codeParts = normalizedCode.match(/^(.*?)([1-4])([A-Z]+)$/);

  if (!codeParts) {
    return normalizedCode;
  }

  const [, prefix, , blockLabel] = codeParts;
  return `${prefix}${requestedYearCode}${blockLabel}`;
};

const getLatestApprovedStoredEnrollmentRequest = (
  student: Pick<StudentStorageRecord, "branch" | "id" | "trackingNumber">,
) =>
  (
    readBranchScopedData<StoredEnrollmentRequestRecord[]>(
      ENROLLMENT_REQUEST_STORAGE_SCOPE,
      student.branch,
    ) ?? []
  )
    .filter(
      (request) =>
        request.enrollmentStatus === "Approved" &&
        matchesStoredEnrollmentRequestStudent(request, student),
    )
    .sort(
      (left, right) =>
        getStoredEnrollmentRequestSortValue(right) -
          getStoredEnrollmentRequestSortValue(left) ||
        right.id.localeCompare(left.id),
    )[0] ?? null;

const getLinkedStoredStudentEnrollee = (
  student: Pick<StudentStorageRecord, "branch" | "id" | "trackingNumber">,
) =>
  (
    readBranchScopedData<AdminEnrolleeRecord[]>("enrollees", student.branch) ?? []
  ).find((record) => {
    if (
      student.trackingNumber &&
      record.trackingNumber === student.trackingNumber
    ) {
      return true;
    }

    return record.studentNumber === student.id;
  }) ?? null;

const mergeStoredStudentOwnScheduleFallback = (
  student: StudentStorageRecord,
): StudentStorageRecord => {
  const linkedEnrollee = getLinkedStoredStudentEnrollee(student);

  if (!linkedEnrollee) {
    return student;
  }

  const ownScheduleRequestStatus =
    student.ownScheduleRequestStatus ?? linkedEnrollee.ownScheduleRequestStatus;

  return {
    ...student,
    requestedOwnSchedule: Boolean(
      student.requestedOwnSchedule ||
        linkedEnrollee.requestedOwnSchedule ||
        ownScheduleRequestStatus,
    ),
    ownScheduleRequestStatus,
    ownScheduleAcademicYear:
      student.ownScheduleAcademicYear || linkedEnrollee.ownScheduleAcademicYear,
    ownScheduleSemester:
      student.ownScheduleSemester || linkedEnrollee.ownScheduleSemester,
  };
};

const resolveStoredStudentEnrollmentState = (
  student: StudentStorageRecord,
): StudentStorageRecord => {
  const studentWithOwnScheduleFallback =
    mergeStoredStudentOwnScheduleFallback(student);
  const approvedEnrollmentRequest = getLatestApprovedStoredEnrollmentRequest(student);

  if (!approvedEnrollmentRequest) {
    return studentWithOwnScheduleFallback;
  }

  const hasApprovedOwnScheduleRequest =
    approvedEnrollmentRequest.irregularRequest?.mode === "own_schedule";
  const resolvedYearLevel =
    approvedEnrollmentRequest.requestedYearLevel ||
    studentWithOwnScheduleFallback.yearLevel;
  const shouldApplyRequestedPlacement =
    normalizeComparableStudentValue(studentWithOwnScheduleFallback.yearLevel) !==
      normalizeComparableStudentValue(resolvedYearLevel) ||
    !studentWithOwnScheduleFallback.section?.trim();
  const resolvedSection = hasApprovedOwnScheduleRequest
    ? ""
    : approvedEnrollmentRequest.irregularRequest?.mode === "section_assignment"
      ? shouldApplyRequestedPlacement
        ? approvedEnrollmentRequest.irregularRequest.requestedSectionCode ||
          studentWithOwnScheduleFallback.section ||
          ""
        : studentWithOwnScheduleFallback.section ||
          approvedEnrollmentRequest.irregularRequest.requestedSectionCode ||
          ""
      : shouldApplyRequestedPlacement
        ? buildStoredProgressedBlockSectionCode({
            currentSectionCode: studentWithOwnScheduleFallback.section,
            requestedYearLevel: resolvedYearLevel,
          }) ||
          studentWithOwnScheduleFallback.section ||
          ""
        : studentWithOwnScheduleFallback.section ||
          buildStoredProgressedBlockSectionCode({
            currentSectionCode: studentWithOwnScheduleFallback.section,
            requestedYearLevel: resolvedYearLevel,
          }) ||
          "";

  return {
    ...studentWithOwnScheduleFallback,
    yearLevel: resolvedYearLevel,
    section: resolvedSection,
    requestedOwnSchedule:
      hasApprovedOwnScheduleRequest ||
      studentWithOwnScheduleFallback.requestedOwnSchedule,
    ownScheduleRequestStatus: hasApprovedOwnScheduleRequest
      ? "Approved"
      : studentWithOwnScheduleFallback.ownScheduleRequestStatus,
    ownScheduleAcademicYear: hasApprovedOwnScheduleRequest
      ? approvedEnrollmentRequest.academicYear
      : studentWithOwnScheduleFallback.ownScheduleAcademicYear,
    ownScheduleSemester: hasApprovedOwnScheduleRequest
      ? normalizeStoredSemester(approvedEnrollmentRequest.semester)
      : studentWithOwnScheduleFallback.ownScheduleSemester,
    ownScheduleSelectionStatus: hasApprovedOwnScheduleRequest
      ? studentWithOwnScheduleFallback.ownScheduleSelectionStatus ||
        "Not Submitted"
      : studentWithOwnScheduleFallback.ownScheduleSelectionStatus,
  };
};

const hasResolvedStudentStateChanged = (
  originalStudent: StudentStorageRecord,
  resolvedStudent: StudentStorageRecord,
) =>
  normalizeComparableStudentValue(originalStudent.yearLevel) !==
    normalizeComparableStudentValue(resolvedStudent.yearLevel) ||
  normalizeComparableStudentValue(originalStudent.section) !==
    normalizeComparableStudentValue(resolvedStudent.section) ||
  Boolean(originalStudent.requestedOwnSchedule) !==
    Boolean(resolvedStudent.requestedOwnSchedule) ||
  normalizeComparableStudentValue(originalStudent.ownScheduleRequestStatus) !==
    normalizeComparableStudentValue(resolvedStudent.ownScheduleRequestStatus) ||
  normalizeComparableStudentValue(originalStudent.ownScheduleAcademicYear) !==
    normalizeComparableStudentValue(resolvedStudent.ownScheduleAcademicYear) ||
  normalizeComparableStudentValue(originalStudent.ownScheduleSemester) !==
    normalizeComparableStudentValue(resolvedStudent.ownScheduleSemester) ||
  normalizeComparableStudentValue(originalStudent.ownScheduleSelectionStatus) !==
    normalizeComparableStudentValue(resolvedStudent.ownScheduleSelectionStatus);

export const getStudentsForBranch = (branch?: string | null) => {
  const resolvedBranch = normalizeBranchName(branch);
  const storedStudents = readStoredStudents();
  let didResolveStudentState = false;

  const nextStudents = storedStudents.map((student) => {
    if (normalizeBranchName(student.branch) !== resolvedBranch) {
      return student;
    }

    const resolvedStudent = resolveStoredStudentEnrollmentState(student);

    if (!hasResolvedStudentStateChanged(student, resolvedStudent)) {
      return student;
    }

    didResolveStudentState = true;
    return resolvedStudent;
  });

  if (didResolveStudentState) {
    writeStoredStudents(nextStudents);
  }

  return nextStudents.filter(
    (student) => normalizeBranchName(student.branch) === resolvedBranch,
  );
};

const normalizeAcademicDescriptor = (value?: string | null) => {
  const normalized = (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized || normalized === "all") {
    return normalized;
  }

  if (normalized.includes("entrepreneur")) {
    return "entrepreneurship";
  }

  if (
    /\bict\b/.test(normalized) ||
    normalized.includes("information communications technology")
  ) {
    return "ict";
  }

  if (/\bgas\b/.test(normalized) || normalized.includes("general academic")) {
    return "gas";
  }

  if (
    normalized.includes("humss") ||
    normalized.includes("humanities and social sciences")
  ) {
    return "humss";
  }

  if (
    /\babm\b/.test(normalized) ||
    normalized.includes("accountancy business and management")
  ) {
    return "abm";
  }

  if (/\bstem\b/.test(normalized)) {
    return "stem";
  }

  if (normalized.includes("industrial arts")) {
    return "ia";
  }

  if (
    normalized.includes("computer science") ||
    normalized.includes("bscs")
  ) {
    return "computer science";
  }

  if (
    normalized.includes("information technology") ||
    normalized.includes("bsit")
  ) {
    return "information technology";
  }

  return normalized;
};

const resolveStoredSubjectStrandOrCourse = (subject: StoredAcademicSubject) =>
  subject.program === "College"
    ? subject.strand || DEFAULT_COLLEGE_COURSE
    : subject.strand || "All";

const matchesStrandOrCourse = (
  leftValue?: string | null,
  rightValue?: string | null,
) => {
  const left = normalizeAcademicDescriptor(leftValue);
  const right = normalizeAcademicDescriptor(rightValue);

  if (!left || !right) {
    return true;
  }

  if (left === "all" || right === "all") {
    return true;
  }

  return left.includes(right) || right.includes(left);
};

const normalizeYearLevelForComparison = (value?: string | null) =>
  (value || "").trim().toLowerCase();

const yearLevelsMatch = (
  leftValue?: string | null,
  rightValue?: string | null,
) =>
  normalizeYearLevelForComparison(leftValue) ===
  normalizeYearLevelForComparison(rightValue);

const getStoredProgramYearLevelOptions = (program: string) =>
  program === "SHS"
    ? ["Grade 11", "Grade 12"]
    : ["1st Year", "2nd Year", "3rd Year", "4th Year"];

const getStoredSubjectYearLevelRank = (program: string, yearLevel: string) => {
  const options = getStoredProgramYearLevelOptions(program);
  const matchedIndex = options.findIndex(
    (option) => option.toLowerCase() === yearLevel.trim().toLowerCase(),
  );

  return matchedIndex === -1 ? options.length : matchedIndex;
};

const subjectIsAtOrBeforeYearLevel = (
  subject: Pick<StoredAcademicSubject, "program" | "yearLevel">,
  yearLevel: string,
) =>
  getStoredSubjectYearLevelRank(subject.program, subject.yearLevel) <=
  getStoredSubjectYearLevelRank(subject.program, yearLevel);

const getStoredSubjectSemesterRank = (semester: string) => {
  const normalizedSemester = normalizeStoredSemester(semester);
  const matchedIndex = STORED_SEMESTER_ORDER.findIndex(
    (option) => option.toLowerCase() === normalizedSemester.toLowerCase(),
  );

  return matchedIndex === -1 ? STORED_SEMESTER_ORDER.length : matchedIndex;
};

const compareStoredSubjectSequence = (
  left: Pick<StoredAcademicSubject, "program" | "yearLevel" | "semester" | "code" | "name">,
  right: Pick<StoredAcademicSubject, "program" | "yearLevel" | "semester" | "code" | "name">,
) =>
  getStoredSubjectYearLevelRank(left.program, left.yearLevel) -
    getStoredSubjectYearLevelRank(right.program, right.yearLevel) ||
  getStoredSubjectSemesterRank(left.semester) -
    getStoredSubjectSemesterRank(right.semester) ||
  left.code.localeCompare(right.code) ||
  left.name.localeCompare(right.name);

const normalizeStoredSectionCode = (value?: string | null) =>
  value?.trim().toUpperCase() || "";

const isActiveStoredStudent = (student: StudentStorageRecord) =>
  (student.status || "").trim().toLowerCase() !== "archived";

const getStoredStudentSectionCounts = (
  students: StudentStorageRecord[],
  branch: string,
) =>
  students.reduce((counts, student) => {
    if (
      normalizeBranchName(student.branch) !== branch ||
      !isActiveStoredStudent(student)
    ) {
      return counts;
    }

    const sectionCode = normalizeStoredSectionCode(student.section);

    if (!sectionCode) {
      return counts;
    }

    counts.set(sectionCode, (counts.get(sectionCode) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

const applyStoredStudentSectionCounts = (
  sections: StoredClassSection[],
  students: StudentStorageRecord[],
  branch: string,
) => {
  const sectionCounts = getStoredStudentSectionCounts(students, branch);

  return sections.map((section) => {
    const currentEnrollees =
      sectionCounts.get(normalizeStoredSectionCode(section.code)) ?? 0;

    return {
      ...section,
      currentEnrollees,
      maxCapacity: Math.max(Number(section.maxCapacity ?? 0), currentEnrollees, 1),
      enrolleeIds: [],
    };
  });
};

const normalizeStoredSemester = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase() || "";

  if (!normalized) {
    return DEFAULT_SECTION_SEMESTER;
  }

  if (normalized.includes("summer")) {
    return "Summer";
  }

  if (
    normalized.includes("2nd") ||
    normalized.includes("second") ||
    normalized.includes("sem 2") ||
    normalized.includes("sem2") ||
    normalized.includes("semester 2")
  ) {
    return "2nd Semester";
  }

  if (
    normalized.includes("1st") ||
    normalized.includes("first") ||
    normalized.includes("sem 1") ||
    normalized.includes("sem1") ||
    normalized.includes("semester 1")
  ) {
    return "1st Semester";
  }

  return DEFAULT_SECTION_SEMESTER;
};

const isTerminalStoredGradeRecord = (record: StoredStudentGradeRecord) => {
  if (record.programType !== "College") {
    return true;
  }

  const normalizedPeriod = record.gradingPeriod.trim().toLowerCase();
  const normalizedSemester = record.semester.trim().toLowerCase();

  return (
    normalizedPeriod === normalizedSemester ||
    normalizedPeriod.includes("final") ||
    normalizedPeriod.includes("overall")
  );
};

const getStoredGradeAcademicYearSortValue = (academicYear?: string) => {
  const match = academicYear?.match(/\d{4}/);
  return match ? Number(match[0]) : 0;
};

const compareStoredGradeRecords = (
  left: StoredStudentGradeRecord,
  right: StoredStudentGradeRecord,
) =>
  getStoredGradeAcademicYearSortValue(left.academicYear) -
    getStoredGradeAcademicYearSortValue(right.academicYear) ||
  getStoredSubjectSemesterRank(left.semester) -
    getStoredSubjectSemesterRank(right.semester) ||
  left.updatedAt.localeCompare(right.updatedAt) ||
  left.gradingPeriod.localeCompare(right.gradingPeriod);

const normalizeStoredSubjectCompletionCode = (code?: string | null) =>
  code?.trim().toUpperCase() || "";

const getCompletedSubjectCodes = (gradeRecords: StoredStudentGradeRecord[]) => {
  const latestTerminalRecordsBySubject = new Map<string, StoredStudentGradeRecord>();

  gradeRecords.filter(isTerminalStoredGradeRecord).forEach((record) => {
    const subjectCode = normalizeStoredSubjectCompletionCode(record.subjectCode);

    if (!subjectCode) {
      return;
    }

    const existingRecord = latestTerminalRecordsBySubject.get(subjectCode);

    if (!existingRecord || compareStoredGradeRecords(record, existingRecord) >= 0) {
      latestTerminalRecordsBySubject.set(subjectCode, record);
    }
  });

  return new Set(
    Array.from(latestTerminalRecordsBySubject.values())
      .filter((record) => record.evaluation === "Passed")
      .map((record) => normalizeStoredSubjectCompletionCode(record.subjectCode)),
  );
};

const getLatestTerminalGradeRecordsBySubjectCode = (
  gradeRecords: StoredStudentGradeRecord[],
) => {
  const latestRecordsBySubject = new Map<string, StoredStudentGradeRecord>();

  gradeRecords.filter(isTerminalStoredGradeRecord).forEach((record) => {
    const subjectCode = normalizeStoredSubjectCompletionCode(record.subjectCode);

    if (!subjectCode) {
      return;
    }

    const existingRecord = latestRecordsBySubject.get(subjectCode);

    if (!existingRecord || compareStoredGradeRecords(record, existingRecord) >= 0) {
      latestRecordsBySubject.set(subjectCode, record);
    }
  });

  return latestRecordsBySubject;
};

const subjectIsCompletedByGrades = (
  subject: Pick<StoredAcademicSubject, "code">,
  completedSubjectCodes: Set<string>,
) => completedSubjectCodes.has(normalizeStoredSubjectCompletionCode(subject.code));

const getStoredSubjectLookupKeys = (
  subject: Pick<StoredAcademicSubject, "id" | "code">,
) =>
  [
    subject.id,
    subject.code,
    normalizeStoredSubjectCompletionCode(subject.code),
  ].filter(Boolean);

const subjectPrerequisitesArePassed = ({
  subject,
  subjects,
  latestGradeRecordsBySubjectCode,
}: {
  subject: Pick<StoredAcademicSubject, "prerequisiteSubjectIds">;
  subjects: Pick<StoredAcademicSubject, "id" | "code">[];
  latestGradeRecordsBySubjectCode: Map<string, StoredStudentGradeRecord>;
}) => {
  const prerequisiteIds = subject.prerequisiteSubjectIds ?? [];

  if (prerequisiteIds.length === 0) {
    return true;
  }

  const subjectsByKey = new Map<string, Pick<StoredAcademicSubject, "id" | "code">>();

  subjects.forEach((candidate) => {
    getStoredSubjectLookupKeys(candidate).forEach((key) => {
      subjectsByKey.set(key, candidate);
    });
  });

  return prerequisiteIds.every((prerequisiteId) => {
    const prerequisiteSubject = subjectsByKey.get(prerequisiteId);
    const prerequisiteCode = normalizeStoredSubjectCompletionCode(
      prerequisiteSubject?.code || prerequisiteId,
    );
    const latestGradeRecord =
      latestGradeRecordsBySubjectCode.get(prerequisiteCode);

    return latestGradeRecord?.evaluation === "Passed";
  });
};

const getPreferredStartingSemester = (
  subjects: Pick<StoredAcademicSubject, "semester">[],
) => {
  const semesters = Array.from(
    new Set(subjects.map((subject) => normalizeStoredSemester(subject.semester))),
  );

  if (semesters.length === 0) {
    return undefined;
  }

  return [...semesters].sort(
    (left, right) =>
      STORED_SEMESTER_ORDER.indexOf(
        left as (typeof STORED_SEMESTER_ORDER)[number],
      ) -
        STORED_SEMESTER_ORDER.indexOf(
          right as (typeof STORED_SEMESTER_ORDER)[number],
        ) || left.localeCompare(right),
  )[0];
};

const formatClockTime = (value?: string) => {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return value || "TBA";
  }

  const [rawHour, rawMinute] = value.split(":").map(Number);
  const suffix = rawHour >= 12 ? "PM" : "AM";
  const hour = rawHour % 12 || 12;
  return `${hour}:${rawMinute.toString().padStart(2, "0")} ${suffix}`;
};

const formatScheduleLabel = (schedule: StoredSchedule[] = []) =>
  schedule.length > 0
    ? schedule
        .map(
          (slot) =>
            `${slot.day.slice(0, 3)} ${formatClockTime(slot.startTime)}-${formatClockTime(slot.endTime)}`,
        )
        .join(" / ")
    : "TBA";

const formatScheduleDays = (schedule: StoredSchedule[] = []) =>
  schedule.length > 0
    ? Array.from(new Set(schedule.map((slot) => slot.day.slice(0, 3)))).join(", ")
    : "TBA";

const formatScheduleTime = (schedule: StoredSchedule[] = []) =>
  schedule.length > 0
    ? schedule
        .map(
          (slot) =>
            `${formatClockTime(slot.startTime)}-${formatClockTime(slot.endTime)}`,
        )
        .join(" / ")
    : "TBA";

const formatScheduleRooms = (schedule: StoredSchedule[] = []) =>
  schedule.length > 0
    ? Array.from(new Set(schedule.map((slot) => slot.room || "TBA"))).join(", ")
    : "TBA";

const sortPortalSubjects = (subjects: StudentPortalSubject[]) =>
  [...subjects].sort((left, right) => left.code.localeCompare(right.code));

const storedSubjectMatchesAssignment = (
  subject: Pick<StoredAcademicSubject, "id" | "code" | "semester">,
  assignment: Pick<StoredSubjectAssignment, "subjectId" | "subjectCode" | "semester">,
) =>
  normalizeStoredSemester(subject.semester) ===
    normalizeStoredSemester(assignment.semester) &&
  ((Boolean(assignment.subjectId) && subject.id === assignment.subjectId) ||
    normalizeStoredSubjectCompletionCode(subject.code) ===
      normalizeStoredSubjectCompletionCode(assignment.subjectCode));

const mapStoredSubjectsToPortalSubjects = (
  subjects: StoredAcademicSubject[],
  academicYear = "2026-2027",
): StudentPortalSubject[] =>
  sortPortalSubjects(
    subjects.map((subject) => ({
      id: subject.id,
      code: subject.code,
      title: subject.name,
      units: subject.units,
      instructorId: undefined,
      section: undefined,
      schedule: "TBA",
      room: "TBA",
      professor: "TBA",
      days: "TBA",
      time: "TBA",
      semester: normalizeStoredSemester(subject.semester),
      academicYear,
    })),
  );

const mapStoredAssignmentsToPortalSubjects = (
  assignments: StoredSubjectAssignment[],
  storedSubjects: StoredAcademicSubject[],
) =>
  sortPortalSubjects(
    assignments.map((assignment) => {
      const subjectDetails = storedSubjects.find(
        (subject) => storedSubjectMatchesAssignment(subject, assignment),
      );

      return {
        id: assignment.id,
        code: assignment.subjectCode,
        title: assignment.subjectName,
        units: subjectDetails?.units,
        instructorId: assignment.instructorId || undefined,
        section: assignment.sectionCode,
        schedule: formatScheduleLabel(assignment.schedule),
        room: formatScheduleRooms(assignment.schedule),
        professor: assignment.instructorName || "TBA",
        days: formatScheduleDays(assignment.schedule),
        time: formatScheduleTime(assignment.schedule),
        semester: normalizeStoredSemester(assignment.semester),
        academicYear: assignment.academicYear,
      };
    }),
  );

const mapPlanItemsToPortalSubjects = (
  items: StudentSubjectPlanItem[],
  semester: string,
  academicYear: string,
) =>
  sortPortalSubjects(
    items.map((item) => ({
      id: item.subjectId || item.subjectCode,
      code: item.subjectCode,
      title: item.subjectName,
      units: item.units,
      instructorId: undefined,
      section: undefined,
      schedule: "TBA",
      room: "TBA",
      professor: "TBA",
      days: "TBA",
      time: "TBA",
      semester: normalizeStoredSemester(semester),
      academicYear,
    })),
  );

const mapScheduledAssignmentsToPortalSubjects = (
  assignments: StudentScheduledAssignmentItem[],
  plannedSubjects: StudentSubjectPlanItem[] = [],
  storedSubjects: StoredAcademicSubject[] = [],
  termOverride?: { academicYear?: string; semester?: string },
) =>
  sortPortalSubjects(
    assignments.map((assignment) => {
      const resolvedSemester = normalizeStoredSemester(
        termOverride?.semester || assignment.semester,
      );
      const resolvedAcademicYear =
        termOverride?.academicYear || assignment.academicYear;
      const matchingPlannedSubject = plannedSubjects.find((item) =>
        subjectPlanItemMatches(item, assignment.subjectId, assignment.subjectCode),
      );
      const matchingStoredSubject = storedSubjects.find(
        (subject) =>
          (subject.id === assignment.subjectId ||
            subject.code === assignment.subjectCode) &&
          normalizeStoredSemester(subject.semester) ===
            normalizeStoredSemester(assignment.semester),
      );

      return {
        id: assignment.assignmentId,
        code: assignment.subjectCode,
        title: assignment.subjectName,
        units:
          assignment.units ??
          matchingPlannedSubject?.units ??
          matchingStoredSubject?.units,
        instructorId: assignment.instructorId || undefined,
        section: assignment.sectionCode,
        schedule: formatScheduleLabel(assignment.schedule),
        room: formatScheduleRooms(assignment.schedule),
        professor: assignment.instructorName || "TBA",
        days: formatScheduleDays(assignment.schedule),
        time: formatScheduleTime(assignment.schedule),
        semester: resolvedSemester,
        academicYear: resolvedAcademicYear,
      };
    }),
  );

export const getStudentPortalSubjectsFromScheduledAssignments = ({
  branch,
  assignments,
  plannedSubjects = [],
  academicYear,
  semester,
  useProvidedTermForScheduledAssignments = false,
}: {
  branch?: string | null;
  assignments: StudentScheduledAssignmentItem[];
  plannedSubjects?: StudentSubjectPlanItem[];
  academicYear?: string;
  semester?: string;
  useProvidedTermForScheduledAssignments?: boolean;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const storedSubjects =
    (readBranchScopedData<StoredAcademicSubject[]>("subjects", resolvedBranch) ?? []).map(
      (subject) => ({
        ...subject,
        semester: normalizeStoredSemester(subject.semester),
      }),
    );
  const scheduledPortalSubjects = mapScheduledAssignmentsToPortalSubjects(
    assignments,
    plannedSubjects,
    storedSubjects,
    useProvidedTermForScheduledAssignments
      ? { academicYear, semester }
      : undefined,
  );
  const scheduledSubjectKeys = new Set(
    assignments.flatMap((assignment) => [
      assignment.subjectId,
      assignment.subjectCode,
    ]),
  );
  const unscheduledPlannedSubjects = plannedSubjects.filter(
    (subject) =>
      !scheduledSubjectKeys.has(subject.subjectId) &&
      !scheduledSubjectKeys.has(subject.subjectCode),
  );

  if (unscheduledPlannedSubjects.length === 0) {
    return scheduledPortalSubjects;
  }

  return sortPortalSubjects([
    ...scheduledPortalSubjects,
    ...mapPlanItemsToPortalSubjects(
      unscheduledPlannedSubjects,
      semester || assignments[0]?.semester || "1st Semester",
      academicYear || assignments[0]?.academicYear || "2026-2027",
    ),
  ]);
};

const subjectPlanItemMatches = (
  item: Pick<StudentSubjectPlanItem, "subjectId" | "subjectCode">,
  subjectId?: string | null,
  subjectCode?: string | null,
) =>
  (Boolean(item.subjectId) && Boolean(subjectId) && item.subjectId === subjectId) ||
  (Boolean(item.subjectCode) &&
    Boolean(subjectCode) &&
    item.subjectCode === subjectCode);

const findMatchingStudentSubjectPlan = (
  student: Pick<StudentStorageRecord, "id" | "trackingNumber">,
  branch: AdminBranchName,
  plans: Record<string, StudentSubjectPlanRecord>,
) =>
  Object.values(plans).find((plan) => {
    if (student.trackingNumber && plan.trackingNumber === student.trackingNumber) {
      return true;
    }

    return studentNumbersMatch(plan.studentNumber, student.id, branch);
  }) ?? null;

const shouldUseStudentSubjectPlan = (
  student: Partial<
    Pick<
      StudentStorageRecord,
      "ownScheduleRequestStatus" | "requestedOwnSchedule" | "studentStatus"
    >
  >,
  plan: StudentSubjectPlanRecord | null,
) => {
  if (!plan) {
    return false;
  }

  if (plan.source === "student_schedule_request") {
    return (
      student.requestedOwnSchedule === true ||
      student.ownScheduleRequestStatus === "Approved"
    );
  }

  if (plan.source === "transferee_validation") {
    return student.studentStatus === "Transferee";
  }

  if (plan.source === "enrollment_request") {
    return false;
  }

  return true;
};

export const findStoredStudent = ({
  branch,
  studentNumber,
  trackingNumber,
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const normalizedStudentNumber = studentNumber?.trim()
    ? normalizeStudentNumberInput(studentNumber, resolvedBranch)
    : null;

  return readStoredStudents().find((student) => {
    if (normalizeBranchName(student.branch) !== resolvedBranch) {
      return false;
    }

    if (
      normalizedStudentNumber &&
      studentNumbersMatch(student.id, normalizedStudentNumber, resolvedBranch)
    ) {
      return true;
    }

    if (trackingNumber && student.trackingNumber === trackingNumber) {
      return true;
    }

    return false;
  });
};

export const findApprovedEnrolleeByStudentNumber = ({
  branch,
  studentNumber,
}: {
  branch?: string | null;
  studentNumber?: string | null;
}) => {
  if (!studentNumber) {
    return null;
  }

  const resolvedBranch = branch?.trim()
    ? normalizeBranchName(branch)
    : getBranchFromStudentNumber(studentNumber);

  if (!resolvedBranch) {
    return null;
  }

  const normalizedStudentNumber = normalizeStudentNumberInput(
    studentNumber,
    resolvedBranch,
  );
  const storedEnrollees =
    readBranchScopedData<AdminEnrolleeRecord[]>("enrollees", resolvedBranch) ?? [];

  return (
    storedEnrollees.find(
      (record) =>
        record.status === "Approved" &&
        studentNumbersMatch(
          record.studentNumber,
          normalizedStudentNumber,
          resolvedBranch,
        ) &&
        normalizeBranchName(record.branch) === resolvedBranch,
    ) || null
  );
};

export const getNextStudentNumber = (
  branch?: string | null,
  students = readStoredStudents(),
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const studentNumbers = students
    .filter(
      (student) => normalizeBranchName(student.branch) === resolvedBranch,
    )
    .map((student) => getStudentNumberSequenceValue(student.id, resolvedBranch))
    .filter((studentNumber): studentNumber is number =>
      Number.isFinite(studentNumber),
    )
    .filter((studentNumber) => studentNumber >= STUDENT_NUMBER_FLOOR);

  const nextStudentNumber =
    studentNumbers.length > 0
      ? Math.max(...studentNumbers) + 1
      : STUDENT_NUMBER_FLOOR + 1;

  return formatStudentNumber(resolvedBranch, nextStudentNumber);
};

export const syncApprovedStudentNumber = ({
  branch,
  trackingNumber,
  previousStudentNumber,
  nextStudentNumber,
}: {
  branch?: string | null;
  trackingNumber?: string | null;
  previousStudentNumber?: string | null;
  nextStudentNumber: string;
}) => {
  const resolvedBranch = branch?.trim()
    ? normalizeBranchName(branch)
    : getBranchFromStudentNumber(nextStudentNumber) ??
      getBranchFromStudentNumber(previousStudentNumber);

  if (!resolvedBranch) {
    return null;
  }

  const normalizedNextStudentNumber = nextStudentNumber.trim();

  if (!normalizedNextStudentNumber) {
    return null;
  }

  const storedEnrollees =
    readBranchScopedData<AdminEnrolleeRecord[]>("enrollees", resolvedBranch) ?? [];
  let updatedEnrollee: AdminEnrolleeRecord | null = null;

  const nextEnrollees = storedEnrollees.map((record) => {
    const isTargetRecord =
      (trackingNumber && record.trackingNumber === trackingNumber) ||
      (previousStudentNumber &&
        studentNumbersMatch(
          record.studentNumber,
          previousStudentNumber,
          resolvedBranch,
        ));

    if (!isTargetRecord) {
      return record;
    }

    updatedEnrollee = {
      ...record,
      studentNumber: normalizedNextStudentNumber,
      branch: resolvedBranch,
    };
    return updatedEnrollee;
  });

  if (updatedEnrollee) {
    writeBranchScopedData("enrollees", resolvedBranch, nextEnrollees);
  }

  const storedStudents = readStoredStudents();
  let hasUpdatedStoredStudent = false;
  const nextStudents = storedStudents.map((student) => {
    const matchesBranch = normalizeBranchName(student.branch) === resolvedBranch;
    const isTargetRecord =
      matchesBranch &&
      ((trackingNumber && student.trackingNumber === trackingNumber) ||
        (previousStudentNumber &&
          studentNumbersMatch(student.id, previousStudentNumber, resolvedBranch)));

    if (!isTargetRecord) {
      return student;
    }

    hasUpdatedStoredStudent = true;
    return {
      ...student,
      id: normalizedNextStudentNumber,
      branch: resolvedBranch,
    };
  });

  if (hasUpdatedStoredStudent) {
    writeStoredStudents(nextStudents);
  }

  return updatedEnrollee;
};

const getAttachmentKey = (attachment: Pick<AdminAttachment, "name">) =>
  attachment.name.trim().toLowerCase();

const hasApprovedHonorCertificate = (attachments: AdminAttachment[] = []) =>
  attachments.some(
    (attachment) =>
      getAttachmentKey(attachment) === "honor certificate" &&
      attachment.reviewStatus === "Approved",
  );

const hasRealAttachmentUrl = (attachment: Pick<AdminAttachment, "url">) =>
  !!attachment.url && attachment.url !== "#";

const getEffectiveSubmittedAttachments = (
  attachments: AdminAttachment[] = [],
  documentsSubmitted = 0,
) => {
  const uploadedAttachments = attachments.filter(hasRealAttachmentUrl);

  if (uploadedAttachments.length > 0) {
    return uploadedAttachments;
  }

  if (documentsSubmitted > 0) {
    return attachments.slice(0, Math.min(documentsSubmitted, attachments.length));
  }

  return [];
};

const mergeAttachmentLists = (
  baseAttachments: AdminAttachment[] = [],
  persistedAttachments: AdminAttachment[] = [],
) => {
  const mergedAttachments = new Map<string, AdminAttachment>();

  baseAttachments.forEach((attachment) => {
    mergedAttachments.set(getAttachmentKey(attachment), attachment);
  });

  persistedAttachments.forEach((attachment) => {
    const key = getAttachmentKey(attachment);
    const existingAttachment = mergedAttachments.get(key);

    mergedAttachments.set(key, {
      ...existingAttachment,
      ...attachment,
      url:
        existingAttachment?.url &&
        existingAttachment.url !== "#" &&
        existingAttachment.url !== ""
          ? existingAttachment.url
          : attachment.url,
      reviewStatus:
        attachment.reviewStatus || existingAttachment?.reviewStatus || "Pending",
    });
  });

  return Array.from(mergedAttachments.values());
};

export const mergeAdminEnrolleeRecords = (
  baseRecords: AdminEnrolleeRecord[],
  persistedRecords: AdminEnrolleeRecord[] = [],
) => {
  const mergedRecords = new Map<string, AdminEnrolleeRecord>();

  baseRecords.forEach((record) => {
    mergedRecords.set(record.trackingNumber, record);
  });

  persistedRecords.forEach((record) => {
    const existingRecord = mergedRecords.get(record.trackingNumber);
    const mergedAttachments = existingRecord
      ? mergeAttachmentLists(existingRecord.attachments, record.attachments)
      : record.attachments;
    const authoritativeSubmittedCount =
      existingRecord &&
      (mergedAttachments?.length ?? 0) === existingRecord.totalDocuments
        ? existingRecord.documentsSubmitted
        : Math.max(
            existingRecord?.documentsSubmitted ?? 0,
            record.documentsSubmitted,
          );
    const submittedAttachments = getEffectiveSubmittedAttachments(
      mergedAttachments,
      authoritativeSubmittedCount,
    );
    const mergedHonorLabel =
      record.honorLabel ?? existingRecord?.honorLabel ?? "No Honor";
    const mergedAppliedForScholarship =
      record.appliedForScholarship ??
      existingRecord?.appliedForScholarship ??
      false;
    const mergedScholarshipExamScore =
      record.scholarshipExamScore ??
      existingRecord?.scholarshipExamScore ??
      null;
    const tuitionEstimate = getEstimatedCollegeTuition({
      honorLabel: mergedHonorLabel,
      honorCertificateApproved: hasApprovedHonorCertificate(mergedAttachments),
      appliedForScholarship: mergedAppliedForScholarship,
      scholarshipExamScore: mergedScholarshipExamScore,
    });

    const mergedRecord = existingRecord
      ? {
          ...existingRecord,
          ...record,
          documentsSubmitted: submittedAttachments.length,
          totalDocuments: existingRecord.totalDocuments || record.totalDocuments,
          strandOrCourse:
            existingRecord.strandOrCourse || record.strandOrCourse,
          honorLabel: mergedHonorLabel,
          honorDiscountPercentage: tuitionEstimate.honorDiscountPercentage,
          appliedForScholarship: mergedAppliedForScholarship,
          scholarshipExamScore: mergedScholarshipExamScore,
          effectiveDiscountPercentage: tuitionEstimate.effectiveDiscountPercentage,
          effectiveDiscountSource: tuitionEstimate.effectiveDiscountSource,
          personalInfo: {
            ...existingRecord.personalInfo,
            ...record.personalInfo,
          },
          attachments: mergedAttachments,
          status: record.status || existingRecord.status,
          studentNumber: record.studentNumber || existingRecord.studentNumber,
          convertedAt: record.convertedAt || existingRecord.convertedAt,
        }
      : {
          ...record,
          honorLabel: mergedHonorLabel,
          honorDiscountPercentage: tuitionEstimate.honorDiscountPercentage,
          appliedForScholarship: mergedAppliedForScholarship,
          scholarshipExamScore: mergedScholarshipExamScore,
          effectiveDiscountPercentage: tuitionEstimate.effectiveDiscountPercentage,
          effectiveDiscountSource: tuitionEstimate.effectiveDiscountSource,
        };

    mergedRecords.set(
      record.trackingNumber,
      normalizeAdminEnrolleeCapitalization(mergedRecord),
    );
  });

  return Array.from(mergedRecords.values()).sort((left, right) =>
    right.applicationDate.localeCompare(left.applicationDate),
  );
};

export const getStudentRequirementSnapshot = ({
  branch,
  studentNumber,
  trackingNumber,
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
}) => {
  const storedEnrollees =
    readBranchScopedData<AdminEnrolleeRecord[]>("enrollees", branch) ?? [];
  const applicantRecord = storedEnrollees.find(
    (record) =>
      (trackingNumber && record.trackingNumber === trackingNumber) ||
      (studentNumber && record.studentNumber === studentNumber),
  );

  if (!applicantRecord) {
    return null;
  }

  const allRequirements = getAdmissionRequirements(
    applicantRecord.studentStatus,
    mapAdminProgramToAdmissionProgram(applicantRecord.program),
    applicantRecord.honorLabel || "No Honor",
  );
  const allAttachments = applicantRecord.attachments ?? [];
  const submittedAttachments = getEffectiveSubmittedAttachments(
    allAttachments,
    applicantRecord.documentsSubmitted,
  );
  const acceptedSubmittedAttachments = submittedAttachments.filter(
    (attachment) => attachment.reviewStatus !== "Rejected",
  );
  const submittedNames = new Set(
    acceptedSubmittedAttachments.map((attachment) =>
      attachment.name.trim().toLowerCase(),
    ),
  );
  const pendingRequirements = allRequirements.filter(
    (requirement) => !submittedNames.has(requirement.name.trim().toLowerCase()),
  );

  return {
    applicantRecord,
    submittedAttachments: acceptedSubmittedAttachments,
    pendingRequirements,
    summary: {
      total: allRequirements.length,
      submitted: acceptedSubmittedAttachments.length,
      pending: pendingRequirements.length,
      approved: acceptedSubmittedAttachments.filter(
        (attachment) => attachment.reviewStatus === "Approved",
      ).length,
      rejected: submittedAttachments.filter(
        (attachment) => attachment.reviewStatus === "Rejected",
      ).length,
    },
  };
};

export const getStudentCredentialOverview = ({
  branch,
  studentNumber,
  trackingNumber,
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
}) => {
  const snapshot = getStudentRequirementSnapshot({
    branch,
    studentNumber,
    trackingNumber,
  });

  if (!snapshot) {
    return null;
  }

  const attachmentsByName = new Map(
    (snapshot.applicantRecord.attachments ?? []).map((attachment) => [
      attachment.name.trim().toLowerCase(),
      attachment,
    ]),
  );
  const allRequirements = getAdmissionRequirements(
    snapshot.applicantRecord.studentStatus,
    mapAdminProgramToAdmissionProgram(snapshot.applicantRecord.program),
    snapshot.applicantRecord.honorLabel || "No Honor",
  );

  const items: StudentPortalCredentialItem[] = allRequirements.map(
    (requirement) => {
      const attachment = attachmentsByName.get(requirement.name.trim().toLowerCase());
      const isRejected = attachment?.reviewStatus === "Rejected";
      const hasFile =
        !!attachment && hasRealAttachmentUrl(attachment) && !isRejected;
      const isSubmitted =
        hasFile ||
        (!isRejected &&
          snapshot.submittedAttachments.some(
            (submittedAttachment) =>
              getAttachmentKey(submittedAttachment) ===
              requirement.name.trim().toLowerCase(),
          ));
      const reviewStatus = isSubmitted
        ? attachment?.reviewStatus || "Pending"
        : attachment?.reviewStatus === "Rejected"
          ? "Rejected"
          : "Pending";

      return {
        code: requirement.code,
        name: requirement.name,
        isSubmitted,
        reviewStatus,
        statusLabel: !isSubmitted
          ? "Pending Submission"
          : reviewStatus === "Approved"
            ? "Approved"
            : reviewStatus === "Rejected"
              ? "Needs Reupload"
              : "Under Review",
        url: hasFile ? attachment?.url : undefined,
      };
    },
  );

  const summary: StudentPortalCredentialSummary = {
    ...snapshot.summary,
    overallStatus:
      snapshot.summary.rejected > 0
        ? "Needs Reupload"
        : snapshot.summary.pending === 0 &&
            snapshot.summary.approved === snapshot.summary.total &&
            snapshot.summary.total > 0
          ? "Complete"
          : snapshot.summary.submitted === 0
            ? "Pending Documents"
            : snapshot.summary.pending === 0
              ? "Under Review"
              : "Partially Submitted",
  };

  return {
    items,
    summary,
    applicantRecord: snapshot.applicantRecord,
  };
};

export const syncStudentCredentialUpload = async ({
  branch,
  trackingNumber,
  studentNumber,
  requirementName,
  mimeType,
  storagePath,
  storageBucket = REQUIREMENTS_BUCKET,
  reviewStatus = "Pending",
}: {
  branch?: string | null;
  trackingNumber?: string | null;
  studentNumber?: string | null;
  requirementName: string;
  mimeType?: string | null;
  storagePath: string;
  storageBucket?: string;
  reviewStatus?: NonNullable<AdminAttachment["reviewStatus"]>;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const storedEnrollees =
    readBranchScopedData<AdminEnrolleeRecord[]>("enrollees", resolvedBranch) ?? [];
  const requirementKey = requirementName.trim().toLowerCase();
  const signedUrl = await getSignedRequirementUrl(storagePath, storageBucket);

  const nextEnrollees = storedEnrollees.map((record) => {
    const isTargetRecord =
      (trackingNumber && record.trackingNumber === trackingNumber) ||
      (studentNumber && record.studentNumber === studentNumber);

    if (!isTargetRecord) {
      return record;
    }

    const existingAttachments = record.attachments ?? [];
    const matchingAttachmentIndex = existingAttachments.findIndex(
      (attachment) => getAttachmentKey(attachment) === requirementKey,
    );

    const nextAttachment: AdminAttachment = {
      name: requirementName,
      type: mimeType || "file",
      url: signedUrl,
      reviewStatus,
    };

    const nextAttachments =
      matchingAttachmentIndex >= 0
        ? existingAttachments.map((attachment, index) =>
            index === matchingAttachmentIndex ? nextAttachment : attachment,
          )
        : [...existingAttachments, nextAttachment];
    const submittedAttachmentCount = getEffectiveSubmittedAttachments(
      nextAttachments,
      record.documentsSubmitted,
    ).length;
    const hasRejectedAttachments = nextAttachments.some(
      (attachment) => attachment.reviewStatus === "Rejected",
    );
    const tuitionEstimate = getEstimatedCollegeTuition({
      honorLabel: record.honorLabel,
      honorCertificateApproved: hasApprovedHonorCertificate(nextAttachments),
      appliedForScholarship: record.appliedForScholarship,
      scholarshipExamScore: record.scholarshipExamScore,
    });

    return {
      ...record,
      attachments: nextAttachments,
      documentsSubmitted: submittedAttachmentCount,
      totalDocuments: Math.max(record.totalDocuments, nextAttachments.length),
      rejectionReason: hasRejectedAttachments ? record.rejectionReason : undefined,
      honorDiscountPercentage: tuitionEstimate.honorDiscountPercentage,
      effectiveDiscountPercentage: tuitionEstimate.effectiveDiscountPercentage,
      effectiveDiscountSource: tuitionEstimate.effectiveDiscountSource,
    };
  });

  writeBranchScopedData("enrollees", resolvedBranch, nextEnrollees);
  return nextEnrollees;
};

export const removeStudentCredentialUpload = ({
  branch,
  trackingNumber,
  studentNumber,
  requirementName,
}: {
  branch?: string | null;
  trackingNumber?: string | null;
  studentNumber?: string | null;
  requirementName: string;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const storedEnrollees =
    readBranchScopedData<AdminEnrolleeRecord[]>("enrollees", resolvedBranch) ?? [];
  const requirementKey = requirementName.trim().toLowerCase();
  let updatedRecord: AdminEnrolleeRecord | null = null;

  const nextEnrollees = storedEnrollees.map((record) => {
    const isTargetRecord =
      (trackingNumber && record.trackingNumber === trackingNumber) ||
      (studentNumber && record.studentNumber === studentNumber);

    if (!isTargetRecord) {
      return record;
    }

    const nextAttachments = (record.attachments ?? []).filter(
      (attachment) => getAttachmentKey(attachment) !== requirementKey,
    );
    const submittedAttachmentCount = getEffectiveSubmittedAttachments(
      nextAttachments,
      nextAttachments.length,
    ).length;
    const tuitionEstimate = getEstimatedCollegeTuition({
      honorLabel: record.honorLabel,
      honorCertificateApproved: hasApprovedHonorCertificate(nextAttachments),
      appliedForScholarship: record.appliedForScholarship,
      scholarshipExamScore: record.scholarshipExamScore,
    });

    updatedRecord = {
      ...record,
      attachments: nextAttachments,
      documentsSubmitted: submittedAttachmentCount,
      honorDiscountPercentage: tuitionEstimate.honorDiscountPercentage,
      effectiveDiscountPercentage: tuitionEstimate.effectiveDiscountPercentage,
      effectiveDiscountSource: tuitionEstimate.effectiveDiscountSource,
    };

    return updatedRecord;
  });

  if (!updatedRecord) {
    return null;
  }

  writeBranchScopedData("enrollees", resolvedBranch, nextEnrollees);
  return updatedRecord;
};

export const updateStudentRequirementReviewStatus = ({
  branch,
  trackingNumber,
  studentNumber,
  requirementName,
  status,
}: {
  branch?: string | null;
  trackingNumber?: string | null;
  studentNumber?: string | null;
  requirementName: string;
  status: NonNullable<AdminAttachment["reviewStatus"]>;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const storedEnrollees =
    readBranchScopedData<AdminEnrolleeRecord[]>("enrollees", resolvedBranch) ?? [];
  const requirementKey = requirementName.trim().toLowerCase();
  let updatedRecord: AdminEnrolleeRecord | null = null;

  const nextEnrollees = storedEnrollees.map((record) => {
    const isTargetRecord =
      (trackingNumber && record.trackingNumber === trackingNumber) ||
      (studentNumber && record.studentNumber === studentNumber);

    if (!isTargetRecord) {
      return record;
    }

    const existingAttachments = record.attachments ?? [];
    const matchingAttachmentIndex = existingAttachments.findIndex(
      (attachment) => getAttachmentKey(attachment) === requirementKey,
    );

    if (matchingAttachmentIndex < 0) {
      return record;
    }

    const nextAttachments = existingAttachments.map((attachment, index) =>
      index === matchingAttachmentIndex
        ? { ...attachment, reviewStatus: status }
        : attachment,
    );
    const tuitionEstimate = getEstimatedCollegeTuition({
      honorLabel: record.honorLabel,
      honorCertificateApproved: hasApprovedHonorCertificate(nextAttachments),
      appliedForScholarship: record.appliedForScholarship,
      scholarshipExamScore: record.scholarshipExamScore,
    });

    updatedRecord = {
      ...record,
      attachments: nextAttachments,
      honorDiscountPercentage: tuitionEstimate.honorDiscountPercentage,
      effectiveDiscountPercentage: tuitionEstimate.effectiveDiscountPercentage,
      effectiveDiscountSource: tuitionEstimate.effectiveDiscountSource,
    };

    return updatedRecord;
  });

  if (!updatedRecord) {
    return null;
  }

  writeBranchScopedData("enrollees", resolvedBranch, nextEnrollees);
  return updatedRecord;
};

export const getStudentPortalSubjects = (
  student: Pick<
    StudentStorageRecord,
    | "branch"
    | "program"
    | "yearLevel"
    | "strandOrCourse"
    | "section"
    | "requestedOwnSchedule"
    | "ownScheduleRequestStatus"
    | "ownScheduleSemester"
    | "studentStatus"
  > &
    Pick<StudentStorageRecord, "id" | "trackingNumber">,
): StudentPortalSubject[] => {
  const branch = normalizeBranchName(student.branch);
  const storedSubjects =
    (readBranchScopedData<StoredAcademicSubject[]>("subjects", branch) ?? []).map(
      (subject) => ({
        ...subject,
        semester: normalizeStoredSemester(subject.semester),
      }),
    );
  const storedAssignments =
    (
      readBranchScopedData<StoredSubjectAssignment[]>("subject-assignments", branch) ??
      []
    ).map((assignment) => ({
      ...assignment,
      semester: normalizeStoredSemester(assignment.semester),
    }));
  const storedSections =
    readBranchScopedData<StoredClassSection[]>("class-sections", branch) ?? [];
  const storedSubjectPlans =
    readBranchScopedData<Record<string, StudentSubjectPlanRecord>>(
      "student-subject-plans",
      branch,
    ) ?? {};
  const studentSubjectPlan = findMatchingStudentSubjectPlan(
    student,
    branch,
    storedSubjectPlans,
  );
  const activeStudentSubjectPlan = shouldUseStudentSubjectPlan(
    student,
    studentSubjectPlan,
  )
    ? studentSubjectPlan
    : null;
  const plannedSemester = activeStudentSubjectPlan
    ? normalizeStoredSemester(activeStudentSubjectPlan.semester)
    : undefined;
  const defaultAcademicYear =
    storedAssignments[0]?.academicYear ||
    activeStudentSubjectPlan?.academicYear ||
    "2026-2027";
  const exactMatchedSubjects = storedSubjects.filter(
    (subject) =>
      subject.program === student.program &&
      yearLevelsMatch(subject.yearLevel, student.yearLevel) &&
      matchesStrandOrCourse(
        resolveStoredSubjectStrandOrCourse(subject),
        student.strandOrCourse,
      ),
  );
  const matchedSubjects =
    exactMatchedSubjects.length > 0
      ? exactMatchedSubjects
      : storedSubjects.filter(
          (subject) =>
            subject.program === student.program &&
            yearLevelsMatch(subject.yearLevel, student.yearLevel),
        );
  const matchedSection = student.section
    ? storedSections.find(
        (section) =>
          normalizeStoredSectionCode(section.code) ===
          normalizeStoredSectionCode(student.section),
      )
    : undefined;
  const activeSectionSemester = student.section
    ? normalizeStoredSemester(
        matchedSection?.semester ||
          storedAssignments.find(
            (assignment) =>
              normalizeStoredSectionCode(assignment.sectionCode) ===
              normalizeStoredSectionCode(student.section),
          )?.semester,
      )
    : undefined;
  const ownScheduleSemester =
    student.requestedOwnSchedule || student.ownScheduleRequestStatus === "Approved"
      ? normalizeStoredSemester(student.ownScheduleSemester)
      : undefined;
  const defaultStartingSemester =
    !plannedSemester && !activeSectionSemester
      ? getPreferredStartingSemester(matchedSubjects)
      : undefined;
  const effectiveSemester =
    plannedSemester ||
    activeSectionSemester ||
    ownScheduleSemester ||
    defaultStartingSemester;
  const semesterScopedSubjects = effectiveSemester
    ? matchedSubjects.filter(
        (subject) => normalizeStoredSemester(subject.semester) === effectiveSemester,
      )
    : matchedSubjects;
  const creditedPlanSubjects = activeStudentSubjectPlan?.creditedSubjects ?? [];
  const plannedScheduledAssignments =
    activeStudentSubjectPlan?.scheduledAssignments ?? [];
  const creditedScopedSubjects =
    creditedPlanSubjects.length > 0
      ? semesterScopedSubjects.filter(
          (subject) =>
            !creditedPlanSubjects.some((item) =>
              subjectPlanItemMatches(item, subject.id, subject.code),
            ),
        )
      : semesterScopedSubjects;
  const planAcademicYear =
    activeStudentSubjectPlan?.academicYear?.trim() || defaultAcademicYear;

  if (plannedScheduledAssignments.length > 0) {
    const scheduledPortalSubjects = mapScheduledAssignmentsToPortalSubjects(
      plannedScheduledAssignments,
      activeStudentSubjectPlan?.assignedSubjects ?? [],
      storedSubjects,
    );

    if ((activeStudentSubjectPlan?.assignedSubjects.length ?? 0) > 0) {
      const scheduledAssignmentKeys = new Set(
        plannedScheduledAssignments.map(
          (assignment) =>
            `${assignment.subjectId}:${assignment.subjectCode}:${normalizeStoredSemester(assignment.semester)}`,
        ),
      );
      const unresolvedPlannedSubjects =
        activeStudentSubjectPlan?.assignedSubjects.filter(
          (item) =>
            !scheduledAssignmentKeys.has(
              `${item.subjectId}:${item.subjectCode}:${effectiveSemester || DEFAULT_SECTION_SEMESTER}`,
            ),
        ) ?? [];

      return sortPortalSubjects([
        ...scheduledPortalSubjects,
        ...mapPlanItemsToPortalSubjects(
          unresolvedPlannedSubjects,
          effectiveSemester || DEFAULT_SECTION_SEMESTER,
          planAcademicYear,
        ),
      ]);
    }

    return scheduledPortalSubjects;
  }

  if ((activeStudentSubjectPlan?.assignedSubjects.length ?? 0) > 0) {
    const plannedSubjects = activeStudentSubjectPlan?.assignedSubjects ?? [];
    const plannedCatalogSubjects = creditedScopedSubjects.filter((subject) =>
      plannedSubjects.some((item) =>
        subjectPlanItemMatches(item, subject.id, subject.code),
      ),
    );
    const unresolvedPlannedSubjects = plannedSubjects.filter(
      (item) =>
        !plannedCatalogSubjects.some((subject) =>
          subjectPlanItemMatches(item, subject.id, subject.code),
        ),
    );

    if (student.section) {
      const plannedAssignments = storedAssignments.filter(
          (assignment) =>
          normalizeStoredSectionCode(assignment.sectionCode) ===
            normalizeStoredSectionCode(student.section) &&
          (!effectiveSemester ||
            normalizeStoredSemester(assignment.semester) === effectiveSemester) &&
          plannedSubjects.some((item) =>
            subjectPlanItemMatches(
              item,
              assignment.subjectId,
              assignment.subjectCode,
            ),
          ),
      );

      if (plannedAssignments.length > 0) {
        const assignedPortalSubjects = mapStoredAssignmentsToPortalSubjects(
          plannedAssignments,
          storedSubjects,
        );
        const remainingCatalogSubjects = plannedCatalogSubjects.filter(
          (subject) =>
            !plannedAssignments.some((assignment) =>
              storedSubjectMatchesAssignment(subject, assignment),
            ),
        );

        return sortPortalSubjects([
          ...assignedPortalSubjects,
          ...mapStoredSubjectsToPortalSubjects(
            remainingCatalogSubjects,
            planAcademicYear,
          ),
          ...mapPlanItemsToPortalSubjects(
            unresolvedPlannedSubjects,
            effectiveSemester || DEFAULT_SECTION_SEMESTER,
            planAcademicYear,
          ),
        ]);
      }
    }

    return sortPortalSubjects([
      ...mapStoredSubjectsToPortalSubjects(plannedCatalogSubjects, planAcademicYear),
      ...mapPlanItemsToPortalSubjects(
        unresolvedPlannedSubjects,
        effectiveSemester || DEFAULT_SECTION_SEMESTER,
        planAcademicYear,
      ),
    ]);
  }

  if (student.section) {
    const sectionAssignments = storedAssignments.filter(
      (assignment) =>
        normalizeStoredSectionCode(assignment.sectionCode) ===
          normalizeStoredSectionCode(student.section) &&
        (!effectiveSemester ||
          normalizeStoredSemester(assignment.semester) === effectiveSemester) &&
        !creditedPlanSubjects.some((item) =>
          subjectPlanItemMatches(item, assignment.subjectId, assignment.subjectCode),
        ),
    );

    if (sectionAssignments.length > 0) {
      const assignedSemesters = new Set(
        sectionAssignments.map((assignment) => assignment.semester),
      );
      const assignedAcademicYear =
        sectionAssignments[0]?.academicYear || defaultAcademicYear;
      const assignedPortalSubjects = mapStoredAssignmentsToPortalSubjects(
        sectionAssignments,
        storedSubjects,
      );
      const remainingCatalogSubjects = creditedScopedSubjects.filter(
        (subject) =>
          assignedSemesters.has(subject.semester) &&
          !sectionAssignments.some((assignment) =>
            storedSubjectMatchesAssignment(subject, assignment),
          ),
      );

      return sortPortalSubjects([
        ...assignedPortalSubjects,
        ...mapStoredSubjectsToPortalSubjects(
          remainingCatalogSubjects,
          assignedAcademicYear,
        ),
      ]);
    }
  }

  if (storedSubjects.length === 0) {
    return [];
  }

  return mapStoredSubjectsToPortalSubjects(
    creditedScopedSubjects,
    defaultAcademicYear,
  );
};

export const getStudentPortalSubjectsForTerm = ({
  branch,
  program,
  yearLevel,
  strandOrCourse,
  semester,
  academicYear,
}: {
  branch?: string | null;
  program: string;
  yearLevel: string;
  strandOrCourse?: string;
  semester: string;
  academicYear?: string;
}) => {
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

  const exactTermSubjects = storedSubjects.filter(
    (subject) =>
      subject.program === program &&
      yearLevelsMatch(subject.yearLevel, yearLevel) &&
      normalizeStoredSemester(subject.semester) === normalizedSemester &&
      matchesStrandOrCourse(
        resolveStoredSubjectStrandOrCourse(subject),
        strandOrCourse,
      ),
  );
  const termSubjects =
    exactTermSubjects.length > 0
      ? exactTermSubjects
      : storedSubjects.filter(
          (subject) =>
            subject.program === program &&
            yearLevelsMatch(subject.yearLevel, yearLevel) &&
            normalizeStoredSemester(subject.semester) === normalizedSemester,
        );

  return mapStoredSubjectsToPortalSubjects(termSubjects, resolvedAcademicYear);
};

export const getStudentPortalSubjectsForSectionTerm = ({
  branch,
  program,
  yearLevel,
  strandOrCourse,
  sectionCode,
  semester,
  academicYear,
}: {
  branch?: string | null;
  program: string;
  yearLevel: string;
  strandOrCourse?: string;
  sectionCode?: string | null;
  semester: string;
  academicYear?: string;
}) => {
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
  const normalizedSectionCode = normalizeStoredSectionCode(sectionCode);
  const exactSemesterScopedSubjects = storedSubjects.filter(
    (subject) =>
      subject.program === program &&
      yearLevelsMatch(subject.yearLevel, yearLevel) &&
      subject.semester === normalizedSemester &&
      matchesStrandOrCourse(
        resolveStoredSubjectStrandOrCourse(subject),
        strandOrCourse,
      ),
  );
  const semesterScopedSubjects =
    exactSemesterScopedSubjects.length > 0
      ? exactSemesterScopedSubjects
      : storedSubjects.filter(
          (subject) =>
            subject.program === program &&
            yearLevelsMatch(subject.yearLevel, yearLevel) &&
            subject.semester === normalizedSemester,
        );

  if (!normalizedSectionCode) {
    return mapStoredSubjectsToPortalSubjects(
      semesterScopedSubjects,
      resolvedAcademicYear,
    );
  }

  const sectionAssignments = storedAssignments.filter(
    (assignment) =>
      assignment.academicYear === resolvedAcademicYear &&
      normalizeStoredSectionCode(assignment.sectionCode) === normalizedSectionCode &&
      assignment.semester === normalizedSemester,
  );

  if (sectionAssignments.length === 0) {
    return mapStoredSubjectsToPortalSubjects(
      semesterScopedSubjects,
      resolvedAcademicYear,
    );
  }

  const assignedPortalSubjects = mapStoredAssignmentsToPortalSubjects(
    sectionAssignments,
    storedSubjects,
  );
  const remainingCatalogSubjects = semesterScopedSubjects.filter(
    (subject) =>
      !sectionAssignments.some((assignment) =>
        storedSubjectMatchesAssignment(subject, assignment),
      ),
  );

  return sortPortalSubjects([
    ...assignedPortalSubjects,
    ...mapStoredSubjectsToPortalSubjects(
      remainingCatalogSubjects,
      resolvedAcademicYear,
    ),
  ]);
};

export const getEnrollmentSectionChoices = ({
  branch,
  program,
  yearLevel,
  strandOrCourse,
  semester,
  academicYear,
}: {
  branch?: string | null;
  program: string;
  yearLevel: string;
  strandOrCourse?: string;
  semester: string;
  academicYear?: string;
}): EnrollmentSectionChoice[] => {
  const resolvedBranch = normalizeBranchName(branch);
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
  const resolvedAcademicYear =
    academicYear || storedAssignments[0]?.academicYear || "2026-2027";
  const normalizedSemester = normalizeStoredSemester(semester);

  return storedSections
    .filter((section) => {
      const sectionProgram = section.program || program;
      const sectionYearLevel = section.yearLevel || yearLevel;
      const sectionSemester = normalizeStoredSemester(
        section.semester ||
          storedAssignments.find(
            (assignment) =>
              assignment.sectionId === section.id ||
              normalizeStoredSectionCode(assignment.sectionCode) ===
                normalizeStoredSectionCode(section.code),
          )?.semester,
      );
      const sectionStrandOrCourse =
        sectionProgram === "College"
          ? section.strand || DEFAULT_COLLEGE_COURSE
          : section.strand || "All";

      return (
        sectionProgram === program &&
        yearLevelsMatch(sectionYearLevel, yearLevel) &&
        sectionSemester === normalizedSemester &&
        matchesStrandOrCourse(sectionStrandOrCourse, strandOrCourse)
      );
    })
    .map((section) => {
      const currentEnrollees =
        studentSectionCounts.get(normalizeStoredSectionCode(section.code)) ?? 0;
      const maxCapacity = Math.max(
        currentEnrollees,
        Number(section.maxCapacity ?? 0),
      );
      const scheduledAssignmentCount = storedAssignments.filter(
        (assignment) =>
          assignment.academicYear === resolvedAcademicYear &&
          normalizeStoredSemester(assignment.semester) === normalizedSemester &&
          (assignment.sectionId === section.id ||
            normalizeStoredSectionCode(assignment.sectionCode) ===
              normalizeStoredSectionCode(section.code)),
      ).length;

      return {
        id: section.id,
        code: section.code,
        program: section.program || program,
        yearLevel: section.yearLevel || yearLevel,
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
}: {
  branch?: string | null;
  program: string;
  yearLevel: string;
  strandOrCourse?: string;
  semester: string;
  academicYear?: string;
  gradeRecords?: StoredStudentGradeRecord[];
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
    matchingTermAssignments.length > 0
      ? matchingTermAssignments
      : storedAssignments.filter(
          (assignment) => assignment.semester === normalizedSemester,
        );
  const hasGradeEligibilityContext = Array.isArray(gradeRecords);
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
    exactSubjectMatches.length > 0
      ? exactSubjectMatches
      : storedSubjects.filter(
          (subject) =>
            subject.program === program &&
            subjectYearLevelFilter(subject) &&
            subject.semester === normalizedSemester,
        );
  const completedSubjectCodes = getCompletedSubjectCodes(gradeRecords ?? []);
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
          }),
      )
    : matchedSubjects;

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
        .filter(
          (assignment) =>
            (assignment.subjectId === subject.id ||
              assignment.subjectCode === subject.code),
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
    ? normalizeStudentNumberInput(studentNumber, resolvedBranch)
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
        normalizeStudentNumberInput(request.studentNumber, resolvedBranch) ===
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
  const normalizedRequestStudentNumber = normalizeStudentNumberInput(
    request.studentNumber,
    resolvedBranch,
  );
  const existingIndex = existingRequests.findIndex(
    (record) =>
      record.id === request.id ||
      (normalizeStudentNumberInput(record.studentNumber, resolvedBranch) ===
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
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(storagePath, 60 * 60);

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
  const { data, error } = await supabase
    .rpc("get_admin_admission_queue", {
      p_branch_code: normalizeBranchCode(normalizeBranchName(branch)),
    })
    .returns<SupabaseAdminAdmissionQueueRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const queueRows = Array.isArray(data) ? data : [];
  const applicantRecords = await Promise.all(
    queueRows.map(mapSupabaseApplicantToAdminRecord),
  );
  return applicantRecords.map(normalizeAdminEnrolleeCapitalization);
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
  const applicantRecord: AdminEnrolleeRecord = normalizeAdminEnrolleeCapitalization({
    id: application.trackingNumber,
    trackingNumber: application.trackingNumber,
    fullName: fullName || `${application.firstName} ${application.lastName}`.trim(),
    program,
    yearLevel,
    strandOrCourse,
    applicationDate: toIsoDateString(application.submittedAt || application.updatedAt),
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
    requestedOwnSchedule: Boolean(draft?.requestOwnSchedule),
    ownScheduleRequestStatus: draft?.requestOwnSchedule ? "Pending" : undefined,
    ownScheduleRequestSubmittedAt: draft?.requestOwnSchedule
      ? application.submittedAt || application.updatedAt
      : undefined,
    personalInfo: {
      fullName: fullName || `${application.firstName} ${application.lastName}`.trim(),
      birthDate: "",
      contactNumber: draft?.contact || "",
      program,
      guardianName: "",
      email: draft?.email || "",
      address: draft?.address || "",
      yearLevel,
      guardianContact: "",
      middleName: draft?.middle_name || draft?.mname || "",
      sex: draft?.sex || "",
      civilStatus: draft?.civil_status || "",
      lastSchoolAttended: draft?.last_school_attended || draft?.lastSchool || "",
      yearCompletion: draft?.year_completion || draft?.yearCompletion || "",
      requestedYearLevel:
        draft?.requested_year_level ||
        draft?.requestedYearLevel ||
        application.requestedYearLevel ||
        yearLevel,
      strandOrCourse,
    },
    attachments: [],
  });

  const existingApplicantIndex = existingApplicants.findIndex(
    (applicant) => applicant.trackingNumber === application.trackingNumber,
  );

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

export const promoteApplicantToStoredStudent = (
  applicant: AdminEnrolleeRecord,
) => {
  const normalizedApplicant = normalizeAdminEnrolleeCapitalization(applicant);
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
    section: existingStudent?.section || "",
    shsTrackType:
      normalizedApplicant.program === "SHS"
        ? resolveShsTrackType(normalizedApplicant.strandOrCourse)
        : "",
    strandOrCourse: normalizedApplicant.strandOrCourse,
    documentSubmitted: normalizedApplicant.applicationDate,
    contact: normalizedApplicant.personalInfo.contactNumber,
    email: normalizedApplicant.personalInfo.email,
    address: normalizedApplicant.personalInfo.address,
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
