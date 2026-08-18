export const PHOTO_SYNC_NETWORK_ERROR_CODES = {
  offline: "00050",
  transition: "00051",
  timeout: "00052",
  aborted: "00053",
  fetchRejected: "00054"
} as const;

export const PHOTO_SYNC_NETWORK_TRANSITION_WINDOW_MS = 15_000;

export type ReviewReceivePhotoSyncNetworkContext = {
  online: boolean | null;
  visibilityState: string;
  millisecondsSinceForeground: number | null;
  millisecondsSinceNetworkChange: number | null;
  pageRestoredFromCache: boolean;
  effectiveType: string;
};

type NetworkFailureClassificationOptions = {
  timedOut?: boolean;
};

let monitorReferenceCount = 0;
let removeMonitorListeners: (() => void) | null = null;
let lastForegroundAt: number | null = null;
let lastNetworkChangeAt: number | null = null;
let lastPageRestoreAt: number | null = null;

function getElapsedMilliseconds(timestamp: number | null, now: number) {
  if (timestamp == null) {
    return null;
  }

  return Math.max(0, now - timestamp);
}

function isRecent(value: number | null) {
  return value != null && value <= PHOTO_SYNC_NETWORK_TRANSITION_WINDOW_MS;
}

export function isReviewReceivePhotoSyncNetworkTransitionRecent(
  context: ReviewReceivePhotoSyncNetworkContext
) {
  return (
    isRecent(context.millisecondsSinceForeground) ||
    isRecent(context.millisecondsSinceNetworkChange) ||
    context.pageRestoredFromCache
  );
}

export function getReviewReceivePhotoSyncNetworkContext(): ReviewReceivePhotoSyncNetworkContext {
  const now = Date.now();
  const navigatorObject = typeof navigator === "undefined" ? null : navigator;
  const documentObject = typeof document === "undefined" ? null : document;
  const connection = navigatorObject
    ? (navigatorObject as Navigator & { connection?: { effectiveType?: string } }).connection
    : undefined;

  return {
    online: navigatorObject && typeof navigatorObject.onLine === "boolean" ? navigatorObject.onLine : null,
    visibilityState: documentObject?.visibilityState ?? "unknown",
    millisecondsSinceForeground: getElapsedMilliseconds(lastForegroundAt, now),
    millisecondsSinceNetworkChange: getElapsedMilliseconds(lastNetworkChangeAt, now),
    pageRestoredFromCache: isRecent(getElapsedMilliseconds(lastPageRestoreAt, now)),
    effectiveType: typeof connection?.effectiveType === "string" ? connection.effectiveType : ""
  };
}

export function startReviewReceivePhotoSyncNetworkMonitor() {
  monitorReferenceCount += 1;
  const releaseMonitor = () => {
    monitorReferenceCount = Math.max(0, monitorReferenceCount - 1);

    if (monitorReferenceCount === 0) {
      removeMonitorListeners?.();
    }
  };

  if (removeMonitorListeners || typeof window === "undefined" || typeof document === "undefined") {
    return releaseMonitor;
  }

  let wasHidden = document.visibilityState === "hidden";

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      wasHidden = true;
      return;
    }

    if (wasHidden) {
      lastForegroundAt = Date.now();
    }

    wasHidden = false;
  };
  const handleNetworkChange = () => {
    lastNetworkChangeAt = Date.now();
  };
  const handlePageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      lastPageRestoreAt = Date.now();
      lastForegroundAt = Date.now();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("online", handleNetworkChange);
  window.addEventListener("offline", handleNetworkChange);
  window.addEventListener("pageshow", handlePageShow);

  removeMonitorListeners = () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("online", handleNetworkChange);
    window.removeEventListener("offline", handleNetworkChange);
    window.removeEventListener("pageshow", handlePageShow);
    removeMonitorListeners = null;
    lastForegroundAt = null;
    lastNetworkChangeAt = null;
    lastPageRestoreAt = null;
  };

  return releaseMonitor;
}

export function classifyReviewReceivePhotoSyncNetworkFailure(
  error: unknown,
  context: ReviewReceivePhotoSyncNetworkContext,
  { timedOut = false }: NetworkFailureClassificationOptions = {}
) {
  const errorName = error instanceof Error ? error.name : "";
  const errorMessage = error instanceof Error ? error.message : String(error ?? "");
  const normalizedMessage = errorMessage.toLowerCase();

  if (timedOut || errorName === "TimeoutError") {
    return {
      code: PHOTO_SYNC_NETWORK_ERROR_CODES.timeout,
      kind: "timeout"
    };
  }

  if (context.online === false) {
    return {
      code: PHOTO_SYNC_NETWORK_ERROR_CODES.offline,
      kind: "offline"
    };
  }

  if (errorName === "AbortError") {
    return {
      code: PHOTO_SYNC_NETWORK_ERROR_CODES.aborted,
      kind: "aborted"
    };
  }

  if (
    isReviewReceivePhotoSyncNetworkTransitionRecent(context) ||
    /network\s*(?:was\s*)?(?:changed|lost)|connection\s*(?:was\s*)?(?:changed|lost)/i.test(normalizedMessage)
  ) {
    return {
      code: PHOTO_SYNC_NETWORK_ERROR_CODES.transition,
      kind: "network-transition"
    };
  }

  return {
    code: PHOTO_SYNC_NETWORK_ERROR_CODES.fetchRejected,
    kind: "fetch-rejected"
  };
}
