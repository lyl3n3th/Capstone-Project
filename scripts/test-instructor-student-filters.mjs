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
const pagination = {};
new Function('exports', 'require', compile('../src/components/common/TablePagination.tsx'))(pagination, path => path.endsWith('.css') ? {} : require(path));
function render({ status = 'all', subject = 'all', loading = false, error = '', roster = students, pageNumber = 1, pageScope, search = '' } = {}) {
  let stateIndex = 0;
  const states = ['all', 'all', subject, status, false, '', { scope: 'Bacoor::teacher', loading, error, completions }, { scope: pageScope ?? JSON.stringify(['Bacoor::teacher', 'all', 'all', subject, status, search.trim().toLowerCase()]), page: pageNumber }, search];
  const page = {};
  new Function('exports', 'require', source)(page, (path) => {
    if (path === 'react') return { ...require('react'), useEffect() {}, useMemo: fn => fn(), useState: () => [states[stateIndex++], () => {}] };
    if (path.endsWith('useInstructorPortal')) return { useInstructorPortal: () => ({ currentUser: { id: 'teacher', branch: 'Bacoor' }, students: roster, assignments: [first, second], isLoading: false }) };
    if (path.endsWith('TablePagination')) return pagination;
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
assert.ok(!render().includes('The masterlist follows the selected filters'));
assert.ok(render().indexOf('type="search"') < render().indexOf('instructor-student-filters'));
assert.ok(render({ search: '  PARTIAL  ' }).includes('<td>Partial Student</td>'));
assert.ok(!render({ search: 'partial' }).includes('<td>Completed Student</td>'));
assert.ok(render({ search: '002' }).includes('<td>Pending Student</td>'));
assert.ok(render({ search: 'partial', status: 'completed' }).includes('No enrolled students match'));
assert.ok(render({ search: 'no match' }).includes('No enrolled students match'));
const largeRoster = Array.from({ length: 35 }, (_, i) => ({ ...students[0], id: `roster-${i}`, name: `Roster Student ${String(i + 1).padStart(3, '0')}` }));
for (const pageNumber of [1, 2, 3]) {
  const html = render({ roster: largeRoster, pageNumber });
  largeRoster.forEach((student, index) => assert.equal(html.includes(`<td>${student.name}</td>`), index >= (pageNumber - 1) * 15 && index < pageNumber * 15));
  assert.ok(html.includes(`${(pageNumber - 1) * 15 + 1}-${Math.min(pageNumber * 15, 35)} of 35`));
  assert.ok(html.includes(`aria-label="Page ${pageNumber}" aria-current="page"`));
}
const clamped = render({ roster: largeRoster.slice(0, 3), pageNumber: 3 });
assert.ok(clamped.includes('1-3 of 3'), 'A smaller refreshed roster cannot leave an empty out-of-range page');
const changedFilter = render({ roster: largeRoster, pageNumber: 3, subject: 'GE1', pageScope: JSON.stringify(['Bacoor::teacher', 'all', 'all', 'all', 'all']) });
assert.ok(changedFilter.includes('1-15 of 35'), 'New filters start at page one');
const changedSearch = render({ roster: largeRoster, pageNumber: 3, search: 'roster', pageScope: JSON.stringify(['Bacoor::teacher', 'all', 'all', 'all', 'all', '']) });
assert.ok(changedSearch.includes('1-15 of 35'), 'A changed search starts at page one');
assert.ok(!render({ roster: [] }).includes('app-table-pagination'), 'Empty rosters have no invalid page controls');
const changes = [];
const firstPage = pagination.default({ page: 1, pageSize: 10, totalItems: 25, onPageChange: page => changes.push(page) });
const [back, , pages, next] = firstPage.props.children;
assert.equal(back.props.disabled, true);
next.props.onClick(); pages.props.children[2].props.onClick();
assert.deepEqual(changes, [2, 3], 'Next and numbered controls select the requested pages');
const lastPage = pagination.default({ page: 3, pageSize: 10, totalItems: 25, onPageChange() {} });
assert.equal(lastPage.props.children[3].props.disabled, true);
const busyPage = pagination.default({ page: 2, pageSize: 10, totalItems: 25, disabled: true, onPageChange() {} });
assert.equal(busyPage.props.children[0].props.disabled, true);
assert.ok(busyPage.props.children[2].props.children.every(button => button.props.disabled));
console.log('Instructor student checks passed: filters, loading/errors, masterlist action, 15-row pages, page selection, bounds, filter resets, empty rosters, shared pagination actions, and busy states.');
