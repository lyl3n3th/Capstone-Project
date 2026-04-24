import { useEffect, useMemo, useState } from "react";
import { FaSearch, FaTrash, FaUndo } from "react-icons/fa";
import { MdArchive } from "react-icons/md";
import AdminSidebar from "../../components/admin/AdminSidebar";
import { ToastContainer } from "../../components/common/Toast";
import { useAuth } from "../../hooks/useAuth";
import { deleteAdmissionApplication } from "../../services/admission";
import {
  getStudentsForBranch,
  normalizeBranchName,
  readBranchScopedData,
  readStoredStudents,
  writeBranchScopedData,
  writeStoredStudents,
} from "../../services/adminStorage";
import "../../styles/admin/admin-trash.css";

interface ArchiveProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface Student {
  recordId?: number;
  id: string;
  trackingNumber?: string;
  name: string;
  program: string;
  yearLevel: string;
  documentSubmitted: string;
  contact: string;
  email: string;
  address: string;
  status: "Complete" | "Incomplete" | "Archived";
  branch: string;
}

interface Enrollee {
  id: string;
  trackingNumber: string;
  studentNumber?: string;
  fullName: string;
  program: string;
  yearLevel: string;
  branch: string;
  personalInfo: {
    contactNumber: string;
  };
  archivedAt?: string;
  archivedByRole?: "Admin" | "Registrar";
}

interface ArchivedTrashItem {
  key: string;
  kind: "Student" | "Enrollee";
  identifier: string;
  name: string;
  program: string;
  yearLevel: string;
  contact: string;
  student?: Student;
  enrollee?: Enrollee;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const STUDENTS_API_URL = `${API_BASE_URL}/api/students/`;
const ITEMS_PER_PAGE = 10;

export default function AdminTrash({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: ArchiveProps) {
  const { currentUser } = useAuth();
  const currentBranch = normalizeBranchName(currentUser?.branch);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>(
    () => getStudentsForBranch(currentBranch) as Student[],
  );
  const [enrollees, setEnrollees] = useState<Enrollee[]>(
    () =>
      readBranchScopedData<Enrollee[]>("enrollees", currentBranch) ?? [],
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [recordTypeFilter, setRecordTypeFilter] = useState<
    "All Records" | ArchivedTrashItem["kind"]
  >("All Records");
  const [filterProgram, setFilterProgram] = useState("All Programs");
  const [filterYearLevel, setFilterYearLevel] = useState("All Year Levels");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingTrash, setIsProcessingTrash] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  const handleSidebarToggle = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    setIsLoading(true);

    try {
      setStudents(getStudentsForBranch(currentBranch) as Student[]);
      setEnrollees(
        readBranchScopedData<Enrollee[]>("enrollees", currentBranch) ?? [],
      );
    } catch (error) {
      console.error("Failed to load archived records", error);
      addToast("Unable to load Archive records for this branch.", "error");
      setStudents(getStudentsForBranch(currentBranch) as Student[]);
      setEnrollees(
        readBranchScopedData<Enrollee[]>("enrollees", currentBranch) ?? [],
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentBranch]);

  useEffect(() => {
    const studentsFromOtherBranches = readStoredStudents().filter(
      (student) => normalizeBranchName(student.branch) !== currentBranch,
    );

    writeStoredStudents([...studentsFromOtherBranches, ...students]);
  }, [students, currentBranch]);

  useEffect(() => {
    writeBranchScopedData("enrollees", currentBranch, enrollees);
  }, [currentBranch, enrollees]);

  const archivedStudents = students.filter(
    (student) => student.status === "Archived",
  );
  const archivedEnrollees = enrollees.filter((enrollee) => enrollee.archivedAt);

  const archivedRecords = useMemo<ArchivedTrashItem[]>(() => {
    const studentRecords = archivedStudents.map((student) => ({
      key: `student-${student.id}`,
      kind: "Student" as const,
      identifier: student.id,
      name: student.name,
      program: student.program,
      yearLevel: student.yearLevel,
      contact: student.contact || "",
      student,
    }));

    const enrolleeRecords = archivedEnrollees.map((enrollee) => ({
      key: `enrollee-${enrollee.id}`,
      kind: "Enrollee" as const,
      identifier: enrollee.studentNumber || enrollee.trackingNumber || enrollee.id,
      name: enrollee.fullName,
      program: enrollee.program,
      yearLevel: enrollee.yearLevel,
      contact: enrollee.personalInfo.contactNumber || "",
      enrollee,
    }));

    return [...studentRecords, ...enrolleeRecords];
  }, [archivedEnrollees, archivedStudents]);

  const availablePrograms = useMemo(
    () =>
      Array.from(new Set(archivedRecords.map((record) => record.program))).sort(),
    [archivedRecords],
  );

  const availableYearLevels = useMemo(
    () =>
      Array.from(
        new Set(archivedRecords.map((record) => record.yearLevel)),
      ).sort(),
    [archivedRecords],
  );

  const filteredArchivedRecords = archivedRecords.filter((record) => {
    const searchValue = searchTerm.toLowerCase().trim();
    const matchesSearch =
      searchValue === "" ||
      record.name.toLowerCase().includes(searchValue) ||
      record.identifier.toLowerCase().includes(searchValue) ||
      record.contact.toLowerCase().includes(searchValue) ||
      record.program.toLowerCase().includes(searchValue);
    const matchesType =
      recordTypeFilter === "All Records" || record.kind === recordTypeFilter;
    const matchesProgram =
      filterProgram === "All Programs" || record.program === filterProgram;
    const matchesYearLevel =
      filterYearLevel === "All Year Levels" ||
      record.yearLevel === filterYearLevel;

    return matchesSearch && matchesType && matchesProgram && matchesYearLevel;
  });

  const sortedArchivedRecords = [...filteredArchivedRecords].sort(
    (left, right) => {
      const leftNumber = Number(left.identifier);
      const rightNumber = Number(right.identifier);

      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return sortDirection === "asc"
          ? leftNumber - rightNumber
          : rightNumber - leftNumber;
      }

      const leftValue = left.identifier.toLowerCase();
      const rightValue = right.identifier.toLowerCase();

      if (leftValue < rightValue) return sortDirection === "asc" ? -1 : 1;
      if (leftValue > rightValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    },
  );

  const toggleIdSort = () => {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    setCurrentPage(1);
  };

  const totalPages = Math.max(
    1,
    Math.ceil(sortedArchivedRecords.length / ITEMS_PER_PAGE),
  );
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedRecords = sortedArchivedRecords.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const handlePageSelect = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const isMissingSupabaseAdmissionError = (error: unknown) =>
    error instanceof Error &&
    /tracking number\s+".*?"\s+was not found/i.test(error.message);

  const resolveStudentLink = (student: Student) => {
    const linkedEnrollee =
      enrollees.find(
        (record) =>
          (student.trackingNumber &&
            record.trackingNumber === student.trackingNumber) ||
          record.studentNumber === student.id,
      ) ?? null;

    return {
      trackingNumber: student.trackingNumber || linkedEnrollee?.trackingNumber,
      studentNumber: linkedEnrollee?.studentNumber || student.id,
    };
  };

  const removeLinkedRecordsLocally = ({
    studentId,
    enrolleeId,
    trackingNumber,
    studentNumber,
  }: {
    studentId?: string;
    enrolleeId?: string;
    trackingNumber?: string;
    studentNumber?: string;
  }) => {
    if (studentId || trackingNumber || studentNumber) {
      setStudents((prev) =>
        prev.filter((record) => {
          const matchesStudentId = studentId
            ? record.id === studentId
            : false;
          const matchesTrackingNumber = trackingNumber
            ? record.trackingNumber === trackingNumber
            : false;
          const matchesStudentNumber = studentNumber
            ? record.id === studentNumber
            : false;

          return !(
            matchesStudentId ||
            matchesTrackingNumber ||
            matchesStudentNumber
          );
        }),
      );
    }

    if (enrolleeId || trackingNumber || studentNumber) {
      setEnrollees((prev) =>
        prev.filter((record) => {
          const matchesEnrolleeId = enrolleeId
            ? record.id === enrolleeId
            : false;
          const matchesTrackingNumber = trackingNumber
            ? record.trackingNumber === trackingNumber
            : false;
          const matchesStudentNumber = studentNumber
            ? record.studentNumber === studentNumber
            : false;

          return !(
            matchesEnrolleeId ||
            matchesTrackingNumber ||
            matchesStudentNumber
          );
        }),
      );
    }
  };

  const deleteStudentRecord = async (student: Student) => {
    const { trackingNumber, studentNumber } = resolveStudentLink(student);
    const warnings: string[] = [];

    if (trackingNumber) {
      try {
        await deleteAdmissionApplication(trackingNumber);
      } catch (error) {
        if (!isMissingSupabaseAdmissionError(error)) {
          throw error;
        }
      }
    }

    if (student.recordId) {
      try {
        const response = await fetch(`${STUDENTS_API_URL}${student.recordId}/`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          warnings.push(
            errorData?.detail || "Legacy student record could not be deleted.",
          );
        }
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? error.message
            : "Legacy student record could not be deleted.",
        );
      }
    }

    removeLinkedRecordsLocally({
      studentId: student.id,
      trackingNumber,
      studentNumber,
    });

    return { warnings };
  };

  const deleteEnrolleeRecord = async (enrollee: Enrollee) => {
    if (enrollee.trackingNumber) {
      try {
        await deleteAdmissionApplication(enrollee.trackingNumber);
      } catch (error) {
        if (!isMissingSupabaseAdmissionError(error)) {
          throw error;
        }
      }
    }

    removeLinkedRecordsLocally({
      enrolleeId: enrollee.id,
      trackingNumber: enrollee.trackingNumber,
      studentNumber: enrollee.studentNumber,
    });

    return { warnings: [] as string[] };
  };

  const deleteArchivedRecord = async (record: ArchivedTrashItem) => {
    if (record.student) {
      return deleteStudentRecord(record.student);
    }

    if (record.enrollee) {
      return deleteEnrolleeRecord(record.enrollee);
    }

    return { warnings: [] as string[] };
  };

  const handleRestoreStudent = async (student: Student) => {
    const restoreStudentLocally = () => {
      setStudents((prev) =>
        prev.map((record) =>
          record.id === student.id
            ? { ...record, status: "Incomplete" }
            : record,
        ),
      );
    };

    if (!student.recordId) {
      restoreStudentLocally();
      addToast(`${student.name} has been restored successfully.`, "success");
      return;
    }

    try {
      const response = await fetch(`${STUDENTS_API_URL}${student.recordId}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "Incomplete" }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.detail || "Failed to restore student.");
      }

      restoreStudentLocally();
      addToast(`${student.name} has been restored successfully.`, "success");
    } catch (error) {
      console.error("Failed to restore student", error);
      addToast(
        error instanceof Error ? error.message : "Unable to restore student.",
        "error",
      );
    }
  };

  const handleDeleteStudent = async (student: Student) => {
    const confirmed = window.confirm(
      `Delete ${student.name} permanently? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setIsProcessingTrash(true);
    try {
      const result = await deleteStudentRecord(student);
      addToast(
        result.warnings.length > 0
          ? `${student.name} was deleted from Archive, but the legacy student API still needs cleanup.`
          : `${student.name} has been permanently deleted.`,
        result.warnings.length > 0 ? "warning" : "success",
      );
    } catch (error) {
      console.error("Failed to delete student", error);
      addToast(
        error instanceof Error ? error.message : "Unable to delete student.",
        "error",
      );
    } finally {
      setIsProcessingTrash(false);
    }
  };

  const handleRestoreEnrollee = (enrollee: Enrollee) => {
    setEnrollees((prev) =>
      prev.map((record) =>
        record.id === enrollee.id
          ? {
              ...record,
              archivedAt: undefined,
              archivedByRole: undefined,
            }
          : record,
      ),
    );
    addToast(`${enrollee.fullName} has been restored successfully.`, "success");
  };

  const handleDeleteEnrollee = (enrollee: Enrollee) => {
    void (async () => {
      const confirmed = window.confirm(
        `Delete ${enrollee.fullName} permanently? This action cannot be undone.`,
      );

      if (!confirmed) {
        return;
      }

      setIsProcessingTrash(true);

      try {
        await deleteEnrolleeRecord(enrollee);
        addToast(
          `${enrollee.fullName} has been permanently deleted.`,
          "success",
        );
      } catch (error) {
        console.error("Failed to delete enrollee", error);
        addToast(
          error instanceof Error
            ? error.message
            : "Unable to delete enrollee.",
          "error",
        );
      } finally {
        setIsProcessingTrash(false);
      }
    })();
  };

  const handleClearTrash = async () => {
    if (archivedRecords.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      "Clear Archive and permanently delete all archived records? This action cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    setIsProcessingTrash(true);

    let deletedCount = 0;
    let warningCount = 0;
    let failedCount = 0;
    let firstFailureMessage: string | null = null;

    for (const record of archivedRecords) {
      try {
        const result = await deleteArchivedRecord(record);
        deletedCount += 1;
        if (result.warnings.length > 0) {
          warningCount += 1;
        }
      } catch (error) {
        console.error("Failed to delete archived record", record, error);
        failedCount += 1;
        if (!firstFailureMessage && error instanceof Error) {
          firstFailureMessage = error.message;
        }
      }
    }

    if (deletedCount > 0) {
      const deletedLabel = `${deletedCount} record${deletedCount === 1 ? "" : "s"}`;
      const message =
        warningCount > 0
          ? `${deletedLabel} removed from Archive, but ${warningCount} legacy student record${warningCount === 1 ? "" : "s"} still need API cleanup.`
          : `${deletedLabel} permanently deleted from Archive.`;
      addToast(message, warningCount > 0 ? "warning" : "success");
    }

    if (failedCount > 0) {
      addToast(
        firstFailureMessage
          ? `Failed to delete ${failedCount} record${failedCount === 1 ? "" : "s"} from Archive. ${firstFailureMessage}`
          : `Failed to delete ${failedCount} record${failedCount === 1 ? "" : "s"} from Archive.`,
        "error",
      );
    }

    setIsProcessingTrash(false);
  };

  const handleRestoreRecord = (record: ArchivedTrashItem) => {
    if (record.student) {
      void handleRestoreStudent(record.student);
      return;
    }

    if (record.enrollee) {
      handleRestoreEnrollee(record.enrollee);
    }
  };

  const handleDeleteRecord = (record: ArchivedTrashItem) => {
    if (record.student) {
      void handleDeleteStudent(record.student);
      return;
    }

    if (record.enrollee) {
      handleDeleteEnrollee(record.enrollee);
    }
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
        type="button"
      >
        {isSidebarOpen ? "X" : "|||"}
      </button>

      <main className="archive-content">
        <header className="page-header">
          <h1>
            <MdArchive />
            Archive
          </h1>
          <p>
            {isLoading
              ? "Loading archived records..."
              : "Archived students and enrollees for this branch appear here."}
          </p>
        </header>

        <div className="archive-controls">
          <div className="search-wrapper">
            <FaSearch className="search-icon" />
            <input
              type="text"
              className="archive-search"
              placeholder="Search by name, ID, tracking number, or program..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <select
            className="archive-filter"
            value={recordTypeFilter}
            onChange={(e) => {
              setRecordTypeFilter(
                e.target.value as "All Records" | ArchivedTrashItem["kind"],
              );
              setCurrentPage(1);
            }}
          >
            <option>All Records</option>
            <option>Student</option>
            <option>Enrollee</option>
          </select>

          <select
            className="archive-filter"
            value={filterProgram}
            onChange={(e) => {
              setFilterProgram(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option>All Programs</option>
            {availablePrograms.map((program) => (
              <option key={program} value={program}>
                {program}
              </option>
            ))}
          </select>

          <select
            className="archive-filter"
            value={filterYearLevel}
            onChange={(e) => {
              setFilterYearLevel(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option>All Year Levels</option>
            {availableYearLevels.map((yearLevel) => (
              <option key={yearLevel} value={yearLevel}>
                {yearLevel}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="clear-trash-btn"
            onClick={() => {
              void handleClearTrash();
            }}
            disabled={isProcessingTrash || archivedRecords.length === 0}
          >
            <MdArchive />
            {isProcessingTrash ? "Processing..." : "Clear Archive"}
          </button>
        </div>

        <div className="archive-table-wrap">
          <table className="archive-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="archive-table-sort-btn"
                    onClick={toggleIdSort}
                  >
                    ID / Tracking No. {sortDirection === "asc" ? "^" : "v"}
                  </button>
                </th>
                <th>Type</th>
                <th>Name</th>
                <th>Program</th>
                <th>Year Level</th>
                <th>Contact</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.length > 0 ? (
                paginatedRecords.map((record) => (
                  <tr key={record.key}>
                    <td className="student-id-cell">{record.identifier}</td>
                    <td>
                      <span
                        className={`archive-type-badge ${record.kind.toLowerCase()}`}
                      >
                        {record.kind}
                      </span>
                    </td>
                    <td className="student-name-cell">{record.name}</td>
                    <td>{record.program}</td>
                    <td>{record.yearLevel}</td>
                    <td>{record.contact || "-"}</td>
                    <td>
                      <div className="archive-actions">
                        <button
                          type="button"
                          className="unarchive-btn"
                          onClick={() => handleRestoreRecord(record)}
                          disabled={isProcessingTrash}
                        >
                          <FaUndo /> Restore
                        </button>
                        <button
                          type="button"
                          className="delete-btn icon-only"
                          onClick={() => handleDeleteRecord(record)}
                          disabled={isProcessingTrash}
                          aria-label={`Delete ${record.name}`}
                          title={`Delete ${record.name}`}
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="no-archive">
                    {isLoading
                      ? "Loading archived records..."
                      : archivedRecords.length > 0
                        ? "No archived records match the selected filters."
                        : "No archived students or enrollees yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredArchivedRecords.length > 0 && (
          <div className="archive-pagination">
            <button
              className="pagination-btn prev-btn"
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              title="Previous page"
              aria-label="Previous page"
              type="button"
            >
              &lt;
            </button>

            <div className="pagination-info">
              <span>{startIndex + 1}</span>
              <span>-</span>
              <span>{Math.min(endIndex, filteredArchivedRecords.length)}</span>
              <span>of</span>
              <span>{filteredArchivedRecords.length}</span>
            </div>

            <div className="pagination-pages">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                (pageNumber) => (
                  <button
                    key={pageNumber}
                    className={`pagination-page ${pageNumber === currentPage ? "active" : ""}`}
                    onClick={() => handlePageSelect(pageNumber)}
                    type="button"
                  >
                    {pageNumber}
                  </button>
                ),
              )}
            </div>

            <button
              className="pagination-btn next-btn"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              title="Next page"
              aria-label="Next page"
              type="button"
            >
              &gt;
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
