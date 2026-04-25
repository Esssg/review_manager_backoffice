export default function AppAlertDialog({
  isOpen,
  variant = "info",
  badgeLabel,
  title,
  description,
  children,
  cancelLabel = "취소",
  confirmLabel = "확인",
  busyConfirmLabel,
  isBusy = false,
  onCancel,
  onConfirm,
  confirmButtonClassName,
  ariaLabel
}) {
  if (!isOpen) {
    return null;
  }

  const variantClassName = variant ? ` is-${variant}` : "";
  const effectiveConfirmLabel = isBusy && busyConfirmLabel ? busyConfirmLabel : confirmLabel;

  return (
    <div className="app-alert-backdrop" role="presentation" onClick={onCancel}>
      <div
        className={`app-alert-dialog${variantClassName}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="app-alert-content">
          {badgeLabel && <span className="app-alert-badge">{badgeLabel}</span>}
          {title && <h2>{title}</h2>}
          {description && <p>{description}</p>}
          {children}
          <div className="app-alert-actions">
            <button type="button" className="admin-secondary-button" onClick={onCancel} disabled={isBusy}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={confirmButtonClassName ?? "admin-primary-button"}
              onClick={onConfirm}
              disabled={isBusy}
            >
              {effectiveConfirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
