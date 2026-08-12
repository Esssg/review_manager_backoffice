import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

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
  actionsChildren,
  ariaLabel
}: any) {
  if (!isOpen) {
    return null;
  }

  const effectiveDescription = description ?? message;
  const isActionBusy = isBusy || isLoading;
  const effectiveConfirmLabel =
    isActionBusy && busyConfirmLabel ? busyConfirmLabel : confirmLabel;

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

  const handleOpenChange = (nextIsOpen) => {
    if (!nextIsOpen && !isActionBusy) {
      onCancel?.();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className={"app-alert-dialog" + (variant ? " is-" + variant : "")}
        aria-label={ariaLabel ?? title}
        onKeyDown={handleKeyDown}
        onEscapeKeyDown={(event) => {
          if (isActionBusy) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (isActionBusy) {
            event.preventDefault();
          } else {
            onCancel?.();
          }
        }}
      >
        <AlertDialogHeader className="app-alert-content">
          {badgeLabel && <span className="app-alert-badge">{badgeLabel}</span>}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {effectiveDescription || title}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {children}

        <AlertDialogFooter className="app-alert-actions">
          {actionsChildren ? (
            actionsChildren
          ) : (
            <>
              <AlertDialogCancel onClick={onCancel} disabled={isActionBusy}>
                {cancelLabel}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={variant === "danger" ? "destructive" : "default"}
                className={confirmButtonClassName}
                onClick={(event) => {
                  event.preventDefault();
                  if (!isActionBusy) {
                    onConfirm?.();
                  }
                }}
                disabled={isActionBusy}
              >
                {effectiveConfirmLabel}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
