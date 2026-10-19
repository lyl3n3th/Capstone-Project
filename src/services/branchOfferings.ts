import { supabase } from "../lib/supabase";
import { getManagerSessionToken } from "./mockStaffAuth";

export type OfferingProgram = "College" | "Senior High School";

export interface BranchOffering {
  branch_code: string;
  branch_name: string;
  program_name: OfferingProgram;
  track_name: string;
}

export type OfferingChoice = Pick<BranchOffering, "program_name" | "track_name">;
export type OfferingUsage = OfferingChoice & { student_count: number };

export const offeringKey = (offering: OfferingChoice) =>
  `${offering.program_name}:${offering.track_name.trim().toLowerCase()}`;

export function getProgramsForOfferings(
  offerings: OfferingChoice[],
  studentStatus: string,
): OfferingProgram[] {
  return (["College", "Senior High School"] as const).filter((program) =>
    (studentStatus !== "Junior High Completer" || program === "Senior High School") &&
    (studentStatus !== "Senior High Graduate" || program === "College") &&
    offerings.some((offering) => offering.program_name === program),
  );
}

export async function fetchBranchOfferings(branch?: string): Promise<BranchOffering[]> {
  const { data, error } = await supabase.rpc("list_branch_track_offerings", {
    p_branch: branch || null,
  }).returns<BranchOffering[]>();
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

export async function fetchOfferingCatalog(branch: string): Promise<OfferingChoice[]> {
  const { data, error } = await supabase.rpc("list_branch_track_catalog", { p_branch: branch })
    .returns<OfferingChoice[]>();
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

export async function fetchOfferingUsage(branch: string): Promise<OfferingUsage[]> {
  const { data, error } = await supabase.rpc("get_branch_track_usage", { p_branch: branch })
    .returns<OfferingUsage[]>();
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

export async function deleteBranchOffering(branch: string, choice: OfferingChoice) {
  const token = getManagerSessionToken();
  if (!token) throw new Error("Your Area Manager session has expired. Please sign in again.");
  const { error } = await supabase.rpc("delete_branch_track_offering", {
    p_session_token: token,
    p_branch: branch,
    p_program_name: choice.program_name,
    p_track_name: choice.track_name,
  });
  if (error) throw new Error(error.message);
}

export async function saveBranchOfferings(branch: string, offerings: OfferingChoice[]) {
  const token = getManagerSessionToken();
  if (!token) throw new Error("Your Area Manager session has expired. Please sign in again.");
  const { error } = await supabase.rpc("save_branch_track_offerings", {
    p_session_token: token,
    p_branch: branch,
    p_tracks: offerings,
  });
  if (error) throw new Error(error.message);
}
