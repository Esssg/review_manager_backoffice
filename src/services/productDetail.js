import { supabase } from "../lib/supabase";

const PRODUCT_META_SELECT = "id,title,product_name,description,manager_id";
const SUBMISSION_LIST_SELECT =
  "id,assign_name,order_number,buyer_name,recipient_name,purchase_account,review_fee,is_purchase_verified,is_review_verified,created_at";

export async function fetchProductMeta(productId, adminId) {
  const [productResult, stepsResult] = await Promise.all([
    supabase
      .from("products")
      .select(PRODUCT_META_SELECT)
      .eq("id", productId)
      .eq("manager_id", adminId)
      .maybeSingle(),
    supabase.from("product_steps").select("step_number").eq("product_id", productId)
  ]);

  return {
    productResult,
    stepsResult
  };
}

export async function fetchApplications(productId) {
  return supabase
    .from("applications")
    .select("id,applicant_name,is_confirmed,created_at")
    .eq("product_id", productId)
    .order("is_confirmed", { ascending: false })
    .order("created_at", { ascending: true });
}

export async function fetchSubmissions(productId) {
  return supabase
    .from("submissions")
    .select(SUBMISSION_LIST_SELECT)
    .eq("product_id", productId)
    .order("created_at", { ascending: true });
}

export async function fetchEvidencePhotos(submissionIds, photoType) {
  let hasEvidencePhotoTable = true;
  let photos = [];
  let photosError = null;

  if (submissionIds.length === 0) {
    return { photos, photosError, hasEvidencePhotoTable };
  }

  const primaryResult = await supabase
    .from("evidence_photos")
    .select("submission_id,image_url")
    .eq("photo_type", photoType)
    .in("submission_id", submissionIds);

  photos = primaryResult.data ?? [];
  photosError = primaryResult.error;

  const shouldFallbackPhotoTable =
    Boolean(photosError) &&
    (photosError?.code === "42P01" || photosError?.message?.includes("evidence_photos"));

  if (shouldFallbackPhotoTable) {
    const fallbackResult = await supabase
      .from("evidence_photo")
      .select("submission_id,image_url")
      .eq("photo_type", photoType)
      .in("submission_id", submissionIds);
    photos = fallbackResult.data ?? [];
    photosError = fallbackResult.error;
  }

  const evidenceTableMissing =
    Boolean(photosError) &&
    (photosError?.code === "42P01" || photosError?.message?.includes("evidence_photo"));

  if (evidenceTableMissing) {
    hasEvidencePhotoTable = false;
    photos = [];
    photosError = null;
  }

  return { photos, photosError, hasEvidencePhotoTable };
}

export async function updateApplicationConfirmed(applicationId, productId, checked) {
  return supabase
    .from("applications")
    .update({ is_confirmed: checked })
    .eq("id", applicationId)
    .eq("product_id", productId);
}

export async function updateSubmissionVerified(submissionId, targetColumn, checked) {
  return supabase
    .from("submissions")
    .update({ [targetColumn]: checked })
    .eq("id", submissionId);
}

export async function updateSubmissionReviewFee(submissionId, reviewFee) {
  return supabase
    .from("submissions")
    .update({ review_fee: reviewFee })
    .eq("id", submissionId)
    .select(SUBMISSION_LIST_SELECT)
    .single();
}

export async function deleteEvidenceRowsIfExists(tableName, submissionId) {
  const { error } = await supabase.from(tableName).delete().eq("submission_id", submissionId);
  const isMissingTable =
    error?.code === "42P01" ||
    error?.code === "PGRST204" ||
    error?.message?.includes("Could not find the table") ||
    error?.message?.includes(`public.${tableName}`);

  if (error && !isMissingTable) {
    throw error;
  }
}

export async function deleteSubmission(submissionId) {
  return supabase.from("submissions").delete().eq("id", submissionId);
}

export async function setProductStepEnabled(productId, stepNumber, checked) {
  if (checked) {
    return supabase
      .from("product_steps")
      .insert({ product_id: Number(productId), step_number: stepNumber });
  }

  return supabase
    .from("product_steps")
    .delete()
    .eq("product_id", productId)
    .eq("step_number", stepNumber);
}

export async function findSubmissionByOrderNumber(productId, orderNumber) {
  return supabase
    .from("submissions")
    .select("id")
    .eq("product_id", productId)
    .eq("order_number", orderNumber)
    .maybeSingle();
}

export async function createSubmission(payload) {
  return supabase.from("submissions").insert(payload).select(SUBMISSION_LIST_SELECT).single();
}
