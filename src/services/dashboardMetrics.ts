// @ts-nocheck

import { supabase } from "@/lib/supabase";
import { resolveAdminManagerScope } from "@/services/adminScope";
import { fetchAllRows, fetchAllRowsInChunks } from "@/services/paginatedQuery";

const DASHBOARD_PRODUCTS_SELECT =
  "id,manager_id,title,product_name,review_type,company_name,option_name,is_real_shipping,created_at";
const DASHBOARD_SUBMISSIONS_SELECT =
  "id,product_id,assign_name,order_number,buyer_name,recipient_name,review_fee,is_review_verified,is_deposit_verified,deposited_at,created_at";
const DASHBOARD_APPLICATIONS_SELECT = "id,product_id,is_confirmed,created_at";
const DASHBOARD_EVIDENCE_PHOTOS_SELECT = "id,submission_id,photo_type,created_at";
const DASHBOARD_COMPANY_MEMBERS_SELECT = "login_id,username,company";

function buildEmptyResult(scope) {
  return {
    scope,
    products: [],
    submissions: [],
    applications: [],
    evidencePhotos: [],
    companyMembers: [],
    error: scope.error ?? null
  };
}

export async function fetchAdminDashboardData(adminId, options = {}) {
  const scope = await resolveAdminManagerScope(adminId, options);

  if (scope.error) {
    return buildEmptyResult(scope);
  }

  if (scope.managerIds.length === 0) {
    return buildEmptyResult(scope);
  }

  const productsResult = await fetchAllRows(() =>
    supabase
      .from("products")
      .select(DASHBOARD_PRODUCTS_SELECT)
      .in("manager_id", scope.managerIds)
  );

  if (productsResult.error) {
    return {
      scope,
      products: [],
      submissions: [],
      applications: [],
      evidencePhotos: [],
      companyMembers: [],
      error: productsResult.error
    };
  }

  const products = productsResult.data ?? [];
  const productIds = products.map((product) => product.id);

  const submissionsPromise =
    productIds.length > 0
      ? fetchAllRowsInChunks(productIds, (productIdChunk) =>
          supabase
            .from("submissions")
            .select(DASHBOARD_SUBMISSIONS_SELECT)
            .in("product_id", productIdChunk)
        )
      : Promise.resolve({ data: [], error: null });
  const applicationsPromise =
    productIds.length > 0
      ? fetchAllRowsInChunks(productIds, (productIdChunk) =>
          supabase
            .from("applications")
            .select(DASHBOARD_APPLICATIONS_SELECT)
            .in("product_id", productIdChunk)
        )
      : Promise.resolve({ data: [], error: null });
  const companyMembersPromise =
    scope.includeCompanyData && scope.companyName
      ? fetchAllRows(
          () =>
            supabase
              .from("admins")
              .select(DASHBOARD_COMPANY_MEMBERS_SELECT)
              .eq("company", scope.companyName),
          { cursorColumn: "login_id" }
        )
      : Promise.resolve({ data: [], error: null });
  const [submissionsResult, applicationsResult, companyMembersResult] = await Promise.all([
    submissionsPromise,
    applicationsPromise,
    companyMembersPromise
  ]);

  const submissions = submissionsResult.error ? [] : submissionsResult.data ?? [];
  const applications = applicationsResult.error ? [] : applicationsResult.data ?? [];
  const companyMembers = companyMembersResult.error ? [] : companyMembersResult.data ?? [];
  const submissionsError = submissionsResult.error ?? null;
  const applicationsError = applicationsResult.error ?? null;
  const companyMembersError = companyMembersResult.error ?? null;
  let evidencePhotos = [];
  let evidencePhotosError = null;

  const submissionIds = submissions.map((submission) => submission.id);

  if (!submissionsError && submissionIds.length > 0) {
    const evidencePhotosResult = await fetchAllRowsInChunks(submissionIds, (submissionIdChunk) =>
      supabase
        .from("evidence_photos")
        .select(DASHBOARD_EVIDENCE_PHOTOS_SELECT)
        .in("submission_id", submissionIdChunk)
    );

    if (evidencePhotosResult.error) {
      evidencePhotosError = evidencePhotosResult.error;
    } else {
      evidencePhotos = evidencePhotosResult.data ?? [];
    }
  }

  const error = submissionsError ?? applicationsError ?? evidencePhotosError ?? companyMembersError ?? null;

  return {
    scope,
    products,
    submissions,
    applications,
    evidencePhotos,
    companyMembers,
    error
  };
}
