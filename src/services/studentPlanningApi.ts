import { supabase } from "../lib/supabase";
import {
  normalizeBranchName,
  readBranchScopedData,
  readStoredStudents,
  writeBranchScopedData,
  writeStoredStudents,
  type StudentScheduleSelectionRequestRecord,
  type StudentStorageRecord,
  type StudentSubjectPlanRecord,
} from "./adminStorage";

type SupabaseErrorLike = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
};

type StudentPlanningStateStatus = "Pending" | "Approved" | "Rejected";
type StudentPlanningSelectionStatus =
  | "Not Submitted"
  | "Pending Approval"
  | "Approved"
  | "Rejected";

type StudentPlanningStateRow = {
  student_number: string;
  tracking_number: string | null;
  requested_own_schedule: boolean;
  own_schedule_request_status: StudentPlanningStateStatus | null;
  own_schedule_academic_year: string | null;
  own_schedule_semester: string | null;
  own_schedule_selection_status: StudentPlanningSelectionStatus | null;
};

type StudentSubjectPlanRow = {
  id: string;
  student_number: string | null;
  tracking_number: string | null;
  semester: string;
  academic_year: string;
  source: StudentSubjectPlanRecord["source"];
  payload: StudentSubjectPlanRecord | null;
};

type StudentScheduleRequestRow = {
  id: string;
  student_number: string;
  tracking_number: string | null;
  academic_year: string;
  semester: string;
  status: StudentScheduleSelectionRequestRecord["status"];
  payload: StudentScheduleSelectionRequestRecord | null;
};

export interface StudentPlanningStateRecord {
  studentNumber: string;
  trackingNumber?: string;
  requestedOwnSchedule: boolean;
  ownScheduleRequestStatus?: StudentPlanningStateStatus;
  ownScheduleAcademicYear?: string;
  ownScheduleSemester?: string;
  ownScheduleSelectionStatus?: StudentPlanningSelectionStatus;
}

const STUDENT_SUBJECT_PLAN_SCOPE = "student-subject-plans";
const STUDENT_SCHEDULE_REQUEST_SCOPE = "student-schedule-requests";

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

  if (data && typeof data === "object" && !("error" in data)) {
    return data as T;
  }

  return null;
};

const mapStudentPlanningState = (
  row: StudentPlanningStateRow,
): StudentPlanningStateRecord => ({
  studentNumber: row.student_number,
  trackingNumber: row.tracking_number || undefined,
  requestedOwnSchedule: row.requested_own_schedule,
  ownScheduleRequestStatus: row.own_schedule_request_status || undefined,
  ownScheduleAcademicYear: row.own_schedule_academic_year || undefined,
  ownScheduleSemester: row.own_schedule_semester || undefined,
  ownScheduleSelectionStatus: row.own_schedule_selection_status || undefined,
});

const mapStudentSubjectPlan = (
  row: StudentSubjectPlanRow,
): StudentSubjectPlanRecord => ({
  ...(row.payload ?? {
    id: row.id,
    studentNumber: row.student_number || undefined,
    trackingNumber: row.tracking_number || undefined,
    semester: row.semester,
    academicYear: row.academic_year,
    assignedSubjects: [],
    creditedSubjects: [],
    source: row.source,
    updatedAt: new Date().toISOString(),
  }),
  id: row.id,
  studentNumber: row.student_number || row.payload?.studentNumber,
  trackingNumber: row.tracking_number || row.payload?.trackingNumber,
  semester: row.semester,
  academicYear: row.academic_year,
  source: row.source,
});

const mapStudentScheduleRequest = (
  row: StudentScheduleRequestRow,
): StudentScheduleSelectionRequestRecord => ({
  ...(row.payload ?? {
    id: row.id,
    studentNumber: row.student_number,
    academicYear: row.academic_year,
    semester: row.semester,
    status: row.status,
    studentName: "",
    branch: "",
    program: "",
    yearLevel: "",
    selections: [],
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  id: row.id,
  studentNumber: row.student_number,
  trackingNumber: row.tracking_number || row.payload?.trackingNumber,
  academicYear: row.academic_year,
  semester: row.semester,
  status: row.status,
});

const syncPlanningStateIntoLocalStudents = (
  branch: string | null | undefined,
  planningState: StudentPlanningStateRecord,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const nextStudents = readStoredStudents().map((student) => {
    const sameBranch = normalizeBranchName(student.branch) === resolvedBranch;
    const sameStudentNumber = student.id === planningState.studentNumber;
    const sameTrackingNumber =
      Boolean(planningState.trackingNumber) &&
      student.trackingNumber === planningState.trackingNumber;

    if (!sameBranch || (!sameStudentNumber && !sameTrackingNumber)) {
      return student;
    }

    return {
      ...student,
      requestedOwnSchedule: planningState.requestedOwnSchedule,
      ownScheduleRequestStatus: planningState.ownScheduleRequestStatus,
      ownScheduleAcademicYear: planningState.ownScheduleAcademicYear,
      ownScheduleSemester: planningState.ownScheduleSemester,
      ownScheduleSelectionStatus: planningState.ownScheduleSelectionStatus,
    };
  });

  writeStoredStudents(nextStudents);
};

export const mergeStudentPlanningStateIntoStudent = <
  T extends Pick<
    StudentStorageRecord,
    | "id"
    | "trackingNumber"
    | "requestedOwnSchedule"
    | "ownScheduleRequestStatus"
    | "ownScheduleAcademicYear"
    | "ownScheduleSemester"
    | "ownScheduleSelectionStatus"
  >,
>(
  student: T,
  planningState?: StudentPlanningStateRecord | null,
): T => {
  if (!planningState) {
    return student;
  }

  return {
    ...student,
    requestedOwnSchedule: planningState.requestedOwnSchedule,
    ownScheduleRequestStatus: planningState.ownScheduleRequestStatus,
    ownScheduleAcademicYear: planningState.ownScheduleAcademicYear,
    ownScheduleSemester: planningState.ownScheduleSemester,
    ownScheduleSelectionStatus: planningState.ownScheduleSelectionStatus,
  };
};

export const mergeStudentPlanningStatesIntoStudents = <
  T extends Pick<
    StudentStorageRecord,
    | "id"
    | "trackingNumber"
    | "requestedOwnSchedule"
    | "ownScheduleRequestStatus"
    | "ownScheduleAcademicYear"
    | "ownScheduleSemester"
    | "ownScheduleSelectionStatus"
  >,
>(
  students: T[],
  planningStates: StudentPlanningStateRecord[],
) => {
  const planningStateByKey = new Map(
    planningStates.map((planningState) => [planningState.studentNumber, planningState]),
  );
  const planningStateByTrackingNumber = new Map(
    planningStates
      .filter((planningState) => Boolean(planningState.trackingNumber))
      .map((planningState) => [planningState.trackingNumber as string, planningState]),
  );

  return students.map((student) =>
    mergeStudentPlanningStateIntoStudent(
      student,
      planningStateByKey.get(student.id) ||
        (student.trackingNumber
          ? planningStateByTrackingNumber.get(student.trackingNumber)
          : null),
    ),
  );
};

export const fetchStudentPlanningStates = async (
  branch?: string | null,
): Promise<StudentPlanningStateRecord[]> => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("list_student_planning_states", {
      p_branch: resolvedBranch,
    })
    .returns<StudentPlanningStateRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  return (Array.isArray(data) ? data : []).map(mapStudentPlanningState);
};

export const saveStudentPlanningState = async ({
  branch,
  studentNumber,
  trackingNumber,
  requestedOwnSchedule,
  ownScheduleRequestStatus,
  ownScheduleAcademicYear,
  ownScheduleSemester,
  ownScheduleSelectionStatus,
}: {
  branch: string | null | undefined;
  studentNumber: string;
  trackingNumber?: string | null;
  requestedOwnSchedule: boolean;
  ownScheduleRequestStatus?: StudentPlanningStateStatus;
  ownScheduleAcademicYear?: string | null;
  ownScheduleSemester?: string | null;
  ownScheduleSelectionStatus?: StudentPlanningSelectionStatus;
}) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("upsert_student_planning_state", {
      p_payload: {
        branch: resolvedBranch,
        student_number: studentNumber,
        tracking_number: trackingNumber || null,
        requested_own_schedule: requestedOwnSchedule,
        own_schedule_request_status: ownScheduleRequestStatus || null,
        own_schedule_academic_year: ownScheduleAcademicYear || null,
        own_schedule_semester: ownScheduleSemester || null,
        own_schedule_selection_status: ownScheduleSelectionStatus || null,
      },
    })
    .returns<StudentPlanningStateRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StudentPlanningStateRow>(data);
  if (!row) {
    throw new Error("Supabase did not return the saved student planning state.");
  }

  const nextPlanningState = mapStudentPlanningState(row);
  syncPlanningStateIntoLocalStudents(resolvedBranch, nextPlanningState);
  return nextPlanningState;
};

export const fetchStudentSubjectPlans = async (
  branch?: string | null,
): Promise<Record<string, StudentSubjectPlanRecord>> => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("list_student_subject_plans", {
      p_branch: resolvedBranch,
    })
    .returns<StudentSubjectPlanRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const nextPlans = Object.fromEntries(
    (Array.isArray(data) ? data : [])
      .map(mapStudentSubjectPlan)
      .map((plan) => [plan.id, plan]),
  );
  writeBranchScopedData(STUDENT_SUBJECT_PLAN_SCOPE, resolvedBranch, nextPlans);
  return nextPlans;
};

export const saveStudentSubjectPlan = async (
  branch: string | null | undefined,
  plan: StudentSubjectPlanRecord,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("upsert_student_subject_plan", {
      p_payload: {
        branch: resolvedBranch,
        ...plan,
      },
    })
    .returns<StudentSubjectPlanRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StudentSubjectPlanRow>(data);
  if (!row) {
    throw new Error("Supabase did not return the saved student subject plan.");
  }

  const nextPlan = mapStudentSubjectPlan(row);
  const existingPlans =
    readBranchScopedData<Record<string, StudentSubjectPlanRecord>>(
      STUDENT_SUBJECT_PLAN_SCOPE,
      resolvedBranch,
    ) ?? {};

  writeBranchScopedData(STUDENT_SUBJECT_PLAN_SCOPE, resolvedBranch, {
    ...existingPlans,
    [nextPlan.id]: nextPlan,
  });

  return nextPlan;
};

export const deleteStudentSubjectPlan = async (
  branch: string | null | undefined,
  planId: string,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { error } = await supabase.rpc("delete_student_subject_plan", {
    p_branch: resolvedBranch,
    p_plan_id: planId,
  });

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const existingPlans =
    readBranchScopedData<Record<string, StudentSubjectPlanRecord>>(
      STUDENT_SUBJECT_PLAN_SCOPE,
      resolvedBranch,
    ) ?? {};
  const nextPlans = { ...existingPlans };
  delete nextPlans[planId];
  writeBranchScopedData(STUDENT_SUBJECT_PLAN_SCOPE, resolvedBranch, nextPlans);
};

export const fetchStudentScheduleRequests = async (
  branch?: string | null,
): Promise<StudentScheduleSelectionRequestRecord[]> => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("list_student_schedule_requests", {
      p_branch: resolvedBranch,
    })
    .returns<StudentScheduleRequestRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const requests = (Array.isArray(data) ? data : []).map(
    mapStudentScheduleRequest,
  );
  writeBranchScopedData(STUDENT_SCHEDULE_REQUEST_SCOPE, resolvedBranch, requests);
  return requests;
};

export const saveStudentScheduleRequest = async (
  request: StudentScheduleSelectionRequestRecord,
) => {
  const resolvedBranch = normalizeBranchName(request.branch);
  const { data, error } = await supabase
    .rpc("upsert_student_schedule_request", {
      p_payload: {
        ...request,
        branch: resolvedBranch,
      },
    })
    .returns<StudentScheduleRequestRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<StudentScheduleRequestRow>(data);
  if (!row) {
    throw new Error("Supabase did not return the saved schedule request.");
  }

  const nextRequest = mapStudentScheduleRequest(row);
  const existingRequests =
    readBranchScopedData<StudentScheduleSelectionRequestRecord[]>(
      STUDENT_SCHEDULE_REQUEST_SCOPE,
      resolvedBranch,
    ) ?? [];
  const existingIndex = existingRequests.findIndex(
    (candidate) =>
      candidate.id === nextRequest.id ||
      (candidate.studentNumber === nextRequest.studentNumber &&
        candidate.academicYear === nextRequest.academicYear &&
        candidate.semester === nextRequest.semester),
  );

  const nextRequests =
    existingIndex >= 0
      ? existingRequests.map((candidate, index) =>
          index === existingIndex ? nextRequest : candidate,
        )
      : [nextRequest, ...existingRequests];

  writeBranchScopedData(STUDENT_SCHEDULE_REQUEST_SCOPE, resolvedBranch, nextRequests);
  return nextRequest;
};
