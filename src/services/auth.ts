import { supabase } from "../lib/supabase";
import type { AuthUser } from "../types/user";
import { isCachedAlumniStudent } from "./backupApi";
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

type StudentPortalSnapshotRow = {
  student_id: string;
  student_number: string;
  tracking_number: string;
  branch: string;
  full_name: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  program_name: string;
  track_name: string;
  year_level: string;
  section: string | null;
  email: string;
  phone_number: string;
  address: string;
  birth_date: string | null;
  sex: "Male" | "Female";
  civil_status: string;
  portal_account_registered: boolean;
};

type StudentActivationStatusRow = {
  student_number: string | null;
  portal_account_registered: boolean | null;
};

export interface StudentPortalIdentity {
  studentId: string;
  studentNumber: string;
  trackingNumber: string;
  branch: string;
  fullName: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  programName: string;
  trackName: string;
  yearLevel: string;
  section?: string;
  email: string;
  phoneNumber: string;
  address: string;
  birthDate?: string;
  sex: "Male" | "Female";
  civilStatus: string;
  portalAccountRegistered: boolean;
}

export interface StudentRegistrationPayload {
  studentNumber: string;
  email: string;
  mobile: string;
  birthDate?: string;
  password: string;
}

export interface StudentPasswordResetPayload {
  studentNumber: string;
  email: string;
  mobile: string;
  newPassword: string;
}

export interface StudentActivationStatus {
  studentNumber?: string;
  portalAccountRegistered: boolean;
}

const getErrorMessage = (error: SupabaseErrorLike) =>
  error.details
    ? `${error.message} ${error.details}`.trim()
    : error.hint
      ? `${error.message} ${error.hint}`.trim()
      : error.message;

const isStudentNumberConflictError = (message: string) =>
  /student_profiles_branch_student_number_key/i.test(message) ||
  /student_profiles_student_number_key/i.test(message) ||
  /duplicate key value violates unique constraint/i.test(message);

const getSingleRow = <T,>(data: unknown): T | null => {
  if (Array.isArray(data)) {
    return data.length > 0 ? (data[0] as T) : null;
  }

  if (data && typeof data === "object" && !("error" in data)) {
    return data as T;
  }

  return null;
};

const formatContactNumber = (value?: string | null) => {
  const digits = (value || "").replace(/\D/g, "");

  if (digits.length !== 11) {
    return value || "";
  }

  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
};

const mapStudentPortalSnapshot = (
  row: StudentPortalSnapshotRow,
): StudentPortalIdentity => ({
  studentId: row.student_id,
  studentNumber: row.student_number,
  trackingNumber: row.tracking_number,
  branch: toDisplayCapitalization(row.branch),
  fullName: toNameCapitalization(row.full_name),
  firstName: toNameCapitalization(row.first_name),
  lastName: toNameCapitalization(row.last_name),
  middleName: toNameCapitalization(row.middle_name) || undefined,
  programName: toDisplayCapitalization(row.program_name),
  trackName: toDisplayCapitalization(row.track_name),
  yearLevel: toDisplayCapitalization(row.year_level),
  section: toDisplayCapitalization(row.section) || undefined,
  email: row.email,
  phoneNumber: formatContactNumber(row.phone_number),
  address: toDisplayCapitalization(row.address),
  birthDate: row.birth_date || undefined,
  sex: row.sex,
  civilStatus: toDisplayCapitalization(row.civil_status),
  portalAccountRegistered: row.portal_account_registered,
});

const ensureStudentSnapshot = (
  data: unknown,
  error: SupabaseErrorLike | null,
): StudentPortalIdentity => {
  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StudentPortalSnapshotRow>(data);

  if (!row) {
    throw new Error("Supabase did not return the student portal record.");
  }

  return mapStudentPortalSnapshot(row);
};

export const mapStudentIdentityToAuthUser = (
  identity: StudentPortalIdentity,
): AuthUser => ({
  id: identity.studentId,
  role: "student",
  displayName: identity.fullName,
  branch: identity.branch,
  studentNumber: identity.studentNumber,
  trackingNumber: identity.trackingNumber,
  firstName: identity.firstName,
  lastName: identity.lastName,
  middleName: identity.middleName,
  email: identity.email,
  contactNumber: identity.phoneNumber,
  address: identity.address,
  program: identity.trackName,
  yearLevel: identity.yearLevel,
  section: identity.section,
  programType:
    identity.programName === "Senior High School" ? "SHS" : "BS",
  gender: identity.sex,
  civilStatus: identity.civilStatus,
  birthDate: identity.birthDate,
});

export const activateApprovedStudent = async (
  trackingNumber: string,
) => {
  let lastRetriableError: string | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .rpc("activate_approved_student", {
        p_tracking_number: trackingNumber.trim().toUpperCase(),
      })
      .returns<StudentPortalSnapshotRow[]>();

    if (!error) {
      return ensureStudentSnapshot(data, null);
    }

    const message = getErrorMessage(error);

    if (isStudentNumberConflictError(message)) {
      lastRetriableError = message;
      continue;
    }

    throw new Error(message);
  }

  throw new Error(
    lastRetriableError ||
      "Unable to generate a unique student number right now. Please try again.",
  );
};

export const registerStudentPortalAccount = async (
  payload: StudentRegistrationPayload,
) => {
  const { data, error } = await supabase
    .rpc("register_student_portal_account", {
      p_student_number: payload.studentNumber.trim().toUpperCase(),
      p_email: payload.email.trim().toLowerCase(),
      p_phone_number: payload.mobile.replace(/\D/g, ""),
      p_birth_date: payload.birthDate?.trim() || null,
      p_password: payload.password,
    })
    .returns<StudentPortalSnapshotRow[]>();

  return ensureStudentSnapshot(data, error);
};

export const loginStudentPortal = async ({
  studentNumber,
  password,
}: {
  studentNumber: string;
  password: string;
}) => {
  if (isCachedAlumniStudent({ studentNumber })) {
    throw new Error(
      "This student has already been transferred to Alumni and can no longer access the student portal.",
    );
  }

  const { data, error } = await supabase
    .rpc("student_portal_login", {
      p_student_number: studentNumber.trim().toUpperCase(),
      p_password: password,
    })
    .returns<StudentPortalSnapshotRow[]>();

  const identity = ensureStudentSnapshot(data, error);

  if (
    isCachedAlumniStudent({
      studentNumber: identity.studentNumber,
      trackingNumber: identity.trackingNumber,
      branch: identity.branch,
    })
  ) {
    throw new Error(
      "This student has already been transferred to Alumni and can no longer access the student portal.",
    );
  }

  return identity;
};

export const loginStudentPortalWithEmail = async ({
  email,
}: {
  email: string;
}) => {
  const { data, error } = await supabase
    .rpc("student_portal_email_login", {
      p_email: email.trim().toLowerCase(),
    })
    .returns<StudentPortalSnapshotRow[]>();

  const identity = ensureStudentSnapshot(data, error);

  if (
    isCachedAlumniStudent({
      studentNumber: identity.studentNumber,
      trackingNumber: identity.trackingNumber,
      branch: identity.branch,
    })
  ) {
    throw new Error(
      "This student has already been transferred to Alumni and can no longer access the student portal.",
    );
  }

  return identity;
};

export const startStudentGoogleLogin = async () => {
  const redirectTo =
    typeof window === "undefined"
      ? undefined
      : `${window.location.origin}/student/login`;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const resetStudentPortalPassword = async (
  payload: StudentPasswordResetPayload,
) => {
  const { data, error } = await supabase
    .rpc("reset_student_portal_password", {
      p_student_number: payload.studentNumber.trim().toUpperCase(),
      p_email: payload.email.trim().toLowerCase(),
      p_phone_number: payload.mobile.replace(/\D/g, ""),
      p_new_password: payload.newPassword,
    })
    .returns<StudentPortalSnapshotRow[]>();

  return ensureStudentSnapshot(data, error);
};

export const getStudentActivationStatus = async (
  trackingNumber: string,
): Promise<StudentActivationStatus | null> => {
  const { data, error } = await supabase
    .rpc("get_student_activation_status", {
      p_tracking_number: trackingNumber.trim().toUpperCase(),
    })
    .returns<StudentActivationStatusRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StudentActivationStatusRow>(data);

  if (!row) {
    return null;
  }

  return {
    studentNumber: row.student_number || undefined,
    portalAccountRegistered: Boolean(row.portal_account_registered),
  };
};
