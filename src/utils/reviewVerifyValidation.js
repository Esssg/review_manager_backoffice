export const REVIEW_VERIFY_REQUIRED_FIELDS = [
  { key: "order_number", label: "주문번호" },
  { key: "buyer_name", label: "구매자" },
  { key: "recipient_name", label: "수취인" },
  { key: "purchase_account", label: "구매계정" },
  { key: "contact", label: "연락처" },
  { key: "address", label: "주소" },
  { key: "bank_name", label: "은행" },
  { key: "bank_account", label: "계좌번호" },
  { key: "account_holder", label: "예금주" },
  { key: "amount", label: "금액" }
];

export function isEmptyRequiredValue(value) {
  return value == null || String(value).trim() === "";
}

export function getMissingRequiredFieldLabels(rows, fields = REVIEW_VERIFY_REQUIRED_FIELDS) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  return fields
    .filter(({ key }) => rows.some((row) => isEmptyRequiredValue(row?.[key])))
    .map(({ label }) => label);
}

export function formatMissingFieldLabels(labels) {
  return (labels ?? []).join(", ");
}
