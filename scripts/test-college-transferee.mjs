import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function functionsFrom(path, names, context = {}) {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const declarations = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) {
      declarations.set(node.name.getText(ast), node.initializer.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of names) assert.ok(declarations.has(name), `Missing ${name}`);
  const code = names.map(name => `const ${name} = ${declarations.get(name)};`).join('\n');
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('context', `with(context) { ${compiled}; return { ${names.join(',')} }; }`)(context);
}

let stored;
const existing = { id: 'BAC-1', section: 'BSE-2A', branch: 'Bacoor' };
const policy = functionsFrom('../src/services/adminStorage.ts', ['isCollegeTransferee', 'promoteApplicantToStoredStudent'], {
  normalizeAdminEnrolleeCapitalization: value => value,
  readStoredStudents: () => [existing], findStoredStudent: () => existing,
  splitFullName: () => ({ firstName:'Test', lastName:'Student' }),
  normalizeBranchName: value => value, resolveShsTrackType: () => 'STEM',
  writeStoredStudents: values => { stored = values; },
});
const applicant = {
  id:'app', trackingNumber:'TRACK-1', fullName:'Test Student', program:'College',
  studentStatus:'Transferee', yearLevel:'2nd Year', branch:'Bacoor',
  ownScheduleAcademicYear:'2026-2027', ownScheduleSemester:'2nd Semester',
  requestedOwnSchedule:false, documentsSubmitted:1, totalDocuments:3, personalInfo:{},
};
const result = policy.promoteApplicantToStoredStudent(applicant);
assert.equal(result.student.section, '');
assert.equal(result.student.requestedOwnSchedule, true);
assert.equal(result.student.ownScheduleRequestStatus, 'Approved');
assert.equal(result.student.ownScheduleSelectionStatus, 'Not Submitted');
assert.equal(result.student.ownScheduleSemester, '2nd Semester');
assert.equal(result.student.studentStatus, 'Transferee', 'Preserve admission type');
assert.equal(result.applicant.ownScheduleRequestStatus, 'Approved');
assert.equal(stored[0].section, '');
for (const overrides of [{program:'SHS'}, {studentStatus:'New Student'}]) {
  const other = policy.promoteApplicantToStoredStudent({...applicant, ...overrides});
  assert.equal(other.student.requestedOwnSchedule, false);
  assert.equal(other.student.section, 'BSE-2A');
}

const evaluation = functionsFrom('../src/pages/admin/AdminEnrollees.tsx', [
  'normalizeStringList', 'normalizeSectionSemester', 'createDefaultTransfereeEvaluation',
  'normalizeTransfereeEvaluation', 'requiresSectionAssignment',
], { ...policy, DEFAULT_SECTION_SEMESTER:'1st Semester' });
const stalePlan = { creditedSubjectIds:['math-1'], assignedSubjectIds:['math-2'], recommendedSectionId:'old-section' };
const college = evaluation.normalizeTransfereeEvaluation(applicant, stalePlan);
assert.deepEqual(college.creditedSubjectIds, ['math-1']);
assert.deepEqual(college.assignedSubjectIds, []);
assert.equal(college.recommendedSectionId, '');
assert.equal(evaluation.requiresSectionAssignment(applicant), false);
const shs = evaluation.normalizeTransfereeEvaluation({...applicant, program:'SHS'}, stalePlan);
assert.deepEqual(shs.assignedSubjectIds, ['math-2']);
assert.equal(shs.recommendedSectionId, 'old-section');
assert.equal(evaluation.requiresSectionAssignment({...applicant, program:'SHS'}), true);

const subjects = [
  {id:'math-1', code:'MATH1', name:'Math 1', program:'College', yearLevel:'1st Year', semester:'1st Semester', units:3},
  {id:'math-2', code:'MATH2', name:'Math 2', program:'College', yearLevel:'2nd Year', semester:'1st Semester', units:3, prerequisiteSubjectIds:['math-1']},
];
const scheduling = functionsFrom('../src/services/adminStorage.ts', [
  'normalizeStoredSubjectCompletionCode', 'subjectIsCompletedByGrades',
  'getStoredSubjectLookupKeys', 'subjectPrerequisitesArePassed', 'getStudentScheduleChoiceGroups',
], {
  normalizeBranchName: value => value, normalizeStoredSemester: value => value,
  readBranchScopedData: scope => scope === 'subjects' ? subjects : [],
  subjectIsAtOrBeforeYearLevel: () => true, yearLevelsMatch: () => true,
  matchesStrandOrCourse: () => true, resolveStoredSubjectStrandOrCourse: () => 'BSE',
  getCompletedSubjectCodes: () => new Set(),
  getLatestTerminalGradeRecordsBySubjectCode: () => new Map(),
  compareStoredSubjectSequence: (a,b) => a.code.localeCompare(b.code),
  storedSubjectMatchesAssignment: () => false,
});
const options = {branch:'Bacoor',program:'College',yearLevel:'2nd Year',semester:'1st Semester',gradeRecords:[],strictScope:true};
assert.deepEqual(scheduling.getStudentScheduleChoiceGroups(options).map(group=>group.subjectId), ['math-1']);
assert.deepEqual(scheduling.getStudentScheduleChoiceGroups({...options, creditedSubjects:[{subjectId:'math-1',subjectCode:'MATH1'}]}).map(group=>group.subjectId), ['math-2'], 'Credit excludes completed subjects and satisfies prerequisites');
const portal = functionsFrom('../src/services/studentPortalResolver.ts', ['getApprovedOwnScheduleSubjects'], {
  ...policy, normalizeBranchName:value=>value,
  getStudentScheduleSelectionRequest:()=>null, readBranchScopedData:()=>({}),
  getStudentPortalSubjectsForTerm:()=>['regular-curriculum'],
});
const pending = {...result.student, ownScheduleSelectionStatus:'Not Submitted'};
assert.deepEqual(portal.getApprovedOwnScheduleSubjects({resolvedStudentRecord:pending, academicYear:'2026-2027',semester:'2nd Semester'}), [], 'Pending college transferees must not receive a default curriculum load');
assert.deepEqual(portal.getApprovedOwnScheduleSubjects({resolvedStudentRecord:{...pending,program:'SHS'}, academicYear:'2026-2027',semester:'2nd Semester'}), ['regular-curriculum']);
const standing = functionsFrom('../src/services/studentApi.ts', ['getPortalStudentStatus'], {
  ...policy,
  hasLatestApprovedIrregularEnrollmentRequestForStudent:()=>false,
  getStudentAcademicStanding:()=>({label:'Regular'}),
});
assert.equal(standing.getPortalStudentStatus({...existing,program:'College',studentStatus:'Transferee'}), 'Irregular');
assert.equal(standing.getPortalStudentStatus({...existing,program:'SHS',studentStatus:'Transferee'}), 'Transferee');
console.log('College transferee checks passed: automatic irregular planning, no section or assigned load, TOR credits preserved, credited prerequisite eligibility, SHS and regular admissions unchanged.');
