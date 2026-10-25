import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const online = new Map();
let browser = new Map();
const events = [];
let failRead = false;
let failWrite = false;
let heldRead = null;
const calls = [];
global.window = { dispatchEvent: event => events.push(event) };
global.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
global.localStorage = {
  getItem: key => browser.get(key) ?? null,
  setItem: (key, value) => browser.set(key, value),
};
const modules = new Map();
const supabase = { async rpc(name, args) {
  calls.push({ name, args });
  const key = `${args.p_branch}::${args.p_scope}`;
  if (name === 'get_branch_local_storage_record') {
    const data = online.get(key) ?? null;
    if (heldRead) await heldRead;
    return { data, error: failRead ? { message: 'Offline' } : null };
  }
  if (failWrite) return { error: { message: 'Offline' } };
  online.set(key, structuredClone(args.p_payload));
  return { data: null, error: null };
} };
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const api = {};
  modules.set(name, api);
  const source = readFileSync(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', compiled)(api, path => path === '../lib/supabase' ? { supabase } : load(path.slice(2)));
  return api;
}
const preferences = load('profilePreferences');
const api = load('profileImageSync');
const user = { id: 'student-uuid-1', role: 'student', studentNumber: 'BAC-001', branch: 'Bacoor' };
const key = preferences.getProfileImageKeyFromUser(user);
const first = 'data:image/jpeg;base64,YWJj';
const second = 'data:image/jpeg;base64,ZGVm';
await api.saveProfileImageForUser(user, first);
assert.equal(preferences.getStoredProfileImage(key), first);
browser = new Map(); // Another browser/device/site has none of the previous local storage.
assert.equal(await api.fetchProfileImageForUser(user), first);
assert.equal(preferences.getStoredProfileImage(key), first, 'The shared picture repopulates the new device cache');
assert.equal(await api.fetchProfileImageForUser({ ...user, id: 'student-uuid-2' }), null, 'Accounts are isolated');
assert.equal(await api.fetchProfileImageForUser({ ...user, branch: 'Taytay' }), null, 'Branches are isolated');

const legacyUser = { ...user, id: 'legacy-student', studentNumber: 'OLD-001' };
preferences.setStoredProfileImage(preferences.getLegacyStudentProfileImageKey(legacyUser), second);
assert.equal(await api.fetchProfileImageForUser(legacyUser), second, 'Existing browser-only pictures migrate online');
assert.equal(preferences.getStoredProfileImage(preferences.getLegacyStudentProfileImageKey(legacyUser)), null);
browser = new Map();
assert.equal(await api.fetchProfileImageForUser(legacyUser), second);

await api.saveProfileImageForUser(user, null);
preferences.setStoredProfileImage(key, first); // An older device still has its stale picture.
preferences.setStoredProfileImage(preferences.getLegacyStudentProfileImageKey(user), first);
assert.equal(await api.fetchProfileImageForUser(user), null, 'A removal must not resurrect a stale cached picture');
assert.equal(preferences.getStoredProfileImage(key), null);
assert.equal(preferences.getStoredProfileImage(preferences.getLegacyStudentProfileImageKey(user)), null);

failWrite = true;
await assert.rejects(api.saveProfileImageForUser(user, first), /could not be saved online/);
assert.equal(preferences.getStoredProfileImage(key), null, 'A failed upload cannot report local-only success');
failWrite = false;
failRead = true;
await assert.rejects(api.fetchProfileImageForUser(user), /Unable to load/);
failRead = false;

await api.saveProfileImageForUser(user, first);
let release;
heldRead = new Promise(resolve => { release = resolve; });
const fetching = api.fetchProfileImageForUser(user);
const duplicated = api.fetchProfileImageForUser(user);
assert.equal(fetching, duplicated, 'Header and home share one request');
await api.saveProfileImageForUser(user, second);
release();
heldRead = null;
assert.equal(await fetching, second, 'An older response cannot overwrite a newly saved image');
await Promise.all([api.saveProfileImageForUser(user, first), api.saveProfileImageForUser(user, second), api.saveProfileImageForUser(user, null)]);
assert.equal(await api.fetchProfileImageForUser(user), null, 'Concurrent save/remove requests preserve their order');

const originalSetItem = localStorage.setItem;
localStorage.setItem = () => { throw new Error('Browser storage full'); };
await api.saveProfileImageForUser(user, second);
assert.equal(preferences.getStoredProfileImage(key), second, 'A full cache does not break successful online saves');
localStorage.setItem = originalSetItem;
assert.ok(events.length > 0, 'Avatar consumers are notified');
await assert.rejects(api.saveProfileImageForUser(user, 'blob:device-only-url'), /Choose another image/);
const staff = { ...user, role: 'instructor', employeeId: 'EMP-1' };
const count = calls.length;
await api.saveProfileImageForUser(staff, first);
assert.equal(calls.length, count, 'Staff behavior remains local');
console.log('Profile picture checks passed: cross-device/site retrieval, account/branch isolation, local migration, persistent removal, failed uploads, concurrent saves, stale reads, duplicate readers, and full browser cache.');
