import { supabase } from "../lib/supabase";
import { fetchStudentImportDetails } from "./studentImport";
import { applyImportedScheduleDefaults } from "./importedStudentScheduling";
import {
  forgetDeletedStoredStudent,
  forgetDeletedStoredStudents,
  normalizeBranchName,
  type StudentStorageRecord,
} from "./adminStorage";
import {
  mergeStudentPlanningStatesIntoStudents,
  saveStudentPlanningState,
  fetchStudentPlanningStates,
} from "./studentPlanningApi";
import {
  toDisplayCapitalization,
  toNameCapitalization,
} from "../utils/textFormatting";

type SupabaseErrorLike = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
};

type AdminStudentApiStatus =
  | "Complete"
  | "Incomplete"
  | "Archived"
  | "Graduated";

type AdminStudentApiRecord = {
  student_id: string;
  student_number: string;
  tracking_number: string;
  branch: string;
  full_name: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  program: "SHS" | "College";
  year_level: string;
  section: string | null;
  shs_track_type: string | null;
  strand_or_course: string | null;
  document_submitted_date: string | null;
  contact_number: string;
  email: string;
  address: string;
  status: AdminStudentApiStatus;
  student_status: string | null;
  requested_own_schedule: boolean;
  own_schedule_request_status: "Pending" | "Approved" | "Rejected" | null;
  own_schedule_academic_year: string | null;
  own_schedule_semester: string | null;
  own_schedule_selection_status:
    | "Not Submitted"
    | "Pending Approval"
    | "Approved"
    | "Rejected"
    | null;
  birth_date: string | null;
  guardian_name: string | null;
  guardian_contact: string | null;
  sex: "Male" | "Female";
  civil_status: string;
};

type AdminStudentMutationPayload = {
  student_number?: string;
  tracking_number?: string;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  branch: string;
  program: string;
  year_level: string;
  track_name: string;
  email: string;
  phone_number?: string;
  address?: string;
  status: AdminStudentApiStatus;
  document_submitted_date?: string | null;
  section?: string | null;
  student_status?: string | null;
  birth_date?: string | null;
  guardian_name?: string | null;
  guardian_contact?: string | null;
  sex?: "Male" | "Female";
  civil_status?: string | null;
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

const hasOwnPlanningField = (
  student: StudentStorageRecord,
  field: keyof Pick<
    StudentStorageRecord,
    | "requestedOwnSchedule"
    | "ownScheduleRequestStatus"
    | "ownScheduleAcademicYear"
    | "ownScheduleSemester"
    | "ownScheduleSelectionStatus"
  >,
) => Object.prototype.hasOwnProperty.call(student, field);

const splitFullName = (fullName: string) => {
  const normalizedName = fullName.trim().replace(/\s+/g, " ");
  const parts = normalizedName.split(" ").filter(Boolean);

  if (parts.length < 2) {
    return {
      firstName: normalizedName,
      middleName: "",
      lastName: "",
    };
  }

  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
};

const toIsoDateInput = (value?: string | null) => {
  if (!value) {
    return "";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toISOString().slice(0, 10);
};

const mapAdminStudentRow = (
  row: AdminStudentApiRecord,
): StudentStorageRecord => ({
  firstName: row.first_name,
  middleName: row.middle_name || "",
  lastName: row.last_name,
  id: row.student_number,
  name: toNameCapitalization(row.full_name),
  program: toDisplayCapitalization(row.program),
  yearLevel: toDisplayCapitalization(row.year_level),
  section: toDisplayCapitalization(row.section),
  shsTrackType: toDisplayCapitalization(row.shs_track_type),
  strandOrCourse: toDisplayCapitalization(row.strand_or_course),
  documentSubmitted: toIsoDateInput(row.document_submitted_date),
  contact: row.contact_number || "",
  email: row.email || "",
  address: toDisplayCapitalization(row.address),
  status: row.status,
  branch: normalizeBranchName(row.branch),
  trackingNumber:
    row.tracking_number && row.tracking_number !== row.student_number
      ? row.tracking_number
      : undefined,
  studentStatus: toDisplayCapitalization(row.student_status),
  requestedOwnSchedule: row.requested_own_schedule,
  ownScheduleRequestStatus: row.own_schedule_request_status || undefined,
  ownScheduleAcademicYear: row.own_schedule_academic_year || undefined,
  ownScheduleSemester: row.own_schedule_semester || undefined,
  ownScheduleSelectionStatus: row.own_schedule_selection_status || undefined,
  birthDate: toIsoDateInput(row.birth_date),
  guardianName: toNameCapitalization(row.guardian_name),
  guardianContact: row.guardian_contact || "",
  gender: row.sex,
  civilStatus: toDisplayCapitalization(row.civil_status),
});

const buildStudentPayload = (
  student: StudentStorageRecord,
): AdminStudentMutationPayload => {
  const structuredName = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ");
  const { firstName, middleName, lastName } = structuredName.trim().toLowerCase() === student.name.trim().toLowerCase()
    ? { firstName: student.firstName || "", middleName: student.middleName || "", lastName: student.lastName || "" }
    : splitFullName(student.name);

  return {
    student_number: student.id,
    tracking_number: student.trackingNumber,
    first_name: firstName,
    middle_name: middleName || null,
    last_name: lastName || firstName,
    branch: normalizeBranchName(student.branch),
    program: student.program,
    year_level: student.yearLevel,
    track_name: student.strandOrCourse || student.program,
    email: student.email,
    phone_number: student.contact || "",
    address: student.address || "",
    status: student.status,
    document_submitted_date: student.documentSubmitted || null,
    section: student.section || null,
    student_status: student.studentStatus || null,
    birth_date: student.birthDate || null,
    guardian_name: student.guardianName || null,
    guardian_contact: student.guardianContact || null,
    sex: student.gender || "Male",
    civil_status: student.civilStatus || "Single",
  };
};

export type AdminStudentPageFilters = {
  branches?: string[];
  sectionCodes?: string[];
  studentNumbers?: string[];
  search?: string;
  program?: string;
  course?: string;
  strand?: string;
  yearLevel?: string;
  section?: string;
  gender?: string;
  requirementStatus?: string;
  sortBy?: "student_number" | "full_name" | "program" | "year_level" | "strand_or_course" | "section" | "branch" | "email";
  sortAscending?: boolean;
};

export type AdminStudentPage = {
  students: StudentStorageRecord[];
  totalItems: number;
};

const escapePostgrestOrValue = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;

const applyActiveStudentFilter = <T extends { in: (column: string, values: string[]) => T }>(query: T) =>
  query.in("status", ["Complete", "Incomplete"]);

const applyAdminStudentPageFilters = (
  initialQuery: any,
  filters: AdminStudentPageFilters,
) => {
  let query = applyActiveStudentFilter(initialQuery);
  const branchNames = filters.branches?.map((branch) => branch.trim()).filter(Boolean);
  if (branchNames) {
    if (branchNames.length === 0) return null;
    query = query.in("branch", branchNames);
  }
  if (filters.sectionCodes || filters.studentNumbers) {
    const sections = Array.from(new Set((filters.sectionCodes ?? []).filter(Boolean)));
    const studentNumbers = Array.from(new Set((filters.studentNumbers ?? []).filter(Boolean)));
    if (sections.length === 0 && studentNumbers.length === 0) return null;
    const conditions = [
      sections.length > 0
        ? `section.in.(${sections.map(escapePostgrestOrValue).join(",")})`
        : "",
      studentNumbers.length > 0
        ? `student_number.in.(${studentNumbers.map(escapePostgrestOrValue).join(",")})`
        : "",
    ].filter(Boolean);
    query = query.or(conditions.join(","));
  }
  if (filters.search?.trim()) {
    const search = filters.search.trim().replace(/[%,*(),\\]/g, " ").replace(/\s+/g, " ");
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,student_number.ilike.%${search}%`);
    }
  }
  if (filters.program) query = query.eq("program", filters.program);
  if (filters.course) {
    if (filters.course === "SHS") {
      query = query.eq("program", "SHS");
    } else if (filters.course !== "College") {
      query = query.eq("program", "College").eq("strand_or_course", filters.course);
    } else {
      query = query.eq("program", "College");
    }
  }
  if (filters.strand) query = query.eq("strand_or_course", filters.strand);
  if (filters.yearLevel) query = query.eq("year_level", filters.yearLevel);
  if (filters.section) query = query.eq("section", filters.section);
  if (filters.gender) query = query.eq("sex", filters.gender);
  if (filters.requirementStatus) query = query.eq("status", filters.requirementStatus);
  return query;
};

export async function fetchAdminStudentsPage(
  branch: string | null | undefined,
  page: number,
  pageSize = 10,
  filters: AdminStudentPageFilters = {},
): Promise<AdminStudentPage> {
  const resolvedPageSize = Math.max(1, Math.min(10, Math.floor(pageSize)));
  const resolvedPage = Math.max(1, Math.floor(page));
  const query = applyAdminStudentPageFilters(
    supabase.rpc(
      "list_admin_students",
      { p_branch: branch ? normalizeBranchName(branch) : null },
      { count: "exact" },
    ),
    filters,
  );
  if (!query) return { students: [], totalItems: 0 };

  const { data, error, count } = await query
    .order(filters.sortBy || "student_number", { ascending: filters.sortAscending ?? true })
    .order("student_number", { ascending: true })
    .range((resolvedPage - 1) * resolvedPageSize, resolvedPage * resolvedPageSize - 1);

  if (error) throw new Error(getErrorMessage(error));

  const students = ((Array.isArray(data) ? data : []) as AdminStudentApiRecord[]).map(mapAdminStudentRow);
  forgetDeletedStoredStudents(students);
  return {
    students: students.map(applyImportedScheduleDefaults),
    totalItems: count ?? 0,
  };
}

export async function fetchAdminStudentPageSupplemental(
  branch: string | null | undefined,
  students: StudentStorageRecord[],
): Promise<StudentStorageRecord[]> {
  if (students.length === 0) return students;

  const studentNumbers = [...new Set(students.map((student) => student.id).filter(Boolean))];
  const [importResult, planningResult] = await Promise.allSettled([
    fetchStudentImportDetails(branch || undefined, studentNumbers),
    branch ? fetchStudentPlanningStates(branch, studentNumbers) : Promise.resolve(null),
  ]);

  let enrichedStudents = students.map((student) => ({ ...student }));
  if (importResult.status === "fulfilled") {
    const byNumber = new Map(importResult.value.map((item) => [item.student_number, item]));
    enrichedStudents = enrichedStudents.map((student) => {
      const detail = byNumber.get(student.id);
      return detail ? {
        ...student,
        importAcademicYear: detail.academic_year,
        importSemester: detail.semester,
        importAcademicStanding: detail.academic_standing,
        lastSchoolAttended: detail.last_school_attended || "",
        yearCompletion: detail.year_completion == null ? "" : String(detail.year_completion),
      } : student;
    });
  } else {
    console.warn("Unable to load imported-student enrollment details for this page.", importResult.reason);
  }

  if (planningResult.status === "fulfilled" && planningResult.value) {
    enrichedStudents = mergeStudentPlanningStatesIntoStudents(enrichedStudents, planningResult.value);
  } else if (planningResult.status === "rejected") {
    console.warn("Unable to load planning states for this student page.", planningResult.reason);
  }

  return enrichedStudents.map(applyImportedScheduleDefaults);
}

export async function fetchAdminStudentsPageWithSupplemental(
  branch: string | null | undefined,
  page: number,
  pageSize = 10,
  filters: AdminStudentPageFilters = {},
): Promise<AdminStudentPage> {
  const result = await fetchAdminStudentsPage(branch, page, pageSize, filters);
  return {
    ...result,
    students: await fetchAdminStudentPageSupplemental(branch, result.students),
  };
}

export async function fetchAdminStudentCounts(
  branchNames: string[],
): Promise<{ total: number; female: number; male: number }> {
  const branches = Array.from(new Set(branchNames.map((branch) => branch.trim()).filter(Boolean)));
  if (branches.length === 0) return { total: 0, female: 0, male: 0 };

  const fetchCount = async (gender?: "Female" | "Male") => {
    let query = supabase.rpc(
      "list_admin_students",
      { p_branch: null },
      { count: "exact", head: true },
    ).in("status", ["Complete", "Incomplete"]).in("branch", branches);
    if (gender) query = query.eq("sex", gender);
    const { count, error } = await query;
    if (error) throw new Error(getErrorMessage(error));
    return count ?? 0;
  };

  const [total, female, male] = await Promise.all([
    fetchCount(),
    fetchCount("Female"),
    fetchCount("Male"),
  ]);
  return { total, female, male };
}

export async function fetchAdminStudents(branch?: string | null) {
  const { data, error } = await supabase
    .rpc("list_admin_students", {
      p_branch: branch ? normalizeBranchName(branch) : null,
    })
    .returns<AdminStudentApiRecord[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const rows = Array.isArray(data) ? data : [];
  const students = rows.map(mapAdminStudentRow);
  // Supabase is authoritative. A successful reimport must not remain hidden
  // behind an earlier deletion marker on this device.
  forgetDeletedStoredStudents(students);

  try {
    const imported = await fetchStudentImportDetails(branch || undefined);
    const byNumber = new Map(imported.map((item) => [item.student_number, item]));
    students.forEach((student) => {
      const detail = byNumber.get(student.id);
      if (detail) {
        student.importAcademicYear = detail.academic_year;
        student.importSemester = detail.semester;
        student.importAcademicStanding = detail.academic_standing;
        student.lastSchoolAttended = detail.last_school_attended || "";
        student.yearCompletion = detail.year_completion == null ? "" : String(detail.year_completion);
      }
    });
  } catch (error) {
    console.warn("Unable to load imported-student enrollment details.", error);
  }

  try {
    const planningStates = await fetchStudentPlanningStates(branch);
    return mergeStudentPlanningStatesIntoStudents(students, planningStates).map(applyImportedScheduleDefaults);
  } catch (planningError) {
    console.warn(
      "Unable to fetch shared student planning states. Falling back to base student records.",
      planningError,
    );
    return students.map(applyImportedScheduleDefaults);
  }
}

export async function getNextAdminStudentNumber(branch?: string | null) {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase.rpc("get_next_admin_student_number", {
    p_branch: resolvedBranch,
  });

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  if (typeof data !== "string" || data.trim() === "") {
    throw new Error("Supabase did not return the next student number.");
  }

  return data;
}

export async function saveAdminStudent(student: StudentStorageRecord) {
  const { data, error } = await supabase
    .rpc("upsert_admin_student", {
      p_payload: buildStudentPayload(student),
    })
    .returns<AdminStudentApiRecord[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<AdminStudentApiRecord>(data);
  if (!row) {
    throw new Error("Supabase did not return the saved student.");
  }

  const savedStudent = mapAdminStudentRow(row);
  forgetDeletedStoredStudent(savedStudent);

  const shouldSyncPlanningState =
    hasOwnPlanningField(student, "requestedOwnSchedule") ||
    hasOwnPlanningField(student, "ownScheduleRequestStatus") ||
    hasOwnPlanningField(student, "ownScheduleAcademicYear") ||
    hasOwnPlanningField(student, "ownScheduleSemester") ||
    hasOwnPlanningField(student, "ownScheduleSelectionStatus");

  if (shouldSyncPlanningState) {
    try {
      await saveStudentPlanningState({
        branch: student.branch,
        studentNumber: student.id,
        trackingNumber: student.trackingNumber,
        requestedOwnSchedule: Boolean(student.requestedOwnSchedule),
        ownScheduleRequestStatus: student.ownScheduleRequestStatus,
        ownScheduleAcademicYear: student.ownScheduleAcademicYear,
        ownScheduleSemester: student.ownScheduleSemester,
        ownScheduleSelectionStatus: student.ownScheduleSelectionStatus,
      });
    } catch (planningError) {
      console.warn(
        "Unable to sync shared student planning state while saving the student record.",
        planningError,
      );
    }
  }

  return {
    ...savedStudent,
    importAcademicYear: student.importAcademicYear,
    importSemester: student.importSemester,
    importAcademicStanding: student.importAcademicStanding,
    lastSchoolAttended: student.lastSchoolAttended,
    yearCompletion: student.yearCompletion,
    requestedOwnSchedule: hasOwnPlanningField(student, "requestedOwnSchedule")
      ? student.requestedOwnSchedule
      : savedStudent.requestedOwnSchedule,
    ownScheduleRequestStatus: hasOwnPlanningField(
      student,
      "ownScheduleRequestStatus",
    )
      ? student.ownScheduleRequestStatus
      : savedStudent.ownScheduleRequestStatus,
    ownScheduleAcademicYear: hasOwnPlanningField(
      student,
      "ownScheduleAcademicYear",
    )
      ? student.ownScheduleAcademicYear
      : savedStudent.ownScheduleAcademicYear,
    ownScheduleSemester: hasOwnPlanningField(student, "ownScheduleSemester")
      ? student.ownScheduleSemester
      : savedStudent.ownScheduleSemester,
    ownScheduleSelectionStatus: hasOwnPlanningField(
      student,
      "ownScheduleSelectionStatus",
    )
      ? student.ownScheduleSelectionStatus
      : savedStudent.ownScheduleSelectionStatus,
  };
}

export async function updateAdminStudentEmail({
  branch,
  studentNumber,
  trackingNumber,
  email,
}: {
  branch?: string | null;
  studentNumber: string;
  trackingNumber?: string | null;
  email: string;
}) {
  const { data, error } = await supabase
    .rpc("update_admin_student_email", {
      p_payload: {
        branch: branch ? normalizeBranchName(branch) : null,
        student_number: studentNumber,
        tracking_number: trackingNumber || null,
        email,
      },
    })
    .returns<AdminStudentApiRecord[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<AdminStudentApiRecord>(data);
  if (!row) {
    throw new Error("Supabase did not return the updated student email.");
  }

  return mapAdminStudentRow(row);
}

export async function updateAdminStudentStatus({
  branch,
  studentNumber,
  status,
}: {
  branch?: string | null;
  studentNumber: string;
  status: AdminStudentApiStatus;
}) {
  const { data, error } = await supabase
    .rpc("set_admin_student_status", {
      p_payload: {
        branch: branch ? normalizeBranchName(branch) : null,
        student_number: studentNumber,
        status,
      },
    })
    .returns<AdminStudentApiRecord[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<AdminStudentApiRecord>(data);
  if (!row) {
    throw new Error("Supabase did not return the updated student status.");
  }

  return mapAdminStudentRow(row);
}

export async function deleteAdminStudent({
  branch,
  studentNumber,
  trackingNumber,
}: {
  branch?: string | null;
  studentNumber: string;
  trackingNumber?: string | null;
}) {
  const { data, error } = await supabase
    .rpc("delete_admin_student", {
      p_payload: {
        branch: branch ? normalizeBranchName(branch) : null,
        student_number: studentNumber,
        tracking_number: trackingNumber || null,
      },
    })
    .returns<Array<{ student_number: string; tracking_number: string | null }>>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<{ student_number: string; tracking_number: string | null }>(
    data,
  );

  if (!row) {
    throw new Error("Supabase did not confirm the deleted student.");
  }

  return row;
}

export async function purgeArchivedAdminStudents(branch: string) {
  const { data, error } = await supabase
    .rpc("purge_archived_admin_students", {
      p_branch: normalizeBranchName(branch),
    })
    .returns<number>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const deletedCount = Number(data);
  return Number.isFinite(deletedCount) ? deletedCount : 0;
}
