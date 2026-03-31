import { useState, useEffect, useRef } from "react";
import aicslogst from "../../assets/images/aicslogst-2.png";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import "../../styles/student/student-regis.css";

function StudentRegistration() {
  const [selectedBranch, setSelectedBranch] = useState("");
  const [isMenuOpenBranch, setIsMenuOpenBranch] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const wrapperRefBranch = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRefBranch.current &&
        !wrapperRefBranch.current.contains(event.target as Node)
      ) {
        setIsMenuOpenBranch(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [formData, setFormData] = useState({
    studentNumber: "",
    email: "",
    mobile: "",
    birthDate: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Phone number formatting function
  const formatPhoneNumber = (value: string) => {
    // Remove all non-digit characters
    const cleaned = value.replace(/\D/g, "");

    // Limit to 11 digits (Philippine mobile number)
    const limited = cleaned.slice(0, 11);

    // Format as 0912 123 1234
    if (limited.length <= 4) {
      return limited;
    } else if (limited.length <= 7) {
      return `${limited.slice(0, 4)} ${limited.slice(4)}`;
    } else {
      return `${limited.slice(0, 4)} ${limited.slice(4, 7)} ${limited.slice(7, 11)}`;
    }
  };

  // Handle phone number input with formatting
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const formatted = formatPhoneNumber(rawValue);
    setFormData((prev) => ({ ...prev, mobile: formatted }));
  };

  // Get raw digits for validation (remove spaces)
  const getRawPhoneNumber = (formatted: string) => {
    return formatted.replace(/\D/g, "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBranch) {
      alert("Please select a branch before registering!");
      return;
    }

    const rawPhone = getRawPhoneNumber(formData.mobile);
    if (rawPhone.length < 11) {
      alert(
        "Invalid Mobile number. Please enter 11 digits (e.g., 09123456789)",
      );
      return;
    }

    if (formData.password.length < 8) {
      alert("Password must be at least 8 characters long.");
      setFormData((prev) => ({
        ...prev,
        password: "",
        confirmPassword: "",
      }));
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match.");
      setFormData((prev) => ({
        ...prev,
        password: "",
        confirmPassword: "",
      }));
      return;
    }

    // TODO: Connect to actual backend after normalization
    console.log("Registration attempt:", {
      ...formData,
      mobile: rawPhone, // Send raw digits to backend
      branch: selectedBranch,
    });
    alert(`Registration attempted for branch: ${selectedBranch}`);

    // Uncomment when backend is ready:
    // const response = await fetch("http://127.0.0.1:8000/api/admissions/register/", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     ...formData,
    //     mobile: rawPhone, // Send raw digits
    //     branch: selectedBranch
    //   }),
    // });
    // const result = await response.json();
    // alert(result.message);
    //
    // if (response.ok) {
    //   setFormData({
    //     studentNumber: "",
    //     email: "",
    //     mobile: "",
    //     birthDate: "",
    //     password: "",
    //     confirmPassword: "",
    //   });
    //   setSelectedBranch("");
    // }
  };

  return (
    <div className="student-registration-page">
      <div className="registration-wrapper">
        <div className="registration-card">
          <div className="registration-content">
            <div className="registration-header">
              <img
                src={aicslogst}
                alt="AICS Logo"
                className="registration-logo"
              />
              <h1 className="registration-title">Account Registration</h1>
              <p className="registration-branch-display">
                Branch:{" "}
                <strong className={!selectedBranch ? "placeholder" : ""}>
                  {!selectedBranch ? "—" : selectedBranch}
                </strong>
              </p>
            </div>

            <div className="registration-divider"></div>

            <form className="registration-form" onSubmit={handleSubmit}>
              <div className="registration-branch-section">
                <div className="dropdown-reg" ref={wrapperRefBranch}>
                  <label className="dropdown-label">Select Branch</label>
                  <div
                    className={`dropdown-select ${isMenuOpenBranch ? "select-clicked" : ""}`}
                    onClick={() => setIsMenuOpenBranch((p) => !p)}
                  >
                    <span className="dropdown-selected">
                      {selectedBranch || "Select branch"}
                    </span>
                    <div
                      className={`dropdown-arrow ${isMenuOpenBranch ? "arrow-rotate" : ""}`}
                    ></div>
                  </div>

                  <ul
                    className={`dropdown-menu ${isMenuOpenBranch ? "show" : ""}`}
                  >
                    {["Taytay", "Bacoor", "GMA"].map((branch) => (
                      <li
                        key={branch}
                        onClick={() => {
                          setSelectedBranch(branch);
                          setIsMenuOpenBranch(false);
                        }}
                      >
                        {branch}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="registration-grid">
                <div className="registration-grid-column">
                  <div className="form-field">
                    <label htmlFor="studentNumber">Student Number</label>
                    <input
                      id="studentNumber"
                      type="text"
                      name="studentNumber"
                      value={formData.studentNumber}
                      onChange={handleChange}
                      placeholder="261001"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      title="Format: 6-digit number (e.g., 261001)"
                      required
                    />
                    <small className="field-hint"></small>
                  </div>

                  <div className="form-field">
                    <label htmlFor="email">Email Address</label>
                    <input
                      id="email"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="student@example.com"
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="mobile">Mobile Number</label>
                    <input
                      id="mobile"
                      type="tel"
                      name="mobile"
                      value={formData.mobile}
                      onChange={handlePhoneChange}
                      placeholder="0912 123 1234"
                      maxLength={14}
                      required
                    />
                    <small className="field-hint">
                      Format: 0912 123 1234 (11 digits)
                    </small>
                  </div>
                </div>

                <div className="registration-grid-column">
                  <div className="form-field">
                    <label htmlFor="birthDate">Date of Birth</label>
                    <input
                      id="birthDate"
                      type="date"
                      name="birthDate"
                      value={formData.birthDate}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="password">Password</label>
                    <div className="password-input-wrapper">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="Minimum 8 characters"
                        required
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>

                  <div className="form-field">
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <div className="password-input-wrapper">
                      <input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        placeholder="Confirm your password"
                        required
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                      >
                        {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <button type="submit" className="registration-submit-btn">
                Register
              </button>
            </form>

            <p className="registration-prompt">
              Already have an account?{" "}
              <a href="/student/login" className="registration-link">
                Sign in here
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudentRegistration;
