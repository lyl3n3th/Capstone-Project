import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

let managed = [{name: 'Bacoor'}, {name: 'Taytay'}];
let rows = new Map();
let failedBranch = '';
let failBranchList = false;
const requests = [];
const student = (id, branch = 'Bacoor', status = 'Complete') => ({id, branch, status});
const source = readFileSync(new URL('../src/services/managerStudents.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const exports = {};
new Function('exports', 'require', compiled)(exports, path => {
  if (path === './adminStorage') return {
    normalizeBranchName: branch => ({bacoor:'Bacoor',taytay:'Taytay',gma:'GMA'}[branch.trim().toLowerCase()] || branch.trim()),
    readStoredStudents: () => { throw new Error('Student counts must not depend on the local cache'); },
  };
  if (path === './staffApi') return {fetchManagedBranches: async () => {
    if (failBranchList) throw new Error('Cannot load branches');
    return managed;
  }};
  if (path === './adminStudentsApi') return {fetchAdminStudents: async branch => {
    requests.push(branch);
    if (branch === failedBranch) throw new Error('Cannot load branch students');
    return rows.get(branch) || [];
  }};
  throw new Error(`Unexpected import: ${path}`);
});
const {fetchManagedStudentSnapshot: fetch, isVisibleManagerStudentRecord: visible} = exports;

// The database has 25 students even when the browser has fewer or no cached records.
rows.set('Bacoor', Array.from({length:25}, (_,i) => student(String(i))));
rows.set('Taytay', [student('T-1','Taytay')]);
let snapshot = await fetch();
assert.equal(snapshot.students.length,26);
assert.equal(snapshot.students.filter(s => s.branch === 'Bacoor').length,25);
assert.deepEqual(requests.sort(), ['Bacoor','Taytay']);
// A subsequent fetch reflects database additions and removals immediately.
rows.set('Bacoor',[student('latest')]);
assert.equal((await fetch()).students.length,2);
rows.set('Bacoor',[]);
snapshot = await fetch();
assert.equal(snapshot.students.filter(s => s.branch === 'Bacoor').length,0);
assert.deepEqual(snapshot.branches,['Bacoor','Taytay']);
// Filter inactive records identically for the dashboard and directory.
for (const status of ['Archived','Graduated','Deleted','Inactive','Removed',' archived ']) assert.equal(visible({status}),false);
for (const status of ['Complete','Incomplete']) assert.equal(visible({status}),true);
rows.set('Bacoor',[student('active'),student('archived','Bacoor','Archived'),student('graduate','Bacoor','Graduated'),student('foreign','GMA')]);
assert.deepEqual((await fetch()).students.filter(s=>s.branch==='Bacoor').map(s=>s.id),['active']);
// No managed branches means no accidental default branch or all-branch query.
managed=[]; requests.length=0;
assert.deepEqual(await fetch(),{branches:[],students:[]});
assert.deepEqual(requests,[]);
managed=[{name:' bacoor '},{name:'Bacoor'},{name:'Taytay'},{name:''}];
requests.length=0;
assert.deepEqual((await fetch()).branches,['Bacoor','Taytay']);
assert.equal(requests.filter(branch=>branch==='Bacoor').length,1);
// Never publish a partial all-branch total as though it were complete.
failedBranch='Taytay';
await assert.rejects(fetch(),/Cannot load branch students/);
failedBranch=''; failBranchList=true;
await assert.rejects(fetch(),/Cannot load branches/);
console.log('Manager student checks passed: current database records, branch scope, empty branches, lifecycle filters, branch deduplication, refresh, and failed requests.');
