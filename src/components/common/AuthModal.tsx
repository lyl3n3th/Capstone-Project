import { useEffect } from "react";
import type { ReactNode } from "react";
import { MdClose } from "react-icons/md";
import "../../styles/components/auth-modal.css";

interface AuthModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  overlayClassName?: string;
}

function AuthModal({
  isOpen,
  title,
  description,
  onClose,
  children,
  footer,
  overlayClassName,
}: AuthModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={`auth-modal-overlay ${overlayClassName || ""}`.trim()}
      onClick={onClose}
    >
      <div
        className="auth-modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="auth-modal-header">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button
            type="button"
            className="auth-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <MdClose size={20} />
          </button>
        </div>
        <div className="auth-modal-body">{children}</div>
        <div className="auth-modal-footer">{footer}</div>
      </div>
    </div>
  );
}

export default AuthModal;
