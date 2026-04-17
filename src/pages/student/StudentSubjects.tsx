import { useState, useRef, useEffect, useMemo } from "react";
import {
  FaCalendarAlt,
  FaDownload,
  FaFilter,
  FaGraduationCap,
} from "react-icons/fa";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import { useStudent } from "../../hooks/useStudent";
import type {
  StudentPortalSubject,
  StudentScheduleChoiceGroup,
  StudentScheduleSelectionRequestRecord,
  StudentScheduledAssignmentItem,
} from "../../services/adminStorage";
import {
  getStudentScheduleChoiceGroups,
  getStudentScheduleSelectionRequest,
  saveStudentScheduleSelectionRequest,
  updateStoredStudentOwnScheduleState,
} from "../../services/adminStorage";
import { ToastContainer } from "../../components/common/Toast";
import "../../styles/main.css";

const semesterSortOrder = ["1st Semester", "2nd Semester", "Summer"];

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
    const id = `student-subjects-toast-${toastCounterRef.current}`;
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

const parseClockToMinutes = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const formatClockLabel = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const [rawHour, rawMinute] = value.split(":").map(Number);
  const suffix = rawHour >= 12 ? "PM" : "AM";
  const hour = rawHour % 12 || 12;
  return `${hour}:${rawMinute.toString().padStart(2, "0")} ${suffix}`;
};

const formatScheduleChoiceLabel = (
  assignment: Pick<
    StudentScheduledAssignmentItem,
    "sectionCode" | "schedule" | "instructorName"
  >,
) =>
  `${assignment.sectionCode || "No section"} - ${
    assignment.schedule.length > 0
      ? assignment.schedule
          .map(
            (slot) =>
              `${slot.day.slice(0, 3)} ${formatClockLabel(slot.startTime)}-${formatClockLabel(slot.endTime)} @ ${slot.room || "TBA"}`,
          )
          .join(" / ")
      : "Schedule pending"
  }${assignment.instructorName ? ` - ${assignment.instructorName}` : ""}`;

const buildScheduledAssignmentConflicts = (
  assignments: Pick<
    StudentScheduledAssignmentItem,
    "assignmentId" | "subjectCode" | "schedule"
  >[],
) => {
  const conflicts: Array<{
    leftAssignmentId: string;
    rightAssignmentId: string;
    message: string;
  }> = [];

  for (let leftIndex = 0; leftIndex < assignments.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < assignments.length;
      rightIndex += 1
    ) {
      const left = assignments[leftIndex];
      const right = assignments[rightIndex];

      const hasConflict = left.schedule.some((leftSlot) =>
        right.schedule.some((rightSlot) => {
          if (leftSlot.day !== rightSlot.day) {
            return false;
          }

          const leftStart = parseClockToMinutes(leftSlot.startTime);
          const leftEnd = parseClockToMinutes(leftSlot.endTime);
          const rightStart = parseClockToMinutes(rightSlot.startTime);
          const rightEnd = parseClockToMinutes(rightSlot.endTime);

          if (
            leftStart === null ||
            leftEnd === null ||
            rightStart === null ||
            rightEnd === null
          ) {
            return false;
          }

          return leftStart < rightEnd && rightStart < leftEnd;
        }),
      );

      if (!hasConflict) {
        continue;
      }

      conflicts.push({
        leftAssignmentId: left.assignmentId,
        rightAssignmentId: right.assignmentId,
        message: `${left.subjectCode} conflicts with ${right.subjectCode}.`,
      });
    }
  }

  return conflicts;
};

const getOwnScheduleSelectionLabel = (
  status?: "Not Submitted" | "Pending Approval" | "Approved" | "Rejected",
) => {
  if (status === "Pending Approval") {
    return "Pending Approval";
  }

  if (status === "Approved") {
    return "Approved";
  }

  if (status === "Rejected") {
    return "Needs Revision";
  }

  return "Not Submitted";
};

const getOwnScheduleStatusMessage = (
  status?: "Not Submitted" | "Pending Approval" | "Approved" | "Rejected",
) => {
  if (status === "Pending Approval") {
    return "Your selected schedules were submitted and are now waiting for admin or registrar approval.";
  }

  if (status === "Approved") {
    return "Your own-schedule request is approved. Your official subjects are listed below.";
  }

  if (status === "Rejected") {
    return "Your last schedule submission needs revision. Update the selections below and submit again.";
  }

  return "Choose one available schedule per subject, then submit it for final approval.";
};

function StudentSubjects() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { student, subjects: allSubjects, isLoading, refreshStudent } =
    useStudent();
  const [selectedAcademicYear, setSelectedAcademicYear] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [scheduleChoiceGroups, setScheduleChoiceGroups] = useState<
    StudentScheduleChoiceGroup[]
  >([]);
  const [scheduleRequest, setScheduleRequest] =
    useState<StudentScheduleSelectionRequestRecord | null>(null);
  const [selectedAssignmentsBySubject, setSelectedAssignmentsBySubject] =
    useState<Record<string, string>>({});
  const [isSubmittingScheduleRequest, setIsSubmittingScheduleRequest] =
    useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { toasts, addToast, removeToast } = useToast();

  const isSHS = student?.programType === "SHS";
  const supportsOwnSchedule = Boolean(
    student?.requestedOwnSchedule &&
      student.ownScheduleRequestStatus === "Approved",
  );
  const ownScheduleAcademicYear =
    student?.ownScheduleAcademicYear || scheduleRequest?.academicYear || "2026-2027";
  const ownScheduleSemester =
    student?.ownScheduleSemester || scheduleRequest?.semester || "1st Semester";
  const showOwnSchedulePlanner =
    supportsOwnSchedule && student?.ownScheduleSelectionStatus !== "Approved";
  const showIrregularSections =
    student?.status === "Irregular" || supportsOwnSchedule;

  useEffect(() => {
    if (!student || !supportsOwnSchedule) {
      setScheduleChoiceGroups([]);
      setScheduleRequest(null);
      setSelectedAssignmentsBySubject({});
      return;
    }

    const nextScheduleRequest = getStudentScheduleSelectionRequest({
      branch: student.branch,
      studentNumber: student.studentNumber,
      trackingNumber: student.trackingNumber,
    });
    const nextAcademicYear =
      nextScheduleRequest?.academicYear ||
      student.ownScheduleAcademicYear ||
      "2026-2027";
    const nextSemester =
      nextScheduleRequest?.semester ||
      student.ownScheduleSemester ||
      "1st Semester";
    const nextChoiceGroups = getStudentScheduleChoiceGroups({
      branch: student.branch,
      program: student.programType === "SHS" ? "SHS" : "College",
      yearLevel: student.yearLevel,
      strandOrCourse: student.program,
      semester: nextSemester,
      academicYear: nextAcademicYear,
    });

    setScheduleRequest(nextScheduleRequest);
    setScheduleChoiceGroups(nextChoiceGroups);
    setSelectedAssignmentsBySubject(
      Object.fromEntries(
        (nextScheduleRequest?.selections ?? []).map((selection) => [
          selection.subjectId,
          selection.assignmentId,
        ]),
      ),
    );
  }, [
    student,
    supportsOwnSchedule,
  ]);

  const availableAcademicYears = useMemo(() => {
    const years = new Set(
      allSubjects.map((subject) => subject.academicYear).filter(Boolean),
    );

    if (supportsOwnSchedule) {
      years.add(ownScheduleAcademicYear);
    }

    return Array.from(years).sort();
  }, [allSubjects, ownScheduleAcademicYear, supportsOwnSchedule]);

  const effectiveAcademicYear =
    selectedAcademicYear && availableAcademicYears.includes(selectedAcademicYear)
      ? selectedAcademicYear
      : availableAcademicYears[0] || ownScheduleAcademicYear;

  const availableSemesters = useMemo(() => {
    const semesters = new Set(
      allSubjects
        .filter((subject) => subject.academicYear === effectiveAcademicYear)
        .map((subject) => subject.semester)
        .filter(Boolean),
    );

    if (supportsOwnSchedule && effectiveAcademicYear === ownScheduleAcademicYear) {
      semesters.add(ownScheduleSemester);
    }

    return sortSemesters(Array.from(semesters));
  }, [
    allSubjects,
    effectiveAcademicYear,
    ownScheduleAcademicYear,
    ownScheduleSemester,
    supportsOwnSchedule,
  ]);

  const effectiveSemester =
    selectedSemester && availableSemesters.includes(selectedSemester)
      ? selectedSemester
      : availableSemesters[0] || ownScheduleSemester;

  const filteredSubjects: StudentPortalSubject[] = useMemo(
    () =>
      allSubjects.filter(
        (subject) =>
          subject.academicYear === effectiveAcademicYear &&
          subject.semester === effectiveSemester,
      ),
    [allSubjects, effectiveAcademicYear, effectiveSemester],
  );

  const selectedOwnScheduleAssignments = useMemo(
    () =>
      scheduleChoiceGroups.flatMap((group) => {
        const assignmentId = selectedAssignmentsBySubject[group.subjectId];
        const selectedAssignment = group.assignmentOptions.find(
          (assignment) => assignment.assignmentId === assignmentId,
        );

        return selectedAssignment ? [selectedAssignment] : [];
      }),
    [scheduleChoiceGroups, selectedAssignmentsBySubject],
  );

  const ownScheduleConflicts = useMemo(
    () => buildScheduledAssignmentConflicts(selectedOwnScheduleAssignments),
    [selectedOwnScheduleAssignments],
  );

  const ownScheduleConflictAssignmentIds = useMemo(
    () =>
      new Set(
        ownScheduleConflicts.flatMap((conflict) => [
          conflict.leftAssignmentId,
          conflict.rightAssignmentId,
        ]),
      ),
    [ownScheduleConflicts],
  );

  const ownScheduleSelectedUnits = selectedOwnScheduleAssignments.reduce(
    (sum, assignment) => sum + (assignment.units ?? 0),
    0,
  );

  const handleMenuClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  const handleLogout = () => {
    addToast("Logging out...", "info");
  };

  const handleFilter = () => {
    setShowFilters(!showFilters);
    addToast(showFilters ? "Filter panel closed" : "Filter panel opened", "info");
  };

  const handleOwnScheduleSelectionChange = (
    subjectId: string,
    assignmentId: string,
  ) => {
    setSelectedAssignmentsBySubject((prev) => ({
      ...prev,
      [subjectId]: assignmentId,
    }));
  };

  const handleResetOwnScheduleSelections = () => {
    setSelectedAssignmentsBySubject({});
    addToast("Schedule selections cleared.", "info");
  };

  const handleSubmitOwnScheduleRequest = async () => {
    if (!student) {
      return;
    }

    if (selectedOwnScheduleAssignments.length === 0) {
      addToast("Choose at least one schedule before submitting.", "warning");
      return;
    }

    if (ownScheduleConflicts.length > 0) {
      addToast("Resolve the schedule conflicts first.", "warning");
      return;
    }

    const timestamp = new Date().toISOString();
    const nextRequest: StudentScheduleSelectionRequestRecord = {
      id:
        scheduleRequest?.id ||
        `schedule-request-${student.studentNumber}-${ownScheduleAcademicYear}-${ownScheduleSemester}`,
      studentNumber: student.studentNumber,
      trackingNumber: student.trackingNumber,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      branch: student.branch,
      program: student.programType === "SHS" ? "SHS" : "College",
      yearLevel: student.yearLevel,
      strandOrCourse: student.program,
      academicYear: ownScheduleAcademicYear,
      semester: ownScheduleSemester,
      status: "Pending",
      selections: selectedOwnScheduleAssignments,
      submittedAt: scheduleRequest?.submittedAt || timestamp,
      updatedAt: timestamp,
    };

    try {
      setIsSubmittingScheduleRequest(true);
      saveStudentScheduleSelectionRequest(nextRequest);
      updateStoredStudentOwnScheduleState({
        branch: student.branch,
        studentNumber: student.studentNumber,
        trackingNumber: student.trackingNumber,
        updates: {
          requestedOwnSchedule: true,
          ownScheduleRequestStatus: "Approved",
          ownScheduleAcademicYear,
          ownScheduleSemester,
          ownScheduleSelectionStatus: "Pending Approval",
        },
      });
      setScheduleRequest(nextRequest);
      await refreshStudent();
      addToast("Schedule request submitted for approval.", "success");
    } catch (error) {
      console.error("Failed to save own schedule request", error);
      addToast("Unable to submit the schedule request right now.", "error");
    } finally {
      setIsSubmittingScheduleRequest(false);
    }
  };

  const handleDownloadSchedule = () => {
    if (filteredSubjects.length === 0) {
      addToast("No official subjects are available to download yet.", "warning");
      return;
    }

    let scheduleText = `CLASS SCHEDULE\n`;
    scheduleText += `${"=".repeat(50)}\n\n`;
    scheduleText += `Student: ${student?.firstName} ${student?.lastName}\n`;
    scheduleText += `Student Number: ${student?.studentNumber}\n`;
    scheduleText += `Program: ${student?.program}\n`;
    scheduleText += `Academic Year: ${effectiveAcademicYear}\n`;
    scheduleText += `Semester: ${effectiveSemester}\n`;
    scheduleText += `\n${"=".repeat(50)}\n\n`;

    filteredSubjects.forEach((subject, index) => {
      scheduleText += `${index + 1}. ${subject.code} - ${subject.title}\n`;
      if (subject.section) {
        scheduleText += `   Section: ${subject.section}\n`;
      }
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
    if (!isSHS && filteredSubjects.some((subject) => subject.units)) {
      const totalUnits = filteredSubjects.reduce(
        (sum, subject) => sum + (subject.units || 0),
        0,
      );
      scheduleText += `Total Units: ${totalUnits}\n`;
    }
    scheduleText += `\nGenerated on: ${new Date().toLocaleDateString()}\n`;

    const blob = new Blob([scheduleText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `class_schedule_${effectiveAcademicYear}_${effectiveSemester}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
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
    <div className="s-portal">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

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

      <div className="s-main">
        <Header
          title="Current Subjects"
          onMenuClick={handleMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />

        <main className="s-content">
          <div className="s-welcome-banner">
            <h1>Current Subjects</h1>
          </div>

          {supportsOwnSchedule ? (
            <div className="s-own-schedule-banner">
              <div>
                <h2>Own Schedule Admission</h2>
                <p>
                  {getOwnScheduleStatusMessage(
                    student?.ownScheduleSelectionStatus,
                  )}
                </p>
              </div>
              <div className="s-own-schedule-banner-meta">
                <span>{ownScheduleAcademicYear}</span>
                <span>{ownScheduleSemester}</span>
                <span>
                  {getOwnScheduleSelectionLabel(
                    student?.ownScheduleSelectionStatus,
                  )}
                </span>
              </div>
            </div>
          ) : null}

          {showOwnSchedulePlanner ? (
            <div className="s-own-schedule-panel">
              <div className="s-own-schedule-summary">
                <div className="s-summary-card">
                  <h4>Available Subjects</h4>
                  <div className="s-summary-value">
                    {scheduleChoiceGroups.length}
                  </div>
                </div>
                <div className="s-summary-card">
                  <h4>Selected Schedules</h4>
                  <div className="s-summary-value">
                    {selectedOwnScheduleAssignments.length}
                  </div>
                </div>
                <div className="s-summary-card">
                  <h4>Conflicts</h4>
                  <div className="s-summary-value">
                    {ownScheduleConflicts.length}
                  </div>
                </div>
                {!isSHS ? (
                  <div className="s-summary-card">
                    <h4>Total Units</h4>
                    <div className="s-summary-value">{ownScheduleSelectedUnits}</div>
                  </div>
                ) : null}
              </div>

              {ownScheduleConflicts.length > 0 ? (
                <div className="s-own-schedule-warning">
                  <strong>Schedule conflict detected.</strong>
                  <ul className="s-own-schedule-warning-list">
                    {ownScheduleConflicts.map((conflict) => (
                      <li
                        key={`${conflict.leftAssignmentId}-${conflict.rightAssignmentId}`}
                      >
                        {conflict.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="s-own-schedule-grid">
                <div className="s-own-schedule-subjects">
                  {scheduleChoiceGroups.length > 0 ? (
                    scheduleChoiceGroups.map((group) => (
                      <div
                        key={group.subjectId}
                        className="s-own-schedule-subject-card"
                      >
                        <div className="s-own-schedule-subject-copy">
                          <h3>
                            {group.subjectCode} - {group.subjectName}
                          </h3>
                          <p>
                            {typeof group.units === "number"
                              ? `${group.units} unit(s)`
                              : "Units not specified"}
                          </p>
                        </div>
                        <label className="s-own-schedule-field">
                          <span>Available schedules</span>
                          <select
                            value={selectedAssignmentsBySubject[group.subjectId] || ""}
                            onChange={(event) =>
                              handleOwnScheduleSelectionChange(
                                group.subjectId,
                                event.target.value,
                              )
                            }
                          >
                            <option value="">Not selected</option>
                            {group.assignmentOptions.map((assignment) => (
                              <option
                                key={assignment.assignmentId}
                                value={assignment.assignmentId}
                              >
                                {formatScheduleChoiceLabel(assignment)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {group.assignmentOptions.length === 0 ? (
                          <p className="s-own-schedule-empty-option">
                            No scheduled offering is available for this subject
                            yet.
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="s-no-subjects">
                      <p>
                        No available subject offerings were found for your own
                        schedule term yet. Please contact the registrar.
                      </p>
                    </div>
                  )}
                </div>

                <div className="s-own-schedule-selection-panel">
                  <h3>Selected Load</h3>
                  {selectedOwnScheduleAssignments.length > 0 ? (
                    <div className="s-own-schedule-selection-list">
                      {selectedOwnScheduleAssignments.map((assignment) => (
                        <div
                          key={assignment.assignmentId}
                          className={`s-own-schedule-selection-item ${
                            ownScheduleConflictAssignmentIds.has(
                              assignment.assignmentId,
                            )
                              ? "flagged"
                              : ""
                          }`}
                        >
                          <strong>
                            {assignment.subjectCode} - {assignment.subjectName}
                          </strong>
                          <span>{assignment.sectionCode || "No section"}</span>
                          <span>{formatScheduleChoiceLabel(assignment)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="s-own-schedule-empty-state">
                      Choose one schedule per subject to build your requested
                      load.
                    </div>
                  )}

                  <div className="s-own-schedule-actions">
                    <button
                      type="button"
                      className="s-filter-btn"
                      onClick={handleResetOwnScheduleSelections}
                    >
                      Clear Selections
                    </button>
                    <button
                      type="button"
                      className="s-download-btn"
                      onClick={() => void handleSubmitOwnScheduleRequest()}
                      disabled={
                        isSubmittingScheduleRequest ||
                        selectedOwnScheduleAssignments.length === 0
                      }
                    >
                      {isSubmittingScheduleRequest
                        ? "Submitting..."
                        : student?.ownScheduleSelectionStatus ===
                              "Pending Approval" ||
                            student?.ownScheduleSelectionStatus === "Rejected"
                          ? "Update Request"
                          : "Submit for Approval"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="s-grades-controls-row">
            <div className="s-grades-banner-subtitle">
              <span className="s-academic-year">
                <FaCalendarAlt /> {effectiveAcademicYear || "No Academic Year"}
              </span>
              <span className="s-semester">
                <FaGraduationCap /> {effectiveSemester || "No Semester"}
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

          {showFilters && (
            <div className="s-filter-panel">
              <h3>Filter Subjects</h3>
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
                    {availableAcademicYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
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
                    {availableSemesters.map((semester) => (
                      <option key={semester} value={semester}>
                        {semester}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="s-subjects-grid">
            {filteredSubjects.length > 0 ? (
              filteredSubjects.map((subject) => (
                <div key={subject.id} className="s-subject-card">
                  <div className="s-subject-header">
                    <div className="s-subject-code">{subject.code}</div>
                    {subject.units && !isSHS ? (
                      <div className="s-subject-units">
                        {subject.units} unit(s)
                      </div>
                    ) : null}
                  </div>
                  <h3 className="s-subject-title">{subject.title}</h3>
                  <div className="s-subject-details">
                    {showIrregularSections && subject.section ? (
                      <div className="s-subject-detail">
                        <span className="s-detail-label">Section:</span>
                        <span>{subject.section}</span>
                      </div>
                    ) : null}
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
                  {showOwnSchedulePlanner
                    ? "No official subjects are posted yet. They will appear here after your schedule request is approved."
                    : "No subjects found for the selected academic year and semester."}
                </p>
              </div>
            )}
          </div>

          {filteredSubjects.length > 0 ? (
            <div className="s-subjects-summary">
              <div className="s-summary-card">
                <h4>Total Subjects</h4>
                <div className="s-summary-value">{filteredSubjects.length}</div>
              </div>
              {!isSHS && filteredSubjects.some((subject) => subject.units) ? (
                <div className="s-summary-card">
                  <h4>Total Units</h4>
                  <div className="s-summary-value">
                    {filteredSubjects.reduce(
                      (sum, subject) => sum + (subject.units || 0),
                      0,
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default StudentSubjects;
