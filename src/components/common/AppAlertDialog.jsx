import { useEffect, useRef } from "react";

export default function AppAlertDialog({
  isOpen,
  variant = "info",
  badgeLabel,
  title,
  message,
  description,
  children,
  cancelLabel = "취소",
  confirmLabel = "확인",
  busyConfirmLabel,
  isBusy = false,
  isLoading = false,
  onCancel,
  onConfirm,
  confirmButtonClassName,
  ariaLabel
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const dialogNode = dialogRef.current;
    dialogNode?.focus();

    return undefined;
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const variantClassName = variant ? ` is-${variant}` : "";
  const isActionBusy = isBusy || isLoading;
  const effectiveDescription = description ?? message;
  const effectiveConfirmLabel = isActionBusy && busyConfirmLabel ? busyConfirmLabel : confirmLabel;

  const handleKeyDown = (event) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.defaultPrevented ||
      event.nativeEvent?.isComposing ||
      isActionBusy
    ) {
      return;
    }

    event.preventDefault();
    onConfirm?.();
  };

  return (
    <div className="app-alert-backdrop" role="presentation" onClick={onCancel}>
      <div
        ref={dialogRef}
        className={`app-alert-dialog${variantClassName}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="app-alert-content">
          {badgeLabel && <span className="app-alert-badge">{badgeLabel}</span>}
          {title && <h2>{title}</h2>}
          {effectiveDescription && <p>{effectiveDescription}</p>}
          {children}
          <div className="app-alert-actions">
            <button type="button" className="admin-secondary-button" onClick={onCancel} disabled={isActionBusy}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={confirmButtonClassName ?? "admin-primary-button"}
              onClick={onConfirm}
              disabled={isActionBusy}
            >
              {effectiveConfirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
