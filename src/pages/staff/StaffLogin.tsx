import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { MdKeyboardArrowDown } from "react-icons/md";
import AuthModal from "../../components/common/AuthModal";
import { useAuth } from "../../hooks/useAuth";
import {
  authenticateManager,
  resetStoredManagerPassword,
  updateStoredManagerAccount,
} from "../../services/mockStaffAuth";
import {
  authenticateStaffLogin,
  completeStaffPasswordSetup,
  fetchManagedBranches,
  resetStaffPassword,
  type StaffBranch,
} from "../../services/staffApi";
import {
  authenticateInstructor,
  setInstructorPassword,
} from "../../services/instructorPortal";
import { STAFF_ROLE_LABELS, type StaffRole } from "../../types/user";
import "../../styles/staff/staff-login.css";

type StaffLoginAccessRole = StaffRole;
type StaffResetAccessRole = Extract<StaffRole, "admin" | "registrar">;

function StaffLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginStaff, getDefaultRouteForRole } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [showSetupConfirmPassword, setShowSetupConfirmPassword] =
    useState(false);
  const [isSetupSubmitting, setIsSetupSubmitting] = useState(false);
  const [setupFeedback, setSetupFeedback] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isManagerResetModalOpen, setIsManagerResetModalOpen] = useState(false);
  const [isManagerResetSubmitting, setIsManagerResetSubmitting] =
    useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] =
    useState(false);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);
  const [systemMessage, setSystemMessage] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [managedBranches, setManagedBranches] = useState<string[]>([
    "Bacoor",
    "Taytay",
    "GMA",
  ]);

  const [loginData, setLoginData] = useState({
    branch: "",
    employeeId: "",
    password: "",
    role: "admin" as StaffRole,
  });
  const [setupData, setSetupData] = useState({
    id: "",
    employeeId: "",
    branch: "",
    role: "admin" as StaffLoginAccessRole,
    fullName: "",
    temporaryPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [resetData, setResetData] = useState({
    branch: "",
    role: "admin" as StaffResetAccessRole,
    email: "",
    contactNumber: "",
    newPassword: "",
    confirmPassword: "",
  });

  const isAreaManager = loginData.role === "manager";
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const branches = await fetchManagedBranches();
        const branchNames = branches.map((branch) => branch.name).filter(Boolean);
        if (branchNames.length > 0) {
          setManagedBranches(branchNames.sort());
        }
      } catch (error) {
        console.error("Unable to load staff branches", error);
      }
    };

    void loadBranches();
  }, []);

  const resolveRedirectPath = (role: StaffRole) => {
    const redirectPath = (
      location.state as { from?: { pathname?: string } } | null
    )?.from?.pathname;

    return redirectPath && redirectPath !== "/staff/login"
      ? redirectPath
      : getDefaultRouteForRole(role);
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!isAreaManager && !loginData.branch) {
      setSystemMessage({
        title: "Check Login Details",
        message: "Please select a branch.",
      });
      return;
    }

    if (
      !isAreaManager &&
      !["admin", "registrar", "instructor"].includes(loginData.role)
    ) {
      setSystemMessage({
        title: "Check Login Details",
        message: "Please select a valid role.",
      });
      return;
    }

    if (loginData.role === "instructor" && !loginData.employeeId.trim()) {
      setSystemMessage({
        title: "Check Login Details",
        message: "Please enter your employee ID.",
      });
      return;
    }

    if (!loginData.password) {
      setSystemMessage({
        title: "Check Login Details",
        message: "Please enter your password.",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      if (isAreaManager) {
        const managerAccount = await authenticateManager(loginData.password);

        if (managerAccount.passwordChangeRequired) {
          setSetupFeedback(null);
          setShowSetupPassword(false);
          setShowSetupConfirmPassword(false);
          setSetupData({
            id: managerAccount.id || "AICS-MANAGER-ACCESS",
            employeeId: "AICS-MANAGER-ACCESS",
            branch: managerAccount.branch,
            role: "manager",
            fullName: managerAccount.fullName,
            temporaryPassword: loginData.password,
            newPassword: "",
            confirmPassword: "",
          });
          setIsSetupModalOpen(true);
          return;
        }

        await loginStaff({
          branch: managerAccount.branch,
          fullName: managerAccount.fullName,
          employeeId: "AICS-MANAGER-ACCESS",
          role: managerAccount.role,
        });

        navigate(resolveRedirectPath(managerAccount.role), { replace: true });
        return;
      }

      if (loginData.role === "instructor") {
        const instructorAccount = await authenticateInstructor({
          branch: loginData.branch,
          employeeId: loginData.employeeId,
          password: loginData.password,
        });

        if (instructorAccount.passwordChangeRequired) {
          setSetupFeedback(null);
          setShowSetupPassword(false);
          setShowSetupConfirmPassword(false);
          setSetupData({
            id: instructorAccount.id,
            employeeId: instructorAccount.employeeId,
            branch: instructorAccount.branch,
            role: "instructor",
            fullName: instructorAccount.name,
            temporaryPassword: loginData.password,
            newPassword: "",
            confirmPassword: "",
          });
          setIsSetupModalOpen(true);
          return;
        }

        await loginStaff({
          id: instructorAccount.id,
          branch: instructorAccount.branch,
          fullName: instructorAccount.name,
          employeeId: instructorAccount.employeeId,
          role: "instructor",
        });

        navigate(resolveRedirectPath("instructor"), { replace: true });
        return;
      }

      const staffAccount = await authenticateStaffLogin(
        loginData.branch as StaffBranch,
        loginData.role as Extract<StaffRole, "admin" | "registrar">,
        loginData.password,
      );

      if (staffAccount.passwordChangeRequired) {
        setSetupFeedback(null);
        setShowSetupPassword(false);
        setShowSetupConfirmPassword(false);
        setSetupData({
          id: staffAccount.employeeId,
          employeeId: staffAccount.employeeId,
          branch: staffAccount.branch,
          role: staffAccount.role,
          fullName: staffAccount.fullName,
          temporaryPassword: loginData.password,
          newPassword: "",
          confirmPassword: "",
        });
        setIsSetupModalOpen(true);
        return;
      }

      await loginStaff({
        branch: staffAccount.branch,
        fullName: staffAccount.fullName,
        employeeId: staffAccount.employeeId,
        role: staffAccount.role,
      });

      navigate(resolveRedirectPath(staffAccount.role), { replace: true });
    } catch (error) {
      console.error("Staff login failed", error);
      const message =
        error instanceof Error
          ? error.message
          : "Unable to sign in right now. Please try again.";
      setSystemMessage({
        title: "Unable to Sign In",
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSetupModal = () => {
    if (isSetupSubmitting) {
      return;
    }

    setIsSetupModalOpen(false);
    setSetupFeedback(null);
    setShowSetupPassword(false);
    setShowSetupConfirmPassword(false);
  };

  const handleCompletePasswordSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    setSetupFeedback(null);

    if (setupData.newPassword.length < 8) {
      setSetupFeedback({
        type: "error",
        message: "Password must be at least 8 characters long.",
      });
      return;
    }

    if (setupData.newPassword !== setupData.confirmPassword) {
      setSetupFeedback({
        type: "error",
        message: "The password confirmation does not match.",
      });
      return;
    }

    try {
      setIsSetupSubmitting(true);

      if (setupData.role === "manager") {
        const managerAccount = await updateStoredManagerAccount({
          fullName: setupData.fullName,
          currentPassword: setupData.temporaryPassword,
          password: setupData.newPassword,
        });
        setIsSetupModalOpen(false);

        await loginStaff({
          id: managerAccount.id,
          branch: managerAccount.branch,
          fullName: managerAccount.fullName,
          employeeId: "AICS-MANAGER-ACCESS",
          role: "manager",
        });

        navigate(resolveRedirectPath("manager"), { replace: true });
        return;
      }

      if (setupData.role === "instructor") {
        await setInstructorPassword({
          branch: setupData.branch,
          employeeId: setupData.employeeId,
          currentPassword: setupData.temporaryPassword,
          password: setupData.newPassword,
        });
        setLoginData({
          branch: setupData.branch,
          employeeId: setupData.employeeId,
          password: setupData.newPassword,
          role: "instructor",
        });
        setIsSetupModalOpen(false);

        await loginStaff({
          id: setupData.id,
          branch: setupData.branch,
          fullName: setupData.fullName,
          employeeId: setupData.employeeId,
          role: "instructor",
        });

        navigate(resolveRedirectPath("instructor"), { replace: true });
        return;
      }

      const result = await completeStaffPasswordSetup({
        employeeId: setupData.employeeId,
        currentPassword: setupData.temporaryPassword,
        newPassword: setupData.newPassword,
      });

      setLoginData({
        branch: result.branch,
        employeeId: "",
        password: setupData.newPassword,
        role: result.role,
      });
      setIsSetupModalOpen(false);

      await loginStaff({
        branch: result.branch,
        fullName: result.fullName,
        employeeId: result.employeeId,
        role: result.role,
      });

      navigate(resolveRedirectPath(result.role), { replace: true });
    } catch (error) {
      console.error("Staff first-login password setup failed", error);
      setSetupFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to update the password right now.",
      });
    } finally {
      setIsSetupSubmitting(false);
    }
  };

  const handleOpenResetModal = () => {
    if (isAreaManager) {
      setIsManagerResetModalOpen(true);
      return;
    }

    setResetFeedback(null);
    setShowResetPassword(false);
    setShowResetConfirmPassword(false);
    setResetData((current) => ({
      ...current,
      branch: loginData.branch || current.branch,
      role: (loginData.role || current.role) as StaffResetAccessRole,
    }));
    setIsResetModalOpen(true);
  };

  const handleCloseManagerResetModal = () => {
    if (!isManagerResetSubmitting) {
      setIsManagerResetModalOpen(false);
    }
  };

  const handleConfirmManagerPasswordReset = async () => {
    try {
      setIsManagerResetSubmitting(true);
      await resetStoredManagerPassword();
      setLoginData((current) => ({ ...current, password: "" }));
      setIsManagerResetModalOpen(false);
      setSystemMessage({
        title: "Password Reset",
        message:
          "The Area Manager password was reset successfully. It must be changed after the next login.",
      });
    } catch (error) {
      setIsManagerResetModalOpen(false);
      setSystemMessage({
        title: "Reset Failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to reset the Area Manager password.",
      });
    } finally {
      setIsManagerResetSubmitting(false);
    }
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
      setSystemMessage({
        title: "Password Updated",
        message: "Staff password updated. You can now sign in with the new password.",
      });
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
        <div
          className={`login-card${
            loginData.role === "instructor" ? " is-instructor-login" : ""
          }`}
        >
          <div className="login-content">
            <div className="header-text">
              <h1 className="login-title">Login</h1>
              <p className="pent">Enter your credentials to continue</p>
              <p className="selected-branch-display">
                Access Role: <strong>{STAFF_ROLE_LABELS[loginData.role]}</strong>
              </p>
              {!isAreaManager ? (
                <p className="selected-branch-display">
                  Branch:{" "}
                  <strong className={!loginData.branch ? "placeholder" : ""}>
                    {loginData.branch || "Not selected"}
                  </strong>
                </p>
              ) : null}
            </div>

            <form className="login-form" onSubmit={handleLogin}>
              <div className="form-groups">
                <label htmlFor="role">Access Role</label>
                <div className="staff-select-wrapper">
                  <select
                    id="role"
                    name="role"
                    value={loginData.role}
                    onChange={(event) => {
                      const role = event.target.value as StaffLoginAccessRole;
                      setLoginData((current) => ({
                        ...current,
                        role,
                        branch: role === "manager" ? "" : current.branch,
                        employeeId: role === "instructor" ? current.employeeId : "",
                      }));
                    }}
                  >
                    <option value="admin">Administrator</option>
                    <option value="registrar">Registrar</option>
                    <option value="manager">Area Manager</option>
                    <option value="instructor">Instructor</option>
                  </select>
                  <span className="staff-select-arrow" aria-hidden="true">
                    <MdKeyboardArrowDown size={18} />
                  </span>
                </div>
              </div>

              {!isAreaManager ? (
                <div className="form-groups">
                  <label htmlFor="branch">Select Branch</label>
                  <div className="staff-select-wrapper">
                    <select
                      id="branch"
                      name="branch"
                      value={loginData.branch}
                      onChange={(event) => {
                        const branch = event.target.value;
                        setLoginData((current) => ({ ...current, branch }));
                      }}
                      required
                    >
                      <option value="">Select Branch</option>
                      {managedBranches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                    <span className="staff-select-arrow" aria-hidden="true">
                      <MdKeyboardArrowDown size={18} />
                    </span>
                  </div>
                </div>
              ) : null}

              {loginData.role === "instructor" ? (
                <div className="form-groups">
                  <label htmlFor="employeeId">Employee ID</label>
                  <input
                    id="employeeId"
                    type="text"
                    value={loginData.employeeId}
                    onChange={(event) =>
                      setLoginData((current) => ({
                        ...current,
                        employeeId: event.target.value.toUpperCase(),
                      }))
                    }
                    autoComplete="username"
                    required
                  />
                </div>
              ) : null}

              <div className="divider"></div>

              <div className="form-groups">
                <label htmlFor="password">Password</label>
                <div className="password-wrapper">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={loginData.password}
                    onChange={(event) =>
                      setLoginData((current) => ({
                        ...current,
                        password: event.target.value,
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
                >
                  {isAreaManager ? "Reset password" : "Forgot password?"}
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
        isOpen={isManagerResetModalOpen}
        title="Reset Area Manager Password"
        description=""
        onClose={handleCloseManagerResetModal}
        footer={
          <>
            <button
              type="button"
              className="reset-cancel-btn"
              onClick={handleCloseManagerResetModal}
              disabled={isManagerResetSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="reset-submit-btn"
              onClick={() => void handleConfirmManagerPasswordReset()}
              disabled={isManagerResetSubmitting}
            >
              {isManagerResetSubmitting ? "Resetting..." : "Reset Password"}
            </button>
          </>
        }
      >
        <p className="reset-confirmation-copy">
          Existing Area Manager sessions will be signed out. The password must
          be changed after the next login.
        </p>
      </AuthModal>

      <AuthModal
        isOpen={isSetupModalOpen}
        title="Change Temporary Password"
        onClose={handleCloseSetupModal}
        footer={
          <>
            <button
              type="button"
              className="reset-cancel-btn"
              onClick={handleCloseSetupModal}
              disabled={isSetupSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="staff-setup-form"
              className="reset-submit-btn"
              disabled={isSetupSubmitting}
            >
              {isSetupSubmitting ? "Updating..." : "Continue"}
            </button>
          </>
        }
      >
        <form
          id="staff-setup-form"
          className="reset-form"
          onSubmit={handleCompletePasswordSetup}
        >
          <div className="staff-login-setup-summary">
            <strong>{setupData.fullName || "Staff Account"}</strong>
            <span>
              {STAFF_ROLE_LABELS[setupData.role]} | {setupData.branch}
            </span>
          </div>

          <div className="form-groups">
            <label htmlFor="setup-password">New Password</label>
            <div className="password-wrapper reset-password-wrapper">
              <input
                id="setup-password"
                type={showSetupPassword ? "text" : "password"}
                value={setupData.newPassword}
                onChange={(event) =>
                  setSetupData((current) => ({
                    ...current,
                    newPassword: event.target.value,
                  }))
                }
                autoComplete="new-password"
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() =>
                  setShowSetupPassword((previousValue) => !previousValue)
                }
              >
                {showSetupPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <div className="form-groups">
            <label htmlFor="setup-confirm-password">Confirm Password</label>
            <div className="password-wrapper reset-password-wrapper">
              <input
                id="setup-confirm-password"
                type={showSetupConfirmPassword ? "text" : "password"}
                value={setupData.confirmPassword}
                onChange={(event) =>
                  setSetupData((current) => ({
                    ...current,
                    confirmPassword: event.target.value,
                  }))
                }
                autoComplete="new-password"
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() =>
                  setShowSetupConfirmPassword((previousValue) => !previousValue)
                }
              >
                {showSetupConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          {setupFeedback ? (
            <p className={`reset-feedback ${setupFeedback.type}`}>
              {setupFeedback.message}
            </p>
          ) : null}
        </form>
      </AuthModal>

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
        <form
          id="staff-reset-form"
          className="reset-form"
          onSubmit={handleResetPassword}
        >
          <div className="reset-grid">
            <div className="form-groups">
              <label htmlFor="reset-branch">Branch</label>
              <div className="staff-select-wrapper">
                <select
                  id="reset-branch"
                  value={resetData.branch}
                  onChange={(event) =>
                    setResetData((current) => ({
                      ...current,
                      branch: event.target.value,
                    }))
                  }
                >
                  <option value="">Select Branch</option>
                  {managedBranches.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
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
                  onChange={(event) =>
                    setResetData((current) => ({
                      ...current,
                      role: event.target.value as StaffResetAccessRole,
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
              onChange={(event) =>
                setResetData((current) => ({
                  ...current,
                  email: event.target.value,
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
              onChange={(event) =>
                setResetData((current) => ({
                  ...current,
                  contactNumber: event.target.value,
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
                onChange={(event) =>
                  setResetData((current) => ({
                    ...current,
                    newPassword: event.target.value,
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
                onChange={(event) =>
                  setResetData((current) => ({
                    ...current,
                    confirmPassword: event.target.value,
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

      <AuthModal
        isOpen={Boolean(systemMessage)}
        title={systemMessage?.title || ""}
        description=""
        onClose={() => setSystemMessage(null)}
        footer={
          <button
            type="button"
            className="system-message-btn"
            onClick={() => setSystemMessage(null)}
          >
            OK
          </button>
        }
      >
        <p className="staff-system-message-text">{systemMessage?.message}</p>
      </AuthModal>
    </div>
  );
}

export default StaffLogin;
