interface SummaryCategory {
  id: string;
  name: string;
  questions: { id: string; type?: string }[];
}

interface SummarySubmission {
  responses: Record<string, number | string>;
}

export function summarizeEvaluationCategory(
  submissions: SummarySubmission[],
  category: SummaryCategory,
) {
  const questions = category.questions.filter(
    (question) => (question.type || "rating") === "rating",
  );
  const counts = [0, 0, 0, 0, 0];
  for (const submission of submissions) {
    for (const question of questions) {
      const rating = submission.responses[question.id];
      if (typeof rating === "number" && Number.isInteger(rating) && rating >= 1 && rating <= 5) {
        counts[rating - 1]++;
      }
    }
  }
  const answerCount = counts.reduce((total, count) => total + count, 0);
  return {
    answerCount,
    counts,
    grade: answerCount
      ? counts.reduce((total, count, index) => total + count * (index + 1), 0) / answerCount
      : null,
  };
}

const escapeHtml = (value: string | number) => String(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildEvaluationSummaryReport({
  branch, academicYear, semester, categories, instructors,
}: {
  branch: string;
  academicYear: string;
  semester: string;
  categories: SummaryCategory[];
  instructors: { name: string; submissions: SummarySubmission[] }[];
}) {
  const ratingCategories = categories.filter((category) => category.questions.some(
    (question) => (question.type || "rating") === "rating",
  ));
  const headers = ratingCategories.map((category) =>
    `<th scope="col">${escapeHtml(category.name)}</th>`,
  ).join("");
  const rows = instructors.map((instructor) => {
    const cells = ratingCategories.map((category) => {
      const result = summarizeEvaluationCategory(instructor.submissions, category);
      const label = result.grade === null ? "-" : result.grade.toFixed(2);
      return `<td title="${result.answerCount} valid ratings">${label}</td>`;
    }).join("");
    return `<tr><th scope="row">${escapeHtml(instructor.name)}</th><td>${instructor.submissions.length}</td>${cells}</tr>`;
  }).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Evaluation Summary Report</title>
<style>
  @page { size: landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font: 12px Arial, sans-serif; color: #172b3a; margin: 24px; }
  h1 { margin: 0 0 14px; font-size: 23px; }
  p { margin: 6px 0; line-height: 1.5; }
  .legend { margin: 16px 0; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  th, td { border: 1px solid #ccd5dc; padding: 8px 6px; text-align: center; }
  thead th { background: #717d87; color: white; }
  tbody th { text-align: left; min-width: 135px; }
  tbody tr:nth-child(even) { background: #f4f7fa; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .note { margin-top: 14px; color: #526271; }
  @media print { body { margin: 0; } .table-wrap { overflow: visible; } }
</style></head><body>
<h1>Evaluation Summary Report</h1>
<p><strong>Branch:</strong> ${escapeHtml(branch)}</p>
<p><strong>Academic Year:</strong> ${escapeHtml(academicYear)} &nbsp; ${escapeHtml(semester)}</p>
<p><strong>Scope:</strong> All subjects, year levels, and sections combined for each instructor.</p>
<p class="legend"><strong>Rating Legend:</strong> 5 = Strongly Agree, 4 = Agree, 3 = Uncertain, 2 = Disagree, 1 = Strongly Disagree</p>
${ratingCategories.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Instructor</th><th scope="col">Evaluations</th>${headers}</tr></thead><tbody>${rows || `<tr><td colspan="${2 + ratingCategories.length}">No instructors available.</td></tr>`}</tbody></table></div>` : "<p>No rating questions have been configured.</p>"}
<p class="note">Each category grade is the weighted average of all valid ratings across the instructor's evaluations: sum of (rating &times; number of answers at that rating) &divide; total valid answers. Grades range from 1.00 to 5.00 and are rounded to two decimal places. Missing answers and essay questions are excluded. A dash means no valid ratings are available.</p>
<script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`;
}
