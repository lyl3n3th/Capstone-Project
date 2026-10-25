import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const requests = [];
let responseRows = [];
let backendError = null;
const supabase = { from(table) {
  const request = { table, filters: [] };
  requests.push(request);
  const query = {
    select(columns) { request.columns = columns; return query; },
    eq(column, value) { request.filters.push([column, value]); return query; },
    order(column) { request.order = column; return query; },
    async range(start, end) { request.range = [start, end]; return { data: responseRows.slice(start, end + 1), error: backendError }; },
  };
  return query;
} };
const source = readFileSync(new URL('../src/services/instructorEvaluationStatus.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = {};
new Function('exports', 'require', compiled)(api, path => {
  if (path === '../lib/supabase') return { supabase };
  if (path === './adminStorage') return { normalizeBranchName: value => value.trim() };
  throw new Error(`Unexpected dependency: ${path}`);
});
const assignment = { id: 'assignment-1', subjectId: 'subject-1', subjectCode: 'GE1', instructorId: 'teacher-1', academicYear: '2026-2027', semester: '1st Semester' };
const second = { ...assignment, id: 'assignment-2', subjectId: 'subject-2', subjectCode: 'GE2' };
const completion = { studentNumber: 'BAC-001', instructorId: assignment.instructorId, academicYear: assignment.academicYear, semester: assignment.semester, subjectIds: [assignment.id], subjectCodes: ['GE1'] };
const status = (completions, assignments = [assignment, second]) => api.getStudentInstructorEvaluationStatus('BAC-001', assignments, completions);
assert.deepEqual(status([]), { status: 'pending', completedCount: 0, totalCount: 2 });
assert.deepEqual(status([completion]), { status: 'in-progress', completedCount: 1, totalCount: 2 });
assert.deepEqual(status([completion, { ...completion, subjectIds: [second.id], subjectCodes: ['GE2'] }]), { status: 'completed', completedCount: 2, totalCount: 2 });
assert.deepEqual(status([completion], [assignment]), { status: 'completed', completedCount: 1, totalCount: 1 });
assert.equal(status([completion], [second]).status, 'pending');
assert.deepEqual(status([], []), { status: 'not-applicable', completedCount: 0, totalCount: 0 });
for (const mismatch of [
  { studentNumber: 'BAC-002' }, { instructorId: 'teacher-2' },
  { academicYear: '2025-2026' }, { semester: '2nd Semester' },
  { subjectIds: ['another-subject'] },
]) assert.equal(status([{ ...completion, ...mismatch }]).completedCount, 0);
// Multiple schedule rows or duplicate submissions count a subject once.
assert.equal(status([completion, completion], [assignment, { ...assignment, id: 'another-slot' }]).totalCount, 1);
assert.equal(status([completion, completion], [assignment, { ...assignment, id: 'another-slot' }]).completedCount, 1);
assert.equal(status([{ ...completion, subjectIds: [assignment.subjectId] }]).completedCount, 1);
assert.equal(status([{ ...completion, subjectIds: [], subjectCodes: [' ge1 '] }]).completedCount, 1);
assert.equal(status([{ ...completion, studentNumber: ' bac-001 ', semester: ' 1ST SEMESTER ' }]).completedCount, 1);

// Completion data is fetched from the backend, scoped to branch/instructor,
// and paginated without retrieving private questionnaire answers.
responseRows = Array.from({ length: 501 }, (_, index) => ({
  instructor_id: 'teacher-1', student_number: `BAC-${index}`, academic_year: '2026-2027',
  semester: '1st Semester', subject_ids: ['assignment-1'], subject_codes: ['GE1'],
}));
const fetched = await api.fetchInstructorEvaluationCompletions(' Bacoor ', 'teacher-1');
assert.equal(fetched.length, 501);
assert.deepEqual(requests.map(request => request.range), [[0, 499], [500, 999]]);
for (const request of requests) {
  assert.equal(request.table, 'instructor_evaluation_submissions');
  assert.deepEqual(request.filters, [['branch', 'Bacoor'], ['instructor_id', 'teacher-1']]);
  assert.equal(request.order, 'id');
  assert.doesNotMatch(request.columns, /responses|student_name|\*/);
}
assert.equal(fetched[0].studentNumber, 'BAC-0');
backendError = { message: 'Backend unavailable' };
await assert.rejects(api.fetchInstructorEvaluationCompletions('Bacoor', 'teacher-1'), /Backend unavailable/);
console.log('Instructor evaluation checks passed: complete/partial/pending status, student/instructor/subject/term isolation, duplicates, subject filtering, metadata-only fetching, pagination, and backend failure.');
