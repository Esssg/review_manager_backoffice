// @ts-nocheck

import {
  ADMIN_INCLUDE_COMPANY_DATA_STORAGE_KEY,
  ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY,
  ADMIN_STORAGE_KEY,
  getAdminScopedStorageKey
} from "@/constants/admin";
import {
  getLocalStorageValue,
  removeLocalStorageValue,
  setSessionStorageValue
} from "@/utils/browserStorage";

const REQUEST_TIMEOUT_MS = 15_000;
export const ADMIN_SESSION_EXPIRY_STORAGE_KEY = "review_manager_admin_session_expired";
export const SESSION_EXPIRY_ALERT = "인증 시간이 만료되어 재 로그인이 필요합니다.";
let isHandlingSessionExpiry = false;

function clearClientAdminSession() {
  const currentAdminId = getLocalStorageValue(ADMIN_STORAGE_KEY);

  removeLocalStorageValue(ADMIN_STORAGE_KEY);
  removeLocalStorageValue(ADMIN_INCLUDE_COMPANY_DATA_STORAGE_KEY);
  removeLocalStorageValue(ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY);
  removeLocalStorageValue(getAdminScopedStorageKey(ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY, currentAdminId));
}

function handleExpiredAdminSession() {
  if (typeof window === "undefined" || isHandlingSessionExpiry) {
    return;
  }

  if (window.location.pathname === "/admin/login") {
    return;
  }

  isHandlingSessionExpiry = true;
  clearClientAdminSession();
  setSessionStorageValue(ADMIN_SESSION_EXPIRY_STORAGE_KEY, "true");
  window.location.replace("/admin/login");
}

function getConfiguredGatewayUrl() {
  // Keep these as direct Vite env accesses so the production build replaces
  // them with the configured public values instead of leaving import.meta.env
  // for the browser to resolve at runtime.
  const isEnabled = String(import.meta.env.VITE_ADMIN_GATEWAY_ENABLED ?? "").toLowerCase() === "true";
  const isReady = String(import.meta.env.VITE_ADMIN_GATEWAY_READY ?? "").toLowerCase() === "true";
  if (!isEnabled || !isReady) {
    return "";
  }

  const configuredUrl = import.meta.env.VITE_ADMIN_GATEWAY_URL;
  return typeof configuredUrl === "string" ? configuredUrl.trim().replace(/\/$/, "") : "";
}

export function isAdminGatewayConfigured() {
  return Boolean(getConfiguredGatewayUrl());
}

export class AdminGatewayError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AdminGatewayError";
    this.code = options.code ?? "ADMIN_GATEWAY_ERROR";
    this.status = options.status ?? 0;
    this.details = options.details ?? null;
  }
}

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `admin-gateway-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * gateway action은 `settings/update`, `permissions/update`처럼 중첩 경로를
 * 사용한다. 경로 전체를 encodeURIComponent하면 `/`까지 `%2F`가 되어
 * reverse proxy/Edge runtime이 action 경계를 잃을 수 있으므로 segment만
 * 인코딩하고 path separator는 보존한다.
 */
export function encodeAdminGatewayActionPath(action) {
  return String(action ?? "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function readResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/**
 * Q50=B 서버 경계를 위한 최소 transport다.
 * 세션은 gateway가 발급하는 httpOnly cookie/단기 토큰을 사용하며,
 * 브라우저 localStorage의 adminId는 요청 신원으로 전송하지 않는다.
 */
export async function requestAdminGateway(action, payload = {}, options = {}) {
  const normalizedAction = String(action ?? "").trim();
  const gatewayUrl = getConfiguredGatewayUrl();

  if (!gatewayUrl) {
    throw new AdminGatewayError("관리자 gateway가 설정되지 않았습니다.", {
      code: "ADMIN_GATEWAY_NOT_CONFIGURED"
    });
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`${gatewayUrl}/${encodeAdminGatewayActionPath(normalizedAction)}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-request-id": createRequestId()
      },
      body: JSON.stringify(payload ?? {}),
      signal: controller?.signal
    });
    const body = await readResponseBody(response);

    if (!response.ok) {
      const gatewayError = new AdminGatewayError(
        body?.message || "관리자 gateway 요청에 실패했습니다.",
        {
          code:
            body?.code ||
            (response.status === 401 ? "ADMIN_SESSION_EXPIRED" : "ADMIN_GATEWAY_ERROR"),
          status: response.status,
          details: body
        }
      );

      if (normalizedAction !== "login" && normalizedAction !== "logout" && response.status === 401) {
        handleExpiredAdminSession();
      }

      throw gatewayError;
    }

    return body?.data ?? body;
  } catch (error) {
    if (error instanceof AdminGatewayError) {
      throw error;
    }

    if (error?.name === "AbortError") {
      throw new AdminGatewayError("관리자 gateway 응답 시간이 초과되었습니다.", {
        code: "ADMIN_GATEWAY_TIMEOUT"
      });
    }

    throw new AdminGatewayError(error?.message || "관리자 gateway에 연결할 수 없습니다.", {
      code: "ADMIN_GATEWAY_UNAVAILABLE",
      details: error
    });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 모든 관리자 데이터 요청은 `data` endpoint와 명시된 operation을 사용한다.
 * operation은 Edge Function의 allowlist에서 다시 검증되며, payload의 관리자
 * 식별자가 아닌 gateway 세션 principal이 권한·scope의 기준이 된다.
 */
export function requestAdminGatewayData(operation, payload = {}, options = {}) {
  const normalizedOperation = String(operation ?? "").trim();

  if (!normalizedOperation) {
    return Promise.reject(
      new AdminGatewayError("관리자 데이터 operation이 지정되지 않았습니다.", {
        code: "ADMIN_GATEWAY_OPERATION_INVALID",
        status: 400
      })
    );
  }

  return requestAdminGateway(
    "data",
    {
      operation: normalizedOperation,
      payload: payload ?? {}
    },
    options
  );
}

export function requestAdminGatewayLogin(loginId, password) {
  return requestAdminGateway("login", { loginId, password });
}

export function requestAdminGatewayAccess() {
  return requestAdminGateway("access");
}

export function requestAdminGatewaySetting(action, payload = {}) {
  return requestAdminGateway(action, payload);
}

export function requestAdminGatewayLogout() {
  return requestAdminGateway("logout");
}
