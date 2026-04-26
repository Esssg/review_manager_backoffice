import { parseInlinePurchaseInput } from "./reviewReceiveBulkInput";

const REQUIRED_FIELDS = [
  ["order_number", "주문번호"],
  ["buyer_name", "구매자"],
  ["recipient_name", "수취인"],
  ["contact", "연락처"],
  ["address", "주소"],
  ["bank_name", "은행"],
  ["bank_account", "계좌번호"],
  ["account_holder", "입금주"],
  ["amount", "금액"]
];

export function parseSubmissionText(rawText) {
  const parsed = parseInlinePurchaseInput(rawText);
  const missingLabel = REQUIRED_FIELDS.find(([key]) => {
    const value = parsed[key];
    return value == null || String(value).trim() === "";
  })?.[1];

  if (missingLabel) {
    throw new Error(`${missingLabel}을(를) 입력해주세요.`);
  }

  return {
    ...parsed,
    assign_name: parsed.assign_name || null,
    purchase_account: parsed.purchase_account || null
  };
}
