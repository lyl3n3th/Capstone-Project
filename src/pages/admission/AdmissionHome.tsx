import { useState } from "react";
import { FaRegPaperPlane } from "react-icons/fa6";
import logow from "../../assets/images/logow.png";
import { useAdmissionPortalOverview } from "../../hooks/useAdmissionPortalStatus";
import {
  getAdmissionDraft,
  getAdmissionProgress,
} from "../../services/admission";
import "../../styles/admission/admission-home.css";

function AdmissionHome() {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { branches, openBranches, closedBranches, isAnyOpen } =
    useAdmissionPortalOverview();

  const formatBranchList = (branchNames: string[]) => {
    if (branchNames.length === 0) {
      return "";
    }

    return new Intl.ListFormat(undefined, {
      style: "long",
      type: "conjunction",
    }).format(branchNames);
  };

  const openBranchNames = openBranches.map((branch) => branch.branchName);
  const closedBranchNames = closedBranches.map((branch) => branch.branchName);
  const admissionStatusLabel = !isAnyOpen
    ? "Admissions are currently closed in all branches"
    : openBranches.length === branches.length
      ? "Admissions are ongoing in all branches"
      : `Admissions are open for ${formatBranchList(openBranchNames)}`;
  const admissionPortalDescription = !isAnyOpen
    ? `Online applications are currently unavailable in ${formatBranchList(closedBranchNames)}. You can still track an existing application below.`
    : openBranches.length === branches.length
      ? "Online applications are open in all branches. Start your admission journey or use your tracking number to check your progress."
      : `Online applications are currently available for ${formatBranchList(openBranchNames)}. Admissions for ${formatBranchList(closedBranchNames)} remain unavailable until reopened.`;

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

          <button
            type="button"
            className="admission-primary-action"
            onClick={() => {
              window.location.href = "/enroll";
            }}
            disabled={!isAnyOpen}
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
            className={`admission-portal-note ${isAnyOpen ? "is-open" : "is-closed"}`}
          >
            {admissionPortalDescription}
          </p>
        </div>
      </div>
    </section>
  );
}

export default AdmissionHome;
