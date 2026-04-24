import "../../styles/main.css";
import { FaCircleExclamation, FaLocationDot } from "react-icons/fa6";
import Progress from "../../components/Progress";
import { useEffect, useState } from "react";
import { ToastContainer } from "../../components/common/Toast";
import {
  getAdmissionDraft,
  getHonorDiscountPercentage,
  getAdmissionProgress,
} from "../../services/admission";
import type { AdmissionApplicationSummary } from "../../types/application";

function getQueryParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

function AdmissionStep5() {
  const trackingNumberFromUrl = getQueryParam("trackingNumber") || "";
  const [application, setApplication] =
    useState<AdmissionApplicationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [examLocation, setExamLocation] = useState({
    location: "",
    room: "",
  });
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
      const trackingNumber = trackingNumberFromUrl || draft?.trackingNumber || "";

      if (!trackingNumber) {
        setPageError("No scholarship exam record was found.");
        setIsLoading(false);
        return;
      }

      try {
        const result = await getAdmissionProgress(trackingNumber);
        if (!result) {
          setPageError("Tracking number not found.");
          setIsLoading(false);
          return;
        }

        if (!result.appliedForScholarship) {
          setPageError(
            "This application is under regular enrollment and does not need a scholarship exam page.",
          );
          setIsLoading(false);
          return;
        }

        setApplication(result);
        const locations: Record<string, { location: string; room: string }> = {
          bacoor: { location: "Bacoor Branch", room: "PE Room" },
          taytay: { location: "Taytay Branch", room: "Auditorium" },
          gma: { location: "GMA Branch", room: "PE Room" },
        };

        const branchInfo = locations[result.branchCode] || {
          location: result.branchName,
          room: "Room 101",
        };
        setExamLocation(branchInfo);
      } catch (err) {
        console.error(err);
        setPageError(
          err instanceof Error
            ? err.message
            : "Unable to load the scholarship exam details right now.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadApplication();
  }, [trackingNumberFromUrl]);

  const handleDownloadPermit = () => {
    if (!application) {
      return;
    }

    const applicantName =
      `${application.firstName} ${application.lastName}`.trim() || "Applicant";
    const generatedOn = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const permitText = `
ASIAN INSTITUTE OF COMPUTER STUDIES
SCHOLARSHIP EXAMINATION PERMIT

${"=".repeat(52)}

Applicant Name : ${applicantName}
Tracking Number: ${application.trackingNumber}
Program        : ${application.programName}
Branch         : ${application.branchName}
Exam Location  : ${examLocation.location} - ${examLocation.room}
Schedule       : Walk-in basis. Coordinate directly with the selected branch.

${"=".repeat(52)}

IMPORTANT REMINDERS

1. Bring this permit during your branch visit.
2. Bring your school ID and tracking number.
3. Bring a black pen for the scholarship examination.
4. Coordinate with your branch first because there is no fixed exam schedule.

Applicant Signature      : ______________________________
Branch / Proctor Signature: _____________________________

Generated on: ${generatedOn}
`.trim();

    const blob = new Blob([permitText], { type: "text/plain" });
    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = `scholarship_exam_permit_${application.trackingNumber}.txt`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(downloadUrl);

    addToast("Scholarship exam permit downloaded.", "success");
  };

  const handleBackToHome = () => {
    window.location.href = "/";
  };

  if (isLoading) {
    return <div className="entrance-exam-page">Loading scholarship exam...</div>;
  }

  if (pageError || !application) {
    return (
      <div className="entrance-exam-page">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <div className="entrance-exam-container">
          <div className="entrance-exam-card">
            <p>{pageError || "No scholarship exam details available."}</p>
            <button className="entrance-exam-back-btn" onClick={handleBackToHome}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const honorDiscount = getHonorDiscountPercentage(application.honorLabel);

  return (
    <div className="entrance-exam-page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="container1">
        <Progress current={5} />
      </div>

      <div className="entrance-exam-container">
        <div className="entrance-exam-card">
          <div className="entrance-exam-header">
            <h2 className="entrance-exam-title">
              Scholarship Exam Information
            </h2>
            <p className="entrance-exam-applicant">
              Applicant:{" "}
              <strong>
                {application.firstName} {application.lastName}
              </strong>
            </p>
            <p className="entrance-exam-info">
              Program: <strong>{application.programName}</strong>
              {" | "}
              Branch: <strong>{application.branchName}</strong>
            </p>
          </div>

          <div className="entrance-exam-details-card">
            <hr className="entrance-exam-divider" />

            <h3 className="entrance-exam-heading">Exam Details:</h3>

            <div className="entrance-exam-details">
              <div className="entrance-exam-row">
                <span className="entrance-exam-icon">
                  <strong>i</strong>
                </span>
                <div className="entrance-exam-text">
                  <strong>Schedule:</strong> Walk-in basis. No fixed exam
                  schedule.
                </div>
              </div>

              <div className="entrance-exam-row">
                <span className="entrance-exam-icon">
                  <FaLocationDot />
                </span>
                <div className="entrance-exam-text">
                  <strong>Location:</strong> {examLocation.location} -{" "}
                  {examLocation.room}
                </div>
              </div>

              <div className="entrance-exam-row">
                <span className="entrance-exam-icon">
                  <strong>#</strong>
                </span>
                <div className="entrance-exam-text">
                  <strong>Tracking #:</strong> {application.trackingNumber}
                </div>
              </div>
            </div>

            <div className="entrance-exam-actions">
              <button className="entrance-exam-btn" onClick={handleDownloadPermit}>
                Download Permit
              </button>
            </div>

            <div className="entrance-exam-notes">
              <div className="entrance-exam-notes-header">
                <FaCircleExclamation className="entrance-exam-notes-icon" />
                <p className="entrance-exam-notes-title">Important Notes</p>
              </div>
              <p className="entrance-exam-notes-text">
                Please coordinate with your selected branch before visiting for
                the scholarship exam. Bring a school ID, exam permit, black
                pen, and your tracking number.
              </p>
              <p className="entrance-exam-notes-text">
                There is no fixed exam schedule. The branch will assist you
                with the available on-site exam process.
              </p>
              {application.appliedForScholarship && honorDiscount > 0 && (
                <p className="entrance-exam-notes-text">
                  If you applied for scholarship and have an academic honor,
                  the higher percentage between your scholarship exam score and
                  honor discount will be used. If the exam score is lower, your
                  honor discount will stay active.
                </p>
              )}
            </div>

            <div className="entrance-exam-back">
              <button
                className="entrance-exam-back-btn"
                onClick={handleBackToHome}
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdmissionStep5;
