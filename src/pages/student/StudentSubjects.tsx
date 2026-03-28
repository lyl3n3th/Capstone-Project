import { useState, useRef, useEffect } from "react";
import { IoMenu } from "react-icons/io5";
import { FaCalendarAlt, FaGraduationCap } from "react-icons/fa";
import { FaFilter, FaDownload } from "react-icons/fa";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import { useStudent } from "../../contexts/StudentContext";
import { ToastContainer } from "../../components/common/Toast";
import "../../styles/main.css";

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

    setTimeout(() => {
      removeToast(id);
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return { toasts, addToast, removeToast };
};

interface Subject {
  id: string;
  code: string;
  title: string;
  units?: number;
  schedule: string;
  room: string;
  professor: string;
  days: string;
  time: string;
  semester: string;
  academicYear: string;
}

function StudentSubjects() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { student, subjects: allSubjects, isLoading } = useStudent();
  const [filteredSubjects, setFilteredSubjects] = useState<Subject[]>([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState("2025-2026");
  const [selectedSemester, setSelectedSemester] = useState("1st Semester");
  const [showFilters, setShowFilters] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { toasts, addToast, removeToast } = useToast();

  const isCollege =
    student?.programType === "BS" || student?.programType === "Short Course";
  const isSHS = student?.programType === "SHS";

  const academicYears = ["2024-2025", "2025-2026", "2026-2027"];

  const semesters = ["1st Semester", "2nd Semester", "Summer"];

  useEffect(() => {
    const filtered = allSubjects.filter(
      (subject) =>
        subject.academicYear === selectedAcademicYear &&
        subject.semester === selectedSemester,
    );
    setFilteredSubjects(filtered);
  }, [allSubjects, selectedAcademicYear, selectedSemester]);

  const handleMenuClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  const handleLogout = () => {
    console.log("Logging out...");
    addToast("Logging out...", "info");
  };

  const handleFilter = () => {
    setShowFilters(!showFilters);
    if (!showFilters) {
      addToast("Filter panel opened", "info");
    } else {
      addToast("Filter panel closed", "info");
    }
  };

  const handleDownloadSchedule = () => {
    let scheduleText = `CLASS SCHEDULE\n`;
    scheduleText += `${"=".repeat(50)}\n\n`;
    scheduleText += `Student: ${student?.firstName} ${student?.lastName}\n`;
    scheduleText += `Student Number: ${student?.studentNumber}\n`;
    scheduleText += `Program: ${student?.program}\n`;
    scheduleText += `Academic Year: ${selectedAcademicYear}\n`;
    scheduleText += `Semester: ${selectedSemester}\n`;
    scheduleText += `\n${"=".repeat(50)}\n\n`;

    filteredSubjects.forEach((subject, index) => {
      scheduleText += `${index + 1}. ${subject.code} - ${subject.title}\n`;
      scheduleText += `   Schedule: ${subject.schedule}\n`;
      scheduleText += `   Room: ${subject.room}\n`;
      scheduleText += `   Professor: ${subject.professor}\n`;
      if (subject.units && !isSHS) {
        scheduleText += `   Units: ${subject.units}\n`;
      }
      scheduleText += `\n`;
    });

    scheduleText += `${"=".repeat(50)}\n`;
    scheduleText += `Total Subjects: ${filteredSubjects.length}\n`;
    if (!isSHS && filteredSubjects.some((s) => s.units)) {
      const totalUnits = filteredSubjects.reduce(
        (sum, s) => sum + (s.units || 0),
        0,
      );
      scheduleText += `Total Units: ${totalUnits}\n`;
    }
    scheduleText += `\nGenerated on: ${new Date().toLocaleDateString()}\n`;

    const blob = new Blob([scheduleText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `class_schedule_${selectedAcademicYear}_${selectedSemester}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addToast("Schedule downloaded successfully!", "success");
  };

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

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [sidebarOpen]);

  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const studentData = {
    name: student?.firstName + " " + student?.lastName || "Student",
    id: student?.studentNumber || "",
    progrm: student?.programType || "SHS",
  };

  if (isLoading && !student) {
    return (
      <div className="s-portal">
        <div style={{ minHeight: "100vh" }}></div>
      </div>
    );
  }

  return (
    <div className="s-portal">
      {/* Toast Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Sidebar */}
      <div ref={sidebarRef}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={handleSidebarClose}
          activePage="subjects"
          onLogout={handleLogout}
        />
      </div>

      {sidebarOpen && (
        <div className="s-overlay" onClick={handleSidebarClose}></div>
      )}

      {/* Main Content */}
      <div className="s-main">
        <Header
          title="Current Subjects"
          onMenuClick={handleMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />

        <main className="s-content">
          {/* Welcome Banner */}
          <div className="s-welcome-banner">
            <h1>Current Subjects</h1>
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
                className="s-download-btn"
                onClick={handleDownloadSchedule}
              >
                <FaDownload /> Download Schedule
              </button>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="s-filter-panel">
              <h3>Filter Subjects</h3>
              <div className="s-filter-row">
                <div className="s-filter-group">
                  <label>Academic Year</label>
                  <select
                    value={selectedAcademicYear}
                    onChange={(e) => {
                      setSelectedAcademicYear(e.target.value);
                      addToast(
                        `Filtered by academic year: ${e.target.value}`,
                        "info",
                      );
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
                      addToast(
                        `Filtered by semester: ${e.target.value}`,
                        "info",
                      );
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

          {/* Subjects Grid */}
          <div className="s-subjects-grid">
            {filteredSubjects.length > 0 ? (
              filteredSubjects.map((subject) => (
                <div key={subject.id} className="s-subject-card">
                  <div className="s-subject-header">
                    <div className="s-subject-code">{subject.code}</div>
                    {subject.units && !isSHS && (
                      <div className="s-subject-units">
                        {subject.units} unit(s)
                      </div>
                    )}
                  </div>
                  <h3 className="s-subject-title">{subject.title}</h3>
                  <div className="s-subject-details">
                    <div className="s-subject-detail">
                      <span className="s-detail-label">Schedule:</span>
                      <span>{subject.schedule}</span>
                    </div>
                    <div className="s-subject-detail">
                      <span className="s-detail-label">Room:</span>
                      <span>{subject.room}</span>
                    </div>
                    <div className="s-subject-detail">
                      <span className="s-detail-label">Professor:</span>
                      <span>{subject.professor}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="s-no-subjects">
                <p>
                  No subjects found for the selected academic year and semester.
                </p>
              </div>
            )}
          </div>

          {/* Summary Section */}
          {filteredSubjects.length > 0 && (
            <div className="s-subjects-summary">
              <div className="s-summary-card">
                <h4>Total Subjects</h4>
                <div className="s-summary-value">{filteredSubjects.length}</div>
              </div>
              {!isSHS && filteredSubjects.some((s) => s.units) && (
                <div className="s-summary-card">
                  <h4>Total Units</h4>
                  <div className="s-summary-value">
                    {filteredSubjects.reduce(
                      (sum, s) => sum + (s.units || 0),
                      0,
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default StudentSubjects;
