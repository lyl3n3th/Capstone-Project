import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as XLSX from 'xlsx';
import { DOMParser, XMLSerializer, Node } from '@xmldom/xmldom';

globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;
globalThis.Node = Node;

const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
function load(path, dependencies) {
  const api = {};
  new Function('exports', 'require', compile(read(path)))(api, name => dependencies[name] ?? {});
  return api;
}
let registry = [
  { code: 'bacoor', name: 'Bacoor', student_number_prefix: 'BAC', is_active: true },
  { code: 'commonwealth', name: 'Commonwealth', student_number_prefix: 'COM', is_active: true },
  { code: 'commonwealth_annex', name: 'Commonwealth Annex', student_number_prefix: 'COA', is_active: true },
  { code: 'bacoor_annex', name: 'Bacoor Annex', student_number_prefix: 'BAA', is_active: true },
  { code: 'old_branch', name: 'Old Branch', student_number_prefix: 'OLD', is_active: false },
];
const directory = load('services/branchDirectory.ts', {
  '../lib/supabase': { supabase: { from: () => ({ select: () => ({ returns: async () => ({ data: registry }) }) }) } },
});
await directory.fetchBranchDirectory();
const formatting = load('utils/textFormatting.ts', {});
const storage = load('services/adminStorage.ts', { './branchDirectory': directory, '../utils/textFormatting': formatting });
assert.equal(storage.isValidStudentNumber('COM-261001'), true);
assert.equal(storage.isValidStudentNumber('COA-261001'), true);
assert.equal(storage.isValidStudentNumber('XXX-261001'), false);
assert.equal(storage.isValidStudentNumber('OLD-261001'), false);
assert.equal(storage.isValidStudentNumber('OLD-261001', 'Old Branch'), false);
assert.equal(storage.getStudentNumberPrefix('Commonwealth Annex'), 'COA');
assert.equal(storage.normalizeBranchName('Bacoor Annex'), 'Bacoor Annex');
assert.equal(storage.normalizeStudentNumberInput('261001', 'Commonwealth Annex'), 'COA-261001');
assert.equal(storage.normalizeStudentNumberInput('COM-261001', 'Commonwealth Annex'), 'COM-261001');
assert.equal(storage.isValidStudentNumber('COM-261001', 'Commonwealth Annex'), false);
assert.equal(storage.getBranchFromStudentNumber('COA-261001'), 'Commonwealth Annex');
assert.throws(() => storage.getStudentNumberPrefix('Not Registered'), /unavailable/);
assert.throws(() => storage.getStudentNumberPrefix('Bacoor Heights'), /unavailable/);
registry = registry.map(branch => branch.code === 'commonwealth' ? { ...branch, is_active: false } : branch);
await directory.fetchBranchDirectory();
assert.equal(storage.isValidStudentNumber('COM-261001'), false, 'Archival is reflected after refreshing the registry');

const settings = new Map();
const rooms = new Map([['Commonwealth', ['Lab 1']], ['Bacoor', ['PE Room']]]);
let failWrite = false;
const roomApi = load('services/scholarshipExamRoom.ts', {
  '../lib/supabase': { supabase: { rpc: async (name, args) => {
    if (name === 'list_assignment_rooms') return { data: (rooms.get(args.p_branch) ?? []).map(room_name => ({ room_name })) };
    if (name === 'get_branch_local_storage_record') return { data: settings.get(args.p_branch) ?? null };
    if (failWrite) return { error: { message: 'Save failed' } };
    settings.set(args.p_branch, args.p_payload);
    return {};
  } } },
});
assert.equal(await roomApi.fetchScholarshipExamRoom('Commonwealth'), '');
await roomApi.saveScholarshipExamRoom('Commonwealth', 'Lab 1');
assert.equal(await roomApi.fetchScholarshipExamRoom('Commonwealth'), 'Lab 1');
assert.equal(await roomApi.fetchScholarshipExamRoom('Bacoor'), '', 'Branches cannot inherit another branch room');
await assert.rejects(roomApi.saveScholarshipExamRoom('Commonwealth', 'PE Room'), /existing classroom/);
rooms.set('Commonwealth', []);
assert.equal(await roomApi.fetchScholarshipExamRoom('Commonwealth'), '', 'A deleted or inactive room is not displayed');
await roomApi.saveScholarshipExamRoom('Commonwealth', '');
assert.equal(settings.get('Commonwealth').roomName, '');
failWrite = true;
await assert.rejects(roomApi.saveScholarshipExamRoom('Commonwealth', ''), /Save failed/);

const builder = {};
new Function('exports', 'require', compile(read('services/gradeTemplateBuilder.ts').replaceAll('import.meta.env.BASE_URL', '"/"')))(builder, require);
const originalFetch = globalThis.fetch;
globalThis.fetch = async path => ({ ok: true, arrayBuffer: async () => readFileSync(new URL(`../public${path}`, import.meta.url)) });
let downloads = [];
const portal = load('services/instructorPortal.ts', {
  './adminStorage': { ...storage, readBranchScopedData: () => [] },
  './instructorRoster': { getCurrentStudentInstructorAssignments: (student, assignments) => assignments.filter(a => a.sectionCode === student.section) },
  './gradeTemplateBuilder': {
    ...builder,
    downloadStyledGradeTemplate: async config => downloads.push(await builder.buildStyledGradeTemplateArchive(config)),
  },
  'xlsx': XLSX,
});
const instructor = { id: 'teacher', employeeId: 'TEST', name: 'Test Instructor' };
const base = { instructor, branch: 'Commonwealth', assignments: [], sections: [], students: [] };
assert.throws(() => portal.downloadInstructorGradeTemplate(base), /No assigned subjects or sections/);
assert.equal(downloads.length, 0);
await portal.downloadInstructorGradeTemplate({ ...base,
  assignments: [{ sectionId: 'section', sectionCode: 'A', academicYear: '2026-2027', semester: '1st Semester' }],
  sections: [{ id: 'section', code: 'A', program: 'SHS', yearLevel: 'Grade 11' }],
});
assert.equal(downloads.length, 1);
const workbook = XLSX.read(downloads[0], { type: 'array' });
assert.deepEqual(workbook.SheetNames, ['A']);
assert.equal(workbook.Sheets.A.D4.v, 'Commonwealth', 'The generated workbook contains the new branch');

const selectedSections = ['A', 'B', 'C'].map(code => ({ id: `section-${code}`, code, program: 'SHS', yearLevel: 'Grade 11' }));
const selectedAssignments = selectedSections.flatMap(section => [
  ...(section.code === 'C' ? [] : [{ subjectId: 'pe-one', subjectCode: 'PE1', subjectName: 'Physical Education 1' }]),
  { subjectId: 'other-subject', subjectCode: 'OTHER', subjectName: 'Other Subject' },
].map(subject => ({ ...subject, id: `${section.code}-${subject.subjectId}`, sectionId: section.id, sectionCode: section.code,
  academicYear: '2026-2027', semester: '1st Semester', instructorId: instructor.id, instructorName: instructor.name })));
await portal.downloadInstructorGradeTemplate({ ...base, subjectId: 'pe-one', assignments: selectedAssignments, sections: selectedSections,
  students: selectedSections.map(section => ({ id: `student-${section.code}`, name: `Student ${section.code}`, section: section.code })) });
const subjectWorkbook = XLSX.read(downloads[1], { type: 'array' });
assert.deepEqual(subjectWorkbook.SheetNames, ['A', 'B'], 'Only sections assigned the selected subject are included');
for (const name of subjectWorkbook.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(subjectWorkbook.Sheets[name], { header: 1, range: 6, blankrows: false });
  assert.ok(rows.length > 0, 'Each selected section retains its student roster');
  assert.ok(rows.every(row => row[2] === 'PE1'), 'Other subjects cannot leak into the selected subject workbook');
  assert.equal(rows[0][0], `student-${name}`);
}
assert.throws(() => portal.downloadInstructorGradeTemplate({ ...base, subjectId: 'missing-subject', assignments: selectedAssignments, sections: selectedSections }), /No assigned subjects or sections/);
globalThis.fetch = originalFetch;
console.log('New branch checks passed: registered prefixes, collisions, archival, branch inference, exam-room persistence/isolation/deletion/errors, missing-assignment errors, and actual Excel workbooks with subject filtering and separate section rosters.');
