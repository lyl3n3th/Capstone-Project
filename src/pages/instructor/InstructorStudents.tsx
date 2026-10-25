import { useEffect, useMemo, useState } from "react";
import { FiDownload } from "react-icons/fi";
import { useInstructorPortal } from "../../hooks/useInstructorPortal";
import { getCurrentStudentInstructorAssignments } from "../../services/instructorRoster";
import SkeletonPage from "../../components/common/SkeletonPage";
import { INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT } from "../../services/adminStorage";
import { buildInstructorGradeMasterlist } from "../../services/instructorGradeMasterlist";
import { downloadStyledGradeTemplate } from "../../services/gradeTemplateBuilder";
import { fetchAndCacheStudentGradeRecordsForBranch } from "../../services/studentGrades";
import {
  fetchInstructorEvaluationCompletions,
  getStudentInstructorEvaluationStatus,
  type InstructorEvaluationCompletion,
} from "../../services/instructorEvaluationStatus";

export default function InstructorStudents() {
  const { currentUser, students, assignments, isLoading } = useInstructorPortal();
  const [sectionFilter, setSectionFilter] = useState("all");
  const [yearLevelFilter, setYearLevelFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [evaluationFilter, setEvaluationFilter] = useState("all");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const evaluationScope = `${currentUser?.branch ?? ""}::${currentUser?.id ?? ""}`;
  const [evaluations, setEvaluations] = useState<{
    scope: string;
    loading: boolean;
    error: string;
    completions: InstructorEvaluationCompletion[];
  }>({ scope: "", loading: true, error: "", completions: [] });
  const evaluationsReady = evaluations.scope === evaluationScope && !evaluations.loading && !evaluations.error;

  useEffect(() => {
    if (!currentUser?.branch || !currentUser.id) return;
    const branch = currentUser.branch;
    const instructorId = currentUser.id;
    const scope = `${branch}::${instructorId}`;
    let cancelled = false;
    let revision = 0;
    const refresh = async () => {
      const requestRevision = ++revision;
      setEvaluations({ scope, loading: true, error: "", completions: [] });
      try {
        const completions = await fetchInstructorEvaluationCompletions(branch, instructorId);
        if (!cancelled && requestRevision === revision) {
          setEvaluations({ scope, loading: false, error: "", completions });
        }
      } catch {
        if (!cancelled && requestRevision === revision) {
          setEvaluations({ scope, loading: false, error: "Unable to load evaluation status. Refresh the page to try again.", completions: [] });
        }
      }
    };
    void refresh();
    const onRefresh = () => { void refresh(); };
    window.addEventListener("focus", onRefresh);
    window.addEventListener(INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener(INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT, onRefresh);
    };
  }, [currentUser?.branch, currentUser?.id]);

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
        new Set(students.flatMap(student =>
          getCurrentStudentInstructorAssignments(student, assignments).map(assignment => assignment.sectionCode || "Unassigned"))),
      ).sort((left, right) => left.localeCompare(right)),
    [students, assignments],
  );

  const yearLevelOptions = useMemo(
    () =>
      Array.from(new Set(students.map((student) => student.yearLevel))).sort(
        (left, right) => left.localeCompare(right),
      ),
    [students],
  );

  const rows = useMemo(() => {
    const assignmentSubjectCodes = new Set(
      assignments.map((assignment) => assignment.subjectCode),
    );

    return students
      .map((student) => {
        const studentAssignments = getCurrentStudentInstructorAssignments(student, assignments)
          .filter(assignment => sectionFilter === "all" || (assignment.sectionCode || "Unassigned") === sectionFilter);
        const uniqueAssignedSubjects = Array.from(
          new Set(
            studentAssignments.map((assignment) => assignment.subjectCode).filter((subjectCode) =>
              assignmentSubjectCodes.has(subjectCode),
            ),
          ),
        ).sort((left, right) => left.localeCompare(right));

        return {
          student,
          assignedSections: [...new Set(studentAssignments.map(assignment => assignment.sectionCode || "Unassigned"))],
          assignedSubjects: uniqueAssignedSubjects,
          studentAssignments: studentAssignments.filter((assignment) => subjectFilter === "all" || assignment.subjectCode === subjectFilter),
          evaluation: getStudentInstructorEvaluationStatus(student.id,
            studentAssignments.filter((assignment) => subjectFilter === "all" || assignment.subjectCode === subjectFilter),
            evaluations.scope === evaluationScope ? evaluations.completions : []),
        };
      })
      .filter(({ student, assignedSubjects, evaluation }) => {
        return (
          assignedSubjects.length > 0 &&
          (yearLevelFilter === "all" || student.yearLevel === yearLevelFilter) &&
          (subjectFilter === "all" || assignedSubjects.includes(subjectFilter)) &&
          (evaluationFilter === "all" || (evaluationsReady && evaluation.status === evaluationFilter))
        );
      });
  }, [assignments, sectionFilter, students, subjectFilter, yearLevelFilter, evaluations, evaluationScope, evaluationFilter, evaluationsReady]);

  const handleDownloadMasterlist = async () => {
    if (!currentUser?.branch || isDownloading) return;
    setIsDownloading(true);
    setDownloadError("");
    try {
      const grades = await fetchAndCacheStudentGradeRecordsForBranch(currentUser.branch);
      const sheets = buildInstructorGradeMasterlist({ rows, grades, instructorId: currentUser.id, branch: currentUser.branch });
      const filename = `grades-masterlist-${currentUser.id}`.replace(/[\\/:*?"<>|]/g, "-");
      await downloadStyledGradeTemplate({ branch: currentUser.branch, fileName: `${filename}.xlsx`, templateType: "College", sheets });
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to download the grades masterlist.");
    } finally {
      setIsDownloading(false);
    }
  };

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
        <div className="instructor-section-actions">
          <strong>{rows.length} of {students.length} students</strong>
          <button type="button" onClick={() => void handleDownloadMasterlist()}
            disabled={isDownloading || rows.length === 0 || !currentUser?.branch}>
            <FiDownload aria-hidden="true" /> {isDownloading ? "Preparing..." : "Download Grades Masterlist"}
          </button>
        </div>
      </div>

      <div className="instructor-filters instructor-student-filters">
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
        <label>
          Evaluation Status
          <select value={evaluationFilter} onChange={(event) => setEvaluationFilter(event.target.value)}>
            <option value="all">All evaluation statuses</option>
            <option value="completed">Completed</option>
            <option value="in-progress">In progress</option>
            <option value="pending">Pending</option>
          </select>
        </label>
      </div>

      <p className="instructor-masterlist-note">The masterlist follows the selected filters, with separate sheets per assigned subject, section, and term. Students without recorded grades have blank grade cells.</p>
      {downloadError && <p className="instructor-evaluation-error" role="alert">{downloadError}</p>}

      {evaluations.scope === evaluationScope && evaluations.error && (
        <p className="instructor-evaluation-error" role="alert">{evaluations.error}</p>
      )}
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
              <th title="Completion for the selected subject, or all assigned subjects when All subjects is selected.">Evaluation Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student, assignedSubjects, assignedSections, evaluation }) => (
              <tr key={student.id}>
                <td>{student.id}</td>
                <td>{student.name}</td>
                <td>{student.program}</td>
                <td>{student.yearLevel}</td>
                <td>{assignedSections.join(", ")}</td>
                <td>{assignedSubjects.join(", ") || "No matched subjects"}</td>
                <td>
                  {evaluations.scope !== evaluationScope || evaluations.loading ? "Loading..."
                    : evaluations.error ? "Unavailable"
                      : evaluation.totalCount === 0 ? "Not applicable"
                        : <div className="instructor-evaluation-progress">
                          <span className={`instructor-evaluation-status ${evaluation.status}`}>
                            {evaluation.status === "completed" ? "Completed" : evaluation.status === "in-progress" ? "In progress" : "Pending"}
                          </span>
                          <small>{evaluation.completedCount} of {evaluation.totalCount} subjects evaluated</small>
                        </div>}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>{evaluationFilter !== "all" && !evaluationsReady
                  ? evaluations.error ? "Evaluation status is unavailable. Select All evaluation statuses to view the roster." : "Loading evaluation statuses..."
                  : "No enrolled students match the selected filters."}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
