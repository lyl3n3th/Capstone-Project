import { useState, useEffect, useRef } from "react";
import { IoMenu } from "react-icons/io5";
import {
  FaDownload,
  FaFilter,
  FaCalendarAlt,
  FaGraduationCap,
} from "react-icons/fa";
import { IoDocumentText } from "react-icons/io5";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import { useStudent } from "../../contexts/StudentContext";
import { ToastContainer } from "../../components/common/Toast";
import "../../styles/main.css";

// Custom hook for toast management
const useToast = () => {
  const [toasts, setToasts] = useState<
    Array<{
      id: string;
      message: string;
      type: "success" | "error" | "info" | "warning";
    }>
  >([]);

  const addToast = (
    message: string,
    type: "success" | "error" | "info" | "warning",
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto remove after 3 seconds
    setTimeout(() => {
      removeToast(id);
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return { toasts, addToast, removeToast };
};

function StudentGrades() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState("2025-2026");
  const [selectedSemester, setSelectedSemester] = useState("1st Semester");
  const [showFilters, setShowFilters] = useState(false);
  const [filteredGrades, setFilteredGrades] = useState<any[]>([]);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { toasts, addToast, removeToast } = useToast();

  const { student } = useStudent();

  const gradesData = [
    {
      id: 1,
      subjectCode: "ENG112",
      subjectTitle: "Reading and Writing Skills",
      firstQuarter: 81,
      secondQuarter: 85,
      thirdQuarter: "-",
      fourthQuarter: "-",
      academicYear: "2025-2026",
      semester: "1st Semester",
    },
    {
      id: 2,
      subjectCode: "FIL112",
      subjectTitle:
        "Pagbabasa at Pagsusuri ng Iba't-ibang Teksto tungo sa Pananaliksik",
      firstQuarter: 79,
      secondQuarter: 88,
      thirdQuarter: "-",
      fourthQuarter: "-",
      academicYear: "2025-2026",
      semester: "1st Semester",
    },
    {
      id: 3,
      subjectCode: "NTS112",
      subjectTitle: "Physical Science",
      firstQuarter: 80,
      secondQuarter: 82,
      thirdQuarter: "-",
      fourthQuarter: "-",
      academicYear: "2025-2026",
      semester: "1st Semester",
    },
    {
      id: 4,
      subjectCode: "CP1121",
      subjectTitle: "Computer Programming 2 (.NET Technology NC III)",
      firstQuarter: 89,
      secondQuarter: 87,
      thirdQuarter: "-",
      fourthQuarter: "-",
      academicYear: "2025-2026",
      semester: "1st Semester",
    },
    {
      id: 5,
      subjectCode: "MATH112",
      subjectTitle: "General Mathematics",
      firstQuarter: 83,
      secondQuarter: 84,
      thirdQuarter: "-",
      fourthQuarter: "-",
      academicYear: "2025-2026",
      semester: "1st Semester",
    },
    {
      id: 6,
      subjectCode: "SOC112",
      subjectTitle: "Understanding Culture, Society and Politics",
      firstQuarter: 86,
      secondQuarter: 85,
      thirdQuarter: "-",
      fourthQuarter: "-",
      academicYear: "2025-2026",
      semester: "1st Semester",
    },
    {
      id: 7,
      subjectCode: "EAP112",
      subjectTitle: "English for Academic and Professional Purposes",
      firstQuarter: 86,
      secondQuarter: 85,
      thirdQuarter: "-",
      fourthQuarter: "-",
      academicYear: "2025-2026",
      semester: "1st Semester",
    },
    {
      id: 8,
      subjectCode: "PRR1",
      subjectTitle: "Practical Research 1",
      firstQuarter: 86,
      secondQuarter: 85,
      thirdQuarter: "-",
      fourthQuarter: "-",
      academicYear: "2025-2026",
      semester: "1st Semester",
    },
  ];

  const academicYears = ["2024-2025", "2025-2026", "2026-2027"];
  const semesters = ["1st Semester", "2nd Semester", "Summer"];

  const handleMenuClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sidebarOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [sidebarOpen]);

  // Filter grades
  useEffect(() => {
    const filtered = gradesData.filter(
      (grade) =>
        grade.academicYear === selectedAcademicYear &&
        grade.semester === selectedSemester,
    );
    setFilteredGrades(filtered);
  }, [selectedAcademicYear, selectedSemester]);

  const handleFilter = () => {
    setShowFilters(!showFilters);
    if (!showFilters) {
      addToast("Filter panel opened", "info");
    }
  };

  const handleGenerateReportCard = () => {
    addToast(
      `Generating Report Card for ${selectedAcademicYear} - ${selectedSemester}`,
      "info",
    );
    // Simulate report card generation
    setTimeout(() => {
      addToast("Report card generated successfully!", "success");
    }, 500);
  };

  const handleLogout = () => {
    console.log("Logging out...");
    addToast("Logging out...", "info");
  };

  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const studentData = {
    name: student?.firstName + " " + student?.lastName || "Hener C. Verdida",
    id: student?.studentNumber || "20221131",
    progrm: student?.programType || "SHS",
  };

  return (
    <div className="s-portal s-grd">
      {/* Toast Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Sidebar */}
      <div ref={sidebarRef}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={handleSidebarClose}
          activePage="grades"
          onLogout={handleLogout}
        />
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="s-overlay" onClick={handleSidebarClose}></div>
      )}

      {/* Main Content */}
      <div className="s-main s-mm">
        <Header
          title="Grades"
          onMenuClick={handleMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />

        <main className="s-content" ref={contentRef}>
          {/* Welcome Banner */}
          <div className="s-welcome-banner s-grades-banner">
            <div className="s-grades-banner-content">
              <h1>Grades</h1>
            </div>
          </div>

          {/* Controls Row */}
          <div className="s-grades-controls-row">
            <div className="s-grades-banner-subtitle">
              <span className="s-academic-year">
                <FaCalendarAlt /> {selectedAcademicYear}
              </span>
              <span className="s-semester">
                <FaGraduationCap /> {selectedSemester}
              </span>
            </div>

            <div className="s-grades-banner-actions">
              <button className="s-filter-btn" onClick={handleFilter}>
                <FaFilter /> Filter
              </button>
              <button
                className="s-generate-btn"
                onClick={handleGenerateReportCard}
              >
                <FaDownload /> Generate Report Card
              </button>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="s-filter-panel">
              <h3>Filter Grades</h3>
              <div className="s-filter-row">
                <div className="s-filter-group">
                  <label>Academic Year</label>
                  <select
                    value={selectedAcademicYear}
                    onChange={(e) => {
                      setSelectedAcademicYear(e.target.value);
                      addToast(`Filtered by ${e.target.value}`, "info");
                    }}
                    className="s-filter-select"
                  >
                    {academicYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="s-filter-group">
                  <label>Semester</label>
                  <select
                    value={selectedSemester}
                    onChange={(e) => {
                      setSelectedSemester(e.target.value);
                      addToast(`Filtered by ${e.target.value}`, "info");
                    }}
                    className="s-filter-select"
                  >
                    {semesters.map((sem) => (
                      <option key={sem} value={sem}>
                        {sem}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Notice Card */}
          <div className="s-notice-card">
            <div className="s-notice-icon">
              <IoDocumentText />
            </div>
            <div className="s-notice-content">
              <h4>Note:</h4>
              <p>
                Grades are released once per semester after all assessments have
                been reviewed and finalized. If a grade is not yet visible, it
                is still being processed.
              </p>
            </div>
          </div>

          {/* Grades Table Container - Scrollable on mobile */}
          <div className="s-grades-table-wrapper" ref={tableContainerRef}>
            <div className="s-grades-table-container">
              <table className="s-grades-table">
                <thead>
                  <tr>
                    <th>Subject Code</th>
                    <th>Subject Title</th>
                    <th>1st Quarter</th>
                    <th>2nd Quarter</th>
                    <th>3rd Quarter</th>
                    <th>4th Quarter</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGrades.length > 0 ? (
                    filteredGrades.map((grade) => (
                      <tr key={grade.id}>
                        <td className="s-subject-code">{grade.subjectCode}</td>
                        <td className="s-subject-title">
                          {grade.subjectTitle}
                        </td>
                        <td className="s-grade-value">{grade.firstQuarter}</td>
                        <td className="s-grade-value">{grade.secondQuarter}</td>
                        <td className="s-grade-value">{grade.thirdQuarter}</td>
                        <td className="s-grade-value">{grade.fourthQuarter}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="s-no-data">
                        No grades found for the selected academic year and
                        semester.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default StudentGrades;
