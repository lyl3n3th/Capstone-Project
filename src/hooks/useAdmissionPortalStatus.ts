import { useEffect, useState } from "react";
import {
  ADMISSION_PORTAL_STATUS_UPDATED_EVENT,
  DEFAULT_ADMISSION_BRANCH_CODE,
  getAdmissionPortalOverview,
  getAdmissionPortalStatus,
  setAdmissionPortalOpen as persistAdmissionPortalOpen,
  setAdmissionPortalStatus as persistAdmissionPortalStatus,
  type AdmissionPortalOverview,
  type AdmissionPortalBranchStatus,
  resolveAdmissionPortalBranchCode,
} from "../services/admissionPortal";

const ADMISSION_PORTAL_STATUS_REFRESH_INTERVAL_MS = 5_000;

export function useAdmissionPortalStatus(branch: string) {
  const resolvedBranch =
    resolveAdmissionPortalBranchCode(branch) ?? DEFAULT_ADMISSION_BRANCH_CODE;
  const [portalStatus, setPortalStatus] = useState<AdmissionPortalBranchStatus>(
    () => getAdmissionPortalStatus(resolvedBranch)!,
  );

  useEffect(() => {
    setPortalStatus(getAdmissionPortalStatus(resolvedBranch)!);
  }, [resolvedBranch]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncPortalStatus = () => {
      setPortalStatus(getAdmissionPortalStatus(resolvedBranch)!);
    };

    window.addEventListener(
      ADMISSION_PORTAL_STATUS_UPDATED_EVENT,
      syncPortalStatus as EventListener,
    );
    window.addEventListener("storage", syncPortalStatus);
    const intervalId = window.setInterval(
      syncPortalStatus,
      ADMISSION_PORTAL_STATUS_REFRESH_INTERVAL_MS,
    );

    return () => {
      window.removeEventListener(
        ADMISSION_PORTAL_STATUS_UPDATED_EVENT,
        syncPortalStatus as EventListener,
      );
      window.removeEventListener("storage", syncPortalStatus);
      window.clearInterval(intervalId);
    };
  }, [resolvedBranch]);

  const setAdmissionPortalOpen = (
    isOpen: boolean,
    closeOnDate?: string | null,
  ) => {
    const nextStatus = persistAdmissionPortalOpen(
      resolvedBranch,
      isOpen,
      closeOnDate,
    );
    setPortalStatus(nextStatus);
    return nextStatus;
  };

  const setAdmissionPortalStatus = ({
    isOpen,
    closeOnDate = "",
  }: {
    isOpen: boolean;
    closeOnDate?: string | null;
  }) => {
    const nextStatus = persistAdmissionPortalStatus({
      branch: resolvedBranch,
      isOpen,
      closeOnDate,
    });
    setPortalStatus(nextStatus);
    return nextStatus;
  };

  return {
    ...portalStatus,
    setAdmissionPortalOpen,
    setAdmissionPortalStatus,
  };
}

export function useAdmissionPortalOverview() {
  const [portalOverview, setPortalOverview] = useState<AdmissionPortalOverview>(
    () => getAdmissionPortalOverview(),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncPortalOverview = () => {
      setPortalOverview(getAdmissionPortalOverview());
    };

    window.addEventListener(
      ADMISSION_PORTAL_STATUS_UPDATED_EVENT,
      syncPortalOverview as EventListener,
    );
    window.addEventListener("storage", syncPortalOverview);
    const intervalId = window.setInterval(
      syncPortalOverview,
      ADMISSION_PORTAL_STATUS_REFRESH_INTERVAL_MS,
    );

    return () => {
      window.removeEventListener(
        ADMISSION_PORTAL_STATUS_UPDATED_EVENT,
        syncPortalOverview as EventListener,
      );
      window.removeEventListener("storage", syncPortalOverview);
      window.clearInterval(intervalId);
    };
  }, []);

  return portalOverview;
}
