import type {
  AdmissionApplicationSummary,
  AdmissionDraft,
} from "../types/application";
import { supabase } from "../lib/supabase";
import { getAdmissionRequirements, normalizeBranchCode } from "./admission";
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
  personalInfo: AdminPersonalInformation;
  attachments?: AdminAttachment[];
  convertedAt?: string;
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
  status: "Complete" | "Incomplete" | "Archived";
  branch: string;
  trackingNumber?: string;
  studentStatus?: string;
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

const STUDENT_STORAGE_KEY = "aics-students";
const BRANCH_STORAGE_PREFIX = "aics-admin";
const DEFAULT_BRANCH: AdminBranchName = "Bacoor";
const STUDENT_NUMBER_FLOOR = 261000;
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
  first_name: string;
  honor_label: string | null;
  last_name: string;
  middle_name: string | null;
  phone_number: string;
  program_level: string;
  program_name: string;
  requirement_files: SupabaseRequirementFileRow[] | null;
  requirements_uploaded_at: string | null;
  sex: string;
  student_status_label: string;
  submitted_at: string | null;
  track_name: string;
  tracking_number: string;
  updated_at: string;
  year_completion: number;
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

  if (normalizedBranch === "taytay") {
    return "Taytay";
  }

  if (normalizedBranch === "gma") {
    return "GMA";
  }

  return DEFAULT_BRANCH;
};

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

const normalizeAcademicDescriptor = (value?: string | null) =>
  (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const matchesStrandOrCourse = (
  leftValue?: string | null,
  rightValue?: string | null,
) => {
  const left = normalizeAcademicDescriptor(leftValue);
  const right = normalizeAcademicDescriptor(rightValue);

  if (!left || !right) {
    return true;
  }

  return left.includes(right) || right.includes(left);
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
    : "To be announced";

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
    : "To be announced";

const formatScheduleRooms = (schedule: StoredSchedule[] = []) =>
  schedule.length > 0
    ? Array.from(new Set(schedule.map((slot) => slot.room || "TBA"))).join(", ")
    : "TBA";

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

  return readStoredStudents().find((student) => {
    if (normalizeBranchName(student.branch) !== resolvedBranch) {
      return false;
    }

    if (studentNumber && student.id === studentNumber) {
      return true;
    }

    if (trackingNumber && student.trackingNumber === trackingNumber) {
      return true;
    }

    return false;
  });
};

export const getNextStudentNumber = (
  branch?: string | null,
  students = readStoredStudents(),
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const studentNumbers = students
    .filter((student) => normalizeBranchName(student.branch) === resolvedBranch)
    .map((student) => Number.parseInt(student.id, 10))
    .filter((studentNumber) => Number.isFinite(studentNumber))
    .filter((studentNumber) => studentNumber >= STUDENT_NUMBER_FLOOR);

  const nextStudentNumber =
    studentNumbers.length > 0
      ? Math.max(...studentNumbers) + 1
      : STUDENT_NUMBER_FLOOR + 1;

  return String(nextStudentNumber).padStart(6, "0");
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
      snapshot.summary.pending === 0
        ? "Complete"
        : snapshot.summary.submitted === 0
          ? "Pending Documents"
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

export const getStudentPortalSubjects = (
  student: Pick<
    StudentStorageRecord,
    "branch" | "program" | "yearLevel" | "strandOrCourse" | "section"
  >,
): StudentPortalSubject[] => {
  const branch = normalizeBranchName(student.branch);
  const storedSubjects =
    readBranchScopedData<StoredAcademicSubject[]>("subjects", branch) ?? [];
  const storedAssignments =
    readBranchScopedData<StoredSubjectAssignment[]>("subject-assignments", branch) ??
    [];

  if (student.section) {
    const sectionAssignments = storedAssignments.filter(
      (assignment) => assignment.sectionCode === student.section,
    );

    if (sectionAssignments.length > 0) {
      return sectionAssignments
        .map((assignment) => {
          const subjectDetails = storedSubjects.find(
            (subject) =>
              subject.id === assignment.subjectId ||
              subject.code === assignment.subjectCode,
          );

          return {
            id: assignment.id,
            code: assignment.subjectCode,
            title: assignment.subjectName,
            units: subjectDetails?.units,
            schedule: formatScheduleLabel(assignment.schedule),
            room: formatScheduleRooms(assignment.schedule),
            professor: assignment.instructorName || "To be assigned",
            days: formatScheduleDays(assignment.schedule),
            time: formatScheduleTime(assignment.schedule),
            semester: assignment.semester,
            academicYear: assignment.academicYear,
          };
        })
        .sort((left, right) => left.code.localeCompare(right.code));
    }
  }

  if (storedSubjects.length === 0) {
    return [];
  }

  const defaultAcademicYear = storedAssignments[0]?.academicYear || "2026-2027";
  return storedSubjects
    .filter(
      (subject) =>
        subject.program === student.program &&
        subject.yearLevel === student.yearLevel &&
        matchesStrandOrCourse(subject.strand, student.strandOrCourse),
    )
    .map((subject) => ({
      id: subject.id,
      code: subject.code,
      title: subject.name,
      units: subject.units,
      schedule: "To be announced",
      room: "TBA",
      professor: "To be assigned",
      days: "TBA",
      time: "To be announced",
      semester: subject.semester,
      academicYear: defaultAcademicYear,
    }))
    .sort((left, right) => left.code.localeCompare(right.code));
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
