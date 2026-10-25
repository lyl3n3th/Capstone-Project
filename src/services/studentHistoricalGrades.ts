import type { AcademicSubjectRecord, AcademicInstructorRecord } from './academicData';
import type { StudentStorageRecord } from './adminStorage';
import { supabase } from '../lib/supabase';
import { fetchAndCacheStudentGradeRecordsForBranch, validateAndNormalizeUploadedGradeRow, type StoredStudentGradeRecord } from './studentGrades';

export type HistoricalStudent = Pick<StudentStorageRecord, 'id' | 'name' | 'program' | 'yearLevel' | 'strandOrCourse' | 'importAcademicYear' | 'importSemester'>;
export interface HistoricalTerm { yearLevel: string; academicYear: string; semester: string }
export interface HistoricalGradeDraft { grade: string; instructorId: string }
export interface HistoricalGradeEdit extends HistoricalGradeDraft {
  subject: AcademicSubjectRecord;
  existingRecord?: StoredStudentGradeRecord;
}

export const isHistoricalGradeChanged = (draft: HistoricalGradeDraft, saved?: StoredStudentGradeRecord) =>
  draft.grade.trim() !== (saved?.grade ?? '').trim() ||
  draft.instructorId !== (saved?.instructorId ?? '');

export function buildHistoricalGradeRecords({ student, branch, term, period, edits, instructors, recordedBy }: {
  student: HistoricalStudent;
  branch: string;
  term: HistoricalTerm;
  period: string;
  edits: HistoricalGradeEdit[];
  instructors: AcademicInstructorRecord[];
  recordedBy: string;
}): StoredStudentGradeRecord[] {
  return edits.map(({ subject, grade, instructorId, existingRecord }) => {
    if (existingRecord && existingRecord.source !== 'historical') {
      throw new Error(`${subject.code}: An uploaded grade already exists. Use the existing grade controls.`);
    }
    if (!grade.trim()) {
      throw new Error(existingRecord
        ? `${subject.code}: To remove a saved grade, use Remove in Uploaded Grades below. Clear discards unsaved changes.`
        : `${subject.code}: Enter a grade, or clear the unsaved changes for this section.`);
    }
    const teacher = instructors.find(row => row.id === instructorId);
    if (!teacher) throw new Error(`${subject.code}: Choose an instructor from this branch.`);
    const result = validateAndNormalizeUploadedGradeRow({
      studentId: student.id, fullName: student.name, subjectCode: subject.code, subjectTitle: subject.name,
      grade: grade.trim(), unit: subject.units == null ? '' : String(subject.units), gradingPeriod: period,
      programType: student.program === 'College' ? 'College' : 'SHS',
      academicYear: term.academicYear, semester: term.semester, branch,
    }, undefined, { preserveStudentNumber: true });
    if (!result.normalizedRecord) throw new Error(`${subject.code}: ${result.errorReason}`);
    return {
      ...result.normalizedRecord, studentId: student.id,
      id: [student.id, subject.code, term.academicYear, term.semester, period].map(value => value.trim().toUpperCase()).join('::'),
      source: 'historical', yearLevel: term.yearLevel, instructorId: teacher.id,
      instructorName: teacher.name, instructorEmployeeId: teacher.employeeId, recordedBy,
    };
  });
}
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
