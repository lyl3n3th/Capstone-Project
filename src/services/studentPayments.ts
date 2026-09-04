import { supabase } from "../lib/supabase";
import {
  normalizeBranchName,
  normalizeStudentNumberInput,
  readBranchScopedData,
  writeBranchScopedData,
} from "./adminStorage";

export const STUDENT_PAYMENTS_SCOPE = "student-payments";
export const STUDENT_PAYMENTS_UPDATED_EVENT = "aics-student-payments-updated";

export interface StudentPaymentRecord {
  id: string;
  studentNumber: string;
  trackingNumber?: string;
  branch: string;
  amount: number;
  receiptNumber: string;
  paidAt: string;
  encodedBy: string;
  encodedRole?: string;
  notes?: string;
  createdAt: string;
}

export interface StudentBalanceSummary {
  totalAssessment: number;
  totalPaid: number;
  currentBalance: number;
  status: "Unpaid" | "Partial" | "Fully Paid";
}

type StudentPaymentRow = {
  id: string;
  branch: string;
  student_number: string;
  tracking_number: string | null;
  amount: number | string;
  receipt_number: string;
  paid_at: string;
  encoded_by: string;
  encoded_role: string | null;
  notes: string | null;
  created_at: string;
};

type SupabaseErrorLike = {
  details?: string | null;
  hint?: string | null;
  message: string;
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

  return data && typeof data === "object" ? (data as T) : null;
};

const mapStudentPaymentRow = (row: StudentPaymentRow): StudentPaymentRecord => ({
  id: row.id,
  branch: row.branch,
  studentNumber: row.student_number,
  trackingNumber: row.tracking_number || undefined,
  amount: Number(row.amount),
  receiptNumber: row.receipt_number,
  paidAt: row.paid_at,
  encodedBy: row.encoded_by,
  encodedRole: row.encoded_role || undefined,
  notes: row.notes || undefined,
  createdAt: row.created_at,
});

const getPaymentStudentKey = ({
  branch,
  studentNumber,
  trackingNumber,
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const normalizedStudentNumber = studentNumber
    ? normalizeStudentNumberInput(studentNumber, resolvedBranch)
    : "";

  return `${resolvedBranch.toLowerCase()}::${normalizedStudentNumber.toUpperCase()}::${(
    trackingNumber || ""
  )
    .trim()
    .toUpperCase()}`;
};

const sortPayments = (payments: StudentPaymentRecord[]) =>
  [...payments].sort(
    (left, right) =>
      right.paidAt.localeCompare(left.paidAt) ||
      right.createdAt.localeCompare(left.createdAt),
  );

export const readStudentPaymentsForBranch = (branch?: string | null) =>
  sortPayments(
    readBranchScopedData<StudentPaymentRecord[]>(
      STUDENT_PAYMENTS_SCOPE,
      normalizeBranchName(branch),
    ) ?? [],
  );

export const writeStudentPaymentsForBranch = (
  branch: string | null | undefined,
  payments: StudentPaymentRecord[],
) => {
  const resolvedBranch = normalizeBranchName(branch);
  writeBranchScopedData(
    STUDENT_PAYMENTS_SCOPE,
    resolvedBranch,
    sortPayments(payments),
  );

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(STUDENT_PAYMENTS_UPDATED_EVENT, {
        detail: { branch: resolvedBranch },
      }),
    );
  }
};

export const fetchAndCacheStudentPaymentsForBranch = async (
  branch?: string | null,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("list_student_payments", { p_branch: resolvedBranch })
    .returns<StudentPaymentRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const payments = (Array.isArray(data) ? data : []).map(mapStudentPaymentRow);
  writeStudentPaymentsForBranch(resolvedBranch, payments);
  return payments;
};

export const fetchNextStudentPaymentReceiptNumber = async (
  branch?: string | null,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase.rpc(
    "next_student_payment_receipt_number",
    { p_branch: resolvedBranch },
  );

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  if (typeof data !== "string" || !data.trim()) {
    throw new Error("Unable to generate the next receipt number.");
  }

  return data;
};

export const getStudentPayments = ({
  branch,
  studentNumber,
  trackingNumber,
}: {
  branch?: string | null;
  studentNumber?: string | null;
  trackingNumber?: string | null;
}) => {
  const targetKey = getPaymentStudentKey({ branch, studentNumber, trackingNumber });

  return readStudentPaymentsForBranch(branch).filter(
    (payment) =>
      getPaymentStudentKey({
        branch: payment.branch,
        studentNumber: payment.studentNumber,
        trackingNumber: payment.trackingNumber,
      }) === targetKey,
  );
};

export const createStudentPayment = async ({
  branch,
  studentNumber,
  trackingNumber,
  amount,
  paidAt,
  encodedBy,
  encodedRole,
  notes,
}: Omit<StudentPaymentRecord, "id" | "createdAt" | "receiptNumber">) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("create_student_payment", {
      p_branch: resolvedBranch,
      p_student_number: normalizeStudentNumberInput(
        studentNumber,
        resolvedBranch,
      ),
      p_tracking_number: trackingNumber || null,
      p_amount: amount,
      p_paid_at: paidAt,
      p_encoded_by: encodedBy,
      p_encoded_role: encodedRole || null,
      p_notes: notes?.trim() || null,
    })
    .returns<StudentPaymentRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StudentPaymentRow>(data);
  if (!row) {
    throw new Error("Supabase did not return the recorded payment.");
  }

  const payment = mapStudentPaymentRow(row);
  const payments = readStudentPaymentsForBranch(resolvedBranch).filter(
    (existingPayment) => existingPayment.id !== payment.id,
  );
  writeStudentPaymentsForBranch(resolvedBranch, [...payments, payment]);
  return payment;
};

export const removeStudentPayment = async ({
  branch,
  paymentId,
}: {
  branch?: string | null;
  paymentId: string;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { error } = await supabase.rpc("delete_student_payment", {
    p_branch: resolvedBranch,
    p_payment_id: paymentId,
  });

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const payments = readStudentPaymentsForBranch(resolvedBranch);
  writeStudentPaymentsForBranch(
    resolvedBranch,
    payments.filter((payment) => payment.id !== paymentId),
  );
};

export const buildStudentBalanceSummary = ({
  totalAssessment,
  payments,
}: {
  totalAssessment: number;
  payments: StudentPaymentRecord[];
}): StudentBalanceSummary => {
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const currentBalance = Math.max(totalAssessment - totalPaid, 0);
  const status =
    totalAssessment <= 0 || currentBalance <= 0
      ? "Fully Paid"
      : totalPaid <= 0
        ? "Unpaid"
        : "Partial";

  return {
    totalAssessment,
    totalPaid,
    currentBalance,
    status,
  };
};

export const buildNextReceiptNumber = (
  branch: string | null | undefined,
  payments = readStudentPaymentsForBranch(branch),
) => {
  const prefix = normalizeBranchName(branch).slice(0, 3).toUpperCase();
  const receiptPattern = new RegExp(`^${prefix}-OR-(\\d+)$`, "i");
  const usedNumbers = new Set(
    payments
      .map((payment) => {
        const match = payment.receiptNumber.trim().match(receiptPattern);
        return match ? Number(match[1]) : null;
      })
      .filter(
        (value): value is number =>
          value !== null && Number.isInteger(value) && value > 0,
      ),
  );
  let nextNumber = 1;

  while (usedNumbers.has(nextNumber)) {
    nextNumber += 1;
  }

  return `${prefix}-OR-${String(nextNumber).padStart(5, "0")}`;
};
