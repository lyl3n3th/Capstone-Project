import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const lockApi = {};
new Function('exports', compile(readFileSync(new URL('../src/services/studentEvaluationLock.ts', import.meta.url), 'utf8')))(lockApi);
const student = { id: 'uuid', studentNumber: 'BAC-001', firstName: 'Test', lastName: 'Student', branch: 'Bacoor', programType: 'BS', yearLevel: '1st Year' };
const currentTerm = { academicYear: '2028-2029', semester: '1st Semester' };
const subjects = ['ENT1', 'GE1'].map((code, i) => ({ id: `assignment-${i}`, code, title: code, units: 3, instructorId: `teacher-${i}`, professor: `Instructor ${i}`, academicYear: currentTerm.academicYear, semester: currentTerm.semester }));
const submissions = subjects.map(subject => ({ id: lockApi.getEvaluationSubmissionId({ studentId: student.studentNumber, instructorId: subject.instructorId, academicYear: subject.academicYear, semester: subject.semester, subjectIds: [subject.id] }), studentNumber: student.studentNumber, instructorId: subject.instructorId, academicYear: subject.academicYear, semester: subject.semester, subjectIds: [subject.id], subjectCodes: [subject.code] }));
const source = readFileSync(new URL('../src/pages/student/StudentGrades.tsx', import.meta.url), 'utf8');
const compiled = compile(source);

function render({ completions = [], loading = false, error = '', year = '', syncScope = 'Bacoor::BAC-001' } = {}) {
  const page = {};
  let stateIndex = 0;
  const states = [false, year, '', false, 0, completions, { scope: syncScope, loading, error }, false, []];
  new Function('exports', 'require', compiled)(page, path => {
    if (path === 'react') return { ...require('react'), useEffect() {}, useMemo: fn => fn(), useRef: value => ({ current: value }), useState: () => [states[stateIndex++], () => {}] };
    if (path.endsWith('useStudent')) return { useStudent: () => ({ student, subjects, currentTerm, isLoading: false }) };
    if (path.endsWith('studentEvaluationLock')) return lockApi;
    if (path.endsWith('adminStorage')) return {};
    if (path.endsWith('studentGrades')) return { COLLEGE_GRADE_CONVERSION_SCALE: [], COLLEGE_GRADE_SPECIAL_MARKS: [], getStudentGradeRecords: () => [] };
    if (path.endsWith('.css')) return {};
    if (path.endsWith('.png')) return { default: 'logo.png' };
    if (path.endsWith('/Toast')) return { ToastContainer: () => null };
    if (path.includes('/components/')) return { default: () => null };
    return require(path);
  });
  return renderToStaticMarkup(require('react').createElement(page.default));
}
for (const scenario of [
  {}, { completions: submissions.slice(0, 1) }, { completions: submissions, loading: true },
  { completions: submissions, error: 'Unable to verify' }, { completions: submissions, syncScope: 'different-student' },
  { year: '2027-2028' },
]) {
  assert.match(render(scenario), /class="s-generate-btn"[^>]*disabled=""/, 'The button stays disabled for pending/loading/error/stale identity, including historical report filters');
}
assert.doesNotMatch(render({ completions: submissions }), /class="s-generate-btn"[^>]*disabled=""/, 'All evaluations unlock the button');
assert.match(render(), /Go to instructor evaluations/);

const ast = ts.createSourceFile('StudentGrades.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handlerSource;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleGenerateReportCard') handlerSource = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const handlerCode = compile(`const handler = ${handlerSource};`);
async function generate({ blocked = false, latest = submissions, fails = false, duplicate = false } = {}) {
  let pdfCalls = 0, fetchCalls = 0, downloads = 0, release;
  const gate = duplicate ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const toasts = [];
  const context = {
    student, subjects, currentTerm, reportCardInFlight: { current: false }, reportCardBlockReason: blocked ? 'Complete all evaluations' : '',
    setIsGeneratingReportCard() {}, setEvaluationSubmissions() {},
    fetchInstructorEvaluationSubmissions: async () => { fetchCalls++; await gate; if (fails) throw new Error('Offline'); return latest; },
    getCurrentTermEvaluationLockStatus: lockApi.getCurrentTermEvaluationLockStatus,
    buildReportCardPdf: async () => { pdfCalls++; return {}; },
    displayRows: [], tableColumns: [], isSHS: false, totalUnits: 0, collegePerformanceSummary: null, shsGeneralAverage: '-',
    effectiveAcademicYear: '2027-2028', effectiveSemester: '1st Semester',
    URL: { createObjectURL: () => 'blob:report', revokeObjectURL() {} },
    window: { open: () => ({}), setTimeout() {} },
    document: { createElement: () => ({ click: () => downloads++ }), body: { appendChild() {}, removeChild() {} } },
    normalizeReportFilePart: value => value,
    addToast: (message, type) => toasts.push({ message, type }), console: { error() {} },
  };
  const handler = new Function('context', `with (context) { ${handlerCode}; return handler; }`)(context);
  const pending = handler();
  if (duplicate) { await handler(); release(); }
  await pending;
  assert.equal(pdfCalls, blocked || fails || latest.length !== submissions.length ? 0 : 1);
  assert.equal(downloads, pdfCalls);
  assert.equal(context.reportCardInFlight.current, false);
  if (duplicate) assert.equal(fetchCalls, 1, 'Repeated clicks cannot generate multiple PDFs');
  return toasts;
}
await generate({ blocked: true });
await generate({ latest: submissions.slice(0, 1) });
await generate({ fails: true });
await generate();
await generate({ duplicate: true });
console.log('Report card checks passed: actual disabled button, partial/complete evaluations, loading/errors/account isolation, historical-filter bypass prevention, online recheck, blocked PDF/download, and repeated-click protection.');
