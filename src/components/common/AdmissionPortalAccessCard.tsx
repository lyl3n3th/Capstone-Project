import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useAdmissionPortalStatus } from "../../hooks/useAdmissionPortalStatus";
import {
  ADMISSION_PORTAL_CLOSED_DESCRIPTION,
  ADMISSION_PORTAL_OPEN_DESCRIPTION,
  formatAdmissionCloseDate,
} from "../../services/admissionPortal";

const getTodayDateInputValue = () => {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const day = String(currentDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export default function AdmissionPortalAccessCard() {
  const { currentUser } = useAuth();
  const canManageAdmission = currentUser?.role === "registrar";
  const {
    isOpen: isAdmissionOpen,
    closeOnDate,
    updatedAt,
    isAutoClosed,
    setAdmissionPortalOpen,
    setAdmissionPortalStatus,
  } = useAdmissionPortalStatus();
  const [scheduledCloseDate, setScheduledCloseDate] = useState(closeOnDate);
  const [validationMessage, setValidationMessage] = useState("");
  const formattedCloseDate = formatAdmissionCloseDate(closeOnDate);
  const todayDateInputValue = getTodayDateInputValue();

  useEffect(() => {
    const nextScheduledCloseDate =
      !isAdmissionOpen && closeOnDate && closeOnDate < todayDateInputValue
        ? ""
        : closeOnDate;

    setScheduledCloseDate(nextScheduledCloseDate);
    setValidationMessage("");
  }, [closeOnDate, isAdmissionOpen, todayDateInputValue]);

  const updatedAtLabel = (() => {
    if (!updatedAt) {
      return "";
    }

    const parsedTimestamp = Date.parse(updatedAt);

    if (!Number.isFinite(parsedTimestamp)) {
      return "";
    }

    return new Date(parsedTimestamp).toLocaleString();
  })();

  const admissionDescription = (() => {
    if (isAdmissionOpen && formattedCloseDate) {
      return `New admission forms are available until ${formattedCloseDate}. Applicants can use the Enroll Now button to start a new submission.`;
    }

    if (isAdmissionOpen) {
      return ADMISSION_PORTAL_OPEN_DESCRIPTION;
    }

    if (isAutoClosed && formattedCloseDate) {
      return `Admissions closed automatically after ${formattedCloseDate}. Applicants can still track an existing application below.`;
    }

    return ADMISSION_PORTAL_CLOSED_DESCRIPTION;
  })();

  const admissionMeta = (() => {
    const details: string[] = [];

    if (isAdmissionOpen && formattedCloseDate) {
      details.push(`Closes on ${formattedCloseDate}.`);
    } else if (formattedCloseDate) {
      details.push(`Closed on ${formattedCloseDate}.`);
    }

    if (updatedAtLabel) {
      details.push(`Updated ${updatedAtLabel}.`);
    }

    return details.join(" ");
  })();

  const handleSaveAdmissionSchedule = () => {
    const nextCloseDate = scheduledCloseDate.trim();

    if (!nextCloseDate) {
      setValidationMessage("Please select the admission closing date.");
      return;
    }

    if (nextCloseDate < todayDateInputValue) {
      setValidationMessage("Please select today's date or a future date.");
      return;
    }

    setAdmissionPortalStatus({
      isOpen: true,
      closeOnDate: nextCloseDate,
    });
    setValidationMessage("");
  };

  const handleCloseAdmission = () => {
    setAdmissionPortalOpen(false);
    setScheduledCloseDate("");
    setValidationMessage("");
  };

  return (
    <section
      className={`admission-portal-card${canManageAdmission ? " is-manageable" : " is-readonly"}`}
    >
      <div className="admission-portal-copy">
        <span
          className={`admission-portal-pill ${isAdmissionOpen ? "is-open" : "is-closed"}`}
        >
          {isAdmissionOpen ? "Admissions Open" : "Admissions Closed"}
        </span>
        <h3>{canManageAdmission ? "Admission Access" : "Admission Status"}</h3>
        <p>{admissionDescription}</p>
        {admissionMeta ? (
          <p className="admission-portal-meta">{admissionMeta}</p>
        ) : null}
      </div>

      {canManageAdmission ? (
        <div className="admission-portal-actions">
          <label className="admission-portal-date-field">
            <span>Admission closes on</span>
            <input
              type="date"
              className="admission-portal-date-input"
              value={scheduledCloseDate}
              min={todayDateInputValue}
              onChange={(event) => {
                setScheduledCloseDate(event.target.value);
                setValidationMessage("");
              }}
            />
          </label>
          {validationMessage ? (
            <p className="admission-portal-helper is-error">
              {validationMessage}
            </p>
          ) : null}
          <button
            type="button"
            className="admission-portal-toggle is-open"
            onClick={handleSaveAdmissionSchedule}
          >
            {isAdmissionOpen ? "Update Closing Date" : "Open Admission"}
          </button>
          {isAdmissionOpen ? (
            <button
              type="button"
              className="admission-portal-secondary"
              onClick={handleCloseAdmission}
            >
              Close Admission Now
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
