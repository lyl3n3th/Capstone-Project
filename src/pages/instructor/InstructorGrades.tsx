import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiDownload,
  FiInfo,
  FiTrash2,
  FiUpload,
  FiX,
} from "react-icons/fi";
import SkeletonPage from "../../components/common/SkeletonPage";
import TablePagination from "../../components/common/TablePagination";
import { useInstructorPortal } from "../../hooks/useInstructorPortal";
import {
  downloadInstructorGradeTemplate,
  downloadInstructorSubmittedFile,
  deleteInstructorGradeSubmissions,
  fetchInstructorGradeSubmissionDetail,
  fetchInstructorGradeSubmissionPage,
  parseInstructorGradeWorkbook,
  saveInstructorGradeSubmission,
  SHS_GRADE_PERIOD_LABELS,
  type InstructorGradeSubmission,
  type InstructorGradeSubmissionErrorRow,
  type InstructorGradeSubmissionSummary,
} from "../../services/instructorPortal";
import { COLLEGE_GRADE_ERROR_MESSAGE } from "../../services/studentGrades";

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

const COMPACT_COLLEGE_GRADE_ERROR = COLLEGE_GRADE_ERROR_MESSAGE;
const INSTRUCTOR_SUBMISSIONS_PAGE_SIZE = 5;
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
    "Grade (50-100)",
    "Grade (0-100)",
    "Grades",
    "GRADES",
    "Unit",
    "Units",
    "UNITS",
    "Quarter",
    "QUARTER",
    ...SHS_GRADE_PERIOD_LABELS,
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
      trimmedError.startsWith("College grades must") ||
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
    if (normalized.includes("grade")) {
      cells.add(rowCell("Grade", row.gradeColumn || "F"));
    }
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
      `${row.sheetName}::${row.rowNumber}::${normalizeHeaderKey(row.gradingPeriod)}`,
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

      const rowProgramType =
        getValueByAliases(values, ["Program Type", "PROGRAM"]) || programType;
      const normalizedProgramType = rowProgramType.trim() === "SHS" ? "SHS" : "College";
      const shsQuarterColumns = SHS_GRADE_PERIOD_LABELS.filter((period) =>
        headerRow.some((header) => normalizeHeaderKey(header) === normalizeHeaderKey(period)),
      );
      const isShsQuarterColumns = normalizedProgramType === "SHS" && shsQuarterColumns.length > 0;
      const legacyGradingPeriod = getValueByAliases(values, [
        "Grading Period",
        "Quarter",
        "QUARTER",
      ]) || (normalizedProgramType === "College" ? semester : "");
      const gradeEntries = isShsQuarterColumns
        ? shsQuarterColumns
          .map((gradingPeriod) => ({
            gradingPeriod,
            grade: getValueByAliases(values, [gradingPeriod]),
          }))
          .filter(({ grade }) => grade.trim() !== "")
        : [{
            gradingPeriod: legacyGradingPeriod,
            grade: getValueByAliases(values, [
              "Grade",
              "Grade (50-100)",
              "Grade (0-100)",
              "Grades",
              "GRADES",
            ]),
          }];

      if (isShsQuarterColumns && gradeEntries.length === 0) {
        return;
      }

      gradeEntries.forEach(({ gradingPeriod, grade }) => {
        const errorRow = errorRowsByLocation.get(
          `${sheetName}::${rowNumber}::${normalizeHeaderKey(gradingPeriod)}`,
        );
        const errors = errorRow ? getDisplayGradeErrors(errorRow.errors) : [];
        rows.push({
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
            gradingPeriod,
          grade,
          instructorName: getValueByAliases(values, ["Instructor", "INSTRUCTOR"]),
          academicYear,
          semester,
          programType: normalizedProgramType,
          status: errorRow ? "Error" : "Correct",
          errors,
          errorCells: errorRow ? getGradeErrorCells(errorRow) : [],
        });
      });
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
    isLoading,
  } = useInstructorPortal({
    includeSubmissions: false,
    showLoadingOnFocusRefresh: false,
  });
  const [message, setMessage] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [templateSubjectId, setTemplateSubjectId] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const templateDropdownRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const dropdown = templateDropdownRef.current;
      if (dropdown && event.target instanceof Node && !dropdown.contains(event.target)) dropdown.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  const templateSubjects = useMemo(() => {
    const subjects = new Map<string, { id: string; code: string; name: string }>();
    for (const assignment of assignments) {
      const id = assignment.subjectId || assignment.subjectCode;
      subjects.set(id, { id, code: assignment.subjectCode, name: assignment.subjectName });
    }
    return [...subjects.values()].sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  }, [assignments]);
  const templateSubject = templateSubjects.find((subject) => subject.id === templateSubjectId);
  const [filePreview, setFilePreview] = useState<GradeFilePreview | null>(null);
  const [filePreviewNotice, setFilePreviewNotice] = useState("");
  const [isReviewingUpload, setIsReviewingUpload] = useState(false);
  const [uploadReviewError, setUploadReviewError] = useState("");
  const [errorPreviewSubmission, setErrorPreviewSubmission] =
    useState<InstructorGradeSubmission | null>(null);
  const [submissionActionNotice, setSubmissionActionNotice] = useState<{
    title: string;
    fileName: string;
    message: string;
  } | null>(null);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const [submissionPage, setSubmissionPage] = useState(1);
  const [submissionPageRows, setSubmissionPageRows] = useState<
    InstructorGradeSubmissionSummary[]
  >([]);
  const [submissionTotalItems, setSubmissionTotalItems] = useState(0);
  const [isLoadingSubmissionPage, setIsLoadingSubmissionPage] = useState(false);
  const [submissionLoadError, setSubmissionLoadError] = useState("");
  const [submissionReloadVersion, setSubmissionReloadVersion] = useState(0);
  const [loadingSubmissionDetailId, setLoadingSubmissionDetailId] = useState("");
  const submissionPageRequestRevision = useRef(0);

  useEffect(() => {
    if (isLoading || !currentUser?.branch || !instructor?.id) {
      setSubmissionPageRows([]);
      setSubmissionTotalItems(0);
      setIsLoadingSubmissionPage(false);
      return;
    }

    const requestRevision = ++submissionPageRequestRevision.current;
    let isCurrent = true;
    setIsLoadingSubmissionPage(true);
    setSubmissionLoadError("");
    setSubmissionPageRows([]);

    void fetchInstructorGradeSubmissionPage({
      branch: currentUser.branch,
      instructorId: instructor.id,
      page: submissionPage,
      pageSize: INSTRUCTOR_SUBMISSIONS_PAGE_SIZE,
    })
      .then((result) => {
        if (!isCurrent || requestRevision !== submissionPageRequestRevision.current) {
          return;
        }

        const lastPage = Math.max(
          1,
          Math.ceil(result.totalItems / INSTRUCTOR_SUBMISSIONS_PAGE_SIZE),
        );
        setSubmissionTotalItems(result.totalItems);
        if (submissionPage > lastPage) {
          setSubmissionPage(lastPage);
          return;
        }

        setSubmissionPageRows(result.submissions);
      })
      .catch((error) => {
        if (!isCurrent || requestRevision !== submissionPageRequestRevision.current) {
          return;
        }

        setSubmissionLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load grade submissions.",
        );
      })
      .finally(() => {
        if (isCurrent && requestRevision === submissionPageRequestRevision.current) {
          setIsLoadingSubmissionPage(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [
    currentUser?.branch,
    instructor?.id,
    isLoading,
    submissionPage,
    submissionReloadVersion,
  ]);

  useEffect(() => {
    const refreshSubmissionsOnFocus = () =>
      setSubmissionReloadVersion((previousVersion) => previousVersion + 1);
    window.addEventListener("focus", refreshSubmissionsOnFocus);
    return () => window.removeEventListener("focus", refreshSubmissionsOnFocus);
  }, []);

  const handleDownloadTemplate = async () => {
    if (!instructor) {
      setMessage("Instructor profile is still loading.");
      return;
    }

    if (!templateSubject) {
      setMessage("Choose a subject before downloading its grade template.");
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
        subjectId: templateSubject.id,
      });
      setMessage(`${templateSubject.name} grade template downloaded.`);
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
    if (!file) {
      return;
    }

    if (!instructor) {
      setMessage("Instructor profile is still loading. Please try again shortly.");
      return;
    }

    if (!currentUser?.branch) {
      setMessage("Your branch is not available. Sign in again before uploading grades.");
      return;
    }

    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setMessage("Choose an Excel grade file ending in .xlsx or .xls.");
      return;
    }

    try {
      setIsParsing(true);
      setUploadReviewError("");
      setMessage("Reading and validating the selected grade file...");
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
      const submission: InstructorGradeSubmission = {
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
      };

      setFilePreview({ submission, rows: buildGradeFilePreview(submission) });
      setFilePreviewNotice("");
      setIsReviewingUpload(true);
      setMessage(
        hasErrors
          ? "Review the grade rows and errors before confirming the submission."
          : result.records.length === 0
            ? "No grade rows were found. Review the file; an empty workbook cannot be submitted."
            : "Review the grade rows before confirming the submission.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to parse grade file.",
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!filePreview || !isReviewingUpload || !currentUser?.branch) {
      return;
    }

    if (filePreview.rows.length === 0) {
      setUploadReviewError("This file has no grade rows to submit.");
      return;
    }

    try {
      setIsParsing(true);
      setUploadReviewError("");
      setMessage("Saving the grade submission...");
      await saveInstructorGradeSubmission(
        currentUser.branch,
        filePreview.submission,
      );
      setSubmissionPage(1);
      setSubmissionReloadVersion((previousVersion) => previousVersion + 1);
      setFilePreview(null);
      setIsReviewingUpload(false);
      const hasErrors = (filePreview.submission.errorRows?.length ?? 0) > 0;
      setMessage(
        hasErrors
          ? `${filePreview.submission.errorRows?.length ?? 0} row(s) have errors. Open Errors from Actions to review them.`
          : `${filePreview.submission.records.length} grade row(s) submitted for approval.`,
      );
    } catch (error) {
      setUploadReviewError(
        error instanceof Error
          ? error.message
          : "Unable to save the grade submission.",
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleCloseFilePreview = () => {
    if (isParsing) {
      return;
    }

    if (isReviewingUpload) {
      setMessage("Upload cancelled. No grades were submitted.");
    }
    setFilePreview(null);
    setFilePreviewNotice("");
    setIsReviewingUpload(false);
    setUploadReviewError("");
  };

  const loadSubmissionDetails = async (submissionId: string) => {
    if (!currentUser?.branch || !instructor?.id) {
      throw new Error("Instructor details are not available. Refresh and try again.");
    }

    setLoadingSubmissionDetailId(submissionId);
    try {
      return await fetchInstructorGradeSubmissionDetail({
        branch: currentUser.branch,
        instructorId: instructor.id,
        submissionId,
      });
    } finally {
      setLoadingSubmissionDetailId("");
    }
  };

  const handleOpenFilePreview = async (
    submissionSummary: InstructorGradeSubmissionSummary,
  ) => {
    setSubmissionActionNotice(null);
    try {
      const submission = await loadSubmissionDetails(submissionSummary.id);
      if (!submission.fileDataBase64) {
        setFilePreview({ submission, rows: [] });
        setFilePreviewNotice(
          "This submission does not have a saved uploaded file. The workbook preview and download are unavailable.",
        );
        setIsReviewingUpload(false);
        setUploadReviewError("");
        return;
      }

      setFilePreview({
        submission,
        rows: buildGradeFilePreview(submission),
      });
      setFilePreviewNotice("");
      setIsReviewingUpload(false);
      setUploadReviewError("");
    } catch (error) {
      setSubmissionActionNotice({
        title: "Unable to open uploaded file",
        fileName: submissionSummary.fileName,
        message:
          error instanceof Error
            ? error.message
            : "Unable to open the uploaded file preview.",
      });
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

  const handleOpenErrors = async (
    submissionSummary: InstructorGradeSubmissionSummary,
  ) => {
    setSubmissionActionNotice(null);
    try {
      const submission = await loadSubmissionDetails(submissionSummary.id);
      setErrorPreviewSubmission(submission);
    } catch (error) {
      setSubmissionActionNotice({
        title: "Unable to load submission errors",
        fileName: submissionSummary.fileName,
        message:
          error instanceof Error
            ? error.message
            : "Unable to load submission errors.",
      });
    }
  };

  const handleToggleDeleteMode = () => {
    setIsDeleteMode((previousValue) => !previousValue);
    setSelectedSubmissionIds([]);
  };

  const handleToggleSubmissionSelection = (submissionId: string) => {
    setSelectedSubmissionIds((previousIds) =>
      previousIds.includes(submissionId)
        ? previousIds.filter((id) => id !== submissionId)
        : [...previousIds, submissionId],
    );
  };

  const handleDeleteSelectedSubmissions = async () => {
    if (
      isParsing ||
      !currentUser?.branch ||
      selectedSubmissionIds.length === 0
    ) {
      return;
    }

    try {
      setIsParsing(true);
      setMessage("Deleting selected grade submission request(s)...");
      await deleteInstructorGradeSubmissions({
        branch: currentUser.branch,
        submissionIds: selectedSubmissionIds,
      });
      setSelectedSubmissionIds([]);
      setIsDeleteMode(false);
      setSubmissionReloadVersion((previousVersion) => previousVersion + 1);
      setMessage("Selected grade submission request(s) deleted.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Unable to delete the selected submissions. ${error.message}`
          : "Unable to delete the selected submissions.",
      );
    } finally {
      setIsParsing(false);
    }
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
              <li>
                <span>Choose a subject and download its template. Each section has its own worksheet.</span>
                <span className="instructor-template-subject-label" id="instructor-template-subject-label">Subject</span>
                <details
                  ref={templateDropdownRef}
                  className="instructor-template-subject-dropdown"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.currentTarget.open = false;
                      event.currentTarget.querySelector("summary")?.focus();
                    }
                  }}
                >
                  <summary
                    className="instructor-template-subject-select"
                    aria-labelledby="instructor-template-subject-label instructor-template-subject-value"
                    aria-disabled={isLoading || isDownloadingTemplate || templateSubjects.length === 0}
                    onClick={(event) => {
                      if (isLoading || isDownloadingTemplate || templateSubjects.length === 0) event.preventDefault();
                    }}
                  >
                    <span id="instructor-template-subject-value">{templateSubject ? `${templateSubject.name} (${templateSubject.code})` : templateSubjects.length === 0 ? "No assigned subjects" : "Select a subject"}</span>
                  </summary>
                  <div className="instructor-template-subject-options">
                    {templateSubjects.map((subject) => (
                      <button
                        key={subject.id}
                        type="button"
                        title={`${subject.name} (${subject.code})`}
                        aria-pressed={subject.id === templateSubjectId}
                        disabled={isDownloadingTemplate}
                        onClick={() => {
                          setTemplateSubjectId(subject.id);
                          if (templateDropdownRef.current) {
                            templateDropdownRef.current.open = false;
                            templateDropdownRef.current.querySelector("summary")?.focus();
                          }
                        }}
                      >{subject.name} ({subject.code})</button>
                    ))}
                  </div>
                </details>
                <button
                  type="button"
                  className="instructor-guide-download-btn"
                  onClick={() => void handleDownloadTemplate()}
                  disabled={isLoading || isDownloadingTemplate || !instructor || !templateSubject}
                >
                  <FiDownload />{" "}
                  {isDownloadingTemplate ? "Preparing..." : "Download Template"}
                </button>
              </li>
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
                <span>College: numeric percentage grades from 50 to 100. The system converts them to 1.00 - 4.00.</span>
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
          disabled={isParsing}
          onClick={() => {
            setMessage("Choose a grade workbook to review before submitting.");
            uploadInputRef.current?.click();
          }}
        >
          <FiUpload /> {isParsing ? "Processing..." : "Upload Grades"}
        </button>
        <input
          ref={uploadInputRef}
          className="instructor-upload-input"
          type="file"
          accept=".xlsx,.xls"
          disabled={isParsing}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void handleUpload(file);
          }}
        />
      </section>

      {message ? <p className="instructor-message">{message}</p> : null}

      <section className="instructor-section">
        <div className="instructor-section-header">
          <h2>My Grade Submissions</h2>
          <div className="instructor-section-actions">
            {isDeleteMode ? (
              <>
                <button type="button" onClick={handleToggleDeleteMode}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelectedSubmissions}
                  disabled={isParsing || selectedSubmissionIds.length === 0}
                >
                  <FiTrash2 /> Delete Selected
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleToggleDeleteMode}
                disabled={
                  submissionTotalItems === 0 ||
                  isLoadingSubmissionPage ||
                  Boolean(submissionLoadError)
                }
              >
                <FiTrash2 /> Delete
              </button>
            )}
          </div>
        </div>
        <div className="instructor-table-wrap">
          <table className="instructor-table">
            <thead>
              <tr>
                {isDeleteMode ? <th>Select</th> : null}
                <th>Date</th>
                <th>File</th>
                <th>Rows</th>
                <th>Status</th>
                <th className="instructor-table-actions-heading">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingSubmissionPage ? (
                <tr>
                  <td colSpan={isDeleteMode ? 6 : 5}>Loading grade submissions...</td>
                </tr>
              ) : null}
              {!isLoadingSubmissionPage && submissionLoadError ? (
                <tr>
                  <td colSpan={isDeleteMode ? 6 : 5}>
                    Unable to load grade submissions. {submissionLoadError}
                    <button
                      type="button"
                      onClick={() => setSubmissionReloadVersion((version) => version + 1)}
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ) : null}
              {!isLoadingSubmissionPage && !submissionLoadError
                ? submissionPageRows.map((submission) => (
                  <tr key={submission.id}>
                    {isDeleteMode ? (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedSubmissionIds.includes(submission.id)}
                          onChange={() =>
                            handleToggleSubmissionSelection(submission.id)
                          }
                          aria-label={`Select ${submission.fileName}`}
                        />
                      </td>
                    ) : null}
                    <td>{new Date(submission.submittedAt).toLocaleString()}</td>
                    <td>{submission.fileName}</td>
                    <td>{submission.rowCount}</td>
                    <td>{submission.status}</td>
                    <td className="instructor-table-actions-cell">
                      <div className="instructor-table-actions">
                        <button
                          type="button"
                          onClick={() => void handleOpenFilePreview(submission)}
                          disabled={Boolean(loadingSubmissionDetailId)}
                        >
                          <FiDownload />{" "}
                          {loadingSubmissionDetailId === submission.id
                            ? "Loading..."
                            : "File"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleOpenErrors(submission)}
                          disabled={Boolean(loadingSubmissionDetailId)}
                        >
                          <FiAlertTriangle />{" "}
                          {loadingSubmissionDetailId === submission.id
                            ? "Loading..."
                            : "Errors"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
                : null}
              {!isLoadingSubmissionPage &&
              !submissionLoadError &&
              submissionPageRows.length === 0 ? (
                <tr>
                  <td colSpan={isDeleteMode ? 6 : 5}>No grade submissions yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={submissionPage}
          pageSize={INSTRUCTOR_SUBMISSIONS_PAGE_SIZE}
          totalItems={submissionTotalItems}
          onPageChange={(page) => {
            setSelectedSubmissionIds([]);
            setSubmissionPage(page);
          }}
          disabled={isLoadingSubmissionPage || isParsing}
          label="Instructor grade submission pages"
        />
      </section>

      {filePreview ? (
        <div
          className="instructor-file-modal-overlay"
          role="presentation"
          onClick={handleCloseFilePreview}
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
                <span>{isReviewingUpload ? "Review before submitting" : "Uploaded file preview"}</span>
                <h2 id="instructor-file-modal-title">
                  {filePreview.submission.fileName}
                </h2>
                <p>
                  {filePreviewNotice
                    ? filePreviewNotice
                    : <>
                      {filePreview.rows.filter((row) => row.status === "Correct").length.toLocaleString()}{" "}
                      correct row(s),{" "}
                      {filePreview.rows.filter((row) => row.status === "Error").length.toLocaleString()}{" "}
                      row(s) with errors.
                    </>}
                  {!filePreviewNotice && isReviewingUpload && filePreview.rows.length > 0 &&
                    filePreview.rows.some((row) => row.status === "Error")
                    ? " Rows with errors will be saved as Error and need correction before approval."
                    : ""}
                </p>
              </div>
              <div className="instructor-file-modal-actions">
                {isReviewingUpload ? (
                  <>
                    <button
                      type="button"
                      className="instructor-review-cancel"
                      disabled={isParsing}
                      onClick={handleCloseFilePreview}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="instructor-review-submit"
                      disabled={isParsing || filePreview.rows.length === 0}
                      onClick={() => void handleConfirmUpload()}
                    >
                      {isParsing
                        ? "Saving..."
                        : filePreview.rows.some((row) => row.status === "Error")
                          ? "Confirm submission"
                          : "Submit for approval"}
                    </button>
                  </>
                ) : !filePreviewNotice ? (
                  <button
                    type="button"
                    onClick={() => handleDownloadOriginal(filePreview.submission)}
                  >
                    <FiDownload /> Download
                  </button>
                ) : null}
                <button
                  type="button"
                  className="instructor-file-modal-close"
                  aria-label={isReviewingUpload ? "Cancel grade review" : "Close file preview"}
                  disabled={isParsing}
                  onClick={handleCloseFilePreview}
                >
                  <FiX />
                </button>
              </div>
            </div>

            {isReviewingUpload && uploadReviewError ? (
              <p className="instructor-review-error" role="alert">
                {uploadReviewError}
              </p>
            ) : null}

            {!filePreviewNotice ? (
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
                        <td colSpan={15}>
                          No grade rows were found in this file. Choose a workbook with grade rows before submitting.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}
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
                  {(errorPreviewSubmission.errorRows ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={15}>
                        {errorPreviewSubmission.errors.length > 0 ? (
                          <ul className="instructor-error-problems">
                            {errorPreviewSubmission.errors.map((error) => (
                              <li key={error}>{error}</li>
                            ))}
                          </ul>
                        ) : (
                          "No row errors are recorded for this submission."
                        )}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {submissionActionNotice ? (
        <div
          className="instructor-error-modal-overlay"
          role="presentation"
          onClick={() => setSubmissionActionNotice(null)}
        >
          <section
            className="instructor-error-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructor-submission-action-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="instructor-error-modal-header">
              <div>
                <span>{submissionActionNotice.fileName}</span>
                <h2 id="instructor-submission-action-title">
                  {submissionActionNotice.title}
                </h2>
                <p role="status">{submissionActionNotice.message}</p>
              </div>
              <button
                type="button"
                className="instructor-error-modal-close"
                aria-label="Close submission message"
                onClick={() => setSubmissionActionNotice(null)}
              >
                <FiX />
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
