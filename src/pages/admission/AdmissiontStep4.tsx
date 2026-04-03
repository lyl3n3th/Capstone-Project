import "../../styles/main.css";
import { FaCopy } from "react-icons/fa";
import { FaCircleExclamation } from "react-icons/fa6";
import Progress from "../../components/Progress";
import { useEffect, useMemo, useState } from "react";
import { ToastContainer } from "../../components/common/Toast";
import {
  getAdmissionDraft,
  getAdmissionProgress,
  updateAdmissionProgress,
} from "../../services/admission";
import {
  findStoredStudent,
  normalizeBranchName,
  upsertSubmittedApplicant,
} from "../../services/adminStorage";
import type { AdmissionApplicationSummary } from "../../types/application";

function getQueryParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

const getHonorDiscount = (honor: string | null): number => {
  if (!honor) return 0;
  if (honor.includes("Highest Honor")) return 80;
  if (honor.includes("High Honor")) return 60;
  if (honor.includes("With Honor")) return 50;
  return 0;
};

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

function AdmissionStep4() {
  const urlTrackingNumber = getQueryParam("trackingNumber") || "";
  const [trackingNumber, setTrackingNumber] = useState("");
  const [applicationData, setApplicationData] =
    useState<AdmissionApplicationSummary | null>(null);
  const [applyScholarship, setApplyScholarship] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  useEffect(() => {
    const loadApplication = async () => {
      const draft = getAdmissionDraft();
      const draftTrackingNumber = draft?.trackingNumber || "";
      const resolvedTrackingNumber = urlTrackingNumber || draftTrackingNumber;

      if (!resolvedTrackingNumber) {
        setPageError("No admission record was found for this page.");
        setIsLoading(false);
        return;
      }

      setTrackingNumber(resolvedTrackingNumber);
      setApplyScholarship(Boolean(draft?.apply_scholarship));

      try {
        const application = await getAdmissionProgress(resolvedTrackingNumber);

        if (!application) {
          setPageError("Tracking number not found.");
          setIsLoading(false);
          return;
        }

        setApplicationData(application);
        setTrackingNumber(application.trackingNumber);
        if (draft?.apply_scholarship !== undefined) {
          setApplyScholarship(Boolean(draft.apply_scholarship));
        } else {
          setApplyScholarship(application.appliedForScholarship);
        }
      } catch (err) {
        console.error(err);
        setPageError(
          err instanceof Error
            ? err.message
            : "Unable to load this admission record right now.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadApplication();
  }, [urlTrackingNumber]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(trackingNumber);
    addToast("Tracking number copied to clipboard.", "success");
  };

  const handleBackToRequirements = () => {
    if (!applicationData) {
      return;
    }

    addToast("Returning to requirements page", "info");
    setTimeout(() => {
      window.location.href = `/requirements?branch=${encodeURIComponent(applicationData.branchCode)}&status=${encodeURIComponent(applicationData.studentStatus)}&trackingNumber=${encodeURIComponent(applicationData.trackingNumber)}&program=${encodeURIComponent(applicationData.programName)}`;
    }, 400);
  };

  const handleContinue = async () => {
    if (!applicationData) {
      return;
    }

    const isCollege = applicationData.programLevel === "college";

    try {
      const updatedApplication = await updateAdmissionProgress({
        trackingNumber: applicationData.trackingNumber,
        currentStep: isCollege ? 5 : 4,
        applicationStatus: "submitted",
        markSubmitted: true,
      });

      const draft = getAdmissionDraft();
      if (draft) {
        sessionStorage.setItem(
          "enrollmentDraft",
          JSON.stringify({
            ...draft,
            submitted: true,
            submissionDate: new Date().toISOString(),
            trackingNumber: updatedApplication.trackingNumber,
          }),
        );
      }

      upsertSubmittedApplicant({
        application: updatedApplication,
        draft,
      });

      setApplicationData(updatedApplication);
      addToast("Application submitted successfully.", "success");

      setTimeout(() => {
        if (isCollege) {
          window.location.href = `/scholarship-exam?trackingNumber=${encodeURIComponent(updatedApplication.trackingNumber)}`;
          return;
        }

        window.location.href = "/";
      }, 500);
    } catch (err) {
      console.error(err);
      addToast(
        err instanceof Error
          ? err.message
          : "Unable to submit the application right now.",
        "error",
      );
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) {
      return "Not yet submitted";
    }

    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const applicationStatusMessage = useMemo(() => {
    switch (applicationData?.applicationStatus) {
      case "submitted":
      case "under_review":
        return "Waiting for Registrar Confirmation";
      case "accepted":
        return "Admission Accepted";
      case "rejected":
        return "Application Requires Follow-up";
      default:
        return "Application Draft Saved";
    }
  }, [applicationData]);

  const linkedStudentRecord = useMemo(() => {
    if (!applicationData || applicationData.applicationStatus !== "accepted") {
      return null;
    }

    return findStoredStudent({
      branch: applicationData.branchName,
      trackingNumber: applicationData.trackingNumber,
    });
  }, [applicationData]);

  const statusCircleClass = useMemo(() => {
    switch (applicationData?.applicationStatus) {
      case "accepted":
        return "conf-status-circle conf-status-circle-accepted";
      case "rejected":
        return "conf-status-circle conf-status-circle-rejected";
      default:
        return "conf-status-circle conf-status-circle-pending";
    }
  }, [applicationData]);

  const studentPortalLink = useMemo(() => {
    if (!applicationData || applicationData.applicationStatus !== "accepted") {
      return "";
    }

    const params = new URLSearchParams({
      branch: normalizeBranchName(applicationData.branchName),
    });

    if (linkedStudentRecord?.id) {
      params.set("studentNumber", linkedStudentRecord.id);
    }

    return `/student/login?${params.toString()}`;
  }, [applicationData, linkedStudentRecord]);

  const isCollege = applicationData?.programLevel === "college";
  const canEdit = applicationData?.applicationStatus === "draft";
  const honorDiscount = getHonorDiscount(applicationData?.honorLabel ?? null);
  const isAccepted = applicationData?.applicationStatus === "accepted";
  const buttonText = isAccepted
    ? "Proceed to Student Portal"
    : canEdit
      ? isCollege
        ? "Submit & Continue to Scholarship Exam"
        : "Submit Application"
      : isCollege
        ? "View Scholarship Exam"
        : "Go to Home";

  const baseTuition = 15 * 600;
  const discountedTuition = baseTuition * (1 - honorDiscount / 100);
  const downPayment = 300;

  if (isLoading) {
    return <div className="confirmation-page-wrapper">Loading application...</div>;
  }

  if (pageError || !applicationData) {
    return (
      <div className="confirmation-page-wrapper">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <div className="confirmation-container">
          <div className="confirmation-card">
            <p className="conf-status-text">{pageError || "No record found."}</p>
            <div className="conf-actions">
              <button
                className="conf-btn-continue"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="confirmation-page-wrapper">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="container1">
        <Progress current={4} />
      </div>

      <div className="confirmation-container">
        <div className="confirmation-card">
          <div className="conf-status-header">
            <span className={statusCircleClass}></span>
            <span className="conf-status-title">Application Status</span>
          </div>

          <div className="conf-status-message">
            <p className="conf-status-text">{applicationStatusMessage}</p>
          </div>

          <div className="conf-track-wrapper">
            <label className="conf-track-label">Tracking Number:</label>
            <div className="conf-track-number">{trackingNumber}</div>
          </div>

          <div className="conf-copy-wrapper">
            <button className="conf-copy-btn" onClick={() => void handleCopy()}>
              <FaCopy /> Copy Tracking Number
            </button>
          </div>

          {isCollege && canEdit && (
            <div className="conf-notice conf-notice-warning">
              <strong>Next Step:</strong> Submit this application to continue to
              the scholarship exam schedule page.
            </div>
          )}

          {!canEdit && (
            <div className="conf-notice conf-notice-success">
              <strong>Application Submitted:</strong> Your admission record is
              already in Supabase and is waiting for the next registrar update.
            </div>
          )}

          {isAccepted && (
            <div className="conf-notice conf-notice-success">
              <strong>Student Portal Ready:</strong> Your application has been
              accepted.
              {linkedStudentRecord?.id ? (
                <> Your student number is <strong>{linkedStudentRecord.id}</strong>.</>
              ) : (
                <> You may now proceed to the student portal.</>
              )}
              {studentPortalLink && (
                <p style={{ marginTop: "8px" }}>
                  <a href={studentPortalLink}>Proceed to Student Portal</a>
                </p>
              )}
            </div>
          )}

          {isCollege && honorDiscount > 0 && (
            <div className="conf-notice conf-notice-info">
              <strong>Honor Discount Applied</strong>
              <p>
                You qualify for a <strong>{honorDiscount}% discount</strong>{" "}
                based on your academic honor.
              </p>
              <p className="conf-discount-detail">
                Estimated Tuition: PHP {baseTuition.toLocaleString()} to PHP{" "}
                {discountedTuition.toLocaleString()}
              </p>
              <p className="conf-discount-note">
                Down Payment: PHP {downPayment.toLocaleString()} (pay on-site)
              </p>
            </div>
          )}

          {isCollege && applyScholarship && (
            <div className="conf-notice conf-notice-exam">
              <strong>Scholarship Exam Selected</strong>
              <p>
                This application includes a scholarship exam request for the
                selected college program.
              </p>
            </div>
          )}

          <div className="conf-summary">
            <p className="conf-summary-title">Application Summary</p>

            <div className="conf-summary-grid">
              <div className="conf-summary-item">
                <span className="conf-summary-label">Branch:</span>
                <span className="conf-summary-value">
                  {applicationData.branchName}
                </span>
              </div>
              <div className="conf-summary-item">
                <span className="conf-summary-label">Status:</span>
                <span className="conf-summary-value">
                  {applicationData.studentStatus}
                </span>
              </div>
              <div className="conf-summary-item">
                <span className="conf-summary-label">Program:</span>
                <span className="conf-summary-value">
                  {applicationData.programName}
                </span>
              </div>
              <div className="conf-summary-item">
                <span className="conf-summary-label">Course/Strand:</span>
                <span className="conf-summary-value">
                  {applicationData.trackName}
                </span>
              </div>
              <div className="conf-summary-item">
                <span className="conf-summary-label">Name:</span>
                <span className="conf-summary-value">
                  {applicationData.firstName} {applicationData.lastName}
                </span>
              </div>
              <div className="conf-summary-item">
                <span className="conf-summary-label">Submitted:</span>
                <span className="conf-summary-value">
                  {formatDate(applicationData.submittedAt)}
                </span>
              </div>
              {linkedStudentRecord?.id && (
                <div className="conf-summary-item">
                  <span className="conf-summary-label">Student Number:</span>
                  <span className="conf-summary-value">
                    {linkedStudentRecord.id}
                  </span>
                </div>
              )}
              {applicationData.honorLabel &&
                applicationData.honorLabel !== "No Honor" && (
                  <div className="conf-summary-item conf-honor-item">
                    <span className="conf-summary-label">Academic Honor:</span>
                    <span className="conf-summary-value">
                      {applicationData.honorLabel}
                    </span>
                  </div>
                )}
            </div>
          </div>

          <div className="conf-notes">
            <div className="conf-notes-header">
              <FaCircleExclamation className="conf-notes-icon" />
              <p className="conf-notes-title">Important Notes</p>
            </div>
            <p className="conf-notes-text">
              Keep your tracking number for status updates and recovery.
            </p>
            <p className="conf-notes-text">
              Uploaded requirements and admission details are now stored in
              Supabase under this tracking number.
            </p>
          </div>

          <div className="conf-actions">
            {canEdit && (
              <button
                className="conf-btn-back"
                onClick={handleBackToRequirements}
              >
                Back
              </button>
            )}
            <button
              className="conf-btn-continue"
              onClick={() => {
                if (isAccepted && studentPortalLink) {
                  window.location.href = studentPortalLink;
                  return;
                }

                if (!canEdit) {
                  if (isCollege) {
                    window.location.href = `/scholarship-exam?trackingNumber=${encodeURIComponent(applicationData.trackingNumber)}`;
                    return;
                  }

                  window.location.href = "/";
                  return;
                }

                void handleContinue();
              }}
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdmissionStep4;
