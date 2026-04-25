import { useCallback, useEffect, useState } from "react";

const TOAST_DURATION_MS = 2000;

export function useAppToast() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setToast(null);
    }, TOAST_DURATION_MS);

    return () => window.clearTimeout(timerId);
  }, [toast]);

  const showToast = useCallback((message, type = "success") => {
    if (!message) {
      return;
    }

    setToast({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message,
      type
    });
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, showToast, clearToast };
}
