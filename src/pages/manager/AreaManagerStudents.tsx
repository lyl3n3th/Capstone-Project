import React, { useEffect, useMemo, useState } from "react";
import { BsSearch, BsCaretDownFill, BsCaretUpFill } from "react-icons/bs";
import {
  getStudentCredentialOverview,
  normalizeBranchName,
  readStoredStudents,
  type StudentStorageRecord,
} from "../../services/adminStorage";
import "../../styles/manager/area-manageStudents.css";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  student_id: string;
  status: string;
  credential_status: string;
  course: string;
  year_level: string;
  branch: string;
  strand?: string;
  email?: string;
  contact_no?: string;
  section?: string;
  address?: string;
}

type SortKeys =
  | "student_id"
  | "full_name"
  | "course"
  | "section"
  | "branch"
  | "year_level"
  | "email";

const splitStoredStudentName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return {
      firstName: "Student",
      lastName: "",
    };
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "",
    };
  }

  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
  };
};

const getCredentialStatusLabel = (student: StudentStorageRecord) => {
  const credentialOverview = getStudentCredentialOverview({
    branch: student.branch,
    studentNumber: student.id,
    trackingNumber: student.trackingNumber,
  });

  if (credentialOverview) {
    if (credentialOverview.summary.rejected > 0) {
      return "Needs Reupload";
    }

    if (
      credentialOverview.summary.total > 0 &&
      credentialOverview.summary.approved === credentialOverview.summary.total
    ) {
      return "Completed";
    }

    if (credentialOverview.summary.submitted > 0) {
      return "Partial Submitted";
    }

    return "Pending";
  }

  if (student.status === "Complete") {
    return "Completed";
  }

  return "Pending";
};

const mapStoredStudentToDirectoryRow = (
  student: StudentStorageRecord,
): Student => {
  const { firstName, lastName } = splitStoredStudentName(student.name);
  const normalizedBranch = normalizeBranchName(student.branch);
  const isShsStudent = student.program === "SHS";

  return {
    id: student.id,
    first_name: firstName,
    last_name: lastName,
    student_id: student.id,
    status: student.status === "Archived" ? "inactive" : "active",
    credential_status: getCredentialStatusLabel(student),
    course: isShsStudent
      ? "SHS"
      : student.strandOrCourse || "College",
    year_level: student.yearLevel,
    branch: `${normalizedBranch} Branch`,
    strand: isShsStudent ? student.strandOrCourse || "" : undefined,
    email: student.email,
    contact_no: student.contact,
    section: student.section,
    address: student.address,
  };
};

const AreaManagerStudents: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const [filterCourse, setFilterCourse] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterStrand, setFilterStrand] = useState("");

  const [sortConfig, setSortConfig] = useState<{
    key: SortKeys;
    direction: "asc" | "desc";
  } | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const studentsPerPage = 10;

  useEffect(() => {
    const loadStudents = () => {
      setLoading(true);

      try {
        const storedStudents = readStoredStudents()
          .filter((student) => student.status !== "Archived")
          .map(mapStoredStudentToDirectoryRow);

        setStudents(storedStudents);
      } catch (error) {
        console.error("Error loading stored students:", error);
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };

    loadStudents();

    window.addEventListener("storage", loadStudents);
    window.addEventListener("focus", loadStudents);

    return () => {
      window.removeEventListener("storage", loadStudents);
      window.removeEventListener("focus", loadStudents);
    };
  }, []);

  const uniqueCourses = Array.from(
    new Set(students.map((s) => s.course)),
  ).sort();
  const uniqueSections = Array.from(
    new Set(students.map((s) => s.section).filter(Boolean)),
  ).sort();
  const uniqueBranches = Array.from(
    new Set(students.map((s) => s.branch)),
  ).sort();
  const uniqueYears = Array.from(
    new Set(students.map((s) => s.year_level)),
  ).sort();
  const uniqueStrands = Array.from(
    new Set(students.map((s) => s.strand).filter(Boolean)),
  ).sort();

  const totalStudents = students.length;
  const activeStudents = students.filter((s) => s.status === "active").length;
  const completedCredentials = students.filter(
    (s) => s.credential_status === "Completed",
  ).length;

  const processedStudents = useMemo(() => {
    const filtered = students.filter((student) => {
      const fullName =
        `${student.first_name} ${student.last_name}`.toLowerCase();
      const matchesSearch =
        fullName.includes(searchTerm.toLowerCase()) ||
        student.student_id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCourse = filterCourse ? student.course === filterCourse : true;
      const matchesSection = filterSection
        ? student.section === filterSection
        : true;
      const matchesBranch = filterBranch ? student.branch === filterBranch : true;
      const matchesYear = filterYear ? student.year_level === filterYear : true;
      const matchesStrand = filterStrand ? student.strand === filterStrand : true;

      return (
        matchesSearch &&
        matchesCourse &&
        matchesSection &&
        matchesBranch &&
        matchesYear &&
        matchesStrand
      );
    });

    if (!sortConfig) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      let leftValue: string;
      let rightValue: string;

      if (sortConfig.key === "full_name") {
        leftValue = `${left.first_name} ${left.last_name}`.toLowerCase();
        rightValue = `${right.first_name} ${right.last_name}`.toLowerCase();
      } else {
        leftValue = (left[sortConfig.key as keyof Student] || "")
          .toString()
          .toLowerCase();
        rightValue = (right[sortConfig.key as keyof Student] || "")
          .toString()
          .toLowerCase();
      }

      if (
        sortConfig.key === "student_id" &&
        !Number.isNaN(Number(leftValue)) &&
        !Number.isNaN(Number(rightValue))
      ) {
        return sortConfig.direction === "asc"
          ? Number(leftValue) - Number(rightValue)
          : Number(rightValue) - Number(leftValue);
      }

      if (leftValue < rightValue) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }

      if (leftValue > rightValue) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }

      return 0;
    });
  }, [
    students,
    searchTerm,
    filterCourse,
    filterSection,
    filterBranch,
    filterYear,
    filterStrand,
    sortConfig,
  ]);

  const requestSort = (key: SortKeys) => {
    let direction: "asc" | "desc" = "asc";

    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === "asc"
    ) {
      direction = "desc";
    }

    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: SortKeys) => {
    if (sortConfig?.key !== key) return null;
    return sortConfig.direction === "asc" ? (
      <BsCaretUpFill />
    ) : (
      <BsCaretDownFill />
    );
  };

  const getCredentialStatusClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "am-students-credential-completed";
      case "partial submitted":
        return "am-students-credential-partial";
      case "needs reupload":
        return "am-students-credential-pending";
      case "pending":
        return "am-students-credential-pending";
      default:
        return "";
    }
  };

  const indexOfLastStudent = currentPage * studentsPerPage;
  const indexOfFirstStudent = indexOfLastStudent - studentsPerPage;
  const currentStudents = processedStudents.slice(
    indexOfFirstStudent,
    indexOfLastStudent,
  );
  const totalPages = Math.ceil(processedStudents.length / studentsPerPage);

  const paginate = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    window.scrollTo(0, 0);
  };

  if (loading) {
    return <div className="am-students-loading">Loading Students...</div>;
  }

  return (
    <div className="am-students-root">
      <div className="am-students-page-header">
        <div className="am-students-header-title-group">
          <h1 className="am-students-page-title">Student Management</h1>
          <p className="am-students-page-description">
            Review the actual enrolled student records, track credential status,
            and monitor academic progress across all branches.
          </p>
        </div>
      </div>

      <div className="am-students-stats-badges">
        <div className="am-students-stat-badge">
          <span className="am-students-stat-label">Total Students</span>
          <span className="am-students-stat-value">{totalStudents}</span>
        </div>
        <div className="am-students-stat-badge">
          <span className="am-students-stat-label">Active</span>
          <span className="am-students-stat-value">{activeStudents}</span>
        </div>
        <div className="am-students-stat-badge">
          <span className="am-students-stat-label">Completed Credentials</span>
          <span className="am-students-stat-value">{completedCredentials}</span>
        </div>
      </div>

      <div className="am-students-container">
        <div className="am-students-controls-grid">
          <div className="am-students-search-wrapper">
            <BsSearch />
            <input
              type="text"
              placeholder="Search by name or student ID..."
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="am-students-filters-row">
            <select
              value={filterCourse}
              onChange={(event) => {
                setFilterCourse(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Courses</option>
              {uniqueCourses.map((course) => (
                <option key={course} value={course}>
                  {course}
                </option>
              ))}
            </select>
            <select
              value={filterStrand}
              onChange={(event) => {
                setFilterStrand(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Strands</option>
              {uniqueStrands.map((strand) => (
                <option key={strand} value={strand}>
                  {strand}
                </option>
              ))}
            </select>
            <select
              value={filterSection}
              onChange={(event) => {
                setFilterSection(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Sections</option>
              {uniqueSections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
            <select
              value={filterBranch}
              onChange={(event) => {
                setFilterBranch(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Branches</option>
              {uniqueBranches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={(event) => {
                setFilterYear(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">Year Level</option>
              {uniqueYears.map((yearLevel) => (
                <option key={yearLevel} value={yearLevel}>
                  {yearLevel}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="am-students-results-count">
          Showing <strong>{currentStudents.length}</strong> of{" "}
          <strong>{processedStudents.length}</strong> students
        </p>

        <div className="am-students-table-wrapper">
          <table className="am-students-table">
            <thead>
              <tr>
                <th
                  onClick={() => requestSort("student_id")}
                  className="am-students-sortable"
                >
                  ID {getSortIcon("student_id")}
                </th>
                <th
                  onClick={() => requestSort("full_name")}
                  className="am-students-sortable"
                >
                  Full Name {getSortIcon("full_name")}
                </th>
                <th
                  onClick={() => requestSort("course")}
                  className="am-students-sortable"
                >
                  Course/Strand {getSortIcon("course")}
                </th>
                <th
                  onClick={() => requestSort("section")}
                  className="am-students-sortable"
                >
                  Section {getSortIcon("section")}
                </th>
                <th
                  onClick={() => requestSort("branch")}
                  className="am-students-sortable"
                >
                  Branch {getSortIcon("branch")}
                </th>
                <th
                  onClick={() => requestSort("year_level")}
                  className="am-students-sortable"
                >
                  Year {getSortIcon("year_level")}
                </th>
                <th>Credential Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {currentStudents.map((student) => (
                <tr key={student.id}>
                  <td className="am-students-id-col">{student.student_id}</td>
                  <td className="am-students-name-col">
                    {student.first_name} {student.last_name}
                  </td>
                  <td className="am-students-course-col">
                    {student.course}
                    {student.strand ? ` (${student.strand})` : ""}
                  </td>
                  <td className="am-students-section-col">
                    {student.section || "N/A"}
                  </td>
                  <td className="am-students-branch-col">{student.branch}</td>
                  <td className="am-students-year-col">{student.year_level}</td>
                  <td>
                    <span
                      className={`am-students-credential-badge ${getCredentialStatusClass(student.credential_status)}`}
                    >
                      {student.credential_status || "Pending"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="am-students-view-btn"
                      onClick={() => setSelectedStudent(student)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {currentStudents.length === 0 && (
                <tr>
                  <td colSpan={8} className="am-students-empty-state">
                    No enrolled students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="am-students-card-list">
          {currentStudents.map((student) => (
            <div
              key={student.id}
              className="am-students-card"
              onClick={() => setSelectedStudent(student)}
            >
              <div className="am-students-card-top">
                <div className="am-students-card-name">
                  {student.first_name} {student.last_name}
                </div>
                <span
                  className={`am-students-card-status am-students-status-${student.status?.toLowerCase()}`}
                >
                  {student.status}
                </span>
              </div>
              <div className="am-students-card-id">
                ID: {student.student_id}
              </div>
              <div className="am-students-card-meta">
                <span className="am-students-card-badge">
                  {student.course}
                  {student.strand ? ` (${student.strand})` : ""}
                </span>
                <span className="am-students-card-badge">{student.branch}</span>
                <span className="am-students-card-badge">
                  {student.year_level}
                </span>
                {student.section && (
                  <span className="am-students-card-badge">
                    Sec {student.section}
                  </span>
                )}
              </div>
              <div
                className={`am-students-card-credential ${getCredentialStatusClass(student.credential_status)}`}
              >
                {student.credential_status || "Pending"}
              </div>
            </div>
          ))}

          {currentStudents.length === 0 && (
            <div className="am-students-empty-state">No students found.</div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="am-students-pagination">
            <button
              onClick={() => paginate(currentPage - 1)}
              disabled={currentPage === 1}
              className="am-students-page-btn"
            >
              Previous
            </button>
            <div className="am-students-page-info">
              <span>
                Page <strong>{currentPage}</strong> of {totalPages}
              </span>
            </div>
            <button
              onClick={() => paginate(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="am-students-page-btn"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {selectedStudent && (
        <div
          className="am-students-modal-overlay"
          onClick={() => setSelectedStudent(null)}
        >
          <div
            className="am-students-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="am-students-modal-header">
              <h3 className="am-students-modal-title">Student Profile</h3>
              <button
                className="am-students-modal-close"
                onClick={() => setSelectedStudent(null)}
              >
                &times;
              </button>
            </div>
            <div className="am-students-modal-body">
              <div className="am-students-info-grid">
                <div className="am-students-field full">
                  <label>Full Name</label>
                  <div className="am-students-value-box">
                    {selectedStudent.first_name} {selectedStudent.last_name}
                  </div>
                </div>
                <div className="am-students-field">
                  <label>Student ID</label>
                  <div className="am-students-value-box">
                    {selectedStudent.student_id}
                  </div>
                </div>
                <div className="am-students-field">
                  <label>Status</label>
                  <div
                    className={`am-students-value-box am-students-value-box-highlight am-students-status-${selectedStudent.status?.toLowerCase()}`}
                  >
                    {selectedStudent.status}
                  </div>
                </div>
                <div className="am-students-field">
                  <label>Credential Status</label>
                  <div
                    className={`am-students-value-box am-students-value-box-highlight ${getCredentialStatusClass(selectedStudent.credential_status)}`}
                  >
                    {selectedStudent.credential_status || "Pending"}
                  </div>
                </div>
                <div className="am-students-field">
                  <label>Branch</label>
                  <div className="am-students-value-box">
                    {selectedStudent.branch}
                  </div>
                </div>
                <div className="am-students-field">
                  <label>Course</label>
                  <div className="am-students-value-box">
                    {selectedStudent.course}
                  </div>
                </div>
                {selectedStudent.strand && (
                  <div className="am-students-field">
                    <label>Strand</label>
                    <div className="am-students-value-box">
                      {selectedStudent.strand}
                    </div>
                  </div>
                )}
                <div className="am-students-field">
                  <label>Year Level</label>
                  <div className="am-students-value-box">
                    {selectedStudent.year_level}
                  </div>
                </div>
                <div className="am-students-field">
                  <label>Section</label>
                  <div className="am-students-value-box">
                    {selectedStudent.section || "N/A"}
                  </div>
                </div>
                <div className="am-students-field full">
                  <label>Email Address</label>
                  <div className="am-students-value-box am-students-email-box">
                    {selectedStudent.email || "N/A"}
                  </div>
                </div>
                <div className="am-students-field full">
                  <label>Contact Number</label>
                  <div className="am-students-value-box">
                    {selectedStudent.contact_no || "N/A"}
                  </div>
                </div>
                <div className="am-students-field full">
                  <label>Home Address</label>
                  <div className="am-students-value-box am-students-address-box">
                    {selectedStudent.address || "No address provided"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AreaManagerStudents;
