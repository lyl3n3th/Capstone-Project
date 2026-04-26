import { supabase } from "../lib/supabase";
import {
  normalizeBranchName,
  type StudentStorageRecord,
} from "./adminStorage";

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
  id: row.student_number,
  name: row.full_name,
  program: row.program,
  yearLevel: row.year_level,
  section: row.section || "",
  shsTrackType: row.shs_track_type || "",
  strandOrCourse: row.strand_or_course || "",
  documentSubmitted: toIsoDateInput(row.document_submitted_date),
  contact: row.contact_number || "",
  email: row.email || "",
  address: row.address || "",
  status: row.status,
  branch: normalizeBranchName(row.branch),
  trackingNumber:
    row.tracking_number && row.tracking_number !== row.student_number
      ? row.tracking_number
      : undefined,
  studentStatus: row.student_status || "",
  requestedOwnSchedule: row.requested_own_schedule,
  ownScheduleRequestStatus: row.own_schedule_request_status || undefined,
  ownScheduleAcademicYear: row.own_schedule_academic_year || undefined,
  ownScheduleSemester: row.own_schedule_semester || undefined,
  ownScheduleSelectionStatus: row.own_schedule_selection_status || undefined,
  birthDate: toIsoDateInput(row.birth_date),
  guardianName: row.guardian_name || "",
  guardianContact: row.guardian_contact || "",
  gender: row.sex,
  civilStatus: row.civil_status,
});

const buildStudentPayload = (
  student: StudentStorageRecord,
): AdminStudentMutationPayload => {
  const { firstName, middleName, lastName } = splitFullName(student.name);

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
  return rows.map(mapAdminStudentRow);
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
