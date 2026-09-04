import { useEffect, useState } from "react";
import {
  FaUserPlus,
  FaUserGraduate,
  FaExchangeAlt,
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaEye,
  FaThumbsUp,
  FaRedoAlt,
  FaFileAlt,
  FaUsers,
  FaMagic,
  FaLayerGroup,
  FaBook,
  FaChalkboardTeacher,
  FaCalendarAlt,
  FaPlus,
  FaUniversity,
  FaSearch,
  FaChevronDown,
  FaChevronUp,
  FaFilter,
  FaTrash,
  FaStar,
  FaToggleOn,
  FaToggleOff,
} from "react-icons/fa";
import { MdArchive } from "react-icons/md";
import AdminSidebar from "../../components/admin/AdminSidebar";
import { ToastContainer } from "../../components/common/Toast";
import { useAuth } from "../../hooks/useAuth";
import {
  fetchEvaluationQuestionnaire,
  fetchInstructorEvaluationStatuses,
  fetchInstructorEvaluationSubmissions,
  fetchSupabaseAdmissionApplicants,
  getStudentSectionChoices,
  getStudentsForBranch,
  INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT,
  mergeAdminEnrolleeRecords,
  normalizeBranchName,
  promoteApplicantToStoredStudent,
  readBranchScopedData,
  readEvaluationQuestionnaire,
  readInstructorEvaluationSubmissions,
  readInstructorEvaluationStatuses,
  readStoredStudents,
  saveEvaluationQuestionnaireToBackend,
  saveInstructorEvaluationStatusToBackend,
  setInstructorEvaluationStatus,
  updateStoredStudentSection,
  updateStoredStudentOwnScheduleState,
  writeBranchScopedData,
  writeEvaluationQuestionnaire,
  writeStoredStudents,
  type EvaluationQuestionCategoryRecord,
  type InstructorEvaluationSubmissionRecord,
  type InstructorEvaluationStatusMap,
} from "../../services/adminStorage";
import type {
  StudentStorageRecord,
  StudentScheduledAssignmentItem,
  StudentSectionChoice,
  StudentSubjectPlanItem,
  StudentSubjectPlanRecord,
} from "../../services/adminStorage";
import { fetchAdminStudents, saveAdminStudent } from "../../services/adminStudentsApi";
import {
  deleteAcademicInstructor,
  deleteAcademicClassSection,
  deleteAcademicSubject,
  deleteAcademicSubjectAssignment,
  fetchAcademicSnapshot,
  saveAcademicInstructor,
  saveAcademicAssignmentRoom,
  saveAcademicClassSection,
  saveAcademicSubject,
  saveAcademicSubjectAssignment,
  seedAcademicSnapshot,
  type AcademicSnapshot,
} from "../../services/academicData";
import { resetInstructorTemporaryPassword } from "../../services/instructorPortal";
import {
  getEstimatedCollegeTuition,
  getAdmissionRequirements,
  SCHOLARSHIP_EXAM_MAX_SCORE,
  updateAdmissionProgress,
} from "../../services/admission";
import {
  sendAdmissionDecisionNotification,
  sendAdmissionRequirementRedoNotification,
  type AdmissionDecisionNotificationResponse,
  type SendAdmissionDecisionNotificationPayload,
} from "../../services/admissionSubmissionNotificationApi";
import { activateApprovedStudent } from "../../services/auth";
import {
  fetchEnrollmentRequests,
  getRegularEnrollmentRequirementItems,
  hydrateEnrollmentRequestRecordAttachments,
  readEnrollmentRequestsForBranch,
  saveEnrollmentRequest,
  type EnrollmentRequestRecord,
  writeEnrollmentRequestsForBranch,
} from "../../services/enrollmentRequests";
import {
  buildScheduledAssignmentConflicts,
  formatScheduledAssignmentLabel,
} from "../../services/enrollmentLoadPlanner";
import { stripLegacyMockAdmissionRecords } from "../../services/legacyMockData";
import {
  deleteStudentSubjectPlan,
  fetchStudentSubjectPlans,
  saveStudentPlanningState,
  saveStudentSubjectPlan,
} from "../../services/studentPlanningApi";
import "../../styles/admin/admin-enrolles.css";

interface EnrolleesProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface Attachment {
  name: string;
  type: string;
  url: string;
  reviewStatus?: "Pending" | "Approved" | "Rejected";
  storagePath?: string;
  storageBucket?: string;
  uploadedAt?: string;
}

interface PersonalInformation {
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

interface Enrollee {
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
  status: "Pending" | "Approved" | "Rejected";
  branch: string;
  studentStatus: string;
  honorLabel?: string | null;
  honorDiscountPercentage?: number;
  appliedForScholarship?: boolean;
  scholarshipExamScore?: number | null;
  effectiveDiscountPercentage?: number;
  effectiveDiscountSource?: "none" | "honor" | "scholarship_exam";
  requestedOwnSchedule?: boolean;
  ownScheduleRequestStatus?: "Pending" | "Approved" | "Rejected";
  ownScheduleRequestSubmittedAt?: string;
  ownScheduleAcademicYear?: string;
  ownScheduleSemester?: string;
  ownScheduleDecisionAt?: string;
  rejectionReason?: string;
  convertedAt?: string;
  personalInfo: PersonalInformation;
  attachments?: Attachment[];
  archivedAt?: string;
  archivedByRole?: "Admin" | "Registrar";
}

type EnrollmentRequest = EnrollmentRequestRecord;

interface ClassSection {
  id: string;
  code: string;
  program: string;
  yearLevel: string;
  semester: string;
  strand?: string;
  section: string;
  currentEnrollees: number;
  maxCapacity: number;
  enrolleeIds: string[];
  isLocked?: boolean;
}

interface SectionFormState {
  program: string;
  yearLevel: string;
  semester: string;
  strand: string;
  section: string;
  maxCapacity: number;
}

type CollegeSubjectType = "major" | "minor";
type ShsSubjectType = "core" | "applied" | "specialized";
type SubjectType = CollegeSubjectType | ShsSubjectType;

interface SubjectFormState {
  code: string;
  name: string;
  program: "College" | "SHS";
  yearLevel: string;
  semester: string;
  units: string;
  strand: string;
  type: SubjectType;
  prerequisiteSubjectIds: string[];
}

interface SectionAssignment {
  enrolleeId: string;
  enrolleeName: string;
  assignedSection: string;
  assignedDate: string;
  isManualOverride: boolean;
}

interface TransfereeEvaluationRecord {
  enrolleeId: string;
  credentialsReviewed: boolean;
  placementConfirmed: boolean;
  subjectLoadValidated: boolean;
  resolvedYearLevel: string;
  plannedSemester: string;
  plannedAcademicYear: string;
  creditYearLevelFilter: string;
  creditSemesterFilter: string;
  creditedSubjectIds: string[];
  assignedSubjectIds: string[];
  recommendedSectionId: string;
  notes: string;
  updatedAt: string;
}

interface Subject {
  id: string;
  code: string;
  name: string;
  units?: number;
  program: string;
  yearLevel: string;
  semester: string;
  strand?: string;
  subjectType?: SubjectType;
  isMinor?: boolean;
  prerequisiteSubjectIds?: string[];
}

interface Instructor {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  email?: string;
  contactNumber?: string;
}

interface InstructorFormState {
  name: string;
  employeeId: string;
  department: string;
  email: string;
  contactNumber: string;
}

interface Schedule {
  day: string;
  startTime: string;
  endTime: string;
  room: string;
}

interface SubjectAssignment {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  instructorId: string;
  instructorName: string;
  sectionId: string;
  sectionCode: string;
  schedule: Schedule[];
  academicYear: string;
  semester: string;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

interface InlineFeedback {
  type: "success" | "warning" | "error";
  message: string;
}

interface AssignmentFormState {
  sectionId: string;
  instructorId: string;
  subjectIds: string[];
  academicYear: string;
  semester: string;
  schedule: Schedule[];
  scheduleDay: string;
  startTime: string;
  endTime: string;
  room: string;
}

const DEFAULT_COLLEGE_COURSE = "BSE - Bachelor of Entrepreneurship";
const DEFAULT_SECTION_SEMESTER = "1st Semester";
const ENROLLEES_PER_PAGE = 10;

const getCourseStrandDisplay = ({
  program,
  strandOrCourse,
}: {
  program: string;
  strandOrCourse?: string | null;
}) =>
  program === "College" ? DEFAULT_COLLEGE_COURSE : strandOrCourse || program;

const getDecisionNotificationFeedback = (
  notificationResult: AdmissionDecisionNotificationResponse,
  recordLabel: string,
): { message: string; type: Toast["type"] } => {
  switch (notificationResult.deliveries.email.status) {
    case "sent":
      return {
        type: "success",
        message: `${recordLabel} rejected. Email notice sent successfully.`,
      };
    case "failed":
      return {
        type: "warning",
        message: `${recordLabel} rejected, but the email notice could not be sent right now.`,
      };
    default:
      return {
        type: "warning",
        message: `${recordLabel} rejected. Email delivery is not configured yet.`,
      };
  }
};

const getApprovalNotificationFeedback = (
  notificationResult: AdmissionDecisionNotificationResponse,
): { message: string; type: Toast["type"] } => {
  switch (notificationResult.deliveries.email.status) {
    case "sent":
      return {
        type: "success",
        message: "Approval email sent with the student portal link.",
      };
    case "failed":
      return {
        type: "warning",
        message: "Approval email could not be sent right now.",
      };
    default:
      return {
        type: "warning",
        message: "Approval email delivery is not configured yet.",
      };
  }
};

const buildStudentPortalLoginLink = ({
  branch,
  email,
  studentNumber,
}: {
  branch: string;
  email?: string;
  studentNumber: string;
}) => {
  const params = new URLSearchParams({
    branch: normalizeBranchName(branch),
  });

  if (studentNumber.trim()) {
    params.set("studentNumber", studentNumber.trim());
  }

  if (email?.trim()) {
    params.set("email", email.trim().toLowerCase());
  }

  const relativeLink = `/student/login?${params.toString()}`;
  return new URL(relativeLink, window.location.origin).toString();
};

const normalizeStudentStatus = (value?: string | null) =>
  value?.trim().toLowerCase() ?? "";

const isTransfereeAdmission = (
  enrollee: Pick<Enrollee, "studentStatus"> | { studentStatus?: string | null },
) => normalizeStudentStatus(enrollee.studentStatus) === "transferee";

const getOwnScheduleRequestLabel = (
  enrollee: Pick<Enrollee, "requestedOwnSchedule" | "ownScheduleRequestStatus">,
) => {
  if (!enrollee.requestedOwnSchedule) {
    return "Standard";
  }

  if (enrollee.ownScheduleRequestStatus === "Approved") {
    return "Approved";
  }

  if (enrollee.ownScheduleRequestStatus === "Rejected") {
    return "Declined";
  }

  return "Pending Review";
};

type ReviewInfoItem = {
  label: string;
  value?: string | number | null;
  isWide?: boolean;
  spanClassName?: string;
};

const getReviewInfoValue = (value?: string | number | null) => {
  const normalizedValue =
    typeof value === "number" ? String(value) : value?.trim() || "";

  return normalizedValue || "Not provided";
};

const getAdmissionPersonalInfoItems = (
  enrollee: Enrollee,
): ReviewInfoItem[] => {
  const info = enrollee.personalInfo;
  const items: ReviewInfoItem[] = [
    {
      label: "Full Name",
      value: info.fullName || enrollee.fullName,
      spanClassName: "personal-info-item-span-4",
    },
    {
      label: "Sex",
      value: info.sex,
      spanClassName: "personal-info-item-span-2",
    },
    {
      label: "Civil Status",
      value: info.civilStatus,
      spanClassName: "personal-info-item-span-2",
    },
    {
      label: "Email Address",
      value: info.email,
      spanClassName: "personal-info-item-span-4",
    },
    {
      label: "Mobile Number",
      value: info.contactNumber,
      spanClassName: "personal-info-item-span-3",
    },
    {
      label: enrollee.program === "SHS" ? "Strand" : "Course",
      value: info.strandOrCourse || enrollee.strandOrCourse,
      spanClassName: "personal-info-item-span-9",
    },
    {
      label: "Address",
      value: info.address,
      isWide: true,
    },
    {
      label: "Last School Attended",
      value: info.lastSchoolAttended,
      isWide: true,
    },
  ];

  const optionalItems: ReviewInfoItem[] = [
    ...(isTransfereeAdmission(enrollee)
      ? []
      : [
          {
            label: "Requested Year Level",
            value:
              info.requestedYearLevel || info.yearLevel || enrollee.yearLevel,
            spanClassName: "personal-info-item-span-3",
          },
        ]),
    {
      label: "Birth Date",
      value: info.birthDate,
      spanClassName: "personal-info-item-span-3",
    },
    {
      label: "Guardian Name",
      value: info.guardianName,
      spanClassName: "personal-info-item-span-3",
    },
    {
      label: "Guardian Contact",
      value: info.guardianContact,
      spanClassName: "personal-info-item-span-3",
    },
  ];

  return [
    ...items,
    ...optionalItems.filter((item) => getReviewInfoValue(item.value) !== "Not provided"),
  ];
};

const requiresSectionAssignment = (
  enrollee: Pick<Enrollee, "requestedOwnSchedule" | "ownScheduleRequestStatus">,
) =>
  !(
    enrollee.requestedOwnSchedule &&
    enrollee.ownScheduleRequestStatus === "Approved"
  );

const getProgramYearLevelOptions = (program: string) =>
  program === "SHS"
    ? ["Grade 11", "Grade 12"]
    : ["1st Year", "2nd Year", "3rd Year", "4th Year"];

const createDefaultSectionForm = (): SectionFormState => ({
  program: "College",
  yearLevel: "1st Year",
  semester: DEFAULT_SECTION_SEMESTER,
  strand: DEFAULT_COLLEGE_COURSE,
  section: "A",
  maxCapacity: 30,
});

const createDefaultAssignmentForm = (
  sectionId = "",
  semester = DEFAULT_SECTION_SEMESTER,
  academicYear = "2026-2027",
): AssignmentFormState => ({
  sectionId,
  instructorId: "",
  subjectIds: [],
  academicYear,
  semester: normalizeSectionSemester(semester),
  schedule: [],
  scheduleDay: "",
  startTime: "",
  endTime: "",
  room: "",
});

const createDefaultSubjectForm = (): SubjectFormState => ({
  code: "",
  name: "",
  program: "College",
  yearLevel: "1st Year",
  semester: DEFAULT_SECTION_SEMESTER,
  units: "3",
  strand: DEFAULT_COLLEGE_COURSE,
  type: "major",
  prerequisiteSubjectIds: [],
});

const createDefaultInstructorForm = (): InstructorFormState => ({
  name: "",
  employeeId: "",
  department: "",
  email: "",
  contactNumber: "",
});

const createDefaultTransfereeEvaluation = (
  enrollee: Pick<Enrollee, "id" | "yearLevel">,
  academicYear = "2026-2027",
): TransfereeEvaluationRecord => ({
  enrolleeId: enrollee.id,
  credentialsReviewed: false,
  placementConfirmed: false,
  subjectLoadValidated: false,
  resolvedYearLevel: enrollee.yearLevel,
  plannedSemester: DEFAULT_SECTION_SEMESTER,
  plannedAcademicYear: academicYear,
  creditYearLevelFilter: "All",
  creditSemesterFilter: "All",
  creditedSubjectIds: [],
  assignedSubjectIds: [],
  recommendedSectionId: "",
  notes: "",
  updatedAt: new Date().toISOString(),
});

const normalizeSectionSemester = (value?: string | null) => {
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

const normalizeStringList = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          ),
        ),
      )
    : [];

const getUniqueTrimmedValues = (
  values: Array<string | null | undefined>,
): string[] => {
  const seen = new Set<string>();

  return values.reduce<string[]>((result, value) => {
    const trimmedValue = value?.trim();

    if (!trimmedValue) {
      return result;
    }

    const normalizedValue = trimmedValue.toLowerCase();

    if (seen.has(normalizedValue)) {
      return result;
    }

    seen.add(normalizedValue);
    result.push(trimmedValue);
    return result;
  }, []);
};

const normalizeTransfereeEvaluation = (
  enrollee: Pick<Enrollee, "id" | "yearLevel">,
  evaluation: Partial<TransfereeEvaluationRecord> | null | undefined,
  academicYear = "2026-2027",
): TransfereeEvaluationRecord => {
  const fallback = createDefaultTransfereeEvaluation(enrollee, academicYear);
  const creditedSubjectIds = normalizeStringList(evaluation?.creditedSubjectIds);
  const assignedSubjectIds = normalizeStringList(
    evaluation?.assignedSubjectIds,
  ).filter((subjectId) => !creditedSubjectIds.includes(subjectId));

  const resolvedYearLevel =
    typeof evaluation?.resolvedYearLevel === "string" &&
    evaluation.resolvedYearLevel.trim()
      ? evaluation.resolvedYearLevel
      : fallback.resolvedYearLevel;
  const plannedAcademicYear =
    typeof evaluation?.plannedAcademicYear === "string"
      ? evaluation.plannedAcademicYear.trim() || academicYear
      : fallback.plannedAcademicYear;
  const creditYearLevelFilter =
    typeof evaluation?.creditYearLevelFilter === "string" &&
    evaluation.creditYearLevelFilter.trim()
      ? evaluation.creditYearLevelFilter
      : fallback.creditYearLevelFilter;
  const creditSemesterFilter =
    typeof evaluation?.creditSemesterFilter === "string" &&
    evaluation.creditSemesterFilter.trim()
      ? evaluation.creditSemesterFilter
      : fallback.creditSemesterFilter;

  return {
    enrolleeId: enrollee.id,
    credentialsReviewed: evaluation?.credentialsReviewed === true,
    placementConfirmed: evaluation?.placementConfirmed === true,
    subjectLoadValidated: evaluation?.subjectLoadValidated === true,
    resolvedYearLevel,
    plannedSemester: normalizeSectionSemester(evaluation?.plannedSemester),
    plannedAcademicYear,
    creditYearLevelFilter,
    creditSemesterFilter:
      creditSemesterFilter === "All"
        ? "All"
        : normalizeSectionSemester(creditSemesterFilter),
    creditedSubjectIds,
    assignedSubjectIds,
    recommendedSectionId:
      typeof evaluation?.recommendedSectionId === "string"
        ? evaluation.recommendedSectionId
        : fallback.recommendedSectionId,
    notes:
      typeof evaluation?.notes === "string" ? evaluation.notes : fallback.notes,
    updatedAt:
      typeof evaluation?.updatedAt === "string" && evaluation.updatedAt.trim()
        ? evaluation.updatedAt
        : fallback.updatedAt,
  };
};

const SCHEDULE_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;
const DEFAULT_ASSIGNMENT_ROOMS = [
  "RM101",
  "RM102",
  "RM103",
  "RM104",
  "RM205",
  "Computer Lab 1",
  "Computer Lab 2",
  "Science Lab",
  "Library",
] as const;
const SEMESTER_SORT_ORDER = ["1st Semester", "2nd Semester", "Summer"] as const;
const AUTO_ASSIGN_SEMESTER_OPTIONS = [
  "1st Semester",
  "2nd Semester",
  "Summer",
] as const;
type AutoAssignSemester = (typeof AUTO_ASSIGN_SEMESTER_OPTIONS)[number];

const sortSemesterValues = (semesters: string[]) =>
  [...semesters].sort((left, right) => {
    const leftIndex = SEMESTER_SORT_ORDER.indexOf(
      left as (typeof SEMESTER_SORT_ORDER)[number],
    );
    const rightIndex = SEMESTER_SORT_ORDER.indexOf(
      right as (typeof SEMESTER_SORT_ORDER)[number],
    );

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });

const dedupeStringValues = (values: string[]) => Array.from(new Set(values));

// Get requirement items for enrollment requests based on current and requested level
const getEnrollmentRequirementItems = (
  currentYearLevel: string,
  _requestedYearLevel: string,
  program: string,
) => {
  void _requestedYearLevel;

  if (!currentYearLevel) {
    // Default requirements for new admissions
    return [
      { name: "Form 137 / SF10", required: true, key: "f137" },
      { name: "PSA Birth Certificate", required: true, key: "psa" },
      { name: "Good Moral Character", required: true, key: "gmc" },
      { name: "Certificate of Completion", required: true, key: "coc" },
    ];
  }

  return getRegularEnrollmentRequirementItems(program).map((requirement) => ({
    name: requirement.name,
    required: requirement.required,
    key: requirement.key,
  }));
};

const mapAdminProgramToAdmissionProgram = (program: string) =>
  program === "SHS" ? "Senior High School" : "College";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);

const normalizeAttachmentName = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const hasAttachmentNamed = (
  attachments: Pick<Attachment, "name" | "reviewStatus">[] | undefined,
  attachmentName: string,
) =>
  Boolean(
    attachments?.some(
      (attachment) =>
        normalizeAttachmentName(attachment.name) ===
        normalizeAttachmentName(attachmentName),
    ),
  );

const hasApprovedAttachmentNamed = (
  attachments: Pick<Attachment, "name" | "reviewStatus">[] | undefined,
  attachmentName: string,
) =>
  Boolean(
    attachments?.some(
      (attachment) =>
        normalizeAttachmentName(attachment.name) ===
          normalizeAttachmentName(attachmentName) &&
        attachment.reviewStatus === "Approved",
    ),
  );

const isEnrollmentRequestRecord = (
  item: EnrollmentRequest | Enrollee,
): item is EnrollmentRequest =>
  "currentYearLevel" in item && "requestedYearLevel" in item;

const getReviewRequirementItems = (item: EnrollmentRequest | Enrollee) => {
  if (isEnrollmentRequestRecord(item)) {
    return getEnrollmentRequirementItems(
      item.currentYearLevel,
      item.requestedYearLevel,
      item.program,
    );
  }

  return getAdmissionRequirements(
    item.studentStatus,
    mapAdminProgramToAdmissionProgram(item.program),
    item.honorLabel || "No Honor",
  ).map((requirement) => ({
    name: requirement.name,
    required: !requirement.optional,
    key: requirement.code,
  }));
};

const hasRedoRequirement = (item: EnrollmentRequest | Enrollee) => {
  const requirementItems = getReviewRequirementItems(item);
  const attachmentsByName = isEnrollmentRequestRecord(item)
    ? null
    : new Map(
        (item.attachments ?? []).map((attachment) => [
          normalizeAttachmentName(attachment.name),
          attachment,
        ]),
      );

  return requirementItems.some((requirement, index) => {
    const attachment = isEnrollmentRequestRecord(item)
      ? item.attachments?.[index]
      : attachmentsByName?.get(normalizeAttachmentName(requirement.name));

    return attachment?.reviewStatus === "Rejected";
  });
};

const normalizeAcademicDescriptor = (value?: string) => {
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

  if (normalized.includes("computer science") || normalized.includes("bscs")) {
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

const matchesAcademicDescriptor = (leftValue?: string, rightValue?: string) => {
  const left = normalizeAcademicDescriptor(leftValue);
  const right = normalizeAcademicDescriptor(rightValue);

  if (!left || !right || left === "all" || right === "all") {
    return true;
  }

  return left === right || left.includes(right) || right.includes(left);
};

const resolveSubjectStrandOrCourse = (
  subject: Pick<Subject, "program" | "strand">,
) =>
  subject.program === "College"
    ? subject.strand || DEFAULT_COLLEGE_COURSE
    : subject.strand || "All";

const LEGACY_APPLIED_SHS_SUBJECT_CODES = new Set([
  "MIN115",
  "MIN116",
  "MIN117",
  "MIN118",
  "MIN121",
  "MIN122",
  "MIN123",
]);

const LEGACY_APPLIED_SHS_SUBJECT_NAMES = new Set([
  "english for academic purposes",
  "filipino sa piling larangan",
  "practical research 2",
  "inquiries and investigation",
  "entrepreneurship",
  "research project",
  "work immersion",
]);

const normalizeSubjectLookupValue = (value?: string) =>
  value?.trim().toLowerCase().replace(/\s+/g, " ") || "";

const inferLegacyShsSubjectType = ({
  code,
  name,
  strand,
}: {
  code?: string;
  name?: string;
  strand?: string;
}): ShsSubjectType => {
  if ((strand || "All") !== "All") {
    return "specialized";
  }

  const normalizedCode = code?.trim().toUpperCase() || "";
  const normalizedName = normalizeSubjectLookupValue(name);

  if (
    LEGACY_APPLIED_SHS_SUBJECT_CODES.has(normalizedCode) ||
    LEGACY_APPLIED_SHS_SUBJECT_NAMES.has(normalizedName)
  ) {
    return "applied";
  }

  return "core";
};

const normalizeSubjectTypeForProgram = ({
  program,
  type,
  strand,
  code,
  name,
}: {
  program: "College" | "SHS";
  type?: string;
  strand?: string;
  code?: string;
  name?: string;
}): SubjectType => {
  if (program === "College") {
    return type === "minor" ? "minor" : "major";
  }

  if (
    type === "core" ||
    type === "applied" ||
    type === "specialized"
  ) {
    return type;
  }

  return inferLegacyShsSubjectType({ code, name, strand });
};

const getResolvedSubjectType = (
  subject: Pick<
    Subject,
    "code" | "name" | "program" | "strand" | "isMinor" | "subjectType"
  >,
): SubjectType => {
  if (subject.program === "College") {
    if (subject.subjectType === "minor" || subject.subjectType === "major") {
      return subject.subjectType;
    }

    return subject.isMinor ? "minor" : "major";
  }

  return normalizeSubjectTypeForProgram({
    program: "SHS",
    type: subject.subjectType,
    code: subject.code,
    name: subject.name,
    strand: resolveSubjectStrandOrCourse(subject),
  });
};

const getSubjectTypeLabel = (
  subject: Pick<
    Subject,
    "code" | "name" | "program" | "strand" | "isMinor" | "subjectType"
  >,
) => {
  const resolvedType = getResolvedSubjectType(subject);

  switch (resolvedType) {
    case "minor":
      return "Minor";
    case "major":
      return "Major";
    case "core":
      return "Core";
    case "applied":
      return "Applied";
    default:
      return "Specialized";
  }
};

const normalizeSubjectCatalog = (catalog: Subject[]) =>
  catalog.map((subject) => {
    const resolvedType = getResolvedSubjectType(subject);

    return subject.program === "College" && !subject.strand
      ? {
          ...subject,
          semester: normalizeSectionSemester(subject.semester),
          strand: DEFAULT_COLLEGE_COURSE,
          subjectType: resolvedType,
          isMinor: resolvedType === "minor",
          prerequisiteSubjectIds: normalizeStringList(
            subject.prerequisiteSubjectIds,
          ),
        }
      : {
          ...subject,
          semester: normalizeSectionSemester(subject.semester),
          subjectType: resolvedType,
          isMinor:
            subject.program === "College" ? resolvedType === "minor" : undefined,
          prerequisiteSubjectIds: normalizeStringList(
            subject.prerequisiteSubjectIds,
          ),
        };
  });

const getSubjectYearLevelRank = (program: string, yearLevel: string) => {
  const options = getProgramYearLevelOptions(program);
  const matchedIndex = options.findIndex(
    (option) => option.toLowerCase() === yearLevel.trim().toLowerCase(),
  );

  return matchedIndex === -1 ? options.length : matchedIndex;
};

const getSubjectSemesterRank = (semester: string) => {
  const normalizedSemester = normalizeSectionSemester(semester);
  const matchedIndex = SEMESTER_SORT_ORDER.findIndex(
    (option) => option.toLowerCase() === normalizedSemester.toLowerCase(),
  );

  return matchedIndex === -1 ? SEMESTER_SORT_ORDER.length : matchedIndex;
};

const compareSubjectSequence = (
  left: Pick<Subject, "program" | "yearLevel" | "semester" | "code" | "name">,
  right: Pick<Subject, "program" | "yearLevel" | "semester" | "code" | "name">,
) =>
  getSubjectYearLevelRank(left.program, left.yearLevel) -
    getSubjectYearLevelRank(right.program, right.yearLevel) ||
  getSubjectSemesterRank(left.semester) - getSubjectSemesterRank(right.semester) ||
  left.code.localeCompare(right.code) ||
  left.name.localeCompare(right.name);

const subjectCanBePrerequisiteForContext = (
  candidate: Subject,
  target: Pick<
    Subject,
    "id" | "program" | "yearLevel" | "semester" | "strand"
  >,
) => {
  if (candidate.id === target.id || candidate.program !== target.program) {
    return false;
  }

  if (
    !matchesAcademicDescriptor(
      resolveSubjectStrandOrCourse(candidate),
      resolveSubjectStrandOrCourse(target),
    )
  ) {
    return false;
  }

  return compareSubjectSequence(candidate, {
    ...target,
    code: "",
    name: "",
  }) < 0;
};

const sectionMatchesEnrollee = (
  section: ClassSection,
  enrollee: Pick<Enrollee, "program" | "yearLevel" | "strandOrCourse">,
) => {
  if (
    section.program !== enrollee.program ||
    section.yearLevel !== enrollee.yearLevel
  ) {
    return false;
  }

  if (!section.strand) {
    return true;
  }

  return matchesAcademicDescriptor(section.strand, enrollee.strandOrCourse);
};

const LEGACY_MOCK_SECTION_IDS = new Set(["1", "2", "3", "4", "5"]);
const LEGACY_MOCK_SECTION_CODES = new Set([
  "IC1DA",
  "IC1MB",
  "GA1DA",
  "HUM1MB",
  "BSE1A",
]);

const isLegacyMockSection = (section: ClassSection) =>
  LEGACY_MOCK_SECTION_IDS.has(section.id) &&
  LEGACY_MOCK_SECTION_CODES.has(section.code) &&
  section.enrolleeIds.every((enrolleeId) => /^E\d+$/i.test(enrolleeId));

const getSectionYearCode = (yearLevel: string) => {
  const normalized = yearLevel.trim().toLowerCase();

  if (normalized.includes("grade 12") || normalized.includes("2nd")) {
    return "2";
  }

  if (normalized.includes("grade 11") || normalized.includes("1st")) {
    return "1";
  }

  const yearMatch = normalized.match(/\b([1-4])(st|nd|rd|th)?\b/);
  return yearMatch?.[1] || "1";
};

const getAutoSectionPrefix = (
  enrollee: Pick<Enrollee, "program" | "strandOrCourse">,
) => {
  if (enrollee.program === "College") {
    return "BSE";
  }

  const descriptor = normalizeAcademicDescriptor(enrollee.strandOrCourse);

  if (descriptor === "humss") {
    return "HUM";
  }

  if (descriptor) {
    return descriptor.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
  }

  return "SHS";
};

const createAutoSectionForEnrollee = (
  enrollee: Pick<Enrollee, "id" | "program" | "yearLevel" | "strandOrCourse">,
  matchingSections: ClassSection[],
): ClassSection => {
  const lastSection = matchingSections[matchingSections.length - 1];
  const lastSectionLetter = lastSection?.section?.trim().toUpperCase();
  const nextSectionLetter =
    lastSectionLetter && /^[A-Z]$/.test(lastSectionLetter)
      ? String.fromCharCode(lastSectionLetter.charCodeAt(0) + 1)
      : "A";

  return {
    id: `auto_${enrollee.id}_${Date.now()}_${nextSectionLetter}`,
    code: `${getAutoSectionPrefix(enrollee)}${getSectionYearCode(enrollee.yearLevel)}-${nextSectionLetter}`,
    program: enrollee.program,
    yearLevel: enrollee.yearLevel,
    semester: normalizeSectionSemester(lastSection?.semester),
    strand: enrollee.strandOrCourse,
    section: nextSectionLetter,
    currentEnrollees: 0,
    maxCapacity: 30,
    enrolleeIds: [],
    isLocked: false,
  };
};

const normalizeSectionLabel = (value: string) => value.trim().toUpperCase();
const normalizeSectionCodeValue = (value?: string | null) =>
  value?.trim().toUpperCase() || "";

const getSectionLabelFromCode = (sectionCode: string) => {
  const normalizedSectionCode = normalizeSectionCodeValue(sectionCode);

  if (!normalizedSectionCode) {
    return "";
  }

  const sectionCodeMatch = normalizedSectionCode.match(/^(.*?)([1-4])-?([A-Z]+)$/);
  if (sectionCodeMatch?.[3]) {
    return sectionCodeMatch[3];
  }

  const trailingLetters = normalizedSectionCode.match(/([A-Z]+)$/);
  return trailingLetters?.[1] || normalizedSectionCode;
};

const sortClassSections = (sections: ClassSection[]) =>
  [...sections].sort(
    (left, right) =>
      left.program.localeCompare(right.program) ||
      getSubjectYearLevelRank(left.program, left.yearLevel) -
        getSubjectYearLevelRank(right.program, right.yearLevel) ||
      getSubjectSemesterRank(left.semester) -
        getSubjectSemesterRank(right.semester) ||
      left.code.localeCompare(right.code),
  );

const isSectionLocked = (section?: Pick<ClassSection, "isLocked"> | null) =>
  Boolean(section?.isLocked);

const getSectionCapacityLabel = (
  section: Pick<
    StudentSectionChoice,
    "currentEnrollees" | "maxCapacity" | "hasCapacityLimit"
  >,
) =>
  section.hasCapacityLimit
    ? `${section.currentEnrollees}/${section.maxCapacity} enrolled`
    : `${section.currentEnrollees} enrolled`;

const getSectionDescriptorLabel = (
  section: Pick<
    StudentSectionChoice,
    "program" | "yearLevel" | "semester" | "strand"
  >,
) =>
  [section.program, section.yearLevel, section.strand, section.semester]
    .filter(Boolean)
    .join(" | ");

const buildStudentSectionOptionLabel = (section: StudentSectionChoice) =>
  `${section.code} | ${section.semester} | ${getSectionCapacityLabel(section)}`;

const buildSectionCode = ({
  program,
  yearLevel,
  strand,
  section,
  existingCode,
  previousSection,
}: {
  program: string;
  yearLevel: string;
  strand?: string;
  section: string;
  existingCode?: string;
  previousSection?: string;
}) => {
  const normalizedSection = normalizeSectionLabel(section);

  if (!normalizedSection) {
    return "";
  }

  const normalizedPreviousSection = previousSection
    ? normalizeSectionLabel(previousSection)
    : "";

  if (
    existingCode &&
    normalizedPreviousSection &&
    existingCode.toUpperCase().endsWith(normalizedPreviousSection)
  ) {
    const codeParts = existingCode.match(/^(.*?)([1-4])-?([A-Z]+)$/);

    if (codeParts) {
      return `${codeParts[1]}${getSectionYearCode(yearLevel)}-${normalizedSection}`;
    }

    return `${existingCode.slice(0, existingCode.length - normalizedPreviousSection.length)}${normalizedSection}`;
  }

  const prefix = program === "SHS" ? (strand || "SHS").trim() : "BSE";
  return `${prefix}${getSectionYearCode(yearLevel)}-${normalizedSection}`;
};

const buildProgressedBlockSectionCode = ({
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

  const requestedYearCode = getSectionYearCode(requestedYearLevel);
  const codeParts = normalizedCode.match(/^(.*?)([1-4])-?([A-Z]+)$/);

  if (!codeParts) {
    return normalizedCode;
  }

  const [, prefix, , blockLabel] = codeParts;
  return `${prefix}${requestedYearCode}-${blockLabel}`;
};

export default function AdminEnrollees({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: EnrolleesProps) {
  const { currentUser } = useAuth();
  const currentBranch = normalizeBranchName(currentUser?.branch);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "admissions" | "transferees" | "enrollments" | "academic"
  >("admissions");
  const [selectedRequest, setSelectedRequest] = useState<
    EnrollmentRequest | Enrollee | null
  >(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | Enrollee["status"]>(
    "All",
  );
  const [showOwnScheduleOnly, setShowOwnScheduleOnly] = useState(false);
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useState<
    "All" | "Pending" | "Approved" | "Rejected"
  >("All");
  const [isLoading, setIsLoading] = useState(false);
  const [enrollmentRequests, setEnrollmentRequests] = useState<
    EnrollmentRequest[]
  >([]);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [selectedRejectionReason, setSelectedRejectionReason] = useState("");
  const [selectedAction, setSelectedAction] = useState<{
    id: string;
    action: "approve" | "reject";
    scholarshipExamScore?: number | null;
  } | null>(null);
  const [enrollees, setEnrollees] = useState<Enrollee[]>([]);
  const [currentEnrolleePage, setCurrentEnrolleePage] = useState(1);
  const [selectedEnrolleeIds, setSelectedEnrolleeIds] = useState<string[]>([]);
  const [selectedEnrollmentRequestIds, setSelectedEnrollmentRequestIds] =
    useState<string[]>([]);
  const [pendingScholarshipScore, setPendingScholarshipScore] = useState("");
  const selectedAdmissionRequest =
    selectedRequest && !isEnrollmentRequestRecord(selectedRequest)
      ? selectedRequest
      : null;
  const selectedAdmissionHonorLabel =
    selectedAdmissionRequest?.honorLabel || "No Honor";
  const selectedAdmissionHonorCertificateStatus = !selectedAdmissionRequest
    ? "Not available"
    : selectedAdmissionHonorLabel !== "No Honor"
      ? hasApprovedAttachmentNamed(
          selectedAdmissionRequest.attachments,
          "Honor Certificate",
        )
        ? "Approved"
        : hasAttachmentNamed(
              selectedAdmissionRequest.attachments,
              "Honor Certificate",
            )
          ? "Pending approval"
        : "Pending"
      : "Not required";
  const selectedAdmissionScholarshipStatus = !selectedAdmissionRequest
    ? "Not available"
    : selectedAdmissionRequest.appliedForScholarship
      ? "Applied"
      : "Not applied";
  const selectedAdmissionScholarshipScore =
    !selectedAdmissionRequest ||
    selectedAdmissionRequest.program !== "College" ||
    selectedAdmissionRequest.status !== "Pending"
      ? selectedAdmissionRequest?.scholarshipExamScore ?? null
      : pendingScholarshipScore.trim() === ""
        ? selectedAdmissionRequest.scholarshipExamScore ?? null
        : Number.isFinite(Number(pendingScholarshipScore))
          ? Number(pendingScholarshipScore)
          : null;
  const selectedAdmissionTuition =
    selectedAdmissionRequest?.program === "College"
      ? getEstimatedCollegeTuition({
          honorLabel: selectedAdmissionRequest.honorLabel,
          honorCertificateApproved: hasApprovedAttachmentNamed(
            selectedAdmissionRequest.attachments,
            "Honor Certificate",
          ),
          appliedForScholarship: selectedAdmissionRequest.appliedForScholarship,
          scholarshipExamScore: selectedAdmissionScholarshipScore,
        })
      : null;
  const selectedAdmissionScholarshipTuitionStatus = !selectedAdmissionRequest
    ? "Not available"
    : !selectedAdmissionRequest.appliedForScholarship
      ? "Not applied"
      : typeof selectedAdmissionScholarshipScore === "number"
        ? selectedAdmissionTuition?.effectiveDiscountPercentage === 0
          ? "No discount applied"
          : selectedAdmissionTuition?.effectiveDiscountSource ===
              "scholarship_exam"
          ? `Scholarship exam applied (${selectedAdmissionTuition.effectiveDiscountPercentage}%)`
          : `Honor retained (${selectedAdmissionTuition?.effectiveDiscountPercentage ?? 0}%)`
        : "Awaiting exam result";

  // Section Manager States

  const isEnrollmentRequest = isEnrollmentRequestRecord;

  const [showSectionManager, setShowSectionManager] = useState(false);
  const [sectionManagerScope, setSectionManagerScope] = useState<
    "all" | "admissions" | "transferees"
  >("all");
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [sectionAssignments, setSectionAssignments] = useState<
    SectionAssignment[]
  >([]);
  const [selectedSection, setSelectedSection] = useState<ClassSection | null>(
    null,
  );
  const [showSectionStudents, setShowSectionStudents] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState<Enrollee[]>([]);
  const [editingSection, setEditingSection] = useState<ClassSection | null>(
    null,
  );
  const [newSection, setNewSection] =
    useState<SectionFormState>(createDefaultSectionForm());
  const [showMoveStudentsModal, setShowMoveStudentsModal] = useState(false);
  const [moveStudentSearchTerm, setMoveStudentSearchTerm] = useState("");
  const [selectedMoveStudentId, setSelectedMoveStudentId] = useState("");
  const [pendingMoveSectionCode, setPendingMoveSectionCode] = useState("");
  const [isSavingMoveStudent, setIsSavingMoveStudent] = useState(false);
  const [moveStudentFeedback, setMoveStudentFeedback] =
    useState<InlineFeedback | null>(null);
  const [transfereeCreditSearchTerm, setTransfereeCreditSearchTerm] =
    useState("");
  const [transfereeLoadSearchTerm, setTransfereeLoadSearchTerm] = useState("");
  // Academic Management States
  const [activeManagementTab, setActiveManagementTab] = useState<
    "subjects" | "instructors" | "assignments" | "evaluation"
  >("subjects");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<
    SubjectAssignment[]
  >([]);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [showInstructorModal, setShowInstructorModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignmentAutoAssignSection, setAssignmentAutoAssignSection] =
    useState<ClassSection | null>(null);
  const [assignmentAutoAssignSemester, setAssignmentAutoAssignSemester] =
    useState<AutoAssignSemester>(DEFAULT_SECTION_SEMESTER);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectForm, setSubjectForm] = useState<SubjectFormState>(
    createDefaultSubjectForm(),
  );
  const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(
    null,
  );
  const [instructorForm, setInstructorForm] = useState<InstructorFormState>(
    createDefaultInstructorForm(),
  );
  const [editingAssignment, setEditingAssignment] =
    useState<SubjectAssignment | null>(null);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>(
    [],
  );
  const [pendingAssignmentDeleteIds, setPendingAssignmentDeleteIds] = useState<
    string[]
  >([]);
  const [showAssignmentDeleteModal, setShowAssignmentDeleteModal] =
    useState(false);
  const [customAssignmentRooms, setCustomAssignmentRooms] = useState<string[]>(
    [],
  );
  const [newRoomName, setNewRoomName] = useState("");
  const [showClassroomManagerModal, setShowClassroomManagerModal] =
    useState(false);
  const [selectedClassroomNames, setSelectedClassroomNames] = useState<
    string[]
  >([]);
  const [instructorDepartments, setInstructorDepartments] = useState<string[]>(
    [],
  );
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [showDepartmentManagerModal, setShowDepartmentManagerModal] =
    useState(false);
  const [selectedDepartmentNames, setSelectedDepartmentNames] = useState<
    string[]
  >([]);
  const [pendingAcademicOptionDelete, setPendingAcademicOptionDelete] =
    useState<{
      kind: "department" | "classroom";
      names: string[];
      usedNames?: string[];
      message: string;
    } | null>(null);
  const [showScheduleDraftFields, setShowScheduleDraftFields] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(
    createDefaultAssignmentForm(),
  );
  const [subjectFilter, setSubjectFilter] = useState({
    program: "All",
    yearLevel: "All",
    strand: "All",
    strandOrCourse: "All",
    showMinor: true,
  });
  const [instructorSearch, setInstructorSearch] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState({
    program: "All",
    strandOrCourse: "All",
    semester: "All",
  });
  const [evaluationStatuses, setEvaluationStatuses] =
    useState<InstructorEvaluationStatusMap>(() =>
      readInstructorEvaluationStatuses(currentBranch),
    );
  const [evaluationQuestionnaire, setEvaluationQuestionnaire] = useState<
    EvaluationQuestionCategoryRecord[]
  >(() => readEvaluationQuestionnaire(currentBranch));
  const [evaluationSubmissions, setEvaluationSubmissions] = useState<
    InstructorEvaluationSubmissionRecord[]
  >(() => readInstructorEvaluationSubmissions(currentBranch));
  const [showQuestionnaireModal, setShowQuestionnaireModal] = useState(false);
  const [selectedEvaluationDetailsInstructorId, setSelectedEvaluationDetailsInstructorId] =
    useState("");
  const [evaluationDetailsFilters, setEvaluationDetailsFilters] = useState({
    subjectId: "",
    yearLevel: "",
    section: "All",
  });
  const [questionnaireCategoryName, setQuestionnaireCategoryName] =
    useState("");
  const [selectedQuestionnaireCategoryId, setSelectedQuestionnaireCategoryId] =
    useState("");
  const [questionnaireQuestionText, setQuestionnaireQuestionText] =
    useState("");
  const [questionnaireQuestionType, setQuestionnaireQuestionType] =
    useState<"rating" | "essay">("rating");

  // New state for expanded sections in subjects table
  const [expandedSHSSections, setExpandedSHSSections] = useState({
    "Grade 11": true,
    "Grade 12": true,
  });
  const [expandedCollegeSections, setExpandedCollegeSections] = useState({
    "1st Year": true,
    "2nd Year": false,
    "3rd Year": false,
    "4th Year": false,
  });
  // State for expanded sections in Class Assignments
  const [expandedAssignmentSections, setExpandedAssignmentSections] = useState<
    Record<string, boolean>
  >({});
  const [transfereeEvaluations, setTransfereeEvaluations] = useState<
    Record<string, TransfereeEvaluationRecord>
  >({});
  const [studentSubjectPlans, setStudentSubjectPlans] = useState<
    Record<string, StudentSubjectPlanRecord>
  >({});
  const [hasInitializedBranchData, setHasInitializedBranchData] =
    useState(false);

  // Toast functions
  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const storageScopes = {
    enrollees: "enrollees",
    enrollmentRequests: "enrollment-requests",
    classSections: "class-sections",
    sectionAssignments: "section-assignments",
    subjects: "subjects",
    instructors: "instructors",
    instructorDepartments: "instructor-departments",
    subjectAssignments: "subject-assignments",
    assignmentRooms: "assignment-rooms",
    transfereeEvaluations: "transferee-evaluations",
    studentSubjectPlans: "student-subject-plans",
  } as const;
  const reflectedAcademicYear =
    enrollmentRequests[0]?.academicYear ||
    subjectAssignments[0]?.academicYear ||
    "2026-2027";
  const reflectedSemester =
    normalizeSectionSemester(
      enrollmentRequests[0]?.semester || subjectAssignments[0]?.semester,
    ) || DEFAULT_SECTION_SEMESTER;
  const resolveOwnScheduleAcademicYear = (
    enrollee: Pick<Enrollee, "ownScheduleAcademicYear">,
  ) => enrollee.ownScheduleAcademicYear?.trim() || reflectedAcademicYear;
  const resolveOwnScheduleSemester = (
    enrollee: Pick<Enrollee, "ownScheduleSemester">,
  ) => normalizeSectionSemester(enrollee.ownScheduleSemester || DEFAULT_SECTION_SEMESTER);

  const hasAcademicSnapshotData = (snapshot?: Partial<AcademicSnapshot> | null) =>
    Boolean(
      snapshot &&
        (
          (snapshot.subjects?.length ?? 0) > 0 ||
          (snapshot.instructors?.length ?? 0) > 0 ||
          (snapshot.classSections?.length ?? 0) > 0 ||
          (snapshot.subjectAssignments?.length ?? 0) > 0 ||
          (snapshot.assignmentRooms?.length ?? 0) > 0
        ),
    );

  const mergeBranchStudentsIntoLocalCache = (students: StudentStorageRecord[]) => {
    if (students.length === 0) {
      return;
    }

    const existingStudents = readStoredStudents();
    const branchStudentsByKey = new Map(
      students.map((student) => [
        `${normalizeBranchName(student.branch)}:${student.id}`,
        student,
      ]),
    );
    const preservedStudents = existingStudents.filter((student) => {
      const key = `${normalizeBranchName(student.branch)}:${student.id}`;
      return !branchStudentsByKey.has(key);
    });

    writeStoredStudents([...preservedStudents, ...students]);
  };

  const getActiveBranchStudents = () =>
    getStudentsForBranch(currentBranch).filter(
      (student) => student.status !== "Archived",
    );

  const getSectionStudentCount = (sectionCode?: string | null) => {
    const normalizedSectionCode = normalizeSectionCodeValue(sectionCode);

    if (!normalizedSectionCode) {
      return 0;
    }

    return getActiveBranchStudents().filter(
      (student) =>
        normalizeSectionCodeValue(student.section) === normalizedSectionCode,
    ).length;
  };

  const buildSectionAssignmentsFromSections = (
    sectionsToMap: ClassSection[],
    enrolleeRecords: Enrollee[],
  ) =>
    sectionsToMap.flatMap((section) =>
      section.enrolleeIds.map((enrolleeId) => ({
        enrolleeId,
        enrolleeName:
          enrolleeRecords.find((enrollee) => enrollee.id === enrolleeId)?.fullName ||
          "Unknown student",
        assignedSection: section.code,
        assignedDate: new Date().toLocaleDateString(),
        isManualOverride: false,
      })),
    );

  const syncStoredStudentsToSupabase = async (studentNumbers: string[]) => {
    const uniqueStudentNumbers = Array.from(
      new Set(
        studentNumbers
          .map((studentNumber) => studentNumber.trim())
          .filter((studentNumber) => studentNumber !== ""),
      ),
    );

    if (uniqueStudentNumbers.length === 0) {
      return;
    }

    const storedStudents = readStoredStudents();
    const matchedStudents = storedStudents.filter(
      (student) =>
        normalizeBranchName(student.branch) === currentBranch &&
        uniqueStudentNumbers.includes(student.id),
    );

    if (matchedStudents.length === 0) {
      return;
    }

    try {
      const syncedStudents = await Promise.all(
        matchedStudents.map((student) => saveAdminStudent(student)),
      );

      if (syncedStudents.length > 0) {
        mergeBranchStudentsIntoLocalCache(syncedStudents);
      }
    } catch (error) {
      console.warn("Unable to sync updated students to Supabase.", error);
    }
  };

  const syncClassSectionsToSupabase = async (sectionsToSync: ClassSection[]) => {
    if (sectionsToSync.length === 0) {
      return;
    }

    try {
      await Promise.all(
        sectionsToSync.map((section) =>
          saveAcademicClassSection(currentBranch, section),
        ),
      );
    } catch (error) {
      console.warn("Unable to sync updated class sections to Supabase.", error);
    }
  };

  // Load class sections
  const loadClassSections = async (
    remoteSections?: ClassSection[] | null,
  ): Promise<ClassSection[]> => {
    const activeBranchStudents = getActiveBranchStudents();
    const studentSectionSummaries = activeBranchStudents.reduce<
      Map<string, { count: number; sampleStudent: StudentStorageRecord }>
    >((summaryMap, student) => {
      const normalizedSectionCode = normalizeSectionCodeValue(student.section);

      if (!normalizedSectionCode) {
        return summaryMap;
      }

      const existingSummary = summaryMap.get(normalizedSectionCode);
      summaryMap.set(normalizedSectionCode, {
        count: (existingSummary?.count || 0) + 1,
        sampleStudent: existingSummary?.sampleStudent || student,
      });

      return summaryMap;
    }, new Map());

    const storedSections = readBranchScopedData<ClassSection[]>(
      storageScopes.classSections,
      currentBranch,
    ) ?? [];
    const storedSectionLocks = new Map(
      storedSections.map((section) => [
        normalizeSectionCodeValue(section.code),
        Boolean(section.isLocked),
      ]),
    );

    if (remoteSections && remoteSections.length > 0) {
      const normalizedRemoteSections = sortClassSections(
        remoteSections.map((section) => {
          const normalizedCode = normalizeSectionCodeValue(section.code);
          const currentEnrolleeCount =
            studentSectionSummaries.get(normalizedCode)?.count ?? 0;

          return {
            ...section,
            code: normalizedCode || section.code,
            semester: normalizeSectionSemester(section.semester),
            currentEnrollees: currentEnrolleeCount,
            maxCapacity: Math.max(
              Number(section.maxCapacity ?? 0),
              currentEnrolleeCount,
              1,
            ),
            enrolleeIds: [],
            isLocked:
              storedSectionLocks.get(normalizedCode) ?? Boolean(section.isLocked),
          };
        }),
      );
      setClassSections(normalizedRemoteSections);
      return normalizedRemoteSections;
    }

    const storedAssignments =
      readBranchScopedData<SubjectAssignment[]>(
        storageScopes.subjectAssignments,
        currentBranch,
      ) ?? [];
    const findMatchingAssignment = ({
      sectionId,
      sectionCode,
    }: {
      sectionId?: string;
      sectionCode?: string;
    }) =>
      storedAssignments.find(
        (assignment) =>
          (sectionId && assignment.sectionId === sectionId) ||
          normalizeSectionCodeValue(assignment.sectionCode) ===
            normalizeSectionCodeValue(sectionCode),
      );

    const normalizedStoredSections = storedSections
      .map((section) => ({
        ...section,
        code: normalizeSectionCodeValue(section.code) || section.code,
        enrolleeIds: normalizeStringList(section.enrolleeIds),
      }))
      .filter((section) => !isLegacyMockSection(section))
      .map((section) => {
        const existingAssignment = findMatchingAssignment({
          sectionId: section.id,
          sectionCode: section.code,
        });
        const matchingStudentSummary = studentSectionSummaries.get(
          normalizeSectionCodeValue(section.code),
        );
        const resolvedProgram =
          section.program || matchingStudentSummary?.sampleStudent.program || "College";
        const resolvedYearLevel =
          section.yearLevel ||
          matchingStudentSummary?.sampleStudent.yearLevel ||
          (resolvedProgram === "SHS" ? "Grade 11" : "1st Year");
        const resolvedStrand =
          section.strand ||
          matchingStudentSummary?.sampleStudent.strandOrCourse ||
          (resolvedProgram === "College" ? DEFAULT_COLLEGE_COURSE : "All");
        const currentEnrolleeCount = matchingStudentSummary?.count ?? 0;

        return {
          ...section,
          program: resolvedProgram,
          yearLevel: resolvedYearLevel,
          semester: normalizeSectionSemester(
            section.semester || existingAssignment?.semester,
          ),
          strand: resolvedStrand,
          section: normalizeSectionLabel(
            section.section || getSectionLabelFromCode(section.code),
          ),
          currentEnrollees: currentEnrolleeCount,
          maxCapacity: Math.max(
            Number(section.maxCapacity ?? 0),
            currentEnrolleeCount,
            1,
          ),
          enrolleeIds: [],
          isLocked: Boolean(section.isLocked),
        };
      });

    const existingSectionCodes = new Set(
      normalizedStoredSections.map((section) =>
        normalizeSectionCodeValue(section.code),
      ),
    );
    const syncedSections = Array.from(studentSectionSummaries.entries())
      .filter(
        ([sectionCode]) =>
          sectionCode && !existingSectionCodes.has(sectionCode),
      )
      .map(([sectionCode, summary]) => {
        const existingAssignment = findMatchingAssignment({ sectionCode });
        const resolvedProgram = summary.sampleStudent.program;

        return {
          id: `synced_${sectionCode.toLowerCase()}`,
          code: sectionCode,
          program: resolvedProgram,
          yearLevel: summary.sampleStudent.yearLevel,
          semester: normalizeSectionSemester(existingAssignment?.semester),
          strand:
            summary.sampleStudent.strandOrCourse ||
            (resolvedProgram === "College" ? DEFAULT_COLLEGE_COURSE : "All"),
          section: getSectionLabelFromCode(sectionCode),
          currentEnrollees: summary.count,
          maxCapacity: Math.max(30, summary.count),
          enrolleeIds: [],
          isLocked: false,
        };
      });

    const nextSections = sortClassSections([
      ...normalizedStoredSections,
      ...syncedSections,
    ]);
    setClassSections(nextSections);
    return nextSections;
  };

  // Load subjects - Updated with full SHS and College structure (Semester-based for SHS)
  const loadSubjects = async (
    remoteSubjects?: Subject[] | null,
  ): Promise<Subject[]> => {
    if (remoteSubjects && remoteSubjects.length > 0) {
      const normalizedRemoteSubjects = normalizeSubjectCatalog(remoteSubjects);
      setSubjects(normalizedRemoteSubjects);
      return normalizedRemoteSubjects;
    }

    const storedSubjects = readBranchScopedData<Subject[]>(
      storageScopes.subjects,
      currentBranch,
    );

    if (storedSubjects?.length) {
      const normalizedStoredSubjects = normalizeSubjectCatalog(storedSubjects);
      setSubjects(normalizedStoredSubjects);
      return normalizedStoredSubjects;
    }

    const mockSubjects: Subject[] = [
      // ========== SHS - GRADE 11 - 1st Semester ==========
      {
        id: "1",
        code: "MIN101",
        name: "Oral Communication",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "2",
        code: "MIN102",
        name: "Reading and Writing",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "3",
        code: "MIN103",
        name: "Komunikasyon at Pananaliksik",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "4",
        code: "MIN104",
        name: "Earth and Life Science",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "5",
        code: "MIN105",
        name: "Mathematics in the Modern World",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "6",
        code: "MAJ101",
        name: "Computer Systems Servicing",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "ICT",
        isMinor: false,
      },
      {
        id: "7",
        code: "MAJ102",
        name: "Introduction to Humanities",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "GAS",
        isMinor: false,
      },
      {
        id: "8",
        code: "MAJ103",
        name: "Introduction to World Religions",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "HUMSS",
        isMinor: false,
      },
      {
        id: "9",
        code: "MAJ104",
        name: "Fundamentals of Accounting",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "ABM",
        isMinor: false,
      },
      {
        id: "10",
        code: "MAJ105",
        name: "Pre-Calculus",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "STEM",
        isMinor: false,
      },
      // Minor Subjects Grade 11 1st Sem
      {
        id: "11",
        code: "MIN106",
        name: "Physical Education 1",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "12",
        code: "MIN107",
        name: "Health Education",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },

      // ========== SHS - GRADE 11 - 2nd Semester ==========
      {
        id: "13",
        code: "MIN108",
        name: "21st Century Literature",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "14",
        code: "MIN109",
        name: "Contemporary Philippine Arts",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "15",
        code: "MIN110",
        name: "Understanding Culture, Society and Politics",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "16",
        code: "MIN111",
        name: "Physical Science",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "17",
        code: "MIN112",
        name: "Statistics and Probability",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "18",
        code: "MAJ106",
        name: "Programming (Java)",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "ICT",
        isMinor: false,
      },
      {
        id: "19",
        code: "MAJ107",
        name: "Disciplines and Ideas in Social Sciences",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "GAS",
        isMinor: false,
      },
      {
        id: "20",
        code: "MAJ108",
        name: "Creative Writing",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "HUMSS",
        isMinor: false,
      },
      {
        id: "21",
        code: "MAJ109",
        name: "Business Mathematics",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "ABM",
        isMinor: false,
      },
      {
        id: "22",
        code: "MAJ110",
        name: "Basic Calculus",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "STEM",
        isMinor: false,
      },
      // Minor Subjects Grade 11 2nd Sem
      {
        id: "23",
        code: "MIN113",
        name: "Physical Education 2",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "24",
        code: "MIN114",
        name: "Values Education",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },

      // ========== SHS - GRADE 12 - 1st Semester ==========
      {
        id: "25",
        code: "MIN115",
        name: "English for Academic Purposes",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "26",
        code: "MIN116",
        name: "Filipino sa Piling Larangan",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "27",
        code: "MIN117",
        name: "Practical Research 2",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "28",
        code: "MIN118",
        name: "Inquiries and Investigation",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "29",
        code: "MAJ111",
        name: "Database Management",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "ICT",
        isMinor: false,
      },
      {
        id: "30",
        code: "MAJ112",
        name: "Applied Economics",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "GAS",
        isMinor: false,
      },
      {
        id: "31",
        code: "MAJ113",
        name: "Creative Writing/Malikhaing Pagsulat",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "HUMSS",
        isMinor: false,
      },
      {
        id: "32",
        code: "MAJ114",
        name: "Business Ethics",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "ABM",
        isMinor: false,
      },
      {
        id: "33",
        code: "MAJ115",
        name: "General Biology 2",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "STEM",
        isMinor: false,
      },
      // Minor Subjects Grade 12 1st Sem
      {
        id: "34",
        code: "MIN119",
        name: "Physical Education 3",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "35",
        code: "MIN120",
        name: "Career Guidance",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },

      // ========== SHS - GRADE 12 - 2nd Semester ==========
      {
        id: "36",
        code: "MIN121",
        name: "Entrepreneurship",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "37",
        code: "MIN122",
        name: "Research Project",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "38",
        code: "MAJ116",
        name: "System Analysis and Design",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "ICT",
        isMinor: false,
      },
      {
        id: "39",
        code: "MAJ117",
        name: "Community Engagement",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "GAS",
        isMinor: false,
      },
      {
        id: "40",
        code: "MAJ118",
        name: "Social Sciences and Philosophy",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "HUMSS",
        isMinor: false,
      },
      {
        id: "41",
        code: "MAJ119",
        name: "Business Finance",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "ABM",
        isMinor: false,
      },
      {
        id: "42",
        code: "MAJ120",
        name: "General Physics 1",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "STEM",
        isMinor: false,
      },
      {
        id: "43",
        code: "MIN123",
        name: "Work Immersion",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      // Minor Subjects Grade 12 2nd Sem
      {
        id: "44",
        code: "MIN124",
        name: "Physical Education 4",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "45",
        code: "MIN125",
        name: "Community Service",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },

      // ========== COLLEGE - 1st Year ==========
      {
        id: "46",
        code: "MIN126",
        name: "Understanding the Self",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "47",
        code: "MIN127",
        name: "Readings in Philippine History",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "48",
        code: "MIN128",
        name: "Purposive Communication",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "49",
        code: "MIN129",
        name: "Mathematics in the Modern World",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "50",
        code: "MAJ121",
        name: "Introduction to Computing",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "51",
        code: "MAJ122",
        name: "Computer Programming 1",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "52",
        code: "MIN130",
        name: "Physical Education 1",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 2,
        isMinor: true,
      },
      {
        id: "53",
        code: "MIN131",
        name: "NSTP 1",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "54",
        code: "MIN132",
        name: "The Contemporary World",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "55",
        code: "MIN133",
        name: "Ethics",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "56",
        code: "MIN134",
        name: "Art Appreciation",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "57",
        code: "MAJ123",
        name: "Data Structures and Algorithms",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "58",
        code: "MAJ124",
        name: "Object-Oriented Programming",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "59",
        code: "MIN135",
        name: "Physical Education 2",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 2,
        isMinor: true,
      },
      {
        id: "60",
        code: "MIN136",
        name: "NSTP 2",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: true,
      },

      // ========== COLLEGE - 2nd Year ==========
      {
        id: "61",
        code: "MIN137",
        name: "Science, Technology and Society",
        program: "College",
        yearLevel: "2nd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "62",
        code: "MAJ125",
        name: "Database Management System",
        program: "College",
        yearLevel: "2nd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "63",
        code: "MAJ126",
        name: "Web Development",
        program: "College",
        yearLevel: "2nd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "64",
        code: "MAJ127",
        name: "Operating Systems",
        program: "College",
        yearLevel: "2nd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "65",
        code: "MAJ128",
        name: "Discrete Mathematics",
        program: "College",
        yearLevel: "2nd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "66",
        code: "MIN138",
        name: "Physical Education 3",
        program: "College",
        yearLevel: "2nd Year",
        semester: "1st Semester",
        units: 2,
        isMinor: true,
      },
      {
        id: "67",
        code: "MIN139",
        name: "Life and Works of Rizal",
        program: "College",
        yearLevel: "2nd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "68",
        code: "MAJ129",
        name: "Software Engineering",
        program: "College",
        yearLevel: "2nd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "69",
        code: "MAJ130",
        name: "Networking and Communication",
        program: "College",
        yearLevel: "2nd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "70",
        code: "MAJ131",
        name: "Human-Computer Interaction",
        program: "College",
        yearLevel: "2nd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "71",
        code: "MAJ132",
        name: "Information Management",
        program: "College",
        yearLevel: "2nd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "72",
        code: "MIN140",
        name: "Physical Education 4",
        program: "College",
        yearLevel: "2nd Year",
        semester: "2nd Semester",
        units: 2,
        isMinor: true,
      },

      // ========== COLLEGE - 3rd Year ==========
      {
        id: "73",
        code: "MAJ133",
        name: "Advanced Database Systems",
        program: "College",
        yearLevel: "3rd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "74",
        code: "MAJ134",
        name: "Mobile Application Development",
        program: "College",
        yearLevel: "3rd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "75",
        code: "MAJ135",
        name: "System Analysis and Design",
        program: "College",
        yearLevel: "3rd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "76",
        code: "MAJ136",
        name: "Automata Theory",
        program: "College",
        yearLevel: "3rd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "77",
        code: "MIN141",
        name: "Elective 1",
        program: "College",
        yearLevel: "3rd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "78",
        code: "MAJ137",
        name: "Artificial Intelligence",
        program: "College",
        yearLevel: "3rd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "79",
        code: "MAJ138",
        name: "Cloud Computing",
        program: "College",
        yearLevel: "3rd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "80",
        code: "MAJ139",
        name: "Information Assurance",
        program: "College",
        yearLevel: "3rd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "81",
        code: "MAJ140",
        name: "Technopreneurship",
        program: "College",
        yearLevel: "3rd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "82",
        code: "MIN142",
        name: "Elective 2",
        program: "College",
        yearLevel: "3rd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: true,
      },

      // ========== COLLEGE - 4th Year ==========
      {
        id: "83",
        code: "MAJ141",
        name: "Capstone Project 1",
        program: "College",
        yearLevel: "4th Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "84",
        code: "MAJ142",
        name: "Data Analytics",
        program: "College",
        yearLevel: "4th Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "85",
        code: "MAJ143",
        name: "IT Project Management",
        program: "College",
        yearLevel: "4th Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "86",
        code: "MAJ144",
        name: "Emerging Technologies",
        program: "College",
        yearLevel: "4th Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "87",
        code: "MIN143",
        name: "Elective 3",
        program: "College",
        yearLevel: "4th Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "88",
        code: "MAJ145",
        name: "Capstone Project 2",
        program: "College",
        yearLevel: "4th Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "89",
        code: "MAJ146",
        name: "Internship/Practicum",
        program: "College",
        yearLevel: "4th Year",
        semester: "2nd Semester",
        units: 6,
        isMinor: false,
      },
      {
        id: "90",
        code: "MAJ147",
        name: "Professional Ethics",
        program: "College",
        yearLevel: "4th Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
    ];
    const normalizedMockSubjects = normalizeSubjectCatalog(mockSubjects);
    setSubjects(normalizedMockSubjects);
    return normalizedMockSubjects;
  };

  // Load instructors with updated names
  const loadInstructors = async (
    remoteInstructors?: Instructor[] | null,
  ): Promise<Instructor[]> => {
    if (remoteInstructors && remoteInstructors.length > 0) {
      setInstructors(remoteInstructors);
      return remoteInstructors;
    }

    const storedInstructors = readBranchScopedData<Instructor[]>(
      storageScopes.instructors,
      currentBranch,
    );

    if (storedInstructors?.length) {
      setInstructors(storedInstructors);
      return storedInstructors;
    }

    const mockInstructors: Instructor[] = [
      {
        id: "1",
        name: "Kenneth Lyle Sohot",
        employeeId: "TCH001",
        department: "Computer Science",
        email: "kenneth.sohot@university.edu",
        contactNumber: "09123456789",
      },
      {
        id: "2",
        name: "Neil John Velasco",
        employeeId: "TCH002",
        department: "Mathematics",
        email: "neil.velasco@university.edu",
        contactNumber: "09123456790",
      },
      {
        id: "3",
        name: "Hener Verdida",
        employeeId: "TCH003",
        department: "English",
        email: "hener.verdida@university.edu",
        contactNumber: "09123456791",
      },
      {
        id: "4",
        name: "Queenie Mier Senantes",
        employeeId: "TCH004",
        department: "Humanities",
        email: "queenie.senantes@university.edu",
        contactNumber: "09123456792",
      },
      {
        id: "5",
        name: "Dean Paul Quioyo",
        employeeId: "TCH005",
        department: "Physics",
        email: "dean.quioyo@university.edu",
        contactNumber: "09123456793",
      },
      {
        id: "6",
        name: "Don Rich Ulanday",
        employeeId: "TCH006",
        department: "Physical Education",
        email: "don.ulanday@university.edu",
        contactNumber: "09123456794",
      },
      {
        id: "7",
        name: "Mark Kervin Toledo",
        employeeId: "TCH007",
        department: "Information Technology",
        email: "mark.toledo@university.edu",
        contactNumber: "09123456795",
      },
      {
        id: "8",
        name: "Elijah Bulotano",
        employeeId: "TCH008",
        department: "Social Sciences",
        email: "elijah.bulotano@university.edu",
        contactNumber: "09123456796",
      },
      {
        id: "9",
        name: "Christian Dave Vargas",
        employeeId: "TCH009",
        department: "Business",
        email: "christian.vargas@university.edu",
        contactNumber: "09123456797",
      },
      {
        id: "10",
        name: "Jay Iverson Dela Cruz",
        employeeId: "TCH010",
        department: "Arts",
        email: "jay.delacruz@university.edu",
        contactNumber: "09123456798",
      },
      {
        id: "11",
        name: "Gilbert Torres",
        employeeId: "TCH011",
        department: "Research",
        email: "gilbert.torres@university.edu",
        contactNumber: "09123456799",
      },
    ];
    setInstructors(mockInstructors);
    return mockInstructors;
  };

  const instructorDepartmentOptions = getUniqueTrimmedValues([
    ...instructorDepartments,
    ...instructors.map((instructor) => instructor.department),
  ]);

  const handleCreateDepartmentOption = () => {
    const trimmedDepartmentName = newDepartmentName.trim();

    if (!trimmedDepartmentName) {
      addToast("Enter a department name first.", "warning");
      return;
    }

    const matchingDepartment = instructorDepartmentOptions.find(
      (department) =>
        department.toLowerCase() === trimmedDepartmentName.toLowerCase(),
    );

    if (matchingDepartment) {
      setInstructorForm((prev) => ({
        ...prev,
        department: matchingDepartment,
      }));
      setNewDepartmentName("");
      addToast(`${matchingDepartment} is already in the department list.`, "info");
      return;
    }

    setInstructorDepartments((prev) =>
      getUniqueTrimmedValues([...prev, trimmedDepartmentName]),
    );
    setInstructorForm((prev) => ({
      ...prev,
      department: trimmedDepartmentName,
    }));
    setNewDepartmentName("");
    addToast(`${trimmedDepartmentName} added to departments.`, "success");
  };

  const handleDeleteDepartmentOption = (departmentName: string) => {
    const departmentInUse = instructors.some(
      (instructor) =>
        instructor.department.trim().toLowerCase() ===
        departmentName.trim().toLowerCase(),
    );

    if (departmentInUse) {
      addToast("This department is still used by an instructor.", "warning");
      return;
    }

    setPendingAcademicOptionDelete({
      kind: "department",
      names: [departmentName],
      message: `Delete department "${departmentName}"?`,
    });
  };

  const deleteDepartmentOptions = (departmentNames: string[]) => {
    setInstructorDepartments((prev) =>
      prev.filter(
        (department) =>
          !departmentNames.some(
            (departmentName) =>
              department.trim().toLowerCase() ===
              departmentName.trim().toLowerCase(),
          ),
      ),
    );
    if (
      departmentNames.some(
        (departmentName) =>
          instructorForm.department.trim().toLowerCase() ===
          departmentName.trim().toLowerCase(),
      )
    ) {
      setInstructorForm((prev) => ({ ...prev, department: "" }));
    }
    setSelectedDepartmentNames((prev) =>
      prev.filter((department) => !departmentNames.includes(department)),
    );
    addToast(
      `Deleted ${departmentNames.length} department${
        departmentNames.length === 1 ? "" : "s"
      }.`,
      "success",
    );
  };

  const toggleDepartmentSelection = (departmentName: string) => {
    setSelectedDepartmentNames((prev) =>
      prev.includes(departmentName)
        ? prev.filter((item) => item !== departmentName)
        : [...prev, departmentName],
    );
  };

  const handleDeleteSelectedDepartments = () => {
    if (selectedDepartmentNames.length === 0) {
      addToast("Select departments to delete first.", "warning");
      return;
    }

    const usedDepartments = selectedDepartmentNames.filter((departmentName) =>
      instructors.some(
        (instructor) =>
          instructor.department.trim().toLowerCase() ===
          departmentName.trim().toLowerCase(),
      ),
    );
    const removableDepartments = selectedDepartmentNames.filter(
      (departmentName) => !usedDepartments.includes(departmentName),
    );

    if (removableDepartments.length === 0) {
      addToast("Selected departments are still used by instructors.", "warning");
      return;
    }

    setPendingAcademicOptionDelete({
      kind: "department",
      names: removableDepartments,
      message: `Delete ${removableDepartments.length} selected department${
        removableDepartments.length === 1 ? "" : "s"
      }?`,
    });

    if (usedDepartments.length > 0) {
      addToast("Some selected departments are still in use.", "warning");
    }
  };

  const closeInstructorModal = () => {
    setShowInstructorModal(false);
    setEditingInstructor(null);
    setInstructorForm(createDefaultInstructorForm());
  };

  const openCreateInstructorModal = () => {
    setEditingInstructor(null);
    setInstructorForm(createDefaultInstructorForm());
    setShowInstructorModal(true);
  };

  const openEditInstructorModal = (instructor: Instructor) => {
    setEditingInstructor(instructor);
    setInstructorForm({
      name: instructor.name,
      employeeId: instructor.employeeId,
      department: instructor.department,
      email: instructor.email || "",
      contactNumber: instructor.contactNumber || "",
    });
    setShowInstructorModal(true);
  };

  const handleSaveInstructor = async () => {
    const nextName = instructorForm.name.trim();
    const nextEmployeeId = instructorForm.employeeId.trim().toUpperCase();
    const nextDepartment = instructorForm.department.trim();

    if (!nextName || !nextEmployeeId || !nextDepartment) {
      addToast("Instructor name, employee ID, and department are required.", "warning");
      return;
    }

    if (
      instructors.some(
        (instructor) =>
          instructor.id !== editingInstructor?.id &&
          instructor.employeeId.trim().toLowerCase() ===
            nextEmployeeId.toLowerCase(),
      )
    ) {
      addToast("Instructor employee IDs must stay unique.", "warning");
      return;
    }

    const nextInstructor: Instructor = {
      id:
        editingInstructor?.id ||
        `instructor_${Date.now()}_${nextEmployeeId.toLowerCase()}`,
      name: nextName,
      employeeId: nextEmployeeId,
      department: nextDepartment,
      email: instructorForm.email.trim() || undefined,
      contactNumber: instructorForm.contactNumber.trim() || undefined,
    };

    try {
      const savedInstructor = await saveAcademicInstructor(
        currentBranch,
        nextInstructor,
      );
      let temporaryPassword = "";

      if (!editingInstructor) {
        temporaryPassword = await resetInstructorTemporaryPassword({
          branch: currentBranch,
          employeeId: savedInstructor.employeeId,
        });
      }

      setInstructors((prev) =>
        editingInstructor
          ? prev.map((instructor) =>
              instructor.id === editingInstructor.id ? savedInstructor : instructor,
            )
          : [...prev, savedInstructor],
      );

      addToast(
        editingInstructor
          ? `${savedInstructor.name} updated successfully.`
          : `${savedInstructor.name} added. Temporary password: ${temporaryPassword}`,
        "success",
      );
      closeInstructorModal();
    } catch (error) {
      console.error("Failed to save shared instructor", error);
      addToast(
        error instanceof Error
          ? error.message
          : "Unable to save the instructor to shared academic data.",
        "error",
      );
    }
  };

  const handleDeleteInstructor = async (instructor: Instructor) => {
    const confirmed = window.confirm(
      `Delete ${instructor.name}? Existing assignments will keep their schedule but lose the linked instructor reference.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteAcademicInstructor(currentBranch, instructor.id);

      setInstructors((prev) =>
        prev.filter((item) => item.id !== instructor.id),
      );
      setSubjectAssignments((prev) =>
        prev.map((assignment) =>
          assignment.instructorId === instructor.id
            ? {
                ...assignment,
                instructorId: "",
                instructorName: "To be assigned",
              }
            : assignment,
        ),
      );

      if (editingInstructor?.id === instructor.id) {
        closeInstructorModal();
      }

      addToast(`${instructor.name} deleted.`, "success");
    } catch (error) {
      console.error("Failed to delete shared instructor", error);
      addToast(
        error instanceof Error
          ? error.message
          : "Unable to delete the instructor from shared academic data.",
        "error",
      );
    }
  };

  const handleResetInstructorPassword = async () => {
    if (!editingInstructor) {
      return;
    }

    const confirmed = window.confirm(
      `Generate a new temporary password for ${editingInstructor.name}?\n\nThey will be asked to change it after signing in.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const temporaryPassword = await resetInstructorTemporaryPassword({
        branch: currentBranch,
        employeeId: editingInstructor.employeeId,
      });
      addToast(
        `${editingInstructor.name}'s new temporary password is ${temporaryPassword}.`,
        "success",
      );
    } catch (error) {
      console.error("Failed to reset instructor password", error);
      addToast(
        error instanceof Error
          ? error.message
          : "Unable to reset the instructor password.",
        "error",
      );
    }
  };

  // Load subject assignments
  const loadSubjectAssignments = async (
    remoteAssignments?: SubjectAssignment[] | null,
  ): Promise<SubjectAssignment[]> => {
    if (remoteAssignments && remoteAssignments.length > 0) {
      const normalizedRemoteAssignments = remoteAssignments.map((assignment) => ({
        ...assignment,
        semester: normalizeSectionSemester(assignment.semester),
      }));
      setSubjectAssignments(normalizedRemoteAssignments);
      return normalizedRemoteAssignments;
    }

    const storedAssignments = readBranchScopedData<SubjectAssignment[]>(
      storageScopes.subjectAssignments,
      currentBranch,
    );

    if (storedAssignments?.length) {
      const normalizedStoredAssignments = storedAssignments.map((assignment) => ({
        ...assignment,
        semester: normalizeSectionSemester(assignment.semester),
      }));
      setSubjectAssignments(normalizedStoredAssignments);
      return normalizedStoredAssignments;
    }

    const mockAssignments: SubjectAssignment[] = [
      {
        id: "1",
        subjectId: "1",
        subjectCode: "MIN101",
        subjectName: "Oral Communication",
        instructorId: "1",
        instructorName: "Kenneth Lyle Sohot",
        sectionId: "1",
        sectionCode: "IC1DA",
        schedule: [
          {
            day: "Monday",
            startTime: "08:00",
            endTime: "10:00",
            room: "RM101",
          },
          {
            day: "Wednesday",
            startTime: "08:00",
            endTime: "10:00",
            room: "RM101",
          },
        ],
        academicYear: "2026-2027",
        semester: "1st Semester",
      },
      {
        id: "2",
        subjectId: "6",
        subjectCode: "MAJ101",
        subjectName: "Computer Systems Servicing",
        instructorId: "7",
        instructorName: "Mark Kervin Toledo",
        sectionId: "1",
        sectionCode: "IC1DA",
        schedule: [
          {
            day: "Tuesday",
            startTime: "10:00",
            endTime: "12:00",
            room: "RM205",
          },
          {
            day: "Thursday",
            startTime: "10:00",
            endTime: "12:00",
            room: "RM205",
          },
        ],
        academicYear: "2026-2027",
        semester: "1st Semester",
      },
    ];
    setSubjectAssignments(mockAssignments);
    return mockAssignments;
  };

  const getSubjectFormPrerequisiteOptions = (
    draft: SubjectFormState,
    currentSubjectId = editingSubject?.id || "",
  ) => {
    const targetSubject: Subject = {
      id: currentSubjectId,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      program: draft.program,
      yearLevel: draft.yearLevel,
      semester: normalizeSectionSemester(draft.semester),
      strand: draft.program === "College" ? DEFAULT_COLLEGE_COURSE : draft.strand,
      subjectType: normalizeSubjectTypeForProgram({
        program: draft.program,
        type: draft.type,
        strand: draft.strand,
      }),
      isMinor: draft.program === "College" ? draft.type === "minor" : undefined,
      prerequisiteSubjectIds: draft.prerequisiteSubjectIds,
    };

    return subjects
      .filter((subject) =>
        subjectCanBePrerequisiteForContext(subject, targetSubject),
      )
      .sort(compareSubjectSequence);
  };

  const sanitizeSubjectForm = (
    draft: SubjectFormState,
    currentSubjectId = editingSubject?.id || "",
  ): SubjectFormState => {
    const program = draft.program === "SHS" ? "SHS" : "College";
    const yearLevelOptions = getProgramYearLevelOptions(program);
    const normalizedYearLevel = yearLevelOptions.includes(draft.yearLevel)
      ? draft.yearLevel
      : yearLevelOptions[0];
    const normalizedSemester = normalizeSectionSemester(draft.semester);
    const normalizedStrand =
      program === "College" ? DEFAULT_COLLEGE_COURSE : draft.strand || "All";
    const prerequisiteOptions = new Set(
      getSubjectFormPrerequisiteOptions(
        {
          ...draft,
          program,
          yearLevel: normalizedYearLevel,
          semester: normalizedSemester,
          strand: normalizedStrand,
        },
        currentSubjectId,
      ).map((subject) => subject.id),
    );

    return {
      ...draft,
      program,
      yearLevel: normalizedYearLevel,
      semester: normalizedSemester,
      strand: normalizedStrand,
      type: normalizeSubjectTypeForProgram({
        program,
        type: draft.type,
        strand: normalizedStrand,
      }),
      prerequisiteSubjectIds: normalizeStringList(
        draft.prerequisiteSubjectIds,
      ).filter((subjectId) => prerequisiteOptions.has(subjectId)),
    };
  };

  const closeSubjectModal = () => {
    setShowSubjectModal(false);
    setEditingSubject(null);
    setSubjectForm(createDefaultSubjectForm());
  };

  const openCreateSubjectModal = () => {
    setEditingSubject(null);
    setSubjectForm(createDefaultSubjectForm());
    setShowSubjectModal(true);
  };

  const openEditSubjectModal = (subject: Subject) => {
    setEditingSubject(subject);
    setSubjectForm(
      sanitizeSubjectForm({
        code: subject.code,
        name: subject.name,
        program: subject.program === "SHS" ? "SHS" : "College",
        yearLevel: subject.yearLevel,
        semester: normalizeSectionSemester(subject.semester),
        units:
          typeof subject.units === "number" && Number.isFinite(subject.units)
            ? String(subject.units)
            : "3",
        strand:
          subject.program === "College"
            ? DEFAULT_COLLEGE_COURSE
            : subject.strand || "All",
        type: getResolvedSubjectType(subject),
        prerequisiteSubjectIds: normalizeStringList(
          subject.prerequisiteSubjectIds,
        ),
      }, subject.id),
    );
    setShowSubjectModal(true);
  };

  const updateSubjectForm = (updates: Partial<SubjectFormState>) => {
    setSubjectForm((prev) => sanitizeSubjectForm({ ...prev, ...updates }));
  };

  const toggleSubjectPrerequisite = (subjectId: string) => {
    setSubjectForm((prev) =>
      sanitizeSubjectForm({
        ...prev,
        prerequisiteSubjectIds: prev.prerequisiteSubjectIds.includes(subjectId)
          ? prev.prerequisiteSubjectIds.filter((value) => value !== subjectId)
          : [...prev.prerequisiteSubjectIds, subjectId],
      }),
    );
  };

  const handleSaveSubject = async () => {
    const normalizedCode = subjectForm.code.trim().toUpperCase();
    const normalizedName = subjectForm.name.trim();
    const normalizedSemester = normalizeSectionSemester(subjectForm.semester);

    if (!normalizedCode || !normalizedName) {
      addToast("Subject code and title are required.", "warning");
      return;
    }

    if (
      subjects.some(
        (subject) =>
          subject.id !== editingSubject?.id &&
          subject.code.trim().toLowerCase() === normalizedCode.toLowerCase(),
      )
    ) {
      addToast("Subject codes must stay unique within the branch catalog.", "warning");
      return;
    }

    const parsedUnits = Number.parseInt(subjectForm.units, 10);
    if (subjectForm.program === "College" && (!Number.isFinite(parsedUnits) || parsedUnits <= 0)) {
      addToast("College subjects need a valid unit count.", "warning");
      return;
    }

    const nextSubject: Subject = {
      subjectType: normalizeSubjectTypeForProgram({
        program: subjectForm.program,
        type: subjectForm.type,
        strand:
          subjectForm.program === "College"
            ? DEFAULT_COLLEGE_COURSE
            : subjectForm.strand || "All",
      }),
      id:
        editingSubject?.id ||
        `subject_${Date.now()}_${normalizedCode.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      code: normalizedCode,
      name: normalizedName,
      units: subjectForm.program === "College" ? parsedUnits : undefined,
      program: subjectForm.program,
      yearLevel: subjectForm.yearLevel,
      semester: normalizedSemester,
      strand:
        subjectForm.program === "College"
          ? DEFAULT_COLLEGE_COURSE
          : subjectForm.strand || "All",
      isMinor:
        subjectForm.program === "College"
          ? subjectForm.type === "minor"
          : undefined,
      prerequisiteSubjectIds: normalizeStringList(
        subjectForm.prerequisiteSubjectIds,
      ),
    };

    try {
      const savedSubject = await saveAcademicSubject(currentBranch, nextSubject);

      setSubjects((prev) =>
        normalizeSubjectCatalog(
          editingSubject
            ? prev.map((subject) =>
                subject.id === editingSubject.id ? savedSubject : subject,
              )
            : [...prev, savedSubject],
        ),
      );

      addToast(
        editingSubject
          ? `${savedSubject.code} updated successfully.`
          : `${savedSubject.code} added to the subject catalog.`,
        "success",
      );
      closeSubjectModal();
    } catch (error) {
      console.error("Failed to save shared academic subject", error);
      addToast(
        error instanceof Error
          ? error.message
          : "Unable to save the subject to the shared catalog.",
        "error",
      );
    }
  };

  const handleDeleteSubject = async (subject: Subject) => {
    const confirmed = window.confirm(
      `Delete ${subject.code} - ${subject.name}? This will also remove its prerequisite links and any local schedule assignments using it.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteAcademicSubject(currentBranch, subject.id);

      const removedAssignmentCount = subjectAssignments.filter(
        (assignment) => assignment.subjectId === subject.id,
      ).length;

      setSubjects((prev) =>
        normalizeSubjectCatalog(
          prev
            .filter((item) => item.id !== subject.id)
            .map((item) => ({
              ...item,
              prerequisiteSubjectIds: normalizeStringList(
                item.prerequisiteSubjectIds,
              ).filter((subjectId) => subjectId !== subject.id),
            })),
        ),
      );
      setSubjectAssignments((prev) =>
        prev.filter((assignment) => assignment.subjectId !== subject.id),
      );
      const nextStudentSubjectPlans = Object.fromEntries(
        Object.entries(studentSubjectPlans).map(([key, plan]) => [
          key,
          {
            ...plan,
            assignedSubjects: plan.assignedSubjects.filter(
              (item) => item.subjectId !== subject.id,
            ),
            creditedSubjects: plan.creditedSubjects.filter(
              (item) => item.subjectId !== subject.id,
            ),
            scheduledAssignments: plan.scheduledAssignments?.filter(
              (assignment) => assignment.subjectId !== subject.id,
            ),
            updatedAt: new Date().toISOString(),
          },
        ]),
      );
      setStudentSubjectPlans(nextStudentSubjectPlans);
      void Promise.all(
        Object.values(nextStudentSubjectPlans).map((plan) =>
          saveStudentSubjectPlan(currentBranch, plan),
        ),
      ).catch((error) => {
        console.error("Failed to sync updated student subject plans", error);
      });
      setTransfereeEvaluations((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([key, evaluation]) => [
            key,
            {
              ...evaluation,
              creditedSubjectIds: evaluation.creditedSubjectIds.filter(
                (subjectId) => subjectId !== subject.id,
              ),
              assignedSubjectIds: evaluation.assignedSubjectIds.filter(
                (subjectId) => subjectId !== subject.id,
              ),
              updatedAt: new Date().toISOString(),
            },
          ]),
        ),
      );

      if (editingSubject?.id === subject.id) {
        closeSubjectModal();
      }

      addToast(
        removedAssignmentCount > 0
          ? `${subject.code} deleted and ${removedAssignmentCount} related assignment${removedAssignmentCount === 1 ? "" : "s"} removed.`
          : `${subject.code} deleted from the catalog.`,
        "success",
      );
    } catch (error) {
      console.error("Failed to delete shared academic subject", error);
      addToast(
        error instanceof Error
          ? error.message
          : "Unable to delete the subject from the shared catalog.",
        "error",
      );
    }
  };

  const getEligibleSubjectsForSection = (
    sectionId: string,
    semester: string,
    assignmentIdToIgnore?: string,
  ) => {
    const section = classSections.find((item) => item.id === sectionId);
    const normalizedSemester = normalizeSectionSemester(semester);

    if (!section) {
      return [];
    }

    const takenSubjectIds = new Set(
      subjectAssignments
        .filter(
          (assignment) =>
            assignment.sectionId === sectionId &&
            normalizeSectionSemester(assignment.semester) === normalizedSemester &&
            assignment.id !== assignmentIdToIgnore,
        )
        .map((assignment) => assignment.subjectId),
    );

    return subjects.filter(
      (subject) =>
        subject.program === section.program &&
        subject.yearLevel === section.yearLevel &&
        normalizeSectionSemester(subject.semester) === normalizedSemester &&
        matchesAcademicDescriptor(
          resolveSubjectStrandOrCourse(subject),
          section.strand,
        ) &&
        !takenSubjectIds.has(subject.id),
    );
  };

  const getSectionSemester = (sectionId: string) =>
    normalizeSectionSemester(
      classSections.find((item) => item.id === sectionId)?.semester,
    );

  const buildAssignmentFormFromAssignment = (
    assignment: SubjectAssignment,
  ): AssignmentFormState => {
    return {
      sectionId: assignment.sectionId,
      instructorId: assignment.instructorId,
      subjectIds: [assignment.subjectId],
      academicYear: assignment.academicYear,
      semester: normalizeSectionSemester(assignment.semester),
      schedule: assignment.schedule,
      scheduleDay: "",
      startTime: "",
      endTime: "",
      room: "",
    };
  };

  const assignmentRoomOptions = getUniqueTrimmedValues([
    ...DEFAULT_ASSIGNMENT_ROOMS,
    ...customAssignmentRooms,
    ...subjectAssignments.flatMap((assignment) =>
      assignment.schedule.map((slot) => slot.room),
    ),
    ...assignmentForm.schedule.map((slot) => slot.room),
    assignmentForm.room,
  ]);

  const resetRoomCreator = () => {
    setNewRoomName("");
  };

  const clearAssignmentScheduleDraft = () => {
    setAssignmentForm((prev) => ({
      ...prev,
      scheduleDay: "",
      startTime: "",
      endTime: "",
      room: "",
    }));
    setShowScheduleDraftFields(false);
    resetRoomCreator();
  };

  const closeAssignmentModal = () => {
    setShowAssignmentModal(false);
    setEditingAssignment(null);
    resetRoomCreator();
    setShowScheduleDraftFields(false);
    setAssignmentForm(createDefaultAssignmentForm());
  };

  const openCreateAssignmentModal = (sectionId = "") => {
    const resolvedSectionId = sectionId || classSections[0]?.id || "";
    const resolvedSemester = getSectionSemester(resolvedSectionId);
    setEditingAssignment(null);
    setAssignmentForm(
      createDefaultAssignmentForm(
        resolvedSectionId,
        resolvedSemester,
        reflectedAcademicYear,
      ),
    );
    setShowScheduleDraftFields(false);
    setShowAssignmentModal(true);
  };

  const openEditAssignmentModal = (assignment: SubjectAssignment) => {
    const nextForm = buildAssignmentFormFromAssignment(assignment);
    const availableSubjects = getEligibleSubjectsForSection(
      nextForm.sectionId,
      nextForm.semester,
      assignment.id,
    );
    const selectedSubjectId = availableSubjects.some(
      (subject) => subject.id === assignment.subjectId,
    )
      ? assignment.subjectId
      : availableSubjects[0]?.id;

    setEditingAssignment(assignment);
    setAssignmentForm({
      ...nextForm,
      subjectIds: selectedSubjectId ? [selectedSubjectId] : [],
    });
    setShowScheduleDraftFields(false);
    setShowAssignmentModal(true);
  };

  const updateAssignmentFormContext = (
    field: "sectionId" | "semester",
    value: string,
  ) => {
    setAssignmentForm((prev) => {
      const nextForm =
        field === "sectionId"
          ? {
              ...prev,
              sectionId: value,
              semester: getSectionSemester(value),
            }
          : { ...prev, semester: normalizeSectionSemester(value) };
      const availableSubjects = getEligibleSubjectsForSection(
        nextForm.sectionId,
        nextForm.semester,
        editingAssignment?.id,
      );
      const availableSubjectIds = new Set(
        availableSubjects.map((subject) => subject.id),
      );
      const filteredSubjectIds = prev.subjectIds.filter((subjectId) =>
        availableSubjectIds.has(subjectId),
      );

      if (editingAssignment) {
        return {
          ...nextForm,
          subjectIds:
            filteredSubjectIds.length > 0
              ? [filteredSubjectIds[0]]
              : availableSubjects[0]
                ? [availableSubjects[0].id]
                : [],
        };
      }

      return {
        ...nextForm,
        subjectIds: filteredSubjectIds.length > 0 ? [filteredSubjectIds[0]] : [],
      };
    });
  };

  const toggleAssignmentSubjectSelection = (subjectId: string) => {
    setAssignmentForm((prev) => {
      return {
        ...prev,
        subjectIds: prev.subjectIds[0] === subjectId ? [] : [subjectId],
      };
    });
  };

  const clearAssignmentSubjects = () => {
    setAssignmentForm((prev) => ({
      ...prev,
      subjectIds: [],
    }));
  };

  const updateAssignmentScheduleSlot = (
    slotIndex: number,
    field: keyof Schedule,
    value: string,
  ) => {
    setAssignmentForm((prev) => ({
      ...prev,
      schedule: prev.schedule.map((slot, index) =>
        index === slotIndex ? { ...slot, [field]: value } : slot,
      ),
    }));
  };

  const removeAssignmentScheduleSlot = (slotIndex: number) => {
    setAssignmentForm((prev) => ({
      ...prev,
      schedule: prev.schedule.filter((_slot, index) => index !== slotIndex),
    }));
  };

  const hasPartialScheduleSlot = (slot: Partial<Schedule>) =>
    Boolean(slot.day || slot.startTime || slot.endTime || slot.room) &&
    !(slot.day && slot.startTime && slot.endTime);

  const addAssignmentScheduleSlot = () => {
    if (!showScheduleDraftFields) {
      setShowScheduleDraftFields(true);
      return;
    }

    const draftSlot = {
      day: assignmentForm.scheduleDay,
      startTime: assignmentForm.startTime,
      endTime: assignmentForm.endTime,
      room: assignmentForm.room.trim() || "TBA",
    };

    if (hasPartialScheduleSlot(draftSlot)) {
      addToast("Choose a day, start time, and end time before adding this schedule.", "warning");
      return;
    }

    if (!draftSlot.day || !draftSlot.startTime || !draftSlot.endTime) {
      addToast("Fill in the schedule fields before adding a day.", "warning");
      return;
    }

    setAssignmentForm((prev) => ({
      ...prev,
      schedule: [...prev.schedule, draftSlot],
      scheduleDay: "",
      startTime: "",
      endTime: "",
      room: "",
    }));
    setShowScheduleDraftFields(false);
    resetRoomCreator();
  };

  const buildAssignmentScheduleFromForm = () => {
    const schedule = assignmentForm.schedule.map((slot) => ({
      ...slot,
      room: slot.room.trim() || "TBA",
    }));
    if (!showScheduleDraftFields) {
      return schedule;
    }

    const draftSlot = {
      day: assignmentForm.scheduleDay,
      startTime: assignmentForm.startTime,
      endTime: assignmentForm.endTime,
      room: assignmentForm.room.trim() || "TBA",
    };

    if (schedule.some(hasPartialScheduleSlot) || hasPartialScheduleSlot(draftSlot)) {
      return null;
    }

    if (draftSlot.day && draftSlot.startTime && draftSlot.endTime) {
      return [...schedule, draftSlot];
    }

    return schedule;
  };

  const toggleAssignmentSelection = (assignmentId: string) => {
    setSelectedAssignmentIds((prev) =>
      prev.includes(assignmentId)
        ? prev.filter((id) => id !== assignmentId)
        : [...prev, assignmentId],
    );
  };

  const toggleSectionAssignmentSelection = (sectionCode: string) => {
    const sectionAssignmentIds = filteredAssignments
      .filter((assignment) => assignment.sectionCode === sectionCode)
      .map((assignment) => assignment.id);

    if (sectionAssignmentIds.length === 0) {
      return;
    }

    setSelectedAssignmentIds((prev) => {
      const allSelected = sectionAssignmentIds.every((id) => prev.includes(id));

      if (allSelected) {
        return prev.filter((id) => !sectionAssignmentIds.includes(id));
      }

      return Array.from(new Set([...prev, ...sectionAssignmentIds]));
    });
  };

  const selectVisibleAssignments = () => {
    setSelectedAssignmentIds(
      filteredAssignments.map((assignment) => assignment.id),
    );
  };

  const clearAssignmentSelection = () => {
    setSelectedAssignmentIds([]);
  };

  const toggleVisibleAssignmentSelection = () => {
    if (selectedAssignmentIds.length > 0) {
      clearAssignmentSelection();
      return;
    }

    selectVisibleAssignments();
  };

  const closeAssignmentDeleteModal = () => {
    setShowAssignmentDeleteModal(false);
    setPendingAssignmentDeleteIds([]);
  };

  const openAssignmentDeleteModal = (assignmentIds: string[]) => {
    if (assignmentIds.length === 0) {
      addToast("Select at least one assignment to delete.", "warning");
      return;
    }

    setPendingAssignmentDeleteIds(Array.from(new Set(assignmentIds)));
    setShowAssignmentDeleteModal(true);
  };

  const handleSaveAssignment = async () => {
    const selectedSubjects = subjects.filter((subject) =>
      assignmentForm.subjectIds.includes(subject.id),
    );
    const section = classSections.find(
      (item) => item.id === assignmentForm.sectionId,
    );
    const instructor = instructors.find(
      (item) => item.id === assignmentForm.instructorId,
    );

    if (!section) {
      addToast("Please select a section first.", "warning");
      return;
    }

    if (selectedSubjects.length === 0) {
      addToast("Select one subject to assign.", "warning");
      return;
    }

    if (selectedSubjects.length !== 1) {
      addToast("Only one subject can be assigned at a time.", "warning");
      return;
    }

    const schedule = buildAssignmentScheduleFromForm();

    if (!schedule) {
      addToast(
        "Every schedule row needs a day, start time, and end time.",
        "warning",
      );
      return;
    }

    const scheduleRooms = getUniqueTrimmedValues(
      schedule
        .map((slot) => slot.room)
        .filter((room) => room.trim() && room.trim() !== "TBA"),
    );

    if (scheduleRooms.length > 0) {
      const roomSaveResults = await Promise.allSettled(
        scheduleRooms.map((room) => saveAcademicAssignmentRoom(currentBranch, room)),
      );
      const savedRooms = roomSaveResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );

      setCustomAssignmentRooms((prev) =>
        getUniqueTrimmedValues([...prev, ...savedRooms]),
      );

      if (roomSaveResults.some((result) => result.status === "rejected")) {
        console.warn(
          "Some assignment rooms could not be synced to Supabase.",
          roomSaveResults,
        );
      }
    }

    if (editingAssignment) {
      const subject = selectedSubjects[0];
      const nextAssignment: SubjectAssignment = {
        ...editingAssignment,
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
        instructorId: instructor?.id || "",
        instructorName: instructor?.name || "To be assigned",
        sectionId: section.id,
        sectionCode: section.code,
        academicYear: assignmentForm.academicYear.trim() || "2026-2027",
        semester: normalizeSectionSemester(assignmentForm.semester),
        schedule,
      };

      try {
        const savedAssignment = await saveAcademicSubjectAssignment(
          currentBranch,
          nextAssignment,
        );

        setSubjectAssignments((prev) =>
          prev.map((assignment) =>
            assignment.id === editingAssignment.id ? savedAssignment : assignment,
          ),
        );

        addToast("Assignment updated successfully.", "success");
        closeAssignmentModal();
      } catch (error) {
        console.error("Failed to save shared subject assignment", error);
        addToast(
          error instanceof Error
            ? error.message
            : "Unable to save the shared class assignment.",
          "error",
        );
      }
      return;
    }

    const subject = selectedSubjects[0];
    const newAssignment: SubjectAssignment = {
      id: `assignment_${Date.now()}_${subject.id}`,
      subjectId: subject.id,
      subjectCode: subject.code,
      subjectName: subject.name,
      instructorId: instructor?.id || "",
      instructorName: instructor?.name || "To be assigned",
      sectionId: section.id,
      sectionCode: section.code,
      schedule,
      academicYear: assignmentForm.academicYear.trim() || "2026-2027",
      semester: normalizeSectionSemester(assignmentForm.semester),
    };

    try {
      const savedAssignment = await saveAcademicSubjectAssignment(
        currentBranch,
        newAssignment,
      );

      setSubjectAssignments((prev) => [...prev, savedAssignment]);
      addToast(`${savedAssignment.subjectCode} assigned to ${section.code}.`, "success");
      closeAssignmentModal();
    } catch (error) {
      console.error("Failed to create shared subject assignments", error);
      addToast(
        error instanceof Error
          ? error.message
          : "Unable to save the shared class assignments.",
        "error",
      );
    }
  };

  const handleCreateRoomOption = async () => {
    const trimmedRoomName = newRoomName.trim();

    if (!trimmedRoomName) {
      addToast("Enter a room name first.", "warning");
      return;
    }

    const matchingRoom = assignmentRoomOptions.find(
      (room) => room.toLowerCase() === trimmedRoomName.toLowerCase(),
    );

    if (matchingRoom) {
      resetRoomCreator();
      addToast(`${matchingRoom} is already in the room list.`, "info");
      return;
    }

    try {
      const savedRoomName = await saveAcademicAssignmentRoom(
        currentBranch,
        trimmedRoomName,
      );
      setCustomAssignmentRooms((prev) =>
        getUniqueTrimmedValues([...prev, savedRoomName]),
      );
      resetRoomCreator();
      addToast(`Room ${savedRoomName} added.`, "success");
    } catch (error) {
      console.error("Failed to save shared room option", error);
      addToast(
        error instanceof Error
          ? error.message
          : "Unable to save the room to shared academic data.",
        "error",
      );
    }
  };

  const clearRoomsFromAssignments = async (roomNames: string[]) => {
    const normalizedRoomNames = roomNames.map((roomName) =>
      roomName.trim().toLowerCase(),
    );
    let assignmentsToSync: SubjectAssignment[] = [];

    setSubjectAssignments((prev) => {
      const nextAssignments = prev.map((assignment) => {
        const hasMatchingRoom = assignment.schedule.some((slot) =>
          normalizedRoomNames.includes(slot.room.trim().toLowerCase()),
        );

        if (!hasMatchingRoom) {
          return assignment;
        }

        const nextAssignment = {
          ...assignment,
          schedule: assignment.schedule.map((slot) =>
            normalizedRoomNames.includes(slot.room.trim().toLowerCase())
              ? { ...slot, room: "TBA" }
              : slot,
          ),
        };

        assignmentsToSync = [...assignmentsToSync, nextAssignment];
        return nextAssignment;
      });

      return nextAssignments;
    });

    if (assignmentsToSync.length > 0) {
      const syncResults = await Promise.allSettled(
        assignmentsToSync.map((assignment) =>
          saveAcademicSubjectAssignment(currentBranch, assignment),
        ),
      );

      if (syncResults.some((result) => result.status === "rejected")) {
        console.warn("Some classroom schedule updates could not be synced.", syncResults);
        addToast("Classroom was removed locally, but some schedules did not sync.", "warning");
      }
    }
  };

  const handleDeleteRoomOption = async (roomName: string) => {
    const roomInUse = subjectAssignments.some((assignment) =>
      assignment.schedule.some(
        (slot) =>
          slot.room.trim().toLowerCase() === roomName.trim().toLowerCase(),
      ),
    );

    setPendingAcademicOptionDelete({
      kind: "classroom",
      names: [roomName],
      usedNames: roomInUse ? [roomName] : [],
      message: roomInUse
        ? `Delete classroom "${roomName}"? It is used in one or more schedules, so those schedule rooms will be set to TBA.`
        : `Delete classroom "${roomName}"?`,
    });
  };

  const deleteClassroomOptions = async (
    roomNames: string[],
    usedRoomNames: string[] = [],
  ) => {
    setCustomAssignmentRooms((prev) =>
      prev.filter(
        (room) =>
          !roomNames.some(
            (roomName) =>
              room.trim().toLowerCase() === roomName.trim().toLowerCase(),
          ),
      ),
    );
    setSelectedClassroomNames((prev) =>
      prev.filter((room) => !roomNames.includes(room)),
    );
    setAssignmentForm((prev) => ({
      ...prev,
      room: roomNames.some(
        (roomName) => roomName.trim().toLowerCase() === prev.room.trim().toLowerCase(),
      )
        ? ""
        : prev.room,
      schedule: prev.schedule.map((slot) =>
        roomNames.some(
          (roomName) =>
            slot.room.trim().toLowerCase() === roomName.trim().toLowerCase(),
        )
          ? { ...slot, room: "TBA" }
          : slot,
      ),
    }));

    if (usedRoomNames.length > 0) {
      await clearRoomsFromAssignments(usedRoomNames);
    }

    addToast(
      `Deleted ${roomNames.length} classroom${roomNames.length === 1 ? "" : "s"}.`,
      "success",
    );
  };

  const toggleClassroomSelection = (roomName: string) => {
    setSelectedClassroomNames((prev) =>
      prev.includes(roomName)
        ? prev.filter((item) => item !== roomName)
        : [...prev, roomName],
    );
  };

  const handleDeleteSelectedClassrooms = async () => {
    if (selectedClassroomNames.length === 0) {
      addToast("Select classrooms to delete first.", "warning");
      return;
    }

    const usedRooms = selectedClassroomNames.filter((roomName) =>
      subjectAssignments.some((assignment) =>
        assignment.schedule.some(
          (slot) =>
            slot.room.trim().toLowerCase() === roomName.trim().toLowerCase(),
        ),
      ),
    );
    setPendingAcademicOptionDelete({
      kind: "classroom",
      names: selectedClassroomNames,
      usedNames: usedRooms,
      message:
        usedRooms.length > 0
          ? `Delete ${selectedClassroomNames.length} selected classroom${
              selectedClassroomNames.length === 1 ? "" : "s"
            }? Rooms used in schedules will be set to TBA.`
          : `Delete ${selectedClassroomNames.length} selected classroom${
              selectedClassroomNames.length === 1 ? "" : "s"
            }?`,
    });
  };

  const handleConfirmAcademicOptionDelete = async () => {
    if (!pendingAcademicOptionDelete) {
      return;
    }

    const pendingDelete = pendingAcademicOptionDelete;
    setPendingAcademicOptionDelete(null);

    if (pendingDelete.kind === "department") {
      deleteDepartmentOptions(pendingDelete.names);
      return;
    }

    await deleteClassroomOptions(
      pendingDelete.names,
      pendingDelete.usedNames ?? [],
    );
  };

  const handleRemoveAssignment = (assignmentId: string) => {
    openAssignmentDeleteModal([assignmentId]);
  };

  const isAssignmentNotFoundError = (error: unknown) =>
    error instanceof Error &&
    /Assignment\s+".*"\s+was not found for branch/i.test(error.message);

  const handleConfirmAssignmentDelete = async () => {
    if (pendingAssignmentDeleteIds.length === 0) {
      return;
    }

    const deleteResults = await Promise.allSettled(
      pendingAssignmentDeleteIds.map((assignmentId) =>
        deleteAcademicSubjectAssignment(currentBranch, assignmentId),
      ),
    );
    const failedDelete = deleteResults.find(
      (result) =>
        result.status === "rejected" &&
        !isAssignmentNotFoundError(result.reason),
    );

    if (!failedDelete) {
      setSubjectAssignments((prev) =>
        prev.filter(
          (assignment) => !pendingAssignmentDeleteIds.includes(assignment.id),
        ),
      );
      setSelectedAssignmentIds((prev) =>
        prev.filter((id) => !pendingAssignmentDeleteIds.includes(id)),
      );

      addToast(
        `${pendingAssignmentDeleteIds.length} assignment${pendingAssignmentDeleteIds.length === 1 ? "" : "s"} removed.`,
        "info",
      );
      closeAssignmentDeleteModal();
      return;
    }

    if (failedDelete.status === "rejected") {
      console.error("Failed to delete shared subject assignments", failedDelete.reason);
      addToast(
        failedDelete.reason instanceof Error
          ? failedDelete.reason.message
          : "Unable to delete the shared class assignments.",
        "error",
      );
    }
  };

  const detachEnrolleesFromSections = (enrolleeIds: string[]) => {
    const enrolleeIdSet = new Set(enrolleeIds);

    if (enrolleeIdSet.size === 0) {
      return;
    }

    setSectionAssignments((prev) =>
      prev.filter((assignment) => !enrolleeIdSet.has(assignment.enrolleeId)),
    );
    void loadClassSections();
  };

  const archiveEnrollees = (recordsToArchive: Enrollee[]) => {
    if (recordsToArchive.length === 0) {
      return;
    }

    const archivedAt = new Date().toISOString();
    const archivedIds = new Set(recordsToArchive.map((enrollee) => enrollee.id));

    detachEnrolleesFromSections([...archivedIds]);
    setEnrollees((prev) =>
      prev.map((record) =>
        archivedIds.has(record.id)
          ? {
              ...record,
              archivedAt,
              archivedByRole: loggedInRole,
            }
          : record,
      ),
    );
    setSelectedEnrolleeIds((prev) =>
      prev.filter((enrolleeId) => !archivedIds.has(enrolleeId)),
    );
    setSelectedRequest((prev) =>
      prev && !isEnrollmentRequestRecord(prev) && archivedIds.has(prev.id)
        ? null
        : prev,
    );

    if (selectedAction && archivedIds.has(selectedAction.id)) {
      setSelectedAction(null);
      setIsConfirmModalOpen(false);
    }

    addToast(
      recordsToArchive.length === 1
        ? `${recordsToArchive[0].fullName} moved to Archive.`
        : `${recordsToArchive.length} records moved to Archive.`,
      "success",
    );
  };

  const handleArchiveEnrollee = (enrollee: Enrollee) => {
    const confirmed = window.confirm(
      `Archive ${enrollee.fullName}? You can restore this record from Archive later.`,
    );

    if (!confirmed) {
      return;
    }

    archiveEnrollees([enrollee]);
  };

  const handleArchiveSelectedEnrollees = (recordsToArchive: Enrollee[]) => {
    if (recordsToArchive.length === 0) {
      addToast("Select at least one record to archive.", "info");
      return;
    }

    const confirmed = window.confirm(
      `Archive ${recordsToArchive.length} selected ${activeTab === "transferees" ? "transferee" : "admission"} record${recordsToArchive.length === 1 ? "" : "s"}? You can restore them from Archive later.`,
    );

    if (!confirmed) {
      return;
    }

    archiveEnrollees(recordsToArchive);
  };

  const archiveEnrollmentRequests = (requestsToArchive: EnrollmentRequest[]) => {
    if (requestsToArchive.length === 0) {
      addToast("Select at least one enrollment request to archive.", "info");
      return;
    }

    const archivedAt = new Date().toISOString();
    const archivedIds = new Set(requestsToArchive.map((request) => request.id));
    const archivedRequests = requestsToArchive.map((request) => ({
      ...request,
      archivedAt,
      archivedByRole: loggedInRole,
      updatedAt: archivedAt,
    }));

    setEnrollmentRequests((prev) =>
      prev.map((request) =>
        archivedIds.has(request.id)
          ? archivedRequests.find((archived) => archived.id === request.id) ??
            request
          : request,
      ),
    );
    setSelectedEnrollmentRequestIds((prev) =>
      prev.filter((requestId) => !archivedIds.has(requestId)),
    );
    setSelectedRequest((prev) =>
      prev && isEnrollmentRequestRecord(prev) && archivedIds.has(prev.id)
        ? null
        : prev,
    );

    void Promise.allSettled(
      archivedRequests.map((request) => saveEnrollmentRequest(request)),
    ).then((results) => {
      if (results.some((result) => result.status === "rejected")) {
        console.warn("Some archived enrollment requests could not be synced.", results);
      }
    });

    addToast(
      requestsToArchive.length === 1
        ? "Enrollment request moved to Archive."
        : `${requestsToArchive.length} enrollment requests moved to Archive.`,
      "success",
    );
  };

  const handleArchiveSelectedEnrollmentRequests = (
    requestsToArchive: EnrollmentRequest[],
  ) => {
    if (requestsToArchive.length === 0) {
      addToast("Select at least one enrollment request to archive.", "info");
      return;
    }

    const confirmed = window.confirm(
      `Archive ${requestsToArchive.length} selected enrollment request${requestsToArchive.length === 1 ? "" : "s"}?`,
    );

    if (!confirmed) {
      return;
    }

    archiveEnrollmentRequests(requestsToArchive);
  };

  // Update pending assignments
  const mapStoredStudentToSectionCandidate = (
    student: StudentStorageRecord,
  ): Enrollee => ({
    id: student.id,
    trackingNumber: student.trackingNumber || "",
    studentNumber: student.id,
    fullName: student.name,
    program: student.program,
    yearLevel: student.yearLevel,
    strandOrCourse: student.strandOrCourse || "",
    applicationDate: student.documentSubmitted || "",
    documentsSubmitted: 0,
    totalDocuments: 0,
    status: "Approved",
    branch: student.branch,
    studentStatus: student.studentStatus || "",
    requestedOwnSchedule: student.requestedOwnSchedule,
    ownScheduleRequestStatus: student.ownScheduleRequestStatus,
    ownScheduleAcademicYear: student.ownScheduleAcademicYear,
    ownScheduleSemester: student.ownScheduleSemester,
    personalInfo: {
      fullName: student.name,
      birthDate: student.birthDate || "",
      contactNumber: student.contact || "",
      program: student.program,
      guardianName: student.guardianName || "",
      email: student.email || "",
      address: student.address || "",
      yearLevel: student.yearLevel,
      guardianContact: student.guardianContact || "",
    },
  });

  const updatePendingAssignments = () => {
    const approvedUnassigned = getActiveBranchStudents()
      .filter(
        (student) =>
          !normalizeSectionCodeValue(student.section) &&
          !student.requestedOwnSchedule &&
          student.ownScheduleRequestStatus !== "Approved",
      )
      .map(mapStoredStudentToSectionCandidate);

    setPendingAssignments(approvedUnassigned);
  };

  const syncStudentSection = (enrollee: Enrollee, sectionCode: string) => {
    if (!enrollee.studentNumber) {
      return null;
    }

    const sectionUpdateResult = updateStoredStudentSection({
      branch: currentBranch,
      studentNumber: enrollee.studentNumber,
      trackingNumber: enrollee.trackingNumber,
      nextSectionCode: sectionCode,
    });

    if (sectionUpdateResult?.student) {
      void syncStoredStudentsToSupabase([sectionUpdateResult.student.id]);
    }

    return sectionUpdateResult;
  };

  const syncStoredSectionCode = (
    section: ClassSection,
    nextSectionCode: string,
  ) => {
    const normalizedSectionCode = normalizeSectionCodeValue(section.code);
    const affectedStudents = getActiveBranchStudents().filter(
      (student) =>
        normalizeSectionCodeValue(student.section) === normalizedSectionCode,
    );

    if (affectedStudents.length === 0) {
      return;
    }

    const affectedStudentNumbers = new Set(
      affectedStudents.map((student) => student.id),
    );
    const storedStudents = readStoredStudents();
    const nextStudents = storedStudents.map((student) =>
      affectedStudentNumbers.has(student.id) &&
      normalizeBranchName(student.branch) === currentBranch
        ? { ...student, section: nextSectionCode }
        : student,
    );

    writeStoredStudents(nextStudents);
    void syncStoredStudentsToSupabase(Array.from(affectedStudentNumbers));
  };

  const resetSectionForm = () => {
    setEditingSection(null);
    setNewSection(createDefaultSectionForm());
  };

  const getTransfereeEvaluation = (enrollee: Enrollee) =>
    normalizeTransfereeEvaluation(
      enrollee,
      transfereeEvaluations[enrollee.id],
      reflectedAcademicYear,
    );

  const isTransfereeEvaluationComplete = (
    evaluation: TransfereeEvaluationRecord,
  ) =>
    evaluation.credentialsReviewed &&
    evaluation.placementConfirmed &&
    evaluation.subjectLoadValidated;

  const getTransfereePlanningSemesters = (
    enrollee: Enrollee,
    resolvedYearLevel = enrollee.yearLevel,
  ) =>
    sortSemesterValues(
      Array.from(
        new Set(
          subjects
            .filter(
              (subject) =>
                subject.program === enrollee.program &&
                subject.yearLevel === resolvedYearLevel &&
                matchesAcademicDescriptor(
                  resolveSubjectStrandOrCourse(subject),
                  enrollee.strandOrCourse,
                ),
            )
            .map((subject) => normalizeSectionSemester(subject.semester)),
        ),
      ),
    );

  const getTransfereePlanningSubjects = (
    enrollee: Enrollee,
    resolvedYearLevel = enrollee.yearLevel,
    semester = DEFAULT_SECTION_SEMESTER,
  ) =>
    subjects
      .filter(
        (subject) =>
          subject.program === enrollee.program &&
          subject.yearLevel === resolvedYearLevel &&
          normalizeSectionSemester(subject.semester) ===
            normalizeSectionSemester(semester) &&
          matchesAcademicDescriptor(
            resolveSubjectStrandOrCourse(subject),
            enrollee.strandOrCourse,
          ),
      )
      .sort((left, right) => left.code.localeCompare(right.code));

  const getTransfereeCreditSubjects = (enrollee: Enrollee) =>
    subjects
      .filter(
        (subject) =>
          subject.program === enrollee.program &&
          matchesAcademicDescriptor(
            resolveSubjectStrandOrCourse(subject),
            enrollee.strandOrCourse,
          ),
      )
      .sort(compareSubjectSequence);

  const mapSubjectsToStudentSubjectPlanItems = (
    subjectIds: string[],
  ): StudentSubjectPlanItem[] => {
    const selectedSubjectIds = new Set(subjectIds);

    return subjects
      .filter((subject) => selectedSubjectIds.has(subject.id))
      .sort((left, right) => left.code.localeCompare(right.code))
      .map((subject) => ({
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
      }));
  };

  const mapScheduledAssignmentsToStudentSubjectPlanItems = (
    assignments: NonNullable<EnrollmentRequest["requestedLoad"]>["scheduledAssignments"],
  ): StudentSubjectPlanItem[] =>
    Array.from(
      assignments.reduce((items, assignment) => {
        const key = `${assignment.subjectId}:${assignment.subjectCode}`;

        if (!items.has(key)) {
          items.set(key, {
            subjectId: assignment.subjectId,
            subjectCode: assignment.subjectCode,
            subjectName: assignment.subjectName,
            units: assignment.units,
          });
        }

        return items;
      }, new Map<string, StudentSubjectPlanItem>()),
    )
      .map(([, item]) => item)
      .sort(
        (left, right) =>
          left.subjectCode.localeCompare(right.subjectCode) ||
          left.subjectName.localeCompare(right.subjectName),
      );

  const getMatchingStudentSubjectPlanEntry = (
    request: Pick<EnrollmentRequest, "studentNumber" | "trackingNumber">,
    plans: Record<string, StudentSubjectPlanRecord>,
  ) =>
    Object.entries(plans).find(([, plan]) => {
      if (request.trackingNumber && plan.trackingNumber === request.trackingNumber) {
        return true;
      }

      return Boolean(request.studentNumber) && plan.studentNumber === request.studentNumber;
    }) ?? null;

  const mapSubjectAssignmentToStudentScheduledAssignment = (
    assignment: SubjectAssignment,
  ): StudentScheduledAssignmentItem => ({
    assignmentId: assignment.id,
    subjectId: assignment.subjectId,
    subjectCode: assignment.subjectCode,
    subjectName: assignment.subjectName,
    instructorId: assignment.instructorId,
    instructorName: assignment.instructorName,
    sectionId: assignment.sectionId,
    sectionCode: assignment.sectionCode,
    schedule: assignment.schedule,
    academicYear: assignment.academicYear,
    semester: normalizeSectionSemester(assignment.semester),
  });

  const getRequestedSectionForEnrollmentRequest = (request: EnrollmentRequest) => {
    if (request.irregularRequest?.mode !== "section_assignment") {
      return null;
    }

    return (
      classSections.find(
        (section) =>
          (request.irregularRequest?.requestedSectionId &&
            section.id === request.irregularRequest.requestedSectionId) ||
          (request.irregularRequest?.requestedSectionCode &&
            section.code === request.irregularRequest.requestedSectionCode),
      ) ?? null
    );
  };

  const getEnrollmentRequestSectionPlanAssignments = (
    request: EnrollmentRequest,
  ): StudentScheduledAssignmentItem[] => {
    if (request.irregularRequest?.mode !== "section_assignment") {
      return [];
    }

    const requestedSectionId = request.irregularRequest.requestedSectionId;
    const requestedSectionCode = request.irregularRequest.requestedSectionCode;
    const matchingCatalogSubjects = subjects.filter(
      (subject) =>
        subject.program === request.program &&
        subject.yearLevel === request.requestedYearLevel &&
        normalizeSectionSemester(subject.semester) ===
          normalizeSectionSemester(request.semester) &&
        matchesAcademicDescriptor(
          resolveSubjectStrandOrCourse(subject),
          request.strandOrCourse,
        ),
    );
    const matchingSubjectIds = new Set(
      matchingCatalogSubjects.map((subject) => subject.id),
    );
    const matchingSubjectCodes = new Set(
      matchingCatalogSubjects.map((subject) => subject.code),
    );

    return subjectAssignments
      .filter(
        (assignment) =>
          assignment.academicYear === request.academicYear &&
          normalizeSectionSemester(assignment.semester) ===
            normalizeSectionSemester(request.semester) &&
          ((requestedSectionId && assignment.sectionId === requestedSectionId) ||
            (!requestedSectionId &&
              requestedSectionCode &&
              assignment.sectionCode === requestedSectionCode)) &&
          (matchingSubjectIds.size === 0 ||
            matchingSubjectIds.has(assignment.subjectId) ||
            matchingSubjectCodes.has(assignment.subjectCode)),
      )
      .map(mapSubjectAssignmentToStudentScheduledAssignment)
      .sort(
        (left, right) =>
          left.subjectCode.localeCompare(right.subjectCode) ||
          (left.sectionCode || "").localeCompare(right.sectionCode || ""),
      );
  };

  const getEnrollmentRequestScheduledAssignments = (
    request: EnrollmentRequest,
  ): StudentScheduledAssignmentItem[] =>
    Array.from(
      [
        ...(request.requestedLoad?.mode === "retake"
          ? request.requestedLoad.scheduledAssignments
          : []),
        ...getEnrollmentRequestSectionPlanAssignments(request),
      ].reduce((items, assignment) => {
        items.set(assignment.assignmentId, assignment);
        return items;
      }, new Map<string, StudentScheduledAssignmentItem>()),
    )
      .map(([, assignment]) => assignment)
      .sort(
        (left, right) =>
          left.subjectCode.localeCompare(right.subjectCode) ||
          (left.sectionCode || "").localeCompare(right.sectionCode || ""),
      );

  const syncEnrollmentRequestSubjectPlan = (
    request: EnrollmentRequest,
    updatedAt: string,
  ) => {
    const scheduledAssignments = getEnrollmentRequestScheduledAssignments(request);
    const matchingEntry = getMatchingStudentSubjectPlanEntry(
      request,
      studentSubjectPlans,
    );
    const planKey =
      matchingEntry?.[0] || request.trackingNumber || request.studentNumber;
    const existingPlan = matchingEntry?.[1];
    const assignedSubjects =
      scheduledAssignments.length > 0
        ? mapScheduledAssignmentsToStudentSubjectPlanItems(scheduledAssignments)
        : [];

    if (!planKey) {
      return;
    }

    const nextPlan: StudentSubjectPlanRecord = {
      id: planKey,
      enrolleeId: existingPlan?.enrolleeId,
      trackingNumber: request.trackingNumber || existingPlan?.trackingNumber,
      studentNumber: request.studentNumber || existingPlan?.studentNumber,
      semester: normalizeSectionSemester(request.semester),
      academicYear: request.academicYear,
      assignedSubjects,
      creditedSubjects: existingPlan?.creditedSubjects ?? [],
      scheduledAssignments:
        scheduledAssignments.length > 0 ? scheduledAssignments : undefined,
      notes:
        request.notes ||
        existingPlan?.notes ||
        "Approved from enrollment request.",
      updatedAt,
      source: "enrollment_request",
    };

    setStudentSubjectPlans((prev) => ({
      ...prev,
      [planKey]: nextPlan,
    }));
    void saveStudentSubjectPlan(currentBranch, nextPlan).catch((error) => {
      console.error("Failed to sync enrollment request subject plan", error);
    });
  };

  const reloadManagedSectionState = () => {
    const storedSectionAssignments =
      readBranchScopedData<SectionAssignment[]>(
        storageScopes.sectionAssignments,
        currentBranch,
      ) ?? [];

    setSectionAssignments(storedSectionAssignments);
    loadClassSections();
  };

  const ensureProgressedSectionExists = ({
    request,
    student,
    nextSectionCode,
  }: {
    request: EnrollmentRequest;
    student: StudentStorageRecord;
    nextSectionCode: string;
  }) => {
    const resolvedBranch = normalizeBranchName(request.branch);
    const normalizedNextSectionCode = nextSectionCode.trim().toUpperCase();

    if (!normalizedNextSectionCode) {
      return;
    }

    const storedSections =
      readBranchScopedData<ClassSection[]>(
        storageScopes.classSections,
        resolvedBranch,
      ) ?? [];
    const existingTargetSection = storedSections.find(
      (section) => section.code.trim().toUpperCase() === normalizedNextSectionCode,
    );

    if (existingTargetSection) {
      return;
    }

    const previousSection = storedSections.find(
      (section) =>
        section.code.trim().toUpperCase() === (student.section?.trim().toUpperCase() || ""),
    );
    const blockLabel =
      normalizedNextSectionCode.match(/^(.*?)([1-4])-?([A-Z]+)$/)?.[3] ||
      previousSection?.section ||
      normalizedNextSectionCode;
    const nextSection: ClassSection = {
      id: `progressed_${student.id}_${Date.now()}`,
      code: normalizedNextSectionCode,
      program: student.program,
      yearLevel: request.requestedYearLevel,
      semester:
        normalizeSectionSemester(request.semester) ||
        previousSection?.semester ||
        DEFAULT_SECTION_SEMESTER,
      strand: previousSection?.strand || student.strandOrCourse,
      section: blockLabel,
      currentEnrollees: 0,
      maxCapacity: Math.max(1, previousSection?.maxCapacity || 30),
      enrolleeIds: [],
      isLocked: false,
    };

    writeBranchScopedData(storageScopes.classSections, resolvedBranch, [
      ...storedSections,
      nextSection,
    ]);
  };

  const syncEnrollmentRequestStudentState = (
    request: EnrollmentRequest,
  ): StudentStorageRecord | null => {
    const resolvedBranch = normalizeBranchName(request.branch);
    const storedStudents = readStoredStudents();
    const matchedStoredStudent =
      storedStudents.find((student) => {
        const matchesBranch =
          normalizeBranchName(student.branch) === resolvedBranch;
        const matchesStudentNumber =
          request.studentNumber && student.id === request.studentNumber && matchesBranch;
        const matchesTrackingNumber =
          request.trackingNumber &&
          student.trackingNumber === request.trackingNumber &&
          matchesBranch;

        return matchesStudentNumber || matchesTrackingNumber;
      }) ?? null;

    if (!matchedStoredStudent) {
      reloadManagedSectionState();
      return null;
    }

    let updatedStudentRecord: StudentStorageRecord | null = null;
    const nextStudentsWithApprovedTerm = storedStudents.map((student) => {
      const matchesBranch = normalizeBranchName(student.branch) === resolvedBranch;
      const matchesStudentNumber =
        request.studentNumber && student.id === request.studentNumber && matchesBranch;
      const matchesTrackingNumber =
        request.trackingNumber &&
        student.trackingNumber === request.trackingNumber &&
        matchesBranch;

      if (!matchesStudentNumber && !matchesTrackingNumber) {
        return student;
      }

      updatedStudentRecord = {
        ...student,
        yearLevel: request.requestedYearLevel,
        section:
          request.irregularRequest?.mode === "own_schedule"
            ? ""
            : student.section,
      };

      return updatedStudentRecord;
    });

    writeStoredStudents(nextStudentsWithApprovedTerm);

    if (request.irregularRequest?.mode === "own_schedule") {
      const matchingEntry = getMatchingStudentSubjectPlanEntry(
        request,
        studentSubjectPlans,
      );

      if (matchingEntry) {
        const nextPlans = { ...studentSubjectPlans };
        delete nextPlans[matchingEntry[0]];
        setStudentSubjectPlans(nextPlans);
        void deleteStudentSubjectPlan(currentBranch, matchingEntry[0]).catch(
          (error) => {
            console.error("Failed to delete shared student subject plan", error);
          },
        );
      }

      updateStoredStudentOwnScheduleState({
        branch: request.branch,
        studentNumber: request.studentNumber,
        trackingNumber: request.trackingNumber,
        updates: {
          requestedOwnSchedule: true,
          ownScheduleRequestStatus: "Approved",
          ownScheduleAcademicYear: request.academicYear,
          ownScheduleSemester: normalizeSectionSemester(request.semester),
          ownScheduleSelectionStatus: "Not Submitted",
        },
      });
      void saveStudentPlanningState({
        branch: request.branch,
        studentNumber: request.studentNumber,
        trackingNumber: request.trackingNumber,
        requestedOwnSchedule: true,
        ownScheduleRequestStatus: "Approved",
        ownScheduleAcademicYear: request.academicYear,
        ownScheduleSemester: normalizeSectionSemester(request.semester),
        ownScheduleSelectionStatus: "Not Submitted",
      }).catch((error) => {
        console.error("Failed to sync shared student planning state", error);
      });
      reloadManagedSectionState();
      return updatedStudentRecord;
    }

    updateStoredStudentOwnScheduleState({
      branch: request.branch,
      studentNumber: request.studentNumber,
      trackingNumber: request.trackingNumber,
      updates: {
        requestedOwnSchedule: false,
        ownScheduleRequestStatus: undefined,
        ownScheduleAcademicYear: undefined,
        ownScheduleSemester: undefined,
        ownScheduleSelectionStatus: undefined,
      },
    });
    void saveStudentPlanningState({
      branch: request.branch,
      studentNumber: request.studentNumber,
      trackingNumber: request.trackingNumber,
      requestedOwnSchedule: false,
      ownScheduleRequestStatus: undefined,
      ownScheduleAcademicYear: undefined,
      ownScheduleSemester: undefined,
      ownScheduleSelectionStatus: undefined,
    }).catch((error) => {
      console.error("Failed to clear shared student planning state", error);
    });

    if (!updatedStudentRecord) {
      reloadManagedSectionState();
      return updatedStudentRecord;
    }

    let requestedSectionCode = "";

    if (request.irregularRequest?.mode === "section_assignment") {
      requestedSectionCode =
        request.irregularRequest.requestedSectionCode ||
        getRequestedSectionForEnrollmentRequest(request)?.code ||
        "";
    } else {
      requestedSectionCode =
        buildProgressedBlockSectionCode({
          currentSectionCode: matchedStoredStudent.section,
          requestedYearLevel: request.requestedYearLevel,
        }) || matchedStoredStudent.section || "";
    }

    if (!requestedSectionCode) {
      reloadManagedSectionState();
      return updatedStudentRecord;
    }

    if (request.irregularRequest?.mode !== "section_assignment") {
      ensureProgressedSectionExists({
        request,
        student: matchedStoredStudent,
        nextSectionCode: requestedSectionCode,
      });
    }

    const sectionUpdateResult = updateStoredStudentSection({
      branch: request.branch,
      studentNumber: request.studentNumber,
      trackingNumber: request.trackingNumber,
      nextSectionCode: requestedSectionCode,
    });

    if (sectionUpdateResult) {
      updatedStudentRecord = sectionUpdateResult.student;
    }

    reloadManagedSectionState();
    return updatedStudentRecord;
  };

  const syncStudentSubjectPlan = (
    enrollee: Pick<Enrollee, "id" | "trackingNumber" | "studentNumber">,
    evaluation: TransfereeEvaluationRecord,
  ) => {
    const planKey = enrollee.trackingNumber || enrollee.id;
    const assignedSubjects = mapSubjectsToStudentSubjectPlanItems(
      evaluation.assignedSubjectIds,
    );
    const creditedSubjects = mapSubjectsToStudentSubjectPlanItems(
      evaluation.creditedSubjectIds,
    );

    if (assignedSubjects.length === 0 && creditedSubjects.length === 0) {
      if (!studentSubjectPlans[planKey]) {
        return;
      }

      const nextPlans = { ...studentSubjectPlans };
      delete nextPlans[planKey];
      setStudentSubjectPlans(nextPlans);
      void deleteStudentSubjectPlan(currentBranch, planKey).catch((error) => {
        console.error("Failed to delete shared transferee subject plan", error);
      });
      return;
    }

    const nextPlan: StudentSubjectPlanRecord = {
      id: planKey,
      enrolleeId: enrollee.id,
      trackingNumber: enrollee.trackingNumber,
      studentNumber: enrollee.studentNumber,
      semester: normalizeSectionSemester(evaluation.plannedSemester),
      academicYear:
        evaluation.plannedAcademicYear.trim() || reflectedAcademicYear,
      assignedSubjects,
      creditedSubjects,
      updatedAt: new Date().toISOString(),
      source: "transferee_validation",
    };

    setStudentSubjectPlans((prev) => ({
      ...prev,
      [planKey]: nextPlan,
    }));
    void saveStudentSubjectPlan(currentBranch, nextPlan).catch((error) => {
      console.error("Failed to sync shared transferee subject plan", error);
    });
  };

  const updateTransfereeEvaluation = (
    enrollee: Enrollee,
    updates: Partial<TransfereeEvaluationRecord>,
  ) => {
    const updateKeys = Object.keys(updates);
    const isFilterOnlyUpdate =
      updateKeys.length > 0 &&
      updateKeys.every((key) =>
        ["creditYearLevelFilter", "creditSemesterFilter"].includes(key),
      );

    if (enrollee.status === "Approved" && !isFilterOnlyUpdate) {
      addToast("Approved transferee records are locked for editing.", "info");
      return;
    }

    const base = normalizeTransfereeEvaluation(
      enrollee,
      transfereeEvaluations[enrollee.id],
      reflectedAcademicYear,
    );
    const nextCreditedSubjectIds = dedupeStringValues(
      updates.creditedSubjectIds ?? base.creditedSubjectIds,
    );
    const nextAssignedSubjectIds = dedupeStringValues(
      (updates.assignedSubjectIds ?? base.assignedSubjectIds).filter(
        (subjectId) => !nextCreditedSubjectIds.includes(subjectId),
      ),
    );
    const nextEvaluation: TransfereeEvaluationRecord = {
      ...base,
      ...updates,
      enrolleeId: enrollee.id,
      plannedSemester: normalizeSectionSemester(
        updates.plannedSemester ?? base.plannedSemester,
      ),
      plannedAcademicYear:
        (
          updates.plannedAcademicYear ??
          base.plannedAcademicYear ??
          reflectedAcademicYear
        ).trim() || reflectedAcademicYear,
      creditedSubjectIds: nextCreditedSubjectIds,
      assignedSubjectIds: nextAssignedSubjectIds,
      updatedAt: new Date().toISOString(),
    };

    setTransfereeEvaluations((prev) => ({
      ...prev,
      [enrollee.id]: nextEvaluation,
    }));
  };

  const toggleTransfereeCreditedSubject = (
    enrollee: Enrollee,
    subjectId: string,
  ) => {
    const evaluation = getTransfereeEvaluation(enrollee);
    const isCredited = evaluation.creditedSubjectIds.includes(subjectId);

    updateTransfereeEvaluation(enrollee, {
      creditedSubjectIds: isCredited
        ? evaluation.creditedSubjectIds.filter((item) => item !== subjectId)
        : [...evaluation.creditedSubjectIds, subjectId],
      assignedSubjectIds: evaluation.assignedSubjectIds.filter(
        (item) => item !== subjectId,
      ),
    });
  };

  const toggleTransfereeAssignedSubject = (
    enrollee: Enrollee,
    subjectId: string,
  ) => {
    const evaluation = getTransfereeEvaluation(enrollee);
    const isAssigned = evaluation.assignedSubjectIds.includes(subjectId);

    updateTransfereeEvaluation(enrollee, {
      creditedSubjectIds: evaluation.creditedSubjectIds.filter(
        (item) => item !== subjectId,
      ),
      assignedSubjectIds: isAssigned
        ? evaluation.assignedSubjectIds.filter((item) => item !== subjectId)
        : [...evaluation.assignedSubjectIds, subjectId],
    });
  };

  const applyRemainingTransfereeSubjects = (
    enrollee: Enrollee,
    availableSubjects: Subject[],
  ) => {
    const evaluation = getTransfereeEvaluation(enrollee);
    const creditedSubjectIds = new Set(evaluation.creditedSubjectIds);

    updateTransfereeEvaluation(enrollee, {
      assignedSubjectIds: availableSubjects
        .filter((subject) => !creditedSubjectIds.has(subject.id))
        .map((subject) => subject.id),
    });
  };

  const clearTransfereeSubjectPlan = (enrollee: Enrollee) => {
    updateTransfereeEvaluation(enrollee, {
      creditedSubjectIds: [],
      assignedSubjectIds: [],
    });
  };

  const getAssignedSectionCode = (enrolleeId: string) =>
    sectionAssignments.find((assignment) => assignment.enrolleeId === enrolleeId)
      ?.assignedSection || "Not assigned";

  const getMatchingSectionsForEnrollee = (
    enrollee: Enrollee,
    resolvedYearLevel = enrollee.yearLevel,
    semester?: string,
  ) =>
    classSections.filter(
      (section) =>
        !isSectionLocked(section) &&
        sectionMatchesEnrollee(section, {
          ...enrollee,
          yearLevel: resolvedYearLevel,
        }) &&
        (!semester ||
          normalizeSectionSemester(section.semester) ===
            normalizeSectionSemester(semester)),
    );
  const selectedTransfereeEvaluation =
    selectedAdmissionRequest && isTransfereeAdmission(selectedAdmissionRequest)
      ? getTransfereeEvaluation(selectedAdmissionRequest)
      : null;
  const selectedTransfereeMatchingSections =
    selectedAdmissionRequest && selectedTransfereeEvaluation
      ? getMatchingSectionsForEnrollee(
          selectedAdmissionRequest,
          selectedTransfereeEvaluation.resolvedYearLevel,
          selectedTransfereeEvaluation.plannedSemester,
        )
      : [];
  const selectedTransfereePlanningSemesters =
    selectedAdmissionRequest && selectedTransfereeEvaluation
      ? getTransfereePlanningSemesters(
          selectedAdmissionRequest,
          selectedTransfereeEvaluation.resolvedYearLevel,
        )
      : [];
  const selectedTransfereeAvailableSubjects =
    selectedAdmissionRequest && selectedTransfereeEvaluation
      ? getTransfereePlanningSubjects(
          selectedAdmissionRequest,
          selectedTransfereeEvaluation.resolvedYearLevel,
          selectedTransfereeEvaluation.plannedSemester,
        )
      : [];
  const selectedTransfereeCreditSubjects =
    selectedAdmissionRequest && selectedTransfereeEvaluation
      ? getTransfereeCreditSubjects(selectedAdmissionRequest)
      : [];
  const selectedTransfereeCreditYearLevelOptions = selectedAdmissionRequest
    ? getProgramYearLevelOptions(selectedAdmissionRequest.program)
    : [];
  const selectedTransfereeCreditSemesterOptions = sortSemesterValues(
    Array.from(
      new Set(
        selectedTransfereeCreditSubjects
          .filter(
            (subject) =>
              !selectedTransfereeEvaluation ||
              selectedTransfereeEvaluation.creditYearLevelFilter === "All" ||
              subject.yearLevel ===
                selectedTransfereeEvaluation.creditYearLevelFilter,
          )
          .map((subject) => normalizeSectionSemester(subject.semester)),
      ),
    ),
  );
  const selectedTransfereeResolvedCreditSemesterFilter =
    selectedTransfereeEvaluation
      ? selectedTransfereeEvaluation.creditSemesterFilter !== "All"
        ? selectedTransfereeEvaluation.creditSemesterFilter
        : "All"
      : "All";
  const selectedTransfereeFilteredCreditSubjects =
    selectedTransfereeEvaluation && selectedTransfereeCreditSubjects.length > 0
      ? selectedTransfereeCreditSubjects.filter(
          (subject) => {
            const normalizedSearch = transfereeCreditSearchTerm
              .trim()
              .toLowerCase();
            const matchesFilters =
              (selectedTransfereeEvaluation.creditYearLevelFilter === "All" ||
              subject.yearLevel ===
                selectedTransfereeEvaluation.creditYearLevelFilter) &&
              (selectedTransfereeResolvedCreditSemesterFilter === "All" ||
              normalizeSectionSemester(subject.semester) ===
                selectedTransfereeResolvedCreditSemesterFilter);
            const matchesSearch =
              normalizedSearch === "" ||
              [
                subject.code,
                subject.name,
                subject.yearLevel,
                normalizeSectionSemester(subject.semester),
                getSubjectTypeLabel(subject),
                subject.units ? `${subject.units} units` : "",
              ]
                .join(" ")
                .toLowerCase()
                .includes(normalizedSearch);

            return matchesFilters && matchesSearch;
          },
        )
      : [];
  const selectedTransfereeLocked =
    Boolean(selectedAdmissionRequest) &&
    selectedAdmissionRequest?.status === "Approved" &&
    Boolean(
      selectedAdmissionRequest && isTransfereeAdmission(selectedAdmissionRequest),
    );
  const selectedTransfereeCreditedSubjects =
    selectedTransfereeEvaluation && selectedTransfereeCreditSubjects.length > 0
      ? selectedTransfereeCreditSubjects.filter((subject) =>
          selectedTransfereeEvaluation.creditedSubjectIds.includes(subject.id),
        )
      : [];
  const selectedTransfereeAssignedSubjects =
    selectedTransfereeEvaluation && selectedTransfereeAvailableSubjects.length > 0
      ? selectedTransfereeAvailableSubjects.filter((subject) =>
          selectedTransfereeEvaluation.assignedSubjectIds.includes(subject.id),
        )
      : [];
  const selectedTransfereeAssignableSubjects =
    selectedTransfereeEvaluation && selectedTransfereeAvailableSubjects.length > 0
      ? selectedTransfereeAvailableSubjects.filter(
          (subject) =>
            !selectedTransfereeEvaluation.creditedSubjectIds.includes(
              subject.id,
            ),
        )
      : [];
  const selectedTransfereeFilteredAssignableSubjects =
    selectedTransfereeAssignableSubjects.length > 0
      ? selectedTransfereeAssignableSubjects.filter((subject) => {
          const normalizedSearch = transfereeLoadSearchTerm.trim().toLowerCase();

          return (
            normalizedSearch === "" ||
            [
              subject.code,
              subject.name,
              subject.yearLevel,
              normalizeSectionSemester(subject.semester),
              getSubjectTypeLabel(subject),
              subject.units ? `${subject.units} units` : "",
            ]
              .join(" ")
              .toLowerCase()
              .includes(normalizedSearch)
          );
        })
      : [];
  const selectedTransfereeCreditSubjectGroups =
    selectedAdmissionRequest &&
    selectedTransfereeFilteredCreditSubjects.length > 0
      ? getProgramYearLevelOptions(selectedAdmissionRequest.program).flatMap(
          (yearLevel) =>
            sortSemesterValues(
              Array.from(
                new Set(
                  selectedTransfereeFilteredCreditSubjects
                    .filter((subject) => subject.yearLevel === yearLevel)
                    .map((subject) => normalizeSectionSemester(subject.semester)),
                ),
              ),
            ).map((semester) => ({
              yearLevel,
              semester,
              subjects: selectedTransfereeFilteredCreditSubjects.filter(
                (subject) =>
                  subject.yearLevel === yearLevel &&
                  normalizeSectionSemester(subject.semester) === semester,
              ),
            })),
        )
      : [];

  const startEditingSection = (section: ClassSection) => {
    setEditingSection(section);
    setNewSection({
      program: section.program,
      yearLevel: section.yearLevel,
      semester: normalizeSectionSemester(section.semester),
      strand:
        section.strand ||
        (section.program === "SHS" ? "ICT" : DEFAULT_COLLEGE_COURSE),
      section: section.section,
      maxCapacity: section.maxCapacity,
    });
  };

  const handleSaveSection = async () => {
    const normalizedSection = normalizeSectionLabel(newSection.section);
    const nextCapacity = Number(newSection.maxCapacity);

    if (!normalizedSection) {
      addToast("Section name is required.", "warning");
      return;
    }

    if (!Number.isFinite(nextCapacity) || nextCapacity < 1) {
      addToast("Max capacity must be at least 1.", "warning");
      return;
    }

    if (editingSection && nextCapacity < editingSection.currentEnrollees) {
      addToast(
        `Max capacity cannot be lower than the current enrollee count (${editingSection.currentEnrollees}).`,
        "error",
      );
      return;
    }

    const nextCode = buildSectionCode({
      program: editingSection?.program || newSection.program,
      yearLevel: newSection.yearLevel,
      strand: editingSection?.strand || newSection.strand,
      section: normalizedSection,
      existingCode: editingSection?.code,
      previousSection: editingSection?.section,
    });

    if (!nextCode) {
      addToast("Unable to build the section code.", "error");
      return;
    }

    const hasDuplicateCode = classSections.some(
      (section) =>
        section.id !== editingSection?.id &&
        section.code.toLowerCase() === nextCode.toLowerCase(),
    );

    if (hasDuplicateCode) {
      addToast(`Section ${nextCode} already exists.`, "error");
      return;
    }

    if (editingSection) {
      const nextSectionDraft: ClassSection = {
        ...editingSection,
        yearLevel: newSection.yearLevel,
        semester: normalizeSectionSemester(newSection.semester),
        section: normalizedSection,
        code: nextCode,
        maxCapacity: nextCapacity,
      };

      try {
        const savedUpdatedSection = await saveAcademicClassSection(
          currentBranch,
          nextSectionDraft,
        );
        const updatedSection: ClassSection = {
          ...savedUpdatedSection,
          isLocked: Boolean(nextSectionDraft.isLocked),
        };
        const nextSections = sortClassSections(
          classSections.map((section) =>
            section.id === editingSection.id ? updatedSection : section,
          ),
        );

        setClassSections(nextSections);
        writeBranchScopedData(
          storageScopes.classSections,
          currentBranch,
          nextSections,
        );

        if (editingSection.code !== nextCode) {
          setSectionAssignments((prev) =>
            prev.map((assignment) =>
              assignment.assignedSection === editingSection.code
                ? { ...assignment, assignedSection: nextCode }
                : assignment,
            ),
          );

          setSubjectAssignments((prev) =>
            prev.map((assignment) =>
              assignment.sectionId === editingSection.id
                ? { ...assignment, sectionCode: nextCode }
                : assignment,
            ),
          );

          setExpandedAssignmentSections((prev) => {
            if (!Object.prototype.hasOwnProperty.call(prev, editingSection.code)) {
              return prev;
            }

            const nextState = { ...prev, [nextCode]: prev[editingSection.code] };
            delete nextState[editingSection.code];
            return nextState;
          });

          syncStoredSectionCode(editingSection, nextCode);
        }

        setSelectedSection((prev) =>
          prev?.id === editingSection.id ? updatedSection : prev,
        );

        addToast(
          editingSection.code === nextCode
            ? `Updated ${editingSection.code}.`
            : `Renamed ${editingSection.code} to ${nextCode}.`,
          "success",
        );
        resetSectionForm();
      } catch (error) {
        console.error("Failed to save shared class section", error);
        addToast(
          error instanceof Error
            ? error.message
            : "Unable to save the shared class section.",
          "error",
        );
      }
      return;
    }

    const newSec: ClassSection = {
      id: `new_${Date.now()}`,
      code: nextCode,
      program: newSection.program,
      yearLevel: newSection.yearLevel,
      semester: normalizeSectionSemester(newSection.semester),
      strand: newSection.strand,
      section: normalizedSection,
      currentEnrollees: 0,
      maxCapacity: nextCapacity,
      enrolleeIds: [],
      isLocked: false,
    };

    try {
      const savedSectionResult = await saveAcademicClassSection(currentBranch, newSec);
      const savedSection: ClassSection = {
        ...savedSectionResult,
        isLocked: false,
      };
      const nextSections = sortClassSections([
        ...classSections.filter((section) => section.id !== savedSection.id),
        savedSection,
      ]);
      setClassSections(nextSections);
      writeBranchScopedData(
        storageScopes.classSections,
        currentBranch,
        nextSections,
      );
      resetSectionForm();
      addToast(`Section ${savedSection.code} added`, "success");
    } catch (error) {
      console.error("Failed to create shared class section", error);
      addToast(
        error instanceof Error
          ? error.message
          : "Unable to create the shared class section.",
        "error",
      );
    }
  };

  const assignEnrolleeToSection = (
    enrollee: Enrollee,
    sectionId: string,
  ) => {
    const section = classSections.find((s) => s.id === sectionId);

    if (!section) {
      return false;
    }

    if (isSectionLocked(section)) {
      addToast(`${section.code} is locked for new assignments.`, "warning");
      return false;
    }

    if (!requiresSectionAssignment(enrollee)) {
      addToast(
        `${enrollee.fullName} has an approved own-schedule request and does not need a section.`,
        "info",
      );
      return false;
    }

    const storedStudent = getActiveBranchStudents().find(
      (student) =>
        student.id === enrollee.studentNumber ||
        (enrollee.trackingNumber &&
          student.trackingNumber === enrollee.trackingNumber),
    );

    if (storedStudent?.section) {
      addToast(`${enrollee.fullName} is already assigned to a section.`, "info");
      return false;
    }

    if (!sectionMatchesEnrollee(section, enrollee)) {
      addToast(
        `${section.code} does not match ${enrollee.fullName}'s program or strand/course.`,
        "error",
      );
      return false;
    }

    const currentStudentCount = getSectionStudentCount(section.code);

    if (currentStudentCount >= section.maxCapacity) {
      addToast(`${section.code} is already full!`, "error");
      return false;
    }

    try {
      const sectionUpdateResult = syncStudentSection(enrollee, section.code);

      if (!sectionUpdateResult?.student) {
        addToast(
          `${enrollee.fullName} is not in the active student list yet.`,
          "warning",
        );
        return false;
      }
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : `Unable to assign ${enrollee.fullName} to ${section.code}.`,
        "error",
      );
      return false;
    }

    setPendingAssignments((prev) => prev.filter((item) => item.id !== enrollee.id));
    void loadClassSections().then((nextSections) => {
      void syncClassSectionsToSupabase(nextSections);
    });

    addToast(`${enrollee.fullName} assigned to ${section.code}`, "success");
    return true;
  };

  // Handle assign to section
  const handleAssignToSection = (enrolleeId: string, sectionId: string) => {
    const enrollee = pendingAssignments.find((e) => e.id === enrolleeId);

    if (!enrollee) {
      return;
    }

    assignEnrolleeToSection(enrollee, sectionId);
  };

  const autoAssignEnrollees = (
    candidates: Enrollee[],
    label = "students",
  ) => {
    const assignments: {
      enrollee: Enrollee;
      section: ClassSection;
    }[] = [];
    const updatedSections: ClassSection[] = classSections.map((section) => ({
      ...section,
      currentEnrollees: getSectionStudentCount(section.code),
      enrolleeIds: [] as string[],
    }));
    const unassignedStudents: Enrollee[] = [];

    for (const enrollee of candidates) {
      if (!enrollee.studentNumber) {
        unassignedStudents.push(enrollee);
        continue;
      }

      const matchingSections = updatedSections
        .filter(
          (section) =>
            !isSectionLocked(section) && sectionMatchesEnrollee(section, enrollee),
        )
        .sort((a, b) => a.section.localeCompare(b.section));

      let assignedSection = matchingSections.find(
        (section) => section.currentEnrollees < section.maxCapacity,
      );

      if (!assignedSection) {
        assignedSection = createAutoSectionForEnrollee(enrollee, matchingSections);
        assignedSection.currentEnrollees = 0;
        assignedSection.enrolleeIds = [];
        updatedSections.push(assignedSection);
      }

      if (!assignedSection) {
        unassignedStudents.push(enrollee);
        continue;
      }

      try {
        writeBranchScopedData(
          storageScopes.classSections,
          currentBranch,
          updatedSections,
        );
        const sectionUpdateResult = updateStoredStudentSection({
          branch: currentBranch,
          studentNumber: enrollee.studentNumber,
          trackingNumber: enrollee.trackingNumber,
          nextSectionCode: assignedSection.code,
        });

        if (!sectionUpdateResult?.student) {
          unassignedStudents.push(enrollee);
          continue;
        }

        const sectionIndex = updatedSections.findIndex(
          (section) => section.id === assignedSection.id,
        );

        if (sectionIndex !== -1) {
          updatedSections[sectionIndex] = {
            ...updatedSections[sectionIndex],
            currentEnrollees:
              updatedSections[sectionIndex].currentEnrollees + 1,
            enrolleeIds: [],
          };
        }

        assignments.push({ enrollee, section: assignedSection });
      } catch (error) {
        console.warn("Unable to auto-assign student section", error);
        unassignedStudents.push(enrollee);
      }
    }

    if (assignments.length === 0) {
      addToast(`No ${label} were assigned to sections.`, "warning");
      return;
    }

    setPendingAssignments(unassignedStudents);
    assignments.forEach(({ enrollee }) => {
      if (enrollee.studentNumber) {
        void syncStoredStudentsToSupabase([enrollee.studentNumber]);
      }
    });
    void loadClassSections().then((nextSections) => {
      void syncClassSectionsToSupabase(nextSections);
    });

    addToast(
      unassignedStudents.length > 0
        ? `Assigned ${assignments.length} ${label}. ${unassignedStudents.length} still need review.`
        : `Assigned ${assignments.length} ${label} to sections.`,
      unassignedStudents.length > 0 ? "warning" : "success",
    );
  };

  // Handle auto-assign all
  const handleAutoAssignAll = () => {
    autoAssignEnrollees(
      pendingAssignments.filter(
        (enrollee) =>
          !isTransfereeAdmission(enrollee) && requiresSectionAssignment(enrollee),
      ),
      "students",
    );
  };

  const handleAutoAssignTransferees = () => {
    autoAssignEnrollees(
      pendingAssignments.filter(
        (enrollee) =>
          isTransfereeAdmission(enrollee) && requiresSectionAssignment(enrollee),
      ),
      "transferees",
    );
  };

  const openMoveStudentsModal = () => {
    setMoveStudentSearchTerm("");
    setSelectedMoveStudentId("");
    setPendingMoveSectionCode("");
    setMoveStudentFeedback(null);
    setShowMoveStudentsModal(true);
  };

  const closeMoveStudentsModal = () => {
    setShowMoveStudentsModal(false);
    setMoveStudentSearchTerm("");
    setSelectedMoveStudentId("");
    setPendingMoveSectionCode("");
    setMoveStudentFeedback(null);
  };

  const handleDeleteSection = async (section: ClassSection) => {
    const normalizedSectionCode = normalizeSectionCodeValue(section.code);
    const linkedActiveStudents = getStudentsForBranch(currentBranch).filter(
      (student) =>
        student.status !== "Archived" &&
        normalizeSectionCodeValue(student.section) === normalizedSectionCode,
    );
    const linkedSectionAssignmentCount = sectionAssignments.filter(
      (assignment) =>
        normalizeSectionCodeValue(assignment.assignedSection) ===
        normalizedSectionCode,
    ).length;
    const linkedStudentCount = Math.max(
      linkedActiveStudents.length,
      linkedSectionAssignmentCount,
      section.enrolleeIds.length,
    );

    const linkedSubjectAssignments = subjectAssignments.filter(
      (assignment) =>
        assignment.sectionId === section.id ||
        normalizeSectionCodeValue(assignment.sectionCode) ===
          normalizedSectionCode,
    );
    const shouldDelete = window.confirm(
      [
        `Delete section ${section.code}?`,
        linkedStudentCount > 0
          ? `${linkedStudentCount} linked student${linkedStudentCount === 1 ? "" : "s"} will be removed from this section.`
          : "",
        linkedSubjectAssignments.length > 0
          ? `${linkedSubjectAssignments.length} linked subject assignment${linkedSubjectAssignments.length === 1 ? "" : "s"} will also be removed.`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    if (!shouldDelete) {
      return;
    }

    try {
      await deleteAcademicClassSection(currentBranch, section.id);

      const deletedAssignmentIds = new Set(
        linkedSubjectAssignments.map((assignment) => assignment.id),
      );

      const nextSections = classSections.filter((item) => item.id !== section.id);
      setClassSections(nextSections);
      writeBranchScopedData(
        storageScopes.classSections,
        currentBranch,
        nextSections,
      );
      const linkedStudentNumbers = linkedActiveStudents.map((student) => student.id);

      if (linkedStudentNumbers.length > 0) {
        const linkedStudentNumberSet = new Set(linkedStudentNumbers);
        const storedStudents = readStoredStudents();
        const nextStudents = storedStudents.map((student) =>
          normalizeBranchName(student.branch) === currentBranch &&
          linkedStudentNumberSet.has(student.id) &&
          normalizeSectionCodeValue(student.section) === normalizedSectionCode
            ? { ...student, section: "" }
            : student,
        );

        writeStoredStudents(nextStudents);
        void syncStoredStudentsToSupabase(linkedStudentNumbers);
      }

      const nextSectionAssignments = sectionAssignments.filter(
        (assignment) =>
          normalizeSectionCodeValue(assignment.assignedSection) !==
          normalizedSectionCode,
      );
      setSectionAssignments(nextSectionAssignments);
      writeBranchScopedData(
        storageScopes.sectionAssignments,
        currentBranch,
        nextSectionAssignments,
      );
      setSubjectAssignments((prev) =>
        prev.filter((assignment) => !deletedAssignmentIds.has(assignment.id)),
      );
      setSelectedAssignmentIds((prev) =>
        prev.filter((assignmentId) => !deletedAssignmentIds.has(assignmentId)),
      );
      setPendingAssignmentDeleteIds((prev) =>
        prev.filter((assignmentId) => !deletedAssignmentIds.has(assignmentId)),
      );
      setExpandedAssignmentSections((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, section.code)) {
          return prev;
        }

        const nextState = { ...prev };
        delete nextState[section.code];
        return nextState;
      });
      setAssignmentAutoAssignSection((prev) =>
        prev?.id === section.id ? null : prev,
      );

      if (editingSection?.id === section.id) {
        resetSectionForm();
      }

      if (selectedSection?.id === section.id) {
        setSelectedSection(null);
        setShowSectionStudents(false);
      }

      addToast(
        linkedSubjectAssignments.length > 0
          ? `Deleted ${section.code} and removed ${linkedSubjectAssignments.length} linked subject assignment${linkedSubjectAssignments.length === 1 ? "" : "s"}.`
          : `Deleted ${section.code}.`,
        "success",
      );
    } catch (error) {
      console.error("Failed to delete shared class section", error);
      addToast(
        error instanceof Error
          ? error.message
          : "Unable to delete the shared class section.",
        "error",
      );
    }
  };

  const handleToggleSectionLock = async (section: ClassSection) => {
    const nextLocked = !isSectionLocked(section);
    const nextSection = { ...section, isLocked: nextLocked };
    const nextSections = sortClassSections(
      classSections.map((item) =>
        item.id === section.id ? nextSection : item,
      ),
    );

    setClassSections(nextSections);
    writeBranchScopedData(
      storageScopes.classSections,
      currentBranch,
      nextSections,
    );
    setSelectedSection((prev) => (prev?.id === section.id ? nextSection : prev));

    try {
      await saveAcademicClassSection(currentBranch, nextSection);
    } catch (error) {
      console.warn("Unable to sync section lock state to Supabase.", error);
    }

    addToast(
      `${section.code} ${nextLocked ? "locked" : "unlocked"} for new assignments.`,
      "success",
    );
  };

  const handleRemoveStudentFromSection = async ({
    studentNumber,
    name,
  }: {
    studentNumber: string;
    name: string;
  }) => {
    if (!selectedSection) {
      return;
    }

    const shouldRemove = window.confirm(
      `Remove ${name} from ${selectedSection.code}? The student will become unassigned.`,
    );

    if (!shouldRemove) {
      return;
    }

    const normalizedSectionCode = normalizeSectionCodeValue(selectedSection.code);
    const storedStudents = readStoredStudents();
    const nextStudents = storedStudents.map((student) =>
      normalizeBranchName(student.branch) === currentBranch &&
      student.id === studentNumber &&
      normalizeSectionCodeValue(student.section) === normalizedSectionCode
        ? { ...student, section: "" }
        : student,
    );

    writeStoredStudents(nextStudents);
    void syncStoredStudentsToSupabase([studentNumber]);
    const nextSectionAssignments = sectionAssignments.filter(
      (assignment) =>
        !(
          assignment.enrolleeId === studentNumber &&
          normalizeSectionCodeValue(assignment.assignedSection) ===
            normalizedSectionCode
        ),
    );
    setSectionAssignments(nextSectionAssignments);
    writeBranchScopedData(
      storageScopes.sectionAssignments,
      currentBranch,
      nextSectionAssignments,
    );
    const nextSections = await loadClassSections();
    void syncClassSectionsToSupabase(nextSections);
    setSelectedSection(
      nextSections.find((section) => section.id === selectedSection.id) ??
        selectedSection,
    );
    addToast(`${name} removed from ${selectedSection.code}.`, "success");
  };

  const handleApplyStudentMove = async () => {
    if (!selectedMoveStudent) {
      return;
    }

    const normalizedSectionCode = pendingMoveSectionCode.trim();
    if (!normalizedSectionCode) {
      setMoveStudentFeedback({
        type: "warning",
        message: "Choose a section before moving this student.",
      });
      return;
    }

    if (isSectionChoiceLocked(normalizedSectionCode)) {
      setMoveStudentFeedback({
        type: "warning",
        message: `${normalizedSectionCode} is locked for new assignments.`,
      });
      return;
    }

    setIsSavingMoveStudent(true);

    try {
      const updateResult = updateStoredStudentSection({
        branch: selectedMoveStudent.branch || currentBranch,
        studentNumber: selectedMoveStudent.id,
        trackingNumber: selectedMoveStudent.trackingNumber,
        nextSectionCode: normalizedSectionCode,
      });

      if (!updateResult) {
        throw new Error("No linked student record was found for this update.");
      }

      const nextSections = await loadClassSections();
      void syncStoredStudentsToSupabase([selectedMoveStudent.id]);
      void syncClassSectionsToSupabase(nextSections);
      setPendingMoveSectionCode(updateResult.nextSection);
      setMoveStudentFeedback(
        updateResult.didChange
          ? {
              type: "success",
              message: updateResult.previousSection
                ? `${selectedMoveStudent.name} moved from ${updateResult.previousSection} to ${updateResult.nextSection}.`
                : `${selectedMoveStudent.name} assigned to ${updateResult.nextSection}.`,
            }
          : {
              type: "warning",
              message: `${selectedMoveStudent.name} is already assigned to ${updateResult.nextSection}.`,
            },
      );
    } catch (error) {
      console.error("Failed to move student section", error);
      setMoveStudentFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to update the student's section.",
      });
    } finally {
      setIsSavingMoveStudent(false);
    }
  };

  const viewSectionStudents = (section: ClassSection) => {
    setSelectedSection(section);
    setShowSectionStudents(true);
  };

  // Load enrollment requests
  const loadEnrollmentRequests = async () => {
    setIsLoading(true);
    try {
      const cachedRequests = readEnrollmentRequestsForBranch(currentBranch);
      const storedRequests = await fetchEnrollmentRequests(currentBranch).catch(
        (error) => {
          if (cachedRequests.length > 0) {
            console.warn(
              "Unable to fetch shared enrollment requests. Using cached requests instead.",
              error,
            );
            return cachedRequests;
          }

          throw error;
        },
      );
      const hydratedRequests = await Promise.all(
        storedRequests.map(hydrateEnrollmentRequestRecordAttachments),
      );

      if (hydratedRequests.length > 0) {
        setEnrollmentRequests(
          hydratedRequests.map((request) => ({
            ...request,
            semester: normalizeSectionSemester(request.semester),
            currentSemester: request.currentSemester
              ? normalizeSectionSemester(request.currentSemester)
              : request.currentSemester,
          })),
        );
      } else {
        setEnrollmentRequests([]);
      }
    } catch (error) {
      console.error("Failed to load enrollment requests", error);
      addToast("Unable to load enrollment requests.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const loadEnrollees = async (): Promise<Enrollee[]> => {
    setIsLoading(true);
    const storedEnrollees = stripLegacyMockAdmissionRecords(
      readBranchScopedData<Enrollee[]>(storageScopes.enrollees, currentBranch) ??
        [],
    ) as Enrollee[];

    try {
      const supabaseApplicants = (await fetchSupabaseAdmissionApplicants(
        currentBranch,
      )) as Enrollee[];
      const mergedEnrollees = mergeAdminEnrolleeRecords(
        supabaseApplicants,
        storedEnrollees,
      ) as Enrollee[];

      const syncedApprovedEnrollees = await Promise.all(
        mergedEnrollees.map(async (enrollee) => {
          if (
            enrollee.archivedAt ||
            enrollee.status !== "Approved" ||
            !enrollee.trackingNumber
          ) {
            return enrollee;
          }

          try {
            const activatedStudent = await activateApprovedStudent(
              enrollee.trackingNumber,
            );
            const nextStudentNumber =
              activatedStudent.studentNumber || enrollee.studentNumber;

            if (
              enrollee.requestedOwnSchedule ||
              enrollee.ownScheduleRequestStatus
            ) {
              try {
                await saveStudentPlanningState({
                  branch: enrollee.branch || currentBranch,
                  studentNumber: nextStudentNumber || enrollee.trackingNumber,
                  trackingNumber: enrollee.trackingNumber,
                  requestedOwnSchedule: Boolean(enrollee.requestedOwnSchedule),
                  ownScheduleRequestStatus: enrollee.ownScheduleRequestStatus,
                  ownScheduleAcademicYear: enrollee.ownScheduleAcademicYear,
                  ownScheduleSemester: enrollee.ownScheduleSemester,
                  ownScheduleSelectionStatus:
                    enrollee.ownScheduleRequestStatus === "Approved"
                      ? "Not Submitted"
                      : undefined,
                });
              } catch (planningSyncError) {
                console.warn(
                  "Unable to refresh the approved own-schedule admission state.",
                  planningSyncError,
                );
              }
            }

            return {
              ...enrollee,
              studentNumber: nextStudentNumber,
            };
          } catch (error) {
            console.warn(
              "Unable to sync approved enrollee to Supabase student portal record.",
              error,
            );
            return enrollee;
          }
        }),
      );

      setEnrollees(syncedApprovedEnrollees);
      return syncedApprovedEnrollees;
    } catch (error) {
      console.error("Failed to fetch enrollees", error);
      setEnrollees(storedEnrollees);
      return storedEnrollees;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(storageScopes.enrollees, currentBranch, enrollees);
  }, [currentBranch, enrollees, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeEnrollmentRequestsForBranch(currentBranch, enrollmentRequests);
  }, [currentBranch, enrollmentRequests, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.transfereeEvaluations,
      currentBranch,
      transfereeEvaluations,
    );
  }, [currentBranch, transfereeEvaluations, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.studentSubjectPlans,
      currentBranch,
      studentSubjectPlans,
    );
  }, [currentBranch, studentSubjectPlans, hasInitializedBranchData]);

  useEffect(() => {
    const initializeBranchData = async () => {
      const storedSectionAssignments = readBranchScopedData<
        SectionAssignment[]
      >(storageScopes.sectionAssignments, currentBranch);
      const storedTransfereeEvaluations = readBranchScopedData<
        Record<string, TransfereeEvaluationRecord>
      >(storageScopes.transfereeEvaluations, currentBranch);
      const storedStudentSubjectPlans = readBranchScopedData<
        Record<string, StudentSubjectPlanRecord>
      >(storageScopes.studentSubjectPlans, currentBranch);
      const storedAssignmentRooms = readBranchScopedData<string[]>(
        storageScopes.assignmentRooms,
        currentBranch,
      );
      const storedInstructorDepartments = readBranchScopedData<string[]>(
        storageScopes.instructorDepartments,
        currentBranch,
      );
      let remoteAcademicSnapshot: AcademicSnapshot | null = null;
      let remoteStudentSubjectPlans: Record<string, StudentSubjectPlanRecord> | null =
        null;

      try {
        remoteAcademicSnapshot = await fetchAcademicSnapshot(currentBranch);
      } catch (error) {
        console.warn("Unable to fetch shared academic data from Supabase.", error);
      }

      try {
        remoteStudentSubjectPlans = await fetchStudentSubjectPlans(currentBranch);
      } catch (error) {
        console.warn("Unable to fetch shared student subject plans.", error);
      }

      try {
        const remoteStudents = await fetchAdminStudents(currentBranch);
        mergeBranchStudentsIntoLocalCache(remoteStudents);
      } catch (error) {
        console.warn("Unable to fetch shared student records from Supabase.", error);
      }

      setTransfereeEvaluations(storedTransfereeEvaluations ?? {});
      setStudentSubjectPlans(remoteStudentSubjectPlans ?? storedStudentSubjectPlans ?? {});

      const fallbackRooms = getUniqueTrimmedValues(storedAssignmentRooms ?? []);
      const remoteRooms = getUniqueTrimmedValues(
        remoteAcademicSnapshot?.assignmentRooms ?? [],
      );
      const resolvedRoomOptions =
        remoteRooms.length > 0 ? remoteRooms : fallbackRooms;
      setCustomAssignmentRooms(resolvedRoomOptions);

      await loadEnrollmentRequests();
      const loadedEnrollees = await loadEnrollees();
      const loadedSections = await loadClassSections(
        remoteAcademicSnapshot?.classSections,
      );
      const loadedSubjects = await loadSubjects(remoteAcademicSnapshot?.subjects);
      const loadedInstructors = await loadInstructors(
        remoteAcademicSnapshot?.instructors,
      );
      setInstructorDepartments(
        getUniqueTrimmedValues([
          ...(storedInstructorDepartments ?? []),
          ...loadedInstructors.map((instructor) => instructor.department),
        ]),
      );
      const loadedAssignments = await loadSubjectAssignments(
        remoteAcademicSnapshot?.subjectAssignments,
      );

      const sharedSectionAssignments = buildSectionAssignmentsFromSections(
        loadedSections,
        loadedEnrollees,
      );
      const derivedSectionAssignments =
        sharedSectionAssignments.length > 0
          ? sharedSectionAssignments
          : storedSectionAssignments && storedSectionAssignments.length > 0
            ? storedSectionAssignments
            : [];
      setSectionAssignments(derivedSectionAssignments);

      if (remoteAcademicSnapshot) {
        const snapshotToSeed: Partial<AcademicSnapshot> = {
          subjects:
            remoteAcademicSnapshot.subjects.length === 0 ? loadedSubjects : [],
          instructors:
            remoteAcademicSnapshot.instructors.length === 0
              ? loadedInstructors
              : [],
          classSections:
            remoteAcademicSnapshot.classSections.length === 0
              ? loadedSections
              : [],
          subjectAssignments:
            remoteAcademicSnapshot.subjectAssignments.length === 0
              ? loadedAssignments
              : [],
          assignmentRooms:
            remoteAcademicSnapshot.assignmentRooms.length === 0
              ? resolvedRoomOptions
              : [],
        };

        if (hasAcademicSnapshotData(snapshotToSeed)) {
          try {
            await seedAcademicSnapshot(currentBranch, snapshotToSeed);
          } catch (error) {
            console.warn("Unable to seed shared academic data in Supabase.", error);
          }
        }
      }

      setHasInitializedBranchData(true);
    };

    setHasInitializedBranchData(false);
    void initializeBranchData();
  }, [currentBranch]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.classSections,
      currentBranch,
      classSections,
    );
  }, [classSections, currentBranch, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.sectionAssignments,
      currentBranch,
      sectionAssignments,
    );
  }, [currentBranch, sectionAssignments, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(storageScopes.subjects, currentBranch, subjects);
  }, [currentBranch, subjects, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.instructors,
      currentBranch,
      instructors,
    );
  }, [currentBranch, instructors, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.instructorDepartments,
      currentBranch,
      instructorDepartmentOptions,
    );
  }, [
    currentBranch,
    hasInitializedBranchData,
    instructorDepartmentOptions,
    storageScopes.instructorDepartments,
  ]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.subjectAssignments,
      currentBranch,
      subjectAssignments,
    );
  }, [currentBranch, subjectAssignments, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.assignmentRooms,
      currentBranch,
      customAssignmentRooms,
    );
  }, [currentBranch, customAssignmentRooms, hasInitializedBranchData]);

  useEffect(() => {
    updatePendingAssignments();
  }, [currentBranch, enrollees, sectionAssignments]);

  const handleAttachmentStatusUpdate = async (
    requestId: string,
    attachmentIndex: number,
    status: Attachment["reviewStatus"],
  ) => {
    if (!status) return;

    const request = enrollmentRequests.find((r) => r.id === requestId);
    const enrollee = enrollees.find((record) => record.id === requestId);
    const updatedAt = new Date().toISOString();
    const sourceAttachments = request?.attachments || enrollee?.attachments;

    if (!sourceAttachments) {
      addToast("Unable to update attachment status.", "error");
      return;
    }

    const affectedAttachment = sourceAttachments[attachmentIndex];
    const shouldRequestAdmissionRedo = !request && !!enrollee && status === "Rejected";

    if (shouldRequestAdmissionRedo && affectedAttachment?.name) {
      try {
        await updateAdmissionProgress({
          trackingNumber: enrollee.trackingNumber,
          currentStep: 3,
          applicationStatus: "draft",
          rejectionReason: `${affectedAttachment.name} needs to be reuploaded.`,
        });
      } catch (error) {
        console.error("Failed to reopen admission requirements", error);
        addToast(
          "Unable to reopen the applicant's requirements page right now.",
          "error",
        );
        return;
      }
    }

    const updatedAttachments = sourceAttachments.map((attachment, index) =>
      index === attachmentIndex
        ? { ...attachment, reviewStatus: status }
        : attachment,
    );

    let savedRequest: EnrollmentRequest | null = null;

    if (request) {
      try {
        savedRequest = await saveEnrollmentRequest({
          ...request,
          attachments: updatedAttachments,
          updatedAt,
        });
      } catch (error) {
        console.error("Failed to save enrollment request attachment review", error);
        addToast("Unable to update the enrollment requirement right now.", "error");
        return;
      }

      setEnrollmentRequests((prevRequests) =>
        prevRequests.map((record) =>
          record.id === requestId ? savedRequest || record : record,
        ),
      );
    }

    if (enrollee) {
      setEnrollees((prevEnrollees) =>
        prevEnrollees.map((record) =>
          record.id === requestId
            ? {
                ...record,
                attachments: updatedAttachments,
                ...(shouldRequestAdmissionRedo
                  ? {
                      status: "Pending" as const,
                      rejectionReason: `${affectedAttachment?.name ?? "Credential"} needs to be reuploaded.`,
                    }
                  : {}),
              }
            : record,
        ),
      );
    }

    if (selectedRequest?.id === requestId) {
      setSelectedRequest((prev) =>
        prev
          ? savedRequest && isEnrollmentRequest(prev)
            ? savedRequest
            : {
                ...prev,
                attachments: updatedAttachments,
                ...(shouldRequestAdmissionRedo
                  ? {
                      status: "Pending" as const,
                      rejectionReason: `${affectedAttachment?.name ?? "Credential"} needs to be reuploaded.`,
                    }
                  : {}),
                ...(request ? { updatedAt } : {}),
              }
          : null,
      );
    }

    if (shouldRequestAdmissionRedo && affectedAttachment?.name) {
      const applicantEmail = enrollee.personalInfo.email?.trim();
      if (!applicantEmail) {
        addToast(
          "Requirement marked for redo, but this applicant has no email address on file.",
          "warning",
        );
        return;
      }

      try {
        const notificationResult =
          await sendAdmissionRequirementRedoNotification({
            trackingNumber: enrollee.trackingNumber,
            requirementName: affectedAttachment.name,
            email: applicantEmail,
            mobile: enrollee.personalInfo.contactNumber,
            firstName: enrollee.personalInfo.fullName.split(" ")[0],
            lastName: enrollee.fullName.split(" ").slice(-1)[0],
          });

        switch (notificationResult.deliveries.email.status) {
          case "sent":
            addToast(
              `Requirement marked for redo. Email sent to ${enrollee.fullName}.`,
              "success",
            );
            return;
          case "failed":
            addToast(
              "Requirement marked for redo, but the email could not be sent right now.",
              "warning",
            );
            return;
          default:
            addToast(
              "Requirement marked for redo. Email delivery is not configured yet.",
              "warning",
            );
            return;
        }
      } catch (error) {
        console.error("Failed to send requirement redo notification", error);
        const notificationMessage =
          error instanceof Error ? error.message : "Email notification failed.";
        addToast(
          `Requirement marked for redo, but the email notification failed: ${notificationMessage}`,
          "warning",
        );
        return;
      }
    }

    addToast(
      `Requirement ${status === "Approved" ? "approved" : "marked for redo"} successfully!`,
      "success",
    );
  };

  const handleReviewRequirements = (request: EnrollmentRequest | Enrollee) => {
    setSelectedRequest(request);
    if (!isEnrollmentRequest(request) && isTransfereeAdmission(request)) {
      setTransfereeEvaluations((prev) => ({
        ...prev,
        [request.id]: normalizeTransfereeEvaluation(
          request,
          prev[request.id],
          reflectedAcademicYear,
        ),
      }));
    }
    if (!isEnrollmentRequest(request) && request.program === "College") {
      setPendingScholarshipScore(
        typeof request.scholarshipExamScore === "number"
          ? String(request.scholarshipExamScore)
          : "",
      );
      return;
    }

    setPendingScholarshipScore("");
  };

  const closeReviewModal = () => {
    setSelectedRequest(null);
    setPendingScholarshipScore("");
  };

  const closeConfirmModal = () => {
    setIsConfirmModalOpen(false);
    setSelectedAction(null);
    setSelectedRejectionReason("");
  };

  const handleOwnScheduleRequestDecision = (
    enrollee: Enrollee,
    status: "Approved" | "Rejected",
  ) => {
    const updatedEnrollee: Enrollee = {
      ...enrollee,
      ownScheduleRequestStatus: status,
      ownScheduleAcademicYear:
        status === "Approved"
          ? resolveOwnScheduleAcademicYear(enrollee)
          : undefined,
      ownScheduleSemester:
        status === "Approved"
          ? resolveOwnScheduleSemester(enrollee)
          : undefined,
      ownScheduleDecisionAt: new Date().toISOString(),
    };

    setEnrollees((prev) =>
      prev.map((record) => (record.id === enrollee.id ? updatedEnrollee : record)),
    );
    setSelectedRequest((prev) =>
      prev && !isEnrollmentRequest(prev) && prev.id === enrollee.id
        ? updatedEnrollee
        : prev,
    );
    addToast(
      status === "Approved"
        ? "Own schedule request approved. Admission can now proceed as irregular once accepted."
        : "Own schedule request declined. The applicant will continue under the standard schedule flow.",
      status === "Approved" ? "success" : "warning",
    );
  };

  const handleApproveRequest = (request: EnrollmentRequest | Enrollee) => {
    let scholarshipExamScore: number | null = null;

    if (isEnrollmentRequest(request)) {
      if (hasRedoRequirement(request)) {
        addToast(
          "The student must resend the requirement marked for redo before this enrollment request can be approved.",
          "warning",
        );
        return false;
      }

      const requestedScheduleConflicts = buildScheduledAssignmentConflicts(
        getEnrollmentRequestScheduledAssignments(request),
      );

      if (
        request.irregularRequest?.mode === "section_assignment" &&
        !getRequestedSectionForEnrollmentRequest(request)
      ) {
        addToast(
          "The requested section is no longer available. Review the section request before approval.",
          "warning",
        );
        return false;
      }

      if (
        request.irregularRequest?.mode === "section_assignment" &&
        isSectionLocked(getRequestedSectionForEnrollmentRequest(request))
      ) {
        addToast(
          "The requested section is locked for new assignments.",
          "warning",
        );
        return false;
      }

      if (requestedScheduleConflicts.length > 0) {
        addToast(
          "Resolve the requested enrollment load conflicts before approval.",
          "warning",
        );
        return false;
      }
    }

    if (!isEnrollmentRequest(request) && isTransfereeAdmission(request)) {
      const evaluation = getTransfereeEvaluation(request);

      if (!isTransfereeEvaluationComplete(evaluation)) {
        addToast(
          "Complete the transferee validation checklist before approval.",
          "warning",
        );
        return false;
      }
    }

    if (
      !isEnrollmentRequest(request) &&
      request.requestedOwnSchedule &&
      request.ownScheduleRequestStatus !== "Approved"
    ) {
      addToast(
        "Review the own schedule request first before approving the admission.",
        "warning",
      );
      return false;
    }

    if (!isEnrollmentRequest(request) && request.program === "College") {
      const trimmedScore = pendingScholarshipScore.trim();

      if (trimmedScore !== "") {
        const parsedScore = Number(trimmedScore);

        if (
          !Number.isFinite(parsedScore) ||
          parsedScore < 0 ||
          parsedScore > SCHOLARSHIP_EXAM_MAX_SCORE
        ) {
          addToast(
            `Scholarship exam score must be a number from 0 to ${SCHOLARSHIP_EXAM_MAX_SCORE}.`,
            "warning",
          );
          return false;
        }

        scholarshipExamScore = parsedScore;
      }
    }

    setSelectedAction({
      id: request.id,
      action: "approve",
      scholarshipExamScore,
    });
    setIsConfirmModalOpen(true);
    return true;
  };

  const handleRejectRequest = (requestId: string) => {
    const existingReason =
      enrollmentRequests.find((request) => request.id === requestId)
        ?.rejectionReason ??
      enrollees.find((enrollee) => enrollee.id === requestId)?.rejectionReason ??
      "";

    setSelectedRejectionReason(existingReason);
    setSelectedAction({ id: requestId, action: "reject" });
    setIsConfirmModalOpen(true);
  };

  const confirmAction = async () => {
    if (!selectedAction) return;
    const rejectionReason =
      selectedAction.action === "reject"
        ? selectedRejectionReason.trim()
        : "";

    if (selectedAction.action === "reject" && !rejectionReason) {
      addToast("Type a rejection reason before continuing.", "warning");
      return;
    }

    try {
      // Check if it's an enrollment request (existing student)
      const requestToUpdate = enrollmentRequests.find(
        (req) => req.id === selectedAction.id,
      );
      // Check if it's a new enrollee (applicant)
      const enrolleeToUpdate = enrollees.find(
        (e) => e.id === selectedAction.id,
      );

      if (!requestToUpdate) {
        if (enrolleeToUpdate) {
          const isApprove = selectedAction.action === "approve";
          let decisionNotificationFeedback: {
            message: string;
            type: Toast["type"];
          } | null = null;
          const transfereeEvaluation = isTransfereeAdmission(enrolleeToUpdate)
            ? getTransfereeEvaluation(enrolleeToUpdate)
            : null;
          const resolvedYearLevel =
            transfereeEvaluation?.resolvedYearLevel || enrolleeToUpdate.yearLevel;
          const resolvedPlacementAcademicYear =
            transfereeEvaluation
              ? transfereeEvaluation.plannedAcademicYear.trim() ||
                reflectedAcademicYear
              : enrolleeToUpdate.ownScheduleAcademicYear;
          const resolvedPlacementSemester = transfereeEvaluation
            ? normalizeSectionSemester(transfereeEvaluation.plannedSemester)
            : enrolleeToUpdate.ownScheduleSemester;
          const enrolleeForApproval: Enrollee = {
            ...enrolleeToUpdate,
            yearLevel: resolvedYearLevel,
            ownScheduleAcademicYear: resolvedPlacementAcademicYear,
            ownScheduleSemester: resolvedPlacementSemester,
            personalInfo: {
              ...enrolleeToUpdate.personalInfo,
              yearLevel: resolvedYearLevel,
            },
          };
          const resolvedScholarshipExamScore =
            selectedAction.scholarshipExamScore ??
            enrolleeForApproval.scholarshipExamScore ??
            null;
          const resolvedAdmissionTuition =
            enrolleeForApproval.program === "College"
              ? getEstimatedCollegeTuition({
                  honorLabel: enrolleeForApproval.honorLabel,
                  honorCertificateApproved: hasApprovedAttachmentNamed(
                    enrolleeForApproval.attachments,
                    "Honor Certificate",
                  ),
                  appliedForScholarship: enrolleeForApproval.appliedForScholarship,
                  scholarshipExamScore: resolvedScholarshipExamScore,
                })
              : null;

          let syncedStudentNumber = enrolleeForApproval.studentNumber;

          if (isApprove) {
            try {
              await updateAdmissionProgress({
                trackingNumber: enrolleeForApproval.trackingNumber,
                currentStep: 4,
                applicationStatus: "accepted",
                scholarshipExamScore: resolvedScholarshipExamScore,
                rejectionReason: "",
              });
            } catch (progressError) {
              console.warn(
                "Unable to save admission approval details to Supabase before activation.",
                progressError,
              );
            }

            try {
              const activatedStudent = await activateApprovedStudent(
                enrolleeForApproval.trackingNumber,
              );
              syncedStudentNumber =
                activatedStudent.studentNumber || syncedStudentNumber;
            } catch (activationError) {
              console.warn(
                "Unable to activate the approved student in Supabase, keeping local admin state.",
                activationError,
              );
            }
          } else {
            try {
              await updateAdmissionProgress({
                trackingNumber: enrolleeForApproval.trackingNumber,
                currentStep: 4,
                applicationStatus: "rejected",
                rejectionReason,
              });
            } catch (syncError) {
              console.warn(
                "Unable to sync admission rejection to Supabase, keeping local admin state.",
                syncError,
              );
            }
          }

          let promotedStudentRecord: StudentStorageRecord | null = null;
          const updatedEnrollee: Enrollee = isApprove
            ? (() => {
                const promotionResult = promoteApplicantToStoredStudent({
                  ...enrolleeForApproval,
                  studentNumber: syncedStudentNumber,
                  branch: currentBranch,
                  strandOrCourse: enrolleeForApproval.strandOrCourse || "",
                  studentStatus: enrolleeForApproval.studentStatus || "",
                  honorDiscountPercentage:
                    resolvedAdmissionTuition?.honorDiscountPercentage ?? 0,
                  scholarshipExamScore: resolvedScholarshipExamScore,
                  effectiveDiscountPercentage:
                    resolvedAdmissionTuition?.effectiveDiscountPercentage ?? 0,
                  effectiveDiscountSource:
                    resolvedAdmissionTuition?.effectiveDiscountSource ?? "none",
                  rejectionReason: undefined,
                });

                promotedStudentRecord = promotionResult.student;
                return { ...promotionResult.applicant };
              })()
            : {
                ...enrolleeToUpdate,
                status: "Rejected",
                rejectionReason,
              };

          if (promotedStudentRecord) {
            try {
              await saveAdminStudent(promotedStudentRecord);
            } catch (studentSyncError) {
              console.warn(
                "Unable to sync the approved admission student record to Supabase immediately.",
                studentSyncError,
              );
            }

            if (
              promotedStudentRecord.requestedOwnSchedule ||
              promotedStudentRecord.ownScheduleRequestStatus
            ) {
              try {
                await saveStudentPlanningState({
                  branch: promotedStudentRecord.branch,
                  studentNumber: promotedStudentRecord.id,
                  trackingNumber: promotedStudentRecord.trackingNumber,
                  requestedOwnSchedule: Boolean(
                    promotedStudentRecord.requestedOwnSchedule,
                  ),
                  ownScheduleRequestStatus:
                    promotedStudentRecord.ownScheduleRequestStatus,
                  ownScheduleAcademicYear:
                    promotedStudentRecord.ownScheduleAcademicYear,
                  ownScheduleSemester: promotedStudentRecord.ownScheduleSemester,
                  ownScheduleSelectionStatus:
                    promotedStudentRecord.ownScheduleSelectionStatus,
                });
              } catch (planningSyncError) {
                console.warn(
                  "Unable to sync the approved own-schedule admission state immediately.",
                  planningSyncError,
                );
              }
            }
          }

          setEnrollees((prev) =>
            prev.map((e) => (e.id === selectedAction.id ? updatedEnrollee : e)),
          );

          if (
            isApprove &&
            transfereeEvaluation &&
            isTransfereeAdmission(updatedEnrollee)
          ) {
            syncStudentSubjectPlan(updatedEnrollee, transfereeEvaluation);
          }

          if (
            isApprove &&
            transfereeEvaluation?.recommendedSectionId &&
            isTransfereeAdmission(updatedEnrollee)
          ) {
            assignEnrolleeToSection(
              updatedEnrollee,
              transfereeEvaluation.recommendedSectionId,
            );
          }

          if (isApprove) {
            const applicantEmail = updatedEnrollee.personalInfo.email?.trim();

            if (!updatedEnrollee.studentNumber) {
              decisionNotificationFeedback = {
                type: "warning",
                message:
                  "The approval email was skipped because no student number is available yet.",
              };
            } else if (!applicantEmail) {
              decisionNotificationFeedback = {
                type: "warning",
                message:
                  "The approval email was skipped because no applicant email is on file.",
              };
            } else {
              try {
                const notificationResult = await sendAdmissionDecisionNotification(
                  {
                    trackingNumber: updatedEnrollee.trackingNumber,
                    email: applicantEmail,
                    fullName: updatedEnrollee.fullName,
                    studentNumber: updatedEnrollee.studentNumber,
                    recordType: "admission",
                    decisionStatus: "accepted",
                    portalLink: buildStudentPortalLoginLink({
                      branch: currentBranch,
                      email: applicantEmail,
                      studentNumber: updatedEnrollee.studentNumber,
                    }),
                  },
                );
                decisionNotificationFeedback =
                  getApprovalNotificationFeedback(notificationResult);
              } catch (notificationError) {
                console.warn(
                  "Unable to send the admission approval email notification.",
                  notificationError,
                );
                decisionNotificationFeedback = {
                  type: "warning",
                  message:
                    "Admission approved, but the applicant email could not be sent right now.",
                };
              }
            }
          } else {
            const notificationPayload: SendAdmissionDecisionNotificationPayload =
              {
                trackingNumber: enrolleeForApproval.trackingNumber,
                email: enrolleeForApproval.personalInfo.email || undefined,
                fullName: enrolleeForApproval.fullName,
                recordType: "admission",
                decisionStatus: "rejected",
                decisionReason: rejectionReason,
              };

            try {
              const notificationResult = await sendAdmissionDecisionNotification(
                notificationPayload,
              );
              decisionNotificationFeedback = getDecisionNotificationFeedback(
                notificationResult,
                "Admission",
              );
            } catch (notificationError) {
              console.warn(
                "Unable to send the admission rejection email notification.",
                notificationError,
              );
              decisionNotificationFeedback = {
                type: "warning",
                message:
                  "Admission rejected, but the applicant email could not be sent right now.",
              };
            }
          }

          const approvedStudentNumberMessage = updatedEnrollee.studentNumber
            ? `Student number ${updatedEnrollee.studentNumber} is now active`
            : "The student number is still being finalized";

          addToast(
            isApprove
              ? updatedEnrollee.documentsSubmitted <
                updatedEnrollee.totalDocuments
                ? `Admission approved. ${approvedStudentNumberMessage} with ${updatedEnrollee.documentsSubmitted}/${updatedEnrollee.totalDocuments} credentials submitted.${decisionNotificationFeedback ? ` ${decisionNotificationFeedback.message}` : ""}`
                : `Admission approved successfully. ${approvedStudentNumberMessage}.${decisionNotificationFeedback ? ` ${decisionNotificationFeedback.message}` : ""}`
              : decisionNotificationFeedback?.message ||
                  "Admission rejected successfully.",
            isApprove
              ? decisionNotificationFeedback?.type || "success"
              : decisionNotificationFeedback?.type || "warning",
          );
        } else {
          addToast("Record not found.", "error");
        }
      } else {
        let decisionNotificationFeedback: {
          message: string;
          type: Toast["type"];
        } | null = null;

        if (selectedAction.action === "approve") {
          const requestedSection = getRequestedSectionForEnrollmentRequest(
            requestToUpdate,
          );
          const requestedScheduleConflicts = buildScheduledAssignmentConflicts(
            getEnrollmentRequestScheduledAssignments(requestToUpdate),
          );

          if (
            requestToUpdate.irregularRequest?.mode === "section_assignment" &&
            !requestedSection
          ) {
            addToast(
              "The requested section is no longer available for this enrollment request.",
              "warning",
            );
            return;
          }

          if (
            requestToUpdate.irregularRequest?.mode === "section_assignment" &&
            isSectionLocked(requestedSection)
          ) {
            addToast(
              "The requested section is locked for new assignments.",
              "warning",
            );
            return;
          }

          if (requestedScheduleConflicts.length > 0) {
            addToast(
              "This enrollment request still has conflicting requested schedules.",
              "warning",
            );
            return;
          }
        }

        const reviewedAt = new Date();
        const updatedRequest: EnrollmentRequest = {
          ...requestToUpdate,
          enrollmentStatus:
            selectedAction.action === "approve" ? "Approved" : "Rejected",
          enrollmentDate:
            selectedAction.action === "approve"
              ? reviewedAt.toLocaleDateString()
              : undefined,
          updatedAt: reviewedAt.toISOString(),
          rejectionReason:
            selectedAction.action === "reject" ? rejectionReason : undefined,
        };
        const savedRequest = await saveEnrollmentRequest(updatedRequest);

        if (selectedAction.action === "approve") {
          syncEnrollmentRequestSubjectPlan(
            savedRequest,
            reviewedAt.toISOString(),
          );
          const updatedStudentRecord =
            syncEnrollmentRequestStudentState(savedRequest);

          if (updatedStudentRecord) {
            try {
              await saveAdminStudent(updatedStudentRecord);
            } catch (syncError) {
              console.warn(
                "Unable to sync the approved enrollment update to Supabase immediately.",
                syncError,
              );
            }
          }
        }

        setEnrollmentRequests((prevRequests) =>
          prevRequests.map((req) =>
            req.id === selectedAction.id ? savedRequest : req,
          ),
        );

        if (selectedAction.action === "reject") {
          const storedStudents = readStoredStudents();
          const matchedStudent = storedStudents.find((student) => {
            const matchesBranch =
              normalizeBranchName(student.branch) === currentBranch;

            if (!matchesBranch) {
              return false;
            }

            if (
              requestToUpdate.trackingNumber &&
              student.trackingNumber === requestToUpdate.trackingNumber
            ) {
              return true;
            }

            return student.id === requestToUpdate.studentNumber;
          });

          if (matchedStudent?.email) {
            try {
              const notificationResult = await sendAdmissionDecisionNotification(
                {
                  trackingNumber: savedRequest.trackingNumber,
                  studentNumber: savedRequest.studentNumber,
                  email: matchedStudent.email,
                  fullName: savedRequest.fullName,
                  recordType: "enrollment",
                  decisionStatus: "rejected",
                  decisionReason: rejectionReason,
                },
              );
              decisionNotificationFeedback = getDecisionNotificationFeedback(
                notificationResult,
                "Enrollment request",
              );
            } catch (notificationError) {
              console.warn(
                "Unable to send the enrollment rejection email notification.",
                notificationError,
              );
              decisionNotificationFeedback = {
                type: "warning",
                message:
                  "Enrollment request rejected, but the student email could not be sent right now.",
              };
            }
          } else {
            decisionNotificationFeedback = {
              type: "warning",
              message:
                "Enrollment request rejected, but no student email is on file.",
            };
          }
        }

        addToast(
          selectedAction.action === "approve"
            ? "Enrollment request approved successfully!"
            : decisionNotificationFeedback?.message ||
                "Enrollment request rejected successfully!",
          selectedAction.action === "approve"
            ? "success"
            : decisionNotificationFeedback?.type || "warning",
        );
      }

      if (selectedRequest?.id === selectedAction.id) {
        closeReviewModal();
      }
    } catch (error) {
      console.error("Failed to process enrollment request:", error);
      addToast("Failed to process enrollment request.", "error");
    } finally {
      closeConfirmModal();
    }
  };

  const handleViewRequestDetails = (request: EnrollmentRequest) => {
    setSelectedRequest(request);
  };

  const activeEnrollees = enrollees.filter((enrollee) => !enrollee.archivedAt);
  const activeEnrollmentRequests = enrollmentRequests.filter(
    (request) => !request.archivedAt,
  );
  const regularAdmissions = activeEnrollees.filter(
    (enrollee) => !isTransfereeAdmission(enrollee),
  );
  const transfereeAdmissions = activeEnrollees.filter((enrollee) =>
    isTransfereeAdmission(enrollee),
  );
  const activeAdmissionRecords =
    activeTab === "transferees" ? transfereeAdmissions : regularAdmissions;
  const pendingRegularAssignments = pendingAssignments.filter(
    (enrollee) => !isTransfereeAdmission(enrollee),
  );
  const pendingTransfereeAssignments = pendingAssignments.filter((enrollee) =>
    isTransfereeAdmission(enrollee),
  );

  const filteredEnrollees = activeAdmissionRecords.filter((enrollee) => {
    const matchesSearch =
      enrollee.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollee.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollee.trackingNumber
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (enrollee.studentNumber || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (enrollee.strandOrCourse || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "All" || enrollee.status === statusFilter;
    const matchesOwnSchedule =
      !showOwnScheduleOnly || Boolean(enrollee.requestedOwnSchedule);
    return matchesSearch && matchesStatus && matchesOwnSchedule;
  });
  const totalEnrolleePages = Math.max(
    1,
    Math.ceil(filteredEnrollees.length / ENROLLEES_PER_PAGE),
  );
  const enrolleeStartIndex = (currentEnrolleePage - 1) * ENROLLEES_PER_PAGE;
  const enrolleeEndIndex = enrolleeStartIndex + ENROLLEES_PER_PAGE;
  const paginatedEnrollees = filteredEnrollees.slice(
    enrolleeStartIndex,
    enrolleeEndIndex,
  );
  const paginatedEnrolleeIds = paginatedEnrollees.map((enrollee) => enrollee.id);
  const selectedEnrolleeIdSet = new Set(selectedEnrolleeIds);
  const selectedFilteredEnrollees = filteredEnrollees.filter((enrollee) =>
    selectedEnrolleeIdSet.has(enrollee.id),
  );
  const allPaginatedEnrolleesSelected =
    paginatedEnrollees.length > 0 &&
    paginatedEnrollees.every((enrollee) => selectedEnrolleeIdSet.has(enrollee.id));

  const filteredRequests = activeEnrollmentRequests.filter((request) => {
    const matchesSearch =
      request.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.studentNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      enrollmentStatusFilter === "All" ||
      request.enrollmentStatus === enrollmentStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const filteredRequestIds = filteredRequests.map((request) => request.id);
  const selectedEnrollmentRequestIdSet = new Set(selectedEnrollmentRequestIds);
  const selectedFilteredEnrollmentRequests = filteredRequests.filter((request) =>
    selectedEnrollmentRequestIdSet.has(request.id),
  );
  const allFilteredEnrollmentRequestsSelected =
    filteredRequests.length > 0 &&
    filteredRequests.every((request) =>
      selectedEnrollmentRequestIdSet.has(request.id),
    );

  const selectedAdmissionActionRecord = selectedAction
    ? (activeEnrollees.find((enrollee) => enrollee.id === selectedAction.id) ??
      null)
    : null;
  const selectedEnrollmentActionRecord = selectedAction
    ? (enrollmentRequests.find((request) => request.id === selectedAction.id) ??
      null)
    : null;
  const selectedRequestHasEnrollmentRedoRequirement =
    selectedRequest &&
    isEnrollmentRequest(selectedRequest) &&
    hasRedoRequirement(selectedRequest);
  const selectedAdmissionActionEvaluation =
    selectedAdmissionActionRecord &&
    isTransfereeAdmission(selectedAdmissionActionRecord)
      ? getTransfereeEvaluation(selectedAdmissionActionRecord)
      : null;
  const subjectYearLevelOptions =
    subjectFilter.program === "College"
      ? ["1st Year", "2nd Year", "3rd Year", "4th Year"]
      : subjectFilter.program === "SHS"
        ? ["Grade 11", "Grade 12"]
        : [
            "1st Year",
            "2nd Year",
            "3rd Year",
            "4th Year",
            "Grade 11",
            "Grade 12",
          ];
  const subjectStrandCourseOptions = Array.from(
    new Set(
      subjects
        .filter(
          (subject) =>
            subjectFilter.program === "All" ||
            subject.program === subjectFilter.program,
        )
        .map(resolveSubjectStrandOrCourse)
        .filter((value) => value && value !== "All"),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const filteredInstructors = instructors.filter(
    (instructor) =>
      instructor.name.toLowerCase().includes(instructorSearch.toLowerCase()) ||
      instructor.employeeId
        .toLowerCase()
        .includes(instructorSearch.toLowerCase()) ||
      instructor.department
        .toLowerCase()
        .includes(instructorSearch.toLowerCase()),
  );

  const getAssignmentSectionCourseStrand = (section: ClassSection) =>
    section.program === "College"
      ? DEFAULT_COLLEGE_COURSE
      : section.strand || "All";
  const assignmentProgramSections = classSections.filter((section) =>
    assignmentFilter.program === "All"
      ? true
      : section.program === assignmentFilter.program,
  );
  const assignmentCourseStrandOptions = Array.from(
    new Set(
      assignmentProgramSections
        .map(getAssignmentSectionCourseStrand)
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const assignmentCourseStrandSections = assignmentProgramSections.filter(
    (section) =>
      assignmentFilter.strandOrCourse === "All"
        ? true
        : getAssignmentSectionCourseStrand(section) ===
          assignmentFilter.strandOrCourse,
  );
  const assignmentSemesterOptions = sortSemesterValues(
    Array.from(
      new Set(
        assignmentCourseStrandSections.map((section) =>
          normalizeSectionSemester(section.semester),
        ),
      ),
    ),
  );
  const filteredAssignmentSections = assignmentCourseStrandSections.filter(
    (section) =>
      assignmentFilter.semester === "All"
        ? true
        : normalizeSectionSemester(section.semester) ===
          normalizeSectionSemester(assignmentFilter.semester),
  );
  const filteredAssignmentSectionCodes = new Set(
    filteredAssignmentSections.map((section) => section.code),
  );
  const filteredAssignments = subjectAssignments.filter((assignment) => {
    if (!filteredAssignmentSectionCodes.has(assignment.sectionCode)) {
      return false;
    }

    if (
      assignmentFilter.semester !== "All" &&
      normalizeSectionSemester(assignment.semester) !==
        normalizeSectionSemester(assignmentFilter.semester)
    ) {
      return false;
    }

    return true;
  });
  const instructorEvaluationSummaries = instructors
    .map((instructor, index) => {
      const instructorAssignments = subjectAssignments.filter(
        (assignment) => assignment.instructorId === instructor.id,
      );
      const sections = Array.from(
        new Set(instructorAssignments.map((assignment) => assignment.sectionCode)),
      );
      void index;
      const submissions = evaluationSubmissions.filter(
        (submission) => submission.instructorId === instructor.id,
      );

      return {
        instructor,
        assignments: instructorAssignments,
        sections,
        responseCount: submissions.length,
        submissions,
        isOpen:
          instructorAssignments.length > 0 &&
          Boolean(evaluationStatuses[instructor.id]?.isOpen),
      };
    })
    .sort((left, right) => left.instructor.name.localeCompare(right.instructor.name));
  const questionnaireQuestionCount = evaluationQuestionnaire.reduce(
    (total, category) => total + category.questions.length,
    0,
  );
  const selectedEvaluationSummary =
    instructorEvaluationSummaries.find(
      (summary) =>
        summary.instructor.id === selectedEvaluationDetailsInstructorId,
    ) ?? null;
  const selectedEvaluationSubjectOptions = selectedEvaluationSummary
    ? selectedEvaluationSummary.assignments
        .map((assignment) => ({
          id: assignment.subjectId,
          assignmentId: assignment.id,
          code: assignment.subjectCode,
          label: `${assignment.subjectCode} - ${assignment.subjectName}`,
          sectionCode: assignment.sectionCode,
        }))
        .filter(
          (option, index, options) =>
            options.findIndex((item) => item.id === option.id) === index,
        )
    : [];
  const resolvedEvaluationSubjectId =
    selectedEvaluationSubjectOptions.some(
      (option) => option.id === evaluationDetailsFilters.subjectId,
    )
      ? evaluationDetailsFilters.subjectId
      : selectedEvaluationSubjectOptions[0]?.id || "";
  const selectedEvaluationSubjectOption =
    selectedEvaluationSubjectOptions.find(
      (option) => option.id === resolvedEvaluationSubjectId,
    ) ?? null;
  const subjectMatchesSelectedEvaluation = (
    submission: InstructorEvaluationSubmissionRecord,
  ) =>
    !selectedEvaluationSubjectOption ||
    submission.subjectIds.includes(selectedEvaluationSubjectOption.id) ||
    submission.subjectIds.includes(selectedEvaluationSubjectOption.assignmentId) ||
    submission.subjectCodes.includes(selectedEvaluationSubjectOption.code);
  const selectedSubjectAssignments = selectedEvaluationSummary
    ? selectedEvaluationSummary.assignments.filter(
        (assignment) =>
          assignment.subjectId === resolvedEvaluationSubjectId ||
          assignment.id === selectedEvaluationSubjectOption?.assignmentId ||
          assignment.subjectCode === selectedEvaluationSubjectOption?.code,
      )
    : [];
  const selectedSubjectSubmissions = selectedEvaluationSummary
    ? selectedEvaluationSummary.submissions.filter(subjectMatchesSelectedEvaluation)
    : [];
  const selectedEvaluationYearOptions = Array.from(
    new Set(
      [
        ...selectedSubjectSubmissions.map((submission) => submission.yearLevel),
        ...selectedSubjectAssignments.map((assignment) => {
          const section = classSections.find(
            (item) =>
              normalizeSectionCodeValue(item.code) ===
              normalizeSectionCodeValue(assignment.sectionCode),
          );
          const subject = subjects.find(
            (item) => item.id === assignment.subjectId,
          );
          return section?.yearLevel || subject?.yearLevel || "";
        }),
      ].filter(Boolean),
    ),
  );
  const resolvedEvaluationYearLevel = selectedEvaluationYearOptions.includes(
    evaluationDetailsFilters.yearLevel,
  )
    ? evaluationDetailsFilters.yearLevel
    : selectedEvaluationYearOptions[0] || "";
  const selectedEvaluationSectionOptions = Array.from(
    new Set(
      [
        ...selectedSubjectSubmissions
          .filter(
            (submission) =>
              !resolvedEvaluationYearLevel ||
              submission.yearLevel === resolvedEvaluationYearLevel,
          )
          .map((submission) => submission.section),
        ...selectedSubjectAssignments
          .filter((assignment) => {
            if (!resolvedEvaluationYearLevel) {
              return true;
            }

            const section = classSections.find(
              (item) =>
                normalizeSectionCodeValue(item.code) ===
                normalizeSectionCodeValue(assignment.sectionCode),
            );
            const subject = subjects.find(
              (item) => item.id === assignment.subjectId,
            );

            return (
              (section?.yearLevel || subject?.yearLevel || "") ===
              resolvedEvaluationYearLevel
            );
          })
          .map((assignment) => assignment.sectionCode),
      ].filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const resolvedEvaluationSection =
    evaluationDetailsFilters.section === "All" ||
    selectedEvaluationSectionOptions.includes(evaluationDetailsFilters.section)
      ? evaluationDetailsFilters.section
      : "All";
  const selectedEvaluationFilteredSubmissions = selectedEvaluationSummary
    ? selectedEvaluationSummary.submissions.filter((submission) => {
        const matchesSubject = subjectMatchesSelectedEvaluation(submission);
        const matchesYear =
          !resolvedEvaluationYearLevel ||
          submission.yearLevel === resolvedEvaluationYearLevel;
        const matchesSection =
          resolvedEvaluationSection === "All" ||
          submission.section === resolvedEvaluationSection;

        return matchesSubject && matchesYear && matchesSection;
      })
    : [];
  const availableAssignmentSubjects = getEligibleSubjectsForSection(
    assignmentForm.sectionId,
    assignmentForm.semester,
    editingAssignment?.id,
  );
  const selectedAssignmentSection = classSections.find(
    (section) => section.id === assignmentForm.sectionId,
  );
  const selectedAssignments = subjectAssignments.filter((assignment) =>
    selectedAssignmentIds.includes(assignment.id),
  );
  const selectedVisibleAssignmentCount = filteredAssignments.filter(
    (assignment) => selectedAssignmentIds.includes(assignment.id),
  ).length;
  const pendingAssignmentDeleteTargets = subjectAssignments.filter(
    (assignment) => pendingAssignmentDeleteIds.includes(assignment.id),
  );

  const toggleInstructorEvaluation = (instructorId: string, isOpen: boolean) => {
    const hasAssignedClass = subjectAssignments.some(
      (assignment) => assignment.instructorId === instructorId,
    );
    const nextIsOpen = hasAssignedClass ? isOpen : false;
    const nextStatuses = setInstructorEvaluationStatus({
      branch: currentBranch,
      instructorId,
      isOpen: nextIsOpen,
    });

    setEvaluationStatuses(nextStatuses);
    void saveInstructorEvaluationStatusToBackend({
      branch: currentBranch,
      instructorId,
      isOpen: nextIsOpen,
    }).catch((error) => {
      console.warn("Failed to sync instructor evaluation status.", error);
    });
    addToast(
      nextIsOpen
        ? "Instructor evaluation opened for students."
        : hasAssignedClass
          ? "Instructor evaluation closed for students."
          : "Instructor must have an assigned class before opening evaluation.",
      hasAssignedClass ? "success" : "warning",
    );
  };

  const openEvaluationDetails = (
    summary: (typeof instructorEvaluationSummaries)[number],
  ) => {
    const firstSubject = summary.assignments[0];
    const firstYearLevel =
      summary.submissions[0]?.yearLevel ||
      (firstSubject
        ? classSections.find(
            (section) =>
              normalizeSectionCodeValue(section.code) ===
              normalizeSectionCodeValue(firstSubject.sectionCode),
          )?.yearLevel ||
          subjects.find((subject) => subject.id === firstSubject.subjectId)
            ?.yearLevel ||
          ""
        : "");

    setSelectedEvaluationDetailsInstructorId(summary.instructor.id);
    setEvaluationDetailsFilters({
      subjectId: firstSubject?.subjectId || "",
      yearLevel: firstYearLevel,
      section: "All",
    });
  };

  const escapeReportHtml = (value: string | number) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const getEvaluationQuestionPercentages = (questionId: string) => {
    const ratings = selectedEvaluationFilteredSubmissions
      .map((submission) => submission.responses[questionId])
      .filter(
        (rating): rating is number =>
          typeof rating === "number" &&
          Number.isFinite(rating) && rating >= 1 && rating <= 5,
      );
    const answerCount = ratings.length;

    return {
      answerCount,
      percentages: [1, 2, 3, 4, 5].map((rating) =>
        answerCount > 0
          ? Math.round(
              (ratings.filter((value) => value === rating).length /
                answerCount) *
                100,
            )
          : 0,
      ),
    };
  };

  const anonymousEvaluationResponderLabel = "Anonymous";

  const downloadEvaluationReport = () => {
    if (!selectedEvaluationSummary) {
      return;
    }

    const selectedSubjectLabel =
      selectedEvaluationSubjectOptions.find(
        (option) => option.id === resolvedEvaluationSubjectId,
      )?.label || "No subject";
    const classLabel = `${resolvedEvaluationYearLevel || "No year level"} - ${resolvedEvaluationSection}`;
    const reportRows =
      evaluationQuestionnaire.length > 0
        ? evaluationQuestionnaire
            .map((category) => {
              const questionRows =
                category.questions.length > 0
                  ? category.questions
                      .map((question) => {
                        if ((question.type || "rating") === "essay") {
                          const essayAnswers =
                            selectedEvaluationFilteredSubmissions
                              .map((submission) => submission.responses[question.id])
                              .filter(
                                (answer): answer is string =>
                                  typeof answer === "string" &&
                                  answer.trim().length > 0,
                              );

                          return `
                            <tr>
                              <td>${escapeReportHtml(question.text)}</td>
                              <td colspan="5">${
                                essayAnswers.length > 0
                                  ? essayAnswers
                                      .map(
                                        (answer) =>
                                          `<p class="essay-answer"><strong>${escapeReportHtml(
                                            anonymousEvaluationResponderLabel,
                                          )}:</strong> ${escapeReportHtml(answer)}</p>`,
                                      )
                                      .join("")
                                  : "-"
                              }</td>
                            </tr>
                          `;
                        }

                        const result = getEvaluationQuestionPercentages(
                          question.id,
                        );

                        return `
                          <tr>
                            <td>${escapeReportHtml(question.text)}</td>
                            ${result.percentages
                              .map(
                                (percentage) =>
                                  `<td>${percentage > 0 ? `${percentage}%` : "-"}</td>`,
                              )
                              .join("")}
                          </tr>
                        `;
                      })
                      .join("")
                  : `<tr><td colspan="6">No questions in this category.</td></tr>`;

              return `
                <tr class="category-row">
                  <th>${escapeReportHtml(category.name)}</th>
                  <th>1</th>
                  <th>2</th>
                  <th>3</th>
                  <th>4</th>
                  <th>5</th>
                </tr>
                ${questionRows}
              `;
            })
            .join("")
        : `<tr><td colspan="6">No questionnaire has been configured yet.</td></tr>`;
    const fileLabel = [
      selectedEvaluationSummary.instructor.name,
      selectedSubjectLabel,
      resolvedEvaluationYearLevel,
      resolvedEvaluationSection,
    ]
      .join("-")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    const reportWindow = window.open("", "_blank", "width=960,height=720");

    if (!reportWindow) {
      addToast("Allow popups to download the evaluation report.", "warning");
      return;
    }

    reportWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>evaluation-report-${escapeReportHtml(fileLabel || "filtered")}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 28px 18px;
              color: #111827;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 14px;
            }
            h1 {
              margin: 0 0 18px;
              padding-bottom: 18px;
              border-bottom: 1px solid #e5e7eb;
              text-align: center;
              font-size: 28px;
              font-weight: 500;
            }
            .report-meta {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 4px 28px;
              margin-bottom: 18px;
              font-size: 15px;
              font-weight: 700;
            }
            .report-meta div { min-width: 0; }
            .legend {
              position: relative;
              margin: 18px 0 0;
              padding: 28px 10px 14px;
              border: 1px solid #67d7e6;
              font-size: 16px;
            }
            .legend strong {
              position: absolute;
              top: -16px;
              left: 8px;
              padding-right: 8px;
              background: #ffffff;
              font-size: 24px;
              font-weight: 400;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            th, td {
              padding: 12px 8px;
              border-bottom: 1px solid #e5e7eb;
              text-align: center;
              vertical-align: middle;
              word-wrap: break-word;
            }
            th:first-child,
            td:first-child {
              width: 56%;
              text-align: left;
            }
            .essay-answer {
              margin: 0 0 8px;
              text-align: left;
              line-height: 1.45;
            }
            .category-row th {
              border-bottom: none;
              background: #727c85;
              color: #ffffff;
              font-size: 16px;
              font-weight: 700;
            }
            @media print {
              body { padding: 18px 14px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Evaluation Report</h1>
          <section class="report-meta">
            <div>Academic Year: ${escapeReportHtml(reflectedAcademicYear)} ${escapeReportHtml(reflectedSemester)}</div>
            <div>Instructor: ${escapeReportHtml(selectedEvaluationSummary.instructor.name)}</div>
            <div>Class: ${escapeReportHtml(classLabel)}</div>
            <div>Subject: ${escapeReportHtml(selectedSubjectLabel)}</div>
            <div>Total Student Evaluated: ${selectedEvaluationFilteredSubmissions.length}</div>
          </section>
          <section class="legend">
            <strong>Rating Legend</strong>
            5 = Strongly Agree, 4 = Agree, 3 = Uncertain, 2 = Disagree, 1 = Strongly Disagree
          </section>
          <table>
            <tbody>${reportRows}</tbody>
          </table>
          <script>
            window.onload = () => {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    reportWindow.document.close();
  };

  const saveEvaluationQuestionnaire = (
    categories: EvaluationQuestionCategoryRecord[],
  ) => {
    setEvaluationQuestionnaire(
      writeEvaluationQuestionnaire(currentBranch, categories),
    );
    void saveEvaluationQuestionnaireToBackend(currentBranch, categories).catch(
      (error) => {
        console.warn("Failed to sync evaluation questionnaire.", error);
      },
    );
  };

  const createQuestionnaireId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleAddQuestionnaireCategory = () => {
    const name = questionnaireCategoryName.trim();

    if (!name) {
      addToast("Enter a category name first.", "error");
      return;
    }

    const timestamp = new Date().toISOString();
    const nextCategory: EvaluationQuestionCategoryRecord = {
      id: createQuestionnaireId("category"),
      name,
      questions: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const nextQuestionnaire = [...evaluationQuestionnaire, nextCategory];

    saveEvaluationQuestionnaire(nextQuestionnaire);
    setSelectedQuestionnaireCategoryId(nextCategory.id);
    setQuestionnaireCategoryName("");
    addToast("Evaluation category added.", "success");
  };

  const handleAddQuestionnaireQuestion = () => {
    const categoryId =
      selectedQuestionnaireCategoryId || evaluationQuestionnaire[0]?.id || "";
    const questionText = questionnaireQuestionText.trim();

    if (!categoryId) {
      addToast("Add a category before adding questions.", "error");
      return;
    }

    if (!questionText) {
      addToast("Enter a question first.", "error");
      return;
    }

    const timestamp = new Date().toISOString();
    const nextQuestionnaire = evaluationQuestionnaire.map((category) =>
      category.id === categoryId
        ? {
            ...category,
            updatedAt: timestamp,
            questions: [
              ...category.questions,
              {
                id: createQuestionnaireId("question"),
                text: questionText,
                type: questionnaireQuestionType,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            ],
          }
        : category,
    );

    saveEvaluationQuestionnaire(nextQuestionnaire);
    setSelectedQuestionnaireCategoryId(categoryId);
    setQuestionnaireQuestionText("");
    setQuestionnaireQuestionType("rating");
    addToast("Evaluation question added.", "success");
  };

  const handleDeleteQuestionnaireQuestion = (
    categoryId: string,
    questionId: string,
  ) => {
    const timestamp = new Date().toISOString();
    const nextQuestionnaire = evaluationQuestionnaire.map((category) =>
      category.id === categoryId
        ? {
            ...category,
            updatedAt: timestamp,
            questions: category.questions.filter(
              (question) => question.id !== questionId,
            ),
          }
        : category,
    );

    saveEvaluationQuestionnaire(nextQuestionnaire);
    addToast("Evaluation question deleted.", "success");
  };

  const handleDeleteQuestionnaireCategory = (categoryId: string) => {
    const nextQuestionnaire = evaluationQuestionnaire.filter(
      (category) => category.id !== categoryId,
    );

    saveEvaluationQuestionnaire(nextQuestionnaire);

    if (selectedQuestionnaireCategoryId === categoryId) {
      setSelectedQuestionnaireCategoryId(nextQuestionnaire[0]?.id || "");
    }

    addToast("Evaluation category deleted.", "success");
  };

  useEffect(() => {
    setEvaluationStatuses(readInstructorEvaluationStatuses(currentBranch));
    const nextQuestionnaire = readEvaluationQuestionnaire(currentBranch);
    setEvaluationQuestionnaire(nextQuestionnaire);
    setEvaluationSubmissions(readInstructorEvaluationSubmissions(currentBranch));
    setSelectedQuestionnaireCategoryId(nextQuestionnaire[0]?.id || "");
    void Promise.all([
      fetchInstructorEvaluationStatuses(currentBranch).then(setEvaluationStatuses),
      fetchEvaluationQuestionnaire(currentBranch).then((questionnaire) => {
        setEvaluationQuestionnaire(questionnaire);
        setSelectedQuestionnaireCategoryId(questionnaire[0]?.id || "");
      }),
      fetchInstructorEvaluationSubmissions(currentBranch).then(
        setEvaluationSubmissions,
      ),
    ]).catch((error) => {
      console.warn("Failed to sync instructor evaluations from Supabase.", error);
    });
  }, [currentBranch]);

  useEffect(() => {
    const assignedInstructorIds = new Set(
      subjectAssignments
        .map((assignment) => assignment.instructorId.trim())
        .filter(Boolean),
    );
    let nextStatuses = evaluationStatuses;
    let didCloseStaleStatus = false;

    Object.values(evaluationStatuses).forEach((status) => {
      const instructorId = status.instructorId.trim();

      if (status.isOpen && !assignedInstructorIds.has(instructorId)) {
        nextStatuses = setInstructorEvaluationStatus({
          branch: currentBranch,
          instructorId,
          isOpen: false,
        });
        didCloseStaleStatus = true;
      }
    });

    if (didCloseStaleStatus) {
      setEvaluationStatuses(nextStatuses);
    }
  }, [currentBranch, evaluationStatuses, subjectAssignments]);

  useEffect(() => {
    const syncEvaluationSubmissions = () => {
      setEvaluationSubmissions(readInstructorEvaluationSubmissions(currentBranch));
      void fetchInstructorEvaluationSubmissions(currentBranch)
        .then(setEvaluationSubmissions)
        .catch((error) => {
          console.warn("Failed to refresh evaluation submissions.", error);
        });
    };

    window.addEventListener("storage", syncEvaluationSubmissions);
    window.addEventListener(
      INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT,
      syncEvaluationSubmissions as EventListener,
    );

    return () => {
      window.removeEventListener("storage", syncEvaluationSubmissions);
      window.removeEventListener(
        INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT,
        syncEvaluationSubmissions as EventListener,
      );
    };
  }, [currentBranch]);

  useEffect(() => {
    const existingAssignmentIds = new Set(
      subjectAssignments.map((assignment) => assignment.id),
    );

    setSelectedAssignmentIds((prev) => {
      const next = prev.filter((id) => existingAssignmentIds.has(id));
      return next.length === prev.length ? prev : next;
    });

    setPendingAssignmentDeleteIds((prev) => {
      const next = prev.filter((id) => existingAssignmentIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [subjectAssignments]);

  useEffect(() => {
    setCurrentEnrolleePage(1);
  }, [searchTerm, statusFilter, activeTab, currentBranch, showOwnScheduleOnly]);

  useEffect(() => {
    const visibleIds = new Set(filteredEnrollees.map((enrollee) => enrollee.id));
    setSelectedEnrolleeIds((prev) => {
      const next = prev.filter((id) => visibleIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [filteredEnrollees]);

  useEffect(() => {
    const visibleIds = new Set(filteredRequests.map((request) => request.id));
    setSelectedEnrollmentRequestIds((prev) => {
      const next = prev.filter((id) => visibleIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [filteredRequests]);

  useEffect(() => {
    if (currentEnrolleePage > totalEnrolleePages) {
      setCurrentEnrolleePage(totalEnrolleePages);
    }
  }, [currentEnrolleePage, totalEnrolleePages]);

  const pendingCount = regularAdmissions.filter(
    (e) => e.status === "Pending",
  ).length;
  const pendingOwnScheduleRequestCount = regularAdmissions.filter(
    (enrollee) =>
      enrollee.status === "Pending" &&
      enrollee.requestedOwnSchedule &&
      enrollee.ownScheduleRequestStatus !== "Approved",
  ).length;
  const approvedOwnScheduleRequestCount = regularAdmissions.filter(
    (enrollee) =>
      enrollee.requestedOwnSchedule &&
      enrollee.ownScheduleRequestStatus === "Approved",
  ).length;
  const approvedCount = regularAdmissions.filter(
    (e) => e.status === "Approved",
  ).length;
  const pendingTransfereeCount = transfereeAdmissions.filter(
    (e) => e.status === "Pending",
  ).length;
  const approvedTransfereeCount = transfereeAdmissions.filter(
    (e) => e.status === "Approved",
  ).length;
  const validatedTransfereeCount = transfereeAdmissions.filter((enrollee) =>
    isTransfereeEvaluationComplete(getTransfereeEvaluation(enrollee)),
  ).length;
  const pendingRequestsCount = activeEnrollmentRequests.filter(
    (r) => r.enrollmentStatus === "Pending",
  ).length;
  const approvedRequestsCount = activeEnrollmentRequests.filter(
    (r) => r.enrollmentStatus === "Approved",
  ).length;
  const sectionManagerPendingAssignments =
    sectionManagerScope === "transferees"
      ? pendingTransfereeAssignments
      : sectionManagerScope === "admissions"
        ? pendingRegularAssignments
        : pendingAssignments;
  const activeAdmissionPendingAssignments =
    activeTab === "transferees"
      ? pendingTransfereeAssignments
      : pendingRegularAssignments;
  const activeBranchStudents = getStudentsForBranch(currentBranch).filter(
    (student) => student.status !== "Archived",
  );
  const activeStudentsForMove = [...activeBranchStudents]
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
  const selectedSectionStudentRows = selectedSection
    ? (() => {
        const normalizedSectionCode = normalizeSectionCodeValue(
          selectedSection.code,
        );
        const studentRows = new Map<
          string,
          {
            key: string;
            name: string;
            studentNumber: string;
            program: string;
            yearLevel: string;
          }
        >();

        activeBranchStudents
          .filter(
            (student) =>
              normalizeSectionCodeValue(student.section) === normalizedSectionCode,
          )
          .forEach((student) => {
            studentRows.set(`student:${student.id}`, {
              key: `student:${student.id}`,
              name: student.name,
              studentNumber: student.id,
              program: student.program,
              yearLevel: student.yearLevel,
            });
          });

        return Array.from(studentRows.values()).sort(
          (left, right) =>
            left.name.localeCompare(right.name) ||
            left.studentNumber.localeCompare(right.studentNumber),
        );
      })()
    : [];
  const normalizedMoveStudentSearch = moveStudentSearchTerm.trim().toLowerCase();
  const filteredStudentsForMove = activeStudentsForMove.filter((student) =>
    !normalizedMoveStudentSearch
      ? true
      : [
          student.name,
          student.id,
          student.section,
          student.program,
          student.yearLevel,
          student.strandOrCourse,
        ]
          .filter(Boolean)
          .some((value) =>
            value?.toString().toLowerCase().includes(normalizedMoveStudentSearch),
          ),
  );
  const selectedMoveStudent =
    activeStudentsForMove.find((student) => student.id === selectedMoveStudentId) ??
    null;
  const selectedMoveStudentSectionChoices = selectedMoveStudent
    ? getStudentSectionChoices({
        branch: selectedMoveStudent.branch || currentBranch,
        program: selectedMoveStudent.program,
        yearLevel: selectedMoveStudent.yearLevel,
        strandOrCourse: selectedMoveStudent.strandOrCourse,
        currentSectionCode: selectedMoveStudent.section,
      })
    : [];
  const selectedMoveStudentCurrentSectionChoice = selectedMoveStudent
    ? selectedMoveStudentSectionChoices.find(
        (section) =>
          normalizeSectionCodeValue(section.code) ===
          normalizeSectionCodeValue(selectedMoveStudent.section),
      ) ?? null
    : null;
  const isSectionChoiceLocked = (sectionCode?: string | null) =>
    classSections.some(
      (section) =>
        normalizeSectionCodeValue(section.code) ===
          normalizeSectionCodeValue(sectionCode) && isSectionLocked(section),
    );
  const pendingMoveSectionChoice =
    selectedMoveStudentSectionChoices.find(
      (section) =>
        normalizeSectionCodeValue(section.code) ===
        normalizeSectionCodeValue(pendingMoveSectionCode),
    ) ?? null;
  const canApplyStudentMove =
    Boolean(selectedMoveStudent) &&
    Boolean(normalizeSectionCodeValue(pendingMoveSectionCode)) &&
    !isSectionChoiceLocked(pendingMoveSectionCode) &&
    normalizeSectionCodeValue(pendingMoveSectionCode) !==
      normalizeSectionCodeValue(selectedMoveStudent?.section);

  useEffect(() => {
    if (!showMoveStudentsModal) {
      return;
    }

    if (
      selectedMoveStudentId &&
      filteredStudentsForMove.some((student) => student.id === selectedMoveStudentId)
    ) {
      return;
    }

    setSelectedMoveStudentId(filteredStudentsForMove[0]?.id || "");
  }, [filteredStudentsForMove, selectedMoveStudentId, showMoveStudentsModal]);

  useEffect(() => {
    if (!showMoveStudentsModal) {
      return;
    }

    setPendingMoveSectionCode((selectedMoveStudent?.section || "").trim());
    setMoveStudentFeedback(null);
  }, [selectedMoveStudent?.id, selectedMoveStudent?.section, showMoveStudentsModal]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Approved":
        return <FaCheckCircle className="status-icon approved" />;
      case "Pending":
        return <FaClock className="status-icon pending" />;
      case "Rejected":
        return <FaExclamationTriangle className="status-icon rejected" />;
      default:
        return null;
    }
  };

  const handleSidebarToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  const toggleSHSYear = (year: string) => {
    setExpandedSHSSections((prev) => ({
      ...prev,
      [year]: !prev[year as keyof typeof prev],
    }));
  };

  const toggleCollegeYear = (year: string) => {
    setExpandedCollegeSections((prev) => ({
      ...prev,
      [year]: !prev[year as keyof typeof prev],
    }));
  };

  const toggleAssignmentSection = (sectionCode: string) => {
    setExpandedAssignmentSections((prev) => ({
      ...prev,
      [sectionCode]: !prev[sectionCode],
    }));
  };

  const closeAssignmentAutoAssignModal = () => {
    setAssignmentAutoAssignSection(null);
  };

  const confirmAssignmentAutoAssign = () => {
    closeAssignmentAutoAssignModal();
  };

  // Filter subjects based on filters
  const getFilteredSubjects = () => {
    return subjects.filter((subject) => {
      const subjectDescriptor = resolveSubjectStrandOrCourse(subject);

      if (
        subjectFilter.program !== "All" &&
        subject.program !== subjectFilter.program
      )
        return false;
      if (
        subjectFilter.yearLevel !== "All" &&
        subject.yearLevel !== subjectFilter.yearLevel
      )
        return false;
      if (
        subjectFilter.strand !== "All" &&
        !matchesAcademicDescriptor(subjectDescriptor, subjectFilter.strand)
      )
        return false;
      if (subjectFilter.strandOrCourse !== "All") {
        if (
          !matchesAcademicDescriptor(
            subjectDescriptor,
            subjectFilter.strandOrCourse,
          )
        ) {
          return false;
        }
      }
      if (
        subject.program === "College" &&
        !subjectFilter.showMinor &&
        getResolvedSubjectType(subject) === "minor"
      ) {
        return false;
      }
      return true;
    });
  };

  // Organize subjects for table view with filters applied
  const organizeSubjectsForTable = () => {
    const filtered = getFilteredSubjects();

    const shsData: Record<string, Record<string, Subject[]>> = {
      "Grade 11": { "1st Semester": [], "2nd Semester": [] },
      "Grade 12": { "1st Semester": [], "2nd Semester": [] },
    };

    const collegeData: Record<string, Record<string, Subject[]>> = {
      "1st Year": { "1st Semester": [], "2nd Semester": [] },
      "2nd Year": { "1st Semester": [], "2nd Semester": [] },
      "3rd Year": { "1st Semester": [], "2nd Semester": [] },
      "4th Year": { "1st Semester": [], "2nd Semester": [] },
    };

    filtered.forEach((subject) => {
      if (subject.program === "SHS") {
        if (
          shsData[subject.yearLevel] &&
          shsData[subject.yearLevel][subject.semester]
        ) {
          shsData[subject.yearLevel][subject.semester].push(subject);
        }
      } else if (subject.program === "College") {
        if (
          collegeData[subject.yearLevel] &&
          collegeData[subject.yearLevel][subject.semester]
        ) {
          collegeData[subject.yearLevel][subject.semester].push(subject);
        }
      }
    });

    return { shsData, collegeData };
  };

  const { shsData, collegeData } = organizeSubjectsForTable();
  const subjectPrerequisiteOptions =
    getSubjectFormPrerequisiteOptions(subjectForm);
  const getSubjectPrerequisiteSummary = (subject: Subject) => {
    const codes = normalizeStringList(subject.prerequisiteSubjectIds)
      .map((subjectId) => subjects.find((item) => item.id === subjectId)?.code)
      .filter((code): code is string => Boolean(code));

    return codes.length > 0 ? codes.join(", ") : "None";
  };

  return (
    <div className="dashboard-layout">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <AdminSidebar
        isOpen={isSidebarOpen}
        onClose={handleSidebarClose}
        onLogout={onLogout}
        loggedInUsername={loggedInUsername}
        loggedInRole={loggedInRole}
        canAccessBackup={canAccessBackup}
      />

      <button
        className="menu-toggle"
        onClick={handleSidebarToggle}
        aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
      >
        {isSidebarOpen ? "✕" : "☰"}
      </button>

      <main className="enrollees-content">
        <header className="page-header">
          <h1>Enrollment Management</h1>
          <p>
            {isLoading
              ? "Loading data..."
              : "Manage new admissions, transferee evaluations, student enrollment requests, and academic assignments"}
          </p>
        </header>

        <div className="enrollment-tabs">
          <button
            className={`tab-btn ${activeTab === "admissions" ? "active" : ""}`}
            onClick={() => setActiveTab("admissions")}
          >
            <FaUserPlus /> New Admissions{" "}
            {pendingCount > 0 && (
              <span className="tab-badge">{pendingCount}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === "transferees" ? "active" : ""}`}
            onClick={() => setActiveTab("transferees")}
          >
            <FaExchangeAlt /> Transferees{" "}
            {pendingTransfereeCount > 0 && (
              <span className="tab-badge">{pendingTransfereeCount}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === "enrollments" ? "active" : ""}`}
            onClick={() => setActiveTab("enrollments")}
          >
            <FaUserGraduate /> Enrollment Requests{" "}
            {pendingRequestsCount > 0 && (
              <span className="tab-badge">{pendingRequestsCount}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === "academic" ? "active" : ""}`}
            onClick={() => setActiveTab("academic")}
          >
            <FaBook /> Academic Management
          </button>
        </div>

        <div
          className={`stats-cards ${
            activeTab === "academic" || activeTab === "transferees"
              ? "academic-stats"
              : ""
          }`.trim()}
        >
          {activeTab === "admissions" ? (
            <>
              <div className="stat-card approved">
                <span className="stat-label">Approved Admissions</span>
                <span className="stat-value">{approvedCount}</span>
              </div>
              <div className="stat-card pending">
                <span className="stat-label">Pending Review</span>
                <span className="stat-value">{pendingCount}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Own Schedule Requests</span>
                <span className="stat-value">
                  {pendingOwnScheduleRequestCount}
                </span>
              </div>
            </>
          ) : activeTab === "transferees" ? (
            <>
              <div className="stat-card approved">
                <span className="stat-label">Approved Transferees</span>
                <span className="stat-value">{approvedTransfereeCount}</span>
              </div>
              <div className="stat-card pending">
                <span className="stat-label">Pending Review</span>
                <span className="stat-value">{pendingTransfereeCount}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Validated for Approval</span>
                <span className="stat-value">{validatedTransfereeCount}</span>
              </div>
            </>
          ) : activeTab === "enrollments" ? (
            <>
              <div className="stat-card approved">
                <span className="stat-label">Approved Requests</span>
                <span className="stat-value">{approvedRequestsCount}</span>
              </div>
              <div className="stat-card pending">
                <span className="stat-label">Pending Requests</span>
                <span className="stat-value">{pendingRequestsCount}</span>
              </div>
            </>
          ) : (
            <>
              <div className="stat-card">
                <span className="stat-label">Total Subjects</span>
                <span className="stat-value">{subjects.length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Total Instructors</span>
                <span className="stat-value">{instructors.length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Class Assignments</span>
                <span className="stat-value">{subjectAssignments.length}</span>
              </div>
            </>
          )}
        </div>

        {/* Admissions and Transferee Tabs */}
        {(activeTab === "admissions" || activeTab === "transferees") && (
          <>
            <div className="section-management-bar">
              <div className="section-info">
                <FaUsers className="section-icon" />
                <span>
                  {activeAdmissionPendingAssignments.length} active{" "}
                  {activeTab === "transferees"
                    ? "transferee(s)"
                    : "student(s)"}{" "}
                  waiting for section assignment
                </span>
              </div>
              <div className="section-actions-buttons">
                <button
                  className="action-btn auto-assign"
                  onClick={
                    activeTab === "transferees"
                      ? handleAutoAssignTransferees
                      : handleAutoAssignAll
                  }
                  disabled={activeAdmissionPendingAssignments.length === 0}
                >
                  <FaMagic />{" "}
                  {activeTab === "transferees"
                    ? "Auto-Assign Transferees"
                    : "Auto-Assign All"}
                </button>
                <button
                  className="action-btn section-manager"
                  onClick={() => {
                    setSectionManagerScope(
                      activeTab === "transferees"
                        ? "transferees"
                        : "admissions",
                    );
                    setShowSectionManager(true);
                  }}
                >
                  <FaLayerGroup /> Manage Sections
                </button>
              </div>
            </div>
            {activeTab === "transferees" && (
              <div className="transferee-guidance-banner">
                <strong>Transferee workflow:</strong> review credentials, confirm
                placement and initial subject load, then approve. If you choose
                a recommended section during review, the system will assign that
                section automatically after approval when possible.
              </div>
            )}
            {activeTab === "admissions" &&
              (pendingOwnScheduleRequestCount > 0 ||
                approvedOwnScheduleRequestCount > 0) && (
                <div className="transferee-guidance-banner own-schedule-guidance-banner">
                  <strong>Own schedule requests:</strong>{" "}
                  {pendingOwnScheduleRequestCount > 0
                    ? `${pendingOwnScheduleRequestCount} applicant(s) still need schedule-request review before admission approval.`
                    : "All requested own-schedule admissions have already been reviewed."}
                  <button
                    type="button"
                    className="assignment-selection-btn"
                    onClick={() =>
                      setShowOwnScheduleOnly((previousValue) => !previousValue)
                    }
                  >
                    {showOwnScheduleOnly
                      ? "Show All Admissions"
                      : "Show Requested Own Schedule"}
                  </button>
                </div>
              )}
            <div className="controls">
              <input
                type="text"
                placeholder={
                  activeTab === "transferees"
                    ? "Search transferees by name, tracking number, student number, or course/strand..."
                    : "Search by name, tracking number, or student number..."
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "All" | Enrollee["status"])
                }
                className="status-filter"
              >
                <option value="All">All status</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div className="enrollee-bulk-toolbar">
              <label className="enrollee-selection-control">
                <input
                  type="checkbox"
                  checked={allPaginatedEnrolleesSelected}
                  onChange={(event) => {
                    setSelectedEnrolleeIds((prev) => {
                      const nextIds = new Set(prev);

                      if (event.target.checked) {
                        paginatedEnrolleeIds.forEach((id) => nextIds.add(id));
                      } else {
                        paginatedEnrolleeIds.forEach((id) => nextIds.delete(id));
                      }

                      return [...nextIds];
                    });
                  }}
                  disabled={paginatedEnrollees.length === 0}
                />
                <span>
                  {selectedFilteredEnrollees.length} selected
                </span>
              </label>
              <div className="enrollee-bulk-actions">
                <button
                  type="button"
                  className="action-btn archive"
                  onClick={() =>
                    handleArchiveSelectedEnrollees(selectedFilteredEnrollees)
                  }
                  disabled={selectedFilteredEnrollees.length === 0}
                >
                  <MdArchive /> Archive Selected
                </button>
                <button
                  type="button"
                  className="action-btn cancel"
                  onClick={() => setSelectedEnrolleeIds([])}
                  disabled={selectedFilteredEnrollees.length === 0}
                >
                  Clear Selection
                </button>
              </div>
            </div>
            <div className="table-container">
              <table className="enrollees-table enrollees-admission-table">
                <thead>
                  <tr>
                    <th className="enrollee-select-column">SELECT</th>
                    <th>TRACKING NO.</th>
                    <th>FULL NAME</th>
                    <th>PROGRAM</th>
                    <th>COURSE/STRAND</th>
                    {activeTab === "transferees" ? (
                      <>
                        <th>VALIDATION</th>
                        <th>SECTION</th>
                      </>
                    ) : (
                      <>
                        <th>DOCUMENTS</th>
                        <th>OWN SCHEDULE</th>
                      </>
                    )}
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEnrollees.length > 0 ? (
                    paginatedEnrollees.map((enrollee) => (
                      <tr key={enrollee.id}>
                        <td className="enrollee-select-column" data-label="Select">
                          <input
                            type="checkbox"
                            checked={selectedEnrolleeIdSet.has(enrollee.id)}
                            onChange={(event) => {
                              setSelectedEnrolleeIds((prev) =>
                                event.target.checked
                                  ? [...new Set([...prev, enrollee.id])]
                                  : prev.filter((id) => id !== enrollee.id),
                              );
                            }}
                            aria-label={`Select ${enrollee.fullName}`}
                          />
                        </td>
                        <td data-label="Tracking No.">{enrollee.trackingNumber}</td>
                        <td data-label="Full Name">{enrollee.fullName}</td>
                        <td data-label="Program">{enrollee.program}</td>
                        <td data-label="Course/Strand">
                          {getCourseStrandDisplay(enrollee)}
                        </td>
                        {activeTab === "transferees" ? (
                          <>
                            <td data-label="Validation">
                              {isTransfereeEvaluationComplete(
                                getTransfereeEvaluation(enrollee),
                              )
                                ? "Ready"
                                : transfereeEvaluations[enrollee.id]
                                  ? "In Progress"
                                  : "Pending"}
                            </td>
                            <td data-label="Section">
                              <div>
                                {getAssignedSectionCode(enrollee.id) !==
                                "Not assigned"
                                  ? getAssignedSectionCode(enrollee.id)
                                  : getTransfereeEvaluation(enrollee)
                                        .recommendedSectionId
                                    ? classSections.find(
                                        (section) =>
                                          section.id ===
                                          getTransfereeEvaluation(enrollee)
                                        .recommendedSectionId,
                                      )?.code || "Suggested"
                                    : "Pending"}
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td data-label="Documents">
                              {enrollee.documentsSubmitted}/
                              {enrollee.totalDocuments}
                            </td>
                            <td data-label="Own Schedule">
                              {getOwnScheduleRequestLabel(enrollee)}
                            </td>
                          </>
                        )}
                        <td data-label="Status">
                          <span
                            className={`status-badge ${enrollee.status.toLowerCase()}`}
                          >
                            {enrollee.status}
                          </span>
                        </td>
                        <td data-label="Action">
                          <div className="action-buttons">
                            <button
                              className="action-btn review"
                              onClick={() => handleReviewRequirements(enrollee)}
                            >
                              Review
                            </button>
                            <button
                              className="action-btn archive enrollee-archive-btn"
                              onClick={() => handleArchiveEnrollee(enrollee)}
                              title={`Move ${enrollee.fullName} to Archive`}
                              aria-label={`Move ${enrollee.fullName} to Archive`}
                              type="button"
                            >
                              <MdArchive /> Archive
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={9}
                        className="no-results"
                        data-label="Enrollees"
                      >
                        {isLoading
                          ? "Loading enrollees..."
                          : activeTab === "transferees"
                            ? "No transferees found."
                            : "No enrollees found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {filteredEnrollees.length > 0 && (
              <div className="table-pagination">
                <button
                  type="button"
                  className="table-pagination-btn"
                  onClick={() =>
                    setCurrentEnrolleePage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={currentEnrolleePage === 1}
                >
                  Back
                </button>
                <div className="table-pagination-summary">
                  <span>
                    {enrolleeStartIndex + 1}-{Math.min(
                      enrolleeEndIndex,
                      filteredEnrollees.length,
                    )}{" "}
                    of {filteredEnrollees.length}
                  </span>
                </div>
                <div className="table-pagination-pages">
                  {Array.from(
                    { length: totalEnrolleePages },
                    (_, index) => index + 1,
                  ).map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      className={`table-pagination-page ${pageNumber === currentEnrolleePage ? "active" : ""}`}
                      onClick={() => setCurrentEnrolleePage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="table-pagination-btn"
                  onClick={() =>
                    setCurrentEnrolleePage((prev) =>
                      Math.min(totalEnrolleePages, prev + 1),
                    )
                  }
                  disabled={currentEnrolleePage === totalEnrolleePages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* Enrollment Requests Tab */}
        {activeTab === "enrollments" && (
          <>
            <div className="controls">
              <input
                type="text"
                placeholder="Search by Name or Student Number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <select
                value={enrollmentStatusFilter}
                onChange={(e) =>
                  setEnrollmentStatusFilter(
                    e.target.value as
                      | "All"
                      | "Pending"
                      | "Approved"
                      | "Rejected",
                  )
                }
                className="status-filter"
              >
                <option value="All">All Status</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div className="enrollee-bulk-toolbar">
              <label className="enrollee-selection-control">
                <input
                  type="checkbox"
                  checked={allFilteredEnrollmentRequestsSelected}
                  onChange={(event) => {
                    setSelectedEnrollmentRequestIds(
                      event.target.checked ? filteredRequestIds : [],
                    );
                  }}
                  disabled={filteredRequests.length === 0}
                />
                <span>
                  {selectedFilteredEnrollmentRequests.length} selected
                </span>
              </label>
              <div className="enrollee-bulk-actions">
                <button
                  type="button"
                  className="action-btn archive"
                  onClick={() =>
                    handleArchiveSelectedEnrollmentRequests(
                      selectedFilteredEnrollmentRequests,
                    )
                  }
                  disabled={selectedFilteredEnrollmentRequests.length === 0}
                >
                  <MdArchive /> Archive Selected
                </button>
                <button
                  type="button"
                  className="action-btn cancel"
                  onClick={() => setSelectedEnrollmentRequestIds([])}
                  disabled={selectedFilteredEnrollmentRequests.length === 0}
                >
                  Clear Selection
                </button>
              </div>
            </div>
            <div className="table-container">
              <table className="enrollees-table enrollees-enrollment-table">
                <thead>
                  <tr>
                    <th className="enrollee-select-column">SELECT</th>
                    <th>STUDENT NO.</th>
                    <th>FULL NAME</th>
                    <th>PROGRAM</th>
                    <th>CURRENT LEVEL</th>
                    <th>REQUESTED LEVEL</th>
                    <th>ENROLLING TERM</th>
                    <th>REQUEST DATE</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.length > 0 ? (
                    filteredRequests.map((request) => (
                      <tr key={request.id}>
                        <td className="enrollee-select-column" data-label="Select">
                          <input
                            type="checkbox"
                            checked={selectedEnrollmentRequestIdSet.has(
                              request.id,
                            )}
                            onChange={(event) => {
                              setSelectedEnrollmentRequestIds((prev) =>
                                event.target.checked
                                  ? [...new Set([...prev, request.id])]
                                  : prev.filter((id) => id !== request.id),
                              );
                            }}
                            aria-label={`Select enrollment request for ${request.fullName}`}
                          />
                        </td>
                        <td data-label="Student No.">{request.studentNumber}</td>
                        <td data-label="Full Name">{request.fullName}</td>
                        <td data-label="Program">{request.program}</td>
                        <td data-label="Current Level">{request.currentYearLevel}</td>
                        <td data-label="Requested Level">
                          {request.program === "SHS" &&
                          request.requestedYearLevel === "College"
                            ? "1st Year College"
                            : request.requestedYearLevel}
                        </td>
                        <td data-label="Enrolling Term">
                          <strong>{request.semester}</strong>
                          <div>{request.academicYear}</div>
                        </td>
                        <td data-label="Request Date">{request.requestDate}</td>
                        <td data-label="Status">
                          <span
                            className={`enrollment-badge ${request.enrollmentStatus.toLowerCase()}`}
                          >
                            {request.enrollmentStatus}
                          </span>
                        </td>
                        <td data-label="Action">
                          <div className="action-buttons">
                            <button
                              className="action-btn view"
                              onClick={() => handleViewRequestDetails(request)}
                            >
                              Review
                            </button>
                            <button
                              className="action-btn archive enrollee-archive-btn"
                              onClick={() =>
                                handleArchiveSelectedEnrollmentRequests([request])
                              }
                              title={`Move ${request.fullName} enrollment request to Archive`}
                              aria-label={`Move ${request.fullName} enrollment request to Archive`}
                              type="button"
                            >
                              <MdArchive /> Archive
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="no-results" data-label="Enrollment Requests">
                        No enrollment requests found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Academic Management Tab */}
        {activeTab === "academic" && (
          <div className="academic-management-container">
            <div className="academic-subtabs">
              <button
                className={`subtab-btn ${activeManagementTab === "subjects" ? "active" : ""}`}
                onClick={() => setActiveManagementTab("subjects")}
              >
                <FaBook /> Subjects
              </button>
              <button
                className={`subtab-btn ${activeManagementTab === "instructors" ? "active" : ""}`}
                onClick={() => setActiveManagementTab("instructors")}
              >
                <FaChalkboardTeacher /> Instructors
              </button>
              <button
                className={`subtab-btn ${activeManagementTab === "assignments" ? "active" : ""}`}
                onClick={() => setActiveManagementTab("assignments")}
              >
                <FaCalendarAlt /> Class Assignments
              </button>
              <button
                className={`subtab-btn ${activeManagementTab === "evaluation" ? "active" : ""}`}
                onClick={() => setActiveManagementTab("evaluation")}
              >
                <FaStar /> Evaluation
              </button>
            </div>

            {/* Subjects Management - Table View with Enhanced Filters */}
            {activeManagementTab === "subjects" && (
              <div className="management-section">
                <div className="section-header-actions">
                  <h3>Subject Management</h3>
                  <button
                    className="action-btn add"
                    onClick={openCreateSubjectModal}
                  >
                    <FaPlus /> Add Subject
                  </button>
                </div>

                {/* Enhanced Filters */}
                <div className="subjects-filter">
                  <div className="filter-group">
                    <FaFilter className="filter-icon" />
                    <select
                      className="filter-select"
                      value={subjectFilter.program}
                      onChange={(e) =>
                        setSubjectFilter({
                          ...subjectFilter,
                          program: e.target.value,
                          yearLevel: "All",
                          strand: "All",
                          strandOrCourse: "All",
                        })
                      }
                    >
                      <option value="All">All Programs</option>
                      <option value="College">College</option>
                      <option value="SHS">SHS</option>
                    </select>
                  </div>
                  <select
                    className="filter-select"
                    value={subjectFilter.yearLevel}
                    onChange={(e) =>
                      setSubjectFilter({
                        ...subjectFilter,
                        yearLevel: e.target.value,
                      })
                    }
                  >
                    <option value="All">All Year Levels</option>
                    {subjectYearLevelOptions.map((yearLevel) => (
                      <option key={yearLevel} value={yearLevel}>
                        {yearLevel}
                      </option>
                    ))}
                  </select>

                  <select
                    className="filter-select"
                    value={subjectFilter.strandOrCourse}
                    onChange={(e) =>
                      setSubjectFilter({
                        ...subjectFilter,
                        strandOrCourse: e.target.value,
                      })
                    }
                  >
                    <option value="All">All Strands/Courses</option>
                    {subjectStrandCourseOptions.map((strandOrCourse) => (
                      <option key={strandOrCourse} value={strandOrCourse}>
                        {strandOrCourse === DEFAULT_COLLEGE_COURSE
                          ? "BS Entrepreneurship"
                          : strandOrCourse}
                      </option>
                    ))}
                  </select>
                  {subjectFilter.program !== "SHS" ? (
                    <label className="filter-checkbox">
                      <input
                        type="checkbox"
                        checked={subjectFilter.showMinor}
                        onChange={(e) =>
                          setSubjectFilter({
                            ...subjectFilter,
                            showMinor: e.target.checked,
                          })
                        }
                      />{" "}
                      Show Minor Subjects
                    </label>
                  ) : null}
                </div>

                {/* Subjects Table View */}
                <div className="subjects-table-view">
                  {/* SHS Section */}
                  <div className="program-section">
                    <div className="program-section-header">
                      <FaUniversity className="program-icon" />
                      <h3>Senior High School (SHS)</h3>
                    </div>
                    {/* Grade 11 */}
                    <div className="year-level-section">
                      <div
                        className="year-level-header"
                        onClick={() => toggleSHSYear("Grade 11")}
                      >
                        <h4>Grade 11</h4>
                        <button className="expand-btn">
                          {expandedSHSSections["Grade 11"] ? (
                            <FaChevronUp />
                          ) : (
                            <FaChevronDown />
                          )}
                        </button>
                      </div>
                      {expandedSHSSections["Grade 11"] && (
                        <div className="semesters-container">
                          {["1st Semester", "2nd Semester"].map((sem) => (
                            <div key={sem} className="semester-section">
                              <div className="semester-header">
                                <h5>{sem}</h5>
                                <span className="subject-count">
                                  {shsData["Grade 11"][sem].length} subjects
                                </span>
                              </div>
                              <div className="subjects-table-wrapper">
                                <table className="subjects-table">
                                  <thead>
                                    <tr>
                                      <th>Subject Code</th>
                                      <th>Subject Title</th>
                                      <th>Strand</th>
                                      <th>Type</th>
                                      <th>Prerequisites</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {shsData["Grade 11"][sem].length > 0 ? (
                                      shsData["Grade 11"][sem].map(
                                        (subject) => (
                                          <tr key={subject.id}>
                                            <td className="subject-code">
                                              {subject.code}
                                            </td>
                                            <td>{subject.name}</td>
                                            <td>{subject.strand}</td>
                                            <td>{getSubjectTypeLabel(subject)}</td>
                                            <td className="subject-prerequisite-cell">
                                              {getSubjectPrerequisiteSummary(subject)}
                                            </td>
                                            <td className="subject-actions-cell">
                                              <button
                                                type="button"
                                                className="assignment-selection-btn secondary"
                                                onClick={() =>
                                                  openEditSubjectModal(subject)
                                                }
                                              >
                                                Edit
                                              </button>
                                              <button
                                                type="button"
                                                className="trash-icon-btn"
                                                onClick={() =>
                                                  handleDeleteSubject(subject)
                                                }
                                                aria-label={`Delete ${subject.code}`}
                                                title={`Delete ${subject.code}`}
                                              >
                                                <FaTrash />
                                                Delete
                                              </button>
                                            </td>
                                          </tr>
                                        ),
                                      )
                                    ) : (
                                      <tr>
                                        <td colSpan={6} className="empty-row">
                                          No subjects added yet
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Grade 12 */}
                    <div className="year-level-section">
                      <div
                        className="year-level-header"
                        onClick={() => toggleSHSYear("Grade 12")}
                      >
                        <h4>Grade 12</h4>
                        <button className="expand-btn">
                          {expandedSHSSections["Grade 12"] ? (
                            <FaChevronUp />
                          ) : (
                            <FaChevronDown />
                          )}
                        </button>
                      </div>
                      {expandedSHSSections["Grade 12"] && (
                        <div className="semesters-container">
                          {["1st Semester", "2nd Semester"].map((sem) => (
                            <div key={sem} className="semester-section">
                              <div className="semester-header">
                                <h5>{sem}</h5>
                                <span className="subject-count">
                                  {shsData["Grade 12"][sem].length} subjects
                                </span>
                              </div>
                              <div className="subjects-table-wrapper">
                                <table className="subjects-table">
                                  <thead>
                                    <tr>
                                      <th>Subject Code</th>
                                      <th>Subject Title</th>
                                      <th>Strand</th>
                                      <th>Type</th>
                                      <th>Prerequisites</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {shsData["Grade 12"][sem].length > 0 ? (
                                      shsData["Grade 12"][sem].map(
                                        (subject) => (
                                          <tr key={subject.id}>
                                            <td className="subject-code">
                                              {subject.code}
                                            </td>
                                            <td>{subject.name}</td>
                                            <td>{subject.strand}</td>
                                            <td>{getSubjectTypeLabel(subject)}</td>
                                            <td className="subject-prerequisite-cell">
                                              {getSubjectPrerequisiteSummary(subject)}
                                            </td>
                                            <td className="subject-actions-cell">
                                              <button
                                                type="button"
                                                className="assignment-selection-btn secondary"
                                                onClick={() =>
                                                  openEditSubjectModal(subject)
                                                }
                                              >
                                                Edit
                                              </button>
                                              <button
                                                type="button"
                                                className="trash-icon-btn"
                                                onClick={() =>
                                                  handleDeleteSubject(subject)
                                                }
                                                aria-label={`Delete ${subject.code}`}
                                                title={`Delete ${subject.code}`}
                                              >
                                                <FaTrash />
                                                Delete
                                              </button>
                                            </td>
                                          </tr>
                                        ),
                                      )
                                    ) : (
                                      <tr>
                                        <td colSpan={6} className="empty-row">
                                          No subjects added yet
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* College Section */}
                  <div className="program-section">
                    <div className="program-section-header">
                      <FaUniversity className="program-icon" />
                      <h3>College</h3>
                    </div>
                    {["1st Year", "2nd Year", "3rd Year", "4th Year"].map(
                      (year) => (
                        <div key={year} className="year-level-section">
                          <div
                            className="year-level-header"
                            onClick={() => toggleCollegeYear(year)}
                          >
                            <h4>{year}</h4>
                            <button className="expand-btn">
                              {expandedCollegeSections[
                                year as keyof typeof expandedCollegeSections
                              ] ? (
                                <FaChevronUp />
                              ) : (
                                <FaChevronDown />
                              )}
                            </button>
                          </div>
                          {expandedCollegeSections[
                            year as keyof typeof expandedCollegeSections
                          ] && (
                            <div className="semesters-container">
                              {["1st Semester", "2nd Semester"].map((sem) => (
                                <div key={sem} className="semester-section">
                                  <div className="semester-header">
                                    <h5>{sem}</h5>
                                    <span className="subject-count">
                                      {collegeData[year][sem].length} subjects
                                    </span>
                                  </div>
                                  <div className="subjects-table-wrapper">
                                    <table className="subjects-table">
                                      <thead>
                                        <tr>
                                          <th>Subject Code</th>
                                          <th>Subject Title</th>
                                          <th>Units</th>
                                          <th>Type</th>
                                          <th>Prerequisites</th>
                                          <th>Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {collegeData[year][sem].length > 0 ? (
                                          collegeData[year][sem].map(
                                            (subject) => (
                                              <tr key={subject.id}>
                                                <td className="subject-code">
                                                  {subject.code}
                                                </td>
                                                <td>{subject.name}</td>
                                                <td>{subject.units || 3}</td>
                                                <td>{getSubjectTypeLabel(subject)}</td>
                                              <td className="subject-prerequisite-cell">
                                                {getSubjectPrerequisiteSummary(subject)}
                                              </td>
                                              <td className="subject-actions-cell">
                                                <button
                                                  type="button"
                                                  className="assignment-selection-btn secondary"
                                                  onClick={() =>
                                                    openEditSubjectModal(subject)
                                                  }
                                                >
                                                  Edit
                                                </button>
                                                <button
                                                  type="button"
                                                  className="trash-icon-btn"
                                                  onClick={() =>
                                                    handleDeleteSubject(subject)
                                                  }
                                                  aria-label={`Delete ${subject.code}`}
                                                  title={`Delete ${subject.code}`}
                                                >
                                                  <FaTrash />
                                                  Delete
                                                </button>
                                              </td>
                                            </tr>
                                          ),
                                        )
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="empty-row">
                                            No subjects added yet
                                          </td>
                                        </tr>
                                      )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Instructors Management */}
            {activeManagementTab === "instructors" && (
              <div className="management-section">
                <div className="section-header-actions instructor-management-header">
                  <h3>Instructor Management</h3>
                </div>
                <div className="instructor-toolbar">
                  <div className="instructor-search">
                    <FaSearch className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search by name, ID, or department..."
                      value={instructorSearch}
                      onChange={(e) => setInstructorSearch(e.target.value)}
                    />
                  </div>
                  <button
                    className="action-btn add"
                    onClick={openCreateInstructorModal}
                  >
                    <FaPlus /> Add Instructor
                  </button>
                  <button
                    type="button"
                    className="action-btn secondary"
                    onClick={() => setShowDepartmentManagerModal(true)}
                  >
                    Manage Departments
                  </button>
                </div>
                <div className="instructors-grid">
                  {filteredInstructors.map((instructor) => (
                    <div key={instructor.id} className="instructor-card">
                      <div className="instructor-avatar">
                        <FaChalkboardTeacher />
                      </div>
                      <div className="instructor-info">
                        <h4>{instructor.name}</h4>
                        <p>{instructor.employeeId}</p>
                        <p className="department">{instructor.department}</p>
                        <p className="contact">{instructor.email}</p>
                      </div>
                      <div className="instructor-actions">
                        <button
                          className="action-btn edit"
                          onClick={() => openEditInstructorModal(instructor)}
                        >
                          Edit
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => {
                            void handleDeleteInstructor(instructor);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Class Assignments */}
            {activeManagementTab === "assignments" && (
              <div className="management-section">
                <div className="section-header-actions">
                  <h3>Class Schedule & Assignments</h3>
                  <div className="section-header-button-group">
                    <button
                      type="button"
                      className="action-btn secondary"
                      onClick={() => setShowClassroomManagerModal(true)}
                    >
                      Classroom Management
                    </button>
                    <button
                      className="action-btn add"
                      onClick={() => openCreateAssignmentModal()}
                    >
                      <FaPlus /> Create Assignment
                    </button>
                  </div>
                </div>
                <div className="assignments-filters">
                  <select
                    className="filter-select"
                    value={assignmentFilter.program}
                    onChange={(e) =>
                      setAssignmentFilter({
                        ...assignmentFilter,
                        program: e.target.value,
                        strandOrCourse: "All",
                        semester: "All",
                      })
                    }
                  >
                    <option value="All">All Programs</option>
                    <option value="College">College</option>
                    <option value="SHS">SHS</option>
                  </select>
                  <select
                    className="filter-select"
                    value={assignmentFilter.strandOrCourse}
                    onChange={(e) =>
                      setAssignmentFilter({
                        ...assignmentFilter,
                        strandOrCourse: e.target.value,
                        semester: "All",
                      })
                    }
                  >
                    <option value="All">All Course/Strand</option>
                    {assignmentCourseStrandOptions.map((strandOrCourse) => (
                      <option key={strandOrCourse} value={strandOrCourse}>
                        {strandOrCourse}
                      </option>
                    ))}
                  </select>
                  <select
                    className="filter-select"
                    value={assignmentFilter.semester}
                    onChange={(e) =>
                      setAssignmentFilter({
                        ...assignmentFilter,
                        semester: e.target.value,
                      })
                    }
                  >
                    <option value="All">All Semesters</option>
                    {assignmentSemesterOptions.map((semester) => (
                      <option key={semester} value={semester}>
                        {semester} 2026-2027
                      </option>
                    ))}
                  </select>
                </div>

                <div className="assignment-bulk-toolbar">
                  <div className="assignment-bulk-summary">
                    <span className="assignment-toolbar-pill">
                      {filteredAssignments.length} visible
                    </span>
                    <span
                      className={`assignment-toolbar-pill ${selectedAssignments.length > 0 ? "active" : ""}`}
                    >
                      {selectedAssignments.length} selected
                    </span>
                    {selectedVisibleAssignmentCount > 0 &&
                      selectedVisibleAssignmentCount !==
                        selectedAssignments.length && (
                        <span className="assignment-toolbar-caption">
                          {selectedVisibleAssignmentCount} selected in current
                          view
                        </span>
                      )}
                  </div>
                  <div className="assignment-bulk-actions">
                    <button
                      type="button"
                      className={`assignment-selection-btn ${selectedAssignments.length > 0 ? "secondary" : ""}`}
                      onClick={toggleVisibleAssignmentSelection}
                      disabled={
                        filteredAssignments.length === 0 &&
                        selectedAssignments.length === 0
                      }
                    >
                      {selectedAssignments.length > 0
                        ? "Clear Selection"
                        : "Select Visible"}
                    </button>
                    <button
                      type="button"
                      className="action-btn delete assignment-delete-trigger trash-icon-btn"
                      onClick={() =>
                        openAssignmentDeleteModal(
                          selectedAssignments.map(
                            (assignment) => assignment.id,
                          ),
                        )
                      }
                      disabled={selectedAssignments.length === 0}
                      aria-label={`Delete ${selectedAssignments.length} selected assignments`}
                      title={`Delete ${selectedAssignments.length} selected assignments`}
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>

                <div className="assignments-list">
                  {filteredAssignmentSections.map((section) => {
                    const sectionAssignments = filteredAssignments.filter(
                      (a) => a.sectionCode === section.code,
                    );
                    const isExpanded = expandedAssignmentSections[section.code];
                    const selectedSectionAssignmentCount =
                      sectionAssignments.filter((assignment) =>
                        selectedAssignmentIds.includes(assignment.id),
                      ).length;
                    const allSectionAssignmentsSelected =
                      sectionAssignments.length > 0 &&
                      selectedSectionAssignmentCount ===
                        sectionAssignments.length;

                    return (
                      <div
                        key={section.id}
                        className="section-assignment-group"
                      >
                        <div
                          className="section-group-header"
                          onClick={() => toggleAssignmentSection(section.code)}
                        >
                          <div className="group-info">
                            <FaLayerGroup />
                            <h4>{section.code}</h4>
                            <span className="count-tag">
                              {sectionAssignments.length} Assignments
                            </span>
                            {selectedSectionAssignmentCount > 0 && (
                              <span className="count-tag selected">
                                {selectedSectionAssignmentCount} Selected
                              </span>
                            )}
                          </div>
                          <div className="group-actions">
                            <button
                              type="button"
                              className="assignment-selection-btn secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSectionAssignmentSelection(section.code);
                              }}
                              disabled={sectionAssignments.length === 0}
                            >
                              {allSectionAssignmentsSelected
                                ? "Clear Subjects"
                                : "Select All Subjects"}
                            </button>
                            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="section-assignments-content">
                            {sectionAssignments.length > 0 ? (
                              sectionAssignments.map((assignment) => (
                                <div
                                  key={assignment.id}
                                  className={`assignment-card mini ${selectedAssignmentIds.includes(assignment.id) ? "selected" : ""}`}
                                >
                                  <div className="assignment-header">
                                    <div className="assignment-header-main">
                                      <label className="assignment-card-check">
                                        <input
                                          type="checkbox"
                                          checked={selectedAssignmentIds.includes(
                                            assignment.id,
                                          )}
                                          onChange={() =>
                                            toggleAssignmentSelection(
                                              assignment.id,
                                            )
                                          }
                                        />
                                        <span>Select</span>
                                      </label>
                                      <h5>
                                        {assignment.subjectCode} -{" "}
                                        {assignment.subjectName}
                                      </h5>
                                    </div>
                                    <div className="mini-actions">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openEditAssignmentModal(assignment)
                                        }
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="trash-icon-btn"
                                        onClick={() =>
                                          handleRemoveAssignment(assignment.id)
                                        }
                                        aria-label={`Delete ${assignment.subjectCode} ${assignment.subjectName}`}
                                        title={`Delete ${assignment.subjectCode} ${assignment.subjectName}`}
                                      >
                                        <FaTrash />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="assignment-details-grid">
                                    <p>
                                      <strong>Instructor:</strong>{" "}
                                      {assignment.instructorName}
                                    </p>
                                    <p>
                                      <strong>Schedule:</strong>{" "}
                                      {assignment.schedule.length > 0
                                        ? assignment.schedule
                                            .map(
                                              (s) =>
                                                `${s.day} ${s.startTime}-${s.endTime} (${s.room})`,
                                            )
                                            .join(", ")
                                        : "To be announced"}
                                    </p>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="empty-assignment">
                                <p>No schedules assigned to this section.</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Evaluation */}
            {activeManagementTab === "evaluation" && (
              <div className="management-section evaluation-management-section">
                <div className="section-header-actions">
                  <div>
                    <h3>Evaluation</h3>
                    <p className="evaluation-management-subtitle">
                      Open or close student evaluations and monitor teacher
                      satisfaction ratings.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="add-btn evaluation-questionnaire-btn"
                    onClick={() => {
                      const selectedCategoryId =
                        selectedQuestionnaireCategoryId ||
                        evaluationQuestionnaire[0]?.id ||
                        "";
                      setSelectedQuestionnaireCategoryId(selectedCategoryId);
                      setShowQuestionnaireModal(true);
                    }}
                  >
                    <FaPlus /> Manage Questionnaire
                  </button>
                </div>

                <div className="evaluation-admin-summary">
                  <div className="evaluation-admin-stat">
                    <span>Open Evaluations</span>
                    <strong>
                      {
                        instructorEvaluationSummaries.filter(
                          (summary) => summary.isOpen,
                        ).length
                      }
                    </strong>
                  </div>
                  <div className="evaluation-admin-stat">
                    <span>Teachers Tracked</span>
                    <strong>{instructorEvaluationSummaries.length}</strong>
                  </div>
                  <div className="evaluation-admin-stat">
                    <span>Questionnaire Items</span>
                    <strong>{questionnaireQuestionCount}</strong>
                  </div>
                </div>

                <div className="evaluation-admin-grid">
                  {instructorEvaluationSummaries.length > 0 ? (
                    instructorEvaluationSummaries.map((summary) => (
                      <article
                        key={summary.instructor.id}
                        className={`evaluation-admin-card ${
                          summary.isOpen ? "open" : "closed"
                        }`}
                      >
                        <div className="evaluation-admin-card-head">
                          <div className="instructor-avatar evaluation-avatar">
                            <FaChalkboardTeacher />
                          </div>
                          <div className="evaluation-admin-title">
                            <h4>{summary.instructor.name}</h4>
                            <p>
                              {summary.instructor.employeeId} •{" "}
                              {summary.instructor.department || "Department TBA"}
                            </p>
                          </div>
                          <span
                            className={`evaluation-status-pill ${
                              summary.isOpen ? "open" : "closed"
                            }`}
                          >
                            {summary.isOpen ? "Open" : "Closed"}
                          </span>
                        </div>

                        <div className="evaluation-admin-meta">
                          <span>{summary.sections.length} sections</span>
                          <span>{summary.responseCount} responses</span>
                        </div>

                        <div className="evaluation-card-actions">
                          {loggedInRole === "Admin" && (
                            <button
                              type="button"
                              className="evaluation-toggle-btn details"
                              onClick={() => openEvaluationDetails(summary)}
                              disabled={summary.assignments.length === 0}
                            >
                              <FaEye />
                              View Details
                            </button>
                          )}
                          <button
                            type="button"
                            className={`evaluation-toggle-btn ${
                              summary.isOpen ? "close" : "open"
                            }`}
                            onClick={() =>
                              toggleInstructorEvaluation(
                                summary.instructor.id,
                                !summary.isOpen,
                              )
                            }
                            disabled={summary.assignments.length === 0}
                          >
                            {summary.isOpen ? <FaToggleOn /> : <FaToggleOff />}
                            {summary.isOpen
                              ? "Close Evaluation"
                              : "Open Evaluation"}
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-assignment evaluation-empty">
                      <p>Add instructors first to manage evaluation access.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals remain the same as original */}
      {loggedInRole === "Admin" && selectedEvaluationSummary && (
        <div className="review-modal-overlay" role="dialog">
          <div className="review-modal evaluation-details-modal">
            <div className="review-modal-header">
              <div>
                <h2>{selectedEvaluationSummary.instructor.name}</h2>
                <p className="questionnaire-modal-subtitle">
                  Evaluation result percentages by question.
                </p>
              </div>
              <button
                className="review-modal-close"
                onClick={() => setSelectedEvaluationDetailsInstructorId("")}
                aria-label="Close evaluation details"
              >
                x
              </button>
            </div>
            <div className="review-modal-body evaluation-details-body">
              <div className="evaluation-details-filters">
                <div className="form-group">
                  <label>Subject</label>
                  <select
                    value={resolvedEvaluationSubjectId}
                    onChange={(event) =>
                      setEvaluationDetailsFilters((prev) => ({
                        ...prev,
                        subjectId: event.target.value,
                        yearLevel: "",
                        section: "All",
                      }))
                    }
                  >
                    {selectedEvaluationSubjectOptions.length > 0 ? (
                      selectedEvaluationSubjectOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))
                    ) : (
                      <option value="">No subject assigned</option>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label>Year Level</label>
                  <select
                    value={resolvedEvaluationYearLevel}
                    onChange={(event) =>
                      setEvaluationDetailsFilters((prev) => ({
                        ...prev,
                        yearLevel: event.target.value,
                        section: "All",
                      }))
                    }
                  >
                    {selectedEvaluationYearOptions.length > 0 ? (
                      selectedEvaluationYearOptions.map((yearLevel) => (
                        <option key={yearLevel} value={yearLevel}>
                          {yearLevel}
                        </option>
                      ))
                    ) : (
                      <option value="">No year level available</option>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label>Section</label>
                  <select
                    value={resolvedEvaluationSection}
                    onChange={(event) =>
                      setEvaluationDetailsFilters((prev) => ({
                        ...prev,
                        section: event.target.value,
                      }))
                    }
                  >
                    <option value="All">All Section</option>
                    {selectedEvaluationSectionOptions.map((section) => (
                      <option key={section} value={section}>
                        {section}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="evaluation-details-summary">
                <div>
                  <span>Filtered Responses</span>
                  <strong>{selectedEvaluationFilteredSubmissions.length}</strong>
                </div>
                <div>
                  <span>Total Responses</span>
                  <strong>{selectedEvaluationSummary.responseCount}</strong>
                </div>
              </div>

              <div className="evaluation-results-list">
                {evaluationQuestionnaire.length > 0 ? (
                  evaluationQuestionnaire.map((category) => (
                    <section
                      key={`details-${category.id}`}
                      className="evaluation-results-category"
                    >
                      <h3>{category.name}</h3>
                      {category.questions.length > 0 ? (
                        category.questions.map((question) => {
                          const questionType = question.type || "rating";
                          const ratings = selectedEvaluationFilteredSubmissions
                            .map((submission) => submission.responses[question.id])
                            .filter(
                              (rating): rating is number =>
                                typeof rating === "number" &&
                                Number.isFinite(rating) &&
                                rating >= 1 &&
                                rating <= 5,
                            );
                          const essayAnswers = selectedEvaluationFilteredSubmissions
                            .map((submission) => ({
                              answer: submission.responses[question.id],
                            }))
                            .filter(
                              (item): item is {
                                answer: string;
                              } =>
                                typeof item.answer === "string" &&
                                item.answer.trim().length > 0,
                            );
                          const answerCount =
                            questionType === "essay"
                              ? essayAnswers.length
                              : ratings.length;

                          return (
                            <div
                              key={`details-${question.id}`}
                              className="evaluation-result-question"
                            >
                              <div className="evaluation-result-question-head">
                                <strong>{question.text}</strong>
                                <span>{answerCount} answers</span>
                              </div>
                              {questionType === "essay" ? (
                                <div className="evaluation-essay-results">
                                  {essayAnswers.length > 0 ? (
                                    essayAnswers.map((item, index) => (
                                      <blockquote
                                        key={`${question.id}-${index}`}
                                      >
                                        <p>{item.answer}</p>
                                        <cite>{anonymousEvaluationResponderLabel}</cite>
                                      </blockquote>
                                    ))
                                  ) : (
                                    <div className="questionnaire-empty-row">
                                      No written answers yet.
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="evaluation-result-bars">
                                  {[5, 4, 3, 2, 1].map((rating) => {
                                    const ratingCount = ratings.filter(
                                      (value) => value === rating,
                                    ).length;
                                    const percentage =
                                      answerCount > 0
                                        ? Math.round(
                                            (ratingCount / answerCount) * 100,
                                          )
                                        : 0;

                                    return (
                                      <div
                                        key={`${question.id}-${rating}`}
                                        className="evaluation-result-bar-row"
                                      >
                                        <span>{rating}</span>
                                        <div className="evaluation-result-track">
                                          <i
                                            style={{ width: `${percentage}%` }}
                                          />
                                        </div>
                                        <strong>{percentage}%</strong>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="questionnaire-empty-row">
                          No questions in this category.
                        </div>
                      )}
                    </section>
                  ))
                ) : (
                  <div className="questionnaire-empty-preview">
                    No questionnaire has been configured yet.
                  </div>
                )}
              </div>
            </div>
            <div className="review-modal-footer">
              <button
                type="button"
                className="action-btn add"
                onClick={downloadEvaluationReport}
              >
                Download Evaluation Report
              </button>
              <button
                type="button"
                className="action-btn secondary"
                onClick={() => setSelectedEvaluationDetailsInstructorId("")}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showQuestionnaireModal && (
        <div className="review-modal-overlay" role="dialog">
          <div className="review-modal questionnaire-modal">
            <div className="review-modal-header">
              <div>
                <h2>Manage Questionnaire</h2>
                <p className="questionnaire-modal-subtitle">
                  Create rating categories and questions for student evaluations.
                </p>
              </div>
              <button
                className="review-modal-close"
                onClick={() => setShowQuestionnaireModal(false)}
                aria-label="Close questionnaire modal"
              >
                x
              </button>
            </div>
            <div className="review-modal-body questionnaire-modal-body">
              <div className="questionnaire-form-card">
                <h3>Questionnaire Form</h3>
                <div className="questionnaire-inline-form">
                  <div className="form-group">
                    <label>Category Name</label>
                    <input
                      type="text"
                      value={questionnaireCategoryName}
                      onChange={(event) =>
                        setQuestionnaireCategoryName(event.target.value)
                      }
                      placeholder="Category 1"
                    />
                  </div>
                  <button
                    type="button"
                    className="questionnaire-save-btn"
                    onClick={handleAddQuestionnaireCategory}
                  >
                    <FaPlus /> Add Category
                  </button>
                </div>

                <div className="questionnaire-inline-form">
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={selectedQuestionnaireCategoryId}
                      onChange={(event) =>
                        setSelectedQuestionnaireCategoryId(event.target.value)
                      }
                    >
                      {evaluationQuestionnaire.length > 0 ? (
                        evaluationQuestionnaire.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))
                      ) : (
                        <option value="">Add a category first</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Question Name</label>
                    <input
                      type="text"
                      value={questionnaireQuestionText}
                      onChange={(event) =>
                        setQuestionnaireQuestionText(event.target.value)
                      }
                      placeholder="Question 1"
                    />
                  </div>
                  <div className="form-group">
                    <label>Question Type</label>
                    <select
                      value={questionnaireQuestionType}
                      onChange={(event) =>
                        setQuestionnaireQuestionType(
                          event.target.value === "essay" ? "essay" : "rating",
                        )
                      }
                    >
                      <option value="rating">Rating</option>
                      <option value="essay">
                        Constructed-response question
                      </option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="questionnaire-save-btn"
                    onClick={handleAddQuestionnaireQuestion}
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="questionnaire-preview-card">
                <div className="questionnaire-rating-legend">
                  <strong>Rating Legend</strong>
                  <span>
                    5 = Strongly Agree, 4 = Agree, 3 = Uncertain, 2 =
                    Disagree, 1 = Strongly Disagree
                  </span>
                </div>

                {evaluationQuestionnaire.length > 0 ? (
                  <div className="questionnaire-category-list">
                    {evaluationQuestionnaire.map((category) => (
                      <section
                        key={category.id}
                        className="questionnaire-category-block"
                      >
                        <div className="questionnaire-category-heading">
                          <span>{category.name}</span>
                          <button
                            type="button"
                            className="questionnaire-icon-btn"
                            onClick={() =>
                              handleDeleteQuestionnaireCategory(category.id)
                            }
                            aria-label={`Delete ${category.name}`}
                            title={`Delete ${category.name}`}
                          >
                            <FaTrash />
                          </button>
                        </div>

                        <div className="questionnaire-table">
                          <div className="questionnaire-table-row heading">
                            <strong>Questions</strong>
                            {[5, 4, 3, 2, 1].map((rating) => (
                              <strong key={rating}>{rating}</strong>
                            ))}
                            <strong>Action</strong>
                          </div>

                          {category.questions.length > 0 ? (
                            category.questions.map((question) => (
                              <div
                                key={question.id}
                                className={`questionnaire-table-row ${
                                  (question.type || "rating") === "essay"
                                    ? "essay"
                                    : ""
                                }`}
                              >
                                <span>
                                  {question.text}
                                  <small>
                                    {(question.type || "rating") === "essay"
                                      ? "Constructed-response question"
                                      : "Rating"}
                                  </small>
                                </span>
                                {(question.type || "rating") === "essay" ? (
                                  <span className="questionnaire-essay-preview">
                                    Written response
                                  </span>
                                ) : (
                                  [5, 4, 3, 2, 1].map((rating) => (
                                    <span
                                      key={rating}
                                      className="questionnaire-radio-preview"
                                    />
                                  ))
                                )}
                                <button
                                  type="button"
                                  className="questionnaire-icon-btn"
                                  onClick={() =>
                                    handleDeleteQuestionnaireQuestion(
                                      category.id,
                                      question.id,
                                    )
                                  }
                                  aria-label={`Delete ${question.text}`}
                                  title={`Delete ${question.text}`}
                                >
                                  <FaTrash />
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="questionnaire-empty-row">
                              No questions in this category yet.
                            </div>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="questionnaire-empty-preview">
                    Add a category to start building the evaluation form.
                  </div>
                )}
              </div>
            </div>
            <div className="review-modal-footer">
              <button
                type="button"
                className="action-btn secondary"
                onClick={() => setShowQuestionnaireModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRequest && (
        <div className="review-modal-overlay" role="dialog">
          <div className="review-modal application-review-modal">
            <div className="review-modal-header application-review-header">
              <div>
                <h2>Application Review</h2>
                <p>
                  {selectedRequest.fullName} •{" "}
                  {isEnrollmentRequest(selectedRequest)
                    ? selectedRequest.studentNumber
                    : selectedRequest.studentNumber ||
                      selectedRequest.trackingNumber}
                </p>
              </div>
              <button className="review-modal-close" onClick={closeReviewModal}>
                ✕
              </button>
            </div>
            <div className="review-modal-body">
              <div className="personal-information-section">
                <h3>Request Information</h3>
                <div className="personal-information-card">
                  <div className="personal-info-grid">
                    {isEnrollmentRequest(selectedRequest) ? (
                      <>
                        <div className="personal-info-item">
                          <span>Student Number</span>
                          <strong>{selectedRequest.studentNumber}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Program</span>
                          <strong>{selectedRequest.program}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Full Name</span>
                          <strong>{selectedRequest.fullName}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Current Level</span>
                          <strong>{selectedRequest.currentYearLevel}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Requested Level</span>
                          <strong>
                            {selectedRequest.program === "SHS" &&
                            selectedRequest.requestedYearLevel === "College"
                              ? "1st Year College"
                              : selectedRequest.requestedYearLevel}
                          </strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Academic Year</span>
                          <strong>{selectedRequest.academicYear}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Semester</span>
                          <strong>{selectedRequest.semester}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Request Date</span>
                          <strong>{selectedRequest.requestDate}</strong>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="personal-info-item">
                          <span>Student Number</span>
                          <strong>
                            {selectedRequest.studentNumber ||
                              "Pending upon approval"}
                          </strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Program</span>
                          <strong>{selectedRequest.program}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Submitted Status</span>
                          <strong>
                            {selectedRequest.studentStatus || "Not provided"}
                          </strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Full Name</span>
                          <strong>{selectedRequest.fullName}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Semester</span>
                          <strong>{reflectedSemester}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Submitted Date</span>
                          <strong>{selectedRequest.applicationDate}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Academic Year</span>
                          <strong>{reflectedAcademicYear}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Own Schedule Request</span>
                          <strong>
                            {selectedRequest.requestedOwnSchedule
                              ? getOwnScheduleRequestLabel(selectedRequest)
                              : "Standard flow"}
                          </strong>
                        </div>
                        {isTransfereeAdmission(selectedRequest) && (
                          <>
                            <div className="personal-info-item">
                              <span>Requested Year Level</span>
                              <strong>{selectedRequest.yearLevel}</strong>
                            </div>
                            <div className="personal-info-item">
                              <span>Validation Status</span>
                              <strong>
                                {selectedTransfereeEvaluation &&
                                isTransfereeEvaluationComplete(
                                  selectedTransfereeEvaluation,
                                )
                                  ? "Ready for approval"
                                  : selectedTransfereeEvaluation
                                    ? "Needs validation"
                                    : "Pending setup"}
                              </strong>
                            </div>
                            <div className="personal-info-item">
                              <span>Section Assignment</span>
                              <strong>
                                {getAssignedSectionCode(selectedRequest.id)}
                              </strong>
                            </div>
                          </>
                        )}
                        {selectedRequest.program === "College" && (
                          <>
                            <div className="personal-info-item">
                              <span>Academic Honor</span>
                              <strong>{selectedAdmissionHonorLabel}</strong>
                            </div>
                            <div className="personal-info-item">
                              <span>Honor Certificate</span>
                              <strong>
                                {selectedAdmissionHonorCertificateStatus}
                              </strong>
                            </div>
                            <div className="personal-info-item">
                              <span>Scholarship Applied</span>
                              <strong>
                                {selectedAdmissionScholarshipStatus}
                              </strong>
                            </div>
                            <div className="personal-info-item">
                              <span>Scholarship Exam Score</span>
                              {selectedRequest.status === "Pending" ? (
                                <input
                                  type="number"
                                  min="0"
                                  max={SCHOLARSHIP_EXAM_MAX_SCORE}
                                  step="1"
                                  value={pendingScholarshipScore}
                                  onChange={(event) =>
                                    setPendingScholarshipScore(
                                      event.target.value,
                                    )
                                  }
                                  placeholder={
                                    selectedRequest.appliedForScholarship
                                      ? `Score out of ${SCHOLARSHIP_EXAM_MAX_SCORE}`
                                      : "Optional"
                                  }
                                />
                              ) : (
                                <strong>
                                  {typeof selectedRequest.scholarshipExamScore ===
                                  "number"
                                    ? selectedRequest.scholarshipExamScore
                                    : "Awaiting result"}
                                </strong>
                              )}
                            </div>
                            {selectedAdmissionTuition && (
                              <>
                                <div className="personal-info-item">
                                  <span>Estimated Tuition</span>
                                  <strong>
                                    {formatCurrency(
                                      selectedAdmissionTuition.baseTuition,
                                    )}
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>Honor Discount</span>
                                  <strong>
                                    {
                                      selectedAdmissionTuition.honorDiscountPercentage
                                    }
                                    %
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>Scholarship Exam Discount</span>
                                  <strong>
                                    {
                                      selectedAdmissionTuition.scholarshipExamDiscountPercentage
                                    }
                                    %
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>Applied Discount</span>
                                  <strong>
                                    {
                                      selectedAdmissionTuition.effectiveDiscountPercentage
                                    }
                                    % (
                                    {formatCurrency(
                                      selectedAdmissionTuition.effectiveDiscountAmount,
                                    )}
                                    )
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>Discount Basis</span>
                                  <strong>
                                    {
                                      selectedAdmissionTuition.effectiveDiscountSourceLabel
                                    }
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>Tuition After Discount</span>
                                  <strong>
                                    {formatCurrency(
                                      selectedAdmissionTuition.tuitionAfterDiscount,
                                    )}
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>On-Site Payment</span>
                                  <strong>
                                    {formatCurrency(
                                      selectedAdmissionTuition.onSitePayment,
                                    )}
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>Estimated Remaining Balance</span>
                                  <strong>
                                    {formatCurrency(
                                      selectedAdmissionTuition.remainingBalance,
                                    )}
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>Scholarship Tuition Status</span>
                                  <strong>
                                    {selectedAdmissionScholarshipTuitionStatus}
                                  </strong>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              {!isEnrollmentRequest(selectedRequest) && (
                <div className="personal-information-section admission-personal-information-section">
                  <h3>Personal Information</h3>
                  <div className="personal-information-card">
                    <div className="personal-info-grid admission-personal-info-grid">
                      {getAdmissionPersonalInfoItems(selectedRequest).map(
                        (item) => (
                          <div
                            className={[
                              "personal-info-item",
                              item.isWide ? "personal-info-item-wide" : "",
                              item.spanClassName || "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={item.label}
                          >
                            <span>{item.label}</span>
                            <strong>{getReviewInfoValue(item.value)}</strong>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              )}
              {isEnrollmentRequest(selectedRequest) &&
                selectedRequest.requestedLoad?.mode === "retake" && (
                  <div className="requirements-section enrollment-retake-review-section">
                    <h3>Requested Retake Load</h3>
                    {(() => {
                      const requestedLoad = selectedRequest.requestedLoad;
                      const requestedLoadConflicts =
                        buildScheduledAssignmentConflicts(
                          requestedLoad.scheduledAssignments,
                        );

                      return (
                        <>
                          <div className="transferee-review-note">
                            This enrollment request includes a student-selected
                            retake load. Approving the request will publish the
                            selected schedules as the student&apos;s official
                            load when at least one schedule was chosen.
                          </div>
                          <div className="retake-request-summary-row">
                            <div className="requirement-stat pending">
                              <span>Retake subjects</span>
                              <strong>{requestedLoad.subjects.length}</strong>
                            </div>
                            <div className="requirement-stat approved">
                              <span>Selected schedules</span>
                              <strong>
                                {requestedLoad.scheduledAssignments.length}
                              </strong>
                            </div>
                            <div className="requirement-stat redo">
                              <span>Conflicts</span>
                              <strong>{requestedLoadConflicts.length}</strong>
                            </div>
                          </div>
                          {requestedLoadConflicts.length > 0 ? (
                            <div className="retake-request-warning">
                              <strong>Conflicting requested schedules.</strong>
                              <ul className="retake-request-warning-list">
                                {requestedLoadConflicts.map((conflict) => (
                                  <li
                                    key={`${conflict.leftAssignmentId}-${conflict.rightAssignmentId}`}
                                  >
                                    {conflict.message}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          <div className="retake-request-list">
                            {requestedLoad.subjects.map((subject) => {
                              const selectedAssignment =
                                requestedLoad.scheduledAssignments.find(
                                  (assignment) =>
                                    assignment.subjectCode === subject.subjectCode ||
                                    assignment.subjectId === subject.subjectId,
                                );

                              return (
                                <div
                                  key={`${subject.subjectCode}-${subject.subjectTitle}`}
                                  className="retake-request-card"
                                >
                                  <div className="retake-request-card-head">
                                    <div>
                                      <strong>
                                        {subject.subjectCode} -{" "}
                                        {subject.subjectTitle}
                                      </strong>
                                      <p>
                                        {subject.gradingPeriods.join(", ")}
                                      </p>
                                    </div>
                                    <span className="retake-request-status-badge">
                                      {subject.evaluation === "Incomplete"
                                        ? "INC"
                                        : "FAILED"}
                                    </span>
                                  </div>
                                  <div className="retake-request-schedule">
                                    {selectedAssignment ? (
                                      <>
                                        <span>Selected schedule</span>
                                        <strong>
                                          {formatScheduledAssignmentLabel(
                                            selectedAssignment,
                                          )}
                                        </strong>
                                      </>
                                    ) : (
                                      <>
                                        <span>Selected schedule</span>
                                        <strong>
                                          No schedule offering was available at
                                          submission time.
                                        </strong>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              {isEnrollmentRequest(selectedRequest) &&
                selectedRequest.irregularRequest && (
                  <div className="requirements-section enrollment-irregular-review-section">
                    <h3>Irregular Enrollment Request</h3>
                    {(() => {
                      const irregularRequest = selectedRequest.irregularRequest;
                      const requestedSection =
                        getRequestedSectionForEnrollmentRequest(selectedRequest);
                      const scheduledAssignments =
                        getEnrollmentRequestScheduledAssignments(selectedRequest);
                      const scheduledAssignmentConflicts =
                        buildScheduledAssignmentConflicts(scheduledAssignments);

                      return (
                        <>
                          {irregularRequest.mode === "section_assignment" &&
                          !requestedSection ? (
                            <div className="retake-request-warning">
                              <strong>Requested section not found.</strong>
                              <ul className="retake-request-warning-list">
                                <li>
                                  The section saved in this request is no longer
                                  available in the current section list.
                                </li>
                              </ul>
                            </div>
                          ) : null}
                          {scheduledAssignmentConflicts.length > 0 ? (
                            <div className="retake-request-warning">
                              <strong>Conflicting requested schedules.</strong>
                              <ul className="retake-request-warning-list">
                                {scheduledAssignmentConflicts.map((conflict) => (
                                  <li
                                    key={`${conflict.leftAssignmentId}-${conflict.rightAssignmentId}`}
                                  >
                                    {conflict.message}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          <div className="retake-request-list">
                            <div className="retake-request-card enrollment-irregular-request-card">
                              <div className="retake-request-card-head">
                                <div>
                                  <strong>
                                    {irregularRequest.mode === "own_schedule"
                                      ? "Portal own schedule request"
                                      : `Section ${requestedSection?.code || irregularRequest.requestedSectionCode || "request"}`}
                                  </strong>
                                  <p>
                                    {selectedRequest.requestedYearLevel} |{" "}
                                    {selectedRequest.semester} |{" "}
                                    {selectedRequest.academicYear}
                                  </p>
                                </div>
                                <span className="retake-request-status-badge enrollment-irregular-badge">
                                  {irregularRequest.mode === "own_schedule"
                                    ? "OWN SCHEDULE"
                                    : "SECTION"}
                                </span>
                              </div>
                              <div className="retake-request-schedule">
                                {irregularRequest.mode === "own_schedule" ? (
                                  <>
                                    <span>Approval result</span>
                                    <strong>
                                      Student can build and submit a new
                                      schedule request in the portal for this
                                      term.
                                    </strong>
                                  </>
                                ) : (
                                  <>
                                    <span>Section details</span>
                                    <strong>
                                      {requestedSection
                                        ? `${requestedSection.code} | ${requestedSection.currentEnrollees}/${requestedSection.maxCapacity} enrolled`
                                        : "Section details are no longer available."}
                                    </strong>
                                  </>
                                )}
                              </div>
                            </div>
                            {irregularRequest.mode === "section_assignment" &&
                            scheduledAssignments.length > 0
                              ? scheduledAssignments.map((assignment) => (
                                  <div
                                    key={assignment.assignmentId}
                                    className="retake-request-card"
                                  >
                                    <div className="retake-request-card-head">
                                      <div>
                                        <strong>
                                          {assignment.subjectCode} -{" "}
                                          {assignment.subjectName}
                                        </strong>
                                        <p>
                                          {assignment.sectionCode || "Section TBA"}
                                        </p>
                                      </div>
                                      <span className="retake-request-status-badge enrollment-irregular-badge">
                                        SECTION
                                      </span>
                                    </div>
                                    <div className="retake-request-schedule">
                                      <span>Published schedule on approve</span>
                                      <strong>
                                        {formatScheduledAssignmentLabel(
                                          assignment,
                                        )}
                                      </strong>
                                    </div>
                                  </div>
                                ))
                              : null}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              {!isEnrollmentRequest(selectedRequest) &&
                selectedRequest.requestedOwnSchedule && (
                  <div className="requirements-section transferee-review-section">
                    <h3>Own Schedule Request</h3>
                    <div className="transferee-review-grid">
                      <div className="transferee-review-card">
                        <p className="transferee-review-title">
                          Applicant request summary
                        </p>
                        <div className="transferee-review-note">
                          This applicant asked to choose their own class
                          schedules in the student portal. If you approve this
                          request and then approve the admission, the student
                          will enter the portal under an irregular scheduling
                          flow.
                        </div>
                        <label className="transferee-field">
                          <span>Request Status</span>
                          <input
                            type="text"
                            value={getOwnScheduleRequestLabel(selectedRequest)}
                            readOnly
                          />
                        </label>
                        <label className="transferee-field">
                          <span>Target Academic Year</span>
                          <input
                            type="text"
                            value={resolveOwnScheduleAcademicYear(selectedRequest)}
                            readOnly
                          />
                        </label>
                        <label className="transferee-field">
                          <span>Target Semester</span>
                          <input
                            type="text"
                            value={resolveOwnScheduleSemester(selectedRequest)}
                            readOnly
                          />
                        </label>
                      </div>
                      <div className="transferee-review-card">
                        <p className="transferee-review-title">
                          Review and approval
                        </p>
                        <div className="transferee-review-note">
                          Approve this first if you want the student to build
                          their schedule later in the portal. Reject it to keep
                          the student under the standard section assignment
                          workflow.
                        </div>
                        {selectedRequest.status === "Pending" ? (
                          <div className="assignment-selection-actions">
                            <button
                              type="button"
                              className="assignment-selection-btn"
                              onClick={() =>
                                handleOwnScheduleRequestDecision(
                                  selectedRequest,
                                  "Approved",
                                )
                              }
                              disabled={
                                selectedRequest.ownScheduleRequestStatus ===
                                "Approved"
                              }
                            >
                              Approve Request
                            </button>
                            <button
                              type="button"
                              className="assignment-selection-btn secondary"
                              onClick={() =>
                                handleOwnScheduleRequestDecision(
                                  selectedRequest,
                                  "Rejected",
                                )
                              }
                              disabled={
                                selectedRequest.ownScheduleRequestStatus ===
                                "Rejected"
                              }
                            >
                              Reject Request
                            </button>
                          </div>
                        ) : (
                          <div className="transferee-review-note">
                            This admission record is already{" "}
                            {selectedRequest.status.toLowerCase()}.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              {!isEnrollmentRequest(selectedRequest) &&
                isTransfereeAdmission(selectedRequest) &&
                selectedTransfereeEvaluation && (
                  <div className="requirements-section transferee-review-section">
                    <h3>Transferee Validation</h3>
                    <div className="transferee-review-grid">
                      <div className="transferee-review-card">
                        <p className="transferee-review-title">
                          Required validation before approval
                        </p>
                        {selectedTransfereeLocked && (
                          <div className="transferee-review-note">
                            This transferee has already been approved, so the
                            validation details are locked.
                          </div>
                        )}
                        <label className="transferee-check">
                          <input
                            type="checkbox"
                            checked={
                              selectedTransfereeEvaluation.credentialsReviewed
                            }
                            disabled={selectedTransfereeLocked}
                            onChange={(event) =>
                              updateTransfereeEvaluation(selectedRequest, {
                                credentialsReviewed: event.target.checked,
                              })
                            }
                          />
                          <span>
                            TOR and transfer credentials have been reviewed
                          </span>
                        </label>
                        <label className="transferee-check">
                          <input
                            type="checkbox"
                            checked={
                              selectedTransfereeEvaluation.placementConfirmed
                            }
                            disabled={selectedTransfereeLocked}
                            onChange={(event) =>
                              updateTransfereeEvaluation(selectedRequest, {
                                placementConfirmed: event.target.checked,
                              })
                            }
                          />
                          <span>
                            Final year-level placement has been confirmed
                          </span>
                        </label>
                        <label className="transferee-check">
                          <input
                            type="checkbox"
                            checked={
                              selectedTransfereeEvaluation.subjectLoadValidated
                            }
                            disabled={selectedTransfereeLocked}
                            onChange={(event) =>
                              updateTransfereeEvaluation(selectedRequest, {
                                subjectLoadValidated: event.target.checked,
                              })
                            }
                          />
                          <span>
                            Initial subject load or deficiencies have been
                            validated
                          </span>
                        </label>
                      </div>
                      <div className="transferee-review-card">
                        <p className="transferee-review-title">
                          Placement and section planning
                        </p>
                        <label className="transferee-field">
                          <span>Target Year Level</span>
                          <select
                            value={selectedTransfereeEvaluation.resolvedYearLevel}
                            disabled={selectedTransfereeLocked}
                            onChange={(event) => {
                              const nextYearLevel = event.target.value;
                              const nextPlanningSemesters =
                                getTransfereePlanningSemesters(
                                  selectedRequest,
                                  nextYearLevel,
                                );
                              const nextSemester =
                                (nextPlanningSemesters.includes(
                                  selectedTransfereeEvaluation.plannedSemester,
                                )
                                    ? selectedTransfereeEvaluation.plannedSemester
                                    : nextPlanningSemesters[0]) ||
                                DEFAULT_SECTION_SEMESTER;
                              const nextMatchingSections =
                                getMatchingSectionsForEnrollee(
                                  selectedRequest,
                                  nextYearLevel,
                                  nextSemester,
                                );
                              const nextRecommendedSectionId =
                                nextMatchingSections.some(
                                  (section) =>
                                    section.id ===
                                    selectedTransfereeEvaluation.recommendedSectionId,
                                )
                                  ? selectedTransfereeEvaluation.recommendedSectionId
                                  : "";
                              const nextAvailableSubjectIds = new Set(
                                getTransfereePlanningSubjects(
                                  selectedRequest,
                                  nextYearLevel,
                                  nextSemester,
                                ).map((subject) => subject.id),
                              );

                              updateTransfereeEvaluation(selectedRequest, {
                                resolvedYearLevel: nextYearLevel,
                                plannedSemester: nextSemester,
                                recommendedSectionId: nextRecommendedSectionId,
                                creditedSubjectIds:
                                  selectedTransfereeEvaluation.creditedSubjectIds,
                                assignedSubjectIds:
                                  selectedTransfereeEvaluation.assignedSubjectIds.filter(
                                    (subjectId) =>
                                      nextAvailableSubjectIds.has(subjectId),
                                  ),
                              });
                            }}
                          >
                            {getProgramYearLevelOptions(selectedRequest.program).map(
                              (yearLevel) => (
                                <option key={yearLevel} value={yearLevel}>
                                  {yearLevel}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="transferee-field">
                          <span>Target Semester</span>
                          <select
                            value={selectedTransfereeEvaluation.plannedSemester}
                            disabled={selectedTransfereeLocked}
                            onChange={(event) => {
                              const nextSemester = normalizeSectionSemester(
                                event.target.value,
                              );
                              const nextAvailableSubjectIds = new Set(
                                getTransfereePlanningSubjects(
                                  selectedRequest,
                                  selectedTransfereeEvaluation.resolvedYearLevel,
                                  nextSemester,
                                ).map((subject) => subject.id),
                              );

                              updateTransfereeEvaluation(selectedRequest, {
                                plannedSemester: nextSemester,
                                recommendedSectionId:
                                  getMatchingSectionsForEnrollee(
                                    selectedRequest,
                                    selectedTransfereeEvaluation.resolvedYearLevel,
                                    nextSemester,
                                  ).some(
                                    (section) =>
                                      section.id ===
                                      selectedTransfereeEvaluation.recommendedSectionId,
                                  )
                                    ? selectedTransfereeEvaluation.recommendedSectionId
                                    : "",
                                creditedSubjectIds:
                                  selectedTransfereeEvaluation.creditedSubjectIds,
                                assignedSubjectIds:
                                  selectedTransfereeEvaluation.assignedSubjectIds.filter(
                                    (subjectId) =>
                                      nextAvailableSubjectIds.has(subjectId),
                                  ),
                              });
                            }}
                          >
                            {(selectedTransfereePlanningSemesters.length > 0
                              ? selectedTransfereePlanningSemesters
                              : [DEFAULT_SECTION_SEMESTER]
                            ).map((semester) => (
                              <option key={semester} value={semester}>
                                {semester}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="transferee-field">
                          <span>Academic Year</span>
                          <input
                            type="text"
                            value={
                              selectedTransfereeEvaluation.plannedAcademicYear
                            }
                            disabled={selectedTransfereeLocked}
                            onChange={(event) =>
                              updateTransfereeEvaluation(selectedRequest, {
                                plannedAcademicYear: event.target.value,
                              })
                            }
                            placeholder={reflectedAcademicYear}
                          />
                        </label>
                        <label className="transferee-field">
                          <span>Available Section</span>
                          <select
                            value={selectedTransfereeEvaluation.recommendedSectionId}
                            disabled={selectedTransfereeLocked}
                            onChange={(event) => {
                              const nextSectionId = event.target.value;
                              const nextSection = selectedTransfereeMatchingSections.find(
                                (section) => section.id === nextSectionId,
                              );
                              const nextSemester = nextSection
                                ? normalizeSectionSemester(nextSection.semester)
                                : selectedTransfereeEvaluation.plannedSemester;
                              const nextAvailableSubjectIds = new Set(
                                getTransfereePlanningSubjects(
                                  selectedRequest,
                                  selectedTransfereeEvaluation.resolvedYearLevel,
                                  nextSemester,
                                ).map((subject) => subject.id),
                              );

                              updateTransfereeEvaluation(selectedRequest, {
                                recommendedSectionId: nextSectionId,
                                plannedSemester: nextSemester,
                                creditedSubjectIds:
                                  selectedTransfereeEvaluation.creditedSubjectIds,
                                assignedSubjectIds:
                                  selectedTransfereeEvaluation.assignedSubjectIds.filter(
                                    (subjectId) =>
                                      nextAvailableSubjectIds.has(subjectId),
                                  ),
                              });
                            }}
                          >
                            <option value="">Assign later</option>
                            {selectedTransfereeMatchingSections.map((section) => (
                              <option key={section.id} value={section.id}>
                                {section.code} - {section.currentEnrollees}/
                                {section.maxCapacity}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="transferee-field">
                          <span>Validation Notes</span>
                          <textarea
                            value={selectedTransfereeEvaluation.notes}
                            disabled={selectedTransfereeLocked}
                            onChange={(event) =>
                              updateTransfereeEvaluation(selectedRequest, {
                                notes: event.target.value,
                              })
                            }
                            placeholder="Example: Credited 11 subjects, advised to repeat NSTP 2, section assignment ready after approval."
                            rows={4}
                          />
                        </label>
                        <div className="transferee-review-note">
                          {selectedTransfereeMatchingSections.length > 0
                            ? "Matching sections are based on the applicant's program, strand/course, target year level, and target semester."
                            : "No matching section is available yet. You can still approve first and assign the section later from the section manager."}
                        </div>
                      </div>
                      <div className="transferee-review-card transferee-planner-card">
                        <div className="transferee-planner-header">
                          <div>
                            <p className="transferee-review-title">
                              TOR Credit and Subject Planning
                            </p>
                            <p className="transferee-planner-copy">
                              Mark the subjects already credited from the TOR,
                              then choose the exact load that should appear for
                              this transferee after approval.
                            </p>
                          </div>
                          <div className="transferee-planner-stats">
                            <div className="transferee-planner-stat">
                              <span>Curriculum</span>
                              <strong>
                                {selectedTransfereeFilteredCreditSubjects.length}
                              </strong>
                            </div>
                            <div className="transferee-planner-stat">
                              <span>Credited</span>
                              <strong>
                                {selectedTransfereeCreditedSubjects.length}
                              </strong>
                            </div>
                            <div className="transferee-planner-stat">
                              <span>Planned Load</span>
                              <strong>
                                {selectedTransfereeAssignedSubjects.length}
                              </strong>
                            </div>
                          </div>
                        </div>
                        <div className="assignment-subject-picker-header transferee-subject-picker-header">
                          <div>
                            <strong>
                              {selectedTransfereeEvaluation.plannedSemester} load
                            </strong>
                            <p>
                              Filter the TOR checklist by year level and
                              semester, then assign the load for the selected
                              target semester.
                            </p>
                          </div>
                        </div>
                        {selectedTransfereeCreditSubjectGroups.length > 0 ||
                        selectedTransfereeAvailableSubjects.length > 0 ? (
                          <div className="transferee-subject-planner-grid">
                            <div className="transferee-subject-column">
                              <h4>Credited from TOR</h4>
                              <div className="transferee-credit-filters">
                                <label className="transferee-field transferee-credit-search-field">
                                  <span>Search Subjects</span>
                                  <input
                                    type="search"
                                    value={transfereeCreditSearchTerm}
                                    onChange={(event) =>
                                      setTransfereeCreditSearchTerm(
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Search code, title, type..."
                                  />
                                </label>
                                <label className="transferee-field">
                                  <span>Credit Year Level</span>
                                  <select
                                    value={
                                      selectedTransfereeEvaluation.creditYearLevelFilter
                                    }
                                    onChange={(event) => {
                                      const nextYearLevelFilter =
                                        event.target.value;
                                      const nextSemesterOptions =
                                        sortSemesterValues(
                                          Array.from(
                                            new Set(
                                              selectedTransfereeCreditSubjects
                                                .filter(
                                                  (subject) =>
                                                    nextYearLevelFilter ===
                                                      "All" ||
                                                    subject.yearLevel ===
                                                      nextYearLevelFilter,
                                                )
                                                .map((subject) =>
                                                  normalizeSectionSemester(
                                                    subject.semester,
                                                  ),
                                                ),
                                            ),
                                          ),
                                        );
                                      const currentSemesterFilter =
                                        selectedTransfereeEvaluation.creditSemesterFilter;
                                      const nextSemesterFilter =
                                        currentSemesterFilter === "All" ||
                                        nextYearLevelFilter === "All" ||
                                        nextSemesterOptions.includes(
                                          currentSemesterFilter,
                                        )
                                          ? currentSemesterFilter
                                          : nextSemesterOptions[0] || "All";

                                      updateTransfereeEvaluation(selectedRequest, {
                                        creditYearLevelFilter:
                                          nextYearLevelFilter,
                                        creditSemesterFilter: nextSemesterFilter,
                                      });
                                    }}
                                  >
                                    <option value="All">All Year Levels</option>
                                    {selectedTransfereeCreditYearLevelOptions.map(
                                      (yearLevel) => (
                                        <option
                                          key={yearLevel}
                                          value={yearLevel}
                                        >
                                          {yearLevel}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </label>
                                <label className="transferee-field">
                                  <span>Credit Semester</span>
                                  <select
                                    value={
                                      selectedTransfereeResolvedCreditSemesterFilter
                                    }
                                    onChange={(event) =>
                                      updateTransfereeEvaluation(
                                        selectedRequest,
                                        {
                                          creditSemesterFilter:
                                            event.target.value,
                                        },
                                      )
                                    }
                                  >
                                    <option value="All">All Semesters</option>
                                    {selectedTransfereeCreditSemesterOptions.map(
                                      (semester) => (
                                        <option key={semester} value={semester}>
                                          {semester}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </label>
                              </div>
                              <div className="assignment-subject-selector transferee-subject-selector">
                                {selectedTransfereeCreditSubjectGroups.length >
                                0 ? (
                                  selectedTransfereeCreditSubjectGroups.map(
                                    (group) => (
                                      <div
                                        key={`${group.yearLevel}-${group.semester}`}
                                        className="transferee-credit-group"
                                      >
                                        <div className="transferee-credit-group-heading">
                                          <strong>{group.yearLevel}</strong>
                                          <span>{group.semester}</span>
                                        </div>
                                        {group.subjects.map((subject) => {
                                          const isCredited =
                                            selectedTransfereeEvaluation.creditedSubjectIds.includes(
                                              subject.id,
                                            );

                                          return (
                                            <label
                                              key={`credited-${subject.id}`}
                                              className={`assignment-subject-option ${isCredited ? "selected" : ""}`}
                                            >
                                              <span className="assignment-subject-control">
                                                <input
                                                  type="checkbox"
                                                  checked={isCredited}
                                                  disabled={selectedTransfereeLocked}
                                                  onChange={() =>
                                                    toggleTransfereeCreditedSubject(
                                                      selectedRequest,
                                                      subject.id,
                                                    )
                                                  }
                                                />
                                              </span>
                                              <div className="assignment-subject-details">
                                                <strong>
                                                  {subject.code} - {subject.name}
                                                </strong>
                                                <span>
                                                  {getSubjectTypeLabel(subject)}
                                                  {subject.units
                                                    ? ` | ${subject.units} units`
                                                    : ""}
                                                </span>
                                              </div>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    ),
                                  )
                                ) : (
                                  <div className="assignment-subject-empty">
                                    No curriculum subjects match the selected
                                    credit filters yet.
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="transferee-subject-column">
                              <h4>Subject load to assign</h4>
                              <div className="transferee-load-actions-panel">
                                <label className="transferee-field transferee-load-search-field">
                                  <span>Search Subjects</span>
                                  <input
                                    type="search"
                                    value={transfereeLoadSearchTerm}
                                    onChange={(event) =>
                                      setTransfereeLoadSearchTerm(
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Search code, title, type..."
                                  />
                                </label>
                                <div className="assignment-selection-actions">
                                  <button
                                    type="button"
                                    className="assignment-selection-btn"
                                    onClick={() =>
                                      applyRemainingTransfereeSubjects(
                                        selectedRequest,
                                        selectedTransfereeAvailableSubjects,
                                      )
                                    }
                                    disabled={
                                      selectedTransfereeLocked ||
                                      selectedTransfereeAvailableSubjects.length ===
                                      0
                                    }
                                  >
                                    Assign Remaining
                                  </button>
                                  <button
                                    type="button"
                                    className="assignment-selection-btn secondary"
                                    onClick={() =>
                                      clearTransfereeSubjectPlan(selectedRequest)
                                    }
                                    disabled={
                                      selectedTransfereeLocked ||
                                      selectedTransfereeEvaluation
                                        .creditedSubjectIds.length === 0 &&
                                      selectedTransfereeEvaluation
                                        .assignedSubjectIds.length === 0
                                    }
                                  >
                                    Clear Selections
                                  </button>
                                </div>
                              </div>
                              <div className="assignment-subject-selector transferee-subject-selector transferee-load-subject-selector">
                                {selectedTransfereeFilteredAssignableSubjects.length >
                                0 ? (
                                  <div className="transferee-credit-group">
                                    <div className="transferee-credit-group-heading">
                                      <strong>
                                        {
                                          selectedTransfereeEvaluation.resolvedYearLevel
                                        }
                                      </strong>
                                      <span>
                                        {
                                          selectedTransfereeEvaluation.plannedSemester
                                        }
                                      </span>
                                    </div>
                                    {selectedTransfereeFilteredAssignableSubjects.map(
                                      (subject) => {
                                        const isAssigned =
                                          selectedTransfereeEvaluation.assignedSubjectIds.includes(
                                            subject.id,
                                          );

                                        return (
                                          <label
                                            key={`assigned-${subject.id}`}
                                            className={`assignment-subject-option ${isAssigned ? "selected" : ""}`}
                                          >
                                            <span className="assignment-subject-control">
                                              <input
                                                type="checkbox"
                                                checked={isAssigned}
                                                disabled={selectedTransfereeLocked}
                                                onChange={() =>
                                                  toggleTransfereeAssignedSubject(
                                                    selectedRequest,
                                                    subject.id,
                                                  )
                                                }
                                              />
                                            </span>
                                            <div className="assignment-subject-details">
                                              <strong>
                                                {subject.code} - {subject.name}
                                              </strong>
                                              <span>
                                                {getSubjectTypeLabel(subject)}
                                                {subject.units
                                                  ? ` | ${subject.units} units`
                                                  : ""}
                                              </span>
                                            </div>
                                          </label>
                                        );
                                      },
                                    )}
                                  </div>
                                ) : (
                                  <div className="assignment-subject-empty">
                                    {selectedTransfereeAssignableSubjects.length >
                                    0
                                      ? "No subject load matches your search."
                                      : "All matching subjects are already credited from the TOR for this semester."}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="assignment-subject-empty">
                            No curriculum subjects match the resolved year
                            level and selected semester yet. Add them first in
                            Academic Management if needed.
                          </div>
                        )}
                        <div className="transferee-review-note">
                          If you leave the planned load empty, the approved
                          transferee will still follow the default
                          section/curriculum subjects for the chosen semester.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              <div className="requirements-section">
                <h3>Document Requirements</h3>
                {(() => {
                  const enrollmentRequest =
                    isEnrollmentRequest(selectedRequest);
                  const requirementItems =
                    getReviewRequirementItems(selectedRequest);
                  const admissionAttachmentsByName = enrollmentRequest
                    ? null
                    : new Map(
                        (selectedRequest.attachments ?? []).map(
                          (attachment) => [
                            normalizeAttachmentName(attachment.name),
                            attachment,
                          ],
                        ),
                      );
                  const requirementReviewItems = requirementItems.map(
                    (item, index) => {
                      const attachment = enrollmentRequest
                        ? selectedRequest.attachments?.[index]
                        : admissionAttachmentsByName?.get(
                            normalizeAttachmentName(item.name),
                          );
                      const reviewStatus =
                        attachment?.reviewStatus ?? "Pending";
                      const isMockSubmitted =
                        !enrollmentRequest &&
                        !!attachment &&
                        selectedRequest.documentsSubmitted > 0 &&
                        (selectedRequest.attachments?.length ?? 0) ===
                          selectedRequest.documentsSubmitted;
                      const isSubmitted =
                        !!attachment &&
                        (enrollmentRequest ||
                          attachment.url !== "#" ||
                          isMockSubmitted);

                      return {
                        item,
                        index,
                        attachment,
                        reviewStatus,
                        isSubmitted,
                      };
                    },
                  );
                  const pendingCount = requirementReviewItems.filter(
                    (reviewItem) =>
                      reviewItem.isSubmitted &&
                      reviewItem.reviewStatus === "Pending",
                  ).length;
                  const approvedCount = requirementReviewItems.filter(
                    (reviewItem) =>
                      reviewItem.isSubmitted &&
                      reviewItem.reviewStatus === "Approved",
                  ).length;
                  const redoCount = requirementReviewItems.filter(
                    (reviewItem) =>
                      reviewItem.isSubmitted &&
                      reviewItem.reviewStatus === "Rejected",
                  ).length;
                  return (
                    <>
                      {!enrollmentRequest &&
                        selectedRequest.documentsSubmitted === 0 && (
                          <div className="admission-review-note">
                            No requirements have been uploaded yet for this
                            applicant. You can still approve or reject the
                            admission below.
                          </div>
                        )}
                      <div className="requirement-stats-row">
                        <div className="requirement-stat pending">
                          <span>Pending review</span>
                          <strong>{pendingCount}</strong>
                        </div>
                        <div className="requirement-stat approved">
                          <span>Approved</span>
                          <strong>{approvedCount}</strong>
                        </div>
                        <div className="requirement-stat redo">
                          <span>Need Redo</span>
                          <strong>{redoCount}</strong>
                        </div>
                      </div>
                      <ul className="document-requirements-list">
                        {requirementReviewItems.map(
                          ({
                            item,
                            index,
                            attachment,
                            reviewStatus,
                            isSubmitted,
                          }) => {
                            return (
                              <li
                                key={item.key || item.name}
                                className={`document-requirement-card ${reviewStatus.toLowerCase()}`}
                              >
                                <div className="document-requirement-top">
                                  <div className="requirement-title">
                                    <p>{item.name}</p>
                                  </div>
                                  <div className="requirement-status-badge">
                                    {getStatusIcon(reviewStatus)}
                                    <span
                                      className={`status-text ${reviewStatus.toLowerCase()}`}
                                    >
                                      {reviewStatus}
                                    </span>
                                  </div>
                                </div>
                                <div className="document-requirement-actions">
                                  {isSubmitted &&
                                  attachment &&
                                  attachment.url !== "#" ? (
                                    <a
                                      className="view-document-btn"
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <FaEye /> View document
                                    </a>
                                  ) : isSubmitted ? (
                                    <span className="document-missing-label">
                                      <FaFileAlt /> Reference only
                                    </span>
                                  ) : (
                                    <span className="document-missing-label">
                                      <FaFileAlt /> No file submitted yet
                                    </span>
                                  )}
                                  <div className="requirement-action-buttons">
                                    <button
                                      className="requirement-action pass"
                                      onClick={() =>
                                        handleAttachmentStatusUpdate(
                                          selectedRequest.id,
                                          index,
                                          "Approved",
                                        )
                                      }
                                      disabled={
                                        !isSubmitted ||
                                        reviewStatus === "Approved"
                                      }
                                    >
                                      <FaThumbsUp /> Pass
                                    </button>
                                    <button
                                      className="requirement-action redo"
                                      onClick={() =>
                                        handleAttachmentStatusUpdate(
                                          selectedRequest.id,
                                          index,
                                          "Rejected",
                                        )
                                      }
                                      disabled={
                                        !isSubmitted ||
                                        reviewStatus === "Rejected"
                                      }
                                    >
                                      <FaRedoAlt /> Need Redo
                                    </button>
                                  </div>
                                </div>
                              </li>
                            );
                          },
                        )}
                      </ul>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="review-modal-footer">
              {((isEnrollmentRequest(selectedRequest) &&
                selectedRequest.enrollmentStatus === "Pending") ||
                (!isEnrollmentRequest(selectedRequest) &&
                  selectedRequest.status === "Pending")) && (
                <>
                  <button
                    className="action-btn approve"
                    onClick={() => {
                      if (handleApproveRequest(selectedRequest)) {
                        closeReviewModal();
                      }
                    }}
                    disabled={!!selectedRequestHasEnrollmentRedoRequirement}
                    title={
                      selectedRequestHasEnrollmentRedoRequirement
                        ? "Student must resend the requirement marked for redo before approval."
                        : undefined
                    }
                  >
                    {isEnrollmentRequest(selectedRequest)
                      ? "Approve Request"
                      : "Approve Admission"}
                  </button>
                  <button
                    className="action-btn reject"
                    onClick={() => {
                      closeReviewModal();
                      handleRejectRequest(selectedRequest.id);
                    }}
                  >
                    {isEnrollmentRequest(selectedRequest)
                      ? "Reject Request"
                      : "Reject Admission"}
                  </button>
                </>
              )}
              <button className="action-btn cancel" onClick={closeReviewModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isConfirmModalOpen && selectedAction && (
        <div className="review-modal-overlay" role="dialog">
          <div className="review-modal confirmation-modal">
            <div className="review-modal-header">
              <h2>
                Confirm{" "}
                {selectedAction.action === "approve" ? "Approval" : "Rejection"}
              </h2>
              <button
                className="review-modal-close"
                onClick={closeConfirmModal}
              >
                ✕
              </button>
            </div>
            <div className="review-modal-body">
              <p>
                Are you sure you want to {selectedAction.action} this{" "}
                {selectedAdmissionActionRecord &&
                !selectedEnrollmentActionRecord
                  ? "admission application"
                  : "enrollment request"}
                ?
              </p>
              {selectedAction.action === "approve" && (
                <p className="confirmation-note">
                  {selectedAdmissionActionRecord &&
                  !selectedEnrollmentActionRecord
                    ? isTransfereeAdmission(selectedAdmissionActionRecord)
                      ? selectedAdmissionActionEvaluation &&
                        selectedAdmissionActionEvaluation.assignedSubjectIds
                          .length > 0
                        ? `This will activate the transferee record. ${selectedAdmissionActionEvaluation.assignedSubjectIds.length} planned subject${selectedAdmissionActionEvaluation.assignedSubjectIds.length === 1 ? "" : "s"} will follow the validated TOR load, and the suggested section will still be applied if one was selected.`
                        : "This will activate the transferee record. If a suggested section was selected during validation, the system will also try to assign that section after approval."
                      : selectedAdmissionActionRecord.documentsSubmitted <
                          selectedAdmissionActionRecord.totalDocuments
                        ? "Approval is allowed even with pending admission credentials. The student account will be activated and the remaining credential status will still appear in the student portal."
                        : selectedAdmissionActionRecord.requestedOwnSchedule &&
                            selectedAdmissionActionRecord.ownScheduleRequestStatus ===
                              "Approved"
                          ? "This will activate the student account as an irregular schedule admission. The student will choose available schedules in the portal first, and those choices will still need admin or registrar approval before they become official subjects."
                          : "This will activate the student account and make the approved admission visible in the student portal."
                    : "This will progress the student to the next academic level and generate new enrollment records."}
                </p>
              )}
              {selectedAction.action === "reject" && (
                <>
                  <div className="confirmation-field">
                    <label htmlFor="rejection-reason-message">
                      Rejection reason
                    </label>
                    <textarea
                      id="rejection-reason-message"
                      value={selectedRejectionReason}
                      onChange={(event) =>
                        setSelectedRejectionReason(event.target.value)
                      }
                      placeholder="Type the reason that will be sent to the student..."
                      rows={5}
                    />
                    <p className="confirmation-help">
                      This typed reason will be included in the email notice.
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="review-modal-footer">
              <button
                className={`action-btn ${selectedAction.action === "approve" ? "approve" : "reject"}`}
                onClick={confirmAction}
              >
                {selectedAction.action === "approve" ? "Approve" : "Reject"}
              </button>
              <button
                className="action-btn cancel"
                onClick={closeConfirmModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showSectionManager && (
        <div className="section-manager-overlay">
          <div className="section-manager-modal">
            <div className="modal-header">
              <h2>Class Section Manager</h2>
              <button
                className="modal-close"
                onClick={() => {
                  resetSectionForm();
                  setSectionManagerScope("all");
                  setShowSectionManager(false);
                }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="section-manager-toolbar">
                <div className="section-manager-toolbar-copy">
                  <strong>Section tools</strong>
                  <p>Move current students here while managing class sections.</p>
                </div>
                <div className="section-manager-toolbar-actions">
                  <button
                    type="button"
                    className="action-btn move-students"
                    onClick={openMoveStudentsModal}
                  >
                    <FaExchangeAlt /> Move Students
                  </button>
                </div>
              </div>
              {sectionManagerPendingAssignments.length > 0 && (
                <div className="pending-alert">
                  <FaExclamationTriangle />
                  <div className="pending-alert-copy">
                    <strong>
                      {sectionManagerPendingAssignments.length}{" "}
                      {sectionManagerScope === "transferees"
                        ? "transferee(s)"
                        : "student(s)"}{" "}
                      need section assignment
                    </strong>
                    <p>
                      {sectionManagerScope === "transferees"
                        ? "These transferee students are active in the student list but not yet assigned to a class section."
                        : "These students are active in the student list but not yet assigned to a class section."}
                    </p>
                  </div>
                  <div className="pending-alert-actions">
                    <button
                      className="action-btn auto-assign"
                      onClick={
                        sectionManagerScope === "transferees"
                          ? handleAutoAssignTransferees
                          : handleAutoAssignAll
                      }
                    >
                      {sectionManagerScope === "transferees"
                        ? "Assign Transferees"
                        : "Assign Now"}
                    </button>
                  </div>
                </div>
              )}
              {/* Add Section Form */}
              <div className="add-section-form">
                <h3>{editingSection ? "Edit Section" : "Add New Section"}</h3>
                {editingSection && (
                  <p className="section-form-note">
                    Program and strand/course stay locked while editing. You
                    can update the year level, semester, section name, and
                    capacity.
                  </p>
                )}
                <div className="add-section-form-row">
                  <select
                    value={newSection.program}
                    disabled={Boolean(editingSection)}
                    onChange={(e) => {
                      const program = e.target.value;
                      setNewSection({
                        ...newSection,
                        program,
                        yearLevel: program === "SHS" ? "Grade 11" : "1st Year",
                        strand:
                          program === "SHS" ? "ICT" : DEFAULT_COLLEGE_COURSE,
                      });
                    }}
                  >
                    <option value="College">College</option>
                    <option value="SHS">SHS</option>
                  </select>
                  <select
                    value={newSection.yearLevel}
                    onChange={(e) =>
                      setNewSection({
                        ...newSection,
                        yearLevel: e.target.value,
                      })
                    }
                  >
                    {newSection.program === "SHS" ? (
                      <>
                        <option value="Grade 11">Grade 11</option>
                        <option value="Grade 12">Grade 12</option>
                      </>
                    ) : (
                      <>
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                        <option value="4th Year">4th Year</option>
                      </>
                    )}
                  </select>
                  <select
                    value={newSection.semester}
                    onChange={(e) =>
                      setNewSection({
                        ...newSection,
                        semester: normalizeSectionSemester(e.target.value),
                      })
                    }
                  >
                    <option value="1st Semester">1st Semester</option>
                    <option value="2nd Semester">2nd Semester</option>
                  </select>
                  {editingSection ? (
                    <input
                      type="text"
                      value={newSection.strand}
                      disabled
                      aria-label="Section strand or course"
                    />
                  ) : newSection.program === "SHS" ? (
                    <select
                      value={newSection.strand}
                      onChange={(e) =>
                        setNewSection({ ...newSection, strand: e.target.value })
                      }
                    >
                      <option value="ICT">ICT</option>
                      <option value="GAS">GAS</option>
                      <option value="HUMSS">HUMSS</option>
                      <option value="ABM">ABM</option>
                      <option value="STEM">STEM</option>
                    </select>
                  ) : null}
                  {!editingSection && newSection.program === "College" && (
                    <select
                      value={newSection.strand}
                      onChange={(e) =>
                        setNewSection({ ...newSection, strand: e.target.value })
                      }
                    >
                      <option value={DEFAULT_COLLEGE_COURSE}>
                        BS Entrepreneurship
                      </option>
                    </select>
                  )}
                  <input
                    type="text"
                    placeholder="Section (e.g., A)"
                    value={newSection.section}
                    onChange={(e) =>
                      setNewSection({
                        ...newSection,
                        section: normalizeSectionLabel(e.target.value),
                      })
                    }
                  />
                  <input
                    type="number"
                    placeholder="Max Capacity"
                    value={newSection.maxCapacity}
                    onChange={(e) =>
                      setNewSection({
                        ...newSection,
                        maxCapacity:
                          Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                  />
                  <div className="add-section-actions">
                    <button className="action-btn add" onClick={handleSaveSection}>
                      {editingSection ? "Save Changes" : "Add Section"}
                    </button>
                    {editingSection && (
                      <button
                        className="action-btn cancel"
                        type="button"
                        onClick={resetSectionForm}
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="sections-grid">
                {classSections.map((section) => (
                  <div
                    key={section.id}
                    className={`section-card ${section.currentEnrollees >= section.maxCapacity ? "full" : ""} ${isSectionLocked(section) ? "locked" : ""}`}
                  >
                    <div className="section-header">
                      <h3>{section.code}</h3>
                      <div className="section-status-group">
                        {isSectionLocked(section) && (
                          <span className="section-status locked">Locked</span>
                        )}
                        <span
                          className={`section-status ${section.currentEnrollees >= section.maxCapacity ? "full" : "available"}`}
                        >
                          {section.currentEnrollees >= section.maxCapacity
                            ? "Full"
                            : "Available"}
                        </span>
                      </div>
                    </div>
                    <div className="section-details">
                      <p>
                        <strong>Program:</strong> {section.program}
                      </p>
                      <p>
                        <strong>Year:</strong> {section.yearLevel}
                      </p>
                      <p>
                        <strong>Semester:</strong> {section.semester}
                      </p>
                      <p>
                        <strong>
                          {section.program === "College" ? "Course" : "Strand"}:
                        </strong>{" "}
                        {section.program === "College"
                          ? DEFAULT_COLLEGE_COURSE
                          : section.strand || "All"}
                      </p>
                      <p>
                        <strong>Section:</strong> {section.section}
                      </p>
                    </div>
                    <div className="capacity-container">
                      <div className="capacity-bar">
                        <div
                          className="capacity-fill"
                          style={{
                            width: `${(section.currentEnrollees / section.maxCapacity) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="capacity-text">
                        {section.currentEnrollees}/{section.maxCapacity}{" "}
                        students
                      </span>
                    </div>
                    <div className="section-actions">
                      <button
                        className="action-btn view"
                        onClick={() => viewSectionStudents(section)}
                      >
                        <FaEye /> View ({section.currentEnrollees})
                      </button>
                      <button
                        className="action-btn edit"
                        type="button"
                        onClick={() => startEditingSection(section)}
                      >
                        Edit
                      </button>
                      <button
                        className={`action-btn ${isSectionLocked(section) ? "unlock" : "lock"}`}
                        type="button"
                        onClick={() => handleToggleSectionLock(section)}
                      >
                        {isSectionLocked(section) ? "Unlock" : "Lock"}
                      </button>
                      <button
                        className="action-btn delete"
                        type="button"
                        onClick={() => handleDeleteSection(section)}
                      >
                        <FaTrash /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="manual-assignment">
                <h3>Manual Assignment</h3>
                <div className="assignment-controls">
                  <select
                    className="student-select"
                    id="studentSelect"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select Student
                    </option>
                    {sectionManagerPendingAssignments.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.fullName} -{" "}
                        {student.studentNumber || student.trackingNumber}
                      </option>
                    ))}
                  </select>
                  <select
                    className="section-select"
                    id="sectionSelect"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select Section
                    </option>
                    {classSections.map((section) => (
                      <option
                        key={section.id}
                        value={section.id}
                        disabled={isSectionLocked(section)}
                      >
                        {section.code} - {section.semester} (
                        {section.currentEnrollees}/{section.maxCapacity})
                        {isSectionLocked(section) ? " - Locked" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    className="action-btn assign"
                    onClick={() => {
                      const studentSelect = document.getElementById(
                        "studentSelect",
                      ) as HTMLSelectElement;
                      const sectionSelect = document.getElementById(
                        "sectionSelect",
                      ) as HTMLSelectElement;
                      if (studentSelect.value && sectionSelect.value) {
                        handleAssignToSection(
                          studentSelect.value,
                          sectionSelect.value,
                        );
                        studentSelect.value = "";
                        sectionSelect.value = "";
                      }
                    }}
                  >
                    <FaUserPlus /> Assign
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="action-btn cancel"
                onClick={() => {
                  resetSectionForm();
                  setSectionManagerScope("all");
                  setShowSectionManager(false);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showSectionStudents && selectedSection && (
        <div className="section-students-overlay">
          <div className="section-students-modal">
            <div className="modal-header">
              <h2>{selectedSection.code} - Students</h2>
              <button
                className="modal-close"
                onClick={() => setShowSectionStudents(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {selectedSectionStudentRows.length > 0 ? (
                <table className="students-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Student Number</th>
                      <th>Program</th>
                      <th>Year Level</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSectionStudentRows.map((student) => (
                      <tr key={student.key}>
                        <td>{student.name}</td>
                        <td>{student.studentNumber}</td>
                        <td>{student.program}</td>
                        <td>{student.yearLevel}</td>
                        <td>
                          <button
                            type="button"
                            className="action-btn remove-student"
                            onClick={() =>
                              handleRemoveStudentFromSection({
                                studentNumber: student.studentNumber,
                                name: student.name,
                              })
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No students assigned to this section yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showDepartmentManagerModal && (
        <div className="review-modal-overlay" role="dialog" aria-modal="true">
          <div className="review-modal academic-management-modal">
            <div className="review-modal-header">
              <div>
                <h2>Manage Departments</h2>
                <p className="assignment-helper-text">
                  Add departments once, then choose them when creating or editing
                  instructors.
                </p>
              </div>
              <button
                className="review-modal-close"
                onClick={() => setShowDepartmentManagerModal(false)}
              >
                x
              </button>
            </div>
            <div className="review-modal-body">
              <div className="academic-management-create-row">
                <input
                  type="text"
                  placeholder="Department name"
                  value={newDepartmentName}
                  onChange={(event) => setNewDepartmentName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleCreateDepartmentOption();
                    }
                  }}
                />
                <button
                  type="button"
                  className="assignment-selection-btn"
                  onClick={handleCreateDepartmentOption}
                >
                  <FaPlus /> Add Department
                </button>
              </div>
              <div className="academic-management-list-toolbar">
                <span>{selectedDepartmentNames.length} selected</span>
                <button
                  type="button"
                  className="assignment-selection-btn secondary"
                  onClick={() =>
                    setSelectedDepartmentNames(
                      selectedDepartmentNames.length ===
                        instructorDepartmentOptions.length
                        ? []
                        : instructorDepartmentOptions,
                    )
                  }
                  disabled={instructorDepartmentOptions.length === 0}
                >
                  {selectedDepartmentNames.length ===
                    instructorDepartmentOptions.length &&
                  instructorDepartmentOptions.length > 0
                    ? "Clear Selection"
                    : "Select All"}
                </button>
                <button
                  type="button"
                  className="action-btn delete"
                  onClick={handleDeleteSelectedDepartments}
                  disabled={selectedDepartmentNames.length === 0}
                >
                  <FaTrash /> Delete Selected
                </button>
              </div>
              <div className="academic-management-option-list">
                {instructorDepartmentOptions.length > 0 ? (
                  instructorDepartmentOptions.map((department) => {
                    const isSelected =
                      selectedDepartmentNames.includes(department);

                    return (
                      <label
                        key={department}
                        className={`academic-management-option-row ${isSelected ? "selected" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleDepartmentSelection(department)}
                        />
                        <span>{department}</span>
                        <button
                          type="button"
                          className="trash-icon-btn"
                          onClick={(event) => {
                            event.preventDefault();
                            handleDeleteDepartmentOption(department);
                          }}
                          aria-label={`Remove ${department}`}
                          title={`Remove ${department}`}
                        >
                          <FaTrash />
                        </button>
                      </label>
                    );
                  })
                ) : (
                  <div className="assignment-subject-empty">
                    No departments added yet.
                  </div>
                )}
              </div>
            </div>
            <div className="review-modal-footer">
              <button
                className="action-btn cancel"
                onClick={() => setShowDepartmentManagerModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showClassroomManagerModal && (
        <div className="review-modal-overlay" role="dialog" aria-modal="true">
          <div className="review-modal academic-management-modal">
            <div className="review-modal-header">
              <div>
                <h2>Classroom Management</h2>
                <p className="assignment-helper-text">
                  Add classrooms here so assignment schedules can use them from
                  the room dropdown.
                </p>
              </div>
              <button
                className="review-modal-close"
                onClick={() => setShowClassroomManagerModal(false)}
              >
                x
              </button>
            </div>
            <div className="review-modal-body">
              <div className="academic-management-create-row">
                <input
                  type="text"
                  placeholder="Classroom name"
                  value={newRoomName}
                  onChange={(event) => setNewRoomName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleCreateRoomOption();
                    }
                  }}
                />
                <button
                  type="button"
                  className="assignment-selection-btn"
                  onClick={() => {
                    void handleCreateRoomOption();
                  }}
                >
                  <FaPlus /> Add Classroom
                </button>
              </div>
              <div className="academic-management-list-toolbar">
                <span>{selectedClassroomNames.length} selected</span>
                <button
                  type="button"
                  className="assignment-selection-btn secondary"
                  onClick={() =>
                    setSelectedClassroomNames(
                      selectedClassroomNames.length ===
                        assignmentRoomOptions.length
                        ? []
                        : assignmentRoomOptions,
                    )
                  }
                  disabled={assignmentRoomOptions.length === 0}
                >
                  {selectedClassroomNames.length === assignmentRoomOptions.length &&
                  assignmentRoomOptions.length > 0
                    ? "Clear Selection"
                    : "Select All"}
                </button>
                <button
                  type="button"
                  className="action-btn delete"
                  onClick={() => {
                    void handleDeleteSelectedClassrooms();
                  }}
                  disabled={selectedClassroomNames.length === 0}
                >
                  <FaTrash /> Delete Selected
                </button>
              </div>
              <div className="academic-management-option-list">
                {assignmentRoomOptions.length > 0 ? (
                  assignmentRoomOptions.map((room) => {
                    const isSelected = selectedClassroomNames.includes(room);

                    return (
                      <label
                        key={room}
                        className={`academic-management-option-row ${isSelected ? "selected" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleClassroomSelection(room)}
                        />
                        <span>{room}</span>
                        <button
                          type="button"
                          className="trash-icon-btn"
                          onClick={(event) => {
                            event.preventDefault();
                            void handleDeleteRoomOption(room);
                          }}
                          aria-label={`Remove ${room}`}
                          title={`Remove ${room}`}
                        >
                          <FaTrash />
                        </button>
                      </label>
                    );
                  })
                ) : (
                  <div className="assignment-subject-empty">
                    No classrooms added yet.
                  </div>
                )}
              </div>
            </div>
            <div className="review-modal-footer">
              <button
                className="action-btn cancel"
                onClick={() => setShowClassroomManagerModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingAcademicOptionDelete && (
        <div className="review-modal-overlay" role="dialog" aria-modal="true">
          <div className="review-modal academic-delete-confirm-modal">
            <div className="review-modal-header">
              <h2>
                Delete{" "}
                {pendingAcademicOptionDelete.kind === "department"
                  ? "Department"
                  : "Classroom"}
              </h2>
              <button
                className="review-modal-close"
                onClick={() => setPendingAcademicOptionDelete(null)}
              >
                x
              </button>
            </div>
            <div className="review-modal-body">
              <div className="assignment-delete-summary">
                <strong>Confirm deletion</strong>
                {pendingAcademicOptionDelete.kind !== "department" ? (
                  <p>{pendingAcademicOptionDelete.message}</p>
                ) : null}
              </div>
              <div className="academic-delete-list">
                {pendingAcademicOptionDelete.names.map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </div>
            <div className="review-modal-footer">
              <button
                className="action-btn cancel"
                onClick={() => setPendingAcademicOptionDelete(null)}
              >
                Cancel
              </button>
              <button
                className="action-btn delete"
                onClick={() => {
                  void handleConfirmAcademicOptionDelete();
                }}
              >
                <FaTrash /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subject Modal */}
      {showSubjectModal && (
        <div className="review-modal-overlay" role="dialog">
          <div className="review-modal">
            <div className="review-modal-header">
              <h2>{editingSubject ? "Edit Subject" : "Add New Subject"}</h2>
              <button
                className="review-modal-close"
                onClick={closeSubjectModal}
              >
                ✕
              </button>
            </div>
            <div className="review-modal-body">
              <form
                id="subject-config-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSaveSubject();
                }}
              >
                <div className="form-group">
                  <label>Subject Code</label>
                  <input
                    type="text"
                    value={subjectForm.code}
                    onChange={(event) =>
                      updateSubjectForm({ code: event.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Subject Name</label>
                  <input
                    type="text"
                    value={subjectForm.name}
                    onChange={(event) =>
                      updateSubjectForm({ name: event.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Program</label>
                  <select
                    value={subjectForm.program}
                    onChange={(event) =>
                      updateSubjectForm({
                        program: event.target.value as SubjectFormState["program"],
                        yearLevel:
                          event.target.value === "SHS" ? "Grade 11" : "1st Year",
                        strand:
                          event.target.value === "SHS"
                            ? "All"
                            : DEFAULT_COLLEGE_COURSE,
                        prerequisiteSubjectIds: [],
                      })
                    }
                  >
                    <option value="College">College</option>
                    <option value="SHS">SHS</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Year Level</label>
                  <select
                    value={subjectForm.yearLevel}
                    onChange={(event) =>
                      updateSubjectForm({
                        yearLevel: event.target.value,
                        prerequisiteSubjectIds: [],
                      })
                    }
                  >
                    {getProgramYearLevelOptions(subjectForm.program).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Semester</label>
                  <select
                    value={subjectForm.semester}
                    onChange={(event) =>
                      updateSubjectForm({
                        semester: event.target.value,
                        prerequisiteSubjectIds: [],
                      })
                    }
                  >
                    {SEMESTER_SORT_ORDER.map((semesterOption) => (
                      <option key={semesterOption} value={semesterOption}>
                        {semesterOption}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Units</label>
                  <input
                    type="number"
                    min="1"
                    value={subjectForm.units}
                    onChange={(event) =>
                      updateSubjectForm({ units: event.target.value })
                    }
                    disabled={subjectForm.program !== "College"}
                  />
                </div>
                <div className="form-group">
                  <label>{subjectForm.program === "SHS" ? "Strand" : "Course"}</label>
                  <select
                    value={
                      subjectForm.program === "SHS"
                        ? subjectForm.strand
                        : DEFAULT_COLLEGE_COURSE
                    }
                    onChange={(event) =>
                      updateSubjectForm({
                        strand: event.target.value,
                        prerequisiteSubjectIds: [],
                      })
                    }
                    disabled={subjectForm.program !== "SHS"}
                  >
                    {subjectForm.program === "SHS" ? (
                      <>
                        <option value="All">All</option>
                        <option value="ICT">ICT</option>
                        <option value="GAS">GAS</option>
                        <option value="HUMSS">HUMSS</option>
                        <option value="ABM">ABM</option>
                        <option value="STEM">STEM</option>
                      </>
                    ) : (
                      <option value={DEFAULT_COLLEGE_COURSE}>
                        {DEFAULT_COLLEGE_COURSE}
                      </option>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select
                    value={subjectForm.type}
                    onChange={(event) =>
                      updateSubjectForm({
                        type: event.target.value as SubjectFormState["type"],
                      })
                    }
                  >
                    {subjectForm.program === "SHS" ? (
                      <>
                        <option value="core">Core</option>
                        <option value="applied">Applied</option>
                        <option value="specialized">Specialized</option>
                      </>
                    ) : (
                      <>
                        <option value="major">Major</option>
                        <option value="minor">Minor</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <div className="assignment-subject-picker-header">
                    <div>
                      <label>Prerequisite Subjects</label>
                      <p className="assignment-helper-text">
                        Pick earlier subjects that should be completed before
                        students can take this one.
                      </p>
                    </div>
                  </div>
                  <div className="assignment-subject-selector">
                    {subjectPrerequisiteOptions.length > 0 ? (
                      subjectPrerequisiteOptions.map((subject) => {
                        const isSelected =
                          subjectForm.prerequisiteSubjectIds.includes(subject.id);

                        return (
                          <label
                            key={subject.id}
                            className={`assignment-subject-option ${isSelected ? "selected" : ""}`}
                          >
                            <span className="assignment-subject-control">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() =>
                                  toggleSubjectPrerequisite(subject.id)
                                }
                              />
                            </span>
                            <div className="assignment-subject-details">
                              <strong>
                                {subject.code} - {subject.name}
                              </strong>
                              <span>
                                {subject.yearLevel} | {subject.semester}
                              </span>
                            </div>
                          </label>
                        );
                      })
                    ) : (
                      <div className="assignment-subject-empty">
                        No earlier matching subjects are available for this
                        catalog entry yet.
                      </div>
                    )}
                  </div>
                </div>
              </form>
            </div>
            <div className="review-modal-footer">
              <button
                className="action-btn cancel"
                onClick={closeSubjectModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="subject-config-form"
                className="action-btn approve"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructor Modal */}
      {showInstructorModal && (
        <div className="review-modal-overlay" role="dialog">
          <div className="review-modal">
            <div className="review-modal-header">
              <h2>
                {editingInstructor ? "Edit Instructor" : "Add New Instructor"}
              </h2>
              <button
                className="review-modal-close"
                onClick={closeInstructorModal}
              >
                ✕
              </button>
            </div>
            <div className="review-modal-body">
              <div className="form-group">
                <label>Instructor Portal Account</label>
                <p className="modal-helper-text">
                  {editingInstructor
                    ? "Use Reset Temporary Password to generate a new one-time password."
                    : "A secure temporary password will be generated after saving."}
                </p>
              </div>
              <form
                id="instructor-config-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSaveInstructor();
                }}
              >
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    value={instructorForm.name}
                    onChange={(event) =>
                      setInstructorForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Employee ID</label>
                  <input
                    type="text"
                    value={instructorForm.employeeId}
                    onChange={(event) =>
                      setInstructorForm((prev) => ({
                        ...prev,
                        employeeId: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <select
                    value={instructorForm.department}
                    onChange={(event) =>
                      setInstructorForm((prev) => ({
                        ...prev,
                        department: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select department</option>
                    {instructorDepartmentOptions.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={instructorForm.email}
                    onChange={(event) =>
                      setInstructorForm((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Contact Number</label>
                  <input
                    type="text"
                    value={instructorForm.contactNumber}
                    onChange={(event) =>
                      setInstructorForm((prev) => ({
                        ...prev,
                        contactNumber: event.target.value,
                      }))
                    }
                  />
                </div>
              </form>
            </div>
            <div className="review-modal-footer">
              <button
                className="action-btn cancel"
                onClick={closeInstructorModal}
              >
                Cancel
              </button>
              {editingInstructor && (
                <button
                  type="button"
                  className="action-btn warning"
                  onClick={() => {
                    void handleResetInstructorPassword();
                  }}
                >
                  Reset Temporary Password
                </button>
              )}
              <button
                type="submit"
                form="instructor-config-form"
                className="action-btn approve"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {showAssignmentModal && (
        <div
          className="review-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assignment-modal-title"
        >
          <div className="review-modal assignment-config-modal">
            <div className="review-modal-header">
              <div className="assignment-modal-heading">
                <h2 id="assignment-modal-title">
                  {editingAssignment ? "Edit Assignment" : "Create Assignment"}
                </h2>
                <p>
                  Choose the section, select the subjects to include, and set
                  the instructor and schedule details for the class assignment.
                </p>
              </div>
              <button
                type="button"
                className="review-modal-close"
                onClick={closeAssignmentModal}
              >
                x
              </button>
            </div>
            <div className="review-modal-body">
              <form
                id="assignment-config-form"
                className="assignment-config-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSaveAssignment();
                }}
              >
                <div className="assignment-modal-summary">
                  <div className="assignment-summary-card">
                    <span>Section</span>
                    <strong>
                      {selectedAssignmentSection
                        ? selectedAssignmentSection.code
                        : "Choose a section"}
                    </strong>
                  </div>
                  <div className="assignment-summary-card">
                    <span>Available</span>
                    <strong>
                      {availableAssignmentSubjects.length} subject
                      {availableAssignmentSubjects.length === 1 ? "" : "s"}
                    </strong>
                  </div>
                  <div
                    className={`assignment-summary-card ${assignmentForm.subjectIds.length === 0 ? "danger" : ""}`}
                  >
                    <span>Selected</span>
                    <strong>
                      {assignmentForm.subjectIds.length} subject
                      {assignmentForm.subjectIds.length === 1 ? "" : "s"}
                    </strong>
                  </div>
                  <div className="assignment-summary-card">
                    <span>Semester</span>
                    <strong>{assignmentForm.semester}</strong>
                  </div>
                </div>

                <div className="assignment-form-grid">
                  <div className="form-group">
                    <label>Section</label>
                    <select
                      value={assignmentForm.sectionId}
                      onChange={(e) =>
                        updateAssignmentFormContext("sectionId", e.target.value)
                      }
                    >
                      <option value="">Select section</option>
                      {classSections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.code} - {section.program} {section.yearLevel} |{" "}
                          {section.semester}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Semester</label>
                    <select
                      value={assignmentForm.semester}
                      onChange={(e) =>
                        updateAssignmentFormContext("semester", e.target.value)
                      }
                    >
                      <option value="1st Semester">1st Semester</option>
                      <option value="2nd Semester">2nd Semester</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Instructor</label>
                    <select
                      value={assignmentForm.instructorId}
                      onChange={(e) =>
                        setAssignmentForm((prev) => ({
                          ...prev,
                          instructorId: e.target.value,
                        }))
                      }
                    >
                      <option value="">To be assigned later</option>
                      {instructors.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Academic Year</label>
                    <input
                      type="text"
                      value={assignmentForm.academicYear}
                      onChange={(e) =>
                        setAssignmentForm((prev) => ({
                          ...prev,
                          academicYear: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="form-group">
                  <div className="assignment-subject-picker-header">
                    <div>
                      <label>Subjects</label>
                      <p className="assignment-helper-text">
                        {selectedAssignmentSection
                          ? `${selectedAssignmentSection.code} has ${availableAssignmentSubjects.length} available subject${availableAssignmentSubjects.length === 1 ? "" : "s"} for ${assignmentForm.semester}.`
                          : "Choose a section first to load the matching strand/course subjects."}
                      </p>
                    </div>
                    {availableAssignmentSubjects.length > 0 && (
                      <div className="assignment-selection-actions">
                        <button
                          type="button"
                          className="assignment-selection-btn secondary"
                          onClick={clearAssignmentSubjects}
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="assignment-subject-selector">
                    {availableAssignmentSubjects.length > 0 ? (
                      availableAssignmentSubjects.map((subject) => {
                        const isSelected = assignmentForm.subjectIds.includes(
                          subject.id,
                        );

                        return (
                          <label
                            key={subject.id}
                            className={`assignment-subject-option ${isSelected ? "selected" : ""}`}
                          >
                            <span className="assignment-subject-control">
                              <input
                                type="radio"
                                name="assignment-subjects"
                                checked={isSelected}
                                onChange={() =>
                                  toggleAssignmentSubjectSelection(subject.id)
                                }
                              />
                            </span>
                            <div className="assignment-subject-details">
                              <strong>
                                {subject.code} - {subject.name}
                              </strong>
                              <span>
                                {getSubjectTypeLabel(subject)}
                                {subject.units
                                  ? ` | ${subject.units} units`
                                  : ""}
                              </span>
                            </div>
                          </label>
                        );
                      })
                    ) : (
                      <div className="assignment-subject-empty">
                        No unassigned subjects are available for this
                        section/semester yet.
                      </div>
                    )}
                  </div>
                </div>
                <div className="assignment-schedule-panel">
                  <div className="assignment-schedule-heading">
                    <label>Scheduling</label>
                    <span>
                      Add every meeting day for this subject. Each saved slot
                      will appear in the class schedule.
                    </span>
                  </div>
                  {assignmentForm.schedule.length > 0 && (
                    <div className="assignment-schedule-slots">
                      {assignmentForm.schedule.map((slot, index) => (
                        <div
                          className="assignment-schedule-slot"
                          key={`${slot.day}-${slot.startTime}-${slot.endTime}-${index}`}
                        >
                          <div className="schedule-field">
                            <span className="schedule-field-label">Day</span>
                            <select
                              value={slot.day}
                              onChange={(e) =>
                                updateAssignmentScheduleSlot(
                                  index,
                                  "day",
                                  e.target.value,
                                )
                              }
                            >
                              <option value="">Select day</option>
                              {SCHEDULE_DAYS.map((day) => (
                                <option key={day} value={day}>
                                  {day}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="schedule-field">
                            <span className="schedule-field-label">Start time</span>
                            <input
                              type="time"
                              value={slot.startTime}
                              onChange={(e) =>
                                updateAssignmentScheduleSlot(
                                  index,
                                  "startTime",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div className="schedule-field">
                            <span className="schedule-field-label">End time</span>
                            <input
                              type="time"
                              value={slot.endTime}
                              onChange={(e) =>
                                updateAssignmentScheduleSlot(
                                  index,
                                  "endTime",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div className="schedule-field schedule-field-room">
                            <span className="schedule-field-label">Room</span>
                            <select
                              value={slot.room}
                              onChange={(e) =>
                                updateAssignmentScheduleSlot(
                                  index,
                                  "room",
                                  e.target.value,
                                )
                              }
                            >
                              <option value="">TBA</option>
                              {assignmentRoomOptions.map((room) => (
                                <option key={room} value={room}>
                                  {room}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            type="button"
                            className="assignment-schedule-remove-btn"
                            onClick={() => removeAssignmentScheduleSlot(index)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {showScheduleDraftFields && (
                    <div className="schedule-inputs">
                      <div className="schedule-field">
                        <span className="schedule-field-label">Day</span>
                        <select
                          value={assignmentForm.scheduleDay}
                          onChange={(e) =>
                            setAssignmentForm((prev) => ({
                              ...prev,
                              scheduleDay: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select day</option>
                          {SCHEDULE_DAYS.map((day) => (
                            <option key={day} value={day}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="schedule-field">
                        <span className="schedule-field-label">Start time</span>
                        <input
                          type="time"
                          value={assignmentForm.startTime}
                          onChange={(e) =>
                            setAssignmentForm((prev) => ({
                              ...prev,
                              startTime: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="schedule-field">
                        <span className="schedule-field-label">End time</span>
                        <input
                          type="time"
                          value={assignmentForm.endTime}
                          onChange={(e) =>
                            setAssignmentForm((prev) => ({
                              ...prev,
                              endTime: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="schedule-field schedule-field-room">
                        <span className="schedule-field-label">Room</span>
                        <select
                          value={assignmentForm.room}
                          onChange={(e) =>
                            setAssignmentForm((prev) => ({
                              ...prev,
                              room: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select room</option>
                          {assignmentRoomOptions.map((room) => (
                            <option key={room} value={room}>
                              {room}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  <div className="assignment-schedule-actions">
                    <button
                      type="button"
                      className="assignment-selection-btn"
                      onClick={addAssignmentScheduleSlot}
                    >
                      <FaPlus />{" "}
                      {showScheduleDraftFields
                        ? "Save Schedule Day"
                        : "Add Schedule Day"}
                    </button>
                    {showScheduleDraftFields && (
                      <button
                        type="button"
                        className="assignment-selection-btn secondary"
                        onClick={clearAssignmentScheduleDraft}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
            <div className="review-modal-footer">
              <button
                type="button"
                className="action-btn cancel"
                onClick={closeAssignmentModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="assignment-config-form"
                className="action-btn approve"
              >
                {editingAssignment ? "Save Changes" : "Save Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignmentDeleteModal && (
        <div
          className="review-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assignment-delete-title"
        >
          <div className="review-modal confirmation-modal assignment-delete-modal">
            <div className="review-modal-header">
              <h2 id="assignment-delete-title">Delete Assignments</h2>
              <button
                type="button"
                className="review-modal-close"
                onClick={closeAssignmentDeleteModal}
              >
                x
              </button>
            </div>
            <div className="review-modal-body">
              <div className="assignment-delete-summary">
                <strong>
                  {pendingAssignmentDeleteTargets.length} assignment
                  {pendingAssignmentDeleteTargets.length === 1 ? "" : "s"} ready
                  for deletion
                </strong>
                <p>Remove the selected class assignments from this list.</p>
              </div>

              <div className="assignment-delete-list">
                {pendingAssignmentDeleteTargets.map((assignment) => (
                  <div key={assignment.id} className="assignment-delete-item">
                    <strong>
                      {assignment.subjectCode} - {assignment.subjectName}
                    </strong>
                    <span>
                      {assignment.sectionCode} | {assignment.semester} |{" "}
                      {assignment.instructorName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="review-modal-footer">
              <button
                type="button"
                className="action-btn cancel"
                onClick={closeAssignmentDeleteModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="action-btn delete trash-icon-btn"
                onClick={handleConfirmAssignmentDelete}
                aria-label={`Delete ${pendingAssignmentDeleteTargets.length} selected assignments`}
                title={`Delete ${pendingAssignmentDeleteTargets.length} selected assignments`}
              >
                <FaTrash />
              </button>
            </div>
          </div>
        </div>
      )}

      {showMoveStudentsModal && (
        <div
          className="review-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-students-title"
        >
          <div className="review-modal student-move-modal">
            <div className="review-modal-header">
              <h2 id="move-students-title">Move Students</h2>
              <button
                type="button"
                className="review-modal-close"
                onClick={closeMoveStudentsModal}
                aria-label="Close move students"
              >
                &times;
              </button>
            </div>
            <div className="review-modal-body student-move-body">
              <div className="student-move-toolbar">
                <label className="student-move-field">
                  <span>Search student</span>
                  <input
                    type="text"
                    value={moveStudentSearchTerm}
                    onChange={(event) => setMoveStudentSearchTerm(event.target.value)}
                    placeholder="Search by name, ID, section, or program"
                  />
                </label>
                <label className="student-move-field">
                  <span>Select student</span>
                  <select
                    value={
                      filteredStudentsForMove.length > 0 ? selectedMoveStudentId : ""
                    }
                    onChange={(event) => {
                      setSelectedMoveStudentId(event.target.value);
                      setMoveStudentFeedback(null);
                    }}
                  >
                    {filteredStudentsForMove.length > 0 ? (
                      filteredStudentsForMove.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name} | {student.id} |{" "}
                          {student.section || "Not assigned"}
                        </option>
                      ))
                    ) : (
                      <option value="">No matching student found</option>
                    )}
                  </select>
                </label>
              </div>

              {selectedMoveStudent ? (
                <div className="student-move-panel">
                  <div className="student-move-current">
                    <div className="student-move-copy">
                      <strong>
                        {selectedMoveStudent.name} | {selectedMoveStudent.id}
                      </strong>
                      <span>
                        Current section:{" "}
                        <strong>
                          {selectedMoveStudent.section || "Not assigned"}
                        </strong>
                      </span>
                      <span>
                        {selectedMoveStudent.program} |{" "}
                        {selectedMoveStudent.yearLevel}
                        {` | ${getCourseStrandDisplay(selectedMoveStudent)}`}
                      </span>
                    </div>
                    {selectedMoveStudentCurrentSectionChoice ? (
                      <span
                        className={`student-move-capacity-badge ${
                          selectedMoveStudentCurrentSectionChoice.isFull
                            ? "full"
                            : "available"
                        }`}
                      >
                        {getSectionCapacityLabel(
                          selectedMoveStudentCurrentSectionChoice,
                        )}
                      </span>
                    ) : null}
                  </div>

                  {selectedMoveStudentSectionChoices.length > 0 ? (
                    <>
                      <div className="student-move-controls">
                        <select
                          value={pendingMoveSectionCode}
                          onChange={(event) => {
                            setPendingMoveSectionCode(event.target.value);
                            if (moveStudentFeedback) {
                              setMoveStudentFeedback(null);
                            }
                          }}
                          disabled={isSavingMoveStudent}
                        >
                          <option value="">Select section</option>
                          {selectedMoveStudentSectionChoices.map((sectionChoice) => (
                            <option
                              key={sectionChoice.id}
                              value={sectionChoice.code}
                              disabled={
                                isSectionChoiceLocked(sectionChoice.code) &&
                                normalizeSectionCodeValue(sectionChoice.code) !==
                                  normalizeSectionCodeValue(
                                    selectedMoveStudent.section,
                                  )
                              }
                            >
                              {buildStudentSectionOptionLabel(sectionChoice)}
                              {isSectionChoiceLocked(sectionChoice.code)
                                ? " - Locked"
                                : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="action-btn move-students"
                          onClick={handleApplyStudentMove}
                          disabled={!canApplyStudentMove || isSavingMoveStudent}
                        >
                          <FaExchangeAlt />{" "}
                          {isSavingMoveStudent ? "Moving..." : "Move Student"}
                        </button>
                      </div>
                      {pendingMoveSectionChoice ? (
                        <p className="student-move-hint">
                          Move to {pendingMoveSectionChoice.code}:{" "}
                          {getSectionDescriptorLabel(pendingMoveSectionChoice)} (
                          {getSectionCapacityLabel(pendingMoveSectionChoice)})
                        </p>
                      ) : (
                        <p className="student-move-hint">
                          Select a matching section to update this student&apos;s
                          placement.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="student-move-empty">
                      No matching section is available yet for this student.
                    </div>
                  )}

                  {moveStudentFeedback ? (
                    <p className={`student-move-feedback ${moveStudentFeedback.type}`}>
                      {moveStudentFeedback.message}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="student-move-empty">
                  Choose a student to start moving sections.
                </div>
              )}
            </div>
            <div className="review-modal-footer">
              <button
                type="button"
                className="action-btn cancel"
                onClick={closeMoveStudentsModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {assignmentAutoAssignSection && (
        <div
          className="review-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assignment-auto-assign-title"
        >
          <div className="review-modal confirmation-modal assignment-auto-assign-modal">
            <div className="review-modal-header">
              <h2 id="assignment-auto-assign-title">Auto-Assign Semester</h2>
              <button
                type="button"
                className="review-modal-close"
                onClick={closeAssignmentAutoAssignModal}
                aria-label="Close semester selection"
              >
                ×
              </button>
            </div>
            <div className="review-modal-body assignment-auto-assign-body">
              <div className="assignment-auto-assign-copy">
                <p>
                  Choose which semester to auto-assign for{" "}
                  <strong>{assignmentAutoAssignSection.code}</strong>.
                </p>
                <p>
                  Existing assignments for the selected semester will be
                  refreshed with the generated schedule.
                </p>
              </div>
              <label className="auto-assign-semester-field assignment-auto-assign-field">
                <span>Semester</span>
                <select
                  value={assignmentAutoAssignSemester}
                  onChange={(event) =>
                    setAssignmentAutoAssignSemester(
                      event.target.value as AutoAssignSemester,
                    )
                  }
                >
                  {AUTO_ASSIGN_SEMESTER_OPTIONS.map((semesterOption) => (
                    <option key={semesterOption} value={semesterOption}>
                      {semesterOption}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="review-modal-footer">
              <button
                type="button"
                className="action-btn cancel"
                onClick={closeAssignmentAutoAssignModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="action-btn auto-assign"
                onClick={confirmAssignmentAutoAssign}
              >
                <FaMagic /> Auto-Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
