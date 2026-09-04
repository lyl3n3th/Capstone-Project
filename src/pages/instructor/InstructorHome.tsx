import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { FiCheckCircle, FiClock, FiUsers } from "react-icons/fi";
import { useInstructorPortal } from "../../hooks/useInstructorPortal";
import { getInstructorEvaluationProgress } from "../../services/instructorPortal";
import type { AcademicClassSectionRecord } from "../../services/academicData";
import SkeletonPage from "../../components/common/SkeletonPage";

const chartColors = ["#066287", "#21a67a", "#f2b84b", "#d95f59", "#7b61ff"];

const normalizeText = (value?: string | null) =>
  value?.trim().toLowerCase() || "";

const studentMatchesSection = (
  student: { id: string; section?: string | null },
  section?: AcademicClassSectionRecord,
) => {
  if (!section) {
    return false;
  }

  return (
    section.enrolleeIds.includes(student.id) ||
    normalizeText(student.section) === normalizeText(section.code) ||
    normalizeText(student.section) === normalizeText(section.section)
  );
};

export default function InstructorHome() {
  const { currentUser, assignments, sections, students, isLoading } =
    useInstructorPortal();
  const progress = getInstructorEvaluationProgress({
    branch: currentUser?.branch,
    instructorId: currentUser?.id || "",
    students,
  });
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const sectionByCode = new Map(
    sections.map((section) => [normalizeText(section.code), section]),
  );
  const subjectChartGroups = Array.from(
    assignments
      .reduce((subjectMap, assignment) => {
        const subjectKey = assignment.subjectId || assignment.subjectCode;
        const existingGroup = subjectMap.get(subjectKey) ?? {
          subjectKey,
          subjectCode: assignment.subjectCode,
          subjectName: assignment.subjectName,
          sections: [] as Array<{ name: string; value: number }>,
        };
        const section =
          sectionById.get(assignment.sectionId) ||
          sectionByCode.get(normalizeText(assignment.sectionCode));
        const studentCount = students.filter((student) =>
          studentMatchesSection(student, section),
        ).length;

        existingGroup.sections.push({
          name: assignment.sectionCode || section?.code || "Unassigned",
          value: studentCount,
        });
        subjectMap.set(subjectKey, existingGroup);
        return subjectMap;
      }, new Map<string, {
        subjectKey: string;
        subjectCode: string;
        subjectName: string;
        sections: Array<{ name: string; value: number }>;
      }>())
      .values(),
  );

  if (isLoading) {
    return (
      <SkeletonPage
        className="instructor-panel"
        eyebrow="Instructor Panel"
        title="Home"
        variant="dashboard"
      />
    );
  }

  return (
    <div className="instructor-panel">
      <div className="instructor-page-header">
        <div>
          <span>Instructor Panel</span>
          <h1>Home</h1>
        </div>
        <strong>{currentUser?.branch} Branch</strong>
      </div>

      <section className="instructor-stats-grid">
        <article>
          <FiUsers />
          <span>Total Students</span>
          <strong>{progress.totalCount}</strong>
        </article>
        <article>
          <FiCheckCircle />
          <span>Done Evaluating</span>
          <strong>{progress.doneCount}</strong>
        </article>
        <article>
          <FiClock />
          <span>Not Yet Done</span>
          <strong>{progress.pendingCount}</strong>
        </article>
      </section>

      <section className="instructor-content-grid">
        <div className="instructor-section instructor-subject-chart-section">
          <h2>Students Per Section</h2>
          <div className="instructor-subject-charts">
            {subjectChartGroups.length > 0 ? (
              subjectChartGroups.map((subjectGroup) => (
                <article
                  className="instructor-subject-chart-card"
                  key={subjectGroup.subjectKey}
                >
                  <div className="instructor-subject-chart-header">
                    <strong>{subjectGroup.subjectCode}</strong>
                    <span>{subjectGroup.subjectName}</span>
                  </div>
                  <div className="instructor-chart">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={subjectGroup.sections}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={82}
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {subjectGroup.sections.map((entry, index) => (
                            <Cell
                              key={`${subjectGroup.subjectKey}-${entry.name}`}
                              fill={chartColors[index % chartColors.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              ))
            ) : (
              <p className="instructor-empty-state">
                No assigned subjects available for charting.
              </p>
            )}
          </div>
        </div>
        <div className="instructor-section">
          <h2>Assigned Subjects</h2>
          <div className="instructor-mini-list">
            {assignments.map((assignment) => (
              <div key={assignment.id}>
                <strong>{assignment.subjectCode}</strong>
                <span>
                  {assignment.subjectName} | {assignment.sectionCode}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
