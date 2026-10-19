import {
  getStudentRequirementSnapshot,
  normalizeBranchName,
} from "./adminStorage";
import {
  fetchAndCacheStudentGradeRecordsForBranch,
  getStudentGradeRecords,
} from "./studentGrades";
import {
  fetchAndCacheStudentPaymentsForBranch,
  getStudentPayments,
} from "./studentPayments";

export interface StudentRecordProtectionResult {
  isProtected: boolean;
  reasons: string[];
  gradeCount: number;
  credentialCount: number;
  paymentCount: number;
}

export const getStudentRecordProtection = async ({
  branch,
  studentNumber,
  trackingNumber,
}: {
  branch?: string | null;
  studentNumber: string;
  trackingNumber?: string | null;
}): Promise<StudentRecordProtectionResult> => {
  const resolvedBranch = normalizeBranchName(branch);

  await Promise.all([
    fetchAndCacheStudentGradeRecordsForBranch(resolvedBranch).catch((error) => {
      console.warn(
        "Unable to refresh grades before checking student record protection; using cached records.",
        error,
      );
    }),
    fetchAndCacheStudentPaymentsForBranch(resolvedBranch).catch((error) => {
      console.warn(
        "Unable to refresh payments before checking student record protection; using cached records.",
        error,
      );
    }),
  ]);

  const gradeCount = getStudentGradeRecords({
    branch: resolvedBranch,
    studentId: studentNumber,
  }).length;
  const requirementSnapshot = getStudentRequirementSnapshot({
    branch: resolvedBranch,
    studentNumber,
    trackingNumber,
  });
  // Required-document placeholders are not uploaded credentials. Use file
  // references instead of row counts or a possibly stale submitted total.
  const credentialCount = (requirementSnapshot?.applicantRecord.attachments ?? [])
    .filter((attachment) => {
      const url = attachment.url?.trim();
      return Boolean(attachment.storagePath?.trim() || (url && url !== "#"));
    }).length;
  const paymentCount = getStudentPayments({
    branch: resolvedBranch,
    studentNumber,
    trackingNumber,
  }).length;
  const reasons: string[] = [];

  if (gradeCount > 0) {
    reasons.push("grade records");
  }
  if (credentialCount > 0) {
    reasons.push("credential records");
  }
  if (paymentCount > 0) {
    reasons.push("financial payment records");
  }

  return {
    isProtected: reasons.length > 0,
    reasons,
    gradeCount,
    credentialCount,
    paymentCount,
  };
};

export const getStudentRecordProtectionMessage = (
  protection: StudentRecordProtectionResult,
  action: "archived" | "deleted" = "archived",
) =>
  `Students cannot be ${action} because the student has:\n${protection.reasons
    .map((reason) => `- ${reason}`)
    .join("\n")}\n\nRemove the related records first.`;
