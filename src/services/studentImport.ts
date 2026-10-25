import * as XLSX from "xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { supabase } from "../lib/supabase";
import type { BranchOffering } from "./branchOfferings";

export const STUDENT_IMPORT_COLUMNS = [
  { key: "student_number", label: "Student Number", required: true },
  { key: "first_name", label: "First Name", required: true },
  { key: "middle_name", label: "Middle Name", required: false },
  { key: "last_name", label: "Last Name", required: true },
  { key: "sex", label: "Sex", required: true },
  { key: "birth_date", label: "Birth Date", required: true },
  { key: "civil_status", label: "Civil Status", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone_number", label: "Contact Number", required: true },
  { key: "address", label: "Address", required: true },
  { key: "guardian_name", label: "Guardian Name", required: false },
  { key: "guardian_contact", label: "Guardian Contact", required: false },
  { key: "program", label: "Educational Level", required: true },
  { key: "year_level", label: "Grade / Year Level", required: true },
  { key: "track_name", label: "Course / Strand", required: true },
  { key: "academic_year", label: "Academic Year", required: true },
  { key: "branch", label: "Branch", required: true },
  { key: "semester", label: "Semester", required: true },
  { key: "academic_standing", label: "Academic Standing", required: true },
  { key: "last_school_attended", label: "Last School Attended", required: true },
  { key: "year_completion", label: "Year Completion", required: true },
] as const;

export type StudentImportField = (typeof STUDENT_IMPORT_COLUMNS)[number]["key"];
export type StudentImportValues = Record<StudentImportField, string>;
export interface StudentImportRow {
  rowNumber: number;
  values: StudentImportValues;
  columns: Record<StudentImportField, number>;
  formulaFields: StudentImportField[];
}
export interface StudentImportError {
  rowNumber: number;
  field?: StudentImportField;
  cell: string;
  message: string;
}
export interface StudentImportDetails {
  student_number: string;
  academic_year: string;
  semester: string;
  academic_standing: "Regular" | "Irregular";
  last_school_attended?: string | null;
  year_completion?: number | null;
}
export interface StudentImportResult {
  imported_count: number;
  errors: Array<{ row_number: number; field: StudentImportField; message: string }>;
}

const normalized = (value: string) => value.trim().toLowerCase();
const headerKey = (value: string) => normalized(value).replace(/[^a-z0-9]/g, "");
export const importCell = (row: StudentImportRow, field: StudentImportField) =>
  XLSX.utils.encode_cell({ r: row.rowNumber - 1, c: row.columns[field] });

export function buildStudentImportTemplate(branch: string, offerings: BranchOffering[], studentNumberPrefix: string) {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([STUDENT_IMPORT_COLUMNS.map((column) => column.label)]);
  // Text formatting preserves school IDs, leading zeroes, and phone numbers.
  for (let row = 1; row <= 500; row += 1) {
    STUDENT_IMPORT_COLUMNS.forEach((column, index) => {
      sheet[XLSX.utils.encode_cell({ r: row, c: index })] = {
        t: "s", v: column.key === "branch" ? branch : "", z: column.key === "birth_date" ? "mm/dd/yyyy" : "@",
      };
    });
  }
  const lastColumn = XLSX.utils.encode_col(STUDENT_IMPORT_COLUMNS.length - 1);
  sheet["!ref"] = `A1:${lastColumn}501`;
  sheet["!cols"] = STUDENT_IMPORT_COLUMNS.map((column) => ({ wch: column.key === "address" || column.key === "track_name" ? 42 : 24 }));
  sheet["!autofilter"] = { ref: `A1:${lastColumn}501` };
  XLSX.utils.book_append_sheet(book, sheet, "Students");
  const instructions = [
    ["Field", "Instructions"],
    ["General", "One student per row. Import up to 500 students at a time. Keep the column headers. Sections are assigned after import."],
    ["Required fields", STUDENT_IMPORT_COLUMNS.filter((column) => column.required).map((column) => column.label).join(", ")],
    ["Optional fields", "Middle Name, Guardian Name, Guardian Contact"],
    ["Student Number", `Use ${studentNumberPrefix}- followed by exactly 6 digits, e.g. ${studentNumberPrefix}-123456. The uppercase prefix must match ${branch}. Keep the existing number; duplicates cannot be imported.`],
    ["Sex", "Male or Female"],
    ["Birth Date", "MM/DD/YYYY, e.g. 08/21/2005. Must be a real date and cannot be in the future."],
    ["Last School Attended", "Name of the student's previous school."],
    ["Year Completion", "Four-digit completion year, from 1900 through the current year."],
    ["Civil Status", "Single, Married, Widowed, or Separated"],
    ["Contact numbers", "Exactly 11 digits. Keep the leading zero. Guardian Contact is optional."],
    ["Educational Level", "SHS or College"],
    ["Grade / Year Level", "SHS: Grade 11 or Grade 12. College: 1st Year, 2nd Year, 3rd Year, or 4th Year."],
    ["Course / Strand", "Select Educational Level first, then use the dropdown for available courses/strands in this branch."],
    ["Dropdowns", "Educational Level, Grade / Year Level, Course / Strand, Semester, and Academic Standing have dropdowns for rows 2–501. Changing the educational level requires reviewing the other selections."],
    ["Academic Year", "Consecutive years in YYYY-YYYY format, e.g. 2026-2027."],
    ["Branch", `Only ${branch} students can be imported from this page.`],
    ["Semester", "1st Semester or 2nd Semester. College also supports Summer."],
    ["Academic Standing", "Regular or Irregular"],
    ["Existing records", "Import creates new enrolled student records. It never overwrites existing students or marks credentials as submitted."],
    ["Blank rows", "Rows with only the prefilled Branch value are ignored. Paste values, not formulas."],
  ];
  const guide = XLSX.utils.aoa_to_sheet(instructions);
  guide["!cols"] = [{ wch: 25 }, { wch: 115 }];
  XLSX.utils.book_append_sheet(book, guide, "Instructions");
  const options = XLSX.utils.aoa_to_sheet([
    ["Branch", "Educational Level", "Course / Strand"],
    ...offerings.map((offering) => [branch, offering.program_name === "College" ? "College" : "SHS", offering.track_name]),
  ]);
  options["!cols"] = [{ wch: 24 }, { wch: 22 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(book, options, "Branch Offerings");
  return book;
}

// SheetJS CE does not write data validation. Add standard Excel validation XML
// to the generated workbook, using named ranges so long course names work.
export function buildStudentImportTemplateFile(branch: string, offerings: BranchOffering[], studentNumberPrefix: string): Uint8Array {
  const book = buildStudentImportTemplate(branch, offerings, studentNumberPrefix);
  const lists = [
    { name: "ImportLevels", values: ["SHS", "College"].filter((level) => offerings.some((item) => item.program_name === (level === "SHS" ? "Senior High School" : "College"))) },
    { name: "ImportSHSYears", values: ["Grade 11", "Grade 12"] },
    { name: "ImportCollegeYears", values: ["1st Year", "2nd Year", "3rd Year", "4th Year"] },
    { name: "ImportSHSTracks", values: offerings.filter((item) => item.program_name === "Senior High School").map((item) => item.track_name) },
    { name: "ImportCollegeTracks", values: offerings.filter((item) => item.program_name === "College").map((item) => item.track_name) },
    { name: "ImportSHSSemesters", values: ["1st Semester", "2nd Semester"] },
    { name: "ImportCollegeSemesters", values: ["1st Semester", "2nd Semester", "Summer"] },
    { name: "ImportStandings", values: ["Regular", "Irregular"] },
    { name: "ImportBlank", values: [""] },
  ];
  const options: XLSX.WorkSheet = {};
  lists.forEach((list, col) => {
    [list.name, ...list.values].forEach((value, row) => { options[XLSX.utils.encode_cell({ r: row, c: col })] = { t: "s", v: value }; });
  });
  options["!ref"] = `A1:I${Math.max(...lists.map((list) => list.values.length), 1) + 1}`;
  XLSX.utils.book_append_sheet(book, options, "Dropdown Options");
  book.Workbook = { ...book.Workbook, Sheets: book.SheetNames.map((name) => ({ name, Hidden: name === "Dropdown Options" ? 1 : 0 })),
    Names: lists.map((list, col) => ({ Name: list.name,
      Ref: `'Dropdown Options'!$${XLSX.utils.encode_col(col)}$2:$${XLSX.utils.encode_col(col)}$${Math.max(list.values.length, 1) + 1}` })) };
  const files = unzipSync(new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" })));
  const column = (field: StudentImportField) => XLSX.utils.encode_col(STUDENT_IMPORT_COLUMNS.findIndex((item) => item.key === field));
  const level = `$${column("program")}2`;
  const dependent = (shs: string, college: string) => `INDIRECT(IF(${level}="SHS","${shs}",IF(${level}="College","${college}","ImportBlank")))`;
  const rules: Array<[StudentImportField, string]> = [
    ["program", "ImportLevels"], ["year_level", dependent("ImportSHSYears", "ImportCollegeYears")],
    ["track_name", dependent("ImportSHSTracks", "ImportCollegeTracks")],
    ["semester", dependent("ImportSHSSemesters", "ImportCollegeSemesters")], ["academic_standing", "ImportStandings"],
  ];
  const validations = `<dataValidations count="${rules.length}">${rules.map(([field, formula]) =>
    `<dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1" errorStyle="stop" errorTitle="Choose a listed value" error="Use the dropdown for this field." sqref="${column(field)}2:${column(field)}501"><formula1>${formula.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</formula1></dataValidation>`).join("")}</dataValidations>`;
  const path = "xl/worksheets/sheet1.xml";
  files[path] = strToU8(strFromU8(files[path]).replace(/(?=<(?:ignoredErrors|pageMargins|pageSetup|headerFooter|drawing|legacyDrawing|extLst)\b|<\/worksheet>)/, validations));
  return zipSync(files);
}

export function studentImportBirthDateToIso(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : "";
}

export function parseStudentImportWorkbook(book: XLSX.WorkBook): { rows: StudentImportRow[]; errors: StudentImportError[] } {
  const sheet = book.Sheets.Students;
  if (!sheet) throw new Error('The workbook needs a "Students" sheet. Please use the downloadable template.');
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  if (range.e.r > 10000 || range.e.c > 99) throw new Error("The worksheet is too large. Use the template and remove unused rows and columns.");
  const columns = {} as Record<StudentImportField, number>;
  const errors: StudentImportError[] = [];
  const seen = new Set<StudentImportField>();
  for (let col = 0; col <= range.e.c; col += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
    const text = String(cell?.v ?? "").trim();
    if (!text) continue;
    const match = STUDENT_IMPORT_COLUMNS.find((column) => headerKey(column.label) === headerKey(text));
    if (!match || seen.has(match.key) || cell?.f) {
      errors.push({ rowNumber: 1, cell: XLSX.utils.encode_cell({ r: 0, c: col }), message: !match ? `Unexpected column "${text}". Use the template; sections must be assigned after import.` : `Duplicate or formula header: ${text}.` });
    } else { columns[match.key] = col; seen.add(match.key); }
  }
  STUDENT_IMPORT_COLUMNS.forEach((column, index) => {
    if (!seen.has(column.key)) errors.push({ rowNumber: 1, cell: XLSX.utils.encode_cell({ r: 0, c: index }), message: `Missing column: ${column.label}.` });
  });
  if (errors.length) return { rows: [], errors };
  const rows: StudentImportRow[] = [];
  for (let row = 1; row <= range.e.r; row += 1) {
    const values = {} as StudentImportValues;
    const formulaFields: StudentImportField[] = [];
    STUDENT_IMPORT_COLUMNS.forEach(({ key }) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: columns[key] })];
      if (cell?.f) formulaFields.push(key);
      let value = cell?.v;
      if (key === "birth_date" && value instanceof Date) value = `${String(value.getUTCMonth() + 1).padStart(2, "0")}/${String(value.getUTCDate()).padStart(2, "0")}/${value.getUTCFullYear()}`;
      else if (key === "birth_date" && typeof value === "number") {
        const date = XLSX.SSF.parse_date_code(value, { date1904: Boolean(book.Workbook?.WBProps?.date1904) });
        value = date ? `${String(date.m).padStart(2, "0")}/${String(date.d).padStart(2, "0")}/${date.y}` : String(value);
      }
      values[key] = String(value ?? "").trim();
    });
    if (STUDENT_IMPORT_COLUMNS.some(({ key }) => key !== "branch" && values[key]) || formulaFields.length) {
      rows.push({ rowNumber: row + 1, values, columns, formulaFields });
    }
  }
  if (rows.length > 500) throw new Error("Import up to 500 students at a time. Split this workbook into smaller batches.");
  if (!rows.length) throw new Error("The Students sheet has no student records. Fill in the template before uploading.");
  return { rows, errors: [] };
}

export function matchingImportOffering(values: StudentImportValues, offerings: BranchOffering[]) {
  const program = normalized(values.program) === "college" ? "College" : "Senior High School";
  const matches = offerings.filter((offering) => offering.program_name === program &&
    [offering.track_name, offering.track_name.split(/\s+-\s+/)[0]].some((name) => normalized(name) === normalized(values.track_name)));
  return matches.length === 1 ? matches[0] : undefined;
}

export function validateStudentImportRows(rows: StudentImportRow[], context: {
  branch: string; studentNumberPrefix: string; offerings: BranchOffering[]; existing: Array<{ id: string; email: string }>;
  today?: string;
}): StudentImportError[] {
  const errors: StudentImportError[] = [];
  const counts = { student_number: new Map<string, number>(), email: new Map<string, number>() };
  const existing = { student_number: new Set(context.existing.map((student) => normalized(student.id))),
    email: new Set(context.existing.map((student) => normalized(student.email))) };
  for (const row of rows) for (const field of ["student_number", "email"] as const) {
    const value = normalized(row.values[field]);
    counts[field].set(value, (counts[field].get(value) ?? 0) + 1);
  }
  const today = context.today ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  for (const row of rows) {
    const v = row.values;
    const invalid = new Set<StudentImportField>();
    const add = (field: StudentImportField, message: string) => {
      if (!invalid.has(field)) errors.push({ rowNumber: row.rowNumber, field, cell: importCell(row, field), message });
      invalid.add(field);
    };
    STUDENT_IMPORT_COLUMNS.forEach((column) => {
      if (column.required && !v[column.key].trim()) add(column.key, `${column.label} is required.`);
      if (v[column.key].length > (column.key === "address" ? 500 : 160)) add(column.key, "Value is too long.");
      if (row.formulaFields.includes(column.key)) add(column.key, "Formulas are not supported. Enter a value instead.");
    });
    if (v.student_number && (!/^[A-Z]{3}-[0-9]{6}$/.test(v.student_number.trim()) ||
      v.student_number.trim().slice(0, 3) !== context.studentNumberPrefix)) {
      add("student_number", `Use ${context.studentNumberPrefix}- followed by exactly 6 digits (e.g. ${context.studentNumberPrefix}-123456). The prefix must match ${context.branch}.`);
    }
    for (const field of ["student_number", "email"] as const) {
      if (v[field] && (counts[field].get(normalized(v[field])) ?? 0) > 1) add(field, "Duplicate value in this workbook.");
      if (v[field] && existing[field].has(normalized(v[field]))) add(field, "Already belongs to a student in the system. Import cannot overwrite existing records.");
    }
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) add("email", "Enter a valid email address.");
    for (const field of ["phone_number", "guardian_contact"] as const) if (v[field] && !/^[0-9]{11}$/.test(v[field])) add(field, "Enter exactly 11 digits, including the leading zero.");
    if (v.sex && !["male", "female"].includes(normalized(v.sex))) add("sex", "Choose Male or Female.");
    if (v.civil_status && !["single", "married", "widowed", "separated"].includes(normalized(v.civil_status))) add("civil_status", "Choose Single, Married, Widowed, or Separated.");
    const isoDate = studentImportBirthDateToIso(v.birth_date);
    const date = new Date(`${isoDate}T00:00:00Z`);
    if (v.birth_date && (!isoDate || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate || isoDate > today)) add("birth_date", "Use a valid date in MM/DD/YYYY format, no later than today.");
    if (v.year_completion && (!/^\d{4}$/.test(v.year_completion) || Number(v.year_completion) < 1900 || Number(v.year_completion) > Number(today.slice(0, 4)))) add("year_completion", "Enter a four-digit completion year from 1900 through the current year.");
    const program = normalized(v.program);
    if (v.program && !["college", "shs"].includes(program)) add("program", "Choose SHS or College.");
    const years = program === "shs" ? ["Grade 11", "Grade 12"] : ["1st Year", "2nd Year", "3rd Year", "4th Year"];
    if (v.year_level && !years.some((year) => normalized(year) === normalized(v.year_level))) add("year_level", `Choose ${years.join(", ")}.`);
    if (v.branch && normalized(v.branch) !== normalized(context.branch) && !context.offerings.some((offering) => normalized(offering.branch_code) === normalized(v.branch))) add("branch", `This import is for ${context.branch} only.`);
    if (v.track_name && !matchingImportOffering(v, context.offerings)) add("track_name", "Choose a course/strand offered by this branch. Use its full name from the template.");
    if (v.academic_year && (!/^\d{4}-\d{4}$/.test(v.academic_year) || Number(v.academic_year.slice(5)) !== Number(v.academic_year.slice(0, 4)) + 1)) add("academic_year", "Use consecutive academic years, e.g. 2026-2027.");
    if (v.semester && !(program === "shs" ? ["1st semester", "2nd semester"] : ["1st semester", "2nd semester", "summer"]).includes(normalized(v.semester))) add("semester", "Choose 1st Semester or 2nd Semester. Summer is for College only.");
    if (v.academic_standing && !["regular", "irregular"].includes(normalized(v.academic_standing))) add("academic_standing", "Choose Regular or Irregular.");
  }
  return errors;
}

export async function importExistingStudents(branch: string, rows: StudentImportRow[], offerings: BranchOffering[]): Promise<StudentImportResult> {
  const { data, error } = await supabase.rpc("import_existing_students", {
    p_branch: branch,
    p_rows: rows.map((row) => ({ ...row.values, row_number: row.rowNumber,
      birth_date: studentImportBirthDateToIso(row.values.birth_date),
      track_name: matchingImportOffering(row.values, offerings)?.track_name ?? row.values.track_name })),
  });
  if (error) throw new Error(error.message);
  const result = data as unknown as StudentImportResult;
  if (!result || !Array.isArray(result.errors) || typeof result.imported_count !== "number") throw new Error("The server returned an invalid import result. Refresh the student list before trying again.");
  return result;
}

export async function fetchStudentImportDetails(branch?: string): Promise<StudentImportDetails[]> {
  const { data, error } = await supabase.rpc("list_student_import_details", { p_branch: branch || null }).returns<StudentImportDetails[]>();
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}
