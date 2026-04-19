import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaCalendarAlt,
  FaDownload,
  FaFilter,
  FaGraduationCap,
} from "react-icons/fa";
import { IoDocumentText } from "react-icons/io5";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import { ToastContainer } from "../../components/common/Toast";
import { useStudent } from "../../hooks/useStudent";
import type { StudentPortalSubject } from "../../services/adminStorage";
import {
  getStudentGradeRecords,
  STUDENT_GRADE_RECORDS_UPDATED_EVENT,
  type StoredStudentGradeRecord,
} from "../../services/studentGrades";
import "../../styles/main.css";

const semesterSortOrder = ["1st Semester", "2nd Semester", "Summer"];
const shsQuarterOrder = [
  "1st Quarter",
  "2nd Quarter",
  "3rd Quarter",
  "4th Quarter",
] as const;
const placeholderGrade = "-";
const studentGradeStorageKeyPrefix = "aics-admin:student-grades:";

type ShsQuarterLabel = (typeof shsQuarterOrder)[number];

interface DisplayGradeRow {
  id: string;
  subjectCode: string;
  subjectTitle: string;
  units: string;
  grade: string;
  remarks: string;
  instructor: string;
  firstQuarter: string;
  secondQuarter: string;
  thirdQuarter: string;
  fourthQuarter: string;
  status: string;
}

interface TableColumn {
  key: keyof DisplayGradeRow;
  label: string;
  cellClassName?: string;
}

const shsColumns: TableColumn[] = [
  {
    key: "subjectCode",
    label: "Subject Code",
    cellClassName: "s-subject-code",
  },
  {
    key: "subjectTitle",
    label: "Subject Title",
    cellClassName: "s-subject-title",
  },
  {
    key: "firstQuarter",
    label: "1st Quarter",
    cellClassName: "s-grade-value",
  },
  {
    key: "secondQuarter",
    label: "2nd Quarter",
    cellClassName: "s-grade-value",
  },
  {
    key: "thirdQuarter",
    label: "3rd Quarter",
    cellClassName: "s-grade-value",
  },
  {
    key: "fourthQuarter",
    label: "4th Quarter",
    cellClassName: "s-grade-value",
  },
  {
    key: "status",
    label: "Status",
    cellClassName: "s-grade-status-cell",
  },
];

const collegeColumns: TableColumn[] = [
  {
    key: "subjectCode",
    label: "Subject Code",
    cellClassName: "s-subject-code",
  },
  {
    key: "subjectTitle",
    label: "Subject Title",
    cellClassName: "s-subject-title",
  },
  {
    key: "units",
    label: "Units",
    cellClassName: "s-grade-value",
  },
  {
    key: "grade",
    label: "Grades",
    cellClassName: "s-grade-value",
  },
  {
    key: "remarks",
    label: "Remarks",
    cellClassName: "s-grade-status-cell",
  },
  {
    key: "instructor",
    label: "Instructor",
    cellClassName: "s-instructor-name",
  },
];

const sortSemesters = (semesters: string[]) =>
  [...semesters].sort((left, right) => {
    const leftIndex = semesterSortOrder.indexOf(left);
    const rightIndex = semesterSortOrder.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });

const getDefaultAcademicYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const buildSubjectKey = ({
  subjectCode,
  subjectTitle,
}: Pick<DisplayGradeRow, "subjectCode" | "subjectTitle">) =>
  `${subjectCode.trim().toUpperCase()}::${subjectTitle.trim().toUpperCase()}`;

const createBaseRow = ({
  id,
  subjectCode,
  subjectTitle,
  units,
  instructor,
}: {
  id: string;
  subjectCode: string;
  subjectTitle: string;
  units?: number | string | null;
  instructor?: string | null;
}): DisplayGradeRow => ({
  id,
  subjectCode,
  subjectTitle,
  units:
    units === null || units === undefined || units === ""
      ? placeholderGrade
      : String(units),
  grade: placeholderGrade,
  remarks: "Enrolled",
  instructor: instructor && instructor.trim() !== "" ? instructor : "TBA",
  firstQuarter: placeholderGrade,
  secondQuarter: placeholderGrade,
  thirdQuarter: placeholderGrade,
  fourthQuarter: placeholderGrade,
  status: "Enrolled",
});

const isCollegeFinalLikeRecord = (record: StoredStudentGradeRecord) => {
  const normalizedPeriod = record.gradingPeriod.trim().toLowerCase();
  const normalizedSemester = record.semester.trim().toLowerCase();

  return (
    normalizedPeriod === "overall" ||
    normalizedPeriod === "final" ||
    normalizedPeriod === normalizedSemester
  );
};

const getCollegeFinalRecordPriority = (record: StoredStudentGradeRecord) => {
  const normalizedPeriod = record.gradingPeriod.trim().toLowerCase();
  const normalizedSemester = record.semester.trim().toLowerCase();

  if (normalizedPeriod === "overall") {
    return 3;
  }

  if (normalizedPeriod === normalizedSemester) {
    return 2;
  }

  if (normalizedPeriod === "final") {
    return 1;
  }

  return 0;
};

const getCollegeDisplayedGradePriority = (record: StoredStudentGradeRecord) => {
  const normalizedPeriod = record.gradingPeriod.trim().toLowerCase();
  const normalizedSemester = record.semester.trim().toLowerCase();

  if (normalizedPeriod === "overall") {
    return 6;
  }

  if (normalizedPeriod === normalizedSemester) {
    return 5;
  }

  if (normalizedPeriod === "final") {
    return 4;
  }

  if (normalizedPeriod === "prefinal") {
    return 3;
  }

  if (normalizedPeriod === "midterm") {
    return 2;
  }

  if (normalizedPeriod === "prelim") {
    return 1;
  }

  return 0;
};

const parseUnitsValue = (value?: number | string | null) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const getCollegeTerminalRecordMap = (gradeRecords: StoredStudentGradeRecord[]) => {
  const terminalRecords = new Map<string, StoredStudentGradeRecord>();

  gradeRecords.forEach((record) => {
    if (!isCollegeFinalLikeRecord(record)) {
      return;
    }

    const key = buildSubjectKey({
      subjectCode: record.subjectCode,
      subjectTitle: record.subjectTitle,
    });
    const currentRecord = terminalRecords.get(key);

    if (
      !currentRecord ||
      getCollegeFinalRecordPriority(record) >=
        getCollegeFinalRecordPriority(currentRecord)
    ) {
      terminalRecords.set(key, record);
    }
  });

  return terminalRecords;
};

const buildCollegePerformanceSummary = (
  subjects: StudentPortalSubject[],
  gradeRecords: StoredStudentGradeRecord[],
) => {
  const subjectUnitsByKey = new Map<string, number>();
  let totalUnitsEarned = 0;
  let weightedGradeTotal = 0;
  let weightedGradeUnits = 0;

  subjects.forEach((subject) => {
    const parsedUnits = parseUnitsValue(subject.units);

    if (parsedUnits === null) {
      return;
    }

    subjectUnitsByKey.set(
      buildSubjectKey({
        subjectCode: subject.code,
        subjectTitle: subject.title,
      }),
      parsedUnits,
    );
  });

  getCollegeTerminalRecordMap(gradeRecords).forEach((record, key) => {
    const resolvedUnits =
      parseUnitsValue(record.units) ?? subjectUnitsByKey.get(key) ?? null;

    if (resolvedUnits === null) {
      return;
    }

    if (record.evaluation === "Passed") {
      totalUnitsEarned += resolvedUnits;
    }

    if (
      record.numericGrade !== null &&
      record.normalizedGrade !== "5.0" &&
      record.numericGrade >= 0 &&
      record.numericGrade <= 100
    ) {
      weightedGradeTotal += record.numericGrade * resolvedUnits;
      weightedGradeUnits += resolvedUnits;
    }
  });

  return {
    totalUnitsEarned,
    gpa:
      weightedGradeUnits > 0
        ? (weightedGradeTotal / weightedGradeUnits).toFixed(2)
        : placeholderGrade,
  };
};

const sortDisplayRows = (rows: DisplayGradeRow[]) =>
  [...rows].sort(
    (left, right) =>
      left.subjectCode.localeCompare(right.subjectCode) ||
      left.subjectTitle.localeCompare(right.subjectTitle),
  );

const buildShsRows = (
  subjects: StudentPortalSubject[],
  gradeRecords: StoredStudentGradeRecord[],
) => {
  const rows = new Map<string, DisplayGradeRow>();

  subjects.forEach((subject) => {
    const row = createBaseRow({
      id: subject.id,
      subjectCode: subject.code,
      subjectTitle: subject.title,
      units: subject.units,
      instructor: subject.professor,
    });

    rows.set(buildSubjectKey(row), row);
  });

  gradeRecords.forEach((record) => {
    const quarterLabel = record.gradingPeriod as ShsQuarterLabel;

    if (!shsQuarterOrder.includes(quarterLabel)) {
      return;
    }

    const key = buildSubjectKey({
      subjectCode: record.subjectCode,
      subjectTitle: record.subjectTitle,
    });
    const existingRow =
      rows.get(key) ??
      createBaseRow({
        id: record.id,
        subjectCode: record.subjectCode,
        subjectTitle: record.subjectTitle,
        units: record.units,
      });

    if (quarterLabel === "1st Quarter") {
      existingRow.firstQuarter = record.normalizedGrade;
    }

    if (quarterLabel === "2nd Quarter") {
      existingRow.secondQuarter = record.normalizedGrade;
    }

    if (quarterLabel === "3rd Quarter") {
      existingRow.thirdQuarter = record.normalizedGrade;
    }

    if (quarterLabel === "4th Quarter") {
      existingRow.fourthQuarter = record.normalizedGrade;
    }

    rows.set(key, existingRow);
  });

  return sortDisplayRows(
    Array.from(rows.values()).map((row) => {
      const postedQuarterCount = [
        row.firstQuarter,
        row.secondQuarter,
        row.thirdQuarter,
        row.fourthQuarter,
      ].filter((value) => value !== placeholderGrade).length;

      if (postedQuarterCount === 0) {
        return row;
      }

      return {
        ...row,
        status:
          postedQuarterCount === shsQuarterOrder.length
            ? "Complete"
            : "Partially Posted",
      };
    }),
  );
};

const buildCollegeRows = (
  subjects: StudentPortalSubject[],
  gradeRecords: StoredStudentGradeRecord[],
) => {
  const rows = new Map<string, DisplayGradeRow>();
  const displayedGrades = new Map<
    string,
    { grade: string; priority: number }
  >();
  const finalEvaluations = new Map<
    string,
    { evaluation: StoredStudentGradeRecord["evaluation"]; priority: number }
  >();

  subjects.forEach((subject) => {
    const row = createBaseRow({
      id: subject.id,
      subjectCode: subject.code,
      subjectTitle: subject.title,
      units: subject.units,
      instructor: subject.professor,
    });

    rows.set(buildSubjectKey(row), row);
  });

  gradeRecords.forEach((record) => {
    const key = buildSubjectKey({
      subjectCode: record.subjectCode,
      subjectTitle: record.subjectTitle,
    });
    const existingRow =
      rows.get(key) ??
      createBaseRow({
        id: record.id,
        subjectCode: record.subjectCode,
        subjectTitle: record.subjectTitle,
        units: record.units,
        instructor: undefined,
      });

    if (existingRow.units === placeholderGrade && record.units !== null) {
      existingRow.units = String(record.units);
    }

    const nextDisplayedGradePriority = getCollegeDisplayedGradePriority(record);
    const currentDisplayedGrade = displayedGrades.get(key);
    if (
      nextDisplayedGradePriority > 0 &&
      (!currentDisplayedGrade ||
        nextDisplayedGradePriority >= currentDisplayedGrade.priority)
    ) {
      existingRow.grade = record.normalizedGrade;
      displayedGrades.set(key, {
        grade: record.normalizedGrade,
        priority: nextDisplayedGradePriority,
      });
    }

    if (isCollegeFinalLikeRecord(record)) {
      const nextPriority = getCollegeFinalRecordPriority(record);
      const currentFinalEvaluation = finalEvaluations.get(key);

      if (
        !currentFinalEvaluation ||
        nextPriority >= currentFinalEvaluation.priority
      ) {
        finalEvaluations.set(key, {
          evaluation: record.evaluation,
          priority: nextPriority,
        });
      }
    }

    rows.set(key, existingRow);
  });

  return sortDisplayRows(
    Array.from(rows.entries()).map(([key, row]) => {
      const displayedGrade = displayedGrades.get(key);
      const finalEvaluation = finalEvaluations.get(key);
      const hasAnyPostedGrade = Boolean(displayedGrade);

      if (!hasAnyPostedGrade) {
        return row;
      }

      return {
        ...row,
        grade: displayedGrade?.grade ?? row.grade,
        remarks: finalEvaluation?.evaluation ?? "Partially Posted",
        status: finalEvaluation?.evaluation ?? "Partially Posted",
      };
    }),
  );
};

const getStatusToneClassName = (status: string) => {
  const normalizedStatus = status.trim().toLowerCase();

  if (normalizedStatus === "passed" || normalizedStatus === "complete") {
    return "success";
  }

  if (normalizedStatus === "failed" || normalizedStatus === "incomplete") {
    return "danger";
  }

  if (normalizedStatus === "partially posted") {
    return "info";
  }

  return "neutral";
};

const useToast = () => {
  const toastCounterRef = useRef(0);
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
    toastCounterRef.current += 1;
    const id = `student-grades-toast-${toastCounterRef.current}`;
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

function StudentGrades() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [gradeRecordsVersion, setGradeRecordsVersion] = useState(0);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { toasts, addToast, removeToast } = useToast();

  const { student, subjects, isLoading } = useStudent();
  const isSHS = student?.programType === "SHS";

  const studentGradeRecords = useMemo(
    () =>
      student?.studentNumber
        ? getStudentGradeRecords({
            branch: student.branch,
            studentId: student.studentNumber,
          }).filter(
            (record) => record.programType === (isSHS ? "SHS" : "College"),
          )
        : [],
    [gradeRecordsVersion, isSHS, student?.branch, student?.studentNumber],
  );

  useEffect(() => {
    const refreshStudentGrades = () => {
      setGradeRecordsVersion((previousValue) => previousValue + 1);
    };

    const handleStorageUpdate = (event: StorageEvent) => {
      if (!event.key?.startsWith(studentGradeStorageKeyPrefix)) {
        return;
      }

      refreshStudentGrades();
    };

    window.addEventListener(
      STUDENT_GRADE_RECORDS_UPDATED_EVENT,
      refreshStudentGrades,
    );
    window.addEventListener("storage", handleStorageUpdate);

    return () => {
      window.removeEventListener(
        STUDENT_GRADE_RECORDS_UPDATED_EVENT,
        refreshStudentGrades,
      );
      window.removeEventListener("storage", handleStorageUpdate);
    };
  }, []);

  const availableAcademicYears = useMemo(() => {
    const years = new Set<string>();

    subjects.forEach((subject) => {
      if (subject.academicYear) {
        years.add(subject.academicYear);
      }
    });

    studentGradeRecords.forEach((record) => {
      if (record.academicYear) {
        years.add(record.academicYear);
      }
    });

    return Array.from(years).sort((left, right) => right.localeCompare(left));
  }, [studentGradeRecords, subjects]);

  const fallbackAcademicYear =
    subjects[0]?.academicYear ||
    studentGradeRecords[0]?.academicYear ||
    getDefaultAcademicYear();

  const effectiveAcademicYear =
    selectedAcademicYear &&
    availableAcademicYears.includes(selectedAcademicYear)
      ? selectedAcademicYear
      : availableAcademicYears[0] || fallbackAcademicYear;

  const availableSemesters = useMemo(() => {
    const semesters = new Set<string>();

    subjects
      .filter((subject) => subject.academicYear === effectiveAcademicYear)
      .forEach((subject) => {
        if (subject.semester) {
          semesters.add(subject.semester);
        }
      });

    studentGradeRecords
      .filter((record) => record.academicYear === effectiveAcademicYear)
      .forEach((record) => {
        if (record.semester) {
          semesters.add(record.semester);
        }
      });

    return sortSemesters(Array.from(semesters));
  }, [effectiveAcademicYear, studentGradeRecords, subjects]);

  const fallbackSemester =
    subjects.find((subject) => subject.academicYear === effectiveAcademicYear)
      ?.semester ||
    studentGradeRecords.find(
      (record) => record.academicYear === effectiveAcademicYear,
    )?.semester ||
    "1st Semester";

  const effectiveSemester =
    selectedSemester && availableSemesters.includes(selectedSemester)
      ? selectedSemester
      : availableSemesters[0] || fallbackSemester;

  const termSubjects = useMemo(
    () =>
      subjects.filter(
        (subject) =>
          subject.academicYear === effectiveAcademicYear &&
          subject.semester === effectiveSemester,
      ),
    [effectiveAcademicYear, effectiveSemester, subjects],
  );

  const termGradeRecords = useMemo(
    () =>
      studentGradeRecords.filter(
        (record) =>
          record.academicYear === effectiveAcademicYear &&
          record.semester === effectiveSemester,
      ),
    [effectiveAcademicYear, effectiveSemester, studentGradeRecords],
  );

  const displayRows = useMemo(
    () =>
      isSHS
        ? buildShsRows(termSubjects, termGradeRecords)
        : buildCollegeRows(termSubjects, termGradeRecords),
    [isSHS, termGradeRecords, termSubjects],
  );

  const tableColumns = isSHS ? shsColumns : collegeColumns;

  const subjectsWithPostedGradesCount = useMemo(
    () =>
      displayRows.filter((row) =>
        isSHS
          ? [
              row.firstQuarter,
              row.secondQuarter,
              row.thirdQuarter,
              row.fourthQuarter,
            ].some((value) => value !== placeholderGrade)
          : row.grade !== placeholderGrade,
      ).length,
    [displayRows, isSHS],
  );

  const totalUnits = useMemo(
    () =>
      displayRows.reduce((sum, row) => {
        const parsedUnits = Number(row.units);
        return Number.isFinite(parsedUnits) ? sum + parsedUnits : sum;
      }, 0),
    [displayRows],
  );

  const collegePerformanceSummary = useMemo(
    () =>
      isSHS
        ? null
        : buildCollegePerformanceSummary(termSubjects, termGradeRecords),
    [isSHS, termGradeRecords, termSubjects],
  );

  const handleMenuClick = () => {
    setSidebarOpen((prev) => !prev);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  const handleFilter = () => {
    setShowFilters((prev) => !prev);
    addToast(
      showFilters ? "Filter panel closed" : "Filter panel opened",
      "info",
    );
  };

  const handleGenerateReportCard = () => {
    addToast(
      "Report card generation will be enabled after the grade release flow is connected.",
      "info",
    );
  };

  const handleLogout = () => {
    addToast("Logging out...", "info");
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

  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const studentData = {
    name: student ? `${student.firstName} ${student.lastName}` : "Student",
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
    <div className="s-portal s-grd">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div ref={sidebarRef}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={handleSidebarClose}
          activePage="grades"
          onLogout={handleLogout}
        />
      </div>

      {sidebarOpen && (
        <div className="s-overlay" onClick={handleSidebarClose}></div>
      )}

      <div className="s-main s-mm">
        <Header
          title="Grades"
          onMenuClick={handleMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />

        <main className="s-content">
          <div className="s-welcome-banner s-grades-banner">
            <div className="s-grades-banner-content">
              <h1>Grades</h1>
            </div>
          </div>

          <div className="s-grades-controls-row">
            <div className="s-grades-banner-subtitle">
              <span className="s-academic-year">
                <FaCalendarAlt /> {effectiveAcademicYear}
              </span>
              <span className="s-semester">
                <FaGraduationCap /> {effectiveSemester}
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

          {showFilters && (
            <div className="s-filter-panel">
              <h3>Filter Grades</h3>
              <div className="s-filter-row">
                <div className="s-filter-group">
                  <label>Academic Year</label>
                  <select
                    value={effectiveAcademicYear}
                    onChange={(event) => {
                      setSelectedAcademicYear(event.target.value);
                      addToast(
                        `Filtered by academic year: ${event.target.value}`,
                        "info",
                      );
                    }}
                    className="s-filter-select"
                  >
                    {availableAcademicYears.length > 0 ? (
                      availableAcademicYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))
                    ) : (
                      <option value={effectiveAcademicYear}>
                        {effectiveAcademicYear}
                      </option>
                    )}
                  </select>
                </div>
                <div className="s-filter-group">
                  <label>Semester</label>
                  <select
                    value={effectiveSemester}
                    onChange={(event) => {
                      setSelectedSemester(event.target.value);
                      addToast(
                        `Filtered by semester: ${event.target.value}`,
                        "info",
                      );
                    }}
                    className="s-filter-select"
                  >
                    {availableSemesters.length > 0 ? (
                      availableSemesters.map((semester) => (
                        <option key={semester} value={semester}>
                          {semester}
                        </option>
                      ))
                    ) : (
                      <option value={effectiveSemester}>
                        {effectiveSemester}
                      </option>
                    )}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="s-notice-card">
            <div className="s-notice-icon">
              <IoDocumentText />
            </div>
            <div className="s-notice-content">
              <h4>Note:</h4>
              <p>
                This page now reflects your enrolled subjects even before grades
                are released. If a grade is still missing, it means the posting
                process for that subject or grading period is not finished yet.
              </p>
            </div>
          </div>

          <div className="s-grades-table-wrapper">
            <div
              className={`s-grades-table-container ${
                isSHS ? "s-grades-table-shs" : "s-grades-table-college"
              }`}
            >
              <table className="s-grades-table">
                <thead>
                  <tr>
                    {tableColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length > 0 ? (
                    displayRows.map((row) => (
                      <tr key={row.id}>
                        {tableColumns.map((column) => {
                          const cellValue = row[column.key];

                          if (
                            column.key === "status" ||
                            column.key === "remarks"
                          ) {
                            return (
                              <td
                                key={`${row.id}-${column.key}`}
                                className={column.cellClassName}
                              >
                                <span
                                  className={`s-grade-status s-grade-status-${getStatusToneClassName(
                                    cellValue,
                                  )}`}
                                >
                                  {cellValue}
                                </span>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={`${row.id}-${column.key}`}
                              className={column.cellClassName}
                            >
                              {cellValue}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={tableColumns.length} className="s-no-data">
                        No enrolled subjects or posted grades were found for the
                        selected academic year and semester.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="s-subjects-summary s-grades-summary">
            <div className="s-summary-card">
              <h4>Subjects Listed</h4>
              <div className="s-summary-value">{displayRows.length}</div>
            </div>
            <div className="s-summary-card">
              <h4>With Posted Grades</h4>
              <div className="s-summary-value">
                {subjectsWithPostedGradesCount}
              </div>
            </div>
            {!isSHS ? (
              <div className="s-summary-card">
                <h4>Total Units</h4>
                <div className="s-summary-value">{totalUnits}</div>
              </div>
            ) : null}
            {!isSHS ? (
              <div className="s-summary-card">
                <h4>Total Units Earned</h4>
                <div className="s-summary-value">
                  {collegePerformanceSummary?.totalUnitsEarned ?? 0}
                </div>
              </div>
            ) : null}
            {!isSHS ? (
              <div className="s-summary-card">
                <h4>GPA</h4>
                <div className="s-summary-value">
                  {collegePerformanceSummary?.gpa ?? placeholderGrade}
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

export default StudentGrades;
