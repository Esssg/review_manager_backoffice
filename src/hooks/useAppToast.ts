// @ts-nocheck

import { useCallback } from "react";
import { toast as sonnerToast } from "sonner";

export function useAppToast() {
  const showToast = useCallback((message, type = "success") => {
    if (!message) {
      return;
    }

    const toastMethod = sonnerToast[type] ?? sonnerToast;
    toastMethod(message);
  }, []);

  const clearToast = useCallback(() => {
    sonnerToast.dismiss();
  }, []);

  return { showToast, clearToast };
}
