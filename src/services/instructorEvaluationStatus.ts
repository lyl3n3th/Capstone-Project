import { supabase } from "../lib/supabase";
import { normalizeBranchName, type InstructorEvaluationSubmissionRecord } from "./adminStorage";
import type { AcademicSubjectAssignmentRecord } from "./academicData";

export type InstructorEvaluationCompletion = Pick<InstructorEvaluationSubmissionRecord,
  "instructorId" | "studentNumber" | "academicYear" | "semester" | "subjectIds" | "subjectCodes"
>;

// The roster needs completion metadata only, never evaluation answers or ratings.
export async function fetchInstructorEvaluationCompletions(branch: string, instructorId: string) {
  const completions: InstructorEvaluationCompletion[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("instructor_evaluation_submissions")
      .select("instructor_id,student_number,academic_year,semester,subject_ids,subject_codes")
      .eq("branch", normalizeBranchName(branch))
      .eq("instructor_id", instructorId)
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      completions.push({
        instructorId: row.instructor_id,
        studentNumber: row.student_number,
        academicYear: row.academic_year,
        semester: row.semester,
        subjectIds: row.subject_ids ?? [],
        subjectCodes: row.subject_codes ?? [],
      });
    }
    if (!data || data.length < pageSize) return completions;
  }
}

const normalized = (value: string) => value.trim().toLowerCase();

export function getStudentInstructorEvaluationStatus(
  studentNumber: string,
  assignments: AcademicSubjectAssignmentRecord[],
  completions: InstructorEvaluationCompletion[],
) {
  const uniqueSubjects = new Map<string, AcademicSubjectAssignmentRecord[]>();
  for (const assignment of assignments) {
    const key = [assignment.instructorId, assignment.academicYear, assignment.semester, assignment.subjectCode]
      .map(normalized).join("::");
    uniqueSubjects.set(key, [...(uniqueSubjects.get(key) ?? []), assignment]);
  }
  const studentCompletions = completions.filter((entry) => normalized(entry.studentNumber) === normalized(studentNumber));
  let completedCount = 0;
  for (const subjectAssignments of uniqueSubjects.values()) {
    const assignment = subjectAssignments[0];
    const completed = studentCompletions.some((entry) =>
      normalized(entry.instructorId) === normalized(assignment.instructorId) &&
      normalized(entry.academicYear) === normalized(assignment.academicYear) &&
      normalized(entry.semester) === normalized(assignment.semester) &&
      (entry.subjectIds.length > 0
        ? subjectAssignments.some((item) => entry.subjectIds.some((id) =>
          normalized(id) === normalized(item.id) || normalized(id) === normalized(item.subjectId)))
        : entry.subjectCodes.some((code) => normalized(code) === normalized(assignment.subjectCode))),
    );
    if (completed) completedCount += 1;
  }
  const totalCount = uniqueSubjects.size;
  const status = totalCount === 0 ? "not-applicable"
    : completedCount === totalCount ? "completed"
      : completedCount > 0 ? "in-progress" : "pending";
  return { status, completedCount, totalCount };
}
