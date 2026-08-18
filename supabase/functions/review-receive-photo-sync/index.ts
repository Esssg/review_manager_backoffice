import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-review-operation-id, x-review-request-id, x-review-attempt",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-review-operation-id, x-review-request-id"
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json"
};

const PHOTO_TYPE = "review";
const MAX_FILE_COUNT = 10;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const SUPABASE_PAGE_SIZE = 1000;
const DEFAULT_STORAGE_ROOT = "/mnt/rmb-images";
const DEFAULT_PUBLIC_PATH_PREFIX = "/rmb-images";
const DEFAULT_UPLOAD_PREFIX = "review-receive";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const TRACE_ID_PATTERN = /^[a-zA-Z0-9._-]{1,120}$/;
const IMAGE_TYPE_EXTENSION_MAP = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);

const ERROR_CODES = {
  SYNC_REQUEST_INVALID: "00011",
  SYNC_ACCESS_DENIED: "00012",
  SYNC_LOCKED: "00013",
  SYNC_CURRENT_PHOTOS_FAILED: "00034",
  SYNC_INSERT_FAILED: "00035",
  SYNC_DELETE_FAILED: "00036",
  SYNC_SERVER_FAILURE: "00038",
  SYNC_TRANSACTION_FAILED: "00039",
  ROLLBACK_REQUEST_OR_ACCESS_FAILED: "00041",
  ROLLBACK_DELETE_FAILED: "00042",
  UNKNOWN_SERVER_FAILURE: "00090"
} as const;

type SyncPayload = {
  action: "sync";
  operationId: string;
  productId: number;
  submissionId: number;
  assignName: string;
  removedImageUrls: string[];
  files: File[];
};

type DiagnosticAction = {
  action: "diagnostic";
  operationId?: string;
  requestId?: string;
  failedRequestId?: string;
  attempt?: number;
  code?: string;
  transportKind?: string;
  originalErrorName?: string;
  originalMessage?: string;
  productId?: number | null;
  submissionId?: number | null;
  networkContext?: Record<string, unknown> | null;
};

type RequestTrace = {
  operationId: string;
  requestId: string;
  attempt: number;
  action: string;
  errorCode: string;
};

type RollbackAction = {
  action: "rollback";
  productId: number;
  submissionId: number;
  assignName: string;
  objectKeys: string[];
};

class PhotoSyncError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = "PhotoSyncError";
    this.code = code;
    this.status = status;
  }
}

function sanitizeTraceValue(value: string | null | undefined) {
  const normalizedValue = String(value ?? "").trim();
  return TRACE_ID_PATTERN.test(normalizedValue) ? normalizedValue : "";
}

function sanitizeDiagnosticText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function createRequestTrace(req: Request): RequestTrace {
  const requestUrl = new URL(req.url);
  const attemptValue = Number(req.headers.get("x-review-attempt") ?? requestUrl.searchParams.get("attempt"));

  return {
    operationId: sanitizeTraceValue(
      req.headers.get("x-review-operation-id") ?? requestUrl.searchParams.get("oid")
    ),
    requestId: sanitizeTraceValue(req.headers.get("x-review-request-id") ?? requestUrl.searchParams.get("rid")),
    attempt: Number.isInteger(attemptValue) && attemptValue >= 0 && attemptValue <= 10 ? attemptValue : 0,
    action: sanitizeDiagnosticText(requestUrl.searchParams.get("action"), 24),
    errorCode: ""
  };
}

function logRequestEvent(event: string, trace: RequestTrace, details: Record<string, unknown> = {}) {
  console.info(
    JSON.stringify({
      event,
      operationId: trace.operationId,
      requestId: trace.requestId,
      attempt: trace.attempt,
      action: trace.action,
      ...details
    })
  );
}

function attachRequestTrace(response: Response, trace: RequestTrace) {
  if (trace.operationId) {
    response.headers.set("X-Review-Operation-Id", trace.operationId);
  }

  if (trace.requestId) {
    response.headers.set("X-Review-Request-Id", trace.requestId);
  }

  return response;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders
  });
}

function errorResponse(code: string, message: string, status = 400) {
  return json({ code, error: message }, status);
}

function badRequest(message: string, status = 400, code = ERROR_CODES.SYNC_REQUEST_INVALID) {
  return errorResponse(code, message, status);
}

function getRequiredEnv(name: string, code = ERROR_CODES.UNKNOWN_SERVER_FAILURE) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new PhotoSyncError(code, `${name} 시크릿이 설정되지 않았습니다.`);
  }

  return value;
}

function getStorageConfig() {
  return {
    root: (Deno.env.get("NAS_IMAGE_ROOT") ?? DEFAULT_STORAGE_ROOT).replace(/\/+$/g, ""),
    publicPathPrefix: `/${(Deno.env.get("NAS_PUBLIC_IMAGE_PREFIX") ?? DEFAULT_PUBLIC_PATH_PREFIX).replace(
      /^\/+|\/+$/g,
      ""
    )}`,
    uploadPrefix: (Deno.env.get("NAS_IMAGE_UPLOAD_PREFIX") ?? DEFAULT_UPLOAD_PREFIX).replace(/^\/+|\/+$/g, ""),
    fileWriterUrl: Deno.env.get("FILE_WRITER_URL")?.replace(/\/+$/g, "") ?? "",
    fileWriterToken: Deno.env.get("FILE_WRITER_TOKEN") ?? ""
  };
}

function createSupabaseAdminClient(errorCode = ERROR_CODES.UNKNOWN_SERVER_FAILURE) {
  return createClient(getRequiredEnv("SUPABASE_URL", errorCode), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY", errorCode));
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "image";
}

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function getImageExtensionFromContentType(contentType: string) {
  return IMAGE_TYPE_EXTENSION_MAP.get(contentType) ?? "jpg";
}

function ensureAllowedFileExtension(fileName: string, extension: string) {
  const trimmedFileName = fileName.trim() || "image";
  const currentExtension = getFileExtension(trimmedFileName);

  if (ALLOWED_EXTENSIONS.has(currentExtension)) {
    return trimmedFileName;
  }

  const baseName = trimmedFileName.replace(/\.[^.]*$/g, "").replace(/\.+$/g, "") || "image";
  return `${baseName}.${extension}`;
}

function encodeObjectKey(objectKey: string) {
  return objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildObjectKey(
  uploadPrefix: string,
  productId: number,
  submissionId: number,
  operationId: string,
  fileIndex: number,
  fileName: string
) {
  return `${uploadPrefix}/${productId}/${submissionId}/${operationId}/${String(fileIndex + 1).padStart(2, "0")}-${sanitizeFileName(fileName)}`;
}

function buildPublicImagePath(publicPathPrefix: string, objectKey: string) {
  return `${publicPathPrefix}/${encodeObjectKey(objectKey)}`;
}

function isSafeObjectKey(objectKey: string) {
  if (!objectKey || objectKey.startsWith("/") || objectKey.includes("\\")) {
    return false;
  }

  return objectKey.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

function getObjectFilePath(storageRoot: string, objectKey: string) {
  if (!isSafeObjectKey(objectKey)) {
    throw new PhotoSyncError(ERROR_CODES.SYNC_REQUEST_INVALID, "파일 경로가 올바르지 않습니다.", 400);
  }

  return `${storageRoot}/${objectKey}`;
}

function getParentDirectory(filePath: string) {
  return filePath.split("/").slice(0, -1).join("/");
}

function extractObjectKeyFromImageUrl(publicPathPrefix: string, imageUrl: string) {
  if (!imageUrl) {
    return null;
  }

  try {
    if (imageUrl.startsWith(`${publicPathPrefix}/`)) {
      return decodeURIComponent(imageUrl.slice(publicPathPrefix.length + 1));
    }

    const targetUrl = new URL(imageUrl, "http://local.invalid");

    if (targetUrl.pathname.startsWith(`${publicPathPrefix}/`)) {
      return decodeURIComponent(targetUrl.pathname.slice(publicPathPrefix.length + 1));
    }

    if (targetUrl.hostname.endsWith(".amazonaws.com")) {
      return decodeURIComponent(targetUrl.pathname.replace(/^\/+/, ""));
    }
  } catch {
    return null;
  }

  return null;
}

function parseNumberField(formData: FormData, name: string) {
  const value = Number(formData.get(name));
  return Number.isFinite(value) ? value : null;
}

function parseStringField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function parseJsonArrayField(formData: FormData, name: string) {
  const rawValue = formData.get(name);

  if (rawValue == null || rawValue === "") {
    return [];
  }

  if (typeof rawValue !== "string") {
    throw new PhotoSyncError(ERROR_CODES.SYNC_REQUEST_INVALID, `${name} 값이 올바르지 않습니다.`, 400);
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      throw new Error("not array");
    }

    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    throw new PhotoSyncError(ERROR_CODES.SYNC_REQUEST_INVALID, `${name} 값이 올바르지 않습니다.`, 400);
  }
}

function readSyncPayload(formData: FormData): SyncPayload {
  const providedOperationId = parseStringField(formData, "operationId").trim();
  const operationId = providedOperationId || crypto.randomUUID();
  const productId = parseNumberField(formData, "productId");
  const submissionId = parseNumberField(formData, "submissionId");
  const assignName = parseStringField(formData, "assignName");
  const files = formData.getAll("files").filter((item): item is File => item instanceof File);

  if (productId == null || submissionId == null) {
    throw new PhotoSyncError(ERROR_CODES.SYNC_REQUEST_INVALID, "productId와 submissionId는 숫자여야 합니다.", 400);
  }

  if (!TRACE_ID_PATTERN.test(operationId)) {
    throw new PhotoSyncError(ERROR_CODES.SYNC_REQUEST_INVALID, "operationId 값이 올바르지 않습니다.", 400);
  }

  if (!assignName.trim()) {
    throw new PhotoSyncError(ERROR_CODES.SYNC_REQUEST_INVALID, "assignName 값이 필요합니다.", 400);
  }

  if (files.length > MAX_FILE_COUNT) {
    throw new PhotoSyncError(
      ERROR_CODES.SYNC_REQUEST_INVALID,
      `한 번에 최대 ${MAX_FILE_COUNT}장까지만 업로드할 수 있습니다.`,
      400
    );
  }

  return {
    action: "sync",
    operationId,
    productId,
    submissionId,
    assignName,
    removedImageUrls: parseJsonArrayField(formData, "removedImageUrls"),
    files
  };
}

async function loadSubmissionForPublicAccess(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  {
    productId,
    submissionId,
    assignName
  }: {
    productId: number;
    submissionId: number;
    assignName: string;
  },
  errorCode = ERROR_CODES.UNKNOWN_SERVER_FAILURE
) {
  const { data, error } = await supabaseAdmin
    .from("submissions")
    .select("id,product_id,assign_name,is_review_verified")
    .eq("id", submissionId)
    .eq("product_id", productId)
    .eq("assign_name", assignName.trim())
    .maybeSingle();

  if (error) {
    throw new PhotoSyncError(errorCode, error.message);
  }

  if (!data) {
    return null;
  }

  return data;
}

async function listCurrentPhotoUrls(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  submissionId: number,
  errorCode = ERROR_CODES.SYNC_CURRENT_PHOTOS_FAILED
) {
  const photos: Array<{ id: number; image_url: string }> = [];
  let lastPhotoId: number | null = null;

  while (true) {
    let query = supabaseAdmin
      .from("evidence_photos")
      .select("id,image_url")
      .eq("submission_id", submissionId)
      .eq("photo_type", PHOTO_TYPE)
      .order("id", { ascending: true })
      .limit(SUPABASE_PAGE_SIZE);

    if (lastPhotoId != null) {
      query = query.gt("id", lastPhotoId);
    }

    const { data, error } = await query;

    if (error) {
      throw new PhotoSyncError(errorCode, error.message);
    }

    const pageRows = data ?? [];

    if (pageRows.length === 0) {
      break;
    }

    photos.push(...pageRows);
    lastPhotoId = pageRows.at(-1)?.id ?? null;

    if (lastPhotoId == null) {
      throw new PhotoSyncError(errorCode, "증빙 사진 전체 조회를 계속할 커서가 없습니다.");
    }
  }

  return photos.map((item) => item.image_url);
}

async function synchronizePhotoRows(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  submissionId: number,
  newImageUrls: string[],
  removedImageUrls: string[]
) {
  const { data, error } = await supabaseAdmin.rpc("sync_review_receive_photo_rows", {
    p_submission_id: submissionId,
    p_new_image_urls: newImageUrls,
    p_removed_image_urls: removedImageUrls
  });

  if (error) {
    throw new PhotoSyncError(ERROR_CODES.SYNC_TRANSACTION_FAILED, error.message);
  }

  return (data ?? [])
    .map((item: { image_url?: unknown }) => item.image_url)
    .filter((imageUrl: unknown): imageUrl is string => typeof imageUrl === "string");
}

function isObjectKeyOwnedBySubmission(
  objectKey: string,
  storageConfig: ReturnType<typeof getStorageConfig>,
  productId: number,
  submissionId: number
) {
  return objectKey.startsWith(`${storageConfig.uploadPrefix}/${productId}/${submissionId}/`);
}

async function cleanupUnreferencedUploadedFiles(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  storageConfig: ReturnType<typeof getStorageConfig>,
  uploadedFiles: Array<{ objectKey: string; imageUrl: string }>,
  trace: RequestTrace
) {
  if (uploadedFiles.length === 0) {
    return;
  }

  const uploadedImageUrls = uploadedFiles.map((file) => file.imageUrl);
  const { data, error } = await supabaseAdmin
    .from("evidence_photos")
    .select("image_url")
    .in("image_url", uploadedImageUrls);

  if (error) {
    logRequestEvent("review_receive_photo_cleanup_skipped", trace, {
      reason: "reference-check-failed",
      code: ERROR_CODES.SYNC_SERVER_FAILURE
    });
    return;
  }

  const referencedImageUrls = new Set(
    (data ?? [])
      .map((item: { image_url?: unknown }) => item.image_url)
      .filter((imageUrl: unknown): imageUrl is string => typeof imageUrl === "string")
  );
  const unreferencedObjectKeys = uploadedFiles
    .filter((file) => !referencedImageUrls.has(file.imageUrl))
    .map((file) => file.objectKey);

  if (unreferencedObjectKeys.length > 0) {
    await deleteLocalObjects(storageConfig, unreferencedObjectKeys);
  }
}

function hasExpectedImageSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (contentType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  if (contentType === "image/gif") {
    return (
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) &&
      bytes[5] === 0x61
    );
  }

  if (contentType === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }

  return false;
}

async function validateAndReadImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new PhotoSyncError(ERROR_CODES.SYNC_REQUEST_INVALID, "JPG, PNG, WebP, GIF 이미지만 업로드할 수 있습니다.", 400);
  }

  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
    throw new PhotoSyncError(ERROR_CODES.SYNC_REQUEST_INVALID, "이미지 파일은 10MB 이하만 업로드할 수 있습니다.", 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!hasExpectedImageSignature(file.type, bytes)) {
    throw new PhotoSyncError(ERROR_CODES.SYNC_REQUEST_INVALID, "이미지 파일 형식이 올바르지 않습니다.", 400);
  }

  return {
    bytes,
    fileName: ensureAllowedFileExtension(file.name, getImageExtensionFromContentType(file.type))
  };
}

function getFileWriterHeaders(storageConfig: ReturnType<typeof getStorageConfig>, contentType = "application/json") {
  const headers = new Headers({ "Content-Type": contentType });

  if (storageConfig.fileWriterToken) {
    headers.set("X-File-Writer-Token", storageConfig.fileWriterToken);
  }

  return headers;
}

async function writeImageFile(storageConfig: ReturnType<typeof getStorageConfig>, objectKey: string, bytes: Uint8Array) {
  if (storageConfig.fileWriterUrl) {
    const response = await fetch(`${storageConfig.fileWriterUrl}/objects/${encodeObjectKey(objectKey)}`, {
      method: "PUT",
      headers: getFileWriterHeaders(storageConfig, "application/octet-stream"),
      body: bytes
    });

    if (!response.ok) {
      throw new PhotoSyncError(ERROR_CODES.SYNC_SERVER_FAILURE, await response.text(), response.status);
    }

    return;
  }

  const storageRoot = storageConfig.root;
  const filePath = getObjectFilePath(storageRoot, objectKey);
  const tempFilePath = `${filePath}.tmp-${crypto.randomUUID()}`;

  await Deno.mkdir(getParentDirectory(filePath), { recursive: true });
  await Deno.writeFile(tempFilePath, bytes, { createNew: true });
  await Deno.rename(tempFilePath, filePath);
}

async function deleteLocalObjects(storageConfig: ReturnType<typeof getStorageConfig>, objectKeys: string[]) {
  const safeObjectKeys = objectKeys.filter((objectKey) => isSafeObjectKey(objectKey));

  if (storageConfig.fileWriterUrl) {
    const response = await fetch(`${storageConfig.fileWriterUrl}/delete`, {
      method: "POST",
      headers: getFileWriterHeaders(storageConfig),
      body: JSON.stringify({ objectKeys: safeObjectKeys })
    });

    if (!response.ok) {
      throw new PhotoSyncError(ERROR_CODES.SYNC_SERVER_FAILURE, await response.text(), response.status);
    }

    const result = await response.json();
    return Number(result.deletedCount ?? 0);
  }

  const storageRoot = storageConfig.root;
  let deletedCount = 0;

  for (const objectKey of safeObjectKeys) {
    try {
      await Deno.remove(getObjectFilePath(storageRoot, objectKey));
      deletedCount += 1;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  }

  return deletedCount;
}

async function handleSyncAction(payload: SyncPayload, trace: RequestTrace) {
  const supabaseAdmin = createSupabaseAdminClient(ERROR_CODES.SYNC_SERVER_FAILURE);
  const submission = await loadSubmissionForPublicAccess(supabaseAdmin, payload, ERROR_CODES.SYNC_SERVER_FAILURE);

  if (!submission) {
    return badRequest("사진 저장 권한이 없는 제출입니다.", 403, ERROR_CODES.SYNC_ACCESS_DENIED);
  }

  if (submission.is_review_verified) {
    return badRequest("리뷰완료 처리된 제출은 수정할 수 없습니다.", 409, ERROR_CODES.SYNC_LOCKED);
  }

  const storageConfig = getStorageConfig();
  const requestedRemovalImageUrls = [...new Set(payload.removedImageUrls)];
  const removableObjectKeys = requestedRemovalImageUrls
    .map((imageUrl) => extractObjectKeyFromImageUrl(storageConfig.publicPathPrefix, imageUrl))
    .filter(
      (value): value is string =>
        Boolean(value) &&
        isObjectKeyOwnedBySubmission(value as string, storageConfig, payload.productId, payload.submissionId)
    );
  const uploadedFiles: Array<{ objectKey: string; imageUrl: string }> = [];
  let photos: string[] = [];

  try {
    for (let fileIndex = 0; fileIndex < payload.files.length; fileIndex += 1) {
      const file = payload.files[fileIndex];
      const { bytes, fileName } = await validateAndReadImageFile(file);
      const objectKey = buildObjectKey(
        storageConfig.uploadPrefix,
        payload.productId,
        payload.submissionId,
        payload.operationId,
        fileIndex,
        fileName
      );
      const imageUrl = buildPublicImagePath(storageConfig.publicPathPrefix, objectKey);

      await writeImageFile(storageConfig, objectKey, bytes);
      uploadedFiles.push({ objectKey, imageUrl });
    }

    photos = await synchronizePhotoRows(
      supabaseAdmin,
      payload.submissionId,
      uploadedFiles.map((file) => file.imageUrl),
      requestedRemovalImageUrls
    );
  } catch (error) {
    try {
      await cleanupUnreferencedUploadedFiles(supabaseAdmin, storageConfig, uploadedFiles, trace);
    } catch {
      logRequestEvent("review_receive_photo_cleanup_failed", trace, {
        code: ERROR_CODES.SYNC_SERVER_FAILURE
      });
    }

    throw error;
  }

  try {
    await deleteLocalObjects(storageConfig, removableObjectKeys);
  } catch {
    logRequestEvent("review_receive_photo_old_file_delete_failed", trace, {
      code: ERROR_CODES.SYNC_DELETE_FAILED,
      objectCount: removableObjectKeys.length
    });
  }

  return json({ photos, uploadedFiles, operationId: payload.operationId, requestId: trace.requestId });
}

async function handleRollbackAction(body: RollbackAction) {
  if (!Array.isArray(body.objectKeys)) {
    return badRequest("롤백 요청 형식이 올바르지 않습니다.", 400, ERROR_CODES.ROLLBACK_REQUEST_OR_ACCESS_FAILED);
  }

  const supabaseAdmin = createSupabaseAdminClient(ERROR_CODES.ROLLBACK_DELETE_FAILED);
  const submission = await loadSubmissionForPublicAccess(supabaseAdmin, body, ERROR_CODES.ROLLBACK_DELETE_FAILED);

  if (!submission) {
    return badRequest("롤백 권한이 없는 제출입니다.", 403, ERROR_CODES.ROLLBACK_REQUEST_OR_ACCESS_FAILED);
  }

  const storageConfig = getStorageConfig();
  const rollbackKeys = (body.objectKeys ?? []).filter((key) => key.startsWith(`${storageConfig.uploadPrefix}/`));

  try {
    const deletedCount = await deleteLocalObjects(storageConfig, rollbackKeys);
    return json({ deletedCount });
  } catch (error) {
    throw new PhotoSyncError(
      ERROR_CODES.ROLLBACK_DELETE_FAILED,
      error instanceof Error ? error.message : "임시 업로드 파일을 삭제하지 못했습니다."
    );
  }
}

function sanitizeDiagnosticNetworkContext(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const context = value as Record<string, unknown>;
  const numberOrNull = (input: unknown) =>
    typeof input === "number" && Number.isFinite(input) && input >= 0 ? Math.round(input) : null;

  return {
    online: typeof context.online === "boolean" ? context.online : null,
    visibilityState: sanitizeDiagnosticText(context.visibilityState, 20),
    millisecondsSinceForeground: numberOrNull(context.millisecondsSinceForeground),
    millisecondsSinceNetworkChange: numberOrNull(context.millisecondsSinceNetworkChange),
    pageRestoredFromCache: context.pageRestoredFromCache === true,
    effectiveType: sanitizeDiagnosticText(context.effectiveType, 20)
  };
}

function handleDiagnosticAction(body: DiagnosticAction, trace: RequestTrace) {
  const bodyOperationId = sanitizeTraceValue(body.operationId);
  const bodyRequestId = sanitizeTraceValue(body.requestId);

  if (!trace.operationId && bodyOperationId) {
    trace.operationId = bodyOperationId;
  }

  if (!trace.requestId && bodyRequestId) {
    trace.requestId = bodyRequestId;
  }

  if (!trace.attempt && Number.isInteger(body.attempt) && Number(body.attempt) >= 0) {
    trace.attempt = Math.min(Number(body.attempt), 10);
  }

  trace.action = "diagnostic";
  logRequestEvent("review_receive_photo_client_diagnostic", trace, {
    failedRequestId: sanitizeTraceValue(body.failedRequestId),
    code: /^\d{5}$/.test(String(body.code ?? "")) ? body.code : "",
    transportKind: sanitizeDiagnosticText(body.transportKind, 40),
    originalErrorName: sanitizeDiagnosticText(body.originalErrorName, 80),
    originalMessage: sanitizeDiagnosticText(body.originalMessage, 200),
    productId: Number.isFinite(body.productId) ? body.productId : null,
    submissionId: Number.isFinite(body.submissionId) ? body.submissionId : null,
    networkContext: sanitizeDiagnosticNetworkContext(body.networkContext)
  });

  return json({ ok: true, operationId: trace.operationId, requestId: trace.requestId });
}

async function handleRequest(req: Request, trace: RequestTrace) {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  if (req.method !== "POST") {
    return badRequest("POST 요청만 지원합니다.", 405, ERROR_CODES.SYNC_REQUEST_INVALID);
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const action = parseStringField(formData, "action");

    if (action !== "sync") {
      return badRequest("multipart 요청은 sync action만 지원합니다.", 400, ERROR_CODES.SYNC_REQUEST_INVALID);
    }

    const payload = readSyncPayload(formData);

    if (trace.operationId && trace.operationId !== payload.operationId) {
      return badRequest("요청 추적 ID가 일치하지 않습니다.", 400, ERROR_CODES.SYNC_REQUEST_INVALID);
    }

    trace.action = "sync";
    trace.operationId = payload.operationId;
    return await handleSyncAction(payload, trace);
  }

  const body = (await req.json()) as RollbackAction | DiagnosticAction | { action?: string };

  if (!body?.action) {
    return badRequest("action 값이 필요합니다.", 400, ERROR_CODES.SYNC_REQUEST_INVALID);
  }

  if (body.action === "diagnostic") {
    return handleDiagnosticAction(body as DiagnosticAction, trace);
  }

  if (body.action === "rollback") {
    const rollbackBody = body as RollbackAction;
    trace.action = "rollback";

    if (!Number.isFinite(rollbackBody.productId) || !Number.isFinite(rollbackBody.submissionId)) {
      return badRequest("productId와 submissionId는 숫자여야 합니다.", 400, ERROR_CODES.ROLLBACK_REQUEST_OR_ACCESS_FAILED);
    }

    if (!rollbackBody.assignName?.trim()) {
      return badRequest("assignName 값이 필요합니다.", 400, ERROR_CODES.ROLLBACK_REQUEST_OR_ACCESS_FAILED);
    }

    return await handleRollbackAction(rollbackBody);
  }

  return badRequest("지원하지 않는 action 입니다.", 400, ERROR_CODES.SYNC_REQUEST_INVALID);
}

Deno.serve(async (req) => {
  const trace = createRequestTrace(req);
  const startedAt = Date.now();
  logRequestEvent("review_receive_photo_request_started", trace, {
    method: req.method
  });

  let response: Response;

  try {
    response = await handleRequest(req, trace);
  } catch (error) {
    if (error instanceof PhotoSyncError) {
      trace.errorCode = error.code;
      response = errorResponse(error.code, error.message, error.status);
    } else {
      trace.errorCode = ERROR_CODES.UNKNOWN_SERVER_FAILURE;
      response = errorResponse(
        ERROR_CODES.UNKNOWN_SERVER_FAILURE,
        error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
        500
      );
    }
  }

  attachRequestTrace(response, trace);
  logRequestEvent("review_receive_photo_request_completed", trace, {
    status: response.status,
    errorCode: trace.errorCode,
    durationMs: Date.now() - startedAt
  });

  return response;
});
