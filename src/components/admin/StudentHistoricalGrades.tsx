import { useEffect, useState } from 'react';
import { fetchAcademicSubjects, fetchAcademicInstructors, type AcademicSubjectRecord, type AcademicInstructorRecord } from '../../services/academicData';
import { getHistoricalTerms, getHistoricalSubjects, saveHistoricalGrade, type HistoricalStudent, type HistoricalTerm } from '../../services/studentHistoricalGrades';
import { fetchAndCacheStudentGradeRecordsForBranch, getStudentGradeRecords, getRequiredShsQuarterLabelsForSemester, STUDENT_GRADE_RECORDS_UPDATED_EVENT, validateAndNormalizeUploadedGradeRow, type StoredStudentGradeRecord } from '../../services/studentGrades';
import '../../styles/admin/student-historical-grades.css';

interface Props { student: HistoricalStudent; branch: string; recordedBy: string }
export default function StudentHistoricalGrades({ student, branch, recordedBy }: Props) {
  const [subjects, setSubjects] = useState<AcademicSubjectRecord[]>([]);
  const [instructors, setInstructors] = useState<AcademicInstructorRecord[]>([]);
  const [records, setRecords] = useState<StoredStudentGradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<{subject: AcademicSubjectRecord; term: HistoricalTerm; grades: Record<string,string>; instructorId: string} | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.all([fetchAcademicSubjects(branch), fetchAcademicInstructors(branch), fetchAndCacheStudentGradeRecordsForBranch(branch)])
      .then(([available, teachers, saved]) => { if(active) {setSubjects(available);setInstructors(teachers);setRecords(saved.filter(row=>row.studentId.toUpperCase()===student.id.toUpperCase()));} })
      .catch((reason: unknown)=>{if(active)setError(reason instanceof Error ? reason.message : 'Unable to load historical grades.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  }, [branch, student.id]);
  useEffect(() => {
    const refresh = () => setRecords(getStudentGradeRecords({ branch, studentId: student.id }));
    window.addEventListener(STUDENT_GRADE_RECORDS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(STUDENT_GRADE_RECORDS_UPDATED_EVENT, refresh);
  }, [branch, student.id]);
  const terms = getHistoricalTerms(student);
  const periods = (term: HistoricalTerm) => student.program === 'College' ? [term.semester] : getRequiredShsQuarterLabelsForSemester(term.semester);
  const matching = (code: string, term: HistoricalTerm) => records.filter(row=>row.subjectCode.toUpperCase()===code.toUpperCase() && row.academicYear===term.academicYear && row.semester===term.semester);
  const open = (subject: AcademicSubjectRecord, term: HistoricalTerm) => {
    const saved=matching(subject.code,term);setError('');setMessage('');
    setEditor({subject,term,grades:Object.fromEntries(periods(term).map(period=>[period,saved.find(row=>row.gradingPeriod===period)?.grade || ''])),instructorId:saved.find(row=>row.instructorId)?.instructorId || ''});
  };
  const save = async () => {
    if(!editor)return;
    const teacher=instructors.find(row=>row.id===editor.instructorId);
    if(!teacher){setError('Choose an instructor from this branch.');return;}
    const changes: StoredStudentGradeRecord[]=[];
    for(const period of periods(editor.term)) {
      const value=editor.grades[period].trim();
      if(!value)continue;
      const result=validateAndNormalizeUploadedGradeRow({studentId:student.id,fullName:student.name,subjectCode:editor.subject.code,subjectTitle:editor.subject.name,
        grade:value,unit:editor.subject.units == null ? '' : String(editor.subject.units),gradingPeriod:period,programType:student.program==='College'?'College':'SHS',
        academicYear:editor.term.academicYear,semester:editor.term.semester,branch});
      if(!result.normalizedRecord){setError(`${period}: ${result.errorReason}`);return;}
      changes.push({...result.normalizedRecord, studentId:student.id,
        id:[student.id,editor.subject.code,editor.term.academicYear,editor.term.semester,period].map(value=>value.trim().toUpperCase()).join('::'),
        source:'historical',yearLevel:editor.term.yearLevel,instructorId:teacher.id,instructorName:teacher.name,instructorEmployeeId:teacher.employeeId,recordedBy});
    }
    if(!changes.length){setError('Enter at least one grade. Empty grades remain unrecorded.');return;}
    setSaving(true);setError('');setMessage('');
    try {
      const saved=await saveHistoricalGrade(branch,student.id,changes);
      setRecords(saved.filter(row=>row.studentId.toUpperCase()===student.id.toUpperCase()));setEditor(null);setMessage('Historical grades and instructor saved.');
    } catch(reason) {setError(reason instanceof Error ? reason.message : 'Unable to save grades.');}
    finally {setSaving(false);}
  };
  return <section className="student-history" aria-label="Historical grades">
    <h3>Previous Years and Semesters</h3>
    <p>Earlier terms are based on the imported year level and academic year. Blank grades are not included in averages. Verify subjects against the student's official records.</p>
    <p>Choose the original instructor for each subject. This records grade attribution without creating a teaching assignment.</p>
    {loading && <p role="status">Loading curriculum and historical grades...</p>}
    {error && <p role="alert" className="student-history-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {editor && <div className="student-history-editor" aria-label="Historical grade editor">
      <h4>{editor.subject.code} — {editor.subject.name}</h4><p>{editor.term.yearLevel} · {editor.term.academicYear} · {editor.term.semester}</p>
      <label>Original instructor<select value={editor.instructorId} disabled={saving} onChange={event=>setEditor({...editor,instructorId:event.target.value})}>
        <option value="">Select an instructor</option>{instructors.map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.name} ({teacher.employeeId})</option>)}
      </select></label>
      {!instructors.length && <p>Add the original instructor to this branch in Instructor Management before recording grades.</p>}
      {periods(editor.term).map(period=><label key={period}>{period}<input aria-label={`Historical grade: ${period}`} value={editor.grades[period]} disabled={saving} onChange={event=>setEditor({...editor,grades:{...editor.grades,[period]:event.target.value}})} placeholder={student.program==='College'?'50–100, INC, FAILED, DRP':'60–100'} /></label>)}
      <p>Leave unrecorded grades empty. To remove a saved grade, use Remove in Uploaded Grades below.</p>
      <button type="button" disabled={saving} onClick={()=>{setEditor(null);setError('');}}>Cancel</button>
      <button type="button" disabled={saving || !instructors.length} onClick={()=>void save()}>{saving?'Saving...':'Save Historical Grades'}</button>
    </div>}
    {!loading && !terms.length && <p>No earlier terms precede the student's imported placement.</p>}
    {!loading && terms.map(term=>{
      const available=getHistoricalSubjects(student,term,subjects);
      const extra=records.filter(row=>row.source==='historical' && row.academicYear===term.academicYear && row.semester===term.semester && !available.some(subject=>subject.code===row.subjectCode));
      const all=[...available,...extra.filter((row,index)=>extra.findIndex(item=>item.subjectCode===row.subjectCode)===index).map(row=>({id:row.subjectCode,code:row.subjectCode,name:row.subjectTitle,units:row.units ?? undefined,program:student.program,yearLevel:term.yearLevel,semester:term.semester}))];
      return <details key={`${term.academicYear}-${term.semester}`} open className="student-history-term"><summary>{term.yearLevel} · {term.academicYear} · {term.semester}</summary>
        {!all.length?<p>No subjects are configured for this course and term. Add them in Academic Management to enter historical grades.</p>:<div className="students-grade-table-wrapper"><table className="students-grade-table"><thead><tr><th>Subject</th><th>Units</th>{periods(term).map(period=><th key={period}>{period}</th>)}<th>Original instructor</th><th>Action</th></tr></thead><tbody>
          {all.map(subject=>{const saved=matching(subject.code,term);const protectedRecord=saved.some(row=>row.source!=='historical');return <tr key={subject.id}><td>{subject.code} — {subject.name}</td><td>{subject.units ?? '—'}</td>{periods(term).map(period=><td key={period}>{saved.find(row=>row.gradingPeriod===period)?.normalizedGrade || <span className="student-history-blank">Not recorded</span>}</td>)}<td>{Array.from(new Set(saved.map(row=>row.instructorName).filter(Boolean))).join(', ') || 'Unassigned'}</td><td><button type="button" disabled={saving || protectedRecord} onClick={()=>open(subject,term)}>{protectedRecord?'Already uploaded':saved.length?'Edit historical grades':'Enter grades'}</button></td></tr>;})}
        </tbody></table></div>}
      </details>;
    })}
  </section>;
}
