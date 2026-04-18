import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import slidelog from "../../assets/images/slidelog.jpg";
import slidelog2 from "../../assets/images/slidelog2.jpg";
import slidelog3 from "../../assets/images/slidelog3.jpg";
import bg from "../../assets/images/bg.jpg";
import aicslogst from "../../assets/images/aicslogst-2.png";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import AuthModal from "../../components/common/AuthModal";
import { useAuth } from "../../hooks/useAuth";
import {
  getBranchFromStudentNumber,
  getStudentNumberExample,
  isValidStudentNumber,
  normalizeStudentNumberInput,
} from "../../services/adminStorage";
import { resetStudentPortalPassword } from "../../services/auth";
import "../../styles/student/student-login.css";

function StudentLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginStudent } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
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
    studentNumber: "",
    password: "",
  });
  const [resetData, setResetData] = useState({
    studentNumber: "",
    email: "",
    mobile: "",
    newPassword: "",
    confirmPassword: "",
  });

  const slides = [bg, slidelog, slidelog2, slidelog3];

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [slides.length]);

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const branch = queryParams.get("branch") || undefined;
    const studentNumber = normalizeStudentNumberInput(
      queryParams.get("studentNumber") || "",
      branch,
    );

    if (!studentNumber) {
      return;
    }

    setLoginData((prev) => ({
      ...prev,
      studentNumber,
    }));
  }, [location.search]);

  const goToPrevious = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const goToNext = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  const handleStudentNumberChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const normalizedStudentNumber = normalizeStudentNumberInput(e.target.value);

    setLoginData((prev) => ({
      ...prev,
      studentNumber: normalizedStudentNumber,
    }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedStudentNumber = normalizeStudentNumberInput(
      loginData.studentNumber,
    );

    if (!isValidStudentNumber(normalizedStudentNumber)) {
      alert("Please enter a valid student number (e.g., BAC-261001).");
      return;
    }

    const redirectPath =
      (location.state as { from?: { pathname?: string } } | null)?.from
        ?.pathname || "/student/home";

    try {
      setIsSubmitting(true);
      await loginStudent({
        studentNumber: normalizedStudentNumber,
        password: loginData.password,
      });
      navigate(redirectPath, { replace: true });
    } catch (error) {
      console.error("Student login failed", error);
      alert(
        error instanceof Error
          ? error.message
          : "Unable to sign in right now. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenResetModal = () => {
    setResetFeedback(null);
    setShowResetPassword(false);
    setShowResetConfirmPassword(false);
    setResetData((current) => ({
      ...current,
      studentNumber:
        normalizeStudentNumberInput(loginData.studentNumber) || current.studentNumber,
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

    const normalizedStudentNumber = normalizeStudentNumberInput(
      resetData.studentNumber,
    );

    if (!isValidStudentNumber(normalizedStudentNumber)) {
      setResetFeedback({
        type: "error",
        message: "Please enter a valid student number.",
      });
      return;
    }

    if (!resetData.email.trim() || !resetData.mobile.trim()) {
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

      const result = await resetStudentPortalPassword({
        studentNumber: normalizedStudentNumber,
        email: resetData.email,
        mobile: resetData.mobile,
        newPassword: resetData.newPassword,
      });

      const nextStudentNumber = normalizeStudentNumberInput(result.studentNumber);

      setLoginData((current) => ({
        ...current,
        studentNumber: nextStudentNumber,
        password: resetData.newPassword,
      }));
      setResetData((current) => ({
        ...current,
        studentNumber: nextStudentNumber,
        newPassword: "",
        confirmPassword: "",
      }));

      setIsResetModalOpen(false);
      alert("Student password updated. You can now sign in with the new password.");
    } catch (error) {
      console.error("Student password reset failed", error);
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

  const inferredBranch = getBranchFromStudentNumber(loginData.studentNumber);

  return (
    <div className="student-login-page">
      <div className="login-wrapper">
        <div className="swiper-side">
          <div className="custom-slider">
            {slides.map((src, index) => (
              <div
                key={index}
                className={`slide ${index === currentSlide ? "active" : ""}`}
                style={{ backgroundImage: `url(${src})` }}
              />
            ))}
            <div className="slide-overlay" />
            <button className="nav-arrow prev" onClick={goToPrevious}>
              {"<"}
            </button>
            <button className="nav-arrow next" onClick={goToNext}>
              {">"}
            </button>
            <div className="dots">
              {slides.map((_, index) => (
                <span
                  key={index}
                  className={`dot ${index === currentSlide ? "active" : ""}`}
                  onClick={() => goToSlide(index)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="login-card">
          <div className="login-content">
            <div className="logo-header">
              <img src={aicslogst} className="logo-1" alt="Logo" />
            </div>
            <div className="header-text">
              <p className="pent">Enter your credentials to continue</p>
              <p className="selected-branch-display">
                Detected Branch:{" "}
                <strong className={!inferredBranch ? "placeholder" : ""}>
                  {inferredBranch || "Will appear from student number"}
                </strong>
              </p>
            </div>

            <form className="login-form" onSubmit={handleLogin}>
              <div className="form-groups">
                <label htmlFor="username">Student Number</label>
                <input
                  id="username"
                  type="text"
                  name="studentNumber"
                  value={loginData.studentNumber}
                  onChange={handleStudentNumberChange}
                  placeholder={getStudentNumberExample(inferredBranch)}
                  maxLength={10}
                  pattern="[A-Za-z]{3}-[0-9]{6}"
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
                      setLoginData((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
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
                <button
                  type="button"
                  className="forgot-link"
                  onClick={handleOpenResetModal}
                >
                  Forgot password?
                </button>
              </div>

              <button type="submit" className="submit-btn" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Submit"}
              </button>
            </form>

            <p className="register-prompt">
              Don't have an account?{" "}
              <Link to="/student/registration" className="register-link">
                Create one now
              </Link>
            </p>
          </div>
        </div>
      </div>

      <AuthModal
        isOpen={isResetModalOpen}
        title="Reset Student Password"
        description="Verify your student portal details, then choose a new password."
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
              form="student-reset-form"
              className="reset-submit-btn"
              disabled={isResetSubmitting}
            >
              {isResetSubmitting ? "Updating..." : "Update Password"}
            </button>
          </>
        }
      >
        <form
          id="student-reset-form"
          className="reset-form"
          onSubmit={handleResetPassword}
        >
          <div className="form-groups">
            <label htmlFor="reset-student-number">Student Number</label>
            <input
              id="reset-student-number"
              type="text"
              value={resetData.studentNumber}
              onChange={(e) =>
                setResetData((current) => ({
                  ...current,
                  studentNumber: normalizeStudentNumberInput(e.target.value),
                }))
              }
              placeholder="BAC-261001"
              maxLength={10}
              autoComplete="username"
            />
          </div>

          <div className="form-groups">
            <label htmlFor="reset-student-email">Email Address</label>
            <input
              id="reset-student-email"
              type="email"
              value={resetData.email}
              onChange={(e) =>
                setResetData((current) => ({
                  ...current,
                  email: e.target.value,
                }))
              }
              placeholder="Enter the registered email"
              autoComplete="email"
            />
          </div>

          <div className="form-groups">
            <label htmlFor="reset-student-mobile">Mobile Number</label>
            <input
              id="reset-student-mobile"
              type="text"
              value={resetData.mobile}
              onChange={(e) =>
                setResetData((current) => ({
                  ...current,
                  mobile: e.target.value,
                }))
              }
              placeholder="Enter the registered mobile number"
              autoComplete="tel"
            />
          </div>

          <div className="form-groups">
            <label htmlFor="reset-student-password">New Password</label>
            <div className="password-wrapper reset-password-wrapper">
              <input
                id="reset-student-password"
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
            <label htmlFor="reset-student-confirm-password">
              Confirm Password
            </label>
            <div className="password-wrapper reset-password-wrapper">
              <input
                id="reset-student-confirm-password"
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

export default StudentLogin;
