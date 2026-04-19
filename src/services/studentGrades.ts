import {
  normalizeBranchName,
  normalizeStudentNumberInput,
  readBranchScopedData,
  writeBranchScopedData,
} from "./adminStorage";

export type StudentGradeProgramType = "SHS" | "College";
export type StudentGradeEvaluation = "Passed" | "Failed" | "Incomplete";
export type StudentAcademicStandingLabel = "Regular" | "Irregular";

export interface UploadedStudentGradeRow {
  studentId: string;
  fullName: string;
  subjectCode: string;
  subjectTitle: string;
  grade: string;
  unit: string;
  gradingPeriod: string;
  programType: StudentGradeProgramType;
  academicYear?: string;
  semester?: string;
  branch?: string | null;
}

export interface StoredStudentGradeRecord {
  id: string;
  studentId: string;
  fullName: string;
  subjectCode: string;
  subjectTitle: string;
  units: number | null;
  gradingPeriod: string;
  semester: string;
  academicYear: string;
  programType: StudentGradeProgramType;
  grade: string;
  normalizedGrade: string;
  numericGrade: number | null;
  evaluation: StudentGradeEvaluation;
  updatedAt: string;
}

export interface UploadedStudentGradeValidationResult {
  normalizedRecord?: StoredStudentGradeRecord;
  errorReason?: string;
}

export interface StudentAcademicStandingSnapshot {
  label: StudentAcademicStandingLabel;
  reason: string;
  triggerGrades: StoredStudentGradeRecord[];
  pendingGroups: number;
}

const STUDENT_GRADE_STORAGE_SCOPE = "student-grades";
export const STUDENT_GRADE_RECORDS_UPDATED_EVENT = "aics-student-grades-updated";
const PASSING_GRADE = 75;
const SEMESTER_ORDER = ["1st Semester", "2nd Semester", "Summer"];
const SHS_QUARTER_ORDER = [
  "1st Quarter",
  "2nd Quarter",
  "3rd Quarter",
  "4th Quarter",
];

const getDefaultAcademicYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const normalizeAcademicYear = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return getDefaultAcademicYear();
  }

  const normalized = trimmed.replace(/\s+/g, "");
  const match = normalized.match(/^(\d{4})[-/](\d{4})$/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }

  return trimmed;
};

const normalizeSemester = (value?: string) => {
  const normalized = value?.trim().toLowerCase() || "";

  if (!normalized) {
    return "";
  }

  if (normalized.includes("summer")) {
    return "Summer";
  }

  if (
    normalized.includes("1st") ||
    normalized.includes("first") ||
    normalized === "sem 1" ||
    normalized === "sem1"
  ) {
    return "1st Semester";
  }

  if (
    normalized.includes("2nd") ||
    normalized.includes("second") ||
    normalized === "sem 2" ||
    normalized === "sem2"
  ) {
    return "2nd Semester";
  }

  return "";
};

const normalizeQuarterLabel = (value?: string) => {
  const normalized = value?.trim().toLowerCase() || "";

  if (!normalized) {
    return "";
  }

  if (
    normalized.includes("1st") ||
    normalized.includes("first") ||
    normalized.includes("q1") ||
    normalized.includes("quarter 1")
  ) {
    return "1st Quarter";
  }

  if (
    normalized.includes("2nd") ||
    normalized.includes("second") ||
    normalized.includes("q2") ||
    normalized.includes("quarter 2")
  ) {
    return "2nd Quarter";
  }

  if (
    normalized.includes("3rd") ||
    normalized.includes("third") ||
    normalized.includes("q3") ||
    normalized.includes("quarter 3")
  ) {
    return "3rd Quarter";
  }

  if (
    normalized.includes("4th") ||
    normalized.includes("fourth") ||
    normalized.includes("q4") ||
    normalized.includes("quarter 4")
  ) {
    return "4th Quarter";
  }

  return "";
};

const inferSemesterFromQuarter = (gradingPeriod?: string) => {
  const normalizedQuarter = normalizeQuarterLabel(gradingPeriod);

  if (
    normalizedQuarter === "1st Quarter" ||
    normalizedQuarter === "2nd Quarter"
  ) {
    return "1st Semester";
  }

  if (
    normalizedQuarter === "3rd Quarter" ||
    normalizedQuarter === "4th Quarter"
  ) {
    return "2nd Semester";
  }

  return "";
};

const normalizeGradingPeriod = (
  gradingPeriod: string,
  programType: StudentGradeProgramType,
) => {
  if (programType === "SHS") {
    return normalizeQuarterLabel(gradingPeriod) || gradingPeriod.trim();
  }

  const normalizedSemester = normalizeSemester(gradingPeriod);
  if (normalizedSemester) {
    return normalizedSemester;
  }

  const normalized = gradingPeriod.trim().toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized.includes("prefinal")) {
    return "Prefinal";
  }

  if (normalized.includes("midterm")) {
    return "Midterm";
  }

  if (normalized.includes("prelim")) {
    return "Prelim";
  }

  if (normalized.includes("final")) {
    return "Final";
  }

  if (normalized.includes("overall")) {
    return "Overall";
  }

  return gradingPeriod.trim();
};

const resolveSemester = (
  programType: StudentGradeProgramType,
  semester?: string,
  gradingPeriod?: string,
) => {
  const normalizedSemester = normalizeSemester(semester);
  if (normalizedSemester) {
    return normalizedSemester;
  }

  const gradingPeriodSemester = normalizeSemester(gradingPeriod);
  if (gradingPeriodSemester) {
    return gradingPeriodSemester;
  }

  if (programType === "SHS") {
    return inferSemesterFromQuarter(gradingPeriod);
  }

  return "";
};

const normalizeUnits = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const evaluateGradeValue = (
  rawValue: string,
  programType: StudentGradeProgramType,
): UploadedStudentGradeValidationResult & {
  normalizedGrade?: string;
  numericGrade?: number | null;
  evaluation?: StudentGradeEvaluation;
} => {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return { errorReason: "Missing Grade" };
  }

  const normalized = trimmed.toUpperCase();

  if (programType === "College") {
    if (normalized === "INC" || normalized === "INCOMPLETE") {
      return {
        normalizedGrade: "INC",
        numericGrade: null,
        evaluation: "Incomplete",
      };
    }

    if (
      normalized === "FAILED" ||
      normalized === "FAIL" ||
      normalized === "5.0"
    ) {
      return {
        normalizedGrade: normalized === "5.0" ? "5.0" : "FAILED",
        numericGrade: normalized === "5.0" ? 5 : null,
        evaluation: "Failed",
      };
    }
  }

  const numericGrade = Number(trimmed);
  if (
    Number.isFinite(numericGrade) &&
    numericGrade >= 0 &&
    numericGrade <= 100
  ) {
    return {
      normalizedGrade: trimmed,
      numericGrade,
      evaluation: numericGrade >= PASSING_GRADE ? "Passed" : "Failed",
    };
  }

  return {
    errorReason:
      programType === "College"
        ? "College grades must be 0-100, INC, Incomplete, FAIL, Failed, or 5.0"
        : "SHS grades must be numeric values from 0-100",
  };
};

const normalizeGradeStudentId = (
  studentId: string,
  branch?: string | null,
) => {
  const trimmedValue = studentId.trim();

  if (!trimmedValue) {
    return "";
  }

  const normalizedWithBranch = normalizeStudentNumberInput(trimmedValue, branch);
  if (normalizedWithBranch) {
    return normalizedWithBranch.toUpperCase();
  }

  const normalizedGeneric = normalizeStudentNumberInput(trimmedValue);
  if (normalizedGeneric) {
    return normalizedGeneric.toUpperCase();
  }

  return trimmedValue.toUpperCase();
};

const buildGradeRecordId = (row: {
  studentId: string;
  subjectCode: string;
  academicYear: string;
  semester: string;
  gradingPeriod: string;
}) =>
  [
    normalizeGradeStudentId(row.studentId),
    row.subjectCode.trim().toUpperCase(),
    row.academicYear.trim().toUpperCase(),
    row.semester.trim().toUpperCase(),
    row.gradingPeriod.trim().toUpperCase(),
  ].join("::");

const buildGradeRecordLookupKey = (
  record: Pick<
    StoredStudentGradeRecord,
    | "studentId"
    | "subjectCode"
    | "academicYear"
    | "semester"
    | "gradingPeriod"
    | "programType"
  >,
  branch?: string | null,
) =>
  buildGradeRecordId({
    studentId: normalizeGradeStudentId(record.studentId, branch),
    subjectCode: record.subjectCode,
    academicYear: normalizeAcademicYear(record.academicYear),
    semester: resolveSemester(
      record.programType,
      record.semester,
      record.gradingPeriod,
    ),
    gradingPeriod: record.gradingPeriod,
  });

const isTerminalCollegeGradeRecord = (record: StoredStudentGradeRecord) => {
  const normalizedPeriod = record.gradingPeriod.trim().toLowerCase();
  const normalizedSemester = record.semester.trim().toLowerCase();

  return (
    normalizedPeriod === normalizedSemester ||
    normalizedPeriod.includes("final") ||
    normalizedPeriod.includes("overall")
  );
};

const getCollegeStandingTriggerCandidates = (
  grades: StoredStudentGradeRecord[],
) => {
  const groupedGrades = new Map<string, StoredStudentGradeRecord[]>();

  grades
    .filter((record) => record.programType === "College")
    .forEach((record) => {
      const key = `${record.studentId}::${record.subjectCode}::${record.academicYear}::${record.semester}`;
      const existingGrades = groupedGrades.get(key) ?? [];
      groupedGrades.set(key, [...existingGrades, record]);
    });

  const candidates: StoredStudentGradeRecord[] = [];
  let pendingGroups = 0;

  groupedGrades.forEach((records) => {
    if (records.length === 1) {
      if (isTerminalCollegeGradeRecord(records[0])) {
        candidates.push(records[0]);
      } else {
        pendingGroups += 1;
      }
      return;
    }

    const terminalGrades = records.filter(isTerminalCollegeGradeRecord);

    if (terminalGrades.length > 0) {
      candidates.push(...terminalGrades);
      return;
    }

    pendingGroups += 1;
  });

  return { candidates, pendingGroups };
};

const sortGrades = (grades: StoredStudentGradeRecord[]) =>
  [...grades].sort((left, right) => {
    const academicYearComparison = left.academicYear.localeCompare(
      right.academicYear,
    );
    if (academicYearComparison !== 0) {
      return academicYearComparison;
    }

    const semesterComparison =
      SEMESTER_ORDER.indexOf(left.semester) - SEMESTER_ORDER.indexOf(right.semester);
    if (semesterComparison !== 0) {
      return semesterComparison;
    }

    if (left.programType === "SHS" && right.programType === "SHS") {
      const quarterComparison =
        SHS_QUARTER_ORDER.indexOf(left.gradingPeriod) -
        SHS_QUARTER_ORDER.indexOf(right.gradingPeriod);
      if (quarterComparison !== 0) {
        return quarterComparison;
      }
    }

    return (
      left.subjectCode.localeCompare(right.subjectCode) ||
      left.subjectTitle.localeCompare(right.subjectTitle) ||
      left.gradingPeriod.localeCompare(right.gradingPeriod)
    );
  });

export const validateAndNormalizeUploadedGradeRow = (
  row: UploadedStudentGradeRow,
  updatedAt = new Date().toISOString(),
): UploadedStudentGradeValidationResult => {
  const reasons: string[] = [];
  const studentId = normalizeGradeStudentId(row.studentId, row.branch);
  const fullName = row.fullName.trim();
  const subjectCode = row.subjectCode.trim();
  const subjectTitle = row.subjectTitle.trim();
  const gradingPeriod = normalizeGradingPeriod(row.gradingPeriod, row.programType);
  const semester = resolveSemester(
    row.programType,
    row.semester,
    row.gradingPeriod,
  );
  const academicYear = normalizeAcademicYear(row.academicYear);
  const units = normalizeUnits(row.unit);
  const gradeEvaluation = evaluateGradeValue(row.grade, row.programType);

  if (!studentId) reasons.push("Missing Student ID");
  if (!fullName) reasons.push("Missing Full Name");
  if (!subjectCode) reasons.push("Missing Subject Code");
  if (!subjectTitle) reasons.push("Missing Subject Title");
  if (units === null && row.unit.trim()) reasons.push("Units must be numeric");
  if (!gradingPeriod) reasons.push("Missing Grading Period");
  if (!semester) reasons.push("Missing Semester or unable to infer it");
  if (gradeEvaluation.errorReason) reasons.push(gradeEvaluation.errorReason);

  if (reasons.length > 0) {
    return { errorReason: reasons.join(", ") };
  }

  const normalizedRecord: StoredStudentGradeRecord = {
    id: buildGradeRecordId({
      studentId,
      subjectCode,
      academicYear,
      semester,
      gradingPeriod,
    }),
    studentId,
    fullName,
    subjectCode,
    subjectTitle,
    units,
    gradingPeriod,
    semester,
    academicYear,
    programType: row.programType,
    grade: row.grade.trim(),
    normalizedGrade: gradeEvaluation.normalizedGrade || row.grade.trim(),
    numericGrade: gradeEvaluation.numericGrade ?? null,
    evaluation: gradeEvaluation.evaluation || "Passed",
    updatedAt,
  };

  return { normalizedRecord };
};

export const readStudentGradeRecordsForBranch = (branch?: string | null) =>
  sortGrades(
    readBranchScopedData<StoredStudentGradeRecord[]>(
      STUDENT_GRADE_STORAGE_SCOPE,
      normalizeBranchName(branch),
    ) ?? [],
  );

export const writeStudentGradeRecordsForBranch = (
  branch: string | null | undefined,
  records: StoredStudentGradeRecord[],
) => {
  const resolvedBranch = normalizeBranchName(branch);
  writeBranchScopedData(
    STUDENT_GRADE_STORAGE_SCOPE,
    resolvedBranch,
    sortGrades(records),
  );

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(STUDENT_GRADE_RECORDS_UPDATED_EVENT, {
        detail: { branch: resolvedBranch },
      }),
    );
  }
};

export const upsertStudentGradeRecordsForBranch = (
  branch: string | null | undefined,
  records: StoredStudentGradeRecord[],
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const existingRecords = readStudentGradeRecordsForBranch(resolvedBranch);
  const recordMap = new Map<string, StoredStudentGradeRecord>();

  existingRecords.forEach((record) => {
    recordMap.set(buildGradeRecordLookupKey(record, resolvedBranch), record);
  });

  records.forEach((record) => {
    recordMap.set(buildGradeRecordLookupKey(record, resolvedBranch), record);
  });

  const nextRecords = Array.from(recordMap.values());
  writeStudentGradeRecordsForBranch(resolvedBranch, nextRecords);
  return sortGrades(nextRecords);
};

export const getStudentGradeRecords = ({
  branch,
  studentId,
}: {
  branch?: string | null;
  studentId: string;
}) => {
  const normalizedStudentId = normalizeGradeStudentId(studentId, branch);

  return readStudentGradeRecordsForBranch(branch).filter(
    (record) =>
      normalizeGradeStudentId(record.studentId, branch) === normalizedStudentId,
  );
};

export const getStudentAcademicStanding = ({
  branch,
  program,
  studentId,
}: {
  branch?: string | null;
  program: string;
  studentId: string;
}): StudentAcademicStandingSnapshot => {
  if (program !== "College") {
    return {
      label: "Regular",
      reason: "SHS students are treated as regular in this tracker.",
      triggerGrades: [],
      pendingGroups: 0,
    };
  }

  const grades = getStudentGradeRecords({ branch, studentId });
  const { candidates, pendingGroups } = getCollegeStandingTriggerCandidates(grades);
  const triggerGrades = candidates.filter(
    (record) =>
      record.evaluation === "Failed" || record.evaluation === "Incomplete",
  );

  if (triggerGrades.length > 0) {
    return {
      label: "Irregular",
      reason:
        "At least one uploaded final or semester grade is marked failed or incomplete.",
      triggerGrades: sortGrades(triggerGrades),
      pendingGroups,
    };
  }

  if (grades.length === 0) {
    return {
      label: "Regular",
      reason: "No college grade records have been uploaded yet.",
      triggerGrades: [],
      pendingGroups,
    };
  }

  if (pendingGroups > 0) {
    return {
      label: "Regular",
      reason:
        "No failed or incomplete final grades were found in the uploaded college records yet.",
      triggerGrades: [],
      pendingGroups,
    };
  }

  return {
    label: "Regular",
    reason: "No failed or incomplete final grades were found.",
    triggerGrades: [],
    pendingGroups,
  };
};
