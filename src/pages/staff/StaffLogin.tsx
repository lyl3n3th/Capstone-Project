// src/pages/staff/StaffLogin.tsx
import { useState, useRef } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import "../../styles/staff/staff-login.css";

function StaffLogin() {
  const [selectedBranch, setSelectedBranch] = useState("");
  const [isMenuOpenBranch, setIsMenuOpenBranch] = useState(false);
  const wrapperRefBranch = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [loginData, setLoginData] = useState({
    branch: "",
    username: "",
    password: "",
  });

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cleaned = value.replace(/[^a-zA-Z0-9_.]/g, "");
    const limited = cleaned.slice(0, 20);
    setLoginData({ ...loginData, username: limited });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loginData.branch) {
      alert("Please select a branch!");
      return;
    }

    if (!loginData.username) {
      alert("Please enter your username!");
      return;
    }

    if (loginData.username.length < 3) {
      alert("Username must be at least 3 characters!");
      return;
    }

    if (!loginData.password) {
      alert("Please enter your password!");
      return;
    }

    console.log("Staff Login attempt:", loginData);
    alert(`Login attempt for branch: ${loginData.branch}`);
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
                <label htmlFor="username">Username / Employee ID</label>
                <input
                  id="username"
                  type="text"
                  name="username"
                  value={loginData.username}
                  onChange={handleUsernameChange}
                  placeholder="admin_lyle or AICS-123"
                  maxLength={20}
                  required
                />
              </div>

              <div className="form-groups">
                <label htmlFor="password">Password</label>
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

              <button type="submit" className="submit-btn">
                Login
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StaffLogin;
