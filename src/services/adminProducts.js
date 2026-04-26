import { supabase } from "../lib/supabase";
import { resolveAdminManagerScope } from "./adminScope";

const ADMIN_PRODUCTS_SELECT = "id,title,product_name,manager_id,deposit_date,is_real_shipping,created_at";
const ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT =
  "id,title,product_name,description,company_name,option_name,review_type,planned_depositor_name,manager_id,created_at";
const ADMIN_REVIEW_RECEIVE_SUBMISSION_STATUS_SELECT = "id,product_id,is_deposit_verified,review_fee,created_at";

export async function fetchAdminProducts(adminId) {
  return supabase
    .from("products")
    .select(ADMIN_PRODUCTS_SELECT)
    .eq("manager_id", adminId)
    .order("id", { ascending: false });
}

export async function fetchAdminReviewReceiveProducts(adminId, options = {}) {
  const scope = await resolveAdminManagerScope(adminId, options);

  if (scope.error) {
    return {
      data: null,
      error: scope.error,
      scope
    };
  }

  if (scope.managerIds.length === 0) {
    return {
      data: [],
      error: null,
      scope
    };
  }

  const productsResult = await supabase
    .from("products")
    .select(ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT)
    .in("manager_id", scope.managerIds)
    .order("id", { ascending: false });

  if (productsResult.error || !productsResult.data?.length) {
    return {
      ...productsResult,
      scope
    };
  }

  const productIds = productsResult.data.map((product) => product.id);
  const submissionsResult = await supabase
    .from("submissions")
    .select(ADMIN_REVIEW_RECEIVE_SUBMISSION_STATUS_SELECT)
    .in("product_id", productIds)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (submissionsResult.error) {
    return {
      data: null,
      error: submissionsResult.error,
      scope
    };
  }

  const submissionsByProductId = (submissionsResult.data ?? []).reduce((acc, submission) => {
    const productId = submission.product_id;

    if (!acc[productId]) {
      acc[productId] = [];
    }

    acc[productId].push(submission);
    return acc;
  }, {});

  return {
    data: productsResult.data.map((product) => ({
      ...product,
      submissions: submissionsByProductId[product.id] ?? []
    })),
    error: null,
    scope
  };
}

export async function createAdminReviewReceiveProduct(payload) {
  return supabase.from("products").insert(payload).select(ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT).single();
}

export async function updateAdminReviewReceiveProduct(productId, adminId, payload, options = {}) {
  const scope = await resolveAdminManagerScope(adminId, options);

  if (scope.error) {
    return {
      data: null,
      error: scope.error,
      scope
    };
  }

  if (scope.managerIds.length === 0) {
    return {
      data: null,
      error: new Error("수정할 수 있는 관리자 범위가 없습니다."),
      scope
    };
  }

  return supabase
    .from("products")
    .update(payload)
    .eq("id", productId)
    .in("manager_id", scope.managerIds)
    .select(ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT)
    .single()
    .then((result) => ({
      ...result,
      scope
    }));
}

export async function deleteAdminReviewReceiveProduct(productId, adminId, options = {}) {
  const scope = await resolveAdminManagerScope(adminId, options);

  if (scope.error) {
    return {
      error: scope.error,
      scope
    };
  }

  if (scope.managerIds.length === 0) {
    return {
      error: new Error("삭제할 수 있는 관리자 범위가 없습니다."),
      scope
    };
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .in("manager_id", scope.managerIds)
    .maybeSingle();

  if (productError || !product) {
    return {
      error: productError ?? new Error("삭제할 상품을 찾지 못했습니다."),
      scope
    };
  }

  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select("id")
    .eq("product_id", productId);

  if (submissionsError) {
    return {
      error: submissionsError,
      scope
    };
  }

  const submissionIds = (submissions ?? []).map((submission) => submission.id);

  if (submissionIds.length > 0) {
    const { error: photosError } = await supabase.from("evidence_photos").delete().in("submission_id", submissionIds);

    if (photosError) {
      return {
        error: photosError,
        scope
      };
    }
  }

  const relatedTables = ["submissions", "applications", "product_steps"];

  for (const tableName of relatedTables) {
    const { error } = await supabase.from(tableName).delete().eq("product_id", productId);

    if (error) {
      return {
        error,
        scope
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .in("manager_id", scope.managerIds);

  return {
    error: deleteError,
    scope
  };
}
