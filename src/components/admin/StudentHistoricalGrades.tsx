import { useEffect, useState } from 'react';
import { fetchAcademicSubjects, fetchAcademicInstructors, type AcademicSubjectRecord, type AcademicInstructorRecord } from '../../services/academicData';
import {
  buildHistoricalGradeRecords, getHistoricalTerms, getHistoricalSubjects, isHistoricalGradeChanged,
  saveHistoricalGrade, getHistoricalSemesterInstructor, shouldSaveHistoricalGradeDraft, type HistoricalGradeDraft, type HistoricalStudent, type HistoricalTerm,
} from '../../services/studentHistoricalGrades';
import { fetchAndCacheStudentGradeRecordsForBranch, getStudentGradeRecords, getRequiredShsQuarterLabelsForSemester, STUDENT_GRADE_RECORDS_UPDATED_EVENT, type StoredStudentGradeRecord } from '../../services/studentGrades';
import '../../styles/admin/student-historical-grades.css';

interface Props {
  student: HistoricalStudent;
  branch: string;
  recordedBy: string;
  schoolYearFilter?: string;
  semesterFilter?: string;
  searchTerm?: string;
  onRemove?: (record: StoredStudentGradeRecord) => void;
}
type SectionDrafts = Record<string, HistoricalGradeDraft>;
type SectionFeedback = { error?: string; message?: string };
const sectionKey = (term: HistoricalTerm, period: string) => `${term.academicYear}::${term.semester}::${period}`;
const subjectKey = (subject: AcademicSubjectRecord) => subject.code.trim().toUpperCase();

export default function StudentHistoricalGrades({ student, branch, recordedBy, schoolYearFilter = 'all', semesterFilter = 'all', searchTerm = '', onRemove }: Props) {
  const [subjects, setSubjects] = useState<AcademicSubjectRecord[]>([]);
  const [instructors, setInstructors] = useState<AcademicInstructorRecord[]>([]);
  const [records, setRecords] = useState<StoredStudentGradeRecord[]>(() => getStudentGradeRecords({ branch, studentId: student.id }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, SectionDrafts>>({});
  const [semesterInstructors, setSemesterInstructors] = useState<Record<string, Record<string, string>>>({});
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
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load previous grades.'); })
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

  const isCollege = student.program === 'College';
  const getPeriods = (term: HistoricalTerm) => isCollege ? [term.semester] : getRequiredShsQuarterLabelsForSemester(term.semester);
  const getTermKey = (term: HistoricalTerm) => sectionKey(term, term.semester);
  const getSemesterRecords = (subject: AcademicSubjectRecord, term: HistoricalTerm) =>
    getPeriods(term).map(period => matching(subject.code, term, period));
  const getDraft = (subject: AcademicSubjectRecord, term: HistoricalTerm, period: string) => {
    const saved = matching(subject.code, term, period);
    const code = subjectKey(subject);
    const draft = drafts[sectionKey(term, period)]?.[code] ?? { grade: saved?.grade ?? '', instructorId: saved?.instructorId ?? '' };
    return isCollege ? draft : {
      ...draft,
      instructorId: getHistoricalSemesterInstructor(getSemesterRecords(subject, term), semesterInstructors[getTermKey(term)]?.[code]),
    };
  };
  const clear = (key: string) => {
    setDrafts(current => { const next = { ...current }; delete next[key]; return next; });
    setFeedback(current => { const next = { ...current }; delete next[key]; return next; });
  };

  const clearSemester = (term: HistoricalTerm) => {
    for (const period of getPeriods(term)) clear(sectionKey(term, period));
    setSemesterInstructors(current => { const next = { ...current }; delete next[getTermKey(term)]; return next; });
  };

  const changeInstructor = (term: HistoricalTerm, period: string, subject: AcademicSubjectRecord, saved: StoredStudentGradeRecord | undefined, value: string) => {
    if (isCollege) {
      change(sectionKey(term, period), subject, saved, 'instructorId', value);
      return;
    }
    const termKey = getTermKey(term);
    setSemesterInstructors(current => ({
      ...current,
      [termKey]: { ...current[termKey], [subjectKey(subject)]: value },
    }));
    setFeedback(current => ({ ...current, [termKey]: {} }));
  };

  const change = (key: string, subject: AcademicSubjectRecord, saved: StoredStudentGradeRecord | undefined, field: keyof HistoricalGradeDraft, value: string, feedbackKey = key) => {
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
    setFeedback(current => ({ ...current, [feedbackKey]: {} }));
  };

  const save = async (term: HistoricalTerm, period: string, available: AcademicSubjectRecord[]) => {
    if (savingSection) return;
    const key = isCollege ? sectionKey(term, period) : getTermKey(term);
    try {
      const changes = getPeriods(term).flatMap(gradingPeriod => {
        const edits = available.flatMap(subject => {
          const draft = getDraft(subject, term, gradingPeriod);
          const existingRecord = matching(subject.code, term, gradingPeriod);
          const changed = isCollege
            ? drafts[key]?.[subjectKey(subject)] && isHistoricalGradeChanged(draft, existingRecord)
            : shouldSaveHistoricalGradeDraft(draft, existingRecord);
          return changed ? [{ ...draft, subject, existingRecord }] : [];
        });
        return buildHistoricalGradeRecords({ student, branch, term, period: gradingPeriod, edits, instructors, recordedBy });
      });
      if (!changes.length) return;
      setSavingSection(key);
      setFeedback(current => ({ ...current, [key]: {} }));
      const saved = await saveHistoricalGrade(branch, student.id, changes);
      setRecords(saved.filter(row => row.studentId.toUpperCase() === student.id.toUpperCase()));
      if (isCollege) clear(key);
      else {
        // Keep instructor choices for subjects that still have no entered grade.
        clearSemester(term);
        const persistedCodes = new Set(changes.map(record => record.subjectCode.trim().toUpperCase()));
        const unsaved = Object.fromEntries(Object.entries(semesterInstructors[key] ?? {}).filter(([code]) => !persistedCodes.has(code)));
        if (Object.keys(unsaved).length) setSemesterInstructors(current => ({ ...current, [key]: unsaved }));
      }
      setFeedback(current => ({ ...current, [key]: { message: `${isCollege ? period : term.semester} grades and instructors saved.` } }));
    } catch (reason) {
      setFeedback(current => ({ ...current, [key]: { error: reason instanceof Error ? reason.message : 'Unable to save grades.' } }));
    } finally { setSavingSection(null); }
  };

  const terms = getHistoricalTerms(student).filter(term =>
    (schoolYearFilter === "all" || term.academicYear === schoolYearFilter) &&
    (semesterFilter === "all" || term.semester === semesterFilter),
  );
  const normalizedSearch = searchTerm.trim().toLowerCase();
  return <section className="student-history" aria-label="Previous semester grades">
    {loading && <p role="status">Loading curriculum and grades...</p>}
    {error && <p role="alert" className="student-history-error">{error}</p>}
    {!loading && !instructors.length && <p>Add the original instructor to this branch in Instructor Management before recording grades.</p>}
    {!loading && !terms.length && <p>No previous semesters match the current filters.</p>}
    {!loading && terms.map(term => {
      const available = getHistoricalSubjects(student, term, subjects);
      const extra = records.filter(row => row.source === 'historical' && row.academicYear === term.academicYear &&
        row.semester === term.semester && !available.some(subject => subject.code.toUpperCase() === row.subjectCode.toUpperCase()));
      const all: AcademicSubjectRecord[] = [...available, ...extra.filter((row, index) =>
        extra.findIndex(item => item.subjectCode.toUpperCase() === row.subjectCode.toUpperCase()) === index).map(row => ({
        id: row.subjectCode, code: row.subjectCode, name: row.subjectTitle, units: row.units ?? undefined,
        program: student.program, yearLevel: term.yearLevel, semester: term.semester,
      }))];
      const periods = getPeriods(term);
      return <details key={`${term.academicYear}-${term.semester}`} open className="student-history-term">
        <summary>{term.yearLevel} - {term.academicYear} - {term.semester}</summary>
        {!all.length ? <p>No subjects are configured for this course and term. Add them in Academic Management to enter grades.</p> : periods.map(period => {
          const key = sectionKey(term, period);
          const feedbackKey = isCollege ? key : getTermKey(term);
          const dirty = all.some(subject => isCollege
            ? Boolean(drafts[key]?.[subjectKey(subject)] && isHistoricalGradeChanged(getDraft(subject, term, period), matching(subject.code, term, period)))
            : periods.some(gradingPeriod => shouldSaveHistoricalGradeDraft(getDraft(subject, term, gradingPeriod), matching(subject.code, term, gradingPeriod))));
          const hasInstructorSelection = !isCollege && Object.keys(semesterInstructors[feedbackKey] ?? {}).length > 0;
          const sectionLabel = `${term.yearLevel} - ${term.academicYear} - ${term.semester}${student.program === 'College' ? '' : ` - ${period}`}`;
          return <section className="student-history-period" key={period} aria-label={sectionLabel}>
            {student.program !== 'College' && <h4>{period}</h4>}
            <div className="students-grade-table-wrapper"><table className={`students-grade-table${isCollege ? "" : " student-history-shs-table"}`}>
              <thead><tr><th>Subject</th>{isCollege && <th>Units</th>}<th>{period}</th><th>Instructor</th><th>Actions</th></tr></thead>
              <tbody>{all.filter(subject => {
                const saved = matching(subject.code, term, period);
                return (!onRemove || !saved || saved.source === "historical") && (!normalizedSearch ||
                  [subject.code, subject.name, period, saved?.grade, saved?.evaluation, saved?.instructorName].filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch));
              }).map(subject => {
                const saved = matching(subject.code, term, period);
                const protectedRecord = Boolean(saved && saved.source !== 'historical');
                const value = getDraft(subject, term, period);
                const semesterRecords = getSemesterRecords(subject, term);
                const protectedInstructor = !isCollege && semesterRecords.some(record => record && record.source !== 'historical' && record.instructorId);
                const teacherUnavailable = value.instructorId && !instructors.some(teacher => teacher.id === value.instructorId);
                const label = `${subject.code}, ${term.academicYear}, ${period}`;
                return <tr key={subject.id}>
                  <td>{subject.code} - {subject.name}{protectedRecord && <small className="student-history-readonly">Already uploaded</small>}</td>
                  {isCollege && <td>{subject.units ?? '-'}</td>}
                  <td><input className="student-history-grade-input" aria-label={`Historical grade: ${label}`}
                    value={value.grade} disabled={Boolean(savingSection) || protectedRecord}
                    onChange={event => change(key, subject, saved, 'grade', event.target.value, feedbackKey)}
                    placeholder={student.program === 'College' ? '50-100, INC, FAILED, DRP' : '60-100'} /></td>
                  <td><select className="student-history-instructor-select" aria-label={`Original instructor: ${label}`}
                    value={value.instructorId} disabled={Boolean(savingSection) || protectedRecord || protectedInstructor}
                    onChange={event => changeInstructor(term, period, subject, saved, event.target.value)}>
                    <option value="">Select an instructor</option>
                    {teacherUnavailable && <option value={value.instructorId} disabled>{semesterRecords.find(record => record?.instructorId === value.instructorId)?.instructorName || 'Saved instructor'} (unavailable)</option>}
                    {instructors.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name} ({teacher.employeeId})</option>)}
                  </select></td>
                  <td>{onRemove && <button type="button" className="students-grade-action-btn danger"
                    disabled={!saved?.grade.trim() || !saved.instructorId || Boolean(savingSection) || Boolean(drafts[key]?.[subjectKey(subject)]) || (!isCollege && shouldSaveHistoricalGradeDraft(value, saved))}
                    onClick={() => { if (saved) onRemove(saved); }}>Remove</button>}</td>
                </tr>;
              })}</tbody>
            </table></div>
            {feedback[feedbackKey]?.error && <p role="alert" className="student-history-error">{feedback[feedbackKey].error}</p>}
            {feedback[feedbackKey]?.message && <p role="status" className="student-history-success">{feedback[feedbackKey].message}</p>}
            {(dirty || hasInstructorSelection) && <div className="student-history-actions" aria-label={`Actions for ${sectionLabel}`}>
              <button type="button" disabled={Boolean(savingSection)} onClick={() => isCollege ? clear(key) : clearSemester(term)}>{isCollege ? 'Clear' : 'Clear Semester'}</button>
              <button type="button" className="student-history-save" disabled={Boolean(savingSection) || !instructors.length || !dirty}
                onClick={() => void save(term, period, all)}>{savingSection === feedbackKey ? 'Saving...' : isCollege ? 'Save' : 'Save Semester'}</button>
            </div>}
          </section>;
        })}
      </details>;
    })}
  </section>;
}

