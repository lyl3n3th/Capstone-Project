// src/pages/staff/StaffLogin.tsx
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
  const { loginStaff } = useAuth();
  const [selectedBranch, setSelectedBranch] = useState("");
  const [isMenuOpenBranch, setIsMenuOpenBranch] = useState(false);
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loginData.branch) {
      alert("Please select a branch!");
      return;
    }

    if (!loginData.password) {
      alert("Please enter your password!");
      return;
    }

    const redirectPath =
      (location.state as { from?: { pathname?: string } } | null)?.from
        ?.pathname || "/admin/dashboard";

    try {
      setIsSubmitting(true);

      // Authenticate against mock data
      const staffAccount = authenticateStaff(
        loginData.branch,
        loginData.password,
        loginData.role,
      );

      if (!staffAccount) {
        alert("Invalid branch, role, or password. Please try again.");
        return;
      }

      // Log in with the authenticated staff member's full name and role
      await loginStaff({
        branch: staffAccount.branch,
        fullName: staffAccount.fullName,
        password: loginData.password,
        role: staffAccount.role,
      });

      navigate(redirectPath, { replace: true });
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
                Branch:{" "}
                <strong className={!selectedBranch ? "placeholder" : ""}>
                  {!selectedBranch ? "—" : selectedBranch}
                </strong>
              </p>
            </div>

            <form className="login-form" onSubmit={handleLogin}>
              <div className="dropdownlog" ref={wrapperRefBranch}>
                <label className="lbel">Select Branch</label>
                <div
                  className={`selectlog ${isMenuOpenBranch ? "select-clicked" : ""}`}
                  onClick={() => setIsMenuOpenBranch((p) => !p)}
                >
                  <span className="selectedlog">
                    {selectedBranch || "Select Branch"}
                  </span>
                  <div
                    className={`cart ${isMenuOpenBranch ? "cart-rotate" : ""}`}
                  ></div>
                </div>
                <ul className={`menulog ${isMenuOpenBranch ? "show" : ""}`}>
                  {["Taytay", "Bacoor", "GMA"].map((branch) => (
                    <li
                      key={branch}
                      onClick={() => {
                        setSelectedBranch(branch);
                        setLoginData({ ...loginData, branch });
                        setIsMenuOpenBranch(false);
                      }}
                    >
                      {branch}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="divider"></div>

              <div className="form-groups">
                <label htmlFor="role">Access Role</label>
                <select
                  id="role"
                  name="role"
                  value={loginData.role}
                  onChange={(e) =>
                    setLoginData({
                      ...loginData,
                      role: e.target.value as StaffRole,
                    })
                  }
                >
                  <option value="admin">Administrator</option>
                  <option value="registrar">Registrar</option>
                  <option value="manager">Manager</option>
                </select>
              </div>

              <div className="form-groups">
                <div className="password-wrapper">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={loginData.password}
                    onChange={(e) =>
                      setLoginData({ ...loginData, password: e.target.value })
                    }
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
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

              <button type="submit" className="submit-btn" disabled={isSubmitting}>
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

