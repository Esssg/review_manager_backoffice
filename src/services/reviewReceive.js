import { supabase } from "../lib/supabase";
import { resolveAdminManagerScope } from "./adminScope";

const REVIEW_RECEIVE_PRODUCT_SELECT =
  "id,title,product_name,description,company_name,option_name,review_type,planned_depositor_name,manager_id";
const REVIEW_RECEIVE_SUBMISSIONS_SELECT =
  "id,product_id,assign_name,order_number,buyer_name,recipient_name,purchase_account,contact,address,bank_name,bank_account,account_holder,amount,review_fee,is_purchase_verified,is_review_verified,is_deposit_verified,deposited_at,actual_depositor_name,created_at";

export async function fetchReviewReceiveDetail(productId, adminId) {
  const scope = await resolveAdminManagerScope(adminId, { includeCompanyData: true });

  if (scope.error) {
    return {
      scope,
      productResult: {
        data: null,
        error: scope.error
      },
      submissionsResult: {
        data: [],
        error: null
      }
    };
  }

  const [productResult, submissionsResult] = await Promise.all([
    supabase
      .from("products")
      .select(REVIEW_RECEIVE_PRODUCT_SELECT)
      .eq("id", productId)
      .in("manager_id", scope.managerIds)
      .maybeSingle(),
    supabase
      .from("submissions")
      .select(REVIEW_RECEIVE_SUBMISSIONS_SELECT)
      .eq("product_id", productId)
      .order("created_at", { ascending: true })
  ]);

  return {
    scope,
    productResult,
    submissionsResult
  };
}

export async function updateReviewReceiveSubmissionStatus(submissionId, updates) {
  return supabase.from("submissions").update(updates).eq("id", submissionId);
}

export async function fetchReviewReceiveEvidencePhotos(submissionIds) {
  if (submissionIds.length === 0) {
    return { data: [], error: null };
  }

  return supabase
    .from("evidence_photos")
    .select("submission_id,image_url")
    .eq("photo_type", "review")
    .in("submission_id", submissionIds);
}

export async function createReviewReceiveSubmission(payload) {
  return supabase.from("submissions").insert(payload).select(REVIEW_RECEIVE_SUBMISSIONS_SELECT).single();
}

export async function updateReviewReceiveSubmission(submissionId, payload) {
  return supabase.from("submissions").update(payload).eq("id", submissionId).select(REVIEW_RECEIVE_SUBMISSIONS_SELECT).single();
}

export async function deleteReviewReceiveSubmission(submissionId) {
  return supabase.from("submissions").delete().eq("id", submissionId);
}
