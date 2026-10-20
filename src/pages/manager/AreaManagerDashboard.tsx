import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  type ChartData,
} from "chart.js";
import { Pie, Bar } from "react-chartjs-2";
import {
  MdPeople,
  MdAssignment,
  MdSchool,
  MdAccountBalance,
} from "react-icons/md";
import {
  normalizeBranchName,
  type AdminBranchName,
  type StudentStorageRecord,
} from "../../services/adminStorage";
import { fetchInboxReports, type ReportRecord } from "../../services/reportApi";
import { useManagedStudents } from "../../hooks/useManagedStudents";
import ChartNote from "../../components/common/ChartNote";
import SkeletonPage from "../../components/common/SkeletonPage";
import "../../styles/manager/area-managerDashboard.css";
import "../../styles/manager/area-manager.css";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
);

interface AreaManagerDashboardProps {
  onLogout?: () => void;
  loggedInUsername?: string;
  loggedInRole?: string;
  canAccessBackup?: boolean;
}

interface CourseCounts {
  labels: string[];
  counts: number[];
  percentages: Record<string, number>;
}

interface DashboardBranchData {
  branch_name: string;
  total_students: number;
  course_counts: CourseCounts;
  shs_enrollees: number;
  college_enrollees: number;
  pending_reports: number;
}

interface DashboardState {
  branches: DashboardBranchData[];
  barData: ChartData<"bar", number[], string>;
  reportsCount: number;
  enrollmentStats: {
    shs: number;
    college: number;
  };
}

type PopulationRecord = {
  label: string;
  academicLevel: "SHS" | "College" | "Other";
};

const chartColors = ["#0052cc", "#4c8bf5", "#97bcff", "#c2d6ff", "#e2e8f0"];

const getAcademicLevel = (program?: string) => {
  if (program === "SHS") {
    return "SHS" as const;
  }

  if (program === "College") {
    return "College" as const;
  }

  return "Other" as const;
};

const getAcademicLabel = (program?: string, strandOrCourse?: string) => {
  const normalizedStrandOrCourse = strandOrCourse?.trim();
  const normalizedProgram = program?.trim();

  if (normalizedProgram === "SHS" || normalizedProgram === "College") {
    return normalizedStrandOrCourse || normalizedProgram;
  }

  return normalizedProgram || normalizedStrandOrCourse || "Unassigned";
};

const buildCourseCounts = (
  populationRecords: PopulationRecord[],
): CourseCounts => {
  const countsByLabel = new Map<string, number>();

  populationRecords.forEach((record) => {
    countsByLabel.set(record.label, (countsByLabel.get(record.label) || 0) + 1);
  });

  const entries = Array.from(countsByLabel.entries()).sort(
    (left, right) => right[1] - left[1],
  );
  const total = populationRecords.length;

  return {
    labels: entries.map(([label]) => label),
    counts: entries.map(([, count]) => count),
    percentages: Object.fromEntries(
      entries.map(([label, count]) => [
        label,
        total > 0 ? Math.round((count / total) * 100) : 0,
      ]),
    ),
  };
};

const buildBarChartData = (branches: DashboardBranchData[]) => ({
  labels: branches.map((branch) => branch.branch_name),
  datasets: [
    {
      label: "SHS",
      data: branches.map((branch) => branch.shs_enrollees || 0),
      backgroundColor: "#4c8bf5",
      borderRadius: 10,
    },
    {
      label: "College",
      data: branches.map((branch) => branch.college_enrollees || 0),
      backgroundColor: "#0052cc",
      borderRadius: 10,
    },
  ],
});

const buildPopulationRecordsFromStudents = (students: StudentStorageRecord[]) =>
  students
    .map((student) => ({
      label: getAcademicLabel(student.program, student.strandOrCourse),
      academicLevel: getAcademicLevel(student.program),
    }));

const getUniqueSortedBranches = (branches: string[]) =>
  Array.from(
    new Set(
      branches
        .map((branch) => normalizeBranchName(branch))
        .filter((branch) => branch.trim().length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));

const buildPendingReportCounts = (
  reports: ReportRecord[],
  branches: AdminBranchName[],
) => {
  const countsByBranch = new Map<AdminBranchName, number>(
    branches.map((branch) => [branch, 0] as const),
  );

  reports.forEach((report) => {
    if (report.is_reviewed) {
      return;
    }

    const normalizedBranch = normalizeBranchName(report.branch_name);
    if (!countsByBranch.has(normalizedBranch)) {
      return;
    }

    countsByBranch.set(
      normalizedBranch,
      (countsByBranch.get(normalizedBranch) || 0) + 1,
    );
  });

  return {
    countsByBranch,
    totalPending: Array.from(countsByBranch.values()).reduce(
      (total, count) => total + count,
      0,
    ),
  };
};

const buildDashboardState = (
  reports: ReportRecord[] = [],
  managedBranches: string[] = [],
  studentRecords: StudentStorageRecord[] = [],
): DashboardState => {
  const dashboardBranches = getUniqueSortedBranches(managedBranches);
  const pendingReportCounts = buildPendingReportCounts(
    reports,
    dashboardBranches,
  );
  const branches = dashboardBranches.map((branch) => {
    const students = studentRecords.filter((student) => normalizeBranchName(student.branch) === branch);
    const effectivePopulation = buildPopulationRecordsFromStudents(students);
    const shsEnrollees = students.filter(
      (student) => student.program === "SHS",
    ).length;
    const collegeEnrollees = students.filter(
      (student) => student.program === "College",
    ).length;
    const pendingReports = pendingReportCounts.countsByBranch.get(branch) || 0;

    return {
      branch_name: branch,
      total_students: effectivePopulation.length,
      course_counts: buildCourseCounts(effectivePopulation),
      shs_enrollees: shsEnrollees,
      college_enrollees: collegeEnrollees,
      pending_reports: pendingReports,
    };
  });

  return {
    branches,
    barData: buildBarChartData(branches),
    reportsCount: pendingReportCounts.totalPending,
    enrollmentStats: {
      shs: branches.reduce((total, branch) => total + branch.shs_enrollees, 0),
      college: branches.reduce(
        (total, branch) => total + branch.college_enrollees,
        0,
      ),
    },
  };
};

const AreaManagerDashboard = ({
  loggedInUsername = "Area Manager",
}: AreaManagerDashboardProps) => {
  const { students, branches, isLoading: loading, hasLoaded,
    error: studentLoadError, retry } = useManagedStudents();
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [reportLoadError, setReportLoadError] = useState("");
  const { branches: dashboardData, barData, reportsCount, enrollmentStats } = useMemo(
    () => buildDashboardState(reports, branches, students), [reports, branches, students],
  );

  useEffect(() => {
    let active = true;
    let request = 0;
    const loadReports = async () => {
      const currentRequest = ++request;
      try {
        const latest = await fetchInboxReports();
        if (active && currentRequest === request) {
          setReports(latest);
          setReportLoadError("");
        }
      } catch {
        if (active && currentRequest === request) setReportLoadError("Unable to refresh reports.");
      }
    };
    const sync = () => { void loadReports(); };
    sync();
    window.addEventListener("focus", sync);
    return () => {
      active = false;
      window.removeEventListener("focus", sync);
    };
  }, []);

  const totalStudentsCount = dashboardData.reduce(
    (accumulator, currentBranch) =>
      accumulator + (currentBranch.total_students || 0),
    0,
  );
  const barChartMinWidth = Math.max(900, dashboardData.length * 240);

  if (loading) {
    return (
      <SkeletonPage
        className="manager-dashboard-container"
        eyebrow="Area Manager"
        title="Dashboard"
        variant="dashboard"
      />
    );
  }

  if (studentLoadError && !hasLoaded) {
    return <div className="manager-dashboard-container" role="alert">
      <h1>Dashboard</h1>
      <p>Unable to load current student records. {studentLoadError}</p>
      <button type="button" onClick={retry}>Try Again</button>
    </div>;
  }

  return (
    <div className="manager-dashboard-container">
      <div className="dashboard-inner-flat">
        {studentLoadError && <p role="alert">
          Unable to refresh student records. Showing the last loaded records. {studentLoadError}{" "}
          <button type="button" onClick={retry}>Try Again</button>
        </p>}
        {reportLoadError && <p role="alert">{reportLoadError}</p>}
        <div className="welcome-header">
          <h1>Dashboard</h1>
          <p>
            Asian Institute of Computer Studies | Signed in as{" "}
            {loggedInUsername}
          </p>
        </div>

        <div className="kpi-row-flat">
          <div className="kpi-card">
            <div className="kpi-icon blue">
              <MdPeople size={24} />
            </div>
            <div className="kpi-info">
              <span className="kpi-label">Total Students</span>
              <h2 className="kpi-value">
                {totalStudentsCount.toLocaleString()}
              </h2>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon orange">
              <MdSchool size={24} />
            </div>
            <div className="kpi-info">
              <span className="kpi-label">SHS Enrollees</span>
              <h2 className="kpi-value">
                {enrollmentStats.shs.toLocaleString()}
              </h2>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon indigo">
              <MdAccountBalance size={24} />
            </div>
            <div className="kpi-info">
              <span className="kpi-label">College Enrollees</span>
              <h2 className="kpi-value">
                {enrollmentStats.college.toLocaleString()}
              </h2>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon green">
              <MdAssignment size={24} />
            </div>
            <div className="kpi-info">
              <span className="kpi-label">Pending Review Reports</span>
              <h2 className="kpi-value">{reportsCount}</h2>
            </div>
          </div>
        </div>

        <div className="section-header">
          <h3 className="section-title">Enrollment Breakdown by Branch</h3>
        </div>

        <div className="dashboard-card main-bar-chart">
          <ChartNote>
            Each stacked bar compares SHS and College enrollees for a branch.
            Taller columns mean higher combined enrollment, and hovering a bar
            segment shows its exact count.
          </ChartNote>
          <div className="chart-wrapper-mobile">
            {barData && (
              <div
                className="bar-chart-scroll-inner"
                style={{ minWidth: `${barChartMinWidth}px` }}
              >
                <Bar
                  data={barData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: true,
                        position: "top",
                        labels: { boxWidth: 12, font: { size: 10 } },
                      },
                      tooltip: { mode: "index", intersect: false },
                    },
                    scales: {
                      y: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { color: "#f1f5f9" },
                      },
                      x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: {
                          maxRotation: 0,
                          minRotation: 0,
                          autoSkip: false,
                        },
                      },
                    },
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="section-header">
          <h3 className="section-title">Branch Student Population</h3>
        </div>

        <div className="pie-charts-row">
          {dashboardData.length > 0 ? (
            dashboardData.map((branch, index) => {
              const labels = branch.course_counts.labels || [];
              const counts = branch.course_counts.counts || [];
              const percentages = branch.course_counts.percentages || {};
              const hasPopulationData = branch.total_students > 0;

              return (
                <div className="dashboard-card pie-item" key={index}>
                  <div className="chart-header">
                    <span className="branch-badge">{branch.branch_name}</span>
                    <span className="total-badge">
                      {branch.total_students} Students
                    </span>
                  </div>
                  <ChartNote title="Overview" variant="compact">
                    Slice size shows each strand or course share inside{" "}
                    {branch.branch_name}. The percentages beside the chart are
                    based on this branch total only.
                  </ChartNote>
                  {hasPopulationData ? (
                    <div className="chart-content-row-mobile">
                    <div className="pie-container-mobile">
                      <Pie
                        data={{
                          labels,
                          datasets: [
                            {
                              data: counts,
                              backgroundColor: chartColors,
                              borderWidth: 2,
                              borderColor: "#ffffff",
                            },
                          ],
                        }}
                        options={{
                          plugins: { legend: { display: false } },
                          maintainAspectRatio: false,
                          responsive: true,
                        }}
                      />
                    </div>
                    <div className="stats-container">
                      {labels.map((label, labelIndex) => {
                        const count = counts[labelIndex] || 0;
                        const percentage = percentages[label] || 0;

                        if (count === 0) {
                          return null;
                        }

                        return (
                          <div className="stat-compact" key={label}>
                            <span
                              className="dot"
                              style={{
                                backgroundColor:
                                  chartColors[labelIndex % chartColors.length],
                              }}
                            ></span>
                            <div className="label-group">
                              <span className="label-text">{label}</span>
                              <span className="count-subtext">
                                {count} Enrolled
                              </span>
                            </div>
                            <span className="val">{percentage}%</span>
                          </div>
                        );
                      })}
                    </div>
                    </div>
                  ) : (
                    <div className="branch-population-empty">
                      No student population data yet.
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="dashboard-empty-state">
              No branch data is available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AreaManagerDashboard;
