import {
  getStudentPortalSubjects,
  getStudentPortalSubjectsForTerm,
  type StudentPortalSubject,
  type StudentStorageRecord,
} from "./adminStorage";
import { getLatestApprovedEnrollmentRequestForStudent } from "./enrollmentRequests";

export interface StudentPortalCurrentTerm {
  yearLevel: string;
  academicYear: string;
  semester: string;
  source:
    | "approved_enrollment"
    | "own_schedule"
    | "subject_load"
    | "fallback";
}

export interface ResolvedStudentPortalContext {
  resolvedStudentRecord: StudentStorageRecord;
  currentTerm: StudentPortalCurrentTerm;
  subjects: StudentPortalSubject[];
}

const semesterSortOrder = ["1st Semester", "2nd Semester", "Summer"];

const getAcademicYearSortValue = (academicYear?: string) => {
  const match = academicYear?.match(/\d{4}/);
  return match ? Number(match[0]) : 0;
};

const getSemesterSortValue = (semester?: string) => {
  const index = semesterSortOrder.indexOf(semester || "");
  return index >= 0 ? index : -1;
};

const normalizeSemesterValue = (semester?: string | null) =>
  (semester || "").trim().toLowerCase();

const mergePortalSubjects = (...groups: StudentPortalSubject[][]) => {
  const mergedSubjects = new Map<string, StudentPortalSubject>();

  groups.flat().forEach((subject) => {
    const key = [
      subject.id,
      subject.code,
      subject.title,
      subject.academicYear,
      subject.semester,
    ].join("::");

    if (!mergedSubjects.has(key)) {
      mergedSubjects.set(key, subject);
    }
  });

  return Array.from(mergedSubjects.values());
};

const buildProgressedBlockSectionCode = ({
  currentSectionCode,
  requestedYearLevel,
}: {
  currentSectionCode?: string;
  requestedYearLevel: string;
}) => {
  const normalizedCode = currentSectionCode?.trim().toUpperCase();

  if (!normalizedCode) {
    return "";
  }

  const normalizedYearLevel = requestedYearLevel.trim().toLowerCase();
  const requestedYearCode = normalizedYearLevel.includes("2nd")
    ? "2"
    : normalizedYearLevel.includes("3rd")
      ? "3"
      : normalizedYearLevel.includes("4th")
        ? "4"
        : normalizedYearLevel.includes("grade 12")
          ? "2"
          : "1";
  const codeParts = normalizedCode.match(/^(.*?)([1-4])([A-Z]+)$/);

  if (!codeParts) {
    return normalizedCode;
  }

  const [, prefix, , blockLabel] = codeParts;
  return `${prefix}${requestedYearCode}${blockLabel}`;
};

const getLatestPortalTermFromSubjects = (
  subjects: StudentPortalSubject[],
  yearLevel: string,
): StudentPortalCurrentTerm | null => {
  const latestSubject = [...subjects].sort(
    (left, right) =>
      getAcademicYearSortValue(right.academicYear) -
        getAcademicYearSortValue(left.academicYear) ||
      getSemesterSortValue(right.semester) - getSemesterSortValue(left.semester) ||
      right.academicYear.localeCompare(left.academicYear) ||
      right.semester.localeCompare(left.semester),
  )[0];

  if (!latestSubject?.academicYear || !latestSubject.semester) {
    return null;
  }

  return {
    yearLevel,
    academicYear: latestSubject.academicYear,
    semester: latestSubject.semester,
    source: "subject_load",
  };
};

const getApprovedEnrollmentSubjects = ({
  approvedAcademicYear,
  approvedSemester,
  approvedMode,
  portalSubjects,
  resolvedStudentRecord,
  resolvedYearLevel,
}: {
  approvedAcademicYear: string;
  approvedSemester: string;
  approvedMode?: "own_schedule" | "section_assignment";
  portalSubjects: StudentPortalSubject[];
  resolvedStudentRecord: StudentStorageRecord;
  resolvedYearLevel: string;
}) => {
  const matchingResolvedSubjects = portalSubjects.filter(
    (subject) =>
      subject.academicYear.trim() === approvedAcademicYear.trim() &&
      normalizeSemesterValue(subject.semester) ===
        normalizeSemesterValue(approvedSemester),
  );

  if (matchingResolvedSubjects.length > 0) {
    return matchingResolvedSubjects;
  }

  if (approvedMode === "own_schedule") {
    return [];
  }

  return getStudentPortalSubjectsForTerm({
    branch: resolvedStudentRecord.branch,
    program: resolvedStudentRecord.program,
    yearLevel: resolvedYearLevel,
    strandOrCourse: resolvedStudentRecord.strandOrCourse,
    semester: approvedSemester,
    academicYear: approvedAcademicYear,
  });
};

export const resolveStudentPortalContext = (
  storedStudent: StudentStorageRecord,
): ResolvedStudentPortalContext => {
  const approvedEnrollmentRequest = getLatestApprovedEnrollmentRequestForStudent({
    branch: storedStudent.branch,
    studentNumber: storedStudent.id,
    trackingNumber: storedStudent.trackingNumber,
  });
  const resolvedYearLevel =
    approvedEnrollmentRequest?.requestedYearLevel || storedStudent.yearLevel;
  const resolvedStudentRecord: StudentStorageRecord = {
    ...storedStudent,
    yearLevel: resolvedYearLevel,
    section:
      approvedEnrollmentRequest?.irregularRequest?.mode === "own_schedule"
        ? ""
        : approvedEnrollmentRequest?.irregularRequest?.mode === "section_assignment"
          ? approvedEnrollmentRequest.irregularRequest.requestedSectionCode ||
            storedStudent.section
          : approvedEnrollmentRequest
            ? buildProgressedBlockSectionCode({
                currentSectionCode: storedStudent.section,
                requestedYearLevel: resolvedYearLevel,
              }) || storedStudent.section
            : storedStudent.section,
  };
  const portalSubjects = getStudentPortalSubjects(resolvedStudentRecord);

  if (approvedEnrollmentRequest) {
    const approvedEnrollmentSubjects = getApprovedEnrollmentSubjects({
      approvedAcademicYear: approvedEnrollmentRequest.academicYear,
      approvedSemester: approvedEnrollmentRequest.semester,
      approvedMode: approvedEnrollmentRequest.irregularRequest?.mode,
      portalSubjects,
      resolvedStudentRecord,
      resolvedYearLevel,
    });

    return {
      resolvedStudentRecord,
      currentTerm: {
        yearLevel: resolvedYearLevel,
        academicYear: approvedEnrollmentRequest.academicYear,
        semester: approvedEnrollmentRequest.semester,
        source: "approved_enrollment",
      },
      subjects: mergePortalSubjects(approvedEnrollmentSubjects, portalSubjects),
    };
  }

  if (
    storedStudent.ownScheduleRequestStatus === "Approved" &&
    storedStudent.ownScheduleAcademicYear &&
    storedStudent.ownScheduleSemester
  ) {
    return {
      resolvedStudentRecord,
      currentTerm: {
        yearLevel: resolvedStudentRecord.yearLevel,
        academicYear: storedStudent.ownScheduleAcademicYear,
        semester: storedStudent.ownScheduleSemester,
        source: "own_schedule",
      },
      subjects: portalSubjects,
    };
  }

  return {
    resolvedStudentRecord,
    currentTerm:
      getLatestPortalTermFromSubjects(portalSubjects, resolvedStudentRecord.yearLevel) ||
      {
        yearLevel: resolvedStudentRecord.yearLevel,
        academicYear: "2026-2027",
        semester: "1st Semester",
        source: "fallback",
      },
    subjects: portalSubjects,
  };
};
