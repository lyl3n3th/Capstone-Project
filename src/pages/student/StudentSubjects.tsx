import { useState, useRef, useEffect, useMemo } from "react";
import {
  FaCalendarAlt,
  FaDownload,
  FaFilter,
  FaGraduationCap,
} from "react-icons/fa";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import StudentLoadingShell from "../../components/common/StudentLoadingShell";
import { useStudent } from "../../hooks/useStudent";
import aicsLogo from "../../assets/images/AICS_Logo.png";
import type {
  StudentPortalSubject,
  StudentScheduleChoiceGroup,
  StudentScheduleSelectionRequestRecord,
  StudentScheduledAssignmentItem,
} from "../../services/adminStorage";
import {
  getStudentScheduleChoiceGroups,
  getStudentScheduleSelectionRequest,
} from "../../services/adminStorage";
import {
  fetchStudentScheduleRequests,
  saveStudentPlanningState,
  saveStudentScheduleRequest,
} from "../../services/studentPlanningApi";
import { getStudentGradeRecords } from "../../services/studentGrades";
import { ToastContainer } from "../../components/common/Toast";
import "../../styles/main.css";

const semesterSortOrder = ["1st Semester", "2nd Semester", "Summer"];

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
    const id = `student-subjects-toast-${toastCounterRef.current}`;
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

const parseClockToMinutes = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const formatClockLabel = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const [rawHour, rawMinute] = value.split(":").map(Number);
  const suffix = rawHour >= 12 ? "PM" : "AM";
  const hour = rawHour % 12 || 12;
  return `${hour}:${rawMinute.toString().padStart(2, "0")} ${suffix}`;
};

const formatScheduleChoiceLabel = (
  assignment: Pick<
    StudentScheduledAssignmentItem,
    "sectionCode" | "schedule" | "instructorName"
  >,
) =>
  `${assignment.sectionCode || "No section"} - ${
    assignment.schedule.length > 0
      ? assignment.schedule
          .map(
            (slot) =>
              `${slot.day.slice(0, 3)} ${formatClockLabel(slot.startTime)}-${formatClockLabel(slot.endTime)} @ ${slot.room || "TBA"}`,
          )
          .join(" / ")
      : "Schedule pending"
  }${assignment.instructorName ? ` - ${assignment.instructorName}` : ""}`;

const formatAssignmentScheduleDetails = (
  assignment?: Pick<StudentScheduledAssignmentItem, "schedule">,
) => {
  if (!assignment || assignment.schedule.length === 0) {
    return "TBA";
  }

  return assignment.schedule
    .map(
      (slot) =>
        `${slot.day.slice(0, 3)} ${formatClockLabel(slot.startTime)}-${formatClockLabel(slot.endTime)}`,
    )
    .join(" / ");
};

const formatAssignmentRoomDetails = (
  assignment?: Pick<StudentScheduledAssignmentItem, "schedule">,
) => {
  if (!assignment || assignment.schedule.length === 0) {
    return "TBA";
  }

  return Array.from(
    new Set(
      assignment.schedule.map((slot) => slot.room?.trim() || "TBA"),
    ),
  ).join(", ");
};

const formatAssignmentProfessorDetails = (
  assignment?: Pick<StudentScheduledAssignmentItem, "instructorName">,
) => {
  const instructorName = assignment?.instructorName?.trim();
  return instructorName && instructorName.length > 0 ? instructorName : "TBA";
};

const buildScheduledAssignmentConflicts = (
  assignments: Pick<
    StudentScheduledAssignmentItem,
    "assignmentId" | "subjectCode" | "schedule"
  >[],
) => {
  const conflicts: Array<{
    leftAssignmentId: string;
    rightAssignmentId: string;
    message: string;
  }> = [];

  for (let leftIndex = 0; leftIndex < assignments.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < assignments.length;
      rightIndex += 1
    ) {
      const left = assignments[leftIndex];
      const right = assignments[rightIndex];

      const hasConflict = left.schedule.some((leftSlot) =>
        right.schedule.some((rightSlot) => {
          if (leftSlot.day !== rightSlot.day) {
            return false;
          }

          const leftStart = parseClockToMinutes(leftSlot.startTime);
          const leftEnd = parseClockToMinutes(leftSlot.endTime);
          const rightStart = parseClockToMinutes(rightSlot.startTime);
          const rightEnd = parseClockToMinutes(rightSlot.endTime);

          if (
            leftStart === null ||
            leftEnd === null ||
            rightStart === null ||
            rightEnd === null
          ) {
            return false;
          }

          return leftStart < rightEnd && rightStart < leftEnd;
        }),
      );

      if (!hasConflict) {
        continue;
      }

      conflicts.push({
        leftAssignmentId: left.assignmentId,
        rightAssignmentId: right.assignmentId,
        message: `${left.subjectCode} conflicts with ${right.subjectCode}.`,
      });
    }
  }

  return conflicts;
};

const getOwnScheduleSelectionLabel = (
  status?: "Not Submitted" | "Pending Approval" | "Approved" | "Rejected",
) => {
  if (status === "Pending Approval") {
    return "Pending Approval";
  }

  if (status === "Approved") {
    return "Approved";
  }

  if (status === "Rejected") {
    return "Needs Revision";
  }

  return "Not Submitted";
};

const mapScheduleRequestStatusToSelectionStatus = (
  status?: StudentScheduleSelectionRequestRecord["status"],
): "Not Submitted" | "Pending Approval" | "Approved" | "Rejected" => {
  if (status === "Approved") {
    return "Approved";
  }

  if (status === "Rejected") {
    return "Rejected";
  }

  if (status === "Pending") {
    return "Pending Approval";
  }

  return "Not Submitted";
};

const getOwnScheduleStatusMessage = (
  status?: "Not Submitted" | "Pending Approval" | "Approved" | "Rejected",
) => {
  if (status === "Pending Approval") {
    return "Your selected schedules were submitted and are now waiting for admin or registrar approval.";
  }

  if (status === "Approved") {
    return "Your own-schedule request is approved. Your official subjects are listed below.";
  }

  if (status === "Rejected") {
    return "Your last schedule submission needs revision. Update the selections below and submit again.";
  }

  return "Choose one available schedule per subject, then submit it for final approval.";
};

const getOwnScheduleSubjectsEmptyStateMessage = ({
  requestStatus,
  selectionStatus,
  showOwnSchedulePlanner,
}: {
  requestStatus?: "Pending" | "Approved" | "Rejected";
  selectionStatus?: "Not Submitted" | "Pending Approval" | "Approved" | "Rejected";
  showOwnSchedulePlanner: boolean;
}) => {
  if (showOwnSchedulePlanner) {
    return "No official subjects are posted yet. They will appear here after your schedule request is approved.";
  }

  if (requestStatus === "Pending") {
    return "Your own-schedule request is still under review. Official subjects will appear here after it is approved.";
  }

  if (requestStatus === "Rejected") {
    return "Your own-schedule request was not approved yet. Official subjects will appear here once a new request is approved.";
  }

  if (selectionStatus === "Approved") {
    return "Your approved own-schedule load is not posted yet. Please contact the registrar.";
  }

  if (selectionStatus === "Pending Approval") {
    return "Your selected schedules are still waiting for approval. Official subjects will appear here once they are approved.";
  }

  if (requestStatus === "Approved") {
    return "No official subjects are posted yet for your own-schedule request.";
  }

  return "No subjects found for the selected academic year and semester.";
};

const sanitizePdfText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const escapePdfText = (value: unknown) =>
  sanitizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const wrapPdfText = (value: unknown, maxCharacters: number) => {
  const text = sanitizePdfText(value);

  if (!text) {
    return [""];
  }

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    if (!currentLine) {
      currentLine = word;
      return;
    }

    if (`${currentLine} ${word}`.length <= maxCharacters) {
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

type PdfImageResource = {
  name: string;
  width: number;
  height: number;
  data: ArrayBuffer;
};

const getPdfChunkLength = (chunk: PdfObjectChunk, encoder: TextEncoder) =>
  typeof chunk === "string" ? encoder.encode(chunk).length : chunk.byteLength;

const getImageDataUrlBytes = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = window.atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return buffer;
};

const loadPdfJpegImage = async (
  source: string,
  name: string,
): Promise<PdfImageResource | null> => {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = source;

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to load schedule logo."));
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);

    return {
      name,
      width: canvas.width,
      height: canvas.height,
      data: getImageDataUrlBytes(canvas.toDataURL("image/jpeg", 0.92)),
    };
  } catch (error) {
    console.warn("Schedule PDF logo was skipped.", error);
    return null;
  }
};

const buildPdfDocument = (
  pageContents: string[],
  imageResources: PdfImageResource[],
  pageSize: { width: number; height: number },
) => {
  const encoder = new TextEncoder();
  const objects: PdfObjectChunk[][] = [];
  const addObject = (content: PdfObjectChunk | PdfObjectChunk[]) => {
    objects.push(Array.isArray(content) ? content : [content]);
    return objects.length;
  };
  const fontObjectId = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  );
  const boldFontObjectId = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  );
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
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageSize.width} ${pageSize.height}] /Resources << /Font << /F1 ${fontObjectId} 0 R /F2 ${boldFontObjectId} 0 R >>${imageResourceDictionary} >> /Contents ${contentObjectId} 0 R >>`,
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

const normalizeReportFilePart = (value: string) =>
  sanitizePdfText(value).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") ||
  "schedule";

const splitScheduleParts = (value?: string) =>
  sanitizePdfText(value)
    .split(/\s*\/\s*|\s*,\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.toUpperCase() !== "TBA");

const normalizeScheduleDayLabel = (value: string) => {
  const normalized = value.trim().toLowerCase();

  if (normalized.startsWith("mon")) {
    return "M";
  }

  if (normalized.startsWith("tue")) {
    return "T";
  }

  if (normalized.startsWith("wed")) {
    return "W";
  }

  if (normalized.startsWith("thu") || normalized === "th") {
    return "TH";
  }

  if (normalized.startsWith("fri")) {
    return "F";
  }

  if (normalized.startsWith("sat")) {
    return "SAT";
  }

  if (normalized.startsWith("sun")) {
    return "SUN";
  }

  return value.toUpperCase();
};

const getSubjectScheduleLines = (subject: StudentPortalSubject) => {
  const days = splitScheduleParts(subject.days);
  const times = splitScheduleParts(subject.time);
  const lineCount = Math.max(days.length, times.length);

  if (lineCount > 0) {
    return Array.from({ length: lineCount }, (_, index) => ({
      day: days[index] ? normalizeScheduleDayLabel(days[index]) : "",
      time: times[index] || times[0] || "",
    }));
  }

  const scheduleParts = splitScheduleParts(subject.schedule);
  const parsedLines = scheduleParts.map((part) => {
    const match = part.match(/^([A-Za-z]{1,9})\s+(.+)$/);

    if (!match) {
      return { day: "", time: part };
    }

    return {
      day: normalizeScheduleDayLabel(match[1]),
      time: match[2],
    };
  });

  return parsedLines.length > 0 ? parsedLines : [{ day: "TBA", time: "TBA" }];
};

const formatScheduleSemesterLabel = (semester: string) =>
  semester.replace(/\bSemester\b/i, "Sem.");

const buildSchedulePdf = async ({
  studentName,
  studentNumber,
  program,
  branch,
  yearLevel,
  academicYear,
  semester,
  subjects,
  isSHS,
}: {
  studentName: string;
  studentNumber: string;
  program: string;
  branch: string;
  yearLevel: string;
  academicYear: string;
  semester: string;
  subjects: StudentPortalSubject[];
  isSHS: boolean;
}) => {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 36;
  const tableWidth = pageWidth - margin * 2;
  const columns = [70, 210, 46, 112, 85];
  const brandColor = [0.02, 0.38, 0.53] as const;
  const headerFillColor = [0.9, 0.96, 0.98] as const;
  const textColor = [0.05, 0.09, 0.16] as const;
  const gridColor = [0.25, 0.31, 0.36] as const;
  const logoResource = await loadPdfJpegImage(aicsLogo, "AicsLogo");
  const imageResources = logoResource ? [logoResource] : [];
  const pages: string[] = [];
  let commands: string[] = [];
  let y = margin;

  const rgb = (color: readonly number[]) =>
    color.map((channel) => channel.toFixed(3)).join(" ");
  const getHelveticaCharacterWidth = (character: string, bold: boolean) => {
    if (character === " ") {
      return 278;
    }

    if ("ilI.,'!:;|".includes(character)) {
      return bold ? 278 : 222;
    }

    if ("mwMW".includes(character)) {
      return bold ? 889 : 833;
    }

    if ("ABCDEFGHKNOPQRSTUVXYZ".includes(character)) {
      return bold ? 722 : 667;
    }

    if ("JL".includes(character)) {
      return bold ? 611 : 556;
    }

    if ("0123456789".includes(character)) {
      return 556;
    }

    if (character === "/") {
      return 278;
    }

    if (character === "-") {
      return 333;
    }

    return bold ? 556 : 500;
  };
  const estimateTextWidth = (value: string, fontSize: number, bold = false) =>
    Array.from(sanitizePdfText(value)).reduce(
      (sum, character) => sum + getHelveticaCharacterWidth(character, bold),
      0,
    ) *
    (fontSize / 1000);
  const addText = (
    value: unknown,
    x: number,
    baselineY: number,
    options: {
      size?: number;
      bold?: boolean;
      align?: "left" | "center" | "right";
      color?: readonly number[];
    } = {},
  ) => {
    const text = sanitizePdfText(value);
    const size = options.size ?? 10;
    const bold = options.bold ?? false;
    const color = options.color ?? textColor;
    let textX = x;

    if (options.align === "center") {
      textX = x - estimateTextWidth(text, size, bold) / 2;
    } else if (options.align === "right") {
      textX = x - estimateTextWidth(text, size, bold);
    }

    commands.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${textX.toFixed(
        2,
      )} ${(pageHeight - baselineY).toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`,
    );
  };
  const addRect = (
    x: number,
    topY: number,
    width: number,
    height: number,
    mode: "S" | "f" | "B",
    fillColor?: readonly number[],
  ) => {
    if (fillColor) {
      commands.push(`${rgb(fillColor)} rg`);
    }
    commands.push(`${rgb(gridColor)} RG 0.7 w`);
    commands.push(
      `${x.toFixed(2)} ${(pageHeight - topY - height).toFixed(2)} ${width.toFixed(
        2,
      )} ${height.toFixed(2)} re ${mode}`,
    );
  };
  const addLine = (x1: number, y1: number, x2: number, y2: number) => {
    commands.push(`${rgb(gridColor)} RG 0.7 w`);
    commands.push(
      `${x1.toFixed(2)} ${(pageHeight - y1).toFixed(2)} m ${x2.toFixed(
        2,
      )} ${(pageHeight - y2).toFixed(2)} l S`,
    );
  };
  const addImage = (
    image: PdfImageResource,
    x: number,
    topY: number,
    width: number,
    height: number,
  ) => {
    commands.push(
      `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${(
        pageHeight -
        topY -
        height
      ).toFixed(2)} cm /${image.name} Do Q`,
    );
  };
  const drawTableHeader = () => {
    const headerHeight = 30;
    const headers = ["Subject Code", "Subject Title", "Day", "Time", "INST."];
    let x = margin;

    addRect(margin, y, tableWidth, headerHeight, "B", headerFillColor);
    headers.forEach((header, index) => {
      if (index > 0) {
        addLine(x, y, x, y + headerHeight);
      }
      addText(header, x + columns[index] / 2, y + 19, {
        size: 8,
        bold: true,
        align: "center",
        color: brandColor,
      });
      x += columns[index];
    });

    y += headerHeight;
  };
  const startPage = (continued = false) => {
    if (commands.length > 0) {
      pages.push(commands.join("\n"));
      commands = [];
    }

    y = margin;

    if (!continued) {
      if (logoResource) {
        addImage(logoResource, pageWidth / 2 - 26, y - 20, 52, 52);
      }

      y += 58;
      addText("ASIAN INSTITUTE OF COMPUTER STUDIES", pageWidth / 2, y, {
        size: 18,
        bold: true,
        align: "center",
        color: textColor,
      });
      y += 18;
      addText(`${branch || "Bacoor"} Branch`.toUpperCase(), pageWidth / 2, y, {
        size: 15,
        bold: true,
        align: "center",
        color: textColor,
      });
      y += 44;
      addText(subjects[0]?.section || "Class Schedule", pageWidth / 2, y, {
        size: 21,
        bold: true,
        align: "center",
        color: textColor,
      });
      y += 24;
      addText(
        `${isSHS ? "Senior High School" : "College"} / ${yearLevel || "Year Level"} / ${formatScheduleSemesterLabel(
          semester || "Semester",
        )} / SY ${academicYear || "Academic Year"}`,
        pageWidth / 2,
        y,
        {
          size: 14,
          bold: true,
          align: "center",
          color: textColor,
        },
      );
      y += 28;
      addText(`Student: ${studentName || "Student"}`, margin, y, { size: 9 });
      addText(`Student Number: ${studentNumber || "N/A"}`, pageWidth / 2, y, {
        size: 9,
      });
      addText(`Program: ${program || "N/A"}`, margin, y + 16, { size: 9 });
      y += 32;
    } else {
      addText("Class Schedule (continued)", margin, y, {
        size: 14,
        bold: true,
        color: brandColor,
      });
      y += 20;
    }

    drawTableHeader();
  };
  const drawFooter = () => {
    const totalUnits = subjects.reduce(
      (sum, subject) => sum + (subject.units || 0),
      0,
    );
    const footerText = !isSHS && totalUnits > 0
      ? `Total Subjects: ${subjects.length}   Total Units: ${totalUnits}`
      : `Total Subjects: ${subjects.length}`;

    addText(footerText, margin, pageHeight - 24, {
      size: 8,
      bold: true,
      color: brandColor,
    });
    addText(
      `Generated on ${new Date().toLocaleDateString()}`,
      pageWidth - margin,
      pageHeight - 24,
      { size: 8, align: "right" },
    );
  };

  startPage();

  subjects.forEach((subject) => {
    const scheduleLines = getSubjectScheduleLines(subject);
    const titleLines = wrapPdfText(subject.title, 35);
    const instructorLines = wrapPdfText(subject.professor || "TBA", 12);
    const maxLines = Math.max(
      titleLines.length,
      scheduleLines.length,
      instructorLines.length,
      1,
    );
    const rowHeight = Math.max(36, maxLines * 11 + 16);

    if (y + rowHeight > pageHeight - 38) {
      drawFooter();
      startPage(true);
    }

    let x = margin;
    addRect(margin, y, tableWidth, rowHeight, "S");
    columns.forEach((width, index) => {
      if (index > 0) {
        addLine(x, y, x, y + rowHeight);
      }
      x += width;
    });

    addText(subject.code || "N/A", margin + 7, y + rowHeight / 2 + 3, {
      size: 9.5,
    });

    titleLines.forEach((line, index) => {
      addText(line, margin + columns[0] + 8, y + 17 + index * 11, {
        size: 9.5,
      });
    });

    scheduleLines.forEach((line, index) => {
      addText(line.day, margin + columns[0] + columns[1] + columns[2] / 2, y + 17 + index * 11, {
        size: 9.5,
        align: "center",
      });
      addText(
        line.time,
        margin + columns[0] + columns[1] + columns[2] + columns[3] / 2,
        y + 17 + index * 11,
        { size: 8.5, align: "center" },
      );
    });

    instructorLines.forEach((line, index) => {
      addText(
        line,
        margin +
          columns[0] +
          columns[1] +
          columns[2] +
          columns[3] +
          columns[4] / 2,
        y + 17 + index * 11,
        { size: 8.5, align: "center" },
      );
    });

    y += rowHeight;
  });

  drawFooter();
  pages.push(commands.join("\n"));

  return buildPdfDocument(pages, imageResources, {
    width: pageWidth,
    height: pageHeight,
  });
};

function StudentSubjects() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    student,
    subjects: allSubjects,
    currentTerm,
    isLoading,
    refreshStudent,
  } = useStudent();
  const [selectedAcademicYear, setSelectedAcademicYear] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [scheduleChoiceGroups, setScheduleChoiceGroups] = useState<
    StudentScheduleChoiceGroup[]
  >([]);
  const [scheduleRequest, setScheduleRequest] =
    useState<StudentScheduleSelectionRequestRecord | null>(null);
  const [selectedAssignmentsBySubject, setSelectedAssignmentsBySubject] =
    useState<Record<string, string>>({});
  const [isSubmittingScheduleRequest, setIsSubmittingScheduleRequest] =
    useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { toasts, addToast, removeToast } = useToast();

  const isSHS = student?.programType === "SHS";
  const hasApprovedOwnScheduleTerm = Boolean(
    student?.requestedOwnSchedule &&
      currentTerm?.source === "approved_enrollment",
  );
  const hasOwnScheduleRequest = Boolean(
    student?.requestedOwnSchedule ||
      student?.ownScheduleRequestStatus === "Approved" ||
      hasApprovedOwnScheduleTerm ||
      currentTerm?.source === "own_schedule",
  );
  const supportsOwnSchedule = Boolean(
    hasOwnScheduleRequest &&
      (student?.ownScheduleRequestStatus === "Approved" ||
        hasApprovedOwnScheduleTerm ||
        currentTerm?.source === "own_schedule"),
  );
  const resolvedOwnScheduleRequestStatus =
    student?.ownScheduleRequestStatus ||
    (supportsOwnSchedule ? "Approved" : undefined);
  const ownScheduleAcademicYear =
    student?.ownScheduleAcademicYear ||
    currentTerm?.academicYear ||
    scheduleRequest?.academicYear ||
    "2026-2027";
  const ownScheduleSemester =
    student?.ownScheduleSemester ||
    currentTerm?.semester ||
    scheduleRequest?.semester ||
    "1st Semester";
  const scheduleRequestMatchesOwnScheduleTerm = Boolean(
    scheduleRequest &&
      scheduleRequest.academicYear === ownScheduleAcademicYear &&
      scheduleRequest.semester === ownScheduleSemester,
  );
  const ownScheduleSelectionStatus =
    scheduleRequestMatchesOwnScheduleTerm
      ? mapScheduleRequestStatusToSelectionStatus(scheduleRequest?.status)
      : currentTerm?.source === "approved_enrollment" &&
          student?.ownScheduleSelectionStatus === "Approved"
        ? "Not Submitted"
        : student?.ownScheduleSelectionStatus;
  const showOwnSchedulePlanner =
    supportsOwnSchedule && ownScheduleSelectionStatus !== "Approved";
  const showIrregularSections =
    student?.status === "Irregular" || hasOwnScheduleRequest;
  const isMissingSyncedAcademicData =
    currentTerm?.source === "fallback" && allSubjects.length === 0;
  const subjectsEmptyStateMessage = hasOwnScheduleRequest
    ? getOwnScheduleSubjectsEmptyStateMessage({
        requestStatus: resolvedOwnScheduleRequestStatus,
        selectionStatus: ownScheduleSelectionStatus,
        showOwnSchedulePlanner,
      })
    : isMissingSyncedAcademicData
      ? "No official subjects are posted yet for your current term."
      : "No subjects found for the selected academic year and semester.";
  const studentGradeRecords = useMemo(
    () =>
      student?.studentNumber
        ? getStudentGradeRecords({
            branch: student.branch,
            studentId: student.studentNumber,
          }).filter(
            (record) =>
              record.programType ===
              (student.programType === "SHS" ? "SHS" : "College"),
          )
        : [],
    [student?.branch, student?.programType, student?.studentNumber],
  );

  useEffect(() => {
    if (!student || !supportsOwnSchedule) {
      setScheduleChoiceGroups([]);
      setScheduleRequest(null);
      setSelectedAssignmentsBySubject({});
      return;
    }

    let isCancelled = false;

    const loadOwnScheduleRequest = async () => {
      try {
        await fetchStudentScheduleRequests(student.branch);
      } catch (error) {
        console.warn("Failed to fetch shared student schedule requests.", error);
      }

      const nextScheduleRequest = getStudentScheduleSelectionRequest({
        branch: student.branch,
        studentNumber: student.studentNumber,
        trackingNumber: student.trackingNumber,
        academicYear:
          student.ownScheduleAcademicYear ||
          currentTerm?.academicYear ||
          "2026-2027",
        semester:
          student.ownScheduleSemester ||
          currentTerm?.semester ||
          "1st Semester",
      });
      const nextAcademicYear =
        student.ownScheduleAcademicYear ||
        currentTerm?.academicYear ||
        nextScheduleRequest?.academicYear ||
        "2026-2027";
      const nextSemester =
        student.ownScheduleSemester ||
        currentTerm?.semester ||
        nextScheduleRequest?.semester ||
        "1st Semester";
      const nextChoiceGroups = getStudentScheduleChoiceGroups({
        branch: student.branch,
        program: student.programType === "SHS" ? "SHS" : "College",
        yearLevel: student.yearLevel,
        strandOrCourse: student.program,
        semester: nextSemester,
        academicYear: nextAcademicYear,
        gradeRecords: studentGradeRecords,
      });

      if (isCancelled) {
        return;
      }

      setScheduleRequest(nextScheduleRequest);
      setScheduleChoiceGroups(nextChoiceGroups);
      setSelectedAssignmentsBySubject(
        Object.fromEntries(
          (nextScheduleRequest?.selections ?? []).map((selection) => [
            selection.subjectId,
            selection.assignmentId,
          ]),
        ),
      );
    };

    void loadOwnScheduleRequest();

    return () => {
      isCancelled = true;
    };
  }, [
    student,
    supportsOwnSchedule,
    currentTerm?.academicYear,
    currentTerm?.semester,
    studentGradeRecords,
  ]);

  const availableAcademicYears = useMemo(() => {
    const years = new Set(
      allSubjects.map((subject) => subject.academicYear).filter(Boolean),
    );

    if (currentTerm?.academicYear) {
      years.add(currentTerm.academicYear);
    }

    if (supportsOwnSchedule) {
      years.add(ownScheduleAcademicYear);
    }

    return Array.from(years).sort();
  }, [
    allSubjects,
    currentTerm?.academicYear,
    ownScheduleAcademicYear,
    supportsOwnSchedule,
  ]);

  const effectiveAcademicYear =
    selectedAcademicYear && availableAcademicYears.includes(selectedAcademicYear)
      ? selectedAcademicYear
      : currentTerm?.academicYear &&
          availableAcademicYears.includes(currentTerm.academicYear)
        ? currentTerm.academicYear
        : availableAcademicYears[0] || ownScheduleAcademicYear;

  const availableSemesters = useMemo(() => {
    const semesters = new Set(
      allSubjects
        .filter((subject) => subject.academicYear === effectiveAcademicYear)
        .map((subject) => subject.semester)
        .filter(Boolean),
    );

    if (
      currentTerm?.semester &&
      currentTerm.academicYear === effectiveAcademicYear
    ) {
      semesters.add(currentTerm.semester);
    }

    if (supportsOwnSchedule && effectiveAcademicYear === ownScheduleAcademicYear) {
      semesters.add(ownScheduleSemester);
    }

    return sortSemesters(Array.from(semesters));
  }, [
    allSubjects,
    effectiveAcademicYear,
    ownScheduleAcademicYear,
    ownScheduleSemester,
    supportsOwnSchedule,
  ]);

  const effectiveSemester =
    selectedSemester && availableSemesters.includes(selectedSemester)
      ? selectedSemester
      : currentTerm?.academicYear === effectiveAcademicYear &&
          currentTerm?.semester &&
          availableSemesters.includes(currentTerm.semester)
        ? currentTerm.semester
        : availableSemesters[0] || ownScheduleSemester;

  const filteredSubjects: StudentPortalSubject[] = useMemo(
    () =>
      allSubjects.filter(
        (subject) =>
          subject.academicYear === effectiveAcademicYear &&
          subject.semester === effectiveSemester,
      ),
    [allSubjects, effectiveAcademicYear, effectiveSemester],
  );

  const visibleScheduleChoiceGroups = useMemo(() => {
    if (!supportsOwnSchedule) {
      return scheduleChoiceGroups;
    }

    const groupsBySubject = new Map<string, StudentScheduleChoiceGroup>();

    scheduleChoiceGroups.forEach((group) => {
      groupsBySubject.set(group.subjectId || group.subjectCode, group);
      groupsBySubject.set(group.subjectCode, group);
    });

    const shouldUsePortalSubjectFallback = scheduleChoiceGroups.length === 0;

    if (!shouldUsePortalSubjectFallback) {
      return Array.from(new Set(groupsBySubject.values())).sort(
        (left, right) =>
          left.subjectCode.localeCompare(right.subjectCode) ||
          left.subjectName.localeCompare(right.subjectName),
      );
    }

    filteredSubjects.forEach((subject) => {
      const existingGroup =
        groupsBySubject.get(subject.id) || groupsBySubject.get(subject.code);

      if (existingGroup) {
        return;
      }

      const plannedGroup: StudentScheduleChoiceGroup = {
        subjectId: subject.id || subject.code,
        subjectCode: subject.code,
        subjectName: subject.title,
        units: subject.units,
        assignmentOptions: [],
      };

      groupsBySubject.set(plannedGroup.subjectId, plannedGroup);
      groupsBySubject.set(plannedGroup.subjectCode, plannedGroup);
    });

    return Array.from(new Set(groupsBySubject.values())).sort(
      (left, right) =>
        left.subjectCode.localeCompare(right.subjectCode) ||
        left.subjectName.localeCompare(right.subjectName),
    );
  }, [filteredSubjects, scheduleChoiceGroups, supportsOwnSchedule]);

  const selectedOwnScheduleAssignments = useMemo(
    () =>
      visibleScheduleChoiceGroups.flatMap((group) => {
        const assignmentId = selectedAssignmentsBySubject[group.subjectId];
        const selectedAssignment = group.assignmentOptions.find(
          (assignment) => assignment.assignmentId === assignmentId,
        );

        return selectedAssignment ? [selectedAssignment] : [];
      }),
    [selectedAssignmentsBySubject, visibleScheduleChoiceGroups],
  );

  const ownScheduleConflicts = useMemo(
    () => buildScheduledAssignmentConflicts(selectedOwnScheduleAssignments),
    [selectedOwnScheduleAssignments],
  );

  const ownScheduleConflictAssignmentIds = useMemo(
    () =>
      new Set(
        ownScheduleConflicts.flatMap((conflict) => [
          conflict.leftAssignmentId,
          conflict.rightAssignmentId,
        ]),
      ),
    [ownScheduleConflicts],
  );

  const ownScheduleSelectedUnits = selectedOwnScheduleAssignments.reduce(
    (sum, assignment) => sum + (assignment.units ?? 0),
    0,
  );

  const handleMenuClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  const handleLogout = () => {
    addToast("Logging out...", "info");
  };

  const handleFilter = () => {
    setShowFilters(!showFilters);
    addToast(showFilters ? "Filter panel closed" : "Filter panel opened", "info");
  };

  const handleOwnScheduleSelectionChange = (
    subjectId: string,
    assignmentId: string,
  ) => {
    setSelectedAssignmentsBySubject((prev) => ({
      ...prev,
      [subjectId]: assignmentId,
    }));
  };

  const handleResetOwnScheduleSelections = () => {
    setSelectedAssignmentsBySubject({});
    addToast("Schedule selections cleared.", "info");
  };

  const handleSubmitOwnScheduleRequest = async () => {
    if (!student) {
      return;
    }

    if (selectedOwnScheduleAssignments.length === 0) {
      addToast("Choose at least one schedule before submitting.", "warning");
      return;
    }

    if (ownScheduleConflicts.length > 0) {
      addToast("Resolve the schedule conflicts first.", "warning");
      return;
    }

    const timestamp = new Date().toISOString();
    const nextRequest: StudentScheduleSelectionRequestRecord = {
      id:
        scheduleRequest?.id ||
        `schedule-request-${student.studentNumber}-${ownScheduleAcademicYear}-${ownScheduleSemester}`,
      studentNumber: student.studentNumber,
      trackingNumber: student.trackingNumber,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      branch: student.branch,
      program: student.programType === "SHS" ? "SHS" : "College",
      yearLevel: student.yearLevel,
      strandOrCourse: student.program,
      academicYear: ownScheduleAcademicYear,
      semester: ownScheduleSemester,
      status: "Pending",
      selections: selectedOwnScheduleAssignments,
      submittedAt: scheduleRequest?.submittedAt || timestamp,
      updatedAt: timestamp,
    };

    try {
      setIsSubmittingScheduleRequest(true);
      const savedRequest = await saveStudentScheduleRequest(nextRequest);
      await saveStudentPlanningState({
        branch: student.branch,
        studentNumber: student.studentNumber,
        trackingNumber: student.trackingNumber,
        requestedOwnSchedule: true,
        ownScheduleRequestStatus: "Approved",
        ownScheduleAcademicYear,
        ownScheduleSemester,
        ownScheduleSelectionStatus: "Pending Approval",
      });
      setScheduleRequest(savedRequest);
      await refreshStudent();
      addToast("Schedule request submitted for approval.", "success");
    } catch (error) {
      console.error("Failed to save own schedule request", error);
      addToast("Unable to submit the schedule request right now.", "error");
    } finally {
      setIsSubmittingScheduleRequest(false);
    }
  };

  const handleDownloadSchedule = async () => {
    if (filteredSubjects.length === 0) {
      addToast("No official subjects are available to download yet.", "warning");
      return;
    }

    try {
      const schedulePdf = await buildSchedulePdf({
        studentName: student
          ? `${student.firstName} ${student.lastName}`.trim()
          : "Student",
        studentNumber: student?.studentNumber || "",
        program: student?.program || "",
        branch: student?.branch || "",
        yearLevel: currentTerm?.yearLevel || student?.yearLevel || "",
        academicYear: effectiveAcademicYear,
        semester: effectiveSemester,
        subjects: filteredSubjects,
        isSHS,
      });
      const url = URL.createObjectURL(schedulePdf);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `class_schedule_${normalizeReportFilePart(
        effectiveAcademicYear,
      )}_${normalizeReportFilePart(effectiveSemester)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);

      addToast("Schedule PDF downloaded successfully!", "success");
    } catch (error) {
      console.error("Failed to generate schedule PDF", error);
      addToast("Unable to generate the schedule PDF.", "error");
    }
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

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
        activePage="subjects"
        currentDate={currentDate}
        headerTitle="Current Subjects"
        onLogout={handleLogout}
        onMenuClick={handleMenuClick}
        onSidebarClose={handleSidebarClose}
        skeletonTitle="Subjects"
        studentData={studentData}
        variant="table"
        sidebarOpen={sidebarOpen}
      />
    );
  }

  return (
    <div className="s-portal">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div ref={sidebarRef}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={handleSidebarClose}
          activePage="subjects"
          onLogout={handleLogout}
        />
      </div>

      {sidebarOpen && (
        <div className="s-overlay" onClick={handleSidebarClose}></div>
      )}

      <div className="s-main">
        <Header
          title="Current Subjects"
          onMenuClick={handleMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />

        <main className="s-content">
          <div className="s-welcome-banner">
            <h1>Current Subjects</h1>
          </div>

          {supportsOwnSchedule ? (
            <div className="s-own-schedule-banner">
              <div>
                <h2>Own Schedule Admission</h2>
                <p>
                  {getOwnScheduleStatusMessage(
                    ownScheduleSelectionStatus,
                  )}
                </p>
              </div>
              <div className="s-own-schedule-banner-meta">
                <span>{ownScheduleAcademicYear}</span>
                <span>{ownScheduleSemester}</span>
                <span>
                  {getOwnScheduleSelectionLabel(
                    ownScheduleSelectionStatus,
                  )}
                </span>
              </div>
            </div>
          ) : null}

          {showOwnSchedulePlanner ? (
            <div className="s-own-schedule-panel">
              <div className="s-own-schedule-summary">
                <div className="s-summary-card">
                  <h4>Available Subjects</h4>
                  <div className="s-summary-value">
                    {visibleScheduleChoiceGroups.length}
                  </div>
                </div>
                <div className="s-summary-card">
                  <h4>Selected Schedules</h4>
                  <div className="s-summary-value">
                    {selectedOwnScheduleAssignments.length}
                  </div>
                </div>
                <div className="s-summary-card">
                  <h4>Conflicts</h4>
                  <div className="s-summary-value">
                    {ownScheduleConflicts.length}
                  </div>
                </div>
                {!isSHS ? (
                  <div className="s-summary-card">
                    <h4>Total Units</h4>
                    <div className="s-summary-value">{ownScheduleSelectedUnits}</div>
                  </div>
                ) : null}
              </div>

              {ownScheduleConflicts.length > 0 ? (
                <div className="s-own-schedule-warning">
                  <strong>Schedule conflict detected.</strong>
                  <ul className="s-own-schedule-warning-list">
                    {ownScheduleConflicts.map((conflict) => (
                      <li
                        key={`${conflict.leftAssignmentId}-${conflict.rightAssignmentId}`}
                      >
                        {conflict.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="s-own-schedule-grid">
                <div className="s-own-schedule-subjects">
                  {visibleScheduleChoiceGroups.length > 0 ? (
                    visibleScheduleChoiceGroups.map((group) => {
                      const selectedAssignment = group.assignmentOptions.find(
                        (assignment) =>
                          assignment.assignmentId ===
                          selectedAssignmentsBySubject[group.subjectId],
                      );
                      const isConflict =
                        selectedAssignment &&
                        ownScheduleConflictAssignmentIds.has(
                          selectedAssignment.assignmentId,
                        );

                      return (
                        <div
                          key={group.subjectId}
                          className={`s-own-schedule-subject-card${
                            isConflict ? " flagged" : ""
                          }`}
                        >
                          <div className="s-subject-header">
                            <div className="s-subject-code">
                              {group.subjectCode}
                            </div>
                            {typeof group.units === "number" && !isSHS ? (
                              <div className="s-subject-units">
                                {group.units} unit(s)
                              </div>
                            ) : null}
                          </div>

                          <h3 className="s-subject-title">{group.subjectName}</h3>

                          <div className="s-subject-details">
                            {selectedAssignment?.sectionCode ? (
                              <div className="s-subject-detail">
                                <span className="s-detail-label">Section:</span>
                                <span>{selectedAssignment.sectionCode}</span>
                              </div>
                            ) : null}
                            <div className="s-subject-detail">
                              <span className="s-detail-label">Schedule:</span>
                              <span>
                                {formatAssignmentScheduleDetails(
                                  selectedAssignment,
                                )}
                              </span>
                            </div>
                            <div className="s-subject-detail">
                              <span className="s-detail-label">Room:</span>
                              <span>
                                {formatAssignmentRoomDetails(selectedAssignment)}
                              </span>
                            </div>
                            <div className="s-subject-detail">
                              <span className="s-detail-label">Professor:</span>
                              <span>
                                {formatAssignmentProfessorDetails(
                                  selectedAssignment,
                                )}
                              </span>
                            </div>
                          </div>

                          <label className="s-own-schedule-field">
                            <span>Available schedules</span>
                            <select
                              value={
                                selectedAssignmentsBySubject[group.subjectId] || ""
                              }
                              onChange={(event) =>
                                handleOwnScheduleSelectionChange(
                                  group.subjectId,
                                  event.target.value,
                                )
                              }
                            >
                              <option value="">
                                {group.assignmentOptions.length > 0
                                  ? "Select a schedule"
                                  : "No offering available"}
                              </option>
                              {group.assignmentOptions.map((assignment) => (
                                <option
                                  key={assignment.assignmentId}
                                  value={assignment.assignmentId}
                                >
                                  {formatScheduleChoiceLabel(assignment)}
                                </option>
                              ))}
                            </select>
                          </label>

                          {group.assignmentOptions.length === 0 ? (
                            <p className="s-own-schedule-empty-option">
                              No scheduled offering is available for this subject
                              yet.
                            </p>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="s-no-subjects">
                      <p>
                        No available subject offerings were found for your own
                        schedule term yet. Please contact the registrar.
                      </p>
                    </div>
                  )}
                </div>

                <div className="s-own-schedule-selection-panel">
                  <h3>Selected Load</h3>
                  {selectedOwnScheduleAssignments.length > 0 ? (
                    <div className="s-own-schedule-selection-list">
                      {selectedOwnScheduleAssignments.map((assignment) => (
                        <div
                          key={assignment.assignmentId}
                          className={`s-own-schedule-selection-item ${
                            ownScheduleConflictAssignmentIds.has(
                              assignment.assignmentId,
                            )
                              ? "flagged"
                              : ""
                          }`}
                        >
                          <strong>
                            {assignment.subjectCode} - {assignment.subjectName}
                          </strong>
                          <span>{assignment.sectionCode || "No section"}</span>
                          <span>{formatScheduleChoiceLabel(assignment)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="s-own-schedule-empty-state">
                      Choose one schedule per subject to build your requested
                      load.
                    </div>
                  )}

                  <div className="s-own-schedule-actions">
                    <button
                      type="button"
                      className="s-filter-btn"
                      onClick={handleResetOwnScheduleSelections}
                    >
                      Clear Selections
                    </button>
                    <button
                      type="button"
                      className="s-download-btn"
                      onClick={() => void handleSubmitOwnScheduleRequest()}
                      disabled={
                        isSubmittingScheduleRequest ||
                        selectedOwnScheduleAssignments.length === 0
                      }
                    >
                      {isSubmittingScheduleRequest
                        ? "Submitting..."
                        : student?.ownScheduleSelectionStatus ===
                              "Pending Approval" ||
                            student?.ownScheduleSelectionStatus === "Rejected"
                          ? "Update Request"
                          : "Submit for Approval"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="s-grades-controls-row">
            <div className="s-grades-banner-subtitle">
              <span className="s-academic-year">
                <FaCalendarAlt /> {effectiveAcademicYear || "No Academic Year"}
              </span>
              <span className="s-semester">
                <FaGraduationCap /> {effectiveSemester || "No Semester"}
              </span>
            </div>

            <div className="s-grades-banner-actions">
              <button className="s-filter-btn" onClick={handleFilter}>
                <FaFilter /> Filter
              </button>
              <button
                className="s-download-btn"
                onClick={() => void handleDownloadSchedule()}
              >
                <FaDownload /> Download Schedule
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="s-filter-panel">
              <h3>Filter Subjects</h3>
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
                    {availableAcademicYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
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
                    {availableSemesters.map((semester) => (
                      <option key={semester} value={semester}>
                        {semester}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="s-subjects-grid">
            {filteredSubjects.length > 0 ? (
              filteredSubjects.map((subject) => (
                <div key={subject.id} className="s-subject-card">
                  <div className="s-subject-header">
                    <div className="s-subject-code">{subject.code}</div>
                    {subject.units && !isSHS ? (
                      <div className="s-subject-units">
                        {subject.units} unit(s)
                      </div>
                    ) : null}
                  </div>
                  <h3 className="s-subject-title">{subject.title}</h3>
                  <div className="s-subject-details">
                    {showIrregularSections && subject.section ? (
                      <div className="s-subject-detail">
                        <span className="s-detail-label">Section:</span>
                        <span>{subject.section}</span>
                      </div>
                    ) : null}
                    <div className="s-subject-detail">
                      <span className="s-detail-label">Schedule:</span>
                      <span>{subject.schedule}</span>
                    </div>
                    <div className="s-subject-detail">
                      <span className="s-detail-label">Room:</span>
                      <span>{subject.room}</span>
                    </div>
                    <div className="s-subject-detail">
                      <span className="s-detail-label">Professor:</span>
                      <span>{subject.professor}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="s-no-subjects">
                <p>{subjectsEmptyStateMessage}</p>
              </div>
            )}
          </div>

          {filteredSubjects.length > 0 ? (
            <div className="s-subjects-summary">
              <div className="s-summary-card">
                <h4>Total Subjects</h4>
                <div className="s-summary-value">{filteredSubjects.length}</div>
              </div>
              {!isSHS && filteredSubjects.some((subject) => subject.units) ? (
                <div className="s-summary-card">
                  <h4>Total Units</h4>
                  <div className="s-summary-value">
                    {filteredSubjects.reduce(
                      (sum, subject) => sum + (subject.units || 0),
                      0,
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default StudentSubjects;
