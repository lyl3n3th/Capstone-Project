import type {
  AdmissionApplicationSummary,
  AdmissionDiscountSource,
  AdmissionDraft,
} from "../types/application";
import { supabase } from "../lib/supabase";
import {
  getAdmissionDiscountSource,
  getAdmissionRequirements,
  getEffectiveAdmissionDiscountPercentage,
  getHonorDiscountPercentage,
  normalizeBranchCode,
} from "./admission";
import {
  buildEnrollmentSubjectKey,
  type EnrollmentRetakeChoiceGroup,
  type EnrollmentRetakeRequestItem,
} from "./enrollmentLoadPlanner";
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/user";

export type AdminBranchName = "Bacoor" | "Taytay" | "GMA";

export type AdminApplicantStatus = "Pending" | "Approved" | "Rejected";

export interface AdminAttachment {
  name: string;
  type: string;
  url: string;
  reviewStatus?: "Pending" | "Approved" | "Rejected";
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

export interface StudentPortalSubject {
  id: string;
  code: string;
  title: string;
  units?: number;
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

type StoredSectionAssignmentRecord = {
  enrolleeId: string;
  enrolleeName: string;
  assignedSection: string;
  assignedDate: string;
  isManualOverride: boolean;
};

const STUDENT_STORAGE_KEY = "aics-students";
const BRANCH_STORAGE_PREFIX = "aics-admin";
const DEFAULT_BRANCH: AdminBranchName = "Bacoor";
const DEFAULT_COLLEGE_COURSE = "BSE - Bachelor of Entrepreneurship";
const DEFAULT_SECTION_SEMESTER = "1st Semester";
const STUDENT_NUMBER_FLOOR = 261000;
const STUDENT_NUMBER_SUFFIX_LENGTH = 6;
const REQUIREMENTS_BUCKET = "admission-requirements";

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
  middle_name: string | null;
  phone_number: string;
  program_level: string;
  program_name: string;
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

const getInitialYearLevel = (program: string, studentStatus: string) => {
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
  const normalizedBranch = branch?.trim().toLowerCase();

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

  return DEFAULT_BRANCH;
};

const STUDENT_NUMBER_PREFIX_BY_BRANCH: Record<AdminBranchName, string> = {
  Bacoor: "BAC",
  Taytay: "TAY",
  GMA: "GMA",
};

const BRANCH_BY_STUDENT_NUMBER_PREFIX: Record<string, AdminBranchName> = {
  BAC: "Bacoor",
  TAY: "Taytay",
  GMA: "GMA",
};

export const getStudentNumberPrefix = (branch?: string | null) =>
  STUDENT_NUMBER_PREFIX_BY_BRANCH[normalizeBranchName(branch)];

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
  return new RegExp(`^${prefix}-\\d{${STUDENT_NUMBER_SUFFIX_LENGTH}}$`).test(
    normalizedValue,
  );
};

export const getStudentNumberExample = (branch?: string | null) =>
  branch
    ? formatStudentNumber(branch, STUDENT_NUMBER_FLOOR + 1)
    : "BAC-261001";

export const getBranchStorageKey = (scope: string, branch?: string | null) =>
  `${BRANCH_STORAGE_PREFIX}:${scope}:${normalizeBranchName(branch).toLowerCase()}`;

export const readBranchScopedData = <T,>(
  scope: string,
  branch?: string | null,
): T | null => readStorageItem<T>(getBranchStorageKey(scope, branch));

export const writeBranchScopedData = (
  scope: string,
  branch: string | null | undefined,
  value: unknown,
) => {
  writeStorageItem(getBranchStorageKey(scope, branch), value);
};

export const getCurrentSession = () =>
  readStorageItem<AuthSession>(AUTH_STORAGE_KEY);

export const getCurrentBranch = () =>
  normalizeBranchName(getCurrentSession()?.user.branch);

export const readStoredStudents = () =>
  readStorageItem<StudentStorageRecord[]>(STUDENT_STORAGE_KEY) ?? [];

export const writeStoredStudents = (students: StudentStorageRecord[]) => {
  writeStorageItem(STUDENT_STORAGE_KEY, students);
};

export const getStudentsForBranch = (branch?: string | null) => {
  const resolvedBranch = normalizeBranchName(branch);

  return readStoredStudents().filter(
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
        (subject) =>
          (subject.id === assignment.subjectId ||
            subject.code === assignment.subjectCode) &&
          normalizeStoredSemester(subject.semester) ===
            normalizeStoredSemester(assignment.semester),
      );

      return {
        id: assignment.id,
        code: assignment.subjectCode,
        title: assignment.subjectName,
        units: subjectDetails?.units,
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
) =>
  sortPortalSubjects(
    assignments.map((assignment) => {
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

    mergedRecords.set(
      record.trackingNumber,
      existingRecord
        ? {
            ...existingRecord,
            ...record,
            documentsSubmitted: submittedAttachments.length,
            totalDocuments: existingRecord.totalDocuments || record.totalDocuments,
            strandOrCourse:
              existingRecord.strandOrCourse || record.strandOrCourse,
            honorLabel:
              record.honorLabel ?? existingRecord.honorLabel ?? "No Honor",
            honorDiscountPercentage:
              record.honorDiscountPercentage ??
              existingRecord.honorDiscountPercentage ??
              0,
            appliedForScholarship:
              record.appliedForScholarship ??
              existingRecord.appliedForScholarship ??
              false,
            scholarshipExamScore:
              record.scholarshipExamScore ??
              existingRecord.scholarshipExamScore ??
              null,
            effectiveDiscountPercentage:
              record.effectiveDiscountPercentage ??
              existingRecord.effectiveDiscountPercentage ??
              0,
            effectiveDiscountSource:
              record.effectiveDiscountSource ??
              existingRecord.effectiveDiscountSource ??
              "none",
            personalInfo: {
              ...existingRecord.personalInfo,
              ...record.personalInfo,
            },
            attachments: mergedAttachments,
            status: record.status || existingRecord.status,
            studentNumber: record.studentNumber || existingRecord.studentNumber,
            convertedAt: record.convertedAt || existingRecord.convertedAt,
          }
        : record,
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
  const submittedNames = new Set(
    submittedAttachments.map((attachment) => attachment.name.trim().toLowerCase()),
  );
  const pendingRequirements = allRequirements.filter(
    (requirement) => !submittedNames.has(requirement.name.trim().toLowerCase()),
  );

  return {
    applicantRecord,
    submittedAttachments,
    pendingRequirements,
    summary: {
      total: allRequirements.length,
      submitted: submittedAttachments.length,
      pending: pendingRequirements.length,
      approved: submittedAttachments.filter(
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
      const hasFile = !!attachment && hasRealAttachmentUrl(attachment);
      const isSubmitted =
        hasFile ||
        snapshot.submittedAttachments.some(
          (submittedAttachment) =>
            getAttachmentKey(submittedAttachment) ===
            requirement.name.trim().toLowerCase(),
        );
      const reviewStatus = isSubmitted
        ? attachment?.reviewStatus || "Pending"
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
}: {
  branch?: string | null;
  trackingNumber?: string | null;
  studentNumber?: string | null;
  requirementName: string;
  mimeType?: string | null;
  storagePath: string;
  storageBucket?: string;
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
      reviewStatus: "Pending",
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

    return {
      ...record,
      attachments: nextAttachments,
      documentsSubmitted: submittedAttachmentCount,
      totalDocuments: Math.max(record.totalDocuments, nextAttachments.length),
    };
  });

  writeBranchScopedData("enrollees", resolvedBranch, nextEnrollees);
  return nextEnrollees;
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

    updatedRecord = {
      ...record,
      attachments: nextAttachments,
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
    "branch" | "program" | "yearLevel" | "strandOrCourse" | "section"
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
  const plannedSemester = studentSubjectPlan
    ? normalizeStoredSemester(studentSubjectPlan.semester)
    : undefined;
  const defaultAcademicYear =
    storedAssignments[0]?.academicYear ||
    studentSubjectPlan?.academicYear ||
    "2026-2027";
  const matchedSubjects = storedSubjects.filter(
    (subject) =>
      subject.program === student.program &&
      subject.yearLevel === student.yearLevel &&
      matchesStrandOrCourse(
        resolveStoredSubjectStrandOrCourse(subject),
        student.strandOrCourse,
      ),
  );
  const matchedSection = student.section
    ? storedSections.find((section) => section.code === student.section)
    : undefined;
  const activeSectionSemester = student.section
    ? normalizeStoredSemester(
        matchedSection?.semester ||
          storedAssignments.find(
            (assignment) => assignment.sectionCode === student.section,
          )?.semester,
      )
    : undefined;
  const effectiveSemester = plannedSemester || activeSectionSemester;
  const semesterScopedSubjects = effectiveSemester
    ? matchedSubjects.filter(
        (subject) => normalizeStoredSemester(subject.semester) === effectiveSemester,
      )
    : matchedSubjects;
  const creditedPlanSubjects = studentSubjectPlan?.creditedSubjects ?? [];
  const plannedScheduledAssignments = studentSubjectPlan?.scheduledAssignments ?? [];
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
    studentSubjectPlan?.academicYear?.trim() || defaultAcademicYear;

  if (plannedScheduledAssignments.length > 0) {
    const scheduledPortalSubjects = mapScheduledAssignmentsToPortalSubjects(
      plannedScheduledAssignments,
      studentSubjectPlan?.assignedSubjects ?? [],
      storedSubjects,
    );

    if ((studentSubjectPlan?.assignedSubjects.length ?? 0) > 0) {
      const scheduledAssignmentKeys = new Set(
        plannedScheduledAssignments.map(
          (assignment) =>
            `${assignment.subjectId}:${assignment.subjectCode}:${normalizeStoredSemester(assignment.semester)}`,
        ),
      );
      const unresolvedPlannedSubjects =
        studentSubjectPlan?.assignedSubjects.filter(
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

  if ((studentSubjectPlan?.assignedSubjects.length ?? 0) > 0) {
    const plannedSubjects = studentSubjectPlan?.assignedSubjects ?? [];
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
          assignment.sectionCode === student.section &&
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
            !plannedAssignments.some(
              (assignment) =>
                (assignment.subjectId === subject.id ||
                  assignment.subjectCode === subject.code) &&
                normalizeStoredSemester(assignment.semester) ===
                  normalizeStoredSemester(subject.semester),
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
        assignment.sectionCode === student.section &&
        (!effectiveSemester ||
          normalizeStoredSemester(assignment.semester) === effectiveSemester) &&
        !creditedPlanSubjects.some((item) =>
          subjectPlanItemMatches(item, assignment.subjectId, assignment.subjectCode),
        ) &&
        (storedSubjects.length === 0 ||
          creditedScopedSubjects.some(
            (subject) =>
              (subject.id === assignment.subjectId ||
                subject.code === assignment.subjectCode) &&
              normalizeStoredSemester(subject.semester) ===
                normalizeStoredSemester(assignment.semester),
          )),
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
      const assignedSubjectKeys = new Set(
        sectionAssignments.map(
          (assignment) =>
            `${assignment.subjectId}:${assignment.subjectCode}:${assignment.semester}`,
        ),
      );
      const remainingCatalogSubjects = creditedScopedSubjects.filter(
        (subject) =>
          assignedSemesters.has(subject.semester) &&
          !assignedSubjectKeys.has(
            `${subject.id}:${subject.code}:${subject.semester}`,
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

  return mapStoredSubjectsToPortalSubjects(
    storedSubjects.filter(
      (subject) =>
        subject.program === program &&
        subject.yearLevel === yearLevel &&
        normalizeStoredSemester(subject.semester) === normalizedSemester &&
        matchesStrandOrCourse(
          resolveStoredSubjectStrandOrCourse(subject),
          strandOrCourse,
        ),
    ),
    resolvedAcademicYear,
  );
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
              assignment.sectionCode === section.code,
          )?.semester,
      );
      const sectionStrandOrCourse =
        sectionProgram === "College"
          ? section.strand || DEFAULT_COLLEGE_COURSE
          : section.strand || "All";

      return (
        sectionProgram === program &&
        sectionYearLevel === yearLevel &&
        sectionSemester === normalizedSemester &&
        matchesStrandOrCourse(sectionStrandOrCourse, strandOrCourse)
      );
    })
    .map((section) => {
      const currentEnrollees = Math.max(0, Number(section.currentEnrollees ?? 0));
      const maxCapacity = Math.max(
        currentEnrollees,
        Number(section.maxCapacity ?? 0),
      );
      const scheduledAssignmentCount = storedAssignments.filter(
        (assignment) =>
          assignment.academicYear === resolvedAcademicYear &&
          normalizeStoredSemester(assignment.semester) === normalizedSemester &&
          (assignment.sectionId === section.id ||
            assignment.sectionCode === section.code),
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
  const normalizedCurrentSectionCode = currentSectionCode?.trim() || "";
  const storedSections =
    readBranchScopedData<StoredClassSection[]>("class-sections", resolvedBranch) ??
    [];
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
        section.code === normalizedCurrentSectionCode ||
        (sectionProgram === program &&
          sectionYearLevel === yearLevel &&
          matchesStrandOrCourse(sectionStrandOrCourse, strandOrCourse))
      );
    })
    .map((section) => {
      const currentEnrollees = Math.max(0, Number(section.currentEnrollees ?? 0));
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
              assignment.sectionCode === section.code,
          )?.semester,
      );

      return {
        id: section.id,
        code: section.code,
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
      const leftIsCurrent = left.code === normalizedCurrentSectionCode;
      const rightIsCurrent = right.code === normalizedCurrentSectionCode;

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
  const normalizedNextSectionCode = nextSectionCode.trim();

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

  const previousSection = targetStudent.section?.trim() || "";
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
    (section) => section.code === normalizedNextSectionCode,
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

  if (targetSectionYearLevel !== targetStudent.yearLevel) {
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

  const branchEnrollees =
    readBranchScopedData<AdminEnrolleeRecord[]>("enrollees", resolvedBranch) ?? [];
  const linkedEnrollee =
    branchEnrollees.find(
      (record) =>
        Boolean(trackingNumber) && record.trackingNumber === trackingNumber,
    ) ??
    branchEnrollees.find(
      (record) =>
        Boolean(studentNumber) &&
        (record.studentNumber === studentNumber || record.studentNumber === targetStudent.id),
    ) ??
    null;
  const linkedEnrolleeId = linkedEnrollee?.id || "";
  const targetEnrolleeIds = targetSection.enrolleeIds ?? [];
  const isAlreadyLinkedToTarget =
    Boolean(linkedEnrolleeId) && targetEnrolleeIds.includes(linkedEnrolleeId);
  const targetCurrentEnrollees = Math.max(
    0,
    Number(targetSection.currentEnrollees ?? 0),
  );
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

  const nextSections = storedSections.map((section) => {
    if (section.code === previousSection) {
      const existingEnrolleeIds = section.enrolleeIds ?? [];
      const nextEnrolleeIds =
        linkedEnrolleeId && existingEnrolleeIds.includes(linkedEnrolleeId)
          ? existingEnrolleeIds.filter((enrolleeId) => enrolleeId !== linkedEnrolleeId)
          : existingEnrolleeIds;

      return {
        ...section,
        currentEnrollees: Math.max(
          0,
          Number(section.currentEnrollees ?? 0) - 1,
        ),
        enrolleeIds: nextEnrolleeIds,
      };
    }

    if (section.code === normalizedNextSectionCode) {
      const existingEnrolleeIds = section.enrolleeIds ?? [];
      const shouldAddLinkedEnrollee =
        Boolean(linkedEnrolleeId) &&
        !existingEnrolleeIds.includes(linkedEnrolleeId);

      return {
        ...section,
        currentEnrollees: isAlreadyLinkedToTarget
          ? Math.max(0, Number(section.currentEnrollees ?? 0))
          : Math.max(0, Number(section.currentEnrollees ?? 0)) + 1,
        enrolleeIds: shouldAddLinkedEnrollee
          ? [...existingEnrolleeIds, linkedEnrolleeId]
          : existingEnrolleeIds,
      };
    }

    return section;
  });
  writeBranchScopedData("class-sections", resolvedBranch, nextSections);

  if (linkedEnrolleeId) {
    const storedSectionAssignments =
      readBranchScopedData<StoredSectionAssignmentRecord[]>(
        "section-assignments",
        resolvedBranch,
      ) ?? [];
    const assignmentDate = new Date().toLocaleDateString();
    const existingAssignmentIndex = storedSectionAssignments.findIndex(
      (assignment) => assignment.enrolleeId === linkedEnrolleeId,
    );
    const nextSectionAssignments =
      existingAssignmentIndex >= 0
        ? storedSectionAssignments.map((assignment, index) =>
            index === existingAssignmentIndex
              ? {
                  ...assignment,
                  assignedSection: normalizedNextSectionCode,
                  assignedDate: assignmentDate,
                  isManualOverride: true,
                }
              : assignment,
          )
        : [
            {
              enrolleeId: linkedEnrolleeId,
              enrolleeName:
                linkedEnrollee?.fullName || targetStudent.name || "Student",
              assignedSection: normalizedNextSectionCode,
              assignedDate: assignmentDate,
              isManualOverride: true,
            },
            ...storedSectionAssignments,
          ];

    writeBranchScopedData(
      "section-assignments",
      resolvedBranch,
      nextSectionAssignments,
    );
  }

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
}: {
  branch?: string | null;
  program: string;
  yearLevel: string;
  strandOrCourse?: string;
  semester: string;
  academicYear?: string;
}): StudentScheduleChoiceGroup[] => {
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

  return storedSubjects
    .filter(
      (subject) =>
        subject.program === program &&
        subject.yearLevel === yearLevel &&
        normalizeStoredSemester(subject.semester) === normalizedSemester &&
        matchesStrandOrCourse(
          resolveStoredSubjectStrandOrCourse(subject),
          strandOrCourse,
        ),
    )
    .map((subject) => ({
      subjectId: subject.id,
      subjectCode: subject.code,
      subjectName: subject.name,
      units: subject.units,
      assignmentOptions: storedAssignments
        .filter(
          (assignment) =>
            assignment.academicYear === resolvedAcademicYear &&
            normalizeStoredSemester(assignment.semester) === normalizedSemester &&
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
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const requests =
    readBranchScopedData<StudentScheduleSelectionRequestRecord[]>(
      "student-schedule-requests",
      resolvedBranch,
    ) ?? [];

  return (
    requests.find((request) => {
      if (
        trackingNumber &&
        request.trackingNumber &&
        request.trackingNumber === trackingNumber
      ) {
        return true;
      }

      return Boolean(studentNumber) && request.studentNumber === studentNumber;
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
  const existingIndex = existingRequests.findIndex(
    (record) =>
      record.id === request.id ||
      (record.studentNumber === request.studentNumber &&
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
  const resolvedBranch = normalizeBranchName(branch);

  const mockBranchApplicants: Record<AdminBranchName, AdminEnrolleeRecord[]> = {
    Bacoor: [
      {
        id: "BAC-APP-001",
        trackingNumber: "AICS-20260401-BAC101",
        fullName: "Marianne Santos",
        program: "College",
        yearLevel: "1st Year",
        strandOrCourse: "BSE - Bachelor of Entrepreneurship",
        applicationDate: "2026-04-01",
        documentsSubmitted: 4,
        totalDocuments: 4,
        status: "Pending",
        branch: "Bacoor",
        studentStatus: "Senior High Graduate",
        honorLabel: "No Honor",
        personalInfo: {
          fullName: "Marianne Santos",
          birthDate: "2008-03-14",
          contactNumber: "0912 334 5567",
          program: "College",
          guardianName: "Ramon Santos",
          email: "marianne.santos@example.com",
          address: "Molino, Bacoor, Cavite",
          yearLevel: "1st Year",
          guardianContact: "0917 551 9922",
        },
        attachments: [
          {
            name: "Form 137",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
          {
            name: "Diploma/Certificate of Graduation",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
          {
            name: "Birth Certificate/PSA",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
          {
            name: "Good Moral Character",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
        ],
      },
      {
        id: "BAC-APP-002",
        trackingNumber: "AICS-20260402-BAC102",
        fullName: "Jericho Ramos",
        program: "SHS",
        yearLevel: "Grade 11",
        strandOrCourse: "ICT - Information and Communications Technology",
        applicationDate: "2026-04-02",
        documentsSubmitted: 3,
        totalDocuments: 4,
        status: "Pending",
        branch: "Bacoor",
        studentStatus: "Junior High Completer",
        honorLabel: "No Honor",
        personalInfo: {
          fullName: "Jericho Ramos",
          birthDate: "2009-11-22",
          contactNumber: "0918 443 1178",
          program: "SHS",
          guardianName: "Alma Ramos",
          email: "jericho.ramos@example.com",
          address: "Bacoor, Cavite",
          yearLevel: "Grade 11",
          guardianContact: "0932 144 8821",
        },
        attachments: [
          {
            name: "Form 137",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
          {
            name: "Grade Report Card",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
          {
            name: "Birth Certificate/PSA",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
        ],
      },
      {
        id: "BAC-APP-003",
        trackingNumber: "AICS-20260403-BAC103",
        fullName: "Alyssa Mae Cruz",
        program: "College",
        yearLevel: "1st Year",
        strandOrCourse: "BSIT - Bachelor of Science in Information Technology",
        applicationDate: "2026-04-03",
        documentsSubmitted: 4,
        totalDocuments: 4,
        status: "Pending",
        branch: "Bacoor",
        studentStatus: "Transferee",
        honorLabel: "No Honor",
        personalInfo: {
          fullName: "Alyssa Mae Cruz",
          birthDate: "2006-09-19",
          contactNumber: "0917 889 1123",
          program: "College",
          guardianName: "Marissa Cruz",
          email: "alyssa.cruz@example.com",
          address: "Bacoor, Cavite",
          yearLevel: "1st Year",
          guardianContact: "0918 662 0045",
        },
        attachments: [
          {
            name: "Transcript of Records (TOR)",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
          {
            name: "Honorable Dismissal",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
          {
            name: "Birth Certificate/PSA",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
          {
            name: "Good Moral Character",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
        ],
      },
    ],
    Taytay: [
      {
        id: "TAY-APP-001",
        trackingNumber: "AICS-20260401-TAY101",
        fullName: "Alyssa Dela Cruz",
        program: "SHS",
        yearLevel: "Grade 11",
        strandOrCourse: "ABM - Accountancy, Business, and Management",
        applicationDate: "2026-04-01",
        documentsSubmitted: 4,
        totalDocuments: 4,
        status: "Pending",
        branch: "Taytay",
        studentStatus: "Junior High Completer",
        honorLabel: "No Honor",
        personalInfo: {
          fullName: "Alyssa Dela Cruz",
          birthDate: "2009-08-30",
          contactNumber: "0919 412 7731",
          program: "SHS",
          guardianName: "Carlo Dela Cruz",
          email: "alyssa.delacruz@example.com",
          address: "Taytay, Rizal",
          yearLevel: "Grade 11",
          guardianContact: "0956 331 2015",
        },
        attachments: [
          {
            name: "Form 137",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
          {
            name: "Grade Report Card",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
          {
            name: "Birth Certificate/PSA",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
          {
            name: "Good Moral Character",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
        ],
      },
    ],
    GMA: [
      {
        id: "GMA-APP-001",
        trackingNumber: "AICS-20260401-GMA101",
        fullName: "Nico Fernandez",
        program: "SHS",
        yearLevel: "Grade 11",
        strandOrCourse: "GAS - General Academic Strand",
        applicationDate: "2026-04-01",
        documentsSubmitted: 2,
        totalDocuments: 4,
        status: "Pending",
        branch: "GMA",
        studentStatus: "Junior High Completer",
        honorLabel: "No Honor",
        personalInfo: {
          fullName: "Nico Fernandez",
          birthDate: "2009-02-04",
          contactNumber: "0915 224 9930",
          program: "SHS",
          guardianName: "Lorna Fernandez",
          email: "nico.fernandez@example.com",
          address: "GMA, Cavite",
          yearLevel: "Grade 11",
          guardianContact: "0912 440 1804",
        },
        attachments: [
          {
            name: "Form 137",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
          {
            name: "Birth Certificate/PSA",
            type: "pdf",
            url: "#",
            reviewStatus: "Pending",
          },
        ],
      },
    ],
  };

  return mockBranchApplicants[resolvedBranch];
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
  const yearLevel = getInitialYearLevel(program, row.student_status_label);
  const requirements = getAdmissionRequirements(
    row.student_status_label,
    row.program_name,
    row.honor_label || "No Honor",
  );
  const requirementFiles = Array.isArray(row.requirement_files)
    ? row.requirement_files
    : [];
  const scholarshipExamScore = toOptionalNumber(row.scholarship_exam_score);
  const honorDiscountPercentage =
    toOptionalNumber(row.honor_discount_percentage) ??
    getHonorDiscountPercentage(row.honor_label || "No Honor");
  const effectiveDiscountPercentage =
    toOptionalNumber(row.effective_discount_percentage) ??
    getEffectiveAdmissionDiscountPercentage({
      honorLabel: row.honor_label,
      appliedForScholarship: row.applied_for_scholarship,
      scholarshipExamScore,
    });
  const effectiveDiscountSource =
    row.effective_discount_source === "honor" ||
    row.effective_discount_source === "scholarship_exam" ||
    row.effective_discount_source === "none"
      ? row.effective_discount_source
      : getAdmissionDiscountSource({
          honorLabel: row.honor_label,
          appliedForScholarship: row.applied_for_scholarship,
          scholarshipExamScore,
        });
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
    branch: normalizeBranchName(row.branch_name || row.branch_code),
    studentStatus: row.student_status_label,
    honorLabel: row.honor_label || "No Honor",
    honorDiscountPercentage,
    appliedForScholarship: row.applied_for_scholarship,
    scholarshipExamScore,
    effectiveDiscountPercentage,
    effectiveDiscountSource,
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
  return Promise.all(queueRows.map(mapSupabaseApplicantToAdminRecord));
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
    readStorageItem<AdminEnrolleeRecord[]>(storageKey) ??
    getDefaultBranchEnrollees(branch);
  const fullName = [draft?.fname || application.firstName, draft?.middle_name, draft?.lname || application.lastName]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .join(" ")
    .trim();
  const program = mapProgramNameToAdminProgram(application.programName);
  const strandOrCourse = application.trackName;
  const yearLevel = getInitialYearLevel(program, application.studentStatus);
  const honorLabel = draft?.honor || application.honorLabel || "No Honor";
  const requirementList = getAdmissionRequirements(
    application.studentStatus,
    application.programName,
    honorLabel,
  );
  const applicantRecord: AdminEnrolleeRecord = {
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
    honorDiscountPercentage: application.honorDiscountPercentage,
    appliedForScholarship: Boolean(
      draft?.apply_scholarship ?? application.appliedForScholarship,
    ),
    scholarshipExamScore: application.scholarshipExamScore,
    effectiveDiscountPercentage: application.effectiveDiscountPercentage,
    effectiveDiscountSource: application.effectiveDiscountSource,
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
    },
    attachments: [],
  };

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

  writeStorageItem(storageKey, nextApplicants);
  return nextApplicants;
};

export const promoteApplicantToStoredStudent = (
  applicant: AdminEnrolleeRecord,
) => {
  const existingStudents = readStoredStudents();
  const existingStudent = findStoredStudent({
    branch: applicant.branch,
    studentNumber: applicant.studentNumber,
    trackingNumber: applicant.trackingNumber,
  });
  const studentNumber =
    existingStudent?.id ||
    applicant.studentNumber ||
    getNextStudentNumber(applicant.branch, existingStudents);
  const { firstName, middleName, lastName } = splitFullName(applicant.fullName);

  const studentRecord: StudentStorageRecord = {
    id: studentNumber,
    name:
      applicant.fullName ||
      [firstName, middleName, lastName].filter(Boolean).join(" "),
    program: applicant.program,
    yearLevel: applicant.yearLevel,
    section: existingStudent?.section || "",
    shsTrackType:
      applicant.program === "SHS"
        ? resolveShsTrackType(applicant.strandOrCourse)
        : "",
    strandOrCourse: applicant.strandOrCourse,
    documentSubmitted: applicant.applicationDate,
    contact: applicant.personalInfo.contactNumber,
    email: applicant.personalInfo.email,
    address: applicant.personalInfo.address,
    status:
      applicant.documentsSubmitted >= applicant.totalDocuments
        ? "Complete"
        : "Incomplete",
    branch: normalizeBranchName(applicant.branch),
    trackingNumber: applicant.trackingNumber,
    studentStatus: applicant.studentStatus,
    requestedOwnSchedule: applicant.requestedOwnSchedule,
    ownScheduleRequestStatus: applicant.ownScheduleRequestStatus,
    ownScheduleAcademicYear: applicant.ownScheduleAcademicYear,
    ownScheduleSemester: applicant.ownScheduleSemester,
    ownScheduleSelectionStatus:
      applicant.ownScheduleRequestStatus === "Approved"
        ? "Not Submitted"
        : undefined,
    birthDate: applicant.personalInfo.birthDate,
    guardianName: applicant.personalInfo.guardianName,
    guardianContact: applicant.personalInfo.guardianContact,
    gender: existingStudent?.gender || "Male",
    civilStatus: existingStudent?.civilStatus || "Single",
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
    ...applicant,
    studentNumber,
    status: "Approved",
    convertedAt: new Date().toISOString(),
  };

  return { applicant: updatedApplicant, student: studentRecord };
};
