import AuthModal from "./AuthModal";

interface SystemAlertModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

function SystemAlertModal({
  isOpen,
  title,
  message,
  onClose,
}: SystemAlertModalProps) {
  return (
    <AuthModal
      isOpen={isOpen}
      title={title}
      description=""
      onClose={onClose}
      overlayClassName="system-alert-modal-overlay"
      footer={
        <button type="button" className="system-alert-modal-btn" onClick={onClose}>
          OK
        </button>
      }
    >
      <p className="system-alert-modal-message">{message}</p>
    </AuthModal>
  );
}

export default SystemAlertModal;
