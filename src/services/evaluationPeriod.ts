import { supabase } from "../lib/supabase";
import { normalizeBranchName, readBranchScopedData, writeBranchScopedData } from "./adminStorage";

export interface EvaluationPeriod {
  isOpen: boolean;
  closesAt: string | null;
  updatedAt: string;
}

const SCOPE = "instructor-evaluation-period";
export const EVALUATION_PERIOD_UPDATED_EVENT = "aics:evaluation-period-updated";

export const isEvaluationPeriodOpen = (period: EvaluationPeriod | null, now = Date.now()) =>
  Boolean(period?.isOpen && (!period.closesAt || Date.parse(period.closesAt) > now));

export const readEvaluationPeriod = (branch?: string | null) =>
  readBranchScopedData<EvaluationPeriod | null>(SCOPE, branch) ?? null;

export const fetchEvaluationPeriod = async (branch?: string | null): Promise<EvaluationPeriod | null> => {
  const { data, error } = await supabase.from("instructor_evaluation_periods")
    .select("is_open,closes_at,updated_at")
    .eq("branch", normalizeBranchName(branch)).maybeSingle();
  if (error) throw new Error(error.message);
  const period = data ? {
    isOpen: Boolean(data.is_open),
    closesAt: data.closes_at,
    updatedAt: data.updated_at,
  } : null;
  writeBranchScopedData(SCOPE, branch, period);
  return period;
};

export const saveEvaluationPeriod = async (
  branch: string | null | undefined,
  isOpen: boolean,
  closesAt: string | null,
): Promise<EvaluationPeriod> => {
  if (isOpen && closesAt && (!Number.isFinite(Date.parse(closesAt)) || Date.parse(closesAt) <= Date.now())) {
    throw new Error("Choose a closing date and time in the future.");
  }
  const { data, error } = await supabase.from("instructor_evaluation_periods").upsert({
    branch: normalizeBranchName(branch), is_open: isOpen,
    closes_at: closesAt, updated_at: new Date().toISOString(),
  }, { onConflict: "branch" }).select("is_open,closes_at,updated_at").single();
  if (error) throw new Error(error.message);
  const period = { isOpen: Boolean(data.is_open), closesAt: data.closes_at, updatedAt: data.updated_at };
  writeBranchScopedData(SCOPE, branch, period);
  window.dispatchEvent(new CustomEvent(EVALUATION_PERIOD_UPDATED_EVENT));
  return period;
};

export const toLocalDateTimeInput = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
