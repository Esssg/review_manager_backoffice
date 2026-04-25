import { createClient } from "npm:@supabase/supabase-js@2";
import {
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client
} from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const PHOTO_TYPE = "review";
const MAX_FILE_COUNT = 10;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

type PrepareAction = {
  action: "prepare";
  productId: number;
  submissionId: number;
  assignName: string;
  files: Array<{
    fileName: string;
    contentType: string;
    size: number;
  }>;
};

type CommitAction = {
  action: "commit";
  productId: number;
  submissionId: number;
  assignName: string;
  removedImageUrls: string[];
  uploadedFiles: Array<{
    objectKey: string;
    imageUrl: string;
  }>;
};

type RollbackAction = {
  action: "rollback";
  productId: number;
  submissionId: number;
  assignName: string;
  objectKeys: string[];
};

type RequestBody = PrepareAction | CommitAction | RollbackAction;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders
  });
}

function badRequest(message: string, status = 400) {
  return json({ error: message }, status);
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} 시크릿이 설정되지 않았습니다.`);
  }

  return value;
}

function getS3Config() {
  const region = getRequiredEnv("AWS_S3_REGION");
  const bucket = getRequiredEnv("AWS_S3_BUCKET");
  const accessKeyId = getRequiredEnv("AWS_S3_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("AWS_S3_SECRET_ACCESS_KEY");
  const uploadPrefix = (Deno.env.get("AWS_S3_UPLOAD_PREFIX") ?? "review-receive").replace(/^\/+|\/+$/g, "");
  const publicBaseUrl =
    (Deno.env.get("AWS_S3_PUBLIC_BASE_URL") ?? `https://${bucket}.s3.${region}.amazonaws.com`).replace(/\/+$/g, "");

  return {
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    uploadPrefix,
    publicBaseUrl
  };
}

function encodeObjectKey(objectKey: string) {
  return objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "image";
}

function buildObjectKey(uploadPrefix: string, productId: number, submissionId: number, fileName: string) {
  return `${uploadPrefix}/${productId}/${submissionId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

function buildPublicImageUrl(publicBaseUrl: string, objectKey: string) {
  return `${publicBaseUrl}/${encodeObjectKey(objectKey)}`;
}

function extractObjectKeyFromImageUrl(publicBaseUrl: string, imageUrl: string) {
  try {
    const baseUrl = new URL(publicBaseUrl);
    const targetUrl = new URL(imageUrl);

    if (baseUrl.origin !== targetUrl.origin) {
      return null;
    }

    const normalizedBasePath = baseUrl.pathname.replace(/\/+$/g, "");
    const targetPath = targetUrl.pathname;

    if (normalizedBasePath) {
      if (!targetPath.startsWith(`${normalizedBasePath}/`)) {
        return null;
      }

      return decodeURIComponent(targetPath.slice(normalizedBasePath.length + 1));
    }

    return decodeURIComponent(targetPath.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

function createSupabaseAdminClient() {
  return createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

function createS3Client(config: ReturnType<typeof getS3Config>) {
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
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
  }
) {
  const { data, error } = await supabaseAdmin
    .from("submissions")
    .select("id,product_id,assign_name,is_review_verified")
    .eq("id", submissionId)
    .eq("product_id", productId)
    .eq("assign_name", assignName.trim())
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return data;
}

async function deleteS3Objects(s3Client: S3Client, bucket: string, objectKeys: string[]) {
  if (objectKeys.length === 0) {
    return;
  }

  await s3Client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: objectKeys.map((key) => ({ Key: key }))
      }
    })
  );
}

async function listCurrentPhotoUrls(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  submissionId: number
) {
  const { data, error } = await supabaseAdmin
    .from("evidence_photos")
    .select("image_url")
    .eq("submission_id", submissionId)
    .eq("photo_type", PHOTO_TYPE)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((item) => item.image_url);
}

async function handlePrepareAction(body: PrepareAction) {
  if (!Array.isArray(body.files) || body.files.length === 0) {
    return badRequest("업로드할 파일 정보가 없습니다.");
  }

  if (body.files.length > MAX_FILE_COUNT) {
    return badRequest(`한 번에 최대 ${MAX_FILE_COUNT}장까지만 업로드할 수 있습니다.`);
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const submission = await loadSubmissionForPublicAccess(supabaseAdmin, body);

  if (!submission) {
    return badRequest("사진 업로드 권한이 없는 제출입니다.", 403);
  }

  if (submission.is_review_verified) {
    return badRequest("리뷰완료 처리된 제출은 수정할 수 없습니다.", 409);
  }

  const s3Config = getS3Config();
  const s3Client = createS3Client(s3Config);

  const uploads = [];

  for (const file of body.files) {
    if (!file.contentType?.startsWith("image/")) {
      return badRequest("이미지 파일만 업로드할 수 있습니다.");
    }

    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
      return badRequest(`이미지 파일은 10MB 이하만 업로드할 수 있습니다.`);
    }

    const objectKey = buildObjectKey(s3Config.uploadPrefix, body.productId, body.submissionId, file.fileName);
    const uploadUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: objectKey,
        ContentType: file.contentType
      }),
      { expiresIn: 60 * 5 }
    );

    uploads.push({
      objectKey,
      uploadUrl,
      imageUrl: buildPublicImageUrl(s3Config.publicBaseUrl, objectKey)
    });
  }

  return json({ uploads });
}

async function handleCommitAction(body: CommitAction) {
  if (!Array.isArray(body.removedImageUrls) || !Array.isArray(body.uploadedFiles)) {
    return badRequest("사진 저장 요청 형식이 올바르지 않습니다.");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const submission = await loadSubmissionForPublicAccess(supabaseAdmin, body);

  if (!submission) {
    return badRequest("사진 저장 권한이 없는 제출입니다.", 403);
  }

  if (submission.is_review_verified) {
    return badRequest("리뷰완료 처리된 제출은 수정할 수 없습니다.", 409);
  }

  const s3Config = getS3Config();
  const currentPhotos = await listCurrentPhotoUrls(supabaseAdmin, body.submissionId);
  const currentPhotoSet = new Set(currentPhotos);
  const removableImageUrls = body.removedImageUrls.filter((imageUrl) => currentPhotoSet.has(imageUrl));
  const removableObjectKeys = removableImageUrls
    .map((imageUrl) => extractObjectKeyFromImageUrl(s3Config.publicBaseUrl, imageUrl))
    .filter((value): value is string => Boolean(value));

  const validUploadedFiles = body.uploadedFiles.filter((file) => {
    if (!file?.objectKey || !file?.imageUrl) {
      return false;
    }

    return file.imageUrl === buildPublicImageUrl(s3Config.publicBaseUrl, file.objectKey);
  });
  const uploadedImageUrls = validUploadedFiles.map((file) => file.imageUrl);

  if (validUploadedFiles.length > MAX_FILE_COUNT) {
    return badRequest(`한 번에 최대 ${MAX_FILE_COUNT}장까지만 업로드할 수 있습니다.`);
  }

  try {
    if (validUploadedFiles.length > 0) {
      const { error } = await supabaseAdmin.from("evidence_photos").insert(
        validUploadedFiles.map((file) => ({
          submission_id: body.submissionId,
          photo_type: PHOTO_TYPE,
          image_url: file.imageUrl
        }))
      );

      if (error) {
        throw new Error(error.message);
      }
    }

    if (removableImageUrls.length > 0) {
      const { error } = await supabaseAdmin
        .from("evidence_photos")
        .delete()
        .eq("submission_id", body.submissionId)
        .eq("photo_type", PHOTO_TYPE)
        .in("image_url", removableImageUrls);

      if (error) {
        throw new Error(error.message);
      }
    }
  } catch (error) {
    if (uploadedImageUrls.length > 0) {
      await supabaseAdmin
        .from("evidence_photos")
        .delete()
        .eq("submission_id", body.submissionId)
        .eq("photo_type", PHOTO_TYPE)
        .in("image_url", uploadedImageUrls);
    }

    throw error;
  }

  const s3Client = createS3Client(s3Config);
  const removedImageUrlSet = new Set(removableImageUrls);
  const photos = [...currentPhotos.filter((imageUrl) => !removedImageUrlSet.has(imageUrl)), ...uploadedImageUrls];

  try {
    await deleteS3Objects(s3Client, s3Config.bucket, removableObjectKeys);
  } catch (error) {
    console.error("Failed to delete S3 objects after DB commit", error);
  }

  return json({ photos });
}

async function handleRollbackAction(body: RollbackAction) {
  if (!Array.isArray(body.objectKeys)) {
    return badRequest("롤백 요청 형식이 올바르지 않습니다.");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const submission = await loadSubmissionForPublicAccess(supabaseAdmin, body);

  if (!submission) {
    return badRequest("롤백 권한이 없는 제출입니다.", 403);
  }

  const s3Config = getS3Config();
  const s3Client = createS3Client(s3Config);
  const rollbackKeys = (body.objectKeys ?? []).filter((key) => key.startsWith(`${s3Config.uploadPrefix}/`));

  await deleteS3Objects(s3Client, s3Config.bucket, rollbackKeys);

  return json({ deletedCount: rollbackKeys.length });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  if (req.method !== "POST") {
    return badRequest("POST 요청만 지원합니다.", 405);
  }

  try {
    const body = (await req.json()) as RequestBody;

    if (!body?.action) {
      return badRequest("action 값이 필요합니다.");
    }

    if (!Number.isFinite(body.productId) || !Number.isFinite(body.submissionId)) {
      return badRequest("productId와 submissionId는 숫자여야 합니다.");
    }

    if (!body.assignName?.trim()) {
      return badRequest("assignName 값이 필요합니다.");
    }

    if (body.action === "prepare") {
      return await handlePrepareAction(body);
    }

    if (body.action === "commit") {
      return await handleCommitAction(body);
    }

    if (body.action === "rollback") {
      return await handleRollbackAction(body);
    }

    return badRequest("지원하지 않는 action 입니다.");
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.", 500);
  }
});
