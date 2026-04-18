import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { MdKeyboardArrowDown } from "react-icons/md";
import AuthModal from "../../components/common/AuthModal";
import { useAuth } from "../../hooks/useAuth";
import { authenticateManager } from "../../services/mockStaffAuth";
import {
  authenticateStaffLogin,
  resetStaffPassword,
  type StaffBranch,
} from "../../services/staffApi";
import type { StaffRole } from "../../types/user";
import "../../styles/staff/staff-login.css";

type StaffAccessRole = Extract<StaffRole, "admin" | "registrar">;

function StaffLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginStaff, getDefaultRouteForRole } = useAuth();
  const [selectedBranch, setSelectedBranch] = useState("");
  const [isAreaManager, setIsAreaManager] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] =
    useState(false);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);

  const [loginData, setLoginData] = useState({
    branch: "",
    password: "",
    role: "admin" as StaffRole,
  });
  const [resetData, setResetData] = useState({
    branch: "",
    role: "admin" as StaffAccessRole,
    email: "",
    contactNumber: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handleAreaManagerToggle = (checked: boolean) => {
    setIsAreaManager(checked);
    setLoginData((current) => ({
      ...current,
      branch: checked ? "" : current.branch,
      role: checked
        ? "manager"
        : current.role === "manager"
          ? "admin"
          : current.role,
    }));

    if (checked) {
      setSelectedBranch("");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAreaManager && !loginData.branch) {
      alert("Please select a branch!");
      return;
    }

    if (!isAreaManager && !["admin", "registrar"].includes(loginData.role)) {
      alert("Please select a valid role.");
      return;
    }

    if (!loginData.password) {
      alert("Please enter your password!");
      return;
    }

    const redirectPath = (
      location.state as { from?: { pathname?: string } } | null
    )?.from?.pathname;

    try {
      setIsSubmitting(true);

      if (isAreaManager) {
        const managerAccount = authenticateManager(loginData.password);

        if (!managerAccount) {
          alert("Invalid login credentials. Please try again.");
          return;
        }

        await loginStaff({
          branch: managerAccount.branch,
          fullName: managerAccount.fullName,
          employeeId: "AICS-MANAGER-ACCESS",
          role: managerAccount.role,
        });

        const nextPath =
          redirectPath && redirectPath !== "/staff/login"
            ? redirectPath
            : getDefaultRouteForRole(managerAccount.role);

        navigate(nextPath, { replace: true });
        return;
      }

      const staffAccount = await authenticateStaffLogin(
        loginData.branch as StaffBranch,
        loginData.role as Extract<StaffRole, "admin" | "registrar">,
        loginData.password,
      );

      await loginStaff({
        branch: staffAccount.branch,
        fullName: staffAccount.fullName,
        employeeId: staffAccount.employeeId,
        role: staffAccount.role,
      });

      const nextPath =
        redirectPath && redirectPath !== "/staff/login"
          ? redirectPath
          : getDefaultRouteForRole(staffAccount.role);

      navigate(nextPath, { replace: true });
    } catch (error) {
      console.error("Staff login failed", error);
      const message =
        error instanceof Error
          ? error.message
          : "Unable to sign in right now. Please try again.";
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenResetModal = () => {
    if (isAreaManager) {
      alert("Area Manager password reset is not available on this page yet.");
      return;
    }

    setResetFeedback(null);
    setShowResetPassword(false);
    setShowResetConfirmPassword(false);
    setResetData((current) => ({
      ...current,
      branch: loginData.branch || current.branch,
      role: (loginData.role || current.role) as StaffAccessRole,
    }));
    setIsResetModalOpen(true);
  };

  const handleCloseResetModal = () => {
    if (isResetSubmitting) {
      return;
    }

    setIsResetModalOpen(false);
    setResetFeedback(null);
    setShowResetPassword(false);
    setShowResetConfirmPassword(false);
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setResetFeedback(null);

    if (!resetData.branch) {
      setResetFeedback({
        type: "error",
        message: "Please select the branch for this staff account.",
      });
      return;
    }

    if (!resetData.email.trim() || !resetData.contactNumber.trim()) {
      setResetFeedback({
        type: "error",
        message: "Email and mobile number are required.",
      });
      return;
    }

    if (resetData.newPassword.length < 8) {
      setResetFeedback({
        type: "error",
        message: "Password must be at least 8 characters long.",
      });
      return;
    }

    if (resetData.newPassword !== resetData.confirmPassword) {
      setResetFeedback({
        type: "error",
        message: "The password confirmation does not match.",
      });
      return;
    }

    try {
      setIsResetSubmitting(true);

      const result = await resetStaffPassword({
        branch: resetData.branch as StaffBranch,
        role: resetData.role,
        email: resetData.email,
        contactNumber: resetData.contactNumber,
        newPassword: resetData.newPassword,
      });

      setSelectedBranch(result.branch);
      setLoginData((current) => ({
        ...current,
        branch: result.branch,
        role: result.role,
        password: resetData.newPassword,
      }));
      setResetData((current) => ({
        ...current,
        branch: result.branch,
        role: result.role,
        newPassword: "",
        confirmPassword: "",
      }));

      setIsResetModalOpen(false);
      alert("Staff password updated. You can now sign in with the new password.");
    } catch (error) {
      console.error("Staff password reset failed", error);
      setResetFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to reset the password right now.",
      });
    } finally {
      setIsResetSubmitting(false);
    }
  };

  return (
    <div className="staff-login-page">
      <div className="background-overlay"></div>
      <div className="login-wrapper">
        <div className="login-card">
          <div className="login-content">
            <div className="header-text">
              <h1 className="login-title">Login</h1>
              <p className="pent">Enter your credentials to continue</p>
              <p className="selected-branch-display">
                {isAreaManager ? "Access: " : "Branch: "}
                <strong
                  className={
                    !selectedBranch && !isAreaManager ? "placeholder" : ""
                  }
                >
                  {isAreaManager
                    ? "Area Manager"
                    : selectedBranch || "Not selected"}
                </strong>
              </p>
            </div>

            <form className="login-form" onSubmit={handleLogin}>
              <div className="manager-toggle-row">
                <label
                  className={`manager-toggle ${isAreaManager ? "active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={isAreaManager}
                    onChange={(e) => handleAreaManagerToggle(e.target.checked)}
                  />
                  <span>Login as Area Manager</span>
                </label>
              </div>

              {isAreaManager ? (
                <div className="manager-mode-card">
                  <span className="manager-mode-label">Access Mode</span>
                  <strong>Area Manager</strong>
                  <p className="manager-mode-copy">
                    Branch and staff role selection are skipped in this mode.
                    Continue directly with your manager password.
                  </p>
                </div>
              ) : (
                <>
                  <div className="form-groups">
                    <label htmlFor="branch">Select Branch</label>
                    <div className="staff-select-wrapper">
                      <select
                        id="branch"
                        name="branch"
                        value={loginData.branch}
                        onChange={(e) => {
                          const branch = e.target.value;
                          setSelectedBranch(branch);
                          setLoginData((current) => ({ ...current, branch }));
                        }}
                        required
                      >
                        <option value="">Select Branch</option>
                        <option value="Bacoor">Bacoor</option>
                        <option value="GMA">GMA</option>
                        <option value="Taytay">Taytay</option>
                      </select>
                      <span className="staff-select-arrow" aria-hidden="true">
                        <MdKeyboardArrowDown size={18} />
                      </span>
                    </div>
                  </div>

                  <div className="form-groups">
                    <label htmlFor="role">Access Role</label>
                    <div className="staff-select-wrapper">
                      <select
                        id="role"
                        name="role"
                        value={loginData.role}
                        onChange={(e) =>
                          setLoginData((current) => ({
                            ...current,
                            role: e.target.value as StaffAccessRole,
                          }))
                        }
                      >
                        <option value="admin">Administrator</option>
                        <option value="registrar">Registrar</option>
                      </select>
                      <span className="staff-select-arrow" aria-hidden="true">
                        <MdKeyboardArrowDown size={18} />
                      </span>
                    </div>
                  </div>
                </>
              )}

              <div className="divider"></div>

              <div className="form-groups">
                <div className="password-wrapper">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={loginData.password}
                    onChange={(e) =>
                      setLoginData((current) => ({
                        ...current,
                        password: e.target.value,
                      }))
                    }
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword((previous) => !previous)}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              <div className="forgot-link-wrapper">
                <button
                  type="button"
                  className="forgot-link"
                  onClick={handleOpenResetModal}
                  disabled={isAreaManager}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in..." : "Login"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <AuthModal
        isOpen={isResetModalOpen}
        title="Reset Staff Password"
        description="Confirm the branch account details, then set a new password for the staff login."
        onClose={handleCloseResetModal}
        footer={
          <>
            <button
              type="button"
              className="reset-cancel-btn"
              onClick={handleCloseResetModal}
              disabled={isResetSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="staff-reset-form"
              className="reset-submit-btn"
              disabled={isResetSubmitting}
            >
              {isResetSubmitting ? "Updating..." : "Update Password"}
            </button>
          </>
        }
      >
        <form id="staff-reset-form" className="reset-form" onSubmit={handleResetPassword}>
          <div className="reset-grid">
            <div className="form-groups">
              <label htmlFor="reset-branch">Branch</label>
              <div className="staff-select-wrapper">
                <select
                  id="reset-branch"
                  value={resetData.branch}
                  onChange={(e) =>
                    setResetData((current) => ({
                      ...current,
                      branch: e.target.value,
                    }))
                  }
                >
                  <option value="">Select Branch</option>
                  <option value="Bacoor">Bacoor</option>
                  <option value="GMA">GMA</option>
                  <option value="Taytay">Taytay</option>
                </select>
                <span className="staff-select-arrow" aria-hidden="true">
                  <MdKeyboardArrowDown size={18} />
                </span>
              </div>
            </div>

            <div className="form-groups">
              <label htmlFor="reset-role">Access Role</label>
              <div className="staff-select-wrapper">
                <select
                  id="reset-role"
                  value={resetData.role}
                  onChange={(e) =>
                    setResetData((current) => ({
                      ...current,
                      role: e.target.value as StaffAccessRole,
                    }))
                  }
                >
                  <option value="admin">Administrator</option>
                  <option value="registrar">Registrar</option>
                </select>
                <span className="staff-select-arrow" aria-hidden="true">
                  <MdKeyboardArrowDown size={18} />
                </span>
              </div>
            </div>
          </div>

          <div className="form-groups">
            <label htmlFor="reset-email">Email Address</label>
            <input
              id="reset-email"
              type="email"
              value={resetData.email}
              onChange={(e) =>
                setResetData((current) => ({
                  ...current,
                  email: e.target.value,
                }))
              }
              placeholder="Enter the staff email"
              autoComplete="email"
            />
          </div>

          <div className="form-groups">
            <label htmlFor="reset-contact">Mobile Number</label>
            <input
              id="reset-contact"
              type="text"
              value={resetData.contactNumber}
              onChange={(e) =>
                setResetData((current) => ({
                  ...current,
                  contactNumber: e.target.value,
                }))
              }
              placeholder="Enter the registered mobile number"
              autoComplete="tel"
            />
          </div>

          <div className="form-groups">
            <label htmlFor="reset-password">New Password</label>
            <div className="password-wrapper reset-password-wrapper">
              <input
                id="reset-password"
                type={showResetPassword ? "text" : "password"}
                value={resetData.newPassword}
                onChange={(e) =>
                  setResetData((current) => ({
                    ...current,
                    newPassword: e.target.value,
                  }))
                }
                autoComplete="new-password"
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() =>
                  setShowResetPassword((previousValue) => !previousValue)
                }
              >
                {showResetPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <div className="form-groups">
            <label htmlFor="reset-confirm-password">Confirm Password</label>
            <div className="password-wrapper reset-password-wrapper">
              <input
                id="reset-confirm-password"
                type={showResetConfirmPassword ? "text" : "password"}
                value={resetData.confirmPassword}
                onChange={(e) =>
                  setResetData((current) => ({
                    ...current,
                    confirmPassword: e.target.value,
                  }))
                }
                autoComplete="new-password"
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() =>
                  setShowResetConfirmPassword((previousValue) => !previousValue)
                }
              >
                {showResetConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          {resetFeedback ? (
            <p className={`reset-feedback ${resetFeedback.type}`}>
              {resetFeedback.message}
            </p>
          ) : null}
        </form>
      </AuthModal>
    </div>
  );
}

export default StaffLogin;
