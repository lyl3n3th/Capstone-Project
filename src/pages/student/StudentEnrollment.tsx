import { useEffect, useRef, useState } from "react";
import { FaCheckCircle, FaSpinner } from "react-icons/fa";
import { IoDocumentText } from "react-icons/io5";
import { MdDownload, MdFileUpload } from "react-icons/md";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import { ToastContainer } from "../../components/common/Toast";
import { useStudent } from "../../hooks/useStudent";
import {
  getStudentCredentialOverview,
  getStudentPortalSubjectsForTerm,
  type StudentPortalSubject,
} from "../../services/adminStorage";
import {
  getAdmissionDiscountSourceLabel,
  getAdmissionDiscountSource,
  getEffectiveAdmissionDiscountPercentage,
  getHonorDiscountPercentage,
} from "../../services/admission";
import type { Student } from "../../types/student";
import "../../styles/main.css";

type Toast = {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
};

type UploadedEnrollmentFile = {
  name: string;
  url?: string;
};

type EnrollmentRequirementItem = {
  key: string;
  label: string;
  allowsDownload?: boolean;
};

type NextAcademicPlacement = {
  yearLevel: string;
  semester: string;
  academicYear: string;
  hasNextTerm: boolean;
};

type EnrollmentFallbackSubject = {
  id: string;
  code: string;
  title: string;
  units?: number;
  program: "SHS" | "College";
  yearLevel: string;
  semester: string;
  strand?: string;
};

const FALLBACK_ENROLLMENT_SUBJECTS: EnrollmentFallbackSubject[] = [
  {
    id: "shs-g11-s2-1",
    code: "MIN106",
    title: "21st Century Literature from the Philippines and the World",
    program: "SHS",
    yearLevel: "Grade 11",
    semester: "2nd Semester",
  },
  {
    id: "shs-g11-s2-2",
    code: "MIN107",
    title: "Statistics and Probability",
    program: "SHS",
    yearLevel: "Grade 11",
    semester: "2nd Semester",
  },
  {
    id: "shs-g11-s2-3",
    code: "MIN108",
    title: "Physical Science",
    program: "SHS",
    yearLevel: "Grade 11",
    semester: "2nd Semester",
  },
  {
    id: "shs-g11-s2-4",
    code: "MIN109",
    title: "Empowerment Technologies",
    program: "SHS",
    yearLevel: "Grade 11",
    semester: "2nd Semester",
  },
  {
    id: "shs-g11-s2-ict-1",
    code: "MAJ106",
    title: "Programming Fundamentals",
    program: "SHS",
    yearLevel: "Grade 11",
    semester: "2nd Semester",
    strand: "ICT",
  },
  {
    id: "shs-g11-s2-ict-2",
    code: "MAJ107",
    title: "Web Development Basics",
    program: "SHS",
    yearLevel: "Grade 11",
    semester: "2nd Semester",
    strand: "ICT",
  },
  {
    id: "shs-g12-s1-1",
    code: "MIN201",
    title: "English for Academic and Professional Purposes",
    program: "SHS",
    yearLevel: "Grade 12",
    semester: "1st Semester",
  },
  {
    id: "shs-g12-s1-2",
    code: "MIN202",
    title: "Media and Information Literacy",
    program: "SHS",
    yearLevel: "Grade 12",
    semester: "1st Semester",
  },
  {
    id: "shs-g12-s1-3",
    code: "MIN203",
    title: "Contemporary Philippine Arts from the Regions",
    program: "SHS",
    yearLevel: "Grade 12",
    semester: "1st Semester",
  },
  {
    id: "shs-g12-s1-4",
    code: "MIN204",
    title: "Research in Daily Life 1",
    program: "SHS",
    yearLevel: "Grade 12",
    semester: "1st Semester",
  },
  {
    id: "shs-g12-s1-ict-1",
    code: "MAJ201",
    title: "Animation and Multimedia",
    program: "SHS",
    yearLevel: "Grade 12",
    semester: "1st Semester",
    strand: "ICT",
  },
  {
    id: "shs-g12-s1-ict-2",
    code: "MAJ202",
    title: "Mobile Application Fundamentals",
    program: "SHS",
    yearLevel: "Grade 12",
    semester: "1st Semester",
    strand: "ICT",
  },
  {
    id: "shs-g12-s2-1",
    code: "MIN205",
    title: "Inquiries, Investigations and Immersion",
    program: "SHS",
    yearLevel: "Grade 12",
    semester: "2nd Semester",
  },
  {
    id: "shs-g12-s2-2",
    code: "MIN206",
    title: "Understanding Culture, Society and Politics",
    program: "SHS",
    yearLevel: "Grade 12",
    semester: "2nd Semester",
  },
  {
    id: "shs-g12-s2-3",
    code: "MIN207",
    title: "Introduction to the Philosophy of the Human Person",
    program: "SHS",
    yearLevel: "Grade 12",
    semester: "2nd Semester",
  },
  {
    id: "shs-g12-s2-4",
    code: "MIN208",
    title: "Research in Daily Life 2",
    program: "SHS",
    yearLevel: "Grade 12",
    semester: "2nd Semester",
  },
  {
    id: "shs-g12-s2-ict-1",
    code: "MAJ203",
    title: "Systems Integration and Architecture",
    program: "SHS",
    yearLevel: "Grade 12",
    semester: "2nd Semester",
    strand: "ICT",
  },
  {
    id: "shs-g12-s2-ict-2",
    code: "MAJ204",
    title: "Work Immersion",
    program: "SHS",
    yearLevel: "Grade 12",
    semester: "2nd Semester",
    strand: "ICT",
  },
  {
    id: "col-1y-2s-1",
    code: "GE102",
    title: "Purposive Communication",
    units: 3,
    program: "College",
    yearLevel: "1st Year",
    semester: "2nd Semester",
  },
  {
    id: "col-1y-2s-2",
    code: "MATH102",
    title: "Mathematics in the Modern World",
    units: 3,
    program: "College",
    yearLevel: "1st Year",
    semester: "2nd Semester",
  },
  {
    id: "col-1y-2s-3",
    code: "CC102",
    title: "Computer Programming 1",
    units: 3,
    program: "College",
    yearLevel: "1st Year",
    semester: "2nd Semester",
  },
  {
    id: "col-1y-2s-4",
    code: "NSTP102",
    title: "NSTP 2",
    units: 3,
    program: "College",
    yearLevel: "1st Year",
    semester: "2nd Semester",
  },
  {
    id: "col-2y-1s-1",
    code: "GE201",
    title: "Readings in Philippine History",
    units: 3,
    program: "College",
    yearLevel: "2nd Year",
    semester: "1st Semester",
  },
  {
    id: "col-2y-1s-2",
    code: "IT201",
    title: "Data Structures and Algorithms",
    units: 3,
    program: "College",
    yearLevel: "2nd Year",
    semester: "1st Semester",
  },
  {
    id: "col-2y-1s-3",
    code: "IT202",
    title: "Object-Oriented Programming",
    units: 3,
    program: "College",
    yearLevel: "2nd Year",
    semester: "1st Semester",
  },
  {
    id: "col-2y-1s-4",
    code: "IT203",
    title: "Discrete Mathematics",
    units: 3,
    program: "College",
    yearLevel: "2nd Year",
    semester: "1st Semester",
  },
  {
    id: "col-2y-2s-1",
    code: "GE202",
    title: "Ethics",
    units: 3,
    program: "College",
    yearLevel: "2nd Year",
    semester: "2nd Semester",
  },
  {
    id: "col-2y-2s-2",
    code: "IT204",
    title: "Database Management Systems",
    units: 3,
    program: "College",
    yearLevel: "2nd Year",
    semester: "2nd Semester",
  },
  {
    id: "col-2y-2s-3",
    code: "IT205",
    title: "Networking 1",
    units: 3,
    program: "College",
    yearLevel: "2nd Year",
    semester: "2nd Semester",
  },
  {
    id: "col-2y-2s-4",
    code: "IT206",
    title: "Human-Computer Interaction",
    units: 3,
    program: "College",
    yearLevel: "2nd Year",
    semester: "2nd Semester",
  },
  {
    id: "col-3y-1s-1",
    code: "IT301",
    title: "Web Development",
    units: 3,
    program: "College",
    yearLevel: "3rd Year",
    semester: "1st Semester",
  },
  {
    id: "col-3y-1s-2",
    code: "IT302",
    title: "Systems Analysis and Design",
    units: 3,
    program: "College",
    yearLevel: "3rd Year",
    semester: "1st Semester",
  },
  {
    id: "col-3y-1s-3",
    code: "IT303",
    title: "Integrative Programming",
    units: 3,
    program: "College",
    yearLevel: "3rd Year",
    semester: "1st Semester",
  },
  {
    id: "col-3y-2s-1",
    code: "IT304",
    title: "Mobile Application Development",
    units: 3,
    program: "College",
    yearLevel: "3rd Year",
    semester: "2nd Semester",
  },
  {
    id: "col-3y-2s-2",
    code: "IT305",
    title: "Information Assurance",
    units: 3,
    program: "College",
    yearLevel: "3rd Year",
    semester: "2nd Semester",
  },
  {
    id: "col-3y-2s-3",
    code: "IT306",
    title: "Cloud Computing",
    units: 3,
    program: "College",
    yearLevel: "3rd Year",
    semester: "2nd Semester",
  },
  {
    id: "col-4y-1s-1",
    code: "IT401",
    title: "Capstone Project 1",
    units: 3,
    program: "College",
    yearLevel: "4th Year",
    semester: "1st Semester",
  },
  {
    id: "col-4y-1s-2",
    code: "IT402",
    title: "Data Analytics",
    units: 3,
    program: "College",
    yearLevel: "4th Year",
    semester: "1st Semester",
  },
  {
    id: "col-4y-1s-3",
    code: "IT403",
    title: "IT Project Management",
    units: 3,
    program: "College",
    yearLevel: "4th Year",
    semester: "1st Semester",
  },
  {
    id: "col-4y-2s-1",
    code: "IT405",
    title: "Capstone Project 2",
    units: 3,
    program: "College",
    yearLevel: "4th Year",
    semester: "2nd Semester",
  },
  {
    id: "col-4y-2s-2",
    code: "IT406",
    title: "Internship / Practicum",
    units: 6,
    program: "College",
    yearLevel: "4th Year",
    semester: "2nd Semester",
  },
  {
    id: "col-4y-2s-3",
    code: "IT407",
    title: "Professional Ethics",
    units: 3,
    program: "College",
    yearLevel: "4th Year",
    semester: "2nd Semester",
  },
];

const useToast = () => {
  const toastCounterRef = useRef(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: Toast["type"]) => {
    toastCounterRef.current += 1;
    const id = `student-enrollment-toast-${toastCounterRef.current}`;
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

const normalizeAcademicToken = (value?: string) =>
  (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const getNormalizedSemester = (semester?: string) =>
  normalizeAcademicToken(semester).includes("2nd")
    ? "2nd Semester"
    : "1st Semester";

const incrementAcademicYear = (academicYear: string) => {
  const match = academicYear.match(/^(\d{4})-(\d{4})$/);

  if (!match) {
    return academicYear;
  }

  return `${Number(match[1]) + 1}-${Number(match[2]) + 1}`;
};

const getNextAcademicPlacement = (
  student: Student | null,
  currentSemester: string,
  currentAcademicYear: string,
): NextAcademicPlacement => {
  if (!student) {
    return {
      yearLevel: "",
      semester: "1st Semester",
      academicYear: currentAcademicYear,
      hasNextTerm: false,
    };
  }

  const progression =
    student.programType === "SHS"
      ? ["Grade 11", "Grade 12"]
      : ["1st Year", "2nd Year", "3rd Year", "4th Year"];
  const normalizedSemester = getNormalizedSemester(currentSemester);

  if (normalizedSemester === "1st Semester") {
    return {
      yearLevel: student.yearLevel,
      semester: "2nd Semester",
      academicYear: currentAcademicYear,
      hasNextTerm: true,
    };
  }

  const currentIndex = progression.indexOf(student.yearLevel);

  if (currentIndex >= 0 && currentIndex < progression.length - 1) {
    return {
      yearLevel: progression[currentIndex + 1],
      semester: "1st Semester",
      academicYear: incrementAcademicYear(currentAcademicYear),
      hasNextTerm: true,
    };
  }

  return {
    yearLevel: student.yearLevel,
    semester: normalizedSemester,
    academicYear: currentAcademicYear,
    hasNextTerm: false,
  };
};

const getEnrollmentRequirementItems = (
  student: Student | null,
): EnrollmentRequirementItem[] => {
  if (!student) {
    return [];
  }

  const levelCredentialLabel =
    student.programType === "SHS" && student.yearLevel === "Grade 12"
      ? "Grade 12 Certificate of Grades"
      : `${student.yearLevel} Certificate of Grades`;

  return [
    {
      key: "level_certificate",
      label: levelCredentialLabel,
    },
    {
      key: "clearance",
      label: "Clearance",
      allowsDownload: true,
    },
  ];
};

const getFallbackEnrollmentSubjects = ({
  program,
  yearLevel,
  semester,
  strandOrCourse,
  academicYear,
}: {
  program: "SHS" | "College";
  yearLevel: string;
  semester: string;
  strandOrCourse?: string;
  academicYear: string;
}): StudentPortalSubject[] => {
  const normalizedTrack = normalizeAcademicToken(strandOrCourse);

  return FALLBACK_ENROLLMENT_SUBJECTS.filter((subject) => {
    if (
      subject.program !== program ||
      subject.yearLevel !== yearLevel ||
      subject.semester !== semester
    ) {
      return false;
    }

    if (!subject.strand) {
      return true;
    }

    return normalizedTrack.includes(normalizeAcademicToken(subject.strand));
  })
    .sort((left, right) => left.code.localeCompare(right.code))
    .map((subject) => ({
      id: subject.id,
      code: subject.code,
      title: subject.title,
      units: subject.units,
      schedule: "To be announced",
      room: "TBA",
      professor: "To be assigned",
      days: "TBA",
      time: "To be announced",
      semester: subject.semester,
      academicYear,
    }));
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);

const getStatusToneClass = (label: string) => {
  const normalized = normalizeAcademicToken(label);

  if (
    normalized.includes("approved") ||
    normalized.includes("complete") ||
    normalized.includes("ready")
  ) {
    return "s-status-completed";
  }

  if (
    normalized.includes("reupload") ||
    normalized.includes("rejected") ||
    normalized.includes("redo")
  ) {
    return "s-status-warning";
  }

  return "s-status-pending";
};

function StudentEnrollment() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<
    Record<string, UploadedEnrollmentFile>
  >({});
  const uploadedFilesRef = useRef<Record<string, UploadedEnrollmentFile>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [enrollmentStatus, setEnrollmentStatus] = useState<{
    status: "Pending" | "Approved" | "Rejected";
    enrollmentDate: string;
    semester: string;
    gradeLevel: string;
  }>({
    status: "Pending",
    enrollmentDate: "-",
    semester: "-",
    gradeLevel: "-",
  });
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { toasts, addToast, removeToast } = useToast();
  const { student, subjects, credentialSummary, isLoading } = useStudent();

  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const studentName = student
    ? `${student.firstName} ${student.lastName}`.trim()
    : "Loading...";
  const currentAcademicYear = subjects[0]?.academicYear || "2026-2027";
  const currentSemester = getNormalizedSemester(subjects[0]?.semester);
  const nextPlacement = getNextAcademicPlacement(
    student,
    currentSemester,
    currentAcademicYear,
  );
  const storageProgram: "SHS" | "College" =
    student?.programType === "SHS" ? "SHS" : "College";
  const programLabel =
    student?.programType === "SHS" ? "Senior High School" : "College";
  const credentialOverview = student
    ? getStudentCredentialOverview({
        branch: student.branch,
        studentNumber: student.studentNumber,
        trackingNumber: student.trackingNumber,
      })
    : null;
  const storedAssignedSubjects =
    student && nextPlacement.hasNextTerm
      ? getStudentPortalSubjectsForTerm({
          branch: student.branch,
          program: storageProgram,
          yearLevel: nextPlacement.yearLevel,
          strandOrCourse: student.program,
          semester: nextPlacement.semester,
          academicYear: nextPlacement.academicYear,
        })
      : [];
  const assignedSubjects =
    storedAssignedSubjects.length > 0
      ? storedAssignedSubjects
      : nextPlacement.hasNextTerm
        ? getFallbackEnrollmentSubjects({
            program: storageProgram,
            yearLevel: nextPlacement.yearLevel,
            semester: nextPlacement.semester,
            strandOrCourse: student?.program,
            academicYear: nextPlacement.academicYear,
          })
        : [];
  const enrollmentRequirements = getEnrollmentRequirementItems(student);
  const isCollegeStudent = Boolean(student && student.programType !== "SHS");
  const totalUnits = assignedSubjects.reduce(
    (sum, subject) => sum + (subject.units ?? 0),
    0,
  );
  const tuitionPerUnit = 600;
  const estimatedTuition = totalUnits * tuitionPerUnit;
  const honorLabel = credentialOverview?.applicantRecord.honorLabel || "No Honor";
  const scholarshipApplied = Boolean(
    credentialOverview?.applicantRecord.appliedForScholarship,
  );
  const scholarshipExamScore =
    credentialOverview?.applicantRecord.scholarshipExamScore;
  const honorDiscount = getHonorDiscountPercentage(honorLabel);
  const effectiveDiscountPercentage = getEffectiveAdmissionDiscountPercentage({
    honorLabel,
    appliedForScholarship: scholarshipApplied,
    scholarshipExamScore,
  });
  const effectiveDiscountSource = getAdmissionDiscountSource({
    honorLabel,
    appliedForScholarship: scholarshipApplied,
    scholarshipExamScore,
  });
  const effectiveDiscountSourceLabel =
    getAdmissionDiscountSourceLabel(effectiveDiscountSource);
  const discountedTuition =
    effectiveDiscountPercentage > 0
      ? estimatedTuition * (1 - effectiveDiscountPercentage / 100)
      : estimatedTuition;
  const portalRequirementStatus =
    credentialSummary?.overallStatus || "Pending Documents";

  const studentData = {
    name: studentName,
    id: student?.studentNumber || "",
    progrm: student?.programType || "",
    strand: student?.program || "Program TBA",
    section: student?.section || "TBA",
  };

  const handleMenuClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  const handleLogout = () => {
    console.log("Logging out...");
    addToast("Logging out...", "info");
  };

  const handleFileUpload = async (requirement: EnrollmentRequirementItem) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";

    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];

      if (!file) {
        return;
      }

      setUploadingId(requirement.key);

      try {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const previewUrl = URL.createObjectURL(file);

        setUploadedFiles((prev) => {
          const previousUrl = prev[requirement.key]?.url;

          if (previousUrl) {
            URL.revokeObjectURL(previousUrl);
          }

          return {
            ...prev,
            [requirement.key]: { name: file.name, url: previewUrl },
          };
        });
        addToast(`${requirement.label} uploaded successfully.`, "success");
      } catch (error) {
        console.error("Upload failed:", error);
        addToast("Upload failed. Please try again.", "error");
      } finally {
        setUploadingId(null);
      }
    };

    input.click();
  };

  const handleDownloadClearance = () => {
    const clearanceText = `STUDENT CLEARANCE FORM
${"=".repeat(50)}

Student Name: ${studentName}
Student Number: ${student?.studentNumber || "-"}
Program: ${programLabel}
Strand/Course: ${student?.program || "-"}
Current Level: ${student?.yearLevel || "-"}
Academic Year: ${currentAcademicYear}

${"=".repeat(50)}

CLEARANCE STATUS:

[ ] Instructor Clearance
[ ] Faculty Clearance
[ ] Registrar Clearance
[ ] Department Clearance

${"=".repeat(50)}

Note: This clearance requires physical signatures from authorized personnel.
Downloaded clearance is not valid without complete signatures.

Generated on: ${new Date().toLocaleDateString()}
`;

    const blob = new Blob([clearanceText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clearance_${student?.studentNumber || "student"}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addToast("Clearance downloaded successfully.", "success");
  };

  const handleEnroll = () => {
    if (!nextPlacement.hasNextTerm) {
      addToast(
        "A next enrollment term is not available yet for this student record.",
        "warning",
      );
      return;
    }

    if (assignedSubjects.length === 0) {
      addToast(
        "No subject set is available yet for the next enrollment term.",
        "warning",
      );
      return;
    }

    const missingRequirement = enrollmentRequirements.find(
      (requirement) => !uploadedFiles[requirement.key],
    );

    if (missingRequirement) {
      addToast(`Please upload ${missingRequirement.label} before enrolling.`, "warning");
      return;
    }

    setEnrollmentStatus({
      status: "Pending",
      enrollmentDate: new Date().toLocaleDateString(),
      semester: nextPlacement.semester,
      gradeLevel: nextPlacement.yearLevel,
    });

    addToast(
      `Enrollment submitted for ${nextPlacement.yearLevel} ${nextPlacement.semester}. Waiting for registrar approval.`,
      "success",
    );
  };

  const handleDownloadConfirmation = () => {
    if (enrollmentStatus.status !== "Approved") {
      addToast(
        "Enrollment confirmation is only available after approval.",
        "warning",
      );
      return;
    }

    const confirmationText = `ENROLLMENT CONFIRMATION
${"=".repeat(50)}

Asian Institute of Computer Studies
${student?.branch || "Bacoor"} Branch

${"=".repeat(50)}

Student Name: ${studentName}
Student Number: ${student?.studentNumber || "-"}
Program: ${programLabel}
Strand/Course: ${student?.program || "-"}
Grade Level: ${enrollmentStatus.gradeLevel}
Semester: ${enrollmentStatus.semester}
Academic Year: ${nextPlacement.academicYear}

${"=".repeat(50)}

ASSIGNED SUBJECTS:

${assignedSubjects.length > 0
  ? assignedSubjects
      .map(
        (subject, index) =>
          `${index + 1}. ${subject.code} - ${subject.title}${subject.units ? ` (${subject.units} units)` : ""}`,
      )
      .join("\n")
  : "No subjects assigned yet."}

${"=".repeat(50)}

Enrollment Status: ${enrollmentStatus.status}
Enrollment Date: ${enrollmentStatus.enrollmentDate}

This confirms that the student is officially enrolled for the upcoming term.

Registrar's Signature: ___________________
Date: ${new Date().toLocaleDateString()}
`;

    const blob = new Blob([confirmationText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `enrollment_confirmation_${student?.studentNumber || "student"}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addToast("Enrollment confirmation downloaded.", "success");
  };

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    return () => {
      Object.values(uploadedFilesRef.current).forEach((file) => {
        if (file.url) {
          URL.revokeObjectURL(file.url);
        }
      });
    };
  }, []);

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
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
          activePage="enrollment"
          onLogout={handleLogout}
        />
      </div>

      {sidebarOpen && (
        <div className="s-overlay" onClick={handleSidebarClose}></div>
      )}

      <div className="s-main">
        <Header
          title="Enrollment"
          onMenuClick={handleMenuClick}
          studentData={studentData}
          currentDate={currentDate}
        />

        <main className="s-content">
          <div className="s-welcome-banner">
            <h1>Enrollment</h1>
          </div>

          <div className="s-enrollment-row">
            <div className="s-enrollment-card s-eligibility-card">
              <h3>Enrollment Eligibility</h3>
              <div className="s-eligibility-item">
                <span className="s-eligibility-label">Current Level:</span>
                <span className="s-eligibility-value">
                  {student?.yearLevel || "-"}
                </span>
              </div>
              <div className="s-eligibility-item">
                <span className="s-eligibility-label">Current Semester:</span>
                <span className="s-eligibility-value">{currentSemester}</span>
              </div>
              <div className="s-eligibility-item">
                <span className="s-eligibility-label">Next Enrollment Term:</span>
                <span
                  className={`s-eligibility-value ${nextPlacement.hasNextTerm ? "s-status-completed" : "s-status-warning"}`}
                >
                  {nextPlacement.hasNextTerm
                    ? `${nextPlacement.yearLevel} - ${nextPlacement.semester}`
                    : "No next term available"}
                </span>
              </div>
              <div className="s-eligibility-item">
                <span className="s-eligibility-label">Portal Requirement Status:</span>
                <span
                  className={`s-eligibility-value ${getStatusToneClass(portalRequirementStatus)}`}
                >
                  {portalRequirementStatus}
                </span>
              </div>
            </div>

            <div className="s-enrollment-card s-student-info-card">
              <h3>Student Information</h3>
              <div className="s-student-info-item">
                <span className="s-info-label">Student Number:</span>
                <span className="s-info-value">{studentData.id || "-"}</span>
              </div>
              <div className="s-student-info-item">
                <span className="s-info-label">Student Name:</span>
                <span className="s-info-value">{studentData.name}</span>
              </div>
              <div className="s-student-info-item">
                <span className="s-info-label">Program:</span>
                <span className="s-info-value">{programLabel}</span>
              </div>
              <div className="s-student-info-item">
                <span className="s-info-label">Strand / Course:</span>
                <span className="s-info-value">{studentData.strand}</span>
              </div>
              <div className="s-student-info-item">
                <span className="s-info-label">Section:</span>
                <span className="s-info-value">{studentData.section}</span>
              </div>
            </div>
          </div>

          <div className="s-note-card">
            <div className="s-note-icon">
              <IoDocumentText />
            </div>
            <div className="s-note-content">
              <p>
                Assigned subjects now follow the next enrollment term based on
                the student&apos;s current year level and semester.
              </p>
              <p className="s-notice-text">
                Upcoming term:{" "}
                {nextPlacement.hasNextTerm
                  ? `${nextPlacement.yearLevel} - ${nextPlacement.semester} (${nextPlacement.academicYear})`
                  : "No next enrollment term is available yet."}
              </p>
            </div>
          </div>

          <div className="s-requirements-section">
            <h3>Enrollment & Requirements</h3>
            <div className="s-requirements-grid">
              {enrollmentRequirements.map((requirement) => (
                <div className="s-requirement-item" key={requirement.key}>
                  <span className="s-requirement-label">{requirement.label}</span>
                  <div className="s-requirement-actions">
                    {requirement.allowsDownload && (
                      <button
                        className="s-download-btn-small"
                        onClick={handleDownloadClearance}
                      >
                        <MdDownload /> Download
                      </button>
                    )}
                    {uploadedFiles[requirement.key]?.url && (
                      <a
                        className="s-requirement-view"
                        href={uploadedFiles[requirement.key]?.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View File
                      </a>
                    )}
                    {uploadedFiles[requirement.key] && (
                      <span className="s-file-name">
                        {uploadedFiles[requirement.key].name}
                      </span>
                    )}
                    <button
                      className="s-upload-btn"
                      onClick={() => void handleFileUpload(requirement)}
                      disabled={uploadingId === requirement.key}
                    >
                      {uploadingId === requirement.key ? (
                        <FaSpinner className="s-spin" />
                      ) : (
                        <MdFileUpload />
                      )}
                      {uploadingId === requirement.key ? " Uploading..." : " Upload"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="s-subjects-section">
            <h3>Assigned Subjects for Enrollment</h3>
            <div className="s-subject-summary">
              <span className="s-subject-chip">
                {nextPlacement.hasNextTerm
                  ? `${nextPlacement.yearLevel} - ${nextPlacement.semester}`
                  : "No next term available"}
              </span>
              <span className="s-subject-chip">{nextPlacement.academicYear}</span>
              {totalUnits > 0 && (
                <span className="s-subject-chip">{totalUnits} total units</span>
              )}
            </div>
            <div className="s-table-wrapper">
              <table className="s-enrollment-table">
                <thead>
                  <tr>
                    <th>Subject Code</th>
                    <th>Subject Title</th>
                    <th>Semester</th>
                    <th>Units</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedSubjects.length > 0 ? (
                    assignedSubjects.map((subject) => (
                      <tr key={subject.id}>
                        <td className="s-subject-code">{subject.code}</td>
                        <td className="s-subject-title">{subject.title}</td>
                        <td className="s-subject-semester">{subject.semester}</td>
                        <td>{subject.units ?? "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4}>
                        {nextPlacement.hasNextTerm
                          ? "No subject setup is available yet for this next term."
                          : "No next-term subject schedule is available for this student record."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {isCollegeStudent && (
            <div className="s-college-summary-grid">
              <div className="s-enrollment-card">
                <h3>Tuition Estimate</h3>
                <div className="s-finance-stat">
                  <span className="s-finance-label">Per Unit Rate</span>
                  <span className="s-finance-value">
                    {formatCurrency(tuitionPerUnit)}
                  </span>
                </div>
                <div className="s-finance-stat">
                  <span className="s-finance-label">Total Units</span>
                  <span className="s-finance-value">{totalUnits}</span>
                </div>
                <div className="s-finance-stat">
                  <span className="s-finance-label">Estimated Tuition</span>
                  <span className="s-finance-value">
                    {formatCurrency(estimatedTuition)}
                  </span>
                </div>
                <div className="s-finance-stat">
                  <span className="s-finance-label">Estimated After Discount</span>
                  <span className="s-finance-value">
                    {formatCurrency(discountedTuition)}
                  </span>
                </div>
              </div>

              <div className="s-enrollment-card">
                <h3>Scholarship & Discounts</h3>
                <div className="s-finance-stat">
                  <span className="s-finance-label">Honor Category</span>
                  <span className="s-finance-value">{honorLabel}</span>
                </div>
                <div className="s-finance-stat">
                  <span className="s-finance-label">Honor Discount</span>
                  <span className="s-finance-value">{honorDiscount}%</span>
                </div>
                <div className="s-finance-stat">
                  <span className="s-finance-label">Applied Discount</span>
                  <span className="s-finance-value">
                    {effectiveDiscountPercentage}%
                  </span>
                </div>
                <div className="s-finance-stat">
                  <span className="s-finance-label">Discount Basis</span>
                  <span className="s-finance-value">
                    {effectiveDiscountSourceLabel}
                  </span>
                </div>
                <div className="s-finance-stat">
                  <span className="s-finance-label">Scholarship Exam</span>
                  <span className="s-finance-value">
                    {scholarshipApplied ? "Applied" : "Not Applied"}
                  </span>
                </div>
                <div className="s-finance-stat">
                  <span className="s-finance-label">Exam Score</span>
                  <span className="s-finance-value">
                    {typeof scholarshipExamScore === "number"
                      ? scholarshipExamScore
                      : scholarshipApplied
                        ? "Awaiting result"
                        : "Not applicable"}
                  </span>
                </div>
                <p className="s-finance-note">
                  If you applied for scholarship and have an academic honor,
                  the higher percentage between your scholarship exam score and
                  honor discount will be used. Maintain the required criteria
                  each term to keep the discount active.
                </p>
              </div>
            </div>
          )}

          <div className="s-note-card s-warning-note">
            <div className="s-note-icon">
              <FaCheckCircle />
            </div>
            <div className="s-note-content">
              <p>
                Submitted enrollment stays in pending approval until the registrar
                reviews the uploaded requirements and confirms the next-term
                subject set.
              </p>
              <p className="s-notice-text">
                Notice: Pending approval means enrollment confirmation is still
                locked.
              </p>
            </div>
          </div>

          <div className="s-status-section">
            <h3>Enrollment Status</h3>
            <div className="s-table-wrapper">
              <table className="s-enrollment-table">
                <thead>
                  <tr>
                    <th>Enrollment Date</th>
                    <th>Semester</th>
                    <th>Grade Level</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{enrollmentStatus.enrollmentDate}</td>
                    <td>
                      {enrollmentStatus.semester !== "-"
                        ? enrollmentStatus.semester
                        : nextPlacement.hasNextTerm
                          ? nextPlacement.semester
                          : "-"}
                    </td>
                    <td>
                      {enrollmentStatus.gradeLevel !== "-"
                        ? enrollmentStatus.gradeLevel
                        : nextPlacement.hasNextTerm
                          ? nextPlacement.yearLevel
                          : "-"}
                    </td>
                    <td>
                      <span
                        className={`s-status-badge ${enrollmentStatus.status === "Approved" ? "s-status-approved" : enrollmentStatus.status === "Rejected" ? "s-status-warning" : "s-status-pending"}`}
                      >
                        {enrollmentStatus.status}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="s-enrollment-actions">
            <button className="s-enroll-btn" onClick={handleEnroll}>
              Enroll
            </button>
            <button
              className="s-download-confirmation-btn"
              onClick={handleDownloadConfirmation}
              disabled={enrollmentStatus.status !== "Approved"}
            >
              <MdDownload /> Download Enrollment Confirmation
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

export default StudentEnrollment;
