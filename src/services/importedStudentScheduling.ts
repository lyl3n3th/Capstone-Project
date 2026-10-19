import type { StudentStorageRecord } from './adminStorage';

export const isImportedIrregularStudent = (student: Pick<StudentStorageRecord, 'importAcademicYear' | 'importSemester' | 'importAcademicStanding'>) =>
  Boolean(student.importAcademicYear && student.importSemester && student.importAcademicStanding === 'Irregular');

// Import standing grants access to the schedule planner. Selection approval
// remains a separate state controlled by the administrator/registrar.
export function applyImportedScheduleDefaults<T extends Pick<StudentStorageRecord, 'importAcademicYear' | 'importSemester' | 'importAcademicStanding' | 'requestedOwnSchedule' | 'ownScheduleRequestStatus' | 'ownScheduleAcademicYear' | 'ownScheduleSemester' | 'ownScheduleSelectionStatus'>>(student: T): T {
  if (!isImportedIrregularStudent(student)) return student;
  return { ...student, requestedOwnSchedule: true,
    ownScheduleRequestStatus: student.ownScheduleRequestStatus || 'Approved',
    ownScheduleAcademicYear: student.ownScheduleAcademicYear || student.importAcademicYear,
    ownScheduleSemester: student.ownScheduleSemester || student.importSemester,
    ownScheduleSelectionStatus: student.ownScheduleSelectionStatus || 'Not Submitted',
  };
}
