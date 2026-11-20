import { useEffect, useMemo, useState } from "react";
import { FaFileAlt, FaUsers } from "react-icons/fa";
import { FiMenu, FiX } from "react-icons/fi";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdmissionPortalAccessCard from "../../components/common/AdmissionPortalAccessCard";
import StudentProgramDistribution, {
  type ProgramDistributionItem,
} from "../../components/common/StudentProgramDistribution";
import { useAuth } from "../../hooks/useAuth";
import { getStudentsForBranch, normalizeBranchName } from "../../services/adminStorage";
import { fetchAdminStudents } from "../../services/adminStudentsApi";
import "../../styles/admin/admin-dashboard.css";

interface StudentRecord {
  program: string;
  status: "Complete" | "Incomplete" | "Archived" | "Graduated";
  strandOrCourse?: string;
  shsTrackType?: string;
  branch?: string;
}

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
  const { currentUser } = useAuth();
  const currentBranch = normalizeBranchName(currentUser?.branch);

  const [studentDirectory, setStudentDirectory] = useState<{
    branch: string;
    students: StudentRecord[];
  }>(() => ({ branch: currentBranch, students: getStudentsForBranch(currentBranch) }));

  useEffect(() => {
    let cancelled = false;
    void fetchAdminStudents(currentBranch)
      .then((students) => {
        if (!cancelled) setStudentDirectory({ branch: currentBranch, students });
      })
      .catch((error) => console.warn("Unable to load dashboard students.", error));
    return () => { cancelled = true; };
  }, [currentBranch]);

  const activeStudents = useMemo(
    () => (studentDirectory.branch === currentBranch ? studentDirectory.students : []).filter(
        (student) =>
          student.status !== "Archived" && student.status !== "Graduated",
      ),
    [currentBranch, studentDirectory],
  );

  const totalStudents = activeStudents.length;
  const completeRequirements = activeStudents.filter((student) => student.status === "Complete").length;
  const incompleteRequirements = activeStudents.filter((student) => student.status === "Incomplete").length;

  const programData = useMemo<ProgramDistributionItem[]>(() => {
    const counts = new Map<
      string,
      { count: number; academicLevel: ProgramDistributionItem["academicLevel"] }
    >();

    activeStudents.forEach((student) => {
      const normalizedProgram = (student.program || "").trim();
      let categoryName = normalizedProgram || "Others";
      let academicLevel: ProgramDistributionItem["academicLevel"] = "Other";

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
  }, [activeStudents]);

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
          <p>Asian Institute of Computer Studies - {currentBranch} Branch</p>
        </header>

        <AdmissionPortalAccessCard />

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

        <StudentProgramDistribution
          programs={programData}
          totalStudents={totalStudents}
        />
      </main>
    </div>
  );
}
