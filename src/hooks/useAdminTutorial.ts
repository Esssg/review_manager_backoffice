// @ts-nocheck

import { useCallback, useEffect, useMemo, useState } from "react";
import { ADMIN_TUTORIAL_STEPS, ADMIN_TUTORIAL_VERSION } from "@/constants/adminTutorial";
import { fetchAdminTutorialProgress, saveAdminTutorialProgress } from "@/services/adminTutorial";
import { emitAdminTutorialAction, ADMIN_TUTORIAL_EVENT } from "@/utils/adminTutorialEvents";

export const ADMIN_TUTORIAL_TARGET_PATH = "/admin/product-overview/all";

function getInitialTutorialStepIndex() {
  const menuTarget = document.querySelector('[data-tutorial-target="product-overview-menu"]');

  return menuTarget?.getAttribute("aria-expanded") === "true" ? 1 : 0;
}

function isEventInsideSelector(target, selector) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }

  return Boolean(target.closest(selector));
}

export function useAdminTutorial({
  adminId,
  pathname,
  navigate,
  isReady,
  canAccessProductOverview
}) {
  const [phase, setPhase] = useState("idle");
  const [stepIndex, setStepIndex] = useState(-1);
  const [progressStatus, setProgressStatus] = useState(null);
  const [isProgressLoaded, setIsProgressLoaded] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [progressError, setProgressError] = useState("");

  useEffect(() => {
    let isMounted = true;

    setPhase("idle");
    setStepIndex(-1);
    setProgressStatus(null);
    setProgressError("");
    setIsProgressLoaded(false);

    if (!adminId || !isReady || !canAccessProductOverview) {
      return () => {
        isMounted = false;
      };
    }

    const loadProgress = async () => {
      const result = await fetchAdminTutorialProgress(adminId, ADMIN_TUTORIAL_VERSION);

      if (!isMounted) {
        return;
      }

      if (result.error) {
        setProgressError(result.error.message ?? "튜토리얼 진행 상태를 확인하지 못했습니다.");
        setProgressStatus("unavailable");
      } else {
        setProgressStatus(result.data?.status ?? null);
      }

      setIsProgressLoaded(true);
    };

    loadProgress();

    return () => {
      isMounted = false;
    };
  }, [adminId, canAccessProductOverview, isReady]);

  useEffect(() => {
    if (!isProgressLoaded || progressStatus || phase !== "idle") {
      return;
    }

    setPhase("prompt");
  }, [isProgressLoaded, phase, progressStatus]);

  const beginWhenReady = useCallback(() => {
    const startTimer = window.setTimeout(() => {
      setStepIndex(getInitialTutorialStepIndex());
      setPhase("running");
    }, 40);

    return () => window.clearTimeout(startTimer);
  }, []);

  useEffect(() => {
    if (phase !== "pending" || pathname !== ADMIN_TUTORIAL_TARGET_PATH) {
      return undefined;
    }

    return beginWhenReady();
  }, [beginWhenReady, pathname, phase]);

  const startTutorial = useCallback(() => {
    setProgressError("");
    setPhase("pending");

    if (pathname !== ADMIN_TUTORIAL_TARGET_PATH) {
      navigate(ADMIN_TUTORIAL_TARGET_PATH);
    }
  }, [navigate, pathname]);

  const persistProgress = useCallback(
    async (status) => {
      setIsPersisting(true);
      setProgressError("");

      const result = await saveAdminTutorialProgress(adminId, ADMIN_TUTORIAL_VERSION, status);

      if (result.error) {
        setProgressError(result.error.message ?? "튜토리얼 진행 상태를 저장하지 못했습니다.");
        setIsPersisting(false);
        return false;
      }

      setProgressStatus(status);
      setIsPersisting(false);
      setPhase("idle");
      setStepIndex(-1);
      return true;
    },
    [adminId]
  );

  const handleSkip = useCallback(async () => {
    await persistProgress("skipped");
  }, [persistProgress]);

  const handleComplete = useCallback(async () => {
    await persistProgress("completed");
  }, [persistProgress]);

  const replayTutorial = useCallback(() => {
    emitAdminTutorialAction("tutorial-replay");
    startTutorial();
  }, [startTutorial]);

  const advanceStep = useCallback(() => {
    setStepIndex((previousIndex) => {
      const nextIndex = previousIndex + 1;

      if (nextIndex >= ADMIN_TUTORIAL_STEPS.length) {
        setPhase("completion");
        return -1;
      }

      return nextIndex;
    });
  }, []);

  useEffect(() => {
    if (phase !== "running") {
      return undefined;
    }

    const step = ADMIN_TUTORIAL_STEPS[stepIndex];

    if (!step?.autoAdvanceMs) {
      return undefined;
    }

    const timer = window.setTimeout(advanceStep, step.autoAdvanceMs);
    return () => window.clearTimeout(timer);
  }, [advanceStep, phase, stepIndex]);

  useEffect(() => {
    if (phase !== "running") {
      return undefined;
    }

    const handleTutorialAction = (event) => {
      const currentStep = ADMIN_TUTORIAL_STEPS[stepIndex];
      const action = event.detail?.action;

      if (!currentStep?.action || currentStep.action !== action) {
        return;
      }

      advanceStep();
    };

    window.addEventListener(ADMIN_TUTORIAL_EVENT, handleTutorialAction);
    return () => window.removeEventListener(ADMIN_TUTORIAL_EVENT, handleTutorialAction);
  }, [advanceStep, phase, stepIndex]);

  useEffect(() => {
    if (phase !== "running") {
      return undefined;
    }

    const currentStep = ADMIN_TUTORIAL_STEPS[stepIndex];
    const allowedSelector = currentStep?.target;

    const handleKeyDown = (event) => {
      const target = event.target;
      const isAllowedTarget = allowedSelector && isEventInsideSelector(target, allowedSelector);
      const isAllowedSelectOption = isEventInsideSelector(
        target,
        '[data-tutorial-select-content="true"], [role="option"]'
      );
      const isArrowStep = currentStep?.action === "photo-arrow-key";

      if (isArrowStep && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
        return;
      }

      if (isAllowedTarget || isAllowedSelectOption) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.body.dataset.adminTutorial = "running";

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      delete document.body.dataset.adminTutorial;
    };
  }, [phase, stepIndex]);

  const step = phase === "running" ? ADMIN_TUTORIAL_STEPS[stepIndex] ?? null : null;
  const isRunning = phase === "running";
  const contextValue = useMemo(
    () => ({
      isRunning,
      phase,
      step,
      stepIndex,
      isDemoMode: isRunning
    }),
    [isRunning, phase, step, stepIndex]
  );

  return {
    phase,
    step,
    stepIndex,
    isRunning,
    isPersisting,
    progressError,
    contextValue,
    isPromptOpen: phase === "prompt",
    isCompletionOpen: phase === "completion",
    startTutorial,
    handleSkip,
    handleComplete,
    replayTutorial
  };
}
