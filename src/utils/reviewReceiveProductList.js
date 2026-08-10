import { splitReviewReceiveRows } from "./reviewReceiveRows";

export const REVIEW_RECEIVE_ROW_NUMBER_COLUMN_WIDTH_RATIO = 5;
export const REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS_BEFORE_SUMMARY = [
  { key: "registered_date", label: "등록일", type: "dateRange", widthRatio: 5 },
  { key: "company_name", label: "업체명", type: "text", widthRatio: 10 },
  { key: "product_name", label: "품명", type: "text", widthRatio: 20 },
  { key: "option_name", label: "옵션", type: "text", widthRatio: 10 },
  { key: "review_type", label: "리뷰형태", type: "text", widthRatio: 10 },
  { key: "product_fee_deposit_GB", label: "제품비 입금구분", type: "text", widthRatio: 5 },
  { key: "review_fee_deposit_GB", label: "리뷰비 입금구분", type: "text", widthRatio: 5 }
];
export const REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS_AFTER_SUMMARY = [
  { key: "product_link", label: "링크", type: "text", widthRatio: 10 },
  { key: "manager_id", label: "담당자", type: "text", widthRatio: 5 }
];
export const REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS = [
  ...REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS_BEFORE_SUMMARY,
  ...REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS_AFTER_SUMMARY
];
export const REVIEW_RECEIVE_SUMMARY_COLUMN_WIDTH_RATIO = 10;
export const REVIEW_RECEIVE_ACTIONS_COLUMN_WIDTH_RATIO = 5;
export const REVIEW_RECEIVE_PRODUCT_LIST_COLUMN_COUNT = REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS.length + 3;

export function formatDateInputValue(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 10);
}

export function formatDisplayDate(value) {
  const inputValue = formatDateInputValue(value);

  if (!inputValue) {
    return "-";
  }

  return new Date(`${inputValue}T00:00:00`).toLocaleDateString("ko-KR");
}

export function getBundleKey(product) {
  return product?.bundle_id ?? product?.id;
}

export function getBundleItems(product) {
  return Array.isArray(product?.bundleItems) && product.bundleItems.length > 0 ? product.bundleItems : [product];
}

export function isBundleShellProduct(product) {
  return [
    product?.title,
    product?.product_name,
    product?.option_name,
    product?.review_type,
    product?.description,
    product?.product_link,
    product?.planned_depositor_name
  ].every((value) => !String(value ?? "").trim());
}

export function getBundleVisibleItems(product) {
  return getBundleItems(product).filter((item) => !isBundleShellProduct(item));
}

export function isMultiProductBundleRow(product) {
  return Boolean(product?.isMultiProductBundle);
}

const UNREGISTERED_PRODUCT_ITEM_TEXT = "품목 미등록";

export function hasRegisteredBundleItem(product) {
  if (!isMultiProductBundleRow(product)) {
    return true;
  }

  return Array.isArray(product?.bundleVisibleItems) && product.bundleVisibleItems.length > 0;
}

export function formatProductItemCell(product, value, emptyText = "-") {
  if (!hasRegisteredBundleItem(product)) {
    return UNREGISTERED_PRODUCT_ITEM_TEXT;
  }

  const text = String(value ?? "").trim();
  return text ? value : emptyText;
}

export function formatProductLinkPreview(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(line) ? line : `https://${line}`);
        const hasRemainder = url.pathname !== "/" || Boolean(url.search || url.hash);
        return `${url.host}/${hasRemainder ? "..." : ""}`;
      } catch {
        const textWithoutProtocol = line.replace(/^[a-z][a-z\d+.-]*:\/\//i, "");
        const firstSlashIndex = textWithoutProtocol.indexOf("/");

        if (firstSlashIndex === -1) {
          return textWithoutProtocol;
        }

        const hasRemainder = firstSlashIndex < textWithoutProtocol.length - 1;
        return `${textWithoutProtocol.slice(0, firstSlashIndex + 1)}${hasRemainder ? "..." : ""}`;
      }
    })
    .join("\n");
}

export function getReviewReceiveSubmissionSummary(product) {
  if (product?.submission_count != null) {
    return `${Number(product.purchase_count ?? 0)}/${Number(product.review_count ?? 0)}/${Number(product.complete_count ?? 0)}/(총 ${Number(product.submission_count ?? 0)}개)`;
  }

  const submissions = Array.isArray(product?.submissions) ? product.submissions : [];
  const { purchaseRows, reviewRows, completeRows } = splitReviewReceiveRows(submissions);

  return `${purchaseRows.length}/${reviewRows.length}/${completeRows.length}/(총 ${submissions.length}개)`;
}
