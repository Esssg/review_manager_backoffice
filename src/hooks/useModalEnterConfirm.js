import { useEffect, useMemo, useState } from "react";

function isIgnoredEnterTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable || target.closest("[data-enter-shortcut-ignore='true']")) {
    return true;
  }

  const fieldTagName = target.tagName;

  if (fieldTagName === "TEXTAREA" || fieldTagName === "BUTTON" || fieldTagName === "SELECT" || fieldTagName === "A") {
    return true;
  }

  if (fieldTagName !== "INPUT") {
    return false;
  }

  const inputType = (target.getAttribute("type") ?? "text").toLowerCase();

  return ["checkbox", "radio", "button", "submit", "file"].includes(inputType);
}

export function useModalEnterConfirm({
  isOpen,
  isDisabled = false,
  actionLabel = "확인",
  confirmTitle = "하시겠습니까?",
  confirmDescription,
  confirmButtonLabel = "확인",
  onConfirm
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmOpen(false);
    }
  }, [isOpen]);

  const openConfirm = () => {
    if (!isOpen || isDisabled) {
      return;
    }

    setIsConfirmOpen(true);
  };

  const handleModalKeyDown = (event) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.defaultPrevented ||
      event.nativeEvent?.isComposing ||
      !isOpen ||
      isDisabled ||
      isIgnoredEnterTarget(event.target)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openConfirm();
  };

  const confirmDialogProps = useMemo(
    () => ({
      isOpen: isConfirmOpen,
      title: confirmTitle,
      description: confirmDescription ?? `엔터 키로 ${actionLabel}를 실행합니다.`,
      cancelLabel: "취소",
      confirmLabel: confirmButtonLabel,
      onCancel: () => setIsConfirmOpen(false),
      onConfirm: () => {
        setIsConfirmOpen(false);
        onConfirm?.();
      },
      ariaLabel: `${actionLabel} 엔터 실행 확인`
    }),
    [actionLabel, confirmButtonLabel, confirmDescription, confirmTitle, isConfirmOpen, onConfirm]
  );

  return {
    handleModalKeyDown,
    openConfirm,
    confirmDialogProps
  };
}
