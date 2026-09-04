import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useAdmissionPortalStatus } from "../../hooks/useAdmissionPortalStatus";
import {
  ADMISSION_PORTAL_CLOSED_DESCRIPTION,
  ADMISSION_PORTAL_OPEN_DESCRIPTION,
  formatAdmissionCloseDate,
} from "../../services/admissionPortal";
import { getAdmissionBranchName } from "../../services/admission";
import {
  fetchBranchStudentNumberSetting,
  normalizeStudentNumberStartDigits,
  saveBranchStudentNumberSetting,
  type BranchStudentNumberSetting,
} from "../../services/studentNumberSettings";

const getTodayDateInputValue = () => {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const day = String(currentDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getTomorrowDateInputValue = () => {
  const currentDate = new Date();
  currentDate.setDate(currentDate.getDate() + 1);

  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const day = String(currentDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export default function AdmissionPortalAccessCard() {
  const { currentUser } = useAuth();
  const canManageAdmission = currentUser?.role === "registrar";
  const managedBranch = currentUser?.branch || "Bacoor";
  const managedBranchName = getAdmissionBranchName(managedBranch);
  const {
    isOpen: isAdmissionOpen,
    closeOnDate,
    updatedAt,
    isAutoClosed,
    setAdmissionPortalOpen,
    setAdmissionPortalStatus,
  } = useAdmissionPortalStatus(managedBranch);
  const scheduleSourceKey = `${managedBranch}:${isAdmissionOpen}:${closeOnDate}`;
  const todayDateInputValue = getTodayDateInputValue();
  const minimumScheduledCloseDate = getTomorrowDateInputValue();
  const defaultScheduledCloseDate =
    !isAdmissionOpen && closeOnDate && closeOnDate <= todayDateInputValue
      ? ""
      : closeOnDate;
  const [scheduleDraft, setScheduleDraft] = useState(() => ({
    sourceKey: scheduleSourceKey,
    value: defaultScheduledCloseDate,
  }));
  const [validationState, setValidationState] = useState(() => ({
    sourceKey: scheduleSourceKey,
    message: "",
  }));
  const [studentNumberSetting, setStudentNumberSetting] =
    useState<BranchStudentNumberSetting | null>(null);
  const [studentNumberDraft, setStudentNumberDraft] = useState("");
  const [studentNumberMessage, setStudentNumberMessage] = useState("");
  const [isStudentNumberSettingLoading, setIsStudentNumberSettingLoading] =
    useState(false);
  const [isSavingStudentNumberSetting, setIsSavingStudentNumberSetting] =
    useState(false);
  const scheduledCloseDate =
    scheduleDraft.sourceKey === scheduleSourceKey
      ? scheduleDraft.value
      : defaultScheduledCloseDate;
  const validationMessage =
    validationState.sourceKey === scheduleSourceKey
      ? validationState.message
      : "";
  const formattedCloseDate = formatAdmissionCloseDate(closeOnDate);

  useEffect(() => {
    if (!canManageAdmission) {
      return undefined;
    }

    let isMounted = true;
    setIsStudentNumberSettingLoading(true);

    fetchBranchStudentNumberSetting(managedBranch)
      .then((setting) => {
        if (!isMounted) {
          return;
        }

        setStudentNumberSetting(setting);
        setStudentNumberDraft(setting.nextDigits);
        setStudentNumberMessage("");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setStudentNumberMessage(
          error instanceof Error
            ? error.message
            : "Unable to load the student number setting from Supabase.",
        );
      })
      .finally(() => {
        if (isMounted) {
          setIsStudentNumberSettingLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [canManageAdmission, managedBranch]);

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
      return `New admission forms are currently available. Admissions are scheduled to close on ${formattedCloseDate}. Applicants can use the Enroll Now button to start a new submission.`;
    }

    if (isAdmissionOpen) {
      return ADMISSION_PORTAL_OPEN_DESCRIPTION;
    }

    if (isAutoClosed && formattedCloseDate) {
      return `Admissions closed automatically on ${formattedCloseDate}. Applicants can still track an existing application below.`;
    }

    return ADMISSION_PORTAL_CLOSED_DESCRIPTION;
  })();

  const admissionMeta = (() => {
    const details: string[] = [];

    if (isAdmissionOpen && formattedCloseDate) {
      details.push(`Scheduled to close on ${formattedCloseDate}.`);
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
      setValidationState({
        sourceKey: scheduleSourceKey,
        message: "Please select the admission closing date.",
      });
      return;
    }

    if (nextCloseDate < minimumScheduledCloseDate) {
      setValidationState({
        sourceKey: scheduleSourceKey,
        message:
          "Please select a future date. Use Close Admission Now if you need to close admissions today.",
      });
      return;
    }

    setAdmissionPortalStatus({
      isOpen: true,
      closeOnDate: nextCloseDate,
    });
    setScheduleDraft({
      sourceKey: scheduleSourceKey,
      value: nextCloseDate,
    });
    setValidationState({
      sourceKey: scheduleSourceKey,
      message: "",
    });
  };

  const handleCloseAdmission = () => {
    setAdmissionPortalOpen(false);
    setScheduleDraft({
      sourceKey: scheduleSourceKey,
      value: "",
    });
    setValidationState({
      sourceKey: scheduleSourceKey,
      message: "",
    });
  };

  const handleSaveStudentNumberSetting = async () => {
    const normalizedDigits = normalizeStudentNumberStartDigits(studentNumberDraft);

    if (!/^\d{6}$/.test(normalizedDigits)) {
      setStudentNumberMessage("Enter exactly 6 digits for the next student number.");
      return;
    }

    setIsSavingStudentNumberSetting(true);
    setStudentNumberMessage("");

    try {
      const savedSetting = await saveBranchStudentNumberSetting({
        branch: managedBranch,
        nextDigits: normalizedDigits,
      });
      setStudentNumberSetting(savedSetting);
      setStudentNumberDraft(savedSetting.nextDigits);
      setStudentNumberMessage(
        `Saved. The next approved student will start at ${savedSetting.nextStudentNumber || savedSetting.nextDigits}.`,
      );
    } catch (error) {
      setStudentNumberMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the student number setting to Supabase.",
      );
    } finally {
      setIsSavingStudentNumberSetting(false);
    }
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
        <h3>
          {canManageAdmission
            ? `${managedBranchName} Admission Access`
            : `${managedBranchName} Admission Status`}
        </h3>
        <p>{admissionDescription}</p>
        {admissionMeta ? (
          <p className="admission-portal-meta">{admissionMeta}</p>
        ) : null}
      </div>

      {canManageAdmission ? (
        <div className="admission-portal-actions">
          <div className="admission-portal-control-group">
            <label className="admission-portal-date-field">
              <span>Admission closes on</span>
              <input
                type="date"
                className="admission-portal-date-input"
                value={scheduledCloseDate}
                min={minimumScheduledCloseDate}
                onChange={(event) => {
                  setScheduleDraft({
                    sourceKey: scheduleSourceKey,
                    value: event.target.value,
                  });
                  setValidationState({
                    sourceKey: scheduleSourceKey,
                    message: "",
                  });
                }}
              />
            </label>
            {validationMessage ? (
              <p className="admission-portal-helper is-error">
                {validationMessage}
              </p>
            ) : (
              <p className="admission-portal-helper">
                The selected date is the first day admissions are closed.
              </p>
            )}
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
          <div className="admission-portal-control-group admission-student-number-settings">
            <label className="admission-portal-date-field">
              <span>Next student number starts at</span>
              <div className="admission-student-number-input-row">
                {studentNumberSetting?.prefix ? (
                  <span className="admission-student-number-prefix">
                    {studentNumberSetting.prefix}-
                  </span>
                ) : null}
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className="admission-portal-date-input admission-student-number-input"
                  value={studentNumberDraft}
                  placeholder="261001"
                  disabled={
                    isStudentNumberSettingLoading || isSavingStudentNumberSetting
                  }
                  onChange={(event) => {
                    setStudentNumberDraft(
                      normalizeStudentNumberStartDigits(event.target.value),
                    );
                    setStudentNumberMessage("");
                  }}
                />
              </div>
            </label>
            <p
              className={`admission-portal-helper ${
                studentNumberMessage &&
                !studentNumberMessage.toLowerCase().startsWith("saved")
                  ? "is-error"
                  : ""
              }`}
            >
              {studentNumberMessage ||
                (studentNumberSetting?.nextStudentNumber
                  ? `Current next number: ${studentNumberSetting.nextStudentNumber}. Existing numbers are skipped automatically.`
                  : "Set the 6 digits used after the branch prefix. Existing numbers are skipped automatically.")}
            </p>
            <button
              type="button"
              className="admission-portal-secondary"
              onClick={() => void handleSaveStudentNumberSetting()}
              disabled={
                isStudentNumberSettingLoading || isSavingStudentNumberSetting
              }
            >
              {isSavingStudentNumberSetting
                ? "Saving..."
                : "Save Student Number Start"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
