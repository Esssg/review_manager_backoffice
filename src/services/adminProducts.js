import { supabase } from "../lib/supabase";
import { resolveAdminManagerScope } from "./adminScope";
import { chunkValues, fetchAllRows, fetchAllRowsInChunks } from "./paginatedQuery";

const ADMIN_PRODUCTS_SELECT = "id,title,product_name,manager_id,deposit_date,is_real_shipping,created_at";
const ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_BASE =
  "id,title,product_name,description,product_link,company_name,option_name,review_type,planned_depositor_name,manager_id,created_at,bundle_id";
const ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_WITH_DEPOSIT_GB =
  `${ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_BASE},"deposit_GB"`;
const ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT =
  `${ADMIN_REVIEW_RECEIVE_PRODUCTS_SELECT_WITH_DEPOSIT_GB},product_date`;
const REVIEW_RECEIVE_SUMMARY_RPC = "get_admin_review_receive_product_summaries";
export const REVIEW_RECEIVE_SUMMARY_PAGE_SIZE = 50;

function normalizeReviewReceiveSummaryCount(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeReviewReceiveSummaryProduct(row) {
  const submissionCount = normalizeReviewReceiveSummaryCount(row?.submission_count);
  const completeCount = normalizeReviewReceiveSummaryCount(row?.complete_count);

  return {
    id: Number(row?.id),
    bundle_id: row?.bundle_id == null ? null : Number(row.bundle_id),
    title: row?.title ?? null,
    product_name: row?.product_name ?? null,
    description: row?.description ?? null,
    product_link: row?.product_link ?? null,
    company_name: row?.company_name ?? null,
    option_name: row?.option_name ?? null,
    review_type: row?.review_type ?? null,
    planned_depositor_name: row?.planned_depositor_name ?? null,
    manager_id: row?.manager_id ?? null,
    product_date: row?.product_date ?? null,
    created_at: row?.created_at ?? null,
    cursor_product_date: row?.cursor_product_date ?? row?.product_date ?? null,
    deposit_GB: row?.deposit_GB ?? row?.["deposit_GB"] ?? null,
    purchase_count: normalizeReviewReceiveSummaryCount(row?.purchase_count),
    review_count: normalizeReviewReceiveSummaryCount(row?.review_count),
    complete_count: completeCount,
    submission_count: submissionCount,
    status: row?.status ?? (submissionCount > 0 && completeCount === submissionCount ? "completed" : "in_progress"),
    submissions: []
  };
}

function parseReviewReceiveSummaryItems(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsedValue = JSON.parse(value);
      return Array.isArray(parsedValue) ? parsedValue : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeReviewReceiveSummaryRow(row) {
  const product = normalizeReviewReceiveSummaryProduct(row);
  const bundleItems = parseReviewReceiveSummaryItems(row?.bundle_items).map(normalizeReviewReceiveSummaryProduct);
  const bundleVisibleItems = parseReviewReceiveSummaryItems(row?.bundle_visible_items).map(normalizeReviewReceiveSummaryProduct);
  const bundleProductCount = normalizeReviewReceiveSummaryCount(row?.bundle_product_count || bundleItems.length);
  const bundleItemCount = normalizeReviewReceiveSummaryCount(row?.bundle_item_count || bundleVisibleItems.length);

  return {
    ...product,
    bundleItems: bundleItems.length > 0 ? bundleItems : [product],
    bundleVisibleItems,
    bundleProductCount,
    bundleItemCount,
    isMultiProductBundle: bundleProductCount > 1 || bundleItemCount === 0
  };
}

function getReviewReceiveSummaryCursor(row) {
  if (!row?.id || !row?.cursor_product_date) {
    return null;
  }

  return {
    productDate: row.cursor_product_date,
    productId: row.id
  };
}

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

async function deleteRowsInChunks(tableName, columnName, values) {
  for (const chunk of chunkValues(values)) {
    const { error } = await supabase.from(tableName).delete().in(columnName, chunk);
    if (error) return error;
  }

  return null;
}

export async function fetchAdminProducts(adminId) {
  const result = await fetchAllRows(() =>
    supabase
      .from("products")
      .select(ADMIN_PRODUCTS_SELECT)
      .eq("manager_id", adminId)
  );

  if (result.data) {
    result.data.sort((left, right) => Number(right.id) - Number(left.id));
  }

  return result;
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

  const pageSize = Math.max(1, Math.min(Number(options.pageSize ?? REVIEW_RECEIVE_SUMMARY_PAGE_SIZE), 200));
  const cursor = options.cursor ?? null;
  const result = await supabase.rpc(REVIEW_RECEIVE_SUMMARY_RPC, {
    p_admin_id: adminId,
    p_include_company_data: Boolean(options.includeCompanyData),
    p_view_mode: options.viewMode ?? "all",
    p_filters: options.filters ?? {},
    p_page_size: pageSize,
    p_cursor_product_date: cursor?.productDate ?? null,
    p_cursor_product_id: cursor?.productId ?? null
  });

  if (result.error) {
    return {
      data: null,
      error: result.error,
      scope
    };
  }

  const rows = result.data ?? [];
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const normalizedRows = pageRows.map(normalizeReviewReceiveSummaryRow);
  const nextCursor = hasMore ? getReviewReceiveSummaryCursor(normalizedRows.at(-1)) : null;

  return {
    data: normalizedRows,
    error: null,
    scope,
    pageInfo: {
      hasMore,
      nextCursor,
      pageSize
    }
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

  const { data: submissions, error: submissionsError } = await fetchAllRows(() =>
    supabase
      .from("submissions")
      .select("id")
      .eq("product_id", productId)
  );

  if (submissionsError) {
    return {
      error: submissionsError,
      scope
    };
  }

  const submissionIds = (submissions ?? []).map((submission) => submission.id);

  if (submissionIds.length > 0) {
    const photosError = await deleteRowsInChunks("evidence_photos", "submission_id", submissionIds);

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

  const { data: products, error: productsError } = await fetchAllRows(() =>
    supabase
      .from("products")
      .select("id")
      .eq("bundle_id", bundleId)
      .in("manager_id", scope.managerIds)
  );

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

  const { data: submissions, error: submissionsError } = await fetchAllRowsInChunks(productIds, (productIdChunk) =>
    supabase
      .from("submissions")
      .select("id")
      .in("product_id", productIdChunk)
  );

  if (submissionsError) {
    return {
      error: submissionsError,
      scope
    };
  }

  const submissionIds = (submissions ?? []).map((submission) => submission.id);

  if (submissionIds.length > 0) {
    const photosError = await deleteRowsInChunks("evidence_photos", "submission_id", submissionIds);

    if (photosError) {
      return {
        error: photosError,
        scope
      };
    }
  }

  const relatedTables = ["submissions", "applications", "product_steps"];

  for (const tableName of relatedTables) {
    const error = await deleteRowsInChunks(tableName, "product_id", productIds);

    if (error) {
      return {
        error,
        scope
      };
    }
  }

  let deleteError = null;

  for (const productIdChunk of chunkValues(productIds)) {
    const { error } = await supabase
      .from("products")
      .delete()
      .in("id", productIdChunk)
      .in("manager_id", scope.managerIds);

    if (error) {
      deleteError = error;
      break;
    }
  }

  return {
    error: deleteError,
    scope,
    deletedProductIds: productIds
  };
}
