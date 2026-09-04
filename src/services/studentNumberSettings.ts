import { supabase } from "../lib/supabase";
import { normalizeBranchName } from "./adminStorage";

type SupabaseErrorLike = {
  details?: string | null;
  hint?: string | null;
  message: string;
};

type BranchStudentNumberSettingRow = {
  branch: string;
  prefix: string;
  next_sequence: number | string;
  next_digits: string;
  next_student_number: string;
  updated_at: string;
};

export type BranchStudentNumberSetting = {
  branch: string;
  prefix: string;
  nextSequence: number;
  nextDigits: string;
  nextStudentNumber: string;
  updatedAt: string;
};

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

  if (data && typeof data === "object") {
    return data as T;
  }

  return null;
};

const mapSettingRow = (
  row: BranchStudentNumberSettingRow,
): BranchStudentNumberSetting => ({
  branch: row.branch,
  prefix: row.prefix,
  nextSequence: Number(row.next_sequence),
  nextDigits: row.next_digits,
  nextStudentNumber: row.next_student_number,
  updatedAt: row.updated_at,
});

export const normalizeStudentNumberStartDigits = (value: string) =>
  value.replace(/\D/g, "").slice(0, 6);

export async function fetchBranchStudentNumberSetting(
  branch?: string | null,
) {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("get_branch_student_number_setting", {
      p_branch: resolvedBranch,
    })
    .returns<BranchStudentNumberSettingRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<BranchStudentNumberSettingRow>(data);

  if (!row) {
    throw new Error("Supabase did not return the student number setting.");
  }

  return mapSettingRow(row);
}

export async function saveBranchStudentNumberSetting({
  branch,
  nextDigits,
}: {
  branch?: string | null;
  nextDigits: string;
}) {
  const resolvedBranch = normalizeBranchName(branch);
  const normalizedDigits = normalizeStudentNumberStartDigits(nextDigits);

  if (!/^\d{6}$/.test(normalizedDigits)) {
    throw new Error("Student number start must be exactly 6 digits.");
  }

  const { data, error } = await supabase
    .rpc("set_branch_student_number_setting", {
      p_branch: resolvedBranch,
      p_next_digits: normalizedDigits,
    })
    .returns<BranchStudentNumberSettingRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<BranchStudentNumberSettingRow>(data);

  if (!row) {
    throw new Error("Supabase did not return the saved student number setting.");
  }

  return mapSettingRow(row);
}
