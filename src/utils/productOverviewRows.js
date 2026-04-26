function normalizeFilterValue(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toTimestamp(value, fallbackValue) {
  if (!value) {
    return fallbackValue;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? fallbackValue : timestamp;
}

function normalizeBooleanText(value) {
  const normalizedValue = normalizeFilterValue(value);

  if (["true", "1", "예", "y", "yes"].includes(normalizedValue)) {
    return "true";
  }

  if (["false", "0", "아니오", "n", "no"].includes(normalizedValue)) {
    return "false";
  }

  return normalizedValue;
}

function normalizePhotoFilterValue(value) {
  const normalizedValue = normalizeFilterValue(value);

  if (["has", "사진 있음"].includes(normalizedValue)) {
    return "has";
  }

  if (["none", "사진없음", "사진 없음"].includes(normalizedValue)) {
    return "none";
  }

  return normalizedValue;
}

function stringifyCellValue(value, type) {
  if (value == null) {
    return "";
  }

  if (type === "boolean") {
    return value ? "true" : "false";
  }

  if (type === "photo") {
    return Array.isArray(value) && value.length > 0 ? "제출 완료" : "제출 전";
  }

  return String(value);
}

export const PRODUCT_OVERVIEW_COLUMNS = [
  { key: "manager_id", label: "관리자", source: "products", type: "text" },
  { key: "title", label: "상품 제목", source: "products", type: "text" },
  { key: "description", label: "설명", source: "products", type: "text" },
  { key: "company_name", label: "업체명", source: "products", type: "text" },
  { key: "product_name", label: "품명", source: "products", type: "text" },
  { key: "option_name", label: "옵션", source: "products", type: "text" },
  { key: "review_type", label: "리뷰형태", source: "products", type: "text" },
  { key: "assign_name", label: "배정명", source: "submissions", type: "text" },
  { key: "review_photos", label: "사진", source: "evidence_photos", type: "photo" },
  { key: "order_number", label: "주문번호", source: "submissions", type: "text" },
  { key: "buyer_name", label: "구매자", source: "submissions", type: "text" },
  { key: "recipient_name", label: "수취인", source: "submissions", type: "text" },
  { key: "purchase_account", label: "구매계정", source: "submissions", type: "text" },
  { key: "contact", label: "연락처", source: "submissions", type: "text" },
  { key: "address", label: "주소", source: "submissions", type: "text" },
  { key: "bank_name", label: "은행", source: "submissions", type: "text" },
  { key: "bank_account", label: "계좌번호", source: "submissions", type: "text" },
  { key: "account_holder", label: "예금주", source: "submissions", type: "text" },
  { key: "amount", label: "금액", source: "submissions", type: "number" },
  { key: "review_fee", label: "리뷰비", source: "submissions", type: "number" },
  { key: "planned_depositor_name", label: "입금자명(예정)", source: "products", type: "text" },
  { key: "is_review_verified", label: "리뷰완료", source: "submissions", type: "boolean" },
  { key: "is_deposit_verified", label: "입금완료", source: "submissions", type: "boolean" },
  { key: "deposited_at", label: "입금일", source: "submissions", type: "date" },
  { key: "actual_depositor_name", label: "실제입금자명", source: "submissions", type: "text" }
];

export function buildProductOverviewRow(product, submission, reviewPhotos = []) {
  if (!product || !submission) {
    return null;
  }

  return {
    product_id: product.id,
    submission_id: submission.id,
    product_created_at: product.created_at ?? null,
    submission_created_at: submission.created_at ?? null,
    manager_id: product.manager_id ?? null,
    title: product.title ?? null,
    product_name: product.product_name ?? null,
    deposit_date: product.deposit_date ?? null,
    description: product.description ?? null,
    is_real_shipping: product.is_real_shipping ?? null,
    company_name: product.company_name ?? null,
    option_name: product.option_name ?? null,
    review_type: product.review_type ?? null,
    review_fee: submission.review_fee ?? null,
    planned_depositor_name: product.planned_depositor_name ?? null,
    assign_name: submission.assign_name ?? null,
    review_photos: Array.isArray(reviewPhotos) ? reviewPhotos : [],
    order_number: submission.order_number ?? null,
    buyer_name: submission.buyer_name ?? null,
    recipient_name: submission.recipient_name ?? null,
    purchase_account: submission.purchase_account ?? null,
    contact: submission.contact ?? null,
    address: submission.address ?? null,
    bank_name: submission.bank_name ?? null,
    bank_account: submission.bank_account ?? null,
    account_holder: submission.account_holder ?? null,
    amount: submission.amount ?? null,
    is_purchase_verified: submission.is_purchase_verified ?? false,
    is_review_verified: submission.is_review_verified ?? false,
    is_deposit_verified: submission.is_deposit_verified ?? false,
    deposited_at: submission.deposited_at ?? null,
    actual_depositor_name: submission.actual_depositor_name ?? null
  };
}

export function buildProductOverviewRows(products, submissions, reviewPhotoMap = {}) {
  const productMap = new Map((products ?? []).map((product) => [product.id, product]));

  return (submissions ?? []).reduce((rows, submission) => {
    const product = productMap.get(submission.product_id);

    if (!product) {
      return rows;
    }

    rows.push(buildProductOverviewRow(product, submission, reviewPhotoMap[submission.id] ?? []));

    return rows;
  }, []);
}

export function compareProductOverviewRows(left, right) {
  const leftProductTime = toTimestamp(left.product_created_at, Number.MIN_SAFE_INTEGER);
  const rightProductTime = toTimestamp(right.product_created_at, Number.MIN_SAFE_INTEGER);

  if (leftProductTime !== rightProductTime) {
    return rightProductTime - leftProductTime;
  }

  if (left.product_id !== right.product_id) {
    return Number(left.product_id) - Number(right.product_id);
  }

  const leftSubmissionTime = toTimestamp(left.submission_created_at, Number.MAX_SAFE_INTEGER);
  const rightSubmissionTime = toTimestamp(right.submission_created_at, Number.MAX_SAFE_INTEGER);

  if (leftSubmissionTime !== rightSubmissionTime) {
    return leftSubmissionTime - rightSubmissionTime;
  }

  return Number(left.submission_id) - Number(right.submission_id);
}

export function sortProductOverviewRows(items) {
  return items.slice().sort(compareProductOverviewRows);
}

export function mergeProductOverviewRows(items, replacements, createdRows = []) {
  const replacementMap =
    replacements instanceof Map ? replacements : new Map((replacements ?? []).map((row) => [row.submission_id, row]));

  return sortProductOverviewRows([
    ...items.map((item) => replacementMap.get(item.submission_id) ?? item),
    ...createdRows
  ]);
}

export function replaceProductOverviewRows(items, replacements) {
  const replacementMap =
    replacements instanceof Map ? replacements : new Map((replacements ?? []).map((row) => [row.submission_id, row]));

  return items.map((item) => replacementMap.get(item.submission_id) ?? item);
}

export function buildProductOverviewRowPositionMaps(items) {
  const sortedRows = sortProductOverviewRows(items);
  const rowNumberMap = sortedRows.reduce((acc, row, index) => {
    acc[row.submission_id] = index + 1;
    return acc;
  }, {});
  const rowByNumberMap = sortedRows.reduce((acc, row, index) => {
    acc[index + 1] = row;
    return acc;
  }, {});

  return {
    sortedRows,
    rowNumberMap,
    rowByNumberMap,
    maxRowNumber: sortedRows.length
  };
}

export function splitProductOverviewRows(items) {
  return items.reduce(
    (acc, row) => {
      if (row.is_review_verified) {
        if (row.is_deposit_verified) {
          acc.completeRows.push(row);
        } else {
          acc.reviewRows.push(row);
        }
      } else {
        acc.purchaseRows.push(row);
      }

      return acc;
    },
    {
      purchaseRows: [],
      reviewRows: [],
      completeRows: []
    }
  );
}

export function filterProductOverviewRows(rows, filters) {
  const normalizedFilters = PRODUCT_OVERVIEW_COLUMNS.reduce((acc, column) => {
    const rawValue = filters?.[column.key];
    const normalizedValue = normalizeFilterValue(rawValue);

    if (normalizedValue) {
      if (column.type === "boolean") {
        acc[column.key] = normalizeBooleanText(normalizedValue);
      } else if (column.type === "photo") {
        acc[column.key] = normalizePhotoFilterValue(normalizedValue);
      } else {
        acc[column.key] = normalizedValue;
      }
    }

    return acc;
  }, {});

  if (Object.keys(normalizedFilters).length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    PRODUCT_OVERVIEW_COLUMNS.every((column) => {
      const filterValue = normalizedFilters[column.key];

      if (!filterValue) {
        return true;
      }

      if (column.type === "photo") {
        const hasPhotos = Array.isArray(row[column.key]) && row[column.key].length > 0;

        if (filterValue === "has") {
          return hasPhotos;
        }

        if (filterValue === "none") {
          return !hasPhotos;
        }
      }

      const cellValue = stringifyCellValue(row[column.key], column.type);
      const normalizedCellValue =
        column.type === "boolean" ? normalizeBooleanText(cellValue) : normalizeFilterValue(cellValue);

      return normalizedCellValue.includes(filterValue);
    })
  );
}

export function createEmptyProductOverviewFilters() {
  return PRODUCT_OVERVIEW_COLUMNS.reduce((acc, column) => {
    acc[column.key] = "";
    return acc;
  }, {});
}
