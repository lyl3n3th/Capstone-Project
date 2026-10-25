import type { AcademicSubjectAssignmentRecord } from "./academicData";
import type { StudentStorageRecord } from "./adminStorage";
import { resolveStudentPortalContext } from "./studentPortalResolver";

const normalized = (value?: string | null) => value?.trim().toLowerCase() || "";

export function getCurrentStudentInstructorAssignments(
  student: StudentStorageRecord,
  assignments: AcademicSubjectAssignmentRecord[],
) {
  if (student.status === "Archived") return [];
  const { resolvedStudentRecord: resolved, currentTerm, subjects } = resolveStudentPortalContext(student);
  const individualSchedule = resolved.requestedOwnSchedule || resolved.ownScheduleRequestStatus === "Approved";
  if (individualSchedule && resolved.ownScheduleSelectionStatus && resolved.ownScheduleSelectionStatus !== "Approved") return [];

  return assignments.filter(assignment => {
    // Assignment IDs and section codes can be reused when a class advances terms.
    if (normalized(currentTerm.academicYear) !== normalized(assignment.academicYear) ||
      normalized(currentTerm.semester) !== normalized(assignment.semester)) return false;

    // A regular student's approved/current section overrides old enrollee lists.
    if (!individualSchedule && resolved.section &&
      ![assignment.sectionId, assignment.sectionCode].some(section => normalized(section) === normalized(resolved.section))) return false;

    return subjects.some(subject => {
      if (normalized(subject.academicYear) !== normalized(assignment.academicYear) ||
        normalized(subject.semester) !== normalized(assignment.semester)) return false;
      if (subject.section && normalized(subject.section) !== normalized(assignment.sectionCode)) return false;
      if (subject.instructorId && normalized(subject.instructorId) !== normalized(assignment.instructorId)) return false;
      return normalized(subject.id) === normalized(assignment.id) ||
        (Boolean(subject.instructorId) && Boolean(subject.section) &&
          normalized(subject.code) === normalized(assignment.subjectCode));
    });
  });
}
