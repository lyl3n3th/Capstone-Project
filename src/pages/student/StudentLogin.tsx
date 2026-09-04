import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import slidelog from "../../assets/images/slidelog.jpg";
import slidelog2 from "../../assets/images/slidelog2.jpg";
import slidelog3 from "../../assets/images/slidelog3.jpg";
import bg from "../../assets/images/bg.jpg";
import aicslogst from "../../assets/images/aicslogst-2.png";
import AuthModal from "../../components/common/AuthModal";
import { useAuth } from "../../hooks/useAuth";
import "../../styles/student/student-login.css";

function StudentLogin() {
  const navigate = useNavigate();
  const { currentUser, isReady, loginStudentWithGoogle } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [systemMessage, setSystemMessage] = useState<{
    title: string;
    message: string;
    type: "error" | "success" | "warning";
  } | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const googleLoginError = window.sessionStorage.getItem(
      "student-google-login-error",
    );

    if (!googleLoginError) {
      return null;
    }

    window.sessionStorage.removeItem("student-google-login-error");
    return {
      title: "Unable to Sign In",
      message: googleLoginError,
      type: "error",
    };
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
    if (isReady && currentUser?.role === "student") {
      navigate("/student/home", { replace: true });
    }
  }, [currentUser, isReady, navigate]);

  const goToPrevious = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const goToNext = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  const handleGoogleLogin = async () => {
    try {
      setIsSubmitting(true);
      await loginStudentWithGoogle();
    } catch (error) {
      console.error("Student Google login failed", error);
      setSystemMessage({
        title: "Unable to Sign In",
        message:
          error instanceof Error
            ? error.message
            : "Unable to continue with Google right now. Please try again.",
        type: "error",
      });
      setIsSubmitting(false);
    }
  };

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
              <p className="pent">Use the Google account from your accepted admission.</p>
            </div>

            <button
              type="button"
              className="google-login-btn"
              disabled={isSubmitting || !isReady}
              onClick={handleGoogleLogin}
            >
              <span className="google-login-icon" aria-hidden="true">
                G
              </span>
              {isSubmitting ? "Redirecting..." : "Login using email"}
            </button>
          </div>
        </div>
      </div>

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
        <p className="student-system-message-text">{systemMessage?.message}</p>
      </AuthModal>
    </div>
  );
}

export default StudentLogin;
