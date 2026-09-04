import { supabase } from "../lib/supabase";
import type { StaffRole as AppStaffRole } from "../types/user";

export type StaffBranch = string;
export type StaffDirectoryRole = "Registrar" | "Branch Administrator";
export type StaffDirectoryStatus = "active" | "inactive";

export interface StaffMember {
  staff_id: string;
  first_name: string;
  last_name: string;
  role: StaffDirectoryRole;
  branch: StaffBranch;
  email: string;
  contact_number: string;
  address: string;
  password?: string;
  status: StaffDirectoryStatus;
}

type SupabaseErrorLike = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
};

interface StaffApiRecord {
  employee_id: string;
  first_name: string;
  last_name: string;
  role: "admin" | "registrar";
  branch: StaffBranch;
  email: string;
  contact_number: string;
  address: string;
  status: StaffDirectoryStatus;
  is_trashed: boolean;
}

interface StaffLoginApiResponse {
  employee_id: string;
  branch: StaffBranch;
  full_name: string;
  role: "admin" | "registrar";
  password_change_required?: boolean;
}

export interface ManagedBranch {
  code: string;
  name: StaffBranch;
}

export interface StaffLoginResult {
  employeeId: string;
  branch: StaffBranch;
  fullName: string;
  role: Extract<AppStaffRole, "admin" | "registrar">;
  passwordChangeRequired: boolean;
}

export interface StaffPasswordResetPayload {
  branch: StaffBranch;
  role: Extract<AppStaffRole, "admin" | "registrar">;
  email: string;
  contactNumber: string;
  newPassword: string;
}

export interface CompleteStaffPasswordSetupPayload {
  employeeId: string;
  currentPassword: string;
  newPassword: string;
}

const mapApiRoleToDirectoryRole = (
  role: StaffApiRecord["role"],
): StaffDirectoryRole =>
  role === "admin" ? "Branch Administrator" : "Registrar";

const mapDirectoryRoleToApiRole = (
  role: StaffDirectoryRole,
): StaffApiRecord["role"] =>
  role === "Branch Administrator" ? "admin" : "registrar";

const mapStaffRecord = (record: StaffApiRecord): StaffMember => ({
  staff_id: record.employee_id,
  first_name: record.first_name,
  last_name: record.last_name,
  role: mapApiRoleToDirectoryRole(record.role),
  branch: record.branch,
  email: record.email,
  contact_number: record.contact_number,
  address: record.address,
  status: record.status,
});

const getErrorMessage = (error: SupabaseErrorLike) =>
  error.details
    ? `${error.message} ${error.details}`.trim()
    : error.hint
      ? `${error.message} ${error.hint}`.trim()
      : error.message;

const getSingleRow = <T>(data: unknown): T | null => {
  if (Array.isArray(data)) {
    return data.length > 0 ? (data[0] as T) : null;
  }

  if (data && typeof data === "object" && !("Error" in data)) {
    return data as T;
  }

  return null;
};

const buildStaffPayload = (staff: StaffMember) => ({
  p_first_name: staff.first_name.trim(),
  p_last_name: staff.last_name.trim(),
  p_role: mapDirectoryRoleToApiRole(staff.role),
  p_branch: staff.branch,
  p_email: staff.email.trim().toLowerCase(),
  p_contact_number: staff.contact_number.trim(),
  p_address: staff.address.trim(),
  p_password: staff.password?.trim() || null,
  p_status: staff.status,
});

const buildBranchCode = (branchName: string) => {
  const code = branchName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return code || branchName.trim().toLowerCase();
};

export const buildEmployeeIdPreview = (branch: StaffBranch) =>
  `AICS-${branch.toUpperCase()}-XXXXXX`;

export async function fetchManagedBranches() {
  const { data, error } = await supabase
    .rpc("list_area_manager_branches")
    .returns<ManagedBranch[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  return Array.isArray(data) ? data : [];
}

export async function addManagedBranch(branchName: string) {
  const normalizedName = branchName.trim();

  if (!normalizedName) {
    throw new Error("Branch name is required.");
  }

  const { data, error } = await supabase
    .rpc("upsert_area_manager_branch", {
      p_code: buildBranchCode(normalizedName),
      p_name: normalizedName,
    })
    .returns<ManagedBranch[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<ManagedBranch>(data);
  if (!row) {
    throw new Error("Supabase did not return the saved branch.");
  }

  return row;
}

export async function syncManagedBranches(branchNames: string[]) {
  const uniqueBranchNames = Array.from(
    new Set(
      branchNames
        .map((branchName) => branchName.trim())
        .filter((branchName) => branchName.length > 0),
    ),
  );

  const savedBranches = await Promise.all(
    uniqueBranchNames.map((branchName) => addManagedBranch(branchName)),
  );

  return savedBranches;
}

export async function removeManagedBranch(branchName: string) {
  const { error } = await supabase.rpc("deactivate_area_manager_branch", {
    p_branch: branchName,
  });

  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function fetchStaffMembers(options?: { trash?: boolean }) {
  const { data, error } = await supabase
    .rpc("list_staff_accounts", {
      p_trash_mode: options?.trash ? "trash" : "active",
    })
    .returns<StaffApiRecord[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const records = Array.isArray(data) ? data : [];
  return records.map(mapStaffRecord);
}

export async function createStaffMember(staff: StaffMember) {
  const { data, error } = await supabase
    .rpc("create_staff_account", buildStaffPayload(staff))
    .returns<StaffApiRecord[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StaffApiRecord>(data);
  if (!row) {
    throw new Error("Supabase did not return the created staff account.");
  }

  return mapStaffRecord(row);
}

export async function updateStaffMember(
  staffId: string,
  staff: StaffMember,
  options?: { requirePasswordChange?: boolean },
) {
  const { data, error } = await supabase
    .rpc("update_staff_account", {
      p_employee_id: staffId,
      ...buildStaffPayload(staff),
      p_require_password_change: options?.requirePasswordChange ?? false,
    })
    .returns<StaffApiRecord[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StaffApiRecord>(data);
  if (!row) {
    throw new Error("Supabase did not return the updated staff account.");
  }

  return mapStaffRecord(row);
}

export async function moveStaffMemberToTrash(staffId: string) {
  const { data, error } = await supabase
    .rpc("set_staff_account_trashed", {
      p_employee_id: staffId,
      p_is_trashed: true,
    })
    .returns<StaffApiRecord[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StaffApiRecord>(data);
  if (!row) {
    throw new Error("Supabase did not return the updated trash state.");
  }

  return mapStaffRecord(row);
}

export async function restoreStaffMember(staffId: string) {
  const { data, error } = await supabase
    .rpc("set_staff_account_trashed", {
      p_employee_id: staffId,
      p_is_trashed: false,
    })
    .returns<StaffApiRecord[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StaffApiRecord>(data);
  if (!row) {
    throw new Error("Supabase did not return the restored staff account.");
  }

  return mapStaffRecord(row);
}

export async function permanentlyDeleteStaffMember(staffId: string) {
  const { error } = await supabase.rpc("delete_staff_account", {
    p_employee_id: staffId,
  });

  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function authenticateStaffLogin(
  branch: StaffBranch,
  role: Extract<AppStaffRole, "admin" | "registrar">,
  password: string,
): Promise<StaffLoginResult> {
  const { data, error } = await supabase
    .rpc("staff_login", {
      p_branch: branch,
      p_role: role,
      p_password: password,
    })
    .returns<StaffLoginApiResponse[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StaffLoginApiResponse>(data);
  if (!row) {
    throw new Error("Invalid login credentials. Please try again.");
  }

  return {
    employeeId: row.employee_id,
    branch: row.branch,
    fullName: row.full_name,
    role: row.role,
    passwordChangeRequired: Boolean(row.password_change_required),
  };
}

export async function resetStaffPassword(
  payload: StaffPasswordResetPayload,
): Promise<StaffLoginResult> {
  const { data, error } = await supabase
    .rpc("reset_staff_account_password", {
      p_branch: payload.branch,
      p_role: payload.role,
      p_email: payload.email.trim().toLowerCase(),
      p_contact_number: payload.contactNumber.replace(/\D/g, ""),
      p_new_password: payload.newPassword,
    })
    .returns<StaffLoginApiResponse[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StaffLoginApiResponse>(data);

  if (!row) {
    throw new Error("Unable to reset the password right now.");
  }

  return {
    employeeId: row.employee_id,
    branch: row.branch,
    fullName: row.full_name,
    role: row.role,
    passwordChangeRequired: Boolean(row.password_change_required),
  };
}

export async function completeStaffPasswordSetup(
  payload: CompleteStaffPasswordSetupPayload,
): Promise<StaffLoginResult> {
  const { data, error } = await supabase
    .rpc("complete_staff_password_setup", {
      p_employee_id: payload.employeeId.trim().toUpperCase(),
      p_current_password: payload.currentPassword,
      p_new_password: payload.newPassword,
    })
    .returns<StaffLoginApiResponse[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StaffLoginApiResponse>(data);

  if (!row) {
    throw new Error("Unable to update the password right now.");
  }

  return {
    employeeId: row.employee_id,
    branch: row.branch,
    fullName: row.full_name,
    role: row.role,
    passwordChangeRequired: Boolean(row.password_change_required),
  };
}
