import React, { useEffect } from "react";
import {
  FaCheckCircle,
  FaExclamationCircle,
  FaInfoCircle,
  FaTimes,
} from "react-icons/fa";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastProps {
  message: string;
  type: ToastType;
  duration?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  duration = 3000,
  onClose,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case "success":
        return <FaCheckCircle />;
      case "error":
        return <FaExclamationCircle />;
      case "warning":
        return <FaExclamationCircle />;
      default:
        return <FaInfoCircle />;
    }
  };

  const getColor = () => {
    switch (type) {
      case "success":
        return "#28a745";
      case "error":
        return "#dc3545";
      case "warning":
        return "#ffc107";
      default:
        return "#17a2b8";
    }
  };

  return (
    <div
      className="toast-notification"
      style={{
        backgroundColor: "white",
        borderLeft: `4px solid ${getColor()}`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        borderRadius: "8px",
        padding: "12px 16px",
        marginBottom: "12px",
        display: "grid",
        gridTemplateColumns: "20px minmax(0, 1fr) 24px",
        alignItems: "center",
        gap: "12px",
        boxSizing: "border-box",
        width: "min(416px, calc(100vw - 40px))",
        minWidth: 0,
        maxWidth: "100%",
        overflow: "hidden",
        animation: "slideIn 0.3s ease",
      }}
    >
      <span style={{ color: getColor(), fontSize: "20px", display: "flex" }}>
        {getIcon()}
      </span>
      <div
        className="toast-message"
        style={{
          minWidth: 0,
          maxWidth: "100%",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          whiteSpace: "normal",
          fontSize: "14px",
          color: "#333",
        }}
      >
        {message}
      </div>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          width: "24px",
          minWidth: 0,
          color: "#999",
          fontSize: "14px",
        }}
      >
        <FaTimes />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: ToastType }>;
  removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  removeToast,
}) => {
  return (
    <div
      className="toast-container"
      style={{
        position: "fixed",
        top: "20px",
        right: "20px",
        maxWidth: "calc(100vw - 40px)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};
