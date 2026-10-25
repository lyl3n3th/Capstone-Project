import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function loadModule(file, imports = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, path => imports[path] ?? {});
  return exports;
}

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
};

const api = loadModule('../src/services/adminStorage.ts', {
  '../utils/textFormatting': loadModule('../src/utils/textFormatting.ts'),
});
const markerKey = 'aics-deleted-students';
const original = {
  branch: 'Commonwealth', id: 'OLD-001', trackingNumber: 'TRACK-OLD', name: 'Juan Dela Cruz',
};
const imported = { ...original, id: 'NEW-002', trackingNumber: 'TRACK-NEW' };
const seedLegacyMarkers = () => storage.set(markerKey, JSON.stringify([
  { branch: original.branch, studentNumber: original.id, trackingNumber: original.trackingNumber, name: original.name },
  { branch: original.branch, name: original.name },
]));

// Existing browser markers must stop hiding new students without a cache reset.
seedLegacyMarkers();
assert.equal(api.isStoredStudentDeleted(imported), false);
assert.equal(api.isStoredStudentDeleted({ ...imported, trackingNumber: undefined }), false);
assert.equal(api.isStoredStudentDeleted(original), true);
assert.equal(api.isStoredStudentDeleted({ ...original, id: 'OTHER-ID' }), true);
assert.equal(api.isStoredStudentDeleted({ ...original, trackingNumber: 'OTHER-TRACK' }), true);
assert.equal(api.isStoredStudentDeleted({ ...original, branch: 'Bacoor' }), false);
assert.equal(api.isStoredStudentDeleted({ ...original, id: ' old-001 ', trackingNumber: undefined }), true);

// Restoring someone with the same name must preserve the original deletion.
api.forgetDeletedStoredStudent(imported);
assert.equal(api.isStoredStudentDeleted(original), true);
assert.equal(api.isStoredStudentDeleted(imported), false);
assert.equal(JSON.parse(storage.get(markerKey)).length, 1);
api.forgetDeletedStoredStudent(original);
assert.equal(api.isStoredStudentDeleted(original), false);

// New markers require an identifier; names are never used as identity.
api.rememberDeletedStoredStudent(original);
assert.equal(api.isStoredStudentDeleted(original), true);
assert.equal(api.isStoredStudentDeleted(imported), false);
assert.equal('name' in JSON.parse(storage.get(markerKey))[0], false);
api.rememberDeletedStoredStudent({ ...original, id: '', trackingNumber: undefined });
assert.equal(JSON.parse(storage.get(markerKey)).length, 1);

// Reimporting the SAME number creates a real database record. It must be
// visible on every device even when that device remembers an earlier deletion.
let remoteRows = [];
let databaseError = null;
const studentApi = loadModule('../src/services/adminStudentsApi.ts', {
  '../lib/supabase': { supabase: { rpc: () => ({
    returns: async () => ({ data: remoteRows, error: databaseError }),
  }) } },
  './adminStorage': api,
  '../utils/textFormatting': loadModule('../src/utils/textFormatting.ts'),
  './studentImport': { fetchStudentImportDetails: async () => [] },
  './importedStudentScheduling': { applyImportedScheduleDefaults: student => student },
  './studentPlanningApi': {
    fetchStudentPlanningStates: async () => [],
    mergeStudentPlanningStatesIntoStudents: students => students,
  },
});
const unrelated = { ...original, id: 'STILL-DELETED', trackingNumber: undefined };
const anotherBranch = { ...original, branch: 'Bacoor' };
api.rememberDeletedStoredStudent(unrelated);
api.rememberDeletedStoredStudent(anotherBranch);
assert.deepEqual(await studentApi.fetchAdminStudents('Commonwealth'), []);
assert.equal(api.isStoredStudentDeleted(original), true, 'Empty responses cannot restore cached deletions');
databaseError = { message: 'Network unavailable' };
await assert.rejects(studentApi.fetchAdminStudents('Commonwealth'), /Network unavailable/);
assert.equal(api.isStoredStudentDeleted(original), true, 'Failed requests cannot clear deletion markers');
await assert.rejects(studentApi.saveAdminStudent(original), /Network unavailable/);
assert.equal(api.isStoredStudentDeleted(original), true, 'Failed saves cannot clear deletion markers');
databaseError = null;
remoteRows = [{ student_number: original.id, branch: original.branch, full_name: original.name,
  first_name: 'Juan', last_name: 'Dela Cruz', program: 'College', year_level: '1st Year',
  status: 'Incomplete', email: 'new@example.invalid' }];
const fetched = await studentApi.fetchAdminStudents('Commonwealth');
assert.equal(fetched.length, 1);
assert.equal(fetched[0].id, original.id);
assert.equal(api.isStoredStudentDeleted(fetched[0]), false);
assert.equal(api.isStoredStudentDeleted(original), false);
assert.equal(api.isStoredStudentDeleted(unrelated), true);
assert.equal(api.isStoredStudentDeleted(anotherBranch), true);
// Simulate another browser that still has the same older deletion marker.
api.rememberDeletedStoredStudent(original);
assert.equal((await studentApi.fetchAdminStudents('Commonwealth')).length, 1);
assert.equal(api.isStoredStudentDeleted(original), false);

delete globalThis.window;
console.log('Student deletion checks passed: same-name and same-number reimports, database authority, cross-device marker recovery, preserved unrelated deletions, failed requests/saves, and legacy markers.');
