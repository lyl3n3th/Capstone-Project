import "../../styles/main.css";
import { FaCircleExclamation, FaLocationDot } from "react-icons/fa6";
import Progress from "../../components/Progress";
import { useEffect, useState } from "react";
import { ToastContainer } from "../../components/common/Toast";
import SkeletonPage from "../../components/common/SkeletonPage";
import {
  clearAdmissionDraft,
  getAdmissionDraft,
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

  const handleBackToHome = () => {
    clearAdmissionDraft();
    window.location.href = "/";
  };

  if (isLoading) {
    return (
      <div className="entrance-exam-page">
        <SkeletonPage eyebrow="Admission" title="Scholarship Exam" variant="form" />
      </div>
    );
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

            <div className="entrance-exam-notes">
              <div className="entrance-exam-notes-header">
                <FaCircleExclamation className="entrance-exam-notes-icon" />
                <p className="entrance-exam-notes-title">Important Notes</p>
              </div>
              <p className="entrance-exam-notes-text">
                Please coordinate with your selected branch before visiting for
                the scholarship exam. Bring a school ID, black pen, and your
                tracking number.
              </p>
              <p className="entrance-exam-notes-text">
                There is no fixed exam schedule. The branch will assist you
                with the available on-site exam process.
              </p>
              {application.appliedForScholarship && (
                <p className="entrance-exam-notes-text">
                  The scholarship exam has 60 items. The highest discount from
                  the exam is 50%.
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
