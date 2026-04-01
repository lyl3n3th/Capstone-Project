import "../../styles/main.css";
import { FaCalendarAlt, FaClock } from "react-icons/fa";
import { FaLocationDot, FaCircleExclamation } from "react-icons/fa6";
import Progress from "../../components/Progress";
import { useEffect, useState } from "react";
import { ToastContainer } from "../../components/common/Toast";
import {
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
  const [examDetails, setExamDetails] = useState({
    date: "",
    time: "",
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

        setApplication(result);

        const examDates = [
          "Monday to Friday",
          "April 3, 2026",
          "April 7, 2026",
          "April 10, 2026",
        ];
        const examTimes = [
          "9:00 AM to 11:00 AM",
          "1:00 PM to 3:00 PM",
          "3:30 PM to 5:30 PM",
        ];
        const locations: Record<string, { location: string; room: string }> = {
          bacoor: { location: "Bacoor Branch", room: "PE Room" },
          taytay: { location: "Taytay Branch", room: "Auditorium" },
          gma: { location: "GMA Branch", room: "PE Room" },
        };

        const branchInfo = locations[result.branchCode] || {
          location: result.branchName,
          room: "Room 101",
        };
        const hash = result.trackingNumber.charCodeAt(
          result.trackingNumber.length - 1,
        );
        const dateIndex = hash % examDates.length;
        const timeIndex = Math.floor(hash / 2) % examTimes.length;

        setExamDetails({
          date: examDates[dateIndex],
          time: examTimes[timeIndex],
          location: branchInfo.location,
          room: branchInfo.room,
        });
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

  const handleAddToCalendar = () => {
    addToast("Exam schedule noted.", "success");
    alert(
      `Scholarship Exam\n${examDetails.date}\n${examDetails.time}\n${examDetails.location} - ${examDetails.room}`,
    );
  };

  const handleDownloadPermit = () => {
    addToast("Exam permit prepared.", "success");
    alert(
      `Exam permit for ${application?.firstName ?? "Applicant"} ${application?.lastName ?? ""}`.trim(),
    );
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
              You are assigned to take the Scholarship Exam
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
                  <FaCalendarAlt />
                </span>
                <div className="entrance-exam-text">
                  <strong>Date:</strong> {examDetails.date || "To be announced"}
                </div>
              </div>

              <div className="entrance-exam-row">
                <span className="entrance-exam-icon">
                  <FaClock />
                </span>
                <div className="entrance-exam-text">
                  <strong>Time:</strong> {examDetails.time || "To be announced"}
                </div>
              </div>

              <div className="entrance-exam-row">
                <span className="entrance-exam-icon">
                  <FaLocationDot />
                </span>
                <div className="entrance-exam-text">
                  <strong>Location:</strong> {examDetails.location} -{" "}
                  {examDetails.room}
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
              <button className="entrance-exam-btn" onClick={handleAddToCalendar}>
                <FaCalendarAlt /> Add to Calendar
              </button>
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
                Bring a school ID, exam permit, black pen, and your tracking
                number on exam day.
              </p>
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
