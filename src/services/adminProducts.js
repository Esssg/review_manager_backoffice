import { supabase } from "../lib/supabase";
import { resolveAdminManagerScope } from "./adminScope";

const ADMIN_PRODUCTS_SELECT = "id,title,product_name,manager_id,deposit_date,is_real_shipping,created_at";
const ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_BASE =
  "id,title,product_name,description,product_link,company_name,option_name,review_type,planned_depositor_name,manager_id,created_at,bundle_id";
const ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_WITH_DEPOSIT_GB =
  `${ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_BASE},"deposit_GB"`;
const ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT =
  `${ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_WITH_DEPOSIT_GB},product_date`;
const ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_FALLBACKS = [
  ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT,
  `${ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_BASE},product_date`,
  ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_WITH_DEPOSIT_GB,
  ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_BASE
];
const ADMIN_REVIEW_RECEIVE_SUBMISSION_STATUS_SELECT =
  "id,product_id,is_review_verified,is_deposit_verified,review_fee,created_at";
const SUBMISSION_STATUS_PRODUCT_ID_CHUNK_SIZE = 100;
const SUBMISSION_STATUS_PAGE_SIZE = 1000;

function isMissingReviewReceiveProductColumn(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
  return message.includes("product_date") || message.includes("deposit_GB") || message.includes("bundle_id");
}

function buildMissingProductColumnError(error) {
  if (!isMissingReviewReceiveProductColumn(error)) {
    return error;
  }

  if (`${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.includes("deposit_GB")) {
    return new Error("products.deposit_GB 컬럼이 아직 없습니다. deposit_GB 추가 마이그레이션을 먼저 적용해주세요.");
  }

  if (`${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.includes("bundle_id")) {
    return new Error("products.bundle_id 컬럼이 아직 없습니다. bundle_id 추가 마이그레이션을 먼저 적용해주세요.");
  }

  return new Error("products.product_date 컬럼이 아직 없습니다. product_date 추가 마이그레이션을 먼저 적용해주세요.");
}

async function fetchReviewReceiveProductRows(scope, selectColumns) {
  let query = supabase.from("products").select(selectColumns).in("manager_id", scope.managerIds);

  if (selectColumns.includes("product_date")) {
    query = query.order("product_date", { ascending: false });
  }

  return query.order("id", { ascending: false });
}

async function fetchReviewReceiveSubmissionStatusRows(productIds) {
  const rows = [];

  for (let index = 0; index < productIds.length; index += SUBMISSION_STATUS_PRODUCT_ID_CHUNK_SIZE) {
    const productIdChunk = productIds.slice(index, index + SUBMISSION_STATUS_PRODUCT_ID_CHUNK_SIZE);
    let pageStart = 0;

    while (true) {
      const pageEnd = pageStart + SUBMISSION_STATUS_PAGE_SIZE - 1;
      const result = await supabase
        .from("submissions")
        .select(ADMIN_REVIEW_RECEIVE_SUBMISSION_STATUS_SELECT)
        .in("product_id", productIdChunk)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(pageStart, pageEnd);

      if (result.error) {
        return {
          data: null,
          error: result.error
        };
      }

      const pageRows = result.data ?? [];
      rows.push(...pageRows);

      if (pageRows.length < SUBMISSION_STATUS_PAGE_SIZE) {
        break;
      }

      pageStart += SUBMISSION_STATUS_PAGE_SIZE;
    }
  }

  return {
    data: rows,
    error: null
  };
}

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

  let productsResult = null;

  for (const selectColumns of ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_FALLBACKS) {
    productsResult = await fetchReviewReceiveProductRows(scope, selectColumns);

    if (!isMissingReviewReceiveProductColumn(productsResult.error)) {
      break;
    }
  }

  if (productsResult.error || !productsResult.data?.length) {
    return {
      ...productsResult,
      scope
    };
  }

  const productIds = productsResult.data.map((product) => product.id);
  const submissionsResult = await fetchReviewReceiveSubmissionStatusRows(productIds);

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
  const result = await supabase.from("products").insert(payload).select(ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT).single();

  if (result.error || !result.data || result.data.bundle_id != null) {
    return {
      ...result,
      error: buildMissingProductColumnError(result.error)
    };
  }

  const bundleResult = await supabase
    .from("products")
    .update({ bundle_id: result.data.id })
    .eq("id", result.data.id)
    .select(ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT)
    .single();

  return {
    ...bundleResult,
    error: buildMissingProductColumnError(bundleResult.error)
  };
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

  const result = await supabase
    .from("products")
    .update(payload)
    .eq("id", productId)
    .in("manager_id", scope.managerIds)
    .select(ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT)
    .single();

  return {
    ...result,
    error: buildMissingProductColumnError(result.error),
    scope
  };
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

export async function deleteAdminReviewReceiveProductBundle(bundleId, adminId, options = {}) {
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

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id")
    .eq("bundle_id", bundleId)
    .in("manager_id", scope.managerIds);

  if (productsError) {
    return {
      error: productsError,
      scope
    };
  }

  const productIds = (products ?? []).map((product) => product.id);

  if (productIds.length === 0) {
    return {
      error: new Error("삭제할 묶음 상품을 찾지 못했습니다."),
      scope
    };
  }

  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select("id")
    .in("product_id", productIds);

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
    const { error } = await supabase.from(tableName).delete().in("product_id", productIds);

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
    .in("id", productIds)
    .in("manager_id", scope.managerIds);

  return {
    error: deleteError,
    scope,
    deletedProductIds: productIds
  };
}
