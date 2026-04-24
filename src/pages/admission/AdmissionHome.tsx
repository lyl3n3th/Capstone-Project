import { useState } from "react";
import { FaRegPaperPlane } from "react-icons/fa6";
import logow from "../../assets/images/logow.png";
import { useAdmissionPortalStatus } from "../../hooks/useAdmissionPortalStatus";
import { formatAdmissionCloseDate } from "../../services/admissionPortal";
import {
  getAdmissionDraft,
  getAdmissionProgress,
} from "../../services/admission";
import "../../styles/admission/admission-home.css";

function AdmissionHome() {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { isOpen: isAdmissionPortalOpen, closeOnDate } =
    useAdmissionPortalStatus();
  const formattedCloseDate = formatAdmissionCloseDate(closeOnDate);
  const admissionStatusLabel = isAdmissionPortalOpen
    ? formattedCloseDate
      ? `Admission is ongoing until ${formattedCloseDate}`
      : "Admission is ongoing"
    : "Admission is currently closed";
  const admissionPortalDescription = isAdmissionPortalOpen
    ? formattedCloseDate
      ? `Online applications are ongoing until ${formattedCloseDate}. Start your admission journey or use your tracking number to check your progress.`
      : "Online applications are open. Start your admission journey or use your tracking number to check your progress."
    : formattedCloseDate
      ? `Admissions closed after ${formattedCloseDate}. You can still track an existing application below.`
      : "Online applications are currently unavailable. You can still track an existing application below.";

  const handleTrackProgress = async () => {
    setError("");

    if (!trackingNumber.trim()) {
      setError("Please enter a tracking number");
      return;
    }

    setIsLoading(true);

    try {
      const application = await getAdmissionProgress(trackingNumber);
      if (application) {
        window.location.href = `/confirmation?trackingNumber=${encodeURIComponent(application.trackingNumber)}`;
        return;
      }

      const draft = getAdmissionDraft();
      if (
        draft?.trackingNumber &&
        draft.trackingNumber.toUpperCase() ===
          trackingNumber.trim().toUpperCase()
      ) {
        window.location.href = `/confirmation?trackingNumber=${encodeURIComponent(trackingNumber.trim())}`;
        return;
      }

      setError("Tracking number not found. Please check and try again.");
    } catch (err) {
      console.error("Error checking tracking number:", err);
      setError("Unable to check this tracking number right now.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    setTrackingNumber(pastedText);
    setError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      void handleTrackProgress();
    }
  };

  return (
    <section className="admission-home">
      <div className="admission-home__visual">
        <div className="admission-home__visual-overlay" />
        <div className="admission-home__visual-copy">
          <p className="admission-home__visual-kicker">AICS Admissions</p>
          <h1>Your Future Starts Here.</h1>
          <p>
            Begin your online application, upload your requirements, and stay
            updated on every step of the admission process.
          </p>
        </div>
      </div>

      <div className="admission-home__panel">
        <div className="content">
          <img
            src={logow}
            alt="Asian Institute of Computer Studies logo"
            className="logo"
          />

          <div className="content-copy">
            <h2>Asian Institute of Computer Studies</h2>
            <p className="content-kicker">Go Beyond Learning</p>
            <p id="p2">{admissionStatusLabel}</p>
          </div>

          {!isAdmissionPortalOpen ? (
            <div className="admission-portal-banner is-closed">
              Admissions closed
            </div>
          ) : null}

          <button
            type="button"
            className="admission-primary-action"
            onClick={() => {
              window.location.href = "/enroll";
            }}
            disabled={!isAdmissionPortalOpen}
          >
            Enroll Now
          </button>

          <div className="form-and-track-wrapper">
            <div className="form-container">
              <label className="tracking-label" htmlFor="tracking-number">
                Track your application
              </label>
              <input
                id="tracking-number"
                type="text"
                placeholder="Enter tracking number"
                className={`input-field ${error ? "input-error" : ""}`}
                value={trackingNumber}
                onChange={(e) => {
                  setTrackingNumber(e.target.value);
                  setError("");
                }}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              {error ? <div className="error-message">{error}</div> : null}
            </div>

            <div className="track-container">
              <button
                type="button"
                className={`track-cont ${isLoading ? "disabled" : ""}`}
                onClick={() => {
                  if (!isLoading) {
                    void handleTrackProgress();
                  }
                }}
                disabled={isLoading}
              >
                <FaRegPaperPlane />
                <span>{isLoading ? "Checking..." : "Track Progress"}</span>
              </button>
            </div>
          </div>

          <p
            className={`admission-portal-note ${isAdmissionPortalOpen ? "is-open" : "is-closed"}`}
          >
            {admissionPortalDescription}
          </p>
        </div>
      </div>
    </section>
  );
}

export default AdmissionHome;
