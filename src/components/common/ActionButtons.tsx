import React from "react";

interface ActionButtonsProps {
  onCancel: () => void;
  onContinue: () => void;
  isContinueDisabled: boolean;
  isLoading?: boolean;
  cancelText?: string;
  continueText?: string;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  onCancel,
  onContinue,
  isContinueDisabled,
  isLoading = false,
  cancelText = "Cancel",
  continueText = "Continue",
}) => {
  return (
    <div className="choices2">
      <button className="btn1" onClick={onCancel} disabled={isLoading}>
        {cancelText}
      </button>
      <button
        className={`btn2 ${isContinueDisabled || isLoading ? "disabled" : ""}`}
        onClick={onContinue}
        disabled={isContinueDisabled || isLoading}
      >
        {isLoading ? "Saving..." : continueText}
      </button>
    </div>
  );
};
