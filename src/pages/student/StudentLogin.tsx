import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import slidelog from "../../assets/images/slidelog.jpg";
import slidelog2 from "../../assets/images/slidelog2.jpg";
import slidelog3 from "../../assets/images/slidelog3.jpg";
import bg from "../../assets/images/bg.jpg";
import aicslogst from "../../assets/images/aicslogst-2.png";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { useAuth } from "../../hooks/useAuth";
import {
  getBranchFromStudentNumber,
  getStudentNumberExample,
  isValidStudentNumber,
  normalizeStudentNumberInput,
} from "../../services/adminStorage";
import "../../styles/student/student-login.css";

function StudentLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginStudent } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginData, setLoginData] = useState({
    studentNumber: "",
    password: "",
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
                <a href="#" className="forgot-link">
                  Forgot password?
                </a>
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
    </div>
  );
}

export default StudentLogin;
