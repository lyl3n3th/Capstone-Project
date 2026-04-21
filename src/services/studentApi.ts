import type { Student } from "../types/student";
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/user";
import {
  getStudentCredentialOverview,
  getStudentPortalSubjects,
  getStudentPortalSubjectsForTerm,
  normalizeBranchName,
  readStoredStudents,
  writeStoredStudents,
  type StudentPortalCredentialItem,
  type StudentPortalCredentialSummary,
  type StudentPortalSubject,
  type StudentStorageRecord,
} from "./adminStorage";
import { getLatestApprovedEnrollmentRequestForStudent } from "./enrollmentRequests";

export interface StudentPortalData {
  student: Student;
  subjects: StudentPortalSubject[];
  credentialItems: StudentPortalCredentialItem[];
  credentialSummary: StudentPortalCredentialSummary | null;
  currentTerm: StudentPortalCurrentTerm;
}

export interface StudentPortalCurrentTerm {
  yearLevel: string;
  academicYear: string;
  semester: string;
  source:
    | "approved_enrollment"
    | "own_schedule"
    | "subject_load"
    | "fallback";
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

const semesterSortOrder = ["1st Semester", "2nd Semester", "Summer"];

const getAcademicYearSortValue = (academicYear?: string) => {
  const match = academicYear?.match(/\d{4}/);
  return match ? Number(match[0]) : 0;
};

const getSemesterSortValue = (semester?: string) => {
  const index = semesterSortOrder.indexOf(semester || "");
  return index >= 0 ? index : -1;
};

const mergePortalSubjects = (...groups: StudentPortalSubject[][]) => {
  const mergedSubjects = new Map<string, StudentPortalSubject>();

  groups.flat().forEach((subject) => {
    const key = [
      subject.id,
      subject.code,
      subject.title,
      subject.academicYear,
      subject.semester,
    ].join("::");

    if (!mergedSubjects.has(key)) {
      mergedSubjects.set(key, subject);
    }
  });

  return Array.from(mergedSubjects.values());
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

  const requestedYearCode = requestedYearLevel.trim().toLowerCase().includes("2nd")
    ? "2"
    : requestedYearLevel.trim().toLowerCase().includes("3rd")
      ? "3"
      : requestedYearLevel.trim().toLowerCase().includes("4th")
        ? "4"
        : requestedYearLevel.trim().toLowerCase().includes("grade 12")
          ? "2"
          : "1";
  const codeParts = normalizedCode.match(/^(.*?)([1-4])([A-Z]+)$/);

  if (!codeParts) {
    return normalizedCode;
  }

  const [, prefix, , blockLabel] = codeParts;
  return `${prefix}${requestedYearCode}${blockLabel}`;
};

const getLatestPortalTermFromSubjects = (
  subjects: StudentPortalSubject[],
  yearLevel: string,
): StudentPortalCurrentTerm | null => {
  const latestSubject = [...subjects].sort(
    (left, right) =>
      getAcademicYearSortValue(right.academicYear) -
        getAcademicYearSortValue(left.academicYear) ||
      getSemesterSortValue(right.semester) - getSemesterSortValue(left.semester) ||
      right.academicYear.localeCompare(left.academicYear) ||
      right.semester.localeCompare(left.semester),
  )[0];

  if (!latestSubject?.academicYear || !latestSubject.semester) {
    return null;
  }

  return {
    yearLevel,
    academicYear: latestSubject.academicYear,
    semester: latestSubject.semester,
    source: "subject_load",
  };
};

const getStudentSessionOverrides = (): Partial<Student> => {
  if (typeof window === "undefined") {
    return {};
  }

  const rawSession = localStorage.getItem(AUTH_STORAGE_KEY);

  if (!rawSession) {
    return {};
  }

  try {
    const parsedSession = JSON.parse(rawSession) as AuthSession;

    if (parsedSession.user.role !== "student") {
      return {};
    }

    const derivedFirstName =
      parsedSession.user.firstName ||
      parsedSession.user.displayName.split(" ")[0] ||
      mockStudent.firstName;
    const derivedLastName =
      parsedSession.user.lastName ||
      parsedSession.user.displayName
        .split(" ")
        .slice(1)
        .join(" ") ||
      mockStudent.lastName;

    return {
      id: parsedSession.user.id,
      studentNumber:
        parsedSession.user.studentNumber || mockStudent.studentNumber,
      trackingNumber: parsedSession.user.trackingNumber,
      firstName: derivedFirstName,
      lastName: derivedLastName,
      middleName: parsedSession.user.middleName,
      email: parsedSession.user.email || mockStudent.email,
      contactNumber:
        parsedSession.user.contactNumber || mockStudent.contactNumber,
      address: parsedSession.user.address || mockStudent.address,
      program: parsedSession.user.program || mockStudent.program,
      yearLevel: parsedSession.user.yearLevel || mockStudent.yearLevel,
      branch: parsedSession.user.branch || mockStudent.branch,
      section: parsedSession.user.section,
      programType: parsedSession.user.programType || mockStudent.programType,
      gender: parsedSession.user.gender || mockStudent.gender,
      birthday: parsedSession.user.birthDate || mockStudent.birthday,
      civilStatus: parsedSession.user.civilStatus || mockStudent.civilStatus,
    };
  } catch (error) {
    console.error("Failed to read student session overrides", error);
    return {};
  }
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
    status:
      storedStudent.ownScheduleRequestStatus === "Approved"
        ? "Irregular"
        : storedStudent.studentStatus === "Transferee"
          ? "Transferee"
          : "Regular",
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

const getStoredStudentRecordForCurrentSession = (): StudentStorageRecord | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = localStorage.getItem(AUTH_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession) as AuthSession;

    if (
      parsedSession.user.role !== "student" ||
      !parsedSession.user.studentNumber
    ) {
      return null;
    }

    const currentBranch = normalizeBranchName(parsedSession.user.branch);
    return (
      readStoredStudents().find(
        (student) =>
          student.id === parsedSession.user.studentNumber &&
          normalizeBranchName(student.branch) === currentBranch,
      ) || null
    );
  } catch (error) {
    console.error("Failed to resolve student session record", error);
    return null;
  }
};

const getStudentPortalDataForCurrentSession = async (): Promise<StudentPortalData> => {
  await wait(300);

  const storedStudent = getStoredStudentRecordForCurrentSession();
  if (storedStudent) {
    const approvedEnrollmentRequest = getLatestApprovedEnrollmentRequestForStudent({
      branch: storedStudent.branch,
      studentNumber: storedStudent.id,
      trackingNumber: storedStudent.trackingNumber,
    });
    const resolvedYearLevel =
      approvedEnrollmentRequest?.requestedYearLevel || storedStudent.yearLevel;
    const resolvedStudentRecord: StudentStorageRecord = {
      ...storedStudent,
      yearLevel: resolvedYearLevel,
      section:
        approvedEnrollmentRequest?.irregularRequest?.mode === "own_schedule"
          ? ""
          : approvedEnrollmentRequest?.irregularRequest?.mode === "section_assignment"
            ? approvedEnrollmentRequest.irregularRequest.requestedSectionCode ||
              storedStudent.section
            : approvedEnrollmentRequest
              ? buildProgressedBlockSectionCode({
                  currentSectionCode: storedStudent.section,
                  requestedYearLevel: resolvedYearLevel,
                }) || storedStudent.section
              : storedStudent.section,
    };
    const student = {
      ...mapStoredStudentToPortalStudent(resolvedStudentRecord),
      yearLevel: resolvedYearLevel,
    };
    const credentialOverview = getStudentCredentialOverview({
      branch: storedStudent.branch,
      studentNumber: storedStudent.id,
      trackingNumber: storedStudent.trackingNumber,
    });
    const portalSubjects = getStudentPortalSubjects(resolvedStudentRecord);
    const approvedTermSubjects =
      approvedEnrollmentRequest &&
      approvedEnrollmentRequest.irregularRequest?.mode !== "own_schedule"
        ? getStudentPortalSubjectsForTerm({
            branch: resolvedStudentRecord.branch,
            program: resolvedStudentRecord.program,
            yearLevel: resolvedYearLevel,
            strandOrCourse: resolvedStudentRecord.strandOrCourse,
            semester: approvedEnrollmentRequest.semester,
            academicYear: approvedEnrollmentRequest.academicYear,
          })
        : [];
    const subjects = mergePortalSubjects(approvedTermSubjects, portalSubjects);
    const currentTerm =
      approvedEnrollmentRequest
        ? {
            yearLevel: resolvedYearLevel,
            academicYear: approvedEnrollmentRequest.academicYear,
            semester: approvedEnrollmentRequest.semester,
            source: "approved_enrollment" as const,
          }
        : student.ownScheduleRequestStatus === "Approved" &&
            student.ownScheduleAcademicYear &&
            student.ownScheduleSemester
          ? {
              yearLevel: student.yearLevel,
              academicYear: student.ownScheduleAcademicYear,
              semester: student.ownScheduleSemester,
              source: "own_schedule" as const,
            }
          : getLatestPortalTermFromSubjects(subjects, student.yearLevel) || {
              yearLevel: student.yearLevel,
              academicYear: "2026-2027",
              semester: "1st Semester",
              source: "fallback" as const,
            };

    return {
      student,
      subjects,
      credentialItems: credentialOverview?.items ?? [],
      credentialSummary: credentialOverview?.summary ?? null,
      currentTerm,
    };
  }

  const fallbackStudent = { ...mockStudent, ...getStudentSessionOverrides() };
  return {
    student: fallbackStudent,
    subjects: getFallbackSubjects(fallbackStudent.programType),
    credentialItems: [],
    credentialSummary: null,
    currentTerm: {
      yearLevel: fallbackStudent.yearLevel,
      academicYear: "2026-2027",
      semester: "1st Semester",
      source: "fallback",
    },
  };
};

const persistStudentProfileUpdate = (
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
  return mapStoredStudentToPortalStudent(nextStudentRecord);
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

    return { ...mockStudent, ...getStudentSessionOverrides(), ...data };
  },
};
