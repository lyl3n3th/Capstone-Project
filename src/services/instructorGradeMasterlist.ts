import type { GradeTemplateSheet } from "./gradeTemplateBuilder";
import type { AcademicSubjectAssignmentRecord } from "./academicData";
import type { StudentStorageRecord } from "./adminStorage";
import type { StoredStudentGradeRecord } from "./studentGrades";

export type InstructorMasterlistRosterRow = {
  student: StudentStorageRecord;
  studentAssignments: AcademicSubjectAssignmentRecord[];
};

const normalized = (value: string) => value.trim().toLowerCase();

export function buildInstructorGradeMasterlist({
  rows,
  grades,
  instructorId,
}: {
  rows: InstructorMasterlistRosterRow[];
  grades: StoredStudentGradeRecord[];
  instructorId: string;
  branch: string;
}) {
  const groups = new Map<string, {
    assignment: AcademicSubjectAssignmentRecord;
    students: Map<string, StudentStorageRecord>;
  }>();
  for (const { student, studentAssignments } of rows) {
    for (const assignment of studentAssignments) {
      if (assignment.instructorId !== instructorId) continue;
      const key = [assignment.subjectCode, assignment.sectionId || assignment.sectionCode,
        assignment.academicYear, assignment.semester].map(normalized).join("::");
      const group = groups.get(key) ?? { assignment, students: new Map() };
      group.students.set(student.id, student);
      groups.set(key, group);
    }
  }
  if (groups.size === 0) throw new Error("No assigned subjects match the selected students and filters.");

  const sheets: GradeTemplateSheet[] = [];
  const usedNames = new Set<string>();
  for (const { assignment, students } of [...groups.values()].sort((left, right) =>
    left.assignment.subjectCode.localeCompare(right.assignment.subjectCode) ||
    left.assignment.sectionCode.localeCompare(right.assignment.sectionCode) ||
    left.assignment.academicYear.localeCompare(right.assignment.academicYear) ||
    left.assignment.semester.localeCompare(right.assignment.semester))) {
    const data: string[][] = [];
    for (const student of [...students.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))) {
      const studentGrades = grades.filter((grade) =>
        normalized(grade.studentId) === normalized(student.id) &&
        normalized(grade.subjectCode) === normalized(assignment.subjectCode) &&
        normalized(grade.academicYear) === normalized(assignment.academicYear) &&
        normalized(grade.semester) === normalized(assignment.semester) &&
        (!grade.instructorId || grade.instructorId === instructorId));
      for (const grade of studentGrades.length > 0 ? studentGrades : [undefined]) {
        data.push([student.id, student.name, student.program, student.yearLevel,
          assignment.sectionCode || student.section || "Unassigned", grade?.gradingPeriod ?? "",
          grade?.grade ?? "", grade?.normalizedGrade ?? "", grade?.evaluation ?? ""]);
      }
    }
    const base = `${assignment.subjectCode} - ${assignment.sectionCode}`.replace(/[\\/?*:[\]]/g, " ").trim() || "Subject";
    let name = base.slice(0, 31);
    let suffix = 2;
    while (usedNames.has(name.toLowerCase())) {
      const ending = ` (${suffix++})`;
      name = `${base.slice(0, 31 - ending.length)}${ending}`;
    }
    usedNames.add(name.toLowerCase());
    sheets.push({
      sheetName: name,
      academicYear: assignment.academicYear,
      semester: assignment.semester,
      sectionCode: assignment.sectionCode,
      descriptor: assignment.subjectCode,
      yearLevel: "",
      rows: data,
      headerOverrides: {
        A: "STUDENT NO.", B: "FULL NAME", C: "PROGRAM", D: "YEAR LEVEL", E: "SECTION",
        F: "GRADING PERIOD", G: "GRADE", H: "EQUIVALENT", I: "REMARKS",
      },
      metadataOverrides: {
        C3: "GRADES MASTERLIST", D3: "", E3: "INSTRUCTOR:", F3: assignment.instructorName,
        G3: "", H3: "PROGRAM:", I3: [...new Set([...students.values()].map(student => student.program))].join(" / "),
        G4: "SUBJECT:", H4: assignment.subjectCode,
        E5: "SUBJECT TITLE:", F5: assignment.subjectName, G5: "", H5: "", I5: "",
      },
      additionalMerges: ["C3:D3", "F3:G3", "F5:I5"],
      columnWidths: [18, 32, 22, 16, 20, 20, 14, 18, 20, 20],
    });
  }
  return sheets;
}
