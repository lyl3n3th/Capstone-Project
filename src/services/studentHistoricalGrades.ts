import type { AcademicSubjectRecord } from './academicData';
import type { StudentStorageRecord } from './adminStorage';
import { supabase } from '../lib/supabase';
import { fetchAndCacheStudentGradeRecordsForBranch, type StoredStudentGradeRecord } from './studentGrades';

export type HistoricalStudent = Pick<StudentStorageRecord, 'id' | 'name' | 'program' | 'yearLevel' | 'strandOrCourse' | 'importAcademicYear' | 'importSemester'>;
export interface HistoricalTerm { yearLevel: string; academicYear: string; semester: string }
const semesters = ['1st Semester', '2nd Semester', 'Summer'];
export function getHistoricalTerms(student: HistoricalStudent): HistoricalTerm[] {
  if (!student.importAcademicYear || !student.importSemester) return [];
  const levels = student.program === 'College' ? ['1st Year', '2nd Year', '3rd Year', '4th Year'] : ['Grade 11', 'Grade 12'];
  const current = levels.indexOf(student.yearLevel);
  const start = Number(student.importAcademicYear.slice(0, 4));
  const semesterIndex = semesters.indexOf(student.importSemester);
  if (current < 0 || !start || semesterIndex < 0) return [];
  return levels.slice(0, current + 1).flatMap((yearLevel, index) => {
    const year = start - current + index;
    return semesters.slice(0, index === current ? semesterIndex : 2).map((semester) => ({ yearLevel, academicYear: `${year}-${year + 1}`, semester }));
  });
}
const trackKey = (value: string) => value.trim().toLowerCase().split(/\s+-\s+/)[0];
export function getHistoricalSubjects(student: HistoricalStudent, term: HistoricalTerm, subjects: AcademicSubjectRecord[]) {
  return subjects.filter(subject => subject.program === student.program && subject.yearLevel === term.yearLevel && subject.semester === term.semester &&
    (!subject.strand || ['all', 'all strands', 'all courses'].includes(subject.strand.toLowerCase()) || trackKey(subject.strand) === trackKey(student.strandOrCourse || '')))
    .sort((a, b) => a.code.localeCompare(b.code));
}
export async function saveHistoricalGrade(branch: string, studentId: string, records: StoredStudentGradeRecord[]) {
  const { error } = await supabase.rpc('save_imported_student_historical_grades', { p_branch: branch, p_student_number: studentId, p_records: records });
  if (error) throw new Error(error.message);
  return fetchAndCacheStudentGradeRecordsForBranch(branch);
}
