import { useState } from "react";
import Progress from "../../components/Progress";
import { StatusDropdown } from "../../components/common/StatusDropdown";
import { BranchCard } from "../../components/common/BranchCard";
import { ActionButtons } from "../../components/common/ActionButtons";
import { ToastContainer } from "../../components/common/Toast";
import "../../styles/main.css";
import { useAdmissionPortalOverview } from "../../hooks/useAdmissionPortalStatus";
import {
  admissionBranches,
  admissionStatusOptions,
  generateAicsTrackingNumber,
} from "../../services/admission";
import { formatAdmissionCloseDate } from "../../services/admissionPortal";

// Data
const branchRules: Record<string, string[]> = {
  "Junior High Completer": ["bacoor", "taytay", "gma"],
  "Senior High Graduate": ["bacoor"],
  Transferee: ["bacoor", "taytay", "gma"],
  "Foreign Student": ["bacoor", "taytay", "gma"],
  "Cross-Registrant": ["bacoor", "taytay", "gma"],
};

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

const getInitialAdmissionStep1Draft = () => {
  const savedDraft = sessionStorage.getItem("enrollmentDraft");
  if (!savedDraft) {
    return {
      branch: "",
      status: "Select Status",
    };
  }

  try {
    const draft = JSON.parse(savedDraft) as {
      branch?: string;
      status?: string;
    };

    return {
      branch: draft.branch ?? "",
      status: draft.status ?? "Select Status",
    };
  } catch (error) {
    console.warn("Failed to parse draft", error);
    return {
      branch: "",
      status: "Select Status",
    };
  }
};

function AdmissionStep1() {
  const initialDraft = getInitialAdmissionStep1Draft();
  const [selectedBranch, setSelectedBranch] = useState<string>(
    initialDraft.branch,
  );
  const [status, setStatus] = useState(initialDraft.status);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { branches: branchStatuses } = useAdmissionPortalOverview();

  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const getBranchStatus = (branchCode: string) =>
    branchStatuses.find((branch) => branch.branchCode === branchCode);

  const isBranchClosed = (branchCode: string) =>
    !(getBranchStatus(branchCode)?.isOpen ?? true);

  const isBranchDisabled = (branchCode: string) => {
    if (status === "Select Status") {
      return true;
    }

    if (!branchRules[status]?.includes(branchCode)) {
      return true;
    }

    return isBranchClosed(branchCode);
  };

  const getBranchHelperText = (branchCode: string, branchName: string) => {
    const branchStatus = getBranchStatus(branchCode);
    const formattedCloseDate = formatAdmissionCloseDate(
      branchStatus?.closeOnDate ?? "",
    );

    if (!branchStatus?.isOpen) {
      return formattedCloseDate
        ? `${branchName} branch - Admissions closed on ${formattedCloseDate}`
        : `${branchName} branch - Admissions closed`;
    }

    return formattedCloseDate
      ? `${branchName} branch - Scheduled to close on ${formattedCloseDate}`
      : `${branchName} branch - Admissions open`;
  };

  const activeSelectedBranch =
    selectedBranch && !isBranchDisabled(selectedBranch) ? selectedBranch : "";

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    setSelectedBranch("");

    const draft = sessionStorage.getItem("enrollmentDraft");
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        parsed.status = newStatus;
        parsed.branch = "";
        sessionStorage.setItem("enrollmentDraft", JSON.stringify(parsed));
      } catch (err) {
        console.warn("Failed to update draft", err);
      }
    }
  };

  const handleBranchSelect = (branchCode: string) => {
    setSelectedBranch(branchCode);

    const draft = sessionStorage.getItem("enrollmentDraft");
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        parsed.branch = branchCode;
        sessionStorage.setItem("enrollmentDraft", JSON.stringify(parsed));
      } catch (err) {
        console.warn("Failed to update draft", err);
      }
    }
  };

  const handleContinue = () => {
    if (!activeSelectedBranch || status === "Select Status") {
      addToast("Please select student status and branch.", "error");
      return;
    }

    if (isBranchDisabled(activeSelectedBranch)) {
      addToast(
        "The selected branch is currently unavailable for new admissions.",
        "warning",
      );
      return;
    }

    setLoading(true);
    const existingDraft = sessionStorage.getItem("enrollmentDraft");
    let draftData;

    if (existingDraft) {
      try {
        const parsed = JSON.parse(existingDraft);
        const trackingNum =
          parsed.trackingNumber || generateAicsTrackingNumber();
        draftData = {
          ...parsed,
          trackingNumber: trackingNum,
          branch: activeSelectedBranch,
          status,
          step: 1,
          lastUpdated: new Date().toISOString(),
        };
      } catch {
        draftData = {
          trackingNumber: generateAicsTrackingNumber(),
          branch: activeSelectedBranch,
          status,
          step: 1,
          createdAt: new Date().toISOString(),
        };
      }
    } else {
      draftData = {
        trackingNumber: generateAicsTrackingNumber(),
        branch: activeSelectedBranch,
        status,
        step: 1,
        createdAt: new Date().toISOString(),
      };
    }

    sessionStorage.setItem("enrollmentDraft", JSON.stringify(draftData));
    setTimeout(() => {
      setLoading(false);
      window.location.href = `/information?branch=${encodeURIComponent(activeSelectedBranch)}&status=${encodeURIComponent(status)}&trackingNumber=${draftData.trackingNumber}`;
    }, 600);
  };

  const handleCancel = () => {
    window.location.href = "/admission";
  };

  return (
    <div className="container admission-step1-page">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="container1 admission-step1-progress">
        <Progress current={1} />
      </div>

      <div className="mcontainer admission-step1-content">
        <div className="header admission-step1-card">
          <StatusDropdown
            label="Student Status"
            options={[...admissionStatusOptions]}
            value={status}
            onChange={handleStatusChange}
            placeholder="Select Status"
          />

          <hr style={{ opacity: 0.1, margin: "20px 0" }} />

          <div className="syb admission-step1-title">
            Select Your Branch
            <p>Choose the branch you wish to enroll in</p>
          </div>

          {admissionBranches.map((branch) => (
            <BranchCard
              key={branch.code}
              branch={branch}
              helperText={getBranchHelperText(branch.code, branch.name)}
              isSelected={activeSelectedBranch === branch.code}
              isDisabled={isBranchDisabled(branch.code)}
              onClick={() => handleBranchSelect(branch.code)}
            />
          ))}

          <ActionButtons
            onCancel={handleCancel}
            onContinue={handleContinue}
            isContinueDisabled={
              !activeSelectedBranch ||
              status === "Select Status" ||
              isBranchDisabled(activeSelectedBranch)
            }
            isLoading={loading}
          />
        </div>
      </div>
    </div>
  );
}

export default AdmissionStep1;
