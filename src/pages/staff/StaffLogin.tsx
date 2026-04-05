import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { useAuth } from "../../hooks/useAuth";
import { authenticateStaff } from "../../services/mockStaffAuth";
import type { StaffRole } from "../../types/user";
import "../../styles/staff/staff-login.css";

function StaffLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginStaff, getDefaultRouteForRole } = useAuth();
  const [selectedBranch, setSelectedBranch] = useState("");
  const [isMenuOpenBranch, setIsMenuOpenBranch] = useState(false);
  const [isAreaManager, setIsAreaManager] = useState(false);
  const wrapperRefBranch = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [loginData, setLoginData] = useState({
    branch: "",
    password: "",
    role: "admin" as StaffRole,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRefBranch.current &&
        !wrapperRefBranch.current.contains(event.target as Node)
      ) {
        setIsMenuOpenBranch(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAreaManagerToggle = (checked: boolean) => {
    setIsAreaManager(checked);
    setIsMenuOpenBranch(false);
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

    if (!loginData.password) {
      alert("Please enter your password!");
      return;
    }

    const redirectPath = (
      location.state as { from?: { pathname?: string } } | null
    )?.from?.pathname;
    const selectedRole = isAreaManager ? "manager" : loginData.role;

    try {
      setIsSubmitting(true);

      const staffAccount = authenticateStaff(
        loginData.branch,
        loginData.password,
        selectedRole,
      );

      if (!staffAccount) {
        alert("Invalid login credentials. Please try again.");
        return;
      }

      await loginStaff({
        branch: staffAccount.branch,
        fullName: staffAccount.fullName,
        password: loginData.password,
        role: staffAccount.role,
      });

      const nextPath =
        redirectPath && redirectPath !== "/staff/login"
          ? redirectPath
          : getDefaultRouteForRole(staffAccount.role);

      navigate(nextPath, { replace: true });
    } catch (error) {
      console.error("Staff login failed", error);
      alert("Unable to sign in right now. Please try again.");
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
                {isAreaManager && (
                  <span className="manager-badge">
                    Branches (bacoor, gma, taytay)
                  </span>
                )}
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
                    Branch selection is skipped in this mode. Continue directly
                    with your password to sign in across all branches.
                  </p>
                </div>
              ) : (
                <div className="dropdownlog" ref={wrapperRefBranch}>
                  <div className="branch-label-row">
                    <label className="lbel">Select Branch</label>
                  </div>
                  <button
                    type="button"
                    className={`selectlog ${isMenuOpenBranch ? "select-clicked" : ""}`}
                    onClick={() => setIsMenuOpenBranch((previous) => !previous)}
                    aria-expanded={isMenuOpenBranch}
                    aria-haspopup="listbox"
                  >
                    <span className="selectedlog">
                      {selectedBranch || "Select Branch"}
                    </span>
                    <div
                      className={`cart ${isMenuOpenBranch ? "cart-rotate" : ""}`}
                    ></div>
                  </button>
                  <ul
                    className={`menulog ${isMenuOpenBranch ? "show" : ""}`}
                    role="listbox"
                  >
                    {["Taytay", "Bacoor", "GMA"].map((branch) => (
                      <li
                        key={branch}
                        role="option"
                        onClick={() => {
                          setSelectedBranch(branch);
                          setLoginData((current) => ({ ...current, branch }));
                          setIsMenuOpenBranch(false);
                        }}
                      >
                        {branch}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="divider"></div>

              {!isAreaManager && (
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
              )}

              <p className="login-mode-hint"></p>

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
