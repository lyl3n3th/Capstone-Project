import { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { FaFileAlt, FaUsers } from "react-icons/fa";
import { FiMenu, FiX } from "react-icons/fi";
import AdminSidebar from "../../components/admin/AdminSidebar";
import "../../styles/admin/admin-dashboard.css";

interface ProgramData {
  name: string;
  value: number;
  academicLevel: "SHS" | "College" | "Other";
}

interface StudentRecord {
  program: string;
  status: "Complete" | "Incomplete" | "Archived";
  strandOrCourse?: string;
  shsTrackType?: string;
}

const STORAGE_KEY = "aics-students";

const FALLBACK_PROGRAM_DATA: ProgramData[] = [
  { name: "STEM", value: 85, academicLevel: "SHS" },
  { name: "ICT", value: 62, academicLevel: "SHS" },
  { name: "ABM", value: 48, academicLevel: "SHS" },
  { name: "HUMSS", value: 35, academicLevel: "SHS" },
  { name: "BS Entrepreneurship", value: 20, academicLevel: "College" },
];

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

const formatProgramLabel = (name: string) => {
  if (name === "ICT SUPPORT AND PROGRAMMING TECHNOLOGIES") {
    return "ICT Support and Programming Technologies";
  }
  return name;
};

interface DashboardProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

export default function AdminDashboard({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: DashboardProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const students = useMemo<StudentRecord[]>(() => {
    const savedStudents = localStorage.getItem(STORAGE_KEY);
    if (!savedStudents) return [];

    try {
      const parsed = JSON.parse(savedStudents);
      return Array.isArray(parsed) ? (parsed as StudentRecord[]) : [];
    } catch (error) {
      console.error("Failed to load students for dashboard", error);
      return [];
    }
  }, []);

  const hasStudentData = students.length > 0;

  const activeStudents = hasStudentData
    ? students.filter((student) => student.status !== "Archived")
    : [];

  const totalStudents = hasStudentData ? activeStudents.length : 250;
  const completeRequirements = hasStudentData
    ? activeStudents.filter((student) => student.status === "Complete").length
    : 150;
  const incompleteRequirements = hasStudentData
    ? activeStudents.filter((student) => student.status === "Incomplete").length
    : 20;

  const programData = useMemo<ProgramData[]>(() => {
    if (!hasStudentData) return FALLBACK_PROGRAM_DATA;

    const counts = new Map<
      string,
      { count: number; academicLevel: ProgramData["academicLevel"] }
    >();

    activeStudents.forEach((student) => {
      const normalizedProgram = (student.program || "").trim();
      let categoryName = normalizedProgram || "Others";
      let academicLevel: ProgramData["academicLevel"] = "Other";

      if (normalizedProgram === "SHS") {
        categoryName = (
          student.strandOrCourse ||
          student.shsTrackType ||
          "SHS"
        ).trim();
        academicLevel = "SHS";
      } else if (normalizedProgram === "College") {
        categoryName = (student.strandOrCourse || "College").trim();
        academicLevel = "College";
      }

      const existing = counts.get(categoryName);
      if (existing) {
        counts.set(categoryName, { ...existing, count: existing.count + 1 });
      } else {
        counts.set(categoryName, { count: 1, academicLevel });
      }
    });

    return Array.from(counts.entries())
      .map(([name, data]) => ({
        name,
        value: data.count,
        academicLevel: data.academicLevel,
      }))
      .sort((left, right) => right.value - left.value);
  }, [activeStudents, hasStudentData]);

  const shsPrograms = programData.filter(
    (item) => item.academicLevel === "SHS",
  );
  const collegePrograms = programData.filter(
    (item) => item.academicLevel === "College",
  );

  const programColor = useMemo(() => {
    const colorMap = new Map<string, string>();
    programData.forEach((program, index) => {
      colorMap.set(program.name, COLORS[index % COLORS.length]);
    });
    return colorMap;
  }, [programData]);

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  const handleMenuToggle = () => {
    setIsSidebarOpen((previousValue) => !previousValue);
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (window.innerWidth >= 1024) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;

    if (isSidebarOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isSidebarOpen]);

  return (
    <div className="dashboard-layout">
      <AdminSidebar
        isOpen={isSidebarOpen}
        onClose={handleSidebarClose}
        onLogout={onLogout}
        loggedInUsername={loggedInUsername}
        loggedInRole={loggedInRole}
        canAccessBackup={canAccessBackup}
      />

      <button
        className="admin-menu-toggle"
        onClick={handleMenuToggle}
        aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
        type="button"
      >
        {isSidebarOpen ? <FiX /> : <FiMenu />}
      </button>

      <main className="dashboard-content">
        <header className="dashboard-header">
          <h1>Dashboard</h1>
          <p>Asian Institute of Computer Studies - Bacoor Branch</p>
        </header>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon gray">
              <FaUsers />
            </div>
            <div className="stat-info">
              <h4>Total Students</h4>
              <p className="stat-number">{totalStudents}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon green">
              <FaFileAlt />
            </div>
            <div className="stat-info">
              <h4>Complete Requirements</h4>
              <p className="stat-number">{completeRequirements}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon red">
              <FaFileAlt />
            </div>
            <div className="stat-info">
              <h4>Incomplete Requirements</h4>
              <p className="stat-number">{incompleteRequirements}</p>
            </div>
          </div>
        </div>

        <div className="content-grid">
          <div className="card pie-card">
            <h3>Student Distribution by Program</h3>
            <div className="pie-container">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={300}
              >
                <PieChart>
                  <Pie
                    data={programData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {programData.map((_entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    formatter={(value: string | number) =>
                      formatProgramLabel(String(value))
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card details-card">
            <h3>Program Details</h3>
            <div className="program-section">
              <h4>Senior High School</h4>
              <ul>
                {shsPrograms.length > 0 ? (
                  shsPrograms.map((program) => (
                    <li key={program.name}>
                      <span
                        className="dot"
                        style={{
                          backgroundColor: programColor.get(program.name),
                        }}
                      ></span>{" "}
                      {formatProgramLabel(program.name)} - {program.value}{" "}
                      Students
                    </li>
                  ))
                ) : (
                  <li>No SHS records found</li>
                )}
              </ul>
            </div>
            <div className="program-section">
              <h4>College</h4>
              <ul>
                {collegePrograms.length > 0 ? (
                  collegePrograms.map((program) => (
                    <li key={program.name}>
                      <span
                        className="dot"
                        style={{
                          backgroundColor: programColor.get(program.name),
                        }}
                      ></span>{" "}
                      {formatProgramLabel(program.name)} - {program.value}{" "}
                      Students
                    </li>
                  ))
                ) : (
                  <li>No College records found</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
