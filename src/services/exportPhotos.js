import { supabase } from "../lib/supabase";
import { resolveAdminManagerScope } from "./adminScope";

const PHOTO_EXPORT_PRODUCTS_SELECT =
  "id,manager_id,product_date,title,description,product_link,product_name,company_name,option_name,review_type,planned_depositor_name,deposit_GB,created_at";
const PHOTO_EXPORT_SUBMISSIONS_SELECT =
  "id,product_id,assign_name,order_number,buyer_name,recipient_name,is_review_verified,is_deposit_verified,created_at";
const PHOTO_EXPORT_EVIDENCE_PHOTOS_SELECT = "id,submission_id,photo_type,image_url,created_at";
const PHOTO_EXPORT_ID_CHUNK_SIZE = 100;
const PHOTO_EXPORT_PAGE_SIZE = 1000;

function buildEmptyPhotoExportResult(scope, error = null) {
  return {
    scope,
    products: [],
    submissions: [],
    evidencePhotos: [],
    error: error ?? scope?.error ?? null
  };
}

async function fetchPagedRows(buildQuery) {
  const rows = [];
  let pageStart = 0;

  while (true) {
    const pageEnd = pageStart + PHOTO_EXPORT_PAGE_SIZE - 1;
    const result = await buildQuery().range(pageStart, pageEnd);

    if (result.error) {
      return {
        data: rows,
        error: result.error
      };
    }

    const pageRows = result.data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < PHOTO_EXPORT_PAGE_SIZE) {
      return {
        data: rows,
        error: null
      };
    }

    pageStart += PHOTO_EXPORT_PAGE_SIZE;
  }
}

async function fetchSubmissions(productIds) {
  const rows = [];

  for (let index = 0; index < productIds.length; index += PHOTO_EXPORT_ID_CHUNK_SIZE) {
    const productIdChunk = productIds.slice(index, index + PHOTO_EXPORT_ID_CHUNK_SIZE);
    const result = await fetchPagedRows(() =>
      supabase
        .from("submissions")
        .select(PHOTO_EXPORT_SUBMISSIONS_SELECT)
        .in("product_id", productIdChunk)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
    );

    if (result.error) {
      return result;
    }

    rows.push(...result.data);
  }

  return {
    data: rows,
    error: null
  };
}

async function fetchEvidencePhotos(submissionIds) {
  const rows = [];

  for (let index = 0; index < submissionIds.length; index += PHOTO_EXPORT_ID_CHUNK_SIZE) {
    const submissionIdChunk = submissionIds.slice(index, index + PHOTO_EXPORT_ID_CHUNK_SIZE);
    const result = await fetchPagedRows(() =>
      supabase
        .from("evidence_photos")
        .select(PHOTO_EXPORT_EVIDENCE_PHOTOS_SELECT)
        .in("submission_id", submissionIdChunk)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
    );

    if (result.error) {
      return result;
    }

    rows.push(...result.data);
  }

  return {
    data: rows,
    error: null
  };
}

export async function fetchAdminPhotoExportData(adminId, options = {}) {
  const { includeCompanyData = false } = options;
  const scope = await resolveAdminManagerScope(adminId, { includeCompanyData });

  if (scope.error || scope.managerIds.length === 0) {
    return buildEmptyPhotoExportResult(scope);
  }

  const productsResult = await fetchPagedRows(() =>
    supabase
      .from("products")
      .select(PHOTO_EXPORT_PRODUCTS_SELECT)
      .in("manager_id", scope.managerIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
  );

  if (productsResult.error) {
    return buildEmptyPhotoExportResult(scope, productsResult.error);
  }

  const products = productsResult.data ?? [];
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
