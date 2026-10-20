import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/services/classAssignmentSchedule.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.CommonJS},
}).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const validate = exports.getClassAssignmentScheduleError;
const slot = (day, startTime, endTime) => ({day, startTime, endTime});
const existing = {
  id: 'math', subjectCode: 'MATH', sectionId: 'A',
  academicYear: '2026-2027', semester: '1st Semester',
  schedule: [slot('Monday', '09:00', '10:00'), slot('Wednesday', '13:00', '14:00')],
};
const candidate = {...existing, id: 'english', subjectCode: 'ENG'};
const check = (schedule, overrides = {}) => validate({...candidate, schedule, ...overrides}, [existing]);

assert.match(check([slot('Monday', '09:30', '10:30')]), /MATH.*Monday/);
assert.match(check([slot('Monday', '08:30', '09:30')]), /MATH/);
assert.match(check([slot('Monday', '08:00', '11:00')]), /MATH/);
assert.match(check([slot('Monday', '09:15', '09:45')]), /MATH/);
assert.match(check([slot('Monday', '09:00', '10:00')]), /MATH/);
// Only the second slot of each subject conflicts.
assert.match(check([slot('Tuesday', '09:00', '10:00'), slot('Wednesday', '13:30', '14:30')]), /MATH.*Wednesday/);
assert.match(check([slot(' wednesday ', '13:30', '14:30')]), /MATH/);
assert.equal(check([slot('Monday', '10:00', '11:00')]), null);
assert.equal(check([slot('Monday', '08:00', '09:00')]), null);
assert.equal(check([slot('Tuesday', '09:00', '10:00')]), null);
assert.equal(check(existing.schedule, {sectionId: 'B'}), null);
assert.equal(check(existing.schedule, {academicYear: '2027-2028'}), null);
assert.equal(check(existing.schedule, {semester: '2nd Semester'}), null);
assert.equal(check(existing.schedule, {id: existing.id}), null);
assert.equal(check([]), null);
assert.match(check([slot('Monday', '10:00', '09:00')]), /end time after/);
assert.match(check([slot('Monday', '09:00', '09:00')]), /end time after/);
assert.match(check([slot('Monday', '25:00', '26:00')]), /valid start/);
console.log('Class assignment schedule checks passed (18 cases).');
