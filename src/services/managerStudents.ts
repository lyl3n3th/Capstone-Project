import { normalizeBranchName, type StudentStorageRecord } from "./adminStorage";
import {
  fetchAdminStudentCounts,
  fetchAdminStudents,
  fetchAdminStudentsPage,
  type AdminStudentPage,
  type AdminStudentPageFilters,
} from "./adminStudentsApi";
import { fetchManagedBranches } from "./staffApi";

export interface ManagedStudentSnapshot {
  branches: string[];
  students: StudentStorageRecord[];
}

export const fetchManagedStudentBranches = async () => {
  const managedBranches = await fetchManagedBranches();
  return [...new Set(managedBranches
    .map((branch) => branch.name.trim())
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));
};

export const fetchManagedStudentPage = (
  branches: string[],
  page: number,
  filters: AdminStudentPageFilters = {},
): Promise<AdminStudentPage> =>
  fetchAdminStudentsPage(null, page, 10, { ...filters, branches });

export { fetchAdminStudentCounts };

export const isVisibleManagerStudentRecord = (
  student: Pick<StudentStorageRecord, "status">,
) => !["archived", "graduated", "deleted", "inactive", "removed"].includes(
  (student.status || "").trim().toLowerCase(),
);

export const isManagerEnrollmentStudent = (
  student: Pick<StudentStorageRecord, "program" | "studentStatus" | "importAcademicYear" | "importSemester">,
) => (student.program === "SHS" || student.program === "College")
  && !student.importAcademicYear
  && !student.importSemester
  && student.studentStatus?.trim().toLowerCase() !== "existing student";

// Use the same database reader as the admin list, without depending on its cache.
export const fetchManagedStudentSnapshot = async (): Promise<ManagedStudentSnapshot> => {
  const managedBranches = await fetchManagedBranches();
  const branches = [...new Set(managedBranches
    .map((branch) => branch.name.trim())
    .filter(Boolean)
    .map(normalizeBranchName))].sort((left, right) => left.localeCompare(right));
  const records = await Promise.all(branches.map(async (branch) => {
    const students = await fetchAdminStudents(branch);
    return students.filter((student) =>
      normalizeBranchName(student.branch) === branch && isVisibleManagerStudentRecord(student),
    );
  }));
  return { branches, students: records.flat() };
};
