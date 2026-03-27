import { FaRegPaperPlane } from "react-icons/fa6";
import "../../styles/admission/admission-home.css";
import logow from "../../assets/images/logow.png";
import { useState } from "react";

function AdmissionHome() {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleTrackProgress = () => {
    setError("");

    if (!trackingNumber.trim()) {
      setError("Please enter a tracking number");
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      try {
        const draft = sessionStorage.getItem("enrollmentDraft");

        if (draft) {
          const parsedDraft = JSON.parse(draft);
          const storedTrackingNumber = parsedDraft.trackingNumber;

          if (
            storedTrackingNumber &&
            storedTrackingNumber.toUpperCase() ===
              trackingNumber.trim().toUpperCase()
          ) {
            const branch = parsedDraft.branch || "";
            const status = parsedDraft.status || "";
            const program = parsedDraft.program || "";

            window.location.href = `/confirmation?branch=${encodeURIComponent(branch)}&status=${encodeURIComponent(status)}&trackingNumber=${encodeURIComponent(trackingNumber.trim())}&program=${encodeURIComponent(program)}`;
            return;
          } else {
            setError("Tracking number not found. Please check and try again.");
          }
        } else {
          setError("No application found with this tracking number.");
        }
      } catch (err) {
        console.error("Error checking tracking number:", err);
        setError("An error occurred. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }, 800);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    setTrackingNumber(pastedText);
    setError("");
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleTrackProgress();
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
            onKeyPress={handleKeyPress}
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
                handleTrackProgress();
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
