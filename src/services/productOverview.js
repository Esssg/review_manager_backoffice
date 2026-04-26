import { supabase } from "../lib/supabase";
import { resolveAdminManagerScope } from "./adminScope";

const PRODUCT_OVERVIEW_PRODUCTS_SELECT =
  "id,manager_id,title,product_name,deposit_date,description,is_real_shipping,company_name,option_name,review_type,planned_depositor_name,created_at";
const PRODUCT_OVERVIEW_SUBMISSIONS_SELECT =
  "id,product_id,assign_name,order_number,buyer_name,recipient_name,purchase_account,contact,address,bank_name,bank_account,account_holder,amount,review_fee,is_purchase_verified,is_review_verified,is_deposit_verified,deposited_at,actual_depositor_name,created_at";
const PRODUCT_OVERVIEW_EVIDENCE_PHOTOS_SELECT = "submission_id,image_url";

export async function fetchAdminProductOverview(adminId, options = {}) {
  const scope = await resolveAdminManagerScope(adminId, options);

  if (scope.error) {
    return {
      scope,
      productsResult: {
        data: null,
        error: scope.error
      },
      submissionsResult: {
        data: [],
        error: null
      },
      evidencePhotosResult: {
        data: [],
        error: null
      }
    };
  }

  if (scope.managerIds.length === 0) {
    return {
      scope,
      productsResult: {
        data: [],
        error: null
      },
      submissionsResult: {
        data: [],
        error: null
      },
      evidencePhotosResult: {
        data: [],
        error: null
      }
    };
  }

  const productsResult = await supabase
    .from("products")
    .select(PRODUCT_OVERVIEW_PRODUCTS_SELECT)
    .in("manager_id", scope.managerIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (productsResult.error || !productsResult.data?.length) {
    return {
      scope,
      productsResult,
      submissionsResult: {
        data: [],
        error: null
      },
      evidencePhotosResult: {
        data: [],
        error: null
      }
    };
  }

  const productIds = productsResult.data.map((product) => product.id);
  const submissionsResult = await supabase
    .from("submissions")
    .select(PRODUCT_OVERVIEW_SUBMISSIONS_SELECT)
    .in("product_id", productIds)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (submissionsResult.error || !submissionsResult.data?.length) {
    return {
      scope,
      productsResult,
      submissionsResult,
      evidencePhotosResult: {
        data: [],
        error: null
      }
    };
  }

  const submissionIds = submissionsResult.data.map((submission) => submission.id);
  const evidencePhotosResult = await supabase
    .from("evidence_photos")
    .select(PRODUCT_OVERVIEW_EVIDENCE_PHOTOS_SELECT)
    .eq("photo_type", "review")
    .in("submission_id", submissionIds);

  return {
    scope,
    productsResult,
    submissionsResult,
    evidencePhotosResult
  };
}

export async function deleteAdminProductOverviewSubmissions(submissionIds, adminId, options = {}) {
  const uniqueSubmissionIds = Array.from(new Set((submissionIds ?? []).map(Number).filter(Number.isFinite)));

  if (uniqueSubmissionIds.length === 0) {
    return {
      data: [],
      error: new Error("삭제할 행을 선택해주세요.")
    };
  }

  const scope = await resolveAdminManagerScope(adminId, options);

  if (scope.error) {
    return {
      data: [],
      error: scope.error,
      scope
    };
  }

  if (scope.managerIds.length === 0) {
    return {
      data: [],
      error: new Error("삭제할 수 있는 관리자 범위가 없습니다."),
      scope
    };
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id")
    .in("manager_id", scope.managerIds);

  if (productsError) {
    return {
      data: [],
      error: productsError,
      scope
    };
  }

  const productIds = (products ?? []).map((product) => product.id);

  if (productIds.length === 0) {
    return {
      data: [],
      error: new Error("삭제할 수 있는 상품이 없습니다."),
      scope
    };
  }

  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select("id")
    .in("id", uniqueSubmissionIds)
    .in("product_id", productIds);

  if (submissionsError) {
    return {
      data: [],
      error: submissionsError,
      scope
    };
  }

  const allowedSubmissionIds = (submissions ?? []).map((submission) => submission.id);

  if (allowedSubmissionIds.length === 0) {
    return {
      data: [],
      error: new Error("삭제 가능한 선택 행을 찾지 못했습니다."),
      scope
    };
  }

  const { error: photosError } = await supabase
    .from("evidence_photos")
    .delete()
    .in("submission_id", allowedSubmissionIds);

  if (photosError) {
    return {
      data: [],
      error: photosError,
      scope
    };
  }

  const { error: deleteError } = await supabase
    .from("submissions")
    .delete()
    .in("id", allowedSubmissionIds);

  return {
    data: allowedSubmissionIds,
    error: deleteError,
    scope
  };
}
