import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the real confirmation handler with delayed persistence and email delivery.
const source = readFileSync(new URL('../src/pages/admin/AdminEnrollees.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminEnrollees.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handlerSource;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'confirmAction') handlerSource = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handlerSource);
const compiled = ts.transpileModule(`const handler = ${handlerSource};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
async function scenario(emailFails) {
  const saved = deferred();
  const saveStarted = deferred();
  const email = deferred();
  const calls = [];
  const toasts = [];
  const applicant = { id: 'applicant', trackingNumber: 'TRACK-1', program: 'College', yearLevel: '1st Year', ownScheduleRequestStatus: 'Approved', personalInfo: { email: 'test@example.invalid' }, fullName: 'Test Student', documentsSubmitted: 2, totalDocuments: 3 };
  const context = {
    selectedAction: { id: applicant.id, action: 'approve' }, selectedRejectionReason: '',
    decisionInFlight: { current: false }, isProcessing: false, modalClosed: false,
    enrollmentRequests: [], enrollees: [applicant], currentBranch: 'Bacoor', selectedRequest: null,
    isTransfereeAdmission: () => false,
    getEstimatedCollegeTuition: () => ({}), hasApprovedAttachmentNamed: () => false,
    updateAdmissionProgress: async () => { calls.push('progress'); },
    activateApprovedStudent: async () => { calls.push('activate'); return { studentNumber: 'BAC-001' }; },
    promoteApplicantToStoredStudent: record => ({ applicant: { ...record, status: 'Approved' }, student: { id: record.studentNumber, requestedOwnSchedule: true } }),
    saveAdminStudent: async () => { calls.push('save'); saveStarted.resolve(); await saved.promise; calls.push('saved'); },
    saveStudentPlanningState: async () => { throw new Error('Planning state must not be saved twice; saveAdminStudent already handles it'); },
    setIsProcessingDecision: value => { context.isProcessing = value; },
    setEnrollees: update => { context.enrollees = update(context.enrollees); },
    buildStudentPortalLoginLink: () => 'https://example.invalid/student/login',
    sendAdmissionDecisionNotification: payload => { calls.push('email'); assert.equal(payload.studentNumber, 'BAC-001'); return email.promise; },
    getApprovalNotificationFeedback: () => ({ message: 'Email sent', type: 'success' }),
    addToast: (message, type) => toasts.push({ message, type }),
    closeConfirmModal: () => { context.modalClosed = true; },
    console: { warn() {}, error() {} },
  };
  const handler = new Function('context', `with (context) { ${compiled}; return handler; }`)(context);
  const processing = handler();
  await saveStarted.promise;
  assert.equal(context.isProcessing, true);
  assert.equal(context.modalClosed, false, 'The dialog waits for student persistence');
  assert.ok(!calls.includes('email'), 'Do not notify before the student save finishes');
  await handler();
  assert.equal(calls.filter(call => call === 'activate').length, 1, 'Repeated clicks cannot activate twice');
  saved.resolve();
  await processing;
  assert.deepEqual(calls, ['progress', 'activate', 'save', 'saved', 'email']);
  assert.equal(context.modalClosed, true, 'Approval finishes while email delivery is still pending');
  assert.equal(context.isProcessing, false);
  assert.equal(context.decisionInFlight.current, false);
  assert.ok(toasts.some(toast => toast.message.startsWith('Admission approved.')));
  if (emailFails) email.reject(new Error('Mail server unavailable'));
  else email.resolve({ deliveries: { email: { status: 'sent' } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(toasts.at(-1).type, emailFails ? 'warning' : 'success');
  assert.equal(context.enrollees[0].status, 'Approved', 'Email failure cannot undo the approved student');
}
await scenario(false);
await scenario(true);
console.log('Admission approval checks passed: persistence before success, email runs separately, one planning save, immediate processing state, repeated-click protection, and email failure feedback.');
