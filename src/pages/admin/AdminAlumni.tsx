import TablePagination from "../../components/common/TablePagination";
import { useConfirmation } from "../../hooks/useConfirmation";
import { useState, useEffect, useMemo } from "react";
import {
  FaSearch,
  FaUserGraduate,
  FaGraduationCap,
  FaUndo,
} from "react-icons/fa";
import { ToastContainer } from "../../components/common/Toast";
import AdminSidebar from "../../components/admin/AdminSidebar";
import {
  BACKUP_RESTORE_APPLIED_EVENT,
  forgetRememberedAlumniStudentStatus,
  getRememberedAlumniStudentStatus,
  rememberAlumniStudentStatus,
} from "../../services/backupApi";
import {
  getCurrentBranch,
  getStudentCredentialOverview,
  refreshStudentDetailCredentials,
  type StudentStorageRecord,
} from "../../services/adminStorage";
import {
  getStudentAcademicStanding,
  getStudentGradeRecords,
  getRequiredShsQuarterLabelsForSemester,
  type StoredStudentGradeRecord,
} from "../../services/studentGrades";
import {
  fetchAdminStudents,
  updateAdminStudentStatus,
} from "../../services/adminStudentsApi";
import { formatContactNumber } from "../../utils/contactNumber";
import "../../styles/admin/admin-alumni.css";
import "../../styles/admin/student-details-grades.css";

interface AlumniProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface AlumniStudent {
  id: string;
  fullName: string;
  program: string;
  yearGraduated: string;
  contact: string;
  email?: string;
  becameAlumniOn: string;
  branch?: string;
  studentSnapshot?: StudentStorageRecord;
}

interface StudentRecord {
  id: string;
  name: string;
  program: string;
  yearLevel: string;
  strandOrCourse?: string;
  contact: string;
  email: string;
  status?: "Complete" | "Incomplete" | "Archived" | "Graduated";
  branch?: string;
  studentSnapshot?: StudentStorageRecord;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const buildAlumniShsGradeRows = (records: StoredStudentGradeRecord[], semester: string) => {
  const quarterLabels = getRequiredShsQuarterLabelsForSemester(semester);
  const grouped = new Map<string, {
    subjectCode: string;
    subjectTitle: string;
    grades: Map<string, StoredStudentGradeRecord>;
  }>();

  for (const record of records) {
    if (!quarterLabels.includes(record.gradingPeriod)) continue;
    const key = `${record.subjectCode.trim().toUpperCase()}::${record.subjectTitle.trim().toUpperCase()}`;
    const row = grouped.get(key) ?? {
      subjectCode: record.subjectCode,
      subjectTitle: record.subjectTitle,
      grades: new Map<string, StoredStudentGradeRecord>(),
    };
    row.grades.set(record.gradingPeriod, record);
    grouped.set(key, row);
  }

  return Array.from(grouped.entries()).map(([key, row]) => {
    const quarterRecords = quarterLabels.map((label) => row.grades.get(label));
    const grades = quarterRecords.map((record) => record?.numericGrade);
    const finalGrade = grades.every((grade) => typeof grade === "number" && Number.isFinite(grade))
      ? Math.floor(grades.reduce<number>((sum, grade) => sum + (grade ?? 0), 0) / quarterLabels.length)
      : null;
    return {
      key,
      subjectCode: row.subjectCode,
      subjectTitle: row.subjectTitle,
      quarterGrades: quarterRecords.map((record) => record?.normalizedGrade ?? "—"),
      finalGrade,
      result: finalGrade === null ? "—" : finalGrade >= 75 ? "Passed" : "Failed",
    };
  }).sort((left, right) => left.subjectCode.localeCompare(right.subjectCode));
};

const formatDetailValue = (value?: string | number | null) => {
  if (value === null || value === undefined) {
    return "Not provided";
  }

  const normalizedValue = String(value).trim();
  return normalizedValue || "Not provided";
};

const formatStoredDate = (value?: string | null) => {
  if (!value) {
    return "Not provided";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString();
};

const mapStoredStudentToUi = (student: StudentStorageRecord): StudentRecord => ({
  id: student.id,
  name: student.name,
  program: student.program,
  yearLevel: student.yearLevel,
  strandOrCourse: student.strandOrCourse || "",
  contact: student.contact || "",
  email: student.email,
  status: student.status,
  branch: student.branch,
  studentSnapshot: { ...student },
});

const mapStudentToAlumni = (student: StudentRecord): AlumniStudent => ({
  id: student.id,
  fullName: student.name,
  program: student.strandOrCourse || student.program,
  yearGraduated: student.studentSnapshot?.yearCompletion || "",
  contact: student.contact || "",
  email: student.email || undefined,
  becameAlumniOn: "",
  branch: student.branch || student.studentSnapshot?.branch,
  studentSnapshot: student.studentSnapshot
    ? { ...student.studentSnapshot, status: "Graduated" }
    : undefined,
});

const safelyRememberAlumniStudentStatus = (
  studentId: string,
  status: StudentStorageRecord["status"],
) => {
  try {
    rememberAlumniStudentStatus(studentId, status);
  } catch (error) {
    console.warn("Unable to cache the student's previous status for restore.", error);
  }
};

const safelyGetRememberedAlumniStudentStatus = (studentId: string) => {
  try {
    return getRememberedAlumniStudentStatus(studentId);
  } catch (error) {
    console.warn("Unable to read the cached previous student status.", error);
    return undefined;
  }
};

const safelyForgetRememberedAlumniStudentStatus = (studentId: string) => {
  try {
    forgetRememberedAlumniStudentStatus(studentId);
  } catch (error) {
    console.warn("Unable to clear the cached previous student status.", error);
  }
};

export default function AdminAlumni({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: AlumniProps) {
  const requestConfirmation = useConfirmation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingAlumni, setViewingAlumni] = useState<AlumniStudent | null>(
    null,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [alumni, setAlumni] = useState<AlumniStudent[]>([]);
  const [restoringAlumniId, setRestoringAlumniId] = useState<string | null>(null);
  const [credentialRefreshVersion, setCredentialRefreshVersion] = useState(0);
  const [credentialLoadError, setCredentialLoadError] = useState("");
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const currentBranch = getCurrentBranch();

  // Toast functions
  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const loadAlumniAndStudents = async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const storedStudents = await fetchAdminStudents(currentBranch);
      const mappedStudents = storedStudents.map(mapStoredStudentToUi);
      setStudents(mappedStudents);
      setAlumni(
        mappedStudents
          .filter((student) => student.status === "Graduated")
          .map(mapStudentToAlumni),
      );
    } catch (error) {
      console.error("Failed to load alumni data", error);
      setAlumni([]);
      setStudents([]);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load alumni records from the live service.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAlumniAndStudents();
  }, []);

  useEffect(() => {
    const handleBackupRestoreApplied = () => {
      void loadAlumniAndStudents();
    };

    window.addEventListener(
      BACKUP_RESTORE_APPLIED_EVENT,
      handleBackupRestoreApplied as EventListener,
    );

    return () => {
      window.removeEventListener(
        BACKUP_RESTORE_APPLIED_EVENT,
        handleBackupRestoreApplied as EventListener,
      );
    };
  }, []);

  const handleSidebarToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  const filteredAlumni = alumni.filter((alum) => {
    const matchesSearch =
      alum.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alum.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesYear =
      selectedYear === "" || alum.yearGraduated === selectedYear;

    return matchesSearch && matchesYear;
  });

  const sortedAlumni = [...filteredAlumni].sort((left, right) => {
    const leftNumber = Number(left.id);
    const rightNumber = Number(right.id);

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return sortDirection === "asc"
        ? leftNumber - rightNumber
        : rightNumber - leftNumber;
    }

    const leftValue = left.id.toLowerCase();
    const rightValue = right.id.toLowerCase();
    if (leftValue < rightValue) return sortDirection === "asc" ? -1 : 1;
    if (leftValue > rightValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(
    1,
    Math.ceil(sortedAlumni.length / ITEMS_PER_PAGE),
  );
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedAlumni = sortedAlumni.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  const toggleIdSort = () => {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedYear]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const isStudentEligibleForAlumniTransfer = (student: StudentRecord) => {
    const normalizedProgram = student.program.trim().toLowerCase();
    const normalizedYearLevel = student.yearLevel.trim().toLowerCase();

    if (normalizedProgram !== "shs") {
      return normalizedYearLevel === "4th year";
    }

    if (normalizedProgram === "shs") {
      return (
        normalizedYearLevel === "grade 12" ||
        normalizedYearLevel === "g12" ||
        normalizedYearLevel === "12"
      );
    }

    return false;
  };

  const availableStudents = students.filter(
    (student) =>
      student.status !== "Archived" &&
      student.status !== "Graduated" &&
      isStudentEligibleForAlumniTransfer(student) &&
      !alumni.some((alum) => alum.id === student.id),
  );

  const handleAddFromStudent = async (student: StudentRecord) => {
    try {
      const graduatedRecord = await updateAdminStudentStatus({
        branch: student.branch || currentBranch,
        studentNumber: student.id,
        status: "Graduated",
      });
      safelyRememberAlumniStudentStatus(student.id, student.status || "Complete");

      const graduatedStudent = mapStoredStudentToUi(graduatedRecord);
      const nextAlumniRecord = mapStudentToAlumni(graduatedStudent);
      const nextAlumni = [
        ...alumni.filter((record) => record.id !== student.id),
        nextAlumniRecord,
      ];
      setAlumni(nextAlumni);
      setStudents((prev) =>
        prev.map((record) =>
          record.id === graduatedStudent.id
            ? { ...record, ...graduatedStudent }
            : record,
        ),
      );
      setIsAddModalOpen(false);
      addToast(`${student.name} added to alumni successfully!`, "success");
    } catch (error) {
      console.error("Failed to add alumni from student", error);
      addToast(
        error instanceof Error ? error.message : "Unable to add alumni record.",
        "error",
      );
    }
  };

  const handleRestoreAlumni = async (alumniStudent: AlumniStudent) => {
    const shouldContinue = (await requestConfirmation(
      `Restore ${alumniStudent.fullName} back to Students?`,
      {
        title: "Restore Student",
        confirmLabel: "Restore",
      },
    ));
    if (!shouldContinue) {
      return;
    }

    setRestoringAlumniId(alumniStudent.id);

    try {
      const rememberedStatus = safelyGetRememberedAlumniStudentStatus(alumniStudent.id);
      const restoredStatus =
        rememberedStatus === "Archived" || rememberedStatus === "Graduated"
          ? "Complete"
          : rememberedStatus || "Complete";
      const restoredBranch =
        alumniStudent.branch || alumniStudent.studentSnapshot?.branch || currentBranch;

      // The Student List is backed by Supabase. Update the existing student
      // profile there before removing the alumni record so the profile and its
      // linked credentials remain attached and become visible again.
      const restoredStoredStudent = await updateAdminStudentStatus({
        branch: restoredBranch,
        studentNumber: alumniStudent.id,
        status: restoredStatus,
      });

      const nextAlumni = alumni.filter((record) => record.id !== alumniStudent.id);
      setAlumni(nextAlumni);
      const restoredStudentForUi = mapStoredStudentToUi(restoredStoredStudent);
      setStudents((prev) =>
        prev.some((student) => student.id === alumniStudent.id)
          ? prev.map((student) =>
              student.id === alumniStudent.id
                ? { ...student, ...restoredStudentForUi }
                : student,
            )
          : [restoredStudentForUi, ...prev],
      );
      safelyForgetRememberedAlumniStudentStatus(alumniStudent.id);

      if (viewingAlumni?.id === alumniStudent.id) {
        closeViewModal();
      }

      addToast(`${alumniStudent.fullName} restored to students successfully.`, "success");
    } catch (error) {
      console.error("Failed to restore alumni record", error);
      addToast(
        error instanceof Error ? error.message : "Unable to restore alumni record.",
        "error",
      );
    } finally {
      setRestoringAlumniId(null);
    }
  };

  const availableYears = Array.from(
    new Set(alumni.map((alum) => alum.yearGraduated).filter(Boolean)),
  ).sort((a, b) => Number(b) - Number(a));

  const viewingStudentSnapshot = useMemo(() => {
    return viewingAlumni?.studentSnapshot || null;
  }, [viewingAlumni]);

  const viewingStudentBranch =
    viewingStudentSnapshot?.branch || getCurrentBranch();
  const viewingStudentProgram =
    viewingStudentSnapshot?.program ||
    (viewingAlumni?.program === "SHS" ? "SHS" : "College");
  const viewingStudentGrades = useMemo(
    () =>
      viewingAlumni
        ? getStudentGradeRecords({
            branch: viewingStudentBranch,
            studentId: viewingAlumni.id,
          })
        : [],
    [viewingAlumni, viewingStudentBranch],
  );
  const viewingStudentStanding = viewingAlumni
    ? getStudentAcademicStanding({
        branch: viewingStudentBranch,
        program: viewingStudentProgram,
        studentId: viewingAlumni.id,
      })
    : null;
  const viewingStudentCredentials = useMemo(
    () =>
      viewingAlumni
        ? getStudentCredentialOverview({
            branch: viewingStudentBranch,
            studentNumber: viewingAlumni.id,
            trackingNumber: viewingStudentSnapshot?.trackingNumber,
            studentSnapshot: viewingStudentSnapshot,
          })
        : null,
    [
      viewingAlumni,
      viewingStudentBranch,
      viewingStudentSnapshot,
      credentialRefreshVersion,
    ],
  );

  useEffect(() => {
    if (
      !viewingAlumni ||
      !viewingStudentSnapshot
    ) {
      return;
    }

    let isCurrentView = true;
    setCredentialLoadError("");
    setLoadingCredentials(true);
    void refreshStudentDetailCredentials(viewingStudentSnapshot)
      .then(() => {
        if (isCurrentView) {
          setCredentialRefreshVersion((version) => version + 1);
        }
      })
      .catch((error) => {
        console.warn("Unable to refresh alumni credential links.", error);
        if (isCurrentView) setCredentialLoadError("Unable to refresh credential copies. Please reopen this student to retry.");
      })
      .finally(() => {
        if (isCurrentView) setLoadingCredentials(false);
      });

    return () => {
      isCurrentView = false;
    };
  }, [viewingAlumni, viewingStudentBranch, viewingStudentSnapshot]);
  const viewingStudentGradeTerms = useMemo(() => {
    const termMap = new Map<string, StoredStudentGradeRecord[]>();
    viewingStudentGrades.forEach((record) => {
      const key = `${record.academicYear}::${record.semester}`;
      termMap.set(key, [...(termMap.get(key) ?? []), record]);
    });
    return Array.from(termMap.entries()).map(([key, records]) => {
      const [academicYear, semester] = key.split("::");
      return { academicYear, semester, records };
    });
  }, [viewingStudentGrades]);

  const openViewModal = (alumniStudent: AlumniStudent) => {
    setCredentialLoadError("");
    setLoadingCredentials(Boolean(alumniStudent.studentSnapshot));
    setViewingAlumni(alumniStudent);
  };

  const closeViewModal = () => {
    setViewingAlumni(null);
  };

  return (
    <div className="dashboard-layout">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <AdminSidebar
        isOpen={isSidebarOpen}
        onClose={handleSidebarClose}
        onLogout={onLogout}
        loggedInUsername={loggedInUsername}
        loggedInRole={loggedInRole}
        canAccessBackup={canAccessBackup}
      />

      <button
        className="menu-toggle"
        onClick={handleSidebarToggle}
        aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
      >
        {isSidebarOpen ? "✕" : "☰"}
      </button>

      {/* Main content */}
      <main className="alumni-content">
        <header className="page-header">
          <h1>Alumni</h1>
          <p>
            {isLoading
              ? "Loading alumni from the live service..."
              : loadError
                ? "Alumni data could not be loaded."
              : "View and manage alumni records from all programs"}
          </p>
        </header>

        {/* Controls: Search + Year Filter + Add */}
        <div className="controls">
          <div className="search-wrapper">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search by Name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <select
            className="year-filter"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            <option value="">All Years</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <button className="add-btn" onClick={() => setIsAddModalOpen(true)}>
            + Add Alumni
          </button>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="alumni-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="alumni-table-sort-btn"
                    onClick={toggleIdSort}
                  >
                    STUDENT ID {sortDirection === "asc" ? "↑" : "↓"}
                  </button>
                </th>
                <th>FULL NAME</th>
                <th>PROGRAM</th>
                <th>YEAR GRADUATED</th>
                <th>CONTACT</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAlumni.length > 0 ? (
                paginatedAlumni.map((alum) => (
                  <tr key={alum.id}>
                    <td>{alum.id}</td>
                    <td className="full-name-cell">{alum.fullName}</td>
                    <td>{alum.program}</td>
                    <td>{alum.yearGraduated || "—"}</td>
                    <td>{formatContactNumber(alum.contact) || "—"}</td>
                    <td>
                      <div className="alumni-action-group">
                        <button
                          className="view-btn"
                          type="button"
                          onClick={() => openViewModal(alum)}
                          disabled={restoringAlumniId !== null}
                        >
                          View Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="no-results">
                    {isLoading
                      ? "Loading alumni..."
                      : loadError || "No alumni records found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredAlumni.length > 0 && (
          <TablePagination page={currentPage} pageSize={ITEMS_PER_PAGE} totalItems={filteredAlumni.length} onPageChange={setCurrentPage} label="Alumni pages" />
        )}

        {/* Add Alumni Modal */}
        {isAddModalOpen && (
          <div className="modal-overlay">
            <div className="modal student-picker-modal">
              <div className="modal-header">
                <h2>
                  <FaUserGraduate /> Select Student to Add
                </h2>
                <button
                  className="modal-close"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className="modal-table-container">
                <table className="alumni-table">
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Course/Strand</th>
                      <th>Grade Year</th>
                      <th>Email</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableStudents.length > 0 ? (
                      availableStudents.map((student) => (
                        <tr key={student.id}>
                          <td>{student.id}</td>
                          <td className="full-name-cell">{student.name}</td>
                          <td>{student.strandOrCourse || student.program}</td>
                          <td>{student.yearLevel}</td>
                          <td>{student.email}</td>
                          <td>
                            <button
                              className="save-btn"
                              type="button"
                              onClick={() => handleAddFromStudent(student)}
                            >
                              Add
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="no-results">
                          {isLoading
                            ? "Loading students..."
                            : loadError || "No available students to add."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Alumni Modal */}
        {viewingAlumni && (
          <div className="modal-overlay">
            <div className="modal view-modal">
              <div className="modal-header">
                <h2>
                  <FaGraduationCap /> Alumni Details
                </h2>
                <button className="modal-close" onClick={closeViewModal}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                <section className="alumni-detail-section">
                  <h3>Student Information</h3>
                  <div className="alumni-detail-grid">
                    {[
                      ["Student ID", viewingAlumni.id],
                      ["Tracking Number", viewingStudentSnapshot?.trackingNumber],
                      [
                        "Full Name",
                        viewingStudentSnapshot?.name || viewingAlumni.fullName,
                      ],
                      ["Branch", viewingStudentBranch],
                      ["Program", viewingStudentProgram],
                      [
                        viewingStudentProgram === "SHS" ? "Strand" : "Course",
                        viewingStudentSnapshot?.strandOrCourse || viewingAlumni.program,
                      ],
                      ["Year Level", viewingStudentSnapshot?.yearLevel],
                      ["Section", viewingStudentSnapshot?.section || "N/A"],
                      ["Student Status", viewingStudentSnapshot?.status],
                      ["Admission Type", viewingStudentSnapshot?.studentStatus],
                      ["Academic Standing", viewingStudentStanding?.label],
                      [
                        "Submitted Date",
                        formatStoredDate(viewingStudentSnapshot?.documentSubmitted),
                      ],
                      ["Year Graduated", viewingAlumni.yearGraduated || "Not set"],
                      ["Became Alumni On", formatStoredDate(viewingAlumni.becameAlumniOn)],
                    ].map(([label, value]) => (
                      <div className="detail-item" key={label}>
                        <span className="detail-label">{label}:</span>
                        <span className="detail-value">
                          {formatDetailValue(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="alumni-detail-section">
                  <h3>Personal and Contact Details</h3>
                  <div className="alumni-detail-grid">
                    {[
                      ["Email", viewingStudentSnapshot?.email || viewingAlumni.email],
                      [
                        "Contact Number",
                        formatContactNumber(
                          viewingStudentSnapshot?.contact || viewingAlumni.contact,
                        ),
                      ],
                      ["Gender", viewingStudentSnapshot?.gender],
                      ["Civil Status", viewingStudentSnapshot?.civilStatus],
                      ["Guardian Name", viewingStudentSnapshot?.guardianName],
                      [
                        "Guardian Contact",
                        formatContactNumber(viewingStudentSnapshot?.guardianContact),
                      ],
                      ["Home Address", viewingStudentSnapshot?.address],
                    ].map(([label, value]) => (
                      <div
                        className={`detail-item ${
                          label === "Home Address" ? "detail-item-full" : ""
                        }`}
                        key={label}
                      >
                        <span className="detail-label">{label}:</span>
                        <span className="detail-value">
                          {formatDetailValue(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="alumni-detail-section">
                  <h3>Credentials Copy</h3>
                  {loadingCredentials && <p className="alumni-detail-summary" role="status">Loading credential copies…</p>}
                  {credentialLoadError && <p className="alumni-detail-summary" role="alert">{credentialLoadError}</p>}
                  {viewingStudentCredentials?.summary ? (
                    <p className="alumni-detail-summary">
                      {viewingStudentCredentials.summary.submitted}/
                      {viewingStudentCredentials.summary.total} submitted -
                      {" "}
                      {viewingStudentCredentials.summary.overallStatus}
                    </p>
                  ) : null}
                  {viewingStudentCredentials?.items.length ? (
                    <div className="alumni-credential-list">
                      {viewingStudentCredentials.items.map((credential) => (
                        <div
                          className="alumni-credential-item"
                          key={credential.code}
                        >
                          <div>
                            <strong>{credential.name}</strong>
                            <span>{credential.statusLabel}</span>
                          </div>
                          {credential.url ? (
                            <a
                              href={credential.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View Copy
                            </a>
                          ) : (
                            <span className="alumni-muted">No file</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="alumni-empty-state">
                      {loadingCredentials ? "Checking for linked credential copies…" : "No linked credential copies found."}
                    </p>
                  )}
                </section>

                <section className="alumni-detail-section">
                  <h3>Uploaded Grades</h3>
                  {viewingStudentGradeTerms.length > 0 ? (
                    <div className="alumni-grade-sections">
                      {viewingStudentGradeTerms.map((term) => (
                        <div
                          className="alumni-grade-term"
                          key={`${term.academicYear}-${term.semester}`}
                        >
                          <div className="alumni-grade-term-header">
                            <strong>{term.semester}</strong>
                            <span>{term.academicYear}</span>
                          </div>
                          <div className="alumni-grade-table-wrapper">
                            <table
                              className={[
                                "alumni-grade-table",
                                "student-details-grade-table",
                                "student-details-alumni-grade-table",
                                viewingStudentProgram === "SHS" ? "student-details-alumni-shs-grade-table" : "",
                              ].join(" ")}
                            >
                              <thead>
                                <tr>
                                  <th>Subject Code</th>
                                  <th>Subject Title</th>
                                  {viewingStudentProgram === "SHS" ? (
                                    <>
                                      {getRequiredShsQuarterLabelsForSemester(term.semester).map((quarter) => (
                                        <th key={quarter}>{quarter}</th>
                                      ))}
                                      <th>Final Grade</th>
                                    </>
                                  ) : (
                                    <>
                                      <th>Period</th>
                                      <th>Grade</th>
                                      <th>Units</th>
                                    </>
                                  )}
                                  <th>Result</th>
                                </tr>
                              </thead>
                              <tbody>
                                {viewingStudentProgram === "SHS" ? (
                                  buildAlumniShsGradeRows(term.records, term.semester).map((row) => (
                                    <tr key={row.key}>
                                      <td>{row.subjectCode}</td>
                                      <td>{row.subjectTitle}</td>
                                      {row.quarterGrades.map((grade, index) => (
                                        <td key={index}>{grade}</td>
                                      ))}
                                      <td>{row.finalGrade ?? "—"}</td>
                                      <td>{row.result}</td>
                                    </tr>
                                  ))
                                ) : term.records.map((record) => (
                                  <tr key={record.id}>
                                    <td>{record.subjectCode}</td>
                                    <td>{record.subjectTitle}</td>
                                    <td>{record.gradingPeriod}</td>
                                    <td>{record.normalizedGrade}</td>
                                    <td>{record.units ?? "N/A"}</td>
                                    <td>{record.evaluation}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="alumni-empty-state">No uploaded grades yet.</p>
                  )}
                </section>
                {!viewingStudentSnapshot ? (
                  <p className="alumni-detail-note">
                    Older alumni records may only show the basic alumni fields
                    because their original student snapshot was not saved yet.
                  </p>
                ) : null}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="restore-btn"
                  onClick={() => handleRestoreAlumni(viewingAlumni)}
                  disabled={restoringAlumniId !== null}
                >
                  <FaUndo />
                  {restoringAlumniId === viewingAlumni.id
                    ? "Restoring..."
                    : "Restore to Students"}
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={closeViewModal}
                  disabled={restoringAlumniId !== null}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
