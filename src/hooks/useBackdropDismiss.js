import { useRef } from "react";

export function useBackdropDismiss(onDismiss) {
  const didPointerStartOnBackdropRef = useRef(false);

  const handlePointerDown = (event) => {
    didPointerStartOnBackdropRef.current = event.target === event.currentTarget;
  };

  const handlePointerUp = (event) => {
    const shouldDismiss = didPointerStartOnBackdropRef.current && event.target === event.currentTarget;
    didPointerStartOnBackdropRef.current = false;

    if (shouldDismiss) {
      onDismiss?.(event);
    }
  };

  const resetPointerStart = () => {
    didPointerStartOnBackdropRef.current = false;
  };

  return {
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerCancel: resetPointerStart,
    onPointerLeave: resetPointerStart
  };
}
