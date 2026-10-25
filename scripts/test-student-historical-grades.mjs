import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const gradeServices = {};
const output = ts.transpileModule(readFileSync(new URL('../src/services/studentHistoricalGrades.ts', import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module = {exports:{}};
Function('require','module','exports',output)(name=>name.includes('supabase')?{supabase:{}}:name.includes('studentGrades')?gradeServices:require(name),module,module.exports);
const { getHistoricalTerms, getHistoricalSubjects }=module.exports;
const student={id:'LEGACY-2022-A',name:'Existing Student',program:'College',yearLevel:'4th Year',strandOrCourse:'BSE - Bachelor of Entrepreneurship',importAcademicYear:'2026-2027',importSemester:'1st Semester'};
const terms=getHistoricalTerms(student);
assert.equal(terms.length,6);
assert.deepEqual(terms[0],{yearLevel:'1st Year',academicYear:'2023-2024',semester:'1st Semester'});
assert.deepEqual(terms[5],{yearLevel:'3rd Year',academicYear:'2025-2026',semester:'2nd Semester'});
assert.equal(getHistoricalTerms({...student,importSemester:'2nd Semester'}).length,7);
assert.equal(getHistoricalTerms({...student,yearLevel:'1st Year'}).length,0);
assert.equal(getHistoricalTerms({...student,importAcademicYear:undefined}).length,0);
assert.equal(getHistoricalTerms({...student,program:'SHS',yearLevel:'Grade 12',importSemester:'2nd Semester'}).length,3);
const subject={id:'one',code:'BSE101',name:'Subject',units:3,program:'College',yearLevel:'1st Year',semester:'1st Semester',strand:'BSE'};
const others=[{...subject,id:'two',strand:'BSIT'},{...subject,id:'three',semester:'2nd Semester'},{...subject,id:'four',program:'SHS'},{...subject,id:'five',yearLevel:'4th Year'}];
assert.deepEqual(getHistoricalSubjects(student,terms[0],[subject,...others]),[subject]);
assert.equal(getHistoricalSubjects(student,terms[0],[{...subject,strand:'All'}]).length,1);
assert.deepEqual(getHistoricalSubjects(student,terms[0],[]),[]);
console.log('Historical grade checks passed: prior-year chronology, prior semesters, SHS terms, no current/future terms, and course-specific curriculum.');

let cache=[];
const gradeCode=ts.transpileModule(readFileSync(new URL('../src/services/studentGrades.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const gradeModule={exports:{}};
Function('require','module','exports',gradeCode)(name=>name.includes('adminStorage')?{
 normalizeBranchName:value=>value || 'Bacoor', normalizeStudentNumberInput:value=>value.replace(/\D/g,''),
 readBranchScopedData:()=>cache,writeBranchScopedData:(_scope,_branch,value)=>{cache=value;},
}:name.includes('supabase')?{supabase:{rpc:async()=>({data:null,error:null})}}:require(name),gradeModule,gradeModule.exports);
const grades=gradeModule.exports;
Object.assign(gradeServices, grades);
const originalId='LEGACY-2022-A';
const record={id:`${originalId}::BSE101::2023-2024::1ST SEMESTER::1ST SEMESTER`,studentId:originalId,fullName:'Existing Student',subjectCode:'BSE101',subjectTitle:'Subject',units:3,gradingPeriod:'1st Semester',semester:'1st Semester',academicYear:'2023-2024',programType:'College',grade:'INC',normalizedGrade:'INC',numericGrade:null,evaluation:'Incomplete',updatedAt:new Date().toISOString(),source:'historical',instructorId:'one',instructorName:'Original Teacher'};
assert.equal(grades.getStudentGradeRecords({branch:'Bacoor',studentId:originalId}).length,0,'Unrecorded terms must not be real grades');
cache=[record,{...record,studentId:'LEGACY-2022-B',id:record.id.replace('2022-A','2022-B')}];
assert.equal(grades.getStudentGradeRecords({branch:'Bacoor',studentId:originalId}).length,1,'Original legacy IDs must never collide after stripping letters');
assert.equal(grades.getStudentAcademicStanding({branch:'Bacoor',studentId:originalId,program:'College'}).label,'Irregular');
grades.applyStudentGradeUploadOperationsForBranch('Bacoor',[{type:'clear',identity:record}]);
assert.equal(cache.length,1);assert.equal(cache[0].studentId,'LEGACY-2022-B');
console.log('Historical grade cache checks passed: empty terms excluded, exact legacy identities, academic standing, and precise grade removal.');

const { buildHistoricalGradeRecords, isHistoricalGradeChanged } = module.exports;
const instructors = [{ id: 'teacher-one', name: 'Original Teacher', employeeId: 'EMP-1' }, { id: 'teacher-two', name: 'Second Teacher', employeeId: 'EMP-2' }];
const edits = ['HIST1', 'HIST2', 'HIST3'].map((code, index) => ({
  subject: { ...subject, id: code, code }, grade: String(80 + index), instructorId: index === 1 ? 'teacher-two' : 'teacher-one',
}));
const params = { student, branch: 'Bacoor', term: terms[0], period: '1st Semester', edits, instructors, recordedBy: 'Test Registrar' };
const batch = buildHistoricalGradeRecords(params);
assert.equal(batch.length, 3);
assert(batch.every(row => row.studentId === student.id && row.source === 'historical' && row.academicYear === terms[0].academicYear && row.gradingPeriod === '1st Semester'));
assert.equal(batch[1].instructorId, 'teacher-two');
assert.equal(batch[1].instructorName, 'Second Teacher');
assert.equal(batch[1].recordedBy, 'Test Registrar');
assert.equal(batch[0].grade, '80');
assert.equal(typeof batch[0].updatedAt, 'string');
assert.equal(batch[0].studentNumberIsOriginal, true);
assert.equal(isHistoricalGradeChanged({ grade: '80', instructorId: 'teacher-one' }, batch[0]), false);
assert.equal(isHistoricalGradeChanged({ grade: ' 80 ', instructorId: 'teacher-one' }, batch[0]), false);
assert.equal(isHistoricalGradeChanged({ grade: '90', instructorId: 'teacher-one' }, batch[0]), true);
assert.equal(isHistoricalGradeChanged({ grade: '80', instructorId: 'teacher-two' }, batch[0]), true);
assert.equal(isHistoricalGradeChanged({ grade: '', instructorId: '' }), false);
assert.equal(isHistoricalGradeChanged({ grade: '', instructorId: 'teacher-one' }), true);
for (const badEdit of [{ ...edits[1], grade: '101' }, { ...edits[1], instructorId: 'not-in-branch' }, { ...edits[1], grade: '' }, { ...edits[1], existingRecord: { ...batch[1], source: undefined } }]) {
  assert.throws(() => buildHistoricalGradeRecords({ ...params, edits: [edits[0], badEdit, edits[2]] }), /HIST2:/);
}
assert.throws(() => buildHistoricalGradeRecords({ ...params, edits: [{ ...edits[0], grade: '', existingRecord: batch[0] }] }), /Remove in Uploaded Grades/);
const shs = { ...student, program: 'SHS', yearLevel: 'Grade 12' };
const shsTerm = getHistoricalTerms(shs)[0];
const shsBatch = buildHistoricalGradeRecords({ ...params, student: shs, term: shsTerm, period: '1st Quarter', edits: [{ ...edits[0], subject: { ...subject, program: 'SHS', yearLevel: 'Grade 11' }, grade: '85' }] });
assert.equal(shsBatch[0].gradingPeriod, '1st Quarter');
assert.equal(shsBatch[0].numericGrade, 85);
assert.equal(shsBatch[0].programType, 'SHS');
console.log('Inline historical grade checks passed: multi-subject batches, per-subject instructors, exact student IDs, dirty detection, protected grades, validation, and independent SHS quarters.');
