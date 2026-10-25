import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/services/instructorGradeMasterlist.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = {};
new Function('exports', 'require', compiled)(api, (path) => {
  throw new Error(`Unexpected dependency: ${path}`);
});
const student = { id: '001', name: 'Alice', program: 'College', yearLevel: '1st Year', section: 'A' };
const assignment = { id: 'slot-1', subjectCode: 'GE1', subjectName: 'Subject One', instructorId: 'teacher-1', instructorName: 'Teacher One', sectionId: 'section-a', sectionCode: 'A', academicYear: '2026-2027', semester: '1st Semester' };
const secondSubject = { ...assignment, id: 'slot-2', subjectCode: 'GE2', subjectName: 'Subject Two' };
const secondTerm = { ...assignment, semester: '2nd Semester' };
const grade = { studentId: student.id, subjectCode: assignment.subjectCode, academicYear: assignment.academicYear, semester: assignment.semester, instructorId: assignment.instructorId, gradingPeriod: assignment.semester, grade: '96', normalizedGrade: '1.25', evaluation: 'Passed' };
const params = {
  rows: [
    { student, studentAssignments: [assignment, { ...assignment, id: 'duplicate-schedule' }, secondSubject, secondTerm, { ...assignment, instructorId: 'other-teacher' }] },
    { student: { ...student, id: '002', name: 'Bob' }, studentAssignments: [assignment] },
  ],
  grades: [grade, { ...grade, studentId: 'someone-else', grade: '80' }, { ...grade, instructorId: 'other-teacher', grade: '70' }, { ...grade, academicYear: '2025-2026', grade: '60' }],
  instructorId: assignment.instructorId, branch: 'Bacoor',
};
const sheets = api.buildInstructorGradeMasterlist(params);
assert.equal(sheets.length, 3, 'Each subject/section/term gets its own sheet');
const firstTerm = sheets.find(sheet => sheet.descriptor === 'GE1' && sheet.semester === '1st Semester');
assert.equal(firstTerm.rows.length, 2, 'Repeated schedule slots do not duplicate students');
assert.deepEqual(firstTerm.rows[0], ['001', 'Alice', 'College', '1st Year', 'A', '1st Semester', '96', '1.25', 'Passed']);
assert.equal(firstTerm.rows[1][1], 'Bob');
assert.equal(firstTerm.rows[1][6], '', 'Students without grades have blank cells');
for (const sheet of sheets.filter(sheet => sheet !== firstTerm)) assert.equal(sheet.rows[0][6], '', 'Grades cannot leak between subjects or terms');
assert.equal(firstTerm.metadataOverrides.C3, 'GRADES MASTERLIST');
assert.equal(firstTerm.metadataOverrides.F3, assignment.instructorName);
assert.equal(firstTerm.metadataOverrides.F5, assignment.subjectName);
assert.equal(firstTerm.headerOverrides.G, 'GRADE');
assert.ok(firstTerm.additionalMerges.includes('F5:I5'), 'Subject title gets a merged header area');
const filtered = api.buildInstructorGradeMasterlist({ ...params, rows: [{ student, studentAssignments: [secondSubject] }] });
assert.equal(filtered.length, 1, 'Selected subject and roster are respected');
const longName = { ...assignment, subjectCode: 'A/very*long:subject?code[over31characters]', sectionCode: 'Same' };
const collisions = api.buildInstructorGradeMasterlist({ ...params, rows: [{ student, studentAssignments: [longName, { ...longName, semester: '2nd Semester' }, { ...longName, sectionId: 'section-b', sectionCode: 'same' }] }] });
assert.equal(collisions.length, 3);
assert.equal(new Set(collisions.map(sheet => sheet.sheetName.toLowerCase())).size, 3);
for (const { sheetName: name } of collisions) {
  assert.ok(name.length <= 31);
  assert.doesNotMatch(name, /[\\/?*:[\]]/);
}
assert.throws(() => api.buildInstructorGradeMasterlist({ ...params, rows: [] }), /No assigned subjects/);
console.log('Instructor grades masterlist checks passed: template headers, subject/section/term grouping, instructor isolation, filters, duplicate schedules, missing grades, and safe sheet names.');
