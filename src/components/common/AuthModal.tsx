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
}

function AuthModal({
  isOpen,
  title,
  description,
  onClose,
  children,
  footer,
}: AuthModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div
        className="auth-modal-card"
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
