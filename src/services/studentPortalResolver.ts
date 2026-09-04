import {
  getStudentPortalSubjects,
  getStudentPortalSubjectsFromScheduledAssignments,
  getStudentPortalSubjectsForSectionTerm,
  getStudentPortalSubjectsForTerm,
  getStudentScheduleSelectionRequest,
  normalizeBranchName,
  readBranchScopedData,
  type StudentPortalSubject,
  type StudentStorageRecord,
  type StudentSubjectPlanRecord,
} from "./adminStorage";
import { getLatestApprovedEnrollmentRequestForStudent } from "./enrollmentRequests";
import type { EnrollmentRequestedLoadRecord } from "./enrollmentLoadPlanner";
import {
  getStudentGradeRecords,
  hasCompletePassingShsSemesterGrades,
} from "./studentGrades";

export interface StudentPortalCurrentTerm {
  yearLevel: string;
  academicYear: string;
  semester: string;
  source:
    | "approved_enrollment"
    | "own_schedule"
    | "subject_load"
    | "shs_auto_progression"
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

const getNextAcademicYear = (academicYear: string) => {
  const match = academicYear.trim().match(/^(\d{4})-(\d{4})$/);

  if (!match) {
    return academicYear;
  }

  const startYear = Number(match[1]);
  const endYear = Number(match[2]);

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
    return academicYear;
  }

  return `${startYear + 1}-${endYear + 1}`;
};

const getSubjectSelectionKey = ({
  subjectId,
  subjectCode,
}: {
  subjectId?: string | null;
  subjectCode?: string | null;
}) => `${subjectId || ""}::${(subjectCode || "").trim().toUpperCase()}`;

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

const getDeferredOwnScheduleSubjects = ({
  resolvedStudentRecord,
  academicYear,
  semester,
  approvedSubjects,
}: {
  resolvedStudentRecord: StudentStorageRecord;
  academicYear: string;
  semester: string;
  approvedSubjects: StudentPortalSubject[];
}) => {
  if (approvedSubjects.length === 0) {
    return [];
  }

  const approvedSubjectKeys = new Set(
    approvedSubjects.flatMap((subject) => [
      getSubjectSelectionKey({
        subjectId: subject.id,
        subjectCode: subject.code,
      }),
      getSubjectSelectionKey({
        subjectCode: subject.code,
      }),
    ]),
  );
  const nextAcademicYear = getNextAcademicYear(academicYear);

  if (nextAcademicYear === academicYear) {
    return [];
  }

  return getStudentPortalSubjectsForTerm({
    branch: resolvedStudentRecord.branch,
    program: resolvedStudentRecord.program,
    yearLevel: resolvedStudentRecord.yearLevel,
    strandOrCourse: resolvedStudentRecord.strandOrCourse,
    academicYear: nextAcademicYear,
    semester,
  }).filter((subject) => {
    const subjectKeys = [
      getSubjectSelectionKey({
        subjectId: subject.id,
        subjectCode: subject.code,
      }),
      getSubjectSelectionKey({
        subjectCode: subject.code,
      }),
    ];

    return !subjectKeys.some((key) => approvedSubjectKeys.has(key));
  });
};

const excludeSubjectsForTerm = (
  subjects: StudentPortalSubject[],
  academicYear: string,
  semester: string,
) =>
  subjects.filter(
    (subject) =>
      subject.academicYear.trim() !== academicYear.trim() ||
      normalizeSemesterValue(subject.semester) !== normalizeSemesterValue(semester),
  );

const getApprovedOwnScheduleSubjects = ({
  resolvedStudentRecord,
  academicYear,
  semester,
}: {
  resolvedStudentRecord: StudentStorageRecord;
  academicYear: string;
  semester: string;
}) => {
  const branch = normalizeBranchName(resolvedStudentRecord.branch);
  const approvedScheduleRequest = getStudentScheduleSelectionRequest({
    branch,
    studentNumber: resolvedStudentRecord.id,
    trackingNumber: resolvedStudentRecord.trackingNumber,
    academicYear,
    semester,
  });
  const studentSubjectPlans =
    readBranchScopedData<Record<string, StudentSubjectPlanRecord>>(
      "student-subject-plans",
      branch,
    ) ?? {};
  const ownSchedulePlan = Object.values(studentSubjectPlans).find((plan) => {
    const matchesStudent =
      plan.studentNumber === resolvedStudentRecord.id ||
      Boolean(
        plan.trackingNumber &&
          resolvedStudentRecord.trackingNumber &&
          plan.trackingNumber === resolvedStudentRecord.trackingNumber,
      );

    return (
      matchesStudent &&
      plan.source === "student_schedule_request" &&
      plan.academicYear.trim() === academicYear.trim() &&
      normalizeSemesterValue(plan.semester) === normalizeSemesterValue(semester)
    );
  });

  if (resolvedStudentRecord.ownScheduleSelectionStatus !== "Approved") {
    if (ownSchedulePlan?.assignedSubjects.length) {
      return getStudentPortalSubjectsFromScheduledAssignments({
        branch,
        assignments: ownSchedulePlan.scheduledAssignments ?? [],
        plannedSubjects: ownSchedulePlan.assignedSubjects,
        academicYear,
        semester,
      });
    }

    return getStudentPortalSubjectsForTerm({
      branch,
      program: resolvedStudentRecord.program,
      yearLevel: resolvedStudentRecord.yearLevel,
      strandOrCourse: resolvedStudentRecord.strandOrCourse,
      academicYear,
      semester,
    });
  }

  if (!ownSchedulePlan?.scheduledAssignments?.length) {
    if (ownSchedulePlan?.assignedSubjects.length) {
      return getStudentPortalSubjectsFromScheduledAssignments({
        branch,
        assignments: ownSchedulePlan.scheduledAssignments ?? [],
        plannedSubjects: ownSchedulePlan.assignedSubjects,
        academicYear,
        semester,
      });
    }

    if (
      approvedScheduleRequest?.status !== "Approved" ||
      approvedScheduleRequest.academicYear.trim() !== academicYear.trim() ||
      normalizeSemesterValue(approvedScheduleRequest.semester) !==
        normalizeSemesterValue(semester) ||
      approvedScheduleRequest.selections.length === 0
    ) {
      return [];
    }

    return getStudentPortalSubjectsFromScheduledAssignments({
      branch,
      assignments: approvedScheduleRequest.selections,
      plannedSubjects: approvedScheduleRequest.selections.map((selection) => ({
        subjectId: selection.subjectId || selection.subjectCode,
        subjectCode: selection.subjectCode,
        subjectName: selection.subjectName,
        units: selection.units,
      })),
      academicYear,
      semester,
    });
  }

  return getStudentPortalSubjectsFromScheduledAssignments({
    branch,
    assignments: ownSchedulePlan.scheduledAssignments,
    plannedSubjects: ownSchedulePlan.assignedSubjects.map((subject) => ({
      subjectId: subject.subjectId || subject.subjectCode,
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
    })),
    academicYear,
    semester,
  });
};

const getOwnScheduleSelectionStatusForTerm = ({
  resolvedStudentRecord,
  academicYear,
  semester,
}: {
  resolvedStudentRecord: StudentStorageRecord;
  academicYear: string;
  semester: string;
}): StudentStorageRecord["ownScheduleSelectionStatus"] => {
  const matchingScheduleRequest = getStudentScheduleSelectionRequest({
    branch: resolvedStudentRecord.branch,
    studentNumber: resolvedStudentRecord.id,
    trackingNumber: resolvedStudentRecord.trackingNumber,
    academicYear,
    semester,
  });

  if (matchingScheduleRequest?.status === "Approved") {
    return "Approved";
  }

  if (matchingScheduleRequest?.status === "Rejected") {
    return "Rejected";
  }

  if (matchingScheduleRequest?.status === "Pending") {
    return "Pending Approval";
  }

  if (
    resolvedStudentRecord.ownScheduleAcademicYear?.trim() === academicYear.trim() &&
    normalizeSemesterValue(resolvedStudentRecord.ownScheduleSemester) ===
      normalizeSemesterValue(semester)
  ) {
    return resolvedStudentRecord.ownScheduleSelectionStatus || "Not Submitted";
  }

  return "Not Submitted";
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
  approvedRequestedLoadMode,
  approvedRequestedLoad,
  resolvedStudentRecord,
  resolvedYearLevel,
}: {
  approvedAcademicYear: string;
  approvedSemester: string;
  approvedMode?: "own_schedule" | "section_assignment";
  approvedRequestedLoadMode?: "retake";
  approvedRequestedLoad?: EnrollmentRequestedLoadRecord;
  resolvedStudentRecord: StudentStorageRecord;
  resolvedYearLevel: string;
}) => {
  if (approvedMode === "own_schedule") {
    return [];
  }

  if (approvedRequestedLoadMode !== "retake") {
    return getStudentPortalSubjectsForSectionTerm({
      branch: resolvedStudentRecord.branch,
      program: resolvedStudentRecord.program,
      yearLevel: resolvedYearLevel,
      strandOrCourse: resolvedStudentRecord.strandOrCourse,
      sectionCode: resolvedStudentRecord.section,
      semester: approvedSemester,
      academicYear: approvedAcademicYear,
    });
  }

  if (
    approvedRequestedLoadMode === "retake" &&
    approvedRequestedLoad?.scheduledAssignments.length
  ) {
    return getStudentPortalSubjectsFromScheduledAssignments({
      branch: resolvedStudentRecord.branch,
      assignments: approvedRequestedLoad.scheduledAssignments,
      plannedSubjects: approvedRequestedLoad.subjects.map((subject) => ({
        subjectId: subject.subjectId || subject.subjectCode,
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectTitle,
      })),
      academicYear: approvedAcademicYear,
      semester: approvedSemester,
      useProvidedTermForScheduledAssignments: true,
    });
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

const getRegularStudentSubjectsForTerm = ({
  resolvedStudentRecord,
  academicYear,
  semester,
}: {
  resolvedStudentRecord: StudentStorageRecord;
  academicYear: string;
  semester: string;
}) =>
  getStudentPortalSubjectsForSectionTerm({
    branch: resolvedStudentRecord.branch,
    program: resolvedStudentRecord.program,
    yearLevel: resolvedStudentRecord.yearLevel,
    strandOrCourse: resolvedStudentRecord.strandOrCourse,
    sectionCode: resolvedStudentRecord.section,
    academicYear,
    semester,
  });

const getShsAutoProgressedContext = ({
  resolvedStudentRecord,
  currentTerm,
  portalSubjects,
}: {
  resolvedStudentRecord: StudentStorageRecord;
  currentTerm: StudentPortalCurrentTerm;
  portalSubjects: StudentPortalSubject[];
}): ResolvedStudentPortalContext | null => {
  if (
    resolvedStudentRecord.program !== "SHS" ||
    normalizeSemesterValue(currentTerm.semester) !==
      normalizeSemesterValue("1st Semester")
  ) {
    return null;
  }

  const currentTermSubjects = portalSubjects.filter(
    (subject) =>
      subject.academicYear.trim() === currentTerm.academicYear.trim() &&
      normalizeSemesterValue(subject.semester) ===
        normalizeSemesterValue(currentTerm.semester),
  );
  const firstSemesterSubjects =
    currentTermSubjects.length > 0
      ? currentTermSubjects
      : getRegularStudentSubjectsForTerm({
          resolvedStudentRecord,
          academicYear: currentTerm.academicYear,
          semester: "1st Semester",
        });
  const gradeRecords = getStudentGradeRecords({
    branch: resolvedStudentRecord.branch,
    studentId: resolvedStudentRecord.id,
  }).filter((record) => record.programType === "SHS");

  if (
    !hasCompletePassingShsSemesterGrades({
      subjects: firstSemesterSubjects,
      gradeRecords,
      academicYear: currentTerm.academicYear,
      semester: "1st Semester",
    })
  ) {
    return null;
  }

  const nextSemester = "2nd Semester";
  const secondSemesterSubjects = getRegularStudentSubjectsForTerm({
    resolvedStudentRecord,
    academicYear: currentTerm.academicYear,
    semester: nextSemester,
  });

  return {
    resolvedStudentRecord,
    currentTerm: {
      yearLevel: resolvedStudentRecord.yearLevel,
      academicYear: currentTerm.academicYear,
      semester: nextSemester,
      source: "shs_auto_progression",
    },
    subjects: mergePortalSubjects(
      secondSemesterSubjects,
      excludeSubjectsForTerm(
        portalSubjects,
        currentTerm.academicYear,
        nextSemester,
      ),
    ),
  };
};

export const resolveStudentPortalContext = (
  storedStudent: StudentStorageRecord,
): ResolvedStudentPortalContext => {
  const approvedEnrollmentRequest = getLatestApprovedEnrollmentRequestForStudent({
    branch: storedStudent.branch,
    studentNumber: storedStudent.id,
    trackingNumber: storedStudent.trackingNumber,
  });
  const hasApprovedOwnScheduleRequest =
    approvedEnrollmentRequest?.irregularRequest?.mode === "own_schedule";
  const resolvedYearLevel =
    approvedEnrollmentRequest?.requestedYearLevel || storedStudent.yearLevel;
  const ownScheduleSelectionStatusForApprovedTerm =
    approvedEnrollmentRequest && hasApprovedOwnScheduleRequest
      ? getOwnScheduleSelectionStatusForTerm({
          resolvedStudentRecord: storedStudent,
          academicYear: approvedEnrollmentRequest.academicYear,
          semester: approvedEnrollmentRequest.semester,
        })
      : storedStudent.ownScheduleSelectionStatus;
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
    requestedOwnSchedule:
      hasApprovedOwnScheduleRequest || storedStudent.requestedOwnSchedule,
    ownScheduleRequestStatus: hasApprovedOwnScheduleRequest
      ? "Approved"
      : storedStudent.ownScheduleRequestStatus,
    ownScheduleAcademicYear: hasApprovedOwnScheduleRequest
      ? approvedEnrollmentRequest?.academicYear
      : storedStudent.ownScheduleAcademicYear,
    ownScheduleSemester: hasApprovedOwnScheduleRequest
      ? approvedEnrollmentRequest?.semester
      : storedStudent.ownScheduleSemester,
    ownScheduleSelectionStatus: hasApprovedOwnScheduleRequest
      ? ownScheduleSelectionStatusForApprovedTerm || "Not Submitted"
      : storedStudent.ownScheduleSelectionStatus,
  };
  const portalSubjects = getStudentPortalSubjects(resolvedStudentRecord);

  if (approvedEnrollmentRequest) {
    const isOwnScheduleEnrollment =
      approvedEnrollmentRequest.irregularRequest?.mode === "own_schedule";
    const approvedEnrollmentSubjects = isOwnScheduleEnrollment
      ? getApprovedOwnScheduleSubjects({
          resolvedStudentRecord,
          academicYear: approvedEnrollmentRequest.academicYear,
          semester: approvedEnrollmentRequest.semester,
        })
      : getApprovedEnrollmentSubjects({
          approvedAcademicYear: approvedEnrollmentRequest.academicYear,
          approvedSemester: approvedEnrollmentRequest.semester,
          approvedMode: approvedEnrollmentRequest.irregularRequest?.mode,
          approvedRequestedLoadMode: approvedEnrollmentRequest.requestedLoad?.mode,
          approvedRequestedLoad: approvedEnrollmentRequest.requestedLoad,
          resolvedStudentRecord,
          resolvedYearLevel,
        });
    const approvedEnrollmentFallbackSubjects =
      approvedEnrollmentSubjects.length === 0
        ? getStudentPortalSubjectsForTerm({
            branch: resolvedStudentRecord.branch,
            program: resolvedStudentRecord.program,
            yearLevel: resolvedYearLevel,
            strandOrCourse: resolvedStudentRecord.strandOrCourse,
            semester: approvedEnrollmentRequest.semester,
            academicYear: approvedEnrollmentRequest.academicYear,
          })
        : [];
    const nonCurrentTermPortalSubjects = excludeSubjectsForTerm(
      portalSubjects,
      approvedEnrollmentRequest.academicYear,
      approvedEnrollmentRequest.semester,
    );

    return {
      resolvedStudentRecord,
      currentTerm: {
        yearLevel: resolvedYearLevel,
        academicYear: approvedEnrollmentRequest.academicYear,
        semester: approvedEnrollmentRequest.semester,
        source: "approved_enrollment",
      },
      subjects: mergePortalSubjects(
        approvedEnrollmentSubjects,
        approvedEnrollmentFallbackSubjects,
        isOwnScheduleEnrollment
          ? getDeferredOwnScheduleSubjects({
              resolvedStudentRecord,
              academicYear: approvedEnrollmentRequest.academicYear,
              semester: approvedEnrollmentRequest.semester,
              approvedSubjects: approvedEnrollmentSubjects,
            })
          : [],
        nonCurrentTermPortalSubjects,
      ),
    };
  }

  if (
    storedStudent.ownScheduleRequestStatus === "Approved" &&
    storedStudent.ownScheduleAcademicYear &&
    storedStudent.ownScheduleSemester
  ) {
    const approvedOwnScheduleSubjects = getApprovedOwnScheduleSubjects({
      resolvedStudentRecord,
      academicYear: storedStudent.ownScheduleAcademicYear,
      semester: storedStudent.ownScheduleSemester,
    });

    return {
      resolvedStudentRecord,
      currentTerm: {
        yearLevel: resolvedStudentRecord.yearLevel,
        academicYear: storedStudent.ownScheduleAcademicYear,
        semester: storedStudent.ownScheduleSemester,
        source: "own_schedule",
      },
      subjects: mergePortalSubjects(
        approvedOwnScheduleSubjects,
        getDeferredOwnScheduleSubjects({
          resolvedStudentRecord,
          academicYear: storedStudent.ownScheduleAcademicYear,
          semester: storedStudent.ownScheduleSemester,
          approvedSubjects: approvedOwnScheduleSubjects,
        }),
        excludeSubjectsForTerm(
          portalSubjects,
          storedStudent.ownScheduleAcademicYear,
          storedStudent.ownScheduleSemester,
        ),
      ),
    };
  }

  const defaultCurrentTerm =
    getLatestPortalTermFromSubjects(portalSubjects, resolvedStudentRecord.yearLevel) ||
    {
      yearLevel: resolvedStudentRecord.yearLevel,
      academicYear: "2026-2027",
      semester: "1st Semester",
      source: "fallback" as const,
    };
  const shsAutoProgressedContext = getShsAutoProgressedContext({
    resolvedStudentRecord,
    currentTerm: defaultCurrentTerm,
    portalSubjects,
  });

  return (
    shsAutoProgressedContext || {
      resolvedStudentRecord,
      currentTerm: defaultCurrentTerm,
      subjects: portalSubjects,
    }
  );
};
