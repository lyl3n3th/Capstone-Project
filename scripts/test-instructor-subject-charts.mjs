import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/services/instructorSubjectCharts.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = {};
const rosterApi = {};
const rosterSource = readFileSync(new URL('../src/services/instructorRoster.ts', import.meta.url), 'utf8');
new Function('exports', 'require', ts.transpileModule(rosterSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(rosterApi, () => ({
  resolveStudentPortalContext: student => ({
    resolvedStudentRecord: student,
    currentTerm: student.currentTerm ?? { academicYear: student.approvedSubjects?.[0]?.academicYear ?? '2028-2029', semester: student.approvedSubjects?.[0]?.semester ?? '1st Semester' },
    subjects: student.approvedSubjects ?? (student.requestedOwnSchedule ? [] : [assignment, otherAssignment, secondSubject].filter(item => item.sectionCode === student.section).map(portalSubject)),
  }),
}));
new Function('exports', 'require', compiled)(api, path => {
  if (path === './instructorRoster') return rosterApi;
  throw new Error(`Unexpected dependency: ${path}`);
});
const section = { id: 'a', code: 'BSE1-1', enrolleeIds: [] };
const otherSection = { id: 'b', code: 'BSE1-2', enrolleeIds: [] };
const assignment = { id: 'assignment-a', subjectId: 's1', subjectCode: 'GE1', subjectName: 'Subject One', sectionId: section.id, sectionCode: section.code, instructorId: 'teacher', academicYear: '2028-2029', semester: '1st Semester' };
const otherAssignment = { ...assignment, id: 'assignment-b', sectionId: otherSection.id, sectionCode: otherSection.code };
const secondSubject = { ...assignment, id: 'second-subject', subjectId: 's2', subjectCode: 'GE2' };
const portalSubject = assignment => ({ id: assignment.id, code: assignment.subjectCode, instructorId: assignment.instructorId, section: assignment.sectionCode, academicYear: assignment.academicYear, semester: assignment.semester });
const regulars = Array.from({ length: 7 }, (_, i) => ({ id: `regular-${i}`, section: section.code }));
const irregular = { id: 'irregular', section: 'Other home section', requestedOwnSchedule: true, ownScheduleRequestStatus: 'Approved', approvedSubjects: [portalSubject(assignment), portalSubject(secondSubject)] };
const imported = { ...irregular, id: 'imported-irregular', importAcademicYear: '2028-2029' };
const params = { assignments: [assignment, otherAssignment, secondSubject], sections: [section, otherSection], students: [...regulars, irregular, imported] };
let charts = api.buildInstructorSubjectChartGroups(params);
assert.deepEqual(charts[0].sections, [{ name: section.code, value: 9 }, { name: otherSection.code, value: 0 }]);
assert.equal(charts[1].sections[0].value, 9, 'Both imported and other irregular students join their chosen section for each subject');
charts = api.buildInstructorSubjectChartGroups({ ...params, assignments: [...params.assignments, assignment, { ...assignment, id: 'another-schedule-slot' }] });
assert.equal(charts[0].sections.length, 2);
assert.equal(charts[0].sections[0].value, 9, 'Duplicate assignment slots cannot double-count students');
charts = api.buildInstructorSubjectChartGroups({ ...params, students: [...regulars, { ...irregular, section: section.code, approvedSubjects: [portalSubject(otherAssignment), portalSubject(secondSubject)] }] });
assert.deepEqual(charts[0].sections, [{ name: section.code, value: 7 }, { name: otherSection.code, value: 1 }], 'The selected section overrides the home section per subject');
assert.equal(charts[1].sections[0].value, 8);
for (const approvedSubjects of [[], [{ ...portalSubject(assignment), academicYear: '2027-2028' }], [{ ...portalSubject(assignment), semester: '2nd Semester' }], [{ ...portalSubject(otherAssignment), instructorId: 'other-teacher' }]]) {
  charts = api.buildInstructorSubjectChartGroups({ ...params, students: [...regulars, { ...irregular, section: section.code, approvedSubjects }] });
  assert.equal(charts[0].sections[0].value, 7, 'Unapproved selections and other terms never inherit home-section membership');
}
assert.deepEqual(api.buildInstructorSubjectChartGroups({ ...params, assignments: [] }), []);
console.log('Instructor subject chart checks passed: seven regular plus two irregular students, selected sections per subject, imported students, term isolation, approval gating, and duplicate schedules.');
