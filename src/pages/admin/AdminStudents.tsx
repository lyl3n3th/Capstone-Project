import { useState, useEffect } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import { useAuth } from "../../hooks/useAuth";
import {
  getNextStudentNumber,
  getStudentRequirementSnapshot,
  getStudentsForBranch,
  normalizeBranchName,
  readStoredStudents,
  writeStoredStudents,
} from "../../services/adminStorage";
import "../../styles/admin/admin-students.css";

interface StudentsProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface Student {
  recordId?: number;
  id: string;
  name: string;
  program: string;
  yearLevel: string;
  section?: string;
  shsTrackType?: string;
  strandOrCourse?: string;
  documentSubmitted: string;
  contact: string;
  email: string;
  address: string;
  status: "Complete" | "Incomplete" | "Archived";
  branch: string;
  trackingNumber?: string;
}

interface ApiStudent {
  id: number;
  student_id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  full_name?: string;
  email: string;
  phone?: string | null;
  program: string;
  year_level: string;
  strand_or_course?: string | null;
  address?: string | null;
  contact?: string | null;
  status: string;
  document_submitted_date?: string | null;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const STUDENTS_API_URL = `${API_BASE_URL}/api/students/`;

const splitFullName = (fullName: string) => {
  const normalizedName = fullName.trim().replace(/\s+/g, " ");
  const parts = normalizedName.split(" ").filter(Boolean);

  if (parts.length < 2) {
    return {
      firstName: normalizedName,
      middleName: "",
      lastName: "",
    };
  }

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const middleName = parts.slice(1, -1).join(" ");

  return { firstName, middleName, lastName };
};

const mapApiStatusToUiStatus = (status: string): Student["status"] => {
  if (status === "Inactive") return "Archived";
  if (status === "Complete") return "Complete";
  return "Incomplete";
};

const mapUiStatusToApiStatus = (status: Student["status"]): string => {
  if (status === "Archived") return "Inactive";
  return status;
};

const mapApiStudentToStudent = (apiStudent: ApiStudent): Student => {
  const fullName = (
    apiStudent.full_name ||
    `${apiStudent.first_name || ""} ${apiStudent.middle_name || ""} ${apiStudent.last_name || ""}`
  )
    .trim()
    .replace(/\s+/g, " ");

  return {
    recordId: apiStudent.id,
    id: apiStudent.student_id,
    name: fullName,
    program: apiStudent.program || "",
    yearLevel: apiStudent.year_level || "",
    shsTrackType: "",
    strandOrCourse: apiStudent.strand_or_course || "",
    documentSubmitted: apiStudent.document_submitted_date || "",
    contact: apiStudent.contact || apiStudent.phone || "",
    email: apiStudent.email || "",
    address: apiStudent.address || "",
    status: mapApiStatusToUiStatus(apiStudent.status),
    branch: "Bacoor",
  };
};

const mapStudentToApiPayload = (student: Student) => {
  const { firstName, middleName, lastName } = splitFullName(student.name);

  return {
    student_id: student.id,
    first_name: firstName,
    middle_name: middleName || "",
    last_name: lastName,
    email: student.email,
    phone: student.contact,
    contact: student.contact,
    program: student.program,
    year_level: student.yearLevel,
    strand_or_course: student.strandOrCourse || null,
    address: student.address,
    status: mapUiStatusToApiStatus(student.status),
    document_submitted_date: student.documentSubmitted || null,
  };
};

export default function AdminStudents({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: StudentsProps) {
  const { currentUser } = useAuth();
  const currentBranch = normalizeBranchName(currentUser?.branch);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProgram, setFilterProgram] = useState("All Programs");
  const [filterYearLevel, setFilterYearLevel] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [studentToArchive, setStudentToArchive] = useState<string | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [shsTrackType, setShsTrackType] = useState("");
  const [programSpecialization, setProgramSpecialization] = useState("");
  const [sortField, setSortField] = useState<"id">("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Form state for add/edit
  const [formData, setFormData] = useState<Student>({
    id: "",
    name: "",
    program: "",
    yearLevel: "",
    shsTrackType: "",
    strandOrCourse: "",
    documentSubmitted: "",
    contact: "",
    email: "",
    address: "",
    status: "Incomplete",
    branch: currentBranch,
  });

  // Errors for add/edit
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof Student, string>>
  >({});

  // Students data
  const [students, setStudents] = useState<Student[]>(() =>
    getStudentsForBranch(currentBranch) as Student[],
  );

  const loadStudents = async () => {
    setIsLoading(true);

    try {
      const fetchedStudents: ApiStudent[] = [];
      let nextPageUrl: string | null = STUDENTS_API_URL;

      while (nextPageUrl) {
        const response = await fetch(nextPageUrl);
        if (!response.ok) {
          throw new Error("Failed to load students from backend.");
        }

        const payload = await response.json();

        if (Array.isArray(payload)) {
          fetchedStudents.push(...payload);
          nextPageUrl = null;
        } else {
          const results = Array.isArray(payload.results) ? payload.results : [];
          fetchedStudents.push(...results);
          nextPageUrl =
            typeof payload.next === "string" && payload.next
              ? payload.next
              : null;
        }
      }

      setStudents(
        fetchedStudents.map((student) => ({
          ...mapApiStudentToStudent(student),
          branch: currentBranch,
        })),
      );
    } catch (error) {
      console.error("Failed to fetch students", error);
      setStudents(getStudentsForBranch(currentBranch) as Student[]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, [currentBranch]);

  useEffect(() => {
    if (window.innerWidth < 1024 && isSidebarOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }

    document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    const studentsFromOtherBranches = readStoredStudents().filter(
      (student) => normalizeBranchName(student.branch) !== currentBranch,
    );

    writeStoredStudents([...studentsFromOtherBranches, ...students]);
  }, [students, currentBranch]);

  const filteredStudents = students.filter((student) => {
    const search = searchTerm.toLowerCase();
    const matchesSearch =
      student.name.toLowerCase().includes(search) ||
      student.id.toLowerCase().includes(search) ||
      student.program.toLowerCase().includes(search) ||
      student.contact.toLowerCase().includes(search);

    const matchesProgram =
      filterProgram === "All Programs" || student.program === filterProgram;
    const matchesYearLevel =
      filterYearLevel === "" || student.yearLevel === filterYearLevel;
    const matchesSection =
      filterSection === "" || (student.section || "") === filterSection;
    const matchesStatus =
      student.status !== "Archived" &&
      (filterStatus === "All" || student.status === filterStatus);

    return (
      matchesSearch &&
      matchesProgram &&
      matchesYearLevel &&
      matchesSection &&
      matchesStatus
    );
  });

  const sortedStudents = [...filteredStudents].sort((left, right) => {
    const leftValue = String(left[sortField] ?? "").toLowerCase();
    const rightValue = String(right[sortField] ?? "").toLowerCase();

    if (sortField === "id") {
      const leftNumber = Number(left.id);
      const rightNumber = Number(right.id);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return sortDirection === "asc"
          ? leftNumber - rightNumber
          : rightNumber - leftNumber;
      }
    }

    if (leftValue < rightValue) return sortDirection === "asc" ? -1 : 1;
    if (leftValue > rightValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: "id") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection("asc");
  };

  const sortIndicator = (field: "id") => {
    if (sortField !== field) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  const yearLevelOptions = Array.from(
    new Set(students.map((student) => student.yearLevel)),
  )
    .filter(
      (yearLevelOption) =>
        yearLevelOption !== "Academic Track" && yearLevelOption !== "G12",
    )
    .sort();
  const sectionOptions = Array.from(
    new Set(
      students
        .map((student) => student.section)
        .filter((section): section is string => Boolean(section)),
    ),
  ).sort();

  // Validation
  const validateForm = () => {
    const errors: Partial<Record<keyof Student, string>> = {};

    const idTrimmed = formData.id.trim();
    if (!idTrimmed) errors.id = "Student ID is required";
    else if (!editingStudent && students.some((s) => s.id === idTrimmed)) {
      errors.id = "This ID already exists";
    }

    if (!formData.name.trim()) {
      errors.name = "Full Name is required";
    } else {
      const { lastName } = splitFullName(formData.name);
      if (!lastName) {
        errors.name = "Please provide at least first and last name";
      }
    }

    if (!formData.email.trim()) {
      errors.email = "Email is required";
    }

    if (!formData.program.trim()) errors.program = "Program is required";
    if (!formData.yearLevel.trim()) errors.yearLevel = "Year Level is required";
    if (formData.program === "SHS" && !formData.shsTrackType?.trim()) {
      errors.yearLevel = "Track is required for SHS";
    } else if (
      (formData.program === "SHS" || formData.program === "College") &&
      !formData.strandOrCourse?.trim()
    ) {
      errors.yearLevel =
        formData.program === "SHS"
          ? "Specialization is required for SHS"
          : "Course selection is required for College";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const generateNextStudentId = () => {
    return getNextStudentNumber(currentBranch);
  };

  // Open add/edit modal
  const openAddEditModal = (student?: Student) => {
    if (student) {
      if (student.program === "SHS") {
        let resolvedTrackType = student.shsTrackType || "";
        let resolvedSpecialization = student.strandOrCourse || "";
        let resolvedYearLevel = student.yearLevel;

        if (!resolvedTrackType) {
          if (
            student.yearLevel === "Academic Track" ||
            student.yearLevel.startsWith("Academic Track")
          ) {
            resolvedTrackType = "Academic Track";
          } else if (
            student.yearLevel === "Technical Professional Track" ||
            student.yearLevel.startsWith("Technical Professional Track")
          ) {
            resolvedTrackType = "Technical Professional Track";
          }
        }

        if (
          !resolvedSpecialization &&
          student.yearLevel.startsWith("Academic Track - ")
        ) {
          resolvedSpecialization = student.yearLevel.replace(
            "Academic Track - ",
            "",
          );
        } else if (
          !resolvedSpecialization &&
          student.yearLevel.startsWith("Technical Professional Track - ")
        ) {
          resolvedSpecialization = student.yearLevel.replace(
            "Technical Professional Track - ",
            "",
          );
        }

        if (
          student.yearLevel === "Academic Track" ||
          student.yearLevel === "Technical Professional Track" ||
          student.yearLevel.startsWith("Academic Track - ") ||
          student.yearLevel.startsWith("Technical Professional Track - ")
        ) {
          resolvedYearLevel = "";
        }

        setEditingStudent(student);
        setFormData({
          ...student,
          yearLevel: resolvedYearLevel,
          shsTrackType: resolvedTrackType,
          strandOrCourse: resolvedSpecialization,
        });
        setShsTrackType(resolvedTrackType);
        setProgramSpecialization(resolvedSpecialization);
      } else {
        setEditingStudent(student);
        setFormData(student);
        if (student.program === "College") {
          setShsTrackType("");
          setProgramSpecialization(
            student.strandOrCourse || "BS ENTREPRENEURSHIP",
          );
        } else {
          setShsTrackType("");
          setProgramSpecialization("");
        }
      }
    } else {
      setEditingStudent(null);
      setFormData({
        id: generateNextStudentId(),
        name: "",
        program: "",
        yearLevel: "",
        shsTrackType: "",
        strandOrCourse: "",
        documentSubmitted: "",
        contact: "",
        email: "",
        address: "",
        status: "Incomplete",
        branch: currentBranch,
      });
      setShsTrackType("");
      setProgramSpecialization("");
    }
    setFormErrors({});
    setIsAddEditModalOpen(true);
  };

  // Handle form change
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "program") {
      if (value === "SHS") {
        setFormData((prev) => ({
          ...prev,
          program: value,
          yearLevel: "",
          shsTrackType: "",
          strandOrCourse: "",
        }));
        setShsTrackType("");
        setProgramSpecialization("");
      } else if (value === "College") {
        setFormData((prev) => ({
          ...prev,
          program: value,
          yearLevel: "",
          shsTrackType: "",
          strandOrCourse: "",
        }));
        setShsTrackType("");
        setProgramSpecialization("");
      } else {
        setFormData((prev) => ({
          ...prev,
          program: value,
          yearLevel: prev.yearLevel || "",
          shsTrackType: "",
          strandOrCourse: "",
        }));
        setShsTrackType("");
        setProgramSpecialization("");
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next[name as keyof Student];
      return next;
    });
  };

  const handleShsTrackTypeChange = (value: string) => {
    setShsTrackType(value);
    setProgramSpecialization("");
    setFormData((prev) => ({
      ...prev,
      shsTrackType: value,
      strandOrCourse: "",
    }));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.yearLevel;
      return next;
    });
  };

  const handleProgramSpecializationChange = (value: string) => {
    setProgramSpecialization(value);
    setFormData((prev) => ({ ...prev, strandOrCourse: value }));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.yearLevel;
      return next;
    });
  };

  const handleCollegeYearLevelChange = (value: string) => {
    setFormData((prev) => ({ ...prev, yearLevel: value }));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.yearLevel;
      return next;
    });
  };

  // Submit add/edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const normalizedStudent: Student = {
      ...formData,
      branch: formData.branch || editingStudent?.branch || currentBranch,
    };

    try {
      if (editingStudent?.recordId) {
        const response = await fetch(
          `${STUDENTS_API_URL}${editingStudent.recordId}/`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(mapStudentToApiPayload(normalizedStudent)),
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.detail || "Failed to update student.");
        }
      } else {
        try {
          const response = await fetch(STUDENTS_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(mapStudentToApiPayload(normalizedStudent)),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const firstError = Object.values(errorData).find((value) =>
              Array.isArray(value),
            ) as string[] | undefined;
            throw new Error(firstError?.[0] || "Failed to create student.");
          }
        } catch (networkError) {
          console.warn(
            "Falling back to local student storage for save",
            networkError,
          );
        }
      }

      setStudents((prev) =>
        editingStudent
          ? prev.map((student) =>
              student.id === editingStudent.id ? normalizedStudent : student,
            )
          : [normalizedStudent, ...prev.filter((student) => student.id !== normalizedStudent.id)],
      );
      setIsAddEditModalOpen(false);
    } catch (error) {
      console.error("Failed to save student", error);
      const message =
        error instanceof Error ? error.message : "Unable to save student.";
      alert(message);
    }
  };

  // Open archive modal
  const openArchiveConfirm = (id: string) => {
    setStudentToArchive(id);
    setIsArchiveModalOpen(true);
  };

  const confirmArchive = async () => {
    if (!studentToArchive) {
      setIsArchiveModalOpen(false);
      return;
    }

    const student = students.find((record) => record.id === studentToArchive);

    if (!student?.recordId) {
      setStudents((prev) =>
        prev.map((record) =>
          record.id === studentToArchive
            ? { ...record, status: "Archived" }
            : record,
        ),
      );
      setIsArchiveModalOpen(false);
      setStudentToArchive(null);
      return;
    }

    try {
      const response = await fetch(`${STUDENTS_API_URL}${student.recordId}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "Inactive" }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData?.detail || "Failed to move student to Trash.",
        );
      }

      await loadStudents();
      setIsArchiveModalOpen(false);
      setStudentToArchive(null);
    } catch (error) {
      console.error("Failed to archive student", error);
      const message =
        error instanceof Error
          ? error.message
          : "Unable to move student to Trash.";
      alert(message);
    }
  };

  const cancelArchive = () => {
    setIsArchiveModalOpen(false);
    setStudentToArchive(null);
  };

  const openViewModal = (student: Student) => {
    setViewingStudent(student);
  };

  const closeViewModal = () => {
    setViewingStudent(null);
  };

  const viewingStudentRequirements = viewingStudent
    ? getStudentRequirementSnapshot({
        branch: viewingStudent.branch || currentBranch,
        studentNumber: viewingStudent.id,
        trackingNumber: viewingStudent.trackingNumber,
      })
    : null;

  const handleEditFromView = () => {
    if (!viewingStudent) return;
    const selectedStudent = viewingStudent;
    closeViewModal();
    openAddEditModal(selectedStudent);
  };

  const getShsTrackAndSpecialization = (student: Student) => {
    const trackTypeFromYearLevel =
      student.yearLevel === "Academic Track" ||
      student.yearLevel.startsWith("Academic Track")
        ? "Academic Track"
        : student.yearLevel === "Technical Professional Track" ||
            student.yearLevel.startsWith("Technical Professional Track")
          ? "Technical Professional Track"
          : "";

    const specializationFromYearLevel = student.yearLevel.startsWith(
      "Academic Track - ",
    )
      ? student.yearLevel.replace("Academic Track - ", "")
      : student.yearLevel.startsWith("Technical Professional Track - ")
        ? student.yearLevel.replace("Technical Professional Track - ", "")
        : "";

    const trackType = student.shsTrackType || trackTypeFromYearLevel;
    const specialization =
      student.strandOrCourse || specializationFromYearLevel;

    return { trackType, specialization };
  };

  const getShsTrackDisplay = (student: Student) => {
    const { trackType } = getShsTrackAndSpecialization(student);
    return trackType || "—";
  };

  const getShsSpecializationDisplay = (student: Student) => {
    const { specialization } = getShsTrackAndSpecialization(student);
    return specialization || "—";
  };

  const getShsYearLevelDisplay = (student: Student) => {
    if (
      student.yearLevel === "Academic Track" ||
      student.yearLevel === "Technical Professional Track" ||
      student.yearLevel.startsWith("Academic Track - ") ||
      student.yearLevel.startsWith("Technical Professional Track - ")
    ) {
      return "—";
    }

    return student.yearLevel || "—";
  };

  const handleSidebarToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="students-page">
      <AdminSidebar
        isOpen={isSidebarOpen}
        onClose={handleSidebarClose}
        onLogout={onLogout}
        loggedInUsername={loggedInUsername}
        loggedInRole={loggedInRole}
        canAccessBackup={canAccessBackup}
      />

      {/* Mobile menu toggle */}
      <button
        className="students-menu-toggle"
        onClick={handleSidebarToggle}
        aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
      >
        {isSidebarOpen ? "✕" : "☰"}
      </button>

      {/* Main content */}
      <main className="students-content">
        <header className="students-header">
          <h1>Students</h1>
          <p>
            {isLoading
              ? "Loading students from backend..."
              : "Manage and view all enrolled students."}
          </p>
        </header>

        <div className="students-controls">
          <input
            type="text"
            placeholder="Search by Name, ID, Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="students-search-input"
          />
          <button
            className="students-add-btn"
            onClick={() => openAddEditModal()}
          >
            {isLoading ? "Loading..." : "+ Add New Student"}
          </button>
        </div>

        <div className="students-filters">
          <div className="students-filter-group">
            <label>Academic Level</label>
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
            >
              <option>All Programs</option>
              <option>SHS</option>
              <option>College</option>
            </select>
          </div>
          <div className="students-filter-group">
            <label>Year Level</label>
            <select
              value={filterYearLevel}
              onChange={(e) => setFilterYearLevel(e.target.value)}
            >
              <option value="">All Year Levels</option>
              {yearLevelOptions.map((yearLevelOption) => (
                <option key={yearLevelOption} value={yearLevelOption}>
                  {yearLevelOption}
                </option>
              ))}
            </select>
          </div>
          <div className="students-filter-group">
            <label>Section</label>
            <select
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
            >
              <option value="">All Sections</option>
              {sectionOptions.map((sectionOption) => (
                <option key={sectionOption} value={sectionOption}>
                  {sectionOption}
                </option>
              ))}
            </select>
          </div>
          <div className="students-filter-group">
            <label>Requirement Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option>All</option>
              <option>Complete</option>
              <option>Incomplete</option>
            </select>
          </div>
        </div>

        <div className="students-table-container">
          <table className="students-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="students-table-sort-btn"
                    onClick={() => toggleSort("id")}
                  >
                    Student ID {sortIndicator("id")}
                  </button>
                </th>
                <th>Name</th>
                <th>Course/Track</th>
                <th>Specialization</th>
                <th>Grade Year</th>
                <th>Email</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {sortedStudents.length > 0 ? (
                sortedStudents.map((student) => (
                  <tr key={student.id}>
                    <td>{student.id}</td>
                    <td>{student.name}</td>
                    <td>
                      {student.program === "SHS"
                        ? getShsTrackDisplay(student)
                        : student.strandOrCourse || student.program}
                    </td>
                    <td>
                      {student.program === "SHS"
                        ? getShsSpecializationDisplay(student)
                        : "—"}
                    </td>
                    <td>
                      {student.program === "SHS"
                        ? getShsYearLevelDisplay(student)
                        : student.yearLevel}
                    </td>
                    <td>{student.email}</td>
                    <td>
                      <span
                        className={
                          student.status === "Complete"
                            ? "students-status-complete"
                            : student.status === "Archived"
                              ? "students-status-archived"
                              : "students-status-incomplete"
                        }
                      >
                        {student.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="students-action-btn students-view-btn"
                        onClick={() => openViewModal(student)}
                      >
                        View Details
                      </button>
                      {student.status !== "Archived" ? (
                        <button
                          className="students-action-btn students-archive-btn"
                          onClick={() => openArchiveConfirm(student.id)}
                        >
                          Trash
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="students-no-results">
                    {isLoading
                      ? "Loading students..."
                      : "No students found matching your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add/Edit Modal - Keep same modal structure but update class names */}
        {isAddEditModalOpen && (
          <div className="students-modal-overlay">
            <div className="students-modal">
              <div className="students-modal-header">
                <h2>{editingStudent ? "Edit Student" : "Add New Student"}</h2>
                <button
                  className="students-modal-close"
                  onClick={() => setIsAddEditModalOpen(false)}
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className="students-modal-form">
                {/* Keep all form fields same structure, just update class prefixes */}
                <div className="students-form-group">
                  <label>Student ID</label>
                  <input
                    name="id"
                    value={formData.id}
                    readOnly
                    disabled
                    className={formErrors.id ? "students-input-error" : ""}
                  />
                  {formErrors.id && (
                    <span className="students-error-text">{formErrors.id}</span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Full Name *</label>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className={formErrors.name ? "students-input-error" : ""}
                  />
                  {formErrors.name && (
                    <span className="students-error-text">
                      {formErrors.name}
                    </span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Program *</label>
                  <select
                    name="program"
                    value={formData.program}
                    onChange={handleChange}
                    required
                    className={formErrors.program ? "students-input-error" : ""}
                  >
                    <option value="">Select Program</option>
                    <option value="SHS">SHS</option>
                    <option value="College">College</option>
                  </select>
                  {formErrors.program && (
                    <span className="students-error-text">
                      {formErrors.program}
                    </span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Year Level *</label>
                  {formData.program === "SHS" ? (
                    <>
                      <select
                        name="yearLevel"
                        value={formData.yearLevel}
                        onChange={handleChange}
                        required
                        className={
                          formErrors.yearLevel ? "students-input-error" : ""
                        }
                      >
                        <option value="">Select SHS Year Level</option>
                        <option value="Grade 11">Grade 11</option>
                        <option value="Grade 12">Grade 12</option>
                      </select>
                      {formErrors.yearLevel === "Year Level is required" && (
                        <span className="students-error-text">
                          {formErrors.yearLevel}
                        </span>
                      )}

                      <select
                        value={shsTrackType}
                        onChange={(e) =>
                          handleShsTrackTypeChange(e.target.value)
                        }
                        required
                        className={
                          formErrors.yearLevel ? "students-input-error" : ""
                        }
                        style={{ marginTop: "10px" }}
                      >
                        <option value="">Select SHS Track</option>
                        <option value="Academic Track">Academic Track</option>
                        <option value="Technical Professional Track">
                          Technical Professional Track
                        </option>
                      </select>
                      {formErrors.yearLevel === "Track is required for SHS" && (
                        <span className="students-error-text">
                          {formErrors.yearLevel}
                        </span>
                      )}

                      {shsTrackType === "Academic Track" ? (
                        <>
                          <select
                            value={programSpecialization}
                            onChange={(e) =>
                              handleProgramSpecializationChange(e.target.value)
                            }
                            required
                            className={
                              formErrors.yearLevel ? "students-input-error" : ""
                            }
                            style={{ marginTop: "10px" }}
                          >
                            <option value="">
                              Select Academic Track Specialization
                            </option>
                            <option value="Arts, Social Science and Humanities">
                              Arts, Social Science and Humanities
                            </option>
                            <option value="Business Entrepreneurship">
                              Business Entrepreneurship
                            </option>
                          </select>
                          {formErrors.yearLevel ===
                            "Specialization is required for SHS" && (
                            <span className="students-error-text">
                              {formErrors.yearLevel}
                            </span>
                          )}
                        </>
                      ) : null}

                      {shsTrackType === "Technical Professional Track" ? (
                        <>
                          <select
                            value={programSpecialization}
                            onChange={(e) =>
                              handleProgramSpecializationChange(e.target.value)
                            }
                            required
                            className={
                              formErrors.yearLevel ? "students-input-error" : ""
                            }
                            style={{ marginTop: "10px" }}
                          >
                            <option value="">
                              Select Technical Track Specialization
                            </option>
                            <option value="ICT SUPPORT AND PROGRAMMING TECHNOLOGIES">
                              ICT SUPPORT AND PROGRAMMING TECHNOLOGIES
                            </option>
                          </select>
                          {formErrors.yearLevel ===
                            "Specialization is required for SHS" && (
                            <span className="students-error-text">
                              {formErrors.yearLevel}
                            </span>
                          )}
                        </>
                      ) : null}
                    </>
                  ) : formData.program === "College" ? (
                    <>
                      <select
                        name="yearLevel"
                        value={formData.yearLevel}
                        onChange={(e) =>
                          handleCollegeYearLevelChange(e.target.value)
                        }
                        required
                        className={
                          formErrors.yearLevel ? "students-input-error" : ""
                        }
                      >
                        <option value="">Select College Year Level</option>
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                        <option value="4th Year">4th Year</option>
                      </select>
                      {formErrors.yearLevel === "Year Level is required" && (
                        <span className="students-error-text">
                          {formErrors.yearLevel}
                        </span>
                      )}

                      <select
                        value={programSpecialization}
                        onChange={(e) =>
                          handleProgramSpecializationChange(e.target.value)
                        }
                        required
                        className={
                          formErrors.yearLevel ? "students-input-error" : ""
                        }
                        style={{ marginTop: "10px" }}
                      >
                        <option value="">Select Course</option>
                        <option value="BS ENTREPRENEURSHIP">
                          BS ENTREPRENEURSHIP
                        </option>
                      </select>
                      {formErrors.yearLevel ===
                        "Course selection is required for College" && (
                        <span className="students-error-text">
                          {formErrors.yearLevel}
                        </span>
                      )}
                    </>
                  ) : (
                    <input
                      name="yearLevel"
                      value={formData.yearLevel}
                      onChange={handleChange}
                      required
                      className={
                        formErrors.yearLevel ? "students-input-error" : ""
                      }
                    />
                  )}
                </div>

                <div className="students-form-group">
                  <label>Document Submitted Date</label>
                  <input
                    name="documentSubmitted"
                    type="date"
                    value={formData.documentSubmitted}
                    onChange={handleChange}
                  />
                </div>

                <div className="students-form-group">
                  <label>Contact Number</label>
                  <input
                    name="contact"
                    value={formData.contact}
                    onChange={handleChange}
                    className={formErrors.contact ? "students-input-error" : ""}
                  />
                  {formErrors.contact && (
                    <span className="students-error-text">
                      {formErrors.contact}
                    </span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={formErrors.email ? "students-input-error" : ""}
                  />
                  {formErrors.email && (
                    <span className="students-error-text">
                      {formErrors.email}
                    </span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Address</label>
                  <input
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className={formErrors.address ? "students-input-error" : ""}
                  />
                  {formErrors.address && (
                    <span className="students-error-text">
                      {formErrors.address}
                    </span>
                  )}
                </div>

                <div className="students-form-group">
                  <label>Status</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                  >
                    <option value="Complete">Complete</option>
                    <option value="Incomplete">Incomplete</option>
                  </select>
                </div>

                <div className="students-modal-actions">
                  <button
                    type="button"
                    className="students-cancel-btn"
                    onClick={() => setIsAddEditModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="students-save-btn">
                    {editingStudent ? "Update Student" : "Save Student"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View Details Modal */}
        {viewingStudent && (
          <div className="students-modal-overlay">
            <div className="students-modal students-view-modal">
              <div className="students-modal-header">
                <h2>Student Details</h2>
                <button
                  className="students-modal-close"
                  onClick={closeViewModal}
                >
                  ×
                </button>
              </div>

              <div className="students-modal-body">
                <div className="students-detail-item">
                  <span className="students-detail-label">Student ID:</span>
                  <span className="students-detail-value">
                    {viewingStudent.id}
                  </span>
                </div>
                <div className="students-detail-item">
                  <span className="students-detail-label">Full Name:</span>
                  <span className="students-detail-value">
                    {viewingStudent.name}
                  </span>
                </div>
                <div className="students-detail-item">
                  <span className="students-detail-label">Program:</span>
                  <span className="students-detail-value">
                    {viewingStudent.program}
                  </span>
                </div>
                <div className="students-detail-item">
                  <span className="students-detail-label">Year Level:</span>
                  <span className="students-detail-value">
                    {viewingStudent.yearLevel}
                  </span>
                </div>
                <div className="students-detail-item">
                  <span className="students-detail-label">
                    Document Submitted:
                  </span>
                  <span className="students-detail-value">
                    {viewingStudent.documentSubmitted || "Not submitted"}
                  </span>
                </div>
                <div className="students-detail-item">
                  <span className="students-detail-label">Contact Number:</span>
                  <span className="students-detail-value">
                    {viewingStudent.contact || "Not provided"}
                  </span>
                </div>
                <div className="students-detail-item">
                  <span className="students-detail-label">Email:</span>
                  <span className="students-detail-value">
                    {viewingStudent.email || "Not provided"}
                  </span>
                </div>
                <div className="students-detail-item">
                  <span className="students-detail-label">Address:</span>
                  <span className="students-detail-value">
                    {viewingStudent.address || "Not provided"}
                  </span>
                </div>
                <div className="students-detail-item">
                  <span className="students-detail-label">Status:</span>
                  <span
                    className={
                      viewingStudent.status === "Complete"
                        ? "students-status-complete"
                        : viewingStudent.status === "Archived"
                          ? "students-status-archived"
                          : "students-status-incomplete"
                    }
                  >
                    {viewingStudent.status}
                  </span>
                </div>

                <div className="students-detail-item">
                  <span className="students-detail-label">Requirements:</span>
                  <span className="students-detail-value">
                    {viewingStudentRequirements
                      ? `${viewingStudentRequirements.summary.submitted}/${viewingStudentRequirements.summary.total} submitted`
                      : "No linked admission record"}
                  </span>
                </div>

                {viewingStudentRequirements && (
                  <>
                    <div className="students-detail-item">
                      <span className="students-detail-label">
                        Submitted Files:
                      </span>
                      <span className="students-detail-value">
                        {viewingStudentRequirements.summary.submitted}
                      </span>
                    </div>
                    <div className="students-detail-item">
                      <span className="students-detail-label">
                        Pending Requirements:
                      </span>
                      <span className="students-detail-value">
                        {viewingStudentRequirements.summary.pending}
                      </span>
                    </div>

                    <div className="students-detail-item">
                      <span className="students-detail-label">
                        Submitted List:
                      </span>
                      <span className="students-detail-value">
                        {viewingStudentRequirements.submittedAttachments.length >
                        0 ? (
                          <div>
                            {viewingStudentRequirements.submittedAttachments.map(
                              (attachment) => (
                                <div key={attachment.name}>
                                  <strong>{attachment.name}</strong>{" "}
                                  ({attachment.reviewStatus || "Pending"}){" "}
                                  {attachment.url && attachment.url !== "#" ? (
                                    <a
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      View
                                    </a>
                                  ) : (
                                    <span>Reference only</span>
                                  )}
                                </div>
                              ),
                            )}
                          </div>
                        ) : (
                          "No submitted files"
                        )}
                      </span>
                    </div>

                    <div className="students-detail-item">
                      <span className="students-detail-label">
                        Pending List:
                      </span>
                      <span className="students-detail-value">
                        {viewingStudentRequirements.pendingRequirements.length >
                        0 ? (
                          <div>
                            {viewingStudentRequirements.pendingRequirements.map(
                              (requirement) => (
                                <div key={requirement.code}>
                                  {requirement.name}
                                </div>
                              ),
                            )}
                          </div>
                        ) : (
                          "No pending requirements"
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="students-modal-actions">
                <button
                  type="button"
                  className="students-save-btn"
                  onClick={handleEditFromView}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="students-cancel-btn"
                  onClick={closeViewModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Archive Confirmation Modal */}
        {isArchiveModalOpen && (
          <div className="students-modal-overlay">
            <div className="students-modal students-archive-confirm-modal">
              <div className="students-modal-header">
                <h2>Confirm Trash</h2>
                <button
                  className="students-modal-close"
                  onClick={cancelArchive}
                >
                  ×
                </button>
              </div>

              <div className="students-modal-body">
                <p>Are you sure you want to move this student to Trash?</p>
                <p className="students-student-info">
                  <strong>
                    {students.find((s) => s.id === studentToArchive)?.name}
                  </strong>{" "}
                  <br />
                  (ID: {studentToArchive})
                </p>
                <p>This student will be hidden from Active records.</p>
              </div>

              <div className="students-modal-actions">
                <button
                  type="button"
                  className="students-cancel-btn"
                  onClick={cancelArchive}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="students-archive-confirm-btn"
                  onClick={confirmArchive}
                >
                  Yes, Move to Trash
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
