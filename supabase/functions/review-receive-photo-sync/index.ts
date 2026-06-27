import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
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

const ERROR_CODES = {
  SYNC_REQUEST_INVALID: "00011",
  SYNC_ACCESS_DENIED: "00012",
  SYNC_LOCKED: "00013",
  SYNC_CURRENT_PHOTOS_FAILED: "00034",
  SYNC_INSERT_FAILED: "00035",
  SYNC_DELETE_FAILED: "00036",
  SYNC_SERVER_FAILURE: "00038",
  ROLLBACK_REQUEST_OR_ACCESS_FAILED: "00041",
  ROLLBACK_DELETE_FAILED: "00042",
  UNKNOWN_SERVER_FAILURE: "00090"
} as const;

type SyncPayload = {
  action: "sync";
  productId: number;
  submissionId: number;
  assignName: string;
  removedImageUrls: string[];
  files: File[];
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

function encodeObjectKey(objectKey: string) {
  return objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildObjectKey(uploadPrefix: string, productId: number, submissionId: number, fileName: string) {
  return `${uploadPrefix}/${productId}/${submissionId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
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
  const productId = parseNumberField(formData, "productId");
  const submissionId = parseNumberField(formData, "submissionId");
  const assignName = parseStringField(formData, "assignName");
  const files = formData.getAll("files").filter((item): item is File => item instanceof File);

  if (productId == null || submissionId == null) {
    throw new PhotoSyncError(ERROR_CODES.SYNC_REQUEST_INVALID, "productId와 submissionId는 숫자여야 합니다.", 400);
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

  const extension = getFileExtension(file.name);

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new PhotoSyncError(ERROR_CODES.SYNC_REQUEST_INVALID, "허용되지 않은 이미지 확장자입니다.", 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!hasExpectedImageSignature(file.type, bytes)) {
    throw new PhotoSyncError(ERROR_CODES.SYNC_REQUEST_INVALID, "이미지 파일 형식이 올바르지 않습니다.", 400);
  }

  return bytes;
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

async function handleSyncAction(payload: SyncPayload) {
  const supabaseAdmin = createSupabaseAdminClient(ERROR_CODES.SYNC_SERVER_FAILURE);
  const submission = await loadSubmissionForPublicAccess(supabaseAdmin, payload, ERROR_CODES.SYNC_SERVER_FAILURE);

  if (!submission) {
    return badRequest("사진 저장 권한이 없는 제출입니다.", 403, ERROR_CODES.SYNC_ACCESS_DENIED);
  }

  if (submission.is_review_verified) {
    return badRequest("리뷰완료 처리된 제출은 수정할 수 없습니다.", 409, ERROR_CODES.SYNC_LOCKED);
  }

  const storageConfig = getStorageConfig();
  const currentPhotos = await listCurrentPhotoUrls(
    supabaseAdmin,
    payload.submissionId,
    ERROR_CODES.SYNC_CURRENT_PHOTOS_FAILED
  );
  const currentPhotoSet = new Set(currentPhotos);
  const removableImageUrls = payload.removedImageUrls.filter((imageUrl) => currentPhotoSet.has(imageUrl));
  const removableObjectKeys = removableImageUrls
    .map((imageUrl) => extractObjectKeyFromImageUrl(storageConfig.publicPathPrefix, imageUrl))
    .filter((value): value is string => Boolean(value));
  const uploadedFiles: Array<{ objectKey: string; imageUrl: string }> = [];

  try {
    for (const file of payload.files) {
      const bytes = await validateAndReadImageFile(file);
      const objectKey = buildObjectKey(storageConfig.uploadPrefix, payload.productId, payload.submissionId, file.name);
      const imageUrl = buildPublicImagePath(storageConfig.publicPathPrefix, objectKey);

      await writeImageFile(storageConfig, objectKey, bytes);
      uploadedFiles.push({ objectKey, imageUrl });
    }

    if (uploadedFiles.length > 0) {
      const { error } = await supabaseAdmin.from("evidence_photos").insert(
        uploadedFiles.map((file) => ({
          submission_id: payload.submissionId,
          photo_type: PHOTO_TYPE,
          image_url: file.imageUrl
        }))
      );

      if (error) {
        throw new PhotoSyncError(ERROR_CODES.SYNC_INSERT_FAILED, error.message);
      }
    }

    if (removableImageUrls.length > 0) {
      const { error } = await supabaseAdmin
        .from("evidence_photos")
        .delete()
        .eq("submission_id", payload.submissionId)
        .eq("photo_type", PHOTO_TYPE)
        .in("image_url", removableImageUrls);

      if (error) {
        throw new PhotoSyncError(ERROR_CODES.SYNC_DELETE_FAILED, error.message);
      }
    }
  } catch (error) {
    if (uploadedFiles.length > 0) {
      await deleteLocalObjects(storageConfig, uploadedFiles.map((file) => file.objectKey));

      await supabaseAdmin
        .from("evidence_photos")
        .delete()
        .eq("submission_id", payload.submissionId)
        .eq("photo_type", PHOTO_TYPE)
        .in(
          "image_url",
          uploadedFiles.map((file) => file.imageUrl)
        );
    }

    throw error;
  }

  const removedImageUrlSet = new Set(removableImageUrls);
  const photos = [
    ...currentPhotos.filter((imageUrl) => !removedImageUrlSet.has(imageUrl)),
    ...uploadedFiles.map((file) => file.imageUrl)
  ];

  try {
    await deleteLocalObjects(storageConfig, removableObjectKeys);
  } catch (error) {
    console.error("Failed to delete local image files after DB commit", error);
  }

  return json({ photos, uploadedFiles });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  if (req.method !== "POST") {
    return badRequest("POST 요청만 지원합니다.", 405, ERROR_CODES.SYNC_REQUEST_INVALID);
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const action = parseStringField(formData, "action");

      if (action !== "sync") {
        return badRequest("multipart 요청은 sync action만 지원합니다.", 400, ERROR_CODES.SYNC_REQUEST_INVALID);
      }

      return await handleSyncAction(readSyncPayload(formData));
    }

    const body = (await req.json()) as RollbackAction | { action?: string };

    if (!body?.action) {
      return badRequest("action 값이 필요합니다.", 400, ERROR_CODES.SYNC_REQUEST_INVALID);
    }

    if (body.action === "rollback") {
      if (!Number.isFinite(body.productId) || !Number.isFinite(body.submissionId)) {
        return badRequest("productId와 submissionId는 숫자여야 합니다.", 400, ERROR_CODES.ROLLBACK_REQUEST_OR_ACCESS_FAILED);
      }

      if (!body.assignName?.trim()) {
        return badRequest("assignName 값이 필요합니다.", 400, ERROR_CODES.ROLLBACK_REQUEST_OR_ACCESS_FAILED);
      }

      return await handleRollbackAction(body);
    }

    return badRequest("지원하지 않는 action 입니다.", 400, ERROR_CODES.SYNC_REQUEST_INVALID);
  } catch (error) {
    if (error instanceof PhotoSyncError) {
      return errorResponse(error.code, error.message, error.status);
    }

    return errorResponse(
      ERROR_CODES.UNKNOWN_SERVER_FAILURE,
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
      500
    );
  }
});
