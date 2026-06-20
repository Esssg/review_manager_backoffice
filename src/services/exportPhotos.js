import { supabase } from "../lib/supabase";
import { resolveAdminManagerScope } from "./adminScope";
import { compareByCreatedAtThenId, fetchAllRows, fetchAllRowsInChunks } from "./paginatedQuery";

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
  const { includeCompanyData = false } = options;
  const scope = await resolveAdminManagerScope(adminId, { includeCompanyData });

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
