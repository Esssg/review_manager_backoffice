import { supabase } from "../lib/supabase";

const PUBLIC_REVIEW_RECEIVE_PRODUCT_SELECT =
  "id,title,product_name,option_name,review_type,review_fee,description,planned_depositor_name";
const PUBLIC_REVIEW_RECEIVE_SUBMISSION_SELECT =
  "id,assign_name,order_number,buyer_name,recipient_name,purchase_account,contact,address,bank_name,bank_account,account_holder,amount,is_review_verified,is_deposit_verified,deposited_at,actual_depositor_name,created_at";
const REVIEW_RECEIVE_PHOTO_SYNC_FUNCTION = "review-receive-photo-sync";

async function extractFunctionErrorMessage(response) {
  if (!response) {
    return "";
  }

  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = await response.clone().json();
      return payload?.error || payload?.message || "";
    }

    const text = await response.clone().text();
    return text || "";
  } catch {
    return "";
  }
}

async function invokeReviewReceivePhotoSync(payload) {
  const result = await supabase.functions.invoke(REVIEW_RECEIVE_PHOTO_SYNC_FUNCTION, {
    body: payload
  });

  if (!result.error) {
    return result;
  }

  const detailedMessage =
    (await extractFunctionErrorMessage(result.response)) ||
    result.error?.message ||
    "사진 저장 요청에 실패했습니다.";

  return {
    ...result,
    error: new Error(detailedMessage)
  };
}

export async function fetchPublicReviewReceiveProduct(productId) {
  return supabase
    .from("products")
    .select(PUBLIC_REVIEW_RECEIVE_PRODUCT_SELECT)
    .eq("id", productId)
    .maybeSingle();
}

export async function fetchPublicReviewReceiveSubmissions(productId, assignName) {
  return supabase
    .from("submissions")
    .select(PUBLIC_REVIEW_RECEIVE_SUBMISSION_SELECT)
    .eq("product_id", productId)
    .eq("assign_name", assignName)
    .order("created_at", { ascending: true });
}

export async function fetchPublicReviewReceiveEvidencePhotos(submissionIds) {
  if (submissionIds.length === 0) {
    return { data: [], error: null };
  }

  return supabase
    .from("evidence_photos")
    .select("submission_id,image_url")
    .eq("photo_type", "review")
    .in("submission_id", submissionIds);
}

export async function preparePublicReviewReceivePhotoUpload(payload) {
  return invokeReviewReceivePhotoSync({
    action: "prepare",
    ...payload
  });
}

export async function commitPublicReviewReceivePhotoUpload(payload) {
  return invokeReviewReceivePhotoSync({
    action: "commit",
    ...payload
  });
}

export async function rollbackPublicReviewReceivePhotoUpload(payload) {
  return invokeReviewReceivePhotoSync({
    action: "rollback",
    ...payload
  });
}
