// In-memory PostgreSQL only. Never connects to the deployed database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const fixture = JSON.parse(await readFile(new URL('./fixtures/branch-backup-schema.json', import.meta.url)));
const triggers = JSON.parse(await readFile(new URL('./fixtures/branch-backup-triggers.json', import.meta.url)));
const migration = await readFile(new URL('../supabase/migrations/20261101050332_complete_branch_backups.sql', import.meta.url), 'utf8');
const db = new PGlite();
const quote = value => `"${value.replaceAll('"', '""')}"`;
try {
  await db.exec('create role anon; create role authenticated; create role service_role; create domain citext as text; create schema auth; create table auth.users(id uuid primary key);');
  const names = [...new Set(fixture.columns.map(column => column.table))];
  for (const name of names) {
    const columns = fixture.columns.filter(column => column.table === name);
    await db.exec(`create table public.${quote(name)} (${columns.map(c => `${quote(c.name)} ${c.type}${c.notnull ? ' not null' : ''}`).join(',')});`);
  }
  for (const kind of ['PRIMARY KEY', 'UNIQUE', 'CHECK', 'FOREIGN KEY']) {
    for (const constraint of fixture.constraints.filter(c => c.definition.startsWith(kind))) {
      await db.exec(`alter table public.${quote(constraint.table)} add constraint ${quote(constraint.name)} ${constraint.definition};`);
    }
  }
  for (const trigger of triggers) await db.exec(`${trigger.function}; ${trigger.trigger};`);
  await db.exec(migration);
  let sequence = 0;
  function row(table, overrides = {}) {
    const result = {};
    for (const c of fixture.columns.filter(c => c.table === table)) {
      if (!c.notnull && c.name !== 'id') { result[c.name] = null; continue; }
      result[c.name] = c.type === 'uuid' ? randomUUID() : c.type === 'boolean' ? true
        : c.type === 'jsonb' ? {} : c.type === 'text[]' ? []
        : c.type.includes('timestamp') ? '2026-01-01T00:00:00Z' : c.type === 'date' ? '2026-01-01'
        : /int|numeric/.test(c.type) ? ++sequence : `value${++sequence}`;
    }
    return { ...result, ...overrides };
  }
  async function insert(table, values) {
    const columns = fixture.columns.filter(c => c.table === table).map(c => quote(c.name)).join(',');
    await db.query(`insert into public.${quote(table)} (${columns}) select ${columns} from jsonb_populate_recordset(null::public.${quote(table)},$1)`, [JSON.stringify([values])]);
    return values;
  }
  const program = await insert('academic_programs', row('academic_programs', { level: 'college', is_active: true }));
  const track = await insert('program_tracks', row('program_tracks', { program_id: program.id, is_active: true }));
  const status = await insert('admission_student_statuses', row('admission_student_statuses'));
  const honor = await insert('admission_honors', row('admission_honors'));
  const requirement = await insert('admission_requirement_types', row('admission_requirement_types'));
  await insert('admission_requirement_rules', row('admission_requirement_rules', {
    student_status_id: status.id, requirement_type_id: requirement.id, program_level: 'any',
  }));
  async function seedBranch(name, prefix) {
    const branch = await insert('admission_branches', row('admission_branches', { name, code: name.toLowerCase(), student_number_prefix: prefix }));
    const registry = (await db.query('select * from branch_backup_tables($1,$2) order by ordinal', [branch.id, branch.name])).rows;
    const ids = {};
    for (const entry of registry.filter(t => !t.catalog)) {
      const table = entry.table_name;
      const values = row(table, {
        branch_id: branch.id, branch: name, program_id: program.id, track_id: track.id,
        student_status_id: status.id, honor_id: honor.id, requirement_type_id: requirement.id,
        student_number: `${prefix}-00001`, academic_year: '2026-2027', semester: '1st Semester',
        program: 'College', year_level: '1st Year', sex: 'Male', civil_status: 'Single',
        completion_status: 'complete', current_step: 5, application_status: 'accepted',
        source: 'enrollment_request', enrollment_status: 'Approved', academic_standing: 'Regular',
        question_type: 'rating', year_completion: 2020, next_sequence: 42,
        start_time: '08:00', end_time: '09:00', is_deleted: false,
        own_schedule_request_status: null, own_schedule_selection_status: null,
        own_schedule_semester: null, requested_year_level: null, scholarship_exam_score: null,
        storage_bucket: 'admission-requirements', storage_path: `${branch.id}/credential.pdf`,
        program_offering_id: ids.program_offerings, subject_row_id: ids.branch_academic_subjects,
        instructor_row_id: ids.branch_academic_instructors, section_row_id: ids.branch_class_sections,
        admission_application_id: ids.admission_applications, application_id: ids.admission_applications,
        student_id: ids.student_profiles, assignment_id: ids.branch_subject_assignments,
        category_id: ids.evaluation_questionnaire_categories,
      });
      if ('status' in values) values.status = table === 'student_profiles' || table === 'student_portal_accounts' ? 'active' : 'Approved';
      if (table === 'branch_academic_subject_prerequisites') {
        const second = await insert('branch_academic_subjects', row('branch_academic_subjects', {
          branch_id: branch.id, program: 'College', semester: '1st Semester', units: 3,
        }));
        values.prerequisite_subject_row_id = second.id;
      }
      // Ignore generic overrides that do not belong to this table.
      const allowed = new Set(fixture.columns.filter(c => c.table === table).map(c => c.name));
      const filtered = Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key)));
      await insert(table, filtered);
      ids[table] = filtered.id;
    }
    return { branch, ids };
  }
  const a = await seedBranch('Bacoor', 'BAC');
  await seedBranch('Taytay', 'TAY');
  const exportBranch = async branch => (await db.query('select export_branch_backup_data($1) as snapshot', [branch])).rows[0].snapshot;
  const restore = snapshot => db.query('select restore_branch_backup_data($1,$2)', ['Bacoor', JSON.stringify(snapshot)]);
  const before = await exportBranch('Bacoor');
  const otherBefore = await exportBranch('Taytay');
  assert.equal(Object.keys(before.tables).length, 37);
  await db.query("update student_profiles set first_name='Changed' where branch_id=$1", [a.branch.id]);
  await db.query('delete from student_payments where branch_id=$1', [a.branch.id]);
  await db.query('delete from branch_student_grade_records where branch_id=$1', [a.branch.id]);
  await restore(before);
  const normalize = snapshot => Object.fromEntries(Object.entries(snapshot.tables).map(([name, rows]) => [name, rows.map(r => JSON.stringify(r)).sort()]));
  assert.deepEqual(normalize(await exportBranch('Bacoor')), normalize(before));
  assert.deepEqual(normalize(await exportBranch('Taytay')), normalize(otherBefore));
  console.log('PASS: full database recovery, grades/payments/credentials/assignments, and branch isolation');
  // Business validation triggers must allow historical records on inactive offerings.
  await db.query('update branch_track_offerings set is_active=false,is_deleted=true where branch_id=$1', [a.branch.id]);
  await db.query('update program_offerings set is_active=false where branch_id=$1', [a.branch.id]);
  await db.query('update program_tracks set is_active=false where id=$1', [track.id]);
  const inactive = await exportBranch('Bacoor');
  await restore(inactive);
  assert.deepEqual(normalize(await exportBranch('Bacoor')), normalize(inactive));
  console.log('PASS: inactive historical offerings restore without disabling triggers');
  const badBranch = structuredClone(inactive);
  badBranch.tables.student_profiles[0].branch_id = randomUUID();
  await assert.rejects(restore(badBranch), /outside the target branch/);
  const missing = structuredClone(inactive);
  delete missing.tables.student_payments;
  await assert.rejects(restore(missing), /table set/);
  const invalid = structuredClone(inactive);
  invalid.tables.student_profiles[0].sex = 'invalid';
  await assert.rejects(restore(invalid), /check constraint/);
  const invalidChild = structuredClone(inactive);
  invalidChild.tables.student_contact_details[0].student_id = otherBefore.tables.student_profiles[0].id;
  await assert.rejects(restore(invalidChild), /duplicate key|outside target branch/);
  assert.deepEqual(normalize(await exportBranch('Bacoor')), normalize(inactive));
  const grants = (await db.query("select has_function_privilege('anon','restore_branch_backup_data(text,jsonb)','execute') as anon, has_function_privilege('authenticated','restore_branch_backup_data(text,jsonb)','execute') as authenticated, has_function_privilege('service_role','restore_branch_backup_data(text,jsonb)','execute') as backend")).rows[0];
  assert.deepEqual(grants, { anon: false, authenticated: false, backend: true });
  console.log('PASS: invalid branch, missing data, failed insert rollback, child ownership, backend-only permissions');
} catch (error) {
  console.error(error.message, error.detail || "", error.where || "");
  process.exitCode = 1;
} finally {
  await db.close();
}
