import { useEffect, useState, useRef } from "react";
import { PiMicrosoftExcelLogo } from "react-icons/pi";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import {
  FiAlertCircle,
  FiChevronLeft,
  FiChevronRight,
  FiCheck,
  FiDownload,
  FiMenu,
  FiTrash2,
  FiUpload,
  FiX,
} from "react-icons/fi";
import { MdOutlineFileUpload } from "react-icons/md";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as XLSX from "xlsx";
import AdminSidebar from "../../components/admin/AdminSidebar";
import { ToastContainer } from "../../components/common/Toast";
import {
  getCurrentBranch,
  getStudentsForBranch,
  readBranchScopedData,
  type StudentPortalSubject,
} from "../../services/adminStorage";
import {
  applyStudentGradeUploadOperationsForBranch,
  fetchAndCacheStudentGradeRecordsForBranch,
  findApprovedStudentGradeConflict,
  getApprovedStudentGradeConflictMessage,
  readStudentGradeRecordsForBranch,
  validateAndNormalizeUploadedGradeRow,
  type StoredStudentGradeRecord,
  type StudentGradeEvaluation,
  type StudentGradeProgramType,
  type StudentGradeRecordIdentity,
  type StudentGradeUploadOperation,
} from "../../services/studentGrades";
import {
  resolveStudentPortalContext,
  type ResolvedStudentPortalContext,
} from "../../services/studentPortalResolver";
import {
  getInstructorGradeSubmissions,
  fetchAndCacheInstructorGradeSubmissions,
  getInstructorGradeChangeRequests,
  fetchAndCacheInstructorGradeChangeRequests,
  writeInstructorGradeChangeRequests,
  writeInstructorGradeSubmissions,
  type InstructorGradeChangeRequest,
  type InstructorGradeSubmission,
} from "../../services/instructorPortal";
import "../../styles/admin/admin-grades.css";

interface GradesProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface UploadHistoryItem {
  id?: string;
  fileName: string;
  dateUpload: string;
  uploadedAt?: string;
  records: number;
  errors: number;
  status: "Completed" | "Pending" | "Failed" | "Error";
  redoneAt?: string;
  fileData?: PreviewGradeRow[]; // Store the actual file data
}

interface PreviewGradeRow {
  sheetName: string;
  studentId: string;
  fullName: string;
  subjectCode: string;
  subjectTitle: string;
  grade: string;
  unit: string;
  academicYear: string;
  semester: string;
  gradingPeriod: string;
  programType: StudentGradeProgramType | "";
  evaluation: StudentGradeEvaluation | "Clear" | "Invalid";
  action: "Upload" | "Clear";
  status: "Valid" | "Error";
  errorReason: string;
  normalizedRecord?: StoredStudentGradeRecord;
  clearRecordIdentity?: StudentGradeRecordIdentity;
}

type InstructorGradeApprovalItem =
  | {
      kind: "upload";
      requestType: "Grades Upload";
      id: string;
      fileName: string;
      instructorName: string;
      employeeId: string;
      submittedAt: string;
      status: InstructorGradeSubmission["status"];
      rowCount: number;
      submission: InstructorGradeSubmission;
    }
  | {
      kind: "change";
      requestType: "Grade Change";
      id: string;
      fileName: string;
      instructorName: string;
      employeeId: string;
      submittedAt: string;
      status: InstructorGradeChangeRequest["status"];
      rowCount: number;
      request: InstructorGradeChangeRequest;
    };

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

interface TemplateClassSection {
  id: string;
  code: string;
  program: string;
  yearLevel: string;
  semester?: string;
  strand?: string;
  enrolleeIds?: string[];
}

interface TemplateSubjectAssignment {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  units?: number;
  instructorName?: string;
  sectionId: string;
  sectionCode: string;
  academicYear: string;
  semester: string;
}

interface TemplateSubjectCatalogItem {
  id: string;
  code: string;
  name: string;
  units?: number;
  program?: string;
  yearLevel?: string;
  semester?: string;
}

interface GeneratedTemplateSheet {
  academicYear: string;
  descriptor: string;
  rows: string[][];
  sectionCode: string;
  semester: string;
  sheetName: string;
  yearLevel: string;
}

interface TemplateStudentRowSeed {
  id: string;
  name: string;
  strandOrCourse?: string;
  assignments?: TemplateSubjectAssignment[];
}

interface TemplateResolvedStudentContext {
  id: string;
  name: string;
  strandOrCourse?: string;
  portalContext: ResolvedStudentPortalContext;
}

type WorksheetRow = Array<string | number | boolean | null | undefined>;
type CollegeTemplateSemester = "1st Semester" | "2nd Semester";
type ShsTemplateQuarter =
  | "1st Quarter"
  | "2nd Quarter"
  | "3rd Quarter"
  | "4th Quarter";
type TemplateDownloadChoice = CollegeTemplateSemester | ShsTemplateQuarter;

const UPLOAD_HISTORY_STORAGE_KEY = "aics-upload-history";
const TEMPLATE_DOWNLOADS: Record<
  StudentGradeProgramType,
  { href: string; fileName: string }
> = {
  SHS: {
    href: `${import.meta.env.BASE_URL}templates/shs_grades_template.xlsx`,
    fileName: "shs_grades_template.xlsx",
  },
  College: {
    href: `${import.meta.env.BASE_URL}templates/college_grades_template.xlsx`,
    fileName: "college_grades_template.xlsx",
  },
};
const TEMPLATE_FIRST_DATA_ROW_INDEX = 6;
const TEMPLATE_DATA_CAPACITY = 19;
const TEMPLATE_FILE_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_PAGE_SIZE = 12;
const UPLOAD_HISTORY_PAGE_SIZE = 6;
const XML_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XML_REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XML_PACKAGE_REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_EXT_PROPS_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";
const XML_VT_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes";
const XML_NAMESPACE_NS = "http://www.w3.org/XML/1998/namespace";
const WORKSHEET_RELATIONSHIP_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const WORKSHEET_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const TEMPLATE_DATA_COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
const ERROR_EXPORT_HEADERS = [
  "STUDENT ID",
  "FULL NAME",
  "SUBJECT CODE",
  "SUBJECT TITLE",
  "GRADE",
  "UNIT",
  "ACADEMIC YEAR",
  "SEMESTER",
  "GRADING PERIOD",
  "PROGRAM TYPE",
  "ACTION",
  "ERROR REASON",
];
const ERROR_EXPORT_COLUMN_WIDTHS = [
  18, 28, 16, 32, 12, 10, 18, 16, 18, 14, 12, 42,
];
const ERROR_HIGHLIGHT_FILL_RGB = "FFFFF2CC";
const COLLEGE_TEMPLATE_SEMESTERS: CollegeTemplateSemester[] = [
  "1st Semester",
  "2nd Semester",
];
const COLLEGE_TEMPLATE_YEAR_LEVELS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
] as const;
const SHS_TEMPLATE_YEAR_LEVELS = ["Grade 11", "Grade 12"] as const;
const SHS_TEMPLATE_QUARTERS: ShsTemplateQuarter[] = [
  "1st Quarter",
  "2nd Quarter",
  "3rd Quarter",
  "4th Quarter",
];

const DEFAULT_UPLOAD_HISTORY: UploadHistoryItem[] = [
  {
    fileName: "ICTBDA_1st_quarter_grades",
    dateUpload: "January 29, 2026, 2:30 PM",
    records: 35,
    errors: 1,
    status: "Error",
  },
  {
    fileName: "ICTBDA_1st_quarter_grades",
    dateUpload: "January 28, 2026, 10:00 AM",
    records: 32,
    errors: 2,
    status: "Error",
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

const formatHistoryTimestamp = (value: Date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);

const parseHistoryTimestamp = (value?: string) => {
  const normalizedValue = value?.trim().replace(/\s+at\s+/i, " ");
  const timestamp = Date.parse(normalizedValue ?? "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getHistoryTimestampValue = (item: UploadHistoryItem) =>
  parseHistoryTimestamp(item.uploadedAt) || parseHistoryTimestamp(item.dateUpload);

const getHistoryTimestampIso = (item: UploadHistoryItem) => {
  const timestamp = getHistoryTimestampValue(item);
  return timestamp > 0 ? new Date(timestamp).toISOString() : undefined;
};

const sanitizeHistoryIdPart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildUploadHistoryItemId = (item: UploadHistoryItem, index: number) =>
  item.id?.trim() ||
  [
    sanitizeHistoryIdPart(item.fileName),
    sanitizeHistoryIdPart(item.dateUpload),
    item.records,
    item.errors,
    index,
  ]
    .filter((value) => value !== "")
    .join("__");

const buildGradeIdentityFromStoredRecord = (
  record: Pick<
    StoredStudentGradeRecord,
    | "studentId"
    | "subjectCode"
    | "academicYear"
    | "semester"
    | "gradingPeriod"
    | "programType"
  >,
): StudentGradeRecordIdentity => ({
  studentId: record.studentId,
  subjectCode: record.subjectCode,
  academicYear: record.academicYear,
  semester: record.semester,
  gradingPeriod: record.gradingPeriod,
  programType: record.programType,
});

const buildGradeIdentityKey = (
  record: Pick<
    StudentGradeRecordIdentity,
    | "studentId"
    | "subjectCode"
    | "academicYear"
    | "semester"
    | "gradingPeriod"
    | "programType"
  >,
) =>
  [
    record.studentId.trim().toUpperCase(),
    record.subjectCode.trim().toUpperCase(),
    record.academicYear.trim().toUpperCase(),
    record.semester.trim().toUpperCase(),
    record.gradingPeriod.trim().toUpperCase(),
    record.programType,
  ].join("::");

const normalizeApprovalGradeValue = (value?: string | number | null) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

const getRedoableHistoryRecordCount = (item: UploadHistoryItem) =>
  (item.fileData ?? []).filter((row) => Boolean(row.normalizedRecord)).length;

const getErrorPreviewRows = (rows: PreviewGradeRow[]) =>
  rows.filter((row) => row.status === "Error");

const getDownloadableHistoryErrorCount = (item: UploadHistoryItem) =>
  getErrorPreviewRows(item.fileData ?? []).length;

const normalizeUploadHistory = (
  history: UploadHistoryItem[],
): UploadHistoryItem[] =>
  history.map((item, index) => {
    const normalizedStatus: UploadHistoryItem["status"] =
      item.status === "Pending" || item.status === "Failed"
        ? item.status
        : item.errors > 0
          ? "Error"
          : "Completed";
    const normalizedItem: UploadHistoryItem = {
      ...item,
      dateUpload: item.dateUpload || item.uploadedAt || "",
      uploadedAt: item.uploadedAt?.trim() || undefined,
      redoneAt: item.redoneAt?.trim() || undefined,
      status: normalizedStatus,
    };

    return {
      ...normalizedItem,
      id: buildUploadHistoryItemId(normalizedItem, index),
      uploadedAt: getHistoryTimestampIso(normalizedItem),
    };
  });

const sortUploadHistoryNewestFirst = (history: UploadHistoryItem[]) =>
  history
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const timestampComparison =
        getHistoryTimestampValue(right.item) - getHistoryTimestampValue(left.item);

      if (timestampComparison !== 0) {
        return timestampComparison;
      }

      return left.index - right.index;
    })
    .map(({ item }) => item);

export default function AdminGrades({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: GradesProps) {
  const currentBranch = getCurrentBranch();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("No file chosen");
  const [previewRows, setPreviewRows] = useState<PreviewGradeRow[]>([]);
  const [previewFileName, setPreviewFileName] = useState("");
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isReadyToUpload, setIsReadyToUpload] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [collegeTemplateSemester, setCollegeTemplateSemester] =
    useState<CollegeTemplateSemester>("1st Semester");
  const [collegeTemplateYearLevel, setCollegeTemplateYearLevel] =
    useState<(typeof COLLEGE_TEMPLATE_YEAR_LEVELS)[number]>("1st Year");
  const [shsTemplateQuarter, setShsTemplateQuarter] =
    useState<ShsTemplateQuarter>("1st Quarter");
  const [shsTemplateYearLevel, setShsTemplateYearLevel] =
    useState<(typeof SHS_TEMPLATE_YEAR_LEVELS)[number]>("Grade 11");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [instructorSubmissionVersion, setInstructorSubmissionVersion] =
    useState(0);
  const [viewingInstructorGradeItem, setViewingInstructorGradeItem] =
    useState<InstructorGradeApprovalItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void Promise.all([
      fetchAndCacheInstructorGradeSubmissions(currentBranch),
      fetchAndCacheInstructorGradeChangeRequests(currentBranch),
    ])
      .then(() => {
        setInstructorSubmissionVersion((previousValue) => previousValue + 1);
      })
      .catch((error) => {
        console.warn("Unable to load instructor grade approvals from Supabase.", error);
      });

    void fetchAndCacheStudentGradeRecordsForBranch(currentBranch).catch((error) => {
      console.warn("Unable to load student grades from Supabase.", error);
    });
  }, [currentBranch]);

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
            return sortUploadHistoryNewestFirst(
              normalizeUploadHistory(parsed as UploadHistoryItem[]),
            );
          }
        } catch (error) {
          console.error("Failed to load upload history", error);
        }
      }
      return sortUploadHistoryNewestFirst(
        normalizeUploadHistory(DEFAULT_UPLOAD_HISTORY),
      );
    },
  );

  // Save upload history to localStorage
  const saveUploadHistory = (history: UploadHistoryItem[]) => {
    const normalizedHistory = sortUploadHistoryNewestFirst(
      normalizeUploadHistory(history),
    );
    localStorage.setItem(
      UPLOAD_HISTORY_STORAGE_KEY,
      JSON.stringify(normalizedHistory),
    );
    setUploadHistory(normalizedHistory);
    setSelectedHistoryIds((previousIds) => {
      const availableIds = new Set(
        normalizedHistory.map((item) => item.id).filter(Boolean),
      );
      return previousIds.filter((id) => availableIds.has(id));
    });
  };

  const sortedUploadHistory = sortUploadHistoryNewestFirst(uploadHistory);
  void instructorSubmissionVersion;
  const instructorGradeSubmissions = getInstructorGradeSubmissions(currentBranch);
  const instructorGradeChangeRequests =
    getInstructorGradeChangeRequests(currentBranch);
  const instructorGradeApprovalItems: InstructorGradeApprovalItem[] = [
    ...instructorGradeSubmissions.map((submission) => ({
      kind: "upload" as const,
      requestType: "Grades Upload" as const,
      id: submission.id,
      fileName: submission.fileName,
      instructorName: submission.instructorName,
      employeeId: submission.employeeId,
      submittedAt: submission.submittedAt,
      status: submission.status,
      rowCount: submission.records.length,
      submission,
    })),
    ...instructorGradeChangeRequests.map((request) => ({
      kind: "change" as const,
      requestType: "Grade Change" as const,
      id: request.id,
      fileName: request.fileName,
      instructorName: request.instructorName,
      employeeId: request.employeeId,
      submittedAt: request.submittedAt,
      status: request.status,
      rowCount: request.changes.length,
      request,
    })),
  ].sort(
    (left, right) =>
      Date.parse(right.submittedAt) - Date.parse(left.submittedAt),
  );
  const pendingInstructorGradeSubmissions = instructorGradeApprovalItems.filter(
    (item) => item.status === "Pending",
  );
  const approvedInstructorGradeSubmissions = instructorGradeApprovalItems.filter(
    (item) => item.status === "Approved",
  );
  const rejectedInstructorGradeSubmissions = instructorGradeApprovalItems.filter(
    (item) => item.status === "Rejected",
  );

  const uploadedRecords = previewRows.filter(
    (row) => row.status === "Valid" && row.action === "Upload",
  ).length;
  const clearedRecords = previewRows.filter(
    (row) => row.status === "Valid" && row.action === "Clear",
  ).length;
  const previewErrorRows = getErrorPreviewRows(previewRows);
  const errorRecords = previewErrorRows.length;
  const processedRecords = uploadedRecords + clearedRecords;
  const previewPageCount = Math.max(
    1,
    Math.ceil(previewRows.length / PREVIEW_PAGE_SIZE),
  );
  const currentPreviewPage = Math.min(previewPage, previewPageCount);
  const previewPageStartIndex = (currentPreviewPage - 1) * PREVIEW_PAGE_SIZE;
  const previewPageRows = previewRows.slice(
    previewPageStartIndex,
    previewPageStartIndex + PREVIEW_PAGE_SIZE,
  );
  const previewRangeStart =
    previewRows.length === 0 ? 0 : previewPageStartIndex + 1;
  const previewRangeEnd = Math.min(
    previewPageStartIndex + PREVIEW_PAGE_SIZE,
    previewRows.length,
  );
  const historyPageCount = Math.max(
    1,
    Math.ceil(sortedUploadHistory.length / UPLOAD_HISTORY_PAGE_SIZE),
  );
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const historyPageStartIndex =
    (currentHistoryPage - 1) * UPLOAD_HISTORY_PAGE_SIZE;
  const historyPageRows = sortedUploadHistory.slice(
    historyPageStartIndex,
    historyPageStartIndex + UPLOAD_HISTORY_PAGE_SIZE,
  );
  const historyRangeStart =
    sortedUploadHistory.length === 0 ? 0 : historyPageStartIndex + 1;
  const historyRangeEnd = Math.min(
    historyPageStartIndex + UPLOAD_HISTORY_PAGE_SIZE,
    sortedUploadHistory.length,
  );
  const historyPageIds = historyPageRows
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id));
  const selectedHistoryIdSet = new Set(selectedHistoryIds);
  const selectedHistoryCount = selectedHistoryIds.length;
  const areAllHistoryPageRowsSelected =
    historyPageIds.length > 0 &&
    historyPageIds.every((id) => selectedHistoryIdSet.has(id));
  const isSomeHistoryPageRowSelected =
    historyPageIds.some((id) => selectedHistoryIdSet.has(id)) &&
    !areAllHistoryPageRowsSelected;

  const normalizeHeader = (header: string) =>
    header
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const getCellText = (value: unknown) => String(value ?? "").trim();

  const findHeaderKey = (keys: string[], candidates: string[]) => {
    const normalizedCandidates = candidates.map((candidate) =>
      normalizeHeader(candidate),
    );
    return keys.find((key) =>
      normalizedCandidates.includes(normalizeHeader(key)),
    );
  };

  const findHeaderRowIndex = (rows: WorksheetRow[]) =>
    rows.findIndex((row) => {
      const normalizedRow = row.map((cell) => normalizeHeader(getCellText(cell)));
      return (
        normalizedRow.includes("STUDENT_ID") &&
        normalizedRow.includes("FULL_NAME") &&
        normalizedRow.includes("SUBJECT_CODE")
      );
    });

  const getMetadataValue = (
    rows: WorksheetRow[],
    headerRowIndex: number,
    candidates: string[],
  ) => {
    const normalizedCandidates = candidates.map((candidate) =>
      normalizeHeader(candidate),
    );

    for (let rowIndex = 0; rowIndex < headerRowIndex; rowIndex += 1) {
      const row = rows[rowIndex];

      for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
        const normalizedCell = normalizeHeader(getCellText(row[cellIndex]));
        if (normalizedCandidates.includes(normalizedCell)) {
          return getCellText(row[cellIndex + 1]);
        }
      }
    }

    return "";
  };

  const resolveProgramType = (
    value: string,
    fallbackProgramType: StudentGradeProgramType | "",
  ): StudentGradeProgramType | "" => {
    const normalizedValue = value.trim().toUpperCase();

    if (
      normalizedValue === "SHS" ||
      normalizedValue.includes("SENIOR HIGH")
    ) {
      return "SHS";
    }

    if (normalizedValue === "COLLEGE" || normalizedValue.includes("COLLEGE")) {
      return "College";
    }

    return fallbackProgramType;
  };

  const getDefaultAcademicYear = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  };

  const getAcademicYearSortValue = (value: string) => {
    const match = value.trim().match(/^(\d{4})[-/](\d{4})$/);

    if (!match) {
      return Number.NEGATIVE_INFINITY;
    }

    return Number(match[1]) * 10_000 + Number(match[2]);
  };

  const normalizeSemesterLabel = (value?: string) => {
    const normalized = value?.trim().toLowerCase() || "";

    if (!normalized) {
      return "";
    }

    if (normalized.includes("summer")) {
      return "Summer";
    }

    if (
      normalized.includes("2nd") ||
      normalized.includes("second") ||
      normalized === "sem 2" ||
      normalized === "sem2"
    ) {
      return "2nd Semester";
    }

    if (
      normalized.includes("1st") ||
      normalized.includes("first") ||
      normalized === "sem 1" ||
      normalized === "sem1"
    ) {
      return "1st Semester";
    }

    return "";
  };

  const normalizeYearLevelLabel = (value?: string) =>
    value?.trim().toLowerCase() || "";

  const normalizeTemplateSectionCode = (value?: string | null) =>
    value?.trim().toUpperCase() || "";

  const getSelectedTemplateChoice = (
    templateType: StudentGradeProgramType,
  ): TemplateDownloadChoice =>
    templateType === "College" ? collegeTemplateSemester : shsTemplateQuarter;

  const getSelectedTemplateYearLevel = (
    templateType: StudentGradeProgramType,
  ) => (templateType === "College" ? collegeTemplateYearLevel : shsTemplateYearLevel);

  const resolveTemplateSemester = (
    templateType: StudentGradeProgramType,
    templateChoice: TemplateDownloadChoice,
  ): CollegeTemplateSemester =>
    templateType === "College"
      ? (templateChoice as CollegeTemplateSemester)
      : templateChoice === "1st Quarter" || templateChoice === "2nd Quarter"
        ? "1st Semester"
        : "2nd Semester";

  const getTemplateGradingPeriod = (
    templateType: StudentGradeProgramType,
    templateChoice: TemplateDownloadChoice,
  ) => (templateType === "SHS" ? (templateChoice as ShsTemplateQuarter) : "");

  const sanitizeTemplateFileNameSegment = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const buildTemplateDownloadFileName = (
    templateType: StudentGradeProgramType,
    templateChoice: TemplateDownloadChoice,
    yearLevel: string,
  ) => {
    const template = TEMPLATE_DOWNLOADS[templateType];
    const baseFileName = template.fileName.replace(/\.xlsx$/i, "");
    const suffix = [yearLevel, templateChoice]
      .map(sanitizeTemplateFileNameSegment)
      .filter(Boolean)
      .join("_");

    return suffix ? `${baseFileName}_${suffix}.xlsx` : template.fileName;
  };

  const getTemplateSelectionSummary = (
    yearLevel: string,
    templateChoice: TemplateDownloadChoice,
  ) => `${yearLevel} ${templateChoice}`;

  const sortStudentsForTemplate = (
    left: { id: string; name: string },
    right: { id: string; name: string },
  ) =>
    left.name.localeCompare(right.name) || left.id.localeCompare(right.id);

  const sortSectionsForTemplate = (
    left: TemplateClassSection,
    right: TemplateClassSection,
  ) =>
    left.yearLevel.localeCompare(right.yearLevel) ||
    (left.strand || "").localeCompare(right.strand || "") ||
    left.code.localeCompare(right.code);

  const sortAssignmentsForTemplate = (
    left: TemplateSubjectAssignment,
    right: TemplateSubjectAssignment,
  ) =>
    left.subjectCode.localeCompare(right.subjectCode) ||
    left.subjectName.localeCompare(right.subjectName);

  const getUniqueSheetName = (name: string, usedNames: Set<string>) => {
    const sanitizedBase =
      name
        .replace(/[\\/?*:[\]]/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "Section";

    let candidate = sanitizedBase.slice(0, 31);
    let suffixNumber = 2;

    while (usedNames.has(candidate)) {
      const suffix = ` (${suffixNumber})`;
      candidate = `${sanitizedBase.slice(0, 31 - suffix.length)}${suffix}`;
      suffixNumber += 1;
    }

    usedNames.add(candidate);
    return candidate;
  };

  const getLatestAcademicYear = (values: string[]) => {
    const sorted = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
      .sort((left, right) => {
        const rightValue = getAcademicYearSortValue(right);
        const leftValue = getAcademicYearSortValue(left);

        if (rightValue !== leftValue) {
          return rightValue - leftValue;
        }

        return right.localeCompare(left);
      });

    return sorted[0] || getDefaultAcademicYear();
  };

  const getSectionAcademicDescriptor = (
    section: TemplateClassSection,
    sectionStudents: Array<{ strandOrCourse?: string }>,
  ) =>
    section.strand?.trim() ||
    sectionStudents.find((student) => student.strandOrCourse?.trim())
      ?.strandOrCourse?.trim() ||
    "";

  const mapPortalSubjectsToTemplateAssignments = ({
    subjects,
    fallbackSectionCode,
  }: {
    subjects: StudentPortalSubject[];
    fallbackSectionCode: string;
  }): TemplateSubjectAssignment[] =>
    subjects
      .map((subject) => ({
        id: `${subject.id}:${subject.academicYear}:${subject.semester}`,
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.title,
        units: subject.units,
        instructorName: subject.professor === "TBA" ? "" : subject.professor,
        sectionId: "",
        sectionCode: subject.section || fallbackSectionCode,
        academicYear: subject.academicYear,
        semester: subject.semester,
      }))
      .sort(sortAssignmentsForTemplate);

  const getStudentTemplateAssignmentsForSemester = ({
    portalContext,
    fallbackSectionCode,
    targetSemester,
    targetAcademicYear,
  }: {
    portalContext: ResolvedStudentPortalContext;
    fallbackSectionCode: string;
    targetSemester: string;
    targetAcademicYear?: string;
  }) => {
    const semesterMatchedSubjects = portalContext.subjects.filter(
      (subject) => normalizeSemesterLabel(subject.semester) === targetSemester,
    );
    const currentTermMatchedSubjects =
      normalizeSemesterLabel(portalContext.currentTerm.semester) === targetSemester
        ? semesterMatchedSubjects.filter(
            (subject) =>
              !subject.academicYear ||
              subject.academicYear.trim() ===
                portalContext.currentTerm.academicYear.trim(),
          )
        : [];
    const targetAcademicYearMatchedSubjects = targetAcademicYear
      ? semesterMatchedSubjects.filter(
          (subject) =>
            !subject.academicYear ||
            subject.academicYear.trim() === targetAcademicYear.trim(),
        )
      : [];

    return mapPortalSubjectsToTemplateAssignments({
      subjects:
        currentTermMatchedSubjects.length > 0
          ? currentTermMatchedSubjects
          : targetAcademicYearMatchedSubjects.length > 0
            ? targetAcademicYearMatchedSubjects
            : semesterMatchedSubjects,
      fallbackSectionCode,
    });
  };

  const buildSectionTemplateRows = ({
    programType,
    students,
    assignments,
    subjectCatalog,
    defaultGradingPeriod,
  }: {
    programType: StudentGradeProgramType;
    students: TemplateStudentRowSeed[];
    assignments: TemplateSubjectAssignment[];
    subjectCatalog: TemplateSubjectCatalogItem[];
    defaultGradingPeriod?: string;
  }) => {
    if (students.length === 0) {
      return [] as string[][];
    }

    const shsQuarterValue =
      programType === "SHS" ? defaultGradingPeriod?.trim() || "" : "";

    const unitsBySubjectKey = new Map<string, string>();
    const assignmentFallbackByKey = new Map<string, TemplateSubjectAssignment>();

    subjectCatalog.forEach((subject) => {
      const unitsLabel =
        subject.units === undefined || subject.units === null
          ? ""
          : String(subject.units);

      unitsBySubjectKey.set(`id:${subject.id}`, unitsLabel);
      unitsBySubjectKey.set(`code:${subject.code.toUpperCase()}`, unitsLabel);
    });

    const buildAssignmentLookupKeys = (assignment: TemplateSubjectAssignment) => {
      const subjectCode = assignment.subjectCode.toUpperCase();
      const keys = [
        `id:${assignment.subjectId}:${assignment.semester}:${assignment.academicYear}`,
        `code:${subjectCode}:${assignment.semester}:${assignment.academicYear}`,
        `id:${assignment.subjectId}:${assignment.semester}`,
        `code:${subjectCode}:${assignment.semester}`,
        `id:${assignment.subjectId}`,
        `code:${subjectCode}`,
      ];

      return keys.filter((key, index) => keys.indexOf(key) === index);
    };

    assignments.forEach((assignment) => {
      buildAssignmentLookupKeys(assignment).forEach((key) => {
        if (!assignmentFallbackByKey.has(key)) {
          assignmentFallbackByKey.set(key, assignment);
        }
      });
    });

    return students.flatMap((student) => {
      const rowAssignments =
        student.assignments && student.assignments.length > 0
          ? student.assignments
          : assignments;

      if (rowAssignments.length === 0) {
        return [
          [
            student.id,
            student.name,
            "",
            "",
            shsQuarterValue,
            "",
            "",
            "",
            "",
            "",
          ],
        ];
      }

      return rowAssignments.map((assignment) => {
        const fallbackAssignment = buildAssignmentLookupKeys(assignment)
          .map((key) => assignmentFallbackByKey.get(key))
          .find(Boolean);
        const units =
          (assignment.units === undefined || assignment.units === null
            ? ""
            : String(assignment.units)) ||
          unitsBySubjectKey.get(`id:${assignment.subjectId}`) ||
          unitsBySubjectKey.get(`code:${assignment.subjectCode.toUpperCase()}`) ||
          "";
        const instructorName =
          assignment.instructorName || fallbackAssignment?.instructorName || "";

        return programType === "College"
          ? [
              student.id,
              student.name,
              assignment.subjectCode,
              assignment.subjectName,
              units,
              "",
              "",
              instructorName,
              "",
              "",
            ]
          : [
              student.id,
              student.name,
              assignment.subjectCode,
              assignment.subjectName,
              shsQuarterValue,
              "",
              "",
              instructorName,
              "",
              "",
            ];
      });
    });
  };

  const buildFallbackTemplateRows = (
    templateType: StudentGradeProgramType,
    templateChoice: TemplateDownloadChoice,
  ) =>
    templateType === "SHS"
      ? Array.from({ length: TEMPLATE_DATA_CAPACITY }, () => [
          "",
          "",
          "",
          "",
          getTemplateGradingPeriod(templateType, templateChoice),
          "",
          "",
          "",
          "",
          "",
        ])
      : [];

  const buildFallbackTemplateSheet = (
    templateType: StudentGradeProgramType,
    templateChoice: TemplateDownloadChoice,
    yearLevel: string,
  ): GeneratedTemplateSheet => ({
    academicYear: getDefaultAcademicYear(),
    descriptor: "",
    rows: buildFallbackTemplateRows(templateType, templateChoice),
    sectionCode: "",
    semester: resolveTemplateSemester(templateType, templateChoice),
    sheetName: "Grades Template",
    yearLevel,
  });

  const getGeneratedTemplateSheets = (
    templateType: StudentGradeProgramType,
    templateChoice: TemplateDownloadChoice,
    targetYearLevel: string,
  ): GeneratedTemplateSheet[] => {
    const usedSheetNames = new Set<string>();
    const targetSemester = resolveTemplateSemester(templateType, templateChoice);
    const normalizedTargetYearLevel = normalizeYearLevelLabel(targetYearLevel);
    const defaultGradingPeriod = getTemplateGradingPeriod(
      templateType,
      templateChoice,
    );
    const storedSections =
      readBranchScopedData<TemplateClassSection[]>("class-sections", currentBranch) ??
      [];
    const storedAssignments =
      readBranchScopedData<TemplateSubjectAssignment[]>(
        "subject-assignments",
        currentBranch,
      ) ?? [];
    const storedSubjects =
      readBranchScopedData<TemplateSubjectCatalogItem[]>("subjects", currentBranch) ??
      [];
    const storedStudents = getStudentsForBranch(currentBranch).filter(
      (student) => student.status !== "Archived",
    );
    const resolvedStudentContexts = storedStudents.map<TemplateResolvedStudentContext>(
      (student) => ({
        id: student.id,
        name: student.name,
        strandOrCourse: student.strandOrCourse,
        portalContext: resolveStudentPortalContext(student),
      }),
    );
    const eligibleYearLevelStudentContexts = resolvedStudentContexts.filter(
      ({ portalContext }) =>
        portalContext.resolvedStudentRecord.program === templateType &&
        normalizeYearLevelLabel(portalContext.resolvedStudentRecord.yearLevel) ===
          normalizedTargetYearLevel,
    );
    const selectedTermAcademicYear = getLatestAcademicYear([
      ...eligibleYearLevelStudentContexts
        .filter(
          ({ portalContext }) =>
            normalizeSemesterLabel(portalContext.currentTerm.semester) ===
              targetSemester,
        )
        .map(({ portalContext }) => portalContext.currentTerm.academicYear),
      ...storedAssignments
        .filter((assignment) => {
          if (normalizeSemesterLabel(assignment.semester) !== targetSemester) {
            return false;
          }

          return storedSections.some(
            (section) =>
              section.program === templateType &&
              normalizeYearLevelLabel(section.yearLevel) ===
                normalizedTargetYearLevel &&
              (assignment.sectionId === section.id ||
                assignment.sectionCode === section.code),
          );
        })
        .map((assignment) => assignment.academicYear),
    ]);

    return storedSections
      .filter(
        (section) =>
          section.program === templateType &&
          normalizeYearLevelLabel(section.yearLevel) ===
            normalizedTargetYearLevel &&
          Boolean(section.code.trim()),
      )
      .sort(sortSectionsForTemplate)
      .map<GeneratedTemplateSheet | null>((section) => {
        const linkedEnrolleeIds = new Set(
          (section.enrolleeIds ?? [])
            .map((enrolleeId) => enrolleeId.trim())
            .filter(Boolean),
        );
        const isStudentLinkedToSection = (
          studentContext: TemplateResolvedStudentContext,
        ) => {
          const resolvedSectionCode =
            studentContext.portalContext.resolvedStudentRecord.section?.trim() || "";

          return (
            normalizeTemplateSectionCode(resolvedSectionCode) ===
              normalizeTemplateSectionCode(section.code) ||
            linkedEnrolleeIds.has(studentContext.id.trim())
          );
        };
        const sectionStudents = eligibleYearLevelStudentContexts
          .filter(isStudentLinkedToSection)
          .map((studentContext) => {
            const studentAssignments = getStudentTemplateAssignmentsForSemester({
              portalContext: studentContext.portalContext,
              fallbackSectionCode: section.code,
              targetSemester,
              targetAcademicYear: selectedTermAcademicYear,
            });

            return {
              id: studentContext.id,
              name: studentContext.name,
              strandOrCourse: studentContext.strandOrCourse,
              assignments:
                studentAssignments.length > 0 ? studentAssignments : undefined,
            };
          })
          .sort(sortStudentsForTemplate);
        const sectionAssignments = storedAssignments
          .filter(
            (assignment) =>
              (assignment.sectionId === section.id ||
                assignment.sectionCode === section.code) &&
              normalizeSemesterLabel(assignment.semester) === targetSemester &&
              (!selectedTermAcademicYear ||
                !assignment.academicYear ||
                assignment.academicYear.trim() ===
                  selectedTermAcademicYear.trim()),
          )
          .sort(sortAssignmentsForTemplate);
        const irregularAssignmentsByStudent = eligibleYearLevelStudentContexts
          .filter((studentContext) => !isStudentLinkedToSection(studentContext))
          .map((studentContext) => {
            const plannedAssignments = getStudentTemplateAssignmentsForSemester({
              portalContext: studentContext.portalContext,
              fallbackSectionCode: "",
              targetSemester,
              targetAcademicYear: selectedTermAcademicYear,
            }).filter(
              (assignment) =>
                normalizeTemplateSectionCode(assignment.sectionCode) ===
                  normalizeTemplateSectionCode(section.code) &&
                normalizeSemesterLabel(assignment.semester) ===
                  targetSemester,
            );

            const uniqueAssignments = Array.from(
              plannedAssignments.reduce((items, assignment) => {
                const key =
                  assignment.id ||
                  `${assignment.subjectId}:${assignment.sectionCode}:${assignment.academicYear}:${assignment.semester}`;

                if (!items.has(key)) {
                  items.set(key, assignment);
                }

                return items;
              }, new Map<string, TemplateSubjectAssignment>()),
            )
              .map(([, assignment]) => assignment)
              .sort(sortAssignmentsForTemplate);

            return {
              student: studentContext,
              assignments: uniqueAssignments,
            };
          })
          .filter((entry) => entry.assignments.length > 0);
        const hasTargetSectionContext =
          normalizeSemesterLabel(section.semester) === targetSemester ||
          sectionAssignments.length > 0 ||
          sectionStudents.some(
            (student) => (student.assignments?.length ?? 0) > 0,
          ) ||
          irregularAssignmentsByStudent.length > 0;

        if (!hasTargetSectionContext) {
          return null;
        }
        const latestAcademicYear = getLatestAcademicYear([
          ...sectionStudents.flatMap((student) =>
            (student.assignments ?? []).map((assignment) => assignment.academicYear),
          ),
          ...sectionAssignments.map((assignment) => assignment.academicYear),
          ...irregularAssignmentsByStudent.flatMap((entry) =>
            entry.assignments.map((assignment) => assignment.academicYear),
          ),
        ]);
        const currentSectionAssignments = (() => {
          const matchingAssignments = sectionAssignments.filter(
            (assignment) =>
              !assignment.academicYear ||
              assignment.academicYear.trim() === latestAcademicYear,
          );

          return matchingAssignments.length > 0
            ? matchingAssignments
            : sectionAssignments;
        })();
        const regularSectionStudents = sectionStudents
          .map<TemplateStudentRowSeed>((student) => {
            const matchingAssignments =
              student.assignments?.filter(
                (assignment) =>
                  !assignment.academicYear ||
                  assignment.academicYear.trim() === latestAcademicYear,
              ) ?? [];
            const filteredAssignments =
              matchingAssignments.length > 0
                ? matchingAssignments
                : (student.assignments ?? []);

            return {
              id: student.id,
              name: student.name,
              strandOrCourse: student.strandOrCourse,
              assignments:
                filteredAssignments.length > 0 ? filteredAssignments : undefined,
            };
          })
          .sort(sortStudentsForTemplate);
        const irregularSectionStudents = irregularAssignmentsByStudent
          .map<TemplateStudentRowSeed>(({ student, assignments }) => {
            const matchingAssignments = assignments.filter(
              (assignment) =>
                !assignment.academicYear ||
                assignment.academicYear.trim() === latestAcademicYear,
            );

            return {
              id: student.id,
              name: student.name,
              strandOrCourse: student.strandOrCourse,
              assignments:
                matchingAssignments.length > 0
                  ? matchingAssignments
                  : assignments,
            };
          })
          .filter((student) => (student.assignments?.length ?? 0) > 0)
          .sort(sortStudentsForTemplate);
        const templateStudents = [
          ...regularSectionStudents,
          ...irregularSectionStudents,
        ];

        return {
          academicYear: latestAcademicYear,
          descriptor: getSectionAcademicDescriptor(section, templateStudents),
          rows: buildSectionTemplateRows({
            programType: templateType,
            students: templateStudents,
            assignments: currentSectionAssignments,
            subjectCatalog: storedSubjects,
            defaultGradingPeriod,
          }),
          sectionCode: section.code,
          semester: targetSemester,
          sheetName: getUniqueSheetName(section.code, usedSheetNames),
          yearLevel: section.yearLevel,
        };
      })
      .filter(Boolean) as GeneratedTemplateSheet[];
  };

  const getSheetRows = (sheetData: Element) =>
    Array.from(sheetData.childNodes).filter(
      (node): node is Element =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).localName === "row",
    );

  const getRowNumber = (row: Element) => Number(row.getAttribute("r") || "0");

  const clearCellValue = (cell: Element) => {
    cell.removeAttribute("t");

    while (cell.firstChild) {
      cell.removeChild(cell.firstChild);
    }
  };

  const setCellInlineString = (cell: Element, value: string) => {
    clearCellValue(cell);

    if (!value) {
      return;
    }

    const document = cell.ownerDocument;
    const inlineString = document.createElementNS(XML_MAIN_NS, "is");
    const textNode = document.createElementNS(XML_MAIN_NS, "t");

    if (/^\s|\s$|\n/.test(value)) {
      textNode.setAttributeNS(XML_NAMESPACE_NS, "xml:space", "preserve");
    }

    textNode.textContent = value;
    inlineString.appendChild(textNode);
    cell.setAttribute("t", "inlineStr");
    cell.appendChild(inlineString);
  };

  const getCellColumn = (cell: Element, fallbackIndex: number) => {
    const cellReference = cell.getAttribute("r") || "";
    const matchedColumn = cellReference.match(/[A-Z]+/)?.[0];

    if (matchedColumn) {
      return matchedColumn;
    }

    return XLSX.utils.encode_col(fallbackIndex);
  };

  const getRowCellsByColumn = (row: Element) => {
    const cellsByColumn = new Map<string, Element>();

    Array.from(row.childNodes).forEach((node, index) => {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const cell = node as Element;

      if (cell.localName !== "c") {
        return;
      }

      cellsByColumn.set(getCellColumn(cell, index), cell);
    });

    return cellsByColumn;
  };

  const copyReferenceRowStyles = (
    targetRow: Element,
    referenceRow: Element,
    columns: string[],
  ) => {
    const targetCellsByColumn = getRowCellsByColumn(targetRow);
    const referenceCellsByColumn = getRowCellsByColumn(referenceRow);

    columns.forEach((column) => {
      const targetCell = targetCellsByColumn.get(column);
      const referenceCell = referenceCellsByColumn.get(column);
      const referenceStyle = referenceCell?.getAttribute("s");

      if (!targetCell || !referenceStyle) {
        return;
      }

      targetCell.setAttribute("s", referenceStyle);
    });
  };

  const updateRowNumber = (row: Element, rowNumber: number) => {
    row.setAttribute("r", String(rowNumber));

    Array.from(row.childNodes).forEach((node, index) => {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const cell = node as Element;

      if (cell.localName !== "c") {
        return;
      }

      const column = getCellColumn(cell, index);
      cell.setAttribute("r", `${column}${rowNumber}`);
    });
  };

  const getCellByAddress = (sheetData: Element, address: string) => {
    const matchedAddress = address.match(/^([A-Z]+)(\d+)$/);

    if (!matchedAddress) {
      return null;
    }

    const rowNumber = Number(matchedAddress[2]);
    const row = getSheetRows(sheetData).find(
      (rowElement) => getRowNumber(rowElement) === rowNumber,
    );

    if (!row) {
      return null;
    }

    return (
      Array.from(row.childNodes).find(
        (node): node is Element =>
          node.nodeType === Node.ELEMENT_NODE &&
          (node as Element).localName === "c" &&
          (node as Element).getAttribute("r") === address,
      ) ?? null
    );
  };

  const populateStyledTemplateMetadata = ({
    sheetData,
    templateType,
    sheet,
  }: {
    sheetData: Element;
    templateType: StudentGradeProgramType;
    sheet: GeneratedTemplateSheet;
  }) => {
    const metadataEntries =
      templateType === "SHS"
        ? [
            ["I3", "PROGRAM:"],
            ["J3", templateType],
            ["C4", "BRANCH:"],
            ["D4", currentBranch],
            ["E4", "SCHOOL YEAR:"],
            ["F4", sheet.academicYear],
            ["G4", "TRACK:"],
            ["H4", sheet.descriptor],
            ["I4", "SEMESTER:"],
            ["J4", sheet.semester],
          ]
        : [
            ["H3", "PROGRAM:"],
            ["I3", templateType],
            ["J3", ""],
            ["C4", "BRANCH:"],
            ["D4", currentBranch],
            ["E4", "SCHOOL YEAR:"],
            ["F4", sheet.academicYear],
            ["G4", "COURSE:"],
            ["H4", sheet.descriptor],
            ["I4", "SEMESTER:"],
            ["J4", sheet.semester],
          ];

    [
      ...metadataEntries,
      ["C5", "SECTION:"],
      ["D5", sheet.sectionCode],
      ["E5", "YEAR LEVEL:"],
      ["F5", sheet.yearLevel],
    ].forEach(([address, value]) => {
      const cell = getCellByAddress(sheetData, address);

      if (cell) {
        setCellInlineString(cell, value);
      }
    });
  };

  const populateStyledTemplateDataRow = (
    row: Element,
    rowNumber: number,
    rowValues: string[],
  ) => {
    updateRowNumber(row, rowNumber);
    const cellsByColumn = getRowCellsByColumn(row);

    TEMPLATE_DATA_COLUMNS.forEach((column, index) => {
      const cell = cellsByColumn.get(column);

      if (cell) {
        setCellInlineString(cell, rowValues[index] ?? "");
      }
    });

    const trailingCell = cellsByColumn.get("J");
    if (trailingCell) {
      setCellInlineString(trailingCell, "");
    }
  };

  const parseXml = (xmlText: string) =>
    new DOMParser().parseFromString(xmlText, "application/xml");

  const serializeXml = (document: Document) =>
    new XMLSerializer().serializeToString(document);

  const cloneBytes = (value: Uint8Array) => new Uint8Array(value);

  const buildErrorExportFileName = (value: string) => {
    const normalizedBaseName =
      Array.from(value.trim().replace(/\.[^/.]+$/, ""))
        .map((character) =>
          (character.codePointAt(0) ?? 0) < 32 ? "_" : character,
        )
        .join("")
        .replace(/[<>:"/\\|?*]+/g, "_")
        .replace(/\s+/g, "_") || "grade_upload";

    return `${normalizedBaseName}_errors.xlsx`;
  };

  const buildErrorExportRow = (row: PreviewGradeRow) => [
    row.studentId,
    row.fullName,
    row.subjectCode,
    row.subjectTitle,
    row.grade,
    row.unit,
    row.academicYear,
    row.semester,
    row.gradingPeriod,
    row.programType,
    row.action,
    row.errorReason,
  ];

  const ensureErrorHighlightStyle = (stylesXml: string) => {
    const stylesDocument = parseXml(stylesXml);
    const fills = stylesDocument.getElementsByTagNameNS(XML_MAIN_NS, "fills")[0];
    const cellXfs =
      stylesDocument.getElementsByTagNameNS(XML_MAIN_NS, "cellXfs")[0];

    if (!fills || !cellXfs) {
      throw new Error("The error workbook styles could not be prepared.");
    }

    const fillCount = Array.from(fills.childNodes).filter(
      (node) =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).localName === "fill",
    ).length;
    const errorFill = stylesDocument.createElementNS(XML_MAIN_NS, "fill");
    const patternFill = stylesDocument.createElementNS(
      XML_MAIN_NS,
      "patternFill",
    );
    const foregroundColor = stylesDocument.createElementNS(
      XML_MAIN_NS,
      "fgColor",
    );
    const backgroundColor = stylesDocument.createElementNS(
      XML_MAIN_NS,
      "bgColor",
    );

    patternFill.setAttribute("patternType", "solid");
    foregroundColor.setAttribute("rgb", ERROR_HIGHLIGHT_FILL_RGB);
    backgroundColor.setAttribute("indexed", "64");
    patternFill.appendChild(foregroundColor);
    patternFill.appendChild(backgroundColor);
    errorFill.appendChild(patternFill);
    fills.appendChild(errorFill);
    fills.setAttribute("count", String(fillCount + 1));

    const existingXfs = Array.from(cellXfs.childNodes).filter(
      (node) =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).localName === "xf",
    );
    const errorStyleIndex = existingXfs.length;
    const errorXf =
      (existingXfs[0]?.cloneNode(true) as Element | undefined) ??
      stylesDocument.createElementNS(XML_MAIN_NS, "xf");

    errorXf.setAttribute("numFmtId", errorXf.getAttribute("numFmtId") || "0");
    errorXf.setAttribute("fontId", errorXf.getAttribute("fontId") || "0");
    errorXf.setAttribute("fillId", String(fillCount));
    errorXf.setAttribute("borderId", errorXf.getAttribute("borderId") || "0");
    errorXf.setAttribute("xfId", errorXf.getAttribute("xfId") || "0");
    errorXf.setAttribute("applyFill", "1");
    cellXfs.appendChild(errorXf);
    cellXfs.setAttribute("count", String(errorStyleIndex + 1));

    return {
      styleIndex: errorStyleIndex,
      xml: serializeXml(stylesDocument),
    };
  };

  const buildStyledErrorWorksheetXml = ({
    worksheetXml,
    styleIndex,
  }: {
    worksheetXml: string;
    styleIndex: number;
  }) => {
    const worksheetDocument = parseXml(worksheetXml);
    const sheetData =
      worksheetDocument.getElementsByTagNameNS(XML_MAIN_NS, "sheetData")[0];

    if (!sheetData) {
      return worksheetXml;
    }

    getSheetRows(sheetData).forEach((row) => {
      if (getRowNumber(row) <= 1) {
        return;
      }

      row.setAttribute("s", String(styleIndex));
      row.setAttribute("customFormat", "1");

      Array.from(row.childNodes).forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }

        const cell = node as Element;

        if (cell.localName !== "c") {
          return;
        }

        cell.setAttribute("s", String(styleIndex));
      });
    });

    return serializeXml(worksheetDocument);
  };

  const buildHighlightedErrorWorkbook = (rows: PreviewGradeRow[]) => {
    const errorRows = getErrorPreviewRows(rows);

    if (errorRows.length === 0) {
      return null;
    }

    const workbook = XLSX.utils.book_new();
    const errorRowsBySheet = errorRows.reduce((groups, row) => {
      const sheetName = row.sheetName.trim() || "Errors";
      const existingRows = groups.get(sheetName);

      if (existingRows) {
        existingRows.push(row);
      } else {
        groups.set(sheetName, [row]);
      }

      return groups;
    }, new Map<string, PreviewGradeRow[]>());
    const usedSheetNames = new Set<string>();

    errorRowsBySheet.forEach((sheetRows, sheetName) => {
      const worksheet = XLSX.utils.aoa_to_sheet([
        ERROR_EXPORT_HEADERS,
        ...sheetRows.map(buildErrorExportRow),
      ]);

      worksheet["!cols"] = ERROR_EXPORT_COLUMN_WIDTHS.map((width) => ({
        wch: width,
      }));

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        getUniqueSheetName(sheetName, usedSheetNames),
      );
    });

    const workbookBytes = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    }) as ArrayBuffer;
    const archiveEntries = unzipSync(new Uint8Array(workbookBytes)) as Record<
      string,
      Uint8Array
    >;
    const workbookStyles = archiveEntries["xl/styles.xml"];

    if (!workbookStyles) {
      return new Uint8Array(workbookBytes);
    }

    const highlightedStyles = ensureErrorHighlightStyle(strFromU8(workbookStyles));
    archiveEntries["xl/styles.xml"] = strToU8(highlightedStyles.xml);

    Object.keys(archiveEntries).forEach((entryName) => {
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(entryName)) {
        return;
      }

      archiveEntries[entryName] = strToU8(
        buildStyledErrorWorksheetXml({
          worksheetXml: strFromU8(archiveEntries[entryName]),
          styleIndex: highlightedStyles.styleIndex,
        }),
      );
    });

    return zipSync(archiveEntries);
  };

  const updateWorksheetDimension = (worksheetDocument: Document, endRow: number) => {
    const dimension =
      worksheetDocument.getElementsByTagNameNS(XML_MAIN_NS, "dimension")[0];

    if (dimension) {
      dimension.setAttribute("ref", `A1:J${Math.max(endRow, 33)}`);
    }
  };

  const updateWorksheetSelection = (
    worksheetDocument: Document,
    isPrimarySheet: boolean,
  ) => {
    const primarySheetView =
      worksheetDocument.getElementsByTagNameNS(XML_MAIN_NS, "sheetView")[0];

    if (!primarySheetView) {
      return;
    }

    if (isPrimarySheet) {
      primarySheetView.setAttribute("tabSelected", "1");
      return;
    }

    primarySheetView.removeAttribute("tabSelected");
  };

  const buildStyledWorksheetXml = ({
    baseWorksheetXml,
    sheet,
    templateType,
    isPrimarySheet,
  }: {
    baseWorksheetXml: string;
    sheet: GeneratedTemplateSheet;
    templateType: StudentGradeProgramType;
    isPrimarySheet: boolean;
  }) => {
    const worksheetDocument = parseXml(baseWorksheetXml);
    const sheetData =
      worksheetDocument.getElementsByTagNameNS(XML_MAIN_NS, "sheetData")[0];

    if (!sheetData) {
      throw new Error("The template worksheet is missing sheet data.");
    }

    populateStyledTemplateMetadata({
      sheetData,
      templateType,
      sheet,
    });
    updateWorksheetSelection(worksheetDocument, isPrimarySheet);

    if (sheet.rows.length === 0) {
      return serializeXml(worksheetDocument);
    }

    const templateRows = getSheetRows(sheetData);
    const rowMap = new Map(templateRows.map((row) => [getRowNumber(row), row]));
    const headerRows = templateRows.filter((row) => getRowNumber(row) <= 6);
    const footerRows = templateRows.filter((row) => getRowNumber(row) >= 26);
    const firstDataTemplate = rowMap.get(7);
    const middleDataTemplate = rowMap.get(8) || firstDataTemplate;
    const lastDataTemplate = rowMap.get(25) || middleDataTemplate || firstDataTemplate;

    if (!firstDataTemplate || !middleDataTemplate || !lastDataTemplate) {
      throw new Error("The template worksheet is missing its data row styles.");
    }

    while (sheetData.firstChild) {
      sheetData.removeChild(sheetData.firstChild);
    }

    headerRows.forEach((row) => {
      sheetData.appendChild(row.cloneNode(true));
    });

    if (sheet.rows.length <= TEMPLATE_DATA_CAPACITY) {
      for (let rowNumber = 7; rowNumber <= 25; rowNumber += 1) {
        const templateRow = rowMap.get(rowNumber);

        if (!templateRow) {
          continue;
        }

        const nextRow = templateRow.cloneNode(true) as Element;
        const dataIndex = rowNumber - 7;

        if (dataIndex < sheet.rows.length) {
          populateStyledTemplateDataRow(
            nextRow,
            rowNumber,
            sheet.rows[dataIndex].slice(0, TEMPLATE_DATA_COLUMNS.length),
          );

          if (dataIndex === 0) {
            copyReferenceRowStyles(nextRow, middleDataTemplate, TEMPLATE_DATA_COLUMNS);
          }
        }

        sheetData.appendChild(nextRow);
      }

      footerRows.forEach((row) => {
        sheetData.appendChild(row.cloneNode(true));
      });
      updateWorksheetDimension(worksheetDocument, 33);
      return serializeXml(worksheetDocument);
    }

    sheet.rows.forEach((rowValues, index) => {
      const rowNumber = TEMPLATE_FIRST_DATA_ROW_INDEX + 1 + index;
      const templateRow =
        index === 0
          ? firstDataTemplate
          : index === sheet.rows.length - 1
            ? lastDataTemplate
            : middleDataTemplate;
      const nextRow = templateRow.cloneNode(true) as Element;

      populateStyledTemplateDataRow(
        nextRow,
        rowNumber,
        rowValues.slice(0, TEMPLATE_DATA_COLUMNS.length),
      );

      if (index === 0) {
        copyReferenceRowStyles(nextRow, middleDataTemplate, TEMPLATE_DATA_COLUMNS);
      }

      sheetData.appendChild(nextRow);
    });

    footerRows.slice(0, 2).forEach((row, index) => {
      const nextRow = row.cloneNode(true) as Element;
      updateRowNumber(
        nextRow,
        TEMPLATE_FIRST_DATA_ROW_INDEX + 1 + sheet.rows.length + index,
      );
      sheetData.appendChild(nextRow);
    });

    updateWorksheetDimension(
      worksheetDocument,
      TEMPLATE_FIRST_DATA_ROW_INDEX + 2 + sheet.rows.length,
    );
    return serializeXml(worksheetDocument);
  };

  const updateWorkbookXml = ({
    workbookXml,
    sheetNames,
    relationshipIds,
  }: {
    workbookXml: string;
    sheetNames: string[];
    relationshipIds: string[];
  }) => {
    const workbookDocument = parseXml(workbookXml);
    const sheets = workbookDocument.getElementsByTagNameNS(XML_MAIN_NS, "sheets")[0];

    if (!sheets) {
      throw new Error("The template workbook is missing its sheet list.");
    }

    while (sheets.firstChild) {
      sheets.removeChild(sheets.firstChild);
    }

    sheetNames.forEach((sheetName, index) => {
      const sheet = workbookDocument.createElementNS(XML_MAIN_NS, "sheet");

      sheet.setAttribute("name", sheetName);
      sheet.setAttribute("sheetId", String(index + 1));
      sheet.setAttributeNS(XML_REL_NS, "r:id", relationshipIds[index]);
      sheets.appendChild(sheet);
    });

    return serializeXml(workbookDocument);
  };

  const updateWorkbookRelationshipsXml = ({
    workbookRelationshipsXml,
    sheetCount,
  }: {
    workbookRelationshipsXml: string;
    sheetCount: number;
  }) => {
    const relationshipsDocument = parseXml(workbookRelationshipsXml);
    const relationshipsRoot = relationshipsDocument.documentElement;

    Array.from(relationshipsRoot.childNodes).forEach((node) => {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).localName === "Relationship" &&
        (node as Element).getAttribute("Type") === WORKSHEET_RELATIONSHIP_TYPE
      ) {
        relationshipsRoot.removeChild(node);
      }
    });

    const relationshipIds = Array.from({ length: sheetCount }, (_, index) => {
      const relationshipId = `rId${101 + index}`;
      const relationship = relationshipsDocument.createElementNS(
        XML_PACKAGE_REL_NS,
        "Relationship",
      );

      relationship.setAttribute("Id", relationshipId);
      relationship.setAttribute("Type", WORKSHEET_RELATIONSHIP_TYPE);
      relationship.setAttribute("Target", `worksheets/sheet${index + 1}.xml`);
      relationshipsRoot.appendChild(relationship);
      return relationshipId;
    });

    return {
      relationshipIds,
      xml: serializeXml(relationshipsDocument),
    };
  };

  const updateContentTypesXml = ({
    contentTypesXml,
    sheetCount,
  }: {
    contentTypesXml: string;
    sheetCount: number;
  }) => {
    const contentTypesDocument = parseXml(contentTypesXml);
    const contentTypesRoot = contentTypesDocument.documentElement;

    Array.from(contentTypesRoot.childNodes).forEach((node) => {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).localName === "Override" &&
        ((node as Element).getAttribute("PartName") || "").startsWith(
          "/xl/worksheets/sheet",
        )
      ) {
        contentTypesRoot.removeChild(node);
      }
    });

    Array.from({ length: sheetCount }, (_, index) => {
      const override = contentTypesDocument.createElementNS(
        contentTypesRoot.namespaceURI,
        "Override",
      );

      override.setAttribute("PartName", `/xl/worksheets/sheet${index + 1}.xml`);
      override.setAttribute("ContentType", WORKSHEET_CONTENT_TYPE);
      contentTypesRoot.appendChild(override);
    });

    return serializeXml(contentTypesDocument);
  };

  const updateAppPropertiesXml = ({
    appXml,
    sheetNames,
  }: {
    appXml: string;
    sheetNames: string[];
  }) => {
    const appDocument = parseXml(appXml);
    const headingPairs = appDocument.getElementsByTagNameNS(
      XML_EXT_PROPS_NS,
      "HeadingPairs",
    )[0];
    const titlesOfParts = appDocument.getElementsByTagNameNS(
      XML_EXT_PROPS_NS,
      "TitlesOfParts",
    )[0];

    if (headingPairs) {
      while (headingPairs.firstChild) {
        headingPairs.removeChild(headingPairs.firstChild);
      }

      const vector = appDocument.createElementNS(XML_VT_NS, "vt:vector");
      vector.setAttribute("size", "2");
      vector.setAttribute("baseType", "variant");

      const labelVariant = appDocument.createElementNS(XML_VT_NS, "vt:variant");
      const label = appDocument.createElementNS(XML_VT_NS, "vt:lpstr");
      label.textContent = "Worksheets";
      labelVariant.appendChild(label);

      const countVariant = appDocument.createElementNS(XML_VT_NS, "vt:variant");
      const count = appDocument.createElementNS(XML_VT_NS, "vt:i4");
      count.textContent = String(sheetNames.length);
      countVariant.appendChild(count);

      vector.appendChild(labelVariant);
      vector.appendChild(countVariant);
      headingPairs.appendChild(vector);
    }

    if (titlesOfParts) {
      while (titlesOfParts.firstChild) {
        titlesOfParts.removeChild(titlesOfParts.firstChild);
      }

      const vector = appDocument.createElementNS(XML_VT_NS, "vt:vector");
      vector.setAttribute("size", String(sheetNames.length));
      vector.setAttribute("baseType", "lpstr");

      sheetNames.forEach((sheetName) => {
        const title = appDocument.createElementNS(XML_VT_NS, "vt:lpstr");
        title.textContent = sheetName;
        vector.appendChild(title);
      });

      titlesOfParts.appendChild(vector);
    }

    return serializeXml(appDocument);
  };

  const downloadBlob = (fileName: string, payload: BlobPart | Uint8Array) => {
    const normalizedPayload =
      payload instanceof Uint8Array
        ? new Uint8Array(payload).buffer
        : payload;
    const blob = new Blob([normalizedPayload], { type: TEMPLATE_FILE_MIME_TYPE });
    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");

    downloadLink.href = downloadUrl;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    URL.revokeObjectURL(downloadUrl);
  };

  const buildStyledTemplateArchive = async (
    templateType: StudentGradeProgramType,
    templateChoice: TemplateDownloadChoice,
    targetYearLevel: string,
  ) => {
    const template = TEMPLATE_DOWNLOADS[templateType];
    const matchedSheets = getGeneratedTemplateSheets(
      templateType,
      templateChoice,
      targetYearLevel,
    );
    const generatedSheets =
      matchedSheets.length > 0
        ? matchedSheets
        : [buildFallbackTemplateSheet(templateType, templateChoice, targetYearLevel)];

    const templateResponse = await fetch(template.href);

    if (!templateResponse.ok) {
      throw new Error(
        `Template download failed with status ${templateResponse.status}`,
      );
    }

    const templateBuffer = await templateResponse.arrayBuffer();
    const archiveEntries = unzipSync(new Uint8Array(templateBuffer)) as Record<
      string,
      Uint8Array
    >;
    const baseWorksheetXml = strFromU8(archiveEntries["xl/worksheets/sheet1.xml"]);
    const baseWorksheetRels = archiveEntries["xl/worksheets/_rels/sheet1.xml.rels"];
    const workbookRelationships = updateWorkbookRelationshipsXml({
      workbookRelationshipsXml: strFromU8(
        archiveEntries["xl/_rels/workbook.xml.rels"],
      ),
      sheetCount: generatedSheets.length,
    });

    generatedSheets.forEach((sheet, index) => {
      archiveEntries[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(
        buildStyledWorksheetXml({
          baseWorksheetXml,
          sheet,
          templateType,
          isPrimarySheet: index === 0,
        }),
      );

      if (baseWorksheetRels) {
        archiveEntries[`xl/worksheets/_rels/sheet${index + 1}.xml.rels`] =
          cloneBytes(baseWorksheetRels);
      }
    });

    Object.keys(archiveEntries).forEach((entryName) => {
      const matchedSheetFile = entryName.match(/^xl\/worksheets\/sheet(\d+)\.xml$/);
      const matchedSheetRelFile = entryName.match(
        /^xl\/worksheets\/_rels\/sheet(\d+)\.xml\.rels$/,
      );

      if (
        (matchedSheetFile && Number(matchedSheetFile[1]) > generatedSheets.length) ||
        (matchedSheetRelFile &&
          Number(matchedSheetRelFile[1]) > generatedSheets.length)
      ) {
        delete archiveEntries[entryName];
      }
    });

    archiveEntries["xl/workbook.xml"] = strToU8(
      updateWorkbookXml({
        workbookXml: strFromU8(archiveEntries["xl/workbook.xml"]),
        sheetNames: generatedSheets.map((sheet) => sheet.sheetName),
        relationshipIds: workbookRelationships.relationshipIds,
      }),
    );
    archiveEntries["xl/_rels/workbook.xml.rels"] = strToU8(
      workbookRelationships.xml,
    );
    archiveEntries["[Content_Types].xml"] = strToU8(
      updateContentTypesXml({
        contentTypesXml: strFromU8(archiveEntries["[Content_Types].xml"]),
        sheetCount: generatedSheets.length,
      }),
    );
    archiveEntries["docProps/app.xml"] = strToU8(
      updateAppPropertiesXml({
        appXml: strFromU8(archiveEntries["docProps/app.xml"]),
        sheetNames: generatedSheets.map((sheet) => sheet.sheetName),
      }),
    );

    return {
      archive: zipSync(archiveEntries),
      generatedSheetCount: generatedSheets.length,
      matchedSectionCount: matchedSheets.length,
    };
  };

  const parsePreviewRowsFromFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    let recognizedWorksheetCount = 0;

    const rows: PreviewGradeRow[] = workbook.SheetNames.flatMap<PreviewGradeRow>(
      (sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const sheetRows = XLSX.utils.sheet_to_json<WorksheetRow>(worksheet, {
          header: 1,
          defval: "",
          blankrows: false,
        });

        if (sheetRows.length === 0) {
          return [] as PreviewGradeRow[];
        }

        const headerRowIndex = findHeaderRowIndex(sheetRows);
        if (headerRowIndex === -1) {
          return [] as PreviewGradeRow[];
        }

        recognizedWorksheetCount += 1;

        const headerRow = sheetRows[headerRowIndex] ?? [];
        const rawRows = sheetRows
          .slice(headerRowIndex + 1)
          .map((row) =>
            headerRow.reduce<Record<string, unknown>>((record, headerCell, index) => {
              const key = getCellText(headerCell);
              if (key) {
                record[key] = row[index] ?? "";
              }
              return record;
            }, {}),
          )
          .filter((row) =>
            Object.values(row).some((value) => Boolean(getCellText(value))),
          );

        if (rawRows.length === 0) {
          return [] as PreviewGradeRow[];
        }

        const keys = Object.keys(rawRows[0]);
        const templateAcademicYear = getMetadataValue(sheetRows, headerRowIndex, [
          "ACADEMIC_YEAR",
          "ACADEMIC YEAR",
          "SCHOOL_YEAR",
          "SCHOOL YEAR",
          "AY",
        ]);
        const templateSemester = getMetadataValue(sheetRows, headerRowIndex, [
          "SEMESTER",
          "TERM",
        ]);
        const templateProgramType = getMetadataValue(sheetRows, headerRowIndex, [
          "PROGRAM_TYPE",
          "PROGRAM",
          "TYPE",
        ]);
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
        const gradeKey = findHeaderKey(keys, ["GRADE", "GRADES"]);
        const unitKey = findHeaderKey(keys, ["UNIT", "UNITS"]);
        const academicYearKey = findHeaderKey(keys, [
          "ACADEMIC_YEAR",
          "ACADEMIC YEAR",
          "SCHOOL_YEAR",
          "SCHOOL YEAR",
          "AY",
        ]);
        const semesterKey = findHeaderKey(keys, ["SEMESTER", "TERM"]);
        const gradingPeriodKey = findHeaderKey(keys, [
          "GRADING_PERIOD",
          "GRADING PERIOD",
          "PERIOD",
          "QUARTER",
        ]);
        const programTypeKey = findHeaderKey(keys, [
          "PROGRAM_TYPE",
          "PROGRAM",
          "TYPE",
        ]);

        return rawRows.map((row): PreviewGradeRow => {
          const studentId = getCellText(studentIdKey ? row[studentIdKey] : "");
          const fullName = getCellText(fullNameKey ? row[fullNameKey] : "");
          const subjectCode = getCellText(
            subjectCodeKey ? row[subjectCodeKey] : "",
          );
          const subjectTitle = getCellText(
            subjectTitleKey ? row[subjectTitleKey] : "",
          );
          const grade = getCellText(gradeKey ? row[gradeKey] : "");
          const unit = getCellText(unitKey ? row[unitKey] : "");
          const academicYear =
            getCellText(academicYearKey ? row[academicYearKey] : "") ||
            templateAcademicYear;
          const semester =
            getCellText(semesterKey ? row[semesterKey] : "") || templateSemester;
          const rawGradingPeriod = getCellText(
            gradingPeriodKey ? row[gradingPeriodKey] : "",
          );
          const rawProgramType =
            getCellText(programTypeKey ? row[programTypeKey] : "") ||
            templateProgramType;
          const inferredProgramType =
            gradingPeriodKey && normalizeHeader(gradingPeriodKey) === "QUARTER"
              ? "SHS"
              : !gradingPeriodKey && unitKey
                ? "College"
                : "";
          const normalizedProgramType = resolveProgramType(
            rawProgramType,
            inferredProgramType,
          );
          const gradingPeriod =
            rawGradingPeriod ||
            (normalizedProgramType === "College" ? semester : "");
          const validationResult = normalizedProgramType
            ? validateAndNormalizeUploadedGradeRow({
                studentId,
                fullName,
                subjectCode,
                subjectTitle,
                grade,
                unit,
                academicYear,
                semester,
                gradingPeriod,
                programType: normalizedProgramType,
                branch: currentBranch,
              }, undefined, {
                allowBlankGradeClear: true,
              })
            : { errorReason: "Program Type must be SHS or College" };
          const normalizedRecord = validationResult.normalizedRecord;
          const clearRecordIdentity = validationResult.clearRecordIdentity;
          const action = clearRecordIdentity ? "Clear" : "Upload";

          return {
            sheetName,
            studentId: normalizedRecord?.studentId || studentId,
            fullName,
            subjectCode,
            subjectTitle,
            grade,
            unit,
            academicYear: normalizedRecord?.academicYear || academicYear,
            semester: normalizedRecord?.semester || semester,
            gradingPeriod: normalizedRecord?.gradingPeriod || gradingPeriod,
            programType: normalizedProgramType,
            evaluation: normalizedRecord
              ? normalizedRecord.evaluation
              : clearRecordIdentity
                ? "Clear"
                : "Invalid",
            action,
            status: normalizedRecord || clearRecordIdentity ? "Valid" : "Error",
            clearRecordIdentity,
            errorReason:
              normalizedRecord || clearRecordIdentity
                ? ""
                : validationResult.errorReason || "Invalid row",
            normalizedRecord,
          };
        });
      },
    );

    if (recognizedWorksheetCount === 0) {
      throw new Error("No recognizable grade worksheets were found in the uploaded file.");
    }

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
      setPreviewPage(1);
      return;
    }

    const normalizedName = file.name.replace(/\.[^/.]+$/, "");
    setPreviewFileName(normalizedName);

    try {
      const parsedRows = await parsePreviewRowsFromFile(file);
      setPreviewRows(parsedRows);
      setPreviewPage(1);
      setIsPreviewModalOpen(true);
      const sheetCount = new Set(parsedRows.map((row) => row.sheetName)).size;
      addToast(
        `File "${file.name}" loaded successfully from ${sheetCount || 1} worksheet${sheetCount === 1 ? "" : "s"}. Please review the data.`,
        "info",
      );
    } catch (error) {
      console.error("Failed to parse selected Excel file", error);
      setPreviewRows([]);
      setIsPreviewModalOpen(false);
      setPreviewPage(1);
      addToast(
        "Unable to read this Excel file. Please check the format and try again.",
        "error",
      );
    }
  };

  const handleDownloadTemplate = async (
    templateType: StudentGradeProgramType,
  ) => {
    try {
      const templateChoice = getSelectedTemplateChoice(templateType);
      const targetYearLevel = getSelectedTemplateYearLevel(templateType);
      const selectionSummary = getTemplateSelectionSummary(
        targetYearLevel,
        templateChoice,
      );
      const { archive, generatedSheetCount, matchedSectionCount } =
        await buildStyledTemplateArchive(
          templateType,
          templateChoice,
          targetYearLevel,
        );

      if (!archive) {
        throw new Error("Template archive was not generated.");
      }

      downloadBlob(
        buildTemplateDownloadFileName(
          templateType,
          templateChoice,
          targetYearLevel,
        ),
        archive,
      );

      if (matchedSectionCount === 0) {
        addToast(
          `No ${templateType} sections matched ${selectionSummary} for ${currentBranch}, so a blank template was downloaded with that setting.`,
          "warning",
        );
        return;
      }

      addToast(
        `${templateType} ${selectionSummary} template downloaded with ${generatedSheetCount} section worksheet${generatedSheetCount === 1 ? "" : "s"}.`,
        "success",
      );
    } catch (error) {
      console.error("Failed to generate grade template", error);
      addToast(
        "Unable to generate the grade template right now. Please try again.",
        "error",
      );
    }
  };

  const handleDownloadErrorRows = ({
    rows,
    fileName,
  }: {
    rows: PreviewGradeRow[];
    fileName: string;
  }) => {
    const errorRows = getErrorPreviewRows(rows);

    if (errorRows.length === 0) {
      addToast("No error rows are available to download.", "info");
      return;
    }

    try {
      const errorWorkbook = buildHighlightedErrorWorkbook(errorRows);

      if (!errorWorkbook) {
        addToast("No error rows are available to download.", "info");
        return;
      }

      downloadBlob(buildErrorExportFileName(fileName), errorWorkbook);

      const worksheetCount = new Set(
        errorRows.map((row) => row.sheetName.trim() || "Errors"),
      ).size;
      addToast(
        `Downloaded ${errorRows.length} highlighted error row${errorRows.length === 1 ? "" : "s"} from ${worksheetCount} worksheet${worksheetCount === 1 ? "" : "s"}.`,
        "success",
      );
    } catch (error) {
      console.error("Failed to download highlighted error workbook", error);
      addToast("Failed to download the highlighted error workbook.", "error");
    }
  };

  const handleRedoUploadHistoryItem = (historyItem: UploadHistoryItem) => {
    if (historyItem.redoneAt) {
      addToast(
        `"${historyItem.fileName}" was already redone on ${historyItem.redoneAt}.`,
        "info",
      );
      return;
    }

    const uploadedRows = (historyItem.fileData ?? []).filter(
      (
        row,
      ): row is PreviewGradeRow & { normalizedRecord: StoredStudentGradeRecord } =>
        Boolean(row.normalizedRecord),
    );

    if (uploadedRows.length === 0) {
      addToast(
        "This history item does not have saved uploaded grades to redo.",
        "warning",
      );
      return;
    }

    const shouldRedo = window.confirm(
      `Redo "${historyItem.fileName}"?\n\nThis will clear ${uploadedRows.length} uploaded grade${
        uploadedRows.length === 1 ? "" : "s"
      } from the student portal if those grades have not been replaced by a newer upload.`,
    );

    if (!shouldRedo) {
      return;
    }

    const currentRecords = readStudentGradeRecordsForBranch(currentBranch);
    const currentRecordMap = new Map(
      currentRecords.map((record) => [buildGradeIdentityKey(record), record]),
    );
    const redoOperations: Array<{
      type: "clear";
      identity: StudentGradeRecordIdentity;
    }> = [];
    let skippedRecords = 0;

    uploadedRows.forEach((row) => {
      const identity = buildGradeIdentityFromStoredRecord(row.normalizedRecord);
      const currentRecord = currentRecordMap.get(buildGradeIdentityKey(identity));

      if (!currentRecord) {
        skippedRecords += 1;
        return;
      }

      if (currentRecord.normalizedGrade !== row.normalizedRecord.normalizedGrade) {
        skippedRecords += 1;
        return;
      }

      redoOperations.push({ type: "clear", identity });
    });

    const redoneAt = formatHistoryTimestamp(new Date());
    const updatedHistory = uploadHistory.map((item) =>
      item.id === historyItem.id ? { ...item, redoneAt } : item,
    );

    if (redoOperations.length === 0) {
      saveUploadHistory(updatedHistory);
      addToast(
        skippedRecords > 0
          ? "No grades were cleared because those records were already changed or removed by a newer update."
          : "No grades were cleared from this upload.",
        "warning",
      );
      return;
    }

    applyStudentGradeUploadOperationsForBranch(currentBranch, redoOperations);
    saveUploadHistory(updatedHistory);

    const redoSummary = [
      `${redoOperations.length} grade${redoOperations.length === 1 ? "" : "s"} cleared`,
      skippedRecords > 0
        ? `${skippedRecords} row${skippedRecords === 1 ? "" : "s"} skipped because newer grades already replaced them`
        : "",
    ]
      .filter(Boolean)
      .join(", ");

    addToast(
      `Redo completed for "${historyItem.fileName}". ${redoSummary}.`,
      skippedRecords > 0 ? "warning" : "success",
    );
  };

  const handleToggleHistorySelection = (historyId?: string) => {
    if (!historyId) {
      return;
    }

    setSelectedHistoryIds((previousIds) =>
      previousIds.includes(historyId)
        ? previousIds.filter((id) => id !== historyId)
        : [...previousIds, historyId],
    );
  };

  const handleToggleHistoryPageSelection = () => {
    if (historyPageIds.length === 0) {
      return;
    }

    setSelectedHistoryIds((previousIds) => {
      const previousIdSet = new Set(previousIds);

      if (historyPageIds.every((id) => previousIdSet.has(id))) {
        return previousIds.filter((id) => !historyPageIds.includes(id));
      }

      historyPageIds.forEach((id) => previousIdSet.add(id));
      return Array.from(previousIdSet);
    });
  };

  const handleDeleteSelectedUploadHistory = () => {
    if (selectedHistoryIds.length === 0) {
      addToast("Select at least one upload history item to delete.", "info");
      return;
    }

    const shouldDelete = window.confirm(
      `Delete ${selectedHistoryIds.length} selected upload histor${
        selectedHistoryIds.length === 1 ? "y" : "ies"
      }?\n\nThis only removes the history row. It will not delete posted grades.`,
    );

    if (!shouldDelete) {
      return;
    }

    const selectedIdSet = new Set(selectedHistoryIds);
    const nextHistory = uploadHistory.filter(
      (item) => !item.id || !selectedIdSet.has(item.id),
    );

    saveUploadHistory(nextHistory);
    setSelectedHistoryIds([]);
    setHistoryPage((previousPage) =>
      Math.min(
        previousPage,
        Math.max(1, Math.ceil(nextHistory.length / UPLOAD_HISTORY_PAGE_SIZE)),
      ),
    );
    addToast("Selected upload history deleted.", "success");
  };

  const updateInstructorSubmissionStatus = async (
    submissionId: string,
    status: "Approved" | "Rejected",
  ) => {
    const submission = instructorGradeSubmissions.find(
      (item) => item.id === submissionId,
    );

    if (!submission) {
      addToast("Instructor submission was not found.", "error");
      return false;
    }

    if (status === "Approved") {
      let currentGradeRecords = readStudentGradeRecordsForBranch(currentBranch);

      try {
        currentGradeRecords =
          await fetchAndCacheStudentGradeRecordsForBranch(currentBranch);
      } catch (error) {
        console.warn("Unable to refresh student grades before approval.", error);
      }

      const approvedGradeConflict = submission.records.find((record) =>
        findApprovedStudentGradeConflict({
          branch: currentBranch,
          record,
          existingRecords: currentGradeRecords,
        }),
      );

      if (approvedGradeConflict) {
        addToast(
          getApprovedStudentGradeConflictMessage(approvedGradeConflict),
          "error",
        );
        return false;
      }

      applyStudentGradeUploadOperationsForBranch(
        currentBranch,
        submission.records.map((record) => ({
          type: "upsert" as const,
          record,
        })),
      );
    }

    writeInstructorGradeSubmissions(
      currentBranch,
      instructorGradeSubmissions.map((item) =>
        item.id === submissionId
          ? {
              ...item,
              status,
              reviewedAt: new Date().toISOString(),
              reviewedBy: loggedInUsername,
            }
          : item,
      ),
    );
    setInstructorSubmissionVersion((previousValue) => previousValue + 1);
    addToast(
      status === "Approved"
        ? "Instructor grades approved and posted."
        : "Instructor grade submission rejected.",
      status === "Approved" ? "success" : "info",
    );
    return true;
  };

  const updateInstructorGradeChangeRequestStatus = async (
    requestId: string,
    status: "Approved" | "Rejected",
  ) => {
    const request = instructorGradeChangeRequests.find(
      (item) => item.id === requestId,
    );

    if (!request) {
      addToast("Instructor grade change request was not found.", "error");
      return false;
    }

    if (status === "Approved") {
      let currentGradeRecords = readStudentGradeRecordsForBranch(currentBranch);

      try {
        currentGradeRecords =
          await fetchAndCacheStudentGradeRecordsForBranch(currentBranch);
      } catch (error) {
        console.warn(
          "Unable to refresh student grades before approving change request.",
          error,
        );
      }

      const staleChange = request.changes.find((change) => {
        const currentRecord = findApprovedStudentGradeConflict({
          branch: currentBranch,
          record: change.requestedRecord,
          existingRecords: currentGradeRecords,
        });

        return (
          !currentRecord ||
          normalizeApprovalGradeValue(currentRecord.normalizedGrade) !==
            normalizeApprovalGradeValue(change.currentGrade)
        );
      });

      if (staleChange) {
        addToast(
          `Cannot approve yet. ${staleChange.fullName}'s current ${staleChange.subjectCode} grade no longer matches this request.`,
          "error",
        );
        return false;
      }

      const reviewedAt = new Date().toISOString();

      applyStudentGradeUploadOperationsForBranch(
        currentBranch,
        request.changes.map((change) => ({
          type: "upsert" as const,
          record: {
            ...change.requestedRecord,
            updatedAt: reviewedAt,
          },
        })),
      );
    }

    writeInstructorGradeChangeRequests(
      currentBranch,
      instructorGradeChangeRequests.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status,
              reviewedAt: new Date().toISOString(),
              reviewedBy: loggedInUsername,
            }
          : item,
      ),
    );
    setInstructorSubmissionVersion((previousValue) => previousValue + 1);
    addToast(
      status === "Approved"
        ? "Instructor grade change request approved and posted."
        : "Instructor grade change request rejected.",
      status === "Approved" ? "success" : "info",
    );
    return true;
  };

  const updateInstructorGradeApprovalStatus = async (
    item: InstructorGradeApprovalItem,
    status: "Approved" | "Rejected",
  ) => {
    const wasUpdated =
      item.kind === "upload"
        ? await updateInstructorSubmissionStatus(item.id, status)
        : await updateInstructorGradeChangeRequestStatus(item.id, status);

    if (wasUpdated) {
      setViewingInstructorGradeItem(null);
    }
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

    const uploadDate = new Date();
    const uploadedAt = formatHistoryTimestamp(uploadDate);

    const normalizedName = selectedFile.name.replace(/\.[^/.]+$/, "");
    const uploadOperations = previewRows.flatMap<StudentGradeUploadOperation>(
      (row) => {
        if (row.status !== "Valid") {
          return [];
        }

        if (row.normalizedRecord) {
          return [{ type: "upsert" as const, record: row.normalizedRecord }];
        }

        if (row.clearRecordIdentity) {
          return [{ type: "clear" as const, identity: row.clearRecordIdentity }];
        }

        return [];
      },
    );

    applyStudentGradeUploadOperationsForBranch(currentBranch, uploadOperations);

    const newHistoryItem: UploadHistoryItem = {
      fileName: normalizedName,
      dateUpload: uploadedAt,
      uploadedAt: uploadDate.toISOString(),
      records: processedRecords,
      errors: errorRecords,
      status: errorRecords > 0 ? "Error" : "Completed",
      fileData: [...previewRows], // Store the actual file data
    };

    const updatedHistory = [newHistoryItem, ...uploadHistory];
    saveUploadHistory(updatedHistory);
    setHistoryPage(1);

    setSelectedFile(null);
    setSelectedFileName("No file chosen");
    setPreviewRows([]);
    setPreviewFileName("");
    setIsReadyToUpload(false);
    setIsPreviewModalOpen(false);
    setPreviewPage(1);

    const uploadSummary = [
      uploadedRecords > 0
        ? `${uploadedRecords} grade${uploadedRecords === 1 ? "" : "s"} saved`
        : "",
      clearedRecords > 0
        ? `${clearedRecords} grade${clearedRecords === 1 ? "" : "s"} cleared`
        : "",
      `${errorRecords} error${errorRecords === 1 ? "" : "s"} found`,
    ]
      .filter(Boolean)
      .join(", ");

    addToast(
      `Grades uploaded successfully! ${uploadSummary}.`,
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
    setPreviewPage(1);

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

  const handleSidebarToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

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
        type="button"
      >
        <span className="menu-toggle-icon" aria-hidden="true">
          {isSidebarOpen ? <FiX /> : <FiMenu />}
        </span>
      </button>

      {/* Main content */}
      <main className="grades-content">
        <header className="page-header">
          <h1>Instructor Grade Approvals</h1>
          <p>
            Review instructor-uploaded grades and approve them before they
            become official in student accounts.
          </p>
        </header>

        <div className="grade-approval-summary-grid">
          <div className="grade-approval-summary-card pending">
            <span>Pending</span>
            <strong>{pendingInstructorGradeSubmissions.length}</strong>
          </div>
          <div className="grade-approval-summary-card approved">
            <span>Approved</span>
            <strong>{approvedInstructorGradeSubmissions.length}</strong>
          </div>
          <div className="grade-approval-summary-card rejected">
            <span>Rejected</span>
            <strong>{rejectedInstructorGradeSubmissions.length}</strong>
          </div>
        </div>

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
                Note: Uploaded grades from every worksheet will be reflected in
                the student portal grades page for matching students in this
                branch. Leaving a grade cell blank in a completed template row
                will clear the matching posted grade.
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
              grades. Choose the target year level and semester or quarter
              first. The template includes:
            </p>

            <ul className="template-list">
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                Your original Excel template design is preserved
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                One worksheet tab per matching section in this branch
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                Pre-filled student and subject rows when section assignments
                already exist
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                Section details, year level, academic year, and semester metadata at the top
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                Multi-sheet upload support during import review
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                SHS uses quarterly grading: 1st and 2nd Quarter for 1st
                Semester, then 3rd and 4th Quarter for 2nd Semester
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                SHS grades must be 60 to 100, with 75 as the passing grade
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                College supports semester or final grade uploads, including
                1.00 to 3.00 passing grades, 4.00 for INC, and 5.00 for FAILED
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                Blank grade cells can be uploaded to clear previously posted
                grades for matching rows
              </li>
            </ul>

            <div className="template-actions">
              <div className="template-download-group">
                <label
                  className="template-choice-label"
                  htmlFor="college-template-year-level"
                >
                  College year level
                </label>
                <select
                  id="college-template-year-level"
                  className="template-choice-select"
                  value={collegeTemplateYearLevel}
                  onChange={(event) =>
                    setCollegeTemplateYearLevel(
                      event.target.value as (typeof COLLEGE_TEMPLATE_YEAR_LEVELS)[number],
                    )
                  }
                >
                  {COLLEGE_TEMPLATE_YEAR_LEVELS.map((yearLevel) => (
                    <option key={yearLevel} value={yearLevel}>
                      {yearLevel}
                    </option>
                  ))}
                </select>
                <label
                  className="template-choice-label"
                  htmlFor="college-template-semester"
                >
                  College term
                </label>
                <select
                  id="college-template-semester"
                  className="template-choice-select"
                  value={collegeTemplateSemester}
                  onChange={(event) =>
                    setCollegeTemplateSemester(
                      event.target.value as CollegeTemplateSemester,
                    )
                  }
                >
                  {COLLEGE_TEMPLATE_SEMESTERS.map((semester) => (
                    <option key={semester} value={semester}>
                      {semester}
                    </option>
                  ))}
                </select>
                <button
                  className="template-btn college"
                  onClick={() => handleDownloadTemplate("College")}
                >
                  <FiDownload /> College Template
                </button>
              </div>

              <div className="template-download-group">
                <label
                  className="template-choice-label"
                  htmlFor="shs-template-year-level"
                >
                  SHS year level
                </label>
                <select
                  id="shs-template-year-level"
                  className="template-choice-select"
                  value={shsTemplateYearLevel}
                  onChange={(event) =>
                    setShsTemplateYearLevel(
                      event.target.value as (typeof SHS_TEMPLATE_YEAR_LEVELS)[number],
                    )
                  }
                >
                  {SHS_TEMPLATE_YEAR_LEVELS.map((yearLevel) => (
                    <option key={yearLevel} value={yearLevel}>
                      {yearLevel}
                    </option>
                  ))}
                </select>
                <label
                  className="template-choice-label"
                  htmlFor="shs-template-quarter"
                >
                  SHS quarter
                </label>
                <select
                  id="shs-template-quarter"
                  className="template-choice-select"
                  value={shsTemplateQuarter}
                  onChange={(event) =>
                    setShsTemplateQuarter(
                      event.target.value as ShsTemplateQuarter,
                    )
                  }
                >
                  {SHS_TEMPLATE_QUARTERS.map((quarter) => (
                    <option key={quarter} value={quarter}>
                      {quarter}
                    </option>
                  ))}
                </select>
                <button
                  className="template-btn shs"
                  onClick={() => handleDownloadTemplate("SHS")}
                >
                  <FiDownload /> SHS Template
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="history-card instructor-submissions-card">
          <div className="history-header">
            <div>
              <h3>Instructor Grade Requests</h3>
              <p>
                {pendingInstructorGradeSubmissions.length} pending request
                {pendingInstructorGradeSubmissions.length === 1 ? "" : "s"} for
                approval. Approved uploads and change requests are posted to
                student accounts.
              </p>
            </div>
          </div>

          <div className="table-container history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Instructor</th>
                  <th>Type</th>
                  <th>File</th>
                  <th>Date Submitted</th>
                  <th>No. of Students</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {instructorGradeApprovalItems.length > 0 ? (
                  instructorGradeApprovalItems.map((item) => (
                    <tr key={`${item.kind}-${item.id}`}>
                      <td>
                        <strong>{item.instructorName}</strong>
                        <br />
                        <span>{item.employeeId}</span>
                      </td>
                      <td>
                        <span
                          className={`grade-request-type-badge ${item.kind}`}
                        >
                          {item.requestType}
                        </span>
                      </td>
                      <td
                        className="instructor-submission-file-cell"
                        title={item.fileName}
                      >
                        {item.fileName}
                      </td>
                      <td>{new Date(item.submittedAt).toLocaleString()}</td>
                      <td>
                        <strong className="uploaded-grade-count">
                          {item.rowCount}
                        </strong>
                        <div className="uploaded-grade-list">
                          {(item.kind === "upload"
                            ? item.submission.records
                            : item.request.changes
                          ).slice(0, 8).map((record) => (
                            <div className="uploaded-grade-row" key={record.id}>
                              <strong>{record.fullName}</strong>
                              <span>
                                {record.subjectCode} · {record.gradingPeriod} ·{" "}
                                {"normalizedGrade" in record
                                  ? record.normalizedGrade
                                  : `${record.currentGrade} to ${record.requestedGrade}`}
                              </span>
                            </div>
                          ))}
                          {item.rowCount > 8 && (
                            <span className="uploaded-grade-more">
                              +{item.rowCount - 8} more grade rows
                            </span>
                          )}
                          {item.rowCount === 0 && (
                            <span className="uploaded-grade-more">
                              No valid grade rows
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`upload-status-badge ${item.status.toLowerCase()}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <div className="history-actions">
                          <button
                            type="button"
                            className="view-history-btn instructor-approval-action-btn view"
                            onClick={() => setViewingInstructorGradeItem(item)}
                          >
                            Review
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="no-results">
                      No instructor grade requests yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {viewingInstructorGradeItem?.kind === "upload" && (
          <div className="preview-modal-overlay">
            <div className="preview-modal">
              <div className="preview-modal-header">
                <div>
                  <h2>{viewingInstructorGradeItem.fileName}</h2>
                  <span className="grade-request-type-badge upload">
                    {viewingInstructorGradeItem.requestType}
                  </span>
                </div>
                <button
                  type="button"
                  className="preview-modal-close"
                  onClick={() => setViewingInstructorGradeItem(null)}
                  aria-label="Close uploaded file view"
                >
                  ×
                </button>
              </div>

              <div className="preview-modal-body">
                <div className="preview-card">
                  <div className="preview-header">
                    <div>
                      <h3>{viewingInstructorGradeItem.instructorName}</h3>
                      <p>
                        {viewingInstructorGradeItem.submission.records.length} uploaded
                        grade row
                        {viewingInstructorGradeItem.submission.records.length === 1
                          ? ""
                          : "s"}{" "}
                        awaiting review or already processed.
                      </p>
                    </div>
                  </div>

                  <div className="table-container preview-table-container">
                    <table className="grades-table">
                      <thead>
                        <tr>
                          <th>Student ID</th>
                          <th>Full Name</th>
                          <th>Subject</th>
                          <th>Grade</th>
                          <th>Units</th>
                          <th>Term</th>
                          <th>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingInstructorGradeItem.submission.records.length > 0 ? (
                          viewingInstructorGradeItem.submission.records.map((record) => (
                            <tr key={record.id}>
                              <td>{record.studentId}</td>
                              <td>{record.fullName}</td>
                              <td>
                                <strong>{record.subjectCode}</strong>
                                <br />
                                <span>{record.subjectTitle}</span>
                              </td>
                              <td>{record.normalizedGrade}</td>
                              <td>{record.units ?? "-"}</td>
                              <td>
                                {record.academicYear}
                                <br />
                                {record.semester} / {record.gradingPeriod}
                              </td>
                              <td>{record.evaluation}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="no-results">
                              No valid grade rows were uploaded in this file.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {viewingInstructorGradeItem.submission.errors.length > 0 && (
                    <div className="upload-note warning">
                      <FiAlertCircle className="note-icon warning" />
                      <span>
                        {viewingInstructorGradeItem.submission.errors.length} warning
                        {viewingInstructorGradeItem.submission.errors.length === 1
                          ? ""
                          : "s"}{" "}
                        were detected during upload.
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {viewingInstructorGradeItem.status === "Pending" && (
                <div className="preview-modal-actions grade-approval-modal-actions">
                  <button
                    type="button"
                    className="instructor-approval-action-btn reject"
                    onClick={() =>
                      void updateInstructorGradeApprovalStatus(
                        viewingInstructorGradeItem,
                        "Rejected",
                      )
                    }
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="instructor-approval-action-btn approve"
                    onClick={() =>
                      void updateInstructorGradeApprovalStatus(
                        viewingInstructorGradeItem,
                        "Approved",
                      )
                    }
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {viewingInstructorGradeItem?.kind === "change" && (
          <div className="preview-modal-overlay">
            <div className="preview-modal">
              <div className="preview-modal-header">
                <div>
                  <h2>{viewingInstructorGradeItem.fileName}</h2>
                  <span className="grade-request-type-badge change">
                    {viewingInstructorGradeItem.requestType}
                  </span>
                </div>
                <button
                  type="button"
                  className="preview-modal-close"
                  onClick={() => setViewingInstructorGradeItem(null)}
                  aria-label="Close grade change request view"
                >
                  Ã—
                </button>
              </div>

              <div className="preview-modal-body">
                <div className="preview-card">
                  <div className="preview-header">
                    <div>
                      <h3>{viewingInstructorGradeItem.instructorName}</h3>
                      <p>
                        {viewingInstructorGradeItem.request.changes.length} requested
                        grade change row
                        {viewingInstructorGradeItem.request.changes.length === 1
                          ? ""
                          : "s"}{" "}
                        awaiting review or already processed.
                      </p>
                    </div>
                  </div>

                  <div className="table-container preview-table-container">
                    <table className="grades-table">
                      <thead>
                        <tr>
                          <th>Student ID</th>
                          <th>Full Name</th>
                          <th>Subject</th>
                          <th>Current Grade</th>
                          <th>Requested Grade</th>
                          <th>Units / Period</th>
                          <th>Term</th>
                          <th>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingInstructorGradeItem.request.changes.length > 0 ? (
                          viewingInstructorGradeItem.request.changes.map((change) => (
                            <tr key={change.id}>
                              <td>{change.studentId}</td>
                              <td>{change.fullName}</td>
                              <td>
                                <strong>{change.subjectCode}</strong>
                                <br />
                                <span>{change.subjectTitle}</span>
                              </td>
                              <td>{change.currentGrade}</td>
                              <td>{change.requestedGrade}</td>
                              <td>
                                {change.programType === "SHS"
                                  ? change.gradingPeriod || "-"
                                  : change.units ?? "-"}
                              </td>
                              <td>
                                {change.academicYear}
                                <br />
                                {change.semester} / {change.gradingPeriod}
                              </td>
                              <td>{change.requestedRecord.evaluation}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="no-results">
                              No valid grade changes were uploaded in this file.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {viewingInstructorGradeItem.request.errors.length > 0 && (
                    <div className="upload-note warning">
                      <FiAlertCircle className="note-icon warning" />
                      <span>
                        {viewingInstructorGradeItem.request.errors.length} warning
                        {viewingInstructorGradeItem.request.errors.length === 1
                          ? ""
                          : "s"}{" "}
                        were detected during upload.
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {viewingInstructorGradeItem.status === "Pending" && (
                <div className="preview-modal-actions grade-approval-modal-actions">
                  <button
                    type="button"
                    className="instructor-approval-action-btn reject"
                    onClick={() =>
                      void updateInstructorGradeApprovalStatus(
                        viewingInstructorGradeItem,
                        "Rejected",
                      )
                    }
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="instructor-approval-action-btn approve"
                    onClick={() =>
                      void updateInstructorGradeApprovalStatus(
                        viewingInstructorGradeItem,
                        "Approved",
                      )
                    }
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

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

              <div className="preview-modal-body">
                <div className="preview-card">
                <div className="preview-header">
                  <div>
                    <h3>
                      {previewFileName ||
                        selectedFileName.replace(/\.[^/.]+$/, "")}
                    </h3>
                    <p>
                      Review the grades before saving them for this branch.
                      Blank grade cells with complete row details will clear the
                      matching posted grade.
                    </p>
                  </div>
                </div>

                <div className="preview-summary">
                  <div className="summary-item success">
                    <span className="summary-icon" aria-hidden="true">
                      <FiCheck />
                    </span>
                    <div>
                      <strong>Grades to Save</strong>
                      <p>{uploadedRecords}</p>
                    </div>
                  </div>

                  <div className="summary-item info">
                    <span className="summary-icon" aria-hidden="true">
                      <FiX />
                    </span>
                    <div>
                      <strong>Clear Requests</strong>
                      <p>{clearedRecords}</p>
                    </div>
                  </div>

                  <div className="summary-item error">
                    <span className="summary-icon" aria-hidden="true">
                      <FiAlertCircle />
                    </span>
                    <div>
                      <strong>Errors</strong>
                      <p>{errorRecords}</p>
                    </div>
                  </div>
                </div>

                <div className="table-container preview-table-container">
                  <table className="grades-table">
                    <thead>
                      <tr>
                        <th>WORKSHEET</th>
                        <th>STUDENT_ID</th>
                        <th>FULL NAME</th>
                        <th>SUBJECT CODE</th>
                        <th>SUBJECT TITLE</th>
                        <th>GRADE</th>
                        <th>UNIT</th>
                        <th>SEMESTER</th>
                        <th>REMARKS</th>
                      </tr>
                      </thead>

                      <tbody>
                      {previewRows.length > 0 ? (
                        previewPageRows.map((row, index) => (
                          <tr
                            key={`${row.sheetName}-${row.studentId}-${previewPageStartIndex + index}`}
                            className={
                              row.status === "Error" ? "preview-row-error" : ""
                            }
                            title={row.errorReason || undefined}
                          >
                            <td>{row.sheetName || "N/A"}</td>
                            <td>{row.studentId || "—"}</td>
                            <td>{row.fullName || "—"}</td>
                            <td>{row.subjectCode || "—"}</td>
                            <td>{row.subjectTitle || "—"}</td>
                            <td>
                              {row.grade ||
                                (row.action === "Clear"
                                  ? "Blank (Clear)"
                                  : "—")}
                            </td>
                            <td>{row.unit || "—"}</td>
                            <td>{row.semester || "—"}</td>
                            <td>
                              {row.status === "Error"
                                ? row.errorReason
                                : row.action === "Clear"
                                  ? "Will clear matching posted grade"
                                  : "Ready to upload"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={9} className="no-results">
                            No preview rows detected from this file.
                          </td>
                        </tr>
                      )}
                      </tbody>
                  </table>
                </div>

                <div className="preview-pagination" aria-label="Preview table pages">
                  <div className="preview-pagination-summary">
                    Showing {previewRangeStart}-{previewRangeEnd} of {previewRows.length} records
                  </div>
                  <div className="preview-pagination-controls">
                    <button
                      type="button"
                      className="preview-page-btn"
                      onClick={() =>
                        setPreviewPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPreviewPage === 1}
                      aria-label="Previous preview page"
                    >
                      <FiChevronLeft />
                    </button>
                    <span className="preview-page-indicator">
                      Page {currentPreviewPage} of {previewPageCount}
                    </span>
                    <button
                      type="button"
                      className="preview-page-btn"
                      onClick={() =>
                        setPreviewPage((prev) =>
                          Math.min(previewPageCount, prev + 1),
                        )
                      }
                      disabled={currentPreviewPage === previewPageCount}
                      aria-label="Next preview page"
                    >
                      <FiChevronRight />
                    </button>
                  </div>
                </div>

                <div className="preview-modal-actions">
                  {errorRecords > 0 && (
                    <button
                      type="button"
                      className="download-errors-btn"
                      onClick={() =>
                        handleDownloadErrorRows({
                          rows: previewRows,
                          fileName:
                            previewFileName ||
                            selectedFileName.replace(/\.[^/.]+$/, ""),
                        })
                      }
                    >
                      <FiDownload /> Download Errors
                    </button>
                  )}
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
          </div>
        )}

        {/* Upload history */}
        <div className="history-card">
          <div className="history-header">
            <div>
              <h3>Upload History</h3>
              <p>
                {selectedHistoryCount > 0
                  ? `${selectedHistoryCount} selected`
                  : "Select history rows to remove them from this list."}
              </p>
            </div>
            <button
              type="button"
              className="delete-history-selected-btn"
              onClick={handleDeleteSelectedUploadHistory}
              disabled={selectedHistoryCount === 0}
            >
              <FiTrash2 />
              Delete Selected
            </button>
          </div>

          <div className="table-container history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th className="history-select-column">
                    <input
                      type="checkbox"
                      aria-label="Select all upload history on this page"
                      checked={areAllHistoryPageRowsSelected}
                      ref={(inputElement) => {
                        if (inputElement) {
                          inputElement.indeterminate =
                            isSomeHistoryPageRowSelected;
                        }
                      }}
                      onChange={handleToggleHistoryPageSelection}
                    />
                  </th>
                  <th>File Name</th>
                  <th>Date Upload</th>
                  <th>Records</th>
                  <th>Errors</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {historyPageRows.length > 0 ? (
                  historyPageRows.map((item) => {
                  const redoableRecordCount = getRedoableHistoryRecordCount(item);
                  const downloadableErrorCount =
                    getDownloadableHistoryErrorCount(item);
                  const isRedoDisabled =
                    Boolean(item.redoneAt) || redoableRecordCount === 0;
                  const isDownloadErrorsDisabled = downloadableErrorCount === 0;

                  return (
                    <tr key={item.id}>
                      <td className="history-select-column">
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.fileName} upload history`}
                          checked={Boolean(
                            item.id && selectedHistoryIdSet.has(item.id),
                          )}
                          onChange={() => handleToggleHistorySelection(item.id)}
                        />
                      </td>
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
                      <td>
                        <div className="history-action-group">
                          <button
                            type="button"
                            className="view-history-btn download-errors-history-btn"
                            onClick={() =>
                              handleDownloadErrorRows({
                                rows: item.fileData ?? [],
                                fileName: item.fileName,
                              })
                            }
                            disabled={isDownloadErrorsDisabled}
                            title={
                              isDownloadErrorsDisabled
                                ? "This upload does not have saved error rows to download."
                                : `Download ${downloadableErrorCount} highlighted error row${
                                    downloadableErrorCount === 1 ? "" : "s"
                                  }`
                            }
                          >
                            <FiDownload />
                            Errors
                          </button>
                          <button
                            type="button"
                            className="view-history-btn redo-history-btn"
                            onClick={() => handleRedoUploadHistoryItem(item)}
                            disabled={isRedoDisabled}
                            title={
                              item.redoneAt
                                ? `Already redone on ${item.redoneAt}`
                                : redoableRecordCount === 0
                                  ? "This upload does not have saved grade rows to redo."
                                  : `Clear ${redoableRecordCount} uploaded grade${
                                      redoableRecordCount === 1 ? "" : "s"
                                    } from the portal`
                            }
                          >
                            {item.redoneAt ? "Redone" : "Redo"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="no-results">
                      No upload history found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div
            className="preview-pagination history-pagination"
            aria-label="Upload history pages"
          >
            <div className="preview-pagination-summary">
              Showing {historyRangeStart}-{historyRangeEnd} of{" "}
              {sortedUploadHistory.length} uploads
            </div>
            <div className="preview-pagination-controls">
              <button
                type="button"
                className="preview-page-btn"
                onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                disabled={currentHistoryPage === 1}
                aria-label="Previous history page"
              >
                <FiChevronLeft />
              </button>
              <span className="preview-page-indicator">
                Page {currentHistoryPage} of {historyPageCount}
              </span>
              <button
                type="button"
                className="preview-page-btn"
                onClick={() =>
                  setHistoryPage((prev) =>
                    Math.min(historyPageCount, prev + 1),
                  )
                }
                disabled={currentHistoryPage === historyPageCount}
                aria-label="Next history page"
              >
                <FiChevronRight />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
