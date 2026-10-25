import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const evaluationApi = {};
new Function('exports', 'require', compile('../src/services/instructorEvaluationStatus.ts'))(evaluationApi, () => ({}));
const first = { id: 'a1', subjectId: 's1', subjectCode: 'GE1', subjectName: 'One', instructorId: 'teacher', academicYear: '2026-2027', semester: '1st Semester', sectionCode: 'A' };
const second = { ...first, id: 'a2', subjectId: 's2', subjectCode: 'GE2' };
const students = ['Completed Student', 'Partial Student', 'Pending Student'].map((name, index) => ({ id: `00${index}`, name, program: 'College', yearLevel: '1st Year', section: 'A' }));
const completion = (student, assignment) => ({ studentNumber: student.id, instructorId: 'teacher', academicYear: first.academicYear, semester: first.semester, subjectIds: [assignment.id], subjectCodes: [assignment.subjectCode] });
const completions = [completion(students[0], first), completion(students[0], second), completion(students[1], first)];
const source = compile('../src/pages/instructor/InstructorStudents.tsx');
function render({ status = 'all', subject = 'all', loading = false, error = '' } = {}) {
  let stateIndex = 0;
  const states = ['all', 'all', subject, status, false, '', { scope: 'Bacoor::teacher', loading, error, completions }];
  const page = {};
  new Function('exports', 'require', source)(page, (path) => {
    if (path === 'react') return { ...require('react'), useEffect() {}, useMemo: fn => fn(), useState: () => [states[stateIndex++], () => {}] };
    if (path.endsWith('useInstructorPortal')) return { useInstructorPortal: () => ({ currentUser: { id: 'teacher', branch: 'Bacoor' }, students, assignments: [first, second], isLoading: false }) };
    if (path.endsWith('instructorRoster')) return { getCurrentStudentInstructorAssignments: (_student, assignments) => assignments };
    if (path.endsWith('instructorEvaluationStatus')) return evaluationApi;
    if (path.endsWith('adminStorage')) return {};
    if (path.endsWith('instructorGradeMasterlist') || path.endsWith('studentGrades') || path.endsWith('gradeTemplateBuilder')) return {};
    if (path.endsWith('SkeletonPage')) return { default: () => null };
    return require(path);
  });
  return renderToStaticMarkup(require('react').createElement(page.default));
}
for (const [status, visible] of [['completed', [0]], ['in-progress', [1]], ['pending', [2]], ['all', [0, 1, 2]]]) {
  const html = render({ status });
  students.forEach((student, index) => assert.equal(html.includes(student.name), visible.includes(index), `${status}: ${student.name}`));
}
assert.ok(render({ status: 'completed', subject: 'GE1' }).includes('Partial Student'), 'Evaluation filter follows the selected subject');
assert.ok(!render({ status: 'pending', loading: true }).includes('Pending Student'), 'Loading evaluations are never treated as pending');
assert.ok(render({ status: 'pending', loading: true }).includes('Loading evaluation statuses...'));
assert.ok(render({ status: 'pending', error: 'Unavailable' }).includes('Evaluation status is unavailable.'));
assert.ok(render().includes('Download Grades Masterlist'));
console.log('Instructor student page checks passed: evaluation status filters, subject selection, loading, errors, and masterlist action.');
