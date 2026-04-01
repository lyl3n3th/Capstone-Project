export type AdmissionBranchCode = "bacoor" | "taytay" | "gma";

export type AdmissionStudentStatus =
  | "Junior High Completer"
  | "Senior High Graduate"
  | "Transferee"
  | "Foreign Student"
  | "Cross-Registrant";

export type AdmissionProgramName = "College" | "Senior High School";

export type AdmissionProgramLevel = "college" | "senior_high_school";

export type AdmissionSex = "Male" | "Female";

export type AdmissionCivilStatus =
  | "Single"
  | "Married"
  | "Widowed"
  | "Separated";

export type AdmissionApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "accepted"
  | "rejected"
  | "cancelled";

export interface AdmissionDraft {
  trackingNumber?: string;
  branch?: string;
  status?: string;
  step?: number;
  createdAt?: string;
  lastUpdated?: string;
  timestamp?: string;
  requirementsSkipped?: boolean;
  requirementsUploaded?: boolean;
  submitted?: boolean;
  submissionDate?: string;
  fname?: string;
  lname?: string;
  middle_name?: string;
  mname?: string;
  address?: string;
  email?: string;
  contact?: string;
  last_school_attended?: string;
  lastSchool?: string;
  year_completion?: string;
  yearCompletion?: string;
  program?: string;
  strand_or_course?: string;
  sex?: string;
  civil_status?: string;
  honor?: string;
  apply_scholarship?: boolean;
  [key: string]: boolean | number | string | undefined;
}

export interface AdmissionRequirementDefinition {
  code: string;
  name: string;
  optional: boolean;
}

export interface SaveAdmissionApplicationInput {
  trackingNumber?: string;
  branchCode: string;
  studentStatus: string;
  programName: string;
  trackName: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  sex: string;
  civilStatus: string;
  address: string;
  email: string;
  phoneNumber: string;
  lastSchoolAttended: string;
  yearCompletion: string;
  honorLabel?: string;
  applyScholarship: boolean;
  currentStep?: number;
  applicationStatus?: AdmissionApplicationStatus;
}

export interface AdmissionApplicationSummary {
  applicationId: string;
  trackingNumber: string;
  branchCode: string;
  branchName: string;
  studentStatus: string;
  programName: string;
  programLevel: AdmissionProgramLevel;
  trackName: string;
  honorLabel: string | null;
  appliedForScholarship: boolean;
  applicationStatus: AdmissionApplicationStatus;
  currentStep: number;
  firstName: string;
  lastName: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  requirementsUploadedAt: string | null;
}

export interface AdmissionRequirementUploadInput {
  trackingNumber: string;
  requirementCode: string;
  requirementName: string;
  file: File;
}

export interface AdmissionRequirementUploadResult {
  trackingNumber: string;
  requirementCode: string;
  requirementName: string;
  fileName: string;
  storagePath: string;
  uploadedAt: string;
}
