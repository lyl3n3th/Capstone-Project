import {
  Cell,
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import ChartNote from "./ChartNote";

export interface ProgramDistributionItem {
  name: string;
  value: number;
  academicLevel: "SHS" | "College" | "Other";
}

interface StudentProgramDistributionProps {
  programs: ProgramDistributionItem[];
  totalStudents: number;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

const formatProgramLabel = (name: string) => {
  if (name === "ICT SUPPORT AND PROGRAMMING TECHNOLOGIES") {
    return "ICT Support and Programming Technologies";
  }

  return name;
};

export default function StudentProgramDistribution({
  programs,
  totalStudents,
}: StudentProgramDistributionProps) {
  const shsPrograms = programs.filter(
    (program) => program.academicLevel === "SHS",
  );
  const collegePrograms = programs.filter(
    (program) => program.academicLevel === "College",
  );
  const programColors = new Map<string, string>(
    programs.map((program, index): [string, string] => [
      program.name,
      COLORS[index % COLORS.length],
    ]),
  );

  return (
    <div className="content-grid">
      <section
        className="card pie-card"
        aria-labelledby="student-distribution-title"
      >
        <h3 id="student-distribution-title">Student Distribution by Program</h3>
        <ChartNote variant="compact">
          Each slice represents active students in a strand or course. Hover a
          slice to view the exact count, and use the center total as the
          branch-wide summary.
        </ChartNote>
        <div className="pie-container">
          {totalStudents === 0 ? (
            <div className="dashboard-empty-distribution" role="status">
              <strong className="pie-center-value">0</strong>
              <span>Active Students</span>
              <p>No students enrolled in this branch yet.</p>
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={1}
              minHeight={280}
              initialDimension={{ width: 360, height: 360 }}
            >
              <PieChart>
                <Pie
                  data={programs}
                  cx="50%"
                  cy="50%"
                  innerRadius="38%"
                  outerRadius="70%"
                  paddingAngle={5}
                  dataKey="value"
                  nameKey="name"
                >
                  <Label
                    content={({ viewBox }) => {
                      const pieViewBox = viewBox as
                        | { cx?: number; cy?: number }
                        | undefined;
                      const centerX = pieViewBox?.cx;
                      const centerY = pieViewBox?.cy;

                      if (
                        typeof centerX !== "number" ||
                        typeof centerY !== "number"
                      ) {
                        return null;
                      }

                      return (
                        <text
                          x={centerX}
                          y={centerY}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={centerX}
                            y={centerY - 6}
                            className="pie-center-value"
                          >
                            {totalStudents.toLocaleString()}
                          </tspan>
                          <tspan
                            x={centerX}
                            y={centerY + 18}
                            className="pie-center-label"
                          >
                            Active Students
                          </tspan>
                        </text>
                      );
                    }}
                  />
                  {programs.map((program) => (
                    <Cell
                      key={program.name}
                      fill={programColors.get(program.name) || COLORS[0]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div
          className="dashboard-program-legend"
          aria-label="Program distribution legend"
          role="list"
        >
          {programs.map((program) => (
            <div
              key={program.name}
              className="dashboard-program-legend-item"
              role="listitem"
            >
              <span
                className="dashboard-program-legend-swatch"
                style={{
                  backgroundColor: programColors.get(program.name) || COLORS[0],
                }}
                aria-hidden="true"
              />
              <div className="dashboard-program-legend-copy">
                <span className="dashboard-program-legend-label">
                  {formatProgramLabel(program.name)}
                </span>
                <span className="dashboard-program-legend-value">
                  {program.value} Students
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        className="card details-card"
        aria-labelledby="program-details-title"
      >
        <h3 id="program-details-title">Program Details</h3>
        <div className="program-section">
          <h4>Senior High School</h4>
          <ul>
            {shsPrograms.length > 0 ? (
              shsPrograms.map((program) => (
                <li key={program.name}>
                  <span
                    className="dot"
                    style={{
                      backgroundColor:
                        programColors.get(program.name) || COLORS[0],
                    }}
                    aria-hidden="true"
                  />
                  <span className="program-section-copy">
                    {formatProgramLabel(program.name)} - {program.value} Students
                  </span>
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
                      backgroundColor:
                        programColors.get(program.name) || COLORS[0],
                    }}
                    aria-hidden="true"
                  />
                  <span className="program-section-copy">
                    {formatProgramLabel(program.name)} - {program.value} Students
                  </span>
                </li>
              ))
            ) : (
              <li>No College records found</li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
