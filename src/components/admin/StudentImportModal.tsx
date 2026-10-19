import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { fetchBranchOfferings, type BranchOffering } from "../../services/branchOfferings";
import { fetchAdminStudents } from "../../services/adminStudentsApi";
import {
  buildStudentImportTemplateFile, importCell, importExistingStudents,
  parseStudentImportWorkbook, STUDENT_IMPORT_COLUMNS, validateStudentImportRows,
  type StudentImportError, type StudentImportField, type StudentImportRow,
} from "../../services/studentImport";
import "../../styles/admin/student-import.css";

interface Props { branch: string; onClose: () => void; onImported: () => Promise<void> }

export default function StudentImportModal({ branch, onClose, onImported }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [offerings, setOfferings] = useState<BranchOffering[]>([]);
  const [existing, setExisting] = useState<Array<{ id: string; email: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<StudentImportRow[]>([]);
  const [fileErrors, setFileErrors] = useState<StudentImportError[]>([]);
  const [serverErrors, setServerErrors] = useState<StudentImportError[]>([]);
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [completed, setCompleted] = useState(0);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [page, setPage] = useState(0);
  const busy = importing || reading;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchBranchOfferings(branch), fetchAdminStudents(branch)])
      .then(([available, students]) => {
        if (cancelled) return;
        setOfferings(available); setExisting(students); setReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Unable to load branch records. Close this window and try again.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [branch]);

  const localErrors = useMemo(() => validateStudentImportRows(rows, { branch, offerings, existing }), [rows, branch, offerings, existing]);
  const errors = completed ? [] : [...fileErrors, ...localErrors, ...serverErrors];
  const errorRows = new Set(errors.map((error) => error.rowNumber));
  const visible = errorsOnly ? rows.filter((row) => errorRows.has(row.rowNumber)) : rows;
  const pageCount = Math.max(1, Math.ceil(visible.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const displayed = visible.slice(currentPage * 25, currentPage * 25 + 25);
  const validCount = rows.filter((row) => !errorRows.has(row.rowNumber)).length;

  const change = (rowNumber: number, field: StudentImportField, value: string) => {
    setRows((current) => current.map((row) => row.rowNumber === rowNumber ? {
      ...row, values: { ...row.values, [field]: value }, formulaFields: row.formulaFields.filter((item) => item !== field),
    } : row));
    setServerErrors([]); setMessage("");
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setMessage(""); setFileErrors([]); setServerErrors([]); setRows([]);
    setCompleted(0); setPage(0); setErrorsOnly(false); setFileName(file.name);
    if (!/\.xlsx?$/i.test(file.name)) { setMessage("Upload an Excel .xlsx or .xls file using the student template."); return; }
    if (file.size > 10 * 1024 * 1024) { setMessage("The file must be no larger than 10 MB."); return; }
    setReading(true);
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const parsed = parseStudentImportWorkbook(book);
      setRows(parsed.rows); setFileErrors(parsed.errors);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to read this workbook."); }
    finally { setReading(false); }
  };

  const importRows = async () => {
    if (!ready || busy || completed || !rows.length || errors.length) return;
    setImporting(true); setMessage(""); setServerErrors([]);
    try {
      const result = await importExistingStudents(branch, rows, offerings);
      if (result.errors.length) {
        setServerErrors(result.errors.map((error) => {
          const row = rows.find((item) => item.rowNumber === error.row_number);
          return { rowNumber: error.row_number, field: error.field,
            cell: row ? importCell(row, error.field) : `Row ${error.row_number}`, message: error.message };
        }));
        setErrorsOnly(true); setPage(0);
        setMessage("No students were imported. Correct the highlighted errors and try again.");
        return;
      }
      if (result.imported_count !== rows.length) throw new Error("The import result could not be confirmed. Refresh the student list before trying again.");
      setCompleted(result.imported_count);
      setExisting((items) => [...items, ...rows.map((row) => ({ id: row.values.student_number, email: row.values.email }))]);
      try { await onImported(); }
      catch { setMessage("The import succeeded. Refresh the Students page to load the new records."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed. Please try again."); }
    finally { setImporting(false); }
  };

  const focusError = (error: StudentImportError) => {
    const index = rows.findIndex((row) => row.rowNumber === error.rowNumber);
    if (index < 0) return;
    setErrorsOnly(false); setPage(Math.floor(index / 25));
    requestAnimationFrame(() => document.getElementById(`student-import-${error.cell}`)?.focus());
  };

  return createPortal(
    <div className="student-import-overlay">
      <div ref={dialog} className="student-import-modal" role="dialog" aria-modal="true" aria-labelledby="student-import-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); }
          if (event.key === "Tab") {
            const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []);
            const first = elements[0], last = elements[elements.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <header className="student-import-header">
          <div><h2 id="student-import-title">Import Existing Students</h2><p>{branch} branch · Sections will be left unassigned.</p></div>
          <button ref={closeButton} type="button" onClick={onClose} disabled={busy} aria-label="Close student import">×</button>
        </header>
        <div className="student-import-body" aria-busy={busy || loading}>
          <div className="student-import-steps">
            <div><strong>1. Download the template</strong><p>Fill in the Students sheet. Instructions and this branch’s available courses/strands are included.</p>
              <button type="button" disabled={loading || !ready || busy} onClick={() => {
                const bytes = buildStudentImportTemplateFile(branch, offerings);
                const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
                const link = document.createElement("a"); link.href = url;
                link.download = `student_import_${branch.replace(/[^a-z0-9]/gi, "_")}.xlsx`;
                link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}>Download Template</button></div>
            <div><strong>2. Upload and review</strong><p>Up to 500 students per file. Keep existing student numbers. Birthdays use MM/DD/YYYY; phone numbers need 11 digits.</p>
              <label className="student-import-file-label">Choose Excel file
                <input type="file" accept=".xlsx,.xls" disabled={loading || !ready || busy} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
              </label>
            </div>
          </div>
          {loading && <p role="status">Loading branch offerings and existing student records...</p>}
          {ready && !offerings.length && <p className="student-import-alert">No courses or strands are configured for this branch. Ask the Area Manager to add offerings before importing students.</p>}
          {message && <p className="student-import-alert" role="alert">{message}</p>}
          {completed > 0 && <p className="student-import-success" role="status">{completed} student(s) imported successfully. Their sections are blank and ready for assignment.</p>}
          {fileName && <p className="student-import-filename">File: {fileName}</p>}
          {reading && <p role="status">Reading workbook...</p>}
          {rows.length > 0 && !completed && <div className="student-import-summary">
            <strong>{rows.length} student(s)</strong><span>{validCount} ready</span><span>{errors.length} error(s)</span>
            <label><input type="checkbox" checked={errorsOnly} onChange={(event) => { setErrorsOnly(event.target.checked); setPage(0); }} disabled={busy} /> Show error rows only</label>
          </div>}
          {errors.length > 0 && <div className="student-import-errors" role="region" aria-label="Import errors">
            <strong>Correct these cells before importing</strong>
            <ul>{errors.slice(0, 100).map((error, index) => <li key={`${error.cell}-${index}`}><button type="button" onClick={() => focusError(error)}>{error.cell}</button> — {error.message}</li>)}</ul>
            {errors.length > 100 && <p>Showing the first 100 errors. All affected cells are highlighted in the table.</p>}
            <button type="button" onClick={() => {
              const book = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(errors.map((error) => ({ Row: error.rowNumber, Cell: error.cell,
                Column: STUDENT_IMPORT_COLUMNS.find((column) => column.key === error.field)?.label || "Header", Error: error.message }))), "Errors");
              XLSX.writeFile(book, "student_import_errors.xlsx");
            }}>Download Error Report</button>
          </div>}
          {rows.length > 0 && !completed && <>
            <p className="student-import-hint">Edit cells below or correct the Excel file and upload it again. Nothing is saved until every row is valid.</p>
            <div className="student-import-table-wrap" tabIndex={0} aria-label="Editable student import preview">
              <table className="student-import-table"><thead><tr><th>Excel Row</th>{STUDENT_IMPORT_COLUMNS.map((column) => <th key={column.key}>{column.label}{column.required ? " *" : ""}</th>)}<th>Action</th></tr></thead>
                <tbody>{displayed.map((row) => <tr key={row.rowNumber}><th scope="row">{row.rowNumber}</th>
                  {STUDENT_IMPORT_COLUMNS.map((column) => {
                    const cell = importCell(row, column.key);
                    const issue = errors.find((error) => error.rowNumber === row.rowNumber && error.field === column.key);
                    return <td key={column.key} className={issue ? "student-import-invalid" : ""}>
                      <input id={`student-import-${cell}`} value={row.values[column.key]} disabled={busy}
                        aria-label={`${cell}: ${column.label}`} aria-invalid={Boolean(issue)} aria-describedby={issue ? `student-import-error-${cell}` : undefined}
                        onChange={(event) => change(row.rowNumber, column.key, event.target.value)} />
                      {issue && <small id={`student-import-error-${cell}`}>{cell}: {issue.message}</small>}
                    </td>;
                  })}
                  <td><button type="button" disabled={busy} onClick={() => { setRows((items) => items.filter((item) => item.rowNumber !== row.rowNumber)); setServerErrors([]); }}>Remove row</button></td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className="student-import-pagination"><button type="button" disabled={busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
              <span>Page {currentPage + 1} of {pageCount} · {visible.length} row(s)</span>
              <button type="button" disabled={busy || currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>
          </>}
        </div>
        <footer className="student-import-footer"><span>No existing students will be overwritten.</span>
          <button type="button" disabled={busy} onClick={onClose}>{completed ? "Done" : "Cancel"}</button>
          {!completed && <button type="button" className="student-import-confirm" disabled={!ready || busy || !rows.length || errors.length > 0 || !offerings.length} onClick={() => void importRows()}>
            {importing ? "Importing students..." : `Import ${rows.length || ""} Student${rows.length === 1 ? "" : "s"}`}
          </button>}
        </footer>
      </div>
    </div>, document.body,
  );
}
