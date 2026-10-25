import { useEffect, useState } from 'react';
import { fetchAcademicSubjects, fetchAcademicInstructors, type AcademicSubjectRecord, type AcademicInstructorRecord } from '../../services/academicData';
import {
  buildHistoricalGradeRecords, getHistoricalTerms, getHistoricalSubjects, isHistoricalGradeChanged,
  saveHistoricalGrade, type HistoricalGradeDraft, type HistoricalStudent, type HistoricalTerm,
} from '../../services/studentHistoricalGrades';
import { fetchAndCacheStudentGradeRecordsForBranch, getStudentGradeRecords, getRequiredShsQuarterLabelsForSemester, STUDENT_GRADE_RECORDS_UPDATED_EVENT, type StoredStudentGradeRecord } from '../../services/studentGrades';
import '../../styles/admin/student-historical-grades.css';

interface Props { student: HistoricalStudent; branch: string; recordedBy: string }
type SectionDrafts = Record<string, HistoricalGradeDraft>;
type SectionFeedback = { error?: string; message?: string };
const sectionKey = (term: HistoricalTerm, period: string) => `${term.academicYear}::${term.semester}::${period}`;
const subjectKey = (subject: AcademicSubjectRecord) => subject.code.trim().toUpperCase();

export default function StudentHistoricalGrades({ student, branch, recordedBy }: Props) {
  const [subjects, setSubjects] = useState<AcademicSubjectRecord[]>([]);
  const [instructors, setInstructors] = useState<AcademicInstructorRecord[]>([]);
  const [records, setRecords] = useState<StoredStudentGradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, SectionDrafts>>({});
  const [feedback, setFeedback] = useState<Record<string, SectionFeedback>>({});
  const [savingSection, setSavingSection] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([fetchAcademicSubjects(branch), fetchAcademicInstructors(branch), fetchAndCacheStudentGradeRecordsForBranch(branch)])
      .then(([available, teachers, saved]) => {
        if (active) {
          setSubjects(available); setInstructors(teachers);
          setRecords(saved.filter(row => row.studentId.toUpperCase() === student.id.toUpperCase()));
        }
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load historical grades.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [branch, student.id]);

  useEffect(() => {
    const refresh = () => setRecords(getStudentGradeRecords({ branch, studentId: student.id }));
    window.addEventListener(STUDENT_GRADE_RECORDS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(STUDENT_GRADE_RECORDS_UPDATED_EVENT, refresh);
  }, [branch, student.id]);

  const matching = (code: string, term: HistoricalTerm, period: string) => records.find(row =>
    row.subjectCode.toUpperCase() === code.toUpperCase() && row.academicYear === term.academicYear &&
    row.semester === term.semester && row.gradingPeriod === period);

  const clear = (key: string) => {
    setDrafts(current => { const next = { ...current }; delete next[key]; return next; });
    setFeedback(current => { const next = { ...current }; delete next[key]; return next; });
  };

  const change = (key: string, subject: AcademicSubjectRecord, saved: StoredStudentGradeRecord | undefined, field: keyof HistoricalGradeDraft, value: string) => {
    setDrafts(current => {
      const code = subjectKey(subject);
      const draft = { ...(current[key]?.[code] ?? { grade: saved?.grade ?? '', instructorId: saved?.instructorId ?? '' }), [field]: value };
      const section = { ...current[key] };
      if (isHistoricalGradeChanged(draft, saved)) section[code] = draft;
      else delete section[code];
      const next = { ...current };
      if (Object.keys(section).length) next[key] = section;
      else delete next[key];
      return next;
    });
    setFeedback(current => ({ ...current, [key]: {} }));
  };

  const save = async (term: HistoricalTerm, period: string, available: AcademicSubjectRecord[]) => {
    if (savingSection) return;
    const key = sectionKey(term, period);
    try {
      const edits = available.flatMap(subject => {
        const draft = drafts[key]?.[subjectKey(subject)];
        const existingRecord = matching(subject.code, term, period);
        return draft && isHistoricalGradeChanged(draft, existingRecord) ? [{ ...draft, subject, existingRecord }] : [];
      });
      if (!edits.length) return;
      const changes = buildHistoricalGradeRecords({ student, branch, term, period, edits, instructors, recordedBy });
      setSavingSection(key);
      setFeedback(current => ({ ...current, [key]: {} }));
      const saved = await saveHistoricalGrade(branch, student.id, changes);
      setRecords(saved.filter(row => row.studentId.toUpperCase() === student.id.toUpperCase()));
      setDrafts(current => { const next = { ...current }; delete next[key]; return next; });
      setFeedback(current => ({ ...current, [key]: { message: `${period} grades and instructors saved.` } }));
    } catch (reason) {
      setFeedback(current => ({ ...current, [key]: { error: reason instanceof Error ? reason.message : 'Unable to save grades.' } }));
    } finally { setSavingSection(null); }
  };

  const terms = getHistoricalTerms(student);
  return <section className="student-history" aria-label="Historical grades">
    <h3>Previous Years and Semesters</h3>
    <p>Earlier terms are based on the imported year level and academic year. Blank grades are not included in averages. Verify subjects against the student's official records.</p>
    <p>Enter grades and choose the original instructor directly in each row. Save applies only to the semester or quarter you are editing. Clear discards its unsaved changes.</p>
    <p>To remove a saved grade, use Remove in Uploaded Grades below.</p>
    {loading && <p role="status">Loading curriculum and historical grades...</p>}
    {error && <p role="alert" className="student-history-error">{error}</p>}
    {!loading && !instructors.length && <p>Add the original instructor to this branch in Instructor Management before recording grades.</p>}
    {!loading && !terms.length && <p>No earlier terms precede the student's imported placement.</p>}
    {!loading && terms.map(term => {
      const available = getHistoricalSubjects(student, term, subjects);
      const extra = records.filter(row => row.source === 'historical' && row.academicYear === term.academicYear &&
        row.semester === term.semester && !available.some(subject => subject.code.toUpperCase() === row.subjectCode.toUpperCase()));
      const all: AcademicSubjectRecord[] = [...available, ...extra.filter((row, index) =>
        extra.findIndex(item => item.subjectCode.toUpperCase() === row.subjectCode.toUpperCase()) === index).map(row => ({
        id: row.subjectCode, code: row.subjectCode, name: row.subjectTitle, units: row.units ?? undefined,
        program: student.program, yearLevel: term.yearLevel, semester: term.semester,
      }))];
      const periods = student.program === 'College' ? [term.semester] : getRequiredShsQuarterLabelsForSemester(term.semester);
      return <details key={`${term.academicYear}-${term.semester}`} open className="student-history-term">
        <summary>{term.yearLevel} · {term.academicYear} · {term.semester}</summary>
        {!all.length ? <p>No subjects are configured for this course and term. Add them in Academic Management to enter historical grades.</p> : periods.map(period => {
          const key = sectionKey(term, period);
          const dirty = all.some(subject => {
            const draft = drafts[key]?.[subjectKey(subject)];
            return draft && isHistoricalGradeChanged(draft, matching(subject.code, term, period));
          });
          const sectionLabel = `${term.yearLevel} · ${term.academicYear} · ${term.semester}${student.program === 'College' ? '' : ` · ${period}`}`;
          return <section className="student-history-period" key={period} aria-label={sectionLabel}>
            {student.program !== 'College' && <h4>{period}</h4>}
            <div className="students-grade-table-wrapper"><table className="students-grade-table">
              <thead><tr><th>Subject</th><th>Units</th><th>{period}</th><th>Original instructor</th></tr></thead>
              <tbody>{all.map(subject => {
                const saved = matching(subject.code, term, period);
                const protectedRecord = Boolean(saved && saved.source !== 'historical');
                const value = drafts[key]?.[subjectKey(subject)] ?? { grade: saved?.grade ?? '', instructorId: saved?.instructorId ?? '' };
                const teacherUnavailable = value.instructorId && !instructors.some(teacher => teacher.id === value.instructorId);
                const label = `${subject.code}, ${term.academicYear}, ${period}`;
                return <tr key={subject.id}>
                  <td>{subject.code} — {subject.name}{protectedRecord && <small className="student-history-readonly">Already uploaded</small>}</td>
                  <td>{subject.units ?? '—'}</td>
                  <td><input className="student-history-grade-input" aria-label={`Historical grade: ${label}`}
                    value={value.grade} disabled={Boolean(savingSection) || protectedRecord}
                    onChange={event => change(key, subject, saved, 'grade', event.target.value)}
                    placeholder={student.program === 'College' ? '50–100, INC, FAILED, DRP' : '60–100'} /></td>
                  <td><select className="student-history-instructor-select" aria-label={`Original instructor: ${label}`}
                    value={value.instructorId} disabled={Boolean(savingSection) || protectedRecord}
                    onChange={event => change(key, subject, saved, 'instructorId', event.target.value)}>
                    <option value="">Select an instructor</option>
                    {teacherUnavailable && <option value={value.instructorId} disabled>{saved?.instructorName || 'Saved instructor'} (unavailable)</option>}
                    {instructors.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name} ({teacher.employeeId})</option>)}
                  </select></td>
                </tr>;
              })}</tbody>
            </table></div>
            {feedback[key]?.error && <p role="alert" className="student-history-error">{feedback[key].error}</p>}
            {feedback[key]?.message && <p role="status" className="student-history-success">{feedback[key].message}</p>}
            {dirty && <div className="student-history-actions" aria-label={`Actions for ${sectionLabel}`}>
              <button type="button" disabled={Boolean(savingSection)} onClick={() => clear(key)}>Clear</button>
              <button type="button" className="student-history-save" disabled={Boolean(savingSection) || !instructors.length}
                onClick={() => void save(term, period, all)}>{savingSection === key ? 'Saving...' : 'Save'}</button>
            </div>}
          </section>;
        })}
      </details>;
    })}
  </section>;
}
