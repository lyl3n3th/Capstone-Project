import { useState, useEffect } from "react";
import Progress from "../../components/Progress";
import { StatusDropdown } from "../../components/common/StatusDropdown";
import { BranchCard } from "../../components/common/BranchCard";
import { ActionButtons } from "../../components/common/ActionButtons";
import { ToastContainer } from "../../components/common/Toast";
import "../../styles/main.css";

// Generate tracking number
function generateAICSTrackingNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `AICS-${datePart}-${randomPart}`;
}

// Data
const branches = [
  { code: "bacoor", name: "Bacoor" },
  { code: "taytay", name: "Taytay" },
  { code: "GMA", name: "GMA" },
];

const statusOptions = [
  "Junior High Completer",
  "Senior High Graduate",
  "Transferee",
  "Foreign Student",
  "Cross-Registrant",
];

const branchRules: Record<string, string[]> = {
  "Junior High Completer": ["bacoor", "taytay", "GMA"],
  "Senior High Graduate": ["bacoor"],
  Transferee: ["bacoor", "taytay", "GMA"],
  "Foreign Student": ["bacoor", "taytay", "GMA"],
  "Cross-Registrant": ["bacoor", "taytay", "GMA"],
};

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

function AdmissionStep1() {
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [status, setStatus] = useState("Select Status");
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const fromInfo =
    new URLSearchParams(window.location.search).get("from") === "info";

  const addToast = (message: string, type: Toast["type"]) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const isBranchDisabled = (branchCode: string) => {
    if (status === "Select Status") return true;
    return !branchRules[status]?.includes(branchCode);
  };

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
    if (!selectedBranch || status === "Select Status") {
      addToast("Please select student status and branch.", "error");
      return;
    }

    setLoading(true);
    const existingDraft = sessionStorage.getItem("enrollmentDraft");
    let draftData;

    if (existingDraft) {
      try {
        const parsed = JSON.parse(existingDraft);
        const trackingNum =
          parsed.trackingNumber || generateAICSTrackingNumber();
        draftData = {
          ...parsed,
          trackingNumber: trackingNum,
          branch: selectedBranch,
          status,
          step: 1,
          lastUpdated: new Date().toISOString(),
        };
      } catch (err) {
        draftData = {
          trackingNumber: generateAICSTrackingNumber(),
          branch: selectedBranch,
          status,
          step: 1,
          createdAt: new Date().toISOString(),
        };
      }
    } else {
      draftData = {
        trackingNumber: generateAICSTrackingNumber(),
        branch: selectedBranch,
        status,
        step: 1,
        createdAt: new Date().toISOString(),
      };
    }

    sessionStorage.setItem("enrollmentDraft", JSON.stringify(draftData));
    setTimeout(() => {
      setLoading(false);
      window.location.href = `/information?branch=${encodeURIComponent(selectedBranch)}&status=${encodeURIComponent(status)}&trackingNumber=${draftData.trackingNumber}`;
    }, 600);
  };

  const handleCancel = () => {
    window.location.href = "/admission";
  };

  useEffect(() => {
    const saved = sessionStorage.getItem("enrollmentDraft");
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.status) setStatus(draft.status);
        if (draft.branch) setSelectedBranch(draft.branch);
      } catch (err) {
        console.warn("Failed to parse draft", err);
      }
    }
  }, []);

  useEffect(() => {
    if (fromInfo) {
      const saved = sessionStorage.getItem("enrollmentDraft");
      if (saved) {
        try {
          const draft = JSON.parse(saved);
          if (draft.status) setStatus(draft.status);
          if (draft.branch) setSelectedBranch(draft.branch);
        } catch (err) {
          console.warn("Failed to parse draft", err);
        }
      }
    }
  }, [fromInfo]);

  return (
    <div className="container">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="container1">
        <Progress current={1} />
      </div>

      <div className="mcontainer">
        <div className="header">
          {fromInfo && (
            <div className="restore-message">
              ✓ Returning from information page. Your selection has been
              restored.
            </div>
          )}

          <StatusDropdown
            label="Student Status"
            options={statusOptions}
            value={status}
            onChange={handleStatusChange}
            placeholder="Select Status"
          />

          <hr style={{ opacity: 0.1, margin: "20px 0" }} />

          <div className="syb">
            Select Your Branch
            <p>Choose the branch you wish to enroll in</p>
          </div>

          {branches.map((branch) => (
            <BranchCard
              key={branch.code}
              branch={branch}
              isSelected={selectedBranch === branch.code}
              isDisabled={isBranchDisabled(branch.code)}
              onClick={() => handleBranchSelect(branch.code)}
            />
          ))}

          <ActionButtons
            onCancel={handleCancel}
            onContinue={handleContinue}
            isContinueDisabled={!selectedBranch || status === "Select Status"}
            isLoading={loading}
          />
        </div>
      </div>
    </div>
  );
}

export default AdmissionStep1;
