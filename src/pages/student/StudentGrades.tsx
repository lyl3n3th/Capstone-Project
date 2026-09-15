import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaCalendarAlt,
  FaDownload,
  FaFilter,
  FaGraduationCap,
  FaLock,
} from "react-icons/fa";
import { IoDocumentText } from "react-icons/io5";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import StudentLoadingShell from "../../components/common/StudentLoadingShell";
import { ToastContainer } from "../../components/common/Toast";
import { useStudent } from "../../hooks/useStudent";
import aicsLogo from "../../assets/images/AICS_Logo.png";
import {
  fetchInstructorEvaluationSubmissions,
  INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT,
  readInstructorEvaluationSubmissions,
  type InstructorEvaluationSubmissionRecord,
  type StudentPortalSubject,
} from "../../services/adminStorage";
import { getCurrentTermEvaluationLockStatus } from "../../services/studentEvaluationLock";
import {
  fetchAndCacheStudentGradeRecordsForBranch,
  getRequiredShsQuarterLabelsForSemester,
  getStudentGradeRecords,
  STUDENT_GRADE_RECORDS_UPDATED_EVENT,
  type StoredStudentGradeRecord,
} from "../../services/studentGrades";
import "../../styles/main.css";

const semesterSortOrder = ["1st Semester", "2nd Semester", "Summer"];
const shsQuarterOrder = [
  "1st Quarter",
  "2nd Quarter",
  "3rd Quarter",
  "4th Quarter",
] as const;
const placeholderGrade = "-";
const lockedGradeValue = "Locked";
const studentGradeStorageKeyPrefix = "aics-admin:student-grades:";

type ShsQuarterLabel = (typeof shsQuarterOrder)[number];

interface DisplayGradeRow {
  id: string;
  subjectCode: string;
  subjectTitle: string;
  units: string;
  grade: string;
  remarks: string;
  instructor: string;
  firstQuarter: string;
  secondQuarter: string;
  thirdQuarter: string;
  fourthQuarter: string;
  semesterFinalGrade: string;
  status: string;
}

interface TableColumn {
  key: keyof DisplayGradeRow;
  label: string;
  cellClassName?: string;
}

const shsColumns: TableColumn[] = [
  {
    key: "subjectCode",
    label: "Subject Code",
    cellClassName: "s-subject-code",
  },
  {
    key: "subjectTitle",
    label: "Subject Title",
    cellClassName: "s-subject-title",
  },
  {
    key: "firstQuarter",
    label: "1st Quarter",
    cellClassName: "s-grade-value",
  },
  {
    key: "secondQuarter",
    label: "2nd Quarter",
    cellClassName: "s-grade-value",
  },
  {
    key: "thirdQuarter",
    label: "3rd Quarter",
    cellClassName: "s-grade-value",
  },
  {
    key: "fourthQuarter",
    label: "4th Quarter",
    cellClassName: "s-grade-value",
  },
  {
    key: "status",
    label: "Status",
    cellClassName: "s-grade-status-cell",
  },
];

const shsQuarterColumns: Record<ShsQuarterLabel, TableColumn> = {
  "1st Quarter": {
    key: "firstQuarter",
    label: "1st Quarter",
    cellClassName: "s-grade-value",
  },
  "2nd Quarter": {
    key: "secondQuarter",
    label: "2nd Quarter",
    cellClassName: "s-grade-value",
  },
  "3rd Quarter": {
    key: "thirdQuarter",
    label: "3rd Quarter",
    cellClassName: "s-grade-value",
  },
  "4th Quarter": {
    key: "fourthQuarter",
    label: "4th Quarter",
    cellClassName: "s-grade-value",
  },
};

const shsSemesterFinalGradeColumn: TableColumn = {
  key: "semesterFinalGrade",
  label: "Semester Final Grade",
  cellClassName: "s-grade-value",
};

const baseShsSubjectColumns = shsColumns.slice(0, 2);
const shsStatusColumn = shsColumns[shsColumns.length - 1];

const getShsQuarterLabelsForSemester = (semester: string) =>
  getRequiredShsQuarterLabelsForSemester(semester).filter(
    (label): label is ShsQuarterLabel =>
      shsQuarterOrder.includes(label as ShsQuarterLabel),
  );

const getShsColumnsForSemester = (semester: string): TableColumn[] => [
  ...baseShsSubjectColumns,
  ...getShsQuarterLabelsForSemester(semester).map(
    (quarterLabel) => shsQuarterColumns[quarterLabel],
  ),
  shsSemesterFinalGradeColumn,
  shsStatusColumn,
];

const getShsQuarterValueForLabel = (
  row: DisplayGradeRow,
  quarterLabel: ShsQuarterLabel,
) => {
  if (quarterLabel === "1st Quarter") return row.firstQuarter;
  if (quarterLabel === "2nd Quarter") return row.secondQuarter;
  if (quarterLabel === "3rd Quarter") return row.thirdQuarter;
  return row.fourthQuarter;
};

const collegeColumns: TableColumn[] = [
  {
    key: "subjectCode",
    label: "Subject Code",
    cellClassName: "s-subject-code",
  },
  {
    key: "subjectTitle",
    label: "Subject Title",
    cellClassName: "s-subject-title",
  },
  {
    key: "units",
    label: "Units",
    cellClassName: "s-grade-value",
  },
  {
    key: "grade",
    label: "Grades",
    cellClassName: "s-grade-value",
  },
  {
    key: "remarks",
    label: "Remarks",
    cellClassName: "s-grade-status-cell",
  },
  {
    key: "instructor",
    label: "Instructor",
    cellClassName: "s-instructor-name",
  },
];

const sortSemesters = (semesters: string[]) =>
  [...semesters].sort((left, right) => {
    const leftIndex = semesterSortOrder.indexOf(left);
    const rightIndex = semesterSortOrder.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });

const normalizeSemesterValue = (value?: string | null) =>
  (value || "").trim().toLowerCase();

const getDefaultAcademicYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const buildSubjectKey = ({
  subjectCode,
  subjectTitle,
}: Pick<DisplayGradeRow, "subjectCode" | "subjectTitle">) =>
  `${subjectCode.trim().toUpperCase()}::${subjectTitle.trim().toUpperCase()}`;

const buildSubjectCodeKey = (subjectCode: string) =>
  subjectCode.trim().toUpperCase();

const isGradeValueColumn = (columnKey: keyof DisplayGradeRow) =>
  [
    "grade",
    "firstQuarter",
    "secondQuarter",
    "thirdQuarter",
    "fourthQuarter",
    "semesterFinalGrade",
  ].includes(columnKey);

const createBaseRow = ({
  id,
  subjectCode,
  subjectTitle,
  units,
  instructor,
}: {
  id: string;
  subjectCode: string;
  subjectTitle: string;
  units?: number | string | null;
  instructor?: string | null;
}): DisplayGradeRow => ({
  id,
  subjectCode,
  subjectTitle,
  units:
    units === null || units === undefined || units === ""
      ? placeholderGrade
      : String(units),
  grade: placeholderGrade,
  remarks: "Enrolled",
  instructor: instructor && instructor.trim() !== "" ? instructor : "TBA",
  firstQuarter: placeholderGrade,
  secondQuarter: placeholderGrade,
  thirdQuarter: placeholderGrade,
  fourthQuarter: placeholderGrade,
  semesterFinalGrade: placeholderGrade,
  status: "Enrolled",
});

const parseGradeNumber = (value: string) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const getShsSemesterFinalGrade = (
  row: DisplayGradeRow,
  quarterLabels: ShsQuarterLabel[],
) => {
  const quarterGrades = quarterLabels.map((quarterLabel) =>
    parseGradeNumber(getShsQuarterValueForLabel(row, quarterLabel)),
  );

  if (
    quarterGrades.length === 0 ||
    quarterGrades.some((grade): grade is null => grade === null)
  ) {
    return placeholderGrade;
  }

  const numericQuarterGrades = quarterGrades as number[];
  const average =
    numericQuarterGrades.reduce((sum, grade) => sum + grade, 0) /
    numericQuarterGrades.length;

  return String(Math.floor(average));
};

const formatShsGeneralAverage = (rows: DisplayGradeRow[]) => {
  const finalGrades = rows
    .map((row) => parseGradeNumber(row.semesterFinalGrade))
    .filter((grade): grade is number => grade !== null);

  if (finalGrades.length === 0) {
    return placeholderGrade;
  }

  const average =
    finalGrades.reduce((sum, grade) => sum + grade, 0) / finalGrades.length;

  return average.toFixed(2);
};

const isCollegeFinalLikeRecord = (record: StoredStudentGradeRecord) => {
  const normalizedPeriod = record.gradingPeriod.trim().toLowerCase();
  const normalizedSemester = record.semester.trim().toLowerCase();

  return (
    normalizedPeriod === "overall" ||
    normalizedPeriod === "final" ||
    normalizedPeriod === normalizedSemester
  );
};

const getCollegeFinalRecordPriority = (record: StoredStudentGradeRecord) => {
  const normalizedPeriod = record.gradingPeriod.trim().toLowerCase();
  const normalizedSemester = record.semester.trim().toLowerCase();

  if (normalizedPeriod === "overall") {
    return 3;
  }

  if (normalizedPeriod === normalizedSemester) {
    return 2;
  }

  if (normalizedPeriod === "final") {
    return 1;
  }

  return 0;
};

const getCollegeDisplayedGradePriority = (record: StoredStudentGradeRecord) => {
  const normalizedPeriod = record.gradingPeriod.trim().toLowerCase();
  const normalizedSemester = record.semester.trim().toLowerCase();

  if (normalizedPeriod === "overall") {
    return 6;
  }

  if (normalizedPeriod === normalizedSemester) {
    return 5;
  }

  if (normalizedPeriod === "final") {
    return 4;
  }

  if (normalizedPeriod === "prefinal") {
    return 3;
  }

  if (normalizedPeriod === "midterm") {
    return 2;
  }

  if (normalizedPeriod === "prelim") {
    return 1;
  }

  return 0;
};

const parseUnitsValue = (value?: number | string | null) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const getCollegeTerminalRecordMap = (gradeRecords: StoredStudentGradeRecord[]) => {
  const terminalRecords = new Map<string, StoredStudentGradeRecord>();

  gradeRecords.forEach((record) => {
    if (!isCollegeFinalLikeRecord(record)) {
      return;
    }

    const key = buildSubjectKey({
      subjectCode: record.subjectCode,
      subjectTitle: record.subjectTitle,
    });
    const currentRecord = terminalRecords.get(key);

    if (
      !currentRecord ||
      getCollegeFinalRecordPriority(record) >=
        getCollegeFinalRecordPriority(currentRecord)
    ) {
      terminalRecords.set(key, record);
    }
  });

  return terminalRecords;
};

const buildCollegePerformanceSummary = (
  subjects: StudentPortalSubject[],
  gradeRecords: StoredStudentGradeRecord[],
) => {
  const subjectUnitsByKey = new Map<string, number>();
  let totalUnitsEarned = 0;
  let weightedGradeTotal = 0;
  let weightedGradeUnits = 0;

  subjects.forEach((subject) => {
    const parsedUnits = parseUnitsValue(subject.units);

    if (parsedUnits === null) {
      return;
    }

    subjectUnitsByKey.set(
      buildSubjectKey({
        subjectCode: subject.code,
        subjectTitle: subject.title,
      }),
      parsedUnits,
    );
  });

  getCollegeTerminalRecordMap(gradeRecords).forEach((record, key) => {
    const resolvedUnits =
      parseUnitsValue(record.units) ?? subjectUnitsByKey.get(key) ?? null;

    if (resolvedUnits === null) {
      return;
    }

    if (record.evaluation === "Passed") {
      totalUnitsEarned += resolvedUnits;
    }

    if (
      record.numericGrade !== null &&
      record.normalizedGrade !== "5.0" &&
      record.numericGrade >= 0 &&
      record.numericGrade <= 100
    ) {
      weightedGradeTotal += record.numericGrade * resolvedUnits;
      weightedGradeUnits += resolvedUnits;
    }
  });

  return {
    totalUnitsEarned,
    gpa:
      weightedGradeUnits > 0
        ? (weightedGradeTotal / weightedGradeUnits).toFixed(2)
        : placeholderGrade,
  };
};

const sortDisplayRows = (rows: DisplayGradeRow[]) =>
  [...rows].sort(
    (left, right) =>
      left.subjectCode.localeCompare(right.subjectCode) ||
      left.subjectTitle.localeCompare(right.subjectTitle),
  );

const buildShsRows = (
  subjects: StudentPortalSubject[],
  gradeRecords: StoredStudentGradeRecord[],
  semester: string,
) => {
  const rows = new Map<string, DisplayGradeRow>();
  const semesterQuarterLabels = getShsQuarterLabelsForSemester(semester);

  subjects.forEach((subject) => {
    const row = createBaseRow({
      id: subject.id,
      subjectCode: subject.code,
      subjectTitle: subject.title,
      units: subject.units,
      instructor: subject.professor,
    });

    rows.set(buildSubjectKey(row), row);
  });

  const subjectKeyByCode = new Map(
    Array.from(rows.entries()).map(([key, row]) => [
      buildSubjectCodeKey(row.subjectCode),
      key,
    ]),
  );

  gradeRecords.forEach((record) => {
    const quarterLabel = record.gradingPeriod as ShsQuarterLabel;

    if (!shsQuarterOrder.includes(quarterLabel)) {
      return;
    }

    if (!semesterQuarterLabels.includes(quarterLabel)) {
      return;
    }

    const exactKey = buildSubjectKey({
      subjectCode: record.subjectCode,
      subjectTitle: record.subjectTitle,
    });
    const key =
      rows.has(exactKey)
        ? exactKey
        : subjectKeyByCode.get(buildSubjectCodeKey(record.subjectCode)) ??
          exactKey;
    const existingRow =
      rows.get(key) ??
      createBaseRow({
        id: record.id,
        subjectCode: record.subjectCode,
        subjectTitle: record.subjectTitle,
        units: record.units,
      });

    if (quarterLabel === "1st Quarter") {
      existingRow.firstQuarter = record.normalizedGrade;
    }

    if (quarterLabel === "2nd Quarter") {
      existingRow.secondQuarter = record.normalizedGrade;
    }

    if (quarterLabel === "3rd Quarter") {
      existingRow.thirdQuarter = record.normalizedGrade;
    }

    if (quarterLabel === "4th Quarter") {
      existingRow.fourthQuarter = record.normalizedGrade;
    }

    rows.set(key, existingRow);
  });

  return sortDisplayRows(
    Array.from(rows.values()).map((row) => {
      const postedQuarterCount = semesterQuarterLabels.filter(
        (quarterLabel) =>
          getShsQuarterValueForLabel(row, quarterLabel) !== placeholderGrade,
      ).length;
      const semesterFinalGrade = getShsSemesterFinalGrade(
        row,
        semesterQuarterLabels,
      );

      if (postedQuarterCount === 0) {
        return row;
      }

      return {
        ...row,
        semesterFinalGrade,
        status:
          postedQuarterCount === semesterQuarterLabels.length
            ? "Complete"
            : "Partially Posted",
      };
    }),
  );
};

const buildCollegeRows = (
  subjects: StudentPortalSubject[],
  gradeRecords: StoredStudentGradeRecord[],
) => {
  const rows = new Map<string, DisplayGradeRow>();
  const displayedGrades = new Map<
    string,
    { grade: string; priority: number }
  >();
  const finalEvaluations = new Map<
    string,
    { evaluation: StoredStudentGradeRecord["evaluation"]; priority: number }
  >();

  subjects.forEach((subject) => {
    const row = createBaseRow({
      id: subject.id,
      subjectCode: subject.code,
      subjectTitle: subject.title,
      units: subject.units,
      instructor: subject.professor,
    });

    rows.set(buildSubjectKey(row), row);
  });

  const subjectKeyByCode = new Map(
    Array.from(rows.entries()).map(([key, row]) => [
      buildSubjectCodeKey(row.subjectCode),
      key,
    ]),
  );

  gradeRecords.forEach((record) => {
    const exactKey = buildSubjectKey({
      subjectCode: record.subjectCode,
      subjectTitle: record.subjectTitle,
    });
    const key =
      rows.has(exactKey)
        ? exactKey
        : subjectKeyByCode.get(buildSubjectCodeKey(record.subjectCode)) ??
          exactKey;
    const existingRow =
      rows.get(key) ??
      createBaseRow({
        id: record.id,
        subjectCode: record.subjectCode,
        subjectTitle: record.subjectTitle,
        units: record.units,
        instructor: undefined,
      });

    if (existingRow.units === placeholderGrade && record.units !== null) {
      existingRow.units = String(record.units);
    }

    const nextDisplayedGradePriority = getCollegeDisplayedGradePriority(record);
    const currentDisplayedGrade = displayedGrades.get(key);
    if (
      nextDisplayedGradePriority > 0 &&
      (!currentDisplayedGrade ||
        nextDisplayedGradePriority >= currentDisplayedGrade.priority)
    ) {
      existingRow.grade = record.normalizedGrade;
      displayedGrades.set(key, {
        grade: record.normalizedGrade,
        priority: nextDisplayedGradePriority,
      });
    }

    if (isCollegeFinalLikeRecord(record)) {
      const nextPriority = getCollegeFinalRecordPriority(record);
      const currentFinalEvaluation = finalEvaluations.get(key);

      if (
        !currentFinalEvaluation ||
        nextPriority >= currentFinalEvaluation.priority
      ) {
        finalEvaluations.set(key, {
          evaluation: record.evaluation,
          priority: nextPriority,
        });
      }
    }

    rows.set(key, existingRow);
  });

  return sortDisplayRows(
    Array.from(rows.entries()).map(([key, row]) => {
      const displayedGrade = displayedGrades.get(key);
      const finalEvaluation = finalEvaluations.get(key);
      const hasAnyPostedGrade = Boolean(displayedGrade);

      if (!hasAnyPostedGrade) {
        return row;
      }

      return {
        ...row,
        grade: displayedGrade?.grade ?? row.grade,
        remarks: finalEvaluation?.evaluation ?? "Partially Posted",
        status: finalEvaluation?.evaluation ?? "Partially Posted",
      };
    }),
  );
};

const getStatusToneClassName = (status: string) => {
  const normalizedStatus = status.trim().toLowerCase();

  if (normalizedStatus === "passed" || normalizedStatus === "complete") {
    return "success";
  }

  if (normalizedStatus === "failed" || normalizedStatus === "incomplete") {
    return "danger";
  }

  if (normalizedStatus === "partially posted") {
    return "info";
  }

  return "neutral";
};

const normalizeReportFilePart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report-card";

const sanitizePdfText = (value: string | number | null | undefined) =>
  String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapePdfText = (value: string | number | null | undefined) =>
  sanitizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const wrapPdfText = (value: string, maxChars: number) => {
  const words = sanitizePdfText(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    if (!currentLine) {
      currentLine = word;
      return;
    }

    if (`${currentLine} ${word}`.length <= maxChars) {
      currentLine = `${currentLine} ${word}`;
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
};

type PdfObjectChunk = string | ArrayBuffer;

interface PdfImageResource {
  name: string;
  width: number;
  height: number;
  data: ArrayBuffer;
}

const getPdfChunkLength = (chunk: PdfObjectChunk, encoder: TextEncoder) =>
  typeof chunk === "string" ? encoder.encode(chunk).length : chunk.byteLength;

const getImageDataUrlBytes = (dataUrl: string) => {
  const [, base64Value = ""] = dataUrl.split(",");
  const binaryValue = window.atob(base64Value);
  const buffer = new ArrayBuffer(binaryValue.length);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < binaryValue.length; index += 1) {
    bytes[index] = binaryValue.charCodeAt(index);
  }

  return buffer;
};

const loadPdfJpegImage = (imageUrl: string, name: string) =>
  new Promise<PdfImageResource>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Unable to prepare report card logo."));
        return;
      }

      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      resolve({
        name,
        width: canvas.width,
        height: canvas.height,
        data: getImageDataUrlBytes(canvas.toDataURL("image/jpeg", 0.92)),
      });
    };
    image.onerror = () => reject(new Error("Unable to load report card logo."));
    image.src = imageUrl;
  });

const buildPdfDocument = (
  pageContents: string[],
  imageResources: PdfImageResource[] = [],
  pageSize = { width: 842, height: 595 },
) => {
  const encoder = new TextEncoder();
  const objects: PdfObjectChunk[][] = [];
  const addObject = (content: PdfObjectChunk | PdfObjectChunk[]) => {
    objects.push(Array.isArray(content) ? content : [content]);
    return objects.length;
  };
  const fontObjectId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const imageObjectIds = imageResources.map((imageResource) =>
    addObject([
      `<< /Type /XObject /Subtype /Image /Width ${imageResource.width} /Height ${imageResource.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageResource.data.byteLength} >>\nstream\n`,
      imageResource.data,
      "\nendstream",
    ]),
  );
  const pageObjectIds: number[] = [];
  const imageResourceDictionary =
    imageResources.length > 0
      ? ` /XObject << ${imageResources
          .map(
            (imageResource, index) =>
              `/${imageResource.name} ${imageObjectIds[index]} 0 R`,
          )
          .join(" ")} >>`
      : "";

  pageContents.forEach((content) => {
    const contentLength = encoder.encode(content).length;
    const contentObjectId = addObject(
      `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`,
    );
    const pageObjectId = addObject(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageSize.width} ${pageSize.height}] /Resources << /Font << /F1 ${fontObjectId} 0 R >>${imageResourceDictionary} >> /Contents ${contentObjectId} 0 R >>`,
    );
    pageObjectIds.push(pageObjectId);
  });

  const pagesObjectId = addObject(
    `<< /Type /Pages /Kids [${pageObjectIds
      .map((pageObjectId) => `${pageObjectId} 0 R`)
      .join(" ")}] /Count ${pageObjectIds.length} >>`,
  );
  const catalogObjectId = addObject(
    `<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`,
  );

  pageObjectIds.forEach((pageObjectId) => {
    objects[pageObjectId - 1] = objects[pageObjectId - 1].map((chunk) =>
      typeof chunk === "string"
        ? chunk.replace("/Parent 0 0 R", `/Parent ${pagesObjectId} 0 R`)
        : chunk,
    );
  });

  const chunks: PdfObjectChunk[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let byteOffset = encoder.encode("%PDF-1.4\n").length;
  const pushChunk = (chunk: PdfObjectChunk) => {
    chunks.push(chunk);
    byteOffset += getPdfChunkLength(chunk, encoder);
  };

  objects.forEach((objectContent, index) => {
    offsets.push(byteOffset);
    pushChunk(`${index + 1} 0 obj\n`);
    objectContent.forEach((chunk) => pushChunk(chunk));
    pushChunk("\nendobj\n");
  });

  const xrefOffset = byteOffset;
  const xrefEntries = offsets
    .map((offset, index) =>
      index === 0
        ? "0000000000 65535 f "
        : `${offset.toString().padStart(10, "0")} 00000 n `,
    )
    .join("\n");
  chunks.push(
    `xref\n0 ${objects.length + 1}\n${xrefEntries}\ntrailer\n<< /Size ${
      objects.length + 1
    } /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  );

  return new Blob(chunks, { type: "application/pdf" });
};

const buildReportCardPdf = async ({
  studentName,
  studentNumber,
  program,
  academicYear,
  semester,
  columns,
  rows,
  isSHS,
  totalUnits,
  totalUnitsEarned,
  gpa,
  shsGeneralAverage,
}: {
  studentName: string;
  studentNumber: string;
  program: string;
  academicYear: string;
  semester: string;
  columns: TableColumn[];
  rows: DisplayGradeRow[];
  isSHS: boolean;
  totalUnits: number;
  totalUnitsEarned?: number;
  gpa?: string;
  shsGeneralAverage?: string;
}) => {
  const summaryItems = [
    ["Subjects Listed", rows.length],
    ...(isSHS
      ? [["General Average for the Semester", shsGeneralAverage || placeholderGrade]]
      : [
          ["Total Units", totalUnits],
          ["Total Units Earned", totalUnitsEarned ?? 0],
          ["GPA", gpa || placeholderGrade],
        ]),
  ];
  const pageContents: string[][] = [[]];
  const pageWidth = isSHS ? 595 : 842;
  const pageHeight = isSHS ? 842 : 595;
  const margin = 26;
  const contentWidth = pageWidth - margin * 2;
  const rowPadding = 7;
  const lineHeight = 10.5;
  const columnWidths = isSHS
    ? [78, 195, 55, 55, 100, 60]
    : [120, 260, 62, 78, 92, 178];
  const logoResource = await loadPdfJpegImage(aicsLogo, "AicsLogo");
  let currentPage = 0;
  let y = pageHeight - margin;

  const commands = () => pageContents[currentPage];
  const add = (command: string) => commands().push(command);
  type PdfColor = [number, number, number];
  const textColor: PdfColor = [0.06, 0.09, 0.14];
  const mutedColor: PdfColor = [0.16, 0.22, 0.31];
  const brandColor: PdfColor = [0.02, 0.38, 0.53];
  const headerFillColor: PdfColor = [0.91, 0.96, 0.98];
  const softFillColor: PdfColor = [0.97, 0.98, 0.99];
  const gridColor: PdfColor = [0.82, 0.87, 0.91];
  const color = ([red, green, blue]: PdfColor) => `${red} ${green} ${blue}`;
  const text = (
    value: string | number,
    x: number,
    textY: number,
    size = 10,
    fillColor: PdfColor = textColor,
  ) => {
    add(
      `${color(fillColor)} rg BT /F1 ${size} Tf ${x} ${textY} Td (${escapePdfText(
        value,
      )}) Tj ET`,
    );
  };
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    strokeColor: PdfColor = gridColor,
    width = 0.8,
  ) => {
    add(`${color(strokeColor)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  };
  const rect = (
    x: number,
    rectY: number,
    width: number,
    height: number,
    options: { fill?: PdfColor; stroke?: PdfColor; strokeWidth?: number } = {},
  ) => {
    if (options.fill) {
      add(`${color(options.fill)} rg ${x} ${rectY} ${width} ${height} re f`);
    }

    add(
      `${color(options.stroke ?? gridColor)} RG ${options.strokeWidth ?? 0.6} w ${x} ${rectY} ${width} ${height} re S`,
    );
  };
  const image = (
    imageName: string,
    x: number,
    imageY: number,
    width: number,
    height: number,
  ) => {
    add(`q ${width} 0 0 ${height} ${x} ${imageY} cm /${imageName} Do Q`);
  };
  const startPage = (continued = false) => {
    if (continued) {
      pageContents.push([]);
      currentPage += 1;
    }

    y = pageHeight - margin;
    text(
      continued ? "Student Report Card (continued)" : "Student Report Card",
      margin,
      y - 10,
      18,
      brandColor,
    );
    text(`${academicYear} | ${semester}`, margin, y - 34, 10, textColor);
    const logoHeight = 46;
    const logoWidth = (logoResource.width / logoResource.height) * logoHeight;
    image(
      logoResource.name,
      pageWidth - margin - logoWidth,
      pageHeight - margin - logoHeight + 2,
      logoWidth,
      logoHeight,
    );
    line(margin, y - 56, pageWidth - margin, y - 56, brandColor, 1.1);
    y -= 86;
  };
  const drawTableHeader = () => {
    let x = margin;
    const headerHeight = isSHS ? 34 : 26;

    columns.forEach((column, index) => {
      const width = columnWidths[index] ?? 80;
      const headerLines = wrapPdfText(
        column.label,
        Math.max(8, Math.floor(width / 4.6)),
      );

      rect(x, y - headerHeight, width, headerHeight, {
        fill: headerFillColor,
        stroke: gridColor,
      });
      headerLines.forEach((headerLine, lineIndex) => {
        text(
          headerLine,
          x + 8,
          y - 17 - lineIndex * 9,
          8,
          [0.01, 0.16, 0.28],
        );
      });
      x += columnWidths[index] ?? 80;
    });
    y -= headerHeight;
  };
  const drawMeta = () => {
    const rightColumnX = margin + contentWidth / 2 + 10;

    text(`Student: ${studentName}`, margin, y, 9, mutedColor);
    text(`Student Number: ${studentNumber || "N/A"}`, rightColumnX, y, 9, mutedColor);
    y -= 20;
    text(`Program: ${program || "N/A"}`, margin, y, 9, mutedColor);
    text(`Term: ${semester}`, rightColumnX, y, 9, mutedColor);
    y -= 30;
  };
  const drawSummary = () => {
    const boxGap = 10;
    const boxHeight = 30;
    const boxWidth =
      (contentWidth - boxGap * Math.max(0, summaryItems.length - 1)) /
      Math.max(1, summaryItems.length);

    y -= 18;

    if (y - boxHeight < margin + 44) {
      startPage(true);
      y -= 6;
    }

    summaryItems.forEach(([label, value], index) => {
      const x = margin + index * (boxWidth + boxGap);

      rect(x, y - boxHeight, boxWidth, boxHeight, {
        fill: softFillColor,
        stroke: gridColor,
      });
      text(`${label}: ${value}`, x + 10, y - 19, 9, mutedColor);
    });
    y -= boxHeight;
  };

  startPage();
  drawMeta();
  drawTableHeader();

  const tableRows =
    rows.length > 0
      ? rows
      : [
          createBaseRow({
            id: "empty-report-card-row",
            subjectCode: "",
            subjectTitle: "No grades available for this term.",
          }),
        ];

  tableRows.forEach((row) => {
    const wrappedCells = columns.map((column, index) => {
      const width = columnWidths[index] ?? 80;
      return wrapPdfText(String(row[column.key]), Math.max(8, Math.floor(width / 5)));
    });
    const rowHeight =
      Math.max(...wrappedCells.map((cellLines) => cellLines.length)) * lineHeight +
      rowPadding * 2;

    if (y - rowHeight < margin + 70) {
      startPage(true);
      drawTableHeader();
    }

    let x = margin;
    wrappedCells.forEach((cellLines, index) => {
      const width = columnWidths[index] ?? 80;
      rect(x, y - rowHeight, width, rowHeight, {
        stroke: gridColor,
      });
      cellLines.forEach((cellLine, lineIndex) => {
        text(
          cellLine,
          x + 8,
          y - rowPadding - 8 - lineIndex * lineHeight,
          8.5,
          textColor,
        );
      });
      x += width;
    });
    y -= rowHeight;
  });

  if (y < margin + 80) {
    startPage(true);
  }

  drawSummary();
  text(
    "Generated from the AICS student portal.",
    pageWidth - margin - 194,
    margin + 12,
    7,
    mutedColor,
  );

  return buildPdfDocument(pageContents.map((content) => content.join("\n")), [
    logoResource,
  ], { width: pageWidth, height: pageHeight });
};

const useToast = () => {
  const toastCounterRef = useRef(0);
  const [toasts, setToasts] = useState<
    Array<{
      id: string;
      message: string;
      type: "success" | "error" | "info" | "warning";
    }>
  >([]);

  const addToast = (
    message: string,
    type: "success" | "error" | "info" | "warning",
  ) => {
    toastCounterRef.current += 1;
    const id = `student-grades-toast-${toastCounterRef.current}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return { toasts, addToast, removeToast };
};

function StudentGrades() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [gradeRecordsVersion, setGradeRecordsVersion] = useState(0);
  const [evaluationSubmissions, setEvaluationSubmissions] = useState<
    InstructorEvaluationSubmissionRecord[]
  >([]);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { toasts, addToast, removeToast } = useToast();

  const { student, subjects, currentTerm, isLoading } = useStudent();
  const isSHS = student?.programType === "SHS";

  useEffect(() => {
    if (!student?.branch) {
      return;
    }

    void fetchAndCacheStudentGradeRecordsForBranch(student.branch)
      .then(() => setGradeRecordsVersion((previousValue) => previousValue + 1))
      .catch((error) => {
        console.warn("Unable to load student grades from Supabase.", error);
      });
  }, [student?.branch]);

  const studentGradeRecords = useMemo(
    () =>
      student?.studentNumber
        ? getStudentGradeRecords({
            branch: student.branch,
            studentId: student.studentNumber,
          }).filter(
            (record) => record.programType === (isSHS ? "SHS" : "College"),
          )
        : [],
    [gradeRecordsVersion, isSHS, student],
  );

  useEffect(() => {
    const refreshStudentGrades = () => {
      setGradeRecordsVersion((previousValue) => previousValue + 1);
    };

    const handleStorageUpdate = (event: StorageEvent) => {
      if (!event.key?.startsWith(studentGradeStorageKeyPrefix)) {
        return;
      }

      refreshStudentGrades();
    };

    window.addEventListener(
      STUDENT_GRADE_RECORDS_UPDATED_EVENT,
      refreshStudentGrades,
    );
    window.addEventListener("storage", handleStorageUpdate);

    return () => {
      window.removeEventListener(
        STUDENT_GRADE_RECORDS_UPDATED_EVENT,
        refreshStudentGrades,
      );
      window.removeEventListener("storage", handleStorageUpdate);
    };
  }, []);

  useEffect(() => {
    const syncEvaluationSubmissions = () => {
      setEvaluationSubmissions(readInstructorEvaluationSubmissions(student?.branch));

      if (!student?.branch) {
        return;
      }

      void fetchInstructorEvaluationSubmissions(student.branch)
        .then(setEvaluationSubmissions)
        .catch((error) => {
          console.warn("Failed to sync evaluation submissions.", error);
        });
    };

    syncEvaluationSubmissions();

    window.addEventListener("storage", syncEvaluationSubmissions);
    window.addEventListener(
      INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT,
      syncEvaluationSubmissions,
    );

    return () => {
      window.removeEventListener("storage", syncEvaluationSubmissions);
      window.removeEventListener(
        INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT,
        syncEvaluationSubmissions,
      );
    };
  }, [student?.branch]);

  const availableAcademicYears = useMemo(() => {
    const years = new Set<string>();

    if (currentTerm?.academicYear) {
      years.add(currentTerm.academicYear);
    }

    subjects.forEach((subject) => {
      if (subject.academicYear) {
        years.add(subject.academicYear);
      }
    });

    studentGradeRecords.forEach((record) => {
      if (record.academicYear) {
        years.add(record.academicYear);
      }
    });

    return Array.from(years).sort((left, right) => right.localeCompare(left));
  }, [currentTerm, studentGradeRecords, subjects]);

  const fallbackAcademicYear =
    currentTerm?.academicYear ||
    subjects[0]?.academicYear ||
    studentGradeRecords[0]?.academicYear ||
    getDefaultAcademicYear();

  const effectiveAcademicYear =
    selectedAcademicYear &&
    availableAcademicYears.includes(selectedAcademicYear)
      ? selectedAcademicYear
      : currentTerm?.academicYear &&
          availableAcademicYears.includes(currentTerm.academicYear)
        ? currentTerm.academicYear
        : availableAcademicYears[0] || fallbackAcademicYear;

  const availableSemesters = useMemo(() => {
    const semesters = new Set<string>();

    if (
      currentTerm?.semester &&
      currentTerm.academicYear === effectiveAcademicYear
    ) {
      semesters.add(currentTerm.semester);
    }

    subjects
      .filter((subject) => subject.academicYear === effectiveAcademicYear)
      .forEach((subject) => {
        if (subject.semester) {
          semesters.add(subject.semester);
        }
      });

    studentGradeRecords
      .filter((record) => record.academicYear === effectiveAcademicYear)
      .forEach((record) => {
        if (record.semester) {
          semesters.add(record.semester);
        }
      });

    return sortSemesters(Array.from(semesters));
  }, [
    currentTerm,
    effectiveAcademicYear,
    studentGradeRecords,
    subjects,
  ]);

  const fallbackSemester =
    (currentTerm?.academicYear === effectiveAcademicYear
      ? currentTerm.semester
      : undefined) ||
    subjects.find((subject) => subject.academicYear === effectiveAcademicYear)
      ?.semester ||
    studentGradeRecords.find(
      (record) => record.academicYear === effectiveAcademicYear,
    )?.semester ||
    "1st Semester";

  const effectiveSemester =
    selectedSemester && availableSemesters.includes(selectedSemester)
      ? selectedSemester
      : currentTerm?.academicYear === effectiveAcademicYear &&
          currentTerm?.semester &&
          availableSemesters.includes(currentTerm.semester)
        ? currentTerm.semester
        : availableSemesters[0] || fallbackSemester;
  const isViewingCurrentTerm =
    Boolean(currentTerm?.academicYear && currentTerm?.semester) &&
    effectiveAcademicYear === currentTerm?.academicYear &&
    normalizeSemesterValue(effectiveSemester) ===
      normalizeSemesterValue(currentTerm?.semester);
  const evaluationLockStatus = getCurrentTermEvaluationLockStatus({
    student,
    subjects,
    currentTerm,
    submissions: evaluationSubmissions,
  });
  const areCurrentTermGradesLocked =
    isViewingCurrentTerm && evaluationLockStatus.isLocked;

  const ownScheduleAcademicYear =
    student?.ownScheduleAcademicYear || currentTerm?.academicYear;
  const ownScheduleSemester =
    student?.ownScheduleSemester || currentTerm?.semester;
  const isOwnScheduleTerm = Boolean(
    (student?.requestedOwnSchedule ||
      student?.ownScheduleRequestStatus === "Approved") &&
      ownScheduleAcademicYear &&
      ownScheduleSemester &&
      effectiveAcademicYear === ownScheduleAcademicYear &&
      normalizeSemesterValue(effectiveSemester) ===
        normalizeSemesterValue(ownScheduleSemester),
  );
  const matchingTermSubjects = useMemo(
    () =>
      subjects.filter(
        (subject) =>
          subject.academicYear === effectiveAcademicYear &&
          subject.semester === effectiveSemester,
      ),
    [effectiveAcademicYear, effectiveSemester, subjects],
  );
  const canShowOwnScheduleGradeSubjects =
    !isOwnScheduleTerm ||
    student?.ownScheduleSelectionStatus === "Approved" ||
    matchingTermSubjects.length > 0;

  const termSubjects = useMemo(
    () => (canShowOwnScheduleGradeSubjects ? matchingTermSubjects : []),
    [canShowOwnScheduleGradeSubjects, matchingTermSubjects],
  );

  const termGradeRecords = useMemo(
    () => {
      const termSubjectKeys = new Set(
        termSubjects.map((subject) =>
          buildSubjectKey({
            subjectCode: subject.code,
            subjectTitle: subject.title,
          }),
        ),
      );
      const termSubjectCodeKeys = new Set(
        termSubjects.map((subject) => buildSubjectCodeKey(subject.code)),
      );

      return studentGradeRecords.filter((record) => {
        const matchesTerm =
          record.academicYear === effectiveAcademicYear &&
          normalizeSemesterValue(record.semester) ===
            normalizeSemesterValue(effectiveSemester);

        if (!matchesTerm) {
          return false;
        }

        if (!isOwnScheduleTerm) {
          return true;
        }

        if (termSubjects.length === 0) {
          return canShowOwnScheduleGradeSubjects;
        }

        const exactSubjectKey = buildSubjectKey({
          subjectCode: record.subjectCode,
          subjectTitle: record.subjectTitle,
        });

        return (
          termSubjectKeys.has(exactSubjectKey) ||
          termSubjectCodeKeys.has(buildSubjectCodeKey(record.subjectCode))
        );
      });
    },
    [
      effectiveAcademicYear,
      effectiveSemester,
      canShowOwnScheduleGradeSubjects,
      isOwnScheduleTerm,
      studentGradeRecords,
      termSubjects,
    ],
  );

  const displayRows = useMemo(
    () =>
      isSHS
        ? buildShsRows(termSubjects, termGradeRecords, effectiveSemester)
        : buildCollegeRows(termSubjects, termGradeRecords),
    [effectiveSemester, isSHS, termGradeRecords, termSubjects],
  );

  const tableColumns = isSHS
    ? getShsColumnsForSemester(effectiveSemester)
    : collegeColumns;
  const activeShsQuarterLabels = isSHS
    ? getShsQuarterLabelsForSemester(effectiveSemester)
    : [];
  const shsGeneralAverage = useMemo(
    () => (isSHS ? formatShsGeneralAverage(displayRows) : placeholderGrade),
    [displayRows, isSHS],
  );

  const subjectsWithPostedGradesCount = useMemo(
    () =>
      displayRows.filter((row) =>
        isSHS
          ? activeShsQuarterLabels.some(
              (quarterLabel) =>
                getShsQuarterValueForLabel(row, quarterLabel) !==
                placeholderGrade,
            )
          : row.grade !== placeholderGrade,
      ).length,
    [activeShsQuarterLabels, displayRows, isSHS],
  );

  const totalUnits = useMemo(
    () =>
      displayRows.reduce((sum, row) => {
        const parsedUnits = Number(row.units);
        return Number.isFinite(parsedUnits) ? sum + parsedUnits : sum;
      }, 0),
    [displayRows],
  );

  const collegePerformanceSummary = useMemo(
    () =>
      isSHS
        ? null
        : buildCollegePerformanceSummary(termSubjects, termGradeRecords),
    [isSHS, termGradeRecords, termSubjects],
  );

  const handleMenuClick = () => {
    setSidebarOpen((prev) => !prev);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  const handleFilter = () => {
    setShowFilters((prev) => !prev);
    addToast(
      showFilters ? "Filter panel closed" : "Filter panel opened",
      "info",
    );
  };

  const handleGenerateReportCard = async () => {
    if (!student) {
      addToast("Student profile is still loading.", "warning");
      return;
    }

    try {
      const studentName = `${student.firstName} ${student.lastName}`.trim();
      const reportRows = areCurrentTermGradesLocked
        ? displayRows.map((row) => ({
            ...row,
            grade: lockedGradeValue,
            firstQuarter: lockedGradeValue,
            secondQuarter: lockedGradeValue,
            thirdQuarter: lockedGradeValue,
            fourthQuarter: lockedGradeValue,
            semesterFinalGrade: lockedGradeValue,
          }))
        : displayRows;
      const reportPdf = await buildReportCardPdf({
        studentName,
        studentNumber: student.studentNumber || "",
        program: student.program || student.programType || "",
        academicYear: effectiveAcademicYear,
        semester: effectiveSemester,
        columns: tableColumns,
        rows: reportRows,
        isSHS: Boolean(isSHS),
        totalUnits,
        totalUnitsEarned: collegePerformanceSummary?.totalUnitsEarned,
        gpa: collegePerformanceSummary?.gpa,
        shsGeneralAverage: areCurrentTermGradesLocked
          ? lockedGradeValue
          : shsGeneralAverage,
      });
      const url = URL.createObjectURL(reportPdf);
      const reportWindow = window.open(url, "_blank", "noopener,noreferrer");
      const anchor = document.createElement("a");
      const fileName = [
        "report-card",
        normalizeReportFilePart(student.studentNumber || studentName),
        normalizeReportFilePart(effectiveAcademicYear),
        normalizeReportFilePart(effectiveSemester),
      ].join("-");

      anchor.href = url;
      anchor.download = `${fileName}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);

      addToast(
        reportWindow
          ? "PDF report card opened and downloaded."
          : "PDF report card downloaded. Allow pop-ups to preview it in a new tab.",
        "success",
      );
    } catch (error) {
      console.error(error);
      addToast("Unable to generate the PDF report card.", "error");
    }
  };

  const handleLogout = () => {
    addToast("Logging out...", "info");
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sidebarOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [sidebarOpen]);

  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const studentData = {
    name: student ? `${student.firstName} ${student.lastName}` : "Student",
    id: student?.studentNumber || "",
    progrm: student?.programType || "SHS",
  };

  if (isLoading && !student) {
    return (
      <StudentLoadingShell
        activePage="grades"
        currentDate={currentDate}
        headerTitle="Grades"
        onLogout={handleLogout}
        onMenuClick={handleMenuClick}
        onSidebarClose={handleSidebarClose}
        portalClassName="s-grd"
        skeletonTitle="Grades"
        studentData={studentData}
        variant="table"
        sidebarOpen={sidebarOpen}
      />
    );
  }

  return (
    <div className="s-portal s-grd">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div ref={sidebarRef}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={handleSidebarClose}
          activePage="grades"
          onLogout={handleLogout}
        />
      </div>

      {sidebarOpen && (
        <div className="s-overlay" onClick={handleSidebarClose}></div>
      )}

      <div className="s-main s-mm">
        <Header
          title="Grades"
          onMenuClick={handleMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />

        <main className="s-content">
          <div className="s-welcome-banner s-grades-banner">
            <div className="s-grades-banner-content">
              <h1>Grades</h1>
            </div>
          </div>

          <div className="s-grades-controls-row">
            <div className="s-grades-banner-subtitle">
              <span className="s-academic-year">
                <FaCalendarAlt /> {effectiveAcademicYear}
              </span>
              <span className="s-semester">
                <FaGraduationCap /> {effectiveSemester}
              </span>
            </div>

            <div className="s-grades-banner-actions">
              <button className="s-filter-btn" onClick={handleFilter}>
                <FaFilter /> Filter
              </button>
              <button
                className="s-generate-btn"
                onClick={handleGenerateReportCard}
              >
                <FaDownload /> Generate Report Card
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="s-filter-panel">
              <h3>Filter Grades</h3>
              <div className="s-filter-row">
                <div className="s-filter-group">
                  <label>Academic Year</label>
                  <select
                    value={effectiveAcademicYear}
                    onChange={(event) => {
                      setSelectedAcademicYear(event.target.value);
                      addToast(
                        `Filtered by academic year: ${event.target.value}`,
                        "info",
                      );
                    }}
                    className="s-filter-select"
                  >
                    {availableAcademicYears.length > 0 ? (
                      availableAcademicYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))
                    ) : (
                      <option value={effectiveAcademicYear}>
                        {effectiveAcademicYear}
                      </option>
                    )}
                  </select>
                </div>
                <div className="s-filter-group">
                  <label>Semester</label>
                  <select
                    value={effectiveSemester}
                    onChange={(event) => {
                      setSelectedSemester(event.target.value);
                      addToast(
                        `Filtered by semester: ${event.target.value}`,
                        "info",
                      );
                    }}
                    className="s-filter-select"
                  >
                    {availableSemesters.length > 0 ? (
                      availableSemesters.map((semester) => (
                        <option key={semester} value={semester}>
                          {semester}
                        </option>
                      ))
                    ) : (
                      <option value={effectiveSemester}>
                        {effectiveSemester}
                      </option>
                    )}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="s-notice-card">
            <div className="s-notice-icon">
              {areCurrentTermGradesLocked ? <FaLock /> : <IoDocumentText />}
            </div>
            <div className="s-notice-content">
              {areCurrentTermGradesLocked ? (
                <>
                  <h4>Current grades are locked</h4>
                  <p>
                    Complete every instructor evaluation assigned to you for{" "}
                    {effectiveAcademicYear} {effectiveSemester} to unlock your
                    posted grades. Completed{" "}
                    {evaluationLockStatus.completedCount}/
                    {evaluationLockStatus.requiredCount}. Pending:{" "}
                    {evaluationLockStatus.pendingInstructorNames.join(", ")}.
                  </p>
                </>
              ) : (
                <>
                  <h4>Note:</h4>
                  <p>
                    This page now reflects your enrolled subjects even before
                    grades are released. If a grade is still missing, it means
                    the posting process for that subject or grading period is
                    not finished yet.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="s-grades-table-wrapper">
            <div
              className={`s-grades-table-container ${
                isSHS ? "s-grades-table-shs" : "s-grades-table-college"
              }`}
            >
              <table className="s-grades-table">
                <thead>
                  <tr>
                    {tableColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length > 0 ? (
                    displayRows.map((row) => (
                      <tr key={row.id}>
                        {tableColumns.map((column) => {
                          const shouldMaskCell =
                            areCurrentTermGradesLocked &&
                            isGradeValueColumn(column.key);
                          const cellValue = shouldMaskCell
                            ? lockedGradeValue
                            : row[column.key];

                          if (
                            column.key === "status" ||
                            column.key === "remarks"
                          ) {
                            return (
                              <td
                                key={`${row.id}-${column.key}`}
                                className={column.cellClassName}
                              >
                                <span
                                  className={`s-grade-status s-grade-status-${getStatusToneClassName(
                                    shouldMaskCell ? "neutral" : cellValue,
                                  )}`}
                                >
                                  {shouldMaskCell ? (
                                    <>
                                      <FaLock /> {cellValue}
                                    </>
                                  ) : (
                                    cellValue
                                  )}
                                </span>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={`${row.id}-${column.key}`}
                              className={column.cellClassName}
                            >
                              {shouldMaskCell ? (
                                <span className="s-locked-grade-cell">
                                  <FaLock /> {cellValue}
                                </span>
                              ) : (
                                cellValue
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={tableColumns.length} className="s-no-data">
                        No enrolled subjects or posted grades were found for the
                        selected academic year and semester.
                      </td>
                    </tr>
                  )}
                </tbody>
                {isSHS && displayRows.length > 0 ? (
                  <tfoot>
                    <tr>
                      <td
                        colSpan={Math.max(1, tableColumns.length - 2)}
                        className="s-grade-status-cell"
                      >
                        General Average for the Semester
                      </td>
                      <td className="s-grade-value">
                        {areCurrentTermGradesLocked ? (
                          <span className="s-locked-grade-cell">
                            <FaLock /> {lockedGradeValue}
                          </span>
                        ) : (
                          shsGeneralAverage
                        )}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>

          <div className="s-subjects-summary s-grades-summary">
            <div className="s-summary-card">
              <h4>Subjects Listed</h4>
              <div className="s-summary-value">{displayRows.length}</div>
            </div>
            <div className="s-summary-card">
              <h4>With Posted Grades</h4>
              <div className="s-summary-value">{subjectsWithPostedGradesCount}</div>
            </div>
            {!isSHS ? (
              <div className="s-summary-card">
                <h4>Total Units</h4>
                <div className="s-summary-value">{totalUnits}</div>
              </div>
            ) : null}
            {isSHS ? (
              <div className="s-summary-card">
                <h4>General Average</h4>
                <div className="s-summary-value">
                  {areCurrentTermGradesLocked ? (
                    <span className="s-summary-locked">
                      <FaLock /> Locked
                    </span>
                  ) : (
                    shsGeneralAverage
                  )}
                </div>
              </div>
            ) : null}
            {!isSHS ? (
              <div className="s-summary-card">
                <h4>Total Units Earned</h4>
                <div className="s-summary-value">
                  {collegePerformanceSummary?.totalUnitsEarned ?? 0}
                </div>
              </div>
            ) : null}
            {!isSHS ? (
              <div className="s-summary-card">
                <h4>GPA</h4>
                <div className="s-summary-value">
                  {areCurrentTermGradesLocked ? (
                    <span className="s-summary-locked">
                      <FaLock /> Locked
                    </span>
                  ) : (
                    (collegePerformanceSummary?.gpa ?? placeholderGrade)
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

export default StudentGrades;
