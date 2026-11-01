import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = (path, dependencies = {}) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, (name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  });
  return exports;
};

const limit = compile('../src/services/studentScheduleUnitLimit.ts');
const validate = limit.getIrregularScheduleUnitError;
const load = (units) => units.map((value, index) => ({
  subjectId: `subject-${index}`, units: value,
  // Catalog semester never exempts leftover units from the requested load.
  semester: index % 2 ? '2nd Semester' : '1st Semester',
}));
assert.equal(limit.IRREGULAR_SEMESTER_UNIT_LIMIT, 20);
assert.equal(validate([]), null);
assert.equal(validate(load([3, 3, 3, 3, 3, 3, 2])), null);
assert.equal(validate(load([12, 8])), null);
assert.match(validate(load([12, 9])), /maximum of 20 units.*21 units/);
assert.match(validate(load([3, 3, 3, 3, 3, 3, 3])), /21 units/);
assert.equal(validate(load([20])), null);
assert.equal(validate(load([0, 20])), null);
for (const invalid of [undefined, null, -1, NaN, Infinity, '3']) {
  assert.match(validate([{ units: invalid }]), /missing or invalid units/);
}

let rpcCalls = 0;
let cacheWrites = 0;
let remoteError = null;
const api = compile('../src/services/studentPlanningApi.ts', {
  './studentScheduleUnitLimit': limit,
  '../lib/supabase': { supabase: {
    rpc(name, { p_payload: payload }) {
      rpcCalls++;
      assert.equal(name, 'upsert_student_schedule_request');
      return { returns: async () => ({
        error: remoteError,
        data: [{
          id: payload.id, student_number: payload.studentNumber,
          academic_year: payload.academicYear, semester: payload.semester,
          status: payload.status, payload,
        }],
      }) };
    },
  } },
  './adminStorage': {
    normalizeBranchName: (branch) => branch || 'Bacoor',
    readBranchScopedData: () => [],
    writeBranchScopedData: () => { cacheWrites++; },
  },
});
const request = {
  id: 'test', studentNumber: 'TEST-1', branch: 'Bacoor', program: 'College',
  academicYear: '2026-2027', semester: '1st Semester', status: 'Pending',
  selections: load([12, 9]),
};
await assert.rejects(api.saveStudentScheduleRequest(request), /maximum of 20 units/);
await assert.rejects(api.saveStudentScheduleRequest({ ...request, status: 'Approved' }), /maximum of 20 units/);
assert.equal(rpcCalls, 0);
assert.equal(cacheWrites, 0);
await api.saveStudentScheduleRequest({ ...request, selections: load([12, 8]) });
await api.saveStudentScheduleRequest({ ...request, status: 'Rejected' });
await api.saveStudentScheduleRequest({ ...request, program: 'SHS', selections: [{}] });
assert.equal(rpcCalls, 3);
assert.equal(cacheWrites, 3);
remoteError = { message: 'Catalog load exceeds 20 units.' };
await assert.rejects(api.saveStudentScheduleRequest({ ...request, selections: load([12, 8]) }), /Catalog load exceeds 20 units/);
assert.equal(cacheWrites, 3, 'Server rejection must not write an approved request to the cache');
console.log('Student schedule unit-limit tests passed.');
