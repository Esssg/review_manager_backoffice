import { supabase } from "../lib/supabase";
import { compareByCreatedAtThenId, fetchAllRows, fetchAllRowsInChunks } from "./paginatedQuery";

const PRODUCT_META_SELECT = "id,title,product_name,description,product_link,manager_id";
const SUBMISSION_LIST_SELECT =
  "id,assign_name,order_number,buyer_name,recipient_name,purchase_account,is_purchase_verified,is_review_verified,created_at";

export async function fetchProductMeta(productId, adminId) {
  const [productResult, stepsResult] = await Promise.all([
    supabase
      .from("products")
      .select(PRODUCT_META_SELECT)
      .eq("id", productId)
      .eq("manager_id", adminId)
      .maybeSingle(),
    fetchAllRows(() =>
      supabase.from("product_steps").select("id,step_number").eq("product_id", productId)
    )
  ]);

  return {
    productResult,
    stepsResult
  };
}

export async function fetchApplications(productId) {
  const result = await fetchAllRows(() =>
    supabase
      .from("applications")
      .select("id,applicant_name,is_confirmed,created_at")
      .eq("product_id", productId)
  );

  if (result.data) {
    result.data.sort((left, right) => compareByCreatedAtThenId(left, right));
  }

  return result;
}

export async function fetchSubmissions(productId) {
  const result = await fetchAllRows(() =>
    supabase
      .from("submissions")
      .select(SUBMISSION_LIST_SELECT)
      .eq("product_id", productId)
  );

  if (result.data) {
    result.data.sort((left, right) => compareByCreatedAtThenId(left, right));
  }

  return result;
}

export async function fetchEvidencePhotos(submissionIds, photoType) {
  if (submissionIds.length === 0) {
    return { photos: [], photosError: null };
  }

  const result = await fetchAllRowsInChunks(submissionIds, (submissionIdChunk) =>
    supabase
      .from("evidence_photos")
      .select("id,submission_id,image_url")
      .eq("photo_type", photoType)
      .in("submission_id", submissionIdChunk)
  );

  return {
    photos: result.data ?? [],
    photosError: result.error
  };
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
