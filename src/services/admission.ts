import { supabase } from "../lib/supabase";
import type {
  AdmissionApplicationStatus,
  AdmissionApplicationSummary,
  AdmissionBranchCode,
  AdmissionDraft,
  AdmissionProgramLevel,
  AdmissionProgramName,
  AdmissionRequirementDefinition,
  AdmissionRequirementUploadInput,
  AdmissionRequirementUploadResult,
  AdmissionStudentStatus,
  SaveAdmissionApplicationInput,
} from "../types/application";

const ENROLLMENT_DRAFT_KEY = "enrollmentDraft";
const REQUIREMENTS_BUCKET = "admission-requirements";

type SupabaseErrorLike = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
};

type AdmissionSummaryRow = {
  application_id: string;
  application_status: AdmissionApplicationStatus;
  applied_for_scholarship: boolean;
  branch_code: string;
  branch_name: string;
  created_at: string;
  current_step: number;
  first_name: string;
  honor_label: string | null;
  last_name: string;
  program_level: AdmissionProgramLevel;
  program_name: string;
  requirements_uploaded_at: string | null;
  student_status_label: string;
  submitted_at: string | null;
  track_name: string;
  tracking_number: string;
  updated_at: string;
};

type RequirementUploadRow = {
  file_name: string;
  requirement_code: string;
  requirement_name: string;
  storage_path: string;
  tracking_number: string;
  uploaded_at: string;
};

export const admissionBranches: ReadonlyArray<{
  code: AdmissionBranchCode;
  name: string;
}> = [
  { code: "bacoor", name: "Bacoor" },
  { code: "taytay", name: "Taytay" },
  { code: "gma", name: "GMA" },
];

export const admissionStatusOptions: ReadonlyArray<AdmissionStudentStatus> = [
  "Junior High Completer",
  "Senior High Graduate",
  "Transferee",
  "Foreign Student",
  "Cross-Registrant",
];

export const sexOptions = ["Male", "Female"] as const;

export const civilStatusOptions = [
  "Single",
  "Married",
  "Widowed",
  "Separated",
] as const;

export const honorOptions = [
  "No Honor",
  "With Honor (50%)",
  "High Honor (60%)",
  "Highest Honor (80%)",
] as const;

const programTracksByProgram: Record<AdmissionProgramName, string[]> = {
  College: ["BSE - Bachelor of Entrepreneurship"],
  "Senior High School": [
    "ABM - Accountancy, Business, and Management",
    "HUMSS - Humanities and Social Sciences",
    "GAS - General Academic Strand",
    "ICT - Information and Communications Technology",
    "IA - Industrial Arts",
  ],
};

const requirementDefinitionsByStatus: Record<
  AdmissionStudentStatus,
  AdmissionRequirementDefinition[]
> = {
  "Junior High Completer": [
    { code: "form_137", name: "Form 137", optional: true },
    {
      code: "grade_report_card",
      name: "Grade Report Card",
      optional: true,
    },
    {
      code: "birth_certificate_psa",
      name: "Birth Certificate/PSA",
      optional: true,
    },
    {
      code: "good_moral_character",
      name: "Good Moral Character",
      optional: true,
    },
  ],
  "Senior High Graduate": [
    { code: "form_137", name: "Form 137", optional: true },
    {
      code: "diploma_certificate_of_graduation",
      name: "Diploma/Certificate of Graduation",
      optional: true,
    },
    {
      code: "birth_certificate_psa",
      name: "Birth Certificate/PSA",
      optional: true,
    },
    {
      code: "good_moral_character",
      name: "Good Moral Character",
      optional: true,
    },
  ],
  Transferee: [
    {
      code: "transcript_of_records",
      name: "Transcript of Records (TOR)",
      optional: true,
    },
    {
      code: "honorable_dismissal",
      name: "Honorable Dismissal",
      optional: true,
    },
    {
      code: "birth_certificate_psa",
      name: "Birth Certificate/PSA",
      optional: true,
    },
    {
      code: "good_moral_character",
      name: "Good Moral Character",
      optional: true,
    },
  ],
  "Foreign Student": [
    { code: "passport", name: "Passport", optional: true },
    { code: "visa", name: "Visa", optional: true },
    {
      code: "birth_certificate_psa",
      name: "Birth Certificate/PSA",
      optional: true,
    },
    {
      code: "good_moral_character",
      name: "Good Moral Character",
      optional: true,
    },
  ],
  "Cross-Registrant": [
    {
      code: "permit_to_cross_register",
      name: "Permit to Cross-Register",
      optional: true,
    },
    {
      code: "current_school_id",
      name: "Current School ID",
      optional: true,
    },
    {
      code: "birth_certificate_psa",
      name: "Birth Certificate/PSA",
      optional: true,
    },
    {
      code: "good_moral_character",
      name: "Good Moral Character",
      optional: true,
    },
  ],
};

const mapAdmissionSummary = (
  row: AdmissionSummaryRow,
): AdmissionApplicationSummary => ({
  applicationId: row.application_id,
  trackingNumber: row.tracking_number,
  branchCode: row.branch_code,
  branchName: row.branch_name,
  studentStatus: row.student_status_label,
  programName: row.program_name,
  programLevel: row.program_level,
  trackName: row.track_name,
  honorLabel: row.honor_label,
  appliedForScholarship: row.applied_for_scholarship,
  applicationStatus: row.application_status,
  currentStep: row.current_step,
  firstName: row.first_name,
  lastName: row.last_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  submittedAt: row.submitted_at,
  requirementsUploadedAt: row.requirements_uploaded_at,
});

const normalizeTrackingNumber = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, "");

const normalizePhoneNumber = (value: string) => value.replace(/\D/g, "");

const sanitizeFileName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_");

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

export const normalizeBranchCode = (branchCode: string) =>
  branchCode.trim().toLowerCase() as AdmissionBranchCode;

export const getAdmissionBranchName = (branchCode: string) =>
  admissionBranches.find(
    (branch) => branch.code === normalizeBranchCode(branchCode),
  )?.name ?? branchCode;

export const getAvailablePrograms = (
  branchCode: string,
  studentStatus: string,
): AdmissionProgramName[] => {
  const normalizedBranch = normalizeBranchCode(branchCode);

  if (studentStatus === "Junior High Completer") {
    return ["Senior High School"];
  }

  if (studentStatus === "Senior High Graduate") {
    return normalizedBranch === "bacoor" ? ["College"] : [];
  }

  if (
    studentStatus === "Transferee" ||
    studentStatus === "Foreign Student" ||
    studentStatus === "Cross-Registrant"
  ) {
    return normalizedBranch === "bacoor"
      ? ["College", "Senior High School"]
      : ["Senior High School"];
  }

  return normalizedBranch === "bacoor"
    ? ["College", "Senior High School"]
    : ["Senior High School"];
};

export const getTrackOptions = (programName: string) =>
  programTracksByProgram[programName as AdmissionProgramName] ?? [];

export const getProgramLevel = (programName: string): AdmissionProgramLevel =>
  programName === "College" ? "college" : "senior_high_school";

export const getAdmissionRequirements = (
  studentStatus: string,
  programName: string,
  honorLabel: string,
): AdmissionRequirementDefinition[] => {
  const baseRequirements =
    requirementDefinitionsByStatus[
      studentStatus as AdmissionStudentStatus
    ] ?? [];

  if (
    programName === "College" &&
    honorLabel.trim() !== "" &&
    honorLabel !== "No Honor"
  ) {
    return [
      ...baseRequirements,
      {
        code: "honor_certificate",
        name: "Honor Certificate",
        optional: false,
      },
    ];
  }

  return baseRequirements;
};

export const generateAicsTrackingNumber = (date = new Date()) => {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AICS-${datePart}-${randomPart}`;
};

export const getAdmissionDraft = (): AdmissionDraft | null => {
  const savedDraft = sessionStorage.getItem(ENROLLMENT_DRAFT_KEY);
  if (!savedDraft) {
    return null;
  }

  try {
    return JSON.parse(savedDraft) as AdmissionDraft;
  } catch (error) {
    console.warn("Failed to parse admission draft", error);
    return null;
  }
};

export const saveAdmissionDraft = (draft: AdmissionDraft) => {
  sessionStorage.setItem(ENROLLMENT_DRAFT_KEY, JSON.stringify(draft));
};

export const mergeAdmissionDraft = (partialDraft: AdmissionDraft) => {
  const nextDraft = {
    ...(getAdmissionDraft() ?? {}),
    ...partialDraft,
  };
  saveAdmissionDraft(nextDraft);
  return nextDraft;
};

export const clearAdmissionDraft = () => {
  sessionStorage.removeItem(ENROLLMENT_DRAFT_KEY);
};

export const saveAdmissionApplication = async (
  input: SaveAdmissionApplicationInput,
) => {
  const { data, error } = await supabase
    .rpc("upsert_admission_application", {
      p_tracking_number: input.trackingNumber
        ? normalizeTrackingNumber(input.trackingNumber)
        : null,
      p_branch_code: normalizeBranchCode(input.branchCode),
      p_student_status_label: input.studentStatus.trim(),
      p_program_name: input.programName.trim(),
      p_track_name: input.trackName.trim(),
      p_first_name: input.firstName.trim(),
      p_last_name: input.lastName.trim(),
      p_middle_name: input.middleName?.trim() || null,
      p_sex: input.sex.trim(),
      p_civil_status: input.civilStatus.trim(),
      p_address: input.address.trim(),
      p_email: input.email.trim().toLowerCase(),
      p_phone_number: normalizePhoneNumber(input.phoneNumber),
      p_last_school_attended: input.lastSchoolAttended.trim(),
      p_year_completion: Number.parseInt(input.yearCompletion, 10),
      p_honor_label: input.honorLabel?.trim() || "No Honor",
      p_apply_scholarship: input.applyScholarship,
      p_current_step: input.currentStep ?? 2,
      p_application_status: input.applicationStatus ?? "draft",
    })
    .returns<AdmissionSummaryRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<AdmissionSummaryRow>(data);
  if (!row) {
    throw new Error("Supabase did not return the saved admission record.");
  }

  return mapAdmissionSummary(row);
};

export const getAdmissionProgress = async (trackingNumber: string) => {
  const normalizedTracking = normalizeTrackingNumber(trackingNumber);

  const { data, error } = await supabase
    .rpc("get_admission_progress", {
      p_tracking_number: normalizedTracking,
    })
    .returns<AdmissionSummaryRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<AdmissionSummaryRow>(data);
  return row ? mapAdmissionSummary(row) : null;
};

export const updateAdmissionProgress = async ({
  trackingNumber,
  currentStep,
  applicationStatus,
  markSubmitted = false,
}: {
  trackingNumber: string;
  currentStep: number;
  applicationStatus?: AdmissionApplicationStatus;
  markSubmitted?: boolean;
}) => {
  const { data, error } = await supabase
    .rpc("update_admission_progress", {
      p_tracking_number: normalizeTrackingNumber(trackingNumber),
      p_current_step: currentStep,
      p_application_status: applicationStatus ?? null,
      p_mark_submitted: markSubmitted,
    })
    .returns<AdmissionSummaryRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<AdmissionSummaryRow>(data);
  if (!row) {
    throw new Error("Supabase did not return the updated admission record.");
  }

  return mapAdmissionSummary(row);
};

export const uploadAdmissionRequirementFile = async (
  input: AdmissionRequirementUploadInput,
): Promise<AdmissionRequirementUploadResult> => {
  const normalizedTracking = normalizeTrackingNumber(input.trackingNumber);
  const safeFileName = sanitizeFileName(input.file.name);
  const storagePath = `${normalizedTracking}/${input.requirementCode}/${Date.now()}-${safeFileName}`;

  const { error: uploadError } = await supabase.storage
    .from(REQUIREMENTS_BUCKET)
    .upload(storagePath, input.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: input.file.type || undefined,
    });

  if (uploadError) {
    throw new Error(getErrorMessage(uploadError));
  }

  const { data, error } = await supabase
    .rpc("save_admission_requirement_file", {
      p_tracking_number: normalizedTracking,
      p_requirement_code: input.requirementCode,
      p_requirement_name: input.requirementName,
      p_storage_bucket: REQUIREMENTS_BUCKET,
      p_storage_path: storagePath,
      p_original_file_name: input.file.name,
      p_mime_type: input.file.type || null,
      p_file_size_bytes: input.file.size,
    })
    .returns<RequirementUploadRow[]>();

  if (error) {
    await supabase.storage.from(REQUIREMENTS_BUCKET).remove([storagePath]);
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<RequirementUploadRow>(data);
  if (!row) {
    throw new Error("Supabase did not return the uploaded requirement record.");
  }

  return {
    trackingNumber: row.tracking_number,
    requirementCode: row.requirement_code,
    requirementName: row.requirement_name,
    fileName: row.file_name,
    storagePath: row.storage_path,
    uploadedAt: row.uploaded_at,
  };
};
