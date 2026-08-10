import { supabase } from "../lib/supabase";
import { ADMIN_SCOPE_POLICY } from "../constants/adminScope";
import { deleteSubmissionsWithEvidencePhotos } from "./adminDeletion";
import { resolveAdminManagerScope } from "./adminScope";
import { compareByCreatedAtThenId, fetchAllRows, fetchAllRowsInChunks } from "./paginatedQuery";

const REVIEW_RECEIVE_PRODUCT_SELECT =
  "id,title,product_name,description,product_link,company_name,option_name,review_type,planned_depositor_name,manager_id,product_date,created_at,bundle_id";
const REVIEW_RECEIVE_PRODUCT_SELECT_WITH_DEPOSIT_GB = `${REVIEW_RECEIVE_PRODUCT_SELECT},"deposit_GB"`;
const REVIEW_RECEIVE_SUBMISSIONS_SELECT =
  "id,product_id,assign_name,order_number,buyer_name,recipient_name,purchase_account,contact,address,bank_name,bank_account,account_holder,amount,review_fee,is_purchase_verified,is_review_verified,is_deposit_verified,deposited_at,actual_depositor_name,created_at";

function isMissingDepositGbColumn(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
  return message.includes("deposit_GB");
}

function isMissingBundleIdColumn(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
  return message.includes("bundle_id");
}

async function fetchProductById(productId, managerIds, selectColumns) {
  return supabase
    .from("products")
    .select(selectColumns)
    .eq("id", productId)
    .in("manager_id", managerIds)
    .maybeSingle();
}

async function fetchBundleProducts(product, managerIds) {
  const bundleId = product?.bundle_id ?? product?.id;

  if (!bundleId) {
    return {
      data: product ? [product] : [],
      error: null
    };
  }

  return fetchAllRows(() =>
    supabase
      .from("products")
      .select(REVIEW_RECEIVE_PRODUCT_SELECT_WITH_DEPOSIT_GB)
      .eq("bundle_id", bundleId)
      .in("manager_id", managerIds)
  );
}

export async function fetchReviewReceiveDetail(productId, adminId, options = {}) {
  const scope = await resolveAdminManagerScope(adminId, {
    ...options,
    scopePolicy: ADMIN_SCOPE_POLICY.REVIEW_RECEIVE_DETAIL
  });

  if (scope.error) {
    return {
      scope,
      productResult: {
        data: null,
        error: scope.error
      },
      productsResult: {
        data: [],
        error: null
      },
      submissionsResult: {
        data: [],
        error: null
      }
    };
  }

  let productResult = await fetchProductById(productId, scope.managerIds, REVIEW_RECEIVE_PRODUCT_SELECT_WITH_DEPOSIT_GB);

  if (isMissingDepositGbColumn(productResult.error)) {
    productResult = await fetchProductById(productId, scope.managerIds, REVIEW_RECEIVE_PRODUCT_SELECT);
  }

  if (isMissingBundleIdColumn(productResult.error)) {
    return {
      scope,
      productResult: {
        data: null,
        error: new Error("products.bundle_id 컬럼이 아직 없습니다. bundle_id 추가 마이그레이션을 먼저 적용해주세요.")
      },
      productsResult: {
        data: [],
        error: null
      },
      submissionsResult: {
        data: [],
        error: null
      }
    };
  }

  if (productResult.error || !productResult.data) {
    return {
      scope,
      productResult,
      productsResult: {
        data: productResult.data ? [productResult.data] : [],
        error: null
      },
      submissionsResult: {
        data: [],
        error: null
      }
    };
  }

  let productsResult = await fetchBundleProducts(productResult.data, scope.managerIds);

  if (isMissingDepositGbColumn(productsResult.error)) {
    productsResult = {
      data: [productResult.data],
      error: null
    };
  }

  const productIds = (productsResult.data?.length ? productsResult.data : [productResult.data]).map((product) => product.id);
  const submissionsResult = await fetchAllRowsInChunks(productIds, (productIdChunk) =>
    supabase
      .from("submissions")
      .select(REVIEW_RECEIVE_SUBMISSIONS_SELECT)
      .in("product_id", productIdChunk)
  );

  if (submissionsResult.data) {
    submissionsResult.data.sort((left, right) => compareByCreatedAtThenId(left, right));
  }

  return {
    scope,
    productResult,
    productsResult,
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

  return fetchAllRowsInChunks(submissionIds, (submissionIdChunk) =>
    supabase
      .from("evidence_photos")
      .select("id,submission_id,image_url")
      .eq("photo_type", "review")
      .in("submission_id", submissionIdChunk)
  );
}

export async function createReviewReceiveSubmission(payload) {
  return supabase.from("submissions").insert(payload).select(REVIEW_RECEIVE_SUBMISSIONS_SELECT).single();
}

export async function updateReviewReceiveSubmission(submissionId, payload) {
  return supabase.from("submissions").update(payload).eq("id", submissionId).select(REVIEW_RECEIVE_SUBMISSIONS_SELECT).single();
}

export async function deleteReviewReceiveSubmission(submissionId) {
  return deleteSubmissionsWithEvidencePhotos([submissionId]);
}
