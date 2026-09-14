function ConfirmModal({
  isOpen,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "danger",
  loading = false,
  onConfirm,
  onClose,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={loading}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {typeof message === "string" ? <p>{message}</p> : message}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="modal-cancel-btn"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </button>

          <button
            type="button"
            className={`modal-confirm-btn ${
              confirmVariant === "danger"
                ? "modal-btn-danger"
                : "modal-btn-primary"
            }`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
