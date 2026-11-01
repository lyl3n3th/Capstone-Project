import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/services/assignmentGradeHistory.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
let failLoad=false,failSave=false;
const saved=[];
new Function('exports','require',compiled)(exports,path=>{
  if(path==='./instructorPortal') return {
    studentHasAssignedInstructorSubject:(student,assignment)=>student.section===assignment.sectionCode,
    fetchAndCacheInstructorGradeSubmissions:async()=>[],
  };
  if(path==='./studentGrades') return {fetchAndCacheStudentGradeRecordsForBranch:async()=>{if(failLoad)throw Error('Cannot load grades');return []}};
  if(path==='./adminStudentsApi') return {fetchAdminStudents:async()=>[]};
  if(path==='../lib/supabase') return {supabase:{rpc:async(_,payload)=>{saved.push(payload);return {error:failSave?{message:'Cannot preserve grades'}:null}}}};
  throw Error(`Unexpected import ${path}`);
});
const {getAssignmentGradeHistory:history,loadAssignmentGradeHistory:load,preserveAssignmentGradeHistory:preserve}=exports;
const assignment={id:'assignment-a',subjectCode:'ENG1',instructorId:'teacher-a',instructorName:'Original Teacher',sectionId:'section-a',sectionCode:'A',academicYear:'2026-2027',semester:'1st Semester'};
const other={...assignment,id:'assignment-b',sectionId:'section-b',sectionCode:'B'};
const student={id:'GMA-000001',section:'A'};
const grade={id:'grade-1',studentId:student.id,subjectCode:'ENG1',academicYear:'2026-2027',semester:'1st Semester',normalizedGrade:'88',instructorId:'teacher-a',instructorName:'Original Teacher'};
const check=record=>history([assignment,other],[record],[],[student]).gradedAssignmentIds;
assert.deepEqual(check(grade),['assignment-a']);
assert.deepEqual(check({...grade,assignmentId:'assignment-b'}),['assignment-b']);
assert.deepEqual(check({...grade,sectionId:'section-b'}),['assignment-b']);
assert.deepEqual(check({...grade,academicYear:'2025-2026'}),[]);
assert.deepEqual(check({...grade,semester:'2nd Semester'}),[]);
assert.deepEqual(check({...grade,instructorId:'other-teacher'}),[]);
assert.deepEqual(check({...grade,subjectCode:'MATH1'}),[]);
assert.deepEqual(check({...grade,normalizedGrade:''}),[]);
assert.deepEqual(check({...grade,source:'historical'}),[]);
assert.deepEqual(history([assignment],[],[],[student]).gradedAssignmentIds,[]);
const submission={status:'Pending',instructorId:'teacher-a',instructorName:'Original Teacher',employeeId:'EMP-A',records:[{...grade,instructorName:undefined,instructorId:undefined}]};
assert.deepEqual(history([assignment],[],[submission],[student]).gradedAssignmentIds,['assignment-a']);
assert.deepEqual(history([assignment],[{...grade,instructorName:undefined,instructorId:undefined}],[submission],[student]).recordsToPreserve,[], 'Unapproved uploads must not supply the author of an already posted grade');
for(const status of ['Rejected','Error']) assert.deepEqual(history([assignment],[],[{...submission,status}],[student]).gradedAssignmentIds,[]);
const recovered=history([assignment],[{...grade,instructorName:undefined,instructorId:undefined}],[{...submission,status:'Approved'}],[student]);
assert.equal(recovered.recordsToPreserve[0].instructorName,'Original Teacher');
assert.deepEqual(history([assignment],[grade],[submission],[student]).recordsToPreserve,[]);
await preserve('GMA',recovered.recordsToPreserve);
assert.equal(saved[0].p_payload.instructorName,'Original Teacher');
failSave=true;await assert.rejects(preserve('GMA',recovered.recordsToPreserve),/Cannot preserve grades/);
failLoad=true;await assert.rejects(load('GMA',[assignment]),/Cannot load grades/);
console.log('Assignment grade history checks passed: exact assignment, section/instructor/subject/term isolation, empty and rejected uploads, original-author recovery, and load/save failures.');
