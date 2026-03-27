import "../../styles/main.css";
import { FaCopy } from "react-icons/fa";
import { FaCircleExclamation } from "react-icons/fa6";
import Progress from "../../components/Progress";
import React, { useState, useEffect } from "react";
import { ToastContainer } from "../../components/common/Toast";

function getQueryParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function generateAICSTrackingNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `AICS-${datePart}-${randomPart}`;
}

// Discount calculation functions
const getHonorDiscount = (honor: string): number => {
  if (honor.includes("Highest Honor")) return 80;
  if (honor.includes("High Honor")) return 60;
  if (honor.includes("With Honor")) return 50;
  return 0;
};

// Toast interface
interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

function AdmissionStep4() {
  const selectedBranch = getQueryParam("branch") || "";
  const studentStatus = getQueryParam("status") || "";
  const urlTrackingNumber = getQueryParam("trackingNumber") || "";
  const program = getQueryParam("program") || "";

  const [trackingNumber, setTrackingNumber] = useState("");
  const [applicationData, setApplicationData] = useState<any>(null);
  const [studentHonor, setStudentHonor] = useState("");
  const [applyScholarship, setApplyScholarship] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState("pending");
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Add toast notification
  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  // Remove toast notification
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  useEffect(() => {
    let foundTrackingNumber = "";

    if (urlTrackingNumber) {
      foundTrackingNumber = urlTrackingNumber;
    }

    const draft = sessionStorage.getItem("enrollmentDraft");
    if (draft) {
      try {
        const parsedDraft = JSON.parse(draft);
        console.log("Draft found in confirmation page:", parsedDraft);
        setApplicationData(parsedDraft);

        if (parsedDraft.honor) setStudentHonor(parsedDraft.honor);
        if (parsedDraft.apply_scholarship !== undefined)
          setApplyScholarship(parsedDraft.apply_scholarship);
        if (parsedDraft.trackingNumber && !foundTrackingNumber) {
          foundTrackingNumber = parsedDraft.trackingNumber;
        }
        setApplicationStatus(parsedDraft.application_status || "pending");
      } catch (err) {
        console.warn("Failed to parse draft", err);
      }
    }

    if (!foundTrackingNumber) {
      foundTrackingNumber = generateAICSTrackingNumber();
      if (draft) {
        try {
          const parsedDraft = JSON.parse(draft);
          parsedDraft.trackingNumber = foundTrackingNumber;
          sessionStorage.setItem(
            "enrollmentDraft",
            JSON.stringify(parsedDraft),
          );
        } catch (err) {
          console.warn("Failed to save tracking number", err);
        }
      }
    }

    setTrackingNumber(foundTrackingNumber);
  }, [urlTrackingNumber]);

  const handleCopy = () => {
    navigator.clipboard.writeText(trackingNumber);
    addToast("Tracking number copied to clipboard!", "success");
  };

  const handleBackToRequirements = () => {
    const draft = sessionStorage.getItem("enrollmentDraft");
    if (draft) {
      try {
        const parsedDraft = JSON.parse(draft);
        parsedDraft.lastVisited = new Date().toISOString();
        sessionStorage.setItem("enrollmentDraft", JSON.stringify(parsedDraft));
      } catch (err) {
        console.warn("Failed to update draft", err);
      }
    }
    addToast("Returning to requirements page", "info");
    setTimeout(() => {
      window.location.href = `/requirements?branch=${encodeURIComponent(selectedBranch)}&status=${encodeURIComponent(studentStatus)}&trackingNumber=${trackingNumber}&program=${encodeURIComponent(program)}`;
    }, 500);
  };

  const handleContinue = () => {
    const draft = sessionStorage.getItem("enrollmentDraft");
    if (draft) {
      try {
        const parsedDraft = JSON.parse(draft);
        parsedDraft.submitted = true;
        parsedDraft.submissionDate = new Date().toISOString();
        sessionStorage.setItem("enrollmentDraft", JSON.stringify(parsedDraft));
      } catch (err) {
        console.warn("Failed to update draft", err);
      }
    }

    const programValue = program || applicationData?.program || "";
    const isCollege = programValue === "College";

    if (isCollege) {
      addToast("Proceeding to scholarship exam", "info");
      setTimeout(() => {
        window.location.href = `/scholarship-exam?branch=${encodeURIComponent(selectedBranch)}&status=${encodeURIComponent(studentStatus)}&trackingNumber=${trackingNumber}&program=${encodeURIComponent(programValue)}`;
      }, 500);
    } else {
      addToast("Application completed! Redirecting to home", "success");
      setTimeout(() => {
        window.location.href = `/`;
      }, 500);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
  };

  const programValue = program || applicationData?.program || "";
  const isCollege = programValue === "College";
  const honorDiscount = getHonorDiscount(studentHonor);
  const buttonText = isCollege ? "Continue to Scholarship Exam" : "Go to Home";

  // Mock tuition calculation (would come from backend)
  const perUnitRate = 600;
  const mockUnits = 15;
  const baseTuition = mockUnits * perUnitRate;
  const discountedTuition = baseTuition * (1 - honorDiscount / 100);
  const downPayment = 300;

  return (
    <div className="confirmation-page-wrapper">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="container1">
        <Progress current={4} />
      </div>

      <div className="confirmation-container">
        <div className="confirmation-card">
          {/* Application Status Header */}
          <div className="conf-status-header">
            <span className="conf-pending-circle"></span>
            <span className="conf-status-title">Application Status</span>
          </div>

          {/* Status Message */}
          <div className="conf-status-message">
            <p className="conf-status-text">
              Waiting for Registrar Confirmation
            </p>
          </div>

          {/* Tracking Number Display */}
          <div className="conf-track-wrapper">
            <label className="conf-track-label">Tracking Number:</label>
            <div className="conf-track-number">{trackingNumber}</div>
          </div>

          {/* Copy Button */}
          <div className="conf-copy-wrapper">
            <button className="conf-copy-btn" onClick={handleCopy}>
              <FaCopy /> Copy Tracking Number
            </button>
          </div>

          {/* Conditional Message based on program */}
          {isCollege && (
            <div className="conf-notice conf-notice-warning">
              <strong>Next Step:</strong> Since you're applying for a College
              program, you need to take an Scholarship exam. Click "Continue to
              Scholarship Exam" to schedule your exam.
            </div>
          )}

          {!isCollege && programValue && (
            <div className="conf-notice conf-notice-success">
              <strong>Application Complete:</strong> Your Senior High School
              application has been submitted. You may now go back to home.
            </div>
          )}

          {/* Discount Notice for College with Honor */}
          {isCollege && honorDiscount > 0 && (
            <div className="conf-notice conf-notice-info">
              <strong>Honor Discount Applied!</strong>
              <p>
                You are qualified for <strong>{honorDiscount}% discount</strong>{" "}
                based on your academic honor.
              </p>
              <p className="conf-discount-detail">
                Estimated Tuition: ₱{baseTuition.toLocaleString()} → ₱
                {discountedTuition.toLocaleString()}
              </p>
              <p className="conf-discount-note">
                Down Payment: ₱{downPayment.toLocaleString()} (pay on-site)
              </p>
            </div>
          )}

          {/* Scholarship Notice for College */}
          {isCollege && applyScholarship && (
            <div className="conf-notice conf-notice-exam">
              <strong>Scholarship Exam Pending</strong>
              <p>
                You applied for the scholarship exam. Please proceed to your
                selected branch to take the exam.
              </p>
              <p className="conf-exam-detail">Exam Schedule: Monday - Friday</p>
            </div>
          )}

          {/* Application Summary Section */}
          {applicationData && (
            <div className="conf-summary">
              <p className="conf-summary-title">Application Summary</p>

              <div className="conf-summary-grid">
                <div className="conf-summary-item">
                  <span className="conf-summary-label">Branch:</span>
                  <span className="conf-summary-value">
                    {applicationData.branch || selectedBranch || "Not selected"}
                  </span>
                </div>
                <div className="conf-summary-item">
                  <span className="conf-summary-label">Status:</span>
                  <span className="conf-summary-value">
                    {applicationData.status || studentStatus || "Not selected"}
                  </span>
                </div>
                {applicationData.program && (
                  <div className="conf-summary-item">
                    <span className="conf-summary-label">Program:</span>
                    <span className="conf-summary-value">
                      {applicationData.program}
                    </span>
                  </div>
                )}
                {applicationData.strand_or_course && (
                  <div className="conf-summary-item">
                    <span className="conf-summary-label">Course/Strand:</span>
                    <span className="conf-summary-value">
                      {applicationData.strand_or_course}
                    </span>
                  </div>
                )}
                {studentHonor && studentHonor !== "No Honor" && (
                  <div className="conf-summary-item conf-honor-item">
                    <span className="conf-summary-label">Academic Honor:</span>
                    <span className="conf-summary-value">{studentHonor}</span>
                  </div>
                )}
                {(applicationData.fname || applicationData.lname) && (
                  <div className="conf-summary-item">
                    <span className="conf-summary-label">Name:</span>
                    <span className="conf-summary-value">
                      {applicationData.fname || ""}{" "}
                      {applicationData.lname || ""}
                    </span>
                  </div>
                )}
                <div className="conf-summary-item">
                  <span className="conf-summary-label">Submitted:</span>
                  <span className="conf-summary-value">
                    {formatDate(
                      applicationData.submissionDate ||
                        new Date().toISOString(),
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Important Notes Section */}
          <div className="conf-notes">
            <div className="conf-notes-header">
              <FaCircleExclamation className="conf-notes-icon" />
              <p className="conf-notes-title">Important Notes</p>
            </div>
            <p className="conf-notes-text">
              Please wait for the registrar to review your application and
              confirm your admission.
            </p>
            <p className="conf-notes-text">
              You may use your tracking number <strong>{trackingNumber}</strong>{" "}
              to check the status of your application after submission.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="conf-actions">
            <button
              className="conf-btn-back"
              onClick={handleBackToRequirements}
            >
              Back
            </button>
            <button className="conf-btn-continue" onClick={handleContinue}>
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdmissionStep4;
