import { FaRegPaperPlane } from "react-icons/fa6";
import "../../styles/admission/admission-home.css";
import logow from "../../assets/images/logow.png";
import { useState } from "react";
import { getAdmissionDraft, getAdmissionProgress } from "../../services/admission";

function AdmissionHome() {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
        draft.trackingNumber.toUpperCase() === trackingNumber.trim().toUpperCase()
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
    <section className="hero">
      <div className="content">
        <h1>
          Asian Institute of <br />
          Computer Studies
        </h1>

        <p>Go Beyond Learning</p>
        <p id="p2">ADMISSION PORTAL</p>

        <a
          href="/enroll"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = "/enroll";
          }}
        >
          Enroll Now
        </a>
        <img src={logow} alt="logo" className="logo" />

        <div className="form-container">
          <input
            type="text"
            placeholder="Input Tracking Number"
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
          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="track-container">
          <a
            href="#"
            className={`track-cont ${isLoading ? "disabled" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              if (!isLoading) {
                void handleTrackProgress();
              }
            }}
          >
            <FaRegPaperPlane />
            <span>{isLoading ? "Checking..." : "Track Progress"}</span>
          </a>
        </div>
      </div>
    </section>
  );
}

export default AdmissionHome;
