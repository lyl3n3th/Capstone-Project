import type { AcademicClassSectionRecord, AcademicSubjectAssignmentRecord } from "./academicData";
import type { StudentStorageRecord } from "./adminStorage";
import { getCurrentStudentInstructorAssignments } from "./instructorRoster";

const normalized = (value?: string) => value?.trim().toLowerCase() || "";

export function buildInstructorSubjectChartGroups({ assignments, sections, students }: {
  assignments: AcademicSubjectAssignmentRecord[];
  sections: AcademicClassSectionRecord[];
  students: StudentStorageRecord[];
}) {
  const studentAssignments = new Map(students.map(student =>
    [student.id, new Set(getCurrentStudentInstructorAssignments(student, assignments))]));
  const groups = new Map<string, {
    subjectKey: string;
    subjectCode: string;
    subjectName: string;
    sections: Map<string, { name: string; studentIds: Set<string> }>;
  }>();
  for (const assignment of assignments) {
    const subjectKey = assignment.subjectId || assignment.subjectCode;
    const group = groups.get(subjectKey) ?? {
      subjectKey, subjectCode: assignment.subjectCode, subjectName: assignment.subjectName,
      sections: new Map(),
    };
    const section = sections.find(item => item.id === assignment.sectionId) ??
      sections.find(item => normalized(item.code) === normalized(assignment.sectionCode));
    const sectionName = assignment.sectionCode || section?.code || "Unassigned";
    const sectionKey = section?.id || assignment.sectionId || normalized(sectionName);
    const bucket = group.sections.get(sectionKey) ?? { name: sectionName, studentIds: new Set<string>() };
    for (const student of students) {
      if (studentAssignments.get(student.id)?.has(assignment)) bucket.studentIds.add(student.id);
    }
    group.sections.set(sectionKey, bucket);
    groups.set(subjectKey, group);
  }
  return [...groups.values()].map(group => ({
    subjectKey: group.subjectKey, subjectCode: group.subjectCode, subjectName: group.subjectName,
    sections: [...group.sections.values()].map(section => ({ name: section.name, value: section.studentIds.size })),
  }));
}
