import { useEffect, useState } from "react";

function copyTextFallback(text) {
  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

async function copyText(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  return copyTextFallback(text);
}

const COPY_STATE_RESET_DELAY_MS = 3000;

export default function ProductLinkCopy({ value, emptyText = "-", className = "" }) {
  const text = String(value ?? "").trim();
  const [copyState, setCopyState] = useState("idle");

  useEffect(() => {
    if (copyState === "idle") {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopyState("idle"), COPY_STATE_RESET_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  if (!text) {
    return <span className={className}>{emptyText}</span>;
  }

  const handleClick = async (event) => {
    event.stopPropagation();

    try {
      const copied = await copyText(text);
      setCopyState(copied ? "copied" : "failed");
    } catch {
      setCopyState("failed");
    }
  };

  const statusLabel =
    copyState === "copied"
      ? "클립보드에 복사되었습니다"
      : copyState === "failed"
        ? "복사 실패"
        : "클릭하면 링크 전체 복사";

  return (
    <span className="product-link-copy-wrap">
      <button
        type="button"
        className={`product-link-copy ${copyState === "copied" ? "is-copied" : ""} ${copyState === "failed" ? "is-failed" : ""} ${className}`.trim()}
        onClick={handleClick}
        title={statusLabel}
        aria-label={statusLabel}
      >
        <span className="product-link-copy-text">{text}</span>
      </button>
      {copyState === "copied" && (
        <span className="product-link-copy-alert" role="status">
          클립보드에 복사되었습니다
        </span>
      )}
    </span>
  );
}
