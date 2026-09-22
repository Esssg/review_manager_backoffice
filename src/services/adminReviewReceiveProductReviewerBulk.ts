// @ts-nocheck

import { isAdminGatewayConfigured } from "@/services/adminGateway";
import {
  ADMIN_GATEWAY_OPERATION,
  callAdminGatewayOperation,
  getGatewayArray,
  omitClientIdentity,
  omitManagerIdentity
} from "@/services/adminGatewayData";
import { MAX_PRODUCT_REVIEWER_BULK_ROWS } from "@/utils/reviewReceiveProductReviewerBulkInput";

function stripProductRelation(payload = {}) {
  const withoutIdentity = omitManagerIdentity(payload);
  const { bundle_id: _bundleId, bundleId: _camelCaseBundleId, ...productPayload } = withoutIdentity ?? {};
  return productPayload;
}

function stripSubmissionRelation(payload = {}) {
  const withoutIdentity = omitClientIdentity(payload);
  const { product_id: _productId, productId: _camelCaseProductId, ...submissionPayload } = withoutIdentity ?? {};
  return submissionPayload;
}

function normalizeOptionalPositiveId(value, label) {
  if (value == null || String(value).trim() === "") {
    return null;
  }

  const normalizedValue = Number(value);

  if (!Number.isInteger(normalizedValue) || normalizedValue <= 0) {
    throw new Error(`${label}가 올바르지 않습니다.`);
  }

  return normalizedValue;
}

export function buildProductReviewerBulkPayload({
  productGroups = [],
  reusableProductId = null,
  targetBundleId = null
} = {}) {
  if (!Array.isArray(productGroups) || productGroups.length === 0) {
    throw new Error("등록할 품목이 없습니다.");
  }

  const normalizedReusableProductId = normalizeOptionalPositiveId(reusableProductId, "재사용 상품 ID");
  const normalizedTargetBundleId = normalizeOptionalPositiveId(targetBundleId, "대상 상품 묶음 ID");

  const groups = productGroups.map((group, groupIndex) => {
    const productPayload = stripProductRelation(group?.productPayload ?? group?.product ?? {});
    const reviewerRows = group?.reviewerPayloads ?? group?.submissions ?? [];

    if (!Array.isArray(reviewerRows) || reviewerRows.length === 0) {
      throw new Error(`${groupIndex + 1}번째 품목에 등록할 리뷰어 행이 없습니다.`);
    }

    return {
      product: productPayload,
      submissions: reviewerRows.map(stripSubmissionRelation)
    };
  });

  const rowCount = groups.reduce((sum, group) => sum + group.submissions.length, 0);

  if (rowCount > MAX_PRODUCT_REVIEWER_BULK_ROWS) {
    throw new Error(`상품/리뷰어 일괄입력은 최대 ${MAX_PRODUCT_REVIEWER_BULK_ROWS}행까지 지원합니다.`);
  }

  return {
    groups,
    ...(normalizedReusableProductId == null ? {} : { reusable_product_id: normalizedReusableProductId }),
    ...(normalizedTargetBundleId == null ? {} : { target_bundle_id: normalizedTargetBundleId })
  };
}

function normalizeBulkResult(data) {
  const products = getGatewayArray(data, ["products", "createdProducts"]).map((item) =>
    item?.data ?? item?.product ?? item
  );
  const submissions = getGatewayArray(data, ["submissions", "createdSubmissions", "insertedSubmissions"]).map((item) =>
    item?.data ?? item?.submission ?? item
  );

  return {
    ...(data && typeof data === "object" && !Array.isArray(data) ? data : {}),
    products,
    submissions,
    summary: data?.summary ?? {
      createdProductCount: products.length,
      createdSubmissionCount: submissions.length,
      rowCount: submissions.length
    }
  };
}

export function isProductReviewerBulkTimeout(error) {
  return ["ADMIN_GATEWAY_TIMEOUT", "ADMIN_GATEWAY_UNAVAILABLE"].includes(error?.code);
}

export async function createAdminReviewReceiveProductReviewerBulk({
  productGroups,
  reusableProductId = null,
  targetBundleId = null
} = {}) {
  let payload;

  try {
    payload = buildProductReviewerBulkPayload({ productGroups, reusableProductId, targetBundleId });
  } catch (error) {
    return { data: null, error };
  }

  if (!isAdminGatewayConfigured()) {
    return {
      data: null,
      error: new Error("빠른 상품/리뷰어 일괄 저장을 사용하려면 관리자 gateway 설정이 필요합니다.")
    };
  }

  const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.REVIEW_RECEIVE_PRODUCT_REVIEWER_BULK_V2, {
    p_payload: payload
  });

  return {
    data: result.error ? null : normalizeBulkResult(result.data),
    error: result.error
  };
}
