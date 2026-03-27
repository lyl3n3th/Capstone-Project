import "../../styles/main.css";
import { FaCalendarAlt, FaClock } from "react-icons/fa";
import { FaLocationDot } from "react-icons/fa6";
import { FaCircleExclamation } from "react-icons/fa6";
import Progress from "../../components/Progress";
import { useState, useEffect } from "react";
import { ToastContainer } from "../../components/common/Toast";

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
  const selectedBranch = getQueryParam("branch") || "";
  const studentStatus = getQueryParam("status") || "";
  const trackingNumber = getQueryParam("trackingNumber") || "";
  const program = getQueryParam("program") || "";

  const [examDetails, setExamDetails] = useState({
    date: "",
    time: "",
    location: "",
    room: "",
  });

  const [applicantName, setApplicantName] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  useEffect(() => {
    // Get applicant data from sessionStorage
    const draft = sessionStorage.getItem("enrollmentDraft");
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        setApplicantName(`${parsed.fname || ""} ${parsed.lname || ""}`.trim());

        // Generate exam details based on branch
        const examDates = [
          "Monday - Friday",
          "March 22, 2026",
          "March 25, 2026",
          "March 27, 2026",
        ];
        const examTimes = [
          "9:00 AM - 11:00 AM",
          "1:00 PM - 3:00 PM",
          "3:30 PM - 5:30 PM",
        ];
        const locations: Record<string, { location: string; room: string }> = {
          bacoor: { location: "Bacoor Branch", room: "PE Room" },
          taytay: { location: "Taytay Branch", room: "Auditorium" },
          gma: { location: "GMA Branch", room: "PE Room" },
        };

        // Use branch to determine location, or default
        const branchInfo = locations[selectedBranch.toLowerCase()] || {
          location: "Main Campus",
          room: "Room 101",
        };

        // Generate random but consistent exam details based on tracking number
        const hash = trackingNumber
          ? trackingNumber.charCodeAt(trackingNumber.length - 1) || 0
          : 0;
        const dateIndex = hash % examDates.length;
        const timeIndex = Math.floor(hash / 2) % examTimes.length;

        setExamDetails({
          date: examDates[dateIndex],
          time: examTimes[timeIndex],
          location: branchInfo.location,
          room: branchInfo.room,
        });
      } catch (err) {
        console.warn("Failed to parse draft", err);
      }
    }
  }, [selectedBranch, trackingNumber]);

  const handleAddToCalendar = () => {
    addToast("Exam added to calendar!", "success");
    alert(
      `Added to calendar:\nScholarship Exam\n${examDetails.date} ${examDetails.time}\n${examDetails.location} - ${examDetails.room}`,
    );
  };

  const handleDownloadPermit = () => {
    addToast("Exam permit downloaded!", "success");
    alert(
      `Exam permit downloaded for ${applicantName || "Applicant"}. Please bring this on exam day.`,
    );
  };

  const handleBackToHome = () => {
    addToast("Returning to home page", "info");
    setTimeout(() => {
      window.location.href = "/";
    }, 500);
  };

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
            {applicantName && (
              <p className="entrance-exam-applicant">
                Applicant: <strong>{applicantName}</strong>
              </p>
            )}
            <p className="entrance-exam-info">
              Program: <strong>{program}</strong> &nbsp;|&nbsp; Branch:{" "}
              <strong>{selectedBranch}</strong>
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
                  <strong>Location:</strong>{" "}
                  {examDetails.location || "To be announced"} -{" "}
                  {examDetails.room}
                </div>
              </div>

              <div className="entrance-exam-row">
                <span className="entrance-exam-icon">
                  <strong>#</strong>
                </span>
                <div className="entrance-exam-text">
                  <strong>Tracking #:</strong> {trackingNumber}
                </div>
              </div>
            </div>

            <div className="entrance-exam-actions">
              <button
                className="entrance-exam-btn"
                onClick={handleAddToCalendar}
              >
                <FaCalendarAlt /> Add to Calendar
              </button>
              <button
                className="entrance-exam-btn"
                onClick={handleDownloadPermit}
              >
                Download Permit
              </button>
            </div>

            <div className="entrance-exam-notes">
              <div className="entrance-exam-notes-header">
                <FaCircleExclamation className="entrance-exam-notes-icon" />
                <p className="entrance-exam-notes-title">Important Notes</p>
              </div>
              <p className="entrance-exam-notes-text">
                Please bring the following during exam:
              </p>
              <ul className="entrance-exam-notes-list">
                <li>School ID</li>
                <li>Exam Permit</li>
                <li>Black pen</li>
                <li>
                  Tracking Number: <strong>{trackingNumber}</strong>
                </li>
              </ul>
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
