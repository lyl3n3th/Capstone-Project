import { useEffect, useMemo, useState } from "react";
import { MdArchive } from "react-icons/md";
import * as XLSX from "xlsx";
import AdminSidebar from "../../components/admin/AdminSidebar";
import { useAuth } from "../../hooks/useAuth";
import {
  BACKUP_RESTORE_APPLIED_EVENT,
  persistAlumniBackupCache,
  readCachedAlumni,
  rememberAlumniStudentStatus,
  type AlumniBackupRecord,
} from "../../services/backupApi";
import {
  fetchSupabaseAdmissionApplicants,
  getNextStudentNumber,
  getStudentRequirementSnapshot,
  getStudentSectionChoices,
  updateStoredStudentOwnScheduleState,
  updateStoredStudentSection,
  getStudentsForBranch,
  normalizeBranchName,
  promoteApplicantToStoredStudent,
  readBranchScopedData,
  readStoredStudents,
  writeBranchScopedData,
  updateStudentRequirementReviewStatus,
  writeStoredStudents,
  type AdminAttachment,
  type AdminEnrolleeRecord,
  type StudentScheduledAssignmentItem,
  type StudentSectionChoice,
  type StudentScheduleSelectionRequestRecord,
  type StudentSubjectPlanItem,
  type StudentSubjectPlanRecord,
} from "../../services/adminStorage";
import {
  getEstimatedCollegeTuition,
  updateAdmissionProgress,
} from "../../services/admission";
import {
  getStudentAcademicStanding,
  getStudentGradeRecords,
  type StoredStudentGradeRecord,
} from "../../services/studentGrades";
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

type StudentLifecycleStatus = "Undergraduate" | "Graduated" | "Dropped";

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
const STUDENTS_API_URL = `${API_BASE_URL}/api/students/`;
const ALUMNI_API_URL = `${API_BASE_URL}/api/alumni/`;
const ENROLLEE_STORAGE_SCOPE = "enrollees";
const RECOVERABLE_BRANCHES = ["Bacoor", "Taytay", "GMA"] as const;
const STUDENT_EXPORT_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

const mapUiStatusToApiStatus = (status: Student["status"]): string => {
  if (status === "Archived") return "Inactive";
  return status;
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

const getAdmissionTypeLabel = (studentStatus?: string) =>
  studentStatus?.trim() || "Not recorded";

const getStudentLifecycleStatus = (
  student: Pick<Student, "status">,
): StudentLifecycleStatus => {
  if (student.status === "Graduated") {
    return "Graduated";
  }

  if (student.status === "Archived") {
    return "Dropped";
  }

  return "Undergraduate";
};

const buildAlumniBackupRecord = (
  student: Student,
  apiAlumni?: ApiAlumniRecord | null,
): AlumniBackupRecord => ({
  recordId: typeof apiAlumni?.id === "number" ? apiAlumni.id : undefined,
  id: apiAlumni?.student_id || student.id,
  fullName: apiAlumni?.full_name || student.name,
  program: apiAlumni?.program || student.strandOrCourse || student.program,
  yearGraduated: apiAlumni?.year_graduated || "",
  contact: apiAlumni?.contact || student.contact || "",
  becameAlumniOn: apiAlumni?.became_alumni_on || "",
});

const buildLocalAlumniRecord = (student: Student): ApiAlumniRecord => ({
  student_id: student.id,
  full_name: student.name,
  program: student.strandOrCourse || student.program,
  year_graduated: "",
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

const getDisplayedAcademicStandingLabel = (
  student:
    | Pick<Student, "requestedOwnSchedule" | "ownScheduleRequestStatus">
    | null
    | undefined,
  fallbackLabel?: string | null,
): "Regular" | "Irregular" =>
  hasApprovedOwnSchedule(student) || fallbackLabel === "Irregular"
    ? "Irregular"
    : "Regular";

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
  section: Pick<StudentSectionChoice, "program" | "yearLevel" | "semester" | "strand">,
) =>
  [section.program, section.yearLevel, section.strand, section.semester]
    .filter(Boolean)
    .join(" | ");

const buildStudentSectionOptionLabel = (section: StudentSectionChoice) =>
  `${section.code} | ${section.semester} | ${getSectionCapacityLabel(section)}`;

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

const buildShsGradeSummaryRows = (records: StoredStudentGradeRecord[]) => {
  const rows = new Map<string, ShsGradeSummaryRow>();

  records.forEach((record) => {
    const quarterLabel = record.gradingPeriod as ShsQuarterLabel;
    if (!SHS_QUARTER_DISPLAY_ORDER.includes(quarterLabel)) {
      return;
    }

    const key = `${record.subjectCode}::${record.subjectTitle}`;
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

const mapStudentToApiPayload = (student: Student) => {
  const { firstName, middleName, lastName } = splitFullName(student.name);

  return {
    student_id: student.id,
    first_name: firstName,
    middle_name: middleName || "",
    last_name: lastName,
    email: student.email,
    phone: student.contact,
    contact: student.contact,
    program: student.program,
    year_level: student.yearLevel,
    strand_or_course: student.strandOrCourse || null,
    address: student.address,
    status: mapUiStatusToApiStatus(student.status),
    document_submitted_date: student.documentSubmitted || null,
  };
};

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
  const storedApprovedEnrollees =
    readBranchScopedData<AdminEnrolleeRecord[]>(
      ENROLLEE_STORAGE_SCOPE,
      resolvedBranch,
    ) ?? [];

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
  const [filterStudentLifecycleStatus, setFilterStudentLifecycleStatus] =
    useState<"All" | StudentLifecycleStatus>("Undergraduate");
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
  const [pendingScholarshipScore, setPendingScholarshipScore] = useState("");
  const [isSavingScholarshipScore, setIsSavingScholarshipScore] =
    useState(false);
  const [scholarshipScoreFeedback, setScholarshipScoreFeedback] =
    useState<InlineFeedback | null>(null);
  const [pendingSectionCode, setPendingSectionCode] = useState("");
  const [isSavingSectionChange, setIsSavingSectionChange] = useState(false);
  const [sectionChangeFeedback, setSectionChangeFeedback] =
    useState<InlineFeedback | null>(null);
  const [gradeTermFilter, setGradeTermFilter] = useState("all");
  const [gradeSearchTerm, setGradeSearchTerm] = useState("");

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
  });

  // Errors for add/edit
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof Student, string>>
  >({});

  // Students data
  const [students, setStudents] = useState<Student[]>(() =>
    getStudentsForBranch(currentBranch) as Student[],
  );

  useEffect(() => {
    let isCancelled = false;

    const loadStudentsForBranch = async () => {
      setIsLoading(true);
      setStudentRecoveryMessage(null);

      try {
        let branchStudents = getStudentsForBranch(currentBranch) as Student[];

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

          branchStudents = getStudentsForBranch(currentBranch) as Student[];

          if (!isCancelled) {
            if (branchStudents.length > 0) {
              setStudentRecoveryMessage(
                storedStudentCount === 0
                  ? `Recovered approved students for ${recoveredBranches} branch${recoveredBranches === 1 ? "" : "es"}.`
                  : `Recovered ${branchStudents.length} approved student${branchStudents.length === 1 ? "" : "s"} for ${currentBranch}.`,
              );
            } else if (recoveredBranches === 0) {
              setStudentRecoveryMessage(
                `No approved students were found to restore for ${currentBranch}.`,
              );
            }
          }
        }

        if (!isCancelled) {
          setStudents(branchStudents);
        }
      } catch (error) {
        console.error("Failed to load branch students", error);
        if (!isCancelled) {
          setStudents(getStudentsForBranch(currentBranch) as Student[]);
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
    setHasLoadedStudentPlanData(false);
    setSelectedStudentIds([]);
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
    setHasLoadedStudentPlanData(true);
  }, [currentBranch]);

  useEffect(() => {
    const handleBackupRestoreApplied = () => {
      setStudents(getStudentsForBranch(currentBranch) as Student[]);
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
    const studentsFromOtherBranches = readStoredStudents().filter(
      (student) => normalizeBranchName(student.branch) !== currentBranch,
    );

    writeStoredStudents([...studentsFromOtherBranches, ...students]);
  }, [students, currentBranch]);

  useEffect(() => {
    setSelectedStudentIds((prev) =>
      prev.filter((studentId) =>
        students.some(
          (student) =>
            student.id === studentId &&
            student.status !== "Archived" &&
            student.status !== "Graduated",
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
    [students, currentBranch],
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
      lifecycleStatus.toLowerCase().includes(search) ||
      getAdmissionTypeLabel(student.studentStatus).toLowerCase().includes(search) ||
      academicStanding.toLowerCase().includes(search);

    const matchesProgram =
      filterProgram === "All Programs" || student.program === filterProgram;
    const matchesYearLevel =
      filterYearLevel === "" || student.yearLevel === filterYearLevel;
    const matchesSection =
      filterSection === "" || (student.section || "") === filterSection;
    const matchesStudentLifecycleStatus =
      filterStudentLifecycleStatus === "All" ||
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
  const selectedStudents = students.filter((student) =>
    selectedStudentIds.includes(student.id) &&
    isStudentSelectableForBulkActions(student),
  );
  const isAnyAlumniMovePending = isBulkMovingToAlumni;
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

  const generateNextStudentId = () => {
    return getNextStudentNumber(currentBranch);
  };

  // Open add/edit modal
  const openAddEditModal = (student?: Student) => {
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
      setEditingStudent(null);
      setFormData({
        id: generateNextStudentId(),
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

    try {
      if (editingStudent?.recordId) {
        const response = await fetch(
          `${STUDENTS_API_URL}${editingStudent.recordId}/`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(mapStudentToApiPayload(normalizedStudent)),
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.detail || "Failed to update student.");
        }
      } else {
        try {
          const response = await fetch(STUDENTS_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(mapStudentToApiPayload(normalizedStudent)),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const firstError = Object.values(errorData).find((value) =>
              Array.isArray(value),
            ) as string[] | undefined;
            throw new Error(firstError?.[0] || "Failed to create student.");
          }
        } catch (networkError) {
          console.warn(
            "Falling back to local student storage for save",
            networkError,
          );
        }
      }

      setStudents((prev) =>
        editingStudent
          ? prev.map((student) =>
              student.id === editingStudent.id ? normalizedStudent : student,
            )
          : [normalizedStudent, ...prev.filter((student) => student.id !== normalizedStudent.id)],
      );
      setIsAddEditModalOpen(false);
    } catch (error) {
      console.error("Failed to save student", error);
      const message =
        error instanceof Error ? error.message : "Unable to save student.";
      alert(message);
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
      setStudents((prev) =>
        prev.map((record) =>
          record.id === studentToArchive
            ? { ...record, status: "Archived" }
            : record,
        ),
      );
      setIsArchiveModalOpen(false);
      setStudentToArchive(null);
    };

    if (!student?.recordId) {
      archiveStudentLocally();
      return;
    }

    try {
      const response = await fetch(`${STUDENTS_API_URL}${student.recordId}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "Inactive" }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData?.detail || "Failed to move student to Archive.",
        );
      }

      archiveStudentLocally();
    } catch (error) {
      console.error("Failed to archive student", error);
      const message =
        error instanceof Error
          ? error.message
          : "Unable to move student to Archive.";
      alert(message);
    }
  };

  const cancelArchive = () => {
    setIsArchiveModalOpen(false);
    setStudentToArchive(null);
  };

  const openViewModal = (student: Student) => {
    setSectionChangeFeedback(null);
    setPendingSectionCode(student.section || "");
    setGradeTermFilter("all");
    setGradeSearchTerm("");
    setViewingStudent(student);
  };

  const closeViewModal = () => {
    setViewingStudent(null);
    setPendingScholarshipScore("");
    setScholarshipScoreFeedback(null);
    setPendingSectionCode("");
    setSectionChangeFeedback(null);
    setGradeTermFilter("all");
    setGradeSearchTerm("");
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
      parsedScore > 100
    ) {
      setScholarshipScoreFeedback({
        type: "warning",
        message: "Enter a scholarship exam score from 0 to 100.",
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
          appliedForScholarship: record.appliedForScholarship,
          scholarshipExamScore: parsedScore,
        });

        return {
          ...record,
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
              message: "Scholarship exam score updated successfully.",
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

  const handleApplySectionChange = async () => {
    if (!viewingStudent) {
      return;
    }

    const normalizedSectionCode = pendingSectionCode.trim();
    if (!normalizedSectionCode) {
      setSectionChangeFeedback({
        type: "warning",
        message: "Choose a section before moving this student.",
      });
      return;
    }

    setIsSavingSectionChange(true);

    try {
      const updateResult = updateStoredStudentSection({
        branch: viewingStudent.branch || currentBranch,
        studentNumber: viewingStudent.id,
        trackingNumber: viewingStudent.trackingNumber,
        nextSectionCode: normalizedSectionCode,
      });

      if (!updateResult) {
        throw new Error("No linked student record was found for this update.");
      }

      const refreshedStudents = getStudentsForBranch(currentBranch) as Student[];
      const refreshedViewingStudent =
        refreshedStudents.find(
          (student) =>
            student.id === viewingStudent.id ||
            (viewingStudent.trackingNumber &&
              student.trackingNumber === viewingStudent.trackingNumber),
        ) ?? updateResult.student;

      setStudents(refreshedStudents);
      setViewingStudent(refreshedViewingStudent);
      setSectionChangeFeedback(
        updateResult.didChange
          ? {
              type: "success",
              message: updateResult.previousSection
                ? `Student moved from ${updateResult.previousSection} to ${updateResult.nextSection}.`
                : `Student assigned to ${updateResult.nextSection}.`,
            }
          : {
              type: "warning",
              message: `${viewingStudent.name} is already assigned to ${updateResult.nextSection}.`,
            },
      );
    } catch (error) {
      console.error("Failed to update student section", error);
      setSectionChangeFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to update the student's section.",
      });
    } finally {
      setIsSavingSectionChange(false);
    }
  };

  const moveStudentsToAlumni = async (studentsToMove: Student[]) => {
    const movedStudentIds: string[] = [];
    const failedStudents: string[] = [];
    const createdAlumniRecords: AlumniBackupRecord[] = [];
    const locallyCachedStudents: string[] = [];

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
              year_graduated: "",
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

        if (student.recordId) {
          try {
            const response = await fetch(`${STUDENTS_API_URL}${student.recordId}/`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ status: "Graduated" }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(
                errorData?.detail || "Unable to sync graduated status.",
              );
            }
          } catch (error) {
            console.warn(
              "Unable to sync graduated status to backend student API.",
              error,
            );
          }
        }

        rememberAlumniStudentStatus(student.id, student.status);
        movedStudentIds.push(student.id);
        createdAlumniRecords.push(buildAlumniBackupRecord(student, createdAlumni));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to move to alumni.";
        failedStudents.push(`${student.name}: ${message}`);
      }
    }

    if (movedStudentIds.length > 0) {
      setStudents((prev) =>
        prev.map((student) =>
          movedStudentIds.includes(student.id)
            ? { ...student, status: "Graduated" }
            : student,
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
      alert(failedStudents.join("\n"));
    }

    return movedStudentIds.length;
  };

  const handleMoveSelectedStudentsToAlumni = async () => {
    if (selectedStudents.length === 0) {
      return;
    }

    const shouldContinue = window.confirm(
      `Move ${selectedStudents.length} selected student${selectedStudents.length === 1 ? "" : "s"} to alumni?`,
    );
    if (!shouldContinue) {
      return;
    }

    setIsBulkMovingToAlumni(true);

    try {
      await moveStudentsToAlumni(selectedStudents);
    } finally {
      setIsBulkMovingToAlumni(false);
    }
  };

  const getStudentStatusClassName = (status: Student["status"]) => {
    if (status === "Complete") return "students-status-complete";
    if (status === "Archived") return "students-status-archived";
    return "students-status-incomplete";
  };

  const getStudentLifecycleStatusClassName = (status: StudentLifecycleStatus) => {
    if (status === "Graduated") {
      return "students-lifecycle-status-graduated";
    }

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
  const viewingStudentCredentialStatus = viewingStudentRequirements
    ? viewingStudentRequirements.summary.rejected > 0
      ? {
          label: "Needs Reupload",
          className: "students-credential-status-alert",
        }
      : viewingStudentRequirements.summary.pending === 0
        ? {
            label: "Completed",
            className: "students-credential-status-complete",
          }
        : viewingStudentRequirements.summary.submitted === 0
          ? {
              label: "Pending",
              className: "students-credential-status-pending",
            }
          : {
              label: "Partially Submitted",
              className: "students-credential-status-partial",
            }
    : {
        label: "No linked admission record",
        className: "students-credential-status-empty",
      };
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
  const viewingStudentOwnScheduleReason = hasApprovedOwnSchedule(viewingStudent)
    ? "This student was approved for own-schedule admission and is treated as irregular while the customized load is being managed."
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
    [currentBranch, viewingStudent],
  );
  const viewingStudentGradeTerms = sortAcademicTerms(
    Array.from(
      new Map(
        viewingStudentGradeRecords
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
  const viewingStudentGradeTriggerIds = useMemo(
    () =>
      new Set(
        viewingStudentAcademicStanding?.triggerGrades.map((grade) => grade.id) ??
          [],
      ),
    [viewingStudentAcademicStanding],
  );
  const viewingStudentGradeTermOptions = viewingStudentGradeTerms.map(
    ({ academicYear, semester }) => ({
      key: buildGradeTermKey(academicYear, semester),
      label: `${semester} • ${academicYear}`,
    }),
  );
  const normalizedGradeSearchTerm = gradeSearchTerm.trim().toLowerCase();
  const filteredViewingStudentGradeRecords = useMemo(
    () =>
      viewingStudentGradeRecords.filter((record) => {
        const matchesTerm =
          gradeTermFilter === "all" ||
          gradeTermFilter ===
            buildGradeTermKey(record.academicYear, record.semester);
        const matchesSearch =
          !normalizedGradeSearchTerm ||
          getGradeSearchHaystack(record).includes(normalizedGradeSearchTerm);

        return matchesTerm && matchesSearch;
      }),
    [gradeTermFilter, normalizedGradeSearchTerm, viewingStudentGradeRecords],
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
            ? "Submitted"
            : "Pending"
          : "Not required";
  const viewingStudentScholarshipStatus =
    !viewingStudentRequirements
      ? "No linked admission record"
      : !isViewingCollegeStudent
        ? "Not applicable"
        : viewingStudentApplicantRecord?.appliedForScholarship
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
  const canEditViewingStudentScholarshipScore =
    isViewingCollegeStudent &&
    Boolean(viewingStudent && viewingStudentApplicantRecord?.trackingNumber);
  const canManageViewingStudentSection =
    Boolean(viewingStudent) &&
    viewingStudent?.status !== "Archived" &&
    viewingStudent?.status !== "Graduated";
  const viewingStudentSectionChoices = viewingStudent
    ? getStudentSectionChoices({
        branch: viewingStudent.branch || currentBranch,
        program: viewingStudent.program,
        yearLevel: viewingStudent.yearLevel,
        strandOrCourse: viewingStudent.strandOrCourse,
        currentSectionCode: viewingStudent.section,
      })
    : [];
  const viewingStudentCurrentSectionChoice = viewingStudent
    ? viewingStudentSectionChoices.find(
        (section) => section.code === (viewingStudent.section || "").trim(),
      ) ?? null
    : null;
  const pendingSectionChoice =
    viewingStudentSectionChoices.find((section) => section.code === pendingSectionCode) ??
    null;
  const canApplyViewingStudentSectionChange =
    canManageViewingStudentSection &&
    Boolean(pendingSectionCode.trim()) &&
    pendingSectionCode.trim() !== (viewingStudent?.section || "").trim();

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

  useEffect(() => {
    if (!viewingStudent) {
      setPendingSectionCode("");
      return;
    }

    setPendingSectionCode((viewingStudent.section || "").trim());
  }, [viewingStudent]);

  const requirementNotifications: StudentRequirementNotification[] = students
    .filter(
      (student) =>
        student.status !== "Archived" && student.status !== "Graduated",
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
          const student =
            students.find(
              (record) =>
                record.id === request.studentNumber ||
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
    [studentScheduleRequests, students],
  );
  const pendingScheduleNotificationCount = pendingScheduleNotifications.length;

  const handleEditFromView = () => {
    if (!viewingStudent) return;
    const selectedStudent = viewingStudent;
    closeViewModal();
    openAddEditModal(selectedStudent);
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
      alert("Unable to update requirement review status.");
      return;
    }

    setStudents((prev) => [...prev]);
  };

  const handleScheduleSelectionDecision = (
    notification: StudentScheduleSelectionNotification,
    status: "Approved" | "Rejected",
  ) => {
    if (
      status === "Approved" &&
      buildScheduledAssignmentConflicts(notification.request.selections).length > 0
    ) {
      alert(
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

      setStudentSubjectPlans((prev) => ({
        ...prev,
        [planKey]: {
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
        },
      }));
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

    const refreshedStudents = getStudentsForBranch(currentBranch) as Student[];
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

    alert(
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
      alert("No students match the current filters.");
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
              : student.strandOrCourse || student.program,
          Specialization:
            student.program === "SHS"
              ? getShsSpecializationDisplay(student)
              : student.strandOrCourse || "N/A",
          "Year Level":
            student.program === "SHS"
              ? getShsYearLevelDisplay(student)
              : student.yearLevel || "N/A",
          Section: student.section || "N/A",
          "Student Status": getStudentLifecycleStatus(student),
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
        ["Student Status Filter", filterStudentLifecycleStatus],
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
      alert("Unable to export the current student list right now.");
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
            placeholder="Search by Name, ID, Email, Status..."
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
                Move selected students to alumni when you are ready to continue
                the alumni workflow.
              </span>
            </div>
            <div className="students-bulk-action-buttons">
              <button
                type="button"
                className="students-bulk-move-btn"
                onClick={handleMoveSelectedStudentsToAlumni}
                disabled={isAnyAlumniMovePending}
              >
                {isBulkMovingToAlumni ? "Moving..." : "Move to Alumni"}
              </button>
              <button
                type="button"
                className="students-bulk-clear-btn"
                onClick={() => setSelectedStudentIds([])}
                disabled={isAnyAlumniMovePending}
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
            <label>Student Status</label>
            <select
              value={filterStudentLifecycleStatus}
              onChange={(e) =>
                setFilterStudentLifecycleStatus(
                  e.target.value as "All" | StudentLifecycleStatus,
                )
              }
            >
              <option value="All">All</option>
              <option value="Undergraduate">Undergraduate</option>
              <option value="Graduated">Graduated</option>
              <option value="Dropped">Dropped</option>
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
                <th>Specialization</th>
                <th>Grade Year</th>
                <th>Section</th>
                <th>Student Status</th>
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
                    <td className="students-selection-column">
                      <input
                        type="checkbox"
                        className="students-selection-checkbox"
                        checked={selectedStudentIds.includes(student.id)}
                        onChange={() => toggleStudentSelection(student.id)}
                        disabled={!isStudentSelectableForBulkActions(student)}
                        aria-label={`Select ${student.name}`}
                      />
                    </td>
                    <td>{student.id}</td>
                    <td>{student.name}</td>
                    <td>
                      {student.program === "SHS"
                        ? getShsTrackDisplay(student)
                        : student.strandOrCourse || student.program}
                    </td>
                    <td>
                      {student.program === "SHS"
                        ? getShsSpecializationDisplay(student)
                        : "—"}
                    </td>
                    <td>
                      {student.program === "SHS"
                        ? getShsYearLevelDisplay(student)
                        : student.yearLevel}
                    </td>
                    <td>
                      <span className="students-admission-type-badge">
                        {student.section || "N/A"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={getStudentLifecycleStatusClassName(
                          getStudentLifecycleStatus(student),
                        )}
                      >
                        {getStudentLifecycleStatus(student)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={getStudentStatusClassName(student.status)}
                      >
                        {student.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={getAcademicStandingClassName(
                          getStudentAcademicStandingLabel(student),
                        )}
                      >
                        {getStudentAcademicStandingLabel(student)}
                      </span>
                    </td>
                    <td className="students-action-cell">
                      <div className="students-action-group">
                        <button
                          className="students-action-btn students-view-btn"
                          onClick={() => openViewModal(student)}
                          disabled={isAnyAlumniMovePending}
                        >
                          View Details
                        </button>
                        {student.status !== "Archived" &&
                        student.status !== "Graduated" ? (
                          <button
                            className="students-action-btn students-archive-btn students-icon-only-btn"
                            onClick={() => openArchiveConfirm(student.id)}
                            disabled={isAnyAlumniMovePending}
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
                  <td colSpan={11} className="students-no-results">
                    {isLoading
                      ? "Loading students..."
                      : "No students found matching your search."}
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
                  <div className="students-profile-field">
                    <label>Own Schedule Admission</label>
                    <div className="students-profile-value">
                      {viewingStudent.requestedOwnSchedule
                        ? viewingStudent.ownScheduleRequestStatus || "Requested"
                        : "Standard"}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Schedule Selection</label>
                    <div className="students-profile-value">
                      {viewingStudent.requestedOwnSchedule
                        ? getOwnScheduleSelectionLabel(
                            viewingStudent.ownScheduleSelectionStatus,
                          )
                        : "Not applicable"}
                    </div>
                  </div>
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
                  <div className="students-profile-field">
                    <label>Admission Type</label>
                    <div className="students-profile-value students-profile-admission-type">
                      {getAdmissionTypeLabel(viewingStudent.studentStatus)}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Credential Status</label>
                    <div
                      className={`students-profile-value students-profile-value-highlight ${viewingStudentCredentialStatus.className}`}
                    >
                      {viewingStudentCredentialStatus.label}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Branch</label>
                    <div className="students-profile-value">
                      {viewingStudent.branch || currentBranch}
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
                      {viewingStudent.strandOrCourse || "Not assigned"}
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
                  <div className="students-profile-field students-profile-field-full">
                    <label>Section Management</label>
                    <div className="students-profile-value students-profile-list-box students-section-management-box">
                      <div className="students-section-management-current">
                        <div className="students-section-management-copy">
                          <strong>
                            Current section: {viewingStudent.section || "Not assigned"}
                          </strong>
                          <span>
                            {viewingStudentCurrentSectionChoice
                              ? getSectionDescriptorLabel(
                                  viewingStudentCurrentSectionChoice,
                                )
                              : "Review and move this student to another matching section when needed."}
                          </span>
                        </div>
                        {viewingStudentCurrentSectionChoice ? (
                          <span
                            className={`students-section-capacity-badge ${
                              viewingStudentCurrentSectionChoice.isFull
                                ? "full"
                                : "available"
                            }`}
                          >
                            {getSectionCapacityLabel(
                              viewingStudentCurrentSectionChoice,
                            )}
                          </span>
                        ) : null}
                      </div>

                      {canManageViewingStudentSection ? (
                        viewingStudentSectionChoices.length > 0 ? (
                          <>
                            <div className="students-section-management-controls">
                              <select
                                value={pendingSectionCode}
                                onChange={(event) => {
                                  setPendingSectionCode(event.target.value);
                                  if (sectionChangeFeedback) {
                                    setSectionChangeFeedback(null);
                                  }
                                }}
                                disabled={isSavingSectionChange}
                              >
                                <option value="">Select section</option>
                                {viewingStudentSectionChoices.map((sectionChoice) => (
                                  <option
                                    key={sectionChoice.id}
                                    value={sectionChoice.code}
                                  >
                                    {buildStudentSectionOptionLabel(sectionChoice)}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="students-save-btn students-inline-save-btn"
                                onClick={handleApplySectionChange}
                                disabled={
                                  !canApplyViewingStudentSectionChange ||
                                  isSavingSectionChange
                                }
                              >
                                {isSavingSectionChange
                                  ? "Moving..."
                                  : "Move Student"}
                              </button>
                            </div>
                            {pendingSectionChoice ? (
                              <p className="students-scholarship-score-hint">
                                Move to {pendingSectionChoice.code}:{" "}
                                {getSectionDescriptorLabel(pendingSectionChoice)}{" "}
                                ({getSectionCapacityLabel(pendingSectionChoice)})
                              </p>
                            ) : (
                              <p className="students-scholarship-score-hint">
                                Select a section to move this student and keep the
                                section count updated.
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="students-scholarship-score-hint">
                            No matching section is available yet. Create or assign
                            sections in the enrollees section first.
                          </p>
                        )
                      ) : (
                        <p className="students-scholarship-score-hint">
                          Section changes are only available for active
                          undergraduate students.
                        </p>
                      )}

                      {sectionChangeFeedback ? (
                        <p
                          className={`students-inline-feedback ${sectionChangeFeedback.type}`}
                        >
                          {sectionChangeFeedback.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Submitted Date</label>
                    <div className="students-profile-value">
                      {viewingStudent.documentSubmitted || "Not submitted"}
                    </div>
                  </div>
                  <div className="students-profile-field students-profile-field-full">
                    <label>Email Address</label>
                    <div className="students-profile-value students-profile-email">
                      {viewingStudent.email || "Not provided"}
                    </div>
                  </div>
                  <div className="students-profile-field students-profile-field-full">
                    <label>Contact Number</label>
                    <div className="students-profile-value">
                      {viewingStudent.contact || "Not provided"}
                    </div>
                  </div>
                  <div className="students-profile-field students-profile-field-full">
                    <label>Home Address</label>
                    <div className="students-profile-value students-profile-address">
                      {viewingStudent.address || "No address provided"}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Requirements</label>
                    <div className="students-profile-value">
                      {viewingStudentRequirements
                        ? `${viewingStudentRequirements.summary.submitted}/${viewingStudentRequirements.summary.total} submitted`
                        : "No linked admission record"}
                    </div>
                  </div>
                  <div className="students-profile-field">
                    <label>Pending Requirements</label>
                    <div className="students-profile-value">
                      {viewingStudentRequirements
                        ? viewingStudentRequirements.summary.pending
                        : "N/A"}
                    </div>
                  </div>
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
                            max="100"
                            step="0.01"
                            value={pendingScholarshipScore}
                            onChange={(event) => {
                              setPendingScholarshipScore(event.target.value);
                              if (scholarshipScoreFeedback) {
                                setScholarshipScoreFeedback(null);
                              }
                            }}
                            placeholder="Enter 0 to 100"
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
                          You can still update the scholarship exam score after
                          approval from this view.
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
                  <div className="students-profile-field students-profile-field-full">
                    <label>Submitted Files</label>
                    <div className="students-profile-value students-profile-list-box">
                      {viewingStudentRequirements &&
                      viewingStudentRequirements.submittedAttachments.length > 0 ? (
                        <div className="students-profile-list">
                          {viewingStudentRequirements.submittedAttachments.map(
                            (attachment) => (
                              <div
                                key={attachment.name}
                                className="students-profile-list-item"
                              >
                                <span>
                                  <strong>{attachment.name}</strong>
                                  {" "}
                                  ({attachment.reviewStatus || "Pending"})
                                </span>
                                {attachment.url && attachment.url !== "#" ? (
                                  <a
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    View
                                  </a>
                                ) : (
                                  <span>Reference only</span>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      ) : (
                        "No submitted files"
                      )}
                    </div>
                  </div>
                  <div className="students-profile-field students-profile-field-full">
                    <label>Pending List</label>
                    <div className="students-profile-value students-profile-list-box">
                      {viewingStudentRequirements &&
                      viewingStudentRequirements.pendingRequirements.length > 0 ? (
                        <div className="students-profile-list">
                          {viewingStudentRequirements.pendingRequirements.map(
                            (requirement) => (
                              <div
                                key={requirement.code}
                                className="students-profile-list-item"
                              >
                                <span>{requirement.name}</span>
                              </div>
                            ),
                          )}
                        </div>
                      ) : (
                        "No pending requirements"
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
                              <label htmlFor="students-grade-term-filter">
                                Term
                              </label>
                              <select
                                id="students-grade-term-filter"
                                value={gradeTermFilter}
                                onChange={(event) =>
                                  setGradeTermFilter(event.target.value)
                                }
                              >
                                <option value="all">All Terms</option>
                                {viewingStudentGradeTermOptions.map((option) => (
                                  <option key={option.key} value={option.key}>
                                    {option.label}
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
                          {filteredViewingStudentGradeTerms.map(
                            ({ academicYear, semester }) => {
                              const termGrades =
                                filteredViewingStudentGradeRecords.filter(
                                (record) =>
                                  record.academicYear === academicYear &&
                                  record.semester === semester,
                                );

                              if (isViewingCollegeStudent) {
                                const sortedTermGrades =
                                  sortCollegeGradeRecords(termGrades);
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
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              }

                              const shsRows = buildShsGradeSummaryRows(termGrades);

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
                                          <th>1st Quarter</th>
                                          <th>2nd Quarter</th>
                                          <th>3rd Quarter</th>
                                          <th>4th Quarter</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {shsRows.map((row) => (
                                          <tr key={row.key}>
                                            <td>{row.subjectCode}</td>
                                            <td>{row.subjectTitle}</td>
                                            <td>
                                              {row.quarterGrades["1st Quarter"]}
                                            </td>
                                            <td>
                                              {row.quarterGrades["2nd Quarter"]}
                                            </td>
                                            <td>
                                              {row.quarterGrades["3rd Quarter"]}
                                            </td>
                                            <td>
                                              {row.quarterGrades["4th Quarter"]}
                                            </td>
                                          </tr>
                                        ))}
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
                  disabled={isAnyAlumniMovePending}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="students-cancel-btn"
                  onClick={closeViewModal}
                  disabled={isAnyAlumniMovePending}
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
                                : notification.student.strandOrCourse ||
                                  notification.student.program}
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
                  className="students-archive-confirm-btn students-icon-only-btn"
                  onClick={confirmArchive}
                  aria-label="Confirm move to Archive"
                  title="Confirm move to Archive"
                >
                  <MdArchive />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
