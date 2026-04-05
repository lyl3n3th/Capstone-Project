import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { BsSearch, BsCaretDownFill, BsCaretUpFill } from "react-icons/bs";
import "../../styles/manager/area-manageStudents.css";

interface Student {
  id: number;
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

// Mock data for testing
const MOCK_STUDENTS: Student[] = [
  {
    id: 1,
    first_name: "Kenneth Lyle",
    last_name: "Sohot",
    student_id: "20240001",
    status: "active",
    credential_status: "Completed",
    course: "BSE",
    year_level: "3rd Year",
    branch: "Taytay Branch",
    strand: "BS Entrepreneurship",
    email: "kenneth.sohot@student.edu",
    contact_no: "09123456789",
    section: "IC3DA",
    address: "Blk 1 Lot 2, Taytay, Rizal",
  },
  {
    id: 2,
    first_name: "Neil John",
    last_name: "Velasco",
    student_id: "20240002",
    status: "active",
    credential_status: "Partial Submitted",
    course: "BSE",
    year_level: "2nd Year",
    branch: "Bacoor Branch",
    strand: "BS Entrepreneurship",
    email: "neil.velasco@student.edu",
    contact_no: "09123456790",
    section: "IC2MB",
    address: "Molino Blvd, Bacoor, Cavite",
  },
  {
    id: 3,
    first_name: "Hener",
    last_name: "Verdida",
    student_id: "20240003",
    status: "active",
    credential_status: "Pending",
    course: "BSE",
    year_level: "4th Year",
    branch: "GMA Branch",
    strand: "BS Entrepreneurship",
    email: "hener.verdida@student.edu",
    contact_no: "09123456791",
    section: "IC4DA",
    address: "San Jose, GMA, Cavite",
  },
  {
    id: 4,
    first_name: "Queenie Mier",
    last_name: "Senantes",
    student_id: "20240004",
    status: "active",
    credential_status: "Completed",
    course: "SHS",
    year_level: "Grade 11",
    branch: "Taytay Branch",
    strand: "ICT",
    email: "queenie.senantes@student.edu",
    contact_no: "09123456792",
    section: "IC1DA",
    address: "Dolores, Taytay, Rizal",
  },
  {
    id: 5,
    first_name: "Dean Paul",
    last_name: "Quioyo",
    student_id: "20240005",
    status: "inactive",
    credential_status: "Partial Submitted",
    course: "SHS",
    year_level: "Grade 12",
    branch: "Bacoor Branch",
    strand: "ICT",
    email: "dean.quioyo@student.edu",
    contact_no: "09123456793",
    section: "IC2DA",
    address: "Queens Row, Bacoor, Cavite",
  },
  {
    id: 6,
    first_name: "Mark Kervin",
    last_name: "Toledo",
    student_id: "20240006",
    status: "active",
    credential_status: "Pending",
    course: "SHS",
    year_level: "Grade 11",
    branch: "GMA Branch",
    strand: "GAS",
    email: "mark.toledo@student.edu",
    contact_no: "09123456794",
    section: "GA1DA",
    address: "San Gabriel, GMA, Cavite",
  },
  {
    id: 7,
    first_name: "Don Rich",
    last_name: "Ulanday",
    student_id: "20240007",
    status: "active",
    credential_status: "Completed",
    course: "SHS",
    year_level: "Grade 12",
    branch: "Taytay Branch",
    strand: "HUMSS",
    email: "don.ulanday@student.edu",
    contact_no: "09123456795",
    section: "HU1MB",
    address: "Muzon, Taytay, Rizal",
  },
  {
    id: 8,
    first_name: "Gilbert",
    last_name: "Torres",
    student_id: "20240008",
    status: "inactive",
    credential_status: "Partial Submitted",
    course: "SHS",
    year_level: "Grade 11",
    branch: "Bacoor Branch",
    strand: "ABM",
    email: "gilbert.torres@student.edu",
    contact_no: "09123456796",
    section: "AB1DA",
    address: "Niog, Bacoor, Cavite",
  },
  {
    id: 9,
    first_name: "Jay Iverson",
    last_name: "Dela Cruz",
    student_id: "20240009",
    status: "active",
    credential_status: "Pending",
    course: "SHS",
    year_level: "Grade 12",
    branch: "GMA Branch",
    strand: "STEM",
    email: "jay.delacruz@student.edu",
    contact_no: "09123456797",
    section: "ST1MB",
    address: "Lubigan, GMA, Cavite",
  },
  {
    id: 10,
    first_name: "Christian Dave",
    last_name: "Vargas",
    student_id: "20240010",
    status: "active",
    credential_status: "Completed",
    course: "BSE",
    year_level: "1st Year",
    branch: "Taytay Branch",
    strand: "BS Entrepreneurship",
    email: "christian.vargas@student.edu",
    contact_no: "09123456798",
    section: "IC1MB",
    address: "San Juan, Taytay, Rizal",
  },
];

const USE_MOCK_DATA = true;

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
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    if (USE_MOCK_DATA) {
      setTimeout(() => {
        setStudents(MOCK_STUDENTS);
        setLoading(false);
      }, 500);
      return;
    }

    try {
      const response = await axios.get("http://127.0.0.1:8000/api/students/");
      setStudents(response.data);
    } catch (error) {
      console.error("Error fetching students:", error);
    } finally {
      setLoading(false);
    }
  };

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

  // Stats for the header
  const totalStudents = students.length;
  const activeStudents = students.filter((s) => s.status === "active").length;
  const completedCredentials = students.filter(
    (s) => s.credential_status === "Completed",
  ).length;

  const processedStudents = useMemo(() => {
    let filtered = students.filter((s) => {
      const fullName = `${s.first_name} ${s.last_name}`.toLowerCase();
      const matchesSearch =
        fullName.includes(searchTerm.toLowerCase()) ||
        s.student_id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCourse = filterCourse ? s.course === filterCourse : true;
      const matchesSection = filterSection ? s.section === filterSection : true;
      const matchesBranch = filterBranch ? s.branch === filterBranch : true;
      const matchesYear = filterYear ? s.year_level === filterYear : true;
      const matchesStrand = filterStrand ? s.strand === filterStrand : true;
      return (
        matchesSearch &&
        matchesCourse &&
        matchesSection &&
        matchesBranch &&
        matchesYear &&
        matchesStrand
      );
    });

    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        let aVal: any;
        let bVal: any;
        if (sortConfig.key === "full_name") {
          aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
          bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
        } else {
          aVal = (a[sortConfig.key as keyof Student] || "")
            .toString()
            .toLowerCase();
          bVal = (b[sortConfig.key as keyof Student] || "")
            .toString()
            .toLowerCase();
        }
        if (
          sortConfig.key === "student_id" &&
          !isNaN(Number(aVal)) &&
          !isNaN(Number(bVal))
        ) {
          return sortConfig.direction === "asc"
            ? Number(aVal) - Number(bVal)
            : Number(bVal) - Number(aVal);
        }
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
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

  if (loading)
    return <div className="am-students-loading">Loading Students...</div>;

  return (
    <div className="am-students-root">
      {/* Page Header - Outside Container */}
      <div className="am-students-page-header">
        <div className="am-students-header-title-group">
          <h1 className="am-students-page-title">Student Management</h1>
          <p className="am-students-page-description">
            Manage and monitor all student records, track credential status, and
            oversee academic progress across all branches.
          </p>
        </div>
      </div>

      {/* Stats Badges - Below Title */}
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

      {/* Main Container */}
      <div className="am-students-container">
        <div className="am-students-controls-grid">
          <div className="am-students-search-wrapper">
            <BsSearch />
            <input
              type="text"
              placeholder="Search by name or student ID..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="am-students-filters-row">
            <select
              value={filterCourse}
              onChange={(e) => {
                setFilterCourse(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Courses</option>
              {uniqueCourses.map((c) => (
                <option key={c} value={c}>
                  {c === "BSE" ? "BSE - Bachelor of Entrepreneurship" : c}
                </option>
              ))}
            </select>
            <select
              value={filterStrand}
              onChange={(e) => {
                setFilterStrand(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Strands</option>
              {uniqueStrands.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={filterSection}
              onChange={(e) => {
                setFilterSection(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Sections</option>
              {uniqueSections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={filterBranch}
              onChange={(e) => {
                setFilterBranch(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Branches</option>
              {uniqueBranches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={(e) => {
                setFilterYear(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">Year Level</option>
              {uniqueYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="am-students-results-count">
          Showing <strong>{currentStudents.length}</strong> of{" "}
          <strong>{processedStudents.length}</strong> students
        </p>

        {/* Desktop Table */}
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
                    {student.course === "BSE"
                      ? "BSE - Bachelor of Entrepreneurship"
                      : student.course}
                    {student.strand && ` (${student.strand})`}
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
            </tbody>
          </table>
        </div>

        {/* Mobile Card List */}
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
                  {student.course === "BSE"
                    ? "BSE - Entrepreneurship"
                    : student.course}
                  {student.strand && ` (${student.strand})`}
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

      {/* Student Profile Modal */}
      {selectedStudent && (
        <div
          className="am-students-modal-overlay"
          onClick={() => setSelectedStudent(null)}
        >
          <div
            className="am-students-modal-card"
            onClick={(e) => e.stopPropagation()}
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
                    className={`am-students-value-box am-students-status-${selectedStudent.status?.toLowerCase()}`}
                  >
                    {selectedStudent.status}
                  </div>
                </div>
                <div className="am-students-field">
                  <label>Credential Status</label>
                  <div
                    className={`am-students-value-box ${getCredentialStatusClass(selectedStudent.credential_status)}`}
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
                    {selectedStudent.course === "BSE"
                      ? "Bachelor of Entrepreneurship"
                      : selectedStudent.course}
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
