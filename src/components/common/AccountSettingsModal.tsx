import { useEffect, useState } from "react";
import { BsEye, BsEyeSlash } from "react-icons/bs";
import { MdClose } from "react-icons/md";
import "../../styles/components/account-settings-modal.css";

export interface AccountSettingsProfile {
  firstName: string;
  lastName: string;
}

export interface AccountSettingsDraft {
  firstName: string;
  lastName: string;
  newPassword?: string;
}

interface AccountSettingsModalProps {
  open: boolean;
  values: AccountSettingsProfile | null;
  onClose: () => void;
  onSave: (draft: AccountSettingsDraft) => Promise<void> | void;
  title?: string;
  submitLabel?: string;
  errorMessage?: string;
  isLoading?: boolean;
  isSaving?: boolean;
}

export default function AccountSettingsModal({
  open,
  values,
  onClose,
  onSave,
  title = "Edit Account",
  submitLabel = "Update Account",
  errorMessage,
  isLoading = false,
  isSaving = false,
}: AccountSettingsModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [localErrorMessage, setLocalErrorMessage] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setFirstName(values?.firstName ?? "");
    setLastName(values?.lastName ?? "");
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setFieldErrors({});
    setLocalErrorMessage("");
  }, [open, values]);

  if (!open) {
    return null;
  }

  const handleSave = async () => {
    const nextErrors: Record<string, boolean> = {};
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedPassword = newPassword.trim();
    const normalizedConfirmPassword = confirmPassword.trim();

    if (!normalizedFirstName) {
      nextErrors.firstName = true;
    }

    if (!normalizedLastName) {
      nextErrors.lastName = true;
    }

    if (
      (normalizedPassword || normalizedConfirmPassword) &&
      normalizedPassword !== normalizedConfirmPassword
    ) {
      nextErrors.confirmPassword = true;
      setLocalErrorMessage("Passwords do not match.");
    } else {
      setLocalErrorMessage("");
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    await onSave({
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      newPassword: normalizedPassword || undefined,
    });
  };

  return (
    <div className="account-settings-modal-overlay" onClick={onClose}>
      <div
        className="account-settings-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="account-settings-modal-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="account-settings-close-btn"
            onClick={onClose}
          >
            <MdClose size={20} />
          </button>
        </div>
        <div className="account-settings-modal-body">
          {errorMessage || localErrorMessage ? (
            <div className="account-settings-error">
              {errorMessage || localErrorMessage}
            </div>
          ) : null}

          {isLoading ? (
            <div className="account-settings-loading">
              Loading account details...
            </div>
          ) : !values ? (
            <div className="account-settings-loading">
              Account details are unavailable right now.
            </div>
          ) : (
            <div className="account-settings-form-grid">
              <div className="account-settings-form-group">
                <label className="account-settings-label">First Name</label>
                <input
                  type="text"
                  className={`account-settings-input ${fieldErrors.firstName ? "input-error" : ""}`}
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoFocus
                />
              </div>
              <div className="account-settings-form-group">
                <label className="account-settings-label">Last Name</label>
                <input
                  type="text"
                  className={`account-settings-input ${fieldErrors.lastName ? "input-error" : ""}`}
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>
              <div className="account-settings-form-group">
                <label className="account-settings-label">New Password</label>
                <div className="account-settings-password-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="account-settings-input"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Leave blank to keep current password"
                  />
                  <button
                    type="button"
                    className="account-settings-password-toggle"
                    onClick={() =>
                      setShowPassword((currentValue) => !currentValue)
                    }
                  >
                    {showPassword ? <BsEyeSlash size={18} /> : <BsEye size={18} />}
                  </button>
                </div>
              </div>
              <div className="account-settings-form-group">
                <label className="account-settings-label">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  className={`account-settings-input ${fieldErrors.confirmPassword ? "input-error" : ""}`}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm your new password"
                />
              </div>
            </div>
          )}
        </div>
        <div className="account-settings-modal-footer">
          <button
            type="button"
            className="account-settings-btn account-settings-btn-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="account-settings-btn account-settings-btn-save"
            onClick={() => void handleSave()}
            disabled={isLoading || isSaving || !values}
          >
            {isSaving ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
