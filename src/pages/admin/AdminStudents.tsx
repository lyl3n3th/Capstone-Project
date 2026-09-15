import { useEffect, useMemo, useState } from "react";
import { MdArchive } from "react-icons/md";
import * as XLSX from "xlsx";
import AdminSidebar from "../../components/admin/AdminSidebar";
import SystemAlertModal from "../../components/common/SystemAlertModal";
import { useAuth } from "../../hooks/useAuth";
import {
  BACKUP_RESTORE_APPLIED_EVENT,
  clearBackupRestoreMarker,
  persistAlumniBackupCache,
  readBackupRestoreMarker,
  readCachedAlumni,
  rememberAlumniStudentStatus,
  type AlumniBackupRecord,
} from "../../services/backupApi";
import {
  fetchSupabaseAdmissionApplicants,
  getNextStudentNumber,
  getStudentRequirementSnapshot,
  updateStoredStudentOwnScheduleState,
  getStudentsForBranch,
  dedupeStoredStudents,
  forgetDeletedStoredStudent,
  normalizeBranchName,
  normalizeStudentNumberInput,
  promoteApplicantToStoredStudent,
  readBranchScopedData,
  readStoredStudents,
  removeStudentCredentialUpload,
  syncStudentCredentialUpload,
  writeBranchScopedData,
  updateStudentRequirementReviewStatus,
  writeStoredStudents,
  type AdminAttachment,
  type AdminEnrolleeRecord,
  type StudentScheduledAssignmentItem,
  type StudentScheduleSelectionRequestRecord,
  type StudentSubjectPlanItem,
  type StudentSubjectPlanRecord,
} from "../../services/adminStorage";
import {
  fetchAdminStudents,
  getNextAdminStudentNumber,
  saveAdminStudent,
  updateAdminStudentEmail,
  updateAdminStudentStatus,
} from "../../services/adminStudentsApi";
import {
  fetchStudentScheduleRequests,
  fetchStudentSubjectPlans,
  saveStudentPlanningState,
  saveStudentScheduleRequest,
  saveStudentSubjectPlan,
} from "../../services/studentPlanningApi";
import {
  getAdmissionRequirements,
  getEstimatedCollegeTuition,
  SCHOLARSHIP_EXAM_MAX_SCORE,
  uploadAdmissionRequirementFile,
  updateAdmissionProgress,
} from "../../services/admission";
import {
  applyStudentGradeUploadOperationsForBranch,
  getRequiredShsQuarterLabelsForSemester,
  getStudentAcademicStanding,
  getStudentGradeRecords,
  STUDENT_GRADE_RECORDS_UPDATED_EVENT,
  validateAndNormalizeUploadedGradeRow,
  type StoredStudentGradeRecord,
  type StudentGradeProgramType,
  type StudentGradeUploadOperation,
} from "../../services/studentGrades";
import {
  fetchEnrollmentRequests,
  getLatestApprovedEnrollmentRequestForStudent,
  getLatestApprovedIrregularEnrollmentRequestForStudent,
} from "../../services/enrollmentRequests";
import { resolveStudentPortalContext } from "../../services/studentPortalResolver";
import {
  buildNextReceiptNumber,
  buildStudentBalanceSummary,
  createStudentPayment,
  fetchAndCacheStudentPaymentsForBranch,
  fetchNextStudentPaymentReceiptNumber,
  getStudentPayments,
  removeStudentPayment,
  STUDENT_PAYMENTS_UPDATED_EVENT,
} from "../../services/studentPayments";
import { stripLegacyMockAdmissionRecords } from "../../services/legacyMockData";
import "../../styles/admin/admin-students.css";

interface StudentsProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface Student {
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
  guardianName?: string;
  guardianContact?: string;
  requestedOwnSchedule?: boolean;
  ownScheduleRequestStatus?: "Pending" | "Approved" | "Rejected";
  ownScheduleAcademicYear?: string;
  ownScheduleSemester?: string;
  ownScheduleSelectionStatus?:
    | "Not Submitted"
    | "Pending Approval"
    | "Approved"
    | "Rejected";
}

interface InlineFeedback {
  type: "success" | "warning" | "error";
  message: string;
}

type StudentLifecycleStatus = "Undergraduate" | "Dropped";

const DEFAULT_COLLEGE_COURSE = "BSE - Bachelor of Entrepreneurship";

const getStudentCourseDisplay = (
  student: Pick<Student, "program" | "strandOrCourse">,
) =>
  student.program === "College"
    ? DEFAULT_COLLEGE_COURSE
    : student.strandOrCourse || student.program;

interface ApiAlumniRecord {
  id?: number;
  student_id?: string;
  full_name?: string;
  program?: string;
  year_graduated?: string | null;
  contact?: string | null;
  became_alumni_on?: string | null;
}

interface StudentRequirementNotification {
  student: Student;
  pendingReviewCount: number;
  submittedCount: number;
  pendingRequirementCount: number;
  approvedCount: number;
  rejectedCount: number;
  submittedAttachments: AdminAttachment[];
}

interface StudentScheduleSelectionNotification {
  student: Student;
  request: StudentScheduleSelectionRequestRecord;
  selectedCount: number;
  totalUnits: number;
  conflictCount: number;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const ALUMNI_API_URL = `${API_BASE_URL}/api/alumni/`;
const ENROLLEE_STORAGE_SCOPE = "enrollees";
const RECOVERABLE_BRANCHES = ["Bacoor", "Taytay", "GMA"] as const;
const STUDENT_EXPORT_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const COLLEGE_TUITION_PER_UNIT = 600;

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const formatPeso = (value: number) => pesoFormatter.format(value);

const getTodayInputDate = () => new Date().toISOString().slice(0, 10);

const sanitizeStudentExportSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "students";

const formatStudentExportDateStamp = (value = new Date()) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const buildStudentExportFileName = (branch: string, value = new Date()) =>
  `students_${sanitizeStudentExportSegment(branch)}_${formatStudentExportDateStamp(
    value,
  )}.xlsx`;

const downloadStudentExportFile = (fileName: string, blob: Blob) => {
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = downloadUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(downloadUrl);
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

const getAttachmentReviewRank = (reviewStatus?: AdminAttachment["reviewStatus"]) => {
  if (reviewStatus === "Pending") return 0;
  if (reviewStatus === "Rejected") return 1;
  return 2;
};

const hasViewableAttachmentUrl = (attachment: Pick<AdminAttachment, "url">) =>
  !!attachment.url && attachment.url !== "#";

const hasSubmittedAttachmentNamed = (
  attachments: Pick<AdminAttachment, "name">[] | undefined,
  attachmentName: string,
) =>
  Boolean(
    attachments?.some(
      (attachment) =>
        attachment.name.trim().toLowerCase() ===
        attachmentName.trim().toLowerCase(),
    ),
  );

const hasApprovedAttachmentNamed = (
  attachments: Pick<AdminAttachment, "name" | "reviewStatus">[] | undefined,
  attachmentName: string,
) =>
  Boolean(
    attachments?.some(
      (attachment) =>
        attachment.name.trim().toLowerCase() ===
          attachmentName.trim().toLowerCase() &&
        attachment.reviewStatus === "Approved",
    ),
  );

const getAdmissionTypeLabel = (studentStatus?: string) =>
  studentStatus?.trim() || "Not recorded";

const getStudentLifecycleStatus = (
  student: Pick<Student, "status">,
): StudentLifecycleStatus => {
  if (student.status === "Archived") {
    return "Dropped";
  }

  if (student.status === "Graduated") {
    return "Dropped";
  }

  return "Undergraduate";
};

const getCurrentGraduationYear = () => String(new Date().getFullYear());

const buildAlumniBackupRecord = (
  student: Student,
  apiAlumni?: ApiAlumniRecord | null,
): AlumniBackupRecord => ({
  recordId: typeof apiAlumni?.id === "number" ? apiAlumni.id : undefined,
  id: apiAlumni?.student_id || student.id,
  fullName: apiAlumni?.full_name || student.name,
  program: apiAlumni?.program || student.strandOrCourse || student.program,
  yearGraduated: apiAlumni?.year_graduated || getCurrentGraduationYear(),
  contact: apiAlumni?.contact || student.contact || "",
  email: student.email || undefined,
  becameAlumniOn: apiAlumni?.became_alumni_on || "",
  studentSnapshot: { ...student },
});

const buildLocalAlumniRecord = (student: Student): ApiAlumniRecord => ({
  student_id: student.id,
  full_name: student.name,
  program: student.strandOrCourse || student.program,
  year_graduated: getCurrentGraduationYear(),
  contact: student.contact || "",
  became_alumni_on: new Date().toISOString(),
});

const mergeAlumniBackupRecords = (
  existingRecords: AlumniBackupRecord[],
  nextRecords: AlumniBackupRecord[],
) => {
  const alumniById = new Map(
    existingRecords.map((record) => [record.id, record] as const),
  );

  nextRecords.forEach((record) => {
    alumniById.set(record.id, record);
  });

  return Array.from(alumniById.values());
};

const SEMESTER_DISPLAY_ORDER = ["1st Semester", "2nd Semester", "Summer"];
const COLLEGE_PERIOD_DISPLAY_ORDER = [
  "Prelim",
  "Midterm",
  "Prefinal",
  "Final",
  "Overall",
  "1st Semester",
  "2nd Semester",
  "Summer",
];
const SHS_QUARTER_DISPLAY_ORDER = [
  "1st Quarter",
  "2nd Quarter",
  "3rd Quarter",
  "4th Quarter",
] as const;

type ShsQuarterLabel = (typeof SHS_QUARTER_DISPLAY_ORDER)[number];

interface ShsGradeSummaryRow {
  key: string;
  subjectCode: string;
  subjectTitle: string;
  quarterGrades: Record<ShsQuarterLabel, string>;
}

interface StudentGradeEditFieldState {
  key: string;
  label: string;
  gradingPeriod: string;
  semester: string;
  value: string;
  existingRecord: StoredStudentGradeRecord | null;
}

interface StudentGradeEditState {
  title: string;
  subtitle: string;
  branch: string;
  studentId: string;
  fullName: string;
  subjectCode: string;
  subjectTitle: string;
  programType: StudentGradeProgramType;
  academicYear: string;
  semester: string;
  unit: string;
  fields: StudentGradeEditFieldState[];
}

interface PlannerConflict {
  leftAssignmentId: string;
  rightAssignmentId: string;
  message: string;
}

const STUDENT_SUBJECT_PLAN_SCOPE = "student-subject-plans";
const STUDENT_SCHEDULE_REQUEST_SCOPE = "student-schedule-requests";

const getStudentSubjectPlanKey = (student: Pick<Student, "id" | "trackingNumber">) =>
  student.trackingNumber || student.id;

const formatScheduleSlotTime = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const [rawHour, rawMinute] = value.split(":").map(Number);
  const suffix = rawHour >= 12 ? "PM" : "AM";
  const hour = rawHour % 12 || 12;
  return `${hour}:${rawMinute.toString().padStart(2, "0")} ${suffix}`;
};

const formatPlannerScheduleLabel = (
  schedule: StudentScheduledAssignmentItem["schedule"],
) =>
  schedule.length > 0
    ? schedule
        .map(
          (slot) =>
            `${slot.day.slice(0, 3)} ${formatScheduleSlotTime(slot.startTime)}-${formatScheduleSlotTime(slot.endTime)} @ ${slot.room || "TBA"}`,
        )
        .join(" / ")
    : "Schedule not set";

const parseClockToMinutes = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};


const buildScheduledAssignmentConflicts = (
  assignments: Pick<
    StudentScheduledAssignmentItem,
    "assignmentId" | "subjectCode" | "schedule"
  >[],
): PlannerConflict[] => {
  const conflicts: PlannerConflict[] = [];

  for (let leftIndex = 0; leftIndex < assignments.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < assignments.length;
      rightIndex += 1
    ) {
      const left = assignments[leftIndex];
      const right = assignments[rightIndex];

      const hasConflict = left.schedule.some((leftSlot) =>
        right.schedule.some((rightSlot) => {
          if (leftSlot.day !== rightSlot.day) {
            return false;
          }

          const leftStart = parseClockToMinutes(leftSlot.startTime);
          const leftEnd = parseClockToMinutes(leftSlot.endTime);
          const rightStart = parseClockToMinutes(rightSlot.startTime);
          const rightEnd = parseClockToMinutes(rightSlot.endTime);

          if (
            leftStart === null ||
            leftEnd === null ||
            rightStart === null ||
            rightEnd === null
          ) {
            return false;
          }

          return leftStart < rightEnd && rightStart < leftEnd;
        }),
      );

      if (!hasConflict) {
        continue;
      }

      conflicts.push({
        leftAssignmentId: left.assignmentId,
        rightAssignmentId: right.assignmentId,
        message: `${left.subjectCode} conflicts with ${right.subjectCode}.`,
      });
    }
  }

  return conflicts;
};

const hasApprovedOwnSchedule = (
  student:
    | Pick<Student, "requestedOwnSchedule" | "ownScheduleRequestStatus">
    | null
    | undefined,
) =>
  Boolean(
    student?.requestedOwnSchedule &&
      student.ownScheduleRequestStatus === "Approved",
  );

const hasRequestedOwnSchedule = (
  student:
    | Pick<Student, "requestedOwnSchedule" | "ownScheduleRequestStatus">
    | null
    | undefined,
) => Boolean(student?.requestedOwnSchedule || student?.ownScheduleRequestStatus);

const getDisplayedAcademicStandingLabel = (
  student:
    | Pick<
        Student,
        "id" | "branch" | "trackingNumber" | "requestedOwnSchedule" | "ownScheduleRequestStatus"
      >
    | null
    | undefined,
  fallbackLabel?: string | null,
): "Regular" | "Irregular" =>
  hasRequestedOwnSchedule(student) ||
  Boolean(
    student &&
      getLatestApprovedIrregularEnrollmentRequestForStudent({
        branch: student.branch,
        studentNumber: student.id,
        trackingNumber: student.trackingNumber,
      }),
  ) ||
  fallbackLabel === "Irregular"
    ? "Irregular"
    : "Regular";

const mergeStudentOwnScheduleState = <
  T extends Pick<
    Student,
    | "requestedOwnSchedule"
    | "ownScheduleRequestStatus"
    | "ownScheduleAcademicYear"
    | "ownScheduleSemester"
    | "ownScheduleSelectionStatus"
  >,
>(
  primaryStudent: T,
  fallbackStudent:
    | Pick<
        Student,
        | "requestedOwnSchedule"
        | "ownScheduleRequestStatus"
        | "ownScheduleAcademicYear"
        | "ownScheduleSemester"
        | "ownScheduleSelectionStatus"
      >
    | null
    | undefined,
) => {
  const ownScheduleRequestStatus =
    primaryStudent.ownScheduleRequestStatus ??
    fallbackStudent?.ownScheduleRequestStatus;

  return {
    requestedOwnSchedule: Boolean(
      primaryStudent.requestedOwnSchedule ||
        fallbackStudent?.requestedOwnSchedule ||
        ownScheduleRequestStatus,
    ),
    ownScheduleRequestStatus,
    ownScheduleAcademicYear:
      primaryStudent.ownScheduleAcademicYear ||
      fallbackStudent?.ownScheduleAcademicYear,
    ownScheduleSemester:
      primaryStudent.ownScheduleSemester || fallbackStudent?.ownScheduleSemester,
    ownScheduleSelectionStatus:
      primaryStudent.ownScheduleSelectionStatus ??
      fallbackStudent?.ownScheduleSelectionStatus,
  };
};

const getOwnScheduleSelectionLabel = (
  status?: Student["ownScheduleSelectionStatus"],
) => {
  if (status === "Pending Approval") {
    return "Pending Approval";
  }

  if (status === "Approved") {
    return "Approved";
  }

  if (status === "Rejected") {
    return "Needs Resubmission";
  }

  return "Not Submitted";
};

const buildGradeTermKey = (academicYear: string, semester: string) =>
  `${academicYear}::${semester}`;

const getGradeSearchHaystack = (
  record: Pick<
    StoredStudentGradeRecord,
    | "subjectCode"
    | "subjectTitle"
    | "gradingPeriod"
    | "normalizedGrade"
    | "evaluation"
    | "academicYear"
    | "semester"
  >,
) =>
  [
    record.subjectCode,
    record.subjectTitle,
    record.gradingPeriod,
    record.normalizedGrade,
    record.evaluation,
    record.academicYear,
    record.semester,
  ]
    .join(" ")
    .toLowerCase();

const getSemesterOrderIndex = (value: string) => {
  const index = SEMESTER_DISPLAY_ORDER.indexOf(value);
  return index >= 0 ? index : SEMESTER_DISPLAY_ORDER.length;
};

const sortAcademicTerms = <T extends { academicYear: string; semester: string }>(
  values: T[],
) =>
  [...values].sort((left, right) => {
    const academicYearComparison = left.academicYear.localeCompare(
      right.academicYear,
    );
    if (academicYearComparison !== 0) {
      return academicYearComparison;
    }

    const semesterComparison =
      getSemesterOrderIndex(left.semester) - getSemesterOrderIndex(right.semester);
    if (semesterComparison !== 0) {
      return semesterComparison;
    }

    return left.semester.localeCompare(right.semester);
  });

const sortCollegeGradeRecords = (records: StoredStudentGradeRecord[]) =>
  [...records].sort((left, right) => {
    const subjectComparison =
      left.subjectCode.localeCompare(right.subjectCode) ||
      left.subjectTitle.localeCompare(right.subjectTitle);
    if (subjectComparison !== 0) {
      return subjectComparison;
    }

    const leftPeriodIndex = COLLEGE_PERIOD_DISPLAY_ORDER.indexOf(
      left.gradingPeriod,
    );
    const rightPeriodIndex = COLLEGE_PERIOD_DISPLAY_ORDER.indexOf(
      right.gradingPeriod,
    );

    if (leftPeriodIndex >= 0 && rightPeriodIndex >= 0) {
      const periodComparison = leftPeriodIndex - rightPeriodIndex;
      if (periodComparison !== 0) {
        return periodComparison;
      }
    } else if (leftPeriodIndex >= 0) {
      return -1;
    } else if (rightPeriodIndex >= 0) {
      return 1;
    }

    return left.gradingPeriod.localeCompare(right.gradingPeriod);
  });

const buildShsGradeSummaryKey = (subjectCode: string, subjectTitle: string) =>
  `${subjectCode}::${subjectTitle}`;

const getShsQuarterLabelsForSemester = (semester: string): ShsQuarterLabel[] =>
  getRequiredShsQuarterLabelsForSemester(semester).filter(
    (label): label is ShsQuarterLabel =>
      SHS_QUARTER_DISPLAY_ORDER.includes(label as ShsQuarterLabel),
  );

const buildShsGradeSummaryRows = (
  records: StoredStudentGradeRecord[],
  semester: string,
) => {
  const rows = new Map<string, ShsGradeSummaryRow>();
  const activeQuarterLabels = getShsQuarterLabelsForSemester(semester);

  records.forEach((record) => {
    const quarterLabel = record.gradingPeriod as ShsQuarterLabel;
    if (!SHS_QUARTER_DISPLAY_ORDER.includes(quarterLabel)) {
      return;
    }

    if (!activeQuarterLabels.includes(quarterLabel)) {
      return;
    }

    const key = buildShsGradeSummaryKey(record.subjectCode, record.subjectTitle);
    const existingRow = rows.get(key) ?? {
      key,
      subjectCode: record.subjectCode,
      subjectTitle: record.subjectTitle,
      quarterGrades: {
        "1st Quarter": "—",
        "2nd Quarter": "—",
        "3rd Quarter": "—",
        "4th Quarter": "—",
      },
    };

    existingRow.quarterGrades[quarterLabel] = record.normalizedGrade;
    rows.set(key, existingRow);
  });

  return Array.from(rows.values()).sort(
    (left, right) =>
      left.subjectCode.localeCompare(right.subjectCode) ||
      left.subjectTitle.localeCompare(right.subjectTitle),
  );
};

const getEditableShsQuarterLabels = (semester: string): ShsQuarterLabel[] => {
  const quarterLabels = getShsQuarterLabelsForSemester(semester);
  return quarterLabels.length > 0 ? quarterLabels : [...SHS_QUARTER_DISPLAY_ORDER];
};

const buildGradeClearIdentityFromRecord = (record: StoredStudentGradeRecord) => ({
  studentId: record.studentId,
  subjectCode: record.subjectCode,
  academicYear: record.academicYear,
  semester: record.semester,
  gradingPeriod: record.gradingPeriod,
  programType: record.programType,
});

const mergeApprovedEnrollees = (records: AdminEnrolleeRecord[]) => {
  const mergedRecords = new Map<string, AdminEnrolleeRecord>();

  records
    .filter((record) => record.status === "Approved")
    .forEach((record) => {
      const resolvedBranch = normalizeBranchName(record.branch);
      const key =
        record.trackingNumber ||
        record.studentNumber ||
        `${resolvedBranch}:${record.fullName}`;
      const existingRecord = mergedRecords.get(key);

      mergedRecords.set(
        key,
        existingRecord
          ? {
              ...existingRecord,
              ...record,
              branch: resolvedBranch,
              personalInfo: {
                ...existingRecord.personalInfo,
                ...record.personalInfo,
              },
              attachments: record.attachments ?? existingRecord.attachments,
            }
          : {
              ...record,
              branch: resolvedBranch,
            },
      );
    });

  return Array.from(mergedRecords.values());
};

const recoverApprovedStudentsForBranch = async (
  branch: string,
): Promise<number> => {
  const resolvedBranch = normalizeBranchName(branch);
  const storedApprovedEnrollees = stripLegacyMockAdmissionRecords(
    readBranchScopedData<AdminEnrolleeRecord[]>(
      ENROLLEE_STORAGE_SCOPE,
      resolvedBranch,
    ) ?? [],
  );

  let supabaseApprovedEnrollees: AdminEnrolleeRecord[] = [];
  try {
    supabaseApprovedEnrollees = await fetchSupabaseAdmissionApplicants(
      resolvedBranch,
    );
  } catch (error) {
    console.warn(
      `Unable to load approved enrollees from Supabase for ${resolvedBranch}.`,
      error,
    );
  }

  const recoverableEnrollees = mergeApprovedEnrollees([
    ...storedApprovedEnrollees,
    ...supabaseApprovedEnrollees,
  ]);

  recoverableEnrollees.forEach((enrollee) => {
    promoteApplicantToStoredStudent({
      ...enrollee,
      branch: resolvedBranch,
    });
  });

  return recoverableEnrollees.length;
};

type StudentIdentityInput = Pick<
  Student,
  "id" | "trackingNumber" | "email" | "name"
> & {
  birthDate?: string;
};

const studentsMatch = (left: StudentIdentityInput, right: StudentIdentityInput) => {
  if (left.id === right.id) {
    return true;
  }

  if (
    left.trackingNumber &&
    right.trackingNumber &&
    left.trackingNumber === right.trackingNumber
  ) {
    return true;
  }

  const leftEmail = left.email?.trim().toLowerCase();
  const rightEmail = right.email?.trim().toLowerCase();
  const leftName = left.name?.trim().toLowerCase().replace(/\s+/g, " ");
  const rightName = right.name?.trim().toLowerCase().replace(/\s+/g, " ");

  if (leftEmail && rightEmail && leftName && rightName) {
    return leftEmail === rightEmail && leftName === rightName;
  }

  const leftBirthDate = left.birthDate?.trim();
  const rightBirthDate = right.birthDate?.trim();

  return Boolean(
    leftName &&
      rightName &&
      leftBirthDate &&
      rightBirthDate &&
      leftName === rightName &&
      leftBirthDate === rightBirthDate,
  );
};

const getStudentSyncKey = (student: Pick<Student, "id" | "trackingNumber">) =>
  student.trackingNumber || student.id;

const isActiveStudentListRecord = (student: Pick<Student, "status">) =>
  getStudentLifecycleStatus(student) === "Undergraduate";

const getActiveStudentsForAdminList = (branch: string) =>
  (getStudentsForBranch(branch) as Student[]).filter(isActiveStudentListRecord);

const removeHiddenStudentsFromAdminList = (students: Student[]) =>
  students.filter(isActiveStudentListRecord);

const RESTORE_SNAPSHOT_GUARD_MS = 5 * 60 * 1000;

const hasFreshRestoreSnapshotForBranch = (branch: string) => {
  const restoreMarker = readBackupRestoreMarker();

  if (!restoreMarker) {
    return false;
  }

  const restoredAt = Date.parse(restoreMarker.appliedAt);
  const isExpired =
    !Number.isFinite(restoredAt) ||
    Date.now() - restoredAt > RESTORE_SNAPSHOT_GUARD_MS;

  if (isExpired) {
    clearBackupRestoreMarker();
    return false;
  }

  return normalizeBranchName(restoreMarker.branch) === normalizeBranchName(branch);
};

const persistArchivedStudentsLocally = (
  branch: string,
  studentsToArchive: Student[],
) => {
  if (studentsToArchive.length === 0) {
    return;
  }

  const archivedByKey = new Map(
    studentsToArchive.map((student) => [
      getStudentSyncKey(student),
      { ...student, branch: student.branch || branch, status: "Archived" as const },
    ]),
  );
  const seenArchivedKeys = new Set<string>();
  const nextStoredStudents = readStoredStudents().map((student) => {
    if (normalizeBranchName(student.branch) !== normalizeBranchName(branch)) {
      return student;
    }

    const archivedStudent = archivedByKey.get(getStudentSyncKey(student));

    if (!archivedStudent) {
      return student;
    }

    seenArchivedKeys.add(getStudentSyncKey(student));
    return {
      ...student,
      ...archivedStudent,
      status: "Archived" as const,
    };
  });

  archivedByKey.forEach((student, key) => {
    if (!seenArchivedKeys.has(key)) {
      nextStoredStudents.push(student);
    }
  });

  writeStoredStudents(nextStoredStudents);
};

const normalizeComparableText = (value?: string | null) =>
  (value || "").trim().toLowerCase();

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

  const normalizedYearLevel = requestedYearLevel.trim().toLowerCase();
  const requestedYearCode = normalizedYearLevel.includes("2nd")
    ? "2"
    : normalizedYearLevel.includes("3rd")
      ? "3"
      : normalizedYearLevel.includes("4th")
        ? "4"
        : normalizedYearLevel.includes("grade 12")
          ? "2"
          : "1";
  const codeParts = normalizedCode.match(/^(.*?)([1-4])([A-Z]+)$/);

  if (!codeParts) {
    return normalizedCode;
  }

  const [, prefix, , blockLabel] = codeParts;
  return `${prefix}${requestedYearCode}${blockLabel}`;
};

const getLinkedStudentEnrollee = (
  student: Pick<Student, "branch" | "id" | "trackingNumber">,
) =>
  (
    readBranchScopedData<AdminEnrolleeRecord[]>(
      ENROLLEE_STORAGE_SCOPE,
      normalizeBranchName(student.branch),
    ) ?? []
  ).find((record) => {
    if (
      student.trackingNumber &&
      record.trackingNumber === student.trackingNumber
    ) {
      return true;
    }

    return record.studentNumber === student.id;
  }) ?? null;

const resolveStudentWithApprovedEnrollment = (student: Student): Student => {
  const linkedEnrollee = getLinkedStudentEnrollee(student);
  const studentWithOwnScheduleFallback = {
    ...student,
    ...mergeStudentOwnScheduleState(student, linkedEnrollee),
  };
  const approvedEnrollmentRequest = getLatestApprovedEnrollmentRequestForStudent({
    branch: studentWithOwnScheduleFallback.branch,
    studentNumber: studentWithOwnScheduleFallback.id,
    trackingNumber: studentWithOwnScheduleFallback.trackingNumber,
  });

  if (!approvedEnrollmentRequest) {
    return studentWithOwnScheduleFallback;
  }

  const hasApprovedOwnScheduleRequest =
    approvedEnrollmentRequest.irregularRequest?.mode === "own_schedule";
  const resolvedYearLevel =
    approvedEnrollmentRequest.requestedYearLevel ||
    studentWithOwnScheduleFallback.yearLevel;

  return {
    ...studentWithOwnScheduleFallback,
    yearLevel: resolvedYearLevel,
    section:
      approvedEnrollmentRequest.irregularRequest?.mode === "own_schedule"
        ? ""
        : approvedEnrollmentRequest.irregularRequest?.mode === "section_assignment"
          ? approvedEnrollmentRequest.irregularRequest.requestedSectionCode ||
            studentWithOwnScheduleFallback.section
          : buildProgressedBlockSectionCode({
                currentSectionCode: studentWithOwnScheduleFallback.section,
                requestedYearLevel: resolvedYearLevel,
              }) || studentWithOwnScheduleFallback.section,
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
      ? approvedEnrollmentRequest.semester
      : studentWithOwnScheduleFallback.ownScheduleSemester,
    ownScheduleSelectionStatus: hasApprovedOwnScheduleRequest
      ? studentWithOwnScheduleFallback.ownScheduleSelectionStatus ||
        "Not Submitted"
      : studentWithOwnScheduleFallback.ownScheduleSelectionStatus,
  };
};

const needsStudentRecordSync = (
  localStudent: Pick<Student, "yearLevel" | "section" | "status">,
  fetchedStudent: Pick<Student, "yearLevel" | "section" | "status">,
) =>
  normalizeComparableText(localStudent.yearLevel) !==
    normalizeComparableText(fetchedStudent.yearLevel) ||
  normalizeComparableText(localStudent.section) !==
    normalizeComparableText(fetchedStudent.section) ||
  normalizeComparableText(localStudent.status) !==
    normalizeComparableText(fetchedStudent.status);

type StoredSectionAssignmentRecord = {
  enrolleeId: string;
  assignedSection: string;
};

const getRecoveredStudentSection = (
  student: Pick<Student, "id" | "trackingNumber" | "branch">,
) => {
  const resolvedBranch = normalizeBranchName(student.branch);
  const linkedEnrollee =
    (
      readBranchScopedData<AdminEnrolleeRecord[]>(
        ENROLLEE_STORAGE_SCOPE,
        resolvedBranch,
      ) ?? []
    ).find((record) => {
      if (
        student.trackingNumber &&
        record.trackingNumber === student.trackingNumber
      ) {
        return true;
      }

      return record.studentNumber === student.id;
    }) ?? null;

  if (!linkedEnrollee) {
    return "";
  }

  return (
    (
      readBranchScopedData<StoredSectionAssignmentRecord[]>(
        "section-assignments",
        resolvedBranch,
      ) ?? []
    ).find((assignment) => assignment.enrolleeId === linkedEnrollee.id)
      ?.assignedSection || ""
  );
};

const mergeFetchedStudentsWithLocalState = (
  fetchedStudents: Student[],
  localStudents: Student[],
  preferLocalStudentKeys: Set<string> = new Set(),
) => {
  const mergedFetchedStudents = fetchedStudents.map((student) => {
    const resolvedFetchedStudent = resolveStudentWithApprovedEnrollment(student);
    const localStudent = localStudents.find((candidate) =>
      studentsMatch(candidate, resolvedFetchedStudent),
    );

    if (!localStudent) {
      return {
        ...resolvedFetchedStudent,
        section:
          resolvedFetchedStudent.section ||
          getRecoveredStudentSection(resolvedFetchedStudent),
      };
    }

    const resolvedLocalStudent = resolveStudentWithApprovedEnrollment(localStudent);
    const shouldPreferLocalStudentState = preferLocalStudentKeys.has(
      getStudentSyncKey(resolvedLocalStudent),
    );

    const mergedStudent = {
      ...resolvedFetchedStudent,
      id:
        resolvedFetchedStudent.id === resolvedLocalStudent.id
          ? resolvedFetchedStudent.id
          : resolvedLocalStudent.id || resolvedFetchedStudent.id,
      trackingNumber:
        resolvedFetchedStudent.trackingNumber ||
        resolvedLocalStudent.trackingNumber,
      yearLevel: shouldPreferLocalStudentState
        ? resolvedLocalStudent.yearLevel || resolvedFetchedStudent.yearLevel
        : resolvedFetchedStudent.yearLevel,
      section:
        shouldPreferLocalStudentState
          ? resolvedLocalStudent.section ||
            resolvedFetchedStudent.section ||
            getRecoveredStudentSection(resolvedLocalStudent)
          : resolvedFetchedStudent.section ||
            resolvedLocalStudent.section ||
            getRecoveredStudentSection(resolvedLocalStudent),
      status: shouldPreferLocalStudentState
        ? resolvedLocalStudent.status
        : resolvedFetchedStudent.status,
      ...mergeStudentOwnScheduleState(
        resolvedFetchedStudent,
        resolvedLocalStudent,
      ),
    };

    return mergedStudent;
  });

  const localOnlyStudents = localStudents.filter(
    (student) =>
      !fetchedStudents.some((candidate) => studentsMatch(candidate, student)),
  );

  return dedupeStoredStudents([
    ...mergedFetchedStudents,
    ...localOnlyStudents.map((student) => ({
      ...student,
      section: student.section || getRecoveredStudentSection(student),
    })),
  ]) as Student[];
};

const buildStudentSyncMessage = (
  _syncedCount: number,
  failedStudents: string[],
) => {
  if (failedStudents.length === 0) {
    return null;
  }

  const failedLabel =
    failedStudents.length > 0
      ? `${failedStudents.length} student${failedStudents.length === 1 ? "" : "s"} stayed on this device only because Supabase rejected the record.`
      : "";

  return failedLabel.trim();
};

const syncLocalStudentsToSupabase = async (
  branch: string,
  localStudents: Student[],
  fetchedStudents: Student[],
) => {
  const branchStudents = dedupeStoredStudents(localStudents).filter(
    (student) => normalizeBranchName(student.branch) === normalizeBranchName(branch),
  ) as Student[];
  const studentsToSync = branchStudents.filter(
    (student) => {
      const resolvedLocalStudent = resolveStudentWithApprovedEnrollment(student);
      const fetchedStudent = fetchedStudents.find((candidate) =>
        studentsMatch(candidate, resolvedLocalStudent),
      );

      if (!fetchedStudent) {
        return true;
      }

      return needsStudentRecordSync(
        resolvedLocalStudent,
        resolveStudentWithApprovedEnrollment(fetchedStudent),
      );
    },
  );
  const failedStudents: string[] = [];
  const failedStudentKeys = new Set<string>();
  let syncedCount = 0;

  for (const student of studentsToSync) {
    try {
      await saveAdminStudent(resolveStudentWithApprovedEnrollment(student));
      syncedCount += 1;
    } catch (error) {
      console.warn("Unable to sync local student to Supabase.", student, error);
      failedStudents.push(student.name || student.id);
      failedStudentKeys.add(getStudentSyncKey(student));
    }
  }

  return {
    syncedCount,
    failedStudents,
    failedStudentKeys,
  };
};

export default function AdminStudents({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: StudentsProps) {
  const { currentUser } = useAuth();
  const currentBranch = normalizeBranchName(currentUser?.branch);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProgram, setFilterProgram] = useState("All Programs");
  const [filterYearLevel, setFilterYearLevel] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const filterStudentLifecycleStatus: "All" | StudentLifecycleStatus =
    "Undergraduate";
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterAcademicStanding, setFilterAcademicStanding] = useState("All");
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [studentToArchive, setStudentToArchive] = useState<string | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [shsTrackType, setShsTrackType] = useState("");
  const [programSpecialization, setProgramSpecialization] = useState("");
  const [sortField, setSortField] = useState<"id">("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [isScheduleNotificationModalOpen, setIsScheduleNotificationModalOpen] =
    useState(false);
  const [systemAlert, setSystemAlert] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [studentRecoveryMessage, setStudentRecoveryMessage] = useState<
    string | null
  >(null);
  const [studentSubjectPlans, setStudentSubjectPlans] = useState<
    Record<string, StudentSubjectPlanRecord>
  >({});
  const [studentScheduleRequests, setStudentScheduleRequests] = useState<
    StudentScheduleSelectionRequestRecord[]
  >([]);
  const [hasLoadedStudentPlanData, setHasLoadedStudentPlanData] =
    useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isBulkMovingToAlumni, setIsBulkMovingToAlumni] = useState(false);
  const [isBulkArchiving, setIsBulkArchiving] = useState(false);
  const [pendingScholarshipScore, setPendingScholarshipScore] = useState("");
  const [isSavingScholarshipScore, setIsSavingScholarshipScore] =
    useState(false);
  const [scholarshipScoreFeedback, setScholarshipScoreFeedback] =
    useState<InlineFeedback | null>(null);
  const [credentialActionFeedback, setCredentialActionFeedback] =
    useState<InlineFeedback | null>(null);
  const [credentialActionKey, setCredentialActionKey] = useState<string | null>(
    null,
  );
  const [gradeRecordsVersion, setGradeRecordsVersion] = useState(0);
  const [gradeSchoolYearFilter, setGradeSchoolYearFilter] = useState("all");
  const [gradeSemesterFilter, setGradeSemesterFilter] = useState("all");
  const [gradeSearchTerm, setGradeSearchTerm] = useState("");
  const [gradeEditState, setGradeEditState] =
    useState<StudentGradeEditState | null>(null);
  const [gradeEditFeedback, setGradeEditFeedback] =
    useState<InlineFeedback | null>(null);
  const [gradeManagementFeedback, setGradeManagementFeedback] =
    useState<InlineFeedback | null>(null);
  const [isSavingGradeEdit, setIsSavingGradeEdit] = useState(false);
  const [paymentRecordsVersion, setPaymentRecordsVersion] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReceiptNumber, setPaymentReceiptNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(getTodayInputDate);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentFeedback, setPaymentFeedback] = useState<InlineFeedback | null>(
    null,
  );
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  const showSystemAlert = (title: string, message: string) => {
    setSystemAlert({ title, message });
  };

  // Form state for add/edit
  const [formData, setFormData] = useState<Student>({
    id: "",
    name: "",
    program: "",
    yearLevel: "",
    shsTrackType: "",
    strandOrCourse: "",
    documentSubmitted: "",
    contact: "",
    email: "",
    address: "",
    status: "Incomplete",
    branch: currentBranch,
    studentStatus: "",
    guardianName: "",
    guardianContact: "",
  });

  // Errors for add/edit
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof Student, string>>
  >({});

  // Students data
  const [students, setStudents] = useState<Student[]>(() =>
    getActiveStudentsForAdminList(currentBranch),
  );

  useEffect(() => {
    let isCancelled = false;

    const loadStudentsForBranch = async () => {
      setIsLoading(true);
      setStudentRecoveryMessage(null);

      try {
        const localBranchStudents = getStudentsForBranch(currentBranch) as Student[];

        if (hasFreshRestoreSnapshotForBranch(currentBranch)) {
          if (!isCancelled) {
            setStudents(getActiveStudentsForAdminList(currentBranch));
            setStudentRecoveryMessage(null);
          }
          return;
        }

        try {
          await fetchEnrollmentRequests(currentBranch);
        } catch (error) {
          console.warn("Unable to fetch shared enrollment requests.", error);
        }
        let fetchedBranchStudents = (await fetchAdminStudents(
          currentBranch,
        )) as Student[];
        const syncSummary = await syncLocalStudentsToSupabase(
          currentBranch,
          localBranchStudents,
          fetchedBranchStudents,
        );

        if (syncSummary.syncedCount > 0) {
          fetchedBranchStudents = (await fetchAdminStudents(
            currentBranch,
          )) as Student[];
        }

        const branchStudents = mergeFetchedStudentsWithLocalState(
          fetchedBranchStudents,
          localBranchStudents,
          syncSummary.failedStudentKeys,
        );

        if (!isCancelled) {
          if (hasFreshRestoreSnapshotForBranch(currentBranch)) {
            setStudents(getActiveStudentsForAdminList(currentBranch));
            setStudentRecoveryMessage(null);
            return;
          }

          setStudents(removeHiddenStudentsFromAdminList(branchStudents));

          const syncMessage = buildStudentSyncMessage(
            syncSummary.syncedCount,
            syncSummary.failedStudents,
          );

          if (syncMessage) {
            setStudentRecoveryMessage(syncMessage);
          }
        }
      } catch (error) {
        console.error("Failed to load branch students", error);
        let branchStudents = getActiveStudentsForAdminList(currentBranch);
        let recoveryMessage: string | null = null;

        try {
          if (branchStudents.length === 0) {
            const storedStudentCount = readStoredStudents().length;
            const branchesToRecover =
              storedStudentCount === 0
                ? [...RECOVERABLE_BRANCHES]
                : [currentBranch];

            let recoveredBranches = 0;

            for (const branch of branchesToRecover) {
              const existingBranchStudents = getStudentsForBranch(branch);

              if (existingBranchStudents.length > 0) {
                continue;
              }

              const recoveredCount = await recoverApprovedStudentsForBranch(
                branch,
              );

              if (recoveredCount > 0) {
                recoveredBranches += 1;
              }
            }

            branchStudents = getActiveStudentsForAdminList(currentBranch);

            if (branchStudents.length > 0) {
              recoveryMessage =
                storedStudentCount === 0
                  ? `Recovered approved students for ${recoveredBranches} branch${recoveredBranches === 1 ? "" : "es"}.`
                  : `Recovered ${branchStudents.length} approved student${branchStudents.length === 1 ? "" : "s"} for ${currentBranch}.`;
            } else if (recoveredBranches === 0) {
              recoveryMessage = `No approved students were found to restore for ${currentBranch}.`;
            }
          }
        } catch (recoveryError) {
          console.error("Failed to recover local branch students", recoveryError);
        }

        if (!isCancelled) {
          setStudents(branchStudents);
          setStudentRecoveryMessage(recoveryMessage);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadStudentsForBranch();

    return () => {
      isCancelled = true;
    };
  }, [currentBranch]);

  useEffect(() => {
    let isCancelled = false;
    setHasLoadedStudentPlanData(false);
    setSelectedStudentIds([]);

    const fallbackPlans =
      readBranchScopedData<Record<string, StudentSubjectPlanRecord>>(
        STUDENT_SUBJECT_PLAN_SCOPE,
        currentBranch,
      ) ?? {};
    const fallbackRequests =
      readBranchScopedData<StudentScheduleSelectionRequestRecord[]>(
        STUDENT_SCHEDULE_REQUEST_SCOPE,
        currentBranch,
      ) ?? [];

    const loadSharedStudentPlanData = async () => {
      let nextPlans = fallbackPlans;
      let nextRequests = fallbackRequests;

      try {
        const [remotePlans, remoteRequests] = await Promise.all([
          fetchStudentSubjectPlans(currentBranch),
          fetchStudentScheduleRequests(currentBranch),
        ]);
        nextPlans = remotePlans;
        nextRequests = remoteRequests;
      } catch (error) {
        console.warn(
          "Failed to fetch shared student planning records. Falling back to cached branch data.",
          error,
        );
      }

      if (isCancelled) {
        return;
      }

      setStudentSubjectPlans(nextPlans);
      setStudentScheduleRequests(nextRequests);
      setHasLoadedStudentPlanData(true);
    };

    void loadSharedStudentPlanData();

    return () => {
      isCancelled = true;
    };
  }, [currentBranch]);

  useEffect(() => {
    const handleBackupRestoreApplied = () => {
      setStudents(getActiveStudentsForAdminList(currentBranch));
      setGradeRecordsVersion((previousValue) => previousValue + 1);
      setStudentSubjectPlans(
        readBranchScopedData<Record<string, StudentSubjectPlanRecord>>(
          STUDENT_SUBJECT_PLAN_SCOPE,
          currentBranch,
        ) ?? {},
      );
      setStudentScheduleRequests(
        readBranchScopedData<StudentScheduleSelectionRequestRecord[]>(
          STUDENT_SCHEDULE_REQUEST_SCOPE,
        currentBranch,
      ) ?? [],
      );
    };

    window.addEventListener(
      BACKUP_RESTORE_APPLIED_EVENT,
      handleBackupRestoreApplied as EventListener,
    );

    return () => {
      window.removeEventListener(
        BACKUP_RESTORE_APPLIED_EVENT,
        handleBackupRestoreApplied as EventListener,
      );
    };
  }, [currentBranch]);

  useEffect(() => {
    const handleStudentGradeRecordsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ branch?: string }>;
      const updatedBranch = normalizeBranchName(customEvent.detail?.branch);

      if (updatedBranch && updatedBranch !== currentBranch) {
        return;
      }

      setGradeRecordsVersion((previousValue) => previousValue + 1);
    };

    window.addEventListener(
      STUDENT_GRADE_RECORDS_UPDATED_EVENT,
      handleStudentGradeRecordsUpdated as EventListener,
    );

    return () => {
      window.removeEventListener(
        STUDENT_GRADE_RECORDS_UPDATED_EVENT,
        handleStudentGradeRecordsUpdated as EventListener,
      );
    };
  }, [currentBranch]);

  useEffect(() => {
    const handleStudentPaymentsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ branch?: string }>;
      const updatedBranch = normalizeBranchName(customEvent.detail?.branch);

      if (updatedBranch && updatedBranch !== currentBranch) {
        return;
      }

      setPaymentRecordsVersion((previousValue) => previousValue + 1);
    };

    window.addEventListener(
      STUDENT_PAYMENTS_UPDATED_EVENT,
      handleStudentPaymentsUpdated as EventListener,
    );

    return () => {
      window.removeEventListener(
        STUDENT_PAYMENTS_UPDATED_EVENT,
        handleStudentPaymentsUpdated as EventListener,
      );
    };
  }, [currentBranch]);

  useEffect(() => {
    if (window.innerWidth < 1024 && isSidebarOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }

    document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    const storedStudents = readStoredStudents();
    const visibleStudents = removeHiddenStudentsFromAdminList(students);
    const hiddenStudentsFromState = students.filter(
      (student) => !isActiveStudentListRecord(student),
    );
    const hiddenStateKeys = new Set(
      hiddenStudentsFromState.map(getStudentSyncKey),
    );
    const studentsToPreserve = storedStudents.filter((student) => {
      const isCurrentBranch = normalizeBranchName(student.branch) === currentBranch;

      if (!isCurrentBranch) {
        return true;
      }

      if (isActiveStudentListRecord(student)) {
        return false;
      }

      return !hiddenStateKeys.has(getStudentSyncKey(student));
    });

    writeStoredStudents([
      ...studentsToPreserve,
      ...hiddenStudentsFromState,
      ...visibleStudents,
    ]);

    if (hiddenStudentsFromState.length > 0) {
      setStudents(visibleStudents);
    }
  }, [students, currentBranch]);

  useEffect(() => {
    setSelectedStudentIds((prev) =>
      prev.filter((studentId) =>
        students.some(
          (student) =>
            student.id === studentId &&
            student.status !== "Archived",
        ),
      ),
    );
  }, [students]);

  useEffect(() => {
    if (!hasLoadedStudentPlanData) {
      return;
    }

    writeBranchScopedData(
      STUDENT_SUBJECT_PLAN_SCOPE,
      currentBranch,
      studentSubjectPlans,
    );
  }, [currentBranch, hasLoadedStudentPlanData, studentSubjectPlans]);

  const studentAcademicStandingById = useMemo(
    () =>
      Object.fromEntries(
        students.map((student) => [
          student.id,
          getStudentAcademicStanding({
            branch: student.branch || currentBranch,
            program: student.program,
            studentId: student.id,
          }),
        ]),
      ),
    [students, currentBranch, gradeRecordsVersion],
  );
  const getStudentAcademicStandingLabel = (student: Student) =>
    getDisplayedAcademicStandingLabel(
      student,
      studentAcademicStandingById[student.id]?.label,
    );

  const filteredStudents = students.filter((student) => {
    const search = searchTerm.toLowerCase();
    const academicStanding = getStudentAcademicStandingLabel(student);
    const lifecycleStatus = getStudentLifecycleStatus(student);
    const matchesSearch =
      student.name.toLowerCase().includes(search) ||
      student.id.toLowerCase().includes(search) ||
      student.program.toLowerCase().includes(search) ||
      student.email.toLowerCase().includes(search) ||
      student.contact.toLowerCase().includes(search) ||
      (student.section || "").toLowerCase().includes(search) ||
      getAdmissionTypeLabel(student.studentStatus).toLowerCase().includes(search) ||
      academicStanding.toLowerCase().includes(search);

    const matchesProgram =
      filterProgram === "All Programs" || student.program === filterProgram;
    const matchesYearLevel =
      filterYearLevel === "" || student.yearLevel === filterYearLevel;
    const matchesSection =
      filterSection === "" || (student.section || "") === filterSection;
    const matchesStudentLifecycleStatus =
      lifecycleStatus === filterStudentLifecycleStatus;
    const matchesStatus =
      (filterStatus === "All" || student.status === filterStatus);
    const matchesAcademicStanding =
      filterAcademicStanding === "All" ||
      academicStanding === filterAcademicStanding;

    return (
      matchesSearch &&
      matchesProgram &&
      matchesYearLevel &&
      matchesSection &&
      matchesStudentLifecycleStatus &&
      matchesStatus &&
      matchesAcademicStanding
    );
  });

  const sortedStudents = [...filteredStudents].sort((left, right) => {
    const leftValue = String(left[sortField] ?? "").toLowerCase();
    const rightValue = String(right[sortField] ?? "").toLowerCase();

    if (sortField === "id") {
      const leftNumber = Number(left.id);
      const rightNumber = Number(right.id);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return sortDirection === "asc"
          ? leftNumber - rightNumber
          : rightNumber - leftNumber;
      }
    }

    if (leftValue < rightValue) return sortDirection === "asc" ? -1 : 1;
    if (leftValue > rightValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: "id") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection("asc");
  };

  const sortIndicator = (field: "id") => {
    if (sortField !== field) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  const yearLevelOptions = Array.from(
    new Set(students.map((student) => student.yearLevel)),
  )
    .filter(
      (yearLevelOption) =>
        yearLevelOption !== "Academic Track" && yearLevelOption !== "G12",
    )
    .sort();
  const sectionOptions = Array.from(
    new Set(
      students
        .map((student) => student.section)
        .filter((section): section is string => Boolean(section)),
    ),
  ).sort();
  const isStudentSelectableForBulkActions = (student: Student) =>
    getStudentLifecycleStatus(student) === "Undergraduate";
  const isStudentEligibleForAlumniTransfer = (student: Student) => {
    const normalizedProgram = student.program.trim().toLowerCase();
    const normalizedYearLevel = student.yearLevel.trim().toLowerCase();

    if (normalizedProgram !== "shs") {
      return normalizedYearLevel === "4th year";
    }

    if (normalizedProgram === "shs") {
      return (
        normalizedYearLevel === "grade 12" ||
        normalizedYearLevel === "g12" ||
        normalizedYearLevel === "12"
      );
    }

    return false;
  };
  const selectedStudents = students.filter((student) =>
    selectedStudentIds.includes(student.id) &&
    isStudentSelectableForBulkActions(student),
  );
  const alumniEligibleSelectedStudents = selectedStudents.filter(
    isStudentEligibleForAlumniTransfer,
  );
  const isAnyBulkActionPending = isBulkMovingToAlumni || isBulkArchiving;
  const visibleStudentIds = sortedStudents
    .filter(isStudentSelectableForBulkActions)
    .map((student) => student.id);
  const areAllVisibleStudentsSelected =
    visibleStudentIds.length > 0 &&
    visibleStudentIds.every((studentId) => selectedStudentIds.includes(studentId));

  // Validation
  const validateForm = () => {
    const errors: Partial<Record<keyof Student, string>> = {};

    const idTrimmed = formData.id.trim();
    if (!idTrimmed) errors.id = "Student ID is required";
    else if (!editingStudent && students.some((s) => s.id === idTrimmed)) {
      errors.id = "This ID already exists";
    }

    if (!formData.name.trim()) {
      errors.name = "Full Name is required";
    } else {
      const { lastName } = splitFullName(formData.name);
      if (!lastName) {
        errors.name = "Please provide at least first and last name";
      }
    }

    if (!formData.email.trim()) {
      errors.email = "Email is required";
    }

    if (!formData.program.trim()) errors.program = "Program is required";
    if (!formData.yearLevel.trim()) errors.yearLevel = "Year Level is required";
    if (formData.program === "SHS" && !formData.shsTrackType?.trim()) {
      errors.yearLevel = "Track is required for SHS";
    } else if (
      (formData.program === "SHS" || formData.program === "College") &&
      !formData.strandOrCourse?.trim()
    ) {
      errors.yearLevel =
        formData.program === "SHS"
          ? "Specialization is required for SHS"
          : "Course selection is required for College";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const generateNextStudentId = async () => {
    try {
      return await getNextAdminStudentNumber(currentBranch);
    } catch (error) {
      console.warn(
        "Unable to get the next student number from Supabase. Falling back to local generation.",
        error,
      );
      return getNextStudentNumber(currentBranch);
    }
  };

  // Open add/edit modal
  const openAddEditModal = async (student?: Student) => {
    if (student) {
      if (student.program === "SHS") {
        let resolvedTrackType = student.shsTrackType || "";
        let resolvedSpecialization = student.strandOrCourse || "";
        let resolvedYearLevel = student.yearLevel;

        if (!resolvedTrackType) {
          if (
            student.yearLevel === "Academic Track" ||
            student.yearLevel.startsWith("Academic Track")
          ) {
            resolvedTrackType = "Academic Track";
          } else if (
            student.yearLevel === "Technical Professional Track" ||
            student.yearLevel.startsWith("Technical Professional Track")
          ) {
            resolvedTrackType = "Technical Professional Track";
          }
        }

        if (
          !resolvedSpecialization &&
          student.yearLevel.startsWith("Academic Track - ")
        ) {
          resolvedSpecialization = student.yearLevel.replace(
            "Academic Track - ",
            "",
          );
        } else if (
          !resolvedSpecialization &&
          student.yearLevel.startsWith("Technical Professional Track - ")
        ) {
          resolvedSpecialization = student.yearLevel.replace(
            "Technical Professional Track - ",
            "",
          );
        }

        if (
          student.yearLevel === "Academic Track" ||
          student.yearLevel === "Technical Professional Track" ||
          student.yearLevel.startsWith("Academic Track - ") ||
          student.yearLevel.startsWith("Technical Professional Track - ")
        ) {
          resolvedYearLevel = "";
        }

        setEditingStudent(student);
        setFormData({
          ...student,
          yearLevel: resolvedYearLevel,
          shsTrackType: resolvedTrackType,
          strandOrCourse: resolvedSpecialization,
        });
        setShsTrackType(resolvedTrackType);
        setProgramSpecialization(resolvedSpecialization);
      } else {
        setEditingStudent(student);
        setFormData(student);
        if (student.program === "College") {
          setShsTrackType("");
          setProgramSpecialization(
            student.strandOrCourse || "BS ENTREPRENEURSHIP",
          );
        } else {
          setShsTrackType("");
          setProgramSpecialization("");
        }
      }
    } else {
      const nextStudentId = await generateNextStudentId();
      setEditingStudent(null);
      setFormData({
        id: nextStudentId,
        name: "",
        program: "",
        yearLevel: "",
        shsTrackType: "",
        strandOrCourse: "",
        documentSubmitted: "",
        contact: "",
        email: "",
        address: "",
        status: "Incomplete",
        branch: currentBranch,
        studentStatus: "",
        guardianName: "",
        guardianContact: "",
      });
      setShsTrackType("");
      setProgramSpecialization("");
    }
    setFormErrors({});
    setIsAddEditModalOpen(true);
  };

  // Handle form change
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "program") {
      if (value === "SHS") {
        setFormData((prev) => ({
          ...prev,
          program: value,
          yearLevel: "",
          shsTrackType: "",
          strandOrCourse: "",
        }));
        setShsTrackType("");
        setProgramSpecialization("");
      } else if (value === "College") {
        setFormData((prev) => ({
          ...prev,
          program: value,
          yearLevel: "",
          shsTrackType: "",
          strandOrCourse: "",
        }));
        setShsTrackType("");
        setProgramSpecialization("");
      } else {
        setFormData((prev) => ({
          ...prev,
          program: value,
          yearLevel: prev.yearLevel || "",
          shsTrackType: "",
          strandOrCourse: "",
        }));
        setShsTrackType("");
        setProgramSpecialization("");
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next[name as keyof Student];
      return next;
    });
  };

  const handleShsTrackTypeChange = (value: string) => {
    setShsTrackType(value);
    setProgramSpecialization("");
    setFormData((prev) => ({
      ...prev,
      shsTrackType: value,
      strandOrCourse: "",
    }));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.yearLevel;
      return next;
    });
  };

  const handleProgramSpecializationChange = (value: string) => {
    setProgramSpecialization(value);
    setFormData((prev) => ({ ...prev, strandOrCourse: value }));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.yearLevel;
      return next;
    });
  };

  const handleCollegeYearLevelChange = (value: string) => {
    setFormData((prev) => ({ ...prev, yearLevel: value }));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.yearLevel;
      return next;
    });
  };

  // Submit add/edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const normalizedStudent: Student = {
      ...formData,
      branch: formData.branch || editingStudent?.branch || currentBranch,
    };
    const didChangeLoginEmail =
      normalizeComparableText(normalizedStudent.email) !==
      normalizeComparableText(editingStudent?.email);

    try {
      let savedStudent = normalizedStudent;
      let syncFailed = false;

      try {
        savedStudent = (await saveAdminStudent(normalizedStudent)) as Student;
      } catch (syncError) {
        console.warn(
          "Falling back to local student storage for save because Supabase sync failed.",
          syncError,
        );
        if (didChangeLoginEmail) {
          try {
            savedStudent = (await updateAdminStudentEmail({
              branch: normalizedStudent.branch,
              studentNumber: normalizedStudent.id,
              trackingNumber: normalizedStudent.trackingNumber,
              email: normalizedStudent.email,
            })) as Student;
            syncFailed = false;
          } catch (emailSyncError) {
            throw new Error(
              emailSyncError instanceof Error
                ? emailSyncError.message
                : syncError instanceof Error
                  ? syncError.message
                  : "Email changes must be saved to Supabase before the student can use that email to log in.",
            );
          }
        } else {
          syncFailed = true;
        }
      }

      const mergedSavedStudent = {
        ...savedStudent,
        ...mergeStudentOwnScheduleState(savedStudent, editingStudent || normalizedStudent),
      };

      setStudents((prev) =>
        editingStudent
          ? prev.map((student) =>
              studentsMatch(student, editingStudent) ? mergedSavedStudent : student,
            )
          : [
              mergedSavedStudent,
              ...prev.filter((student) => !studentsMatch(student, mergedSavedStudent)),
            ],
      );
      setIsAddEditModalOpen(false);

      if (syncFailed) {
        setStudentRecoveryMessage(
          "Student changes were saved only on this device because Supabase sync failed.",
        );
      } else {
        setStudentRecoveryMessage(null);
      }
    } catch (error) {
      console.error("Failed to save student", error);
      const message =
        error instanceof Error ? error.message : "Unable to save student.";
      showSystemAlert("Unable to Save Student", message);
    }
  };

  // Open archive modal
  const openArchiveConfirm = (id: string) => {
    setStudentToArchive(id);
    setIsArchiveModalOpen(true);
  };

  const confirmArchive = async () => {
    if (!studentToArchive) {
      setIsArchiveModalOpen(false);
      return;
    }

    const student = students.find((record) => record.id === studentToArchive);
    const archiveStudentLocally = () => {
      if (student) {
        forgetDeletedStoredStudent({
          branch: student.branch || currentBranch,
          id: student.id,
          trackingNumber: student.trackingNumber,
          name: student.name,
        });
        persistArchivedStudentsLocally(currentBranch, [student]);
      }

      setStudents((prev) =>
        prev.filter((record) => record.id !== studentToArchive),
      );
      setIsArchiveModalOpen(false);
      setStudentToArchive(null);
    };

    try {
      if (student) {
        await updateAdminStudentStatus({
          branch: student.branch || currentBranch,
          studentNumber: student.id,
          status: "Archived",
        });
      }

      archiveStudentLocally();
    } catch (error) {
      console.warn(
        "Unable to sync archived student to Supabase. Keeping the archived state on this device only.",
        error,
      );
      archiveStudentLocally();
      setStudentRecoveryMessage(
        "Student was archived only on this device because Supabase sync failed.",
      );
    }
  };

  const cancelArchive = () => {
    setIsArchiveModalOpen(false);
    setStudentToArchive(null);
  };

  const archiveSelectedStudents = async (studentsToArchive: Student[]) => {
    const archivedStudentIds: string[] = [];
    const failedStudents: string[] = [];

    for (const student of studentsToArchive) {
      try {
        forgetDeletedStoredStudent({
          branch: student.branch || currentBranch,
          id: student.id,
          trackingNumber: student.trackingNumber,
          name: student.name,
        });

        try {
          await updateAdminStudentStatus({
            branch: student.branch || currentBranch,
            studentNumber: student.id,
            status: "Archived",
          });
        } catch (error) {
          console.warn(
            "Unable to sync archived student to Supabase. Keeping the archived state on this device only.",
            error,
          );
        }

        archivedStudentIds.push(student.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to move to archive.";
        failedStudents.push(`${student.name}: ${message}`);
      }
    }

    if (archivedStudentIds.length > 0) {
      persistArchivedStudentsLocally(
        currentBranch,
        studentsToArchive.filter((student) =>
          archivedStudentIds.includes(student.id),
        ),
      );
      setStudents((prev) =>
        prev.filter((student) => !archivedStudentIds.includes(student.id)),
      );
      setSelectedStudentIds((prev) =>
        prev.filter((studentId) => !archivedStudentIds.includes(studentId)),
      );
      setStudentRecoveryMessage(
        `Moved ${archivedStudentIds.length} student${archivedStudentIds.length === 1 ? "" : "s"} to archive.`,
      );
    }

    if (failedStudents.length > 0) {
      showSystemAlert(
        "Some Students Were Not Archived",
        failedStudents.join("\n"),
      );
    }
  };

  const openViewModal = (student: Student) => {
    setGradeSchoolYearFilter("all");
    setGradeSemesterFilter("all");
    setGradeSearchTerm("");
    setGradeEditState(null);
    setGradeEditFeedback(null);
    setGradeManagementFeedback(null);
    setPaymentAmount("");
    setPaymentReceiptNumber(
      buildNextReceiptNumber(student.branch || currentBranch),
    );
    setPaymentDate(getTodayInputDate());
    setPaymentNotes("");
    setPaymentFeedback(null);
    setViewingStudent(student);
    const branch = student.branch || currentBranch;
    void fetchAndCacheStudentPaymentsForBranch(branch)
      .then(() => fetchNextStudentPaymentReceiptNumber(branch))
      .then(setPaymentReceiptNumber)
      .then(() =>
        setPaymentRecordsVersion((previousValue) => previousValue + 1),
      )
      .catch((error) => {
        setPaymentFeedback({
          type: "warning",
          message:
            error instanceof Error
              ? error.message
              : "Unable to load the payment ledger from Supabase.",
        });
      });
  };

  const closeViewModal = () => {
    setViewingStudent(null);
    setPendingScholarshipScore("");
    setScholarshipScoreFeedback(null);
    setCredentialActionFeedback(null);
    setCredentialActionKey(null);
    setGradeSchoolYearFilter("all");
    setGradeSemesterFilter("all");
    setGradeSearchTerm("");
    setGradeEditState(null);
    setGradeEditFeedback(null);
    setGradeManagementFeedback(null);
    setPaymentAmount("");
    setPaymentReceiptNumber("");
    setPaymentDate(getTodayInputDate());
    setPaymentNotes("");
    setPaymentFeedback(null);
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((prev) => {
      const matchingStudent = students.find((student) => student.id === studentId);
      if (!matchingStudent || !isStudentSelectableForBulkActions(matchingStudent)) {
        return prev;
      }

      return prev.includes(studentId)
        ? prev.filter((value) => value !== studentId)
        : [...prev, studentId];
    });
  };

  const toggleVisibleStudentSelection = () => {
    setSelectedStudentIds((prev) =>
      areAllVisibleStudentsSelected
        ? prev.filter((studentId) => !visibleStudentIds.includes(studentId))
        : Array.from(new Set([...prev, ...visibleStudentIds])),
    );
  };

  const handleApplyScholarshipScore = async () => {
    if (!viewingStudent || !viewingStudentApplicantRecord?.trackingNumber) {
      return;
    }

    const trimmedScore = pendingScholarshipScore.trim();
    const parsedScore = Number(trimmedScore);

    if (
      trimmedScore === "" ||
      !Number.isFinite(parsedScore) ||
      parsedScore < 0 ||
      parsedScore > SCHOLARSHIP_EXAM_MAX_SCORE
    ) {
      setScholarshipScoreFeedback({
        type: "warning",
        message: `Enter a scholarship exam score from 0 to ${SCHOLARSHIP_EXAM_MAX_SCORE}.`,
      });
      return;
    }

    setIsSavingScholarshipScore(true);
    let syncFailed = false;

    try {
      try {
        await updateAdmissionProgress({
          trackingNumber: viewingStudentApplicantRecord.trackingNumber,
          currentStep: 4,
          applicationStatus: "accepted",
          scholarshipExamScore: parsedScore,
        });
      } catch (error) {
        console.warn(
          "Unable to sync scholarship exam score to Supabase, keeping local student state.",
          error,
        );
        syncFailed = true;
      }

      const resolvedBranch = viewingStudent.branch || currentBranch;
      const storedEnrollees =
        readBranchScopedData<AdminEnrolleeRecord[]>(
          ENROLLEE_STORAGE_SCOPE,
          resolvedBranch,
        ) ?? [];
      let didUpdateLinkedRecord = false;
      let appliedExamDiscountPercentage = 0;
      let appliedDiscountPercentage = 0;

      const nextEnrollees = storedEnrollees.map((record) => {
        const matchesRecord =
          record.trackingNumber === viewingStudentApplicantRecord.trackingNumber ||
          (viewingStudent.id && record.studentNumber === viewingStudent.id);

        if (!matchesRecord) {
          return record;
        }

        didUpdateLinkedRecord = true;
        const tuitionEstimate = getEstimatedCollegeTuition({
          honorLabel: record.honorLabel,
          honorCertificateApproved: hasApprovedAttachmentNamed(
            record.attachments,
            "Honor Certificate",
          ),
          appliedForScholarship: true,
          scholarshipExamScore: parsedScore,
        });
        appliedExamDiscountPercentage =
          tuitionEstimate.scholarshipExamDiscountPercentage;
        appliedDiscountPercentage = tuitionEstimate.effectiveDiscountPercentage;

        return {
          ...record,
          appliedForScholarship: true,
          scholarshipExamScore: parsedScore,
          honorDiscountPercentage: tuitionEstimate.honorDiscountPercentage,
          effectiveDiscountPercentage: tuitionEstimate.effectiveDiscountPercentage,
          effectiveDiscountSource: tuitionEstimate.effectiveDiscountSource,
        };
      });

      if (!didUpdateLinkedRecord) {
        throw new Error("No linked admission record was found for this student.");
      }

      writeBranchScopedData(ENROLLEE_STORAGE_SCOPE, resolvedBranch, nextEnrollees);
      setStudents((prev) => [...prev]);
      setScholarshipScoreFeedback(
        syncFailed
          ? {
              type: "warning",
              message:
                "Scholarship exam score updated locally. Supabase sync failed, so you can retry anytime.",
            }
          : {
              type: "success",
              message: `Scholarship exam score updated. Exam discount: ${appliedExamDiscountPercentage}%. Applied discount: ${appliedDiscountPercentage}%.`,
            },
      );
    } catch (error) {
      console.error("Failed to update scholarship exam score", error);
      setScholarshipScoreFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to update scholarship exam score.",
      });
    } finally {
      setIsSavingScholarshipScore(false);
    }
  };

  const handleAdminCredentialUpload = (requirement: {
    code: string;
    name: string;
  }) => {
    if (!viewingStudent || !viewingStudentApplicantRecord?.trackingNumber) {
      setCredentialActionFeedback({
        type: "error",
        message: "No linked admission record was found for this student.",
      });
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }

      const actionKey = `upload:${requirement.code}`;
      setCredentialActionKey(actionKey);
      setCredentialActionFeedback(null);

      try {
        const uploadResult = await uploadAdmissionRequirementFile({
          trackingNumber: viewingStudentApplicantRecord.trackingNumber,
          requirementCode: requirement.code,
          requirementName: requirement.name,
          file,
        });

        await syncStudentCredentialUpload({
          branch: viewingStudent.branch || currentBranch,
          trackingNumber: viewingStudentApplicantRecord.trackingNumber,
          studentNumber: viewingStudent.id,
          requirementName: requirement.name,
          mimeType: file.type,
          storagePath: uploadResult.storagePath,
          reviewStatus: "Approved",
        });

        setStudents((prev) => [...prev]);
        setCredentialActionFeedback({
          type: "success",
          message: `${requirement.name} uploaded successfully.`,
        });
      } catch (error) {
        console.error("Failed to upload student credential", error);
        setCredentialActionFeedback({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to upload the credential right now.",
        });
      } finally {
        setCredentialActionKey(null);
      }
    };

    input.click();
  };

  const handleAdminCredentialRemove = (requirementName: string) => {
    if (!viewingStudent || !viewingStudentApplicantRecord?.trackingNumber) {
      setCredentialActionFeedback({
        type: "error",
        message: "No linked admission record was found for this student.",
      });
      return;
    }

    const shouldRemove = window.confirm(
      `Remove ${requirementName} from this student's credentials?`,
    );
    if (!shouldRemove) {
      return;
    }

    const actionKey = `remove:${requirementName}`;
    setCredentialActionKey(actionKey);
    setCredentialActionFeedback(null);

    const updatedRecord = removeStudentCredentialUpload({
      branch: viewingStudent.branch || currentBranch,
      trackingNumber: viewingStudentApplicantRecord.trackingNumber,
      studentNumber: viewingStudent.id,
      requirementName,
    });

    if (!updatedRecord) {
      setCredentialActionFeedback({
        type: "error",
        message: "Unable to remove the credential from this student.",
      });
    } else {
      setStudents((prev) => [...prev]);
      setCredentialActionFeedback({
        type: "success",
        message: `${requirementName} removed successfully.`,
      });
    }

    setCredentialActionKey(null);
  };

  const handleCloseGradeEditor = () => {
    setGradeEditState(null);
    setGradeEditFeedback(null);
  };

  const handleOpenCollegeGradeEditor = (record: StoredStudentGradeRecord) => {
    if (!viewingStudent) {
      return;
    }

    setGradeManagementFeedback(null);
    setGradeEditFeedback(null);
    setGradeEditState({
      title: "Edit Uploaded Grade",
      subtitle: `${record.subjectCode} - ${record.subjectTitle} | ${record.academicYear} | ${record.semester}`,
      branch: viewingStudent.branch || currentBranch,
      studentId: record.studentId,
      fullName: record.fullName,
      subjectCode: record.subjectCode,
      subjectTitle: record.subjectTitle,
      programType: record.programType,
      academicYear: record.academicYear,
      semester: record.semester,
      unit: record.units != null ? String(record.units) : "",
      fields: [
        {
          key: record.id,
          label: record.gradingPeriod,
          gradingPeriod: record.gradingPeriod,
          semester: record.semester,
          value: record.grade,
          existingRecord: record,
        },
      ],
    });
  };

  const handleOpenShsGradeEditor = ({
    academicYear,
    semester,
    row,
    records,
  }: {
    academicYear: string;
    semester: string;
    row: ShsGradeSummaryRow;
    records: StoredStudentGradeRecord[];
  }) => {
    if (!viewingStudent) {
      return;
    }

    const editableQuarterLabels = getEditableShsQuarterLabels(semester);
    const recordByPeriod = new Map(
      records.map((record) => [record.gradingPeriod, record] as const),
    );

    setGradeManagementFeedback(null);
    setGradeEditFeedback(null);
    setGradeEditState({
      title: "Edit Uploaded Grades",
      subtitle: `${row.subjectCode} - ${row.subjectTitle} | ${academicYear} | ${semester}`,
      branch: viewingStudent.branch || currentBranch,
      studentId: viewingStudent.id,
      fullName: viewingStudent.name,
      subjectCode: row.subjectCode,
      subjectTitle: row.subjectTitle,
      programType: "SHS",
      academicYear,
      semester,
      unit: "",
      fields: editableQuarterLabels.map((quarterLabel) => {
        const existingRecord = recordByPeriod.get(quarterLabel) ?? null;

        return {
          key: `${row.key}::${quarterLabel}`,
          label: quarterLabel,
          gradingPeriod: quarterLabel,
          semester: "",
          value: existingRecord?.grade || "",
          existingRecord,
        };
      }),
    });
  };

  const handleGradeEditFieldChange = (fieldKey: string, nextValue: string) => {
    setGradeEditState((previousState) => {
      if (!previousState) {
        return previousState;
      }

      return {
        ...previousState,
        fields: previousState.fields.map((field) =>
          field.key === fieldKey ? { ...field, value: nextValue } : field,
        ),
      };
    });

    if (gradeEditFeedback) {
      setGradeEditFeedback(null);
    }

    if (gradeManagementFeedback) {
      setGradeManagementFeedback(null);
    }
  };

  const handleSaveGradeEdit = () => {
    if (!gradeEditState) {
      return;
    }

    setIsSavingGradeEdit(true);
    setGradeEditFeedback(null);

    try {
      const updatedAt = new Date().toISOString();
      const operations: StudentGradeUploadOperation[] = [];

      for (const field of gradeEditState.fields) {
        const trimmedValue = field.value.trim();
        const currentValue = field.existingRecord?.grade.trim() ?? "";

        if (trimmedValue === currentValue) {
          continue;
        }

        if (!field.existingRecord && trimmedValue === "") {
          continue;
        }

        const validationResult = validateAndNormalizeUploadedGradeRow(
          {
            studentId: gradeEditState.studentId,
            fullName: gradeEditState.fullName,
            subjectCode: gradeEditState.subjectCode,
            subjectTitle: gradeEditState.subjectTitle,
            grade: trimmedValue,
            unit: gradeEditState.unit,
            gradingPeriod: field.gradingPeriod,
            programType: gradeEditState.programType,
            academicYear: gradeEditState.academicYear,
            semester: field.semester,
            branch: gradeEditState.branch,
          },
          updatedAt,
          { allowBlankGradeClear: true },
        );

        if (validationResult.errorReason) {
          setGradeEditFeedback({
            type: "warning",
            message: `${field.label}: ${validationResult.errorReason}.`,
          });
          setIsSavingGradeEdit(false);
          return;
        }

        if (validationResult.normalizedRecord) {
          operations.push({
            type: "upsert",
            record: validationResult.normalizedRecord,
          });
        } else if (validationResult.clearRecordIdentity) {
          operations.push({
            type: "clear",
            identity: validationResult.clearRecordIdentity,
          });
        }
      }

      if (operations.length === 0) {
        setGradeEditFeedback({
          type: "warning",
          message: "No grade changes were detected.",
        });
        return;
      }

      applyStudentGradeUploadOperationsForBranch(gradeEditState.branch, operations);
      setGradeEditState(null);
      setGradeManagementFeedback({
        type: "success",
        message:
          operations.length === 1
            ? "Grade updated successfully."
            : `${operations.length} grade changes saved successfully.`,
      });
    } catch (error) {
      console.error("Failed to update student grades", error);
      setGradeEditFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to update the selected grade right now.",
      });
    } finally {
      setIsSavingGradeEdit(false);
    }
  };

  const handleRemoveGradeRecords = ({
    branch,
    records,
    summaryLabel,
  }: {
    branch: string;
    records: StoredStudentGradeRecord[];
    summaryLabel: string;
  }) => {
    if (records.length === 0) {
      setGradeManagementFeedback({
        type: "warning",
        message: "No saved grades were found for the selected row.",
      });
      return;
    }

    const shouldRemove = window.confirm(
      `Remove ${records.length} saved grade${
        records.length === 1 ? "" : "s"
      } for ${summaryLabel}?\n\nThis action will update the student's academic standing if needed.`,
    );

    if (!shouldRemove) {
      return;
    }

    try {
      applyStudentGradeUploadOperationsForBranch(
        branch,
        records.map((record) => ({
          type: "clear" as const,
          identity: buildGradeClearIdentityFromRecord(record),
        })),
      );
      setGradeEditState((previousState) => {
        if (!previousState) {
          return previousState;
        }

        const isEditingRemovedSubject =
          previousState.subjectCode === records[0].subjectCode &&
          previousState.academicYear === records[0].academicYear &&
          previousState.semester === records[0].semester;

        return isEditingRemovedSubject ? null : previousState;
      });
      setGradeEditFeedback(null);
      setGradeManagementFeedback({
        type: "success",
        message:
          records.length === 1
            ? "Grade removed successfully."
            : `${records.length} grades removed successfully.`,
      });
    } catch (error) {
      console.error("Failed to remove student grades", error);
      setGradeManagementFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to remove the selected grade right now.",
      });
    }
  };

  const moveStudentsToAlumni = async (studentsToMove: Student[]) => {
    const movedStudentIds: string[] = [];
    const failedStudents: string[] = [];
    const createdAlumniRecords: AlumniBackupRecord[] = [];
    const locallyCachedStudents: string[] = [];
    const graduationYear = getCurrentGraduationYear();

    for (const student of studentsToMove) {
      try {
        let createdAlumni: ApiAlumniRecord | null = null;

        try {
          const createResponse = await fetch(ALUMNI_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              student_id: student.id,
              full_name: student.name,
              program: student.strandOrCourse || student.program,
              year_graduated: graduationYear,
              contact: student.contact || "",
            }),
          });

          if (!createResponse.ok) {
            const errorData = await createResponse.json().catch(() => ({}));
            const firstError = Object.values(errorData).find((value) =>
              Array.isArray(value),
            ) as string[] | undefined;
            throw new Error(
              firstError?.[0] ||
                errorData?.detail ||
                "Failed to add alumni record.",
            );
          }

          createdAlumni = (await createResponse
            .json()
            .catch(() => null)) as ApiAlumniRecord | null;
        } catch (error) {
          console.warn(
            "Unable to create alumni record in backend. Saving locally instead.",
            error,
          );
          createdAlumni = buildLocalAlumniRecord(student);
          locallyCachedStudents.push(student.name);
        }

        rememberAlumniStudentStatus(student.id, student.status);
        movedStudentIds.push(student.id);
        createdAlumniRecords.push(buildAlumniBackupRecord(student, createdAlumni));

        try {
          await updateAdminStudentStatus({
            branch: student.branch || currentBranch,
            studentNumber: student.id,
            status: "Graduated",
          });
        } catch (statusError) {
          console.warn(
            "Unable to mark alumni student as graduated in Supabase. The local alumni record will still block student portal access on this device.",
            statusError,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to move to alumni.";
        failedStudents.push(`${student.name}: ${message}`);
      }
    }

    if (movedStudentIds.length > 0) {
      setStudents((prev) =>
        prev.filter((student) => !movedStudentIds.includes(student.id)),
      );
      writeStoredStudents(
        readStoredStudents().filter(
          (student) => !movedStudentIds.includes(student.id),
        ),
      );
      setSelectedStudentIds((prev) =>
        prev.filter((studentId) => !movedStudentIds.includes(studentId)),
      );
      persistAlumniBackupCache(
        mergeAlumniBackupRecords(readCachedAlumni(), createdAlumniRecords),
      );
      const movedLabel = `Moved ${movedStudentIds.length} student${movedStudentIds.length === 1 ? "" : "s"} to alumni.`;
      const cachedLabel =
        locallyCachedStudents.length > 0
          ? ` ${locallyCachedStudents.length} ${locallyCachedStudents.length === 1 ? "record was" : "records were"} saved locally because the alumni backend is unavailable.`
          : "";
      const failedLabel =
        failedStudents.length > 0
          ? ` ${failedStudents.length} could not be moved.`
          : "";
      setStudentRecoveryMessage(`${movedLabel}${cachedLabel}${failedLabel}`);

      if (viewingStudent && movedStudentIds.includes(viewingStudent.id)) {
        closeViewModal();
      }
    }

    if (failedStudents.length > 0) {
      showSystemAlert("Some Students Were Not Moved", failedStudents.join("\n"));
    }

    return movedStudentIds.length;
  };

  const handleMoveSelectedStudentsToAlumni = async () => {
    if (alumniEligibleSelectedStudents.length === 0) {
      showSystemAlert(
        "Cannot Move to Alumni",
        "Only Grade 12 SHS and 4th Year College students can be moved to alumni.",
      );
      return;
    }

    const ineligibleCount =
      selectedStudents.length - alumniEligibleSelectedStudents.length;
    const ineligibleNote =
      ineligibleCount > 0
        ? `\n\n${ineligibleCount} selected student${ineligibleCount === 1 ? "" : "s"} will be skipped because only Grade 12 SHS and 4th Year College students can be moved to alumni.`
        : "";
    const shouldContinue = window.confirm(
      `Move ${alumniEligibleSelectedStudents.length} selected student${alumniEligibleSelectedStudents.length === 1 ? "" : "s"} to alumni?${ineligibleNote}`,
    );
    if (!shouldContinue) {
      return;
    }

    setIsBulkMovingToAlumni(true);

    try {
      await moveStudentsToAlumni(alumniEligibleSelectedStudents);
    } finally {
      setIsBulkMovingToAlumni(false);
    }
  };

  const handleMoveSelectedStudentsToArchive = async () => {
    if (selectedStudents.length === 0) {
      return;
    }

    const shouldContinue = window.confirm(
      `Move ${selectedStudents.length} selected student${selectedStudents.length === 1 ? "" : "s"} to archive?`,
    );
    if (!shouldContinue) {
      return;
    }

    setIsBulkArchiving(true);

    try {
      await archiveSelectedStudents(selectedStudents);
    } finally {
      setIsBulkArchiving(false);
    }
  };

  const getStudentStatusClassName = (status: Student["status"]) => {
    if (status === "Complete") return "students-status-complete";
    if (status === "Archived" || status === "Graduated") return "students-status-archived";
    return "students-status-incomplete";
  };

  const getStudentLifecycleStatusClassName = (status: StudentLifecycleStatus) => {
    if (status === "Dropped") {
      return "students-lifecycle-status-dropped";
    }

    return "students-lifecycle-status-undergraduate";
  };

  const getAcademicStandingClassName = (standing: "Regular" | "Irregular") =>
    standing === "Irregular"
      ? "students-regularity-irregular"
      : "students-regularity-regular";

  const viewingStudentRequirements = viewingStudent
    ? getStudentRequirementSnapshot({
        branch: viewingStudent.branch || currentBranch,
        studentNumber: viewingStudent.id,
        trackingNumber: viewingStudent.trackingNumber,
      })
    : null;
  const viewingStudentProgram = viewingStudent?.program || "";
  const isViewingCollegeStudent = viewingStudentProgram === "College";
  const viewingStudentAcademicStanding = viewingStudent
    ? studentAcademicStandingById[viewingStudent.id] ||
      getStudentAcademicStanding({
        branch: viewingStudent.branch || currentBranch,
        program: viewingStudent.program,
        studentId: viewingStudent.id,
      })
    : null;
  const viewingStudentAcademicStandingLabel = getDisplayedAcademicStandingLabel(
    viewingStudent,
    viewingStudentAcademicStanding?.label,
  );
  const viewingStudentIrregularEnrollmentRequest = viewingStudent
    ? getLatestApprovedIrregularEnrollmentRequestForStudent({
        branch: viewingStudent.branch || currentBranch,
        studentNumber: viewingStudent.id,
        trackingNumber: viewingStudent.trackingNumber,
      })
    : null;
  const viewingStudentOwnScheduleReason = hasRequestedOwnSchedule(viewingStudent)
    ? hasApprovedOwnSchedule(viewingStudent)
      ? "This student was approved for own-schedule admission and is treated as irregular while the customized load is being managed."
      : "This student requested an own schedule and is treated as irregular while the schedule workflow is still being managed."
    : viewingStudentIrregularEnrollmentRequest?.irregularRequest?.mode ===
        "section_assignment"
      ? "This student has an approved irregular enrollment request and is treated as irregular for the current term."
    : "";
  const viewingStudentScheduleRequest = viewingStudent
    ? studentScheduleRequests.find(
        (request) =>
          request.studentNumber === viewingStudent.id ||
          (request.trackingNumber &&
            request.trackingNumber === viewingStudent.trackingNumber),
      ) ?? null
    : null;
  const viewingStudentGradeRecords = useMemo(
    () =>
      viewingStudent
        ? getStudentGradeRecords({
            branch: viewingStudent.branch || currentBranch,
            studentId: viewingStudent.id,
          })
        : [],
    [currentBranch, gradeRecordsVersion, viewingStudent],
  );
  const viewingStudentGradeTriggerIds = useMemo(
    () =>
      new Set(
        viewingStudentAcademicStanding?.triggerGrades.map((grade) => grade.id) ??
          [],
      ),
    [viewingStudentAcademicStanding],
  );
  const viewingStudentGradeSchoolYearOptions = Array.from(
    new Set(
      viewingStudentGradeRecords
        .map((record) => record.academicYear)
        .filter(Boolean),
    ),
  ).sort();
  const viewingStudentGradeSemesterOptions = Array.from(
    new Set(
      viewingStudentGradeRecords
        .map((record) => record.semester)
        .filter(Boolean),
    ),
  ).sort(
    (left, right) =>
      getSemesterOrderIndex(left) - getSemesterOrderIndex(right) ||
      left.localeCompare(right),
  );
  const normalizedGradeSearchTerm = gradeSearchTerm.trim().toLowerCase();
  const filteredViewingStudentGradeRecords = useMemo(
    () =>
      viewingStudentGradeRecords.filter((record) => {
        const matchesSchoolYear =
          gradeSchoolYearFilter === "all" ||
          record.academicYear === gradeSchoolYearFilter;
        const matchesSemester =
          gradeSemesterFilter === "all" || record.semester === gradeSemesterFilter;
        const matchesSearch =
          !normalizedGradeSearchTerm ||
          getGradeSearchHaystack(record).includes(normalizedGradeSearchTerm);

        return matchesSchoolYear && matchesSemester && matchesSearch;
      }),
    [
      gradeSchoolYearFilter,
      gradeSemesterFilter,
      normalizedGradeSearchTerm,
      viewingStudentGradeRecords,
    ],
  );
  const filteredViewingStudentGradeTerms = sortAcademicTerms(
    Array.from(
      new Map(
        filteredViewingStudentGradeRecords
          .filter(
            (record) => Boolean(record.academicYear) && Boolean(record.semester),
          )
          .map((record) => [
            buildGradeTermKey(record.academicYear, record.semester),
            {
              academicYear: record.academicYear,
              semester: record.semester,
            },
          ]),
      ).values(),
    ),
  );
  const viewingStudentApplicantRecord =
    viewingStudentRequirements?.applicantRecord ?? null;
  const viewingStudentCredentialRows = viewingStudentApplicantRecord
    ? getAdmissionRequirements(
        viewingStudentApplicantRecord.studentStatus,
        viewingStudentApplicantRecord.program === "SHS"
          ? "Senior High School"
          : "College",
        viewingStudentApplicantRecord.honorLabel || "No Honor",
      ).map((requirement) => {
        const attachment = viewingStudentApplicantRecord.attachments?.find(
          (item) =>
            item.name.trim().toLowerCase() ===
            requirement.name.trim().toLowerCase(),
        );
        const hasFile = Boolean(
          attachment?.reviewStatus !== "Rejected" &&
            attachment?.url &&
            attachment.url !== "#" &&
            attachment.url !== "",
        );

        return {
          ...requirement,
          attachment,
          hasFile,
          reviewStatus: hasFile
            ? attachment?.reviewStatus || "Pending"
            : "Pending",
        };
      })
    : [];
  const viewingStudentHonorLabel =
    !viewingStudentRequirements
      ? "No linked admission record"
      : !isViewingCollegeStudent
        ? "Not applicable"
        : viewingStudentApplicantRecord?.honorLabel || "No Honor";
  const viewingStudentHonorCertificateStatus =
    !viewingStudentRequirements
      ? "No linked admission record"
      : !isViewingCollegeStudent
        ? "Not applicable"
        : viewingStudentApplicantRecord?.honorLabel &&
            viewingStudentApplicantRecord.honorLabel !== "No Honor"
          ? hasSubmittedAttachmentNamed(
              viewingStudentRequirements.submittedAttachments,
              "Honor Certificate",
            )
            ? hasApprovedAttachmentNamed(
                viewingStudentRequirements.submittedAttachments,
                "Honor Certificate",
              )
              ? "Approved"
              : "Pending approval"
            : "Pending"
          : "Not required";
  const viewingStudentScholarshipStatus =
    !viewingStudentRequirements
      ? "No linked admission record"
      : !isViewingCollegeStudent
        ? "Not applicable"
        : viewingStudentApplicantRecord?.appliedForScholarship ||
            typeof viewingStudentApplicantRecord?.scholarshipExamScore === "number"
          ? "Applied"
          : "Not applied";
  const viewingStudentScholarshipScore =
    !viewingStudentRequirements
      ? "No linked admission record"
      : !isViewingCollegeStudent
        ? "Not applicable"
        : typeof viewingStudentApplicantRecord?.scholarshipExamScore === "number"
          ? String(viewingStudentApplicantRecord.scholarshipExamScore)
          : viewingStudentApplicantRecord?.appliedForScholarship
            ? "Awaiting result"
            : "Not applicable";
  const viewingStudentTuitionEstimate =
    isViewingCollegeStudent && viewingStudentApplicantRecord
      ? getEstimatedCollegeTuition({
          honorLabel: viewingStudentApplicantRecord.honorLabel,
          honorCertificateApproved: hasApprovedAttachmentNamed(
            viewingStudentApplicantRecord.attachments,
            "Honor Certificate",
          ),
          appliedForScholarship: Boolean(
            viewingStudentApplicantRecord.appliedForScholarship ||
              typeof viewingStudentApplicantRecord.scholarshipExamScore === "number",
          ),
          scholarshipExamScore: viewingStudentApplicantRecord.scholarshipExamScore,
        })
      : null;
  const viewingStudentScholarshipDiscount =
    viewingStudentTuitionEstimate?.scholarshipExamDiscountPercentage ?? 0;
  const viewingStudentPortalContext = useMemo(
    () => (viewingStudent ? resolveStudentPortalContext(viewingStudent) : null),
    [viewingStudent],
  );
  const viewingStudentCurrentTermSubjects = useMemo(() => {
    if (!viewingStudentPortalContext) {
      return [];
    }

    const { currentTerm, subjects: portalSubjects } = viewingStudentPortalContext;

    return portalSubjects.filter(
      (subject) =>
        subject.academicYear === currentTerm.academicYear &&
        subject.semester === currentTerm.semester,
    );
  }, [viewingStudentPortalContext]);
  const viewingStudentTotalUnits = viewingStudentCurrentTermSubjects.reduce(
    (sum, subject) => sum + (subject.units || 0),
    0,
  );
  const viewingStudentPayments = useMemo(
    () =>
      viewingStudent
        ? getStudentPayments({
            branch: viewingStudent.branch || currentBranch,
            studentNumber: viewingStudent.id,
            trackingNumber: viewingStudent.trackingNumber,
          })
        : [],
    [currentBranch, paymentRecordsVersion, viewingStudent],
  );
  const viewingStudentTotalAssessment =
    isViewingCollegeStudent && viewingStudentTotalUnits > 0
      ? viewingStudentTotalUnits *
        COLLEGE_TUITION_PER_UNIT *
        (1 - (viewingStudentTuitionEstimate?.effectiveDiscountPercentage ?? 0) / 100)
      : 0;
  const viewingStudentBalanceSummary = buildStudentBalanceSummary({
    totalAssessment: viewingStudentTotalAssessment,
    payments: viewingStudentPayments,
  });
  const canRecordViewingStudentPayment =
    Boolean(viewingStudent) && viewingStudentTotalAssessment > 0;
  const getPaymentStatusClassName = (
    status: typeof viewingStudentBalanceSummary.status,
  ) => {
    if (status === "Fully Paid") return "students-payment-status-paid";
    if (status === "Partial") return "students-payment-status-partial";
    return "students-payment-status-unpaid";
  };
  const canEditViewingStudentScholarshipScore =
    isViewingCollegeStudent &&
    Boolean(viewingStudent && viewingStudentApplicantRecord?.trackingNumber);
  const viewingStudentHasAdmissionAidDetails =
    isViewingCollegeStudent &&
    Boolean(viewingStudentApplicantRecord) &&
    Boolean(
      (viewingStudentApplicantRecord?.honorLabel &&
        viewingStudentApplicantRecord.honorLabel !== "No Honor") ||
        viewingStudentApplicantRecord?.appliedForScholarship ||
        typeof viewingStudentApplicantRecord?.scholarshipExamScore === "number",
    );
  useEffect(() => {
    if (!canEditViewingStudentScholarshipScore) {
      setPendingScholarshipScore("");
      setScholarshipScoreFeedback(null);
      return;
    }

    setPendingScholarshipScore(
      typeof viewingStudentApplicantRecord?.scholarshipExamScore === "number"
        ? String(viewingStudentApplicantRecord.scholarshipExamScore)
        : "",
    );
    setScholarshipScoreFeedback(null);
  }, [
    canEditViewingStudentScholarshipScore,
    viewingStudent?.id,
    viewingStudentApplicantRecord?.scholarshipExamScore,
  ]);

  const requirementNotifications: StudentRequirementNotification[] = students
    .filter(
      (student) =>
        student.status !== "Archived",
    )
    .map((student) => {
      const requirementSnapshot = getStudentRequirementSnapshot({
        branch: student.branch || currentBranch,
        studentNumber: student.id,
        trackingNumber: student.trackingNumber,
      });

      if (!requirementSnapshot) {
        return null;
      }

      const pendingReviewCount = requirementSnapshot.submittedAttachments.filter(
        (attachment) => attachment.reviewStatus === "Pending",
      ).length;

      if (pendingReviewCount === 0) {
        return null;
      }

      return {
        student,
        pendingReviewCount,
        submittedCount: requirementSnapshot.summary.submitted,
        pendingRequirementCount: requirementSnapshot.summary.pending,
        approvedCount: requirementSnapshot.summary.approved,
        rejectedCount: requirementSnapshot.summary.rejected,
        submittedAttachments: [...requirementSnapshot.submittedAttachments].sort(
          (left, right) =>
            getAttachmentReviewRank(left.reviewStatus) -
              getAttachmentReviewRank(right.reviewStatus) ||
            left.name.localeCompare(right.name),
        ),
      };
    })
    .filter(
      (
        notification,
      ): notification is StudentRequirementNotification => notification !== null,
    )
    .sort((left, right) => {
      if (right.pendingReviewCount !== left.pendingReviewCount) {
        return right.pendingReviewCount - left.pendingReviewCount;
      }

      return left.student.name.localeCompare(right.student.name);
    });
  const pendingNotificationCount = requirementNotifications.reduce(
    (total, notification) => total + notification.pendingReviewCount,
    0,
  );
  const pendingScheduleNotifications = useMemo<
    StudentScheduleSelectionNotification[]
  >(
    () =>
      studentScheduleRequests
        .filter((request) => request.status === "Pending")
        .map((request) => {
          const normalizedRequestStudentNumber = normalizeStudentNumberInput(
            request.studentNumber,
            currentBranch,
          );
          const student =
            students.find(
              (record) =>
                normalizeStudentNumberInput(record.id, currentBranch) ===
                  normalizedRequestStudentNumber ||
                (request.trackingNumber &&
                  record.trackingNumber === request.trackingNumber),
            ) ?? null;

          if (!student) {
            return null;
          }

          return {
            student,
            request,
            selectedCount: request.selections.length,
            totalUnits: request.selections.reduce(
              (sum, selection) => sum + (selection.units ?? 0),
              0,
            ),
            conflictCount: buildScheduledAssignmentConflicts(request.selections)
              .length,
          };
        })
        .filter(
          (
            notification,
          ): notification is StudentScheduleSelectionNotification =>
            notification !== null,
        )
        .sort((left, right) =>
          right.request.submittedAt.localeCompare(left.request.submittedAt),
        ),
    [currentBranch, studentScheduleRequests, students],
  );
  const pendingScheduleNotificationCount = pendingScheduleNotifications.length;

  const handleEditFromView = () => {
    if (!viewingStudent) return;
    const selectedStudent = viewingStudent;
    closeViewModal();
    void openAddEditModal(selectedStudent);
  };

  const handleAddStudentPayment = async () => {
    if (!viewingStudent) {
      return;
    }

    if (!canRecordViewingStudentPayment) {
      setPaymentFeedback({
        type: "warning",
        message: "No assessment is available for this student yet.",
      });
      return;
    }

    const parsedAmount = Number(paymentAmount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setPaymentFeedback({
        type: "warning",
        message: "Enter a valid payment amount greater than zero.",
      });
      return;
    }

    if (parsedAmount > viewingStudentBalanceSummary.currentBalance) {
      setPaymentFeedback({
        type: "warning",
        message: "Payment amount cannot exceed the current balance.",
      });
      return;
    }

    if (!paymentReceiptNumber.trim()) {
      setPaymentFeedback({
        type: "warning",
        message: "Receipt number is required.",
      });
      return;
    }

    if (!paymentDate) {
      setPaymentFeedback({
        type: "warning",
        message: "Payment date is required.",
      });
      return;
    }

    const branch = viewingStudent.branch || currentBranch;

    try {
      setIsSavingPayment(true);
      await createStudentPayment({
        branch,
        studentNumber: viewingStudent.id,
        trackingNumber: viewingStudent.trackingNumber,
        amount: parsedAmount,
        paidAt: new Date(`${paymentDate}T00:00:00`).toISOString(),
        encodedBy: loggedInUsername,
        encodedRole: loggedInRole,
        notes: paymentNotes,
      });

      setPaymentRecordsVersion((previousValue) => previousValue + 1);
      setPaymentAmount("");
      setPaymentReceiptNumber(
        await fetchNextStudentPaymentReceiptNumber(branch),
      );
      setPaymentDate(getTodayInputDate());
      setPaymentNotes("");
      setPaymentFeedback({
        type: "success",
        message: "Payment recorded and deducted from the student balance.",
      });
    } catch (error) {
      setPaymentFeedback({
        type: "warning",
        message:
          error instanceof Error
            ? error.message
            : "Unable to record the payment in Supabase.",
      });
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleRemoveStudentPayment = async (paymentId: string) => {
    if (!viewingStudent) {
      return;
    }

    const shouldRemove = window.confirm(
      "Remove this payment receipt from the student ledger?",
    );

    if (!shouldRemove) {
      return;
    }

    const branch = viewingStudent.branch || currentBranch;

    try {
      setIsSavingPayment(true);
      await removeStudentPayment({ branch, paymentId });
      setPaymentReceiptNumber(
        await fetchNextStudentPaymentReceiptNumber(branch),
      );
      setPaymentRecordsVersion((previousValue) => previousValue + 1);
      setPaymentFeedback({
        type: "success",
        message: "Payment receipt removed.",
      });
    } catch (error) {
      setPaymentFeedback({
        type: "warning",
        message:
          error instanceof Error
            ? error.message
            : "Unable to remove the payment receipt from Supabase.",
      });
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleOpenNotifications = () => {
    setIsNotificationModalOpen(true);
  };

  const handleCloseNotifications = () => {
    setIsNotificationModalOpen(false);
  };

  const handleOpenScheduleNotifications = () => {
    setIsScheduleNotificationModalOpen(true);
  };

  const handleCloseScheduleNotifications = () => {
    setIsScheduleNotificationModalOpen(false);
  };

  const handleOpenStudentFromNotification = (student: Student) => {
    handleCloseNotifications();
    handleCloseScheduleNotifications();
    openViewModal(student);
  };

  const handleNotificationRequirementDecision = ({
    student,
    requirementName,
    status,
  }: {
    student: Student;
    requirementName: string;
    status: NonNullable<AdminAttachment["reviewStatus"]>;
  }) => {
    const updatedRecord = updateStudentRequirementReviewStatus({
      branch: student.branch || currentBranch,
      trackingNumber: student.trackingNumber,
      studentNumber: student.id,
      requirementName,
      status,
    });

    if (!updatedRecord) {
      showSystemAlert(
        "Unable to Update Requirement",
        "Unable to update requirement review status.",
      );
      return;
    }

    setStudents((prev) => [...prev]);
  };

  const handleScheduleSelectionDecision = async (
    notification: StudentScheduleSelectionNotification,
    status: "Approved" | "Rejected",
  ) => {
    if (
      status === "Approved" &&
      buildScheduledAssignmentConflicts(notification.request.selections).length > 0
    ) {
      showSystemAlert(
        "Schedule Has Conflicts",
        "This submitted schedule still has conflicts. Ask the student to resubmit before approval.",
      );
      return;
    }

    const timestamp = new Date().toISOString();
    const nextRequests = studentScheduleRequests.map((request) =>
      request.id === notification.request.id
        ? {
            ...request,
            status,
            updatedAt: timestamp,
            reviewedAt: timestamp,
            reviewedByRole: loggedInRole,
          }
        : request,
    );

    setStudentScheduleRequests(nextRequests);
    writeBranchScopedData(
      STUDENT_SCHEDULE_REQUEST_SCOPE,
      currentBranch,
      nextRequests,
    );

    const updatedRequest =
      nextRequests.find((request) => request.id === notification.request.id) ||
      notification.request;

    if (status === "Approved") {
      const student = notification.student;
      const planKey = getStudentSubjectPlanKey(student);
      const existingPlan = studentSubjectPlans[planKey];
      const assignedSubjects: StudentSubjectPlanItem[] = Array.from(
        notification.request.selections.reduce((items, selection) => {
          const key = `${selection.subjectId}:${selection.subjectCode}`;
          if (!items.has(key)) {
            items.set(key, {
              subjectId: selection.subjectId,
              subjectCode: selection.subjectCode,
              subjectName: selection.subjectName,
              units: selection.units,
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

      const nextPlan: StudentSubjectPlanRecord = {
        id: planKey,
        trackingNumber: student.trackingNumber,
        studentNumber: student.id,
        semester: notification.request.semester,
        academicYear: notification.request.academicYear,
        assignedSubjects,
        creditedSubjects: existingPlan?.creditedSubjects ?? [],
        scheduledAssignments: notification.request.selections,
        notes:
          existingPlan?.notes ||
          "Approved from student own-schedule selection.",
        updatedAt: timestamp,
        source: "student_schedule_request",
      };

      setStudentSubjectPlans((prev) => ({
        ...prev,
        [planKey]: nextPlan,
      }));

      await saveStudentSubjectPlan(currentBranch, nextPlan);
    }

    updateStoredStudentOwnScheduleState({
      branch: notification.student.branch || currentBranch,
      studentNumber: notification.student.id,
      trackingNumber: notification.student.trackingNumber,
      updates: {
        requestedOwnSchedule: true,
        ownScheduleRequestStatus: "Approved",
        ownScheduleAcademicYear: notification.request.academicYear,
        ownScheduleSemester: notification.request.semester,
        ownScheduleSelectionStatus:
          status === "Approved" ? "Approved" : "Rejected",
      },
    });

    await saveStudentScheduleRequest(updatedRequest);
    await saveStudentPlanningState({
      branch: notification.student.branch || currentBranch,
      studentNumber: notification.student.id,
      trackingNumber: notification.student.trackingNumber,
      requestedOwnSchedule: true,
      ownScheduleRequestStatus: "Approved",
      ownScheduleAcademicYear: notification.request.academicYear,
      ownScheduleSemester: notification.request.semester,
      ownScheduleSelectionStatus:
        status === "Approved" ? "Approved" : "Rejected",
    });

    const refreshedStudents = getActiveStudentsForAdminList(currentBranch);
    setStudents(refreshedStudents);

    if (viewingStudent) {
      const refreshedViewingStudent =
        refreshedStudents.find(
          (student) =>
            student.id === viewingStudent.id ||
            (viewingStudent.trackingNumber &&
              student.trackingNumber === viewingStudent.trackingNumber),
        ) ?? null;
      setViewingStudent(refreshedViewingStudent);
    }

    showSystemAlert(
      status === "Approved"
        ? "Schedule Approved"
        : "Schedule Rejected",
      status === "Approved"
        ? "Student schedule approved and saved as the official load."
        : "Student schedule request rejected. The student can revise and submit again.",
    );
  };

  const getNotificationReviewStatusLabel = (
    reviewStatus?: AdminAttachment["reviewStatus"],
  ) => {
    if (reviewStatus === "Approved") {
      return "Approved";
    }

    if (reviewStatus === "Rejected") {
      return "Need Redo";
    }

    return "Pending Review";
  };

  const getShsTrackAndSpecialization = (student: Student) => {
    const trackTypeFromYearLevel =
      student.yearLevel === "Academic Track" ||
      student.yearLevel.startsWith("Academic Track")
        ? "Academic Track"
        : student.yearLevel === "Technical Professional Track" ||
            student.yearLevel.startsWith("Technical Professional Track")
          ? "Technical Professional Track"
          : "";

    const specializationFromYearLevel = student.yearLevel.startsWith(
      "Academic Track - ",
    )
      ? student.yearLevel.replace("Academic Track - ", "")
      : student.yearLevel.startsWith("Technical Professional Track - ")
        ? student.yearLevel.replace("Technical Professional Track - ", "")
        : "";

    const trackType = student.shsTrackType || trackTypeFromYearLevel;
    const specialization =
      student.strandOrCourse || specializationFromYearLevel;

    return { trackType, specialization };
  };

  const getShsTrackDisplay = (student: Student) => {
    const { trackType } = getShsTrackAndSpecialization(student);
    return trackType || "—";
  };

  const getShsSpecializationDisplay = (student: Student) => {
    const { specialization } = getShsTrackAndSpecialization(student);
    return specialization || "—";
  };

  const getShsYearLevelDisplay = (student: Student) => {
    if (
      student.yearLevel === "Academic Track" ||
      student.yearLevel === "Technical Professional Track" ||
      student.yearLevel.startsWith("Academic Track - ") ||
      student.yearLevel.startsWith("Technical Professional Track - ")
    ) {
      return "—";
    }

    return student.yearLevel || "—";
  };

  const handleExportStudents = () => {
    if (sortedStudents.length === 0) {
      showSystemAlert("Nothing to Export", "No students match the current filters.");
      return;
    }

    try {
      const exportedAt = new Date();
      const exportRows = sortedStudents.map((student) => {
        const requirementSnapshot = getStudentRequirementSnapshot({
          branch: student.branch || currentBranch,
          studentNumber: student.id,
          trackingNumber: student.trackingNumber,
        });
        const ownScheduleTerm = student.requestedOwnSchedule
          ? `${
              student.ownScheduleAcademicYear || "Academic year pending"
            } / ${student.ownScheduleSemester || "Semester pending"}`
          : "Not applicable";

        return {
          "Student ID": student.id,
          "Full Name": student.name,
          "Academic Level": student.program,
          "Track / Course":
            student.program === "SHS"
              ? getShsTrackDisplay(student)
              : getStudentCourseDisplay(student),
          Specialization:
            student.program === "SHS"
              ? getShsSpecializationDisplay(student)
              : getStudentCourseDisplay(student),
          "Year Level":
            student.program === "SHS"
              ? getShsYearLevelDisplay(student)
              : student.yearLevel || "N/A",
          Section: student.section || "N/A",
          "Requirement Status": student.status,
          "Academic Standing": getStudentAcademicStandingLabel(student),
          "Admission Type": getAdmissionTypeLabel(student.studentStatus),
          Branch: student.branch || currentBranch,
          "Tracking Number": student.trackingNumber || "",
          "Document Submitted": student.documentSubmitted || "Not submitted",
          "Requirements Submitted": requirementSnapshot?.summary.submitted ?? 0,
          "Requirements Pending": requirementSnapshot?.summary.pending ?? 0,
          "Requirements Approved": requirementSnapshot?.summary.approved ?? 0,
          "Requirements Rejected": requirementSnapshot?.summary.rejected ?? 0,
          "Own Schedule Admission": student.requestedOwnSchedule
            ? student.ownScheduleRequestStatus || "Requested"
            : "Standard",
          "Schedule Selection": student.requestedOwnSchedule
            ? getOwnScheduleSelectionLabel(student.ownScheduleSelectionStatus)
            : "Not applicable",
          "Own Schedule Term": ownScheduleTerm,
          Contact: student.contact || "Not provided",
          Email: student.email || "Not provided",
          Address: student.address || "Not provided",
        };
      });

      const workbook = XLSX.utils.book_new();
      const studentsSheet = XLSX.utils.json_to_sheet(exportRows);
      const filtersSheet = XLSX.utils.aoa_to_sheet([
        ["Branch", currentBranch],
        ["Exported By", `${loggedInUsername} (${loggedInRole})`],
        ["Exported At", exportedAt.toLocaleString()],
        ["Visible Students", sortedStudents.length],
        ["Search", searchTerm.trim() || "All"],
        ["Academic Level Filter", filterProgram],
        ["Year Level Filter", filterYearLevel || "All"],
        ["Section Filter", filterSection || "All"],
        ["Requirement Status Filter", filterStatus],
        ["Academic Standing Filter", filterAcademicStanding],
        ["Sort", `${sortField} ${sortDirection}`],
      ]);

      studentsSheet["!cols"] = [
        { wch: 16 },
        { wch: 28 },
        { wch: 16 },
        { wch: 28 },
        { wch: 30 },
        { wch: 16 },
        { wch: 14 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 20 },
        { wch: 12 },
        { wch: 20 },
        { wch: 18 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 22 },
        { wch: 20 },
        { wch: 30 },
        { wch: 18 },
        { wch: 28 },
        { wch: 42 },
      ];
      filtersSheet["!cols"] = [{ wch: 24 }, { wch: 40 }];

      XLSX.utils.book_append_sheet(workbook, studentsSheet, "Students");
      XLSX.utils.book_append_sheet(workbook, filtersSheet, "Export Filters");

      const workbookBuffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });
      const workbookBlob = new Blob([workbookBuffer], {
        type: STUDENT_EXPORT_MIME_TYPE,
      });

      downloadStudentExportFile(
        buildStudentExportFileName(currentBranch, exportedAt),
        workbookBlob,
      );
    } catch (error) {
      console.error("Failed to export students", error);
      showSystemAlert(
        "Unable to Export",
        "Unable to export the current student list right now.",
      );
    }
  };

  const handleSidebarToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="students-page">
      <AdminSidebar
        isOpen={isSidebarOpen}
        onClose={handleSidebarClose}
        onLogout={onLogout}
        loggedInUsername={loggedInUsername}
        loggedInRole={loggedInRole}
        canAccessBackup={canAccessBackup}
      />

      {/* Mobile menu toggle */}
      <button
        className="students-menu-toggle"
        onClick={handleSidebarToggle}
        aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
      >
        {isSidebarOpen ? "✕" : "☰"}
      </button>

      {/* Main content */}
      <main className="students-content">
        <header className="students-header">
          <h1>Students</h1>
          <p>
            {isLoading
              ? "Loading and restoring students..."
              : studentRecoveryMessage ||
                "Manage and view all enrolled students."}
          </p>
        </header>

        <div className="students-controls">
          <input
            type="text"
            placeholder="Search by Name, ID, Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="students-search-input"
          />
          <button
            type="button"
            className="students-notification-btn"
            onClick={handleOpenNotifications}
          >
            <span>Requirement Notifications</span>
            <span className="students-notification-badge">
              {pendingNotificationCount}
            </span>
          </button>
          <button
            type="button"
            className="students-notification-btn students-schedule-notification-btn"
            onClick={handleOpenScheduleNotifications}
          >
            <span>Schedule Approvals</span>
            <span className="students-notification-badge">
              {pendingScheduleNotificationCount}
            </span>
          </button>
          <button
            type="button"
            className="students-export-btn"
            onClick={handleExportStudents}
            disabled={isLoading || sortedStudents.length === 0}
            title="Export the currently visible students to Excel"
          >
            Export Excel
          </button>
        </div>

        {selectedStudents.length > 0 ? (
          <div className="students-bulk-actions">
            <div className="students-bulk-copy">
              <strong>{selectedStudents.length} selected</strong>
              <span>
                Move selected students to alumni or archive in one action.
              </span>
            </div>
            <div className="students-bulk-action-buttons">
              <button
                type="button"
                className="students-bulk-move-btn"
                onClick={handleMoveSelectedStudentsToAlumni}
                disabled={
                  isAnyBulkActionPending ||
                  alumniEligibleSelectedStudents.length === 0
                }
                title="Only Grade 12 SHS and 4th Year College students can be moved to alumni"
              >
                {isBulkMovingToAlumni ? "Moving..." : "Move to Alumni"}
              </button>
              <button
                type="button"
                className="students-bulk-archive-btn"
                onClick={handleMoveSelectedStudentsToArchive}
                disabled={isAnyBulkActionPending}
              >
                <MdArchive />
                {isBulkArchiving ? "Archiving..." : "Move to Archive"}
              </button>
              <button
                type="button"
                className="students-bulk-clear-btn"
                onClick={() => setSelectedStudentIds([])}
                disabled={isAnyBulkActionPending}
              >
                Clear Selection
              </button>
            </div>
          </div>
        ) : null}

        <div className="students-filters">
          <div className="students-filter-group">
            <label>Academic Level</label>
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
            >
              <option>All Programs</option>
              <option>SHS</option>
              <option>College</option>
            </select>
          </div>
          <div className="students-filter-group">
            <label>Year Level</label>
            <select
              value={filterYearLevel}
              onChange={(e) => setFilterYearLevel(e.target.value)}
            >
              <option value="">All Year Levels</option>
              {yearLevelOptions.map((yearLevelOption) => (
                <option key={yearLevelOption} value={yearLevelOption}>
                  {yearLevelOption}
                </option>
              ))}
            </select>
          </div>
          <div className="students-filter-group">
            <label>Section</label>
            <select
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
            >
              <option value="">All Sections</option>
              {sectionOptions.map((sectionOption) => (
                <option key={sectionOption} value={sectionOption}>
                  {sectionOption}
                </option>
              ))}
            </select>
          </div>
          <div className="students-filter-group">
            <label>Requirement Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option>All</option>
              <option>Complete</option>
              <option>Incomplete</option>
            </select>
          </div>
          <div className="students-filter-group">
            <label>Academic Standing</label>
            <select
              value={filterAcademicStanding}
              onChange={(e) => setFilterAcademicStanding(e.target.value)}
            >
              <option>All</option>
              <option>Regular</option>
              <option>Irregular</option>
            </select>
          </div>
        </div>

        <div className="students-table-container">
          <table className="students-table">
            <thead>
              <tr>
                <th className="students-selection-column">
                  <input
                    type="checkbox"
                    className="students-selection-checkbox"
                    checked={areAllVisibleStudentsSelected}
                    onChange={toggleVisibleStudentSelection}
                    disabled={visibleStudentIds.length === 0}
                    aria-label="Select all visible students"
                  />
                </th>
                <th>
                  <button
                    type="button"
                    className="students-table-sort-btn"
                    onClick={() => toggleSort("id")}
                  >
                    Student ID {sortIndicator("id")}
                  </button>
                </th>
                <th>Name</th>
                <th>Course/Track</th>
                <th>Grade Year</th>
                <th>Section</th>
                <th>Requirement Status</th>
                <th>Academic Standing</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {sortedStudents.length > 0 ? (
                sortedStudents.map((student) => (
                  <tr
                    key={student.id}
                    className={
                      selectedStudentIds.includes(student.id) &&
                      isStudentSelectableForBulkActions(student)
                        ? "students-table-row-selected"
                        : ""
                    }
                  >
                    <td className="students-selection-column" data-label="Select">
                      <input
                        type="checkbox"
                        className="students-selection-checkbox"
                        checked={selectedStudentIds.includes(student.id)}
                        onChange={() => toggleStudentSelection(student.id)}
                        disabled={!isStudentSelectableForBulkActions(student)}
                        aria-label={`Select ${student.name}`}
                      />
                    </td>
                    <td data-label="Student ID">{student.id}</td>
                    <td data-label="Name">{student.name}</td>
                    <td data-label="Course/Track">
                      {student.program === "SHS"
                        ? getShsTrackDisplay(student)
                        : getStudentCourseDisplay(student)}
                    </td>
                    <td data-label="Grade Year">
                      {student.program === "SHS"
                        ? getShsYearLevelDisplay(student)
                        : student.yearLevel}
                    </td>
                    <td data-label="Section">{student.section || "N/A"}</td>
                    <td data-label="Requirement Status">
                      {student.status}
                    </td>
                    <td data-label="Academic Standing">
                      <span
                        className={getAcademicStandingClassName(
                          getStudentAcademicStandingLabel(student),
                        )}
                      >
                        {getStudentAcademicStandingLabel(student)}
                      </span>
                    </td>
                    <td className="students-action-cell" data-label="Action">
                      <div className="students-action-group">
                        <button
                          className="students-action-btn students-view-btn"
                          onClick={() => openViewModal(student)}
                          disabled={isAnyBulkActionPending}
                        >
                          View details
                        </button>
                        {student.status !== "Archived" ? (
                          <button
                            className="students-action-btn students-archive-btn students-icon-only-btn"
                            onClick={() => openArchiveConfirm(student.id)}
                            disabled={isAnyBulkActionPending}
                            type="button"
                            aria-label={`Move ${student.name} to Archive`}
                            title={`Move ${student.name} to Archive`}
                          >
                            <MdArchive />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="students-no-results">
                    {isLoading ? (
                      <div className="skeleton-table-row">
                        <span className="skeleton-line short" />
                        <span className="skeleton-line long" />
                        <span className="skeleton-line medium" />
                      </div>
                    ) : (
                      "No students found matching your search."
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add/Edit Modal - Keep same modal structure but update class names */}
        {isAddEditModalOpen && (
          <div className="students-modal-overlay">
            <div className="students-modal">
              <div className="students-modal-header">
                <h2>{editingStudent ? "Edit Student" : "Add New Student"}</h2>
                <button
                  className="students-modal-close"
                  onClick={() => setIsAddEditModalOpen(false)}
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className="students-modal-form">
                {/* Keep all form fields same structure, just update class prefixes */}
                <div className="students-form-group">
                  <label>Student ID</label>
                  <input
                    name="id"
                    value={formData.id}
                    readOnly
                    disabled
                    className={formErrors.id ? "students-input-error" : ""}
                  />
                  {formErrors.id && (
                    <span className="students-error-text">{formErrors.id}</span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Full Name *</label>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className={formErrors.name ? "students-input-error" : ""}
                  />
                  {formErrors.name && (
                    <span className="students-error-text">
                      {formErrors.name}
                    </span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Program *</label>
                  <select
                    name="program"
                    value={formData.program}
                    onChange={handleChange}
                    required
                    className={formErrors.program ? "students-input-error" : ""}
                  >
                    <option value="">Select Program</option>
                    <option value="SHS">SHS</option>
                    <option value="College">College</option>
                  </select>
                  {formErrors.program && (
                    <span className="students-error-text">
                      {formErrors.program}
                    </span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Year Level *</label>
                  {formData.program === "SHS" ? (
                    <>
                      <select
                        name="yearLevel"
                        value={formData.yearLevel}
                        onChange={handleChange}
                        required
                        className={
                          formErrors.yearLevel ? "students-input-error" : ""
                        }
                      >
                        <option value="">Select SHS Year Level</option>
                        <option value="Grade 11">Grade 11</option>
                        <option value="Grade 12">Grade 12</option>
                      </select>
                      {formErrors.yearLevel === "Year Level is required" && (
                        <span className="students-error-text">
                          {formErrors.yearLevel}
                        </span>
                      )}

                      <select
                        value={shsTrackType}
                        onChange={(e) =>
                          handleShsTrackTypeChange(e.target.value)
                        }
                        required
                        className={
                          formErrors.yearLevel ? "students-input-error" : ""
                        }
                        style={{ marginTop: "10px" }}
                      >
                        <option value="">Select SHS Track</option>
                        <option value="Academic Track">Academic Track</option>
                        <option value="Technical Professional Track">
                          Technical Professional Track
                        </option>
                      </select>
                      {formErrors.yearLevel === "Track is required for SHS" && (
                        <span className="students-error-text">
                          {formErrors.yearLevel}
                        </span>
                      )}

                      {shsTrackType === "Academic Track" ? (
                        <>
                          <select
                            value={programSpecialization}
                            onChange={(e) =>
                              handleProgramSpecializationChange(e.target.value)
                            }
                            required
                            className={
                              formErrors.yearLevel ? "students-input-error" : ""
                            }
                            style={{ marginTop: "10px" }}
                          >
                            <option value="">
                              Select Academic Track Specialization
                            </option>
                            <option value="Arts, Social Science and Humanities">
                              Arts, Social Science and Humanities
                            </option>
                            <option value="Business Entrepreneurship">
                              Business Entrepreneurship
                            </option>
                          </select>
                          {formErrors.yearLevel ===
                            "Specialization is required for SHS" && (
                            <span className="students-error-text">
                              {formErrors.yearLevel}
                            </span>
                          )}
                        </>
                      ) : null}

                      {shsTrackType === "Technical Professional Track" ? (
                        <>
                          <select
                            value={programSpecialization}
                            onChange={(e) =>
                              handleProgramSpecializationChange(e.target.value)
                            }
                            required
                            className={
                              formErrors.yearLevel ? "students-input-error" : ""
                            }
                            style={{ marginTop: "10px" }}
                          >
                            <option value="">
                              Select Technical Track Specialization
                            </option>
                            <option value="ICT SUPPORT AND PROGRAMMING TECHNOLOGIES">
                              ICT SUPPORT AND PROGRAMMING TECHNOLOGIES
                            </option>
                          </select>
                          {formErrors.yearLevel ===
                            "Specialization is required for SHS" && (
                            <span className="students-error-text">
                              {formErrors.yearLevel}
                            </span>
                          )}
                        </>
                      ) : null}
                    </>
                  ) : formData.program === "College" ? (
                    <>
                      <select
                        name="yearLevel"
                        value={formData.yearLevel}
                        onChange={(e) =>
                          handleCollegeYearLevelChange(e.target.value)
                        }
                        required
                        className={
                          formErrors.yearLevel ? "students-input-error" : ""
                        }
                      >
                        <option value="">Select College Year Level</option>
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                        <option value="4th Year">4th Year</option>
                      </select>
                      {formErrors.yearLevel === "Year Level is required" && (
                        <span className="students-error-text">
                          {formErrors.yearLevel}
                        </span>
                      )}

                      <select
                        value={programSpecialization}
                        onChange={(e) =>
                          handleProgramSpecializationChange(e.target.value)
                        }
                        required
                        className={
                          formErrors.yearLevel ? "students-input-error" : ""
                        }
                        style={{ marginTop: "10px" }}
                      >
                        <option value="">Select Course</option>
                        <option value="BS ENTREPRENEURSHIP">
                          BS ENTREPRENEURSHIP
                        </option>
                      </select>
                      {formErrors.yearLevel ===
                        "Course selection is required for College" && (
                        <span className="students-error-text">
                          {formErrors.yearLevel}
                        </span>
                      )}
                    </>
                  ) : (
                    <input
                      name="yearLevel"
                      value={formData.yearLevel}
                      onChange={handleChange}
                      required
                      className={
                        formErrors.yearLevel ? "students-input-error" : ""
                      }
                    />
                  )}
                </div>

                <div className="students-form-group">
                  <label>Document Submitted Date</label>
                  <input
                    name="documentSubmitted"
                    type="date"
                    value={formData.documentSubmitted}
                    onChange={handleChange}
                  />
                </div>

                <div className="students-form-group">
                  <label>Contact Number</label>
                  <input
                    name="contact"
                    value={formData.contact}
                    onChange={handleChange}
                    className={formErrors.contact ? "students-input-error" : ""}
                  />
                  {formErrors.contact && (
                    <span className="students-error-text">
                      {formErrors.contact}
                    </span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Guardian Name</label>
                  <input
                    name="guardianName"
                    value={formData.guardianName || ""}
                    onChange={handleChange}
                    className={
                      formErrors.guardianName ? "students-input-error" : ""
                    }
                  />
                  {formErrors.guardianName && (
                    <span className="students-error-text">
                      {formErrors.guardianName}
                    </span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Guardian Contact</label>
                  <input
                    name="guardianContact"
                    value={formData.guardianContact || ""}
                    onChange={handleChange}
                    className={
                      formErrors.guardianContact ? "students-input-error" : ""
                    }
                  />
                  {formErrors.guardianContact && (
                    <span className="students-error-text">
                      {formErrors.guardianContact}
                    </span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={formErrors.email ? "students-input-error" : ""}
                  />
                  {formErrors.email && (
                    <span className="students-error-text">
                      {formErrors.email}
                    </span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Address</label>
                  <input
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className={formErrors.address ? "students-input-error" : ""}
                  />
                  {formErrors.address && (
                    <span className="students-error-text">
                      {formErrors.address}
                    </span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Status</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                  >
                    <option value="Complete">Complete</option>
                    <option value="Incomplete">Incomplete</option>
                  </select>
                </div>

                <div className="students-modal-actions">
                  <button
                    type="button"
                    className="students-cancel-btn"
                    onClick={() => setIsAddEditModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="students-save-btn">
                    {editingStudent ? "Update Student" : "Save Student"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View Details Modal */}
        {viewingStudent && (
          <div className="students-modal-overlay" onClick={closeViewModal}>
            <div
              className="students-modal students-view-modal students-profile-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="students-modal-header students-profile-header">
                <div>
                  <h2>Student Details</h2>
                  <p className="students-profile-subtitle students-profile-subtitle-hidden">
                    {viewingStudent.name} • {viewingStudent.id}
                  </p>
                  <p className="students-profile-subtitle">
                    {viewingStudent.name} - {viewingStudent.id}
                  </p>
                </div>
                <button
                  className="students-modal-close students-modal-close-text"
                  onClick={closeViewModal}
                  aria-label="Close student details"
                >
                  ×
                </button>
              </div>

              <div className="students-modal-body students-profile-body">
                <div className="students-profile-grid">
                  <div className="students-profile-field students-profile-field-full">
                    <label>Full Name</label>
                    <div className="students-profile-value">
                      {viewingStudent.name}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Student ID</label>
                    <div className="students-profile-value">
                      {viewingStudent.id}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Student Status</label>
                    <div
                      className={`students-profile-value students-profile-value-highlight ${getStudentLifecycleStatusClassName(
                        getStudentLifecycleStatus(viewingStudent),
                      )}`}
                    >
                      {getStudentLifecycleStatus(viewingStudent)}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Requirement Status</label>
                    <div
                      className={`students-profile-value students-profile-value-highlight ${getStudentStatusClassName(viewingStudent.status)}`}
                    >
                      {viewingStudent.status}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Academic Standing</label>
                    <div
                      className={`students-profile-value students-profile-value-highlight ${getAcademicStandingClassName(
                        viewingStudentAcademicStandingLabel,
                      )}`}
                    >
                      {viewingStudentAcademicStandingLabel}
                    </div>
                  </div>
                  {viewingStudentAcademicStandingLabel === "Irregular" ? (
                  <div className="students-profile-field students-profile-field-full">
                    <label>Own Schedule Term</label>
                    <div className="students-profile-value">
                      {viewingStudent.requestedOwnSchedule
                        ? `${
                            viewingStudent.ownScheduleAcademicYear ||
                            viewingStudentScheduleRequest?.academicYear ||
                            "Academic year pending"
                          } • ${
                            viewingStudent.ownScheduleSemester ||
                            viewingStudentScheduleRequest?.semester ||
                            "Semester pending"
                          }`
                        : "Not applicable"}
                    </div>
                  </div>
                  ) : null}
                  <div className="students-profile-field">
                    <label>Admission Type</label>
                    <div className="students-profile-value students-profile-admission-type">
                      {getAdmissionTypeLabel(viewingStudent.studentStatus)}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Program</label>
                    <div className="students-profile-value">
                      {viewingStudent.program}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>{viewingStudent.program === "SHS" ? "Strand" : "Course"}</label>
                    <div className="students-profile-value">
                      {viewingStudent.program === "SHS"
                        ? viewingStudent.strandOrCourse || "Not assigned"
                        : getStudentCourseDisplay(viewingStudent)}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Year Level</label>
                    <div className="students-profile-value">
                      {viewingStudent.yearLevel}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Section</label>
                    <div className="students-profile-value">
                      {viewingStudent.section || "N/A"}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Submitted Date</label>
                    <div className="students-profile-value">
                      {viewingStudent.documentSubmitted || "Not submitted"}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Email Address</label>
                    <div className="students-profile-value students-profile-email">
                      {viewingStudent.email || "Not provided"}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Contact Number</label>
                    <div className="students-profile-value">
                      {viewingStudent.contact || "Not provided"}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Guardian Name</label>
                    <div className="students-profile-value">
                      {viewingStudent.guardianName || "Not provided"}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Guardian Contact</label>
                    <div className="students-profile-value">
                      {viewingStudent.guardianContact || "Not provided"}
                    </div>
                  </div>
                  <div className="students-profile-field students-profile-field-full">
                    <label>Home Address</label>
                    <div className="students-profile-value students-profile-address">
                      {viewingStudent.address || "No address provided"}
                    </div>
                  </div>
                  {viewingStudentHasAdmissionAidDetails ? (
                    <>
                      <div className="students-profile-field">
                        <label>Academic Honor</label>
                        <div className="students-profile-value">
                          {viewingStudentHonorLabel}
                        </div>
                      </div>
                      <div className="students-profile-field">
                        <label>Honor Certificate</label>
                        <div className="students-profile-value">
                          {viewingStudentHonorCertificateStatus}
                        </div>
                      </div>
                      <div className="students-profile-field">
                        <label>Scholarship Application</label>
                        <div className="students-profile-value">
                          {viewingStudentScholarshipStatus}
                        </div>
                      </div>
                      <div className="students-profile-field">
                        <label>Scholarship Discount</label>
                        <div className="students-profile-value">
                          {viewingStudentTuitionEstimate
                            ? `${viewingStudentScholarshipDiscount}%`
                            : "Not applicable"}
                        </div>
                      </div>
                      <div className="students-profile-field">
                        <label>Applied Discount</label>
                        <div className="students-profile-value">
                          {viewingStudentTuitionEstimate
                            ? `${viewingStudentTuitionEstimate.effectiveDiscountPercentage}% (${viewingStudentTuitionEstimate.effectiveDiscountSourceLabel})`
                            : "Not applicable"}
                        </div>
                      </div>
                      <div className="students-profile-field students-profile-field-full">
                        <label>Scholarship Exam Score</label>
                        <div className="students-profile-value students-profile-list-box students-scholarship-score-box">
                          <div className="students-scholarship-score-current">
                            {viewingStudentScholarshipScore}
                          </div>
                          {canEditViewingStudentScholarshipScore ? (
                            <div className="students-scholarship-score-editor">
                              <input
                                type="number"
                                min="0"
                                max={SCHOLARSHIP_EXAM_MAX_SCORE}
                                step="1"
                                value={pendingScholarshipScore}
                                onChange={(event) => {
                                  setPendingScholarshipScore(event.target.value);
                                  if (scholarshipScoreFeedback) {
                                    setScholarshipScoreFeedback(null);
                                  }
                                }}
                                placeholder={`Score out of ${SCHOLARSHIP_EXAM_MAX_SCORE}`}
                              />
                              <button
                                type="button"
                                className="students-save-btn students-inline-save-btn"
                                onClick={handleApplyScholarshipScore}
                                disabled={isSavingScholarshipScore}
                              >
                                {isSavingScholarshipScore ? "Saving..." : "Apply Score"}
                              </button>
                            </div>
                          ) : null}
                          {canEditViewingStudentScholarshipScore ? (
                            <p className="students-scholarship-score-hint">
                              Score is out of {SCHOLARSHIP_EXAM_MAX_SCORE} items.
                              The exam discount is capped at 50%.
                            </p>
                          ) : null}
                          {scholarshipScoreFeedback ? (
                            <p
                              className={`students-inline-feedback ${scholarshipScoreFeedback.type}`}
                            >
                              {scholarshipScoreFeedback.message}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </>
                  ) : isViewingCollegeStudent ? (
                    <div className="students-profile-field students-profile-field-full">
                      <label>Scholarship and Discounts</label>
                      <div className="students-profile-value students-profile-list-box students-profile-empty-aid">
                        No scholarship, honor discount, or exam discount details
                        are recorded for this student.
                      </div>
                    </div>
                  ) : null}
                  <div className="students-profile-field students-profile-field-full">
                    <label>Financial Balance</label>
                    <div className="students-profile-value students-profile-list-box students-payment-ledger">
                      {canRecordViewingStudentPayment ? (
                        <>
                          <div className="students-payment-form">
                            <label className="students-payment-field">
                              <span>Amount Paid</span>
                              <input
                                type="number"
                                min="1"
                                max={viewingStudentBalanceSummary.currentBalance}
                                step="1"
                                value={paymentAmount}
                                onChange={(event) => {
                                  setPaymentAmount(event.target.value);
                                  setPaymentFeedback(null);
                                }}
                                placeholder="0"
                                disabled={
                                  viewingStudentBalanceSummary.status ===
                                  "Fully Paid"
                                }
                              />
                            </label>
                            <label className="students-payment-field">
                              <span>Receipt No.</span>
                              <input
                                type="text"
                                value={paymentReceiptNumber}
                                readOnly
                                aria-readonly="true"
                                title="Receipt number is generated automatically"
                              />
                            </label>
                            <label className="students-payment-field">
                              <span>Date Paid</span>
                              <input
                                type="date"
                                value={paymentDate}
                                onChange={(event) => {
                                  setPaymentDate(event.target.value);
                                  setPaymentFeedback(null);
                                }}
                                disabled={
                                  viewingStudentBalanceSummary.status ===
                                  "Fully Paid"
                                }
                              />
                            </label>
                            <label className="students-payment-field students-payment-notes-field">
                              <span>Notes</span>
                              <input
                                type="text"
                                value={paymentNotes}
                                onChange={(event) => {
                                  setPaymentNotes(event.target.value);
                                  setPaymentFeedback(null);
                                }}
                                placeholder="Optional"
                                disabled={
                                  viewingStudentBalanceSummary.status ===
                                  "Fully Paid"
                                }
                              />
                            </label>
                            <div className="students-payment-action-field">
                              <span aria-hidden="true">&nbsp;</span>
                              <button
                                type="button"
                                className="students-save-btn students-payment-add-btn"
                                onClick={handleAddStudentPayment}
                                disabled={
                                  isSavingPayment ||
                                  viewingStudentBalanceSummary.status ===
                                  "Fully Paid"
                                }
                              >
                                {isSavingPayment ? "Saving..." : "Add Payment"}
                              </button>
                            </div>
                          </div>

                          {paymentFeedback ? (
                            <p
                              className={`students-inline-feedback ${paymentFeedback.type}`}
                            >
                              {paymentFeedback.message}
                            </p>
                          ) : null}

                          <div className="students-payment-summary">
                            <div className="students-payment-summary-card">
                              <span>Total Assessment</span>
                              <strong>
                                {formatPeso(
                                  viewingStudentBalanceSummary.totalAssessment,
                                )}
                              </strong>
                            </div>
                            <div className="students-payment-summary-card">
                              <span>Total Paid</span>
                              <strong>
                                {formatPeso(viewingStudentBalanceSummary.totalPaid)}
                              </strong>
                            </div>
                            <div className="students-payment-summary-card balance">
                              <span>Current Balance</span>
                              <strong>
                                {formatPeso(
                                  viewingStudentBalanceSummary.currentBalance,
                                )}
                              </strong>
                            </div>
                            <div
                              className={`students-payment-status ${getPaymentStatusClassName(
                                viewingStudentBalanceSummary.status,
                              )}`}
                            >
                              {viewingStudentBalanceSummary.status}
                            </div>
                          </div>
                          <p className="students-payment-assessment-note">
                            {viewingStudentTotalUnits} unit(s) at{" "}
                            {formatPeso(COLLEGE_TUITION_PER_UNIT)} per unit
                            {viewingStudentTuitionEstimate?.effectiveDiscountPercentage
                              ? `, less ${viewingStudentTuitionEstimate.effectiveDiscountPercentage}% ${viewingStudentTuitionEstimate.effectiveDiscountSourceLabel}`
                              : ""}
                          </p>

                          <div className="students-payment-receipts">
                            <div className="students-payment-receipts-header">
                              <h4>Payment Receipts</h4>
                              <span>{viewingStudentPayments.length} record(s)</span>
                            </div>
                            {viewingStudentPayments.length > 0 ? (
                              <div className="students-payment-table-wrapper">
                                <table className="students-payment-table">
                                  <thead>
                                    <tr>
                                      <th>Date Paid</th>
                                      <th>Receipt No.</th>
                                      <th>Amount</th>
                                      <th>Encoded By</th>
                                      <th>Notes</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {viewingStudentPayments.map((payment) => (
                                      <tr key={payment.id}>
                                        <td>
                                          {new Date(
                                            payment.paidAt,
                                          ).toLocaleDateString()}
                                        </td>
                                        <td>{payment.receiptNumber}</td>
                                        <td>{formatPeso(payment.amount)}</td>
                                        <td>
                                          {payment.encodedBy}
                                          {payment.encodedRole
                                            ? ` (${payment.encodedRole})`
                                            : ""}
                                        </td>
                                        <td>{payment.notes || "-"}</td>
                                        <td>
                                          <button
                                            type="button"
                                            className="students-grade-action-btn danger"
                                            onClick={() =>
                                              handleRemoveStudentPayment(payment.id)
                                            }
                                            disabled={isAnyBulkActionPending}
                                          >
                                            Remove
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="students-grade-empty-state">
                                No payment receipts recorded yet.
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="students-grade-empty-state">
                          No college tuition assessment is available for this
                          student yet.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="students-profile-field students-profile-field-full">
                    <label>Student Credentials</label>
                    <div className="students-profile-value students-profile-list-box">
                      {viewingStudentCredentialRows.length > 0 ? (
                        <div className="students-profile-list students-credential-list">
                          {viewingStudentCredentialRows.map((credential) => {
                            const actionKeyUpload = `upload:${credential.code}`;
                            const actionKeyRemove = `remove:${credential.name}`;
                            return (
                              <div
                                key={credential.code}
                                className="students-profile-list-item students-credential-list-item"
                              >
                                <div className="students-credential-copy">
                                  <strong>{credential.name}</strong>
                                  <span
                                    className={`students-credential-review-status ${String(
                                      credential.hasFile
                                        ? credential.reviewStatus
                                        : "Pending",
                                    ).toLowerCase()}`}
                                  >
                                    {credential.hasFile
                                      ? credential.reviewStatus
                                      : "Pending Upload"}
                                  </span>
                                </div>
                                <div className="students-credential-actions">
                                  {credential.hasFile &&
                                  credential.attachment?.url ? (
                                    <a
                                      href={credential.attachment.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      View
                                    </a>
                                  ) : null}
                                  {credential.hasFile &&
                                  credential.attachment?.url &&
                                  credential.reviewStatus !== "Pending" ? (
                                    <a
                                      href={credential.attachment.url}
                                      download={credential.attachment.name}
                                      className="students-credential-action-btn students-credential-download-btn"
                                    >
                                      Download
                                    </a>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="students-credential-action-btn"
                                    onClick={() =>
                                      handleAdminCredentialUpload(credential)
                                    }
                                    disabled={credentialActionKey !== null}
                                  >
                                    {credentialActionKey === actionKeyUpload
                                      ? "Uploading..."
                                      : credential.hasFile
                                        ? "Replace"
                                        : "Upload"}
                                  </button>
                                  {credential.hasFile ? (
                                    <button
                                      type="button"
                                      className="students-credential-action-btn danger"
                                      onClick={() =>
                                        handleAdminCredentialRemove(
                                          credential.name,
                                        )
                                      }
                                      disabled={credentialActionKey !== null}
                                    >
                                      {credentialActionKey === actionKeyRemove
                                        ? "Removing..."
                                        : "Remove"}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                          {credentialActionFeedback ? (
                            <p
                              className={`students-inline-feedback ${credentialActionFeedback.type}`}
                            >
                              {credentialActionFeedback.message}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        "No linked credential requirements"
                      )}
                    </div>
                  </div>
                  {/*
                  <div className="students-profile-field students-profile-field-full">
                    <label>Planned Load and Schedule</label>
                    <div className="students-profile-value students-profile-list-box">
                      {viewingStudentSubjectPlan?.scheduledAssignments &&
                      viewingStudentSubjectPlan.scheduledAssignments.length > 0 ? (
                        <div className="students-profile-list">
                          {viewingStudentSubjectPlan.scheduledAssignments.map(
                            (assignment) => (
                              <div
                                key={assignment.assignmentId}
                                className="students-profile-list-item"
                              >
                                <span>
                                  <strong>
                                    {assignment.subjectCode} - {assignment.subjectName}
                                  </strong>
                                  {" "}
                                  ({assignment.sectionCode || "No section"}) •{" "}
                                  {formatPlannerScheduleLabel(assignment.schedule)}
                                </span>
                                <span>
                                  {assignment.instructorName || "TBA"}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      ) : viewingStudentScheduleRequest &&
                        viewingStudentScheduleRequest.selections.length > 0 ? (
                        <div className="students-profile-list">
                          {viewingStudentScheduleRequest.selections.map(
                            (assignment) => (
                              <div
                                key={assignment.assignmentId}
                                className="students-profile-list-item"
                              >
                                <span>
                                  <strong>
                                    {assignment.subjectCode} - {assignment.subjectName}
                                  </strong>
                                  {" "}
                                  ({assignment.sectionCode || "No section"}) •{" "}
                                  {formatPlannerScheduleLabel(assignment.schedule)}
                                </span>
                                <span>
                                  {viewingStudentScheduleRequest.status === "Pending"
                                    ? "Awaiting admin approval"
                                    : viewingStudentScheduleRequest.status ===
                                        "Rejected"
                                      ? "Needs student revision"
                                      : assignment.instructorName || "TBA"}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      ) : viewingStudent.program === "College" ? (
                        "No planned load saved yet"
                      ) : (
                        "Not applicable"
                      )}
                    </div>
                  </div>
                  */}
                  <div className="students-profile-field students-profile-field-full">
                    <label>Standing Notes</label>
                    <div className="students-profile-value students-profile-list-box">
                      <div className="students-profile-note">
                        <p>
                          {viewingStudentAcademicStanding?.reason ||
                            viewingStudentOwnScheduleReason ||
                            "No academic standing details available yet."}
                        </p>
                        {viewingStudentOwnScheduleReason &&
                        viewingStudentAcademicStanding?.reason ? (
                          <p>{viewingStudentOwnScheduleReason}</p>
                        ) : null}
                        {isViewingCollegeStudent &&
                        (viewingStudentAcademicStanding?.pendingGroups || 0) > 0 ? (
                          <p>
                            Some college subjects only have non-final grading
                            period uploads, so the standing is based on the
                            final or semester grades already recorded.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="students-profile-field students-profile-field-full">
                    <label>
                      {isViewingCollegeStudent
                        ? "Uploaded Grades by Semester"
                        : "Uploaded Grades by Quarter"}
                    </label>
                    <div className="students-profile-value students-profile-list-box">
                      {viewingStudentGradeRecords.length > 0 ? (
                        <div className="students-grade-sections">
                          <div className="students-grade-toolbar">
                            <div className="students-grade-filter-field">
                              <label htmlFor="students-grade-school-year-filter">
                                School Year
                              </label>
                              <select
                                id="students-grade-school-year-filter"
                                value={gradeSchoolYearFilter}
                                onChange={(event) =>
                                  setGradeSchoolYearFilter(event.target.value)
                                }
                              >
                                <option value="all">All School Years</option>
                                {viewingStudentGradeSchoolYearOptions.map((year) => (
                                  <option key={year} value={year}>
                                    {year}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="students-grade-filter-field">
                              <label htmlFor="students-grade-semester-filter">
                                Semester
                              </label>
                              <select
                                id="students-grade-semester-filter"
                                value={gradeSemesterFilter}
                                onChange={(event) =>
                                  setGradeSemesterFilter(event.target.value)
                                }
                              >
                                <option value="all">All Semesters</option>
                                {viewingStudentGradeSemesterOptions.map((semester) => (
                                  <option key={semester} value={semester}>
                                    {semester}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="students-grade-filter-field students-grade-filter-search">
                              <label htmlFor="students-grade-search-filter">
                                Subject Filter
                              </label>
                              <input
                                id="students-grade-search-filter"
                                type="text"
                                value={gradeSearchTerm}
                                onChange={(event) =>
                                  setGradeSearchTerm(event.target.value)
                                }
                                placeholder="Search subject code, title, period, or result"
                              />
                            </div>
                          </div>
                          {gradeEditState ? (
                            <div className="students-grade-editor">
                              <div className="students-grade-editor-header">
                                <div>
                                  <h4>{gradeEditState.title}</h4>
                                  <p>{gradeEditState.subtitle}</p>
                                </div>
                              </div>
                              <div className="students-grade-editor-grid">
                                {gradeEditState.fields.map((field) => (
                                  <label
                                    key={field.key}
                                    className="students-grade-editor-field"
                                  >
                                    <span>{field.label}</span>
                                    <input
                                      type="text"
                                      value={field.value}
                                      onChange={(event) =>
                                        handleGradeEditFieldChange(
                                          field.key,
                                          event.target.value,
                                        )
                                      }
                                        placeholder={
                                          gradeEditState.programType === "College"
                                            ? "1.00, 1.25, 3.00, INC, FAILED"
                                            : "60-100; 75 passing"
                                        }
                                      disabled={isSavingGradeEdit}
                                    />
                                  </label>
                                ))}
                              </div>
                              <p className="students-grade-editor-hint">
                                Leave a field blank to clear that saved grade.
                              </p>
                              {gradeEditFeedback ? (
                                <p
                                  className={`students-inline-feedback ${gradeEditFeedback.type}`}
                                >
                                  {gradeEditFeedback.message}
                                </p>
                              ) : null}
                              <div className="students-grade-editor-actions">
                                <button
                                  type="button"
                                  className="students-cancel-btn"
                                  onClick={handleCloseGradeEditor}
                                  disabled={isSavingGradeEdit}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="students-save-btn"
                                  onClick={handleSaveGradeEdit}
                                  disabled={isSavingGradeEdit}
                                >
                                  {isSavingGradeEdit
                                    ? "Saving..."
                                    : "Save Grade Changes"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {gradeManagementFeedback ? (
                            <p
                              className={`students-inline-feedback ${gradeManagementFeedback.type}`}
                            >
                              {gradeManagementFeedback.message}
                            </p>
                          ) : null}
                          {filteredViewingStudentGradeTerms.map(
                            ({ academicYear, semester }) => {
                              const filteredTermGrades =
                                filteredViewingStudentGradeRecords.filter(
                                  (record) =>
                                    record.academicYear === academicYear &&
                                    record.semester === semester,
                                );
                              const allTermGrades =
                                viewingStudentGradeRecords.filter(
                                  (record) =>
                                  record.academicYear === academicYear &&
                                  record.semester === semester,
                                );

                              if (isViewingCollegeStudent) {
                                const sortedTermGrades =
                                  sortCollegeGradeRecords(filteredTermGrades);
                                const hasIrregularTrigger = sortedTermGrades.some(
                                  (record) =>
                                    viewingStudentGradeTriggerIds.has(record.id),
                                );

                                return (
                                  <div
                                    key={`${academicYear}-${semester}`}
                                    className="students-grade-section"
                                  >
                                    <div className="students-grade-section-header">
                                      <div>
                                        <h4>{semester}</h4>
                                        <p>{academicYear}</p>
                                      </div>
                                      <span
                                        className={getAcademicStandingClassName(
                                          hasIrregularTrigger
                                            ? "Irregular"
                                            : "Regular",
                                        )}
                                      >
                                        {hasIrregularTrigger
                                          ? "Has failed/INC grades"
                                          : "No failed/INC grades"}
                                      </span>
                                    </div>
                                    <div className="students-grade-table-wrapper">
                                      <table className="students-grade-table">
                                        <thead>
                                          <tr>
                                            <th>Subject Code</th>
                                            <th>Subject Title</th>
                                            <th>Period</th>
                                            <th>Grade</th>
                                            <th>Units</th>
                                            <th>Result</th>
                                            <th>Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {sortedTermGrades.map((record) => (
                                            <tr
                                              key={record.id}
                                              className={
                                                viewingStudentGradeTriggerIds.has(
                                                  record.id,
                                                )
                                                  ? "students-grade-row-flagged"
                                                  : ""
                                              }
                                            >
                                              <td>{record.subjectCode}</td>
                                              <td>{record.subjectTitle}</td>
                                              <td>{record.gradingPeriod}</td>
                                              <td>{record.normalizedGrade}</td>
                                              <td>{record.units ?? "—"}</td>
                                              <td>{record.evaluation}</td>
                                              <td>
                                                <div className="students-grade-row-actions">
                                                  <button
                                                    type="button"
                                                    className="students-grade-action-btn"
                                                    onClick={() =>
                                                      handleOpenCollegeGradeEditor(
                                                        record,
                                                      )
                                                    }
                                                    disabled={isAnyBulkActionPending}
                                                  >
                                                    Edit
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="students-grade-action-btn danger"
                                                    onClick={() =>
                                                      handleRemoveGradeRecords({
                                                        branch:
                                                          viewingStudent.branch ||
                                                          currentBranch,
                                                        records: [record],
                                                        summaryLabel: `${record.subjectCode} - ${record.subjectTitle} (${record.gradingPeriod})`,
                                                      })
                                                    }
                                                    disabled={isAnyBulkActionPending}
                                                  >
                                                    Remove
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              }

                              const visibleShsRowKeys = new Set(
                                filteredTermGrades.map((record) =>
                                  buildShsGradeSummaryKey(
                                    record.subjectCode,
                                    record.subjectTitle,
                                  ),
      ),
    );
                              const activeShsQuarterLabels =
                                getShsQuarterLabelsForSemester(semester);
                              const shsRows = buildShsGradeSummaryRows(
                                allTermGrades.filter((record) =>
                                  visibleShsRowKeys.has(
                                    buildShsGradeSummaryKey(
                                      record.subjectCode,
                                      record.subjectTitle,
                                    ),
                                  ),
                                ),
                                semester,
                              );

                              return (
                                <div
                                  key={`${academicYear}-${semester}`}
                                  className="students-grade-section"
                                >
                                  <div className="students-grade-section-header">
                                    <div>
                                      <h4>{semester}</h4>
                                      <p>{academicYear}</p>
                                    </div>
                                  </div>
                                  <div className="students-grade-table-wrapper">
                                    <table className="students-grade-table">
                                      <thead>
                                        <tr>
                                          <th>Subject Code</th>
                                          <th>Subject Title</th>
                                          {activeShsQuarterLabels.map(
                                            (quarterLabel) => (
                                              <th key={quarterLabel}>
                                                {quarterLabel}
                                              </th>
                                            ),
                                          )}
                                          <th>Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {shsRows.map((row) => {
                                          const rowRecords = allTermGrades.filter(
                                            (record) =>
                                              buildShsGradeSummaryKey(
                                                record.subjectCode,
                                                record.subjectTitle,
                                              ) === row.key &&
                                              activeShsQuarterLabels.includes(
                                                record.gradingPeriod as ShsQuarterLabel,
                                              ),
                                          );

                                          return (
                                            <tr key={row.key}>
                                              <td>{row.subjectCode}</td>
                                              <td>{row.subjectTitle}</td>
                                              {activeShsQuarterLabels.map(
                                                (quarterLabel) => (
                                                  <td key={quarterLabel}>
                                                    {row.quarterGrades[quarterLabel]}
                                                  </td>
                                                ),
                                              )}
                                              <td>
                                                <div className="students-grade-row-actions">
                                                  <button
                                                    type="button"
                                                    className="students-grade-action-btn"
                                                    onClick={() =>
                                                      handleOpenShsGradeEditor({
                                                        academicYear,
                                                        semester,
                                                        row,
                                                        records: rowRecords,
                                                      })
                                                    }
                                                    disabled={isAnyBulkActionPending}
                                                  >
                                                    Edit
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="students-grade-action-btn danger"
                                                    onClick={() =>
                                                      handleRemoveGradeRecords({
                                                        branch:
                                                          viewingStudent.branch ||
                                                          currentBranch,
                                                        records: rowRecords,
                                                        summaryLabel: `${row.subjectCode} - ${row.subjectTitle} (${semester})`,
                                                      })
                                                    }
                                                    disabled={isAnyBulkActionPending}
                                                  >
                                                    Remove
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            },
                          )}
                          {filteredViewingStudentGradeTerms.length === 0 ? (
                            <div className="students-grade-empty-state">
                              No grades match the current filters.
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        "No uploaded grades yet"
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="students-modal-actions">
                {/*
                {viewingStudent.program === "College" ? (
                  <button
                    type="button"
                    className="students-plan-btn"
                    onClick={() => {
                      const selectedStudent = viewingStudent;
                      closeViewModal();
                      openPlannerModal(selectedStudent);
                    }}
                  >
                    Plan Load
                  </button>
                ) : null}
                */}
                <button
                  type="button"
                  className="students-save-btn"
                  onClick={handleEditFromView}
                  disabled={isAnyBulkActionPending}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="students-cancel-btn"
                  onClick={closeViewModal}
                  disabled={isAnyBulkActionPending}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/*
        {planningStudent && (
          <div className="students-modal-overlay" onClick={closePlannerModal}>
            <div
              className="students-modal students-planner-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="students-modal-header students-planner-header">
                <div>
                  <h2>Irregular Load Planner</h2>
                  <p className="students-profile-subtitle">
                    {planningStudent.name} - {planningStudent.id}
                  </p>
                </div>
                <button
                  className="students-modal-close students-modal-close-text"
                  onClick={closePlannerModal}
                  aria-label="Close irregular planner"
                >
                  ×
                </button>
              </div>

              <div className="students-modal-body students-planner-body">
                <div className="students-planner-controls">
                  <label className="students-planner-field">
                    <span>Academic Year</span>
                    <input
                      type="text"
                      value={plannerForm.academicYear}
                      onChange={(event) =>
                        setPlannerForm((prev) => ({
                          ...prev,
                          academicYear: event.target.value,
                          selectedAssignmentIds: [],
                        }))
                      }
                      placeholder={getDefaultPlannerAcademicYear()}
                    />
                  </label>
                  <label className="students-planner-field">
                    <span>Planning Semester</span>
                    <select
                      value={plannerForm.semester}
                      onChange={(event) =>
                        setPlannerForm((prev) => ({
                          ...prev,
                          semester: normalizePlanningSemester(event.target.value),
                          selectedAssignmentIds: [],
                        }))
                      }
                    >
                      {SEMESTER_DISPLAY_ORDER.map((semester) => (
                        <option key={semester} value={semester}>
                          {semester}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="students-planner-summary">
                  <div className="students-planner-stat">
                    <span>Available subjects</span>
                    <strong>{planningSubjectGroups.length}</strong>
                  </div>
                  <div className="students-planner-stat">
                    <span>Selected schedules</span>
                    <strong>{selectedPlannerAssignments.length}</strong>
                  </div>
                  <div className="students-planner-stat">
                    <span>Conflicts</span>
                    <strong>{plannerConflicts.length}</strong>
                  </div>
                </div>

                {plannerConflicts.length > 0 ? (
                  <div className="students-planner-warning">
                    <strong>Schedule conflict detected.</strong>
                    <ul className="students-planner-warning-list">
                      {plannerConflicts.map((conflict) => (
                        <li
                          key={`${conflict.leftAssignmentId}-${conflict.rightAssignmentId}`}
                        >
                          {conflict.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {planningStudentPlan?.notes ? (
                  <div className="students-planner-existing-note">
                    Current saved note: {planningStudentPlan.notes}
                  </div>
                ) : null}

                {planningYearGroups.length > 0 ? (
                  <div className="students-planner-grid">
                    <div className="students-planner-subjects">
                      {planningYearGroups.map(({ yearLevel, items, selectedCount }) => {
                        const isExpanded = expandedPlannerYearLevels.includes(yearLevel);

                        return (
                          <div
                            key={yearLevel}
                            className="students-planner-year-group"
                          >
                            <button
                              type="button"
                              className="students-planner-year-toggle"
                              onClick={() => togglePlannerYearGroup(yearLevel)}
                            >
                              <div>
                                <strong>{yearLevel}</strong>
                                <span>
                                  {items.length} subject
                                  {items.length === 1 ? "" : "s"}
                                  {selectedCount > 0
                                    ? ` | ${selectedCount} selected`
                                    : ""}
                                </span>
                              </div>
                              <span>{isExpanded ? "Hide" : "Show"}</span>
                            </button>
                            {isExpanded ? (
                              <div className="students-planner-year-content">
                                {items.map(
                                  ({
                                    subject,
                                    assignmentOptions,
                                    selectedAssignmentId,
                                  }) => (
                                    <div
                                      key={subject.id}
                                      className="students-planner-subject-card"
                                    >
                                      <div className="students-planner-subject-copy">
                                        <h4>
                                          {subject.code} - {subject.name}
                                        </h4>
                                        <p>
                                          {subject.yearLevel}
                                          {subject.units
                                            ? ` | ${subject.units} units`
                                            : ""}
                                        </p>
                                      </div>
                                      <label className="students-planner-field">
                                        <span>Schedule option</span>
                                        <select
                                          value={selectedAssignmentId}
                                          onChange={(event) =>
                                            handlePlannerAssignmentChange(
                                              subject,
                                              event.target.value,
                                            )
                                          }
                                        >
                                          <option value="">
                                            Not included in load
                                          </option>
                                          {assignmentOptions.map((assignment) => (
                                            <option
                                              key={assignment.id}
                                              value={assignment.id}
                                            >
                                              {assignment.sectionCode} -{" "}
                                              {formatPlannerScheduleLabel(
                                                assignment.schedule,
                                              )}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      {assignmentOptions.length === 0 ? (
                                        <p className="students-planner-empty-option">
                                          No scheduled section offering found for
                                          this subject and term.
                                        </p>
                                      ) : null}
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    <div className="students-planner-selection-panel">
                      <h3>Selected load</h3>
                      {selectedPlannerAssignments.length > 0 ? (
                        <div className="students-planner-selection-list">
                          {selectedPlannerAssignments.map((assignment) => (
                            <div
                              key={assignment.id}
                              className={`students-planner-selection-item ${
                                plannerConflicts.some(
                                  (conflict) =>
                                    conflict.leftAssignmentId === assignment.id ||
                                    conflict.rightAssignmentId === assignment.id,
                                )
                                  ? "flagged"
                                  : ""
                              }`}
                            >
                              <strong>
                                {assignment.subjectCode} - {assignment.subjectName}
                              </strong>
                              <span>{assignment.sectionCode}</span>
                              <span>{formatPlannerScheduleLabel(assignment.schedule)}</span>
                              <span>{assignment.instructorName || "TBA"}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="students-planner-empty-state">
                          Pick one schedule option per subject to build the
                          irregular load.
                        </div>
                      )}

                      <label className="students-planner-field">
                        <span>Registrar notes</span>
                        <textarea
                          rows={4}
                          value={plannerForm.notes}
                          onChange={(event) =>
                            setPlannerForm((prev) => ({
                              ...prev,
                              notes: event.target.value,
                            }))
                          }
                          placeholder="Example: Student will cross-enroll with mixed section schedules while completing INC subject."
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="students-planner-empty-state">
                    No subject offerings were found for this student, semester,
                    and academic year. Open Academic Management first to add the
                    needed subject and section offerings.
                  </div>
                )}
              </div>

              <div className="students-modal-actions">
                <button
                  type="button"
                  className="students-cancel-btn"
                  onClick={closePlannerModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="students-save-btn"
                  onClick={handleSavePlanner}
                >
                  Save Load Plan
                </button>
              </div>
            </div>
          </div>
        )}
        */}

        {isNotificationModalOpen && (
          <div
            className="students-modal-overlay"
            onClick={handleCloseNotifications}
          >
            <div
              className="students-modal students-notification-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="students-modal-header">
                <div className="students-notification-header-copy">
                  <h2>Portal Requirement Notifications</h2>
                  <p>
                    Students with portal uploads waiting for admin or registrar
                    review.
                  </p>
                </div>
                <button
                  className="students-modal-close"
                  onClick={handleCloseNotifications}
                >
                  x
                </button>
              </div>

              <div className="students-modal-body">
                {requirementNotifications.length > 0 ? (
                  <div className="students-notification-list">
                    {requirementNotifications.map((notification) => (
                      <div
                        key={notification.student.id}
                        className="students-notification-card"
                      >
                        <div className="students-notification-card-head">
                          <div>
                            <h3>{notification.student.name}</h3>
                            <p>
                              {notification.student.id} -{" "}
                              {notification.student.program === "SHS"
                                ? getShsTrackDisplay(notification.student)
                                : getStudentCourseDisplay(notification.student)}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="students-notification-open-btn"
                            onClick={() =>
                              handleOpenStudentFromNotification(
                                notification.student,
                              )
                            }
                          >
                            View Student
                          </button>
                        </div>

                        <div className="students-notification-stats">
                          <div className="students-notification-stat">
                            <span className="students-notification-stat-label">
                              Waiting review
                            </span>
                            <strong>{notification.pendingReviewCount}</strong>
                          </div>
                          <div className="students-notification-stat">
                            <span className="students-notification-stat-label">
                              Submitted
                            </span>
                            <strong>{notification.submittedCount}</strong>
                          </div>
                          <div className="students-notification-stat">
                            <span className="students-notification-stat-label">
                              Approved
                            </span>
                            <strong>{notification.approvedCount}</strong>
                          </div>
                          <div className="students-notification-stat">
                            <span className="students-notification-stat-label">
                              Need redo
                            </span>
                            <strong>{notification.rejectedCount}</strong>
                          </div>
                          <div className="students-notification-stat">
                            <span className="students-notification-stat-label">
                              Missing upload
                            </span>
                            <strong>
                              {notification.pendingRequirementCount}
                            </strong>
                          </div>
                        </div>

                        <div className="students-notification-documents">
                          {notification.submittedAttachments.map((attachment) => (
                            <div
                              key={`${notification.student.id}-${attachment.name}`}
                              className="students-notification-document"
                            >
                              <div className="students-notification-document-top">
                                <div className="students-notification-document-copy">
                                  <h4>{attachment.name}</h4>
                                  <p>
                                    Status:{" "}
                                    <span
                                      className={`students-notification-status ${String(attachment.reviewStatus || "Pending").toLowerCase()}`}
                                    >
                                      {getNotificationReviewStatusLabel(
                                        attachment.reviewStatus,
                                      )}
                                    </span>
                                  </p>
                                </div>
                                {hasViewableAttachmentUrl(attachment) ? (
                                  <a
                                    className="students-notification-view-btn"
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    View Document
                                  </a>
                                ) : (
                                  <span className="students-notification-reference">
                                    Reference only
                                  </span>
                                )}
                              </div>

                              <div className="students-notification-actions">
                                <button
                                  type="button"
                                  className="students-notification-review-btn approve"
                                  onClick={() =>
                                    handleNotificationRequirementDecision({
                                      student: notification.student,
                                      requirementName: attachment.name,
                                      status: "Approved",
                                    })
                                  }
                                  disabled={attachment.reviewStatus === "Approved"}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="students-notification-review-btn redo"
                                  onClick={() =>
                                    handleNotificationRequirementDecision({
                                      student: notification.student,
                                      requirementName: attachment.name,
                                      status: "Rejected",
                                    })
                                  }
                                  disabled={attachment.reviewStatus === "Rejected"}
                                >
                                  Need Redo
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="students-notification-empty">
                    <h3>No requirement notifications yet</h3>
                    <p>
                      Once enrolled students upload pending portal
                      requirements, they will appear here for review.
                    </p>
                  </div>
                )}
              </div>

              <div className="students-modal-actions">
                <button
                  type="button"
                  className="students-cancel-btn"
                  onClick={handleCloseNotifications}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {isScheduleNotificationModalOpen && (
          <div
            className="students-modal-overlay"
            onClick={handleCloseScheduleNotifications}
          >
            <div
              className="students-modal students-notification-modal students-schedule-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="students-modal-header">
                <div className="students-notification-header-copy">
                  <h2>Student Schedule Approvals</h2>
                  <p>
                    Review self-selected schedules from irregular admissions
                    before they become the student's official subject load.
                  </p>
                </div>
                <button
                  className="students-modal-close"
                  onClick={handleCloseScheduleNotifications}
                  aria-label="Close schedule approvals"
                >
                  ×
                </button>
              </div>

              <div className="students-modal-body">
                {pendingScheduleNotifications.length > 0 ? (
                  <div className="students-notification-list">
                    {pendingScheduleNotifications.map((notification) => {
                      const scheduleConflicts = buildScheduledAssignmentConflicts(
                        notification.request.selections,
                      );

                      return (
                        <div
                          key={notification.request.id}
                          className="students-notification-card students-schedule-card"
                        >
                          <div className="students-notification-card-head">
                            <div>
                              <h3>{notification.student.name}</h3>
                              <p>
                                {notification.student.id} •{" "}
                                {notification.request.academicYear} •{" "}
                                {notification.request.semester}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="students-notification-open-btn"
                              onClick={() =>
                                handleOpenStudentFromNotification(
                                  notification.student,
                                )
                              }
                            >
                              View Student
                            </button>
                          </div>

                          <div className="students-notification-stats students-schedule-stats">
                            <div className="students-notification-stat">
                              <span className="students-notification-stat-label">
                                Selected
                              </span>
                              <strong>{notification.selectedCount}</strong>
                            </div>
                            <div className="students-notification-stat">
                              <span className="students-notification-stat-label">
                                Units
                              </span>
                              <strong>{notification.totalUnits}</strong>
                            </div>
                            <div className="students-notification-stat">
                              <span className="students-notification-stat-label">
                                Conflicts
                              </span>
                              <strong>{notification.conflictCount}</strong>
                            </div>
                            <div className="students-notification-stat">
                              <span className="students-notification-stat-label">
                                Submitted
                              </span>
                              <strong>
                                {new Date(
                                  notification.request.submittedAt,
                                ).toLocaleDateString()}
                              </strong>
                            </div>
                          </div>

                          <div className="students-notification-documents students-schedule-selections">
                            {notification.request.selections.map((selection) => (
                              <div
                                key={selection.assignmentId}
                                className={`students-notification-document students-schedule-selection-item ${
                                  scheduleConflicts.some(
                                    (conflict) =>
                                      conflict.leftAssignmentId ===
                                        selection.assignmentId ||
                                      conflict.rightAssignmentId ===
                                        selection.assignmentId,
                                  )
                                    ? "flagged"
                                    : ""
                                }`}
                              >
                                <div className="students-notification-document-top">
                                  <div className="students-notification-document-copy">
                                    <h4>
                                      {selection.subjectCode} -{" "}
                                      {selection.subjectName}
                                    </h4>
                                    <p>
                                      {selection.sectionCode || "No section"} •{" "}
                                      {formatPlannerScheduleLabel(
                                        selection.schedule,
                                      )}
                                    </p>
                                    <p>
                                      {selection.instructorName || "Instructor TBA"}
                                      {typeof selection.units === "number"
                                        ? ` • ${selection.units} units`
                                        : ""}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {scheduleConflicts.length > 0 ? (
                            <div className="students-planner-warning students-schedule-warning">
                              <strong>Resolve conflicts before approval.</strong>
                              <ul className="students-planner-warning-list">
                                {scheduleConflicts.map((conflict) => (
                                  <li
                                    key={`${conflict.leftAssignmentId}-${conflict.rightAssignmentId}`}
                                  >
                                    {conflict.message}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          <div className="students-notification-actions">
                            <button
                              type="button"
                              className="students-notification-review-btn approve"
                              onClick={() =>
                                handleScheduleSelectionDecision(
                                  notification,
                                  "Approved",
                                )
                              }
                              disabled={scheduleConflicts.length > 0}
                            >
                              Approve Schedule
                            </button>
                            <button
                              type="button"
                              className="students-notification-review-btn redo"
                              onClick={() =>
                                handleScheduleSelectionDecision(
                                  notification,
                                  "Rejected",
                                )
                              }
                            >
                              Reject Schedule
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="students-notification-empty">
                    <h3>No pending schedule approvals</h3>
                    <p>
                      New self-selected schedules from irregular admissions will
                      appear here after students submit them in the portal.
                    </p>
                  </div>
                )}
              </div>

              <div className="students-modal-actions">
                <button
                  type="button"
                  className="students-cancel-btn"
                  onClick={handleCloseScheduleNotifications}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Archive Confirmation Modal */}
        {isArchiveModalOpen && (
          <div className="students-modal-overlay">
            <div className="students-modal students-archive-confirm-modal">
              <div className="students-modal-header">
                <h2>Confirm Archive</h2>
                <button
                  className="students-modal-close"
                  onClick={cancelArchive}
                >
                  ×
                </button>
              </div>

              <div className="students-modal-body">
                <p>Are you sure you want to move this student to Archive?</p>
                <p className="students-student-info">
                  <strong>
                    {students.find((s) => s.id === studentToArchive)?.name}
                  </strong>{" "}
                  <br />
                  (ID: {studentToArchive})
                </p>
                <p>This student will be hidden from Active records.</p>
              </div>

              <div className="students-modal-actions">
                <button
                  type="button"
                  className="students-cancel-btn"
                  onClick={cancelArchive}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="students-archive-confirm-btn"
                  onClick={confirmArchive}
                  aria-label="Confirm move to Archive"
                  title="Confirm move to Archive"
                >
                  <MdArchive />
                  Archive
                </button>
              </div>
            </div>
          </div>
        )}

        <SystemAlertModal
          isOpen={Boolean(systemAlert)}
          title={systemAlert?.title || ""}
          message={systemAlert?.message || ""}
          onClose={() => setSystemAlert(null)}
        />
      </main>
    </div>
  );
}
