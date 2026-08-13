// @ts-nocheck

import { supabase, supabaseAnonKey } from "@/lib/supabase";
import { compareByCreatedAtThenId, fetchAllRows, fetchAllRowsInChunks } from "@/services/paginatedQuery";
import { invokeReviewReceivePhotoSyncRequest } from "@/services/reviewReceivePhotoSyncTransport";

const PUBLIC_REVIEW_RECEIVE_PRODUCT_SELECT =
  "id,title,product_name,option_name,review_type,description,planned_depositor_name,product_date,company_name,\"deposit_GB\",bundle_id";
const PUBLIC_REVIEW_RECEIVE_SUBMISSION_SELECT =
  "id,product_id,assign_name,order_number,buyer_name,recipient_name,purchase_account,contact,address,bank_name,bank_account,account_holder,amount,review_fee,is_review_verified,is_deposit_verified,deposited_at,actual_depositor_name,created_at";
const PUBLIC_REVIEW_RECEIVE_LOOKUP_FIELD_MAP = {
  assign_name: "assign_name",
  account_holder: "account_holder"
};

const PHOTO_SYNC_FALLBACK_ERROR_CODES = {
  sync: {
    transport: "00030",
    http: "00031",
    unauthorized: "00032",
    locked: "00033",
    server: "00038"
  },
  rollback: {
    transport: "00040",
    http: "00041",
    server: "00042"
  }
};

async function extractFunctionErrorPayload(response) {
  if (!response) {
    return {
      code: "",
      message: ""
    };
  }

  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = await response.clone().json();
      return {
        code: payload?.code || "",
        message: payload?.error || payload?.message || ""
      };
    }

    const text = await response.clone().text();
    return {
      code: "",
      message: text || ""
    };
  } catch {
    return {
      code: "",
      message: ""
    };
  }
}

function getFunctionErrorStatus(error, response) {
  return response?.status ?? error?.context?.status ?? null;
}

function getFunctionFallbackErrorCode(action, error, response) {
  const fallbackCodes = PHOTO_SYNC_FALLBACK_ERROR_CODES[action] ?? PHOTO_SYNC_FALLBACK_ERROR_CODES.prepare;
  const status = getFunctionErrorStatus(error, response);

  if (error?.name === "FunctionsFetchError" || error?.name === "FunctionsRelayError") {
    return fallbackCodes.transport;
  }

  if (status === 403) {
    return fallbackCodes.unauthorized ?? fallbackCodes.http;
  }

  if (status === 409) {
    return fallbackCodes.locked ?? fallbackCodes.http;
  }

  if (status >= 500) {
    return fallbackCodes.server ?? fallbackCodes.http;
  }

  return fallbackCodes.http;
}

function buildPhotoSyncFunctionError({ action, error, response, payload }) {
  const code = payload.code || getFunctionFallbackErrorCode(action, error, response);
  const status = getFunctionErrorStatus(error, response);
  const message = payload.message || error?.message || "사진 저장 요청에 실패했습니다.";
  const normalizedError = new Error(message);

  normalizedError.code = code;
  normalizedError.stage = action;
  normalizedError.status = status;
  normalizedError.originalErrorName = error?.name || "";
  normalizedError.originalMessage = error?.message || "";

  return normalizedError;
}

async function invokeReviewReceivePhotoSync(action, payload) {
  const result = await invokeReviewReceivePhotoSyncRequest({
    action,
    payload,
    supabaseKey: supabaseAnonKey,
    getAccessToken: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token;
    }
  });

  if (!result.error) {
    return result;
  }

  const payloadError = await extractFunctionErrorPayload(result.response);

  return {
    ...result,
    error: buildPhotoSyncFunctionError({
      action,
      error: result.error,
      response: result.response,
      payload: payloadError
    })
  };
}

export async function fetchPublicReviewReceiveProduct(productId) {
  return supabase
    .from("products")
    .select(PUBLIC_REVIEW_RECEIVE_PRODUCT_SELECT)
    .eq("id", productId)
    .maybeSingle();
}

export async function fetchPublicReviewReceiveProductBundle(productId) {
  const productResult = await fetchPublicReviewReceiveProduct(productId);

  if (productResult.error || !productResult.data) {
    return {
      data: null,
      error: productResult.error
    };
  }

  const bundleId = productResult.data.bundle_id ?? productResult.data.id;

  if (!bundleId) {
    return {
      data: {
        product: productResult.data,
        products: [productResult.data]
      },
      error: null
    };
  }

  const bundleResult = await fetchAllRows(() =>
    supabase
      .from("products")
      .select(PUBLIC_REVIEW_RECEIVE_PRODUCT_SELECT)
      .eq("bundle_id", bundleId)
  );

  if (bundleResult.error) {
    return {
      data: null,
      error: bundleResult.error
    };
  }

  return {
    data: {
      product: productResult.data,
      products: bundleResult.data?.length ? bundleResult.data : [productResult.data]
    },
    error: null
  };
}

export async function fetchPublicReviewReceiveSubmissions(productIds, lookupType, lookupValue) {
  const lookupField = PUBLIC_REVIEW_RECEIVE_LOOKUP_FIELD_MAP[lookupType] ?? "assign_name";
  const ids = (Array.isArray(productIds) ? productIds : [productIds])
    .map((productId) => Number(productId))
    .filter((productId) => Number.isFinite(productId));

  if (ids.length === 0) {
    return { data: [], error: null };
  }

  const result = await fetchAllRowsInChunks(ids, (productIdChunk) =>
    supabase
      .from("submissions")
      .select(PUBLIC_REVIEW_RECEIVE_SUBMISSION_SELECT)
      .in("product_id", productIdChunk)
      .eq(lookupField, lookupValue)
  );

  if (result.data) {
    result.data.sort((left, right) => {
      const productComparison = Number(left.product_id) - Number(right.product_id);
      return productComparison || compareByCreatedAtThenId(left, right);
    });
  }

  return result;
}

export async function fetchPublicReviewReceiveEvidencePhotos(submissionIds) {
  if (submissionIds.length === 0) {
    return { data: [], error: null };
  }

  return fetchAllRowsInChunks(submissionIds, (submissionIdChunk) =>
    supabase
      .from("evidence_photos")
      .select("id,submission_id,image_url")
      .eq("photo_type", "review")
      .in("submission_id", submissionIdChunk)
  );
}

export async function syncPublicReviewReceivePhotoUpload(payload) {
  const formData = new FormData();

  formData.append("action", "sync");
  formData.append("productId", String(payload.productId));
  formData.append("submissionId", String(payload.submissionId));
  formData.append("assignName", payload.assignName ?? "");
  formData.append("removedImageUrls", JSON.stringify(payload.removedImageUrls ?? []));

  for (const file of payload.files ?? []) {
    formData.append("files", file, file.name);
  }

  return invokeReviewReceivePhotoSync("sync", formData);
}

export async function rollbackPublicReviewReceivePhotoUpload(payload) {
  return invokeReviewReceivePhotoSync("rollback", payload);
}
