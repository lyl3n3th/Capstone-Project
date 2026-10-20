import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const cached = new Map();
const requests = [];
let serverRow = null;
let serverError = null;
let events = 0;
const scopeKey = (scope, branch) => `${scope}:${branch || 'Bacoor'}`;
const storage = {
  normalizeBranchName: branch => branch || 'Bacoor',
  readBranchScopedData: (scope, branch) => cached.get(scopeKey(scope, branch)),
  writeBranchScopedData: (scope, branch, data) => cached.set(scopeKey(scope, branch), data),
};
const supabase = {
  from(table) {
    assert.equal(table, 'instructor_evaluation_periods');
    let payload;
    const query = {
      select: () => query,
      eq: (key, value) => { requests.push({key, value}); return query; },
      upsert: (row, options) => { payload = row; requests.push({row, options}); return query; },
      maybeSingle: async () => ({data: serverRow, error: serverError}),
      single: async () => ({data: serverError ? null : payload, error: serverError}),
    };
    return query;
  },
};
const source = readFileSync(new URL('../src/services/evaluationPeriod.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
const exports = {};
new Function('exports', 'require', 'window', 'CustomEvent', compiled)(
  exports, path => path === '../lib/supabase' ? {supabase} : storage,
  {dispatchEvent: () => { events++; }}, class CustomEvent {},
);
const {isEvaluationPeriodOpen: isOpen, readEvaluationPeriod: read, fetchEvaluationPeriod: fetch,
  saveEvaluationPeriod: save, toLocalDateTimeInput} = exports;
const now = Date.now();
const future = new Date(now + 3600_000).toISOString();
const past = new Date(now - 3600_000).toISOString();
assert.equal(isOpen(null), false);
assert.equal(isOpen({isOpen: false, closesAt: future}), false);
assert.equal(isOpen({isOpen: true, closesAt: null}), true);
assert.equal(isOpen({isOpen: true, closesAt: future}, now), true);
assert.equal(isOpen({isOpen: true, closesAt: past}, now), false);
assert.equal(isOpen({isOpen: true, closesAt: future}, Date.parse(future)), false);
assert.equal(isOpen({isOpen: true, closesAt: 'invalid'}), false);
assert.equal(read('Bacoor'), null);
assert.equal(await fetch('Bacoor'), null);
serverRow = {is_open: true, closes_at: future, updated_at: new Date().toISOString()};
assert.equal((await fetch('Bacoor')).closesAt, future);
assert.equal(read('Bacoor').isOpen, true);
assert.equal(read('Taytay'), null);
assert.deepEqual(requests.at(-1), {key: 'branch', value: 'Bacoor'});
const opened = await save('Bacoor', true, null);
assert.equal(opened.isOpen, true);
assert.equal(opened.closesAt, null);
assert.equal(events, 1);
assert.equal(requests.at(-1).options.onConflict, 'branch');
assert.equal(requests.at(-1).row.branch, 'Bacoor');
assert.equal((await save('Bacoor', true, future)).closesAt, future);
assert.equal((await save('Bacoor', false, null)).isOpen, false);
const saved = read('Bacoor');
const eventCount = events;
const requestCount = requests.length;
await assert.rejects(save('Bacoor', true, past), /future/);
await assert.rejects(save('Bacoor', true, 'invalid'), /future/);
assert.equal(requests.length, requestCount);
serverError = {message: 'Database unavailable'};
await assert.rejects(save('Bacoor', true, future), /Database unavailable/);
await assert.rejects(fetch('Bacoor'), /Database unavailable/);
assert.deepEqual(read('Bacoor'), saved);
assert.equal(events, eventCount);
assert.equal(toLocalDateTimeInput(null), '');
assert.equal(toLocalDateTimeInput('invalid'), '');
const local = toLocalDateTimeInput(future);
assert.match(local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
assert.equal(Math.floor(new Date(local).getTime() / 60000), Math.floor(Date.parse(future) / 60000));
console.log('Evaluation period checks passed: manual opening/closing, deadlines, exact cutoff, branch isolation, persistence failures, and local time conversion.');
