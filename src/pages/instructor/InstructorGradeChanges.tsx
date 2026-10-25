import { useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiEdit3,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import SkeletonPage from "../../components/common/SkeletonPage";
import { useInstructorPortal } from "../../hooks/useInstructorPortal";
import { resolveGradeChangeSubjectUnits } from "../../services/gradeChangeSubjectUnits";
import type { AcademicClassSectionRecord } from "../../services/academicData";
import {
  fetchAndCacheStudentGradeRecordsForBranch,
  readStudentGradeRecordsForBranch,
  validateAndNormalizeUploadedGradeRow,
  type StoredStudentGradeRecord,
  type StudentGradeProgramType,
} from "../../services/studentGrades";
import {
  fetchAndCacheGradeChangeRequestSettings,
  fetchAndCacheInstructorGradeChangeErrorHistory,
  fetchAndCacheInstructorGradeChangeRequests,
  getGradeChangeRequestSettings,
  getInstructorGradeChangeErrorHistory,
  getInstructorGradeChangeRequests,
  saveInstructorGradeChangeErrorHistory,
  saveInstructorGradeChangeRequest,
  studentHasAssignedInstructorSubject,
  studentMatchesSection,
  type InstructorGradeChangeRequest,
  writeInstructorGradeChangeErrorHistory,
  writeInstructorGradeChangeRequests,
} from "../../services/instructorPortal";

type GradeChangeDraftRow = {
  id: string;
  studentId: string;
  fullName: string;
  section: string;
  subjectCode: string;
  subjectTitle: string;
  units: number | null;
  academicYear: string;
  semester: string;
  gradingPeriod: string;
  programType: StudentGradeProgramType;
  currentGrade: string;
  currentRecord?: StoredStudentGradeRecord;
};

const getCompactFileName = (fileName: string) =>
  fileName.length > 26 ? `${fileName.slice(0, 23)}...` : fileName;

const getProgramType = (
  section?: AcademicClassSectionRecord,
): StudentGradeProgramType => (section?.program === "SHS" ? "SHS" : "College");

const formatSemesterAndQuarter = (row: {
  semester: string;
  gradingPeriod: string;
  programType: StudentGradeProgramType;
}) => {
  const quarter = row.programType === "SHS" && row.gradingPeriod !== "No approved grade"
    ? row.gradingPeriod.trim()
    : "";
  return [row.semester.trim(), quarter].filter(Boolean).join(" / ") || "-";
};

const sanitizeRequestedGradeInput = (value: string) => {
  const numericValue = value.replace(/[^\d.]/g, "");
  const [wholePart = "", ...decimalParts] = numericValue.split(".");
  const decimalValue = decimalParts.join("");

  return decimalParts.length > 0
    ? `${wholePart.slice(0, 3)}.${decimalValue.slice(0, 2)}`
    : wholePart.slice(0, 3);
};

const isRequestedGradeInAllowedRange = (value: string) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 70 && numericValue <= 100;
};

export default function InstructorGradeChanges() {
  const {
    currentUser,
    instructor,
    assignments,
    sections,
    subjects,
    students,
    isLoading,
  } = useInstructorPortal();
  const [message, setMessage] = useState("");
  const [requestsVersion, setRequestsVersion] = useState(0);
  const [gradeRecordsVersion, setGradeRecordsVersion] = useState(0);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestedGrades, setRequestedGrades] = useState<Record<string, string>>({});
  const [gradeSearchTerm, setGradeSearchTerm] = useState("");
  const [viewingRequest, setViewingRequest] =
    useState<InstructorGradeChangeRequest | null>(null);
  const [viewingErrorRequest, setViewingErrorRequest] =
    useState<InstructorGradeChangeRequest | null>(null);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);

  useEffect(() => {
    if (!currentUser?.branch) {
      return;
    }

    void Promise.all([
      fetchAndCacheInstructorGradeChangeRequests(currentUser.branch),
      fetchAndCacheInstructorGradeChangeErrorHistory(currentUser.branch),
      fetchAndCacheGradeChangeRequestSettings(currentUser.branch),
      fetchAndCacheStudentGradeRecordsForBranch(currentUser.branch),
    ])
      .then(() => {
        setRequestsVersion((previousValue) => previousValue + 1);
        setSettingsVersion((previousValue) => previousValue + 1);
        setGradeRecordsVersion((previousValue) => previousValue + 1);
      })
      .catch((error) => {
        console.warn("Unable to load grade change request data.", error);
      });
  }, [currentUser?.branch]);

  const assignedSectionOptions = useMemo(() => {
    const assignmentSectionIds = new Set(
      assignments.flatMap((assignment) => [
        assignment.sectionId,
        assignment.sectionCode,
      ]),
    );

    return sections
      .filter(
        (section) =>
          assignmentSectionIds.has(section.id) ||
          assignmentSectionIds.has(section.code),
      )
      .sort(
        (left, right) =>
          left.code.localeCompare(right.code) ||
          left.section.localeCompare(right.section),
      );
  }, [assignments, sections]);

  const requests = useMemo<InstructorGradeChangeRequest[]>(() => {
    void requestsVersion;
    const requestById = new Map(
      [
        ...getInstructorGradeChangeRequests(currentUser?.branch),
        ...getInstructorGradeChangeErrorHistory(currentUser?.branch),
      ].map((request) => [request.id, request]),
    );

    return Array.from(requestById.values())
      .filter((request) => request.instructorId === currentUser?.id)
      .sort(
        (left, right) =>
          Date.parse(right.submittedAt) - Date.parse(left.submittedAt),
      );
  }, [currentUser?.branch, currentUser?.id, requestsVersion]);

  const gradeChangeSettings = useMemo(() => {
    void settingsVersion;
    return getGradeChangeRequestSettings(currentUser?.branch);
  }, [currentUser?.branch, settingsVersion]);

  const approvedGradeRecords = useMemo(() => {
    void gradeRecordsVersion;
    return readStudentGradeRecordsForBranch(currentUser?.branch);
  }, [currentUser?.branch, gradeRecordsVersion]);

  const gradeChangeRows = useMemo<GradeChangeDraftRow[]>(() => {
    return assignments
      .flatMap((assignment) => {
        const section = assignedSectionOptions.find(
          (item) =>
            item.id === assignment.sectionId ||
            item.code === assignment.sectionCode,
        );
        const programType = getProgramType(section);
        const units = resolveGradeChangeSubjectUnits({
          subjectId: assignment.subjectId,
          subjectCode: assignment.subjectCode,
          subjectTitle: assignment.subjectName,
          programType,
          semester: assignment.semester,
          yearLevel: section?.yearLevel,
        }, subjects);
        const sectionStudents = students.filter(
          (student) =>
            (section && studentMatchesSection(student, section)) ||
            studentHasAssignedInstructorSubject(student, assignment),
        );

        return sectionStudents
          .flatMap((student) => {
            const studentGradeRecords = approvedGradeRecords.filter(
              (record) =>
                record.studentId === student.id &&
                record.subjectCode.trim().toUpperCase() ===
                  assignment.subjectCode.trim().toUpperCase() &&
                record.academicYear === assignment.academicYear &&
                record.semester === assignment.semester &&
                record.programType === programType,
            );

            if (studentGradeRecords.length === 0) {
              const pendingRow: GradeChangeDraftRow = {
                id: `${student.id}::${assignment.subjectCode}::${assignment.academicYear}::${assignment.semester}::pending`,
                studentId: student.id,
                fullName: student.name,
                section: section?.code || assignment.sectionCode,
                subjectCode: assignment.subjectCode,
                subjectTitle: assignment.subjectName,
                units,
                academicYear: assignment.academicYear,
                semester: assignment.semester,
                gradingPeriod:
                  programType === "SHS" ? "No approved grade" : assignment.semester,
                programType,
                currentGrade: "No approved grade",
                currentRecord: undefined,
              };

              return [pendingRow];
            }

            return studentGradeRecords.map<GradeChangeDraftRow>((currentRecord) => ({
              id: currentRecord.id,
              studentId: currentRecord.studentId,
              fullName: currentRecord.fullName || student.name,
              section: section?.code || assignment.sectionCode,
              subjectCode: currentRecord.subjectCode,
              subjectTitle: currentRecord.subjectTitle,
              units,
              academicYear: currentRecord.academicYear,
              semester: currentRecord.semester,
              gradingPeriod: currentRecord.gradingPeriod,
              programType: currentRecord.programType,
              currentGrade: currentRecord.normalizedGrade,
              currentRecord,
            }));
          })
      })
      .sort(
        (left, right) =>
          left.section.localeCompare(right.section) ||
          left.fullName.localeCompare(right.fullName) ||
          left.subjectCode.localeCompare(right.subjectCode),
      );
  }, [
    approvedGradeRecords,
    assignedSectionOptions,
    assignments,
    students,
    subjects,
  ]);

  const getRequestSubjectUnits = (change: InstructorGradeChangeRequest["changes"][number]) => {
    const assignment = assignments.find(item =>
      item.subjectCode.trim().toUpperCase() === change.subjectCode.trim().toUpperCase() &&
      item.academicYear === change.academicYear && item.semester === change.semester &&
      item.sectionCode.trim().toUpperCase() === change.section.trim().toUpperCase());
    return resolveGradeChangeSubjectUnits({
      subjectId: assignment?.subjectId,
      subjectCode: change.subjectCode,
      subjectTitle: change.subjectTitle,
      programType: change.programType,
      semester: change.semester,
      yearLevel: change.currentRecord?.yearLevel,
    }, subjects);
  };

  const handleRequestedGradeChange = (rowId: string, value: string) => {
    const sanitizedValue = sanitizeRequestedGradeInput(value);

    setRequestedGrades((previousValues) => ({
      ...previousValues,
      [rowId]: sanitizedValue,
    }));
  };

  const filteredGradeChangeRows = useMemo(() => {
    const normalizedSearchTerm = gradeSearchTerm.trim().toLowerCase();

    if (!normalizedSearchTerm) {
      return gradeChangeRows;
    }

    return gradeChangeRows.filter((row) =>
      [
        row.studentId,
        row.fullName,
        row.section,
        row.subjectCode,
        row.subjectTitle,
        row.currentGrade,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearchTerm),
    );
  }, [gradeChangeRows, gradeSearchTerm]);

  const handleOpenRequestModal = () => {
    if (!gradeChangeSettings.isOpen) {
      setMessage("Grade change requests are currently closed by the administrator.");
      return;
    }

    setRequestedGrades({});
    setGradeSearchTerm("");
    setMessage("");
    setIsRequestModalOpen(true);
  };

  const handleSubmitGradeChangeRequest = () => {
    if (!instructor || !currentUser?.branch) {
      setMessage("Instructor profile is still loading.");
      return;
    }

    if (!gradeChangeSettings.isOpen) {
      setMessage("Grade change requests are currently closed by the administrator.");
      return;
    }

    const requestedRows = gradeChangeRows
      .map((row) => ({
        row,
        requestedGrade: (requestedGrades[row.id] || "").trim(),
      }))
      .filter((entry) => entry.requestedGrade);
    const errors: string[] = [];
    const errorRows: NonNullable<InstructorGradeChangeRequest["errorRows"]> = [];
    const changes: InstructorGradeChangeRequest["changes"] = [];

    requestedRows.forEach(({ row, requestedGrade }, index) => {
      const rowErrors: string[] = [];

      if (!isRequestedGradeInAllowedRange(requestedGrade)) {
        rowErrors.push("Requested grade must be 70-100.");
      }

      const validationResult =
        rowErrors.length === 0
          ? validateAndNormalizeUploadedGradeRow({
              studentId: row.studentId,
              fullName: row.fullName,
              subjectCode: row.subjectCode,
              subjectTitle: row.subjectTitle,
              grade: requestedGrade,
              unit: row.units === null ? "" : String(row.units),
              gradingPeriod: row.gradingPeriod,
              programType: row.programType,
              academicYear: row.academicYear,
              semester: row.semester,
              branch: currentUser.branch,
            }, undefined, { preserveStudentNumber: row.currentRecord?.studentNumberIsOriginal })
          : null;

      if (
        validationResult &&
        (validationResult.errorReason || !validationResult.normalizedRecord)
      ) {
        rowErrors.push(
          validationResult.errorReason || "Invalid requested grade.",
        );
      }

      if (
        validationResult?.normalizedRecord?.normalizedGrade === row.currentGrade
      ) {
        return;
      }

      if (!row.currentRecord) {
        rowErrors.push("No approved current grade exists for this row.");
      }

      if (rowErrors.length > 0) {
        errors.push(
          ...rowErrors.map(
            (error) => `${row.fullName} - ${row.subjectCode}: ${error}`,
          ),
        );
        errorRows.push({
          sheetName: row.section || "Change of Grades",
          rowNumber: index + 1,
          studentId: row.studentId,
          fullName: row.fullName,
          section: row.section,
          subjectCode: row.subjectCode,
          subjectTitle: row.subjectTitle,
          units: row.units === null ? "" : String(row.units),
          academicYear: row.academicYear,
          semester: row.semester,
          gradingPeriod: row.gradingPeriod,
          programType: row.programType,
          currentGrade: row.currentGrade,
          requestedGrade,
          instructorName: instructor.name,
          errors: rowErrors,
        });
        return;
      }

      if (!validationResult?.normalizedRecord || !row.currentRecord) {
        return;
      }

      changes.push({
        id: `${validationResult.normalizedRecord.id}::${Date.now()}::${changes.length}`,
        studentId: row.studentId,
        fullName: row.fullName,
        section: row.section,
        subjectCode: row.subjectCode,
        subjectTitle: row.subjectTitle,
        units: row.units,
        academicYear: row.academicYear,
        semester: row.semester,
        gradingPeriod: row.gradingPeriod,
        programType: row.programType,
        currentGrade: row.currentGrade,
        requestedGrade: validationResult.normalizedRecord.normalizedGrade,
        currentRecord: row.currentRecord,
        requestedRecord: { ...row.currentRecord, ...validationResult.normalizedRecord },
      });
    });

    if (requestedRows.length === 0) {
      setMessage("Enter at least one requested grade before sending.");
      return;
    }

    if (errors.length > 0) {
      const submittedAt = new Date();
      saveInstructorGradeChangeErrorHistory(currentUser.branch, {
        id: `grade-change-request-${Date.now()}`,
        branch: currentUser.branch,
        instructorId: instructor.id,
        instructorName: instructor.name,
        employeeId: instructor.employeeId,
        fileName: `Grade change request - ${submittedAt.toLocaleString()}`,
        submittedAt: submittedAt.toISOString(),
        status: "Error",
        changes,
        errors,
        errorRows,
      });
      setRequestsVersion((previousValue) => previousValue + 1);
      setIsRequestModalOpen(false);
      setRequestedGrades({});
      setMessage(
        `${changes.length} correct row(s) and ${errorRows.length} error row(s) were saved in history. Nothing was sent to the administrator.`,
      );
      return;
    }

    if (changes.length === 0) {
      setMessage("No grade changes were found. Requested grades matched current grades.");
      return;
    }

    saveInstructorGradeChangeRequest(currentUser.branch, {
      id: `grade-change-request-${Date.now()}`,
      branch: currentUser.branch,
      instructorId: instructor.id,
      instructorName: instructor.name,
      employeeId: instructor.employeeId,
      fileName: `Grade change request - ${new Date().toLocaleString()}`,
      submittedAt: new Date().toISOString(),
      status: "Pending",
      changes,
      errors: [],
      errorRows: [],
    });
    setRequestsVersion((previousValue) => previousValue + 1);
    setIsRequestModalOpen(false);
    setRequestedGrades({});
    setMessage(`${changes.length} grade change request(s) submitted.`);
  };

  const handleToggleDeleteMode = () => {
    setIsDeleteMode((previousValue) => !previousValue);
    setSelectedRequestIds([]);
  };

  const handleToggleRequestSelection = (requestId: string) => {
    setSelectedRequestIds((previousIds) =>
      previousIds.includes(requestId)
        ? previousIds.filter((id) => id !== requestId)
        : [...previousIds, requestId],
    );
  };

  const handleDeleteSelectedRequests = () => {
    if (!currentUser?.branch || selectedRequestIds.length === 0) {
      return;
    }

    const selectedIds = new Set(selectedRequestIds);
    writeInstructorGradeChangeRequests(
      currentUser.branch,
      getInstructorGradeChangeRequests(currentUser.branch).filter(
        (request) => !selectedIds.has(request.id),
      ),
    );
    writeInstructorGradeChangeErrorHistory(
      currentUser.branch,
      getInstructorGradeChangeErrorHistory(currentUser.branch).filter(
        (request) => !selectedIds.has(request.id),
      ),
    );
    setSelectedRequestIds([]);
    setIsDeleteMode(false);
    setRequestsVersion((previousValue) => previousValue + 1);
    setMessage("Selected grade change request(s) deleted.");
  };

  if (isLoading) {
    return (
      <SkeletonPage
        className="instructor-panel"
        eyebrow="Grade corrections"
        title="Change of Grades"
        variant="upload"
      />
    );
  }

  return (
    <div className="instructor-panel">
      <div className="instructor-page-header">
        <div>
          <span>Grade corrections</span>
          <h1>Change of Grades</h1>
        </div>
        <strong>{requests.length} request{requests.length === 1 ? "" : "s"}</strong>
      </div>

      <section className="instructor-actions-panel">
        <button
          type="button"
          onClick={handleOpenRequestModal}
          disabled={!gradeChangeSettings.isOpen}
        >
          <FiEdit3 />
          Request Grade Change
        </button>
      </section>

      {!gradeChangeSettings.isOpen ? (
        <p className="instructor-message">
          Grade change requests are currently closed by the administrator.
        </p>
      ) : null}
      {message ? <p className="instructor-message">{message}</p> : null}

      <section className="instructor-section">
        <div className="instructor-section-header">
          <h2>My Grade Change Requests</h2>
          <div className="instructor-section-actions">
            {isDeleteMode ? (
              <>
                <button type="button" onClick={handleToggleDeleteMode}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelectedRequests}
                  disabled={selectedRequestIds.length === 0}
                >
                  <FiTrash2 /> Delete Selected
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleToggleDeleteMode}
                disabled={requests.length === 0}
              >
                <FiTrash2 /> Delete
              </button>
            )}
          </div>
        </div>
        <div className="instructor-table-wrap">
          <table className="instructor-table">
            <thead>
              <tr>
                {isDeleteMode ? <th>Select</th> : null}
                <th>Date</th>
                <th>Request</th>
                <th>Correct</th>
                <th>Errors</th>
                <th>Status</th>
                <th className="instructor-table-actions-heading">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  {isDeleteMode ? (
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedRequestIds.includes(request.id)}
                        onChange={() => handleToggleRequestSelection(request.id)}
                        aria-label={`Select ${request.fileName}`}
                      />
                    </td>
                  ) : null}
                  <td>{new Date(request.submittedAt).toLocaleString()}</td>
                  <td title={request.fileName}>
                    <span className="instructor-compact-file-name">
                      {getCompactFileName(request.fileName)}
                    </span>
                  </td>
                  <td>{request.changes.length}</td>
                  <td>{request.errorRows?.length ?? 0}</td>
                  <td>{request.status}</td>
                  <td className="instructor-table-actions-cell">
                    <div className="instructor-table-actions">
                      <button
                        type="button"
                        onClick={() => setViewingRequest(request)}
                        disabled={request.changes.length === 0}
                      >
                        <FiCheckCircle /> Correct
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewingErrorRequest(request)}
                        disabled={(request.errorRows?.length ?? 0) === 0}
                      >
                        <FiAlertTriangle /> Errors
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={isDeleteMode ? 7 : 6}>
                    No grade change requests yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {isRequestModalOpen ? (
        <div
          className="instructor-file-modal-overlay"
          role="presentation"
          onClick={() => setIsRequestModalOpen(false)}
        >
          <section
            className="instructor-file-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructor-create-change-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="instructor-file-modal-header">
              <div>
                <span>Request grade correction</span>
                <h2 id="instructor-create-change-modal-title">
                  Current Approved Grades
                </h2>
                <p>
                  Enter a requested grade only for rows that need correction.
                  Blank rows are ignored. Requested grades must be 70-100.
                </p>
              </div>
              <div className="instructor-file-modal-actions">
                <button
                  type="button"
                  onClick={handleSubmitGradeChangeRequest}
                >
                  Send Request
                </button>
                <button
                  type="button"
                  className="instructor-file-modal-close"
                  aria-label="Close request modal"
                  onClick={() => setIsRequestModalOpen(false)}
                >
                  <FiX />
                </button>
              </div>
            </div>

            <div className="instructor-grade-change-search">
              <FiSearch aria-hidden="true" />
              <input
                type="search"
                value={gradeSearchTerm}
                onChange={(event) => setGradeSearchTerm(event.target.value)}
                placeholder="Search student, section, or subject"
                aria-label="Search grade change rows"
              />
            </div>

            <div className="instructor-file-table-wrap">
              <table className="instructor-file-table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Full Name</th>
                    <th>Section</th>
                    <th>Subject Code</th>
                    <th>Subject Title</th>
                    <th>Units</th>
                    <th>Current Grade</th>
                    <th>Requested Grade</th>
                    <th>Academic Year</th>
                    <th>Semester / Quarter</th>
                    <th>Program</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGradeChangeRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.studentId}</td>
                      <td>{row.fullName}</td>
                      <td>{row.section}</td>
                      <td>{row.subjectCode}</td>
                      <td>{row.subjectTitle}</td>
                      <td>{row.units ?? "-"}</td>
                      <td>{row.currentGrade}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="instructor-grade-change-input"
                          value={requestedGrades[row.id] || ""}
                          onChange={(event) =>
                            handleRequestedGradeChange(row.id, event.target.value)
                          }
                          disabled={!row.currentRecord}
                          placeholder={
                            !row.currentRecord
                              ? "Unavailable"
                              : "70-100"
                          }
                        />
                      </td>
                      <td>{row.academicYear}</td>
                      <td>{formatSemesterAndQuarter(row)}</td>
                      <td>{row.programType}</td>
                    </tr>
                  ))}
                  {gradeChangeRows.length === 0 ? (
                    <tr>
                      <td colSpan={11}>
                        No approved grades were found for the selected section
                        and term.
                      </td>
                    </tr>
                  ) : filteredGradeChangeRows.length === 0 ? (
                    <tr>
                      <td colSpan={11}>
                        No students or subjects match your search.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {viewingRequest ? (
        <div
          className="instructor-file-modal-overlay"
          role="presentation"
          onClick={() => setViewingRequest(null)}
        >
          <section
            className="instructor-file-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructor-change-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="instructor-file-modal-header">
              <div>
                <span>Grade change request</span>
                <h2 id="instructor-change-modal-title">
                  {viewingRequest.fileName}
                </h2>
                <p>
                  {viewingRequest.changes.length.toLocaleString()} requested
                  change{viewingRequest.changes.length === 1 ? "" : "s"}.
                </p>
              </div>
              <div className="instructor-file-modal-actions">
                <button
                  type="button"
                  className="instructor-file-modal-close"
                  aria-label="Close grade change request"
                  onClick={() => setViewingRequest(null)}
                >
                  <FiX />
                </button>
              </div>
            </div>

            <div className="instructor-file-table-wrap">
              <table className="instructor-file-table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Full Name</th>
                    <th>Section</th>
                    <th>Subject Code</th>
                    <th>Subject Title</th>
                    <th>Units</th>
                    <th>Current Grade</th>
                    <th>Requested Grade</th>
                    <th>Academic Year</th>
                    <th>Semester / Quarter</th>
                    <th>Program</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingRequest.changes.map((change) => (
                    <tr key={change.id}>
                      <td>{change.studentId}</td>
                      <td>{change.fullName}</td>
                      <td>{change.section}</td>
                      <td>{change.subjectCode}</td>
                      <td>{change.subjectTitle}</td>
                      <td>{getRequestSubjectUnits(change) ?? "-"}</td>
                      <td>{change.currentGrade}</td>
                      <td>{change.requestedGrade}</td>
                      <td>{change.academicYear}</td>
                      <td>{formatSemesterAndQuarter(change)}</td>
                      <td>{change.programType}</td>
                    </tr>
                  ))}
                  {viewingRequest.changes.length === 0 ? (
                    <tr>
                      <td colSpan={11}>No grade changes were found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {viewingErrorRequest ? (
        <div
          className="instructor-error-modal-overlay"
          role="presentation"
          onClick={() => setViewingErrorRequest(null)}
        >
          <section
            className="instructor-error-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructor-change-errors-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="instructor-error-modal-header">
              <div>
                <span>Grade change request errors</span>
                <h2 id="instructor-change-errors-modal-title">
                  {viewingErrorRequest.fileName}
                </h2>
                <p>
                  {(viewingErrorRequest.errorRows?.length ?? 0).toLocaleString()} row
                  {(viewingErrorRequest.errorRows?.length ?? 0) === 1 ? "" : "s"}{" "}
                  need correction.
                </p>
              </div>
              <button
                type="button"
                className="instructor-error-modal-close"
                aria-label="Close grade change errors"
                onClick={() => setViewingErrorRequest(null)}
              >
                <FiX />
              </button>
            </div>

            <div className="instructor-error-table-wrap">
              <table className="instructor-error-table instructor-grade-change-error-table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Full Name</th>
                    <th>Section</th>
                    <th>Subject</th>
                    <th>Current Grade</th>
                    <th>Requested Grade</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingErrorRequest.errorRows ?? []).map((row, index) => (
                    <tr
                      key={`${row.studentId}-${row.subjectCode}-${row.rowNumber}-${index}`}
                      className="instructor-error-row"
                    >
                      <td>{row.studentId}</td>
                      <td>{row.fullName}</td>
                      <td>{row.section || "-"}</td>
                      <td>
                        <strong>{row.subjectCode}</strong>
                        <br />
                        {row.subjectTitle}
                      </td>
                      <td>{row.currentGrade || "-"}</td>
                      <td>{row.requestedGrade || "-"}</td>
                      <td>
                        <ul className="instructor-error-problems">
                          {row.errors.map((error) => (
                            <li key={error}>{error}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
