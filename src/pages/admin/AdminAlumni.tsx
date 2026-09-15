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
  persistAlumniBackupCache,
  readCachedAlumni,
  rememberAlumniStudentStatus,
} from "../../services/backupApi";
import {
  forgetDeletedStoredStudent,
  getCurrentBranch,
  getStudentCredentialOverview,
  readStoredStudents,
  writeStoredStudents,
  type StudentStorageRecord,
} from "../../services/adminStorage";
import {
  getStudentAcademicStanding,
  getStudentGradeRecords,
  type StoredStudentGradeRecord,
} from "../../services/studentGrades";
import { updateAdminStudentStatus } from "../../services/adminStudentsApi";
import "../../styles/admin/admin-alumni.css";

interface AlumniProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface AlumniStudent {
  recordId?: number;
  id: string;
  fullName: string;
  program: string;
  yearGraduated: string;
  contact: string;
  email?: string;
  becameAlumniOn: string;
  studentSnapshot?: StudentStorageRecord;
}

interface StudentRecord {
  recordId?: number;
  id: string;
  name: string;
  program: string;
  yearLevel: string;
  strandOrCourse?: string;
  contact: string;
  email: string;
  status?: "Complete" | "Incomplete" | "Archived" | "Graduated";
  studentSnapshot?: StudentStorageRecord;
}

interface ApiAlumni {
  id: number;
  student_id: string;
  full_name: string;
  program: string;
  year_graduated: string;
  contact: string;
  email?: string | null;
  became_alumni_on: string;
}

interface ApiStudent {
  id: number;
  student_id: string;
  full_name: string;
  program: string;
  year_level: string;
  strand_or_course?: string | null;
  contact?: string | null;
  email: string;
  status: string;
}

interface ApiAlumniRecord {
  id?: number;
  student_id?: string;
  full_name?: string;
  program?: string;
  year_graduated?: string | null;
  contact?: string | null;
  email?: string | null;
  became_alumni_on?: string | null;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const CONFIGURED_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_BASE_URL = CONFIGURED_API_BASE_URL || "http://localhost:8000";
const SHOULD_USE_ALUMNI_BACKEND = Boolean(CONFIGURED_API_BASE_URL);
const ALUMNI_API_URL = `${API_BASE_URL}/api/alumni/`;
const STUDENTS_API_URL = `${API_BASE_URL}/api/students/`;

const getCurrentGraduationYear = () => String(new Date().getFullYear());

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

const buildLocalAlumniRecord = (student: StudentRecord): ApiAlumniRecord => ({
  student_id: student.id,
  full_name: student.name,
  program: student.strandOrCourse || student.program,
  year_graduated: getCurrentGraduationYear(),
  contact: student.contact || "",
  became_alumni_on: new Date().toISOString(),
});

const mapStoredStudentToUi = (student: StudentStorageRecord): StudentRecord => ({
  recordId: student.recordId,
  id: student.id,
  name: student.name,
  program: student.program,
  yearLevel: student.yearLevel,
  strandOrCourse: student.strandOrCourse || "",
  contact: student.contact || "",
  email: student.email,
  status: student.status,
  studentSnapshot: { ...student },
});

export default function AdminAlumni({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: AlumniProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingAlumni, setViewingAlumni] = useState<AlumniStudent | null>(
    null,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [alumni, setAlumni] = useState<AlumniStudent[]>([]);
  const [restoringAlumniId, setRestoringAlumniId] = useState<string | null>(null);

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

  const mapApiAlumniToUi = (apiAlumni: ApiAlumni): AlumniStudent => ({
    recordId: apiAlumni.id,
    id: apiAlumni.student_id,
    fullName: apiAlumni.full_name,
    program: apiAlumni.program,
    yearGraduated: apiAlumni.year_graduated || "",
    contact: apiAlumni.contact || "",
    email: apiAlumni.email || undefined,
    becameAlumniOn: apiAlumni.became_alumni_on || "",
  });

  const mapApiStudentToUi = (apiStudent: ApiStudent): StudentRecord => ({
    recordId: apiStudent.id,
    id: apiStudent.student_id,
    name: apiStudent.full_name,
    program: apiStudent.program,
    yearLevel: apiStudent.year_level,
    strandOrCourse: apiStudent.strand_or_course || "",
    contact: apiStudent.contact || "",
    email: apiStudent.email,
    status:
      apiStudent.status === "Inactive"
        ? "Archived"
        : (apiStudent.status as StudentRecord["status"]),
  });

  const buildAlumniUiRecord = (
    student: StudentRecord,
    apiAlumni?: ApiAlumniRecord | null,
  ): AlumniStudent => ({
    recordId: typeof apiAlumni?.id === "number" ? apiAlumni.id : undefined,
    id: apiAlumni?.student_id || student.id,
    fullName: apiAlumni?.full_name || student.name,
    program: apiAlumni?.program || student.strandOrCourse || student.program,
    yearGraduated: apiAlumni?.year_graduated || getCurrentGraduationYear(),
    contact: apiAlumni?.contact || student.contact || "",
    email: apiAlumni?.email || student.email || undefined,
    becameAlumniOn: apiAlumni?.became_alumni_on || "",
    studentSnapshot:
      "studentSnapshot" in student
        ? (student as StudentRecord & { studentSnapshot?: StudentStorageRecord })
            .studentSnapshot
        : undefined,
  });

  const updateStoredStudentStatus = (
    alumniStudent: AlumniStudent,
    studentId: string,
    nextStatus: NonNullable<StudentRecord["status"]>,
  ) => {
    const storedStudents = readStoredStudents();
    const existingStoredStudent = storedStudents.find(
      (student) => student.id === studentId,
    );
    forgetDeletedStoredStudent({
      branch: existingStoredStudent?.branch || getCurrentBranch(),
      id: studentId,
      trackingNumber: existingStoredStudent?.trackingNumber,
      name: existingStoredStudent?.name || alumniStudent.fullName,
    });
    let didUpdate = false;

    const nextStoredStudents = storedStudents.map((student) => {
      if (student.id !== studentId) {
        return student;
      }

      didUpdate = true;
      return {
        ...student,
        status: nextStatus,
      };
    });

    if (didUpdate) {
      writeStoredStudents(nextStoredStudents);
      return;
    }

    const normalizedProgram = alumniStudent.program.trim();
    const restoredProgram =
      normalizedProgram === "SHS" || normalizedProgram === "College"
        ? normalizedProgram
        : "College";
    const restoredStudent: StudentStorageRecord = alumniStudent.studentSnapshot
      ? {
          ...alumniStudent.studentSnapshot,
          id: studentId,
          name: alumniStudent.studentSnapshot.name || alumniStudent.fullName,
          contact: alumniStudent.studentSnapshot.contact || alumniStudent.contact || "",
          email: alumniStudent.studentSnapshot.email || alumniStudent.email || "",
          status: nextStatus,
          branch: alumniStudent.studentSnapshot.branch || getCurrentBranch(),
        }
      : {
          id: studentId,
          name: alumniStudent.fullName,
          program: restoredProgram,
          yearLevel: restoredProgram === "SHS" ? "Grade 11" : "1st Year",
          shsTrackType: "",
          strandOrCourse:
            normalizedProgram && normalizedProgram !== restoredProgram
              ? normalizedProgram
              : "",
          documentSubmitted: new Date().toISOString().slice(0, 10),
          contact: alumniStudent.contact || "",
          email: alumniStudent.email || "",
          address: "",
          status: nextStatus,
          branch: getCurrentBranch(),
          studentStatus: "Continuing",
        };

    writeStoredStudents([restoredStudent, ...storedStudents]);
  };

  const removeStoredStudent = (studentId: string) => {
    const storedStudents = readStoredStudents();
    const existingStoredStudent = storedStudents.find(
      (student) => student.id === studentId,
    );

    forgetDeletedStoredStudent({
      branch: existingStoredStudent?.branch || getCurrentBranch(),
      id: studentId,
      trackingNumber: existingStoredStudent?.trackingNumber,
      name: existingStoredStudent?.name || studentId,
    });
    writeStoredStudents(
      storedStudents.filter((student) => student.id !== studentId),
    );
  };

  const loadPaginated = async <T,>(url: string): Promise<T[]> => {
    const collected: T[] = [];
    let nextPageUrl: string | null = url;

    while (nextPageUrl) {
      const response = await fetch(nextPageUrl);
      if (!response.ok) {
        throw new Error(`Request failed: ${nextPageUrl}`);
      }

      const payload = await response.json();
      if (Array.isArray(payload)) {
        collected.push(...payload);
        nextPageUrl = null;
      } else {
        const results = Array.isArray(payload.results) ? payload.results : [];
        collected.push(...results);
        nextPageUrl =
          typeof payload.next === "string" && payload.next
            ? payload.next
            : null;
      }
    }

    return collected;
  };

  const loadOptionalPaginated = async <T,>(url: string): Promise<T[] | null> => {
    try {
      return await loadPaginated<T>(url);
    } catch (error) {
      console.warn(`Optional alumni backend request failed: ${url}`, error);
      return null;
    }
  };

  const addMissingAlumniEmails = (
    alumniRecords: AlumniStudent[],
    studentRecords: StudentRecord[],
  ) => {
    const studentEmailById = new Map(
      studentRecords.map((student) => [student.id, student.email] as const),
    );

    return alumniRecords.map((record) => ({
      ...record,
      email: record.email || studentEmailById.get(record.id),
    }));
  };

  const loadAlumniAndStudents = async () => {
    setIsLoading(true);

    try {
      const localStudents = readStoredStudents().map(mapStoredStudentToUi);
      const localAlumni = addMissingAlumniEmails(readCachedAlumni(), localStudents);

      setStudents(localStudents);
      setAlumni(localAlumni);

      if (!SHOULD_USE_ALUMNI_BACKEND) {
        return;
      }

      const [apiAlumni, apiStudents] = await Promise.all([
        loadOptionalPaginated<ApiAlumni>(ALUMNI_API_URL),
        loadOptionalPaginated<ApiStudent>(STUDENTS_API_URL),
      ]);

      const mappedStudents = apiStudents
        ? apiStudents.map(mapApiStudentToUi)
        : localStudents;
      const mappedAlumni = apiAlumni
        ? addMissingAlumniEmails(apiAlumni.map(mapApiAlumniToUi), mappedStudents)
        : localAlumni;

      setAlumni(mappedAlumni);
      setStudents(mappedStudents);

      if (apiAlumni) {
        persistAlumniBackupCache(mappedAlumni);
      }
    } catch (error) {
      console.error("Failed to load alumni data", error);
      const storedStudents = readStoredStudents();
      const localStudents = storedStudents.map(mapStoredStudentToUi);
      setAlumni(addMissingAlumniEmails(readCachedAlumni(), localStudents));
      setStudents(localStudents);
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

  const ITEMS_PER_PAGE = 15;
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
      isStudentEligibleForAlumniTransfer(student) &&
      !alumni.some((alum) => alum.id === student.id),
  );

  const handleAddFromStudent = async (student: StudentRecord) => {
    try {
      let createdAlumni: ApiAlumniRecord | null = null;
      let savedLocallyOnly = false;
      const graduationYear = getCurrentGraduationYear();

      try {
        if (!SHOULD_USE_ALUMNI_BACKEND) {
          throw new Error("Alumni backend is not configured.");
        }

        const createResponse = await fetch(ALUMNI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            student_id: student.id,
            full_name: student.name,
            program: student.strandOrCourse || student.program,
            year_graduated: graduationYear,
            contact: student.contact || "",
          }),
        });

        if (!createResponse.ok) {
          const errorData = await createResponse.json().catch(() => ({}));
          const firstError = Object.values(errorData).find((value) =>
            Array.isArray(value),
          ) as string[] | undefined;
          throw new Error(firstError?.[0] || "Failed to add alumni record.");
        }

        createdAlumni = (await createResponse
          .json()
          .catch(() => null)) as ApiAlumniRecord | null;
      } catch (error) {
        console.warn(
          "Unable to create alumni record in backend. Saving locally instead.",
          error,
        );
        createdAlumni = buildLocalAlumniRecord(student);
        savedLocallyOnly = true;
      }

      rememberAlumniStudentStatus(student.id, student.status || "Complete");

      const nextAlumniRecord = buildAlumniUiRecord(student, createdAlumni);
      try {
        await updateAdminStudentStatus({
          branch: student.studentSnapshot?.branch || getCurrentBranch(),
          studentNumber: student.id,
          status: "Graduated",
        });
      } catch (statusError) {
        console.warn(
          "Unable to mark alumni student as graduated in Supabase. The local alumni record will still block student portal access on this device.",
          statusError,
        );
      }
      const nextAlumni = [...alumni.filter((record) => record.id !== student.id), nextAlumniRecord];
      persistAlumniBackupCache(nextAlumni);
      setAlumni(nextAlumni);
      setStudents((prev) => prev.filter((record) => record.id !== student.id));
      removeStoredStudent(student.id);
      setIsAddModalOpen(false);
      addToast(
        savedLocallyOnly
          ? `${student.name} added to alumni locally.`
          : `${student.name} added to alumni successfully!`,
        savedLocallyOnly ? "warning" : "success",
      );
    } catch (error) {
      console.error("Failed to add alumni from student", error);
      addToast(
        error instanceof Error ? error.message : "Unable to add alumni record.",
        "error",
      );
    }
  };

  const handleRestoreAlumni = async (alumniStudent: AlumniStudent) => {
    const shouldContinue = window.confirm(
      `Restore ${alumniStudent.fullName} back to Students?`,
    );
    if (!shouldContinue) {
      return;
    }

    setRestoringAlumniId(alumniStudent.id);

    try {
      const rememberedStatus = getRememberedAlumniStudentStatus(alumniStudent.id);
      const restoredStatus =
        rememberedStatus === "Archived" || rememberedStatus === "Graduated"
          ? "Complete"
          : rememberedStatus || "Complete";
      const linkedStudent = students.find((student) => student.id === alumniStudent.id);

      if (SHOULD_USE_ALUMNI_BACKEND && linkedStudent?.recordId) {
        const response = await fetch(`${STUDENTS_API_URL}${linkedStudent.recordId}/`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: restoredStatus }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.detail || "Unable to reactivate student.");
        }
      }

      if (SHOULD_USE_ALUMNI_BACKEND && alumniStudent.recordId) {
        const response = await fetch(`${ALUMNI_API_URL}${alumniStudent.recordId}/`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.detail || "Unable to remove alumni record.");
        }
      }

      const nextAlumni = alumni.filter((record) => record.id !== alumniStudent.id);
      persistAlumniBackupCache(nextAlumni);
      setAlumni(nextAlumni);
      setStudents((prev) =>
        prev.some((student) => student.id === alumniStudent.id)
          ? prev.map((student) =>
              student.id === alumniStudent.id
                ? { ...student, status: restoredStatus }
                : student,
            )
          : [
              {
                id: alumniStudent.id,
                name: alumniStudent.fullName,
                program:
                  alumniStudent.program === "SHS" ||
                  alumniStudent.program === "College"
                    ? alumniStudent.program
                    : "College",
                yearLevel:
                  alumniStudent.program === "SHS" ? "Grade 11" : "1st Year",
                strandOrCourse:
                  alumniStudent.program !== "SHS" &&
                  alumniStudent.program !== "College"
                    ? alumniStudent.program
                    : "",
                contact: alumniStudent.contact || "",
                email: alumniStudent.email || "",
                status: restoredStatus,
              },
              ...prev,
            ],
      );
      updateStoredStudentStatus(alumniStudent, alumniStudent.id, restoredStatus);
      forgetRememberedAlumniStudentStatus(alumniStudent.id);

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
    new Set(alumni.map((alum) => alum.yearGraduated)),
  ).sort((a, b) => Number(b) - Number(a));

  const viewingStudentSnapshot = useMemo(() => {
    if (!viewingAlumni) {
      return null;
    }

    const storedStudent = readStoredStudents().find(
      (student) =>
        student.id === viewingAlumni.id ||
        (viewingAlumni.studentSnapshot?.trackingNumber &&
          student.trackingNumber === viewingAlumni.studentSnapshot.trackingNumber),
    );

    return viewingAlumni.studentSnapshot || storedStudent || null;
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
  const viewingStudentCredentials = viewingAlumni
    ? getStudentCredentialOverview({
        branch: viewingStudentBranch,
        studentNumber: viewingAlumni.id,
        trackingNumber: viewingStudentSnapshot?.trackingNumber,
      })
    : null;
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
              ? "Loading alumni from backend..."
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
                    <td>{alum.contact || "—"}</td>
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
                      : "No alumni records found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredAlumni.length > 0 && (
          <div className="archive-pagination">
            <button
              className="pagination-btn prev-btn"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              title="Previous page"
              aria-label="Previous page"
            >
              ‹
            </button>

            <div className="pagination-info">
              <span>{startIndex + 1}</span>
              <span>–</span>
              <span>
                {Math.min(startIndex + ITEMS_PER_PAGE, filteredAlumni.length)}
              </span>
              <span>of</span>
              <span>{filteredAlumni.length}</span>
            </div>

            <div className="pagination-pages">
              {Array.from({ length: totalPages }, (_, index) => {
                const pageNumber = index + 1;
                return (
                  <button
                    key={pageNumber}
                    className={`pagination-page ${currentPage === pageNumber ? "active" : ""}`}
                    onClick={() => setCurrentPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                );
              })}
            </div>

            <button
              className="pagination-btn next-btn"
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              title="Next page"
              aria-label="Next page"
            >
              ›
            </button>
          </div>
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
                          No available students to add.
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
                        viewingStudentSnapshot?.contact || viewingAlumni.contact,
                      ],
                      ["Birth Date", formatStoredDate(viewingStudentSnapshot?.birthDate)],
                      ["Gender", viewingStudentSnapshot?.gender],
                      ["Civil Status", viewingStudentSnapshot?.civilStatus],
                      ["Guardian Name", viewingStudentSnapshot?.guardianName],
                      ["Guardian Contact", viewingStudentSnapshot?.guardianContact],
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
                      No linked credential copies found.
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
                            <table className="alumni-grade-table">
                              <thead>
                                <tr>
                                  <th>Subject Code</th>
                                  <th>Subject Title</th>
                                  <th>Period</th>
                                  <th>Grade</th>
                                  <th>Units</th>
                                  <th>Result</th>
                                </tr>
                              </thead>
                              <tbody>
                                {term.records.map((record) => (
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
