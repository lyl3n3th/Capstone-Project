import { useEffect, useState } from "react";
import {
  FaUserPlus,
  FaUserGraduate,
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaEye,
  FaThumbsUp,
  FaRedoAlt,
  FaFileAlt,
  FaDownload,
  FaUsers,
  FaMagic,
  FaLayerGroup,
  FaBook,
  FaChalkboardTeacher,
  FaCalendarAlt,
  FaPlus,
  FaUniversity,
  FaSearch,
  FaChevronDown,
  FaChevronUp,
  FaFilter,
  FaTrash,
} from "react-icons/fa";
import AdminSidebar from "../../components/admin/AdminSidebar";
import { ToastContainer } from "../../components/common/Toast";
import { useAuth } from "../../hooks/useAuth";
import {
  fetchSupabaseAdmissionApplicants,
  getDefaultBranchEnrollees,
  mergeAdminEnrolleeRecords,
  normalizeBranchName,
  promoteApplicantToStoredStudent,
  readBranchScopedData,
  readStoredStudents,
  writeBranchScopedData,
  writeStoredStudents,
} from "../../services/adminStorage";
import {
  getAdmissionRequirements,
  updateAdmissionProgress,
} from "../../services/admission";
import { activateApprovedStudent } from "../../services/auth";
import "../../styles/admin/admin-enrolles.css";

interface EnrolleesProps {
  onLogout: () => void;
  loggedInUsername: string;
  loggedInRole?: "Admin" | "Registrar";
  canAccessBackup?: boolean;
}

interface Attachment {
  name: string;
  type: string;
  url: string;
  reviewStatus?: "Pending" | "Approved" | "Rejected";
}

interface PersonalInformation {
  fullName: string;
  birthDate: string;
  contactNumber: string;
  program: string;
  guardianName: string;
  email: string;
  address: string;
  yearLevel: string;
  guardianContact: string;
}

interface Enrollee {
  recordId?: number;
  id: string;
  trackingNumber: string;
  studentNumber?: string;
  fullName: string;
  program: string;
  yearLevel: string;
  strandOrCourse: string;
  applicationDate: string;
  documentsSubmitted: number;
  totalDocuments: number;
  status: "Pending" | "Approved" | "Rejected";
  branch: string;
  studentStatus: string;
  honorLabel?: string | null;
  appliedForScholarship?: boolean;
  scholarshipExamScore?: number | null;
  convertedAt?: string;
  personalInfo: PersonalInformation;
  attachments?: Attachment[];
}

interface EnrollmentRequest {
  id: string;
  studentNumber: string;
  fullName: string;
  program: string;
  currentYearLevel: string;
  requestedYearLevel: string;
  academicYear: string;
  semester: string;
  enrollmentStatus: "Pending" | "Approved" | "Rejected";
  requestDate: string;
  enrollmentDate?: string;
  notes?: string;
  attachments?: Attachment[];
}

interface ClassSection {
  id: string;
  code: string;
  program: string;
  yearLevel: string;
  strand?: string;
  section: string;
  currentEnrollees: number;
  maxCapacity: number;
  enrolleeIds: string[];
}

interface SectionAssignment {
  enrolleeId: string;
  enrolleeName: string;
  assignedSection: string;
  assignedDate: string;
  isManualOverride: boolean;
}

interface Subject {
  id: string;
  code: string;
  name: string;
  units?: number;
  program: string;
  yearLevel: string;
  semester: string;
  strand?: string;
  isMinor?: boolean;
}

interface Instructor {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  email?: string;
  contactNumber?: string;
}

interface Schedule {
  day: string;
  startTime: string;
  endTime: string;
  room: string;
}

interface SubjectAssignment {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  instructorId: string;
  instructorName: string;
  sectionId: string;
  sectionCode: string;
  schedule: Schedule[];
  academicYear: string;
  semester: string;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

interface AssignmentFormState {
  sectionId: string;
  instructorId: string;
  subjectIds: string[];
  academicYear: string;
  semester: string;
  scheduleDay: string;
  startTime: string;
  endTime: string;
  room: string;
}

const DEFAULT_COLLEGE_COURSE = "BSE - Bachelor of Entrepreneurship";

const createDefaultAssignmentForm = (sectionId = ""): AssignmentFormState => ({
  sectionId,
  instructorId: "",
  subjectIds: [],
  academicYear: "2026-2027",
  semester: "1st Semester",
  scheduleDay: "",
  startTime: "",
  endTime: "",
  room: "",
});

// Get requirement items for enrollment requests based on current and requested level
const getEnrollmentRequirementItems = (
  currentYearLevel: string,
  requestedYearLevel: string,
  program: string,
) => {
  if (!currentYearLevel) {
    // Default requirements for new admissions
    return [
      { name: "Form 137 / SF10", required: true, key: "f137" },
      { name: "PSA Birth Certificate", required: true, key: "psa" },
      { name: "Good Moral Character", required: true, key: "gmc" },
      { name: "Certificate of Completion", required: true, key: "coc" },
    ];
  }
  const requirements = [];

  if (
    program === "SHS" &&
    currentYearLevel === "Grade 11" &&
    requestedYearLevel === "Grade 12"
  ) {
    requirements.push({
      name: "Grade 11 Certificate of Grades",
      required: true,
      key: "grade11_certificate",
    });
    requirements.push({
      name: "Clearance",
      required: true,
      key: "clearance",
    });
  } else if (program === "College") {
    const yearMap: Record<string, string> = {
      "1st Year": "1st Year Certificate of Grades",
      "2nd Year": "2nd Year Certificate of Grades",
      "3rd Year": "3rd Year Certificate of Grades",
    };

    if (yearMap[currentYearLevel]) {
      requirements.push({
        name: yearMap[currentYearLevel],
        required: true,
        key: "grades_certificate",
      });
    }
    requirements.push({
      name: "Clearance",
      required: true,
      key: "clearance",
    });
  } else if (
    program === "SHS" &&
    currentYearLevel === "Grade 12" &&
    requestedYearLevel === "College"
  ) {
    requirements.push({
      name: "Grade 12 Certificate of Completion",
      required: true,
      key: "grade12_completion",
    });
    requirements.push({
      name: "Clearance",
      required: true,
      key: "clearance",
    });
  }

  requirements.push({
    name: "Certificate of Enrollment",
    required: true,
    key: "enrollment_certificate",
  });

  return requirements;
};

const mapAdminProgramToAdmissionProgram = (program: string) =>
  program === "SHS" ? "Senior High School" : "College";

const COLLEGE_TUITION_PER_UNIT = 600;
const DEFAULT_COLLEGE_TUITION_UNITS = 15;
const COLLEGE_ON_SITE_PAYMENT = 300;

const getHonorDiscountPercentage = (honorLabel?: string | null) => {
  if (!honorLabel) return 0;
  if (honorLabel.includes("Highest Honor")) return 80;
  if (honorLabel.includes("High Honor")) return 60;
  if (honorLabel.includes("With Honor")) return 50;
  return 0;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);

const hasAttachmentNamed = (
  attachments: Pick<Attachment, "name">[] | undefined,
  attachmentName: string,
) =>
  Boolean(
    attachments?.some(
      (attachment) =>
        attachment.name.trim().toLowerCase() ===
        attachmentName.trim().toLowerCase(),
    ),
  );

const getEstimatedCollegeTuition = (honorLabel?: string | null) => {
  const baseTuition = DEFAULT_COLLEGE_TUITION_UNITS * COLLEGE_TUITION_PER_UNIT;
  const honorDiscountPercentage = getHonorDiscountPercentage(honorLabel);
  const honorDiscountAmount = baseTuition * (honorDiscountPercentage / 100);
  const tuitionAfterHonorDiscount = baseTuition - honorDiscountAmount;
  const remainingBalance = Math.max(
    tuitionAfterHonorDiscount - COLLEGE_ON_SITE_PAYMENT,
    0,
  );

  return {
    baseTuition,
    honorDiscountPercentage,
    honorDiscountAmount,
    tuitionAfterHonorDiscount,
    onSitePayment: COLLEGE_ON_SITE_PAYMENT,
    remainingBalance,
  };
};

const isEnrollmentRequestRecord = (
  item: EnrollmentRequest | Enrollee,
): item is EnrollmentRequest =>
  "currentYearLevel" in item && "requestedYearLevel" in item;

const getReviewRequirementItems = (item: EnrollmentRequest | Enrollee) => {
  if (isEnrollmentRequestRecord(item)) {
    return getEnrollmentRequirementItems(
      item.currentYearLevel,
      item.requestedYearLevel,
      item.program,
    );
  }

  return getAdmissionRequirements(
    item.studentStatus,
    mapAdminProgramToAdmissionProgram(item.program),
    item.honorLabel || "No Honor",
  ).map((requirement) => ({
    name: requirement.name,
    required: !requirement.optional,
    key: requirement.code,
  }));
};

const normalizeAcademicDescriptor = (value?: string) => {
  const normalized = (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized || normalized === "all") {
    return normalized;
  }

  if (normalized.includes("entrepreneur")) {
    return "entrepreneurship";
  }

  if (
    /\bict\b/.test(normalized) ||
    normalized.includes("information communications technology")
  ) {
    return "ict";
  }

  if (/\bgas\b/.test(normalized) || normalized.includes("general academic")) {
    return "gas";
  }

  if (
    normalized.includes("humss") ||
    normalized.includes("humanities and social sciences")
  ) {
    return "humss";
  }

  if (
    /\babm\b/.test(normalized) ||
    normalized.includes("accountancy business and management")
  ) {
    return "abm";
  }

  if (/\bstem\b/.test(normalized)) {
    return "stem";
  }

  if (normalized.includes("industrial arts")) {
    return "ia";
  }

  if (normalized.includes("computer science") || normalized.includes("bscs")) {
    return "computer science";
  }

  if (
    normalized.includes("information technology") ||
    normalized.includes("bsit")
  ) {
    return "information technology";
  }

  return normalized;
};

const matchesAcademicDescriptor = (leftValue?: string, rightValue?: string) => {
  const left = normalizeAcademicDescriptor(leftValue);
  const right = normalizeAcademicDescriptor(rightValue);

  if (!left || !right || left === "all" || right === "all") {
    return true;
  }

  return left === right || left.includes(right) || right.includes(left);
};

const resolveSubjectStrandOrCourse = (
  subject: Pick<Subject, "program" | "strand">,
) =>
  subject.program === "College"
    ? subject.strand || DEFAULT_COLLEGE_COURSE
    : subject.strand || "All";

const normalizeSubjectCatalog = (catalog: Subject[]) =>
  catalog.map((subject) =>
    subject.program === "College" && !subject.strand
      ? { ...subject, strand: DEFAULT_COLLEGE_COURSE }
      : subject,
  );

const sectionMatchesEnrollee = (
  section: ClassSection,
  enrollee: Pick<Enrollee, "program" | "yearLevel" | "strandOrCourse">,
) => {
  if (
    section.program !== enrollee.program ||
    section.yearLevel !== enrollee.yearLevel
  ) {
    return false;
  }

  if (!section.strand) {
    return true;
  }

  return matchesAcademicDescriptor(section.strand, enrollee.strandOrCourse);
};

export default function AdminEnrollees({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: EnrolleesProps) {
  const { currentUser } = useAuth();
  const currentBranch = normalizeBranchName(currentUser?.branch);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "admissions" | "enrollments" | "academic"
  >("admissions");
  const [selectedRequest, setSelectedRequest] = useState<
    EnrollmentRequest | Enrollee | null
  >(null);
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | null>(
    null,
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | Enrollee["status"]>(
    "All",
  );
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useState<
    "All" | "Pending" | "Approved" | "Rejected"
  >("All");
  const [isLoading, setIsLoading] = useState(false);
  const [enrollmentRequests, setEnrollmentRequests] = useState<
    EnrollmentRequest[]
  >([]);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<{
    id: string;
    action: "approve" | "reject";
    scholarshipExamScore?: number | null;
  } | null>(null);
  const [enrollees, setEnrollees] = useState<Enrollee[]>([]);
  const [pendingScholarshipScore, setPendingScholarshipScore] = useState("");
  const selectedAdmissionRequest =
    selectedRequest && !isEnrollmentRequestRecord(selectedRequest)
      ? selectedRequest
      : null;
  const selectedAdmissionHonorLabel =
    selectedAdmissionRequest?.honorLabel || "No Honor";
  const selectedAdmissionHonorCertificateStatus = !selectedAdmissionRequest
    ? "Not available"
    : selectedAdmissionHonorLabel !== "No Honor"
      ? hasAttachmentNamed(
          selectedAdmissionRequest.attachments,
          "Honor Certificate",
        )
        ? "Submitted"
        : "Pending"
      : "Not required";
  const selectedAdmissionScholarshipStatus = !selectedAdmissionRequest
    ? "Not available"
    : selectedAdmissionRequest.appliedForScholarship
      ? "Applied"
      : "Not applied";
  const selectedAdmissionTuition =
    selectedAdmissionRequest?.program === "College"
      ? getEstimatedCollegeTuition(selectedAdmissionRequest.honorLabel)
      : null;
  const selectedAdmissionScholarshipTuitionStatus = !selectedAdmissionRequest
    ? "Not available"
    : !selectedAdmissionRequest.appliedForScholarship
      ? "Not applied"
      : typeof selectedAdmissionRequest.scholarshipExamScore === "number"
        ? `For evaluation (${selectedAdmissionRequest.scholarshipExamScore})`
        : "Awaiting exam result";

  // Section Manager States

  const isEnrollmentRequest = isEnrollmentRequestRecord;

  const [showSectionManager, setShowSectionManager] = useState(false);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [sectionAssignments, setSectionAssignments] = useState<
    SectionAssignment[]
  >([]);
  const [selectedSection, setSelectedSection] = useState<ClassSection | null>(
    null,
  );
  const [showSectionStudents, setShowSectionStudents] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState<Enrollee[]>([]);
  const [newSection, setNewSection] = useState({
    program: "College",
    yearLevel: "1st Year",
    strand: DEFAULT_COLLEGE_COURSE,
    section: "A",
    maxCapacity: 30,
  });

  // Academic Management States
  const [activeManagementTab, setActiveManagementTab] = useState<
    "subjects" | "instructors" | "assignments"
  >("subjects");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<
    SubjectAssignment[]
  >([]);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [showInstructorModal, setShowInstructorModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(
    null,
  );
  const [editingAssignment, setEditingAssignment] =
    useState<SubjectAssignment | null>(null);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>(
    [],
  );
  const [pendingAssignmentDeleteIds, setPendingAssignmentDeleteIds] = useState<
    string[]
  >([]);
  const [showAssignmentDeleteModal, setShowAssignmentDeleteModal] =
    useState(false);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(
    createDefaultAssignmentForm(),
  );
  const [subjectFilter, setSubjectFilter] = useState({
    program: "All",
    yearLevel: "All",
    strand: "All",
    strandOrCourse: "All",
    showMinor: true,
  });
  const [instructorSearch, setInstructorSearch] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState({
    program: "All",
    section: "All",
    semester: "All",
  });

  // New state for expanded sections in subjects table
  const [expandedSHSSections, setExpandedSHSSections] = useState({
    "Grade 11": true,
    "Grade 12": true,
  });
  const [expandedCollegeSections, setExpandedCollegeSections] = useState({
    "1st Year": true,
    "2nd Year": false,
    "3rd Year": false,
    "4th Year": false,
  });
  // State for expanded sections in Class Assignments
  const [expandedAssignmentSections, setExpandedAssignmentSections] = useState<
    Record<string, boolean>
  >({});
  const [hasInitializedBranchData, setHasInitializedBranchData] =
    useState(false);

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

  const storageScopes = {
    enrollees: "enrollees",
    enrollmentRequests: "enrollment-requests",
    classSections: "class-sections",
    sectionAssignments: "section-assignments",
    subjects: "subjects",
    instructors: "instructors",
    subjectAssignments: "subject-assignments",
  } as const;

  // Load class sections
  const loadClassSections = () => {
    const storedSections = readBranchScopedData<ClassSection[]>(
      storageScopes.classSections,
      currentBranch,
    );

    if (storedSections?.length) {
      setClassSections(storedSections);
      return;
    }

    const mockSections: ClassSection[] = [
      {
        id: "1",
        code: "IC1DA",
        program: "SHS",
        yearLevel: "Grade 11",
        strand: "ICT",
        section: "A",
        currentEnrollees: 28,
        maxCapacity: 30,
        enrolleeIds: ["E001", "E002"],
      },
      {
        id: "2",
        code: "IC1MB",
        program: "SHS",
        yearLevel: "Grade 11",
        strand: "ICT",
        section: "B",
        currentEnrollees: 15,
        maxCapacity: 30,
        enrolleeIds: [],
      },
      {
        id: "3",
        code: "GA1DA",
        program: "SHS",
        yearLevel: "Grade 11",
        strand: "GAS",
        section: "A",
        currentEnrollees: 30,
        maxCapacity: 30,
        enrolleeIds: [],
      },
      {
        id: "4",
        code: "HUM1MB",
        program: "SHS",
        yearLevel: "Grade 11",
        strand: "HUMSS",
        section: "B",
        currentEnrollees: 12,
        maxCapacity: 30,
        enrolleeIds: [],
      },
      {
        id: "5",
        code: "BSE1A",
        program: "College",
        yearLevel: "1st Year",
        strand: "BSE - Bachelor of Entrepreneurship",
        section: "A",
        currentEnrollees: 8,
        maxCapacity: 30,
        enrolleeIds: [],
      },
    ];
    setClassSections(mockSections);
  };

  // Load subjects - Updated with full SHS and College structure (Semester-based for SHS)
  const loadSubjects = () => {
    const storedSubjects = readBranchScopedData<Subject[]>(
      storageScopes.subjects,
      currentBranch,
    );

    if (storedSubjects?.length) {
      setSubjects(normalizeSubjectCatalog(storedSubjects));
      return;
    }

    const mockSubjects: Subject[] = [
      // ========== SHS - GRADE 11 - 1st Semester ==========
      {
        id: "1",
        code: "MIN101",
        name: "Oral Communication",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "2",
        code: "MIN102",
        name: "Reading and Writing",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "3",
        code: "MIN103",
        name: "Komunikasyon at Pananaliksik",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "4",
        code: "MIN104",
        name: "Earth and Life Science",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "5",
        code: "MIN105",
        name: "Mathematics in the Modern World",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "6",
        code: "MAJ101",
        name: "Computer Systems Servicing",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "ICT",
        isMinor: false,
      },
      {
        id: "7",
        code: "MAJ102",
        name: "Introduction to Humanities",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "GAS",
        isMinor: false,
      },
      {
        id: "8",
        code: "MAJ103",
        name: "Introduction to World Religions",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "HUMSS",
        isMinor: false,
      },
      {
        id: "9",
        code: "MAJ104",
        name: "Fundamentals of Accounting",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "ABM",
        isMinor: false,
      },
      {
        id: "10",
        code: "MAJ105",
        name: "Pre-Calculus",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "STEM",
        isMinor: false,
      },
      // Minor Subjects Grade 11 1st Sem
      {
        id: "11",
        code: "MIN106",
        name: "Physical Education 1",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "12",
        code: "MIN107",
        name: "Health Education",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },

      // ========== SHS - GRADE 11 - 2nd Semester ==========
      {
        id: "13",
        code: "MIN108",
        name: "21st Century Literature",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "14",
        code: "MIN109",
        name: "Contemporary Philippine Arts",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "15",
        code: "MIN110",
        name: "Understanding Culture, Society and Politics",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "16",
        code: "MIN111",
        name: "Physical Science",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "17",
        code: "MIN112",
        name: "Statistics and Probability",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "18",
        code: "MAJ106",
        name: "Programming (Java)",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "ICT",
        isMinor: false,
      },
      {
        id: "19",
        code: "MAJ107",
        name: "Disciplines and Ideas in Social Sciences",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "GAS",
        isMinor: false,
      },
      {
        id: "20",
        code: "MAJ108",
        name: "Creative Writing",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "HUMSS",
        isMinor: false,
      },
      {
        id: "21",
        code: "MAJ109",
        name: "Business Mathematics",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "ABM",
        isMinor: false,
      },
      {
        id: "22",
        code: "MAJ110",
        name: "Basic Calculus",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "STEM",
        isMinor: false,
      },
      // Minor Subjects Grade 11 2nd Sem
      {
        id: "23",
        code: "MIN113",
        name: "Physical Education 2",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "24",
        code: "MIN114",
        name: "Values Education",
        program: "SHS",
        yearLevel: "Grade 11",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },

      // ========== SHS - GRADE 12 - 1st Semester ==========
      {
        id: "25",
        code: "MIN115",
        name: "English for Academic Purposes",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "26",
        code: "MIN116",
        name: "Filipino sa Piling Larangan",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "27",
        code: "MIN117",
        name: "Practical Research 2",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "28",
        code: "MIN118",
        name: "Inquiries and Investigation",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "29",
        code: "MAJ111",
        name: "Database Management",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "ICT",
        isMinor: false,
      },
      {
        id: "30",
        code: "MAJ112",
        name: "Applied Economics",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "GAS",
        isMinor: false,
      },
      {
        id: "31",
        code: "MAJ113",
        name: "Creative Writing/Malikhaing Pagsulat",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "HUMSS",
        isMinor: false,
      },
      {
        id: "32",
        code: "MAJ114",
        name: "Business Ethics",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "ABM",
        isMinor: false,
      },
      {
        id: "33",
        code: "MAJ115",
        name: "General Biology 2",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "STEM",
        isMinor: false,
      },
      // Minor Subjects Grade 12 1st Sem
      {
        id: "34",
        code: "MIN119",
        name: "Physical Education 3",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "35",
        code: "MIN120",
        name: "Career Guidance",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "1st Semester",
        strand: "All",
        isMinor: true,
      },

      // ========== SHS - GRADE 12 - 2nd Semester ==========
      {
        id: "36",
        code: "MIN121",
        name: "Entrepreneurship",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "37",
        code: "MIN122",
        name: "Research Project",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "38",
        code: "MAJ116",
        name: "System Analysis and Design",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "ICT",
        isMinor: false,
      },
      {
        id: "39",
        code: "MAJ117",
        name: "Community Engagement",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "GAS",
        isMinor: false,
      },
      {
        id: "40",
        code: "MAJ118",
        name: "Social Sciences and Philosophy",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "HUMSS",
        isMinor: false,
      },
      {
        id: "41",
        code: "MAJ119",
        name: "Business Finance",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "ABM",
        isMinor: false,
      },
      {
        id: "42",
        code: "MAJ120",
        name: "General Physics 1",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "STEM",
        isMinor: false,
      },
      {
        id: "43",
        code: "MIN123",
        name: "Work Immersion",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      // Minor Subjects Grade 12 2nd Sem
      {
        id: "44",
        code: "MIN124",
        name: "Physical Education 4",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },
      {
        id: "45",
        code: "MIN125",
        name: "Community Service",
        program: "SHS",
        yearLevel: "Grade 12",
        semester: "2nd Semester",
        strand: "All",
        isMinor: true,
      },

      // ========== COLLEGE - 1st Year ==========
      {
        id: "46",
        code: "MIN126",
        name: "Understanding the Self",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "47",
        code: "MIN127",
        name: "Readings in Philippine History",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "48",
        code: "MIN128",
        name: "Purposive Communication",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "49",
        code: "MIN129",
        name: "Mathematics in the Modern World",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "50",
        code: "MAJ121",
        name: "Introduction to Computing",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "51",
        code: "MAJ122",
        name: "Computer Programming 1",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "52",
        code: "MIN130",
        name: "Physical Education 1",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 2,
        isMinor: true,
      },
      {
        id: "53",
        code: "MIN131",
        name: "NSTP 1",
        program: "College",
        yearLevel: "1st Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "54",
        code: "MIN132",
        name: "The Contemporary World",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "55",
        code: "MIN133",
        name: "Ethics",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "56",
        code: "MIN134",
        name: "Art Appreciation",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "57",
        code: "MAJ123",
        name: "Data Structures and Algorithms",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "58",
        code: "MAJ124",
        name: "Object-Oriented Programming",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "59",
        code: "MIN135",
        name: "Physical Education 2",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 2,
        isMinor: true,
      },
      {
        id: "60",
        code: "MIN136",
        name: "NSTP 2",
        program: "College",
        yearLevel: "1st Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: true,
      },

      // ========== COLLEGE - 2nd Year ==========
      {
        id: "61",
        code: "MIN137",
        name: "Science, Technology and Society",
        program: "College",
        yearLevel: "2nd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "62",
        code: "MAJ125",
        name: "Database Management System",
        program: "College",
        yearLevel: "2nd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "63",
        code: "MAJ126",
        name: "Web Development",
        program: "College",
        yearLevel: "2nd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "64",
        code: "MAJ127",
        name: "Operating Systems",
        program: "College",
        yearLevel: "2nd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "65",
        code: "MAJ128",
        name: "Discrete Mathematics",
        program: "College",
        yearLevel: "2nd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "66",
        code: "MIN138",
        name: "Physical Education 3",
        program: "College",
        yearLevel: "2nd Year",
        semester: "1st Semester",
        units: 2,
        isMinor: true,
      },
      {
        id: "67",
        code: "MIN139",
        name: "Life and Works of Rizal",
        program: "College",
        yearLevel: "2nd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "68",
        code: "MAJ129",
        name: "Software Engineering",
        program: "College",
        yearLevel: "2nd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "69",
        code: "MAJ130",
        name: "Networking and Communication",
        program: "College",
        yearLevel: "2nd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "70",
        code: "MAJ131",
        name: "Human-Computer Interaction",
        program: "College",
        yearLevel: "2nd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "71",
        code: "MAJ132",
        name: "Information Management",
        program: "College",
        yearLevel: "2nd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "72",
        code: "MIN140",
        name: "Physical Education 4",
        program: "College",
        yearLevel: "2nd Year",
        semester: "2nd Semester",
        units: 2,
        isMinor: true,
      },

      // ========== COLLEGE - 3rd Year ==========
      {
        id: "73",
        code: "MAJ133",
        name: "Advanced Database Systems",
        program: "College",
        yearLevel: "3rd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "74",
        code: "MAJ134",
        name: "Mobile Application Development",
        program: "College",
        yearLevel: "3rd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "75",
        code: "MAJ135",
        name: "System Analysis and Design",
        program: "College",
        yearLevel: "3rd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "76",
        code: "MAJ136",
        name: "Automata Theory",
        program: "College",
        yearLevel: "3rd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "77",
        code: "MIN141",
        name: "Elective 1",
        program: "College",
        yearLevel: "3rd Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "78",
        code: "MAJ137",
        name: "Artificial Intelligence",
        program: "College",
        yearLevel: "3rd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "79",
        code: "MAJ138",
        name: "Cloud Computing",
        program: "College",
        yearLevel: "3rd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "80",
        code: "MAJ139",
        name: "Information Assurance",
        program: "College",
        yearLevel: "3rd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "81",
        code: "MAJ140",
        name: "Technopreneurship",
        program: "College",
        yearLevel: "3rd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "82",
        code: "MIN142",
        name: "Elective 2",
        program: "College",
        yearLevel: "3rd Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: true,
      },

      // ========== COLLEGE - 4th Year ==========
      {
        id: "83",
        code: "MAJ141",
        name: "Capstone Project 1",
        program: "College",
        yearLevel: "4th Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "84",
        code: "MAJ142",
        name: "Data Analytics",
        program: "College",
        yearLevel: "4th Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "85",
        code: "MAJ143",
        name: "IT Project Management",
        program: "College",
        yearLevel: "4th Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "86",
        code: "MAJ144",
        name: "Emerging Technologies",
        program: "College",
        yearLevel: "4th Year",
        semester: "1st Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "87",
        code: "MIN143",
        name: "Elective 3",
        program: "College",
        yearLevel: "4th Year",
        semester: "1st Semester",
        units: 3,
        isMinor: true,
      },
      {
        id: "88",
        code: "MAJ145",
        name: "Capstone Project 2",
        program: "College",
        yearLevel: "4th Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
      {
        id: "89",
        code: "MAJ146",
        name: "Internship/Practicum",
        program: "College",
        yearLevel: "4th Year",
        semester: "2nd Semester",
        units: 6,
        isMinor: false,
      },
      {
        id: "90",
        code: "MAJ147",
        name: "Professional Ethics",
        program: "College",
        yearLevel: "4th Year",
        semester: "2nd Semester",
        units: 3,
        isMinor: false,
      },
    ];
    setSubjects(normalizeSubjectCatalog(mockSubjects));
  };

  // Load instructors with updated names
  const loadInstructors = () => {
    const storedInstructors = readBranchScopedData<Instructor[]>(
      storageScopes.instructors,
      currentBranch,
    );

    if (storedInstructors?.length) {
      setInstructors(storedInstructors);
      return;
    }

    const mockInstructors: Instructor[] = [
      {
        id: "1",
        name: "Kenneth Lyle Sohot",
        employeeId: "TCH001",
        department: "Computer Science",
        email: "kenneth.sohot@university.edu",
        contactNumber: "09123456789",
      },
      {
        id: "2",
        name: "Neil John Velasco",
        employeeId: "TCH002",
        department: "Mathematics",
        email: "neil.velasco@university.edu",
        contactNumber: "09123456790",
      },
      {
        id: "3",
        name: "Hener Verdida",
        employeeId: "TCH003",
        department: "English",
        email: "hener.verdida@university.edu",
        contactNumber: "09123456791",
      },
      {
        id: "4",
        name: "Queenie Mier Senantes",
        employeeId: "TCH004",
        department: "Humanities",
        email: "queenie.senantes@university.edu",
        contactNumber: "09123456792",
      },
      {
        id: "5",
        name: "Dean Paul Quioyo",
        employeeId: "TCH005",
        department: "Physics",
        email: "dean.quioyo@university.edu",
        contactNumber: "09123456793",
      },
      {
        id: "6",
        name: "Don Rich Ulanday",
        employeeId: "TCH006",
        department: "Physical Education",
        email: "don.ulanday@university.edu",
        contactNumber: "09123456794",
      },
      {
        id: "7",
        name: "Mark Kervin Toledo",
        employeeId: "TCH007",
        department: "Information Technology",
        email: "mark.toledo@university.edu",
        contactNumber: "09123456795",
      },
      {
        id: "8",
        name: "Elijah Bulotano",
        employeeId: "TCH008",
        department: "Social Sciences",
        email: "elijah.bulotano@university.edu",
        contactNumber: "09123456796",
      },
      {
        id: "9",
        name: "Christian Dave Vargas",
        employeeId: "TCH009",
        department: "Business",
        email: "christian.vargas@university.edu",
        contactNumber: "09123456797",
      },
      {
        id: "10",
        name: "Jay Iverson Dela Cruz",
        employeeId: "TCH010",
        department: "Arts",
        email: "jay.delacruz@university.edu",
        contactNumber: "09123456798",
      },
      {
        id: "11",
        name: "Gilbert Torres",
        employeeId: "TCH011",
        department: "Research",
        email: "gilbert.torres@university.edu",
        contactNumber: "09123456799",
      },
    ];
    setInstructors(mockInstructors);
  };

  // Load subject assignments
  const loadSubjectAssignments = () => {
    const storedAssignments = readBranchScopedData<SubjectAssignment[]>(
      storageScopes.subjectAssignments,
      currentBranch,
    );

    if (storedAssignments?.length) {
      setSubjectAssignments(storedAssignments);
      return;
    }

    const mockAssignments: SubjectAssignment[] = [
      {
        id: "1",
        subjectId: "1",
        subjectCode: "MIN101",
        subjectName: "Oral Communication",
        instructorId: "1",
        instructorName: "Kenneth Lyle Sohot",
        sectionId: "1",
        sectionCode: "IC1DA",
        schedule: [
          {
            day: "Monday",
            startTime: "08:00",
            endTime: "10:00",
            room: "RM101",
          },
          {
            day: "Wednesday",
            startTime: "08:00",
            endTime: "10:00",
            room: "RM101",
          },
        ],
        academicYear: "2026-2027",
        semester: "1st Semester",
      },
      {
        id: "2",
        subjectId: "6",
        subjectCode: "MAJ101",
        subjectName: "Computer Systems Servicing",
        instructorId: "7",
        instructorName: "Mark Kervin Toledo",
        sectionId: "1",
        sectionCode: "IC1DA",
        schedule: [
          {
            day: "Tuesday",
            startTime: "10:00",
            endTime: "12:00",
            room: "RM205",
          },
          {
            day: "Thursday",
            startTime: "10:00",
            endTime: "12:00",
            room: "RM205",
          },
        ],
        academicYear: "2026-2027",
        semester: "1st Semester",
      },
    ];
    setSubjectAssignments(mockAssignments);
  };

  const getEligibleSubjectsForSection = (
    sectionId: string,
    semester: string,
    assignmentIdToIgnore?: string,
  ) => {
    const section = classSections.find((item) => item.id === sectionId);

    if (!section) {
      return [];
    }

    const takenSubjectIds = new Set(
      subjectAssignments
        .filter(
          (assignment) =>
            assignment.sectionId === sectionId &&
            assignment.semester === semester &&
            assignment.id !== assignmentIdToIgnore,
        )
        .map((assignment) => assignment.subjectId),
    );

    return subjects.filter(
      (subject) =>
        subject.program === section.program &&
        subject.yearLevel === section.yearLevel &&
        subject.semester === semester &&
        matchesAcademicDescriptor(
          resolveSubjectStrandOrCourse(subject),
          section.strand,
        ) &&
        !takenSubjectIds.has(subject.id),
    );
  };

  const buildAssignmentFormFromAssignment = (
    assignment: SubjectAssignment,
  ): AssignmentFormState => {
    const firstSchedule = assignment.schedule[0];

    return {
      sectionId: assignment.sectionId,
      instructorId: assignment.instructorId,
      subjectIds: [assignment.subjectId],
      academicYear: assignment.academicYear,
      semester: assignment.semester,
      scheduleDay: firstSchedule?.day || "",
      startTime: firstSchedule?.startTime || "",
      endTime: firstSchedule?.endTime || "",
      room: firstSchedule?.room || "",
    };
  };

  const closeAssignmentModal = () => {
    setShowAssignmentModal(false);
    setEditingAssignment(null);
    setAssignmentForm(createDefaultAssignmentForm());
  };

  const openCreateAssignmentModal = (sectionId = "") => {
    const resolvedSectionId = sectionId || classSections[0]?.id || "";
    setEditingAssignment(null);
    setAssignmentForm(createDefaultAssignmentForm(resolvedSectionId));
    setShowAssignmentModal(true);
  };

  const openEditAssignmentModal = (assignment: SubjectAssignment) => {
    const nextForm = buildAssignmentFormFromAssignment(assignment);
    const availableSubjects = getEligibleSubjectsForSection(
      nextForm.sectionId,
      nextForm.semester,
      assignment.id,
    );
    const selectedSubjectId = availableSubjects.some(
      (subject) => subject.id === assignment.subjectId,
    )
      ? assignment.subjectId
      : availableSubjects[0]?.id;

    setEditingAssignment(assignment);
    setAssignmentForm({
      ...nextForm,
      subjectIds: selectedSubjectId ? [selectedSubjectId] : [],
    });
    setShowAssignmentModal(true);
  };

  const updateAssignmentFormContext = (
    field: "sectionId" | "semester",
    value: string,
  ) => {
    setAssignmentForm((prev) => {
      const nextForm = { ...prev, [field]: value };
      const availableSubjects = getEligibleSubjectsForSection(
        nextForm.sectionId,
        nextForm.semester,
        editingAssignment?.id,
      );
      const availableSubjectIds = new Set(
        availableSubjects.map((subject) => subject.id),
      );
      const filteredSubjectIds = prev.subjectIds.filter((subjectId) =>
        availableSubjectIds.has(subjectId),
      );

      if (editingAssignment) {
        return {
          ...nextForm,
          subjectIds:
            filteredSubjectIds.length > 0
              ? [filteredSubjectIds[0]]
              : availableSubjects[0]
                ? [availableSubjects[0].id]
                : [],
        };
      }

      return {
        ...nextForm,
        subjectIds: filteredSubjectIds,
      };
    });
  };

  const toggleAssignmentSubjectSelection = (subjectId: string) => {
    setAssignmentForm((prev) => {
      if (editingAssignment) {
        return {
          ...prev,
          subjectIds: prev.subjectIds[0] === subjectId ? [] : [subjectId],
        };
      }

      return prev.subjectIds.includes(subjectId)
        ? {
            ...prev,
            subjectIds: prev.subjectIds.filter((item) => item !== subjectId),
          }
        : {
            ...prev,
            subjectIds: [...prev.subjectIds, subjectId],
          };
    });
  };

  const selectAllAssignmentSubjects = () => {
    const availableSubjects = getEligibleSubjectsForSection(
      assignmentForm.sectionId,
      assignmentForm.semester,
      editingAssignment?.id,
    );

    setAssignmentForm((prev) => ({
      ...prev,
      subjectIds: availableSubjects.map((subject) => subject.id),
    }));
  };

  const clearAssignmentSubjects = () => {
    setAssignmentForm((prev) => ({
      ...prev,
      subjectIds: [],
    }));
  };

  const toggleAssignmentSelection = (assignmentId: string) => {
    setSelectedAssignmentIds((prev) =>
      prev.includes(assignmentId)
        ? prev.filter((id) => id !== assignmentId)
        : [...prev, assignmentId],
    );
  };

  const toggleSectionAssignmentSelection = (sectionCode: string) => {
    const sectionAssignmentIds = filteredAssignments
      .filter((assignment) => assignment.sectionCode === sectionCode)
      .map((assignment) => assignment.id);

    if (sectionAssignmentIds.length === 0) {
      return;
    }

    setSelectedAssignmentIds((prev) => {
      const allSelected = sectionAssignmentIds.every((id) => prev.includes(id));

      if (allSelected) {
        return prev.filter((id) => !sectionAssignmentIds.includes(id));
      }

      return Array.from(new Set([...prev, ...sectionAssignmentIds]));
    });
  };

  const selectVisibleAssignments = () => {
    setSelectedAssignmentIds(
      filteredAssignments.map((assignment) => assignment.id),
    );
  };

  const clearAssignmentSelection = () => {
    setSelectedAssignmentIds([]);
  };

  const closeAssignmentDeleteModal = () => {
    setShowAssignmentDeleteModal(false);
    setPendingAssignmentDeleteIds([]);
  };

  const openAssignmentDeleteModal = (assignmentIds: string[]) => {
    if (assignmentIds.length === 0) {
      addToast("Select at least one assignment to delete.", "warning");
      return;
    }

    setPendingAssignmentDeleteIds(Array.from(new Set(assignmentIds)));
    setShowAssignmentDeleteModal(true);
  };

  const handleSaveAssignment = () => {
    const selectedSubjects = subjects.filter((subject) =>
      assignmentForm.subjectIds.includes(subject.id),
    );
    const section = classSections.find(
      (item) => item.id === assignmentForm.sectionId,
    );
    const instructor = instructors.find(
      (item) => item.id === assignmentForm.instructorId,
    );

    if (!section) {
      addToast("Please select a section first.", "warning");
      return;
    }

    if (selectedSubjects.length === 0) {
      addToast("Select at least one subject to assign.", "warning");
      return;
    }

    if (editingAssignment && selectedSubjects.length !== 1) {
      addToast("Editing an assignment only supports one subject.", "warning");
      return;
    }

    const shouldIncludeSchedule =
      assignmentForm.scheduleDay &&
      assignmentForm.startTime &&
      assignmentForm.endTime;
    const schedule = shouldIncludeSchedule
      ? [
          {
            day: assignmentForm.scheduleDay,
            startTime: assignmentForm.startTime,
            endTime: assignmentForm.endTime,
            room: assignmentForm.room.trim() || "TBA",
          },
        ]
      : [];

    if (editingAssignment) {
      const subject = selectedSubjects[0];

      setSubjectAssignments((prev) =>
        prev.map((assignment) =>
          assignment.id === editingAssignment.id
            ? {
                ...assignment,
                subjectId: subject.id,
                subjectCode: subject.code,
                subjectName: subject.name,
                instructorId: instructor?.id || "",
                instructorName: instructor?.name || "To be assigned",
                sectionId: section.id,
                sectionCode: section.code,
                academicYear: assignmentForm.academicYear.trim() || "2026-2027",
                semester: assignmentForm.semester,
                schedule,
              }
            : assignment,
        ),
      );

      addToast("Assignment updated successfully.", "success");
      closeAssignmentModal();
      return;
    }

    const newAssignments: SubjectAssignment[] = selectedSubjects.map(
      (subject, index) => ({
        id: `assignment_${Date.now()}_${subject.id}_${index}`,
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
        instructorId: instructor?.id || "",
        instructorName: instructor?.name || "To be assigned",
        sectionId: section.id,
        sectionCode: section.code,
        schedule,
        academicYear: assignmentForm.academicYear.trim() || "2026-2027",
        semester: assignmentForm.semester,
      }),
    );

    setSubjectAssignments((prev) => [...prev, ...newAssignments]);
    addToast(
      `${newAssignments.length} subject${newAssignments.length > 1 ? "s" : ""} assigned to ${section.code}.`,
      "success",
    );
    closeAssignmentModal();
  };

  const handleRemoveAssignment = (assignmentId: string) => {
    openAssignmentDeleteModal([assignmentId]);
  };

  const handleConfirmAssignmentDelete = () => {
    if (pendingAssignmentDeleteIds.length === 0) {
      return;
    }

    setSubjectAssignments((prev) =>
      prev.filter(
        (assignment) => !pendingAssignmentDeleteIds.includes(assignment.id),
      ),
    );
    setSelectedAssignmentIds((prev) =>
      prev.filter((id) => !pendingAssignmentDeleteIds.includes(id)),
    );

    addToast(
      `${pendingAssignmentDeleteIds.length} assignment${pendingAssignmentDeleteIds.length === 1 ? "" : "s"} removed.`,
      "info",
    );
    closeAssignmentDeleteModal();
  };

  // Update pending assignments
  const updatePendingAssignments = () => {
    const approvedUnassigned = enrollees.filter(
      (e) =>
        e.status === "Approved" &&
        !sectionAssignments.some((a) => a.enrolleeId === e.id),
    );
    setPendingAssignments(approvedUnassigned);
  };

  const syncStudentSection = (enrollee: Enrollee, sectionCode: string) => {
    if (!enrollee.studentNumber) {
      return;
    }

    const storedStudents = readStoredStudents();
    const nextStudents = storedStudents.map((student) =>
      student.id === enrollee.studentNumber &&
      normalizeBranchName(student.branch) === currentBranch
        ? { ...student, section: sectionCode }
        : student,
    );

    writeStoredStudents(nextStudents);
  };

  // Handle assign to section
  const handleAssignToSection = (enrolleeId: string, sectionId: string) => {
    const enrollee = enrollees.find((e) => e.id === enrolleeId);
    const section = classSections.find((s) => s.id === sectionId);

    if (!enrollee || !section) return;

    if (section.currentEnrollees >= section.maxCapacity) {
      addToast(`${section.code} is already full!`, "error");
      return;
    }

    setClassSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              currentEnrollees: s.currentEnrollees + 1,
              enrolleeIds: [...s.enrolleeIds, enrolleeId],
            }
          : s,
      ),
    );

    const newAssignment: SectionAssignment = {
      enrolleeId: enrollee.id,
      enrolleeName: enrollee.fullName,
      assignedSection: section.code,
      assignedDate: new Date().toLocaleDateString(),
      isManualOverride: true,
    };
    setSectionAssignments((prev) => [...prev, newAssignment]);
    setPendingAssignments((prev) => prev.filter((e) => e.id !== enrolleeId));
    syncStudentSection(enrollee, section.code);

    addToast(`${enrollee.fullName} assigned to ${section.code}`, "success");
  };

  // Handle auto-assign all
  const handleAutoAssignAll = () => {
    const assignments: {
      enrollee: Enrollee;
      section: ClassSection;
      isNewSection: boolean;
    }[] = [];
    const updatedSections = [...classSections];
    const newSectionsCreated: ClassSection[] = [];

    for (const enrollee of pendingAssignments) {
      const matchingSections = updatedSections
        .filter((section) => sectionMatchesEnrollee(section, enrollee))
        .sort((a, b) => a.section.localeCompare(b.section));

      let assignedSection = matchingSections.find(
        (section) => section.currentEnrollees < section.maxCapacity,
      );
      let isNewSection = false;

      if (!assignedSection && matchingSections.length > 0) {
        const lastSection = matchingSections[matchingSections.length - 1];
        const nextSectionLetter = String.fromCharCode(
          lastSection.section.charCodeAt(0) + 1,
        );
        const newSection: ClassSection = {
          id: `new_${Date.now()}_${nextSectionLetter}`,
          code:
            enrollee.program === "SHS"
              ? `${
                  (enrollee.strandOrCourse || "SHS")
                    .split(" ")[0]
                    .replace(/[^A-Z]/gi, "")
                    .slice(0, 4)
                    .toUpperCase() || "SHS"
                }${enrollee.yearLevel === "Grade 12" ? "2" : "1"}${nextSectionLetter}`
              : `BSE1${nextSectionLetter}`,
          program: enrollee.program,
          yearLevel: enrollee.yearLevel,
          strand: enrollee.strandOrCourse,
          section: nextSectionLetter,
          currentEnrollees: 1,
          maxCapacity: 30,
          enrolleeIds: [enrollee.id],
        };
        assignedSection = newSection;
        newSectionsCreated.push(newSection);
        isNewSection = true;
      } else if (assignedSection) {
        const sectionIndex = updatedSections.findIndex(
          (s) => s.id === assignedSection!.id,
        );
        if (sectionIndex !== -1) {
          updatedSections[sectionIndex].currentEnrollees++;
          updatedSections[sectionIndex].enrolleeIds.push(enrollee.id);
        }
      }

      if (assignedSection) {
        assignments.push({ enrollee, section: assignedSection, isNewSection });
      }
    }

    setClassSections([...updatedSections, ...newSectionsCreated]);

    const newAssignments = assignments.map((a) => ({
      enrolleeId: a.enrollee.id,
      enrolleeName: a.enrollee.fullName,
      assignedSection: a.section.code,
      assignedDate: new Date().toLocaleDateString(),
      isManualOverride: false,
    }));
    setSectionAssignments((prev) => [...prev, ...newAssignments]);
    setPendingAssignments([]);
    assignments.forEach(({ enrollee, section }) =>
      syncStudentSection(enrollee, section.code),
    );

    addToast(`Assigned ${assignments.length} students to sections`, "success");
  };

  const viewSectionStudents = (section: ClassSection) => {
    setSelectedSection(section);
    setShowSectionStudents(true);
  };

  // Load enrollment requests
  const loadEnrollmentRequests = async () => {
    setIsLoading(true);
    try {
      const storedRequests = readBranchScopedData<EnrollmentRequest[]>(
        storageScopes.enrollmentRequests,
        currentBranch,
      );

      if (storedRequests?.length) {
        setEnrollmentRequests(storedRequests);
        return;
      }

      const mockEnrollmentRequests: EnrollmentRequest[] = [
        {
          id: "ER001",
          studentNumber: "20220001",
          fullName: "Kenneth Lyle Sohot",
          program: "SHS",
          currentYearLevel: "Grade 11",
          requestedYearLevel: "Grade 12",
          academicYear: "2026-2027",
          semester: "1st Semester",
          enrollmentStatus: "Pending",
          requestDate: "2026-03-15",
          notes: "Grade 11 completer, all requirements submitted",
          attachments: [
            {
              name: "Grade 11 Certificate of Grades",
              type: "pdf",
              url: "/documents/maria_grades.pdf",
              reviewStatus: "Pending",
            },
            {
              name: "Clearance",
              type: "pdf",
              url: "/documents/maria_clearance.pdf",
              reviewStatus: "Pending",
            },
            {
              name: "Certificate of Enrollment",
              type: "pdf",
              url: "/documents/maria_enrollment.pdf",
              reviewStatus: "Pending",
            },
          ],
        },
        {
          id: "ER002",
          studentNumber: "20220002",
          fullName: "Neil John Velasco",
          program: "College",
          currentYearLevel: "3rd Year",
          requestedYearLevel: "4th Year",
          academicYear: "2026-2027",
          semester: "1st Semester",
          enrollmentStatus: "Pending",
          requestDate: "2026-03-14",
          notes: "Good academic standing",
          attachments: [
            {
              name: "3rd Year Certificate of Grades",
              type: "pdf",
              url: "/documents/juan_grades.pdf",
              reviewStatus: "Approved",
            },
            {
              name: "Clearance",
              type: "pdf",
              url: "/documents/juan_clearance.pdf",
              reviewStatus: "Pending",
            },
            {
              name: "Certificate of Enrollment",
              type: "pdf",
              url: "/documents/juan_enrollment.pdf",
              reviewStatus: "Pending",
            },
          ],
        },
        {
          id: "ER003",
          studentNumber: "20220003",
          fullName: "Hener Verdida",
          program: "SHS",
          currentYearLevel: "Grade 12",
          requestedYearLevel: "College",
          academicYear: "2026-2027",
          semester: "1st Semester",
          enrollmentStatus: "Approved",
          requestDate: "2026-03-10",
          enrollmentDate: "2026-03-12",
          notes: "Graduating with honors",
          attachments: [
            {
              name: "Grade 12 Certificate of Completion",
              type: "pdf",
              url: "/documents/ana_completion.pdf",
              reviewStatus: "Approved",
            },
            {
              name: "Clearance",
              type: "pdf",
              url: "/documents/ana_clearance.pdf",
              reviewStatus: "Approved",
            },
            {
              name: "Certificate of Enrollment",
              type: "pdf",
              url: "/documents/ana_enrollment.pdf",
              reviewStatus: "Approved",
            },
          ],
        },
      ];
      setEnrollmentRequests(mockEnrollmentRequests);
    } catch (error) {
      console.error("Failed to load enrollment requests", error);
      addToast("Unable to load enrollment requests.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const loadEnrollees = async () => {
    setIsLoading(true);
    const storedEnrollees =
      readBranchScopedData<Enrollee[]>(
        storageScopes.enrollees,
        currentBranch,
      ) ?? [];
    const defaultEnrollees = getDefaultBranchEnrollees(
      currentBranch,
    ) as Enrollee[];

    try {
      const supabaseApplicants = (await fetchSupabaseAdmissionApplicants(
        currentBranch,
      )) as Enrollee[];
      const mergedEnrollees = mergeAdminEnrolleeRecords(
        [...defaultEnrollees, ...supabaseApplicants],
        storedEnrollees,
      ) as Enrollee[];

      const syncedApprovedEnrollees = await Promise.all(
        mergedEnrollees.map(async (enrollee) => {
          if (enrollee.status !== "Approved" || !enrollee.trackingNumber) {
            return enrollee;
          }

          try {
            const activatedStudent = await activateApprovedStudent(
              enrollee.trackingNumber,
              enrollee.studentNumber,
            );

            return {
              ...enrollee,
              studentNumber:
                activatedStudent.studentNumber || enrollee.studentNumber,
            };
          } catch (error) {
            console.warn(
              "Unable to sync approved enrollee to Supabase student portal record.",
              error,
            );
            return enrollee;
          }
        }),
      );

      setEnrollees(syncedApprovedEnrollees);
    } catch (error) {
      console.error("Failed to fetch enrollees", error);
      setEnrollees(
        mergeAdminEnrolleeRecords(
          defaultEnrollees,
          storedEnrollees,
        ) as Enrollee[],
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(storageScopes.enrollees, currentBranch, enrollees);
  }, [currentBranch, enrollees, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.enrollmentRequests,
      currentBranch,
      enrollmentRequests,
    );
  }, [currentBranch, enrollmentRequests, hasInitializedBranchData]);

  useEffect(() => {
    const initializeBranchData = async () => {
      const storedSectionAssignments = readBranchScopedData<
        SectionAssignment[]
      >(storageScopes.sectionAssignments, currentBranch);

      setSectionAssignments(storedSectionAssignments ?? []);
      await loadEnrollmentRequests();
      await loadEnrollees();
      loadClassSections();
      loadSubjects();
      loadInstructors();
      loadSubjectAssignments();
      setHasInitializedBranchData(true);
    };

    setHasInitializedBranchData(false);
    void initializeBranchData();
  }, [currentBranch]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.classSections,
      currentBranch,
      classSections,
    );
  }, [classSections, currentBranch, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.sectionAssignments,
      currentBranch,
      sectionAssignments,
    );
  }, [currentBranch, sectionAssignments, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(storageScopes.subjects, currentBranch, subjects);
  }, [currentBranch, subjects, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.instructors,
      currentBranch,
      instructors,
    );
  }, [currentBranch, instructors, hasInitializedBranchData]);

  useEffect(() => {
    if (!hasInitializedBranchData) {
      return;
    }

    writeBranchScopedData(
      storageScopes.subjectAssignments,
      currentBranch,
      subjectAssignments,
    );
  }, [currentBranch, subjectAssignments, hasInitializedBranchData]);

  useEffect(() => {
    updatePendingAssignments();
  }, [enrollees, sectionAssignments]);

  const handleAttachmentStatusUpdate = (
    requestId: string,
    attachmentIndex: number,
    status: Attachment["reviewStatus"],
  ) => {
    if (!status) return;

    const request = enrollmentRequests.find((r) => r.id === requestId);
    const enrollee = enrollees.find((record) => record.id === requestId);
    const sourceAttachments = request?.attachments || enrollee?.attachments;

    if (!sourceAttachments) {
      addToast("Unable to update attachment status.", "error");
      return;
    }

    const updatedAttachments = sourceAttachments.map((attachment, index) =>
      index === attachmentIndex
        ? { ...attachment, reviewStatus: status }
        : attachment,
    );

    const requirementItems = getEnrollmentRequirementItems(
      request?.currentYearLevel || "",
      request?.requestedYearLevel || "",
      request?.program || enrollee?.program || "",
    );

    const allRequirementsApproved =
      updatedAttachments.length >= requirementItems.length &&
      updatedAttachments
        .slice(0, requirementItems.length)
        .every((attachment) => attachment.reviewStatus === "Approved");

    const nextStatus: EnrollmentRequest["enrollmentStatus"] =
      allRequirementsApproved ? "Approved" : "Pending";

    if (request) {
      setEnrollmentRequests((prevRequests) =>
        prevRequests.map((record) =>
          record.id === requestId
            ? {
                ...record,
                attachments: updatedAttachments,
                enrollmentStatus: nextStatus,
              }
            : record,
        ),
      );
    }

    if (enrollee) {
      setEnrollees((prevEnrollees) =>
        prevEnrollees.map((record) =>
          record.id === requestId
            ? {
                ...record,
                attachments: updatedAttachments,
              }
            : record,
        ),
      );
    }

    if (selectedRequest?.id === requestId) {
      setSelectedRequest((prev) =>
        prev
          ? {
              ...prev,
              attachments: updatedAttachments,
              ...(request ? { enrollmentStatus: nextStatus } : {}),
            }
          : null,
      );
    }

    addToast(
      `Requirement ${status === "Approved" ? "approved" : "marked for redo"} successfully!`,
      "success",
    );
  };

  const handleReviewRequirements = (request: EnrollmentRequest | Enrollee) => {
    setSelectedRequest(request);
    if (!isEnrollmentRequest(request) && request.program === "College") {
      setPendingScholarshipScore(
        typeof request.scholarshipExamScore === "number"
          ? String(request.scholarshipExamScore)
          : "",
      );
      return;
    }

    setPendingScholarshipScore("");
  };

  const closeReviewModal = () => {
    setSelectedRequest(null);
    setViewingAttachment(null);
    setPendingScholarshipScore("");
  };

  const handleApproveRequest = (request: EnrollmentRequest | Enrollee) => {
    let scholarshipExamScore: number | null = null;

    if (!isEnrollmentRequest(request) && request.program === "College") {
      const trimmedScore = pendingScholarshipScore.trim();

      if (trimmedScore !== "") {
        const parsedScore = Number(trimmedScore);

        if (
          !Number.isFinite(parsedScore) ||
          parsedScore < 0 ||
          parsedScore > 100
        ) {
          addToast(
            "Scholarship exam score must be a number from 0 to 100.",
            "warning",
          );
          return false;
        }

        scholarshipExamScore = parsedScore;
      }
    }

    setSelectedAction({
      id: request.id,
      action: "approve",
      scholarshipExamScore,
    });
    setIsConfirmModalOpen(true);
    return true;
  };

  const handleRejectRequest = (requestId: string) => {
    setSelectedAction({ id: requestId, action: "reject" });
    setIsConfirmModalOpen(true);
  };

  const confirmAction = async () => {
    if (!selectedAction) return;

    try {
      // Check if it's an enrollment request (existing student)
      const requestToUpdate = enrollmentRequests.find(
        (req) => req.id === selectedAction.id,
      );
      // Check if it's a new enrollee (applicant)
      const enrolleeToUpdate = enrollees.find(
        (e) => e.id === selectedAction.id,
      );

      if (!requestToUpdate) {
        if (enrolleeToUpdate) {
          const isApprove = selectedAction.action === "approve";

          let syncedStudentNumber = enrolleeToUpdate.studentNumber;

          try {
            if (isApprove) {
              const activatedStudent = await activateApprovedStudent(
                enrolleeToUpdate.trackingNumber,
              );
              syncedStudentNumber = activatedStudent.studentNumber;
            } else {
              await updateAdmissionProgress({
                trackingNumber: enrolleeToUpdate.trackingNumber,
                currentStep: 4,
                applicationStatus: "rejected",
              });
            }
          } catch (syncError) {
            console.warn(
              "Unable to sync admission decision to Supabase, keeping local admin state.",
              syncError,
            );

            if (isApprove) {
              try {
                await updateAdmissionProgress({
                  trackingNumber: enrolleeToUpdate.trackingNumber,
                  currentStep: 4,
                  applicationStatus: "accepted",
                });
              } catch (fallbackError) {
                console.warn(
                  "Unable to mark admission as accepted in Supabase after activation failed.",
                  fallbackError,
                );
              }
            }
          }

          const updatedEnrollee: Enrollee = isApprove
            ? {
                ...promoteApplicantToStoredStudent({
                  ...enrolleeToUpdate,
                  studentNumber: syncedStudentNumber,
                  branch: currentBranch,
                  strandOrCourse: enrolleeToUpdate.strandOrCourse || "",
                  studentStatus: enrolleeToUpdate.studentStatus || "",
                  scholarshipExamScore:
                    selectedAction.scholarshipExamScore ??
                    enrolleeToUpdate.scholarshipExamScore ??
                    null,
                }).applicant,
              }
            : {
                ...enrolleeToUpdate,
                status: "Rejected",
              };

          setEnrollees((prev) =>
            prev.map((e) => (e.id === selectedAction.id ? updatedEnrollee : e)),
          );
          addToast(
            isApprove
              ? updatedEnrollee.documentsSubmitted <
                updatedEnrollee.totalDocuments
                ? `Admission approved. Student number ${updatedEnrollee.studentNumber} is now active with ${updatedEnrollee.documentsSubmitted}/${updatedEnrollee.totalDocuments} credentials submitted.`
                : `Admission approved successfully. Student number ${updatedEnrollee.studentNumber} is now active.`
              : "Admission rejected successfully.",
            isApprove ? "success" : "warning",
          );
        } else {
          addToast("Record not found.", "error");
        }
      } else {
        const updatedRequest: EnrollmentRequest = {
          ...requestToUpdate,
          enrollmentStatus:
            selectedAction.action === "approve" ? "Approved" : "Rejected",
          enrollmentDate:
            selectedAction.action === "approve"
              ? new Date().toLocaleDateString()
              : undefined,
        };

        setEnrollmentRequests((prevRequests) =>
          prevRequests.map((req) =>
            req.id === selectedAction.id ? updatedRequest : req,
          ),
        );
        addToast(
          `Enrollment request ${selectedAction.action === "approve" ? "approved" : "rejected"} successfully!`,
          "success",
        );
      }

      if (selectedRequest?.id === selectedAction.id) {
        closeReviewModal();
      }
    } catch (error) {
      console.error("Failed to process enrollment request:", error);
      addToast("Failed to process enrollment request.", "error");
    } finally {
      setIsConfirmModalOpen(false);
      setSelectedAction(null);
    }
  };

  const handleViewRequestDetails = (request: EnrollmentRequest) => {
    setSelectedRequest(request);
  };

  const filteredEnrollees = enrollees.filter((enrollee) => {
    const matchesSearch =
      enrollee.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollee.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollee.trackingNumber
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (enrollee.studentNumber || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (enrollee.strandOrCourse || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "All" || enrollee.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredRequests = enrollmentRequests.filter((request) => {
    const matchesSearch =
      request.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.studentNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      enrollmentStatusFilter === "All" ||
      request.enrollmentStatus === enrollmentStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedAdmissionActionRecord = selectedAction
    ? (enrollees.find((enrollee) => enrollee.id === selectedAction.id) ?? null)
    : null;
  const selectedEnrollmentActionRecord = selectedAction
    ? (enrollmentRequests.find((request) => request.id === selectedAction.id) ??
      null)
    : null;

  const filteredInstructors = instructors.filter(
    (instructor) =>
      instructor.name.toLowerCase().includes(instructorSearch.toLowerCase()) ||
      instructor.employeeId
        .toLowerCase()
        .includes(instructorSearch.toLowerCase()) ||
      instructor.department
        .toLowerCase()
        .includes(instructorSearch.toLowerCase()),
  );

  const filteredAssignments = subjectAssignments.filter((assignment) => {
    if (assignmentFilter.program !== "All") {
      const section = classSections.find(
        (s) => s.code === assignment.sectionCode,
      );
      if (!section || section.program !== assignmentFilter.program)
        return false;
    }
    if (
      assignmentFilter.section !== "All" &&
      assignment.sectionCode !== assignmentFilter.section
    )
      return false;
    if (
      assignmentFilter.semester !== "All" &&
      assignment.semester !== assignmentFilter.semester
    )
      return false;
    return true;
  });
  const availableAssignmentSubjects = getEligibleSubjectsForSection(
    assignmentForm.sectionId,
    assignmentForm.semester,
    editingAssignment?.id,
  );
  const selectedAssignmentSection = classSections.find(
    (section) => section.id === assignmentForm.sectionId,
  );
  const selectedAssignments = subjectAssignments.filter((assignment) =>
    selectedAssignmentIds.includes(assignment.id),
  );
  const selectedVisibleAssignmentCount = filteredAssignments.filter(
    (assignment) => selectedAssignmentIds.includes(assignment.id),
  ).length;
  const pendingAssignmentDeleteTargets = subjectAssignments.filter(
    (assignment) => pendingAssignmentDeleteIds.includes(assignment.id),
  );

  useEffect(() => {
    const existingAssignmentIds = new Set(
      subjectAssignments.map((assignment) => assignment.id),
    );

    setSelectedAssignmentIds((prev) => {
      const next = prev.filter((id) => existingAssignmentIds.has(id));
      return next.length === prev.length ? prev : next;
    });

    setPendingAssignmentDeleteIds((prev) => {
      const next = prev.filter((id) => existingAssignmentIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [subjectAssignments]);

  const pendingCount = enrollees.filter((e) => e.status === "Pending").length;
  const approvedCount = enrollees.filter((e) => e.status === "Approved").length;
  const pendingRequestsCount = enrollmentRequests.filter(
    (r) => r.enrollmentStatus === "Pending",
  ).length;
  const approvedRequestsCount = enrollmentRequests.filter(
    (r) => r.enrollmentStatus === "Approved",
  ).length;
  const reflectedAcademicYear =
    enrollmentRequests[0]?.academicYear ||
    subjectAssignments[0]?.academicYear ||
    "2026-2027";
  const reflectedSemester =
    enrollmentRequests[0]?.semester ||
    subjectAssignments[0]?.semester ||
    "1st Semester";

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Approved":
        return <FaCheckCircle className="status-icon approved" />;
      case "Pending":
        return <FaClock className="status-icon pending" />;
      case "Rejected":
        return <FaExclamationTriangle className="status-icon rejected" />;
      default:
        return null;
    }
  };

  const handleSidebarToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  const toggleSHSYear = (year: string) => {
    setExpandedSHSSections((prev) => ({
      ...prev,
      [year]: !prev[year as keyof typeof prev],
    }));
  };

  const toggleCollegeYear = (year: string) => {
    setExpandedCollegeSections((prev) => ({
      ...prev,
      [year]: !prev[year as keyof typeof prev],
    }));
  };

  const toggleAssignmentSection = (sectionCode: string) => {
    setExpandedAssignmentSections((prev) => ({
      ...prev,
      [sectionCode]: !prev[sectionCode],
    }));
  };

  // Automated Class Assignment logic
  const handleAutoGenerateSchedule = (section: ClassSection) => {
    const sectionSubjects = subjects.filter(
      (s) =>
        s.yearLevel === section.yearLevel &&
        s.program === section.program &&
        matchesAcademicDescriptor(
          resolveSubjectStrandOrCourse(s),
          section.strand,
        ),
    );

    if (sectionSubjects.length === 0) {
      addToast(`No subjects found for ${section.yearLevel}`, "warning");
      return;
    }

    const newAssignments: SubjectAssignment[] = [];
    let currentTime = 8 * 60 + 30; // Start at 08:30 AM
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    sectionSubjects.forEach((subject, index) => {
      const day = days[index % days.length];
      const instructor = instructors[index % instructors.length];

      // Add 30 min break after Class 1 (ends 10:00)
      if (currentTime === 10 * 60) {
        currentTime += 30;
      }

      // Add 30 min break after Class 3 (ends 15:00 if lunch was 1hr)
      if (currentTime === 15 * 60 || currentTime === 14 * 60 + 30) {
        currentTime += 30;
      }

      const startHours = Math.floor(currentTime / 60);
      const startMins = currentTime % 60;
      const endTotal = currentTime + 90; // 1.5 hour class
      const endHours = Math.floor(endTotal / 60);
      const endMins = endTotal % 60;

      const formatTime = (h: number, m: number) =>
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;

      newAssignments.push({
        id: `auto_${Date.now()}_${index}`,
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
        instructorId: instructor.id,
        instructorName: instructor.name,
        sectionId: section.id,
        sectionCode: section.code,
        academicYear: "2026-2027",
        semester: "1st Semester",
        schedule: [
          {
            day,
            startTime: formatTime(startHours, startMins),
            endTime: formatTime(endHours, endMins),
            room: `RM${100 + index}`,
          },
        ],
      });

      // Increment time for next subject or reset if day changes
      if (index % days.length === days.length - 1) {
        currentTime += 90;
      }
    });

    setSubjectAssignments((prev) => [
      ...prev.filter((a) => a.sectionCode !== section.code),
      ...newAssignments,
    ]);

    addToast(
      `Generated ${newAssignments.length} assignments for ${section.code}`,
      "success",
    );
  };

  // Filter subjects based on filters
  const getFilteredSubjects = () => {
    return subjects.filter((subject) => {
      const subjectDescriptor = resolveSubjectStrandOrCourse(subject);

      if (
        subjectFilter.program !== "All" &&
        subject.program !== subjectFilter.program
      )
        return false;
      if (
        subjectFilter.yearLevel !== "All" &&
        subject.yearLevel !== subjectFilter.yearLevel
      )
        return false;
      if (
        subjectFilter.strand !== "All" &&
        !matchesAcademicDescriptor(subjectDescriptor, subjectFilter.strand)
      )
        return false;
      if (subjectFilter.strandOrCourse !== "All") {
        if (
          !matchesAcademicDescriptor(
            subjectDescriptor,
            subjectFilter.strandOrCourse,
          )
        ) {
          return false;
        }
      }
      if (!subjectFilter.showMinor && subject.isMinor) return false;
      return true;
    });
  };

  // Organize subjects for table view with filters applied
  const organizeSubjectsForTable = () => {
    const filtered = getFilteredSubjects();

    const shsData: Record<string, Record<string, Subject[]>> = {
      "Grade 11": { "1st Semester": [], "2nd Semester": [] },
      "Grade 12": { "1st Semester": [], "2nd Semester": [] },
    };

    const collegeData: Record<string, Record<string, Subject[]>> = {
      "1st Year": { "1st Semester": [], "2nd Semester": [] },
      "2nd Year": { "1st Semester": [], "2nd Semester": [] },
      "3rd Year": { "1st Semester": [], "2nd Semester": [] },
      "4th Year": { "1st Semester": [], "2nd Semester": [] },
    };

    filtered.forEach((subject) => {
      if (subject.program === "SHS") {
        if (
          shsData[subject.yearLevel] &&
          shsData[subject.yearLevel][subject.semester]
        ) {
          shsData[subject.yearLevel][subject.semester].push(subject);
        }
      } else if (subject.program === "College") {
        if (
          collegeData[subject.yearLevel] &&
          collegeData[subject.yearLevel][subject.semester]
        ) {
          collegeData[subject.yearLevel][subject.semester].push(subject);
        }
      }
    });

    return { shsData, collegeData };
  };

  const { shsData, collegeData } = organizeSubjectsForTable();

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

      <main className="enrollees-content">
        <header className="page-header">
          <h1>Enrollment Management</h1>
          <p>
            {isLoading
              ? "Loading data..."
              : "Manage new admissions, student enrollment requests, and academic assignments"}
          </p>
        </header>

        <div className="enrollment-tabs">
          <button
            className={`tab-btn ${activeTab === "admissions" ? "active" : ""}`}
            onClick={() => setActiveTab("admissions")}
          >
            <FaUserPlus /> New Admissions{" "}
            {pendingCount > 0 && (
              <span className="tab-badge">{pendingCount}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === "enrollments" ? "active" : ""}`}
            onClick={() => setActiveTab("enrollments")}
          >
            <FaUserGraduate /> Enrollment Requests{" "}
            {pendingRequestsCount > 0 && (
              <span className="tab-badge">{pendingRequestsCount}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === "academic" ? "active" : ""}`}
            onClick={() => setActiveTab("academic")}
          >
            <FaBook /> Academic Management
          </button>
        </div>

        <div
          className={`stats-cards ${activeTab === "academic" ? "academic-stats" : ""}`.trim()}
        >
          {activeTab === "admissions" ? (
            <>
              <div className="stat-card approved">
                <span className="stat-label">Approved (Transferred)</span>
                <span className="stat-value">{approvedCount}</span>
              </div>
              <div className="stat-card pending">
                <span className="stat-label">Pending Review</span>
                <span className="stat-value">{pendingCount}</span>
              </div>
            </>
          ) : activeTab === "enrollments" ? (
            <>
              <div className="stat-card approved">
                <span className="stat-label">Approved Requests</span>
                <span className="stat-value">{approvedRequestsCount}</span>
              </div>
              <div className="stat-card pending">
                <span className="stat-label">Pending Requests</span>
                <span className="stat-value">{pendingRequestsCount}</span>
              </div>
            </>
          ) : (
            <>
              <div className="stat-card">
                <span className="stat-label">Total Subjects</span>
                <span className="stat-value">{subjects.length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Total Instructors</span>
                <span className="stat-value">{instructors.length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Class Assignments</span>
                <span className="stat-value">{subjectAssignments.length}</span>
              </div>
            </>
          )}
        </div>

        {/* Admissions Tab */}
        {activeTab === "admissions" && (
          <>
            <div className="section-management-bar">
              <div className="section-info">
                <FaUsers className="section-icon" />
                <span>
                  {pendingAssignments.length} approved student(s) waiting for
                  section assignment
                </span>
              </div>
              <div className="section-actions-buttons">
                <button
                  className="action-btn auto-assign"
                  onClick={handleAutoAssignAll}
                  disabled={pendingAssignments.length === 0}
                >
                  <FaMagic /> Auto-Assign All
                </button>
                <button
                  className="action-btn section-manager"
                  onClick={() => setShowSectionManager(true)}
                >
                  <FaLayerGroup /> Manage Sections
                </button>
              </div>
            </div>
            <div className="controls">
              <input
                type="text"
                placeholder="Search by name, tracking number, or student number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "All" | Enrollee["status"])
                }
                className="status-filter"
              >
                <option value="All">All status</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div className="table-container">
              <table className="enrollees-table">
                <thead>
                  <tr>
                    <th>TRACKING NO.</th>
                    <th>FULL NAME</th>
                    <th>PROGRAM</th>
                    <th>COURSE/STRAND</th>
                    <th>DOCUMENTS</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEnrollees.length > 0 ? (
                    filteredEnrollees.map((enrollee) => (
                      <tr key={enrollee.id}>
                        <td>{enrollee.trackingNumber}</td>
                        <td>{enrollee.fullName}</td>
                        <td>{enrollee.program}</td>
                        <td>{enrollee.strandOrCourse || enrollee.yearLevel}</td>
                        <td>
                          {enrollee.documentsSubmitted}/
                          {enrollee.totalDocuments}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${enrollee.status.toLowerCase()}`}
                          >
                            {enrollee.status}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="action-btn review"
                              onClick={() => handleReviewRequirements(enrollee)}
                            >
                              Review
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="no-results">
                        {isLoading
                          ? "Loading enrollees..."
                          : "No enrollees found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Enrollment Requests Tab */}
        {activeTab === "enrollments" && (
          <>
            <div className="controls">
              <input
                type="text"
                placeholder="Search by Name or Student Number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <select
                value={enrollmentStatusFilter}
                onChange={(e) =>
                  setEnrollmentStatusFilter(
                    e.target.value as
                      | "All"
                      | "Pending"
                      | "Approved"
                      | "Rejected",
                  )
                }
                className="status-filter"
              >
                <option value="All">All Status</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div className="table-container">
              <table className="enrollees-table">
                <thead>
                  <tr>
                    <th>STUDENT NO.</th>
                    <th>FULL NAME</th>
                    <th>PROGRAM</th>
                    <th>CURRENT LEVEL</th>
                    <th>REQUESTED LEVEL</th>
                    <th>REQUEST DATE</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.length > 0 ? (
                    filteredRequests.map((request) => (
                      <tr key={request.id}>
                        <td>{request.studentNumber}</td>
                        <td>{request.fullName}</td>
                        <td>{request.program}</td>
                        <td>{request.currentYearLevel}</td>
                        <td>
                          <span className="next-level-badge">
                            {request.program === "SHS" &&
                            request.requestedYearLevel === "College"
                              ? "1st Year College"
                              : request.requestedYearLevel}
                          </span>
                        </td>
                        <td>{request.requestDate}</td>
                        <td>
                          <span
                            className={`enrollment-badge ${request.enrollmentStatus.toLowerCase()}`}
                          >
                            {request.enrollmentStatus}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="action-btn view"
                              onClick={() => handleViewRequestDetails(request)}
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="no-results">
                        No enrollment requests found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Academic Management Tab */}
        {activeTab === "academic" && (
          <div className="academic-management-container">
            <div className="academic-subtabs">
              <button
                className={`subtab-btn ${activeManagementTab === "subjects" ? "active" : ""}`}
                onClick={() => setActiveManagementTab("subjects")}
              >
                <FaBook /> Subjects
              </button>
              <button
                className={`subtab-btn ${activeManagementTab === "instructors" ? "active" : ""}`}
                onClick={() => setActiveManagementTab("instructors")}
              >
                <FaChalkboardTeacher /> Instructors
              </button>
              <button
                className={`subtab-btn ${activeManagementTab === "assignments" ? "active" : ""}`}
                onClick={() => setActiveManagementTab("assignments")}
              >
                <FaCalendarAlt /> Class Assignments
              </button>
            </div>

            {/* Subjects Management - Table View with Enhanced Filters */}
            {activeManagementTab === "subjects" && (
              <div className="management-section">
                <div className="section-header-actions">
                  <h3>Subject Management</h3>
                  <button
                    className="action-btn add"
                    onClick={() => setShowSubjectModal(true)}
                  >
                    <FaPlus /> Add Subject
                  </button>
                </div>

                {/* Enhanced Filters */}
                <div className="subjects-filter">
                  <div className="filter-group">
                    <FaFilter className="filter-icon" />
                    <select
                      className="filter-select"
                      value={subjectFilter.program}
                      onChange={(e) =>
                        setSubjectFilter({
                          ...subjectFilter,
                          program: e.target.value,
                          yearLevel: "All",
                          strand: "All",
                          strandOrCourse: "All",
                        })
                      }
                    >
                      <option value="All">All Programs</option>
                      <option value="College">College</option>
                      <option value="SHS">SHS</option>
                    </select>
                  </div>
                  <select
                    className="filter-select"
                    value={subjectFilter.yearLevel}
                    onChange={(e) =>
                      setSubjectFilter({
                        ...subjectFilter,
                        yearLevel: e.target.value,
                      })
                    }
                  >
                    <option value="All">All Year Levels</option>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                    <option value="Grade 11">Grade 11</option>
                    <option value="Grade 12">Grade 12</option>
                  </select>

                  <select
                    className="filter-select"
                    value={subjectFilter.strandOrCourse}
                    onChange={(e) =>
                      setSubjectFilter({
                        ...subjectFilter,
                        strandOrCourse: e.target.value,
                      })
                    }
                  >
                    <option value="All">All Strands/Courses</option>
                    {subjectFilter.program === "SHS" ? (
                      <>
                        <option value="All">All Strands (Core)</option>
                        <option value="ICT">ICT</option>
                        <option value="GAS">GAS</option>
                        <option value="HUMSS">HUMSS</option>
                        <option value="ABM">ABM</option>
                        <option value="STEM">STEM</option>
                      </>
                    ) : subjectFilter.program === "College" ? (
                      <option value={DEFAULT_COLLEGE_COURSE}>
                        BS Entrepreneurship
                      </option>
                    ) : (
                      <></>
                    )}
                  </select>
                  <label className="filter-checkbox">
                    <input
                      type="checkbox"
                      checked={subjectFilter.showMinor}
                      onChange={(e) =>
                        setSubjectFilter({
                          ...subjectFilter,
                          showMinor: e.target.checked,
                        })
                      }
                    />{" "}
                    Show Minor Subjects
                  </label>
                </div>

                {/* Subjects Table View */}
                <div className="subjects-table-view">
                  {/* SHS Section */}
                  <div className="program-section">
                    <div className="program-section-header">
                      <FaUniversity className="program-icon" />
                      <h3>Senior High School (SHS)</h3>
                    </div>
                    {/* Grade 11 */}
                    <div className="year-level-section">
                      <div
                        className="year-level-header"
                        onClick={() => toggleSHSYear("Grade 11")}
                      >
                        <h4>Grade 11</h4>
                        <button className="expand-btn">
                          {expandedSHSSections["Grade 11"] ? (
                            <FaChevronUp />
                          ) : (
                            <FaChevronDown />
                          )}
                        </button>
                      </div>
                      {expandedSHSSections["Grade 11"] && (
                        <div className="semesters-container">
                          {["1st Semester", "2nd Semester"].map((sem) => (
                            <div key={sem} className="semester-section">
                              <div className="semester-header">
                                <h5>{sem}</h5>
                                <span className="subject-count">
                                  {shsData["Grade 11"][sem].length} subjects
                                </span>
                              </div>
                              <div className="subjects-table-wrapper">
                                <table className="subjects-table">
                                  <thead>
                                    <tr>
                                      <th>Subject Code</th>
                                      <th>Subject Title</th>
                                      <th>Strand</th>
                                      <th>Type</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {shsData["Grade 11"][sem].length > 0 ? (
                                      shsData["Grade 11"][sem].map(
                                        (subject) => (
                                          <tr key={subject.id}>
                                            <td className="subject-code">
                                              {subject.code}
                                            </td>
                                            <td>{subject.name}</td>
                                            <td>
                                              <span className="strand-badge">
                                                {subject.strand}
                                              </span>
                                            </td>
                                            <td>
                                              {subject.isMinor ? (
                                                <span className="minor-badge">
                                                  Minor
                                                </span>
                                              ) : (
                                                <span className="major-badge">
                                                  Major
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        ),
                                      )
                                    ) : (
                                      <tr>
                                        <td colSpan={4} className="empty-row">
                                          No subjects added yet
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Grade 12 */}
                    <div className="year-level-section">
                      <div
                        className="year-level-header"
                        onClick={() => toggleSHSYear("Grade 12")}
                      >
                        <h4>Grade 12</h4>
                        <button className="expand-btn">
                          {expandedSHSSections["Grade 12"] ? (
                            <FaChevronUp />
                          ) : (
                            <FaChevronDown />
                          )}
                        </button>
                      </div>
                      {expandedSHSSections["Grade 12"] && (
                        <div className="semesters-container">
                          {["1st Semester", "2nd Semester"].map((sem) => (
                            <div key={sem} className="semester-section">
                              <div className="semester-header">
                                <h5>{sem}</h5>
                                <span className="subject-count">
                                  {shsData["Grade 12"][sem].length} subjects
                                </span>
                              </div>
                              <div className="subjects-table-wrapper">
                                <table className="subjects-table">
                                  <thead>
                                    <tr>
                                      <th>Subject Code</th>
                                      <th>Subject Title</th>
                                      <th>Strand</th>
                                      <th>Type</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {shsData["Grade 12"][sem].length > 0 ? (
                                      shsData["Grade 12"][sem].map(
                                        (subject) => (
                                          <tr key={subject.id}>
                                            <td className="subject-code">
                                              {subject.code}
                                            </td>
                                            <td>{subject.name}</td>
                                            <td>
                                              <span className="strand-badge">
                                                {subject.strand}
                                              </span>
                                            </td>
                                            <td>
                                              {subject.isMinor ? (
                                                <span className="minor-badge">
                                                  Minor
                                                </span>
                                              ) : (
                                                <span className="major-badge">
                                                  Major
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        ),
                                      )
                                    ) : (
                                      <tr>
                                        <td colSpan={4} className="empty-row">
                                          No subjects added yet
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* College Section */}
                  <div className="program-section">
                    <div className="program-section-header">
                      <FaUniversity className="program-icon" />
                      <h3>College</h3>
                    </div>
                    {["1st Year", "2nd Year", "3rd Year", "4th Year"].map(
                      (year) => (
                        <div key={year} className="year-level-section">
                          <div
                            className="year-level-header"
                            onClick={() => toggleCollegeYear(year)}
                          >
                            <h4>{year}</h4>
                            <button className="expand-btn">
                              {expandedCollegeSections[
                                year as keyof typeof expandedCollegeSections
                              ] ? (
                                <FaChevronUp />
                              ) : (
                                <FaChevronDown />
                              )}
                            </button>
                          </div>
                          {expandedCollegeSections[
                            year as keyof typeof expandedCollegeSections
                          ] && (
                            <div className="semesters-container">
                              {["1st Semester", "2nd Semester"].map((sem) => (
                                <div key={sem} className="semester-section">
                                  <div className="semester-header">
                                    <h5>{sem}</h5>
                                    <span className="subject-count">
                                      {collegeData[year][sem].length} subjects
                                    </span>
                                  </div>
                                  <div className="subjects-table-wrapper">
                                    <table className="subjects-table">
                                      <thead>
                                        <tr>
                                          <th>Subject Code</th>
                                          <th>Subject Title</th>
                                          <th>Units</th>
                                          <th>Type</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {collegeData[year][sem].length > 0 ? (
                                          collegeData[year][sem].map(
                                            (subject) => (
                                              <tr key={subject.id}>
                                                <td className="subject-code">
                                                  {subject.code}
                                                </td>
                                                <td>{subject.name}</td>
                                                <td>{subject.units || 3}</td>
                                                <td>
                                                  {subject.isMinor ? (
                                                    <span className="minor-badge">
                                                      Minor
                                                    </span>
                                                  ) : (
                                                    <span className="major-badge">
                                                      Major
                                                    </span>
                                                  )}
                                                </td>
                                              </tr>
                                            ),
                                          )
                                        ) : (
                                          <tr>
                                            <td
                                              colSpan={4}
                                              className="empty-row"
                                            >
                                              No subjects added yet
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Instructors Management */}
            {activeManagementTab === "instructors" && (
              <div className="management-section">
                <div className="section-header-actions">
                  <h3>Instructor Management</h3>
                  <button
                    className="action-btn add"
                    onClick={() => setShowInstructorModal(true)}
                  >
                    <FaPlus /> Add Instructor
                  </button>
                </div>
                <div className="instructor-search">
                  <FaSearch className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search by name, ID, or department..."
                    value={instructorSearch}
                    onChange={(e) => setInstructorSearch(e.target.value)}
                  />
                </div>
                <div className="instructors-grid">
                  {filteredInstructors.map((instructor) => (
                    <div key={instructor.id} className="instructor-card">
                      <div className="instructor-avatar">
                        <FaChalkboardTeacher />
                      </div>
                      <div className="instructor-info">
                        <h4>{instructor.name}</h4>
                        <p>{instructor.employeeId}</p>
                        <p className="department">{instructor.department}</p>
                        <p className="contact">{instructor.email}</p>
                      </div>
                      <div className="instructor-actions">
                        <button
                          className="action-btn edit"
                          onClick={() => {
                            setEditingInstructor(instructor);
                            setShowInstructorModal(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() =>
                            addToast(`Deleted ${instructor.name}`, "success")
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Class Assignments */}
            {activeManagementTab === "assignments" && (
              <div className="management-section">
                <div className="section-header-actions">
                  <h3>Class Schedule & Assignments</h3>
                  <button
                    className="action-btn add"
                    onClick={() => openCreateAssignmentModal()}
                  >
                    <FaPlus /> Create Assignment
                  </button>
                </div>
                <div className="assignments-filters">
                  <select
                    className="filter-select"
                    value={assignmentFilter.program}
                    onChange={(e) =>
                      setAssignmentFilter({
                        ...assignmentFilter,
                        program: e.target.value,
                      })
                    }
                  >
                    <option value="All">All Programs</option>
                    <option value="College">College</option>
                    <option value="SHS">SHS</option>
                  </select>
                  <select
                    className="filter-select"
                    value={assignmentFilter.section}
                    onChange={(e) =>
                      setAssignmentFilter({
                        ...assignmentFilter,
                        section: e.target.value,
                      })
                    }
                  >
                    <option value="All">All Sections</option>
                    {classSections.map((section) => (
                      <option key={section.id} value={section.code}>
                        {section.code}
                      </option>
                    ))}
                  </select>
                  <select
                    className="filter-select"
                    value={assignmentFilter.semester}
                    onChange={(e) =>
                      setAssignmentFilter({
                        ...assignmentFilter,
                        semester: e.target.value,
                      })
                    }
                  >
                    <option value="All">All Semesters</option>
                    <option value="1st Semester">1st Semester 2026-2027</option>
                    <option value="2nd Semester">2nd Semester 2026-2027</option>
                  </select>
                </div>

                <div className="assignment-bulk-toolbar">
                  <div className="assignment-bulk-summary">
                    <span className="assignment-toolbar-pill">
                      {filteredAssignments.length} visible
                    </span>
                    <span
                      className={`assignment-toolbar-pill ${selectedAssignments.length > 0 ? "active" : ""}`}
                    >
                      {selectedAssignments.length} selected
                    </span>
                    {selectedVisibleAssignmentCount > 0 &&
                      selectedVisibleAssignmentCount !==
                        selectedAssignments.length && (
                        <span className="assignment-toolbar-caption">
                          {selectedVisibleAssignmentCount} selected in current
                          view
                        </span>
                      )}
                  </div>
                  <div className="assignment-bulk-actions">
                    <button
                      type="button"
                      className="assignment-selection-btn"
                      onClick={selectVisibleAssignments}
                      disabled={filteredAssignments.length === 0}
                    >
                      Select Visible
                    </button>
                    <button
                      type="button"
                      className="assignment-selection-btn secondary"
                      onClick={clearAssignmentSelection}
                      disabled={selectedAssignments.length === 0}
                    >
                      Clear Selection
                    </button>
                    <button
                      type="button"
                      className="action-btn delete assignment-delete-trigger"
                      onClick={() =>
                        openAssignmentDeleteModal(
                          selectedAssignments.map(
                            (assignment) => assignment.id,
                          ),
                        )
                      }
                      disabled={selectedAssignments.length === 0}
                    >
                      <FaTrash /> Delete Selected
                    </button>
                  </div>
                </div>

                <div className="assignments-list">
                  {classSections.map((section) => {
                    const sectionAssignments = filteredAssignments.filter(
                      (a) => a.sectionCode === section.code,
                    );
                    const isExpanded = expandedAssignmentSections[section.code];
                    const selectedSectionAssignmentCount =
                      sectionAssignments.filter((assignment) =>
                        selectedAssignmentIds.includes(assignment.id),
                      ).length;
                    const allSectionAssignmentsSelected =
                      sectionAssignments.length > 0 &&
                      selectedSectionAssignmentCount ===
                        sectionAssignments.length;

                    return (
                      <div
                        key={section.id}
                        className="section-assignment-group"
                      >
                        <div
                          className="section-group-header"
                          onClick={() => toggleAssignmentSection(section.code)}
                        >
                          <div className="group-info">
                            <FaLayerGroup />
                            <h4>{section.code}</h4>
                            <span className="count-tag">
                              {sectionAssignments.length} Assignments
                            </span>
                            {selectedSectionAssignmentCount > 0 && (
                              <span className="count-tag selected">
                                {selectedSectionAssignmentCount} Selected
                              </span>
                            )}
                          </div>
                          <div className="group-actions">
                            <button
                              type="button"
                              className="assignment-selection-btn secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSectionAssignmentSelection(section.code);
                              }}
                              disabled={sectionAssignments.length === 0}
                            >
                              {allSectionAssignmentsSelected
                                ? "Clear Section"
                                : "Select Section"}
                            </button>
                            <button
                              type="button"
                              className="action-btn add"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCreateAssignmentModal(section.id);
                              }}
                            >
                              Assign Subjects
                            </button>
                            <button
                              type="button"
                              className="action-btn auto-assign"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAutoGenerateSchedule(section);
                              }}
                            >
                              <FaMagic /> Auto-Assign
                            </button>
                            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="section-assignments-content">
                            {sectionAssignments.length > 0 ? (
                              sectionAssignments.map((assignment) => (
                                <div
                                  key={assignment.id}
                                  className={`assignment-card mini ${selectedAssignmentIds.includes(assignment.id) ? "selected" : ""}`}
                                >
                                  <div className="assignment-header">
                                    <div className="assignment-header-main">
                                      <label className="assignment-card-check">
                                        <input
                                          type="checkbox"
                                          checked={selectedAssignmentIds.includes(
                                            assignment.id,
                                          )}
                                          onChange={() =>
                                            toggleAssignmentSelection(
                                              assignment.id,
                                            )
                                          }
                                        />
                                        <span>Select</span>
                                      </label>
                                      <h5>
                                        {assignment.subjectCode} -{" "}
                                        {assignment.subjectName}
                                      </h5>
                                    </div>
                                    <div className="mini-actions">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openEditAssignmentModal(assignment)
                                        }
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveAssignment(assignment.id)
                                        }
                                      >
                                        <FaTrash /> Delete
                                      </button>
                                    </div>
                                  </div>
                                  <div className="assignment-details-grid">
                                    <p>
                                      <strong>Instructor:</strong>{" "}
                                      {assignment.instructorName}
                                    </p>
                                    <p>
                                      <strong>Schedule:</strong>{" "}
                                      {assignment.schedule.length > 0
                                        ? assignment.schedule
                                            .map(
                                              (s) =>
                                                `${s.day} ${s.startTime}-${s.endTime} (${s.room})`,
                                            )
                                            .join(", ")
                                        : "To be announced"}
                                    </p>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="empty-assignment">
                                <p>No schedules assigned to this section.</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals remain the same as original */}
      {selectedRequest && (
        <div className="review-modal-overlay" role="dialog">
          <div className="review-modal application-review-modal">
            <div className="review-modal-header application-review-header">
              <div>
                <h2>Application Review</h2>
                <p>
                  {selectedRequest.fullName} •{" "}
                  {isEnrollmentRequest(selectedRequest)
                    ? selectedRequest.studentNumber
                    : selectedRequest.studentNumber ||
                      selectedRequest.trackingNumber}
                </p>
              </div>
              <button className="review-modal-close" onClick={closeReviewModal}>
                ✕
              </button>
            </div>
            <div className="review-modal-body">
              <div className="personal-information-section">
                <h3>Request Information</h3>
                <div className="personal-information-card">
                  <div className="personal-info-grid">
                    {isEnrollmentRequest(selectedRequest) ? (
                      <>
                        <div className="personal-info-item">
                          <span>Student Number</span>
                          <strong>{selectedRequest.studentNumber}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Program</span>
                          <strong>{selectedRequest.program}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Full Name</span>
                          <strong>{selectedRequest.fullName}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Current Level</span>
                          <strong>{selectedRequest.currentYearLevel}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Requested Level</span>
                          <strong>
                            {selectedRequest.program === "SHS" &&
                            selectedRequest.requestedYearLevel === "College"
                              ? "1st Year College"
                              : selectedRequest.requestedYearLevel}
                          </strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Academic Year</span>
                          <strong>{selectedRequest.academicYear}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Semester</span>
                          <strong>{selectedRequest.semester}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Request Date</span>
                          <strong>{selectedRequest.requestDate}</strong>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="personal-info-item">
                          <span>Student Number</span>
                          <strong>
                            {selectedRequest.studentNumber ||
                              "Pending upon approval"}
                          </strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Program</span>
                          <strong>{selectedRequest.program}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Full Name</span>
                          <strong>{selectedRequest.fullName}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Semester</span>
                          <strong>{reflectedSemester}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Submitted Date</span>
                          <strong>{selectedRequest.applicationDate}</strong>
                        </div>
                        <div className="personal-info-item">
                          <span>Academic Year</span>
                          <strong>{reflectedAcademicYear}</strong>
                        </div>
                        {selectedRequest.program === "College" && (
                          <>
                            <div className="personal-info-item">
                              <span>Academic Honor</span>
                              <strong>{selectedAdmissionHonorLabel}</strong>
                            </div>
                            <div className="personal-info-item">
                              <span>Honor Certificate</span>
                              <strong>
                                {selectedAdmissionHonorCertificateStatus}
                              </strong>
                            </div>
                            <div className="personal-info-item">
                              <span>Scholarship Applied</span>
                              <strong>
                                {selectedAdmissionScholarshipStatus}
                              </strong>
                            </div>
                            <div className="personal-info-item">
                              <span>Scholarship Exam Score</span>
                              {selectedRequest.status === "Pending" ? (
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={pendingScholarshipScore}
                                  onChange={(event) =>
                                    setPendingScholarshipScore(
                                      event.target.value,
                                    )
                                  }
                                  placeholder={
                                    selectedRequest.appliedForScholarship
                                      ? "Enter exam score"
                                      : "Optional"
                                  }
                                />
                              ) : (
                                <strong>
                                  {typeof selectedRequest.scholarshipExamScore ===
                                  "number"
                                    ? selectedRequest.scholarshipExamScore
                                    : "Awaiting result"}
                                </strong>
                              )}
                            </div>
                            {selectedAdmissionTuition && (
                              <>
                                <div className="personal-info-item">
                                  <span>Estimated Tuition</span>
                                  <strong>
                                    {formatCurrency(
                                      selectedAdmissionTuition.baseTuition,
                                    )}
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>Honor Discount</span>
                                  <strong>
                                    {
                                      selectedAdmissionTuition.honorDiscountPercentage
                                    }
                                    % (
                                    {formatCurrency(
                                      selectedAdmissionTuition.honorDiscountAmount,
                                    )}
                                    )
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>Tuition After Discount</span>
                                  <strong>
                                    {formatCurrency(
                                      selectedAdmissionTuition.tuitionAfterHonorDiscount,
                                    )}
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>On-Site Payment</span>
                                  <strong>
                                    {formatCurrency(
                                      selectedAdmissionTuition.onSitePayment,
                                    )}
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>Estimated Remaining Balance</span>
                                  <strong>
                                    {formatCurrency(
                                      selectedAdmissionTuition.remainingBalance,
                                    )}
                                  </strong>
                                </div>
                                <div className="personal-info-item">
                                  <span>Scholarship Tuition Status</span>
                                  <strong>
                                    {selectedAdmissionScholarshipTuitionStatus}
                                  </strong>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="requirements-section">
                <h3>Document Requirements</h3>
                {(() => {
                  const enrollmentRequest =
                    isEnrollmentRequest(selectedRequest);
                  const requirementItems =
                    getReviewRequirementItems(selectedRequest);
                  const admissionAttachmentsByName = enrollmentRequest
                    ? null
                    : new Map(
                        (selectedRequest.attachments ?? []).map(
                          (attachment) => [
                            attachment.name.trim().toLowerCase(),
                            attachment,
                          ],
                        ),
                      );
                  const requirementReviewItems = requirementItems.map(
                    (item, index) => {
                      const attachment = enrollmentRequest
                        ? selectedRequest.attachments?.[index]
                        : admissionAttachmentsByName?.get(
                            item.name.trim().toLowerCase(),
                          );
                      const reviewStatus =
                        attachment?.reviewStatus ?? "Pending";
                      const isMockSubmitted =
                        !enrollmentRequest &&
                        !!attachment &&
                        selectedRequest.documentsSubmitted > 0 &&
                        (selectedRequest.attachments?.length ?? 0) ===
                          selectedRequest.documentsSubmitted;
                      const isSubmitted =
                        !!attachment &&
                        (attachment.url !== "#" || isMockSubmitted);

                      return {
                        item,
                        index,
                        attachment,
                        reviewStatus,
                        isSubmitted,
                      };
                    },
                  );
                  const pendingCount = requirementReviewItems.filter(
                    (reviewItem) =>
                      reviewItem.isSubmitted &&
                      reviewItem.reviewStatus === "Pending",
                  ).length;
                  const approvedCount = requirementReviewItems.filter(
                    (reviewItem) =>
                      reviewItem.isSubmitted &&
                      reviewItem.reviewStatus === "Approved",
                  ).length;
                  const redoCount = requirementReviewItems.filter(
                    (reviewItem) =>
                      reviewItem.isSubmitted &&
                      reviewItem.reviewStatus === "Rejected",
                  ).length;
                  return (
                    <>
                      {!enrollmentRequest &&
                        selectedRequest.documentsSubmitted === 0 && (
                          <div className="admission-review-note">
                            No requirements have been uploaded yet for this
                            applicant. You can still approve or reject the
                            admission below.
                          </div>
                        )}
                      <div className="requirement-stats-row">
                        <div className="requirement-stat pending">
                          <span>Pending review</span>
                          <strong>{pendingCount}</strong>
                        </div>
                        <div className="requirement-stat approved">
                          <span>Approved</span>
                          <strong>{approvedCount}</strong>
                        </div>
                        <div className="requirement-stat redo">
                          <span>Need Redo</span>
                          <strong>{redoCount}</strong>
                        </div>
                      </div>
                      <ul className="document-requirements-list">
                        {requirementReviewItems.map(
                          ({
                            item,
                            index,
                            attachment,
                            reviewStatus,
                            isSubmitted,
                          }) => {
                            return (
                              <li
                                key={item.key || item.name}
                                className={`document-requirement-card ${reviewStatus.toLowerCase()}`}
                              >
                                <div className="document-requirement-top">
                                  <div className="requirement-title">
                                    <p>{item.name}</p>
                                  </div>
                                  <div className="requirement-status-badge">
                                    {getStatusIcon(reviewStatus)}
                                    <span
                                      className={`status-text ${reviewStatus.toLowerCase()}`}
                                    >
                                      {reviewStatus}
                                    </span>
                                  </div>
                                </div>
                                <div className="document-requirement-actions">
                                  {isSubmitted && attachment?.url !== "#" ? (
                                    <button
                                      className="view-document-btn"
                                      onClick={() => {
                                        if (attachment) {
                                          setViewingAttachment(attachment);
                                        }
                                      }}
                                    >
                                      <FaEye /> View document
                                    </button>
                                  ) : isSubmitted ? (
                                    <span className="document-missing-label">
                                      <FaFileAlt /> Reference only
                                    </span>
                                  ) : (
                                    <span className="document-missing-label">
                                      <FaFileAlt /> No file submitted yet
                                    </span>
                                  )}
                                  <div className="requirement-action-buttons">
                                    <button
                                      className="requirement-action pass"
                                      onClick={() =>
                                        handleAttachmentStatusUpdate(
                                          selectedRequest.id,
                                          index,
                                          "Approved",
                                        )
                                      }
                                      disabled={
                                        !isSubmitted ||
                                        reviewStatus === "Approved"
                                      }
                                    >
                                      <FaThumbsUp /> Pass
                                    </button>
                                    <button
                                      className="requirement-action redo"
                                      onClick={() =>
                                        handleAttachmentStatusUpdate(
                                          selectedRequest.id,
                                          index,
                                          "Rejected",
                                        )
                                      }
                                      disabled={
                                        !isSubmitted ||
                                        reviewStatus === "Rejected"
                                      }
                                    >
                                      <FaRedoAlt /> Need Redo
                                    </button>
                                  </div>
                                </div>
                              </li>
                            );
                          },
                        )}
                      </ul>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="review-modal-footer">
              {((isEnrollmentRequest(selectedRequest) &&
                selectedRequest.enrollmentStatus === "Pending") ||
                (!isEnrollmentRequest(selectedRequest) &&
                  selectedRequest.status === "Pending")) && (
                <>
                  <button
                    className="action-btn approve"
                    onClick={() => {
                      if (handleApproveRequest(selectedRequest)) {
                        closeReviewModal();
                      }
                    }}
                  >
                    {isEnrollmentRequest(selectedRequest)
                      ? "Approve Request"
                      : "Approve Admission"}
                  </button>
                  <button
                    className="action-btn reject"
                    onClick={() => {
                      closeReviewModal();
                      handleRejectRequest(selectedRequest.id);
                    }}
                  >
                    {isEnrollmentRequest(selectedRequest)
                      ? "Reject Request"
                      : "Reject Admission"}
                  </button>
                </>
              )}
              <button className="action-btn cancel" onClick={closeReviewModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isConfirmModalOpen && selectedAction && (
        <div className="review-modal-overlay" role="dialog">
          <div className="review-modal confirmation-modal">
            <div className="review-modal-header">
              <h2>
                Confirm{" "}
                {selectedAction.action === "approve" ? "Approval" : "Rejection"}
              </h2>
              <button
                className="review-modal-close"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setSelectedAction(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className="review-modal-body">
              <p>
                Are you sure you want to {selectedAction.action} this{" "}
                {selectedAdmissionActionRecord &&
                !selectedEnrollmentActionRecord
                  ? "admission application"
                  : "enrollment request"}
                ?
              </p>
              {selectedAction.action === "approve" && (
                <p className="confirmation-note">
                  {selectedAdmissionActionRecord &&
                  !selectedEnrollmentActionRecord
                    ? selectedAdmissionActionRecord.documentsSubmitted <
                      selectedAdmissionActionRecord.totalDocuments
                      ? "Approval is allowed even with pending admission credentials. The student account will be activated and the remaining credential status will still appear in the student portal."
                      : "This will activate the student account and make the approved admission visible in the student portal."
                    : "This will progress the student to the next academic level and generate new enrollment records."}
                </p>
              )}
              {selectedAction.action === "reject" && (
                <p className="confirmation-note warning">
                  The student will be notified of this decision and may need to
                  reapply.
                </p>
              )}
            </div>
            <div className="review-modal-footer">
              <button
                className="action-btn cancel"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setSelectedAction(null);
                }}
              >
                Cancel
              </button>
              <button
                className={`action-btn ${selectedAction.action === "approve" ? "approve" : "reject"}`}
                onClick={confirmAction}
              >
                Yes,{" "}
                {selectedAction.action === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingAttachment && (
        <div className="attachment-viewer-overlay">
          <div className="attachment-viewer">
            <div className="attachment-viewer-header">
              <h3>{viewingAttachment.name}</h3>
              <button
                className="attachment-viewer-close"
                onClick={() => setViewingAttachment(null)}
              >
                ✕
              </button>
            </div>
            <div className="attachment-viewer-content">
              {viewingAttachment.type === "image" ||
              viewingAttachment.url?.includes("placeholder") ? (
                <img src={viewingAttachment.url} alt={viewingAttachment.name} />
              ) : (
                <div className="attachment-placeholder">
                  <FaFileAlt size={48} />
                  <p>{viewingAttachment.name}</p>
                  <a
                    href={viewingAttachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="download-link"
                  >
                    <FaDownload /> Download Document
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showSectionManager && (
        <div className="section-manager-overlay">
          <div className="section-manager-modal">
            <div className="modal-header">
              <h2>Class Section Manager</h2>
              <button
                className="modal-close"
                onClick={() => setShowSectionManager(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {pendingAssignments.length > 0 && (
                <div className="pending-alert">
                  <FaExclamationTriangle />
                  <div>
                    <strong>
                      {pendingAssignments.length} student(s) need section
                      assignment
                    </strong>
                    <p>
                      These students have been approved but not yet assigned to
                      a class section.
                    </p>
                  </div>
                  <button
                    className="action-btn auto-assign"
                    onClick={handleAutoAssignAll}
                  >
                    Assign Now
                  </button>
                </div>
              )}
              {/* Add Section Form */}
              <div className="add-section-form">
                <h3>Add New Section</h3>
                <div className="add-section-form-row">
                  <select
                    value={newSection.program}
                    onChange={(e) => {
                      const program = e.target.value;
                      setNewSection({
                        ...newSection,
                        program,
                        yearLevel: program === "SHS" ? "Grade 11" : "1st Year",
                        strand:
                          program === "SHS" ? "ICT" : DEFAULT_COLLEGE_COURSE,
                      });
                    }}
                  >
                    <option value="College">College</option>
                    <option value="SHS">SHS</option>
                  </select>
                  <select
                    value={newSection.yearLevel}
                    onChange={(e) =>
                      setNewSection({
                        ...newSection,
                        yearLevel: e.target.value,
                      })
                    }
                  >
                    {newSection.program === "SHS" ? (
                      <>
                        <option value="Grade 11">Grade 11</option>
                        <option value="Grade 12">Grade 12</option>
                      </>
                    ) : (
                      <>
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                        <option value="4th Year">4th Year</option>
                      </>
                    )}
                  </select>
                  {newSection.program === "SHS" && (
                    <select
                      value={newSection.strand}
                      onChange={(e) =>
                        setNewSection({ ...newSection, strand: e.target.value })
                      }
                    >
                      <option value="ICT">ICT</option>
                      <option value="GAS">GAS</option>
                      <option value="HUMSS">HUMSS</option>
                      <option value="ABM">ABM</option>
                      <option value="STEM">STEM</option>
                    </select>
                  )}
                  {newSection.program === "College" && (
                    <select
                      value={newSection.strand}
                      onChange={(e) =>
                        setNewSection({ ...newSection, strand: e.target.value })
                      }
                    >
                      <option value={DEFAULT_COLLEGE_COURSE}>
                        BS Entrepreneurship
                      </option>
                    </select>
                  )}
                  <input
                    type="text"
                    placeholder="Section (e.g., A)"
                    value={newSection.section}
                    onChange={(e) =>
                      setNewSection({ ...newSection, section: e.target.value })
                    }
                  />
                  <input
                    type="number"
                    placeholder="Max Capacity"
                    value={newSection.maxCapacity}
                    onChange={(e) =>
                      setNewSection({
                        ...newSection,
                        maxCapacity: parseInt(e.target.value),
                      })
                    }
                  />
                  <button
                    className="action-btn add"
                    onClick={() => {
                      const courseAbbrev =
                        newSection.program === "SHS"
                          ? newSection.strand
                          : "BSE";
                      const code = `${courseAbbrev}${newSection.yearLevel.replace(" ", "").slice(0, 1)}${newSection.section}`;
                      const newSec: ClassSection = {
                        id: `new_${Date.now()}`,
                        code,
                        program: newSection.program,
                        yearLevel: newSection.yearLevel,
                        strand: newSection.strand,
                        section: newSection.section,
                        currentEnrollees: 0,
                        maxCapacity: newSection.maxCapacity,
                        enrolleeIds: [],
                      };
                      setClassSections((prev) => [...prev, newSec]);
                      setNewSection({
                        program: "College",
                        yearLevel: "1st Year",
                        strand: DEFAULT_COLLEGE_COURSE,
                        section: "A",
                        maxCapacity: 30,
                      });
                      addToast(`Section ${code} added`, "success");
                    }}
                  >
                    Add Section
                  </button>
                </div>
              </div>
              <div className="sections-grid">
                {classSections.map((section) => (
                  <div
                    key={section.id}
                    className={`section-card ${section.currentEnrollees >= section.maxCapacity ? "full" : ""}`}
                  >
                    <div className="section-header">
                      <h3>{section.code}</h3>
                      <span
                        className={`section-status ${section.currentEnrollees >= section.maxCapacity ? "full" : "available"}`}
                      >
                        {section.currentEnrollees >= section.maxCapacity
                          ? "Full"
                          : "Available"}
                      </span>
                    </div>
                    <div className="section-details">
                      <p>
                        <strong>Program:</strong> {section.program}
                      </p>
                      <p>
                        <strong>Year:</strong> {section.yearLevel}
                      </p>
                      {section.strand && (
                        <p>
                          <strong>Strand:</strong> {section.strand}
                        </p>
                      )}
                      <p>
                        <strong>Section:</strong> {section.section}
                      </p>
                    </div>
                    <div className="capacity-container">
                      <div className="capacity-bar">
                        <div
                          className="capacity-fill"
                          style={{
                            width: `${(section.currentEnrollees / section.maxCapacity) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="capacity-text">
                        {section.currentEnrollees}/{section.maxCapacity}{" "}
                        students
                      </span>
                    </div>
                    <div className="section-actions">
                      <button
                        className="action-btn view"
                        onClick={() => viewSectionStudents(section)}
                      >
                        <FaEye /> View ({section.currentEnrollees})
                      </button>
                      <button className="action-btn edit">Edit</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="manual-assignment">
                <h3>Manual Assignment</h3>
                <div className="assignment-controls">
                  <select
                    className="student-select"
                    id="studentSelect"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select Student
                    </option>
                    {pendingAssignments.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.fullName} -{" "}
                        {student.studentNumber || student.trackingNumber}
                      </option>
                    ))}
                  </select>
                  <select
                    className="section-select"
                    id="sectionSelect"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select Section
                    </option>
                    {classSections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.code} ({section.currentEnrollees}/
                        {section.maxCapacity})
                      </option>
                    ))}
                  </select>
                  <button
                    className="action-btn assign"
                    onClick={() => {
                      const studentSelect = document.getElementById(
                        "studentSelect",
                      ) as HTMLSelectElement;
                      const sectionSelect = document.getElementById(
                        "sectionSelect",
                      ) as HTMLSelectElement;
                      if (studentSelect.value && sectionSelect.value) {
                        handleAssignToSection(
                          studentSelect.value,
                          sectionSelect.value,
                        );
                        studentSelect.value = "";
                        sectionSelect.value = "";
                      }
                    }}
                  >
                    <FaUserPlus /> Assign
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="action-btn cancel"
                onClick={() => setShowSectionManager(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showSectionStudents && selectedSection && (
        <div className="section-students-overlay">
          <div className="section-students-modal">
            <div className="modal-header">
              <h2>{selectedSection.code} - Students</h2>
              <button
                className="modal-close"
                onClick={() => setShowSectionStudents(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {selectedSection.enrolleeIds.length > 0 ? (
                <table className="students-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Student Number</th>
                      <th>Program</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSection.enrolleeIds.map((id) => {
                      const student = enrollees.find((e) => e.id === id);
                      return student ? (
                        <tr key={id}>
                          <td>{student.fullName}</td>
                          <td>{student.studentNumber || "Pending"}</td>
                          <td>{student.program}</td>
                        </tr>
                      ) : null;
                    })}
                  </tbody>
                </table>
              ) : (
                <p>No students assigned to this section yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Subject Modal */}
      {showSubjectModal && (
        <div className="review-modal-overlay" role="dialog">
          <div className="review-modal">
            <div className="review-modal-header">
              <h2>{editingSubject ? "Edit Subject" : "Add New Subject"}</h2>
              <button
                className="review-modal-close"
                onClick={() => {
                  setShowSubjectModal(false);
                  setEditingSubject(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className="review-modal-body">
              <form>
                <div className="form-group">
                  <label>Subject Code</label>
                  <input
                    type="text"
                    defaultValue={editingSubject?.code || ""}
                  />
                </div>
                <div className="form-group">
                  <label>Subject Name</label>
                  <input
                    type="text"
                    defaultValue={editingSubject?.name || ""}
                  />
                </div>
                <div className="form-group">
                  <label>Program</label>
                  <select defaultValue={editingSubject?.program || "College"}>
                    <option value="College">College</option>
                    <option value="SHS">SHS</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Year Level</label>
                  <select
                    defaultValue={editingSubject?.yearLevel || "1st Year"}
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                    <option value="Grade 11">Grade 11</option>
                    <option value="Grade 12">Grade 12</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Semester</label>
                  <select
                    defaultValue={editingSubject?.semester || "1st Semester"}
                  >
                    <option value="1st Semester">1st Semester</option>
                    <option value="2nd Semester">2nd Semester</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Units (College only)</label>
                  <input
                    type="number"
                    defaultValue={editingSubject?.units || 3}
                  />
                </div>
                <div className="form-group">
                  <label>Strand (SHS only)</label>
                  <select defaultValue={editingSubject?.strand || "All"}>
                    <option value="All">All</option>
                    <option value="ICT">ICT</option>
                    <option value="GAS">GAS</option>
                    <option value="HUMSS">HUMSS</option>
                    <option value="ABM">ABM</option>
                    <option value="STEM">STEM</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select
                    defaultValue={editingSubject?.isMinor ? "minor" : "major"}
                  >
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                  </select>
                </div>
              </form>
            </div>
            <div className="review-modal-footer">
              <button
                className="action-btn cancel"
                onClick={() => {
                  setShowSubjectModal(false);
                  setEditingSubject(null);
                }}
              >
                Cancel
              </button>
              <button
                className="action-btn approve"
                onClick={() => addToast("Subject saved", "success")}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructor Modal */}
      {showInstructorModal && (
        <div className="review-modal-overlay" role="dialog">
          <div className="review-modal">
            <div className="review-modal-header">
              <h2>
                {editingInstructor ? "Edit Instructor" : "Add New Instructor"}
              </h2>
              <button
                className="review-modal-close"
                onClick={() => {
                  setShowInstructorModal(false);
                  setEditingInstructor(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className="review-modal-body">
              <form>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    defaultValue={editingInstructor?.name || ""}
                  />
                </div>
                <div className="form-group">
                  <label>Employee ID</label>
                  <input
                    type="text"
                    defaultValue={editingInstructor?.employeeId || ""}
                  />
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <input
                    type="text"
                    defaultValue={editingInstructor?.department || ""}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    defaultValue={editingInstructor?.email || ""}
                  />
                </div>
                <div className="form-group">
                  <label>Contact Number</label>
                  <input
                    type="text"
                    defaultValue={editingInstructor?.contactNumber || ""}
                  />
                </div>
              </form>
            </div>
            <div className="review-modal-footer">
              <button
                className="action-btn cancel"
                onClick={() => {
                  setShowInstructorModal(false);
                  setEditingInstructor(null);
                }}
              >
                Cancel
              </button>
              <button
                className="action-btn approve"
                onClick={() => addToast("Instructor saved", "success")}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {showAssignmentModal && (
        <div
          className="review-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assignment-modal-title"
        >
          <div className="review-modal assignment-config-modal">
            <div className="review-modal-header">
              <div className="assignment-modal-heading">
                <h2 id="assignment-modal-title">
                  {editingAssignment
                    ? "Edit Assignment"
                    : "Assign Subjects to Section"}
                </h2>
                <p>
                  Review the section, choose the subjects that should appear in
                  the class assignment list, and add instructor or schedule
                  details when they are ready.
                </p>
              </div>
              <button
                type="button"
                className="review-modal-close"
                onClick={closeAssignmentModal}
              >
                x
              </button>
            </div>
            <div className="review-modal-body">
              <form
                id="assignment-config-form"
                className="assignment-config-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSaveAssignment();
                }}
              >
                <div className="assignment-modal-summary">
                  <div className="assignment-summary-card">
                    <span>Section</span>
                    <strong>
                      {selectedAssignmentSection
                        ? selectedAssignmentSection.code
                        : "Choose a section"}
                    </strong>
                  </div>
                  <div className="assignment-summary-card">
                    <span>Available</span>
                    <strong>
                      {availableAssignmentSubjects.length} subject
                      {availableAssignmentSubjects.length === 1 ? "" : "s"}
                    </strong>
                  </div>
                  <div
                    className={`assignment-summary-card ${assignmentForm.subjectIds.length === 0 ? "danger" : ""}`}
                  >
                    <span>Selected</span>
                    <strong>
                      {assignmentForm.subjectIds.length} subject
                      {assignmentForm.subjectIds.length === 1 ? "" : "s"}
                    </strong>
                  </div>
                  <div className="assignment-summary-card">
                    <span>Semester</span>
                    <strong>{assignmentForm.semester}</strong>
                  </div>
                </div>

                <div className="assignment-form-grid">
                  <div className="form-group">
                    <label>Section</label>
                    <select
                      value={assignmentForm.sectionId}
                      onChange={(e) =>
                        updateAssignmentFormContext("sectionId", e.target.value)
                      }
                    >
                      <option value="">Select section</option>
                      {classSections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.code} - {section.program} {section.yearLevel}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Semester</label>
                    <select
                      value={assignmentForm.semester}
                      onChange={(e) =>
                        updateAssignmentFormContext("semester", e.target.value)
                      }
                    >
                      <option value="1st Semester">1st Semester</option>
                      <option value="2nd Semester">2nd Semester</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Instructor</label>
                    <select
                      value={assignmentForm.instructorId}
                      onChange={(e) =>
                        setAssignmentForm((prev) => ({
                          ...prev,
                          instructorId: e.target.value,
                        }))
                      }
                    >
                      <option value="">To be assigned later</option>
                      {instructors.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Academic Year</label>
                    <input
                      type="text"
                      value={assignmentForm.academicYear}
                      onChange={(e) =>
                        setAssignmentForm((prev) => ({
                          ...prev,
                          academicYear: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="form-group">
                  <div className="assignment-subject-picker-header">
                    <div>
                      <label>Subjects</label>
                      <p className="assignment-helper-text">
                        {selectedAssignmentSection
                          ? `${selectedAssignmentSection.code} has ${availableAssignmentSubjects.length} available subject${availableAssignmentSubjects.length === 1 ? "" : "s"} for ${assignmentForm.semester}.`
                          : "Choose a section first to load the matching strand/course subjects."}
                      </p>
                    </div>
                    {!editingAssignment &&
                      availableAssignmentSubjects.length > 0 && (
                        <div className="assignment-selection-actions">
                          <button
                            type="button"
                            className="assignment-selection-btn"
                            onClick={selectAllAssignmentSubjects}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            className="assignment-selection-btn secondary"
                            onClick={clearAssignmentSubjects}
                          >
                            Clear
                          </button>
                        </div>
                      )}
                  </div>
                  <div className="assignment-subject-selector">
                    {availableAssignmentSubjects.length > 0 ? (
                      availableAssignmentSubjects.map((subject) => {
                        const isSelected = assignmentForm.subjectIds.includes(
                          subject.id,
                        );

                        return (
                          <label
                            key={subject.id}
                            className={`assignment-subject-option ${isSelected ? "selected" : ""}`}
                          >
                            <input
                              type={editingAssignment ? "radio" : "checkbox"}
                              name="assignment-subjects"
                              checked={isSelected}
                              onChange={() =>
                                toggleAssignmentSubjectSelection(subject.id)
                              }
                            />
                            <div>
                              <strong>
                                {subject.code} - {subject.name}
                              </strong>
                              <span>
                                {subject.isMinor ? "Minor" : "Major"}
                                {subject.units
                                  ? ` | ${subject.units} units`
                                  : ""}
                              </span>
                            </div>
                          </label>
                        );
                      })
                    ) : (
                      <div className="assignment-subject-empty">
                        No unassigned subjects are available for this
                        section/semester yet.
                      </div>
                    )}
                  </div>
                </div>
                <div className="assignment-schedule-panel">
                  <div className="assignment-schedule-heading">
                    <label>Schedule (Optional)</label>
                    <span></span>
                  </div>
                  <div className="schedule-inputs">
                    <input
                      type="text"
                      placeholder="Day"
                      value={assignmentForm.scheduleDay}
                      onChange={(e) =>
                        setAssignmentForm((prev) => ({
                          ...prev,
                          scheduleDay: e.target.value,
                        }))
                      }
                    />
                    <input
                      type="time"
                      placeholder="Start Time"
                      value={assignmentForm.startTime}
                      onChange={(e) =>
                        setAssignmentForm((prev) => ({
                          ...prev,
                          startTime: e.target.value,
                        }))
                      }
                    />
                    <input
                      type="time"
                      placeholder="End Time"
                      value={assignmentForm.endTime}
                      onChange={(e) =>
                        setAssignmentForm((prev) => ({
                          ...prev,
                          endTime: e.target.value,
                        }))
                      }
                    />
                    <input
                      type="text"
                      placeholder="Room"
                      value={assignmentForm.room}
                      onChange={(e) =>
                        setAssignmentForm((prev) => ({
                          ...prev,
                          room: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </form>
            </div>
            <div className="review-modal-footer">
              <button
                type="button"
                className="action-btn cancel"
                onClick={closeAssignmentModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="assignment-config-form"
                className="action-btn approve"
              >
                {editingAssignment ? "Save Changes" : "Save Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignmentDeleteModal && (
        <div
          className="review-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assignment-delete-title"
        >
          <div className="review-modal confirmation-modal assignment-delete-modal">
            <div className="review-modal-header">
              <h2 id="assignment-delete-title">Delete Assignments</h2>
              <button
                type="button"
                className="review-modal-close"
                onClick={closeAssignmentDeleteModal}
              >
                x
              </button>
            </div>
            <div className="review-modal-body">
              <div className="assignment-delete-summary">
                <strong>
                  {pendingAssignmentDeleteTargets.length} assignment
                  {pendingAssignmentDeleteTargets.length === 1 ? "" : "s"} ready
                  for deletion
                </strong>
                <p>Remove the selected class assignments from this list.</p>
              </div>

              <div className="assignment-delete-list">
                {pendingAssignmentDeleteTargets.map((assignment) => (
                  <div key={assignment.id} className="assignment-delete-item">
                    <strong>
                      {assignment.subjectCode} - {assignment.subjectName}
                    </strong>
                    <span>
                      {assignment.sectionCode} | {assignment.semester} |{" "}
                      {assignment.instructorName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="review-modal-footer">
              <button
                type="button"
                className="action-btn cancel"
                onClick={closeAssignmentDeleteModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="action-btn delete"
                onClick={handleConfirmAssignmentDelete}
              >
                <FaTrash /> Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
