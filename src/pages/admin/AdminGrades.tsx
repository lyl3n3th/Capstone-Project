import { useState, useRef } from "react";
import { PiMicrosoftExcelLogo } from "react-icons/pi";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import { FiAlertCircle, FiDownload, FiUpload, FiEye } from "react-icons/fi";
import { MdOutlineFileUpload } from "react-icons/md";
import * as XLSX from "xlsx";
import AdminSidebar from "../../components/admin/AdminSidebar";
import { ToastContainer } from "../../components/common/Toast";
import "../../styles/admin/admin-grades.css";

interface GradesProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface UploadHistoryItem {
  fileName: string;
  dateUpload: string;
  records: number;
  errors: number;
  status: "Completed" | "Pending" | "Failed";
  fileData?: PreviewGradeRow[]; // Store the actual file data
}

interface PreviewGradeRow {
  studentId: string;
  fullName: string;
  subjectCode: string;
  subjectTitle: string;
  grade: string;
  unit: string;
  gradingPeriod: string;
  programType: "SHS" | "College";
  status: "Valid" | "Error";
  errorReason: string;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const UPLOAD_HISTORY_STORAGE_KEY = "aics-upload-history";

const DEFAULT_UPLOAD_HISTORY: UploadHistoryItem[] = [
  {
    fileName: "ICTBDA_1st_quarter_grades",
    dateUpload: "January 29, 2026, 2:30 PM",
    records: 35,
    errors: 1,
    status: "Completed",
  },
  {
    fileName: "ICTBDA_1st_quarter_grades",
    dateUpload: "January 28, 2026, 10:00 AM",
    records: 32,
    errors: 2,
    status: "Completed",
  },
  {
    fileName: "ICTBDA_1st_quarter_grades",
    dateUpload: "January 27, 2026, 10:00 AM",
    records: 43,
    errors: 0,
    status: "Completed",
  },
  {
    fileName: "ICTBDA_1st_quarter_grades",
    dateUpload: "January 26, 2026, 10:00 AM",
    records: 23,
    errors: 0,
    status: "Completed",
  },
];

export default function AdminGrades({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: GradesProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("No file chosen");
  const [previewRows, setPreviewRows] = useState<PreviewGradeRow[]>([]);
  const [previewFileName, setPreviewFileName] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isReadyToUpload, setIsReadyToUpload] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] =
    useState<UploadHistoryItem | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyPreviewRows, setHistoryPreviewRows] = useState<
    PreviewGradeRow[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Toast functions
  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const [uploadHistory, setUploadHistory] = useState<UploadHistoryItem[]>(
    () => {
      const savedHistory = localStorage.getItem(UPLOAD_HISTORY_STORAGE_KEY);
      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory);
          if (Array.isArray(parsed)) {
            return parsed as UploadHistoryItem[];
          }
        } catch (error) {
          console.error("Failed to load upload history", error);
        }
      }
      return DEFAULT_UPLOAD_HISTORY;
    },
  );

  // Save upload history to localStorage
  const saveUploadHistory = (history: UploadHistoryItem[]) => {
    localStorage.setItem(UPLOAD_HISTORY_STORAGE_KEY, JSON.stringify(history));
    setUploadHistory(history);
  };

  const sortedUploadHistory = [...uploadHistory].sort((left, right) => {
    const leftValue = left.fileName.toLowerCase();
    const rightValue = right.fileName.toLowerCase();

    if (leftValue < rightValue) return sortDirection === "asc" ? -1 : 1;
    if (leftValue > rightValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const toggleFileNameSort = () => {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const uploadedRecords = previewRows.filter(
    (row) => row.status === "Valid",
  ).length;
  const errorRecords = previewRows.filter(
    (row) => row.status === "Error",
  ).length;

  const normalizeHeader = (header: string) =>
    header
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const findHeaderKey = (keys: string[], candidates: string[]) => {
    const normalizedCandidates = candidates.map((candidate) =>
      normalizeHeader(candidate),
    );
    return keys.find((key) =>
      normalizedCandidates.includes(normalizeHeader(key)),
    );
  };

  const parsePreviewRowsFromFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return [] as PreviewGradeRow[];
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      worksheet,
      { defval: "" },
    );

    if (rawRows.length === 0) {
      return [] as PreviewGradeRow[];
    }

    const keys = Object.keys(rawRows[0]);
    const studentIdKey = findHeaderKey(keys, [
      "STUDENT_ID",
      "STUDENT ID",
      "ID",
    ]);
    const fullNameKey = findHeaderKey(keys, ["FULL_NAME", "FULL NAME", "NAME"]);
    const subjectCodeKey = findHeaderKey(keys, [
      "SUBJECT_CODE",
      "SUBJECT CODE",
      "CODE",
    ]);
    const subjectTitleKey = findHeaderKey(keys, [
      "SUBJECT_TITLE",
      "SUBJECT TITLE",
      "TITLE",
      "SUBJECT",
    ]);
    const gradeKey = findHeaderKey(keys, ["GRADE"]);
    const unitKey = findHeaderKey(keys, ["UNIT", "UNITS"]);
    const gradingPeriodKey = findHeaderKey(keys, [
      "GRADING_PERIOD",
      "PERIOD",
      "QUARTER",
      "SEMESTER",
    ]);
    const programTypeKey = findHeaderKey(keys, [
      "PROGRAM_TYPE",
      "PROGRAM",
      "TYPE",
    ]);

    const rows: PreviewGradeRow[] = rawRows.map((row) => {
      const studentId = String(
        studentIdKey ? (row[studentIdKey] ?? "") : "",
      ).trim();
      const fullName = String(
        fullNameKey ? (row[fullNameKey] ?? "") : "",
      ).trim();
      const subjectCode = String(
        subjectCodeKey ? (row[subjectCodeKey] ?? "") : "",
      ).trim();
      const subjectTitle = String(
        subjectTitleKey ? (row[subjectTitleKey] ?? "") : "",
      ).trim();
      const grade = String(gradeKey ? (row[gradeKey] ?? "") : "").trim();
      const unit = String(unitKey ? (row[unitKey] ?? "") : "").trim();
      const gradingPeriod = String(
        gradingPeriodKey ? (row[gradingPeriodKey] ?? "") : "",
      ).trim();
      const programType = String(
        programTypeKey ? (row[programTypeKey] ?? "") : "",
      ).trim();

      const gradeNumber = Number(grade);
      const isGradeValid =
        grade !== "" &&
        Number.isFinite(gradeNumber) &&
        gradeNumber >= 0 &&
        gradeNumber <= 100;
      const reasons: string[] = [];

      if (!studentId) reasons.push("Missing Student ID");
      if (!fullName) reasons.push("Missing Full Name");
      if (!subjectCode) reasons.push("Missing Subject Code");
      if (!subjectTitle) reasons.push("Missing Subject Title");
      if (!grade) reasons.push("Missing Grade");
      else if (!isGradeValid) reasons.push("Invalid Grade (must be 0-100)");
      if (!unit) reasons.push("Missing Unit");
      if (!gradingPeriod) reasons.push("Missing Grading Period");
      if (!programType) reasons.push("Missing Program Type (SHS/College)");
      else if (
        programType.toUpperCase() !== "SHS" &&
        programType.toUpperCase() !== "COLLEGE"
      ) {
        reasons.push("Program Type must be SHS or College");
      }

      const isValid = reasons.length === 0;

      return {
        studentId,
        fullName,
        subjectCode,
        subjectTitle,
        grade,
        unit,
        gradingPeriod,
        programType: programType.toUpperCase() as "SHS" | "College",
        status: isValid ? "Valid" : "Error",
        errorReason: isValid ? "" : reasons.join(", "),
      };
    });

    return rows;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setSelectedFile(file || null);
    setSelectedFileName(file ? file.name : "No file chosen");
    setIsReadyToUpload(false);

    if (!file) {
      setPreviewRows([]);
      setPreviewFileName("");
      setIsPreviewModalOpen(false);
      return;
    }

    const normalizedName = file.name.replace(/\.[^/.]+$/, "");
    setPreviewFileName(normalizedName);

    try {
      const parsedRows = await parsePreviewRowsFromFile(file);
      setPreviewRows(parsedRows);
      setIsPreviewModalOpen(true);
      addToast(
        `File "${file.name}" loaded successfully. Please review the data.`,
        "info",
      );
    } catch (error) {
      console.error("Failed to parse selected Excel file", error);
      setPreviewRows([]);
      setIsPreviewModalOpen(false);
      addToast(
        "Unable to read this Excel file. Please check the format and try again.",
        "error",
      );
    }
  };

  const handleDownloadTemplate = (templateType: "College" | "SHS") => {
    const headers = [
      "STUDENT_ID",
      "FULL_NAME",
      "SUBJECT_CODE",
      "SUBJECT_TITLE",
      "GRADE",
      "UNITS",
      "GRADING_PERIOD",
      "PROGRAM_TYPE",
    ];

    const sampleData =
      templateType === "SHS"
        ? [
            [
              "20220001",
              "Maria Santos",
              "MATH111",
              "General Mathematics",
              "85",
              "3",
              "1st Quarter",
              "SHS",
            ],
          ]
        : [
            [
              "20220002",
              "Juan Dela Cruz",
              "PROG101",
              "Programming 1",
              "78",
              "3",
              "1st Semester",
              "College",
            ],
          ];

    const wsData = [headers, ...sampleData];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grades Template");

    ws["!cols"] = [
      { wch: 15 },
      { wch: 25 },
      { wch: 15 },
      { wch: 35 },
      { wch: 10 },
      { wch: 8 },
      { wch: 15 },
      { wch: 12 },
    ];

    XLSX.writeFile(wb, `${templateType.toLowerCase()}_grades_template.xlsx`);
    addToast(`${templateType} template downloaded successfully!`, "success");
  };

  const handleUploadGrades = () => {
    if (!selectedFile) {
      addToast("Please choose a grade file first.", "warning");
      return;
    }

    if (!isReadyToUpload) {
      addToast("Please review the file first and click Proceed.", "warning");
      return;
    }

    const uploadedAt = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());

    const normalizedName = selectedFile.name.replace(/\.[^/.]+$/, "");

    const newHistoryItem: UploadHistoryItem = {
      fileName: normalizedName,
      dateUpload: uploadedAt,
      records: uploadedRecords,
      errors: errorRecords,
      status: "Completed",
      fileData: [...previewRows], // Store the actual file data
    };

    const updatedHistory = [newHistoryItem, ...uploadHistory];
    saveUploadHistory(updatedHistory);

    setSelectedFile(null);
    setSelectedFileName("No file chosen");
    setPreviewRows([]);
    setPreviewFileName("");
    setIsReadyToUpload(false);
    setIsPreviewModalOpen(false);

    addToast(
      `Grades uploaded successfully! ${uploadedRecords} records processed, ${errorRecords} errors found.`,
      errorRecords > 0 ? "warning" : "success",
    );
  };

  const handleClearSelectedFile = () => {
    setSelectedFile(null);
    setSelectedFileName("No file chosen");
    setPreviewRows([]);
    setPreviewFileName("");
    setIsPreviewModalOpen(false);
    setIsReadyToUpload(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    addToast("Selected file cleared.", "info");
  };

  const handleProceedFromPreview = () => {
    setIsReadyToUpload(true);
    setIsPreviewModalOpen(false);
    addToast("File reviewed. Ready to upload.", "success");
  };

  const handleViewGrade = (row: PreviewGradeRow) => {
    addToast(
      `Viewing: ${row.fullName} - ${row.subjectCode} (Grade: ${row.grade})`,
      "info",
    );
  };

  const handleViewHistory = (item: UploadHistoryItem) => {
    setSelectedHistoryItem(item);
    if (item.fileData && item.fileData.length > 0) {
      setHistoryPreviewRows(item.fileData);
    } else {
      // If no file data is stored, use empty array
      setHistoryPreviewRows([]);
    }
    setIsHistoryModalOpen(true);
  };

  const closeHistoryModal = () => {
    setIsHistoryModalOpen(false);
    setSelectedHistoryItem(null);
    setHistoryPreviewRows([]);
  };

  const handleSidebarToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  // Calculate history record counts
  const historyValidRecords = historyPreviewRows.filter(
    (row) => row.status === "Valid",
  ).length;
  const historyErrorRecords = historyPreviewRows.filter(
    (row) => row.status === "Error",
  ).length;

  return (
    <div className="dashboard-layout">
      {/* Toast Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* AdminSidebar Component */}
      <AdminSidebar
        isOpen={isSidebarOpen}
        onClose={handleSidebarClose}
        onLogout={onLogout}
        loggedInUsername={loggedInUsername}
        loggedInRole={loggedInRole}
        canAccessBackup={canAccessBackup}
      />

      {/* Mobile menu toggle */}
      <button
        className="menu-toggle"
        onClick={handleSidebarToggle}
        aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
      >
        {isSidebarOpen ? "✕" : "☰"}
      </button>

      {/* Main content */}
      <main className="grades-content">
        <header className="page-header">
          <h1>Grades Management</h1>
          <p>
            Upload Excel files with student grades to update student portals
          </p>
        </header>

        <div className="grades-top-grid">
          {/* Upload card */}
          <div className="upload-card">
            <div className="card-title-row">
              <FiUpload className="card-icon upload-icon" />
              <h3>Upload Grade File</h3>
            </div>

            <p className="upload-label">Select Excel file (.xlsx, .xls)</p>

            <div className="file-picker-row">
              <label htmlFor="grade-file" className="choose-file-btn">
                Choose File
              </label>
              <input
                id="grade-file"
                type="file"
                accept=".xlsx,.xls"
                className="hidden-file-input"
                onChange={handleFileChange}
                ref={fileInputRef}
              />
              <span className="selected-file-name">{selectedFileName}</span>
              {selectedFile && (
                <button
                  type="button"
                  className="clear-selected-file-btn"
                  onClick={handleClearSelectedFile}
                  aria-label="Clear selected file"
                  title="Clear selected file"
                >
                  ×
                </button>
              )}
            </div>

            <div className="upload-note">
              <span>
                Note: Uploaded grades will be immediately visible to students in
                their portal.
              </span>
            </div>
            <div className="upload-note warning">
              <FiAlertCircle className="note-icon warning" />
              <span>Please review the preview before confirming.</span>
            </div>

            <div className="upload-actions">
              <button
                className="upload-btn"
                onClick={handleUploadGrades}
                disabled={!selectedFile || !isReadyToUpload}
              >
                <MdOutlineFileUpload /> Upload Grades
              </button>
            </div>
          </div>

          {/* Template card */}
          <div className="template-card">
            <div className="card-title-row">
              <PiMicrosoftExcelLogo className="card-icon excel-icon" />
              <h3>Excel Template</h3>
            </div>

            <p className="template-description">
              Download the Excel template with the correct format for uploading
              grades. The template includes:
            </p>

            <ul className="template-list">
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                Pre-formatted columns for all required fields
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                Sample data to guide your entries
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                Data validation for grade formats
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                SHS uses quarterly grading (1st-4th Quarter)
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                College uses semester grading (Prelim, Midterm, Prefinal, Final)
              </li>
            </ul>

            <div className="template-actions">
              <button
                className="template-btn college"
                onClick={() => handleDownloadTemplate("College")}
              >
                <FiDownload /> College Template
              </button>
              <button
                className="template-btn shs"
                onClick={() => handleDownloadTemplate("SHS")}
              >
                <FiDownload /> SHS Template
              </button>
            </div>
          </div>
        </div>

        {/* Preview Modal */}
        {isPreviewModalOpen && selectedFile && (
          <div className="preview-modal-overlay">
            <div className="preview-modal">
              <div className="preview-modal-header">
                <h2>Review Grades File</h2>
                <button
                  type="button"
                  className="preview-modal-close"
                  onClick={handleClearSelectedFile}
                  aria-label="Close review"
                >
                  ×
                </button>
              </div>

              <div className="preview-card">
                <div className="preview-header">
                  <div>
                    <h3>
                      {previewFileName ||
                        selectedFileName.replace(/\.[^/.]+$/, "")}
                    </h3>
                    <p>Review the grades before uploading to student portals</p>
                  </div>
                </div>

                <div className="preview-summary">
                  <div className="summary-item success">
                    <span className="summary-icon">✔</span>
                    <div>
                      <strong>Valid Records</strong>
                      <p>{uploadedRecords}</p>
                    </div>
                  </div>

                  <div className="summary-item error">
                    <span className="summary-icon">!</span>
                    <div>
                      <strong>Errors</strong>
                      <p>{errorRecords}</p>
                    </div>
                  </div>
                </div>

                <div className="table-container">
                  <table className="grades-table">
                    <thead>
                      <tr>
                        <th>STUDENT_ID</th>
                        <th>FULL NAME</th>
                        <th>SUBJECT CODE</th>
                        <th>SUBJECT TITLE</th>
                        <th>GRADE</th>
                        <th>UNIT</th>
                        <th>GRADING PERIOD</th>
                        <th>PROGRAM</th>
                        <th>STATUS</th>
                        <th>ERROR REASON</th>
                      </tr>
                    </thead>

                    <tbody>
                      {previewRows.length > 0 ? (
                        previewRows.map((row, index) => (
                          <tr key={`${row.studentId}-${index}`}>
                            <td>{row.studentId || "—"}</td>
                            <td>{row.fullName || "—"}</td>
                            <td>{row.subjectCode || "—"}</td>
                            <td>{row.subjectTitle || "—"}</td>
                            <td>{row.grade || "—"}</td>
                            <td>{row.unit || "—"}</td>
                            <td>{row.gradingPeriod || "—"}</td>
                            <td>{row.programType || "—"}</td>
                            <td>
                              <span
                                className={`grade-status-badge ${row.status.toLowerCase()}`}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td>
                              {row.status === "Error" ? row.errorReason : "—"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={10} className="no-results">
                            No preview rows detected from this file.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="preview-modal-actions">
                  <button
                    type="button"
                    className="cancel-preview-btn"
                    onClick={handleClearSelectedFile}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="proceed-preview-btn"
                    onClick={handleProceedFromPreview}
                  >
                    Proceed to Upload
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upload history */}
        <div className="history-card">
          <div className="history-header">
            <h3>Upload History</h3>
          </div>

          <div className="table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className="history-table-sort-btn"
                      onClick={toggleFileNameSort}
                    >
                      File Name {sortDirection === "asc" ? "↑" : "↓"}
                    </button>
                  </th>
                  <th>Date Upload</th>
                  <th>Records</th>
                  <th>Errors</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedUploadHistory.map((item, index) => (
                  <tr key={index}>
                    <td>{item.fileName}</td>
                    <td>{item.dateUpload}</td>
                    <td>{item.records}</td>
                    <td
                      className={item.errors > 0 ? "error-count" : "ok-count"}
                    >
                      {item.errors}
                    </td>
                    <td>
                      <span
                        className={`upload-status-badge ${item.status.toLowerCase()}`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
