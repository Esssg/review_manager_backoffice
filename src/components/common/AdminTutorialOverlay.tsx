// @ts-nocheck

import { useEffect, useState } from "react";

function getTargetRect(selector) {
  if (!selector) {
    return null;
  }

  const target = document.querySelector(selector);

  if (!target) {
    return null;
  }

  const rects = [target.getBoundingClientRect()];
  const openTutorialSelect = document.querySelector(
    '[data-tutorial-select-content="true"], .tutorial-photo-filter-content, [role="listbox"]'
  );

  if (openTutorialSelect) {
    rects.push(openTutorialSelect.getBoundingClientRect());
  }

  const rect = rects.reduce(
    (currentRect, nextRect) => ({
      top: Math.min(currentRect.top, nextRect.top),
      left: Math.min(currentRect.left, nextRect.left),
      right: Math.max(currentRect.right, nextRect.right),
      bottom: Math.max(currentRect.bottom, nextRect.bottom)
    }),
    rects[0]
  );

  if (rect.right - rect.left <= 0 || rect.bottom - rect.top <= 0) {
    return null;
  }

  return {
    top: Math.max(8, rect.top - 8),
    left: Math.max(8, rect.left - 8),
    right: Math.min(window.innerWidth - 8, rect.right + 8),
    bottom: Math.min(window.innerHeight - 8, rect.bottom + 8)
  };
}

function getCalloutStyle(rect, placement) {
  const width = Math.min(320, window.innerWidth - 32);
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  const base = {
    width,
    maxWidth: "calc(100vw - 32px)"
  };

  if (placement === "right") {
    return { ...base, top: Math.max(16, centerY - 52), left: Math.min(window.innerWidth - width - 16, rect.right + 20) };
  }

  if (placement === "left") {
    return { ...base, top: Math.max(16, centerY - 52), left: Math.max(16, rect.left - width - 20) };
  }

  if (placement === "top") {
    return { ...base, top: Math.max(16, rect.top - 116), left: Math.max(16, Math.min(window.innerWidth - width - 16, centerX - width / 2)) };
  }

  return { ...base, top: Math.min(window.innerHeight - 112, rect.bottom + 20), left: Math.max(16, Math.min(window.innerWidth - width - 16, centerX - width / 2)) };
}

export default function AdminTutorialOverlay({ step, stepIndex, totalSteps }) {
  const [targetRect, setTargetRect] = useState(null);

  useEffect(() => {
    let animationFrame = 0;
    let observer;

    const updateRect = () => {
      setTargetRect(getTargetRect(step?.target));
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(updateRect);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    }

    animationFrame = window.requestAnimationFrame(updateRect);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
      observer?.disconnect();
    };
  }, [step?.target, stepIndex]);

  if (!step) {
    return null;
  }

  return (
    <div className="tutorial-overlay" aria-live="polite" aria-label={`튜토리얼 ${stepIndex + 1}단계`}>
      {targetRect ? (
        <>
          <div className="tutorial-shield tutorial-shield-top" style={{ top: 0, left: 0, right: 0, height: targetRect.top }} />
          <div className="tutorial-shield tutorial-shield-left" style={{ top: targetRect.top, left: 0, width: targetRect.left, height: targetRect.bottom - targetRect.top }} />
          <div className="tutorial-shield tutorial-shield-right" style={{ top: targetRect.top, left: targetRect.right, right: 0, height: targetRect.bottom - targetRect.top }} />
          <div className="tutorial-shield tutorial-shield-bottom" style={{ top: targetRect.bottom, left: 0, right: 0, bottom: 0 }} />
          <div
            className="tutorial-spotlight"
            style={{ top: targetRect.top, left: targetRect.left, width: targetRect.right - targetRect.left, height: targetRect.bottom - targetRect.top }}
          />
          <div className={`tutorial-callout tutorial-callout-${step.placement ?? "bottom"}`} style={getCalloutStyle(targetRect, step.placement)}>
            <span className="tutorial-callout-label">✦ 튜토리얼 {stepIndex + 1}/{totalSteps}</span>
            <span className="tutorial-callout-arrow" aria-hidden="true">➜</span>
            <p>{step.message}</p>
          </div>
        </>
      ) : (
        <div className="tutorial-waiting-message">화면 요소를 준비하는 중입니다...</div>
      )}
    </div>
  );
}
