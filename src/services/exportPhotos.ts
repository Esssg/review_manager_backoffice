// @ts-nocheck

import { supabase } from "@/lib/supabase";
import { resolveAdminManagerScope } from "@/services/adminScope";
import { compareByCreatedAtThenId, fetchAllRows, fetchAllRowsInChunks } from "@/services/paginatedQuery";
import {
  ADMIN_GATEWAY_OPERATION,
  buildGatewayScope,
  callAdminGatewayOperation,
  getGatewayArray
} from "@/services/adminGatewayData";
import { isAdminGatewayConfigured } from "@/services/adminGateway";

const PHOTO_EXPORT_PRODUCTS_SELECT =
  "id,manager_id,product_date,title,description,product_link,product_name,company_name,option_name,review_type,planned_depositor_name,deposit_GB,created_at";
const PHOTO_EXPORT_SUBMISSIONS_SELECT =
  "id,product_id,assign_name,order_number,buyer_name,recipient_name,is_review_verified,is_deposit_verified,created_at";
const PHOTO_EXPORT_EVIDENCE_PHOTOS_SELECT = "id,submission_id,photo_type,image_url,created_at";
function buildEmptyPhotoExportResult(scope, error = null) {
  return {
    scope,
    products: [],
    submissions: [],
    evidencePhotos: [],
    error: error ?? scope?.error ?? null
  };
}

async function fetchSubmissions(productIds) {
  const result = await fetchAllRowsInChunks(productIds, (productIdChunk) =>
    supabase
      .from("submissions")
      .select(PHOTO_EXPORT_SUBMISSIONS_SELECT)
      .in("product_id", productIdChunk)
  );

  if (result.data) {
    result.data.sort((left, right) => compareByCreatedAtThenId(left, right));
  }

  return result;
}

async function fetchEvidencePhotos(submissionIds) {
  const result = await fetchAllRowsInChunks(submissionIds, (submissionIdChunk) =>
    supabase
      .from("evidence_photos")
      .select(PHOTO_EXPORT_EVIDENCE_PHOTOS_SELECT)
      .in("submission_id", submissionIdChunk)
  );

  if (result.data) {
    result.data.sort((left, right) => compareByCreatedAtThenId(left, right));
  }

  return result;
}

export async function fetchAdminPhotoExportData(adminId, options = {}) {
  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.EXPORT_PHOTOS_READ, {
      p_include_company_data: options.includeCompanyData == null
        ? options.scopePolicy === "company" || options.scopePolicy === "all"
        : Boolean(options.includeCompanyData),
      p_filters: options.filters ?? {},
      p_product_id: options.productId == null ? null : Number(options.productId)
    });
    const gatewayData = result.data ?? {};
    const scope = {
      ...buildGatewayScope(adminId, options),
      ...(gatewayData.scope && typeof gatewayData.scope === "object" ? gatewayData.scope : {})
    };

    if (result.error) {
      return buildEmptyPhotoExportResult(scope, result.error);
    }

    return {
      scope,
      products: getGatewayArray(gatewayData, ["products"]),
      submissions: getGatewayArray(gatewayData, ["submissions"]),
      evidencePhotos: getGatewayArray(gatewayData, ["evidencePhotos", "evidence_photos"]),
      error: null
    };
  }

  const scope = await resolveAdminManagerScope(adminId, options);

  if (scope.error || scope.managerIds.length === 0) {
    return buildEmptyPhotoExportResult(scope);
  }

  const productsResult = await fetchAllRows(() =>
    supabase
      .from("products")
      .select(PHOTO_EXPORT_PRODUCTS_SELECT)
      .in("manager_id", scope.managerIds)
  );

  if (productsResult.error) {
    return buildEmptyPhotoExportResult(scope, productsResult.error);
  }

  const products = productsResult.data ?? [];
  products.sort((left, right) => compareByCreatedAtThenId(left, right, false, true));
  const productIds = products.map((product) => product.id);

  if (productIds.length === 0) {
    return buildEmptyPhotoExportResult(scope);
  }

  const submissionsResult = await fetchSubmissions(productIds);

  if (submissionsResult.error) {
    return {
      scope,
      products,
      submissions: [],
      evidencePhotos: [],
      error: submissionsResult.error
    };
  }

  const submissions = submissionsResult.data ?? [];
  const submissionIds = submissions.map((submission) => submission.id);
  let evidencePhotos = [];

  if (submissionIds.length > 0) {
    const evidencePhotosResult = await fetchEvidencePhotos(submissionIds);

    if (evidencePhotosResult.error) {
      return {
        scope,
        products,
        submissions,
        evidencePhotos: [],
        error: evidencePhotosResult.error
      };
    }

    evidencePhotos = evidencePhotosResult.data ?? [];
  }

  return {
    scope,
    products,
    submissions,
    evidencePhotos,
    error: null
  };
}
