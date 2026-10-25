import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const api = {};
const source = readFileSync(new URL('../src/services/instructorRoster.ts', import.meta.url), 'utf8');
new Function('exports', 'require', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(api, () => ({
  resolveStudentPortalContext: student => ({
    resolvedStudentRecord: student.approvedRecord ?? student,
    currentTerm: student.currentTerm,
    subjects: student.subjects,
  }),
}));
const assignment = { id: 'reused-assignment', subjectId: 's1', subjectCode: 'ENT1', instructorId: 'garen', sectionId: 'section-a', sectionCode: 'BSE1-1', academicYear: '2028-2029', semester: '1st Semester' };
const second = { ...assignment, id: 'ge1-assignment', subjectCode: 'GE1' };
const subject = item => ({ id: item.id, code: item.subjectCode, instructorId: item.instructorId, section: item.sectionCode, academicYear: item.academicYear, semester: item.semester });
const student = { id: 'student', status: 'Incomplete', section: 'BSE1-1', currentTerm: { academicYear: assignment.academicYear, semester: assignment.semester }, subjects: [subject(assignment), subject(second)] };
const roster = (record, assignments = [assignment, second]) => api.getCurrentStudentInstructorAssignments(record, assignments);
assert.equal(roster(student).length, 2);
assert.equal(roster({ ...student, status: 'Archived' }).length, 0);
assert.equal(roster({ ...student, id: 'BAC-200015', requestedOwnSchedule: true, ownScheduleSelectionStatus: 'Approved', currentTerm: { academicYear: '2026-2027', semester: '1st Semester' }, subjects: student.subjects.map(item => ({ ...item, academicYear: '2026-2027' })) }).length, 0, 'The real year mismatch cannot inflate the total even when assignment IDs are reused');
assert.equal(roster({ ...student, currentTerm: { academicYear: assignment.academicYear, semester: '2nd Semester' } }).length, 0, 'A new semester excludes retained first-semester subjects');
assert.equal(roster({ ...student, approvedRecord: { ...student, section: 'BSE1-2', yearLevel: '2nd Year' } }).length, 0, 'An approved section transfer overrides stale subjects and old enrollee lists');
const individual = { ...student, section: 'BSE2-1', requestedOwnSchedule: true, ownScheduleSelectionStatus: 'Approved' };
assert.equal(roster(individual).length, 2, 'Individual schedule sections override the home section');
assert.equal(roster({ ...individual, studentStatus: 'Transferee', importAcademicYear: '2028-2029' }).length, 2);
assert.equal(roster({ ...individual, ownScheduleSelectionStatus: 'Pending' }).length, 0);
assert.equal(roster({ ...individual, subjects: [subject(second)] }).length, 1, 'Removing one subject keeps the remaining subject');
assert.equal(roster({ ...individual, subjects: [] }).length, 0, 'Removing the last subject removes instructor roster membership');
const transferred = { ...assignment, id: 'new-section-assignment', sectionCode: 'BSE1-2', sectionId: 'section-b', instructorId: 'other-instructor' };
assert.equal(roster({ ...individual, subjects: [subject(transferred)] }).length, 0, 'A new approved individual section excludes the previous instructor');
assert.equal(roster({ ...individual, subjects: [subject(transferred)] }, [transferred]).length, 1, 'The student appears under the new instructor');
assert.equal(roster({ ...student, subjects: [{ ...subject(assignment), instructorId: 'other-instructor' }] }).length, 0, 'A reused assignment ID cannot override the subject instructor');
console.log('Current instructor roster checks passed: real year mismatch, semester progression, section transfers, individual schedules, transferees/imports, approval gating, subject removal, and instructor changes.');
