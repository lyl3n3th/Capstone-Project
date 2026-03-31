import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { FaTrash, FaUndo, FaSearch } from "react-icons/fa";
import { ToastContainer } from "../../components/common/Toast";
import AdminSidebar from "../../components/admin/AdminSidebar";
import "../../styles/admin/admin-trash.css";

interface ArchiveProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface Student {
  recordId?: number;
  id: string;
  name: string;
  program: string;
  yearLevel: string;
  documentSubmitted: string;
  contact: string;
  email: string;
  address: string;
  status: "Complete" | "Incomplete" | "Archived";
}

interface ApiStudent {
  id: number;
  student_id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  full_name?: string;
  email: string;
  program: string;
  year_level: string;
  contact?: string | null;
  phone?: string | null;
  address?: string | null;
  status: string;
  document_submitted_date?: string | null;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const STUDENTS_API_URL = `${API_BASE_URL}/api/students/`;

const ITEMS_PER_PAGE = 10;

export default function AdminTrash({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: ArchiveProps) {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProgram, setFilterProgram] = useState("All Programs");
  const [filterYearLevel, setFilterYearLevel] = useState("All Year Levels");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const displayName = loggedInUsername.trim() || "Administrator";

  // Toast functions
  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const handleSidebarToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  const mapApiStatusToUiStatus = (status: string): Student["status"] => {
    if (status === "Inactive") return "Archived";
    if (status === "Complete") return "Complete";
    return "Incomplete";
  };

  const mapApiStudentToStudent = (apiStudent: ApiStudent): Student => {
    const fullName = (
      apiStudent.full_name ||
      `${apiStudent.first_name || ""} ${apiStudent.middle_name || ""} ${apiStudent.last_name || ""}`
    )
      .trim()
      .replace(/\s+/g, " ");

    return {
      recordId: apiStudent.id,
      id: apiStudent.student_id,
      name: fullName,
      program: apiStudent.program || "",
      yearLevel: apiStudent.year_level || "",
      documentSubmitted: apiStudent.document_submitted_date || "",
      contact: apiStudent.contact || apiStudent.phone || "",
      email: apiStudent.email || "",
      address: apiStudent.address || "",
      status: mapApiStatusToUiStatus(apiStudent.status),
    };
  };

  const loadArchivedStudents = async () => {
    setIsLoading(true);

    try {
      const fetchedStudents: ApiStudent[] = [];
      let nextPageUrl: string | null = `${STUDENTS_API_URL}?status=Inactive`;

      while (nextPageUrl) {
        const response = await fetch(nextPageUrl);

        if (!response.ok) {
          throw new Error("Failed to load archived students from backend.");
        }

        const payload = await response.json();

        if (Array.isArray(payload)) {
          fetchedStudents.push(...payload);
          nextPageUrl = null;
        } else {
          const results = Array.isArray(payload.results) ? payload.results : [];
          fetchedStudents.push(...results);
          nextPageUrl =
            typeof payload.next === "string" && payload.next
              ? payload.next
              : null;
        }
      }

      setStudents(fetchedStudents.map(mapApiStudentToStudent));
    } catch (error) {
      console.error("Failed to load archived students", error);
      addToast("Unable to load Trash records from backend.", "error");
      setStudents([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadArchivedStudents();
  }, []);

  const archivedStudents = students.filter(
    (student) => student.status === "Archived",
  );

  const availablePrograms = useMemo(() => {
    return Array.from(
      new Set(archivedStudents.map((student) => student.program)),
    ).sort();
  }, [archivedStudents]);

  const availableYearLevels = useMemo(() => {
    return Array.from(
      new Set(archivedStudents.map((student) => student.yearLevel)),
    ).sort();
  }, [archivedStudents]);

  const filteredArchivedStudents = archivedStudents.filter((student) => {
    const searchValue = searchTerm.toLowerCase().trim();
    const matchesSearch =
      searchValue === "" ||
      student.name.toLowerCase().includes(searchValue) ||
      student.id.toLowerCase().includes(searchValue) ||
      student.contact.toLowerCase().includes(searchValue) ||
      student.program.toLowerCase().includes(searchValue);

    const matchesProgram =
      filterProgram === "All Programs" || student.program === filterProgram;

    const matchesYearLevel =
      filterYearLevel === "All Year Levels" ||
      student.yearLevel === filterYearLevel;

    return matchesSearch && matchesProgram && matchesYearLevel;
  });

  const sortedArchivedStudents = [...filteredArchivedStudents].sort(
    (left, right) => {
      const leftNumber = Number(left.id);
      const rightNumber = Number(right.id);

      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return sortDirection === "asc"
          ? leftNumber - rightNumber
          : rightNumber - leftNumber;
      }

      const leftValue = left.id.toLowerCase();
      const rightValue = right.id.toLowerCase();

      if (leftValue < rightValue) return sortDirection === "asc" ? -1 : 1;
      if (leftValue > rightValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    },
  );

  const toggleIdSort = () => {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(sortedArchivedStudents.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedStudents = sortedArchivedStudents.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePageSelect = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const handleUnarchive = async (student: Student) => {
    if (!student.recordId) {
      addToast(
        "Unable to restore this record because it is not linked to backend.",
        "error",
      );
      return;
    }

    try {
      const response = await fetch(`${STUDENTS_API_URL}${student.recordId}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "Incomplete" }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.detail || "Failed to restore student.");
      }

      await loadArchivedStudents();
      addToast(`${student.name} has been restored successfully.`, "success");
    } catch (error) {
      console.error("Failed to restore student", error);
      addToast(
        error instanceof Error ? error.message : "Unable to restore student.",
        "error",
      );
    }
  };

  const handleDelete = async (student: Student) => {
    const confirmed = window.confirm(
      `Delete ${student.name} permanently? This action cannot be undone.`,
    );
    if (!confirmed) return;

    if (!student.recordId) {
      addToast(
        "Unable to delete this record because it is not linked to backend.",
        "error",
      );
      return;
    }

    try {
      const response = await fetch(`${STUDENTS_API_URL}${student.recordId}/`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.detail || "Failed to delete student.");
      }

      await loadArchivedStudents();
      addToast(`${student.name} has been permanently deleted.`, "success");
    } catch (error) {
      console.error("Failed to delete student", error);
      addToast(
        error instanceof Error ? error.message : "Unable to delete student.",
        "error",
      );
    }
  };

  return (
    <div className="dashboard-layout">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <AdminSidebar
        isOpen={isSidebarOpen}
        onClose={handleSidebarClose}
        onLogout={onLogout}
        loggedInUsername={loggedInUsername}
        loggedInRole={loggedInRole}
        canAccessBackup={canAccessBackup}
      />

      <button
        className="menu-toggle"
        onClick={handleSidebarToggle}
        aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
      >
        {isSidebarOpen ? "✕" : "☰"}
      </button>

      <main className="archive-content">
        <header className="page-header">
          <h1>Trash</h1>
          <p>
            {isLoading
              ? "Loading archived students from backend..."
              : "All students that were archived from the Students module appear here."}
          </p>
        </header>

        <div className="archive-controls">
          <div className="search-wrapper">
            <FaSearch className="search-icon" />
            <input
              type="text"
              className="archive-search"
              placeholder="Search by Name, ID, Contact, Program..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <select
            className="archive-filter"
            value={filterProgram}
            onChange={(e) => {
              setFilterProgram(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option>All Programs</option>
            {availablePrograms.map((program) => (
              <option key={program} value={program}>
                {program}
              </option>
            ))}
          </select>

          <select
            className="archive-filter"
            value={filterYearLevel}
            onChange={(e) => {
              setFilterYearLevel(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option>All Year Levels</option>
            {availableYearLevels.map((yearLevel) => (
              <option key={yearLevel} value={yearLevel}>
                {yearLevel}
              </option>
            ))}
          </select>
        </div>

        <div className="archive-table-wrap">
          <table className="archive-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="archive-table-sort-btn"
                    onClick={toggleIdSort}
                  >
                    Student ID {sortDirection === "asc" ? "↑" : "↓"}
                  </button>
                </th>
                <th>Name</th>
                <th>Program</th>
                <th>Year Level</th>
                <th>Contact</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStudents.length > 0 ? (
                paginatedStudents.map((student) => (
                  <tr key={student.id}>
                    <td className="student-id-cell">{student.id}</td>
                    <td className="student-name-cell">{student.name}</td>
                    <td>{student.program}</td>
                    <td>{student.yearLevel}</td>
                    <td>{student.contact || "—"}</td>
                    <td>
                      <div className="archive-actions">
                        <button
                          type="button"
                          className="unarchive-btn"
                          onClick={() => handleUnarchive(student)}
                        >
                          <FaUndo /> Restore
                        </button>
                        <button
                          type="button"
                          className="delete-btn"
                          onClick={() => handleDelete(student)}
                        >
                          <FaTrash /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="no-archive">
                    {isLoading
                      ? "Loading archived students..."
                      : archivedStudents.length > 0
                        ? "No archived students match the selected filters."
                        : "No archived students yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredArchivedStudents.length > 0 && (
          <div className="archive-pagination">
            <button
              className="pagination-btn prev-btn"
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              title="Previous page"
              aria-label="Previous page"
            >
              ‹
            </button>

            <div className="pagination-info">
              <span>{startIndex + 1}</span>
              <span>–</span>
              <span>{Math.min(endIndex, filteredArchivedStudents.length)}</span>
              <span>of</span>
              <span>{filteredArchivedStudents.length}</span>
            </div>

            <div className="pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (pageNumber) => (
                  <button
                    key={pageNumber}
                    className={`pagination-page ${pageNumber === currentPage ? "active" : ""}`}
                    onClick={() => handlePageSelect(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ),
              )}
            </div>

            <button
              className="pagination-btn next-btn"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              title="Next page"
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
