import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import aicslogst from "../../assets/images/aicslogst-2.png";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import SystemAlertModal from "../../components/common/SystemAlertModal";
import {
  activateApprovedStudent,
  registerStudentPortalAccount,
} from "../../services/auth";
import {
  findApprovedEnrolleeByStudentNumber,
  getBranchFromStudentNumber,
  getStudentNumberExample,
  isValidStudentNumber,
  normalizeStudentNumberInput,
  syncApprovedStudentNumber,
} from "../../services/adminStorage";
import "../../styles/student/student-regis.css";

function StudentRegistration() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [systemAlert, setSystemAlert] = useState<{
    title: string;
    message: string;
    onClose?: () => void;
  } | null>(null);

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

  const handleStudentNumberChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const normalizedStudentNumber = normalizeStudentNumberInput(e.target.value);
    setFormData((prev) => ({ ...prev, studentNumber: normalizedStudentNumber }));
  };

  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    const limited = cleaned.slice(0, 11);

    if (limited.length <= 4) {
      return limited;
    }

    if (limited.length <= 7) {
      return `${limited.slice(0, 4)} ${limited.slice(4)}`;
    }

    return `${limited.slice(0, 4)} ${limited.slice(4, 7)} ${limited.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const formatted = formatPhoneNumber(rawValue);
    setFormData((prev) => ({ ...prev, mobile: formatted }));
  };

  const getRawPhoneNumber = (formatted: string) => {
    return formatted.replace(/\D/g, "");
  };

  const showSystemAlert = (
    title: string,
    message: string,
    onClose?: () => void,
  ) => {
    setSystemAlert({ title, message, onClose });
  };

  const closeSystemAlert = () => {
    const closeAction = systemAlert?.onClose;
    setSystemAlert(null);
    closeAction?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedStudentNumber = normalizeStudentNumberInput(
      formData.studentNumber,
    );

    if (!isValidStudentNumber(normalizedStudentNumber)) {
      showSystemAlert(
        "Check Student Number",
        "Please enter a valid student number in the format BAC-261001.",
      );
      return;
    }

    const rawPhone = getRawPhoneNumber(formData.mobile);
    if (rawPhone.length < 11) {
      showSystemAlert(
        "Check Mobile Number",
        "Invalid Mobile number. Please enter 11 digits (e.g., 09123456789)",
      );
      return;
    }

    if (formData.password.length < 8) {
      showSystemAlert(
        "Check Password",
        "Password must be at least 8 characters long.",
      );
      setFormData((prev) => ({
        ...prev,
        password: "",
        confirmPassword: "",
      }));
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      showSystemAlert("Check Password", "Passwords do not match.");
      setFormData((prev) => ({
        ...prev,
        password: "",
        confirmPassword: "",
      }));
      return;
    }

    try {
      setIsSubmitting(true);
      let resolvedStudentNumber = normalizedStudentNumber;
      const attemptRegistration = (studentNumber: string) =>
        registerStudentPortalAccount({
          studentNumber,
          email: formData.email,
          mobile: rawPhone,
          birthDate: formData.birthDate,
          password: formData.password,
        });
      let registeredIdentity;

      try {
        registeredIdentity = await attemptRegistration(resolvedStudentNumber);
        resolvedStudentNumber =
          registeredIdentity.studentNumber || resolvedStudentNumber;
      } catch (error) {
        const shouldTryLocalBackfill =
          error instanceof Error &&
          /was not found|admission has not been approved yet/i.test(
            error.message,
          );

        if (!shouldTryLocalBackfill) {
          throw error;
        }

        const approvedEnrollee = findApprovedEnrolleeByStudentNumber({
          studentNumber: normalizedStudentNumber,
        });

        if (!approvedEnrollee?.trackingNumber) {
          throw error;
        }

        const activatedIdentity = await activateApprovedStudent(
          approvedEnrollee.trackingNumber,
        );
        resolvedStudentNumber =
          activatedIdentity.studentNumber || resolvedStudentNumber;

        syncApprovedStudentNumber({
          trackingNumber: approvedEnrollee.trackingNumber,
          previousStudentNumber:
            approvedEnrollee.studentNumber || normalizedStudentNumber,
          nextStudentNumber: resolvedStudentNumber,
        });

        registeredIdentity = await attemptRegistration(resolvedStudentNumber);
        resolvedStudentNumber =
          registeredIdentity.studentNumber || resolvedStudentNumber;
      }

      const successMessage =
        resolvedStudentNumber !== normalizedStudentNumber
          ? `Registration successful. Your student number is ${resolvedStudentNumber}. You can now sign in to the student portal.`
          : "Registration successful. You can now sign in to the student portal.";
      showSystemAlert(
        "Registration Successful",
        successMessage,
        () =>
          navigate(
            `/student/login?studentNumber=${encodeURIComponent(resolvedStudentNumber)}`,
            { replace: true },
          ),
      );
    } catch (error) {
      console.error("Student registration failed", error);
      showSystemAlert(
        "Unable to Register",
        error instanceof Error
          ? error.message
          : "Unable to register right now. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inferredBranch = getBranchFromStudentNumber(formData.studentNumber);

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
                Detected Branch:{" "}
                <strong className={!inferredBranch ? "placeholder" : ""}>
                  {inferredBranch || "Will appear from student number"}
                </strong>
              </p>
            </div>

            <div className="registration-divider"></div>

            <form className="registration-form" onSubmit={handleSubmit}>
              <div className="registration-grid">
                <div className="registration-grid-column">
                  <div className="form-field">
                    <label htmlFor="studentNumber">Student Number</label>
                    <input
                      id="studentNumber"
                      type="text"
                      name="studentNumber"
                      value={formData.studentNumber}
                      onChange={handleStudentNumberChange}
                      placeholder={getStudentNumberExample(inferredBranch)}
                      maxLength={10}
                      pattern="[A-Za-z]{3}-[0-9]{6}"
                      title="Format: BAC-261001"
                      required
                    />
                    <small className="field-hint">
                      Use your full student number, like BAC-261001, TAY-261001, or GMA-261001.
                    </small>
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

              <button
                type="submit"
                className="registration-submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Registering..." : "Register"}
              </button>
            </form>

            <p className="registration-prompt">
              Already have an account?{" "}
              <Link to="/student/login" className="registration-link">
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
      <SystemAlertModal
        isOpen={Boolean(systemAlert)}
        title={systemAlert?.title || ""}
        message={systemAlert?.message || ""}
        onClose={closeSystemAlert}
      />
    </div>
  );
}

export default StudentRegistration;
