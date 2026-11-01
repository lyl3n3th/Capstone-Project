import type { AcademicSubjectAssignmentRecord } from "./academicData";
import type { StudentStorageRecord } from "./adminStorage";
import { fetchAdminStudents } from "./adminStudentsApi";
import {
  fetchAndCacheInstructorGradeSubmissions,
  studentHasAssignedInstructorSubject,
  type InstructorGradeSubmission,
} from "./instructorPortal";
import { fetchAndCacheStudentGradeRecordsForBranch, type StoredStudentGradeRecord } from "./studentGrades";
import { supabase } from "../lib/supabase";

export const ASSIGNMENT_GRADE_REMOVAL_NOTICE = "This subject has recorded grades. Removing its section assignment will preserve those grades and instructor details.";

const normalized = (value?: string) => value?.trim().toLowerCase() || "";

export function getAssignmentGradeHistory(
  assignments: AcademicSubjectAssignmentRecord[],
  records: StoredStudentGradeRecord[],
  submissions: InstructorGradeSubmission[],
  students: StudentStorageRecord[],
  belongsToAssignment = studentHasAssignedInstructorSubject,
) {
  const submittedEntries = submissions
    .filter(submission => submission.status === "Pending" || submission.status === "Approved")
    .flatMap(submission => submission.records.map(record => ({ status: submission.status, record: {
      ...record,
      instructorId: record.instructorId || submission.instructorId,
      instructorName: record.instructorName?.trim() || submission.instructorName,
      instructorEmployeeId: record.instructorEmployeeId || submission.employeeId,
    } })));
  const submittedRecords = submittedEntries.map(entry => entry.record);
  const approvedRecords = submittedEntries.filter(entry => entry.status === "Approved").map(entry => entry.record);
  const attributedRecords = records.map(record => {
    // Recover old uploads from their saved submission author, never from a
    // replacement instructor currently assigned to the section.
    const original = approvedRecords.find(item => item.id === record.id
      && item.normalizedGrade === record.normalizedGrade
      && (!record.instructorId || record.instructorId === item.instructorId));
    return original && !record.instructorName?.trim() ? {
      ...record,
      instructorId: record.instructorId || original.instructorId,
      instructorName: original.instructorName,
      instructorEmployeeId: record.instructorEmployeeId || original.instructorEmployeeId,
      assignmentId: record.assignmentId || original.assignmentId,
      sectionId: record.sectionId || original.sectionId,
      sectionCode: record.sectionCode || original.sectionCode,
    } : record;
  });
  const matches = (record: StoredStudentGradeRecord, assignment: AcademicSubjectAssignmentRecord) => {
    if (!record.normalizedGrade?.trim() || record.normalizedGrade === "-") return false;
    if (normalized(record.subjectCode) !== normalized(assignment.subjectCode)
      || normalized(record.academicYear) !== normalized(assignment.academicYear)
      || normalized(record.semester) !== normalized(assignment.semester)) return false;
    if (record.assignmentId) return record.assignmentId === assignment.id;
    if (record.source === "historical") return false;
    if (record.instructorId ? record.instructorId !== assignment.instructorId
      : !record.instructorName || normalized(record.instructorName) !== normalized(assignment.instructorName)) return false;
    if (record.sectionId) return record.sectionId === assignment.sectionId;
    if (record.sectionCode) return normalized(record.sectionCode) === normalized(assignment.sectionCode);
    const student = students.find(item => normalized(item.id) === normalized(record.studentId));
    return Boolean(student && belongsToAssignment(student, assignment));
  };
  const gradedAssignmentIds = assignments.filter(assignment =>
    [...attributedRecords, ...submittedRecords].some(record => matches(record, assignment)),
  ).map(assignment => assignment.id);
  const recordsToPreserve = attributedRecords.filter((record, index) =>
    record !== records[index] && assignments.some(assignment => matches(record, assignment)),
  );
  return { gradedAssignmentIds, recordsToPreserve };
}

export async function loadAssignmentGradeHistory(branch: string, assignments: AcademicSubjectAssignmentRecord[]) {
  const [records, submissions, students] = await Promise.all([
    fetchAndCacheStudentGradeRecordsForBranch(branch),
    fetchAndCacheInstructorGradeSubmissions(branch),
    fetchAdminStudents(branch),
  ]);
  return getAssignmentGradeHistory(assignments, records, submissions, students);
}

export async function preserveAssignmentGradeHistory(branch: string, records: StoredStudentGradeRecord[]) {
  for (const record of records) {
    const { error } = await supabase.rpc("upsert_student_grade_record", { p_branch: branch, p_payload: record });
    if (error) throw new Error(error.message);
  }
}
