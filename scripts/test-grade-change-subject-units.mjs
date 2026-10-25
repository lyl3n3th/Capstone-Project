import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/services/gradeChangeSubjectUnits.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = {};
new Function('exports', compiled)(api);
const resolve = api.resolveGradeChangeSubjectUnits;
const subject = { id: 'subject-one', code: 'GE1', name: 'Understanding the Self', units: 3, program: 'College', yearLevel: '1st Year', semester: '1st Semester' };
const lookup = { subjectId: subject.id, subjectCode: subject.code, programType: 'College', semester: subject.semester, yearLevel: subject.yearLevel };
const other = { ...subject, id: 'other-course', units: 5, name: 'Other Curriculum Subject' };
assert.equal(resolve(lookup, [other, subject]), 3, 'Exact assignment subject ID determines units, even when codes overlap');
assert.equal(resolve({ ...lookup, units: 999 }, [subject]), 3, 'Uploaded units must never override the catalog');
assert.equal(resolve({ ...lookup, subjectId: undefined }, [subject]), 3, 'Legacy request rows can use subject code');
assert.equal(resolve({ ...lookup, subjectId: 'old-id' }, [subject]), 3, 'Code fallback handles replaced subject IDs');
assert.equal(resolve({ subjectCode: ' ge1 ', programType: 'College', semester: ' 1ST SEMESTER ' }, [subject]), 3);
for (const mismatch of [{ program: 'SHS' }, { yearLevel: '2nd Year' }, { semester: '2nd Semester' }]) {
  assert.equal(resolve({ ...lookup, subjectId: undefined }, [{ ...subject, ...mismatch, units: 8 }, subject]), 3);
}
assert.equal(resolve({ ...lookup, subjectId: undefined, subjectTitle: subject.name }, [other, subject]), 3);
assert.equal(resolve({ ...lookup, subjectId: undefined }, [other, subject]), null, 'Ambiguous units must not be guessed');
assert.equal(resolve({ ...lookup, subjectId: undefined }, [subject, { ...subject, id: 'other-schedule' }]), 3);
assert.equal(resolve(lookup, [{ ...subject, units: 0 }]), 0, 'Zero units must remain visible');
assert.equal(resolve(lookup, [{ ...subject, units: undefined }, other]), null, 'Missing exact subject units must not borrow from another course');
assert.equal(resolve(lookup, [{ ...subject, units: -1 }]), null);
assert.equal(resolve(lookup, [{ ...subject, units: NaN }]), null);
assert.equal(resolve({ subjectCode: 'UNKNOWN', units: 999 }, [subject]), null);
assert.equal(resolve(lookup, []), null);
console.log('Grade-change units checks passed: catalog authority, exact IDs, code fallback, curriculum/semester matching, ambiguity, zero units, and missing subjects.');
