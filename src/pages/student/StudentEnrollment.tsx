import { useEffect, useMemo, useRef, useState } from "react";
import { FaSpinner } from "react-icons/fa";
import { IoDocumentText } from "react-icons/io5";
import { MdFileUpload } from "react-icons/md";
import Sidebar from "../../components/common/Sidebar";
import Header from "../../components/common/Header";
import StudentLoadingShell from "../../components/common/StudentLoadingShell";
import { ToastContainer } from "../../components/common/Toast";
import { useStudent } from "../../hooks/useStudent";
import {
  fetchInstructorEvaluationSubmissions,
  getEnrollmentRetakeChoiceGroups,
  getStudentCredentialOverview,
  getStudentPortalSubjectsForTerm,
  INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT,
  readInstructorEvaluationSubmissions,
  type InstructorEvaluationSubmissionRecord,
  type StudentPortalSubject,
} from "../../services/adminStorage";
import {
  getAdmissionDiscountSourceLabel,
  getAdmissionDiscountSource,
  getEffectiveAdmissionDiscountPercentage,
  getHonorDiscountPercentage,
  getScholarshipExamDiscountPercentage,
} from "../../services/admission";
import {
  buildEnrollmentSubjectKey,
  buildScheduledAssignmentConflicts,
  formatScheduledAssignmentLabel,
  getEnrollmentRetakeRequestItems,
  getRequiredShsQuarterLabels,
  getRetakeEvaluationLabel,
  isCollegeTerminalGradeRecord,
  isRetakeEvaluation,
} from "../../services/enrollmentLoadPlanner";
import {
  ENROLLMENT_REQUESTS_UPDATED_EVENT,
  fetchEnrollmentRequests,
  getEnrollmentRequestForStudent,
  getRegularEnrollmentRequirementItems,
  hydrateEnrollmentRequestAttachments,
  saveEnrollmentRequest,
  uploadEnrollmentRequestAttachment,
} from "../../services/enrollmentRequests";
import {
  getStudentGradeRecords,
  STUDENT_GRADE_RECORDS_UPDATED_EVENT,
  type StoredStudentGradeRecord,
} from "../../services/studentGrades";
import { getCurrentTermEvaluationLockStatus } from "../../services/studentEvaluationLock";
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
  type?: string;
  storagePath?: string;
  storageBucket?: string;
  uploadedAt?: string;
  reviewStatus?: "Pending" | "Approved" | "Rejected";
};

type EnrollmentRequirementItem = {
  key: string;
  label: string;
};

type EnrollmentGradePostingSummary = {
  isComplete: boolean;
  postedSubjects: number;
  totalSubjects: number;
  statusLabel: string;
  note: string;
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

  if (student.programType === "SHS" && normalizedSemester === "1st Semester") {
    return {
      yearLevel: student.yearLevel,
      semester: "2nd Semester",
      academicYear: currentAcademicYear,
      hasNextTerm: false,
    };
  }

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
  program?: string | null,
): EnrollmentRequirementItem[] =>
  getRegularEnrollmentRequirementItems(program).map((requirement) => ({
    key: requirement.key,
    label: requirement.name,
  }));

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

const getEnrollmentGradePostingSummary = ({
  program,
  semester,
  subjects,
  gradeRecords,
}: {
  program: "SHS" | "College";
  semester: string;
  subjects: StudentPortalSubject[];
  gradeRecords: StoredStudentGradeRecord[];
}): EnrollmentGradePostingSummary => {
  if (subjects.length === 0) {
    return {
      isComplete: false,
      postedSubjects: 0,
      totalSubjects: 0,
      statusLabel: "No Subjects",
      note: "Current-term subjects are not available in the portal yet.",
    };
  }

  const requiredShsQuarterLabels = getRequiredShsQuarterLabels(semester);
  const postedSubjects = subjects.reduce((count, subject) => {
    const subjectKey = buildEnrollmentSubjectKey({
      code: subject.code,
      title: subject.title,
    });
    const subjectGrades = gradeRecords.filter(
      (record) =>
        buildEnrollmentSubjectKey({
          code: record.subjectCode,
          title: record.subjectTitle,
        }) === subjectKey,
    );

    if (program === "SHS") {
      const hasCompleteSemesterGrades = requiredShsQuarterLabels.every((label) =>
        subjectGrades.some((record) => record.gradingPeriod === label),
      );

      return count + (hasCompleteSemesterGrades ? 1 : 0);
    }

    return count + (subjectGrades.some(isCollegeTerminalGradeRecord) ? 1 : 0);
  }, 0);
  const isComplete = postedSubjects === subjects.length;

  if (isComplete) {
    return {
      isComplete: true,
      postedSubjects,
      totalSubjects: subjects.length,
      statusLabel: "Complete",
      note:
        "All current-term subjects already have the grades needed for regular enrollment review.",
    };
  }

  return {
    isComplete: false,
    postedSubjects,
    totalSubjects: subjects.length,
    statusLabel: postedSubjects > 0 ? "Partially Posted" : "Awaiting Grades",
    note: `${postedSubjects} of ${subjects.length} current-term subject${
      subjects.length === 1 ? "" : "s"
    } already have the posted semester grades needed for enrollment.`,
  };
};

const getUploadedAttachmentType = (fileName?: string) => {
  if (!fileName?.includes(".")) {
    return "file";
  }

  return fileName.split(".").pop()?.trim().toLowerCase() || "file";
};

const hasViewableAttachmentUrl = (url?: string) =>
  Boolean(url && url !== "#");

const mapAttachmentsToUploadedFiles = (
  attachments: NonNullable<
    ReturnType<typeof getEnrollmentRequestForStudent>
  >["attachments"],
  enrollmentRequirements: EnrollmentRequirementItem[],
  previousFiles: Record<string, UploadedEnrollmentFile>,
) =>
  enrollmentRequirements.reduce<Record<string, UploadedEnrollmentFile>>(
    (result, requirement, index) => {
      const storedAttachment = attachments?.[index];

      if (!storedAttachment) {
        return result;
      }

      result[requirement.key] = {
        name: storedAttachment.name,
        type: storedAttachment.type,
        storagePath: storedAttachment.storagePath,
        storageBucket: storedAttachment.storageBucket,
        uploadedAt: storedAttachment.uploadedAt,
        reviewStatus: storedAttachment.reviewStatus,
        url: hasViewableAttachmentUrl(storedAttachment.url)
          ? storedAttachment.url
          : previousFiles[requirement.key]?.url,
      };
      return result;
    },
    {},
  );

function StudentEnrollment() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<
    Record<string, UploadedEnrollmentFile>
  >({});
  const uploadedFilesRef = useRef<Record<string, UploadedEnrollmentFile>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [gradeRecordsVersion, setGradeRecordsVersion] = useState(0);
  const [enrollmentRequestsVersion, setEnrollmentRequestsVersion] = useState(0);
  const [evaluationSubmissions, setEvaluationSubmissions] = useState<
    InstructorEvaluationSubmissionRecord[]
  >([]);
  const [isRetakePlanModalOpen, setIsRetakePlanModalOpen] = useState(false);
  const [selectedRetakeAssignmentsBySubject, setSelectedRetakeAssignmentsBySubject] =
    useState<Record<string, string>>({});
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { toasts, addToast, removeToast } = useToast();
  const { student, subjects, currentTerm, credentialSummary, isLoading } =
    useStudent();

  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const studentName = student
    ? `${student.firstName} ${student.lastName}`.trim()
    : "Loading...";
  const currentAcademicYear =
    currentTerm?.academicYear || subjects[0]?.academicYear || "2026-2027";
  const currentSemester = getNormalizedSemester(
    currentTerm?.semester || subjects[0]?.semester,
  );
  const currentYearLevel = currentTerm?.yearLevel || student?.yearLevel || "";
  const nextPlacement = getNextAcademicPlacement(
    student
      ? {
          ...student,
          yearLevel: currentYearLevel,
        }
      : null,
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
  const isCollegeStudent = Boolean(student && student.programType !== "SHS");
  const enrollmentRequirements = useMemo(
    () => getEnrollmentRequirementItems(storageProgram),
    [storageProgram],
  );
  const studentGradeRecords = useMemo(
    () => {
      void gradeRecordsVersion;

      return student?.studentNumber
        ? getStudentGradeRecords({
            branch: student.branch,
            studentId: student.studentNumber,
          }).filter(
            (record) => record.programType === (storageProgram === "SHS" ? "SHS" : "College"),
          )
        : [];
    },
    [gradeRecordsVersion, storageProgram, student?.branch, student?.studentNumber],
  );
  const currentTermSubjects = useMemo(
    () =>
      subjects.filter(
        (subject) =>
          subject.academicYear === currentAcademicYear &&
          getNormalizedSemester(subject.semester) === currentSemester,
      ),
    [currentAcademicYear, currentSemester, subjects],
  );
  const currentTermGradeRecords = useMemo(
    () =>
      studentGradeRecords.filter(
        (record) =>
          record.academicYear === currentAcademicYear &&
          getNormalizedSemester(record.semester) === currentSemester,
      ),
    [currentAcademicYear, currentSemester, studentGradeRecords],
  );
  const gradePostingSummary = useMemo(
    () =>
      getEnrollmentGradePostingSummary({
        program: storageProgram,
        semester: currentSemester,
        subjects: currentTermSubjects,
        gradeRecords: currentTermGradeRecords,
      }),
    [currentSemester, currentTermGradeRecords, currentTermSubjects, storageProgram],
  );
  const evaluationLockStatus = getCurrentTermEvaluationLockStatus({
    student,
    subjects,
    currentTerm,
    submissions: evaluationSubmissions,
  });
  const retakeSubjectAlerts = useMemo(
    () =>
      student && nextPlacement.hasNextTerm
        ? getEnrollmentRetakeRequestItems({
            program: storageProgram,
            semester: nextPlacement.semester,
            gradeRecords: studentGradeRecords,
          })
        : [],
    [
      nextPlacement.hasNextTerm,
      nextPlacement.semester,
      storageProgram,
      student,
      studentGradeRecords,
    ],
  );
  const activeEnrollmentRequest = useMemo(
    () => {
      void enrollmentRequestsVersion;

      return student
        ? getEnrollmentRequestForStudent({
            branch: student.branch,
            studentNumber: student.studentNumber,
            trackingNumber: student.trackingNumber,
            academicYear: nextPlacement.academicYear,
            semester: nextPlacement.semester,
          })
        : null;
    },
    [
      enrollmentRequestsVersion,
      nextPlacement.academicYear,
      nextPlacement.semester,
      student,
    ],
  );
  const requestedRetakeLoad =
    activeEnrollmentRequest?.requestedLoad?.mode === "retake"
      ? activeEnrollmentRequest.requestedLoad
      : null;
  const getEnrollmentRequirementAttachment = (
    requirement: EnrollmentRequirementItem,
  ) => {
    const requirementIndex = enrollmentRequirements.findIndex(
      (item) => item.key === requirement.key,
    );

    return requirementIndex >= 0
      ? activeEnrollmentRequest?.attachments?.[requirementIndex]
      : undefined;
  };
  const isEnrollmentRequirementRedo = (
    requirement: EnrollmentRequirementItem,
  ) =>
    activeEnrollmentRequest?.enrollmentStatus === "Pending" &&
    getEnrollmentRequirementAttachment(requirement)?.reviewStatus === "Rejected";
  const isRegularFlowStudent = student?.status === "Regular";
  const supportsIrregularEnrollmentRequest = Boolean(
    student && storageProgram === "College" && student.status === "Irregular",
  );
  const retakeChoiceGroups = useMemo(
    () =>
      student &&
      nextPlacement.hasNextTerm &&
      storageProgram === "College" &&
      isRegularFlowStudent &&
      retakeSubjectAlerts.length > 0
        ? getEnrollmentRetakeChoiceGroups({
            branch: student.branch,
            program: storageProgram,
            strandOrCourse: student.program,
            semester: nextPlacement.semester,
            academicYear: nextPlacement.academicYear,
            subjects: retakeSubjectAlerts,
          })
        : [],
    [
      isRegularFlowStudent,
      nextPlacement.academicYear,
      nextPlacement.hasNextTerm,
      nextPlacement.semester,
      retakeSubjectAlerts,
      storageProgram,
      student,
    ],
  );
  const selectedRetakeAssignments = useMemo(
    () =>
      retakeChoiceGroups.flatMap((group) => {
        const selectedAssignmentId =
          selectedRetakeAssignmentsBySubject[group.subjectId];
        const selectedAssignment = group.assignmentOptions.find(
          (assignment) => assignment.assignmentId === selectedAssignmentId,
        );

        return selectedAssignment ? [selectedAssignment] : [];
      }),
    [retakeChoiceGroups, selectedRetakeAssignmentsBySubject],
  );
  const retakePlanConflicts = useMemo(
    () => buildScheduledAssignmentConflicts(selectedRetakeAssignments),
    [selectedRetakeAssignments],
  );
  const retakeGroupsWithAvailableSchedules = useMemo(
    () => retakeChoiceGroups.filter((group) => group.assignmentOptions.length > 0),
    [retakeChoiceGroups],
  );
  const retakeGroupsWithoutAvailableSchedules = useMemo(
    () => retakeChoiceGroups.filter((group) => group.assignmentOptions.length === 0),
    [retakeChoiceGroups],
  );
  const isRetakePlanComplete = retakeGroupsWithAvailableSchedules.every((group) =>
    Boolean(selectedRetakeAssignmentsBySubject[group.subjectId]),
  );
  const selectedRetakeUnits = selectedRetakeAssignments.reduce(
    (sum, assignment) => sum + (assignment.units ?? 0),
    0,
  );
  const totalUnits = assignedSubjects.reduce(
    (sum, subject) => sum + (subject.units ?? 0),
    0,
  );
  const tuitionPerUnit = 600;
  const estimatedTuition = totalUnits * tuitionPerUnit;
  const honorLabel = credentialOverview?.applicantRecord.honorLabel || "No Honor";
  const honorCertificateApproved = Boolean(
    credentialOverview?.items.some(
      (item) =>
        item.name.trim().toLowerCase() === "honor certificate" &&
        item.reviewStatus === "Approved",
    ),
  );
  const scholarshipExamScore =
    credentialOverview?.applicantRecord.scholarshipExamScore;
  const scholarshipApplied = Boolean(
    credentialOverview?.applicantRecord.appliedForScholarship ||
      typeof scholarshipExamScore === "number",
  );
  const scholarshipExamDiscount = scholarshipApplied
    ? getScholarshipExamDiscountPercentage(scholarshipExamScore)
    : 0;
  const honorDiscount = honorCertificateApproved
    ? getHonorDiscountPercentage(honorLabel)
    : 0;
  const effectiveDiscountPercentage = getEffectiveAdmissionDiscountPercentage({
    honorLabel,
    honorCertificateApproved,
    appliedForScholarship: scholarshipApplied,
    scholarshipExamScore,
  });
  const effectiveDiscountSource = getAdmissionDiscountSource({
    honorLabel,
    honorCertificateApproved,
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
  const hasSupportedEnrollmentFlow =
    isRegularFlowStudent || supportsIrregularEnrollmentRequest;
  const isShsFirstSemesterAutoProgressionTerm =
    storageProgram === "SHS" && currentSemester === "1st Semester";
  const hasBlockingShsCurrentFailures =
    storageProgram === "SHS" &&
    currentTermGradeRecords.some((record) => isRetakeEvaluation(record.evaluation));
  const isLevelUpTerm = Boolean(
    student && nextPlacement.yearLevel !== student.yearLevel,
  );
  const hasRetakeAdvisory =
    isRegularFlowStudent && retakeSubjectAlerts.length > 0;
  const hasCollegeRetakePlanner =
    storageProgram === "College" &&
    isRegularFlowStudent &&
    retakeChoiceGroups.length > 0;
  const isRequestLocked =
    activeEnrollmentRequest?.enrollmentStatus === "Pending" ||
    activeEnrollmentRequest?.enrollmentStatus === "Approved";
  const isEligibleForEnrollment =
    Boolean(
      student &&
        gradePostingSummary.isComplete &&
        !hasBlockingShsCurrentFailures &&
        !evaluationLockStatus.isLocked &&
        nextPlacement.hasNextTerm &&
        (isRegularFlowStudent
          ? hasCollegeRetakePlanner || assignedSubjects.length > 0
          : supportsIrregularEnrollmentRequest),
    ) &&
    !isRequestLocked;
  const eligibilityStatusLabel = !student
    ? "Loading"
    : activeEnrollmentRequest?.enrollmentStatus === "Approved"
      ? "Approved for Enrollment"
      : activeEnrollmentRequest?.enrollmentStatus === "Pending"
        ? "Request Pending"
      : activeEnrollmentRequest?.enrollmentStatus === "Rejected"
          ? "Needs Resubmission"
          : hasBlockingShsCurrentFailures
            ? "Has Failed Grades"
            : evaluationLockStatus.isLocked
              ? "Evaluation Locked"
          : isShsFirstSemesterAutoProgressionTerm
            ? "Waiting for Quarter Completion"
          : isEligibleForEnrollment
            ? supportsIrregularEnrollmentRequest
              ? "Eligible with Own Schedule Request"
              : hasRetakeAdvisory
                ? "Eligible with Retake Advisory"
                : isLevelUpTerm
                  ? "Eligible to Level Up"
                  : "Eligible to Enroll"
            : "Not Yet Eligible";
  const eligibilityMessage = !student
    ? "Student record is still loading."
    : activeEnrollmentRequest?.enrollmentStatus === "Approved"
      ? "Your request for the upcoming term is already approved."
      : activeEnrollmentRequest?.enrollmentStatus === "Pending"
        ? "Your request is already waiting for admin or registrar review."
        : activeEnrollmentRequest?.enrollmentStatus === "Rejected"
          ? "Your last request was rejected. Reupload the required files and submit again."
          : !hasSupportedEnrollmentFlow
            ? "This enrollment page currently supports regular students and eligible college irregular schedule requests only."
            : hasBlockingShsCurrentFailures
              ? "At least one senior high grade is below 75. Failed subjects must be resolved before semester progression or year-level enrollment."
            : evaluationLockStatus.isLocked
              ? `Current term is locked until you submit all instructor evaluations. Completed ${evaluationLockStatus.completedCount}/${evaluationLockStatus.requiredCount}. Pending: ${evaluationLockStatus.pendingInstructorNames.join(", ")}.`
            : isShsFirstSemesterAutoProgressionTerm
              ? "Senior high students do not submit a new enrollment for 2nd Semester. Once all 1st and 2nd quarter grades are posted and passing, the portal automatically moves to 2nd Semester subjects."
            : !gradePostingSummary.isComplete
              ? gradePostingSummary.note
              : supportsIrregularEnrollmentRequest
                ? !nextPlacement.hasNextTerm
                  ? "A next enrollment term is not available yet for this student record."
                  : "All required grades are complete. Upload the requirements and submit this request so the next-term own schedule planner can be opened again."
                : hasRetakeAdvisory
                  ? hasCollegeRetakePlanner
                    ? "All required grades are complete. Upload the requirements, complete the retake plan load, and submit the request for review."
                    : "All required grades are complete, so you can still submit enrollment. The listed FAILED/INC subjects should be re-taken first, and dependent prerequisite subjects should wait until those retakes are completed."
                  : !nextPlacement.hasNextTerm
                    ? "A next enrollment term is not available yet for this student record."
                    : assignedSubjects.length === 0
                      ? "No subject set is available yet for the next enrollment term."
                      : "You can upload the requirements below and submit your enrollment request for review.";
  const enrollmentStatus = {
    status:
      activeEnrollmentRequest?.enrollmentStatus || ("Not Submitted" as const),
    enrollmentDate:
      activeEnrollmentRequest?.enrollmentDate ||
      activeEnrollmentRequest?.requestDate ||
      "-",
    semester: activeEnrollmentRequest?.semester || (nextPlacement.hasNextTerm ? nextPlacement.semester : "-"),
    gradeLevel:
      activeEnrollmentRequest?.requestedYearLevel ||
      (nextPlacement.hasNextTerm ? nextPlacement.yearLevel : "-"),
  };
  const enrollButtonLabel =
    activeEnrollmentRequest?.enrollmentStatus === "Pending"
      ? "Request Pending"
      : activeEnrollmentRequest?.enrollmentStatus === "Approved"
        ? "Enrollment Approved"
      : activeEnrollmentRequest?.enrollmentStatus === "Rejected"
          ? "Resubmit Enrollment Request"
          : supportsIrregularEnrollmentRequest
            ? "Submit Own Schedule Request"
            : "Submit Enrollment Request";

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

  useEffect(() => {
    const syncEvaluationSubmissions = () => {
      setEvaluationSubmissions(readInstructorEvaluationSubmissions(student?.branch));

      if (!student?.branch) {
        return;
      }

      void fetchInstructorEvaluationSubmissions(student.branch)
        .then(setEvaluationSubmissions)
        .catch((error) => {
          console.warn("Failed to sync evaluation submissions.", error);
        });
    };

    syncEvaluationSubmissions();

    window.addEventListener("storage", syncEvaluationSubmissions);
    window.addEventListener(
      INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT,
      syncEvaluationSubmissions,
    );

    return () => {
      window.removeEventListener("storage", syncEvaluationSubmissions);
      window.removeEventListener(
        INSTRUCTOR_EVALUATION_SUBMISSIONS_UPDATED_EVENT,
        syncEvaluationSubmissions,
      );
    };
  }, [student?.branch]);

  const handleFileUpload = async (requirement: EnrollmentRequirementItem) => {
    if (!student) {
      addToast("Student record is still loading.", "warning");
      return;
    }

    if (isShsFirstSemesterAutoProgressionTerm) {
      addToast(
        "Senior high students do not need a new enrollment request for 2nd Semester.",
        "info",
      );
      return;
    }

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
        const uploadedAttachment = await uploadEnrollmentRequestAttachment({
          trackingNumber: student.trackingNumber,
          studentNumber: student.studentNumber,
          academicYear: nextPlacement.academicYear,
          semester: nextPlacement.semester,
          requirementKey: requirement.key,
          file,
        });

        setUploadedFiles((prev) => ({
          ...prev,
          [requirement.key]: {
            name: uploadedAttachment.name,
            url: uploadedAttachment.url,
            type: uploadedAttachment.type,
            storagePath: uploadedAttachment.storagePath,
            storageBucket: uploadedAttachment.storageBucket,
            uploadedAt: uploadedAttachment.uploadedAt,
            reviewStatus: "Pending",
          },
        }));

        if (
          activeEnrollmentRequest?.enrollmentStatus === "Pending" &&
          isEnrollmentRequirementRedo(requirement)
        ) {
          const requirementIndex = enrollmentRequirements.findIndex(
            (item) => item.key === requirement.key,
          );
          const nextAttachments = [...(activeEnrollmentRequest.attachments ?? [])];

          nextAttachments[requirementIndex] = {
            ...uploadedAttachment,
            reviewStatus: "Pending",
          };

          await saveEnrollmentRequest({
            ...activeEnrollmentRequest,
            attachments: nextAttachments,
            updatedAt: new Date().toISOString(),
          });
          setEnrollmentRequestsVersion((previousValue) => previousValue + 1);
          addToast(
            `${requirement.label} resent successfully. Waiting for review.`,
            "success",
          );
          return;
        }

        addToast(`${requirement.label} uploaded successfully.`, "success");
      } catch (error) {
        console.error("Upload failed:", error);
        addToast(
          error instanceof Error
            ? error.message
            : "Upload failed. Please try again.",
          "error",
        );
      } finally {
        setUploadingId(null);
      }
    };

    input.click();
  };

  const openRetakePlanModal = () => {
    if (!hasCollegeRetakePlanner) {
      return;
    }

    setIsRetakePlanModalOpen(true);
  };

  const closeRetakePlanModal = () => {
    setIsRetakePlanModalOpen(false);
  };

  const handleRetakeAssignmentChange = (
    subjectId: string,
    nextAssignmentId: string,
  ) => {
    setSelectedRetakeAssignmentsBySubject((prev) => ({
      ...prev,
      [subjectId]: nextAssignmentId,
    }));
  };

  const handleEnroll = async () => {
    if (!student) {
      addToast("Student record is still loading.", "warning");
      return;
    }

    if (uploadingId) {
      addToast("Wait for the current file upload to finish first.", "info");
      return;
    }

    if (activeEnrollmentRequest?.enrollmentStatus === "Pending") {
      addToast(
        "Your enrollment request is already waiting for admin or registrar review.",
        "info",
      );
      return;
    }

    if (activeEnrollmentRequest?.enrollmentStatus === "Approved") {
      addToast("Your enrollment request is already approved.", "info");
      return;
    }

    if (!isRegularFlowStudent && !supportsIrregularEnrollmentRequest) {
      addToast(
        "This enrollment page currently supports regular students and eligible college irregular schedule requests only.",
        "warning",
      );
      return;
    }

    if (!gradePostingSummary.isComplete) {
      addToast(gradePostingSummary.note, "warning");
      return;
    }

    if (hasBlockingShsCurrentFailures) {
      addToast(
        "Senior high grades below 75 must be resolved before enrollment can continue.",
        "warning",
      );
      return;
    }

    if (evaluationLockStatus.isLocked) {
      addToast(
        `Complete all current-term instructor evaluations first. Pending: ${evaluationLockStatus.pendingInstructorNames.join(", ")}.`,
        "warning",
      );
      return;
    }

    if (!nextPlacement.hasNextTerm) {
      addToast(
        isShsFirstSemesterAutoProgressionTerm
          ? "Senior high students automatically move to 2nd Semester after all 1st and 2nd quarter grades are posted and passing."
          : "A next enrollment term is not available yet for this student record.",
        "warning",
      );
      return;
    }

    if (
      isRegularFlowStudent &&
      !hasCollegeRetakePlanner &&
      assignedSubjects.length === 0
    ) {
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

    if (hasCollegeRetakePlanner) {
      const incompleteRetakeGroup = retakeGroupsWithAvailableSchedules.find(
        (group) => !selectedRetakeAssignmentsBySubject[group.subjectId],
      );

      if (incompleteRetakeGroup) {
        setIsRetakePlanModalOpen(true);
        addToast(
          `Choose a schedule for ${incompleteRetakeGroup.subjectCode} before submitting.`,
          "warning",
        );
        return;
      }

      if (retakePlanConflicts.length > 0) {
        setIsRetakePlanModalOpen(true);
        addToast(
          "Resolve the retake plan schedule conflicts before submitting.",
          "warning",
        );
        return;
      }
    }

    const submittedAt = new Date();
    const irregularRequest = supportsIrregularEnrollmentRequest
      ? {
          mode: "own_schedule" as const,
        }
      : undefined;
    const requestedLoad = hasCollegeRetakePlanner
      ? {
          mode: "retake" as const,
          subjects: retakeChoiceGroups.map((group) => ({
            subjectId:
              group.subjectId && group.subjectId !== group.subjectCode
                ? group.subjectId
                : undefined,
            subjectCode: group.subjectCode,
            subjectTitle: group.subjectName,
            evaluation: group.evaluation,
            gradingPeriods: group.gradingPeriods,
          })),
          scheduledAssignments: selectedRetakeAssignments,
        }
      : undefined;
    const retakeSubjectsNote =
      retakeSubjectAlerts.length > 0
        ? ` Retake subjects: ${retakeSubjectAlerts
            .map(
              (alert) =>
                `${alert.subjectCode} (${getRetakeEvaluationLabel(alert.evaluation)})`,
            )
            .join(", ")}.`
        : "";
    const retakeOfferingNote =
      hasCollegeRetakePlanner && retakeGroupsWithoutAvailableSchedules.length > 0
        ? ` No schedule offering was available for ${retakeGroupsWithoutAvailableSchedules
            .map((group) => group.subjectCode)
            .join(", ")} during ${nextPlacement.semester} ${nextPlacement.academicYear}.`
        : "";
    const irregularRequestNote =
      irregularRequest?.mode === "own_schedule"
        ? ` Irregular request: student asked to request an own schedule again for ${nextPlacement.semester} ${nextPlacement.academicYear}.`
        : "";
    const nextRequest = {
      id:
        activeEnrollmentRequest?.id ||
        `enrollment-request-${student.studentNumber}-${nextPlacement.academicYear}-${nextPlacement.semester}`,
      branch: student.branch,
      studentNumber: student.studentNumber,
      trackingNumber: student.trackingNumber,
      fullName: studentName,
      program: storageProgram,
      strandOrCourse: student.program,
      currentYearLevel: student.yearLevel,
      currentSemester,
      requestedYearLevel: nextPlacement.yearLevel,
      academicYear: nextPlacement.academicYear,
      semester: nextPlacement.semester,
      enrollmentStatus: "Pending" as const,
      requestDate: submittedAt.toLocaleDateString(),
      updatedAt: submittedAt.toISOString(),
      notes: `${gradePostingSummary.postedSubjects}/${gradePostingSummary.totalSubjects} current-term subjects already have posted grades for the ${supportsIrregularEnrollmentRequest ? "irregular" : "regular"} enrollment flow.${retakeSubjectsNote}${hasRetakeAdvisory ? " Dependent prerequisite subjects should wait until the retakes are completed." : ""}${retakeOfferingNote}${irregularRequestNote}`,
      attachments: enrollmentRequirements.map((requirement) => ({
        name: uploadedFiles[requirement.key]?.name || requirement.label,
        type:
          uploadedFiles[requirement.key]?.type ||
          getUploadedAttachmentType(uploadedFiles[requirement.key]?.name),
        url: uploadedFiles[requirement.key]?.url || "#",
        reviewStatus: "Pending" as const,
        storagePath: uploadedFiles[requirement.key]?.storagePath,
        storageBucket: uploadedFiles[requirement.key]?.storageBucket,
        uploadedAt: uploadedFiles[requirement.key]?.uploadedAt,
      })),
      requestedLoad,
      irregularRequest,
    };

    try {
      await saveEnrollmentRequest(nextRequest);
      setEnrollmentRequestsVersion((previousValue) => previousValue + 1);
      setIsRetakePlanModalOpen(false);
      addToast(
        `Enrollment request sent for ${nextPlacement.yearLevel} ${nextPlacement.semester}. Admin or registrar review is now pending.`,
        "success",
      );
    } catch (error) {
      console.error("Failed to save enrollment request", error);
      addToast("Unable to submit the enrollment request right now.", "error");
    }
  };

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    const refreshGradeRecords = () => {
      setGradeRecordsVersion((previousValue) => previousValue + 1);
    };
    const refreshEnrollmentRequests = () => {
      setEnrollmentRequestsVersion((previousValue) => previousValue + 1);
    };
    const handleStorageUpdate = (event: StorageEvent) => {
      if (event.key?.includes(":student-grades:")) {
        refreshGradeRecords();
      }

      if (event.key?.includes(":enrollment-requests:")) {
        refreshEnrollmentRequests();
      }
    };

    window.addEventListener(
      STUDENT_GRADE_RECORDS_UPDATED_EVENT,
      refreshGradeRecords,
    );
    window.addEventListener(
      ENROLLMENT_REQUESTS_UPDATED_EVENT,
      refreshEnrollmentRequests,
    );
    window.addEventListener("storage", handleStorageUpdate);

    return () => {
      window.removeEventListener(
        STUDENT_GRADE_RECORDS_UPDATED_EVENT,
        refreshGradeRecords,
      );
      window.removeEventListener(
        ENROLLMENT_REQUESTS_UPDATED_EVENT,
        refreshEnrollmentRequests,
      );
      window.removeEventListener("storage", handleStorageUpdate);
    };
  }, []);

  useEffect(() => {
    if (!student) {
      return;
    }

    let isCancelled = false;

    const syncEnrollmentRequests = async () => {
      try {
        await fetchEnrollmentRequests(student.branch);

        if (!isCancelled) {
          setEnrollmentRequestsVersion((previousValue) => previousValue + 1);
        }
      } catch (error) {
        console.warn("Unable to refresh shared enrollment requests.", error);
      }
    };

    void syncEnrollmentRequests();

    return () => {
      isCancelled = true;
    };
  }, [student?.branch, student?.studentNumber, student?.trackingNumber]);

  useEffect(() => {
    if (!activeEnrollmentRequest?.attachments?.length) {
      return;
    }

    setUploadedFiles((previousFiles) =>
      mapAttachmentsToUploadedFiles(
        activeEnrollmentRequest.attachments,
        enrollmentRequirements,
        previousFiles,
      ),
    );

    if (
      !activeEnrollmentRequest.attachments.some(
        (attachment) => attachment.storagePath,
      )
    ) {
      return;
    }

    let isCancelled = false;

    const refreshUploadedAttachmentUrls = async () => {
      const hydratedAttachments = await hydrateEnrollmentRequestAttachments(
        activeEnrollmentRequest.attachments,
      );

      if (isCancelled || !hydratedAttachments?.length) {
        return;
      }

      setUploadedFiles((previousFiles) =>
        mapAttachmentsToUploadedFiles(
          hydratedAttachments,
          enrollmentRequirements,
          previousFiles,
        ),
      );
    };

    void refreshUploadedAttachmentUrls();

    return () => {
      isCancelled = true;
    };
  }, [activeEnrollmentRequest, enrollmentRequirements]);

  useEffect(() => {
    if (!hasCollegeRetakePlanner) {
      setSelectedRetakeAssignmentsBySubject({});
      setIsRetakePlanModalOpen(false);
      return;
    }

    const nextSelections = Object.fromEntries(
      retakeChoiceGroups.flatMap((group) => {
        const matchedAssignment = requestedRetakeLoad?.scheduledAssignments.find(
          (assignment) =>
            assignment.subjectCode === group.subjectCode ||
            assignment.subjectId === group.subjectId,
        );

        return matchedAssignment
          ? [[group.subjectId, matchedAssignment.assignmentId]]
          : [];
      }),
    );

    setSelectedRetakeAssignmentsBySubject(nextSelections);
  }, [hasCollegeRetakePlanner, requestedRetakeLoad, retakeChoiceGroups]);

  useEffect(() => {
    return () => {
      Object.values(uploadedFilesRef.current).forEach((file) => {
        if (file.url?.startsWith("blob:")) {
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
      <StudentLoadingShell
        activePage="enrollment"
        currentDate={currentDate}
        headerTitle="Enrollment"
        onLogout={handleLogout}
        onMenuClick={handleMenuClick}
        onSidebarClose={handleSidebarClose}
        skeletonTitle="Enrollment"
        studentData={studentData}
        variant="form"
        sidebarOpen={sidebarOpen}
      />
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
                <span className="s-eligibility-label">Student Flow:</span>
                <span className="s-eligibility-value">
                  {isRegularFlowStudent
                    ? "Regular Student"
                    : supportsIrregularEnrollmentRequest
                      ? "Irregular Schedule Request"
                      : student?.status || "-"}
                </span>
              </div>
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
                <span className="s-eligibility-label">Term Lock:</span>
                <span className="s-eligibility-value">
                  {evaluationLockStatus.requiredCount === 0
                    ? "No instructor evaluations required"
                    : evaluationLockStatus.isLocked
                      ? `Locked (${evaluationLockStatus.completedCount}/${evaluationLockStatus.requiredCount} evaluations)`
                      : "Unlocked"}
                </span>
              </div>
              <div className="s-eligibility-item">
                <span className="s-eligibility-label">Semester Grades:</span>
                <span className="s-eligibility-value">
                  {gradePostingSummary.totalSubjects > 0
                    ? `${gradePostingSummary.postedSubjects}/${gradePostingSummary.totalSubjects} ${gradePostingSummary.statusLabel}`
                    : gradePostingSummary.statusLabel}
                </span>
              </div>
              <div className="s-eligibility-item">
                <span className="s-eligibility-label">Next Enrollment Term:</span>
                <span className="s-eligibility-value">
                  {nextPlacement.hasNextTerm
                    ? `${nextPlacement.yearLevel} - ${nextPlacement.semester}`
                    : "No next term available"}
                </span>
              </div>
              <div className="s-eligibility-item">
                <span className="s-eligibility-label">Eligibility Result:</span>
                <span className="s-eligibility-value">
                  {eligibilityStatusLabel}
                </span>
              </div>
              <div className="s-eligibility-item">
                <span className="s-eligibility-label">Portal Requirement Status:</span>
                <span className="s-eligibility-value">
                  {portalRequirementStatus}
                </span>
              </div>
              <p className="s-eligibility-note">{eligibilityMessage}</p>
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

          {hasRetakeAdvisory && (
            <div className="s-enrollment-card s-retake-advisory-card">
              <h3>Retake Advisory</h3>
              <p className="s-retake-advisory-text">
                Your grades are complete, so enrollment can still proceed for
                review. The subjects below have FAILED or INC results and
                should be re-taken first. Dependent prerequisite subjects
                should not proceed until those retakes are completed.
              </p>
              <p className="s-retake-advisory-text s-retake-advisory-note">
                <strong>Note:</strong> Retake availability depends on the
                semester when the subject was originally assigned. Subjects
                from 1st Semester are usually re-taken when 1st Semester is
                offered again, and subjects from 2nd Semester are usually
                re-taken when 2nd Semester is offered again.
              </p>
              <div className="s-retake-advisory-list">
                {retakeSubjectAlerts.map((alert) => (
                  <div
                    className="s-retake-advisory-item"
                    key={`${alert.subjectCode}-${alert.subjectTitle}`}
                  >
                    <div className="s-retake-advisory-main">
                      <span className="s-retake-subject-code">
                        {alert.subjectCode}
                      </span>
                      <span className="s-retake-subject-title">
                        {alert.subjectTitle}
                      </span>
                    </div>
                    <div className="s-retake-advisory-meta">
                      <span className="s-retake-status-badge">
                        {getRetakeEvaluationLabel(alert.evaluation)}
                      </span>
                      <span className="s-retake-periods">
                        {alert.gradingPeriods.join(", ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasCollegeRetakePlanner && (
            <div className="s-enrollment-card s-retake-plan-card">
              <div className="s-retake-plan-header">
                <div>
                  <h3>Plan Load</h3>
                  <p className="s-retake-plan-text">
                    Build the retake load for the upcoming term using the exact
                    FAILED or INC subjects listed above.
                  </p>
                </div>
                <button
                  type="button"
                  className="s-retake-plan-btn"
                  onClick={openRetakePlanModal}
                >
                  {isRequestLocked ? "View Plan Load" : "Open Plan Load"}
                </button>
              </div>

              <div className="s-subject-summary">
                <span className="s-subject-chip">
                  {retakeChoiceGroups.length} retake subject
                  {retakeChoiceGroups.length === 1 ? "" : "s"}
                </span>
                <span className="s-subject-chip">
                  {selectedRetakeAssignments.length} schedule
                  {selectedRetakeAssignments.length === 1 ? "" : "s"} selected
                </span>
                {retakeGroupsWithoutAvailableSchedules.length > 0 && (
                  <span className="s-subject-chip">
                    {retakeGroupsWithoutAvailableSchedules.length} without offering
                  </span>
                )}
                {retakeGroupsWithAvailableSchedules.length > 0 && (
                  <span className="s-subject-chip">
                    {isRetakePlanComplete
                      ? "Ready to submit"
                      : "Needs schedule picks"}
                  </span>
                )}
                {selectedRetakeUnits > 0 && (
                  <span className="s-subject-chip">
                    {selectedRetakeUnits} selected units
                  </span>
                )}
              </div>

              {retakePlanConflicts.length > 0 ? (
                <div className="s-retake-plan-warning">
                  <strong>Schedule conflict detected.</strong>
                  <ul className="s-retake-plan-warning-list">
                    {retakePlanConflicts.map((conflict) => (
                      <li
                        key={`${conflict.leftAssignmentId}-${conflict.rightAssignmentId}`}
                      >
                        {conflict.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="s-retake-plan-summary-list">
                {retakeChoiceGroups.map((group) => {
                  const selectedAssignment = selectedRetakeAssignments.find(
                    (assignment) =>
                      assignment.subjectCode === group.subjectCode ||
                      assignment.subjectId === group.subjectId,
                  );

                  return (
                    <div
                      key={`${group.subjectCode}-${group.subjectId}`}
                      className="s-retake-plan-summary-item"
                    >
                      <div className="s-retake-plan-summary-copy">
                        <strong>
                          {group.subjectCode} - {group.subjectName}
                        </strong>
                        <span>
                          {getRetakeEvaluationLabel(group.evaluation)} |{" "}
                          {group.gradingPeriods.join(", ")}
                        </span>
                      </div>
                      <div className="s-retake-plan-summary-status">
                        {selectedAssignment ? (
                          <span>{formatScheduledAssignmentLabel(selectedAssignment)}</span>
                        ) : group.assignmentOptions.length === 0 ? (
                          <span>No schedule offering available for this term.</span>
                        ) : (
                          <span>Schedule not selected yet.</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="s-note-card">
            <div className="s-note-icon">
              <IoDocumentText />
            </div>
            <div className="s-note-content">
              <p>
                {isShsFirstSemesterAutoProgressionTerm
                  ? "Senior high students continue to 2nd Semester automatically after passing 1st and 2nd quarter grades."
                  : "Assigned subjects now follow the next enrollment term based on the student's current year level and semester."}
              </p>
              <p className="s-notice-text">
                {isShsFirstSemesterAutoProgressionTerm
                  ? "2nd Semester subjects will appear as the current load once the grade check passes."
                  : `Upcoming term: ${
                      nextPlacement.hasNextTerm
                        ? `${nextPlacement.yearLevel} - ${nextPlacement.semester} (${nextPlacement.academicYear})`
                        : "No next enrollment term is available yet."
                    }`}
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
                    {isEnrollmentRequirementRedo(requirement) && (
                      <span className="s-file-name">Needs reupload</span>
                    )}
                    {hasViewableAttachmentUrl(
                      uploadedFiles[requirement.key]?.url,
                    ) && (
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
                      disabled={
                        uploadingId === requirement.key ||
                        (isRequestLocked &&
                          !isEnrollmentRequirementRedo(requirement)) ||
                        isShsFirstSemesterAutoProgressionTerm
                      }
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
            <h3>
              {supportsIrregularEnrollmentRequest
                ? "Next-Term Curriculum Reference"
                : "Assigned Subjects for Enrollment"}
            </h3>
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
                <div className="s-finance-stat">
                  <span className="s-finance-label">Exam Discount</span>
                  <span className="s-finance-value">
                    {scholarshipExamDiscount}%
                  </span>
                </div>
                <p className="s-finance-note">
                  Honor discounts only count after your Honor Certificate is
                  uploaded and approved. The scholarship exam is 60 items and
                  can provide up to a 50% discount.
                </p>
              </div>
            </div>
          )}

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
                        className={`s-status-badge ${
                          enrollmentStatus.status === "Approved"
                            ? "s-status-approved"
                            : enrollmentStatus.status === "Rejected"
                              ? "s-status-warning"
                              : enrollmentStatus.status === "Pending"
                                ? "s-status-pending"
                                : "s-status-neutral"
                        }`}
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
            <button
              className="s-enroll-btn"
              onClick={handleEnroll}
              disabled={!isEligibleForEnrollment}
            >
              {enrollButtonLabel}
            </button>
          </div>
        </main>

        {isRetakePlanModalOpen && hasCollegeRetakePlanner && (
          <div
            className="s-retake-plan-modal-overlay"
            onClick={closeRetakePlanModal}
          >
            <div
              className="s-retake-plan-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="s-retake-plan-modal-header">
                <div>
                  <h2>Retake Plan Load</h2>
                  <p>
                    {nextPlacement.yearLevel} - {nextPlacement.semester} (
                    {nextPlacement.academicYear})
                  </p>
                </div>
                <button
                  type="button"
                  className="s-retake-plan-modal-close"
                  onClick={closeRetakePlanModal}
                  aria-label="Close retake plan load"
                >
                  x
                </button>
              </div>

              <div className="s-retake-plan-modal-body">
                <p className="s-retake-plan-modal-note">
                  Select one available schedule per retake subject when an
                  offering exists. Subjects without a matching offering can
                  still stay in the request for manual follow-up.
                </p>

                {isRequestLocked ? (
                  <div className="s-retake-plan-warning">
                    <strong>Request locked.</strong>
                    <ul className="s-retake-plan-warning-list">
                      <li>
                        This retake load is currently locked while the request is{" "}
                        {activeEnrollmentRequest?.enrollmentStatus?.toLowerCase() ||
                          "being reviewed"}
                        .
                      </li>
                    </ul>
                  </div>
                ) : null}

                {retakePlanConflicts.length > 0 ? (
                  <div className="s-retake-plan-warning">
                    <strong>Schedule conflict detected.</strong>
                    <ul className="s-retake-plan-warning-list">
                      {retakePlanConflicts.map((conflict) => (
                        <li
                          key={`${conflict.leftAssignmentId}-${conflict.rightAssignmentId}`}
                        >
                          {conflict.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="s-retake-plan-grid">
                  <div className="s-retake-plan-subjects">
                    {retakeChoiceGroups.map((group) => (
                      <div
                        key={`${group.subjectCode}-${group.subjectId}`}
                        className="s-retake-plan-subject-card"
                      >
                        <div className="s-retake-plan-subject-copy">
                          <h3>
                            {group.subjectCode} - {group.subjectName}
                          </h3>
                          <p>
                            {getRetakeEvaluationLabel(group.evaluation)} |{" "}
                            {group.gradingPeriods.join(", ")}
                            {group.units ? ` | ${group.units} units` : ""}
                          </p>
                        </div>
                        <label className="s-retake-plan-field">
                          <span>Available schedule</span>
                          <select
                            value={
                              selectedRetakeAssignmentsBySubject[group.subjectId] ||
                              ""
                            }
                            onChange={(event) =>
                              handleRetakeAssignmentChange(
                                group.subjectId,
                                event.target.value,
                              )
                            }
                            disabled={
                              isRequestLocked || group.assignmentOptions.length === 0
                            }
                          >
                            <option value="">
                              {group.assignmentOptions.length > 0
                                ? "Select a schedule"
                                : "No offering available"}
                            </option>
                            {group.assignmentOptions.map((assignment) => (
                              <option
                                key={assignment.assignmentId}
                                value={assignment.assignmentId}
                              >
                                {formatScheduledAssignmentLabel(assignment)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {group.assignmentOptions.length === 0 ? (
                          <p className="s-retake-plan-empty-option">
                            No scheduled section offering was found for this
                            subject in the requested term.
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="s-retake-plan-selection-panel">
                    <h3>Selected Retake Load</h3>
                    {selectedRetakeAssignments.length > 0 ? (
                      <div className="s-retake-plan-selection-list">
                        {selectedRetakeAssignments.map((assignment) => (
                          <div
                            key={assignment.assignmentId}
                            className={`s-retake-plan-selection-item ${
                              retakePlanConflicts.some(
                                (conflict) =>
                                  conflict.leftAssignmentId ===
                                    assignment.assignmentId ||
                                  conflict.rightAssignmentId ===
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
                            <span>{formatScheduledAssignmentLabel(assignment)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="s-retake-plan-empty-state">
                        Select the available retake schedules to build the load.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="s-retake-plan-modal-actions">
                <button
                  type="button"
                  className="s-download-confirmation-btn s-retake-plan-secondary-btn"
                  onClick={closeRetakePlanModal}
                >
                  {isRequestLocked ? "Close" : "Done"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentEnrollment;
