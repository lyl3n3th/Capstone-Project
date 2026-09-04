import { useMemo, useState } from "react";
import { useInstructorPortal } from "../../hooks/useInstructorPortal";
import { getStudentPortalSubjects } from "../../services/adminStorage";
import SkeletonPage from "../../components/common/SkeletonPage";

export default function InstructorStudents() {
  const { students, assignments, isLoading } = useInstructorPortal();
  const [sectionFilter, setSectionFilter] = useState("all");
  const [yearLevelFilter, setYearLevelFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");

  const subjectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          assignments.map((assignment) => [
            assignment.subjectCode,
            `${assignment.subjectCode} - ${assignment.subjectName}`,
          ]),
        ),
      ).sort((left, right) => left[0].localeCompare(right[0])),
    [assignments],
  );

  const sectionOptions = useMemo(
    () =>
      Array.from(
        new Set(students.map((student) => student.section || "Unassigned")),
      ).sort((left, right) => left.localeCompare(right)),
    [students],
  );

  const yearLevelOptions = useMemo(
    () =>
      Array.from(new Set(students.map((student) => student.yearLevel))).sort(
        (left, right) => left.localeCompare(right),
      ),
    [students],
  );

  const rows = useMemo(() => {
    const assignmentIds = new Set(assignments.map((assignment) => assignment.id));
    const assignmentSubjectCodes = new Set(
      assignments.map((assignment) => assignment.subjectCode),
    );
    const assignmentBySectionAndSubject = new Set(
      assignments.map(
        (assignment) =>
          `${assignment.sectionCode.trim().toLowerCase()}::${assignment.subjectCode}`,
      ),
    );

    return students
      .map((student) => {
        const enrolledSubjects = getStudentPortalSubjects(student).filter(
          (subject) =>
            assignmentIds.has(subject.id) ||
            assignments.some(
              (assignment) =>
                subject.instructorId === assignment.instructorId &&
                subject.code === assignment.subjectCode,
            ) ||
            assignmentBySectionAndSubject.has(
              `${(subject.section || student.section || "")
                .trim()
                .toLowerCase()}::${subject.code}`,
            ),
        );
        const assignedSubjects =
          enrolledSubjects.length > 0
            ? enrolledSubjects.map((subject) => subject.code)
            : assignments
                .filter(
                  (assignment) =>
                    assignment.sectionCode === student.section ||
                    assignment.sectionId === student.section,
                )
                .map((assignment) => assignment.subjectCode);
        const uniqueAssignedSubjects = Array.from(
          new Set(
            assignedSubjects.filter((subjectCode) =>
              assignmentSubjectCodes.has(subjectCode),
            ),
          ),
        ).sort((left, right) => left.localeCompare(right));

        return {
          student,
          assignedSubjects: uniqueAssignedSubjects,
        };
      })
      .filter(({ student, assignedSubjects }) => {
        const section = student.section || "Unassigned";
        return (
          (sectionFilter === "all" || section === sectionFilter) &&
          (yearLevelFilter === "all" || student.yearLevel === yearLevelFilter) &&
          (subjectFilter === "all" || assignedSubjects.includes(subjectFilter))
        );
      });
  }, [assignments, sectionFilter, students, subjectFilter, yearLevelFilter]);

  if (isLoading) {
    return (
      <SkeletonPage
        className="instructor-panel"
        eyebrow="Read-only roster"
        title="Students"
        variant="table"
      />
    );
  }

  return (
    <div className="instructor-panel">
      <div className="instructor-page-header">
        <div>
          <span>Read-only roster</span>
          <h1>Students</h1>
        </div>
        <strong>{rows.length} of {students.length} students</strong>
      </div>

      <div className="instructor-filters">
        <label>
          Section
          <select
            value={sectionFilter}
            onChange={(event) => setSectionFilter(event.target.value)}
          >
            <option value="all">All sections</option>
            {sectionOptions.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </label>
        <label>
          Year Level
          <select
            value={yearLevelFilter}
            onChange={(event) => setYearLevelFilter(event.target.value)}
          >
            <option value="all">All year levels</option>
            {yearLevelOptions.map((yearLevel) => (
              <option key={yearLevel} value={yearLevel}>
                {yearLevel}
              </option>
            ))}
          </select>
        </label>
        <label>
          Subject
          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
          >
            <option value="all">All subjects</option>
            {subjectOptions.map(([subjectCode, subjectLabel]) => (
              <option key={subjectCode} value={subjectCode}>
                {subjectLabel}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="instructor-table-wrap">
        <table className="instructor-table">
          <thead>
            <tr>
              <th>Student No.</th>
              <th>Name</th>
              <th>Program</th>
              <th>Year Level</th>
              <th>Section</th>
              <th>Assigned Subjects</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student, assignedSubjects }) => (
              <tr key={student.id}>
                <td>{student.id}</td>
                <td>{student.name}</td>
                <td>{student.program}</td>
                <td>{student.yearLevel}</td>
                <td>{student.section || "Unassigned"}</td>
                <td>{assignedSubjects.join(", ") || "No matched subjects"}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>No enrolled students match the selected filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
