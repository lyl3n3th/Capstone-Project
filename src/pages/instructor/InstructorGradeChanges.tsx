import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiDownload,
  FiUpload,
  FiX,
} from "react-icons/fi";
import SkeletonPage from "../../components/common/SkeletonPage";
import { useInstructorPortal } from "../../hooks/useInstructorPortal";
import {
  downloadInstructorGradeChangeTemplate,
  fetchAndCacheInstructorGradeChangeRequests,
  getInstructorGradeChangeRequests,
  parseInstructorGradeChangeWorkbook,
  saveInstructorGradeChangeRequest,
  type InstructorGradeChangeRequest,
  type InstructorGradeChangeRequestErrorRow,
} from "../../services/instructorPortal";

const SEMESTER_OPTIONS = ["1st Semester", "2nd Semester", "Summer"];
const SHS_QUARTER_OPTIONS_BY_SEMESTER: Record<string, string[]> = {
  "1st Semester": ["1st Quarter", "2nd Quarter"],
  "2nd Semester": ["3rd Quarter", "4th Quarter"],
  Summer: ["1st Quarter", "2nd Quarter"],
};

const getDefaultAcademicYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const getSectionLabel = (section: { code: string; section?: string }) =>
  [section.code, section.section && section.section !== section.code ? section.section : ""]
    .filter(Boolean)
    .join(" - ");

const getCompactFileName = (fileName: string) =>
  fileName.length > 21 ? `${fileName.slice(0, 18)}...` : fileName;

const getGradeChangeErrorCells = (row: InstructorGradeChangeRequestErrorRow) => {
  const cells = new Set<string>();
  const rowNumber = row.rowNumber;
  const rowCell = (label: string, column: string) =>
    `${label} (${column}${rowNumber})`;

  row.errors.forEach((error) => {
    const normalized = error.toLowerCase();

    if (normalized.includes("student id")) cells.add(rowCell("Student ID", "A"));
    if (normalized.includes("full name")) cells.add(rowCell("Full Name", "B"));
    if (normalized.includes("subject code")) cells.add(rowCell("Subject Code", "C"));
    if (normalized.includes("subject title")) cells.add(rowCell("Subject Title", "D"));
    if (normalized.includes("unit")) cells.add(rowCell("Units", "E"));
    if (normalized.includes("grading period")) {
      cells.add(rowCell("Grading Period", "E"));
    }
    if (normalized.includes("current grade")) {
      cells.add(rowCell("Current Grade", "F"));
    }
    if (normalized.includes("requested grade") || normalized.includes("grade")) {
      cells.add(rowCell("Requested Grade", "G"));
    }
    if (normalized.includes("instructor")) cells.add(rowCell("Instructor", "H"));
    if (normalized.includes("academic year")) cells.add("Academic Year header");
    if (normalized.includes("semester")) cells.add("Semester header");
    if (normalized.includes("section")) cells.add("Section sheet/header");
  });

  return Array.from(cells);
};

export default function InstructorGradeChanges() {
  const {
    currentUser,
    instructor,
    assignments,
    sections,
    students,
    isLoading,
  } = useInstructorPortal();
  const [sectionFilter, setSectionFilter] = useState("all");
  const [academicYear, setAcademicYear] = useState(getDefaultAcademicYear);
  const [semester, setSemester] = useState("1st Semester");
  const [shsQuarter, setShsQuarter] = useState("1st Quarter");
  const [message, setMessage] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [requestsVersion, setRequestsVersion] = useState(0);
  const [viewingRequest, setViewingRequest] =
    useState<InstructorGradeChangeRequest | null>(null);
  const [errorPreviewRequest, setErrorPreviewRequest] =
    useState<InstructorGradeChangeRequest | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!currentUser?.branch) {
      return;
    }

    void fetchAndCacheInstructorGradeChangeRequests(currentUser.branch)
      .then(() => setRequestsVersion((previousValue) => previousValue + 1))
      .catch((error) => {
        console.warn("Unable to load grade change requests.", error);
      });
  }, [currentUser?.branch]);

  const assignedSectionOptions = useMemo(() => {
    const assignmentSectionIds = new Set(
      assignments.flatMap((assignment) => [
        assignment.sectionId,
        assignment.sectionCode,
      ]),
    );

    return sections
      .filter(
        (section) =>
          assignmentSectionIds.has(section.id) ||
          assignmentSectionIds.has(section.code),
      )
      .sort(
        (left, right) =>
          left.code.localeCompare(right.code) ||
          left.section.localeCompare(right.section),
      );
  }, [assignments, sections]);

  const academicYearOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...assignments.map((assignment) => assignment.academicYear),
          academicYear,
        ]),
      )
        .filter(Boolean)
        .sort((left, right) => right.localeCompare(left)),
    [academicYear, assignments],
  );

  const availableQuarterOptions =
    SHS_QUARTER_OPTIONS_BY_SEMESTER[semester] ??
    SHS_QUARTER_OPTIONS_BY_SEMESTER["1st Semester"];

  useEffect(() => {
    if (!availableQuarterOptions.includes(shsQuarter)) {
      setShsQuarter(availableQuarterOptions[0]);
    }
  }, [availableQuarterOptions, shsQuarter]);

  useEffect(() => {
    if (
      assignments.length > 0 &&
      !assignments.some((assignment) => assignment.academicYear === academicYear)
    ) {
      setAcademicYear(assignments[0].academicYear || getDefaultAcademicYear());
    }
  }, [academicYear, assignments]);

  const requests = useMemo<InstructorGradeChangeRequest[]>(() => {
    void requestsVersion;
    return getInstructorGradeChangeRequests(currentUser?.branch).filter(
      (request) => request.instructorId === currentUser?.id,
    );
  }, [currentUser?.branch, currentUser?.id, requestsVersion]);

  const handleDownloadTemplate = async () => {
    if (!instructor || !currentUser?.branch) {
      setMessage("Instructor profile is still loading.");
      return;
    }

    try {
      setIsDownloading(true);
      await downloadInstructorGradeChangeTemplate({
        instructor,
        branch: currentUser.branch,
        assignments,
        sections,
        students,
        filters: {
          sectionIds: sectionFilter === "all" ? [] : [sectionFilter],
          academicYear,
          semester,
          gradingPeriod: shsQuarter,
        },
      });
      setMessage("Grade change template downloaded.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to download the grade change template.",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleUpload = async (file?: File) => {
    if (!file || !instructor || !currentUser?.branch) {
      return;
    }

    try {
      setIsParsing(true);
      const result = await parseInstructorGradeChangeWorkbook({
        file,
        branch: currentUser.branch,
        instructor,
        allowedAssignments: assignments,
      });
      const hasErrors = result.errorRows.length > 0;

      if (result.changes.length === 0 && !hasErrors) {
        setMessage(
          result.skippedBlankRows > 0
            ? "No requested grade changes were found. Blank Requested Grade cells were ignored."
            : "No requested grade changes were found in this file.",
        );
        return;
      }

      saveInstructorGradeChangeRequest(currentUser.branch, {
        id: `grade-change-request-${Date.now()}`,
        branch: currentUser.branch,
        instructorId: instructor.id,
        instructorName: instructor.name,
        employeeId: instructor.employeeId,
        fileName: file.name,
        submittedAt: new Date().toISOString(),
        status: hasErrors ? "Error" : "Pending",
        changes: result.changes,
        errors: result.errors,
        errorRows: result.errorRows,
      });
      setRequestsVersion((previousValue) => previousValue + 1);
      setMessage(
        hasErrors
          ? `${result.errorRows.length} row(s) need correction. Valid requested changes were saved for review.`
          : `${result.changes.length} grade change request(s) submitted.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to parse the grade change file.",
      );
    } finally {
      setIsParsing(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleOpenErrors = (request: InstructorGradeChangeRequest) => {
    if ((request.errorRows?.length ?? 0) === 0) {
      setMessage("This request does not have row errors to review.");
      return;
    }

    setErrorPreviewRequest(request);
  };

  if (isLoading) {
    return (
      <SkeletonPage
        className="instructor-panel"
        eyebrow="Grade corrections"
        title="Grade Change Requests"
        variant="upload"
      />
    );
  }

  return (
    <div className="instructor-panel">
      <div className="instructor-page-header">
        <div>
          <span>Grade corrections</span>
          <h1>Grade Change Requests</h1>
        </div>
        <strong>{requests.length} request{requests.length === 1 ? "" : "s"}</strong>
      </div>

      <section className="instructor-filters">
        <label>
          Sections
          <select
            value={sectionFilter}
            onChange={(event) => setSectionFilter(event.target.value)}
          >
            <option value="all">All assigned sections</option>
            {assignedSectionOptions.map((section) => (
              <option key={section.id} value={section.id}>
                {getSectionLabel(section)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Academic Year
          <select
            value={academicYear}
            onChange={(event) => setAcademicYear(event.target.value)}
          >
            {academicYearOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Semester
          <select
            value={semester}
            onChange={(event) => setSemester(event.target.value)}
          >
            {SEMESTER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          SHS Quarter
          <select
            value={shsQuarter}
            onChange={(event) => setShsQuarter(event.target.value)}
          >
            {availableQuarterOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="instructor-actions-panel">
        <button
          type="button"
          onClick={() => void handleDownloadTemplate()}
          disabled={isDownloading}
        >
          <FiDownload />
          {isDownloading ? "Preparing..." : "Download Change Template"}
        </button>
        <label>
          <FiUpload /> {isParsing ? "Reading..." : "Upload Change Request"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => void handleUpload(event.target.files?.[0])}
          />
        </label>
      </section>

      {message ? <p className="instructor-message">{message}</p> : null}

      <section className="instructor-section">
        <h2>My Grade Change Requests</h2>
        <div className="instructor-table-wrap">
          <table className="instructor-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>File</th>
                <th>Rows</th>
                <th>Status</th>
                <th className="instructor-table-actions-heading">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td>{new Date(request.submittedAt).toLocaleString()}</td>
                  <td title={request.fileName}>
                    <span className="instructor-compact-file-name">
                      {getCompactFileName(request.fileName)}
                    </span>
                  </td>
                  <td>{request.changes.length}</td>
                  <td>{request.status}</td>
                  <td className="instructor-table-actions-cell">
                    <div className="instructor-table-actions">
                      <button
                        type="button"
                        onClick={() => setViewingRequest(request)}
                        disabled={request.changes.length === 0}
                      >
                        <FiCheckCircle /> Changes
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenErrors(request)}
                        disabled={(request.errorRows?.length ?? 0) === 0}
                      >
                        <FiAlertTriangle /> Errors
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={5}>No grade change requests yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {viewingRequest ? (
        <div
          className="instructor-file-modal-overlay"
          role="presentation"
          onClick={() => setViewingRequest(null)}
        >
          <section
            className="instructor-file-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructor-change-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="instructor-file-modal-header">
              <div>
                <span>Grade change request</span>
                <h2 id="instructor-change-modal-title">
                  {viewingRequest.fileName}
                </h2>
                <p>
                  {viewingRequest.changes.length.toLocaleString()} requested
                  change{viewingRequest.changes.length === 1 ? "" : "s"}.
                </p>
              </div>
              <div className="instructor-file-modal-actions">
                <button
                  type="button"
                  className="instructor-file-modal-close"
                  aria-label="Close grade change request"
                  onClick={() => setViewingRequest(null)}
                >
                  <FiX />
                </button>
              </div>
            </div>

            <div className="instructor-file-table-wrap">
              <table className="instructor-file-table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Full Name</th>
                    <th>Section</th>
                    <th>Subject Code</th>
                    <th>Subject Title</th>
                    <th>Units / Period</th>
                    <th>Current Grade</th>
                    <th>Requested Grade</th>
                    <th>Academic Year</th>
                    <th>Semester</th>
                    <th>Program</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingRequest.changes.map((change) => (
                    <tr key={change.id}>
                      <td>{change.studentId}</td>
                      <td>{change.fullName}</td>
                      <td>{change.section}</td>
                      <td>{change.subjectCode}</td>
                      <td>{change.subjectTitle}</td>
                      <td>
                        {change.programType === "SHS"
                          ? change.gradingPeriod || "-"
                          : change.units ?? "-"}
                      </td>
                      <td>{change.currentGrade}</td>
                      <td>{change.requestedGrade}</td>
                      <td>{change.academicYear}</td>
                      <td>{change.semester}</td>
                      <td>{change.programType}</td>
                    </tr>
                  ))}
                  {viewingRequest.changes.length === 0 ? (
                    <tr>
                      <td colSpan={11}>No grade changes were found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {errorPreviewRequest ? (
        <div
          className="instructor-error-modal-overlay"
          role="presentation"
          onClick={() => setErrorPreviewRequest(null)}
        >
          <section
            className="instructor-error-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructor-change-error-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="instructor-error-modal-header">
              <div>
                <span>Uploaded file</span>
                <h2 id="instructor-change-error-modal-title">
                  {errorPreviewRequest.fileName}
                </h2>
                <p>
                  {(errorPreviewRequest.errorRows?.length ?? 0).toLocaleString()}{" "}
                  row(s) need correction before this request can be reviewed.
                </p>
              </div>
              <button
                type="button"
                className="instructor-error-modal-close"
                aria-label="Close error review"
                onClick={() => setErrorPreviewRequest(null)}
              >
                <FiX />
              </button>
            </div>

            <div className="instructor-error-table-wrap">
              <table className="instructor-error-table">
                <thead>
                  <tr>
                    <th>Sheet</th>
                    <th>Excel Row</th>
                    <th>Cells</th>
                    <th>Student ID</th>
                    <th>Full Name</th>
                    <th>Section</th>
                    <th>Subject Code</th>
                    <th>Subject Title</th>
                    <th>Units / Period</th>
                    <th>Current Grade</th>
                    <th>Requested Grade</th>
                    <th>Instructor</th>
                    <th>Academic Year</th>
                    <th>Semester</th>
                    <th>Program</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {(errorPreviewRequest.errorRows ?? []).map((row, index) => {
                    const errorCells = getGradeChangeErrorCells(row);

                    return (
                      <tr
                        key={`${row.sheetName}-${row.rowNumber}-${index}`}
                        className="instructor-error-row"
                      >
                        <td>{row.sheetName}</td>
                        <td>{row.rowNumber}</td>
                        <td>
                          <div className="instructor-error-cell-list">
                            {errorCells.length > 0
                              ? errorCells.map((cell) => (
                                  <span key={cell}>{cell}</span>
                                ))
                              : <span>Row data</span>}
                          </div>
                        </td>
                        <td>{row.studentId || "-"}</td>
                        <td>{row.fullName || "-"}</td>
                        <td>{row.section || "-"}</td>
                        <td>{row.subjectCode || "-"}</td>
                        <td>{row.subjectTitle || "-"}</td>
                        <td>
                          {row.programType === "SHS"
                            ? row.gradingPeriod || "-"
                            : row.units || "-"}
                        </td>
                        <td>{row.currentGrade || "-"}</td>
                        <td>{row.requestedGrade || "-"}</td>
                        <td>{row.instructorName || "-"}</td>
                        <td>{row.academicYear || "-"}</td>
                        <td>{row.semester || "-"}</td>
                        <td>{row.programType}</td>
                        <td>
                          <ul className="instructor-error-problems">
                            {row.errors.map((error) => (
                              <li key={error}>{error}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
