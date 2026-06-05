import { parsePurchaseBulkInput } from "./reviewReceiveBulkInput.js";
import { normalizeProductDescriptionAndLink } from "./productLink.js";
import { formatPlannedDepositorName } from "./plannedDepositorName.js";

function parseAmount(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function formatDateInputValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 10);
}

function formatTitleDate(dateInput) {
  return String(dateInput ?? "").replace(/-/g, ".");
}

function normalizeCell(value) {
  return String(value ?? "").trim();
}

function splitRows(rawText) {
  return String(rawText ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.split("\t").some((cell) => normalizeCell(cell)));
}

function parseProductDate(value, currentYear) {
  const text = normalizeCell(value);
  const monthDayMatch = text.match(/^(\d{1,2})-(\d{1,2})$/);

  if (monthDayMatch) {
    const month = monthDayMatch[1].padStart(2, "0");
    const day = monthDayMatch[2].padStart(2, "0");
    return `${currentYear}-${month}-${day}`;
  }

  const fullDateMatch = text.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})$/);

  if (fullDateMatch) {
    const month = fullDateMatch[2].padStart(2, "0");
    const day = fullDateMatch[3].padStart(2, "0");
    return `${fullDateMatch[1]}-${month}-${day}`;
  }

  return formatDateInputValue(new Date());
}

function parseBooleanCell(value) {
  const normalized = normalizeCell(value).toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false" || normalized === "") {
    return false;
  }

  return Boolean(value);
}

function isHeaderRow(cells) {
  return normalizeCell(cells[0]).includes("날짜") && normalizeCell(cells[1]).includes("업체명");
}

function buildProductTitle({ productDate, companyName, productName }) {
  const titleParts = [companyName, productName].filter(Boolean).join(" ");
  return titleParts ? `${formatTitleDate(productDate)} / ${titleParts}` : formatTitleDate(productDate);
}

function parseReviewerCells(cells, lineNumber) {
  const purchaseCells = [
    cells[8],
    cells[9],
    cells[10],
    cells[11],
    cells[12],
    cells[13],
    cells[14],
    cells[15],
    cells[16],
    cells[17]
  ];
  const parsed = parsePurchaseBulkInput(purchaseCells.join("\t"), { allowAssignName: true })[0];

  return {
    clientId: `${lineNumber}-${parsed.order_number || Date.now()}`,
    assign_name: parsed.assign_name || "",
    order_number: parsed.order_number || "",
    buyer_name: parsed.buyer_name || "",
    recipient_name: parsed.recipient_name || "",
    purchase_account: parsed.purchase_account || "",
    contact: parsed.contact || "",
    address: parsed.address || "",
    bank_name: parsed.bank_name || "",
    bank_account: parsed.bank_account || "",
    account_holder: parsed.account_holder || "",
    amount: parsed.amount == null ? "" : String(parsed.amount),
    review_fee: parsed.review_fee == null ? "" : String(parsed.review_fee),
    actual_depositor_name: "",
    is_review_verified: parseBooleanCell(cells[19]),
    is_deposit_verified: parseBooleanCell(cells[20])
  };
}

export function parseProductReviewerBulkInput(rawText, options = {}) {
  const currentYear = options.currentYear ?? new Date().getFullYear();
  const rows = splitRows(rawText)
    .map((line) => line.split("\t"))
    .filter((cells) => !isHeaderRow(cells));

  if (rows.length === 0) {
    throw new Error("상품/리뷰어 일괄 입력 데이터를 붙여넣어주세요.");
  }

  const firstRow = rows[0];
  const productDate = parseProductDate(firstRow[0], currentYear);
  const companyName = normalizeCell(firstRow[1]);
  const productName = normalizeCell(firstRow[5]);
  const optionName = normalizeCell(firstRow[6]);
  const rawReviewType = normalizeCell(firstRow[7]);
  const reviewType = rawReviewType && Number.isNaN(Number(rawReviewType)) ? rawReviewType : "";
  const plannedDepositorName = normalizeCell(firstRow[18]) || formatPlannedDepositorName(productDate, companyName);
  const { description, productLink } = normalizeProductDescriptionAndLink(firstRow[2]);

  if (!productName) {
    throw new Error("첫 행의 품명을 확인해주세요.");
  }

  const productForm = {
    title: buildProductTitle({ productDate, companyName, productName }),
    productDate,
    productName,
    companyName,
    optionName,
    reviewType,
    plannedDepositorName,
    description,
    productLink
  };

  const reviewers = rows.map((cells, index) => {
    try {
      return parseReviewerCells(cells, index + 1);
    } catch (error) {
      throw new Error(`${index + 1}번째 행: ${error.message || "구매자 정보를 확인해주세요."}`);
    }
  });

  return {
    productForm,
    reviewers
  };
}

export function normalizeProductReviewerRowForSave(row, lineNumber) {
  const amount = parseAmount(row.amount);
  const reviewFee = parseAmount(row.review_fee);

  if (!normalizeCell(row.assign_name)) {
    throw new Error(`${lineNumber}번째 행의 배정을 입력해주세요.`);
  }

  if (!normalizeCell(row.order_number)) {
    throw new Error(`${lineNumber}번째 행의 주문번호를 입력해주세요.`);
  }

  if (!normalizeCell(row.buyer_name)) {
    throw new Error(`${lineNumber}번째 행의 구매자를 입력해주세요.`);
  }

  if (!normalizeCell(row.recipient_name)) {
    throw new Error(`${lineNumber}번째 행의 수취인을 입력해주세요.`);
  }

  if (normalizeCell(row.contact).replace(/\D/g, "").length < 8) {
    throw new Error(`${lineNumber}번째 행의 연락처를 확인해주세요.`);
  }

  if (!normalizeCell(row.address)) {
    throw new Error(`${lineNumber}번째 행의 주소를 입력해주세요.`);
  }

  if (!normalizeCell(row.bank_name) || !normalizeCell(row.bank_account) || !normalizeCell(row.account_holder)) {
    throw new Error(`${lineNumber}번째 행의 계좌 정보를 입력해주세요.`);
  }

  if (amount == null) {
    throw new Error(`${lineNumber}번째 행의 금액을 확인해주세요.`);
  }

  return {
    assign_name: normalizeCell(row.assign_name),
    order_number: normalizeCell(row.order_number),
    buyer_name: normalizeCell(row.buyer_name),
    recipient_name: normalizeCell(row.recipient_name),
    purchase_account: normalizeCell(row.purchase_account) || null,
    contact: normalizeCell(row.contact).replace(/\D/g, ""),
    address: normalizeCell(row.address),
    bank_name: normalizeCell(row.bank_name),
    bank_account: normalizeCell(row.bank_account).replace(/\s+/g, ""),
    account_holder: normalizeCell(row.account_holder),
    amount,
    review_fee: reviewFee,
    actual_depositor_name: normalizeCell(row.actual_depositor_name) || null,
    is_review_verified: Boolean(row.is_review_verified),
    is_deposit_verified: Boolean(row.is_deposit_verified)
  };
}
