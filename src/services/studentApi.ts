import type { Student } from "../types/student";
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/user";
import { isCachedAlumniStudent } from "./backupApi";
import {
  getStudentCredentialOverview,
  getStudentsForBranch,
  normalizeStudentNumberInput,
  normalizeBranchName,
  readStoredStudents,
  writeStoredStudents,
  type StudentPortalCredentialItem,
  type StudentPortalCredentialSummary,
  type StudentPortalSubject,
  type StudentStorageRecord,
} from "./adminStorage";
import { fetchAndCacheAcademicSnapshot } from "./academicData";
import { fetchAdminStudents, saveAdminStudent } from "./adminStudentsApi";
import {
  fetchStudentPlanningStates,
  fetchStudentScheduleRequests,
  fetchStudentSubjectPlans,
  mergeStudentPlanningStateIntoStudent,
} from "./studentPlanningApi";
import {
  fetchEnrollmentRequests,
  hasLatestApprovedIrregularEnrollmentRequestForStudent,
} from "./enrollmentRequests";
import {
  resolveStudentPortalContext,
  type StudentPortalCurrentTerm,
} from "./studentPortalResolver";
import { getStudentAcademicStanding } from "./studentGrades";
import { fetchAndCacheStudentPaymentsForBranch } from "./studentPayments";
import {
  toDisplayCapitalization,
  toNameCapitalization,
} from "../utils/textFormatting";
export type { StudentPortalCurrentTerm } from "./studentPortalResolver";

export interface StudentPortalData {
  student: Student;
  subjects: StudentPortalSubject[];
  credentialItems: StudentPortalCredentialItem[];
  credentialSummary: StudentPortalCredentialSummary | null;
  currentTerm: StudentPortalCurrentTerm;
}

const DEFAULT_STUDENT_EMAIL = "";
const DEFAULT_STUDENT_CONTACT = "";
const DEFAULT_STUDENT_ADDRESS = "";
const DEFAULT_STUDENT_PROGRAM = "";
const DEFAULT_STUDENT_YEAR_LEVEL = "";
const DEFAULT_STUDENT_BRANCH = "Bacoor";
const DEFAULT_STUDENT_GENDER: Student["gender"] = "Male";
const DEFAULT_STUDENT_CIVIL_STATUS = "";
const DEFAULT_STUDENT_RELIGION = "";
const DEFAULT_STUDENT_GUARDIAN_NAME = "";
const DEFAULT_STUDENT_GUARDIAN_CONTACT = "";

const wait = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const getCurrentStudentSessionUser = (): AuthSession["user"] | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = localStorage.getItem(AUTH_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession) as AuthSession;

    if (parsedSession.user.role !== "student") {
      return null;
    }

    return parsedSession.user;
  } catch (error) {
    console.error("Failed to resolve current student session", error);
    return null;
  }
};

const studentNumbersMatch = (
  leftValue?: string | null,
  rightValue?: string | null,
  branch?: string | null,
) => {
  if (!leftValue || !rightValue) {
    return false;
  }

  const normalizedLeft =
    normalizeStudentNumberInput(leftValue, branch) ||
    normalizeStudentNumberInput(leftValue);
  const normalizedRight =
    normalizeStudentNumberInput(rightValue, branch) ||
    normalizeStudentNumberInput(rightValue);

  return normalizedLeft.toUpperCase() === normalizedRight.toUpperCase();
};

const mergeStudentIntoLocalCache = (student: StudentStorageRecord) => {
  const currentBranch = normalizeBranchName(student.branch);
  const existingStudent =
    readStoredStudents().find((storedStudent) => {
      if (normalizeBranchName(storedStudent.branch) !== currentBranch) {
        return false;
      }

      if (storedStudent.id === student.id) {
        return true;
      }

      return Boolean(
        storedStudent.trackingNumber &&
          student.trackingNumber &&
          storedStudent.trackingNumber === student.trackingNumber,
      );
    }) ?? null;
  const studentWithPlanningFallback: StudentStorageRecord = {
    ...student,
    requestedOwnSchedule:
      student.requestedOwnSchedule || existingStudent?.requestedOwnSchedule,
    ownScheduleRequestStatus:
      student.ownScheduleRequestStatus || existingStudent?.ownScheduleRequestStatus,
    ownScheduleAcademicYear:
      student.ownScheduleAcademicYear || existingStudent?.ownScheduleAcademicYear,
    ownScheduleSemester:
      student.ownScheduleSemester || existingStudent?.ownScheduleSemester,
    ownScheduleSelectionStatus:
      student.ownScheduleSelectionStatus ||
      existingStudent?.ownScheduleSelectionStatus,
  };
  const nextStudents = [
    ...readStoredStudents().filter((storedStudent) => {
      if (normalizeBranchName(storedStudent.branch) !== currentBranch) {
        return true;
      }

      if (storedStudent.id === student.id) {
        return false;
      }

      return !(
        storedStudent.trackingNumber &&
        student.trackingNumber &&
        storedStudent.trackingNumber === student.trackingNumber
      );
    }),
    studentWithPlanningFallback,
  ];

  writeStoredStudents(nextStudents);
  return studentWithPlanningFallback;
};

const getStoredStudentRecordForCurrentSession = (
  sessionUser = getCurrentStudentSessionUser(),
): StudentStorageRecord | null => {
  if (!sessionUser?.studentNumber) {
    return null;
  }

  try {
    const currentBranch = normalizeBranchName(sessionUser.branch);
    return (
      readStoredStudents().find(
        (student) =>
          studentNumbersMatch(student.id, sessionUser.studentNumber, currentBranch) &&
          normalizeBranchName(student.branch) === currentBranch,
      ) || null
    );
  } catch (error) {
    console.error("Failed to resolve student session record", error);
    return null;
  }
};

const syncStudentPortalAcademicCache = async (
  branch?: string | null,
) => {
  if (!branch?.trim()) {
    return;
  }

  await Promise.all([
    fetchAndCacheAcademicSnapshot(branch),
    fetchAndCacheStudentPaymentsForBranch(branch),
    fetchStudentPlanningStates(branch),
    fetchStudentSubjectPlans(branch),
    fetchStudentScheduleRequests(branch),
    fetchEnrollmentRequests(branch),
  ]);
};

const fetchRemoteStudentRecordForCurrentSession = async (
  sessionUser: AuthSession["user"],
) => {
  if (!sessionUser.studentNumber) {
    return null;
  }

  const remoteStudents = await fetchAdminStudents(sessionUser.branch);
  const remoteStudent =
    remoteStudents.find(
      (student) =>
        studentNumbersMatch(
          student.id,
          sessionUser.studentNumber,
          sessionUser.branch,
        ) ||
        (sessionUser.trackingNumber &&
          student.trackingNumber === sessionUser.trackingNumber),
    ) ?? null;

  if (!remoteStudent) {
    return null;
  }

  const [planningStates, scheduleRequests] = await Promise.all([
    fetchStudentPlanningStates(sessionUser.branch),
    fetchStudentScheduleRequests(sessionUser.branch),
  ]);
  const matchingPlanningState =
    planningStates.find(
      (state) =>
        state.studentNumber === remoteStudent.id ||
        (remoteStudent.trackingNumber &&
          state.trackingNumber === remoteStudent.trackingNumber),
    ) ?? null;
  const approvedScheduleRequest =
    scheduleRequests.find(
      (request) =>
        request.status === "Approved" &&
        (request.studentNumber === remoteStudent.id ||
          (remoteStudent.trackingNumber &&
            request.trackingNumber === remoteStudent.trackingNumber)),
    ) ?? null;
  const remoteStudentWithPlanning = matchingPlanningState
    ? mergeStudentPlanningStateIntoStudent(remoteStudent, matchingPlanningState)
    : approvedScheduleRequest
      ? {
          ...remoteStudent,
          requestedOwnSchedule: true,
          ownScheduleRequestStatus: "Approved" as const,
          ownScheduleAcademicYear: approvedScheduleRequest.academicYear,
          ownScheduleSemester: approvedScheduleRequest.semester,
          ownScheduleSelectionStatus: "Approved" as const,
        }
      : remoteStudent;
  const cachedRemoteStudent = mergeStudentIntoLocalCache(
    remoteStudentWithPlanning,
  );
  const resolvedStudent =
    getStudentsForBranch(sessionUser.branch).find(
      (student) =>
        student.id === cachedRemoteStudent.id ||
        (cachedRemoteStudent.trackingNumber &&
          student.trackingNumber === cachedRemoteStudent.trackingNumber),
    ) ?? cachedRemoteStudent;

  return resolvedStudent;
};

const getStudentPortalDataForCurrentSession = async (): Promise<StudentPortalData> => {
  await wait(300);

  const sessionUser = getCurrentStudentSessionUser();
  if (!sessionUser) {
    throw new Error("Student session is missing. Please log in again.");
  }

  if (
    isCachedAlumniStudent({
      studentNumber: sessionUser.studentNumber,
      trackingNumber: sessionUser.trackingNumber,
      branch: sessionUser.branch,
    })
  ) {
    if (typeof window !== "undefined") {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    throw new Error(
      "This student has already been transferred to Alumni and can no longer access the student portal.",
    );
  }

  await syncStudentPortalAcademicCache(sessionUser?.branch);
  let storedStudent = getStoredStudentRecordForCurrentSession(sessionUser);

  const remoteStudent = await fetchRemoteStudentRecordForCurrentSession(
    sessionUser,
  );

  if (remoteStudent) {
    storedStudent = remoteStudent;
  }

  if (storedStudent) {
    const { resolvedStudentRecord, currentTerm, subjects } =
      resolveStudentPortalContext(storedStudent);
    const student = {
      ...mapStoredStudentToPortalStudent(resolvedStudentRecord),
      yearLevel: resolvedStudentRecord.yearLevel,
    };
    const credentialOverview = getStudentCredentialOverview({
      branch: storedStudent.branch,
      studentNumber: storedStudent.id,
      trackingNumber: storedStudent.trackingNumber,
    });

    return {
      student,
      subjects,
      credentialItems: credentialOverview?.items ?? [],
      credentialSummary: credentialOverview?.summary ?? null,
      currentTerm,
    };
  }

  throw new Error("Student record could not be loaded. Please log in again.");
};

const buildFullName = ({
  firstName,
  middleName,
  lastName,
}: {
  firstName?: string;
  middleName?: string;
  lastName?: string;
}) =>
  [firstName, middleName, lastName]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .join(" ")
    .trim();

const getPortalStudentStatus = (
  storedStudent: StudentStorageRecord,
): Student["status"] => {
  const hasIrregularScheduleFlag =
    storedStudent.requestedOwnSchedule === true ||
    storedStudent.ownScheduleRequestStatus === "Approved";
  const hasApprovedIrregularEnrollmentRequest =
    hasLatestApprovedIrregularEnrollmentRequestForStudent({
      branch: storedStudent.branch,
      studentNumber: storedStudent.id,
      trackingNumber: storedStudent.trackingNumber,
    });
  const gradeStanding = getStudentAcademicStanding({
    branch: storedStudent.branch,
    program: storedStudent.program,
    studentId: storedStudent.id,
  }).label;

  if (
    hasIrregularScheduleFlag ||
    hasApprovedIrregularEnrollmentRequest ||
    gradeStanding === "Irregular"
  ) {
    return "Irregular";
  }

  if (storedStudent.studentStatus === "Transferee") {
    return "Transferee";
  }

  return "Regular";
};

const mapStoredStudentToPortalStudent = (
  storedStudent: StudentStorageRecord,
): Student => {
  const fullNameParts = storedStudent.name.trim().split(/\s+/).filter(Boolean);
  const firstName = toNameCapitalization(fullNameParts[0]) || "Student";
  const lastName =
    fullNameParts.length > 1
      ? toNameCapitalization(fullNameParts[fullNameParts.length - 1])
      : "";
  const middleName =
    fullNameParts.length > 2
      ? toNameCapitalization(fullNameParts.slice(1, -1).join(" "))
      : undefined;

  return {
    id: storedStudent.id,
    studentNumber: storedStudent.id,
    trackingNumber: storedStudent.trackingNumber,
    firstName,
    lastName,
    middleName,
    email: storedStudent.email || DEFAULT_STUDENT_EMAIL,
    contactNumber: storedStudent.contact || DEFAULT_STUDENT_CONTACT,
    address:
      toDisplayCapitalization(storedStudent.address) || DEFAULT_STUDENT_ADDRESS,
    program:
      toDisplayCapitalization(storedStudent.strandOrCourse) ||
      toDisplayCapitalization(storedStudent.program) ||
      DEFAULT_STUDENT_PROGRAM,
    yearLevel:
      toDisplayCapitalization(storedStudent.yearLevel) ||
      DEFAULT_STUDENT_YEAR_LEVEL,
    branch:
      toDisplayCapitalization(storedStudent.branch) || DEFAULT_STUDENT_BRANCH,
    section: toDisplayCapitalization(storedStudent.section) || undefined,
    programType: storedStudent.program === "SHS" ? "SHS" : "BS",
    gender: storedStudent.gender || DEFAULT_STUDENT_GENDER,
    birthday: storedStudent.birthDate,
    status: getPortalStudentStatus(storedStudent),
    civilStatus:
      toDisplayCapitalization(storedStudent.civilStatus) ||
      DEFAULT_STUDENT_CIVIL_STATUS,
    religion: DEFAULT_STUDENT_RELIGION,
    guardianName:
      toNameCapitalization(storedStudent.guardianName) ||
      DEFAULT_STUDENT_GUARDIAN_NAME,
    guardianContact:
      storedStudent.guardianContact || DEFAULT_STUDENT_GUARDIAN_CONTACT,
    requestedOwnSchedule: storedStudent.requestedOwnSchedule,
    ownScheduleRequestStatus: storedStudent.ownScheduleRequestStatus,
    ownScheduleAcademicYear: storedStudent.ownScheduleAcademicYear,
    ownScheduleSemester: storedStudent.ownScheduleSemester,
    ownScheduleSelectionStatus: storedStudent.ownScheduleSelectionStatus,
  };
};


const persistStudentProfileUpdate = async (
  storedStudent: StudentStorageRecord,
  data: Partial<Student>,
) => {
  const nextName =
    buildFullName({
      firstName: data.firstName,
      middleName: data.middleName,
      lastName: data.lastName,
    }) || storedStudent.name;

  const nextStudentRecord: StudentStorageRecord = {
    ...storedStudent,
    name: toNameCapitalization(nextName),
    email: data.email ?? storedStudent.email,
    contact: data.contactNumber ?? storedStudent.contact,
    address: toDisplayCapitalization(data.address ?? storedStudent.address),
    birthDate: data.birthday ?? storedStudent.birthDate,
    guardianName: toNameCapitalization(
      data.guardianName ?? storedStudent.guardianName,
    ),
    guardianContact: data.guardianContact ?? storedStudent.guardianContact,
    gender: data.gender ?? storedStudent.gender,
    civilStatus: toDisplayCapitalization(
      data.civilStatus ?? storedStudent.civilStatus,
    ),
    section: toDisplayCapitalization(data.section ?? storedStudent.section),
  };

  const updatedStudents = readStoredStudents().map((student) =>
    student.id === storedStudent.id &&
    normalizeBranchName(student.branch) === normalizeBranchName(storedStudent.branch)
      ? nextStudentRecord
      : student,
  );

  writeStoredStudents(updatedStudents);

  try {
    const savedStudent = await saveAdminStudent(nextStudentRecord);
    return mapStoredStudentToPortalStudent(savedStudent);
  } catch (error) {
    console.warn(
      "Failed to sync updated student profile to Supabase. Keeping the local profile update.",
      error,
    );
    return mapStoredStudentToPortalStudent(nextStudentRecord);
  }
};

export const studentApi = {
  async getStudentPortalData(): Promise<StudentPortalData> {
    return getStudentPortalDataForCurrentSession();
  },

  async getStudent(): Promise<Student> {
    const portalData = await getStudentPortalDataForCurrentSession();
    return portalData.student;
  },

  async updateProfile(data: Partial<Student>): Promise<Student> {
    await wait(300);

    const storedStudent = getStoredStudentRecordForCurrentSession();
    if (storedStudent) {
      return persistStudentProfileUpdate(storedStudent, data);
    }

    const sessionUser = getCurrentStudentSessionUser();
    if (sessionUser) {
      throw new Error("Student record could not be loaded. Please log in again.");
    }

    throw new Error("Student session is missing. Please log in again.");
  },
};
