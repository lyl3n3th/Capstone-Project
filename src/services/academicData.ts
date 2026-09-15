import { supabase } from "../lib/supabase";
import {
  normalizeBranchName,
  readBranchScopedData,
  writeBranchScopedData,
} from "./adminStorage";

type SupabaseErrorLike = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
};

type AcademicSubjectRow = {
  id: string;
  code: string;
  name: string;
  units: number | null;
  program: string;
  year_level: string;
  semester: string;
  strand: string | null;
  is_minor: boolean;
  prerequisite_subject_ids: string[] | null;
};

type AcademicInstructorRow = {
  id: string;
  name: string;
  employee_id: string;
  department: string;
  email: string;
  contact_number: string;
};

type AcademicClassSectionRow = {
  id: string;
  code: string;
  program: string;
  year_level: string;
  semester: string;
  strand: string | null;
  section: string;
  current_enrollees: number;
  max_capacity: number;
  enrollee_ids: string[] | null;
};

type AcademicAssignmentScheduleSlotRow = {
  day: string;
  startTime: string;
  endTime: string;
  room: string;
};

type AcademicSubjectAssignmentRow = {
  id: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  instructor_id: string;
  instructor_name: string;
  section_id: string;
  section_code: string;
  schedule: AcademicAssignmentScheduleSlotRow[] | null;
  academic_year: string;
  semester: string;
};

const storageScopes = {
  subjects: "subjects",
  instructors: "instructors",
  classSections: "class-sections",
  subjectAssignments: "subject-assignments",
  assignmentRooms: "assignment-rooms",
} as const;

const getErrorMessage = (error: SupabaseErrorLike) =>
  error.details
    ? `${error.message} ${error.details}`.trim()
    : error.hint
      ? `${error.message} ${error.hint}`.trim()
      : error.message;

const normalizeStringList = (values?: string[] | null) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value) => value !== ""),
    ),
  );

const getSingleRow = <T,>(data: unknown): T | null => {
  if (Array.isArray(data)) {
    return data.length > 0 ? (data[0] as T) : null;
  }

  if (data && typeof data === "object" && !("error" in data)) {
    return data as T;
  }

  return null;
};

export interface AcademicSubjectRecord {
  id: string;
  code: string;
  name: string;
  units?: number;
  program: string;
  yearLevel: string;
  semester: string;
  strand?: string;
  isMinor?: boolean;
  prerequisiteSubjectIds?: string[];
}

export interface AcademicInstructorRecord {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  email?: string;
  contactNumber?: string;
}

export interface AcademicClassSectionRecord {
  id: string;
  code: string;
  program: string;
  yearLevel: string;
  semester: string;
  strand?: string;
  section: string;
  currentEnrollees: number;
  maxCapacity: number;
  enrolleeIds: string[];
}

export interface AcademicScheduleSlotRecord {
  day: string;
  startTime: string;
  endTime: string;
  room: string;
}

export interface AcademicSubjectAssignmentRecord {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  instructorId: string;
  instructorName: string;
  sectionId: string;
  sectionCode: string;
  schedule: AcademicScheduleSlotRecord[];
  academicYear: string;
  semester: string;
}

export interface AcademicSnapshot {
  subjects: AcademicSubjectRecord[];
  instructors: AcademicInstructorRecord[];
  classSections: AcademicClassSectionRecord[];
  subjectAssignments: AcademicSubjectAssignmentRecord[];
  assignmentRooms: string[];
}

const mapAcademicSubject = (
  row: AcademicSubjectRow,
): AcademicSubjectRecord => ({
  id: row.id,
  code: row.code,
  name: row.name,
  units: typeof row.units === "number" ? row.units : undefined,
  program: row.program,
  yearLevel: row.year_level,
  semester: row.semester,
  strand: row.strand || undefined,
  isMinor: row.is_minor,
  prerequisiteSubjectIds: normalizeStringList(row.prerequisite_subject_ids),
});

const mapAcademicInstructor = (
  row: AcademicInstructorRow,
): AcademicInstructorRecord => ({
  id: row.id,
  name: row.name,
  employeeId: row.employee_id,
  department: row.department,
  email: row.email || undefined,
  contactNumber: row.contact_number || undefined,
});

const mapAcademicClassSection = (
  row: AcademicClassSectionRow,
): AcademicClassSectionRecord => ({
  id: row.id,
  code: row.code,
  program: row.program,
  yearLevel: row.year_level,
  semester: row.semester,
  strand: row.strand || undefined,
  section: row.section,
  currentEnrollees: row.current_enrollees,
  maxCapacity: row.max_capacity,
  enrolleeIds: normalizeStringList(row.enrollee_ids),
});

const mapAcademicSubjectAssignment = (
  row: AcademicSubjectAssignmentRow,
): AcademicSubjectAssignmentRecord => ({
  id: row.id,
  subjectId: row.subject_id,
  subjectCode: row.subject_code,
  subjectName: row.subject_name,
  instructorId: row.instructor_id || "",
  instructorName: row.instructor_name || "To be assigned",
  sectionId: row.section_id,
  sectionCode: row.section_code,
  schedule: Array.isArray(row.schedule)
    ? row.schedule.map((slot) => ({
        day: slot.day,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.room,
      }))
    : [],
  academicYear: row.academic_year,
  semester: row.semester,
});

const cacheAcademicSnapshot = (
  branch: string | null | undefined,
  snapshot: AcademicSnapshot,
) => {
  writeBranchScopedData(storageScopes.subjects, branch, snapshot.subjects);
  writeBranchScopedData(storageScopes.instructors, branch, snapshot.instructors);
  writeBranchScopedData(storageScopes.classSections, branch, snapshot.classSections);
  writeBranchScopedData(
    storageScopes.subjectAssignments,
    branch,
    snapshot.subjectAssignments,
  );
  writeBranchScopedData(
    storageScopes.assignmentRooms,
    branch,
    snapshot.assignmentRooms,
  );
};

const resolveSnapshotScopeForCache = <T,>(
  branch: string | null | undefined,
  scope: (typeof storageScopes)[keyof typeof storageScopes],
  remoteRecords: T[],
) => {
  if (remoteRecords.length > 0) {
    return remoteRecords;
  }

  const cachedRecords = readBranchScopedData<T[]>(scope, branch) ?? [];
  return cachedRecords.length > 0 ? cachedRecords : remoteRecords;
};

const mergeAcademicSnapshotWithLocalCache = (
  branch: string | null | undefined,
  snapshot: AcademicSnapshot,
): AcademicSnapshot => ({
  subjects: resolveSnapshotScopeForCache(
    branch,
    storageScopes.subjects,
    snapshot.subjects,
  ),
  instructors: resolveSnapshotScopeForCache(
    branch,
    storageScopes.instructors,
    snapshot.instructors,
  ),
  classSections: resolveSnapshotScopeForCache(
    branch,
    storageScopes.classSections,
    snapshot.classSections,
  ),
  subjectAssignments: resolveSnapshotScopeForCache(
    branch,
    storageScopes.subjectAssignments,
    snapshot.subjectAssignments,
  ),
  assignmentRooms: resolveSnapshotScopeForCache(
    branch,
    storageScopes.assignmentRooms,
    snapshot.assignmentRooms,
  ),
});

export const fetchAcademicSubjects = async (branch?: string | null) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("list_academic_subjects", {
      p_branch: resolvedBranch,
    })
    .returns<AcademicSubjectRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  return (Array.isArray(data) ? data : []).map(mapAcademicSubject);
};

export const saveAcademicSubject = async (
  branch: string | null | undefined,
  subject: AcademicSubjectRecord,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("upsert_academic_subject", {
      p_payload: {
        branch: resolvedBranch,
        id: subject.id,
        code: subject.code.trim().toUpperCase(),
        name: subject.name.trim(),
        units: subject.units ?? null,
        program: subject.program,
        year_level: subject.yearLevel,
        semester: subject.semester,
        strand: subject.strand ?? null,
        is_minor: Boolean(subject.isMinor),
        prerequisite_subject_ids: normalizeStringList(subject.prerequisiteSubjectIds),
      },
    })
    .returns<AcademicSubjectRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<AcademicSubjectRow>(data);
  if (!row) {
    throw new Error("Supabase did not return the saved subject.");
  }

  return mapAcademicSubject(row);
};

export const deleteAcademicSubject = async (
  branch: string | null | undefined,
  subjectId: string,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { error } = await supabase.rpc("delete_academic_subject", {
    p_branch: resolvedBranch,
    p_subject_id: subjectId,
  });

  if (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const fetchAcademicInstructors = async (branch?: string | null) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("list_academic_instructors", {
      p_branch: resolvedBranch,
    })
    .returns<AcademicInstructorRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  return (Array.isArray(data) ? data : []).map(mapAcademicInstructor);
};

export const saveAcademicInstructor = async (
  branch: string | null | undefined,
  instructor: AcademicInstructorRecord,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("upsert_academic_instructor", {
      p_payload: {
        branch: resolvedBranch,
        id: instructor.id,
        name: instructor.name.trim(),
        employee_id: instructor.employeeId.trim().toUpperCase(),
        department: instructor.department.trim(),
        email: instructor.email?.trim() || null,
        contact_number: instructor.contactNumber?.trim() || null,
      },
    })
    .returns<AcademicInstructorRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<AcademicInstructorRow>(data);
  if (!row) {
    throw new Error("Supabase did not return the saved instructor.");
  }

  return mapAcademicInstructor(row);
};

export const deleteAcademicInstructor = async (
  branch: string | null | undefined,
  instructorId: string,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { error } = await supabase.rpc("delete_academic_instructor", {
    p_branch: resolvedBranch,
    p_instructor_id: instructorId,
  });

  if (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const fetchAcademicClassSections = async (branch?: string | null) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("list_class_sections", {
      p_branch: resolvedBranch,
    })
    .returns<AcademicClassSectionRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  return (Array.isArray(data) ? data : []).map(mapAcademicClassSection);
};

export const saveAcademicClassSection = async (
  branch: string | null | undefined,
  section: AcademicClassSectionRecord,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("upsert_class_section", {
      p_payload: {
        branch: resolvedBranch,
        id: section.id,
        code: section.code.trim().toUpperCase(),
        program: section.program,
        year_level: section.yearLevel,
        semester: section.semester,
        strand: section.strand ?? null,
        section: section.section.trim(),
        current_enrollees: section.currentEnrollees,
        max_capacity: section.maxCapacity,
        enrollee_ids: normalizeStringList(section.enrolleeIds),
      },
    })
    .returns<AcademicClassSectionRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<AcademicClassSectionRow>(data);
  if (!row) {
    throw new Error("Supabase did not return the saved class section.");
  }

  return mapAcademicClassSection(row);
};

export const deleteAcademicClassSection = async (
  branch: string | null | undefined,
  sectionId: string,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { error } = await supabase.rpc("delete_class_section", {
    p_branch: resolvedBranch,
    p_section_id: sectionId,
  });

  if (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const fetchAcademicSubjectAssignments = async (
  branch?: string | null,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("list_subject_assignments", {
      p_branch: resolvedBranch,
    })
    .returns<AcademicSubjectAssignmentRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  return (Array.isArray(data) ? data : []).map(mapAcademicSubjectAssignment);
};

export const saveAcademicSubjectAssignment = async (
  branch: string | null | undefined,
  assignment: AcademicSubjectAssignmentRecord,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("upsert_subject_assignment", {
      p_payload: {
        branch: resolvedBranch,
        id: assignment.id,
        subject_id: assignment.subjectId,
        instructor_id: assignment.instructorId || null,
        section_id: assignment.sectionId,
        academic_year: assignment.academicYear.trim(),
        semester: assignment.semester,
        schedule: assignment.schedule,
      },
    })
    .returns<AcademicSubjectAssignmentRow[]>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<AcademicSubjectAssignmentRow>(data);
  if (!row) {
    throw new Error("Supabase did not return the saved subject assignment.");
  }

  return mapAcademicSubjectAssignment(row);
};

export const deleteAcademicSubjectAssignment = async (
  branch: string | null | undefined,
  assignmentId: string,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { error } = await supabase.rpc("delete_subject_assignment", {
    p_branch: resolvedBranch,
    p_assignment_id: assignmentId,
  });

  if (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const fetchAcademicAssignmentRooms = async (branch?: string | null) => {
  const resolvedBranch = normalizeBranchName(branch);
  const { data, error } = await supabase
    .rpc("list_assignment_rooms", {
      p_branch: resolvedBranch,
    })
    .returns<Array<{ room_name: string }>>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  return Array.from(
    new Set(
      (Array.isArray(data) ? data : [])
        .map((row) => row.room_name?.trim())
        .filter((roomName): roomName is string => Boolean(roomName)),
    ),
  );
};

export const saveAcademicAssignmentRoom = async (
  branch: string | null | undefined,
  roomName: string,
) => {
  const resolvedBranch = normalizeBranchName(branch);
  const normalizedRoomName = roomName.trim();
  const { data, error } = await supabase
    .rpc("upsert_assignment_room", {
      p_branch: resolvedBranch,
      p_room_name: normalizedRoomName,
    })
    .returns<Array<{ room_name: string }>>();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const row = getSingleRow<{ room_name: string }>(data);
  if (!row?.room_name) {
    throw new Error("Supabase did not return the saved room.");
  }

  return row.room_name;
};

export const fetchAcademicSnapshot = async (
  branch?: string | null,
): Promise<AcademicSnapshot> => {
  const resolvedBranch = normalizeBranchName(branch);
  const [subjects, instructors, classSections, subjectAssignments, assignmentRooms] =
    await Promise.all([
      fetchAcademicSubjects(resolvedBranch),
      fetchAcademicInstructors(resolvedBranch),
      fetchAcademicClassSections(resolvedBranch),
      fetchAcademicSubjectAssignments(resolvedBranch),
      fetchAcademicAssignmentRooms(resolvedBranch),
    ]);

  return {
    subjects,
    instructors,
    classSections,
    subjectAssignments,
    assignmentRooms,
  };
};

export const fetchAndCacheAcademicSnapshot = async (
  branch?: string | null,
): Promise<AcademicSnapshot> => {
  const resolvedBranch = normalizeBranchName(branch);
  const snapshot = await fetchAcademicSnapshot(resolvedBranch);
  const snapshotWithLocalFallback = mergeAcademicSnapshotWithLocalCache(
    resolvedBranch,
    snapshot,
  );
  cacheAcademicSnapshot(resolvedBranch, snapshotWithLocalFallback);
  return snapshotWithLocalFallback;
};

export const seedAcademicSnapshot = async (
  branch: string | null | undefined,
  snapshot: Partial<AcademicSnapshot>,
) => {
  const resolvedBranch = normalizeBranchName(branch);

  const subjects = snapshot.subjects ?? [];
  const instructors = snapshot.instructors ?? [];
  const classSections = snapshot.classSections ?? [];
  const subjectAssignments = snapshot.subjectAssignments ?? [];
  const assignmentRooms = snapshot.assignmentRooms ?? [];

  for (const subject of subjects) {
    await saveAcademicSubject(resolvedBranch, {
      ...subject,
      prerequisiteSubjectIds: [],
    });
  }

  for (const subject of subjects.filter(
    (item) => normalizeStringList(item.prerequisiteSubjectIds).length > 0,
  )) {
    await saveAcademicSubject(resolvedBranch, subject);
  }

  for (const instructor of instructors) {
    await saveAcademicInstructor(resolvedBranch, instructor);
  }

  for (const classSection of classSections) {
    await saveAcademicClassSection(resolvedBranch, classSection);
  }

  for (const roomName of assignmentRooms) {
    if (roomName.trim()) {
      await saveAcademicAssignmentRoom(resolvedBranch, roomName);
    }
  }

  for (const assignment of subjectAssignments) {
    await saveAcademicSubjectAssignment(resolvedBranch, assignment);
  }

  return fetchAndCacheAcademicSnapshot(resolvedBranch);
};
