import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";
import {
  getStudentsForBranch,
  normalizeBranchName,
  fetchAndCacheBranchScopedData,
  readBranchScopedData,
  readInstructorEvaluationSubmissions,
  writeBranchScopedData,
  type StudentStorageRecord,
} from "./adminStorage";
import {
  fetchAndCacheAcademicSnapshot,
  type AcademicClassSectionRecord,
  type AcademicInstructorRecord,
  type AcademicSubjectAssignmentRecord,
} from "./academicData";
import {
  fetchAndCacheStudentGradeRecordsForBranch,
  findApprovedStudentGradeConflict,
  getApprovedStudentGradeConflictMessage,
  readStudentGradeRecordsForBranch,
  validateAndNormalizeUploadedGradeRow,
  type StoredStudentGradeRecord,
  type StudentGradeProgramType,
  type StudentGradeUploadOperation,
} from "./studentGrades";
import {
  downloadStyledGradeTemplate,
  getStyledGradeTemplateFileName,
  type GradeTemplateSheet,
} from "./gradeTemplateBuilder";

const INSTRUCTOR_GRADE_SUBMISSIONS_SCOPE = "instructor-grade-submissions";
const INSTRUCTOR_GRADE_CHANGE_REQUESTS_SCOPE =
  "instructor-grade-change-requests";

if (typeof window !== "undefined") {
  const legacyPasswordKeyParts = [
    ":instructor-passwords:",
    ":instructor-password-change-required:",
  ];

  Object.keys(localStorage)
    .filter((key) =>
      legacyPasswordKeyParts.some((keyPart) => key.includes(keyPart)),
    )
    .forEach((key) => localStorage.removeItem(key));
}

type SupabaseErrorLike = {
  details?: string | null;
  hint?: string | null;
  message: string;
};

export interface InstructorGradeSubmission {
  id: string;
  branch: string;
  instructorId: string;
  instructorName: string;
  employeeId: string;
  fileName: string;
  fileMimeType?: string;
  fileDataBase64?: string;
  submittedAt: string;
  status: "Pending" | "Approved" | "Rejected" | "Error";
  records: StoredStudentGradeRecord[];
  errors: string[];
  errorRows?: InstructorGradeSubmissionErrorRow[];
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface InstructorGradeSubmissionErrorRow {
  sheetName: string;
  rowNumber: number;
  studentId: string;
  fullName: string;
  subjectCode: string;
  subjectTitle: string;
  units: string;
  grade: string;
  instructorName: string;
  academicYear: string;
  semester: string;
  gradingPeriod: string;
  programType: StudentGradeProgramType;
  errors: string[];
}

export interface InstructorGradeChangeRequestRow {
  id: string;
  studentId: string;
  fullName: string;
  section: string;
  subjectCode: string;
  subjectTitle: string;
  units: number | null;
  academicYear: string;
  semester: string;
  gradingPeriod: string;
  programType: StudentGradeProgramType;
  currentGrade: string;
  requestedGrade: string;
  currentRecord: StoredStudentGradeRecord;
  requestedRecord: StoredStudentGradeRecord;
}

export interface InstructorGradeChangeRequestErrorRow {
  sheetName: string;
  rowNumber: number;
  studentId: string;
  fullName: string;
  section: string;
  subjectCode: string;
  subjectTitle: string;
  units: string;
  academicYear: string;
  semester: string;
  gradingPeriod: string;
  programType: StudentGradeProgramType;
  currentGrade: string;
  requestedGrade: string;
  instructorName: string;
  errors: string[];
}

export interface InstructorGradeChangeRequest {
  id: string;
  branch: string;
  instructorId: string;
  instructorName: string;
  employeeId: string;
  fileName: string;
  submittedAt: string;
  status: "Pending" | "Approved" | "Rejected" | "Error";
  changes: InstructorGradeChangeRequestRow[];
  errors: string[];
  errorRows?: InstructorGradeChangeRequestErrorRow[];
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface InstructorGradeChangeTemplateFilters {
  sectionIds: string[];
  academicYear: string;
  semester: string;
  gradingPeriod: string;
}

type InstructorLoginRow = {
  id: string;
  branch: string;
  name: string;
  employee_id: string;
  department: string;
  email: string | null;
  contact_number: string | null;
  password_change_required: boolean;
};

type InstructorGradeSubmissionRow = {
  id: string;
  branch: string;
  instructor_id: string;
  instructor_name: string;
  employee_id: string;
  file_name: string;
  submitted_at: string;
  status: InstructorGradeSubmission["status"];
  records: StoredStudentGradeRecord[] | null;
  errors: string[] | null;
  error_rows?: InstructorGradeSubmissionErrorRow[] | null;
  file_mime_type?: string | null;
  file_data_base64?: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

const getErrorMessage = (error: SupabaseErrorLike) =>
  error.details
    ? `${error.message} ${error.details}`.trim()
    : error.hint
      ? `${error.message} ${error.hint}`.trim()
      : error.message;

const getSingleRow = <T,>(data: unknown): T | null => {
  if (Array.isArray(data)) {
    return data.length > 0 ? (data[0] as T) : null;
  }

  if (data && typeof data === "object" && !("error" in data)) {
    return data as T;
  }

  return null;
};

const mapInstructorSubmissionRow = (
  row: InstructorGradeSubmissionRow,
): InstructorGradeSubmission => ({
  id: row.id,
  branch: row.branch,
  instructorId: row.instructor_id,
  instructorName: row.instructor_name,
  employeeId: row.employee_id,
  fileName: row.file_name,
  fileMimeType: row.file_mime_type || undefined,
  fileDataBase64: row.file_data_base64 || undefined,
  submittedAt: row.submitted_at,
  status: row.status,
  records: Array.isArray(row.records) ? row.records : [],
  errors: Array.isArray(row.errors) ? row.errors : [],
  errorRows: Array.isArray(row.error_rows) ? row.error_rows : [],
  reviewedAt: row.reviewed_at || undefined,
  reviewedBy: row.reviewed_by || undefined,
});

const generateInstructorTemporaryPassword = () => {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    throw new Error("Secure password generation is unavailable in this browser.");
  }

  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%",
  ];
  const alphabet = groups.join("");
  const randomValues = crypto.getRandomValues(new Uint32Array(14));
  const passwordCharacters = groups.map(
    (group, index) => group[randomValues[index] % group.length],
  );

  for (let index = groups.length; index < randomValues.length; index += 1) {
    passwordCharacters.push(alphabet[randomValues[index] % alphabet.length]);
  }

  return passwordCharacters
    .map((character, index) => ({ character, order: randomValues[index] }))
    .sort((left, right) => left.order - right.order)
    .map(({ character }) => character)
    .join("");
};

export const setInstructorPassword = async ({
  branch,
  employeeId,
  currentPassword,
  password,
}: {
  branch?: string | null;
  employeeId: string;
  currentPassword: string;
  password: string;
}) => {
  const normalizedEmployeeId = employeeId.trim().toUpperCase();
  const { error } = await supabase.rpc("complete_instructor_password_setup", {
    p_branch: normalizeBranchName(branch),
    p_employee_id: normalizedEmployeeId,
    p_current_password: currentPassword,
    p_new_password: password,
  });

  if (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const resetInstructorTemporaryPassword = async ({
  branch,
  employeeId,
  password,
}: {
  branch?: string | null;
  employeeId: string;
  password?: string;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const normalizedEmployeeId = employeeId.trim().toUpperCase();
  const temporaryPassword = password || generateInstructorTemporaryPassword();

  const { error } = await supabase.rpc("set_instructor_temporary_password", {
    p_branch: resolvedBranch,
    p_employee_id: normalizedEmployeeId,
    p_password: temporaryPassword,
    p_require_password_change: true,
  });

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  return temporaryPassword;
};

export const authenticateInstructor = async ({
  branch,
  employeeId,
  password,
}: {
  branch?: string | null;
  employeeId: string;
  password: string;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const normalizedEmployeeId = employeeId.trim().toUpperCase();
  const { data, error } = await supabase
    .rpc("authenticate_instructor", {
      p_branch: resolvedBranch,
      p_employee_id: normalizedEmployeeId,
      p_password: password,
    })
    .returns<InstructorLoginRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<InstructorLoginRow>(data);
  if (!row) {
    throw new Error("Invalid instructor credentials.");
  }

  return {
    id: row.id,
    name: row.name,
    employeeId: row.employee_id,
    department: row.department,
    email: row.email || "",
    contactNumber: row.contact_number || "",
    branch: row.branch,
    passwordChangeRequired: Boolean(row.password_change_required),
  };
};

export const getInstructorGradeSubmissions = (branch?: string | null) =>
  readBranchScopedData<InstructorGradeSubmission[]>(
    INSTRUCTOR_GRADE_SUBMISSIONS_SCOPE,
    branch,
  ) ?? [];

export const fetchAndCacheInstructorGradeSubmissions = async (
  branch?: string | null,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("list_instructor_grade_submissions", {
      p_branch: resolvedBranch,
    })
    .returns<InstructorGradeSubmissionRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const submissions = (Array.isArray(data) ? data : []).map(
    mapInstructorSubmissionRow,
  );
  writeInstructorGradeSubmissions(resolvedBranch, submissions, {
    skipSupabaseSync: true,
  });
  return submissions;
};

export const writeInstructorGradeSubmissions = (
  branch: string | null | undefined,
  submissions: InstructorGradeSubmission[],
  options: { skipSupabaseSync?: boolean } = {},
) => {
  writeBranchScopedData(INSTRUCTOR_GRADE_SUBMISSIONS_SCOPE, branch, submissions);

  if (options.skipSupabaseSync) {
    return;
  }

  const resolvedBranch = normalizeBranchName(branch);
  void Promise.all(
    submissions.map((submission) =>
      supabase.rpc("upsert_instructor_grade_submission", {
        p_branch: resolvedBranch,
        p_submission: submission,
      }),
    ),
  ).then((results) => {
    const failedResult = results.find((result) => result.error);
    if (failedResult?.error) {
      console.warn(
        "Unable to sync instructor grade submissions to Supabase; local cache was updated.",
        failedResult.error,
      );
    }
  });
};

export const saveInstructorGradeSubmission = (
  branch: string | null | undefined,
  submission: InstructorGradeSubmission,
) => {
  const existing = getInstructorGradeSubmissions(branch);
  writeInstructorGradeSubmissions(branch, [
    submission,
    ...existing.filter((item) => item.id !== submission.id),
  ]);
};

const sortGradeChangeRequests = (requests: InstructorGradeChangeRequest[]) =>
  [...requests].sort(
    (left, right) =>
      Date.parse(right.submittedAt) - Date.parse(left.submittedAt),
  );

export const getInstructorGradeChangeRequests = (branch?: string | null) =>
  sortGradeChangeRequests(
    readBranchScopedData<InstructorGradeChangeRequest[]>(
      INSTRUCTOR_GRADE_CHANGE_REQUESTS_SCOPE,
      branch,
    ) ?? [],
  );

export const fetchAndCacheInstructorGradeChangeRequests = async (
  branch?: string | null,
) => {
  const requests =
    (await fetchAndCacheBranchScopedData<InstructorGradeChangeRequest[]>(
      INSTRUCTOR_GRADE_CHANGE_REQUESTS_SCOPE,
      branch,
    )) ?? [];

  return sortGradeChangeRequests(requests);
};

export const writeInstructorGradeChangeRequests = (
  branch: string | null | undefined,
  requests: InstructorGradeChangeRequest[],
) => {
  const sortedRequests = sortGradeChangeRequests(requests);
  writeBranchScopedData(
    INSTRUCTOR_GRADE_CHANGE_REQUESTS_SCOPE,
    branch,
    sortedRequests,
  );
  return sortedRequests;
};

export const saveInstructorGradeChangeRequest = (
  branch: string | null | undefined,
  request: InstructorGradeChangeRequest,
) => {
  const existing = getInstructorGradeChangeRequests(branch);
  return writeInstructorGradeChangeRequests(branch, [
    request,
    ...existing.filter((item) => item.id !== request.id),
  ]);
};

const downloadBlob = (fileName: string, blob: Blob) => {
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = downloadUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(downloadUrl);
};

const base64ToUint8Array = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

export const downloadInstructorSubmittedFile = (
  submission: InstructorGradeSubmission,
) => {
  if (!submission.fileDataBase64) {
    throw new Error("This submission does not have a saved uploaded file.");
  }

  const bytes = base64ToUint8Array(submission.fileDataBase64);
  downloadBlob(
    submission.fileName,
    new Blob([bytes], {
      type:
        submission.fileMimeType ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
};

const buildSubmissionErrorFileName = (fileName: string) => {
  const baseName =
    fileName
      .trim()
      .replace(/\.[^/.]+$/, "")
      .replace(/[<>:"/\\|?*]+/g, "_")
      .replace(/\s+/g, "_") || "grade_upload";

  return `${baseName}_errors.xlsx`;
};

export const downloadInstructorSubmissionErrorFile = (
  submission: InstructorGradeSubmission,
) => {
  const errorRows = submission.errorRows ?? [];

  if (errorRows.length === 0) {
    throw new Error("This submission does not have row errors to download.");
  }

  const rows = [
    [
      "Sheet",
      "Excel Row",
      "Student ID",
      "Full Name",
      "Subject Code",
      "Subject Title",
      "Units",
      "Grade",
      "Instructor",
      "Academic Year",
      "Semester",
      "Grading Period",
      "Program Type",
      "Problems",
    ],
    ...errorRows.map((row) => [
      row.sheetName,
      row.rowNumber,
      row.studentId,
      row.fullName,
      row.subjectCode,
      row.subjectTitle,
      row.units,
      row.grade,
      row.instructorName,
      row.academicYear,
      row.semester,
      row.gradingPeriod,
      row.programType,
      row.errors.join("; "),
    ]),
  ];
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  worksheet["!cols"] = [
    18, 10, 18, 28, 16, 34, 10, 12, 28, 16, 16, 18, 14, 72,
  ].map((width) => ({ wch: width }));
  XLSX.utils.book_append_sheet(workbook, worksheet, "Errors");
  XLSX.writeFile(workbook, buildSubmissionErrorFileName(submission.fileName));
};

const normalizeValue = (value?: string | null) =>
  (value || "").trim().toLowerCase();

const studentMatchesSection = (
  student: StudentStorageRecord,
  section: AcademicClassSectionRecord,
) =>
  section.enrolleeIds.includes(student.id) ||
  normalizeValue(student.section) === normalizeValue(section.code) ||
  normalizeValue(student.section) === normalizeValue(section.section);

export const getInstructorScopedData = async ({
  branch,
  instructorId,
}: {
  branch?: string | null;
  instructorId: string;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const snapshot = await fetchAndCacheAcademicSnapshot(resolvedBranch);
  const assignments = snapshot.subjectAssignments.filter(
    (assignment) => assignment.instructorId === instructorId,
  );
  const sectionIds = new Set(assignments.map((assignment) => assignment.sectionId));
  const sectionCodes = new Set(assignments.map((assignment) => assignment.sectionCode));
  const sections = snapshot.classSections.filter(
    (section) => sectionIds.has(section.id) || sectionCodes.has(section.code),
  );
  const students = getStudentsForBranch(resolvedBranch).filter(
    (student) =>
      student.status !== "Archived" &&
      sections.some((section) => studentMatchesSection(student, section)),
  );

  return {
    snapshot,
    instructor: snapshot.instructors.find((item) => item.id === instructorId),
    assignments,
    sections,
    students,
  };
};

export const getInstructorEvaluationProgress = ({
  branch,
  instructorId,
  students,
}: {
  branch?: string | null;
  instructorId: string;
  students: StudentStorageRecord[];
}) => {
  const submissions = readInstructorEvaluationSubmissions(branch).filter(
    (submission) => submission.instructorId === instructorId,
  );
  const submittedStudentNumbers = new Set(
    submissions.map((submission) => submission.studentNumber),
  );
  const done = students.filter((student) => submittedStudentNumbers.has(student.id));

  return {
    doneCount: done.length,
    pendingCount: Math.max(0, students.length - done.length),
    totalCount: students.length,
  };
};

const getProgramType = (section?: AcademicClassSectionRecord): StudentGradeProgramType =>
  section?.program === "SHS" ? "SHS" : "College";

const getGradingPeriod = (programType: StudentGradeProgramType, semester: string) =>
  programType === "SHS"
    ? semester.toLowerCase().includes("2nd")
      ? "3rd Quarter"
      : "1st Quarter"
    : semester;

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

const getSectionAcademicDescriptor = (
  section: AcademicClassSectionRecord,
  sectionStudents: StudentStorageRecord[],
) =>
  section.strand?.trim() ||
  sectionStudents.find((student) => student.strandOrCourse?.trim())
    ?.strandOrCourse?.trim() ||
  "";

type InstructorTemplateSubject = {
  id: string;
  code: string;
  name: string;
  units?: number;
  semester?: string;
};

const normalizeTemplateLookupValue = (value?: string | null) =>
  (value || "").trim().toUpperCase();

const getAssignmentUnits = (
  assignment: AcademicSubjectAssignmentRecord,
  subjects: InstructorTemplateSubject[],
) => {
  const subjectId = normalizeTemplateLookupValue(assignment.subjectId);
  const subjectCode = normalizeTemplateLookupValue(assignment.subjectCode);
  const semester = normalizeTemplateLookupValue(assignment.semester);
  const matchedSubject =
    subjects.find(
      (subject) =>
        normalizeTemplateLookupValue(subject.id) === subjectId &&
        (!semester || normalizeTemplateLookupValue(subject.semester) === semester),
    ) ??
    subjects.find(
      (subject) =>
        normalizeTemplateLookupValue(subject.code) === subjectCode &&
        (!semester || normalizeTemplateLookupValue(subject.semester) === semester),
    ) ??
    subjects.find(
      (subject) => normalizeTemplateLookupValue(subject.code) === subjectCode,
    );

  return matchedSubject?.units === undefined || matchedSubject.units === null
    ? ""
    : String(matchedSubject.units);
};

const buildInstructorTemplateRows = ({
  assignments,
  programType,
  subjects,
  students,
}: {
  assignments: AcademicSubjectAssignmentRecord[];
  programType: StudentGradeProgramType;
  subjects: InstructorTemplateSubject[];
  students: StudentStorageRecord[];
}) =>
  students.flatMap((student) =>
    assignments.map((assignment) => {
      const units = getAssignmentUnits(assignment, subjects);

      return programType === "College"
        ? [
            student.id,
            student.name,
            assignment.subjectCode,
            assignment.subjectName,
            units,
            "",
            "",
            assignment.instructorName,
            "",
            "",
          ]
        : [
            student.id,
            student.name,
            assignment.subjectCode,
            assignment.subjectName,
            getGradingPeriod(programType, assignment.semester),
            "",
            "",
            assignment.instructorName,
            "",
            "",
          ];
    }),
  );

type InstructorGradeWorksheetRow = Array<string | number | boolean | null | undefined>;

const getCellText = (value: unknown) => String(value ?? "").trim();

const normalizeHeaderKey = (value: unknown) =>
  getCellText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");

const findGradeHeaderRowIndex = (rows: InstructorGradeWorksheetRow[]) =>
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

  return matchedEntry ? String(matchedEntry[1] ?? "") : "";
};

const getMetadataValue = (
  rows: InstructorGradeWorksheetRow[],
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

const normalizeErrorCheckValue = (value?: string | null) =>
  (value || "").trim().toUpperCase().replace(/\s+/g, " ");

const valuesMatch = (left?: string | null, right?: string | null) =>
  normalizeErrorCheckValue(left) === normalizeErrorCheckValue(right);

const getUniqueMessages = (messages: string[]) =>
  Array.from(new Set(messages.map((message) => message.trim()).filter(Boolean)));

const getRowHasRelevantGradeData = (row: Record<string, unknown>) =>
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
  ].some((alias) => getValueByAliases(row, [alias]).trim() !== "");

const getInstructorRowValidationErrors = ({
  allowedAssignments,
  branchStudents,
  instructor,
  row,
  validationErrorReason,
  subjects,
}: {
  allowedAssignments: AcademicSubjectAssignmentRecord[];
  branchStudents: StudentStorageRecord[];
  instructor: AcademicInstructorRecord;
  row: InstructorGradeSubmissionErrorRow;
  validationErrorReason?: string;
  subjects: InstructorTemplateSubject[];
}) => {
  const messages = validationErrorReason
    ? validationErrorReason.split(",").map((message) => message.trim())
    : [];
  const normalizedStudentId = normalizeErrorCheckValue(row.studentId);
  const normalizedSubjectCode = normalizeErrorCheckValue(row.subjectCode);
  const matchedStudent = branchStudents.find(
    (student) => normalizeErrorCheckValue(student.id) === normalizedStudentId,
  );
  const matchedAssignment = allowedAssignments.find(
    (assignment) =>
      normalizeErrorCheckValue(assignment.subjectCode) === normalizedSubjectCode,
  );
  const matchedSubject = subjects.find(
    (subject) => normalizeErrorCheckValue(subject.code) === normalizedSubjectCode,
  );
  const expectedUnits =
    matchedAssignment && row.programType !== "SHS"
      ? getAssignmentUnits(matchedAssignment, subjects)
      : "";

  if (row.studentId && !matchedStudent) {
    messages.push(`No student found with Student ID ${row.studentId}.`);
  }

  if (row.subjectCode && !matchedSubject && !matchedAssignment) {
    messages.push(`No subject found with Subject Code ${row.subjectCode}.`);
  }

  if (row.subjectCode && !matchedAssignment) {
    messages.push(
      `Subject Code ${row.subjectCode} is not assigned to ${instructor.name}.`,
    );
  }

  if (row.subjectTitle && matchedAssignment) {
    const titleMatchesAssignment = valuesMatch(
      row.subjectTitle,
      matchedAssignment.subjectName,
    );
    const titleMatchesCatalog =
      matchedSubject && valuesMatch(row.subjectTitle, matchedSubject.name);

    if (!titleMatchesAssignment && !titleMatchesCatalog) {
      messages.push(
        `Subject Title "${row.subjectTitle}" does not match ${matchedAssignment.subjectName}.`,
      );
    }
  }

  if (expectedUnits) {
    if (!row.units) {
      messages.push(`Missing Units. Expected ${expectedUnits}.`);
    } else if (Number(row.units) !== Number(expectedUnits)) {
      messages.push(
        `Units "${row.units}" does not match ${row.subjectCode}; expected ${expectedUnits}.`,
      );
    }
  }

  if (row.instructorName && matchedAssignment) {
    const instructorMatches =
      valuesMatch(row.instructorName, matchedAssignment.instructorName) ||
      valuesMatch(row.instructorName, instructor.name);

    if (!instructorMatches) {
      messages.push(
        `Instructor "${row.instructorName}" does not exist.`,
      );
    }
  }

  return getUniqueMessages(messages);
};

export const downloadInstructorGradeTemplate = ({
  instructor,
  branch,
  assignments,
  sections,
  students,
}: {
  instructor: AcademicInstructorRecord;
  branch?: string | null;
  assignments: AcademicSubjectAssignmentRecord[];
  sections: AcademicClassSectionRecord[];
  students: StudentStorageRecord[];
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const subjects =
    readBranchScopedData<InstructorTemplateSubject[]>(
      "subjects",
      resolvedBranch,
    ) ?? [];
  const sheetsByProgram = new Map<StudentGradeProgramType, GradeTemplateSheet[]>();
  const usedSheetNamesByProgram = new Map<StudentGradeProgramType, Set<string>>();

  sections.forEach((section) => {
    const programType = getProgramType(section);
    const sectionStudents = students.filter((student) =>
      studentMatchesSection(student, section),
    );
    const sectionAssignments = assignments.filter(
      (assignment) =>
        assignment.sectionId === section.id || assignment.sectionCode === section.code,
    );

    if (sectionAssignments.length === 0) {
      return;
    }

    const usedSheetNames =
      usedSheetNamesByProgram.get(programType) ?? new Set<string>();
    usedSheetNamesByProgram.set(programType, usedSheetNames);

    const existingSheets = sheetsByProgram.get(programType) ?? [];
    existingSheets.push({
      academicYear: sectionAssignments[0]?.academicYear || "2026-2027",
      descriptor: getSectionAcademicDescriptor(section, sectionStudents),
      rows: buildInstructorTemplateRows({
        assignments: sectionAssignments,
        programType,
        subjects,
        students: sectionStudents.sort(
          (left, right) =>
            left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
        ),
      }),
      sectionCode: section.code,
      semester: sectionAssignments[0]?.semester || section.semester || "",
      sheetName: getUniqueSheetName(section.code, usedSheetNames),
      yearLevel: section.yearLevel,
    });
    sheetsByProgram.set(programType, existingSheets);
  });

  return Promise.all(
    Array.from(sheetsByProgram.entries()).map(([programType, sheets]) =>
      downloadStyledGradeTemplate({
        branch: resolvedBranch,
        fileName: getStyledGradeTemplateFileName(
          programType,
          `${instructor.employeeId}-${resolvedBranch}`,
        ),
        templateType: programType,
        sheets,
      }),
    ),
  ).then(() => undefined);
};

const getAssignmentSectionKey = (assignment: AcademicSubjectAssignmentRecord) =>
  `${assignment.sectionId || ""}::${assignment.sectionCode || ""}`;

const getSectionKey = (section: AcademicClassSectionRecord) =>
  `${section.id || ""}::${section.code || ""}`;

const getSelectedSections = (
  sections: AcademicClassSectionRecord[],
  selectedSectionIds: string[],
) => {
  const selectedIds = new Set(selectedSectionIds);
  return selectedIds.size === 0
    ? sections
    : sections.filter(
        (section) => selectedIds.has(section.id) || selectedIds.has(section.code),
      );
};

const getGradeChangeTemplatePrefix = ({
  employeeId,
  academicYear,
  semester,
  gradingPeriod,
}: {
  employeeId: string;
  academicYear: string;
  semester: string;
  gradingPeriod: string;
}) => {
  const suffix = [academicYear, semester, gradingPeriod]
    .join("_")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${employeeId || "instructor"}_grade_change_request${
    suffix ? `_${suffix}` : ""
  }`;
};

const getChangeRequestGradingPeriod = (
  programType: StudentGradeProgramType,
  semester: string,
  gradingPeriod: string,
) => (programType === "SHS" ? gradingPeriod : semester);

const getGradeRecordsForChangeRequests = async (branch: string) => {
  let gradeRecords = readStudentGradeRecordsForBranch(branch);

  try {
    gradeRecords = await fetchAndCacheStudentGradeRecordsForBranch(branch);
  } catch (error) {
    console.warn(
      "Unable to load approved student grades from Supabase; using local cache.",
      error,
    );
  }

  return gradeRecords;
};

export const downloadInstructorGradeChangeTemplate = async ({
  instructor,
  branch,
  assignments,
  sections,
  students,
  filters,
}: {
  instructor: AcademicInstructorRecord;
  branch?: string | null;
  assignments: AcademicSubjectAssignmentRecord[];
  sections: AcademicClassSectionRecord[];
  students: StudentStorageRecord[];
  filters: InstructorGradeChangeTemplateFilters;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const selectedSections = getSelectedSections(sections, filters.sectionIds);
  const gradeRecords = await getGradeRecordsForChangeRequests(resolvedBranch);
  const sheetsByProgram = new Map<StudentGradeProgramType, GradeTemplateSheet[]>();
  const usedSheetNamesByProgram = new Map<StudentGradeProgramType, Set<string>>();

  selectedSections.forEach((section) => {
    const programType = getProgramType(section);
    const gradingPeriod = getChangeRequestGradingPeriod(
      programType,
      filters.semester,
      filters.gradingPeriod,
    );
    const sectionStudents = students
      .filter((student) => studentMatchesSection(student, section))
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      );
    const sectionKey = getSectionKey(section);
    const sectionCode = normalizeTemplateLookupValue(section.code);
    const sectionAssignments = assignments.filter(
      (assignment) =>
        (getAssignmentSectionKey(assignment) === sectionKey ||
          normalizeTemplateLookupValue(assignment.sectionCode) === sectionCode) &&
        normalizeTemplateLookupValue(assignment.semester) ===
          normalizeTemplateLookupValue(filters.semester),
    );

    const rows: string[][] = [];

    sectionStudents.forEach((student) => {
      sectionAssignments.forEach((assignment) => {
        const currentRecord = findApprovedStudentGradeConflict({
          branch: resolvedBranch,
          record: {
            studentId: student.id,
            subjectCode: assignment.subjectCode,
            academicYear: filters.academicYear,
            semester: filters.semester,
            gradingPeriod,
            programType,
          },
          existingRecords: gradeRecords,
        });

        if (!currentRecord) {
          return;
        }

        rows.push([
          student.id,
          student.name,
          assignment.subjectCode,
          assignment.subjectName,
          programType === "SHS"
            ? gradingPeriod
            : currentRecord.units === null || currentRecord.units === undefined
              ? ""
              : String(currentRecord.units),
          currentRecord.normalizedGrade,
          "",
          instructor.name,
          "",
        ]);
      });
    });

    if (rows.length === 0) {
      return;
    }

    const usedSheetNames =
      usedSheetNamesByProgram.get(programType) ?? new Set<string>();
    usedSheetNamesByProgram.set(programType, usedSheetNames);
    const existingSheets = sheetsByProgram.get(programType) ?? [];

    existingSheets.push({
      academicYear: filters.academicYear,
      descriptor: getSectionAcademicDescriptor(section, sectionStudents),
      headerOverrides: {
        E: programType === "SHS" ? "QUARTER" : "UNITS",
        F: "CURRENT GRADE",
        G: "REQUESTED GRADE",
      },
      rows,
      sectionCode: section.code,
      semester: filters.semester,
      sheetName: getUniqueSheetName(section.code, usedSheetNames),
      yearLevel: section.yearLevel,
    });
    sheetsByProgram.set(programType, existingSheets);
  });

  if (
    Array.from(sheetsByProgram.values()).every(
      (programSheets) => programSheets.length === 0,
    )
  ) {
    throw new Error(
      "No approved grades were found for the selected section and term.",
    );
  }

  const prefix = getGradeChangeTemplatePrefix({
    employeeId: instructor.employeeId,
    academicYear: filters.academicYear,
    semester: filters.semester,
    gradingPeriod: filters.gradingPeriod,
  });

  await Promise.all(
    Array.from(sheetsByProgram.entries()).map(([programType, sheets]) =>
      downloadStyledGradeTemplate({
        branch: resolvedBranch,
        fileName: getStyledGradeTemplateFileName(programType, prefix),
        templateType: programType,
        sheets,
      }),
    ),
  );
};

const getRowHasRelevantGradeChangeData = (row: Record<string, unknown>) =>
  [
    "Student ID",
    "STUDENT_ID",
    "Full Name",
    "FULL NAME",
    "Section",
    "Subject Code",
    "SUBJECT_CODE",
    "Subject Title",
    "SUBJECT_TITLE",
    "Current Grade",
    "CURRENT_GRADE",
    "Requested Grade",
    "REQUESTED_GRADE",
  ].some((alias) => getValueByAliases(row, [alias]).trim() !== "");

export const parseInstructorGradeChangeWorkbook = async ({
  file,
  branch,
  instructor,
  allowedAssignments,
}: {
  file: File;
  branch?: string | null;
  instructor: AcademicInstructorRecord;
  allowedAssignments: AcademicSubjectAssignmentRecord[];
}) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const resolvedBranch = normalizeBranchName(branch);
  const gradeRecords = await getGradeRecordsForChangeRequests(resolvedBranch);
  const branchStudents = getStudentsForBranch(resolvedBranch).filter(
    (student) => student.status !== "Archived",
  );
  const changes: InstructorGradeChangeRequestRow[] = [];
  const errors: string[] = [];
  const errorRows: InstructorGradeChangeRequestErrorRow[] = [];
  let skippedBlankRows = 0;

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json<InstructorGradeWorksheetRow>(
      worksheet,
      {
        header: 1,
        defval: "",
        blankrows: false,
      },
    );
    const headerRowIndex = findGradeHeaderRowIndex(sheetRows);

    if (headerRowIndex === -1) {
      errors.push(`${sheetName}: grade change template headers were not found.`);
      return;
    }

    const headerRow = sheetRows[headerRowIndex] ?? [];
    const templateAcademicYear = getMetadataValue(sheetRows, headerRowIndex, [
      "ACADEMIC_YEAR",
      "ACADEMIC YEAR",
      "SCHOOL_YEAR",
      "SCHOOL YEAR",
    ]);
    const templateSemester = getMetadataValue(sheetRows, headerRowIndex, [
      "SEMESTER",
    ]);
    const templateSection = getMetadataValue(sheetRows, headerRowIndex, [
      "SECTION",
    ]);
    const templateProgramType = getMetadataValue(sheetRows, headerRowIndex, [
      "PROGRAM",
    ]);

    sheetRows
      .slice(headerRowIndex + 1)
      .map((row, rowOffset) => ({
        rowNumber: headerRowIndex + rowOffset + 2,
        values: headerRow.reduce<Record<string, unknown>>(
          (record, headerCell, index) => {
            const key = getCellText(headerCell);
            if (key) {
              record[key] = row[index] ?? "";
            }
            return record;
          },
          {},
        ),
      }))
      .filter((entry) => getRowHasRelevantGradeChangeData(entry.values))
      .forEach(({ rowNumber, values: row }) => {
        const requestedGrade = getValueByAliases(row, [
          "Requested Grade",
          "REQUESTED_GRADE",
          "New Grade",
          "NEW_GRADE",
        ]).trim();

        if (!requestedGrade) {
          skippedBlankRows += 1;
          return;
        }

        const studentId = getValueByAliases(row, ["Student ID", "STUDENT_ID"]);
        const fullName = getValueByAliases(row, ["Full Name", "FULL NAME"]);
        const section = getValueByAliases(row, ["Section"]);
        const resolvedSection = section || templateSection;
        const subjectCode = getValueByAliases(row, [
          "Subject Code",
          "SUBJECT_CODE",
        ]);
        const subjectTitle = getValueByAliases(row, [
          "Subject Title",
          "SUBJECT_TITLE",
        ]);
        const units = getValueByAliases(row, ["Unit", "Units", "UNITS"]);
        const academicYear =
          getValueByAliases(row, ["Academic Year", "ACADEMIC_YEAR"]) ||
          templateAcademicYear;
        const semester =
          getValueByAliases(row, ["Semester", "SEMESTER"]) || templateSemester;
        const programType =
          (getValueByAliases(row, ["Program Type", "PROGRAM"]) ||
            templateProgramType)
            .trim()
            .toUpperCase() === "SHS"
            ? "SHS"
            : "College";
        const uploadedGradingPeriod = getValueByAliases(row, [
          "Grading Period",
          "Quarter",
          "GRADING_PERIOD",
          "QUARTER",
        ]);
        const gradingPeriod =
          uploadedGradingPeriod || (programType === "College" ? semester : "");
        const currentGrade = getValueByAliases(row, [
          "Current Grade",
          "CURRENT_GRADE",
        ]);
        const instructorName = getValueByAliases(row, [
          "Instructor",
          "INSTRUCTOR",
        ]);
        const rowErrors: string[] = [];
        const matchedStudent = branchStudents.find((student) =>
          valuesMatch(student.id, studentId),
        );
        const matchedAssignment = allowedAssignments.find(
          (assignment) =>
            valuesMatch(assignment.subjectCode, subjectCode) &&
            (!resolvedSection ||
              valuesMatch(assignment.sectionCode, resolvedSection)),
        );
        const validationResult = validateAndNormalizeUploadedGradeRow({
          studentId,
          fullName,
          subjectCode,
          subjectTitle,
          grade: requestedGrade,
          unit: units,
          gradingPeriod,
          programType,
          academicYear,
          semester,
          branch: resolvedBranch,
        });

        if (!matchedStudent) {
          rowErrors.push(`No student found with Student ID ${studentId}.`);
        }

        if (!matchedAssignment) {
          rowErrors.push(
            `Subject Code ${subjectCode || "(blank)"} is not assigned to ${instructor.name} for this section.`,
          );
        }

        if (
          instructorName &&
          !valuesMatch(instructorName, instructor.name) &&
          (!matchedAssignment ||
            !valuesMatch(instructorName, matchedAssignment.instructorName))
        ) {
          rowErrors.push(`Instructor "${instructorName}" does not exist.`);
        }

        if (validationResult.errorReason) {
          rowErrors.push(
            ...validationResult.errorReason
              .split(",")
              .map((message) => message.trim())
              .filter(Boolean),
          );
        }

        const requestedRecord = validationResult.normalizedRecord;
        const currentRecord = requestedRecord
          ? findApprovedStudentGradeConflict({
              branch: resolvedBranch,
              record: requestedRecord,
              existingRecords: gradeRecords,
            })
          : undefined;

        if (!currentRecord) {
          rowErrors.push(
            "No approved current grade exists for this student, subject, semester, and grading period.",
          );
        } else if (
          currentGrade.trim() &&
          normalizeErrorCheckValue(currentGrade) !==
            normalizeErrorCheckValue(currentRecord.normalizedGrade)
        ) {
          rowErrors.push(
            `Current Grade "${currentGrade}" does not match the approved grade ${currentRecord.normalizedGrade}. Download a fresh template and try again.`,
          );
        }

        if (
          requestedRecord &&
          currentRecord &&
          requestedRecord.normalizedGrade === currentRecord.normalizedGrade
        ) {
          skippedBlankRows += 1;
          return;
        }

        if (requestedRecord && currentRecord && rowErrors.length === 0) {
          changes.push({
            id: `${requestedRecord.id}::${Date.now()}::${rowNumber}`,
            studentId: requestedRecord.studentId,
            fullName: requestedRecord.fullName,
            section: resolvedSection,
            subjectCode: requestedRecord.subjectCode,
            subjectTitle: requestedRecord.subjectTitle,
            units: requestedRecord.units,
            academicYear: requestedRecord.academicYear,
            semester: requestedRecord.semester,
            gradingPeriod: requestedRecord.gradingPeriod,
            programType: requestedRecord.programType,
            currentGrade: currentRecord.normalizedGrade,
            requestedGrade: requestedRecord.normalizedGrade,
            currentRecord,
            requestedRecord,
          });
          return;
        }

        if (rowErrors.length > 0) {
          const errorRow: InstructorGradeChangeRequestErrorRow = {
            sheetName,
            rowNumber,
            studentId,
            fullName,
            section: resolvedSection,
            subjectCode,
            subjectTitle,
            units,
            academicYear,
            semester,
            gradingPeriod,
            programType,
            currentGrade,
            requestedGrade,
            instructorName,
            errors: getUniqueMessages(rowErrors),
          };
          errorRows.push(errorRow);
          errors.push(
            `${sheetName} row ${rowNumber}: ${errorRow.errors.join("; ")}`,
          );
        }
      });
  });

  return { changes, errors, errorRows, skippedBlankRows };
};

export const parseInstructorGradeWorkbook = async ({
  file,
  branch,
  instructor,
  allowedAssignments,
}: {
  file: File;
  branch?: string | null;
  instructor: AcademicInstructorRecord;
  allowedAssignments: AcademicSubjectAssignmentRecord[];
}) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const resolvedBranch = normalizeBranchName(branch);
  const branchStudents = getStudentsForBranch(resolvedBranch).filter(
    (student) => student.status !== "Archived",
  );
  const subjects =
    readBranchScopedData<InstructorTemplateSubject[]>(
      "subjects",
      resolvedBranch,
    ) ?? [];
  let approvedGradeRecords = readStudentGradeRecordsForBranch(resolvedBranch);
  const records: StoredStudentGradeRecord[] = [];
  const errors: string[] = [];
  const errorRows: InstructorGradeSubmissionErrorRow[] = [];

  try {
    approvedGradeRecords =
      await fetchAndCacheStudentGradeRecordsForBranch(resolvedBranch);
  } catch (error) {
    console.warn(
      "Unable to load approved student grades from Supabase; using local cache.",
      error,
    );
  }

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json<InstructorGradeWorksheetRow>(
      worksheet,
      {
        header: 1,
        defval: "",
        blankrows: false,
      },
    );
    const headerRowIndex = findGradeHeaderRowIndex(sheetRows);

    if (headerRowIndex === -1) {
      errors.push(`${sheetName}: grade template headers were not found.`);
      return;
    }

    const headerRow = sheetRows[headerRowIndex] ?? [];
    const templateAcademicYear = getMetadataValue(sheetRows, headerRowIndex, [
      "ACADEMIC_YEAR",
      "ACADEMIC YEAR",
      "SCHOOL_YEAR",
      "SCHOOL YEAR",
    ]);
    const templateSemester = getMetadataValue(sheetRows, headerRowIndex, [
      "SEMESTER",
    ]);
    const templateProgramType = getMetadataValue(sheetRows, headerRowIndex, [
      "PROGRAM",
    ]);

    const rows = sheetRows
      .slice(headerRowIndex + 1)
      .map((row, rowOffset) => ({
        rowNumber: headerRowIndex + rowOffset + 2,
        values: headerRow.reduce<Record<string, unknown>>((record, headerCell, index) => {
          const key = getCellText(headerCell);
          if (key) {
            record[key] = row[index] ?? "";
          }
          return record;
        }, {}),
      }))
      .filter((entry) => getRowHasRelevantGradeData(entry.values));

    rows.forEach(({ rowNumber, values: row }) => {
      const subjectCode = getValueByAliases(row, [
        "Subject Code",
        "SUBJECT_CODE",
      ]);
      const rowProgramType =
        getValueByAliases(row, ["Program Type", "PROGRAM"]) ||
        templateProgramType;
      const normalizedProgramType =
        rowProgramType.trim() === "SHS" ? "SHS" : "College";
      const semester =
        getValueByAliases(row, ["Semester", "SEMESTER"]) || templateSemester;
      const gradingPeriod =
        getValueByAliases(row, [
          "Grading Period",
          "Quarter",
          "QUARTER",
        ]) || (normalizedProgramType === "College" ? semester : "");
      const errorRow: InstructorGradeSubmissionErrorRow = {
        sheetName,
        rowNumber,
        studentId: getValueByAliases(row, ["Student ID", "STUDENT_ID"]),
        fullName: getValueByAliases(row, ["Full Name", "FULL NAME"]),
        subjectCode,
        subjectTitle: getValueByAliases(row, [
          "Subject Title",
          "SUBJECT_TITLE",
        ]),
        units: getValueByAliases(row, ["Unit", "Units", "UNITS"]),
        grade: getValueByAliases(row, ["Grade", "Grades", "GRADES"]),
        instructorName: getValueByAliases(row, ["Instructor", "INSTRUCTOR"]),
        academicYear:
          getValueByAliases(row, ["Academic Year", "ACADEMIC_YEAR"]) ||
          templateAcademicYear,
        semester,
        gradingPeriod,
        programType: normalizedProgramType,
        errors: [],
      };
      const result = validateAndNormalizeUploadedGradeRow({
        studentId: errorRow.studentId,
        fullName: errorRow.fullName,
        subjectCode,
        subjectTitle: errorRow.subjectTitle,
        grade: errorRow.grade,
        unit: errorRow.units,
        gradingPeriod,
        programType: normalizedProgramType,
        academicYear: errorRow.academicYear,
        semester,
        branch,
      });
      const rowErrors = getInstructorRowValidationErrors({
        allowedAssignments,
        branchStudents,
        instructor,
        row: errorRow,
        subjects,
        validationErrorReason: result.errorReason,
      });
      const approvedGradeConflict = result.normalizedRecord
        ? findApprovedStudentGradeConflict({
            branch: resolvedBranch,
            record: result.normalizedRecord,
            existingRecords: approvedGradeRecords,
          })
        : undefined;

      if (approvedGradeConflict) {
        rowErrors.push(
          getApprovedStudentGradeConflictMessage(approvedGradeConflict),
        );
      }

      if (result.normalizedRecord && rowErrors.length === 0) {
        records.push(result.normalizedRecord);
        return;
      }

      if (rowErrors.length > 0) {
        errorRows.push({
          ...errorRow,
          errors: rowErrors,
        });
        errors.push(
          `${sheetName} row ${errorRow.rowNumber}: ${rowErrors.join("; ")}`,
        );
      }
    });
  });

  const operations: StudentGradeUploadOperation[] = records.map((record) => ({
    type: "upsert",
    record,
  }));

  return { records, errors, errorRows, operations };
};
