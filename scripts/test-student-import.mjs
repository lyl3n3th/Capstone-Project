import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as XLSX from "xlsx";
import { strFromU8, unzipSync } from "fflate";

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL("../src/services/studentImport.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
Function("require", "module", "exports", code)((name) => name.includes("supabase") ? { supabase: {} } : require(name), module, module.exports);
const api = module.exports;
const offerings = [{ branch_code: "bacoor", branch_name: "Bacoor", program_name: "College", track_name: "BSE - Bachelor of Entrepreneurship" }];
const valid = { student_number: "BAC-001234", first_name: "Mary Ann", middle_name: "Santos", last_name: "De La Cruz", sex: "Female",
  birth_date: "02/29/2004", civil_status: "Single", email: "mary@example.test", phone_number: "09123456789", address: "123 School Road",
  guardian_name: "", guardian_contact: "", program: "College", year_level: "2nd Year", track_name: offerings[0].track_name,
  academic_year: "2026-2027", branch: "Bacoor", semester: "2nd Semester", academic_standing: "Irregular", last_school_attended: "Bacoor National High School", year_completion: "2022" };
const context = { branch: "Bacoor", studentNumberPrefix: "BAC", offerings, existing: [], today: "2026-10-19" };
function workbook(entries = [{ row: 2, values: valid }]) {
  const book = api.buildStudentImportTemplate("Bacoor", offerings, "BAC");
  for (const { row, values } of entries) api.STUDENT_IMPORT_COLUMNS.forEach(({ key }, col) => {
    book.Sheets.Students[XLSX.utils.encode_cell({ r: row - 1, c: col })] = { t: "s", v: values[key] ?? "" };
  });
  return book;
}
const roundTrip = XLSX.read(XLSX.write(workbook(), { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellDates: true });
let result = api.parseStudentImportWorkbook(roundTrip);
assert.equal(result.rows.length, 1, "Prefilled branch-only rows must be ignored");
assert.deepEqual(api.validateStudentImportRows(result.rows, context), []);
assert.equal(result.rows[0].values.student_number, "BAC-001234");
assert.equal(result.rows[0].values.phone_number, "09123456789");
assert.equal(api.STUDENT_IMPORT_COLUMNS.some((column) => column.key === "section"), false);

for (const bad of ["001234", "BAC001234", "bac-001234", "TAY-001234", "BAC-12345", "BAC-1234567", "BA-123456", "BACO-123456", "BAC_123456", "BAC/123456", "BAC-12345A", "BAC-12 456"]) {
  const parsed = api.parseStudentImportWorkbook(workbook([{ row: 2, values: { ...valid, student_number: bad } }]));
  const idError = api.validateStudentImportRows(parsed.rows, context).find(error => error.field === "student_number");
  assert(idError, bad);
  assert.equal(idError.cell, "A2");
  assert.match(idError.message, /BAC-.*6 digits/);
}
for (const [branch, prefix] of [["Bacoor", "BAC"], ["Commonwealth", "COM"], ["Taytay", "TAY"], ["GMA", "GMA"], ["Batangas", "BAT"], ["Bacoor Annex", "BAX"]]) {
  const branchOfferings = [{ ...offerings[0], branch_name: branch, branch_code: branch.toLowerCase().replaceAll(" ", "_") }];
  const parsed = api.parseStudentImportWorkbook(workbook([{ row: 2, values: { ...valid, branch, student_number: `${prefix}-000123` } }]));
  assert.deepEqual(api.validateStudentImportRows(parsed.rows, { ...context, branch, studentNumberPrefix: prefix, offerings: branchOfferings }), [], branch);
}

result = api.parseStudentImportWorkbook(workbook([{ row: 2, values: valid }, { row: 5, values: { ...valid, phone_number: "9123456789" } }]));
let errors = api.validateStudentImportRows(result.rows, context);
assert(errors.some((error) => error.cell === "A2" && /Duplicate/.test(error.message)));
assert(errors.some((error) => error.cell === "A5" && /Duplicate/.test(error.message)));
assert(errors.some((error) => error.cell === "I5" && /11 digits/.test(error.message)));

const invalid = { ...valid, birth_date: "02/29/2005", branch: "Taytay", track_name: "Unavailable course", year_level: "Grade 11", academic_year: "2026-2028", academic_standing: "Other" };
result = api.parseStudentImportWorkbook(workbook([{ row: 2, values: invalid }]));
errors = api.validateStudentImportRows(result.rows, context);
for (const field of ["birth_date", "branch", "track_name", "year_level", "academic_year", "academic_standing"]) assert(errors.some((error) => error.field === field), field);

result = api.parseStudentImportWorkbook(workbook());
errors = api.validateStudentImportRows(result.rows, { ...context, existing: [{ id: valid.student_number, email: valid.email }] });
assert(errors.some((error) => error.cell === "A2"));
assert(errors.some((error) => error.cell === "H2"));

const formula = workbook();
formula.Sheets.Students.H2.f = '"mary@example.test"';
assert(api.validateStudentImportRows(api.parseStudentImportWorkbook(formula).rows, context).some((error) => error.cell === "H2" && /Formulas/.test(error.message)));
const missing = workbook(); delete missing.Sheets.Students.A1;
assert(api.parseStudentImportWorkbook(missing).errors.some((error) => error.cell === "A1"));
const section = workbook(); section.Sheets.Students.V1 = { t: "s", v: "Section" }; section.Sheets.Students["!ref"] = "A1:V21";
assert(api.parseStudentImportWorkbook(section).errors.some((error) => error.cell === "V1"));
assert.throws(() => api.parseStudentImportWorkbook(api.buildStudentImportTemplate("Bacoor", offerings, "BAC")), /no student records/);

const reordered = workbook();
[reordered.Sheets.Students.A1, reordered.Sheets.Students.I1] = [reordered.Sheets.Students.I1, reordered.Sheets.Students.A1];
[reordered.Sheets.Students.A2, reordered.Sheets.Students.I2] = [reordered.Sheets.Students.I2, reordered.Sheets.Students.A2];
reordered.Sheets.Students.A2.v = "invalid phone";
assert(api.validateStudentImportRows(api.parseStudentImportWorkbook(reordered).rows, context).some((error) => error.field === "phone_number" && error.cell === "A2"));
reordered.Sheets.Students.I2.v = "TAY-123456";
assert(api.validateStudentImportRows(api.parseStudentImportWorkbook(reordered).rows, context).some((error) => error.field === "student_number" && error.cell === "I2"));
console.log("Student import tests passed: real Excel round-trip, original identifiers, blank sections, exact cell errors, duplicate detection, formulas, dates, branch/course validation, and reordered columns.");

const templateBytes = api.buildStudentImportTemplateFile("Bacoor", offerings, "BAC");
assert(XLSX.utils.sheet_to_json(api.buildStudentImportTemplate("Bacoor", offerings, "BAC").Sheets.Instructions, { header: 1 })
  .some(row => row[0] === "Student Number" && row[1].includes("BAC-123456") && row[1].includes("6 digits")));
const templateZip = unzipSync(templateBytes);
const sheetXml = strFromU8(templateZip["xl/worksheets/sheet1.xml"]);
const workbookXml = strFromU8(templateZip["xl/workbook.xml"]);
assert.match(sheetXml, /<dataValidations count="5">/);
for (const col of ["M", "N", "O", "R", "S"]) assert(sheetXml.includes(`sqref="${col}2:${col}501"`));
assert(sheetXml.indexOf("<dataValidations") < sheetXml.indexOf("<ignoredErrors"), "Validations must follow worksheet schema order");
for (const name of ["ImportLevels", "ImportSHSTracks", "ImportCollegeTracks", "ImportStandings"]) assert(workbookXml.includes(`name="${name}"`));
assert.match(workbookXml, /name="Dropdown Options"[^>]*state="hidden"/);
assert(sheetXml.includes('INDIRECT(IF($M2="SHS"'));
assert(strFromU8(templateZip["xl/styles.xml"]).includes('mm/dd/yyyy'));
assert.equal(api.studentImportBirthDateToIso("02/29/2004"), "2004-02-29");
assert.equal(api.studentImportBirthDateToIso("2004-02-29"), "");
for (const bad of ["02/29/2005", "13/01/2004", "01/32/2004", "10/20/2026", "2004-02-29"]) {
  const parsed = api.parseStudentImportWorkbook(workbook([{row:2, values:{...valid,birth_date:bad}}]));
  assert(api.validateStudentImportRows(parsed.rows,context).some(error=>error.cell === "F2"),bad);
}
for (const bad of ["1899", "2027", "22", "abc", ""]) {
  const parsed = api.parseStudentImportWorkbook(workbook([{row:2, values:{...valid,year_completion:bad}}]));
  assert(api.validateStudentImportRows(parsed.rows,context).some(error=>error.cell === "U2"),bad);
}
const schoolMissing = api.parseStudentImportWorkbook(workbook([{row:2,values:{...valid,last_school_attended:""}}]));
assert(api.validateStudentImportRows(schoolMissing.rows,context).some(error=>error.cell === "T2"));
const numericDate = workbook(); numericDate.Sheets.Students.F2 = {t:"n",v:38046,z:"mm/dd/yyyy"};
const parsedNumeric = api.parseStudentImportWorkbook(XLSX.read(XLSX.write(numericDate,{type:"buffer",bookType:"xlsx"}),{type:"buffer"}));
assert.equal(parsedNumeric.rows[0].values.birth_date,"02/29/2004");
const realDate = workbook();realDate.Sheets.Students.F2={t:"d",v:new Date("2004-02-29T00:00:00Z"),z:"mm/dd/yyyy"};
assert.equal(api.parseStudentImportWorkbook(realDate).rows[0].values.birth_date,"02/29/2004");
const mixedOfferings = [...offerings,{branch_code:"bacoor",branch_name:"Bacoor",program_name:"Senior High School",track_name:"ICT"}];
const mixedBytes = api.buildStudentImportTemplateFile("Bacoor",mixedOfferings,"BAC");
assert(XLSX.read(mixedBytes,{type:"array"}).Sheets["Dropdown Options"]);
console.log("Template update checks passed: real Excel dropdown XML, dependent choices, hidden named ranges, MM/DD/YYYY dates, and school history cell errors.");
