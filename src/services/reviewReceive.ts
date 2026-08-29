// @ts-nocheck

import { supabase } from "@/lib/supabase";
import { ADMIN_SCOPE_POLICY } from "@/constants/adminScope";
import { deleteSubmissionsWithEvidencePhotos } from "@/services/adminDeletion";
import { resolveAdminManagerScope } from "@/services/adminScope";
import { compareByCreatedAtThenId, fetchAllRows, fetchAllRowsInChunks } from "@/services/paginatedQuery";
import {
  ADMIN_GATEWAY_OPERATION,
  buildGatewayScope,
  callAdminGatewayOperation,
  getGatewayArray,
  omitClientIdentity
} from "@/services/adminGatewayData";
import { isAdminGatewayConfigured } from "@/services/adminGateway";

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
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.REVIEW_RECEIVE_DETAIL, {
      p_product_id: Number(productId)
    });
    const gatewayData = result.data ?? {};
    const product = gatewayData.product ?? gatewayData.productResult?.data ?? (gatewayData.id ? gatewayData : null);
    const products = getGatewayArray(gatewayData, ["products", "bundleProducts", "bundle_products"]);
    const submissions = getGatewayArray(gatewayData, ["submissions", "rows"]);
    const scope = {
      ...buildGatewayScope(adminId, options),
      ...(gatewayData.scope && typeof gatewayData.scope === "object" ? gatewayData.scope : {})
    };

    return {
      scope,
      productResult: {
        data: result.error ? null : product,
        error: result.error
      },
      productsResult: {
        data: result.error ? [] : products,
        error: result.error
      },
      submissionsResult: {
        data: result.error ? [] : submissions,
        error: result.error
      }
    };
  }

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
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.REVIEW_RECEIVE_SUBMISSION_STATUS, {
      p_submission_id: Number(submissionId),
      p_updates: omitClientIdentity(updates)
    });

    return {
      data: result.data ?? null,
      error: result.error
    };
  }

  return supabase.from("submissions").update(updates).eq("id", submissionId);
}

export async function fetchReviewReceiveEvidencePhotos(submissionIds) {
  if (submissionIds.length === 0) {
    return { data: [], error: null };
  }

  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.REVIEW_RECEIVE_PHOTOS, {
      p_submission_ids: submissionIds.map(Number).filter(Number.isSafeInteger),
      p_photo_type: "review"
    });

    return {
      data: result.error ? [] : getGatewayArray(result.data, ["photos", "evidencePhotos", "evidence_photos"]),
      error: result.error
    };
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
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.REVIEW_RECEIVE_SUBMISSION_CREATE, {
      p_payload: omitClientIdentity(payload)
    });
    const data = result.data?.submission ?? result.data?.data ?? result.data;

    return {
      data: result.error ? null : data,
      error: result.error
    };
  }

  return supabase.from("submissions").insert(payload).select(REVIEW_RECEIVE_SUBMISSIONS_SELECT).single();
}

export async function updateReviewReceiveSubmission(submissionId, payload) {
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.REVIEW_RECEIVE_SUBMISSION_UPDATE, {
      p_submission_id: Number(submissionId),
      p_payload: omitClientIdentity(payload)
    });
    const data = result.data?.submission ?? result.data?.data ?? result.data;

    return {
      data: result.error ? null : data,
      error: result.error
    };
  }

  return supabase.from("submissions").update(payload).eq("id", submissionId).select(REVIEW_RECEIVE_SUBMISSIONS_SELECT).single();
}

export async function deleteReviewReceiveSubmission(submissionId) {
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.REVIEW_RECEIVE_SUBMISSION_DELETE, {
      p_submission_id: Number(submissionId)
    });
    const deletionResult = result.data && typeof result.data === "object" ? result.data : {};

    return {
      ...deletionResult,
      data: Array.isArray(result.data) ? result.data : deletionResult.data ?? [],
      error: result.error,
      partial: Boolean(deletionResult.partial),
      deletedEvidenceSubmissionIds: deletionResult.deletedEvidenceSubmissionIds ?? [],
      deletedSubmissionIds: deletionResult.deletedSubmissionIds ?? []
    };
  }

  return deleteSubmissionsWithEvidencePhotos([submissionId]);
}
