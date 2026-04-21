import { useMemo } from "react";
import { useAdmissionPortalStatus } from "../../hooks/useAdmissionPortalStatus";
import { ADMISSION_PORTAL_OPEN_DESCRIPTION } from "../../services/admissionPortal";

export default function AdmissionPortalAccessCard() {
  const {
    isOpen: isAdmissionPortalOpen,
    updatedAt: admissionPortalUpdatedAt,
    setAdmissionPortalOpen,
  } = useAdmissionPortalStatus();

  const admissionPortalMeta = useMemo(() => {
    if (!admissionPortalUpdatedAt) {
      return "Currently using the default open setting.";
    }

    const parsedTimestamp = Date.parse(admissionPortalUpdatedAt);
    if (!Number.isFinite(parsedTimestamp)) {
      return "Portal status was updated recently.";
    }

    return `Last updated: ${new Date(parsedTimestamp).toLocaleString()}`;
  }, [admissionPortalUpdatedAt]);

  return (
    <section className="admission-portal-card">
      <div className="admission-portal-copy">
        <span
          className={`admission-portal-pill ${isAdmissionPortalOpen ? "is-open" : "is-closed"}`}
        >
          {isAdmissionPortalOpen ? "Portal Open" : "Portal Closed"}
        </span>
        <h3>New Admission Access</h3>
        <p>{ADMISSION_PORTAL_OPEN_DESCRIPTION}</p>
        <p className="admission-portal-meta">{admissionPortalMeta}</p>
      </div>

      <div className="admission-portal-actions">
        <button
          type="button"
          className={`admission-portal-toggle ${isAdmissionPortalOpen ? "is-close" : "is-open"}`}
          onClick={() => {
            setAdmissionPortalOpen(!isAdmissionPortalOpen);
          }}
        >
          {isAdmissionPortalOpen
            ? "Close Admission Portal"
            : "Open Admission Portal"}
        </button>
      </div>
    </section>
  );
}
