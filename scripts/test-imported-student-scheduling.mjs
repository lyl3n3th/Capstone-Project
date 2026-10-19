import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as XLSX from 'xlsx';
const require=createRequire(import.meta.url);
const cache=new Map();
const modules=new Map();
let localStudents=[];let remotePlan=null;let remoteRequest=null;let remoteGrades=[];let templateSheets=[];
const teacher={id:'teacher-one',name:'Instructor One',employeeId:'EMP-1',department:'College'};
const subject={id:'subject-one',code:'ENT402',name:'Entrepreneurship',units:3,program:'College',yearLevel:'4th Year',semester:'2nd Semester',strand:'BSE',isMinor:false,prerequisiteSubjectIds:[]};
const other={...subject,id:'subject-two',code:'ENT403',name:'Other subject'};
const section={id:'section-one',code:'BSE-4B',program:'College',yearLevel:'4th Year',semester:'2nd Semester',strand:'BSE',section:'4B',enrolleeIds:[]};
const assignment={id:'assignment-one',subjectId:subject.id,subjectCode:subject.code,subjectName:subject.name,instructorId:teacher.id,instructorName:teacher.name,sectionId:section.id,sectionCode:section.code,schedule:[{day:'Monday',startTime:'09:00',endTime:'10:00',room:'101'}],academicYear:'2026-2027',semester:'2nd Semester'};
const unselected={...assignment,id:'assignment-two',subjectId:other.id,subjectCode:other.code,subjectName:other.name};
const base={id:'LEGACY-2022-A',name:'Imported Student',branch:'Bacoor',program:'College',yearLevel:'4th Year',strandOrCourse:'BSE - Bachelor of Entrepreneurship',section:'',status:'Incomplete',importAcademicYear:'2026-2027',importSemester:'2nd Semester',importAcademicStanding:'Irregular'};
let remoteStudent={...base};
const snapshot={subjects:[subject,other],instructors:[teacher],classSections:[section],subjectAssignments:[assignment,unselected],assignmentRooms:[]};
const scopes=(scope,branch='Bacoor')=>`${branch}:${scope}`;
let failRequestSave=false;
const supabase={rpc(name,args){let data=name==='list_student_grade_records'?remoteGrades.map(payload=>({payload})):[];let error=null;
if(name==='upsert_student_schedule_request'){if(failRequestSave)error={message:'Backend unavailable'};else{const request=args.p_payload;data=[{id:request.id,student_number:request.studentNumber,tracking_number:null,academic_year:request.academicYear,semester:request.semester,status:request.status,payload:request}];}}
return {returns:async()=>({data,error}),then:(resolve,reject)=>Promise.resolve({data,error}).then(resolve,reject)};}};
const overrides={
 '../lib/supabase':{supabase},
 './admission':{getAdmissionRequirements:()=>[],normalizeAdmissionYearLevel:value=>value,normalizeBranchCode:value=>value?.toLowerCase(),getEstimatedCollegeTuition:()=>0},
 './enrollmentLoadPlanner':{buildEnrollmentSubjectKey:(...values)=>values.join(':')},
 './legacyMockData':{stripLegacyMockStudentRecords:values=>values},
 '../types/user':{AUTH_STORAGE_KEY:'test-auth'},
 './enrollmentRequests':{getLatestApprovedEnrollmentRequestForStudent:()=>null},
 './academicData':{fetchAndCacheAcademicSnapshot:async()=>{cache.set(scopes('subjects'),snapshot.subjects);cache.set(scopes('subject-assignments'),snapshot.subjectAssignments);return snapshot;}},
 './adminStudentsApi':{fetchAdminStudents:async()=>[load('importedStudentScheduling').applyImportedScheduleDefaults(remoteStudent)]},
 './studentPlanningApi':{fetchStudentSubjectPlans:async()=>{cache.set(scopes('student-subject-plans'),remotePlan?{[base.id]:remotePlan}:{});},fetchStudentScheduleRequests:async()=>{cache.set(scopes('student-schedule-requests'),remoteRequest?[remoteRequest]:[]);}},
 './gradeTemplateBuilder':{downloadStyledGradeTemplate:async args=>{templateSheets.push(args);},getStyledGradeTemplateFileName:()=> 'template.xlsx'},
};
function load(name){
 if(modules.has(name))return modules.get(name).exports;
 const module={exports:{}};modules.set(name,module);
 const source=readFileSync(new URL(`../src/services/${name}.ts`,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 Function('require','module','exports',code)(specifier=>overrides[specifier] ?? (specifier==='xlsx'?XLSX:specifier.startsWith('./')?load(specifier.slice(2)):specifier.startsWith('../utils/')?loadUtils(specifier):require(specifier)),module,module.exports);
 return module.exports;
}
function loadUtils(specifier){const source=readFileSync(new URL(`../src/utils/${specifier.split('/').at(-1)}.ts`,import.meta.url),'utf8');const module={exports:{}};Function('module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports);return module.exports;}
const storage=load('adminStorage');
Object.assign(storage,{normalizeBranchName:value=>value||'Bacoor',readStoredStudents:()=>localStudents,writeStoredStudents:students=>{localStudents=students;},getStudentsForBranch:branch=>localStudents.filter(student=>student.branch===branch),readBranchScopedData:(scope,branch)=>cache.get(scopes(scope,branch)),writeBranchScopedData:(scope,branch,value)=>cache.set(scopes(scope,branch),value)});
const defaults=load('importedStudentScheduling');const resolver=load('studentPortalResolver');const portal=load('instructorPortal');
await overrides['./academicData'].fetchAndCacheAcademicSnapshot();
const initialized=defaults.applyImportedScheduleDefaults(base);
assert.equal(initialized.requestedOwnSchedule,true);assert.equal(initialized.ownScheduleSelectionStatus,'Not Submitted');assert.equal(initialized.ownScheduleAcademicYear,'2026-2027');assert.equal(initialized.ownScheduleSemester,'2nd Semester');
assert.equal(defaults.applyImportedScheduleDefaults({...base,importAcademicStanding:'Regular'}).requestedOwnSchedule,undefined);
let context=resolver.resolveStudentPortalContext(base);assert.equal(context.currentTerm.source,'own_schedule');assert.equal(context.resolvedStudentRecord.requestedOwnSchedule,true);
let scoped=await portal.getInstructorScopedData({branch:'Bacoor',instructorId:teacher.id});assert.equal(scoped.students.length,0,'Unapproved irregular imports must not become official instructor students');
const selection={...assignment,assignmentId:assignment.id,units:3};
remoteRequest={id:'request-one',studentNumber:base.id,studentName:base.name,branch:'Bacoor',program:'College',yearLevel:'4th Year',strandOrCourse:base.strandOrCourse,academicYear:'2026-2027',semester:'2nd Semester',status:'Pending',selections:[selection]};
remoteStudent={...base,requestedOwnSchedule:true,ownScheduleRequestStatus:'Approved',ownScheduleAcademicYear:'2026-2027',ownScheduleSemester:'2nd Semester',ownScheduleSelectionStatus:'Pending Approval'};
scoped=await portal.getInstructorScopedData({branch:'Bacoor',instructorId:teacher.id});assert.equal(scoped.students.length,0);
remoteRequest.status='Approved';remoteStudent.ownScheduleSelectionStatus='Approved';
remotePlan={id:base.id,studentNumber:base.id,academicYear:'2026-2027',semester:'2nd Semester',source:'student_schedule_request',assignedSubjects:[{subjectId:subject.id,subjectCode:subject.code,subjectName:subject.name,units:3}],creditedSubjects:[],scheduledAssignments:[selection]};
scoped=await portal.getInstructorScopedData({branch:'Bacoor',instructorId:teacher.id});assert.equal(scoped.students.length,1);assert.equal(localStudents[0].id,base.id);
assert(portal.studentHasAssignedInstructorSubject(scoped.students[0],assignment));assert.equal(portal.studentHasAssignedInstructorSubject(scoped.students[0],unselected),false);assert.equal(portal.studentHasAssignedInstructorSubject(scoped.students[0],{...assignment,academicYear:'2025-2026'}),false);
assert.equal(portal.studentMatchesSection({...scoped.students[0],section:section.code},section),false,'Block section membership must not override an individual approved load');
portal.downloadInstructorGradeTemplate({instructor:teacher,branch:'Bacoor',assignments:scoped.assignments,sections:scoped.sections,students:scoped.students});
assert(templateSheets.length>0);
console.log('Imported scheduling checks passed: planner defaults, approval gating, cross-session instructor roster, exact selected assignment and term, and grade template inclusion.');
const exportedRows=templateSheets.flatMap(file=>file.sheets.flatMap(sheet=>sheet.rows));
assert(exportedRows.some(row=>row.includes(base.id)),'Grade upload template must contain the original imported student number');
assert.equal(exportedRows.some(row=>row.includes(other.code)),false,'Unselected subjects must not appear in the imported student template');
function excel(headers,values){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,values]),'Grades');const bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx'});return {arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}
const headers=['Student ID','Full Name','Subject Code','Subject Title','Grade','Units','Instructor','Academic Year','Semester','Grading Period','Program Type','Section'];
const values=[base.id,base.name,subject.code,subject.name,'90','3',teacher.name,'2026-2027','2nd Semester','2nd Semester','College',section.code];
let parsed=await portal.parseInstructorGradeWorkbook({file:excel(headers,values),branch:'Bacoor',instructor:teacher,allowedAssignments:scoped.assignments});
assert.deepEqual(parsed.errors,[]);assert.equal(parsed.records.length,1);assert.equal(parsed.records[0].studentId,base.id);assert.equal(parsed.records[0].studentNumberIsOriginal,true);assert.equal(parsed.records[0].instructorName,teacher.name);
const rejected=await portal.parseInstructorGradeWorkbook({file:excel(headers,values.map((value,index)=>index===2?other.code:index===3?other.name:value)),branch:'Bacoor',instructor:teacher,allowedAssignments:scoped.assignments});
assert.equal(rejected.records.length,0);assert(rejected.errors.length>0,'A student cannot receive an upload for an unapproved subject');
remoteGrades=parsed.records;
const gradeApi=load('studentGrades');await gradeApi.fetchAndCacheStudentGradeRecordsForBranch('Bacoor');
const changeHeaders=['Student ID','Full Name','Subject Code','Subject Title','Requested Grade','Units','Instructor','Academic Year','Semester','Grading Period','Program Type','Section','Current Grade'];
const changeValues=[...values.map((value,index)=>index===4?'95':value),remoteGrades[0].normalizedGrade];
const change=await portal.parseInstructorGradeChangeWorkbook({file:excel(changeHeaders,changeValues),branch:'Bacoor',instructor:teacher,allowedAssignments:scoped.assignments});
assert.deepEqual(change.errors,[]);assert.equal(change.changes.length,1);assert.equal(change.changes[0].requestedRecord.studentId,base.id);assert.equal(change.changes[0].requestedRecord.studentNumberIsOriginal,true);assert.equal(change.changes[0].requestedRecord.instructorName,teacher.name);
const allGradeRows=gradeApi.getStudentGradeRecords({branch:'Bacoor',studentId:base.id});assert.equal(allGradeRows.length,1);
assert.equal(gradeApi.getStudentGradeRecords({branch:'Bacoor',studentId:'LEGACY-2022-B'}).length,0);
console.log('Instructor grade checks passed: generated roster template, real workbook upload and grade-change parsing, original IDs, instructor attribution, unapproved-subject rejection, and portal grade lookup.');

const planning=load('studentPlanningApi');
cache.set(scopes('student-schedule-requests'),[]);
const firstRequest={...remoteRequest,id:'request-a',studentNumber:'LEGACY-2022-A',status:'Pending',submittedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
const secondRequest={...firstRequest,id:'request-b',studentNumber:'LEGACY-2022-B'};
await planning.saveStudentScheduleRequest(firstRequest);await planning.saveStudentScheduleRequest(secondRequest);
assert.equal(cache.get(scopes('student-schedule-requests')).length,2,'Legacy IDs sharing digits must have separate requests');
failRequestSave=true;
await assert.rejects(planning.saveStudentScheduleRequest({...firstRequest,id:'failed-request',studentNumber:'LEGACY-2022-C'}),/Backend unavailable/);
assert.equal(cache.get(scopes('student-schedule-requests')).length,2,'Failed requests must not be reported as submitted or cached as successful');
console.log('Schedule persistence checks passed: exact legacy identity, separate requests, and no false success on backend failure.');
