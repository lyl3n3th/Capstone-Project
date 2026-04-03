import type { Student } from "../types/student";
import { AUTH_STORAGE_KEY, type AuthSession } from "../types/user";
import {
  getStudentCredentialOverview,
  getStudentPortalSubjects,
  normalizeBranchName,
  readStoredStudents,
  writeStoredStudents,
  type StudentPortalCredentialItem,
  type StudentPortalCredentialSummary,
  type StudentPortalSubject,
  type StudentStorageRecord,
} from "./adminStorage";

export interface StudentPortalData {
  student: Student;
  subjects: StudentPortalSubject[];
  credentialItems: StudentPortalCredentialItem[];
  credentialSummary: StudentPortalCredentialSummary | null;
}

const mockStudent: Student = {
  id: "1",
  studentNumber: "20221131",
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

    return {
      id: parsedSession.user.id,
      studentNumber:
        parsedSession.user.studentNumber || mockStudent.studentNumber,
      branch: parsedSession.user.branch || mockStudent.branch,
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
      storedStudent.studentStatus === "Transferee" ? "Transferee" : "Regular",
    civilStatus: storedStudent.civilStatus || mockStudent.civilStatus,
    religion: mockStudent.religion,
    guardianName: storedStudent.guardianName || mockStudent.guardianName,
    guardianContact:
      storedStudent.guardianContact || mockStudent.guardianContact,
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
    const student = mapStoredStudentToPortalStudent(storedStudent);
    const credentialOverview = getStudentCredentialOverview({
      branch: storedStudent.branch,
      studentNumber: storedStudent.id,
      trackingNumber: storedStudent.trackingNumber,
    });
    const subjects = getStudentPortalSubjects(storedStudent);

    return {
      student,
      subjects:
        subjects.length > 0 ? subjects : getFallbackSubjects(student.programType),
      credentialItems: credentialOverview?.items ?? [],
      credentialSummary: credentialOverview?.summary ?? null,
    };
  }

  const fallbackStudent = { ...mockStudent, ...getStudentSessionOverrides() };
  return {
    student: fallbackStudent,
    subjects: getFallbackSubjects(fallbackStudent.programType),
    credentialItems: [],
    credentialSummary: null,
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
