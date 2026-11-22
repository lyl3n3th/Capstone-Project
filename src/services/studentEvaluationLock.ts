import type {
  InstructorEvaluationSubmissionRecord,
  StudentPortalSubject,
} from "./adminStorage";
import type { StudentPortalCurrentTerm } from "./studentApi";
import type { Student } from "../types/student";

const getResolvedInstructorName = (subject: StudentPortalSubject) => {
  const trimmedName = subject.professor?.trim();

  if (trimmedName && trimmedName.toLowerCase() !== "tba") {
    return trimmedName;
  }

  return subject.instructorId ? "Assigned Instructor" : "Instructor TBA";
};

const normalizeEvaluationMatchValue = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

export const getEvaluationSubmissionId = ({
  studentId,
  instructorId,
  academicYear,
  semester,
  subjectIds,
}: {
  studentId: string;
  instructorId: string;
  academicYear: string;
  semester: string;
  subjectIds: string[];
}) =>
  [studentId, instructorId, academicYear, semester, [...subjectIds].sort().join("_")]
    .join("-")
    .replace(/\s+/g, "_");

export const getCurrentTermEvaluationLockStatus = ({
  student,
  subjects,
  currentTerm,
  submissions,
}: {
  student: Student | null;
  subjects: StudentPortalSubject[];
  currentTerm: StudentPortalCurrentTerm | null;
  submissions: InstructorEvaluationSubmissionRecord[];
}) => {
  const academicYear =
    currentTerm?.academicYear || subjects[0]?.academicYear || "";
  const semester = currentTerm?.semester || subjects[0]?.semester || "";
  const studentId = student?.studentNumber || student?.id || "";

  if (!student || !studentId || !academicYear || !semester) {
    return {
      isLocked: false,
      completedCount: 0,
      requiredCount: 0,
      pendingInstructorNames: [] as string[],
      requiredSubmissionIds: [] as string[],
    };
  }

  const currentTermSubjects = subjects.filter(
    (subject) =>
      subject.academicYear === academicYear && subject.semester === semester,
  );

  const requiredEntries = currentTermSubjects
    .map((subject) => {
      const instructorId = subject.instructorId?.trim();
      const instructorName = getResolvedInstructorName(subject);

      if (!instructorId || instructorName === "Instructor TBA") {
        return null;
      }

      const submissionId = getEvaluationSubmissionId({
        studentId,
        instructorId,
        academicYear,
        semester,
        subjectIds: [subject.id],
      });
      const evaluationSubmitted = submissions.some((submission) => {
        if (
          normalizeEvaluationMatchValue(submission.studentNumber) !==
          normalizeEvaluationMatchValue(studentId)
        ) {
          return false;
        }

        if (submission.id === submissionId) {
          return true;
        }

        return (
          normalizeEvaluationMatchValue(submission.instructorId) ===
            normalizeEvaluationMatchValue(instructorId) &&
          normalizeEvaluationMatchValue(submission.academicYear) ===
            normalizeEvaluationMatchValue(academicYear) &&
          normalizeEvaluationMatchValue(submission.semester) ===
            normalizeEvaluationMatchValue(semester) &&
          (submission.subjectIds ?? []).some(
            (submittedSubjectId) =>
              normalizeEvaluationMatchValue(submittedSubjectId) ===
              normalizeEvaluationMatchValue(subject.id),
          )
        );
      });

      return {
        instructorId,
        instructorName,
        pendingLabel: `${instructorName} (${subject.code})`,
        submissionId,
        evaluationSubmitted,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const pendingEntries = requiredEntries.filter(
    (entry) => !entry.evaluationSubmitted,
  );

  return {
    isLocked: pendingEntries.length > 0,
    completedCount: requiredEntries.length - pendingEntries.length,
    requiredCount: requiredEntries.length,
    pendingInstructorNames: pendingEntries.map((entry) => entry.pendingLabel),
    requiredSubmissionIds: requiredEntries.map((entry) => entry.submissionId),
  };
};
