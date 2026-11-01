import "../../styles/components/table-pagination.css";

interface TablePaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  label?: string;
}

export default function TablePagination({ page, pageSize, totalItems, onPageChange, disabled = false, label = "Table pages" }: TablePaginationProps) {
  if (totalItems === 0) return null;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <nav className="app-table-pagination" aria-label={label}>
      <button type="button" className="app-table-pagination-btn" disabled={disabled || currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>Back</button>
      <span className="app-table-pagination-summary" aria-live="polite">{start}-{end} of {totalItems}</span>
      <div className="app-table-pagination-pages">
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
          <button key={number} type="button" className={`app-table-pagination-page${number === currentPage ? " active" : ""}`} aria-label={`Page ${number}`} aria-current={number === currentPage ? "page" : undefined} disabled={disabled} onClick={() => onPageChange(number)}>{number}</button>
        ))}
      </div>
      <button type="button" className="app-table-pagination-btn" disabled={disabled || currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}>Next</button>
    </nav>
  );
}
