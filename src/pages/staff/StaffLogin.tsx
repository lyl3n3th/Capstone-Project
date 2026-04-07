import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { useAuth } from "../../hooks/useAuth";
import { authenticateManager } from "../../services/mockStaffAuth";
import {
  authenticateStaffLogin,
  type StaffBranch,
} from "../../services/staffApi";
import type { StaffRole } from "../../types/user";
import "../../styles/staff/staff-login.css";

function StaffLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginStaff, getDefaultRouteForRole } = useAuth();
  const [selectedBranch, setSelectedBranch] = useState("");
  const [isAreaManager, setIsAreaManager] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [loginData, setLoginData] = useState({
    branch: "",
    password: "",
    role: "admin" as StaffRole,
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
                  </div>

                  <div className="form-groups">
                    <label htmlFor="role">Access Role</label>
                    <select
                      id="role"
                      name="role"
                      value={loginData.role}
                      onChange={(e) =>
                        setLoginData((current) => ({
                          ...current,
                          role: e.target.value as StaffRole,
                        }))
                      }
                    >
                      <option value="admin">Administrator</option>
                      <option value="registrar">Registrar</option>
                    </select>
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
                <a href="#" className="forgot-link">
                  Forgot password?
                </a>
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
    </div>
  );
}

export default StaffLogin;
