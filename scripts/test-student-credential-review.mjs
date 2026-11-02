import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Two independent browser caches, backed by a shared mocked server. No live
// student records or Supabase credentials are used by these tests.
let cache = new Map();
const remote = new Map();
let failSave = false;
let failLoad = false;
let queue = [];
globalThis.window = {
  localStorage: { getItem: key => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value) },
  dispatchEvent: () => {},
};
const supabase = { rpc: (name, args) => {
  if (name === 'get_admin_admission_queue') return { returns: async () => ({ data: queue, error: null }) };
  if (name === 'list_admission_academic_years') return { returns: async () => ({ data: [], error: null }) };
  const key = `${args.p_branch}|${args.p_scope}`;
  if (name === 'get_branch_local_storage_record') {
    return Promise.resolve({ data: structuredClone(remote.get(key) ?? null), error: failLoad ? { message: 'Load failed' } : null });
  }
  assert.equal(name, 'upsert_branch_local_storage_record');
  if (failSave) return Promise.resolve({ error: { message: 'Save failed' } });
  remote.set(key, structuredClone(args.p_payload));
  return Promise.resolve({ error: null });
}, storage: { from: () => ({ createSignedUrl: async path => ({ data: { signedUrl: `https://files.example/${path}` }, error: null }) }) } };
function load(file, imports = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, name => imports[name] ?? {});
  return exports;
}
const admission = load('../src/services/admission.ts', { '../lib/supabase': { supabase } });
const api = load('../src/services/adminStorage.ts', {
  '../lib/supabase': { supabase }, './admission': admission,
  './branchDirectory': { findRegisteredBranch: () => undefined },
  './legacyMockData': load('../src/services/legacyMockData.ts'),
  '../utils/textFormatting': load('../src/utils/textFormatting.ts'),
});
const student = {
  id: 'GMA-TEST', branch: 'GMA', trackingNumber: 'TEST-TRACK', name: 'Test Student',
  program: 'SHS', yearLevel: 'Grade 11', studentStatus: 'Transferee', status: 'Incomplete',
  email: 'test@example.com', contact: '', address: '',
};
const requirements = admission.getAdmissionRequirements('Transferee', 'Senior High School', 'No Honor');
assert.ok(requirements.length > 0);
const pending = {
  trackingNumber: student.trackingNumber, studentNumber: student.id, studentStatus: 'Transferee',
  program: 'SHS', honorLabel: 'No Honor', applicationDate: '2026-11-02', personalInfo: {},
  totalDocuments: requirements.length, documentsSubmitted: requirements.length,
  attachments: requirements.map(r => ({ name: r.name, type: 'pdf', storagePath: `files/${r.code}.pdf`,
    url: `https://files.example/${r.code}.pdf`, reviewStatus: 'Pending' })),
};
api.writeStoredStudents([student]);
api.writeBranchScopedData('enrollees', 'GMA', [pending], { skipSupabaseSync: true });
const studentBrowser = structuredClone(cache);
const identity = { branch: 'GMA', studentNumber: student.id, trackingNumber: student.trackingNumber };
const overview = () => api.getStudentCredentialOverview(identity);
const review = (name, status) => api.updateStudentRequirementReviewStatus({ ...identity, requirementName: name, status });

// A failed write must never appear approved locally.
failSave = true;
await assert.rejects(review(requirements[0].name, 'Approved'), /Save failed/);
assert.equal(overview().items[0].statusLabel, 'Under Review');
failSave = false;
for (const requirement of requirements) await review(requirement.name, 'Approved');
assert.ok(overview().items.every(item => item.statusLabel === 'Approved'));
assert.equal(overview().summary.overallStatus, 'Complete');
assert.equal(api.getStudentRequirementStatus(student), 'Complete');
assert.equal(api.getStudentRequirementStatus({ ...student, status: 'Archived' }), 'Archived');
assert.equal(api.getStudentRequirementStatus({ ...student, status: 'Graduated' }), 'Graduated');
const adminBrowser = cache;

// The second browser recovers decisions without the admin's local cache, even
// after its stale whole-branch record has been mirrored back to the server.
cache = studentBrowser;
remote.set('GMA|enrollees', [pending]);
assert.equal(overview().items[0].statusLabel, 'Under Review');
await api.fetchStudentCredentialReviewDecisions(pending, 'GMA');
assert.ok(overview().items.every(item => item.statusLabel === 'Approved'));
assert.equal(api.getStudentRequirementStatus(student), 'Complete');

queue = [{ tracking_number: student.trackingNumber, student_number: student.id,
  first_name: 'Test', last_name: 'Student', branch_name: 'GMA', branch_code: 'GMA',
  program_name: 'Senior High School', student_status_label: 'Transferee', honor_label: 'No Honor',
  application_status: 'accepted', updated_at: '2026-11-02T00:00:00Z',
  requirement_files: requirements.map(r => ({ requirement_code: r.code, storage_path: `files/${r.code}.pdf`, storage_bucket: 'admission-requirements', mime_type: 'application/pdf' })),
}];
const fetched = await api.fetchSupabaseAdmissionApplicants('GMA');
assert.ok(fetched[0].attachments.every(a => a.reviewStatus === 'Approved'));
assert.equal(overview().summary.overallStatus, 'Complete');
// Extra or duplicate files cannot inflate the required-credential counts.
const withExtras = structuredClone(fetched[0]);
withExtras.attachments.push({ ...withExtras.attachments[0] }, { name: 'Optional extra document', url: 'https://files.example/extra.pdf', reviewStatus: 'Approved' });
api.writeBranchScopedData('enrollees', 'GMA', [withExtras], { skipSupabaseSync: true });
assert.equal(overview().summary.approved, requirements.length);
assert.equal(overview().summary.overallStatus, 'Complete');

cache = adminBrowser;
await review(requirements[0].name, 'Rejected');
cache = studentBrowser;
await api.fetchStudentCredentialReviewDecisions(pending, 'GMA');
assert.equal(overview().summary.overallStatus, 'Needs Reupload');
assert.equal(api.getStudentRequirementStatus(student), 'Incomplete');

// A decision belongs to one upload. A replacement must go through review again.
const replacement = structuredClone(pending);
replacement.attachments[0].storagePath = 'files/replacement.pdf';
const staleApproved = { ...pending, attachments: pending.attachments.map(a => ({ ...a, reviewStatus: 'Approved' })) };
const merged = api.mergeAdminEnrolleeRecords([replacement], [staleApproved]);
api.writeBranchScopedData('enrollees', 'GMA', merged, { skipSupabaseSync: true });
await api.fetchStudentCredentialReviewDecisions(merged[0], 'GMA');
assert.equal(overview().items[0].statusLabel, 'Under Review');
assert.equal(api.getStudentRequirementStatus(student), 'Incomplete');

await api.syncStudentCredentialUpload({ ...identity, requirementName: requirements[0].name,
  storagePath: 'files/admin-upload.pdf', mimeType: 'application/pdf', reviewStatus: 'Approved' });
assert.equal(overview().items[0].statusLabel, 'Approved');
const uploadedRecord = structuredClone(overview().applicantRecord);
cache = new Map();
api.writeStoredStudents([student]);
api.writeBranchScopedData('enrollees', 'GMA', [{ ...uploadedRecord,
  attachments: uploadedRecord.attachments.map(a => ({ ...a, reviewStatus: 'Pending' })) }], { skipSupabaseSync: true });
await api.fetchStudentCredentialReviewDecisions(uploadedRecord, 'GMA');
assert.equal(overview().items[0].statusLabel, 'Approved');

// Branch isolation and network failures are explicit, never false approvals.
const isolated = await api.fetchStudentCredentialReviewDecisions(pending, 'Taytay');
assert.ok(isolated.attachments.every(a => a.reviewStatus === 'Pending'));
failLoad = true;
await assert.rejects(api.fetchStudentCredentialReviewDecisions(pending, 'GMA'), /Load failed/);
console.log('Credential review checks passed: durable approvals, separate browsers, stale snapshots, completion, rejection, replacement uploads, lifecycle preservation, branch isolation, and save/load failures.');
