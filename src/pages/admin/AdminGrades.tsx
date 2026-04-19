import { useState, useRef } from "react";
import { PiMicrosoftExcelLogo } from "react-icons/pi";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import {
  FiAlertCircle,
  FiCheck,
  FiDownload,
  FiMenu,
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
} from "../../services/adminStorage";
import {
  upsertStudentGradeRecordsForBranch,
  validateAndNormalizeUploadedGradeRow,
  type StoredStudentGradeRecord,
  type StudentGradeEvaluation,
  type StudentGradeProgramType,
} from "../../services/studentGrades";
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
  status: "Completed" | "Pending" | "Failed" | "Error";
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
  evaluation: StudentGradeEvaluation | "Invalid";
  status: "Valid" | "Error";
  errorReason: string;
  normalizedRecord?: StoredStudentGradeRecord;
}

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
}

interface TemplateSubjectAssignment {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
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

type WorksheetRow = Array<string | number | boolean | null | undefined>;

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

const normalizeUploadHistory = (
  history: UploadHistoryItem[],
): UploadHistoryItem[] =>
  history.map((item) => ({
    ...item,
    status:
      item.status === "Pending" || item.status === "Failed"
        ? item.status
        : item.errors > 0
          ? "Error"
          : "Completed",
  }));

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
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isReadyToUpload, setIsReadyToUpload] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
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
            return normalizeUploadHistory(parsed as UploadHistoryItem[]);
          }
        } catch (error) {
          console.error("Failed to load upload history", error);
        }
      }
      return normalizeUploadHistory(DEFAULT_UPLOAD_HISTORY);
    },
  );

  // Save upload history to localStorage
  const saveUploadHistory = (history: UploadHistoryItem[]) => {
    const normalizedHistory = normalizeUploadHistory(history);
    localStorage.setItem(
      UPLOAD_HISTORY_STORAGE_KEY,
      JSON.stringify(normalizedHistory),
    );
    setUploadHistory(normalizedHistory);
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

    if (normalized.includes("2nd") || normalized.includes("second")) {
      return "2nd Semester";
    }

    return "1st Semester";
  };

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

  const buildSectionTemplateRows = ({
    programType,
    students,
    assignments,
    subjectCatalog,
  }: {
    programType: StudentGradeProgramType;
    students: Array<{ id: string; name: string }>;
    assignments: TemplateSubjectAssignment[];
    subjectCatalog: TemplateSubjectCatalogItem[];
  }) => {
    if (students.length === 0) {
      return [] as string[][];
    }

    const unitsBySubjectKey = new Map<string, string>();

    subjectCatalog.forEach((subject) => {
      const unitsLabel =
        subject.units === undefined || subject.units === null
          ? ""
          : String(subject.units);

      unitsBySubjectKey.set(`id:${subject.id}`, unitsLabel);
      unitsBySubjectKey.set(`code:${subject.code.toUpperCase()}`, unitsLabel);
    });

    if (assignments.length === 0) {
      return students.map((student) => [
        student.id,
        student.name,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    }

    return students.flatMap((student) =>
      assignments.map((assignment) => {
        const units =
          unitsBySubjectKey.get(`id:${assignment.subjectId}`) ||
          unitsBySubjectKey.get(`code:${assignment.subjectCode.toUpperCase()}`) ||
          "";

        return programType === "College"
          ? [
              student.id,
              student.name,
              assignment.subjectCode,
              assignment.subjectName,
              units,
              "",
              "",
              assignment.instructorName || "",
              "",
              "",
            ]
          : [
              student.id,
              student.name,
              assignment.subjectCode,
              assignment.subjectName,
              "",
              "",
              "",
              assignment.instructorName || "",
              "",
              "",
            ];
      }),
    );
  };

  const getGeneratedTemplateSheets = (
    templateType: StudentGradeProgramType,
  ): GeneratedTemplateSheet[] => {
    const usedSheetNames = new Set<string>();
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
    const storedStudents = getStudentsForBranch(currentBranch);

    return storedSections
      .filter(
        (section) =>
          section.program === templateType && Boolean(section.code.trim()),
      )
      .sort(sortSectionsForTemplate)
      .map((section) => {
        const sectionStudents = storedStudents
          .filter(
            (student) =>
              student.program === templateType && student.section === section.code,
          )
          .sort(sortStudentsForTemplate);
        const sectionAssignments = storedAssignments
          .filter(
            (assignment) =>
              assignment.sectionId === section.id ||
              assignment.sectionCode === section.code,
          )
          .sort(sortAssignmentsForTemplate);
        const latestAcademicYear = getLatestAcademicYear(
          sectionAssignments.map((assignment) => assignment.academicYear),
        );
        const currentSectionAssignments = sectionAssignments.filter(
          (assignment) =>
            !assignment.academicYear ||
            assignment.academicYear.trim() === latestAcademicYear,
        );

        return {
          academicYear: latestAcademicYear,
          descriptor: getSectionAcademicDescriptor(section, sectionStudents),
          rows: buildSectionTemplateRows({
            programType: templateType,
            students: sectionStudents.map((student) => ({
              id: student.id,
              name: student.name,
            })),
            assignments: currentSectionAssignments,
            subjectCatalog: storedSubjects,
          }),
          sectionCode: section.code,
          semester:
            normalizeSemesterLabel(
              section.semester || currentSectionAssignments[0]?.semester,
            ) || "1st Semester",
          sheetName: getUniqueSheetName(section.code, usedSheetNames),
          yearLevel: section.yearLevel,
        };
      });
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

  const downloadOriginalTemplate = (templateType: StudentGradeProgramType) => {
    const template = TEMPLATE_DOWNLOADS[templateType];
    const downloadLink = document.createElement("a");

    downloadLink.href = template.href;
    downloadLink.download = template.fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
  };

  const buildStyledTemplateArchive = async (
    templateType: StudentGradeProgramType,
  ) => {
    const template = TEMPLATE_DOWNLOADS[templateType];
    const generatedSheets = getGeneratedTemplateSheets(templateType);

    if (generatedSheets.length === 0) {
      return {
        archive: null,
        generatedSheetCount: 0,
        matchedSectionCount: 0,
      };
    }

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
      matchedSectionCount: generatedSheets.length,
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
              })
            : { errorReason: "Program Type must be SHS or College" };
          const normalizedRecord = validationResult.normalizedRecord;

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
              : "Invalid",
            status: normalizedRecord ? "Valid" : "Error",
            errorReason: normalizedRecord
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
      return;
    }

    const normalizedName = file.name.replace(/\.[^/.]+$/, "");
    setPreviewFileName(normalizedName);

    try {
      const parsedRows = await parsePreviewRowsFromFile(file);
      setPreviewRows(parsedRows);
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
      const template = TEMPLATE_DOWNLOADS[templateType];
      const { archive, generatedSheetCount, matchedSectionCount } =
        await buildStyledTemplateArchive(templateType);

      if (matchedSectionCount === 0) {
        downloadOriginalTemplate(templateType);
        addToast(
          `No ${templateType} sections were found for ${currentBranch}, so the general template was downloaded.`,
          "warning",
        );
        return;
      }

      if (!archive) {
        throw new Error("Template archive was not generated.");
      }

      downloadBlob(template.fileName, archive);

      addToast(
        `${templateType} template downloaded with ${generatedSheetCount} section worksheet${generatedSheetCount === 1 ? "" : "s"}.`,
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
    const gradeRecordsToStore = previewRows
      .filter(
        (
          row,
        ): row is PreviewGradeRow & { normalizedRecord: StoredStudentGradeRecord } =>
          row.status === "Valid" && Boolean(row.normalizedRecord),
      )
      .map((row) => row.normalizedRecord);

    upsertStudentGradeRecordsForBranch(currentBranch, gradeRecordsToStore);

    const newHistoryItem: UploadHistoryItem = {
      fileName: normalizedName,
      dateUpload: uploadedAt,
      records: uploadedRecords,
      errors: errorRecords,
      status: errorRecords > 0 ? "Error" : "Completed",
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
        {isSidebarOpen ? "✕" : "☰"}
      </button>

      {/* Main content */}
      <main className="grades-content">
        <header className="page-header">
          <h1>Grades Management</h1>
          <p>
            Upload Excel files with student grades to update student records and
            grade history
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
                Note: Uploaded grades from every worksheet will be reflected in
                the student portal grades page for matching students in this
                branch.
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
                Your original Excel template design is preserved
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                One worksheet tab per existing section in this branch
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                Pre-filled student and subject rows when section assignments
                already exist
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                Section details, academic year, and semester metadata at the top
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                Multi-sheet upload support during import review
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                SHS uses quarterly grading (1st-4th Quarter)
              </li>
              <li>
                <IoMdCheckmarkCircleOutline className="list-icon success" />
                College supports semester or final grade uploads, including
                failed and INC grades
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

              <div className="preview-modal-body">
                <div className="preview-card">
                <div className="preview-header">
                  <div>
                    <h3>
                      {previewFileName ||
                        selectedFileName.replace(/\.[^/.]+$/, "")}
                    </h3>
                    <p>Review the grades before saving them for this branch</p>
                  </div>
                </div>

                <div className="preview-summary">
                  <div className="summary-item success">
                    <span className="summary-icon" aria-hidden="true">
                      <FiCheck />
                    </span>
                    <div>
                      <strong>Valid Records</strong>
                      <p>{uploadedRecords}</p>
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
                        <th>ACADEMIC YEAR</th>
                        <th>SEMESTER</th>
                        <th>GRADING PERIOD</th>
                        <th>PROGRAM</th>
                        <th>RESULT</th>
                        <th>STATUS</th>
                        <th>ERROR REASON</th>
                      </tr>
                    </thead>

                    <tbody>
                      {previewRows.length > 0 ? (
                        previewRows.map((row, index) => (
                          <tr key={`${row.sheetName}-${row.studentId}-${index}`}>
                            <td>{row.sheetName || "N/A"}</td>
                            <td>{row.studentId || "—"}</td>
                            <td>{row.fullName || "—"}</td>
                            <td>{row.subjectCode || "—"}</td>
                            <td>{row.subjectTitle || "—"}</td>
                            <td>{row.grade || "—"}</td>
                            <td>{row.unit || "—"}</td>
                            <td>{row.academicYear || "—"}</td>
                            <td>{row.semester || "—"}</td>
                            <td>{row.gradingPeriod || "—"}</td>
                            <td>{row.programType || "—"}</td>
                            <td>{row.evaluation}</td>
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
                          <td colSpan={14} className="no-results">
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
          </div>
        )}

        {/* Upload history */}
        <div className="history-card">
          <div className="history-header">
            <h3>Upload History</h3>
          </div>

          <div className="table-container history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className="history-table-sort-btn"
                      onClick={toggleFileNameSort}
                      data-sort-direction={sortDirection}
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
