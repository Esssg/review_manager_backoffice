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
    .map((line, index) => ({
      lineNumber: index + 1,
      line: line.replace(/\r$/, "")
    }))
    .filter(({ line }) => line.split("\t").some((cell) => normalizeCell(cell)));
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

function hasReviewerCells(cells) {
  return cells.slice(8, 18).some((cell) => normalizeCell(cell));
}

function isIgnorableRow(cells) {
  return !normalizeCell(cells[5]) && !normalizeCell(cells[2]) && !hasReviewerCells(cells);
}

function normalizeReviewType(value) {
  const rawReviewType = normalizeCell(value);
  return rawReviewType && Number.isNaN(Number(rawReviewType)) ? rawReviewType : "";
}

function getProductIdentity(cells, currentYear, currentProductForm = null) {
  const productName = normalizeCell(cells[5]);

  if (!productName) {
    return null;
  }

  const rawDate = normalizeCell(cells[0]);
  const productDate = rawDate
    ? parseProductDate(rawDate, currentYear)
    : currentProductForm?.productDate ?? formatDateInputValue(new Date());
  const companyName = normalizeCell(cells[1]) || currentProductForm?.companyName || "";
  const optionName = normalizeCell(cells[6]);
  const reviewType = normalizeReviewType(cells[7]);
  const key = [productDate, companyName, productName, optionName, reviewType].join("\u001f");

  return {
    key,
    productDate,
    companyName,
    productName,
    optionName,
    reviewType
  };
}

function buildProductFormFromCells(cells, identity) {
  const productDate = identity.productDate;
  const companyName = identity.companyName;
  const productName = identity.productName;
  const optionName = identity.optionName;
  const reviewType = identity.reviewType;
  const plannedDepositorSourceName = normalizeCell(cells[18]) || companyName;
  const plannedDepositorName = formatPlannedDepositorName(productDate, plannedDepositorSourceName);
  const { description, productLink } = normalizeProductDescriptionAndLink(cells[2]);

  return {
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
  const parsed = parsePurchaseBulkInput(purchaseCells.join("\t"), {
    allowAssignName: true,
    preferPurchaseAccountColumn: true
  })[0];

  return {
    clientId: `${lineNumber}-${parsed.order_number || "row"}`,
    sourceLineNumber: lineNumber,
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
    .map(({ line, lineNumber }) => ({
      lineNumber,
      cells: line.split("\t")
    }))
    .filter(({ cells }) => !isHeaderRow(cells))
    .filter(({ cells }) => !isIgnorableRow(cells));

  if (rows.length === 0) {
    throw new Error("상품/리뷰어 일괄 입력 데이터를 붙여넣어주세요.");
  }

  const productGroups = [];
  let currentGroup = null;

  rows.forEach(({ cells, lineNumber }) => {
    const identity = getProductIdentity(cells, currentYear, currentGroup?.productForm);

    if (!currentGroup || (identity && identity.key !== currentGroup.identityKey)) {
      if (!identity) {
        throw new Error(`${lineNumber}번째 행의 품명을 확인해주세요.`);
      }

      currentGroup = {
        clientId: `product-group-${productGroups.length + 1}`,
        identityKey: identity.key,
        productForm: buildProductFormFromCells(cells, identity),
        reviewers: []
      };
      productGroups.push(currentGroup);
    }

    if (!hasReviewerCells(cells)) {
      return;
    }

    try {
      currentGroup.reviewers.push({
        ...parseReviewerCells(cells, lineNumber),
        productGroupClientId: currentGroup.clientId
      });
    } catch (error) {
      throw new Error(`${lineNumber}번째 행: ${error.message || "구매자 정보를 확인해주세요."}`);
    }
  });

  const emptyGroup = productGroups.find((group) => group.reviewers.length === 0);

  if (emptyGroup) {
    throw new Error(`${emptyGroup.productForm.productName || "품목"}에 등록할 리뷰어 행이 없습니다.`);
  }

  const reviewers = productGroups.flatMap((group) => group.reviewers);

  return {
    productForm: productGroups[0].productForm,
    reviewers,
    productGroups: productGroups.map(({ identityKey, ...group }) => group)
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
