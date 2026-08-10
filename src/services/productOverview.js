import { supabase } from "../lib/supabase";
import { resolveAdminManagerScope } from "./adminScope";
import { deleteSubmissionsWithEvidencePhotos } from "./adminDeletion";
import { fetchAllRows, fetchAllRowsInChunks } from "./paginatedQuery";
import { sliceProductOverviewPage } from "../utils/productOverviewPagination";

const PRODUCT_OVERVIEW_ROWS_RPC = "get_admin_product_overview_rows";
export const PRODUCT_OVERVIEW_PAGE_SIZE = 300;

function buildEmptyProductOverviewPageInfo(pageSize = PRODUCT_OVERVIEW_PAGE_SIZE) {
  return {
    hasMore: false,
    nextCursor: null,
    pageSize,
    totalCount: 0
  };
}

function parseProductOverviewJsonArray(value) {
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

function readProductOverviewRowValue(row, key) {
  return row[key] ?? row[key.toLowerCase()] ?? null;
}

function normalizeProductOverviewRow(row) {
  return {
    product_id: Number(row.product_id),
    submission_id: Number(row.submission_id),
    product_created_at: row.product_created_at ?? null,
    submission_created_at: row.submission_created_at ?? null,
    manager_id: row.manager_id ?? null,
    title: row.title ?? null,
    product_name: row.product_name ?? null,
    deposit_date: row.deposit_date ?? null,
    description: row.description ?? null,
    product_link: row.product_link ?? null,
    is_real_shipping: row.is_real_shipping ?? null,
    company_name: row.company_name ?? null,
    option_name: row.option_name ?? null,
    review_type: row.review_type ?? null,
    review_fee: row.review_fee ?? null,
    planned_depositor_name: row.planned_depositor_name ?? null,
    assign_name: row.assign_name ?? null,
    review_photos: parseProductOverviewJsonArray(row.review_photos),
    order_number: row.order_number ?? null,
    buyer_name: row.buyer_name ?? null,
    recipient_name: row.recipient_name ?? null,
    purchase_account: row.purchase_account ?? null,
    contact: row.contact ?? null,
    address: row.address ?? null,
    bank_name: row.bank_name ?? null,
    bank_account: row.bank_account ?? null,
    account_holder: row.account_holder ?? null,
    amount: row.amount ?? null,
    is_purchase_verified: row.is_purchase_verified ?? false,
    is_review_verified: row.is_review_verified ?? false,
    is_deposit_verified: row.is_deposit_verified ?? false,
    deposited_at: row.deposited_at ?? null,
    actual_depositor_name: row.actual_depositor_name ?? null,
    product_fee_deposit_GB: readProductOverviewRowValue(row, "product_fee_deposit_GB"),
    review_fee_deposit_GB: readProductOverviewRowValue(row, "review_fee_deposit_GB")
  };
}

function buildProductOverviewProduct(row) {
  return {
    id: Number(row.product_id),
    manager_id: row.manager_id ?? null,
    title: row.title ?? null,
    product_name: row.product_name ?? null,
    deposit_date: row.deposit_date ?? null,
    description: row.description ?? null,
    product_link: row.product_link ?? null,
    is_real_shipping: row.is_real_shipping ?? null,
    company_name: row.company_name ?? null,
    option_name: row.option_name ?? null,
    review_type: row.review_type ?? null,
    planned_depositor_name: row.planned_depositor_name ?? null,
    deposit_GB: readProductOverviewRowValue(row, "deposit_GB"),
    created_at: row.product_created_at ?? null
  };
}

function buildProductOverviewCursor(row) {
  if (!row) {
    return null;
  }

  return {
    productCreatedAt: row.product_created_at ?? null,
    productId: Number(row.product_id),
    submissionCreatedAt: row.submission_created_at ?? null,
    submissionId: Number(row.submission_id)
  };
}

export async function fetchAdminProductOverview(adminId, options = {}) {
  const scope = await resolveAdminManagerScope(adminId, options);

  if (scope.error) {
    return {
      scope,
      rowsResult: {
        data: null,
        error: scope.error
      },
      productsResult: { data: [], error: null },
      submissionsResult: { data: [], error: null },
      evidencePhotosResult: { data: [], error: null },
      pageInfo: buildEmptyProductOverviewPageInfo()
    };
  }

  if (scope.managerIds.length === 0) {
    return {
      scope,
      rowsResult: {
        data: [],
        error: null
      },
      productsResult: { data: [], error: null },
      submissionsResult: { data: [], error: null },
      evidencePhotosResult: { data: [], error: null },
      pageInfo: buildEmptyProductOverviewPageInfo()
    };
  }

  const pageSize = Math.max(1, Math.min(Number(options.pageSize ?? PRODUCT_OVERVIEW_PAGE_SIZE), 1000));
  const cursor = options.cursor ?? null;
  const result = await supabase.rpc(PRODUCT_OVERVIEW_ROWS_RPC, {
    p_admin_id: adminId,
    p_include_company_data: scope.includeCompanyData,
    p_status: options.status ?? "all",
    p_filters: options.filters ?? {},
    p_page_size: pageSize,
    p_cursor_product_created_at: cursor?.productCreatedAt ?? null,
    p_cursor_product_id: cursor?.productId ?? null,
    p_cursor_submission_created_at: cursor?.submissionCreatedAt ?? null,
    p_cursor_submission_id: cursor?.submissionId ?? null
  });

  if (result.error) {
    return {
      scope,
      rowsResult: {
        data: null,
        error: result.error
      },
      productsResult: { data: [], error: null },
      submissionsResult: { data: [], error: null },
      evidencePhotosResult: { data: [], error: null },
      pageInfo: buildEmptyProductOverviewPageInfo(pageSize)
    };
  }

  const rows = result.data ?? [];
  const { pageRows, remainingCount, hasMore } = sliceProductOverviewPage(rows, pageSize);
  const normalizedRows = pageRows.map(normalizeProductOverviewRow);
  const productMap = new Map();

  pageRows.forEach((row) => {
    const product = buildProductOverviewProduct(row);
    productMap.set(product.id, product);
  });

  return {
    scope,
    rowsResult: {
      data: normalizedRows,
      error: null
    },
    productsResult: {
      data: Array.from(productMap.values()),
      error: null
    },
    submissionsResult: {
      data: normalizedRows,
      error: null
    },
    evidencePhotosResult: {
      data: [],
      error: null
    },
    pageInfo: {
      hasMore,
      nextCursor: hasMore ? buildProductOverviewCursor(normalizedRows.at(-1)) : null,
      pageSize,
      totalCount: remainingCount
    }
  };
}

export async function fetchAllAdminProductOverviewRows(adminId, options = {}) {
  const rows = [];
  const products = new Map();
  let cursor = null;
  let totalCount = 0;

  while (true) {
    const result = await fetchAdminProductOverview(adminId, {
      ...options,
      cursor,
      pageSize: options.pageSize ?? PRODUCT_OVERVIEW_PAGE_SIZE
    });

    if (result.rowsResult.error) {
      return {
        data: null,
        products: [],
        error: result.rowsResult.error,
        scope: result.scope,
        totalCount
      };
    }

    (result.rowsResult.data ?? []).forEach((row) => rows.push(row));
    (result.productsResult.data ?? []).forEach((product) => products.set(product.id, product));
    totalCount = result.pageInfo?.totalCount ?? totalCount;

    if (!result.pageInfo?.hasMore || !result.pageInfo.nextCursor) {
      return {
        data: rows,
        products: Array.from(products.values()),
        error: null,
        scope: result.scope,
        totalCount
      };
    }

    cursor = result.pageInfo.nextCursor;
  }
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

  const { data: products, error: productsError } = await fetchAllRows(() =>
    supabase
      .from("products")
      .select("id")
      .in("manager_id", scope.managerIds)
  );

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

  const { data: submissions, error: submissionsError } = await fetchAllRowsInChunks(
    uniqueSubmissionIds,
    (submissionIdChunk) =>
      supabase
        .from("submissions")
        .select("id,product_id")
        .in("id", submissionIdChunk)
  );

  if (submissionsError) {
    return {
      data: [],
      error: submissionsError,
      scope
    };
  }

  const allowedProductIdSet = new Set(productIds.map(Number));
  const allowedSubmissionIds = (submissions ?? [])
    .filter((submission) => allowedProductIdSet.has(Number(submission.product_id)))
    .map((submission) => submission.id);

  if (allowedSubmissionIds.length === 0) {
    return {
      data: [],
      error: new Error("삭제 가능한 선택 행을 찾지 못했습니다."),
      scope
    };
  }

  return deleteSubmissionsWithEvidencePhotos(allowedSubmissionIds, scope);
}
