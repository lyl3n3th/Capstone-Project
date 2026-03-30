import { useEffect, useState } from "react";
import { FaUserPlus, FaUserGraduate, FaArrowRight } from "react-icons/fa";
import AdminSidebar from "../../components/admin/AdminSidebar";
import { ToastContainer } from "../../components/common/Toast";
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
  fullName: string;
  program: string;
  yearLevel: string;
  applicationDate: string;
  documentsSubmitted: number;
  totalDocuments: number;
  status: "Pending" | "Approved";
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
}

interface ApiEnrollee {
  id: number;
  enrollee_code: string;
  tracking_number: string;
  full_name: string;
  program: string;
  year_level: string;
  application_date: string;
  documents_submitted: number;
  total_documents: number;
  status: Enrollee["status"];
  birth_date?: string | null;
  contact_number?: string | null;
  guardian_name?: string | null;
  email?: string | null;
  address?: string | null;
  guardian_contact?: string | null;
  attachments?: Attachment[];
  personalInfo?: PersonalInformation;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const ENROLLEES_API_URL = `${API_BASE_URL}/api/enrollees/`;

export default function AdminEnrollees({
  onLogout,
  loggedInUsername,
  loggedInRole = "Admin",
  canAccessBackup = true,
}: EnrolleesProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"admissions" | "enrollments">(
    "admissions",
  );
  const [selectedEnrolleeId, setSelectedEnrolleeId] = useState<string | null>(
    null,
  );
  const [selectedRequest, setSelectedRequest] =
    useState<EnrollmentRequest | null>(null);
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
  } | null>(null);

  const requirementItems = [
    "Form 137",
    "Diploma/Certificate of Graduation",
    "Birth Certificate/PSA",
    "Good Moral Character",
  ];

  const [enrollees, setEnrollees] = useState<Enrollee[]>([]);

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

  // Load enrollment requests (students applying for next year)
  const loadEnrollmentRequests = async () => {
    setIsLoading(true);
    try {
      // Replace with actual API call
      const mockEnrollmentRequests: EnrollmentRequest[] = [
        {
          id: "ER001",
          studentNumber: "20220001",
          fullName: "Maria Santos",
          program: "SHS",
          currentYearLevel: "Grade 11",
          requestedYearLevel: "Grade 12",
          academicYear: "2026-2027",
          semester: "1st Semester",
          enrollmentStatus: "Pending",
          requestDate: "2026-03-15",
          notes: "Grade 11 completer, all requirements submitted",
        },
        {
          id: "ER002",
          studentNumber: "20220002",
          fullName: "Juan Dela Cruz",
          program: "College",
          currentYearLevel: "3rd Year",
          requestedYearLevel: "4th Year",
          academicYear: "2026-2027",
          semester: "1st Semester",
          enrollmentStatus: "Pending",
          requestDate: "2026-03-14",
          notes: "Good academic standing",
        },
        {
          id: "ER003",
          studentNumber: "20220003",
          fullName: "Ana Reyes",
          program: "SHS",
          currentYearLevel: "Grade 12",
          requestedYearLevel: "College",
          academicYear: "2026-2027",
          semester: "1st Semester",
          enrollmentStatus: "Approved",
          requestDate: "2026-03-10",
          enrollmentDate: "2026-03-12",
          notes: "Graduating with honors",
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

  const mapApiEnrolleeToUi = (apiEnrollee: ApiEnrollee): Enrollee => ({
    recordId: apiEnrollee.id,
    id: apiEnrollee.enrollee_code,
    trackingNumber: apiEnrollee.tracking_number,
    fullName: apiEnrollee.full_name,
    program: apiEnrollee.program,
    yearLevel: apiEnrollee.year_level,
    applicationDate: apiEnrollee.application_date,
    documentsSubmitted: apiEnrollee.documents_submitted,
    totalDocuments: apiEnrollee.total_documents,
    status: apiEnrollee.status,
    personalInfo: apiEnrollee.personalInfo || {
      fullName: apiEnrollee.full_name,
      birthDate: apiEnrollee.birth_date || "",
      contactNumber: apiEnrollee.contact_number || "",
      program: apiEnrollee.program,
      guardianName: apiEnrollee.guardian_name || "",
      email: apiEnrollee.email || "",
      address: apiEnrollee.address || "",
      yearLevel: apiEnrollee.year_level,
      guardianContact: apiEnrollee.guardian_contact || "",
    },
    attachments: Array.isArray(apiEnrollee.attachments)
      ? apiEnrollee.attachments
      : [],
  });

  const loadEnrollees = async () => {
    setIsLoading(true);

    try {
      const fetchedEnrollees: ApiEnrollee[] = [];
      let nextPageUrl: string | null = ENROLLEES_API_URL;

      while (nextPageUrl) {
        const response = await fetch(nextPageUrl);

        if (!response.ok) {
          throw new Error("Failed to load enrollees from backend.");
        }

        const payload = await response.json();

        if (Array.isArray(payload)) {
          fetchedEnrollees.push(...payload);
          nextPageUrl = null;
        } else {
          const results = Array.isArray(payload.results) ? payload.results : [];
          fetchedEnrollees.push(...results);
          nextPageUrl =
            typeof payload.next === "string" && payload.next
              ? payload.next
              : null;
        }
      }

      setEnrollees(fetchedEnrollees.map(mapApiEnrolleeToUi));
    } catch (error) {
      console.error("Failed to fetch enrollees", error);
      addToast(
        "Unable to load enrollees from backend. Please check if backend is running.",
        "error",
      );
      setEnrollees([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEnrollees();
    loadEnrollmentRequests();
  }, []);

  const closeMenuOnMobile = () => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const selectedEnrollee = selectedEnrolleeId
    ? (enrollees.find((enrollee) => enrollee.id === selectedEnrolleeId) ?? null)
    : null;

  const handleAttachmentStatusUpdate = async (
    enrolleeId: string,
    attachmentIndex: number,
    status: Attachment["reviewStatus"],
  ) => {
    if (!status) return;

    const enrollee = enrollees.find((entry) => entry.id === enrolleeId);
    if (!enrollee?.recordId) {
      addToast(
        "Unable to update this enrollee because it is not linked to backend.",
        "error",
      );
      return;
    }

    const updatedAttachments = (enrollee.attachments ?? []).map(
      (attachment, index) =>
        index === attachmentIndex
          ? { ...attachment, reviewStatus: status }
          : attachment,
    );

    const allRequirementsApproved =
      updatedAttachments.length >= requirementItems.length &&
      updatedAttachments
        .slice(0, requirementItems.length)
        .every((attachment) => attachment.reviewStatus === "Approved");

    const nextStatus: Enrollee["status"] = allRequirementsApproved
      ? "Approved"
      : "Pending";

    try {
      const response = await fetch(
        `${ENROLLEES_API_URL}${enrollee.recordId}/`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            attachments: updatedAttachments,
            status: nextStatus,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData?.detail || "Failed to update enrollee review status.",
        );
      }

      await loadEnrollees();
      addToast(
        `Requirement ${status === "Approved" ? "approved" : "marked for redo"} successfully!`,
        "success",
      );
    } catch (error) {
      console.error("Failed to update enrollee", error);
      addToast(
        error instanceof Error
          ? error.message
          : "Unable to save review changes.",
        "error",
      );
    }
  };

  const handleReviewRequirements = (enrollee: Enrollee) => {
    setSelectedEnrolleeId(enrollee.id);
  };

  const closeReviewModal = () => {
    setSelectedEnrolleeId(null);
    setViewingAttachment(null);
  };

  // Handle enrollment request actions
  const handleApproveRequest = (requestId: string) => {
    setSelectedAction({ id: requestId, action: "approve" });
    setIsConfirmModalOpen(true);
  };

  const handleRejectRequest = (requestId: string) => {
    setSelectedAction({ id: requestId, action: "reject" });
    setIsConfirmModalOpen(true);
  };

  const confirmAction = async () => {
    if (!selectedAction) return;

    try {
      // Find the request to update
      const requestToUpdate = enrollmentRequests.find(
        (req) => req.id === selectedAction.id,
      );

      if (!requestToUpdate) {
        addToast("Request not found.", "error");
        setIsConfirmModalOpen(false);
        setSelectedAction(null);
        return;
      }

      // Create updated request
      const updatedRequest: EnrollmentRequest = {
        ...requestToUpdate,
        enrollmentStatus:
          selectedAction.action === "approve" ? "Approved" : "Rejected",
        enrollmentDate:
          selectedAction.action === "approve"
            ? new Date().toLocaleDateString()
            : undefined,
      };

      // Update the state by replacing the old request with the updated one
      setEnrollmentRequests((prevRequests) =>
        prevRequests.map((req) =>
          req.id === selectedAction.id ? updatedRequest : req,
        ),
      );

      addToast(
        `Enrollment request ${selectedAction.action === "approve" ? "approved" : "rejected"} successfully!`,
        "success",
      );
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

  const closeRequestModal = () => {
    setSelectedRequest(null);
  };

  // Filter enrollees
  const filteredEnrollees = enrollees.filter((enrollee) => {
    const matchesSearch =
      enrollee.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollee.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollee.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "All" || enrollee.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Filter enrollment requests
  const filteredRequests = enrollmentRequests.filter((request) => {
    const matchesSearch =
      request.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.studentNumber.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      enrollmentStatusFilter === "All" ||
      request.enrollmentStatus === enrollmentStatusFilter;

    return matchesSearch && matchesStatus;
  });

  // Counts for badges
  const pendingCount = enrollees.filter((e) => e.status === "Pending").length;
  const approvedCount = enrollees.filter((e) => e.status === "Approved").length;
  const pendingRequestsCount = enrollmentRequests.filter(
    (r) => r.enrollmentStatus === "Pending",
  ).length;
  const approvedRequestsCount = enrollmentRequests.filter(
    (r) => r.enrollmentStatus === "Approved",
  ).length;

  const selectedRequirements = selectedEnrollee
    ? requirementItems.map((item, index) => {
        const attachment = selectedEnrollee.attachments?.[index];
        const reviewStatus = attachment?.reviewStatus ?? "Pending";
        const isSubmitted = index < selectedEnrollee.documentsSubmitted;

        return {
          item,
          index,
          attachment,
          reviewStatus,
          isSubmitted,
        };
      })
    : [];

  const pendingRequirementCount = selectedRequirements.filter(
    (req) => req.reviewStatus === "Pending",
  ).length;
  const approvedRequirementCount = selectedRequirements.filter(
    (req) => req.reviewStatus === "Approved",
  ).length;
  const redoRequirementCount = selectedRequirements.filter(
    (req) => req.reviewStatus === "Rejected",
  ).length;

  const handleSidebarToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSidebarClose = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="dashboard-layout">
      {/* Toast Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* AdminSidebar Component */}
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
        className="menu-toggle"
        onClick={handleSidebarToggle}
        aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
      >
        {isSidebarOpen ? "✕" : "☰"}
      </button>

      {/* Main content */}
      <main className="enrollees-content">
        <header className="page-header">
          <h1>Enrollment Management</h1>
          <p>
            {isLoading
              ? "Loading data..."
              : "Manage new admissions and student enrollment requests for next academic year"}
          </p>
        </header>

        {/* Tabs */}
        <div className="enrollment-tabs">
          <button
            className={`tab-btn ${activeTab === "admissions" ? "active" : ""}`}
            onClick={() => setActiveTab("admissions")}
          >
            <FaUserPlus /> New Admissions
            {pendingCount > 0 && (
              <span className="tab-badge">{pendingCount}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === "enrollments" ? "active" : ""}`}
            onClick={() => setActiveTab("enrollments")}
          >
            <FaUserGraduate /> Enrollment Requests
            {pendingRequestsCount > 0 && (
              <span className="tab-badge">{pendingRequestsCount}</span>
            )}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="stats-cards">
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
          ) : (
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
          )}
        </div>

        {/* Search & Filter */}
        <div className="controls">
          <input
            type="text"
            placeholder={
              activeTab === "admissions"
                ? "Search by Name, ID, or Tracking Number..."
                : "Search by Name or Student Number..."
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {activeTab === "admissions" ? (
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
            </select>
          ) : (
            <select
              value={enrollmentStatusFilter}
              onChange={(e) =>
                setEnrollmentStatusFilter(
                  e.target.value as "All" | "Pending" | "Approved" | "Rejected",
                )
              }
              className="status-filter"
            >
              <option value="All">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          )}
        </div>

        {/* Admissions Table */}
        {activeTab === "admissions" && (
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
                      <td>{enrollee.yearLevel}</td>
                      <td>
                        {enrollee.documentsSubmitted}/{enrollee.totalDocuments}
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
        )}

        {/* Enrollment Requests Table */}
        {activeTab === "enrollments" && (
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
                          {request.requestedYearLevel}
                          <FaArrowRight className="next-icon" />
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
                          {request.enrollmentStatus === "Pending" && <></>}
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
        )}
      </main>

      {/* Review Modal */}
      {selectedEnrollee && (
        <div className="review-modal-overlay" role="dialog">
          <div className="review-modal application-review-modal">
            <div className="review-modal-header application-review-header">
              <div>
                <h2>Application Review</h2>
                <p>
                  {selectedEnrollee.personalInfo.fullName} •{" "}
                  {selectedEnrollee.trackingNumber}
                </p>
              </div>
              <button
                className="review-modal-close"
                onClick={closeReviewModal}
                aria-label="Close review modal"
              >
                ✕
              </button>
            </div>

            <div className="review-modal-body">
              <div className="personal-information-section">
                <h3>Personal Information</h3>
                <div className="personal-information-card">
                  <div className="personal-info-grid">
                    <div className="personal-info-item">
                      <span>Full Name</span>
                      <strong>{selectedEnrollee.personalInfo.fullName}</strong>
                    </div>
                    <div className="personal-info-item">
                      <span>Email</span>
                      <strong>{selectedEnrollee.personalInfo.email}</strong>
                    </div>
                    <div className="personal-info-item">
                      <span>Birth Date</span>
                      <strong>{selectedEnrollee.personalInfo.birthDate}</strong>
                    </div>
                    <div className="personal-info-item">
                      <span>Address</span>
                      <strong>{selectedEnrollee.personalInfo.address}</strong>
                    </div>
                    <div className="personal-info-item">
                      <span>Contact Number</span>
                      <strong>
                        {selectedEnrollee.personalInfo.contactNumber}
                      </strong>
                    </div>
                    <div className="personal-info-item">
                      <span>Year Level</span>
                      <strong>{selectedEnrollee.personalInfo.yearLevel}</strong>
                    </div>
                    <div className="personal-info-item">
                      <span>Program</span>
                      <strong>{selectedEnrollee.personalInfo.program}</strong>
                    </div>
                    <div className="personal-info-item">
                      <span>Guardian Contact</span>
                      <strong>
                        {selectedEnrollee.personalInfo.guardianContact}
                      </strong>
                    </div>
                    <div className="personal-info-item full-row">
                      <span>Guardian Name</span>
                      <strong>
                        {selectedEnrollee.personalInfo.guardianName}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="requirements-section">
                <h3>Document Requirements</h3>

                <div className="requirement-stats-row">
                  <div className="requirement-stat pending">
                    <span>Pending review</span>
                    <strong>{pendingRequirementCount}</strong>
                  </div>
                  <div className="requirement-stat approved">
                    <span>Approved</span>
                    <strong>{approvedRequirementCount}</strong>
                  </div>
                  <div className="requirement-stat redo">
                    <span>Need Redo</span>
                    <strong>{redoRequirementCount}</strong>
                  </div>
                </div>

                <ul className="document-requirements-list">
                  {selectedRequirements.map((requirement) => (
                    <li
                      key={requirement.item}
                      className={`document-requirement-card ${requirement.reviewStatus.toLowerCase()}`}
                    >
                      <div className="document-requirement-top">
                        <p>{requirement.item}</p>
                        {requirement.reviewStatus === "Approved" && (
                          <span className="verified-pill">Verified</span>
                        )}
                      </div>

                      <div className="document-requirement-actions">
                        {requirement.attachment ? (
                          <button
                            className="view-document-btn"
                            onClick={() =>
                              setViewingAttachment(
                                requirement.attachment as Attachment,
                              )
                            }
                            title="View attached document"
                          >
                            View document
                          </button>
                        ) : (
                          <span className="document-missing-label">
                            No file submitted yet
                          </span>
                        )}

                        <div className="requirement-action-buttons">
                          <button
                            className="requirement-action pass"
                            onClick={() =>
                              handleAttachmentStatusUpdate(
                                selectedEnrollee.id,
                                requirement.index,
                                "Approved",
                              )
                            }
                            disabled={
                              !requirement.isSubmitted ||
                              requirement.reviewStatus === "Approved"
                            }
                          >
                            ✓ Pass
                          </button>
                          <button
                            className="requirement-action redo"
                            onClick={() =>
                              handleAttachmentStatusUpdate(
                                selectedEnrollee.id,
                                requirement.index,
                                "Rejected",
                              )
                            }
                            disabled={
                              !requirement.isSubmitted ||
                              requirement.reviewStatus === "Rejected"
                            }
                          >
                            ✕ Redo
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="review-modal-footer">
              <button className="action-btn review" onClick={closeReviewModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enrollment Request Details Modal */}
      {selectedRequest && (
        <div className="review-modal-overlay" role="dialog">
          <div className="review-modal request-details-modal">
            <div className="review-modal-header">
              <h2>Enrollment Request Details</h2>
              <button
                className="review-modal-close"
                onClick={closeRequestModal}
              >
                ✕
              </button>
            </div>

            <div className="review-modal-body">
              <div className="request-details-content">
                <div className="detail-row">
                  <span className="detail-label">Student Number:</span>
                  <span className="detail-value">
                    {selectedRequest.studentNumber}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Full Name:</span>
                  <span className="detail-value">
                    {selectedRequest.fullName}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Program:</span>
                  <span className="detail-value">
                    {selectedRequest.program}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Current Level:</span>
                  <span className="detail-value">
                    {selectedRequest.currentYearLevel}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Requested Level:</span>
                  <span className="detail-value">
                    {selectedRequest.requestedYearLevel}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Academic Year:</span>
                  <span className="detail-value">
                    {selectedRequest.academicYear}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Semester:</span>
                  <span className="detail-value">
                    {selectedRequest.semester}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Request Date:</span>
                  <span className="detail-value">
                    {selectedRequest.requestDate}
                  </span>
                </div>
                {selectedRequest.enrollmentDate && (
                  <div className="detail-row">
                    <span className="detail-label">Enrollment Date:</span>
                    <span className="detail-value">
                      {selectedRequest.enrollmentDate}
                    </span>
                  </div>
                )}
                {selectedRequest.notes && (
                  <div className="detail-row notes-row">
                    <span className="detail-label">Notes:</span>
                    <span className="detail-value">
                      {selectedRequest.notes}
                    </span>
                  </div>
                )}
                <div className="detail-row">
                  <span className="detail-label">Status:</span>
                  <span
                    className={`enrollment-badge ${selectedRequest.enrollmentStatus.toLowerCase()}`}
                  >
                    {selectedRequest.enrollmentStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="review-modal-footer">
              {selectedRequest.enrollmentStatus === "Pending" && (
                <>
                  <button
                    className="action-btn approve"
                    onClick={() => {
                      closeRequestModal();
                      handleApproveRequest(selectedRequest.id);
                    }}
                  >
                    Approve Request
                  </button>
                  <button
                    className="action-btn reject"
                    onClick={() => {
                      closeRequestModal();
                      handleRejectRequest(selectedRequest.id);
                    }}
                  >
                    Reject Request
                  </button>
                </>
              )}
              <button className="action-btn cancel" onClick={closeRequestModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
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
                Are you sure you want to {selectedAction.action} this enrollment
                request?
              </p>
              {selectedAction.action === "approve" && (
                <p className="confirmation-note">
                  This will progress the student to the next academic level and
                  generate new enrollment records.
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

      {/* Attachment Viewer */}
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
              viewingAttachment.url.includes("placeholder") ? (
                <img src={viewingAttachment.url} alt={viewingAttachment.name} />
              ) : (
                <div className="attachment-placeholder">
                  <p>📄 {viewingAttachment.name}</p>
                  <a
                    href={viewingAttachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="download-link"
                  >
                    Download Document
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
