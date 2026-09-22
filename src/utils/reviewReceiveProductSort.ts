// @ts-nocheck

import { getProductDepositGbPartLabels } from "@/constants/admin";
import {
  hasRegisteredBundleItem,
  REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS
} from "@/utils/reviewReceiveProductList";
import { normalizeSortState } from "@/utils/tableSort";

function normalizeSortText(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ko-KR");
}

function toTimestamp(value) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getReviewReceiveSortValue(product, key) {
  if (key === "registered_date") {
    return toTimestamp(product?.product_date ?? product?.cursor_product_date ?? product?.created_at);
  }

  if (key === "product_fee_deposit_GB" || key === "review_fee_deposit_GB") {
    if (!hasRegisteredBundleItem(product)) {
      return "품목 미등록";
    }

    const labels = getProductDepositGbPartLabels(product?.deposit_GB);
    return labels[key === "product_fee_deposit_GB" ? "productFee" : "reviewFee"] || null;
  }

  if (["product_name", "option_name", "review_type", "product_link"].includes(key) && !hasRegisteredBundleItem(product)) {
    return "품목 미등록";
  }

  return product?.[key] ?? null;
}

function compareNullable(leftValue, rightValue, direction) {
  const leftIsNull = leftValue == null || leftValue === "";
  const rightIsNull = rightValue == null || rightValue === "";

  if (leftIsNull || rightIsNull) {
    if (leftIsNull && rightIsNull) {
      return 0;
    }

    return leftIsNull ? 1 : -1;
  }

  if (leftValue === rightValue) {
    return 0;
  }

  const comparison = leftValue > rightValue ? 1 : -1;
  return direction === "desc" ? -comparison : comparison;
}

export function compareReviewReceiveProductsBySort(left, right, sortState = []) {
  const normalizedSortState = normalizeSortState(
    sortState,
    REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS.map((column) => column.key)
  );

  for (const sortEntry of normalizedSortState) {
    let leftValue = getReviewReceiveSortValue(left, sortEntry.key);
    let rightValue = getReviewReceiveSortValue(right, sortEntry.key);

    if (sortEntry.key === "registered_date") {
      leftValue = toTimestamp(leftValue);
      rightValue = toTimestamp(rightValue);
    } else {
      leftValue = normalizeSortText(leftValue);
      rightValue = normalizeSortText(rightValue);
    }

    const comparison = compareNullable(leftValue, rightValue, sortEntry.direction);

    if (comparison !== 0) {
      return comparison;
    }
  }

  return Number(left?.id ?? 0) - Number(right?.id ?? 0);
}

export function sortReviewReceiveProducts(items = [], sortState = []) {
  return items.slice().sort((left, right) => compareReviewReceiveProductsBySort(left, right, sortState));
}
