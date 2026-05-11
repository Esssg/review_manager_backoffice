export const FILE_UPLOAD_COLUMNS = [
  { index: 0, letter: "A", header: "날짜", key: "deposit_date", requiredHeader: true },
  { index: 1, letter: "B", header: "업체명", key: "company_name", requiredHeader: true },
  { index: 2, letter: "C", header: "링크", key: "link", ignored: true },
  { index: 3, letter: "D", header: "", key: "empty", ignored: true },
  { index: 4, letter: "E", header: "채번열", key: "numbering", ignored: true },
  { index: 5, letter: "F", header: "품명", key: "product_name", requiredHeader: true },
  { index: 6, letter: "G", header: "옵션", key: "option_name", requiredHeader: true },
  { index: 7, letter: "H", header: "리뷰형태", key: "review_type", requiredHeader: true },
  { index: 8, letter: "I", header: "배정", key: "assign_name", requiredHeader: true },
  { index: 9, letter: "J", header: "주문번호", key: "order_number", requiredHeader: true },
  { index: 10, letter: "K", header: "구매자", key: "buyer_name", requiredHeader: true },
  { index: 11, letter: "L", header: "수취인", key: "recipient_name", requiredHeader: true },
  { index: 12, letter: "M", header: "아이디", key: "purchase_account", requiredHeader: true },
  { index: 13, letter: "N", header: "연락처", key: "contact", requiredHeader: true },
  { index: 14, letter: "O", header: "주소", key: "address", requiredHeader: true },
  { index: 15, letter: "P", header: "계좌", key: "account", requiredHeader: true },
  { index: 16, letter: "Q", header: "금액", key: "amount", requiredHeader: true },
  { index: 17, letter: "R", header: "리뷰비", key: "review_fee", requiredHeader: true },
  { index: 18, letter: "S", header: "입금자명(예정)", key: "planned_depositor_name", requiredHeader: true },
  { index: 19, letter: "T", header: "리뷰작성", key: "is_review_verified", requiredHeader: true },
  { index: 20, letter: "U", header: "입금여부", key: "is_deposit_verified", requiredHeader: true },
  { index: 21, letter: "V", header: "입금일", key: "deposited_at", requiredHeader: true },
  { index: 22, letter: "W", header: "실제입금자명", key: "actual_depositor_name", requiredHeader: true }
];

const BANK_NAMES = [
  "SC제일은행",
  "IBK기업은행",
  "NH농협은행",
  "카카오뱅크",
  "새마을금고",
  "케이뱅크",
  "토스뱅크",
  "국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "농협은행",
  "기업은행",
  "산업은행",
  "부산은행",
  "대구은행",
  "광주은행",
  "전북은행",
  "경남은행",
  "씨티은행",
  "우체국",
  "산림조합",
  "농협",
  "국민",
  "신한",
  "우리",
  "하나",
  "기업",
  "수협",
  "신협",
  "토스",
  "카카오"
];

export function createFileUploadIssue({ rowNumber = null, column = "", code, message }) {
  return {
    rowNumber,
    column,
    code,
    message
  };
}

export function normalizeCellText(value) {
  return String(value ?? "").trim();
}

export function isBlankCell(value) {
  return normalizeCellText(value) === "";
}

function normalizeHeader(value) {
  return normalizeCellText(value).replace(/\s+/g, "").replace(/^['"]|['"]$/g, "");
}

export function validateFileUploadHeaders(headerRow = []) {
  return FILE_UPLOAD_COLUMNS.filter((column) => column.requiredHeader).flatMap((column) => {
    const actual = normalizeHeader(headerRow[column.index]);
    const expected = normalizeHeader(column.header);

    if (actual === expected) {
      return [];
    }

    return [
      createFileUploadIssue({
        rowNumber: 1,
        column: column.letter,
        code: "HEADER_MISMATCH",
        message: `${column.letter}열 헤더는 '${column.header}'이어야 합니다.`
      })
    ];
  });
}

function formatDateParts(year, month, day) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function isValidDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseDateParts(yearText, monthText, dayText) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (!isValidDateParts(year, month, day)) {
    return null;
  }

  return formatDateParts(year, month, day);
}

function parseExcelSerialDate(value) {
  if (!Number.isFinite(value) || value < 1) {
    return null;
  }

  const wholeDays = Math.floor(value);
  const date = new Date(Date.UTC(1899, 11, 30) + wholeDays * 24 * 60 * 60 * 1000);
  const parsed = {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate()
  };

  if (!parsed || !isValidDateParts(parsed.y, parsed.m, parsed.d)) {
    return null;
  }

  return formatDateParts(parsed.y, parsed.m, parsed.d);
}

export function parseFileUploadDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      value: formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate()),
      error: null
    };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = parseExcelSerialDate(value);

    return {
      value: parsed,
      error: parsed ? null : "날짜 형식이 올바르지 않습니다."
    };
  }

  const text = normalizeCellText(value);

  if (!text) {
    return {
      value: null,
      error: null
    };
  }

  if (/^\d+(\.\d+)?$/.test(text) && Number(text) > 20000) {
    const parsed = parseExcelSerialDate(Number(text));

    return {
      value: parsed,
      error: parsed ? null : "날짜 형식이 올바르지 않습니다."
    };
  }

  const matched = text.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  const parsed = matched ? parseDateParts(matched[1], matched[2], matched[3]) : null;

  return {
    value: parsed,
    error: parsed ? null : "날짜 형식이 올바르지 않습니다."
  };
}

export function parseFileUploadAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value)
      ? { value, error: null }
      : { value: null, error: "금액은 정수여야 합니다." };
  }

  const text = normalizeCellText(value);

  if (!text) {
    return {
      value: null,
      error: null
    };
  }

  const normalized = text.replace(/[,\s원₩]/g, "");

  if (!/^\d+(\.0+)?$/.test(normalized)) {
    return {
      value: null,
      error: "금액 형식이 올바르지 않습니다."
    };
  }

  return {
    value: Number(normalized),
    error: null
  };
}

export function parseFileUploadBoolean(value) {
  if (typeof value === "boolean") {
    return {
      value,
      error: null
    };
  }

  const text = normalizeCellText(value);

  if (!text) {
    return {
      value: false,
      error: null
    };
  }

  if (/^true$/i.test(text)) {
    return {
      value: true,
      error: null
    };
  }

  if (/^false$/i.test(text)) {
    return {
      value: false,
      error: null
    };
  }

  return {
    value: false,
    error: "TRUE 또는 FALSE만 사용할 수 있습니다."
  };
}

function normalizeBankAccount(value) {
  return normalizeCellText(value).replace(/\s+/g, "");
}

function buildParsedAccount(bankName, bankAccount, accountHolder) {
  const normalizedBankName = normalizeCellText(bankName);
  const normalizedBankAccount = normalizeBankAccount(bankAccount);
  const normalizedAccountHolder = normalizeCellText(accountHolder);

  if (!normalizedBankName || !normalizedBankAccount || !normalizedAccountHolder) {
    return {
      value: null,
      error: "계좌 정보는 은행, 계좌번호, 예금주가 모두 필요합니다."
    };
  }

  if (!/^\d[\d-]*\d$/.test(normalizedBankAccount)) {
    return {
      value: null,
      error: "계좌번호는 숫자로 시작해서 숫자로 끝나야 합니다."
    };
  }

  return {
    value: {
      bank_name: normalizedBankName,
      bank_account: normalizedBankAccount,
      account_holder: normalizedAccountHolder
    },
    error: null
  };
}

function parseSlashSeparatedAccount(text) {
  const parts = text.split("/").map((part) => part.trim()).filter(Boolean);

  if (parts.length !== 3) {
    return {
      value: null,
      error: "계좌 정보는 '은행 / 계좌번호 / 예금주' 형식이어야 합니다."
    };
  }

  return buildParsedAccount(parts[0], parts[1], parts[2]);
}

function findBankName(text) {
  const compactText = text.replace(/\s+/g, "");
  const matchedBank = BANK_NAMES.find((bankName) => compactText.includes(bankName.replace(/\s+/g, "")));

  if (!matchedBank) {
    return null;
  }

  const bankIndex = compactText.indexOf(matchedBank.replace(/\s+/g, ""));

  return {
    bankName: matchedBank,
    remainder: compactText.slice(bankIndex + matchedBank.replace(/\s+/g, "").length)
  };
}

function parsePatternAccount(text) {
  const matchedBank = findBankName(text);

  if (!matchedBank) {
    return {
      value: null,
      error: "은행명을 찾지 못했습니다."
    };
  }

  const matchedAccount = matchedBank.remainder.match(/(\d[\d-]*\d)/);

  if (!matchedAccount) {
    return {
      value: null,
      error: "계좌번호를 찾지 못했습니다."
    };
  }

  const bankAccount = matchedAccount[1];
  const accountIndex = matchedBank.remainder.indexOf(bankAccount);
  const accountHolder = matchedBank.remainder.slice(accountIndex + bankAccount.length);

  return buildParsedAccount(matchedBank.bankName, bankAccount, accountHolder);
}

export function parseFileUploadAccount(value) {
  const text = normalizeCellText(value);

  if (!text) {
    return {
      value: {
        bank_name: null,
        bank_account: null,
        account_holder: null
      },
      error: null
    };
  }

  return text.includes("/") ? parseSlashSeparatedAccount(text) : parsePatternAccount(text);
}

export function buildFileUploadProductTitle({ company_name, product_name, option_name }) {
  return [company_name, product_name, option_name].map(normalizeCellText).filter(Boolean).join(" / ");
}

export function resolveFileUploadIsRealShipping({ reviewType, reviewFees = [] }) {
  const normalizedReviewType = normalizeCellText(reviewType);

  return normalizedReviewType.includes("실배송") || reviewFees.some((reviewFee) => reviewFee === 0);
}
