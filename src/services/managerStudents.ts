import { normalizeBranchName, type StudentStorageRecord } from "./adminStorage";
import { fetchAdminStudents } from "./adminStudentsApi";
import { fetchManagedBranches } from "./staffApi";

export interface ManagedStudentSnapshot {
  branches: string[];
  students: StudentStorageRecord[];
}

export const isVisibleManagerStudentRecord = (
  student: Pick<StudentStorageRecord, "status">,
) => !["archived", "graduated", "deleted", "inactive", "removed"].includes(
  (student.status || "").trim().toLowerCase(),
);

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
