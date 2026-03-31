import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  FaSearch,
  FaEye,
  FaUserGraduate,
  FaCalendarAlt,
  FaGraduationCap,
  FaPhone,
  FaEnvelope,
} from "react-icons/fa";
import { ToastContainer } from "../../components/common/Toast";
import AdminSidebar from "../../components/admin/AdminSidebar";
import "../../styles/admin/admin-alumni.css";

interface AlumniProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface AlumniStudent {
  recordId?: number;
  id: string;
  fullName: string;
  program: string;
  yearGraduated: string;
  contact: string;
  becameAlumniOn: string;
}

interface StudentRecord {
  recordId?: number;
  id: string;
  name: string;
  program: string;
  yearLevel: string;
  strandOrCourse?: string;
  contact: string;
  email: string;
  status?: "Complete" | "Incomplete" | "Archived" | "Graduated";
}

interface ApiAlumni {
  id: number;
  student_id: string;
  full_name: string;
  program: string;
  year_graduated: string;
  contact: string;
  became_alumni_on: string;
}

interface ApiStudent {
  id: number;
  student_id: string;
  full_name: string;
  program: string;
  year_level: string;
  strand_or_course?: string | null;
  contact?: string | null;
  email: string;
  status: string;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const ALUMNI_API_URL = `${API_BASE_URL}/api/alumni/`;
const STUDENTS_API_URL = `${API_BASE_URL}/api/students/`;

export default function AdminAlumni({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: AlumniProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const displayName = loggedInUsername.trim() || "Administrator";
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingAlumni, setViewingAlumni] = useState<AlumniStudent | null>(
    null,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [alumni, setAlumni] = useState<AlumniStudent[]>([]);

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

  const mapApiAlumniToUi = (apiAlumni: ApiAlumni): AlumniStudent => ({
    recordId: apiAlumni.id,
    id: apiAlumni.student_id,
    fullName: apiAlumni.full_name,
    program: apiAlumni.program,
    yearGraduated: apiAlumni.year_graduated || "",
    contact: apiAlumni.contact || "",
    becameAlumniOn: apiAlumni.became_alumni_on || "",
  });

  const mapApiStudentToUi = (apiStudent: ApiStudent): StudentRecord => ({
    recordId: apiStudent.id,
    id: apiStudent.student_id,
    name: apiStudent.full_name,
    program: apiStudent.program,
    yearLevel: apiStudent.year_level,
    strandOrCourse: apiStudent.strand_or_course || "",
    contact: apiStudent.contact || "",
    email: apiStudent.email,
    status:
      apiStudent.status === "Inactive"
        ? "Archived"
        : (apiStudent.status as StudentRecord["status"]),
  });

  const loadPaginated = async <T,>(url: string): Promise<T[]> => {
    const collected: T[] = [];
    let nextPageUrl: string | null = url;

    while (nextPageUrl) {
      const response = await fetch(nextPageUrl);
      if (!response.ok) {
        throw new Error(`Request failed: ${nextPageUrl}`);
      }

      const payload = await response.json();
      if (Array.isArray(payload)) {
        collected.push(...payload);
        nextPageUrl = null;
      } else {
        const results = Array.isArray(payload.results) ? payload.results : [];
        collected.push(...results);
        nextPageUrl =
          typeof payload.next === "string" && payload.next
            ? payload.next
            : null;
      }
    }

    return collected;
  };

  const loadAlumniAndStudents = async () => {
    setIsLoading(true);

    try {
      const [apiAlumni, apiStudents] = await Promise.all([
        loadPaginated<ApiAlumni>(ALUMNI_API_URL),
        loadPaginated<ApiStudent>(STUDENTS_API_URL),
      ]);

      setAlumni(apiAlumni.map(mapApiAlumniToUi));
      setStudents(apiStudents.map(mapApiStudentToUi));
    } catch (error) {
      console.error("Failed to load alumni data", error);
      addToast("Unable to load alumni from backend.", "error");
      setAlumni([]);
      setStudents([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAlumniAndStudents();
  }, []);

  const handleSidebarToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  const filteredAlumni = alumni.filter((alum) => {
    const matchesSearch =
      alum.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alum.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesYear =
      selectedYear === "" || alum.yearGraduated === selectedYear;

    return matchesSearch && matchesYear;
  });

  const sortedAlumni = [...filteredAlumni].sort((left, right) => {
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
  });

  const ITEMS_PER_PAGE = 15;
  const totalPages = Math.max(
    1,
    Math.ceil(sortedAlumni.length / ITEMS_PER_PAGE),
  );
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedAlumni = sortedAlumni.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  const toggleIdSort = () => {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedYear]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const availableStudents = students.filter(
    (student) =>
      student.status !== "Archived" &&
      student.status !== "Graduated" &&
      !alumni.some((alum) => alum.id === student.id),
  );

  const handleAddFromStudent = async (student: StudentRecord) => {
    try {
      const createResponse = await fetch(ALUMNI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          student_id: student.id,
          full_name: student.name,
          program: student.strandOrCourse || student.program,
          year_graduated: "",
          contact: student.contact || "",
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        const firstError = Object.values(errorData).find((value) =>
          Array.isArray(value),
        ) as string[] | undefined;
        throw new Error(firstError?.[0] || "Failed to add alumni record.");
      }

      if (student.recordId) {
        await fetch(`${STUDENTS_API_URL}${student.recordId}/`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "Graduated" }),
        });
      }

      await loadAlumniAndStudents();
      setIsAddModalOpen(false);
      addToast(`${student.name} added to alumni successfully!`, "success");
    } catch (error) {
      console.error("Failed to add alumni from student", error);
      addToast(
        error instanceof Error ? error.message : "Unable to add alumni record.",
        "error",
      );
    }
  };

  const availableYears = Array.from(
    new Set(alumni.map((alum) => alum.yearGraduated)),
  ).sort((a, b) => Number(b) - Number(a));

  const openViewModal = (alumniStudent: AlumniStudent) => {
    setViewingAlumni(alumniStudent);
  };

  const closeViewModal = () => {
    setViewingAlumni(null);
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

      {/* Main content */}
      <main className="alumni-content">
        <header className="page-header">
          <h1>Alumni</h1>
          <p>
            {isLoading
              ? "Loading alumni from backend..."
              : "View and manage alumni records from all programs"}
          </p>
        </header>

        {/* Controls: Search + Year Filter + Add */}
        <div className="controls">
          <div className="search-wrapper">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search by Name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <select
            className="year-filter"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            <option value="">All Years</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <button className="add-btn" onClick={() => setIsAddModalOpen(true)}>
            + Add Alumni
          </button>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="alumni-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="alumni-table-sort-btn"
                    onClick={toggleIdSort}
                  >
                    STUDENT ID {sortDirection === "asc" ? "↑" : "↓"}
                  </button>
                </th>
                <th>FULL NAME</th>
                <th>PROGRAM</th>
                <th>YEAR GRADUATED</th>
                <th>CONTACT</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAlumni.length > 0 ? (
                paginatedAlumni.map((alum) => (
                  <tr key={alum.id}>
                    <td>{alum.id}</td>
                    <td className="full-name-cell">{alum.fullName}</td>
                    <td>{alum.program}</td>
                    <td>{alum.yearGraduated || "—"}</td>
                    <td>{alum.contact || "—"}</td>
                    <td>
                      <button
                        className="view-btn"
                        type="button"
                        onClick={() => openViewModal(alum)}
                      >
                        <FaEye /> View Details
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="no-results">
                    {isLoading
                      ? "Loading alumni..."
                      : "No alumni records found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredAlumni.length > 0 && (
          <div className="archive-pagination">
            <button
              className="pagination-btn prev-btn"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              title="Previous page"
              aria-label="Previous page"
            >
              ‹
            </button>

            <div className="pagination-info">
              <span>{startIndex + 1}</span>
              <span>–</span>
              <span>
                {Math.min(startIndex + ITEMS_PER_PAGE, filteredAlumni.length)}
              </span>
              <span>of</span>
              <span>{filteredAlumni.length}</span>
            </div>

            <div className="pagination-pages">
              {Array.from({ length: totalPages }, (_, index) => {
                const pageNumber = index + 1;
                return (
                  <button
                    key={pageNumber}
                    className={`pagination-page ${currentPage === pageNumber ? "active" : ""}`}
                    onClick={() => setCurrentPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                );
              })}
            </div>

            <button
              className="pagination-btn next-btn"
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              title="Next page"
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        )}

        {/* Add Alumni Modal */}
        {isAddModalOpen && (
          <div className="modal-overlay">
            <div className="modal student-picker-modal">
              <div className="modal-header">
                <h2>
                  <FaUserGraduate /> Select Student to Add
                </h2>
                <button
                  className="modal-close"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className="modal-table-container">
                <table className="alumni-table">
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Course/Strand</th>
                      <th>Grade Year</th>
                      <th>Email</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableStudents.length > 0 ? (
                      availableStudents.map((student) => (
                        <tr key={student.id}>
                          <td>{student.id}</td>
                          <td className="full-name-cell">{student.name}</td>
                          <td>{student.strandOrCourse || student.program}</td>
                          <td>{student.yearLevel}</td>
                          <td>{student.email}</td>
                          <td>
                            <button
                              className="save-btn"
                              type="button"
                              onClick={() => handleAddFromStudent(student)}
                            >
                              Add
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="no-results">
                          No available students to add.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Alumni Modal */}
        {viewingAlumni && (
          <div className="modal-overlay">
            <div className="modal view-modal">
              <div className="modal-header">
                <h2>
                  <FaGraduationCap /> Alumni Details
                </h2>
                <button className="modal-close" onClick={closeViewModal}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                <div className="detail-item">
                  <span className="detail-label">Student ID:</span>
                  <span className="detail-value">{viewingAlumni.id}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Full Name:</span>
                  <span className="detail-value">{viewingAlumni.fullName}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Program:</span>
                  <span className="detail-value">{viewingAlumni.program}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Year Graduated:</span>
                  <span className="detail-value">
                    {viewingAlumni.yearGraduated || "Not set"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Contact Number:</span>
                  <span className="detail-value">
                    {viewingAlumni.contact || "Not provided"}
                  </span>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={closeViewModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
