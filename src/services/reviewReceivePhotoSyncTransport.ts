import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError
} from "@supabase/supabase-js";
import {
  PHOTO_SYNC_NETWORK_ERROR_CODES,
  classifyReviewReceivePhotoSyncNetworkFailure,
  getReviewReceivePhotoSyncNetworkContext,
  isReviewReceivePhotoSyncNetworkTransitionRecent,
  type ReviewReceivePhotoSyncNetworkContext
} from "@/services/reviewReceivePhotoSyncNetwork";

export const REVIEW_RECEIVE_PHOTO_SYNC_ENDPOINT = "/api/review-receive-photo-sync";
export const REVIEW_RECEIVE_PHOTO_SYNC_HEALTH_ENDPOINT = "/healthz";

const PHOTO_SYNC_REQUEST_TIMEOUT_MS = 115_000;
const PHOTO_SYNC_DIAGNOSTIC_TIMEOUT_MS = 3_000;
const PHOTO_SYNC_STABILIZATION_DELAY_MS = 1_500;
const PHOTO_SYNC_OFFLINE_RECHECK_DELAY_MS = 1_200;
const PHOTO_SYNC_RETRY_DELAY_MS = 1_500;

type ReviewReceivePhotoSyncPayload = FormData | Record<string, unknown>;

export type ReviewReceivePhotoSyncTransportState = {
  state: "stabilizing" | "retrying";
  operationId: string;
  traceId: string;
  attempt: number;
  nextAttempt?: number;
  code?: string;
};

type InvokeReviewReceivePhotoSyncRequestOptions = {
  action: string;
  payload: ReviewReceivePhotoSyncPayload;
  supabaseKey: string;
  getAccessToken: () => Promise<string | null | undefined>;
  endpoint?: string;
  healthEndpoint?: string;
  fetchImpl?: typeof fetch;
  operationId?: string;
  maxAttempts?: number;
  requestTimeoutMs?: number;
  diagnosticsEnabled?: boolean;
  getNetworkContext?: () => ReviewReceivePhotoSyncNetworkContext;
  sleepImpl?: (milliseconds: number) => Promise<void>;
  onTransportState?: (state: ReviewReceivePhotoSyncTransportState) => void;
};

type FetchAttemptResult =
  | { response: Response; error: null; timedOut: false }
  | { response: null; error: unknown; timedOut: boolean };

type PhotoSyncAttemptFailure = {
  attempt: number;
  requestId: string;
  code: string;
  kind: string;
  originalErrorName: string;
  originalMessage: string;
  networkContext: ReviewReceivePhotoSyncNetworkContext;
};

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function createOperationId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getPayloadOperationId(payload: ReviewReceivePhotoSyncPayload) {
  if (typeof FormData !== "undefined" && payload instanceof FormData) {
    const value = payload.get("operationId");
    return typeof value === "string" ? value : "";
  }

  const value = (payload as Record<string, unknown>).operationId;
  return typeof value === "string" ? value : "";
}

function setPayloadOperationId(payload: ReviewReceivePhotoSyncPayload, operationId: string) {
  if (typeof FormData !== "undefined" && payload instanceof FormData) {
    payload.set("operationId", operationId);
  }
}

function getPayloadNumber(payload: ReviewReceivePhotoSyncPayload, key: string) {
  const value =
    typeof FormData !== "undefined" && payload instanceof FormData ? payload.get(key) : payload[key];
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function buildTrackedEndpoint(
  endpoint: string,
  {
    operationId,
    requestId,
    attempt,
    action
  }: { operationId: string; requestId: string; attempt: number; action: string }
) {
  const separator = endpoint.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    oid: operationId,
    rid: requestId,
    attempt: String(attempt),
    action
  });

  return `${endpoint}${separator}${params.toString()}`;
}

function createRequestHeaders({
  supabaseKey,
  accessToken,
  operationId,
  requestId,
  attempt,
  contentType
}: {
  supabaseKey: string;
  accessToken: string;
  operationId: string;
  requestId: string;
  attempt: number;
  contentType?: string;
}) {
  const headers = new Headers({
    apikey: supabaseKey,
    Authorization: `Bearer ${accessToken}`,
    "X-Review-Operation-Id": operationId,
    "X-Review-Request-Id": requestId,
    "X-Review-Attempt": String(attempt)
  });

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  return headers;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<FetchAttemptResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(input, {
      ...init,
      signal: controller.signal
    });

    return { response, error: null, timedOut: false };
  } catch (error) {
    return { response: null, error, timedOut };
  } finally {
    clearTimeout(timeoutId);
  }
}

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      originalErrorName: error.name,
      originalMessage: error.message
    };
  }

  return {
    originalErrorName: "",
    originalMessage: String(error ?? "")
  };
}

function createDetailedFunctionsFetchError({
  error,
  timedOut,
  networkContext,
  operationId,
  requestId,
  attempt,
  attemptFailures = []
}: {
  error: unknown;
  timedOut: boolean;
  networkContext: ReviewReceivePhotoSyncNetworkContext;
  operationId: string;
  requestId: string;
  attempt: number;
  attemptFailures?: PhotoSyncAttemptFailure[];
}) {
  const classification = classifyReviewReceivePhotoSyncNetworkFailure(error, networkContext, { timedOut });
  const errorDetails = getErrorDetails(error);
  const detailedError = new FunctionsFetchError(error) as FunctionsFetchError & Record<string, unknown>;

  Object.assign(detailedError, {
    transportCode: classification.code,
    transportKind: classification.kind,
    operationId,
    traceId: operationId.slice(0, 8),
    requestId,
    attempt,
    retryCount: Math.max(0, attempt - 1),
    attemptFailures,
    networkContext,
    ...errorDetails
  });

  return detailedError;
}

async function parseFunctionResponse(response: Response) {
  const responseType = (response.headers.get("content-type") ?? "text/plain")
    .split(";")[0]
    .trim();

  if (responseType === "application/json") {
    return response.json();
  }

  if (responseType === "application/octet-stream" || responseType === "application/pdf") {
    return response.blob();
  }

  if (responseType === "text/event-stream") {
    return response;
  }

  if (responseType === "multipart/form-data") {
    return response.formData();
  }

  return response.text();
}

async function checkNetworkReadiness({
  healthEndpoint,
  fetchImpl,
  operationId,
  getNetworkContext,
  sleepImpl,
  onTransportState
}: {
  healthEndpoint: string;
  fetchImpl: typeof fetch;
  operationId: string;
  getNetworkContext: () => ReviewReceivePhotoSyncNetworkContext;
  sleepImpl: (milliseconds: number) => Promise<void>;
  onTransportState?: (state: ReviewReceivePhotoSyncTransportState) => void;
}) {
  let networkContext = getNetworkContext();

  if (networkContext.online === false) {
    onTransportState?.({
      state: "stabilizing",
      operationId,
      traceId: operationId.slice(0, 8),
      attempt: 0,
      code: PHOTO_SYNC_NETWORK_ERROR_CODES.offline
    });
    await sleepImpl(PHOTO_SYNC_OFFLINE_RECHECK_DELAY_MS);
    networkContext = getNetworkContext();

    if (networkContext.online === false) {
      return createDetailedFunctionsFetchError({
        error: new Error("navigator reports offline before upload"),
        timedOut: false,
        networkContext,
        operationId,
        requestId: `${operationId}.preflight`,
        attempt: 0
      });
    }
  }

  if (!isReviewReceivePhotoSyncNetworkTransitionRecent(networkContext)) {
    return null;
  }

  onTransportState?.({
    state: "stabilizing",
    operationId,
    traceId: operationId.slice(0, 8),
    attempt: 0,
    code: PHOTO_SYNC_NETWORK_ERROR_CODES.transition
  });

  const elapsedValues = [
    networkContext.millisecondsSinceForeground,
    networkContext.millisecondsSinceNetworkChange
  ].filter((value): value is number => value != null);
  const shortestElapsed = elapsedValues.length > 0 ? Math.min(...elapsedValues) : 0;
  const remainingDelay = Math.max(0, PHOTO_SYNC_STABILIZATION_DELAY_MS - shortestElapsed);

  if (remainingDelay > 0) {
    await sleepImpl(remainingDelay);
  }

  let lastProbeFailure: { error: unknown; timedOut: boolean } | null = null;

  for (let probeAttempt = 1; probeAttempt <= 2; probeAttempt += 1) {
    const requestId = `${operationId}.health${probeAttempt}`;
    const probeResult = await fetchWithTimeout(
      fetchImpl,
      buildTrackedEndpoint(healthEndpoint, {
        operationId,
        requestId,
        attempt: probeAttempt,
        action: "health"
      }),
      {
        method: "GET",
        cache: "no-store",
        credentials: "omit"
      },
      PHOTO_SYNC_DIAGNOSTIC_TIMEOUT_MS
    );

    if (probeResult.response?.ok) {
      return null;
    }

    lastProbeFailure = {
      error: probeResult.error ?? new Error(`health probe returned ${probeResult.response?.status ?? "no response"}`),
      timedOut: probeResult.timedOut
    };

    if (probeAttempt === 1) {
      await sleepImpl(PHOTO_SYNC_OFFLINE_RECHECK_DELAY_MS);
    }
  }

  networkContext = getNetworkContext();

  return createDetailedFunctionsFetchError({
    error: lastProbeFailure?.error ?? new Error("health probe failed"),
    timedOut: lastProbeFailure?.timedOut ?? false,
    networkContext,
    operationId,
    requestId: `${operationId}.health2`,
    attempt: 0
  });
}

async function sendClientDiagnostic({
  enabled,
  endpoint,
  fetchImpl,
  supabaseKey,
  accessToken,
  operationId,
  payload,
  failure
}: {
  enabled: boolean;
  endpoint: string;
  fetchImpl: typeof fetch;
  supabaseKey: string;
  accessToken: string;
  operationId: string;
  payload: ReviewReceivePhotoSyncPayload;
  failure: PhotoSyncAttemptFailure;
}) {
  if (!enabled) {
    return;
  }

  const requestId = `${operationId}.diagnostic${failure.attempt}`;
  const headers = createRequestHeaders({
    supabaseKey,
    accessToken,
    operationId,
    requestId,
    attempt: failure.attempt,
    contentType: "application/json"
  });
  const diagnosticBody = {
    action: "diagnostic",
    operationId,
    requestId,
    failedRequestId: failure.requestId,
    attempt: failure.attempt,
    code: failure.code,
    transportKind: failure.kind,
    originalErrorName: failure.originalErrorName.slice(0, 80),
    originalMessage: failure.originalMessage.slice(0, 200),
    productId: getPayloadNumber(payload, "productId"),
    submissionId: getPayloadNumber(payload, "submissionId"),
    networkContext: failure.networkContext
  };

  await fetchWithTimeout(
    fetchImpl,
    buildTrackedEndpoint(endpoint, {
      operationId,
      requestId,
      attempt: failure.attempt,
      action: "diagnostic"
    }),
    {
      method: "POST",
      headers,
      body: JSON.stringify(diagnosticBody),
      credentials: "omit",
      cache: "no-store"
    },
    PHOTO_SYNC_DIAGNOSTIC_TIMEOUT_MS
  );
}

export async function invokeReviewReceivePhotoSyncRequest({
  action,
  payload,
  supabaseKey,
  getAccessToken,
  endpoint = REVIEW_RECEIVE_PHOTO_SYNC_ENDPOINT,
  healthEndpoint = REVIEW_RECEIVE_PHOTO_SYNC_HEALTH_ENDPOINT,
  fetchImpl = globalThis.fetch,
  operationId: providedOperationId,
  maxAttempts: providedMaxAttempts,
  requestTimeoutMs = PHOTO_SYNC_REQUEST_TIMEOUT_MS,
  diagnosticsEnabled = fetchImpl === globalThis.fetch,
  getNetworkContext = getReviewReceivePhotoSyncNetworkContext,
  sleepImpl = sleep,
  onTransportState
}: InvokeReviewReceivePhotoSyncRequestOptions) {
  const operationId = providedOperationId || getPayloadOperationId(payload) || createOperationId();
  const maxAttempts = Math.max(1, providedMaxAttempts ?? (action === "sync" ? 2 : 1));
  const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
  const attemptFailures: PhotoSyncAttemptFailure[] = [];

  setPayloadOperationId(payload, operationId);

  let accessToken: string;

  try {
    accessToken = (await getAccessToken()) ?? supabaseKey;
  } catch (authError) {
    const errorDetails = getErrorDetails(authError);
    const error = new Error("사진 업로드 인증 상태를 확인하지 못했습니다.") as Error & Record<string, unknown>;
    error.name = "PhotoSyncAuthContextError";
    Object.assign(error, {
      transportCode: "00062",
      operationId,
      traceId: operationId.slice(0, 8),
      ...errorDetails
    });

    return { data: null, error, response: undefined, operationId, requestId: "", attempts: 0 };
  }

  const readinessError = await checkNetworkReadiness({
    healthEndpoint,
    fetchImpl,
    operationId,
    getNetworkContext,
    sleepImpl,
    onTransportState
  });

  if (readinessError) {
    return {
      data: null,
      error: readinessError,
      response: undefined,
      operationId,
      requestId: String(readinessError.requestId ?? ""),
      attempts: 0
    };
  }

  let lastRequestId = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const requestId = `${operationId}.${attempt}`;
    lastRequestId = requestId;
    const headers = createRequestHeaders({
      supabaseKey,
      accessToken,
      operationId,
      requestId,
      attempt,
      contentType: isFormData ? undefined : "application/json"
    });
    const body = isFormData ? payload : JSON.stringify({ action, operationId, ...payload });
    const fetchResult = await fetchWithTimeout(
      fetchImpl,
      buildTrackedEndpoint(endpoint, { operationId, requestId, attempt, action }),
      {
        method: "POST",
        headers,
        body,
        credentials: "omit"
      },
      requestTimeoutMs
    );

    if (fetchResult.error) {
      const networkContext = getNetworkContext();
      const classification = classifyReviewReceivePhotoSyncNetworkFailure(fetchResult.error, networkContext, {
        timedOut: fetchResult.timedOut
      });
      const errorDetails = getErrorDetails(fetchResult.error);
      const failure: PhotoSyncAttemptFailure = {
        attempt,
        requestId,
        code: classification.code,
        kind: classification.kind,
        ...errorDetails,
        networkContext
      };
      attemptFailures.push(failure);
      const shouldRetry = [
        PHOTO_SYNC_NETWORK_ERROR_CODES.offline,
        PHOTO_SYNC_NETWORK_ERROR_CODES.transition,
        PHOTO_SYNC_NETWORK_ERROR_CODES.fetchRejected
      ].includes(failure.code as (typeof PHOTO_SYNC_NETWORK_ERROR_CODES)[keyof typeof PHOTO_SYNC_NETWORK_ERROR_CODES]);

      if (attempt < maxAttempts && shouldRetry) {
        onTransportState?.({
          state: "retrying",
          operationId,
          traceId: operationId.slice(0, 8),
          attempt,
          nextAttempt: attempt + 1,
          code: failure.code
        });
        await sleepImpl(PHOTO_SYNC_RETRY_DELAY_MS);
        await sendClientDiagnostic({
          enabled: diagnosticsEnabled,
          endpoint,
          fetchImpl,
          supabaseKey,
          accessToken,
          operationId,
          payload,
          failure
        });
        continue;
      }

      const detailedError = createDetailedFunctionsFetchError({
        error: fetchResult.error,
        timedOut: fetchResult.timedOut,
        networkContext,
        operationId,
        requestId,
        attempt,
        attemptFailures
      });

      await sendClientDiagnostic({
        enabled: diagnosticsEnabled,
        endpoint,
        fetchImpl,
        supabaseKey,
        accessToken,
        operationId,
        payload,
        failure
      });

      return {
        data: null,
        error: detailedError,
        response: undefined,
        operationId,
        requestId,
        attempts: attempt
      };
    }

    const response = fetchResult.response;

    if (response.headers.get("x-relay-error") === "true") {
      const error = new FunctionsRelayError(response) as FunctionsRelayError & Record<string, unknown>;
      Object.assign(error, {
        transportCode: "00059",
        operationId,
        traceId: operationId.slice(0, 8),
        requestId,
        attempt
      });
      return { data: null, error, response, operationId, requestId, attempts: attempt };
    }

    if (!response.ok) {
      const error = new FunctionsHttpError(response) as FunctionsHttpError & Record<string, unknown>;
      Object.assign(error, {
        operationId,
        traceId: operationId.slice(0, 8),
        requestId,
        attempt
      });
      return { data: null, error, response, operationId, requestId, attempts: attempt };
    }

    try {
      return {
        data: await parseFunctionResponse(response),
        error: null,
        response,
        operationId,
        requestId,
        attempts: attempt
      };
    } catch (parseError) {
      const errorDetails = getErrorDetails(parseError);
      const error = new Error("사진 저장 서버의 응답을 해석하지 못했습니다.") as Error & Record<string, unknown>;
      error.name = "PhotoSyncResponseParseError";
      Object.assign(error, {
        transportCode: "00061",
        operationId,
        traceId: operationId.slice(0, 8),
        requestId,
        attempt,
        ...errorDetails
      });

      return { data: null, error, response, operationId, requestId, attempts: attempt };
    }
  }

  return {
    data: null,
    error: new Error("사진 저장 요청이 완료되지 않았습니다."),
    response: undefined,
    operationId,
    requestId: lastRequestId,
    attempts: maxAttempts
  };
}
