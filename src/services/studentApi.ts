import type { Student } from "../types/student";
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/user";
import {
  getStudentCredentialOverview,
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
import { fetchStudentSubjectPlans } from "./studentPlanningApi";
import {
  fetchEnrollmentRequests,
  hasLatestApprovedIrregularEnrollmentRequestForStudent,
} from "./enrollmentRequests";
import {
  resolveStudentPortalContext,
  type StudentPortalCurrentTerm,
} from "./studentPortalResolver";
import { getStudentAcademicStanding } from "./studentGrades";
export type { StudentPortalCurrentTerm } from "./studentPortalResolver";

export interface StudentPortalData {
  student: Student;
  subjects: StudentPortalSubject[];
  credentialItems: StudentPortalCredentialItem[];
  credentialSummary: StudentPortalCredentialSummary | null;
  currentTerm: StudentPortalCurrentTerm;
}

const mockStudent: Student = {
  id: "1",
  studentNumber: "BAC-261001",
  firstName: "Hener",
  lastName: "Verdida",
  middleName: "C.",
  email: "hener.verdida@gmail.com",
  contactNumber: "0912 345 6789",
  address:
    "Blk 15 Lot 8, Phase 2, Green Valley Subdivision, Molino 3, Bacoor, Cavite",
  program: "Technical Livelihood Track - ICT",
  yearLevel: "Grade 11",
  branch: "Bacoor",
  programType: "SHS",
  gender: "Male",
  birthday: "2008-01-15",
  status: "Regular",
  civilStatus: "Single",
  religion: "Roman Catholic",
  guardianName: "Erlinda C. Verdida",
  guardianContact: "0923 456 7890",
};

const fallbackSubjectsSHS: StudentPortalSubject[] = [
  {
    id: "shs-1",
    code: "ENG112",
    title: "Reading and Writing Skills",
    schedule: "MWF 8:00 AM-9:00 AM",
    room: "Room 101",
    professor: "Prof. Santos",
    days: "MWF",
    time: "8:00 AM - 9:00 AM",
    semester: "1st Semester",
    academicYear: "2026-2027",
  },
  {
    id: "shs-2",
    code: "FIL112",
    title: "Pagbabasa at Pagsusuri ng Iba't-ibang Teksto",
    schedule: "TTH 10:00 AM-11:30 AM",
    room: "Room 102",
    professor: "Prof. Reyes",
    days: "TTH",
    time: "10:00 AM - 11:30 AM",
    semester: "1st Semester",
    academicYear: "2026-2027",
  },
  {
    id: "shs-3",
    code: "NTS112",
    title: "Physical Science",
    schedule: "MWF 10:30 AM-11:30 AM",
    room: "Room 103",
    professor: "Prof. Garcia",
    days: "MWF",
    time: "10:30 AM - 11:30 AM",
    semester: "1st Semester",
    academicYear: "2026-2027",
  },
  {
    id: "shs-4",
    code: "CP1121",
    title: "Computer Programming 2 (.NET Technology NC III)",
    schedule: "TTH 1:00 PM-3:00 PM",
    room: "Computer Lab 1",
    professor: "Prof. Cruz",
    days: "TTH",
    time: "1:00 PM - 3:00 PM",
    semester: "1st Semester",
    academicYear: "2026-2027",
  },
];

const fallbackSubjectsCollege: StudentPortalSubject[] = [
  {
    id: "college-1",
    code: "CC101",
    title: "Introduction to Computing",
    units: 3,
    schedule: "MWF 8:00 AM-9:00 AM",
    room: "Room 101",
    professor: "Prof. Santos",
    days: "MWF",
    time: "8:00 AM - 9:00 AM",
    semester: "1st Semester",
    academicYear: "2026-2027",
  },
  {
    id: "college-2",
    code: "MATH101",
    title: "College Algebra",
    units: 3,
    schedule: "TTH 10:00 AM-11:30 AM",
    room: "Room 102",
    professor: "Prof. Reyes",
    days: "TTH",
    time: "10:00 AM - 11:30 AM",
    semester: "1st Semester",
    academicYear: "2026-2027",
  },
  {
    id: "college-3",
    code: "ENGL101",
    title: "English Communication",
    units: 3,
    schedule: "MWF 10:30 AM-11:30 AM",
    room: "Room 103",
    professor: "Prof. Garcia",
    days: "MWF",
    time: "10:30 AM - 11:30 AM",
    semester: "1st Semester",
    academicYear: "2026-2027",
  },
];

const wait = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const getFallbackSubjects = (programType: Student["programType"]) =>
  programType === "SHS" ? fallbackSubjectsSHS : fallbackSubjectsCollege;

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

const getStudentSessionOverrides = (
  sessionUser = getCurrentStudentSessionUser(),
): Partial<Student> => {
  if (!sessionUser) {
    return {};
  }

  try {
    const derivedFirstName =
      sessionUser.firstName ||
      sessionUser.displayName.split(" ")[0] ||
      mockStudent.firstName;
    const derivedLastName =
      sessionUser.lastName ||
      sessionUser.displayName
        .split(" ")
        .slice(1)
        .join(" ") ||
      mockStudent.lastName;

    return {
      id: sessionUser.id,
      studentNumber: sessionUser.studentNumber || mockStudent.studentNumber,
      trackingNumber: sessionUser.trackingNumber,
      firstName: derivedFirstName,
      lastName: derivedLastName,
      middleName: sessionUser.middleName,
      email: sessionUser.email || mockStudent.email,
      contactNumber: sessionUser.contactNumber || mockStudent.contactNumber,
      address: sessionUser.address || mockStudent.address,
      program: sessionUser.program || mockStudent.program,
      yearLevel: sessionUser.yearLevel || mockStudent.yearLevel,
      branch: sessionUser.branch || mockStudent.branch,
      section: sessionUser.section,
      programType: sessionUser.programType || mockStudent.programType,
      gender: sessionUser.gender || mockStudent.gender,
      birthday: sessionUser.birthDate || mockStudent.birthday,
      civilStatus: sessionUser.civilStatus || mockStudent.civilStatus,
    };
  } catch (error) {
    console.error("Failed to read student session overrides", error);
    return {};
  }
};

const buildSessionBackedPortalStudent = (
  sessionUser: AuthSession["user"],
): Student => {
  const sessionOverrides = getStudentSessionOverrides(sessionUser);

  return {
    ...mockStudent,
    ...sessionOverrides,
    id: sessionUser.id || sessionOverrides.studentNumber || mockStudent.id,
    studentNumber:
      sessionUser.studentNumber || sessionOverrides.studentNumber || mockStudent.studentNumber,
    trackingNumber: sessionUser.trackingNumber,
    status: "Regular",
  };
};

const buildCurrentTermFallback = (yearLevel: string): StudentPortalCurrentTerm => ({
  yearLevel,
  academicYear: "2026-2027",
  semester: "1st Semester",
  source: "fallback",
});

const mergeStudentIntoLocalCache = (student: StudentStorageRecord) => {
  const currentBranch = normalizeBranchName(student.branch);
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
    student,
  ];

  writeStoredStudents(nextStudents);
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
          student.id === sessionUser.studentNumber &&
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

  try {
    await Promise.all([
      fetchAndCacheAcademicSnapshot(branch),
      fetchStudentSubjectPlans(branch),
      fetchEnrollmentRequests(branch),
    ]);
  } catch (error) {
    console.warn("Failed to fetch shared student portal data.", error);
  }
};

const fetchRemoteStudentRecordForCurrentSession = async (
  sessionUser: AuthSession["user"],
) => {
  if (!sessionUser.studentNumber) {
    return null;
  }

  try {
    const remoteStudents = await fetchAdminStudents(sessionUser.branch);
    const remoteStudent =
      remoteStudents.find(
        (student) =>
          student.id === sessionUser.studentNumber ||
          (sessionUser.trackingNumber &&
            student.trackingNumber === sessionUser.trackingNumber),
      ) ?? null;

    if (!remoteStudent) {
      return null;
    }

    mergeStudentIntoLocalCache(remoteStudent);
    return remoteStudent;
  } catch (error) {
    console.warn("Failed to fetch shared student record for current session.", error);
    return null;
  }
};

const getStudentPortalDataForCurrentSession = async (): Promise<StudentPortalData> => {
  await wait(300);

  const sessionUser = getCurrentStudentSessionUser();
  await syncStudentPortalAcademicCache(sessionUser?.branch);
  let storedStudent = getStoredStudentRecordForCurrentSession(sessionUser);

  if (sessionUser) {
    const remoteStudent = await fetchRemoteStudentRecordForCurrentSession(
      sessionUser,
    );

    if (remoteStudent) {
      storedStudent = remoteStudent;
    }
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

  if (sessionUser) {
    const student = buildSessionBackedPortalStudent(sessionUser);
    const credentialOverview = getStudentCredentialOverview({
      branch: student.branch,
      studentNumber: student.studentNumber,
      trackingNumber: student.trackingNumber,
    });

    return {
      student,
      subjects: [],
      credentialItems: credentialOverview?.items ?? [],
      credentialSummary: credentialOverview?.summary ?? null,
      currentTerm: buildCurrentTermFallback(student.yearLevel),
    };
  }

  const fallbackStudent = { ...mockStudent, ...getStudentSessionOverrides() };
  return {
    student: fallbackStudent,
    subjects: getFallbackSubjects(fallbackStudent.programType),
    credentialItems: [],
    credentialSummary: null,
    currentTerm: buildCurrentTermFallback(fallbackStudent.yearLevel),
  };
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
  const firstName = fullNameParts[0] || "Student";
  const lastName =
    fullNameParts.length > 1 ? fullNameParts[fullNameParts.length - 1] : "";
  const middleName =
    fullNameParts.length > 2
      ? fullNameParts.slice(1, -1).join(" ")
      : undefined;

  return {
    id: storedStudent.id,
    studentNumber: storedStudent.id,
    trackingNumber: storedStudent.trackingNumber,
    firstName,
    lastName,
    middleName,
    email: storedStudent.email || mockStudent.email,
    contactNumber: storedStudent.contact || mockStudent.contactNumber,
    address: storedStudent.address || mockStudent.address,
    program:
      storedStudent.strandOrCourse || storedStudent.program || mockStudent.program,
    yearLevel: storedStudent.yearLevel || mockStudent.yearLevel,
    branch: storedStudent.branch || mockStudent.branch,
    section: storedStudent.section,
    programType: storedStudent.program === "SHS" ? "SHS" : "BS",
    gender: storedStudent.gender || mockStudent.gender,
    birthday: storedStudent.birthDate || mockStudent.birthday,
    status: getPortalStudentStatus(storedStudent),
    civilStatus: storedStudent.civilStatus || mockStudent.civilStatus,
    religion: mockStudent.religion,
    guardianName: storedStudent.guardianName || mockStudent.guardianName,
    guardianContact:
      storedStudent.guardianContact || mockStudent.guardianContact,
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
    name: nextName,
    email: data.email ?? storedStudent.email,
    contact: data.contactNumber ?? storedStudent.contact,
    address: data.address ?? storedStudent.address,
    birthDate: data.birthday ?? storedStudent.birthDate,
    guardianName: data.guardianName ?? storedStudent.guardianName,
    guardianContact: data.guardianContact ?? storedStudent.guardianContact,
    gender: data.gender ?? storedStudent.gender,
    civilStatus: data.civilStatus ?? storedStudent.civilStatus,
    section: data.section ?? storedStudent.section,
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
      return { ...buildSessionBackedPortalStudent(sessionUser), ...data };
    }

    return { ...mockStudent, ...data };
  },
};
