import type { AcademicSubjectRecord } from './academicData';
import type { StudentGradeProgramType } from './studentGrades';

interface SubjectLookup {
  subjectId?: string;
  subjectCode: string;
  subjectTitle?: string;
  programType?: StudentGradeProgramType;
  semester?: string;
  yearLevel?: string;
}

const normalized = (value?: string) => (value ?? '').trim().toUpperCase();
const validUnits = (units?: number) =>
  typeof units === 'number' && Number.isFinite(units) && units >= 0 ? units : null;

// Units come exclusively from this branch's subject catalog. Prefer the
// assignment's exact subject ID; legacy request rows can match by subject code.
export function resolveGradeChangeSubjectUnits(lookup: SubjectLookup, subjects: AcademicSubjectRecord[]): number | null {
  if (lookup.subjectId) {
    const exact = subjects.find(subject => normalized(subject.id) === normalized(lookup.subjectId));
    if (exact) return validUnits(exact.units);
  }
  if (!normalized(lookup.subjectCode)) return null;
  let matches = subjects.filter(subject => normalized(subject.code) === normalized(lookup.subjectCode) &&
    (!lookup.programType || normalized(subject.program) === normalized(lookup.programType)) &&
    (!lookup.semester || normalized(subject.semester) === normalized(lookup.semester)) &&
    (!lookup.yearLevel || normalized(subject.yearLevel) === normalized(lookup.yearLevel)));
  if (matches.length > 1 && lookup.subjectTitle) {
    const byTitle = matches.filter(subject => normalized(subject.name) === normalized(lookup.subjectTitle));
    if (byTitle.length) matches = byTitle;
  }
  const units = new Set(matches.map(subject => validUnits(subject.units)));
  return units.size === 1 ? [...units][0] : null;
}
