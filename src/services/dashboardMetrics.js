import { supabase } from "../lib/supabase";
import { resolveAdminManagerScope } from "./adminScope";

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
  const { includeCompanyData = false } = options;

  const scope = await resolveAdminManagerScope(adminId, { includeCompanyData });

  if (scope.error) {
    return buildEmptyResult(scope);
  }

  if (scope.managerIds.length === 0) {
    return buildEmptyResult(scope);
  }

  const productsResult = await supabase
    .from("products")
    .select(DASHBOARD_PRODUCTS_SELECT)
    .in("manager_id", scope.managerIds);

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

  let submissions = [];
  let submissionsError = null;
  let applications = [];
  let applicationsError = null;
  let evidencePhotos = [];
  let evidencePhotosError = null;

  if (productIds.length > 0) {
    const submissionsResult = await supabase
      .from("submissions")
      .select(DASHBOARD_SUBMISSIONS_SELECT)
      .in("product_id", productIds);

    if (submissionsResult.error) {
      submissionsError = submissionsResult.error;
    } else {
      submissions = submissionsResult.data ?? [];
    }

    const applicationsResult = await supabase
      .from("applications")
      .select(DASHBOARD_APPLICATIONS_SELECT)
      .in("product_id", productIds);

    if (applicationsResult.error) {
      applicationsError = applicationsResult.error;
    } else {
      applications = applicationsResult.data ?? [];
    }

    const submissionIds = submissions.map((submission) => submission.id);

    if (submissionIds.length > 0) {
      const evidencePhotosResult = await supabase
        .from("evidence_photos")
        .select(DASHBOARD_EVIDENCE_PHOTOS_SELECT)
        .in("submission_id", submissionIds);

      if (evidencePhotosResult.error) {
        evidencePhotosError = evidencePhotosResult.error;
      } else {
        evidencePhotos = evidencePhotosResult.data ?? [];
      }
    }
  }

  let companyMembers = [];
  let companyMembersError = null;

  if (includeCompanyData && scope.companyName) {
    const companyMembersResult = await supabase
      .from("admins")
      .select(DASHBOARD_COMPANY_MEMBERS_SELECT)
      .eq("company", scope.companyName)
      .order("login_id", { ascending: true });

    if (companyMembersResult.error) {
      companyMembersError = companyMembersResult.error;
    } else {
      companyMembers = companyMembersResult.data ?? [];
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
