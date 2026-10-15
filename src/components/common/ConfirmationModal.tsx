import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { MdClose } from "react-icons/md";
import type { ConfirmationOptions } from "../../contexts/confirmation";
import "../../styles/components/auth-modal.css";

interface ConfirmationModalProps extends ConfirmationOptions {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationModal({
  title, message, confirmLabel, destructive, onConfirm, onCancel,
}: ConfirmationModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    cancelRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="confirmation-modal"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={(event) => {
        // Keep Escape from also closing an underlying edit/details modal.
        if (event.key === "Escape") event.stopPropagation();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="auth-modal-card">
        <div className="auth-modal-header">
          <div><h2 id={titleId}>{title}</h2></div>
          <button type="button" className="auth-modal-close" onClick={onCancel} aria-label="Cancel confirmation">
            <MdClose size={20} />
          </button>
        </div>
        <div className="auth-modal-body">
          <p id={messageId} className="system-alert-modal-message">{message}</p>
        </div>
        <div className="auth-modal-footer">
          <button ref={cancelRef} type="button" className="system-alert-modal-btn confirmation-modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`system-alert-modal-btn${destructive ? " confirmation-modal-danger" : ""}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
