import { useEffect, useMemo, useState } from "react";
import { FiDownload, FiSearch } from "react-icons/fi";
import { useInstructorPortal } from "../../hooks/useInstructorPortal";
import { getCurrentStudentInstructorAssignments } from "../../services/instructorRoster";
import {
  fetchAdminStudentPageSupplemental,
  fetchAdminStudentsPage,
} from "../../services/adminStudentsApi";
import { getInstructorScopedData } from "../../services/instructorPortal";
import type { StudentStorageRecord } from "../../services/adminStorage";
import SkeletonPage from "../../components/common/SkeletonPage";
import DebouncedSearchInput from "../../components/common/DebouncedSearchInput";
import TablePagination from "../../components/common/TablePagination";
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
  const {
    currentUser,
    assignments,
    sections,
    isLoading,
    loadSupplementalData,
  } = useInstructorPortal({ includeStudents: false, deferSupplemental: true });
  const [studentRecords, setStudentRecords] = useState<StudentStorageRecord[]>([]);
  const [supplementalSourcePage, setSupplementalSourcePage] = useState<StudentStorageRecord[]>([]);
  const [pageTotalItems, setPageTotalItems] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [yearLevelFilter, setYearLevelFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [evaluationFilter, setEvaluationFilter] = useState("all");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const evaluationScope = `${currentUser?.branch ?? ""}::${currentUser?.id ?? ""}`;
  const [loadedRosterScope, setLoadedRosterScope] = useState("");
  const hasLoadedStudentPage = Boolean(currentUser?.branch && currentUser.id) && loadedRosterScope === evaluationScope;
  const [evaluations, setEvaluations] = useState<{
    scope: string;
    loading: boolean;
    error: string;
    completions: InstructorEvaluationCompletion[];
  }>({ scope: "", loading: true, error: "", completions: [] });
  const evaluationsReady = evaluations.scope === evaluationScope && !evaluations.loading && !evaluations.error;
  const [requestedPage, setRequestedPage] = useState({ scope: "", page: 1 });
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchTyping, setIsSearchTyping] = useState(false);
  const normalizedSearchQuery = searchQuery.trim();
  const normalizedSearch = normalizedSearchQuery.toLowerCase();
  const paginationScope = JSON.stringify([evaluationScope, sectionFilter, yearLevelFilter, subjectFilter, evaluationFilter, normalizedSearch]);

  const scopedAssignments = useMemo(() => assignments.filter((assignment) => {
    if (subjectFilter !== "all" && assignment.subjectCode !== subjectFilter) return false;
    if (sectionFilter !== "all" && (assignment.sectionCode || "Unassigned") !== sectionFilter) return false;
    if (yearLevelFilter !== "all") {
      const section = sections.find((candidate) =>
        candidate.id === assignment.sectionId || candidate.code === assignment.sectionCode,
      );
      if (section && section.yearLevel !== yearLevelFilter) return false;
    }
    return true;
  }), [assignments, sections, sectionFilter, subjectFilter, yearLevelFilter]);

  useEffect(() => {
    if (!hasLoadedStudentPage || !currentUser?.branch || !currentUser.id) return;
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
  }, [currentUser?.branch, currentUser?.id, hasLoadedStudentPage]);

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
      Array.from(new Set(assignments.map((assignment) => assignment.sectionCode || "Unassigned")))
        .sort((left, right) => left.localeCompare(right)),
    [assignments],
  );

  const yearLevelOptions = useMemo(
    () =>
      Array.from(new Set(sections.map((section) => section.yearLevel).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right),
      ),
    [sections],
  );

  const pageSize = 10;
  const currentPage = requestedPage.scope === paginationScope ? Math.max(1, requestedPage.page) : 1;

  useEffect(() => {
    if (isSearchTyping) return;
    if (isLoading || !currentUser?.branch || !currentUser.id) return;
    const sectionCodes = [...new Set(scopedAssignments.map((assignment) => assignment.sectionCode).filter(Boolean))];
    const sectionIds = new Set(scopedAssignments.map((assignment) => assignment.sectionId));
    const assignmentCodes = new Set(sectionCodes);
    const studentNumbers = [...new Set(sections
      .filter((section) => sectionIds.has(section.id) || assignmentCodes.has(section.code))
      .flatMap((section) => section.enrolleeIds)
      .filter(Boolean))];
    let cancelled = false;
    setPageLoading(true);
    setStudentRecords([]);
    setSupplementalSourcePage([]);
    setPageError("");
    void fetchAdminStudentsPage(currentUser.branch, currentPage, pageSize, {
      sectionCodes,
      studentNumbers,
      search: normalizedSearchQuery,
      yearLevel: yearLevelFilter === "all" ? undefined : yearLevelFilter,
    })
      .then(({ students: pageStudents, totalItems }) => {
        if (cancelled) return;
        setStudentRecords(pageStudents);
        setSupplementalSourcePage(pageStudents);
        setPageTotalItems(totalItems);
        setLoadedRosterScope(evaluationScope);
        const lastPage = Math.max(1, Math.ceil(totalItems / pageSize));
        if (currentPage > lastPage) setRequestedPage({ scope: paginationScope, page: lastPage });
      })
      .catch((error) => {
        if (!cancelled) {
          setStudentRecords([]);
          setPageTotalItems(0);
          setPageError(error instanceof Error ? error.message : "Unable to load students.");
        }
      })
      .finally(() => { if (!cancelled) setPageLoading(false); });
    return () => { cancelled = true; };
  }, [isSearchTyping, isLoading, currentUser?.branch, currentUser?.id, currentPage, pageSize, scopedAssignments, sections, yearLevelFilter, paginationScope, evaluationScope, normalizedSearchQuery]);

  useEffect(() => {
    if (isSearchTyping || !currentUser?.branch || supplementalSourcePage.length === 0) return;
    let cancelled = false;
    void Promise.allSettled([
      loadSupplementalData(),
      fetchAdminStudentPageSupplemental(currentUser.branch, supplementalSourcePage),
    ]).then(([, pageSupplementResult]) => {
      if (cancelled || pageSupplementResult.status !== "fulfilled") return;
      const byId = new Map(pageSupplementResult.value.map((student) => [student.id, student]));
      setStudentRecords((current) => current.map((student) => ({
        ...student,
        ...(byId.get(student.id) ?? {}),
      })));
    });
    return () => { cancelled = true; };
  }, [isSearchTyping, currentUser?.branch, loadSupplementalData, supplementalSourcePage]);

  const buildRows = (sourceStudents: StudentStorageRecord[]) => {
    const assignmentSubjectCodes = new Set(
      assignments.map((assignment) => assignment.subjectCode),
    );

    return sourceStudents
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
          (!normalizedSearch || student.name.toLowerCase().includes(normalizedSearch) || student.id.toLowerCase().includes(normalizedSearch)) &&
          (yearLevelFilter === "all" || student.yearLevel === yearLevelFilter) &&
          (subjectFilter === "all" || assignedSubjects.includes(subjectFilter)) &&
          (evaluationFilter === "all" || (evaluationsReady && evaluation.status === evaluationFilter))
        );
      });
  };

  const rows = buildRows(studentRecords);

  const paginatedRows = rows;

  const handleDownloadMasterlist = async () => {
    if (!currentUser?.branch || isDownloading) return;
    setIsDownloading(true);
    setDownloadError("");
    try {
      const allRoster = await getInstructorScopedData({ branch: currentUser.branch, instructorId: currentUser.id });
      const exportRows = buildRows(allRoster.students);
      const grades = await fetchAndCacheStudentGradeRecordsForBranch(currentUser.branch);
      const sheets = buildInstructorGradeMasterlist({ rows: exportRows, grades, instructorId: currentUser.id, branch: currentUser.branch });
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
      </div>

      <div className="instructor-student-toolbar">
        <label className="instructor-student-search">
          <FiSearch aria-hidden="true" />
          <DebouncedSearchInput
            type="search"
            aria-label="Search students by name or student number"
            placeholder="Search by name or student number..."
            value={searchQuery}
            onTypingStart={() => {
              setIsSearchTyping(true);
              setPageLoading(false);
              setSupplementalSourcePage([]);
            }}
            onValueChange={(value) => {
              setSearchQuery(value);
              setIsSearchTyping(false);
            }}
          />
        </label>
        <div className="instructor-section-actions">
          <button type="button" onClick={() => void handleDownloadMasterlist()}
          disabled={isDownloading || pageTotalItems === 0 || !currentUser?.branch}>
            <FiDownload aria-hidden="true" /> {isDownloading ? "Preparing..." : "Download Grades Masterlist"}
          </button>
        </div>
      </div>

      <div className="instructor-filters instructor-student-filters">
        <label>
          Section
          <select
            value={sectionFilter}
            onChange={(event) => { setSectionFilter(event.target.value); setRequestedPage({ scope: "", page: 1 }); }}
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
            onChange={(event) => { setYearLevelFilter(event.target.value); setRequestedPage({ scope: "", page: 1 }); }}
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
            onChange={(event) => { setSubjectFilter(event.target.value); setRequestedPage({ scope: "", page: 1 }); }}
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
          <select value={evaluationFilter} onChange={(event) => { setEvaluationFilter(event.target.value); setRequestedPage({ scope: "", page: 1 }); }}>
            <option value="all">All evaluation statuses</option>
            <option value="completed">Completed</option>
            <option value="in-progress">In progress</option>
            <option value="pending">Pending</option>
          </select>
        </label>
      </div>

      {downloadError && <p className="instructor-evaluation-error" role="alert">{downloadError}</p>}

      {evaluations.scope === evaluationScope && evaluations.error && (
        <p className="instructor-evaluation-error" role="alert">{evaluations.error}</p>
      )}
      {pageError && <p className="instructor-evaluation-error" role="alert">{pageError}</p>}
      {pageLoading && <p aria-live="polite">Loading this page…</p>}
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
            {paginatedRows.map(({ student, assignedSubjects, assignedSections, evaluation }) => (
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
            {rows.length === 0 && !pageLoading ? (
              <tr>
                <td colSpan={7}>{evaluationFilter !== "all" && !evaluationsReady
                  ? evaluations.error ? "Evaluation status is unavailable. Select All evaluation statuses to view the roster." : "Loading evaluation statuses..."
                  : "No enrolled students match the selected filters."}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePagination page={currentPage} pageSize={pageSize} totalItems={rows.length} onPageChange={(page) => setRequestedPage({ scope: paginationScope, page })} showPageNumbers={false} label="Instructor student pages" />
    </div>
  );
}
