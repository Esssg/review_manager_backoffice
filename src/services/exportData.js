import { supabase } from "../lib/supabase";
import { resolveAdminManagerScope } from "./adminScope";
import { compareByCreatedAtThenId, fetchAllRows, fetchAllRowsInChunks } from "./paginatedQuery";

const EXPORT_PRODUCTS_SELECT =
  "id,manager_id,product_date,title,description,product_link,product_name,deposit_date,company_name,option_name,review_type,planned_depositor_name,created_at";
const EXPORT_SUBMISSIONS_SELECT =
  "id,product_id,order_number,buyer_name,recipient_name,purchase_account,contact,address,bank_name,bank_account,account_holder,amount,review_fee,assign_name,is_purchase_verified,is_review_verified,is_deposit_verified,deposited_at,actual_depositor_name,created_at";
const EXPORT_EVIDENCE_PHOTOS_SELECT = "id,submission_id,photo_type,created_at";
const EXPORT_APPLICATIONS_SELECT = "id,product_id,applicant_name,is_confirmed,created_at";

function buildEmptyExportResult(scope, error = null) {
  return {
    scope,
    products: [],
    submissions: [],
    evidencePhotos: [],
    applications: [],
    error: error ?? scope?.error ?? null
  };
}

function buildDateBoundary(value, field, position) {
  if (!value) {
    return null;
  }

  if (field === "deposited_at") {
    return value;
  }

  return position === "end" ? `${value}T23:59:59.999` : `${value}T00:00:00.000`;
}

function applySubmissionFilters(query, options = {}) {
  const { dateFilter, productId, depositOnly = false } = options;
  let nextQuery = query;

  if (productId) {
    nextQuery = nextQuery.eq("product_id", Number(productId));
  }

  if (depositOnly) {
    nextQuery = nextQuery.eq("is_deposit_verified", true).not("deposited_at", "is", null);
  }

  if (dateFilter?.field && dateFilter.startDate) {
    nextQuery = nextQuery.gte(
      dateFilter.field,
      buildDateBoundary(dateFilter.startDate, dateFilter.field, "start")
    );
  }

  if (dateFilter?.field && dateFilter.endDate) {
    nextQuery = nextQuery.lte(dateFilter.field, buildDateBoundary(dateFilter.endDate, dateFilter.field, "end"));
  }

  return nextQuery;
}

export async function fetchAdminExportData(adminId, options = {}) {
  const {
    includeCompanyData = false,
    forcePersonalScope = false,
    includeApplications = false,
    dateFilter = null,
    productId = null,
    depositOnly = false
  } = options;

  const scope = await resolveAdminManagerScope(adminId, {
    includeCompanyData: forcePersonalScope ? false : includeCompanyData
  });

  if (scope.error || scope.managerIds.length === 0) {
    return buildEmptyExportResult(scope);
  }

  const productsResult = await fetchAllRows(() =>
    supabase
      .from("products")
      .select(EXPORT_PRODUCTS_SELECT)
      .in("manager_id", scope.managerIds)
  );

  if (productsResult.error) {
    return buildEmptyExportResult(scope, productsResult.error);
  }

  const products = productsResult.data ?? [];
  products.sort((left, right) => compareByCreatedAtThenId(left, right, false, true));
  const productIds = products.map((product) => product.id);

  if (productIds.length === 0) {
    return buildEmptyExportResult(scope);
  }

  const submissionsResult = await fetchAllRowsInChunks(productIds, (productIdChunk) => {
    const query = supabase
      .from("submissions")
      .select(EXPORT_SUBMISSIONS_SELECT)
      .in("product_id", productIdChunk);

    return applySubmissionFilters(query, {
      dateFilter,
      productId,
      depositOnly
    });
  });

  if (submissionsResult.error) {
    return buildEmptyExportResult(scope, submissionsResult.error);
  }

  const submissions = submissionsResult.data ?? [];
  submissions.sort((left, right) => compareByCreatedAtThenId(left, right));
  const submissionIds = submissions.map((submission) => submission.id);
  let evidencePhotos = [];

  if (submissionIds.length > 0) {
    const evidencePhotosResult = await fetchAllRowsInChunks(submissionIds, (submissionIdChunk) =>
      supabase
        .from("evidence_photos")
        .select(EXPORT_EVIDENCE_PHOTOS_SELECT)
        .in("submission_id", submissionIdChunk)
    );

    if (evidencePhotosResult.error) {
      return {
        scope,
        products,
        submissions,
        evidencePhotos: [],
        applications: [],
        error: evidencePhotosResult.error
      };
    }

    evidencePhotos = evidencePhotosResult.data ?? [];
  }

  let applications = [];

  if (includeApplications) {
    const applicationsResult = await fetchAllRowsInChunks(productIds, (productIdChunk) =>
      supabase
        .from("applications")
        .select(EXPORT_APPLICATIONS_SELECT)
        .in("product_id", productIdChunk)
    );

    if (applicationsResult.error) {
      return {
        scope,
        products,
        submissions,
        evidencePhotos,
        applications: [],
        error: applicationsResult.error
      };
    }

    applications = applicationsResult.data ?? [];
    applications.sort((left, right) => compareByCreatedAtThenId(left, right));
  }

  return {
    scope,
    products,
    submissions,
    evidencePhotos,
    applications,
    error: null
  };
}
