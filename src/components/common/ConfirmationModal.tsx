import { useEffect, useId, useRef, useState } from "react";
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
  title, message, confirmLabel, destructive, requiredText, onConfirm, onCancel,
}: ConfirmationModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const requiredTextRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const messageId = useId();
  const requiredTextId = useId();
  const [typedText, setTypedText] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    if (requiredText) {
      requiredTextRef.current?.focus();
    } else {
      cancelRef.current?.focus();
    }
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
          {requiredText && (
            <div className="confirmation-required-text">
              <label htmlFor={requiredTextId}>Type <strong>{requiredText}</strong> to confirm</label>
              <input
                ref={requiredTextRef}
                id={requiredTextId}
                type="text"
                value={typedText}
                onChange={(event) => setTypedText(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </div>
        <div className="auth-modal-footer">
          <button ref={cancelRef} type="button" className="system-alert-modal-btn confirmation-modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`system-alert-modal-btn${destructive ? " confirmation-modal-danger" : ""}`}
            onClick={onConfirm}
            disabled={Boolean(requiredText && typedText !== requiredText)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
