import { supabase } from "../lib/supabase";

export interface RegisteredBranch {
  code: string;
  name: string;
  student_number_prefix: string;
  is_active: boolean;
}

let branches: RegisteredBranch[] = [];
let pending: Promise<RegisteredBranch[]> | undefined;

export const findRegisteredBranch = (branch: string) => {
  const key = branch.trim().toLowerCase();
  return branches.find((item) =>
    item.code.toLowerCase() === key || item.name.toLowerCase() === key,
  );
};

export const findBranchByStudentPrefix = (prefix: string) =>
  branches.find((branch) => branch.student_number_prefix === prefix.toUpperCase());

export const fetchBranchDirectory = (): Promise<RegisteredBranch[]> => {
  if (pending) return pending;
  pending = (async () => {
    const { data, error } = await supabase.from("admission_branches")
      .select("code,name,student_number_prefix,is_active")
      .returns<RegisteredBranch[]>();
    if (error) throw new Error(error.message);
    if (!data?.length || data.some((branch) => !/^[A-Z]{3}$/.test(branch.student_number_prefix))) {
      throw new Error("Branch student-number settings are unavailable. Please try again.");
    }
    branches = data;
    return branches;
  })().finally(() => { pending = undefined; });
  return pending;
};
