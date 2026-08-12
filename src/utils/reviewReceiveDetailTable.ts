// @ts-nocheck

import { formatReviewReceiveAccount } from "@/utils/reviewReceiveTable";

export const REVIEW_RECEIVE_ROW_FILTER_COLUMNS = [
  { key: "row_number", label: "순번", type: "text" },
  { key: "assign_name", label: "배정", type: "text" },
  { key: "order_number", label: "주문번호", type: "text" },
  { key: "buyer_name", label: "구매자", type: "text" },
  { key: "recipient_name", label: "수취인", type: "text" },
  { key: "purchase_account", label: "구매계정", type: "text" },
  { key: "contact", label: "연락처", type: "text" },
  { key: "address", label: "주소", type: "text" },
  { key: "account", label: "계좌", type: "text" },
  { key: "amount", label: "금액", type: "text" },
  { key: "review_fee", label: "리뷰비", type: "text" },
  { key: "photos", label: "사진", type: "text" },
  { key: "planned_depositor_name", label: "입금자명(예정)", type: "text" },
  { key: "is_review_verified", label: "리뷰완료", type: "text" },
  { key: "is_deposit_verified", label: "입금완료", type: "text" },
  { key: "deposited_at", label: "입금일", type: "dateRange", hiddenInPurchase: true },
  { key: "actual_depositor_name", label: "실제입금자명", type: "text", hiddenInPurchase: true }
];

export function getVisibleReviewReceiveRowFilterColumns(isPurchaseSection) {
  return REVIEW_RECEIVE_ROW_FILTER_COLUMNS.filter((column) => !isPurchaseSection || !column.hiddenInPurchase);
}

export function createEmptyReviewReceiveRowFilters() {
  return REVIEW_RECEIVE_ROW_FILTER_COLUMNS.reduce((filters, column) => {
    filters[column.key] = column.type === "dateRange" ? { start: "", end: "" } : "";
    return filters;
  }, {});
}

export function createEmptySectionColumnFilters() {
  return {
    allProducts: createEmptyReviewReceiveRowFilters(),
    allProductsReview: createEmptyReviewReceiveRowFilters(),
    allProductsComplete: createEmptyReviewReceiveRowFilters(),
    purchase: createEmptyReviewReceiveRowFilters(),
    review: createEmptyReviewReceiveRowFilters(),
    complete: createEmptyReviewReceiveRowFilters()
  };
}

export function normalizeReviewReceiveFilterText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s./\\|_-]+/g, "");
}

export function formatBooleanFilterValue(value) {
  return value ? "완료 true 체크됨 checked yes" : "미완료 false 체크안됨 unchecked no";
}

export function getReviewReceiveRowFilterValue(row, columnKey, context) {
  const { rowNumberMap, plannedDepositorName, getPlannedDepositorName } = context;

  if (columnKey === "row_number") {
    return rowNumberMap[row.id] ?? "";
  }

  if (columnKey === "account") {
    return row.accountInfoInput || formatReviewReceiveAccount(row.bank_name, row.bank_account, row.account_holder);
  }

  if (columnKey === "photos") {
    return row.photos?.length ? "제출완료 사진있음 uploaded" : "제출전 사진없음 empty";
  }

  if (columnKey === "planned_depositor_name") {
    return getPlannedDepositorName?.(row) ?? plannedDepositorName ?? "";
  }

  if (columnKey === "is_review_verified") {
    return formatBooleanFilterValue(Boolean(row.is_review_verified));
  }

  if (columnKey === "is_deposit_verified") {
    return formatBooleanFilterValue(Boolean(row.is_deposit_verified));
  }

  if (columnKey === "deposited_at") {
    return row.deposited_at ?? "";
  }

  return row[columnKey] ?? "";
}

export function hasActiveReviewReceiveRowFilters(filters = {}) {
  return REVIEW_RECEIVE_ROW_FILTER_COLUMNS.some((column) => {
    const value = filters[column.key];

    if (column.type === "dateRange") {
      return Boolean(value?.start || value?.end);
    }

    return String(value ?? "").trim() !== "";
  });
}

export function filterReviewReceiveRowsByColumnFilters(rows, filters = {}, context) {
  return rows.filter((row) =>
    REVIEW_RECEIVE_ROW_FILTER_COLUMNS.every((column) => {
      const filterValue = filters[column.key];

      if (column.type === "dateRange") {
        const rowDate = getReviewReceiveRowFilterValue(row, column.key, context);
        const startDate = filterValue?.start || "";
        const endDate = filterValue?.end || "";

        if (!startDate && !endDate) {
          return true;
        }

        if (!rowDate) {
          return false;
        }

        if (startDate && rowDate < startDate) {
          return false;
        }

        if (endDate && rowDate > endDate) {
          return false;
        }

        return true;
      }

      const searchText = normalizeReviewReceiveFilterText(filterValue);

      if (!searchText) {
        return true;
      }

      return normalizeReviewReceiveFilterText(getReviewReceiveRowFilterValue(row, column.key, context)).includes(searchText);
    })
  );
}
