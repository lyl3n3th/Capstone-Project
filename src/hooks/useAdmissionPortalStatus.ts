import { useEffect, useState } from "react";
import {
  ADMISSION_PORTAL_STATUS_UPDATED_EVENT,
  getAdmissionPortalStatus,
  setAdmissionPortalOpen as persistAdmissionPortalOpen,
} from "../services/admissionPortal";

export function useAdmissionPortalStatus() {
  const [portalStatus, setPortalStatus] = useState(() =>
    getAdmissionPortalStatus(),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncPortalStatus = () => {
      setPortalStatus(getAdmissionPortalStatus());
    };

    window.addEventListener(
      ADMISSION_PORTAL_STATUS_UPDATED_EVENT,
      syncPortalStatus as EventListener,
    );
    window.addEventListener("storage", syncPortalStatus);

    return () => {
      window.removeEventListener(
        ADMISSION_PORTAL_STATUS_UPDATED_EVENT,
        syncPortalStatus as EventListener,
      );
      window.removeEventListener("storage", syncPortalStatus);
    };
  }, []);

  const setAdmissionPortalOpen = (isOpen: boolean) => {
    const nextStatus = persistAdmissionPortalOpen(isOpen);
    setPortalStatus(nextStatus);
    return nextStatus;
  };

  return {
    ...portalStatus,
    setAdmissionPortalOpen,
  };
}
