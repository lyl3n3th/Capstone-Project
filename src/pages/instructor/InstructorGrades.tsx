import { useState } from "react";
import * as XLSX from "xlsx";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiDownload,
  FiInfo,
  FiUpload,
  FiX,
} from "react-icons/fi";
import SkeletonPage from "../../components/common/SkeletonPage";
import { useInstructorPortal } from "../../hooks/useInstructorPortal";
import {
  downloadInstructorGradeTemplate,
  downloadInstructorSubmittedFile,
  parseInstructorGradeWorkbook,
  saveInstructorGradeSubmission,
  type InstructorGradeSubmission,
  type InstructorGradeSubmissionErrorRow,
} from "../../services/instructorPortal";

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => {
      reject(new Error("Unable to read the uploaded file."));
    };
    reader.readAsDataURL(file);
  });

const COMPACT_COLLEGE_GRADE_ERROR = "College grades must use 1.00 - 5.00";
const LEGACY_COLLEGE_GRADE_ERROR_PARTS = new Set([
  "1.25",
  "1.50",
  "1.75",
  "2.00",
  "2.25",
  "2.50",
  "2.75",
  "3.00",
  "4.00 (INC)",
  "or 5.00 (FAILED)",
]);

type GradePreviewWorksheetRow = Array<string | number | boolean | null | undefined>;

type GradeFilePreviewRow = {
  sheetName: string;
  rowNumber: number;
  studentId: string;
  fullName: string;
  subjectCode: string;
  subjectTitle: string;
  unitsOrPeriod: string;
  grade: string;
  instructorName: string;
  academicYear: string;
  semester: string;
  programType: string;
  status: "Correct" | "Error";
  errors: string[];
  errorCells: string[];
};

type GradeFilePreview = {
  submission: InstructorGradeSubmission;
  rows: GradeFilePreviewRow[];
};

const getCellText = (value: unknown) => String(value ?? "").trim();

const normalizeHeaderKey = (value: unknown) =>
  getCellText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");

const findGradeHeaderRowIndex = (rows: GradePreviewWorksheetRow[]) =>
  rows.findIndex((row) => {
    const keys = row.map(normalizeHeaderKey);
    return (
      keys.includes("STUDENTID") &&
      keys.includes("FULLNAME") &&
      keys.includes("SUBJECTCODE")
    );
  });

const getValueByAliases = (
  row: Record<string, unknown>,
  aliases: string[],
) => {
  const normalizedAliases = aliases.map(normalizeHeaderKey);
  const matchedEntry = Object.entries(row).find(([key]) =>
    normalizedAliases.includes(normalizeHeaderKey(key)),
  );

  return matchedEntry ? String(matchedEntry[1] ?? "").trim() : "";
};

const getMetadataValue = (
  rows: GradePreviewWorksheetRow[],
  headerRowIndex: number,
  aliases: string[],
) => {
  const normalizedAliases = aliases.map(normalizeHeaderKey);
  const metadataRows = rows.slice(0, Math.max(0, headerRowIndex));

  for (const row of metadataRows) {
    for (let index = 0; index < row.length; index += 1) {
      if (!normalizedAliases.includes(normalizeHeaderKey(row[index]))) {
        continue;
      }

      const directValue = getCellText(row[index + 1]);
      if (directValue) {
        return directValue;
      }
    }
  }

  return "";
};

const getPreviewRowHasData = (row: Record<string, unknown>) =>
  [
    "Student ID",
    "STUDENT_ID",
    "Full Name",
    "FULL NAME",
    "Subject Code",
    "SUBJECT_CODE",
    "Subject Title",
    "SUBJECT_TITLE",
    "Grade",
    "Grades",
    "GRADES",
    "Unit",
    "Units",
    "UNITS",
    "Quarter",
    "QUARTER",
    "Instructor",
    "INSTRUCTOR",
  ].some((alias) => getValueByAliases(row, [alias]) !== "");

const getDisplayGradeErrors = (errors: string[]) => {
  let hasCollegeGradeScaleError = false;
  const displayErrors: string[] = [];
  const instructorMismatchPattern =
    /^Instructor\s+"(.+)"\s+does not match\s+.+\.$/i;

  errors.forEach((error) => {
    const trimmedError = error.trim();

    if (!trimmedError) {
      return;
    }

    if (
      trimmedError.startsWith("College grades must use") ||
      LEGACY_COLLEGE_GRADE_ERROR_PARTS.has(trimmedError)
    ) {
      hasCollegeGradeScaleError = true;
      return;
    }

    const instructorMismatch = trimmedError.match(instructorMismatchPattern);
    if (instructorMismatch) {
      displayErrors.push(`Instructor "${instructorMismatch[1]}" does not exist.`);
      return;
    }

    displayErrors.push(trimmedError);
  });

  return hasCollegeGradeScaleError
    ? [COMPACT_COLLEGE_GRADE_ERROR, ...displayErrors]
    : displayErrors;
};

const getGradeErrorCells = (row: InstructorGradeSubmissionErrorRow) => {
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
    if (normalized.includes("grade")) cells.add(rowCell("Grade", "F"));
    if (normalized.includes("instructor")) cells.add(rowCell("Instructor", "H"));
    if (normalized.includes("academic year")) cells.add("Academic Year header");
    if (normalized.includes("semester")) cells.add("Semester header");
  });

  return Array.from(cells);
};

const buildGradeFilePreview = (
  submission: InstructorGradeSubmission,
): GradeFilePreviewRow[] => {
  if (!submission.fileDataBase64) {
    throw new Error("This submission does not have a saved uploaded file.");
  }

  const workbook = XLSX.read(submission.fileDataBase64, { type: "base64" });
  const errorRowsByLocation = new Map(
    (submission.errorRows ?? []).map((row) => [
      `${row.sheetName}::${row.rowNumber}`,
      row,
    ]),
  );
  const rows: GradeFilePreviewRow[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json<GradePreviewWorksheetRow>(
      worksheet,
      {
        header: 1,
        defval: "",
        blankrows: false,
      },
    );
    const headerRowIndex = findGradeHeaderRowIndex(sheetRows);

    if (headerRowIndex === -1) {
      return;
    }

    const headerRow = sheetRows[headerRowIndex] ?? [];
    const academicYear = getMetadataValue(sheetRows, headerRowIndex, [
      "ACADEMIC_YEAR",
      "ACADEMIC YEAR",
      "SCHOOL_YEAR",
      "SCHOOL YEAR",
    ]);
    const semester = getMetadataValue(sheetRows, headerRowIndex, ["SEMESTER"]);
    const programType = getMetadataValue(sheetRows, headerRowIndex, ["PROGRAM"]);

    sheetRows.slice(headerRowIndex + 1).forEach((row, rowOffset) => {
      const rowNumber = headerRowIndex + rowOffset + 2;
      const values = headerRow.reduce<Record<string, unknown>>(
        (record, headerCell, index) => {
          const key = getCellText(headerCell);

          if (key) {
            record[key] = row[index] ?? "";
          }

          return record;
        },
        {},
      );

      if (!getPreviewRowHasData(values)) {
        return;
      }

      const errorRow = errorRowsByLocation.get(`${sheetName}::${rowNumber}`);
      const errors = errorRow ? getDisplayGradeErrors(errorRow.errors) : [];
      const gradePreviewRow: GradeFilePreviewRow = {
        sheetName,
        rowNumber,
        studentId: getValueByAliases(values, ["Student ID", "STUDENT_ID"]),
        fullName: getValueByAliases(values, ["Full Name", "FULL NAME"]),
        subjectCode: getValueByAliases(values, ["Subject Code", "SUBJECT_CODE"]),
        subjectTitle: getValueByAliases(values, [
          "Subject Title",
          "SUBJECT_TITLE",
        ]),
        unitsOrPeriod:
          getValueByAliases(values, ["Unit", "Units", "UNITS"]) ||
          getValueByAliases(values, ["Grading Period", "Quarter", "QUARTER"]),
        grade: getValueByAliases(values, ["Grade", "Grades", "GRADES"]),
        instructorName: getValueByAliases(values, ["Instructor", "INSTRUCTOR"]),
        academicYear,
        semester,
        programType,
        status: errorRow ? "Error" : "Correct",
        errors,
        errorCells: errorRow ? getGradeErrorCells(errorRow) : [],
      };

      rows.push(gradePreviewRow);
    });
  });

  return rows;
};

export default function InstructorGrades() {
  const {
    currentUser,
    instructor,
    assignments,
    sections,
    students,
    submissions,
    refreshSubmissions,
    isLoading,
  } = useInstructorPortal();
  const [message, setMessage] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [filePreview, setFilePreview] = useState<GradeFilePreview | null>(null);
  const [errorPreviewSubmission, setErrorPreviewSubmission] =
    useState<InstructorGradeSubmission | null>(null);

  const handleDownloadTemplate = async () => {
    if (!instructor) {
      setMessage("Instructor profile is still loading.");
      return;
    }

    try {
      setIsDownloadingTemplate(true);
      await downloadInstructorGradeTemplate({
        instructor,
        branch: currentUser?.branch,
        assignments,
        sections,
        students,
      });
      setMessage("Grade template downloaded.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to download the grade template.",
      );
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleUpload = async (file?: File) => {
    if (!file || !instructor || !currentUser?.branch) {
      return;
    }

    try {
      setIsParsing(true);
      const [fileDataBase64, result] = await Promise.all([
        readFileAsBase64(file),
        parseInstructorGradeWorkbook({
          file,
          branch: currentUser.branch,
          instructor,
          allowedAssignments: assignments,
        }),
      ]);
      const hasErrors = result.errorRows.length > 0;

      saveInstructorGradeSubmission(currentUser.branch, {
        id: `grade-submission-${Date.now()}`,
        branch: currentUser.branch,
        instructorId: instructor.id,
        instructorName: instructor.name,
        employeeId: instructor.employeeId,
        fileName: file.name,
        fileMimeType: file.type,
        fileDataBase64,
        submittedAt: new Date().toISOString(),
        status: hasErrors ? "Error" : "Pending",
        records: result.records,
        errors: result.errors,
        errorRows: result.errorRows,
      });
      refreshSubmissions();
      setMessage(
        hasErrors
          ? `${result.errorRows.length} row(s) have errors. Open Errors from Actions to review the rows.`
          : `${result.records.length} grade row(s) submitted for approval.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to parse grade file.",
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleOpenFilePreview = (submission: InstructorGradeSubmission) => {
    try {
      setFilePreview({
        submission,
        rows: buildGradeFilePreview(submission),
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to open the uploaded file preview.",
      );
    }
  };

  const handleDownloadOriginal = (submission: InstructorGradeSubmission) => {
    try {
      downloadInstructorSubmittedFile(submission);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to download the uploaded file.",
      );
    }
  };

  const handleOpenErrors = (submission: InstructorGradeSubmission) => {
    if ((submission.errorRows?.length ?? 0) === 0) {
      setMessage("This submission does not have row errors to review.");
      return;
    }

    setErrorPreviewSubmission(submission);
  };

  if (isLoading) {
    return (
      <SkeletonPage
        className="instructor-panel"
        eyebrow="Submit for approval"
        title="Grades Upload"
        variant="upload"
      />
    );
  }

  return (
    <div className="instructor-panel">
      <div className="instructor-page-header">
        <div>
          <span>Submit for approval</span>
          <h1>Grades Upload</h1>
        </div>
      </div>

      <section className="instructor-upload-guide">
        <div className="instructor-upload-guide-heading">
          <FiInfo aria-hidden="true" />
          <div>
            <h2>Upload Guide</h2>
            <p>Use the downloaded template so your students, sections, and assigned subjects match the system records.</p>
          </div>
        </div>

        <div className="instructor-upload-guide-grid">
          <div>
            <h3>What to do</h3>
            <ol>
              <li>Download My Template.</li>
              <li>Open the file and enter grades in the Grade column.</li>
              <li>Keep the student, subject, section, semester, and instructor details unchanged.</li>
              <li>Save the file as .xlsx or .xls, then upload it here.</li>
              <li>If the submission has errors, open Errors from Actions and fix the listed rows.</li>
            </ol>
          </div>

          <div>
            <h3>What to put</h3>
            <ul>
              <li>
                <FiCheckCircle aria-hidden="true" />
                <span>College: 1.00 - 5.00.</span>
              </li>
              <li>
                <FiCheckCircle aria-hidden="true" />
                <span>SHS: numeric grades from 60 to 100. Passing grade starts at 75.</span>
              </li>
              <li>
                <FiCheckCircle aria-hidden="true" />
                <span>Upload only subjects assigned to your instructor account.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="instructor-actions-panel">
        <button
          type="button"
          onClick={() => void handleDownloadTemplate()}
          disabled={isDownloadingTemplate}
        >
          <FiDownload />{" "}
          {isDownloadingTemplate ? "Preparing..." : "Download My Template"}
        </button>
        <label>
          <FiUpload /> {isParsing ? "Reading..." : "Upload Completed Template"}
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => void handleUpload(event.target.files?.[0])}
          />
        </label>
      </section>

      {message ? <p className="instructor-message">{message}</p> : null}

      <section className="instructor-section">
        <h2>My Grade Submissions</h2>
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
              {submissions.map((submission) => (
                <tr key={submission.id}>
                  <td>{new Date(submission.submittedAt).toLocaleString()}</td>
                  <td>{submission.fileName}</td>
                  <td>{submission.records.length}</td>
                  <td>{submission.status}</td>
                  <td className="instructor-table-actions-cell">
                    <div className="instructor-table-actions">
                      <button
                        type="button"
                        onClick={() => handleOpenFilePreview(submission)}
                        disabled={!submission.fileDataBase64}
                      >
                        <FiDownload /> File
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenErrors(submission)}
                        disabled={(submission.errorRows?.length ?? 0) === 0}
                      >
                        <FiAlertTriangle /> Errors
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {submissions.length === 0 ? (
                <tr>
                  <td colSpan={5}>No grade submissions yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {filePreview ? (
        <div
          className="instructor-file-modal-overlay"
          role="presentation"
          onClick={() => setFilePreview(null)}
        >
          <section
            className="instructor-file-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructor-file-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="instructor-file-modal-header">
              <div>
                <span>Uploaded file preview</span>
                <h2 id="instructor-file-modal-title">
                  {filePreview.submission.fileName}
                </h2>
                <p>
                  {filePreview.rows.filter((row) => row.status === "Correct").length.toLocaleString()}{" "}
                  correct row(s),{" "}
                  {filePreview.rows.filter((row) => row.status === "Error").length.toLocaleString()}{" "}
                  row(s) with errors.
                </p>
              </div>
              <div className="instructor-file-modal-actions">
                <button
                  type="button"
                  onClick={() => handleDownloadOriginal(filePreview.submission)}
                >
                  <FiDownload /> Download
                </button>
                <button
                  type="button"
                  className="instructor-file-modal-close"
                  aria-label="Close file preview"
                  onClick={() => setFilePreview(null)}
                >
                  <FiX />
                </button>
              </div>
            </div>

            <div className="instructor-file-table-wrap">
              <table className="instructor-file-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Sheet</th>
                    <th>Excel Row</th>
                    <th>Cells</th>
                    <th>Student ID</th>
                    <th>Full Name</th>
                    <th>Subject Code</th>
                    <th>Subject Title</th>
                    <th>Units / Period</th>
                    <th>Grade</th>
                    <th>Instructor</th>
                    <th>Academic Year</th>
                    <th>Semester</th>
                    <th>Program</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {filePreview.rows.map((row, index) => (
                    <tr
                      key={`${row.sheetName}-${row.rowNumber}-${index}`}
                      className={
                        row.status === "Error"
                          ? "instructor-file-row-error"
                          : "instructor-file-row-correct"
                      }
                    >
                      <td>
                        <span
                          className={`instructor-file-status instructor-file-status-${row.status.toLowerCase()}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td>{row.sheetName}</td>
                      <td>{row.rowNumber}</td>
                      <td>
                        <div className="instructor-error-cell-list">
                          {row.errorCells.length > 0
                            ? row.errorCells.map((cell) => (
                                <span key={cell}>{cell}</span>
                              ))
                            : <span className="instructor-file-cell-ok">OK</span>}
                        </div>
                      </td>
                      <td>{row.studentId || "-"}</td>
                      <td>{row.fullName || "-"}</td>
                      <td>{row.subjectCode || "-"}</td>
                      <td>{row.subjectTitle || "-"}</td>
                      <td>{row.unitsOrPeriod || "-"}</td>
                      <td>{row.grade || "-"}</td>
                      <td>{row.instructorName || "-"}</td>
                      <td>{row.academicYear || "-"}</td>
                      <td>{row.semester || "-"}</td>
                      <td>{row.programType || "-"}</td>
                      <td>
                        {row.errors.length > 0 ? (
                          <ul className="instructor-error-problems">
                            {row.errors.map((error) => (
                              <li key={error}>{error}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="instructor-file-no-errors">
                            No errors
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filePreview.rows.length === 0 ? (
                    <tr>
                      <td colSpan={15}>No grade rows were found in this file.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {errorPreviewSubmission ? (
        <div
          className="instructor-error-modal-overlay"
          role="presentation"
          onClick={() => setErrorPreviewSubmission(null)}
        >
          <section
            className="instructor-error-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructor-error-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="instructor-error-modal-header">
              <div>
                <span>Uploaded file</span>
                <h2 id="instructor-error-modal-title">
                  {errorPreviewSubmission.fileName}
                </h2>
                <p>
                  {(errorPreviewSubmission.errorRows?.length ?? 0).toLocaleString()}{" "}
                  row(s) need correction before this file can be approved.
                </p>
              </div>
              <button
                type="button"
                className="instructor-error-modal-close"
                aria-label="Close error review"
                onClick={() => setErrorPreviewSubmission(null)}
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
                    <th>Subject Code</th>
                    <th>Subject Title</th>
                    <th>Units</th>
                    <th>Grade</th>
                    <th>Instructor</th>
                    <th>Academic Year</th>
                    <th>Semester</th>
                    <th>Grading Period</th>
                    <th>Program</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {(errorPreviewSubmission.errorRows ?? []).map((row, index) => {
                    const errorCells = getGradeErrorCells(row);
                    const displayErrors = getDisplayGradeErrors(row.errors);

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
                        <td>{row.subjectCode || "-"}</td>
                        <td>{row.subjectTitle || "-"}</td>
                        <td>{row.units || "-"}</td>
                        <td>{row.grade || "-"}</td>
                        <td>{row.instructorName || "-"}</td>
                        <td>{row.academicYear || "-"}</td>
                        <td>{row.semester || "-"}</td>
                        <td>{row.gradingPeriod || "-"}</td>
                        <td>{row.programType}</td>
                        <td>
                          <ul className="instructor-error-problems">
                            {displayErrors.map((error) => (
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
