import { getStudentCredentialOverview, type StudentPortalSubject } from "./adminStorage";
import { getEffectiveAdmissionDiscountPercentage } from "./admission";
import { getStudentGradeRecords } from "./studentGrades";
import {
  buildStudentBalanceSummary,
  fetchAndCacheStudentPaymentsForBranch,
  getStudentPayments,
  getStudentTuitionAssessment,
} from "./studentPayments";
import type { Student } from "../types/student";

export interface StudentBillingContext {
  student: Student;
  subjects: StudentPortalSubject[];
  academicYear: string;
  semester: string;
}

const normalizeTerm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export const getStudentBillingSummary = ({ student, subjects, academicYear, semester }: StudentBillingContext) => {
  const termSubjects = subjects.filter((subject) =>
    normalizeTerm(subject.academicYear) === normalizeTerm(academicYear) &&
    normalizeTerm(subject.semester) === normalizeTerm(semester),
  );
  const gradeRecords = getStudentGradeRecords({ branch: student.branch, studentId: student.studentNumber });
  const units = termSubjects.map((subject) => {
    if (typeof subject.units === "number" && Number.isFinite(subject.units) && subject.units >= 0) return subject.units;
    return gradeRecords.find((record) =>
      normalizeTerm(record.academicYear) === normalizeTerm(academicYear) &&
      normalizeTerm(record.semester) === normalizeTerm(semester) &&
      record.subjectCode.trim().toUpperCase() === subject.code.trim().toUpperCase() &&
      typeof record.units === "number" && Number.isFinite(record.units) && record.units >= 0,
    )?.units;
  });
  const totalUnits = units.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const assessmentAvailable = student.programType === "SHS" ||
    (units.length > 0 && units.every((value) => typeof value === "number") && totalUnits > 0);
  const credentials = getStudentCredentialOverview(student);
  const applicant = credentials?.applicantRecord;
  const discountPercentage = getEffectiveAdmissionDiscountPercentage({
    honorLabel: applicant?.honorLabel || "No Honor",
    honorCertificateApproved: Boolean(credentials?.items.some((item) =>
      item.name.trim().toLowerCase() === "honor certificate" && item.reviewStatus === "Approved",
    )),
    appliedForScholarship: Boolean(applicant?.appliedForScholarship || typeof applicant?.scholarshipExamScore === "number"),
    scholarshipExamScore: applicant?.scholarshipExamScore ?? null,
  });
  return {
    ...buildStudentBalanceSummary({
      totalAssessment: getStudentTuitionAssessment({ programType: student.programType, totalUnits, discountPercentage }),
      payments: getStudentPayments(student),
    }),
    assessmentAvailable,
    totalUnits,
  };
};

export class EnrollmentBalanceError extends Error {
  reason: "unpaid" | "unavailable" | "verification";

  constructor(message: string, reason: "unpaid" | "unavailable" | "verification") {
    super(message);
    this.name = "EnrollmentBalanceError";
    this.reason = reason;
  }
}

export const verifyStudentEnrollmentBalance = async (context: StudentBillingContext) => {
  if (context.student.programType === "SHS") return;
  try {
    await fetchAndCacheStudentPaymentsForBranch(context.student.branch);
  } catch {
    throw new EnrollmentBalanceError("Unable to verify your student balance. No enrollment request was submitted. Please refresh and try again.", "verification");
  }
  const summary = getStudentBillingSummary(context);
  if (!summary.assessmentAvailable) {
    throw new EnrollmentBalanceError("Your student balance assessment is unavailable. Please contact the cashier or registrar to verify your balance before enrolling for the next term.", "unavailable");
  }
  if (summary.currentBalance > 0) {
    const amount = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(summary.currentBalance);
    throw new EnrollmentBalanceError(`You have an unpaid student balance of ${amount}. Please pay your balance before enrolling for the next semester or academic year. Your enrollment request was not submitted.`, "unpaid");
  }
};
