import { createClient } from "npm:@supabase/supabase-js@2";

const SESSION_COOKIE_NAME = "rmb_admin_session";
const SESSION_TTL_SECONDS = 3 * 60 * 60;
const LOGIN_ID_PATTERN = /^[a-zA-Z0-9._-]{1,80}$/;

const ERROR_CODES = {
  REQUEST_INVALID: "ADMIN_REQUEST_INVALID",
  AUTH_INVALID: "ADMIN_AUTH_INVALID",
  SESSION_REQUIRED: "ADMIN_SESSION_REQUIRED",
  SESSION_EXPIRED: "ADMIN_SESSION_EXPIRED",
  ACCESS_READ_FAILED: "ADMIN_ACCESS_READ_FAILED",
  SETTING_UPDATE_FAILED: "ADMIN_SETTING_UPDATE_FAILED",
  PERMISSION_UPDATE_FAILED: "ADMIN_PERMISSION_UPDATE_FAILED",
  PROFILE_UPDATE_FAILED: "ADMIN_PROFILE_UPDATE_FAILED",
  DATA_OPERATION_INVALID: "ADMIN_DATA_OPERATION_INVALID",
  DATA_OPERATION_FAILED: "ADMIN_DATA_OPERATION_FAILED",
  DATA_PERMISSION_DENIED: "ADMIN_DATA_PERMISSION_DENIED",
  SCHEMA_NOT_READY: "ADMIN_SCHEMA_NOT_READY",
  SERVER_FAILURE: "ADMIN_GATEWAY_FAILURE"
} as const;

type DataOperationConfig = {
  rpc: string;
  actorParam: "p_admin_id" | "p_actor_admin_id";
};

/**
 * 관리자 데이터 RPC는 임의 이름을 받지 않고 operation별로 고정한다.
 * 서비스 함수와 migration의 RPC 계약이 모두 준비되기 전에는 gateway를
 * 활성화하지 않으며, 없는 RPC는 schema-not-ready로 명시적으로 반환한다.
 */
const DATA_OPERATION_RPC: Record<string, DataOperationConfig> = {
  "products.list": { rpc: "admin_gateway_get_products", actorParam: "p_actor_admin_id" },
  "review_receive.list": {
    rpc: "get_admin_review_receive_product_summaries_gateway",
    actorParam: "p_actor_admin_id"
  },
  "review_receive.detail": { rpc: "get_admin_review_receive_detail", actorParam: "p_actor_admin_id" },
  "review_receive.product.create": {
    rpc: "create_admin_review_receive_product",
    actorParam: "p_actor_admin_id"
  },
  "review_receive.product.update": {
    rpc: "update_admin_review_receive_product",
    actorParam: "p_actor_admin_id"
  },
  "review_receive.product.delete": {
    rpc: "delete_admin_review_receive_product",
    actorParam: "p_actor_admin_id"
  },
  "review_receive.product_bundle.delete": {
    rpc: "delete_admin_review_receive_product_bundle",
    actorParam: "p_actor_admin_id"
  },
  "review_receive.submission.status": {
    rpc: "update_admin_review_receive_submission_status",
    actorParam: "p_actor_admin_id"
  },
  "review_receive.photos": {
    rpc: "get_admin_evidence_photos",
    actorParam: "p_actor_admin_id"
  },
  "review_receive.submission.create": {
    rpc: "create_admin_review_receive_submission",
    actorParam: "p_actor_admin_id"
  },
  "review_receive.submission.update": {
    rpc: "update_admin_review_receive_submission",
    actorParam: "p_actor_admin_id"
  },
  "review_receive.submission.delete": {
    rpc: "delete_admin_review_receive_submission",
    actorParam: "p_actor_admin_id"
  },
  "product_detail.meta": { rpc: "get_admin_product_detail_meta", actorParam: "p_actor_admin_id" },
  "product_detail.applications": {
    rpc: "get_admin_product_applications",
    actorParam: "p_actor_admin_id"
  },
  "product_detail.submissions": {
    rpc: "get_admin_product_submissions",
    actorParam: "p_actor_admin_id"
  },
  "product_detail.photos": {
    rpc: "get_admin_evidence_photos",
    actorParam: "p_actor_admin_id"
  },
  "product_detail.application.confirm": {
    rpc: "update_admin_application_confirmed",
    actorParam: "p_actor_admin_id"
  },
  "product_detail.submission.verify": {
    rpc: "update_admin_submission_verified",
    actorParam: "p_actor_admin_id"
  },
  "product_detail.step.set": { rpc: "set_admin_product_step", actorParam: "p_actor_admin_id" },
  "product_detail.submission.by_order": {
    rpc: "get_admin_submission_by_order_number",
    actorParam: "p_actor_admin_id"
  },
  "product_detail.submission.create": {
    rpc: "create_admin_submission",
    actorParam: "p_actor_admin_id"
  },
  "product_overview.list": {
    rpc: "get_admin_product_overview_rows_gateway",
    actorParam: "p_actor_admin_id"
  },
  "product_overview.submissions.delete": {
    rpc: "delete_admin_product_overview_submissions",
    actorParam: "p_actor_admin_id"
  },
  "dashboard.read": { rpc: "get_admin_dashboard_data", actorParam: "p_actor_admin_id" },
  "export.read": { rpc: "get_admin_export_data", actorParam: "p_actor_admin_id" },
  "export.photos.read": { rpc: "get_admin_photo_export_data", actorParam: "p_actor_admin_id" },
  "file_upload.apply": { rpc: "apply_admin_file_upload", actorParam: "p_actor_admin_id" },
  "bulk_edit.rows": { rpc: "get_admin_bulk_edit_rows", actorParam: "p_actor_admin_id" },
  "bulk_edit.apply": {
    rpc: "apply_admin_bulk_submission_updates_gateway",
    actorParam: "p_actor_admin_id"
  },
  "evidence.photo.delete": { rpc: "delete_admin_evidence_photo", actorParam: "p_actor_admin_id" },
  "deletion.submissions_with_photos": {
    rpc: "delete_admin_submissions_with_evidence_photos",
    actorParam: "p_actor_admin_id"
  },
  "deletion.products_with_related_data": {
    rpc: "delete_admin_products_with_related_data",
    actorParam: "p_actor_admin_id"
  },
  "tutorial.read": { rpc: "get_admin_tutorial_progress", actorParam: "p_actor_admin_id" },
  "tutorial.save": { rpc: "save_admin_tutorial_progress", actorParam: "p_actor_admin_id" }
};

/**
 * operation 수준의 권한은 gateway에서도 한 번 더 확인한다. 개별 행의
 * 회사/관리자 scope와 필드별 조건은 각 RPC가 다시 확인해야 하므로, 이
 * 표는 최소 진입 권한만 정의한다. migration에서 action binding을 채우기
 * 전에는 알 수 없는/미부여 operation을 허용하지 않는다.
 */
const DATA_OPERATION_PERMISSION_CODES: Record<string, string[]> = {
  "products.list": ["product.read"],
  "review_receive.list": ["product.read", "submission.read"],
  "review_receive.detail": ["product.read", "submission.read"],
  "review_receive.product.create": ["product.create"],
  "review_receive.product.update": ["product.update"],
  "review_receive.product.delete": [
    "product.delete",
    "submission.delete",
    "submission.photo.delete",
    "application.delete",
    "product_step.delete"
  ],
  "review_receive.product_bundle.delete": [
    "product.delete",
    "submission.delete",
    "submission.photo.delete",
    "application.delete",
    "product_step.delete"
  ],
  "review_receive.submission.status": ["submission.update"],
  "review_receive.photos": ["submission.photo.read"],
  "review_receive.submission.create": ["submission.create"],
  "review_receive.submission.update": ["submission.update"],
  "review_receive.submission.delete": ["submission.delete", "submission.photo.delete"],
  "product_detail.meta": ["product.read", "product_step.read"],
  "product_detail.applications": ["application.read"],
  "product_detail.submissions": ["submission.read"],
  "product_detail.photos": ["submission.photo.read"],
  "product_detail.application.confirm": ["application.confirm"],
  "product_detail.submission.verify": ["submission.update"],
  "product_detail.step.set": ["product_step.update"],
  "product_detail.submission.by_order": ["submission.read"],
  "product_detail.submission.create": ["submission.create"],
  "product_overview.list": ["product.read", "submission.read"],
  "product_overview.submissions.delete": ["submission.delete", "submission.photo.delete"],
  "dashboard.read": ["menu.dashboard"],
  "export.read": ["export.execute"],
  "export.photos.read": ["export.execute", "submission.photo.read"],
  "file_upload.apply": ["product.create", "submission.create", "submission.update"],
  "bulk_edit.rows": ["bulk_edit.execute", "submission.read"],
  "bulk_edit.apply": ["bulk_edit.execute", "submission.update"],
  "evidence.photo.delete": ["submission.photo.delete"],
  "deletion.submissions_with_photos": ["submission.delete", "submission.photo.delete"],
  "deletion.products_with_related_data": [
    "product.delete",
    "submission.delete",
    "submission.photo.delete",
    "application.delete",
    "product_step.delete"
  ],
  "tutorial.read": ["personal_setting.read"],
  "tutorial.save": ["personal_setting.update"]
};

class GatewayError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.status = status;
  }
}

function getAllowedOrigin(request: Request) {
  const configuredOrigin = normalizeOrigin(Deno.env.get("ADMIN_WEB_ORIGIN"));
  const requestOrigin = normalizeOrigin(request.headers.get("origin"));

  // 관리자 gateway는 credentialed cookie를 사용하므로 허용 origin이
  // 설정되지 않은 상태에서 요청 origin을 그대로 반사하지 않는다.
  // 운영 시 ADMIN_WEB_ORIGIN을 반드시 명시하고, 다른 origin은 브라우저가
  // 읽지 못하도록 null을 반환한다.
  if (!configuredOrigin) {
    return "null";
  }

  if (!requestOrigin || requestOrigin === configuredOrigin) {
    return configuredOrigin;
  }

  return "null";
}

function normalizeOrigin(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized).origin;
  } catch {
    return "";
  }
}

function getCorsHeaders(request: Request) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(request),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "authorization, content-type, x-request-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "x-request-id",
    Vary: "Origin"
  };
}

function getRequestId(request: Request) {
  const requestId = request.headers.get("x-request-id")?.trim();
  return requestId && requestId.length <= 128 ? requestId : crypto.randomUUID();
}

function json(request: Request, data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeaders(request),
      "Content-Type": "application/json",
      "x-request-id": getRequestId(request),
      ...extraHeaders
    }
  });
}

function errorResponse(request: Request, error: GatewayError) {
  const shouldClearSession =
    error.code === ERROR_CODES.SESSION_REQUIRED || error.code === ERROR_CODES.SESSION_EXPIRED;

  return json(
    request,
    { code: error.code, message: error.message },
    error.status,
    shouldClearSession ? { "Set-Cookie": clearSessionCookie(request) } : {}
  );
}

/**
 * 인증에 성공한 응답마다 세션을 재발급해 3시간 유휴 만료를 연장한다.
 * 실패 응답과 logout 응답은 이 helper를 사용하지 않아 세션을 부활시키지 않는다.
 */
async function jsonWithRefreshedSession(
  request: Request,
  adminId: string,
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
) {
  const token = await issueSession(adminId);
  return json(request, data, status, {
    ...extraHeaders,
    "Set-Cookie": createSessionCookie(token, request)
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new GatewayError(ERROR_CODES.SERVER_FAILURE, `${name} 시크릿이 설정되지 않았습니다.`);
  }

  return value;
}

function createServiceClient() {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}

async function readJsonBody(request: Request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new GatewayError(ERROR_CODES.REQUEST_INVALID, "JSON 요청 본문이 올바르지 않습니다.", 400);
  }
}

const CLIENT_IDENTITY_KEYS = new Set([
  "adminId",
  "admin_id",
  "p_admin_id",
  "p_actor_admin_id",
  "actorAdminId",
  "actor_admin_id",
  "manager_id",
  "managerId"
]);

function stripClientIdentity(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripClientIdentity);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !CLIENT_IDENTITY_KEYS.has(key)).map(([key, child]) => [
      key,
      stripClientIdentity(child)
    ])
  );
}

function isSchemaNotReadyMessage(message: string) {
  return /function|does not exist|schema cache|could not find the function/i.test(message);
}

function getDataOperationError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "관리자 데이터 작업에 실패했습니다.";

  if (isSchemaNotReadyMessage(message)) {
    return new GatewayError(
      ERROR_CODES.SCHEMA_NOT_READY,
      "관리자 데이터 gateway용 DB 구조가 아직 준비되지 않았습니다.",
      503
    );
  }

  if (error?.code === "42501" || /permission denied|권한이 없습니다|권한이 없습니다/i.test(message)) {
    return new GatewayError(
      ERROR_CODES.DATA_PERMISSION_DENIED,
      "이 작업을 수행할 권한이 없습니다.",
      403
    );
  }

  if (error?.code?.startsWith("22")) {
    return new GatewayError(ERROR_CODES.DATA_OPERATION_INVALID, message, 400);
  }

  return new GatewayError(ERROR_CODES.DATA_OPERATION_FAILED, message, 400);
}

const PERMISSION_SUBJECT_SPECIFICITY: Record<string, number> = {
  global: 0,
  company: 10,
  role: 20,
  admin: 30
};

function normalizePermissionBinding(row: unknown) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const value = row as Record<string, unknown>;
  const permissionCode = String(value.permissionCode ?? value.permission_code ?? value.code ?? "").trim();
  const effect = String(value.effect ?? value.permission_effect ?? "").trim().toLowerCase();
  const subjectType = String(value.subjectType ?? value.subject_type ?? "global").trim().toLowerCase();

  if (!permissionCode || !["allow", "deny"].includes(effect) || PERMISSION_SUBJECT_SPECIFICITY[subjectType] == null) {
    return null;
  }

  return {
    permissionCode,
    effect,
    subjectType,
    subjectId: String(value.subjectId ?? value.subject_id ?? value.targetId ?? value.target_id ?? "").trim(),
    companyId: String(value.companyId ?? value.company_id ?? "").trim(),
    role: String(value.role ?? "").trim().toLowerCase(),
    priority: Number(value.priority) || 0
  };
}

function permissionBindingMatchesPrincipal(binding: ReturnType<typeof normalizePermissionBinding>, principal: Record<string, string>) {
  if (!binding) {
    return false;
  }

  if (binding.subjectType === "global") {
    return true;
  }

  if (binding.subjectType === "admin") {
    return Boolean(binding.subjectId && binding.subjectId === principal.adminId);
  }

  if (binding.subjectType === "company") {
    return Boolean(binding.companyId || binding.subjectId) &&
      (binding.companyId || binding.subjectId) === principal.companyId;
  }

  return Boolean(binding.role || binding.subjectId) &&
    (binding.role || binding.subjectId).toLowerCase() === principal.role.toLowerCase();
}

function hasServerPermission(access: unknown, permissionCode: string, adminId: string) {
  const accessObject = access && typeof access === "object" ? access as Record<string, unknown> : {};
  const principalObject = accessObject.principal && typeof accessObject.principal === "object"
    ? accessObject.principal as Record<string, unknown>
    : {};
  const profileObject = accessObject.profile && typeof accessObject.profile === "object"
    ? accessObject.profile as Record<string, unknown>
    : {};
  const principal = {
    adminId: String(principalObject.adminId ?? principalObject.admin_id ?? profileObject.loginId ?? adminId ?? "").trim(),
    companyId: String(principalObject.companyId ?? principalObject.company_id ?? profileObject.companyId ?? profileObject.company_id ?? "").trim(),
    role: String(principalObject.role ?? profileObject.role ?? "").trim().toLowerCase()
  };
  const rawBindings = Array.isArray(accessObject.permissionBindings)
    ? accessObject.permissionBindings
    : Array.isArray(accessObject.permissions)
      ? accessObject.permissions
      : [];
  const candidates = rawBindings
    .map(normalizePermissionBinding)
    .filter((binding): binding is NonNullable<ReturnType<typeof normalizePermissionBinding>> =>
      Boolean(binding) &&
      binding.permissionCode === permissionCode &&
      permissionBindingMatchesPrincipal(binding, principal)
    );

  if (candidates.length === 0) {
    return false;
  }

  candidates.sort((left, right) =>
    (PERMISSION_SUBJECT_SPECIFICITY[left.subjectType] - PERMISSION_SUBJECT_SPECIFICITY[right.subjectType]) ||
    (left.priority - right.priority)
  );
  const selected = candidates.filter((binding) =>
    PERMISSION_SUBJECT_SPECIFICITY[binding.subjectType] ===
      PERMISSION_SUBJECT_SPECIFICITY[candidates[candidates.length - 1].subjectType] &&
    binding.priority === candidates[candidates.length - 1].priority
  );

  return !selected.some((binding) => binding.effect === "deny") &&
    selected.some((binding) => binding.effect === "allow");
}

function encodeBase64Url(value: string | ArrayBuffer) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function createSignature(secret: string, input: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return encodeBase64Url(signature);
}

async function verifySignature(secret: string, input: string, signature: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const normalized = signature.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const signatureBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(input)
  );
}

async function issueSession(adminId: string) {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "RMB" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      sub: adminId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      v: 1
    })
  );
  const unsignedToken = `${header}.${payload}`;
  const signature = await createSignature(requiredEnv("ADMIN_GATEWAY_SESSION_SECRET"), unsignedToken);

  return `${unsignedToken}.${signature}`;
}

function getCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = cookie.slice(0, separatorIndex).trim();
    if (key === name) {
      return cookie.slice(separatorIndex + 1).trim();
    }
  }

  return "";
}

async function verifySession(request: Request) {
  const token = getCookie(request, SESSION_COOKIE_NAME);

  if (!token) {
    throw new GatewayError(ERROR_CODES.SESSION_REQUIRED, "관리자 세션이 필요합니다.", 401);
  }

  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new GatewayError(ERROR_CODES.SESSION_EXPIRED, "관리자 세션이 올바르지 않습니다.", 401);
  }

  const unsignedToken = `${segments[0]}.${segments[1]}`;
  const isSignatureValid = await verifySignature(
    requiredEnv("ADMIN_GATEWAY_SESSION_SECRET"),
    unsignedToken,
    segments[2]
  );

  if (!isSignatureValid) {
    throw new GatewayError(ERROR_CODES.SESSION_EXPIRED, "관리자 세션이 만료되었거나 올바르지 않습니다.", 401);
  }

  let payload: { sub?: string; exp?: number; v?: number };
  try {
    payload = JSON.parse(decodeBase64Url(segments[1]));
  } catch {
    throw new GatewayError(ERROR_CODES.SESSION_EXPIRED, "관리자 세션을 해석할 수 없습니다.", 401);
  }

  if (
    !payload.sub ||
    payload.v !== 1 ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new GatewayError(ERROR_CODES.SESSION_EXPIRED, "관리자 세션이 만료되었습니다.", 401);
  }

  return payload.sub;
}

function createSessionCookie(token: string, request: Request) {
  const isSecure = new URL(request.url).protocol === "https:";
  const configuredSameSite = Deno.env.get("ADMIN_GATEWAY_COOKIE_SAMESITE")?.trim().toLowerCase();
  const sameSite = ["strict", "lax", "none"].includes(configuredSameSite ?? "")
    ? configuredSameSite!.replace(/^./, (character) => character.toUpperCase())
    : "Lax";
  const safeSameSite = sameSite === "None" && !isSecure ? "Lax" : sameSite;
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    `SameSite=${safeSameSite}`,
    isSecure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

function clearSessionCookie(request: Request) {
  const isSecure = new URL(request.url).protocol === "https:";
  return [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
    isSecure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

function getAction(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const lastTwo = segments.slice(-2).join("/");
  const rawAction = ["settings/update", "permissions/update"].includes(lastTwo)
    ? lastTwo
    : segments.at(-1) || "";

  try {
    // 구형 클라이언트가 `permissions%2Fupdate`처럼 action 전체를
    // 인코딩해서 보내도 nested gateway action으로 복원한다.
    return decodeURIComponent(rawAction);
  } catch {
    return rawAction;
  }
}

function normalizeLoginId(value: unknown) {
  const loginId = String(value ?? "").trim();
  return LOGIN_ID_PATTERN.test(loginId) ? loginId : "";
}

async function readAccess(supabase: ReturnType<typeof createServiceClient>, adminId: string) {
  const result = await supabase.rpc("get_admin_access_bundle", { p_admin_id: adminId });

  if (result.error || !result.data) {
    const message = result.error?.message || "관리자 권한 bundle을 불러오지 못했습니다.";
    const isSchemaNotReady = /get_admin_access_bundle|function|does not exist|schema cache/i.test(message);
    throw new GatewayError(
      isSchemaNotReady ? ERROR_CODES.SCHEMA_NOT_READY : ERROR_CODES.ACCESS_READ_FAILED,
      isSchemaNotReady ? "새 관리자 권한 DB 구조가 아직 준비되지 않았습니다." : message,
      isSchemaNotReady ? 503 : 500
    );
  }

  return result.data;
}

async function handleLogin(request: Request, supabase: ReturnType<typeof createServiceClient>) {
  const body = await readJsonBody(request);
  const loginId = normalizeLoginId(body.loginId ?? body.login_id);
  const password = String(body.password ?? "");

  if (!loginId || !password || password.length > 512) {
    throw new GatewayError(ERROR_CODES.REQUEST_INVALID, "아이디와 비밀번호를 확인해주세요.", 400);
  }

  const result = await supabase
    .from("admins")
    .select("login_id,password,is_active")
    .eq("login_id", loginId)
    .maybeSingle();

  if (result.error || !result.data || result.data.is_active === false || result.data.password !== password) {
    throw new GatewayError(ERROR_CODES.AUTH_INVALID, "아이디 또는 패스워드를 확인해주세요.", 401);
  }

  const access = await readAccess(supabase, loginId);
  const token = await issueSession(loginId);

  return json(request, { data: access }, 200, { "Set-Cookie": createSessionCookie(token, request) });
}

async function handleAccess(request: Request, supabase: ReturnType<typeof createServiceClient>) {
  const adminId = await verifySession(request);
  const access = await readAccess(supabase, adminId);
  return jsonWithRefreshedSession(request, adminId, { data: access });
}

async function handleData(request: Request, supabase: ReturnType<typeof createServiceClient>) {
  const adminId = await verifySession(request);
  const body = await readJsonBody(request);
  const operation = String(body.operation ?? "").trim();
  const operationConfig = DATA_OPERATION_RPC[operation];

  if (!operationConfig) {
    throw new GatewayError(
      ERROR_CODES.DATA_OPERATION_INVALID,
      "지원하지 않는 관리자 데이터 operation입니다.",
      400
    );
  }

  const access = await readAccess(supabase, adminId);

  const requiredPermissions = DATA_OPERATION_PERMISSION_CODES[operation] ?? [];
  const hasRequiredPermissions = requiredPermissions.every((permissionCode) =>
    hasServerPermission(access, permissionCode, adminId)
  );

  if (!hasRequiredPermissions) {
    throw new GatewayError(
      ERROR_CODES.DATA_PERMISSION_DENIED,
      "이 관리자 데이터 작업을 수행할 권한이 없습니다.",
      403
    );
  }

  const payload = stripClientIdentity(body.payload ?? {});
  const rpcPayload = {
    ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
    [operationConfig.actorParam]: adminId
  };
  const result = await supabase.rpc(operationConfig.rpc, rpcPayload);

  if (result.error) {
    throw getDataOperationError(result.error);
  }

  return jsonWithRefreshedSession(request, adminId, { data: result.data });
}

async function handleSettings(request: Request, supabase: ReturnType<typeof createServiceClient>) {
  const adminId = await verifySession(request);
  const access = await readAccess(supabase, adminId);
  return jsonWithRefreshedSession(request, adminId, { data: access });
}

async function handleMembers(request: Request, supabase: ReturnType<typeof createServiceClient>) {
  const adminId = await verifySession(request);
  const result = await supabase.rpc("get_admin_members", {
    p_actor_admin_id: adminId
  });

  if (result.error) {
    const isSchemaNotReady = /get_admin_members|function|does not exist|schema cache/i.test(result.error.message ?? "");
    throw new GatewayError(
      isSchemaNotReady ? ERROR_CODES.SCHEMA_NOT_READY : ERROR_CODES.ACCESS_READ_FAILED,
      isSchemaNotReady ? "임직원 권한 DB 구조가 아직 준비되지 않았습니다." : result.error.message,
      isSchemaNotReady ? 503 : 500
    );
  }

  return jsonWithRefreshedSession(request, adminId, {
    data: { members: Array.isArray(result.data) ? result.data : [] }
  });
}

async function handleSettingsUpdate(request: Request, supabase: ReturnType<typeof createServiceClient>) {
  const adminId = await verifySession(request);
  const body = await readJsonBody(request);

  if (body.settingType === "profile") {
    const result = await supabase.rpc("update_admin_profile", {
      p_actor_admin_id: adminId,
      p_payload: body.payload && typeof body.payload === "object" ? body.payload : {}
    });

    if (result.error) {
      const isSchemaNotReady = /update_admin_profile|function|does not exist|schema cache/i.test(result.error.message ?? "");
      throw new GatewayError(
        isSchemaNotReady ? ERROR_CODES.SCHEMA_NOT_READY : ERROR_CODES.PROFILE_UPDATE_FAILED,
        isSchemaNotReady ? "새 관리자 설정 DB 구조가 아직 준비되지 않았습니다." : result.error.message,
        isSchemaNotReady ? 503 : 400
      );
    }

    return jsonWithRefreshedSession(request, adminId, { data: result.data });
  }

  const settingKey = String(body.key ?? body.settingKey ?? "").trim();
  const scopeType = String(body.scopeType ?? body.scope_type ?? "").trim();

  if (!settingKey || !scopeType) {
    throw new GatewayError(ERROR_CODES.REQUEST_INVALID, "설정 키와 저장 범위를 확인해주세요.", 400);
  }

  const result = await supabase.rpc("update_admin_setting", {
    p_actor_admin_id: adminId,
    p_setting_key: settingKey,
    p_scope_type: scopeType,
    p_scope_id: body.scopeId ?? body.scope_id ?? null,
    p_value: body.value === undefined ? null : body.value,
    p_remove: body.remove === true
  });

  if (result.error) {
    const isSchemaNotReady = /update_admin_setting|function|does not exist|schema cache/i.test(result.error.message ?? "");
    throw new GatewayError(
      isSchemaNotReady ? ERROR_CODES.SCHEMA_NOT_READY : ERROR_CODES.SETTING_UPDATE_FAILED,
      isSchemaNotReady ? "새 관리자 설정 DB 구조가 아직 준비되지 않았습니다." : result.error.message,
      isSchemaNotReady ? 503 : 400
    );
  }

  return jsonWithRefreshedSession(request, adminId, { data: result.data });
}

async function handlePermissionUpdate(request: Request, supabase: ReturnType<typeof createServiceClient>) {
  const adminId = await verifySession(request);
  const body = await readJsonBody(request);
  const targetAdminId = String(body.targetAdminId ?? body.target_admin_id ?? "").trim();
  const permissionCode = String(body.permissionCode ?? body.permission_code ?? "").trim();

  if (!targetAdminId || !permissionCode) {
    throw new GatewayError(ERROR_CODES.REQUEST_INVALID, "대상 계정과 권한 코드를 확인해주세요.", 400);
  }

  const result = await supabase.rpc("update_admin_permission", {
    p_actor_admin_id: adminId,
    p_target_admin_id: targetAdminId,
    p_permission_code: permissionCode,
    p_effect: body.effect ?? null,
    p_data_scope: body.dataScope ?? body.data_scope ?? "personal",
    p_remove: body.remove === true
  });

  if (result.error) {
    const isSchemaNotReady = /update_admin_permission|function|does not exist|schema cache/i.test(result.error.message ?? "");
    throw new GatewayError(
      isSchemaNotReady ? ERROR_CODES.SCHEMA_NOT_READY : ERROR_CODES.PERMISSION_UPDATE_FAILED,
      isSchemaNotReady ? "새 관리자 권한 DB 구조가 아직 준비되지 않았습니다." : result.error.message,
      isSchemaNotReady ? 503 : 400
    );
  }

  return jsonWithRefreshedSession(request, adminId, { data: result.data });
}

async function handleLogout(request: Request) {
  return json(request, { data: { loggedOut: true } }, 200, { "Set-Cookie": clearSessionCookie(request) });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  if (request.method !== "POST") {
    return errorResponse(
      request,
      new GatewayError(ERROR_CODES.REQUEST_INVALID, "POST 요청만 허용됩니다.", 405)
    );
  }

  try {
    const action = getAction(request);

    if (action === "logout") {
      return await handleLogout(request);
    }

    const supabase = createServiceClient();

    if (action === "login") {
      return await handleLogin(request, supabase);
    }

    if (action === "access") {
      return await handleAccess(request, supabase);
    }

    if (action === "data") {
      return await handleData(request, supabase);
    }

    if (action === "settings") {
      return await handleSettings(request, supabase);
    }

    if (action === "members") {
      return await handleMembers(request, supabase);
    }

    if (action === "settings/update") {
      return await handleSettingsUpdate(request, supabase);
    }

    if (action === "permissions/update") {
      return await handlePermissionUpdate(request, supabase);
    }

    throw new GatewayError(ERROR_CODES.REQUEST_INVALID, "지원하지 않는 gateway 작업입니다.", 404);
  } catch (error) {
    if (error instanceof GatewayError) {
      return errorResponse(request, error);
    }

    console.error("admin-gateway failure", {
      requestId: request.headers.get("x-request-id")?.trim() || null,
      error
    });
    return errorResponse(
      request,
      new GatewayError(ERROR_CODES.SERVER_FAILURE, "관리자 gateway 처리 중 오류가 발생했습니다.")
    );
  }
});
