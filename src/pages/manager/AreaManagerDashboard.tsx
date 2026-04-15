import { useEffect, useState } from "react";
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
import axios from "axios";
import {
  MdPeople,
  MdAssignment,
  MdSchool,
  MdAccountBalance,
} from "react-icons/md";
import {
  getDefaultBranchEnrollees,
  getStudentsForBranch,
  readBranchScopedData,
  type AdminBranchName,
  type AdminEnrolleeRecord,
  type StudentStorageRecord,
} from "../../services/adminStorage";
import ChartNote from "../../components/common/ChartNote";
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

interface DashboardApiResponse {
  branches?: DashboardBranchData[];
  bar_data?: ChartData<"bar", number[], string> | null;
  reports?: unknown[];
  shs_enrollees?: number;
  college_enrollees?: number;
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

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const MANAGER_BRANCHES: AdminBranchName[] = ["Bacoor", "Taytay", "GMA"];
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
    .filter((student) => student.status !== "Archived")
    .map((student) => ({
      label: getAcademicLabel(student.program, student.strandOrCourse),
      academicLevel: getAcademicLevel(student.program),
    }));

const buildPopulationRecordsFromEnrollees = (
  enrollees: AdminEnrolleeRecord[],
) =>
  enrollees.map((enrollee) => ({
    label: getAcademicLabel(enrollee.program, enrollee.strandOrCourse),
    academicLevel: getAcademicLevel(enrollee.program),
  }));

const getBranchEnrollees = (branch: AdminBranchName) =>
  readBranchScopedData<AdminEnrolleeRecord[]>("enrollees", branch) ??
  getDefaultBranchEnrollees(branch);

const buildLocalDashboardState = (): DashboardState => {
  const branches = MANAGER_BRANCHES.map((branch) => {
    const students = getStudentsForBranch(branch);
    const enrollees = getBranchEnrollees(branch);
    const studentPopulation = buildPopulationRecordsFromStudents(students);
    const effectivePopulation =
      studentPopulation.length > 0
        ? studentPopulation
        : buildPopulationRecordsFromEnrollees(enrollees);
    const shsEnrollees = enrollees.filter(
      (enrollee) => enrollee.program === "SHS",
    ).length;
    const collegeEnrollees = enrollees.filter(
      (enrollee) => enrollee.program === "College",
    ).length;
    const pendingReports = enrollees.filter(
      (enrollee) => enrollee.status === "Pending",
    ).length;

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
    reportsCount: branches.reduce(
      (total, branch) => total + branch.pending_reports,
      0,
    ),
    enrollmentStats: {
      shs: branches.reduce((total, branch) => total + branch.shs_enrollees, 0),
      college: branches.reduce(
        (total, branch) => total + branch.college_enrollees,
        0,
      ),
    },
  };
};

const normalizeDashboardResponse = (
  responseData?: DashboardApiResponse | null,
): DashboardState | null => {
  const branches = Array.isArray(responseData?.branches)
    ? responseData.branches
    : [];

  if (branches.length === 0) {
    return null;
  }

  return {
    branches,
    barData: responseData?.bar_data || buildBarChartData(branches),
    reportsCount: Array.isArray(responseData?.reports)
      ? responseData.reports.length
      : branches.reduce(
          (total, branch) => total + (branch.pending_reports || 0),
          0,
        ),
    enrollmentStats: {
      shs:
        responseData?.shs_enrollees ??
        branches.reduce(
          (total, branch) => total + (branch.shs_enrollees || 0),
          0,
        ),
      college:
        responseData?.college_enrollees ??
        branches.reduce(
          (total, branch) => total + (branch.college_enrollees || 0),
          0,
        ),
    },
  };
};

const AreaManagerDashboard = ({
  loggedInUsername = "Area Manager",
}: AreaManagerDashboardProps) => {
  const [dashboardData, setDashboardData] = useState<DashboardBranchData[]>([]);
  const [barData, setBarData] = useState<ChartData<
    "bar",
    number[],
    string
  > | null>(null);
  const [reportsCount, setReportsCount] = useState(0);
  const [enrollmentStats, setEnrollmentStats] = useState({
    shs: 0,
    college: 0,
  });
  const [loading, setLoading] = useState(true);

  const applyDashboardState = (dashboardState: DashboardState) => {
    setDashboardData(dashboardState.branches);
    setBarData(dashboardState.barData);
    setReportsCount(dashboardState.reportsCount);
    setEnrollmentStats(dashboardState.enrollmentStats);
  };

  const fetchAllData = async () => {
    const localDashboardState = buildLocalDashboardState();

    try {
      const response = await axios.get<DashboardApiResponse>(
        `${API_BASE_URL}/api/dashboard-stats/`,
      );
      const normalizedApiData = normalizeDashboardResponse(response.data);

      applyDashboardState(normalizedApiData || localDashboardState);
    } catch (error) {
      console.error(
        "Dashboard fetch failed, falling back to locally stored data:",
        error,
      );
      applyDashboardState(localDashboardState);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAllData();
  }, []);

  const totalStudentsCount = dashboardData.reduce(
    (accumulator, currentBranch) =>
      accumulator + (currentBranch.total_students || 0),
    0,
  );
  const branchesWithPopulation = dashboardData.filter(
    (branch) => branch.total_students > 0,
  );

  if (loading) {
    return <div className="loading-screen">Loading Dashboard...</div>;
  }

  return (
    <div className="manager-dashboard-container">
      <div className="dashboard-inner-flat">
        <div className="welcome-header">
          <h1>Dashboard</h1>
          <p>
            Asian Institute of Computer Studies (Bacoor, Taytay, GMA) | Signed
            in as {loggedInUsername}
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
              <span className="kpi-label">Pending Reports</span>
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
                    x: { stacked: true, grid: { display: false } },
                  },
                }}
              />
            )}
          </div>
        </div>

        <div className="section-header">
          <h3 className="section-title">Branch Student Population</h3>
        </div>

        <div className="pie-charts-row">
          {branchesWithPopulation.length > 0 ? (
            branchesWithPopulation.map((branch, index) => {
              const labels = branch.course_counts.labels || [];
              const counts = branch.course_counts.counts || [];
              const percentages = branch.course_counts.percentages || {};

              return (
                <div className="dashboard-card pie-item" key={index}>
                  <div className="chart-header">
                    <span className="branch-badge">{branch.branch_name}</span>
                    <span className="total-badge">
                      {branch.total_students} Students
                    </span>
                  </div>
                  <ChartNote title="Branch pie guide" variant="compact">
                    Slice size shows each strand or course share inside{" "}
                    {branch.branch_name}. The percentages beside the chart are
                    based on this branch total only.
                  </ChartNote>
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
