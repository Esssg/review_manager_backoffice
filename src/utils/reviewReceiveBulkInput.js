function parseAmount(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function formatLinePrefix(lineNumber) {
  return lineNumber ? `${lineNumber}번째 입력: ` : "";
}

function buildPurchaseFormatMessage(includeAssignName) {
  const formatMessage = includeAssignName
    ? "'배정명 / 주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액', '배정명 / 주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액', '배정명 / 주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 / 계좌번호 / 입금주 / 금액', '배정명 / 주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 / 계좌번호 / 입금주 / 금액' 형식으로 입력해주세요."
    : "'주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액', '주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액', '주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 / 계좌번호 / 입금주 / 금액', '주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 / 계좌번호 / 입금주 / 금액' 형식으로 입력해주세요.";

  return `${formatMessage} 각 칸은 '/' 또는 탭으로 구분할 수 있습니다.`;
}

function buildAccountFieldError(lineNumber) {
  return `${formatLinePrefix(lineNumber)}계좌 정보는 '은행 계좌번호 입금주' 또는 '은행 / 계좌번호 / 입금주' 형식이어야 합니다.`;
}

function normalizeAccountFields(bankName, bankAccount, accountHolder, lineNumber) {
  const normalizedBankName = String(bankName ?? "").trim();
  const normalizedBankAccount = String(bankAccount ?? "").replace(/\s+/g, "");
  const normalizedAccountHolder = String(accountHolder ?? "").trim();

  if (!normalizedBankName || !normalizedBankAccount || !normalizedAccountHolder) {
    throw new Error(buildAccountFieldError(lineNumber));
  }

  if (!/^\d[\d-]*\d$/.test(normalizedBankAccount)) {
    throw new Error(`${formatLinePrefix(lineNumber)}계좌번호는 숫자로 시작해서 숫자로 끝나야 합니다.`);
  }

  return {
    bank_name: normalizedBankName,
    bank_account: normalizedBankAccount,
    account_holder: normalizedAccountHolder
  };
}

function hasMeaningfulValue(value) {
  if (typeof value === "number") {
    return true;
  }

  return String(value ?? "").trim().length > 0;
}

function isLikelyContactField(value) {
  return String(value ?? "").replace(/\D/g, "").length >= 8;
}

function normalizeLines(rawText) {
  return String(rawText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitPurchaseLine(line) {
  if (line.includes("\t")) {
    return line.split("\t").map((part) => part.trim());
  }

  return line.split("/").map((part) => part.trim());
}

function parseFlexibleSeparatedPurchaseLineParts(valueParts, lineNumber, allowPartial) {
  const fieldCount = valueParts.length;
  const hasPurchaseAccount = !isLikelyContactField(valueParts[3]);
  const accountStartIndex = hasPurchaseAccount ? 6 : 5;
  const minimumFieldCount = hasPurchaseAccount ? 11 : 10;
  const hasReviewFee = parseAmount(valueParts[fieldCount - 1]) != null && parseAmount(valueParts[fieldCount - 2]) != null;

  if (fieldCount < minimumFieldCount) {
    return null;
  }

  const orderNumber = valueParts[0];
  const buyerName = valueParts[1];
  const recipientName = valueParts[2];
  const purchaseAccount = hasPurchaseAccount ? valueParts[3] : "";
  const contactText = hasPurchaseAccount ? valueParts[4] : valueParts[3];
  const address = hasPurchaseAccount ? valueParts[5] : valueParts[4];
  const accountParts = valueParts.slice(accountStartIndex, hasReviewFee ? -2 : -1);
  const amountText = valueParts[valueParts.length - (hasReviewFee ? 2 : 1)];
  const reviewFeeText = hasReviewFee ? valueParts[valueParts.length - 1] : "";
  const trimmedContact = String(contactText ?? "").trim();
  const contact = trimmedContact ? trimmedContact.replace(/\D/g, "") : "";
  const trimmedAmountText = String(amountText ?? "").trim();
  const amount = trimmedAmountText ? parseAmount(trimmedAmountText) : null;
  const reviewFee = hasReviewFee ? parseAmount(reviewFeeText) : null;

  if (accountParts.length < 3) {
    return null;
  }

  const parsedAccount = allowPartial
    ? parseOptionalSeparatedAccountFields(accountParts[0], accountParts[1], accountParts.slice(2).join(" "), lineNumber)
    : parseSeparatedAccountFields(accountParts[0], accountParts[1], accountParts.slice(2).join(" "), lineNumber);

  return {
    orderNumber,
    buyerName,
    recipientName,
    purchaseAccount,
    contactText,
    contact,
    address,
    amountText,
    trimmedContact,
    trimmedAmountText,
    amount,
    reviewFee,
    parsedAccount
  };
}

function parseAccountChunk(accountChunk, lineNumber) {
  if (accountChunk.includes("/")) {
    throw new Error(
      `${formatLinePrefix(lineNumber)}계좌 정보는 '은행 계좌번호 입금주' 형식이어야 합니다. '/'는 사용할 수 없습니다.`
    );
  }

  const rawChunk = String(accountChunk ?? "").trim();
  const matched = rawChunk.match(/^(.+?)(\d(?:[\d-\s]*\d)?)(\D.+)$/);

  if (!matched) {
    throw new Error(buildAccountFieldError(lineNumber));
  }

  const [, bankName, bankAccount, accountHolder] = matched;
  return normalizeAccountFields(bankName, bankAccount, accountHolder, lineNumber);
}

function parseSeparatedAccountFields(bankName, bankAccount, accountHolder, lineNumber) {
  return normalizeAccountFields(bankName, bankAccount, accountHolder, lineNumber);
}

function parseOptionalAccountChunk(accountChunk, lineNumber) {
  if (!String(accountChunk ?? "").trim()) {
    return {
      bank_name: "",
      bank_account: "",
      account_holder: ""
    };
  }

  return parseAccountChunk(accountChunk, lineNumber);
}

function parseOptionalSeparatedAccountFields(bankName, bankAccount, accountHolder, lineNumber) {
  if (![bankName, bankAccount, accountHolder].some((value) => String(value ?? "").trim())) {
    return {
      bank_name: "",
      bank_account: "",
      account_holder: ""
    };
  }

  return parseSeparatedAccountFields(bankName, bankAccount, accountHolder, lineNumber);
}

function parsePurchaseLineParts(parts, lineNumber, options = {}) {
  const { allowAssignName = false, allowPartial = false } = options;
  const startsWithOrderNumber = /^\d+$/.test(parts[0] ?? "");
  const hasAssignName = allowAssignName && !startsWithOrderNumber;
  const assignName = hasAssignName ? parts[0] : "";
  const valueParts = hasAssignName ? parts.slice(1) : parts;
  const fieldCount = valueParts.length;
  const flexibleSeparatedParts =
    fieldCount > 10 ? parseFlexibleSeparatedPurchaseLineParts(valueParts, lineNumber, allowPartial) : null;

  if (flexibleSeparatedParts) {
    const {
      orderNumber,
      buyerName,
      recipientName,
      purchaseAccount,
      contact,
      address,
      trimmedContact,
      trimmedAmountText,
      amount,
      reviewFee,
      parsedAccount
    } = flexibleSeparatedParts;

    if (!allowPartial) {
      if (!orderNumber) {
        throw new Error(`${formatLinePrefix(lineNumber)}주문번호가 비어 있습니다.`);
      }

      if (!buyerName) {
        throw new Error(`${formatLinePrefix(lineNumber)}구매자가 비어 있습니다.`);
      }

      if (!recipientName) {
        throw new Error(`${formatLinePrefix(lineNumber)}수취인이 비어 있습니다.`);
      }

      if (contact.length < 8) {
        throw new Error(`${formatLinePrefix(lineNumber)}연락처 형식이 올바르지 않습니다.`);
      }

      if (!address) {
        throw new Error(`${formatLinePrefix(lineNumber)}주소가 비어 있습니다.`);
      }

      if (amount == null) {
        throw new Error(`${formatLinePrefix(lineNumber)}금액 형식이 올바르지 않습니다.`);
      }
    } else {
      if (trimmedContact && contact.length < 8) {
        throw new Error(`${formatLinePrefix(lineNumber)}연락처 형식이 올바르지 않습니다.`);
      }

      if (trimmedAmountText && amount == null) {
        throw new Error(`${formatLinePrefix(lineNumber)}금액 형식이 올바르지 않습니다.`);
      }
    }

    return {
      assign_name: assignName || "",
      order_number: orderNumber || "",
      buyer_name: buyerName || "",
      recipient_name: recipientName || "",
      purchase_account: purchaseAccount || "",
      contact,
      address: address || "",
      amount,
      review_fee: reviewFee,
      ...parsedAccount
    };
  }

  const hasFixedTrailingReviewFee =
    parseAmount(valueParts[fieldCount - 1]) != null &&
    parseAmount(valueParts[fieldCount - 2]) != null &&
    ((fieldCount === 8 && isLikelyContactField(valueParts[3])) ||
      (fieldCount === 9 && !isLikelyContactField(valueParts[3])) ||
      (fieldCount === 10 && isLikelyContactField(valueParts[3])));
  const normalizedValueParts = hasFixedTrailingReviewFee ? valueParts.slice(0, -1) : valueParts;
  const normalizedFieldCount = normalizedValueParts.length;
  const reviewFee = hasFixedTrailingReviewFee ? parseAmount(valueParts[fieldCount - 1]) : null;
  const usesSeparatedAccountFields = normalizedFieldCount === 9 || normalizedFieldCount === 10;
  const hasPurchaseAccount = normalizedFieldCount === 8 || normalizedFieldCount === 10;

  if (![7, 8, 9, 10].includes(normalizedFieldCount)) {
    throw new Error(`${formatLinePrefix(lineNumber)}${buildPurchaseFormatMessage(hasAssignName)}`);
  }

  const [
    orderNumber,
    buyerName,
    recipientName,
    purchaseAccountOrContact,
    contactOrAddress,
    addressOrAccountChunkOrBankName,
    accountChunkOrBankAccount,
    maybeAccountHolderOrAmountText,
    maybeAmountText,
    maybeTrailingAmountText
  ] = normalizedValueParts;

  const purchaseAccount = hasPurchaseAccount ? purchaseAccountOrContact : "";
  const contactText = hasPurchaseAccount ? contactOrAddress : purchaseAccountOrContact;
  const address = hasPurchaseAccount ? addressOrAccountChunkOrBankName : contactOrAddress;
  const trimmedContact = String(contactText ?? "").trim();
  const contact = trimmedContact ? trimmedContact.replace(/\D/g, "") : "";
  const accountChunk = hasPurchaseAccount ? accountChunkOrBankAccount : addressOrAccountChunkOrBankName;
  const bankName = hasPurchaseAccount ? accountChunkOrBankAccount : addressOrAccountChunkOrBankName;
  const bankAccount = hasPurchaseAccount ? maybeAccountHolderOrAmountText : accountChunkOrBankAccount;
  const accountHolder = hasPurchaseAccount ? maybeAmountText : maybeAccountHolderOrAmountText;
  const amountText = usesSeparatedAccountFields
    ? hasPurchaseAccount
      ? maybeTrailingAmountText
      : maybeAmountText
    : hasPurchaseAccount
      ? maybeAccountHolderOrAmountText
      : accountChunkOrBankAccount;
  const trimmedAmountText = String(amountText ?? "").trim();
  const amount = trimmedAmountText ? parseAmount(trimmedAmountText) : null;
  const parsedAccount = usesSeparatedAccountFields
    ? allowPartial
      ? parseOptionalSeparatedAccountFields(bankName, bankAccount, accountHolder, lineNumber)
      : parseSeparatedAccountFields(bankName, bankAccount, accountHolder, lineNumber)
    : allowPartial
      ? parseOptionalAccountChunk(accountChunk, lineNumber)
      : parseAccountChunk(accountChunk, lineNumber);

  if (!allowPartial) {
    if (!orderNumber) {
      throw new Error(`${formatLinePrefix(lineNumber)}주문번호가 비어 있습니다.`);
    }

    if (!buyerName) {
      throw new Error(`${formatLinePrefix(lineNumber)}구매자가 비어 있습니다.`);
    }

    if (!recipientName) {
      throw new Error(`${formatLinePrefix(lineNumber)}수취인이 비어 있습니다.`);
    }

    if (contact.length < 8) {
      throw new Error(`${formatLinePrefix(lineNumber)}연락처 형식이 올바르지 않습니다.`);
    }

    if (!address) {
      throw new Error(`${formatLinePrefix(lineNumber)}주소가 비어 있습니다.`);
    }

    if (amount == null) {
      throw new Error(`${formatLinePrefix(lineNumber)}금액 형식이 올바르지 않습니다.`);
    }
  } else {
    if (trimmedContact && contact.length < 8) {
      throw new Error(`${formatLinePrefix(lineNumber)}연락처 형식이 올바르지 않습니다.`);
    }

    if (trimmedAmountText && amount == null) {
      throw new Error(`${formatLinePrefix(lineNumber)}금액 형식이 올바르지 않습니다.`);
    }
  }

  return {
    assign_name: assignName || "",
    order_number: orderNumber || "",
    buyer_name: buyerName || "",
    recipient_name: recipientName || "",
    purchase_account: purchaseAccount || "",
    contact,
    address: address || "",
    amount,
    review_fee: reviewFee,
    ...parsedAccount
  };
}

export function parsePurchaseBulkInput(rawText, options = {}) {
  const { allowAssignName = false } = options;
  const lines = normalizeLines(rawText);

  if (lines.length === 0) {
    throw new Error("일괄입력 텍스트를 입력해주세요.");
  }

  return lines.map((line, index) => {
    const entry = parsePurchaseLineParts(
      splitPurchaseLine(line),
      index + 1,
      { allowAssignName, allowPartial: false }
    );

    return {
      ...entry,
      purchase_account: entry.purchase_account || null
    };
  });
}

export function parseInlinePurchaseInput(rawText) {
  const lines = normalizeLines(rawText);

  if (lines.length === 0) {
    throw new Error("구매정보를 입력해주세요.");
  }

  if (lines.length > 1) {
    throw new Error("구매정보 빠른입력은 한 줄만 입력할 수 있습니다.");
  }

  return parsePurchaseLineParts(
    splitPurchaseLine(lines[0]),
    null,
    { allowAssignName: true, allowPartial: true }
  );
}

export function parseExistingRowPurchaseInfoInput(rawText) {
  const entry = parseInlinePurchaseInput(rawText);

  if (entry.assign_name) {
    throw new Error(buildPurchaseFormatMessage(false));
  }

  return entry;
}

export function isPurchaseBulkTargetRow(row) {
  return ![
    row.order_number,
    row.buyer_name,
    row.recipient_name,
    row.purchase_account,
    row.contact,
    row.address,
    row.bank_name,
    row.bank_account,
    row.account_holder,
    row.amount
  ].some(hasMeaningfulValue);
}

export function buildPurchaseBulkPreview(assignName, rawText, rows, options = {}) {
  const { allowCreateNewRows = true } = options;
  const trimmedAssignName = String(assignName ?? "").trim();

  if (!String(rawText ?? "").trim()) {
    if (!trimmedAssignName) {
      return {
        status: "idle",
        message: "배정명을 입력하거나 각 줄 첫 칸에 배정명을 포함하면 입력 가능한 빈 행을 찾습니다.",
        parsedEntries: [],
        targetRows: [],
        create_new_rows: false
      };
    }

    const matchedRows = rows.filter(
      (row) => !row.isNew && String(row.assign_name ?? "").trim() === trimmedAssignName
    );
    const availableRows = matchedRows.filter(isPurchaseBulkTargetRow);

    if (matchedRows.length === 0) {
      return {
        status: "idle",
        message: allowCreateNewRows
          ? `구매완료 섹션에서 "${trimmedAssignName}" 배정자를 찾지 못했습니다. 구매정보를 입력하면 새 행을 추가합니다.`
          : `현재 화면에서 "${trimmedAssignName}" 배정자를 찾지 못했습니다.`,
        parsedEntries: [],
        targetRows: [],
        create_new_rows: allowCreateNewRows
      };
    }

    return {
      status: "idle",
      message: `${trimmedAssignName} 배정자 중 입력 가능한 빈 행 ${availableRows.length}건`,
      parsedEntries: [],
      targetRows: availableRows,
      create_new_rows: false
    };
  }

  let parsedEntries;

  try {
    parsedEntries = parsePurchaseBulkInput(rawText, { allowAssignName: true });
  } catch (error) {
    return {
      status: "error",
      message: error.message || "일괄입력 형식을 확인해주세요.",
      parsedEntries: [],
      targetRows: [],
      create_new_rows: false
    };
  }

  const normalizedEntries = parsedEntries.map((entry) => ({
    ...entry,
    assign_name: String(entry.assign_name ?? "").trim() || trimmedAssignName
  }));
  const entriesWithoutAssign = normalizedEntries.filter((entry) => !entry.assign_name);

  if (entriesWithoutAssign.length > 0) {
    return {
      status: "error",
      message: "배정명을 입력하거나 각 줄 첫 칸에 배정명을 포함해주세요.",
      parsedEntries: normalizedEntries,
      targetRows: [],
      create_new_rows: false
    };
  }

  const availableRowsByAssignName = rows.reduce((acc, row) => {
    if (row.isNew || !isPurchaseBulkTargetRow(row)) {
      return acc;
    }

    const key = String(row.assign_name ?? "").trim();
    if (!key) {
      return acc;
    }

    if (!acc[key]) {
      acc[key] = [];
    }

    acc[key].push(row);
    return acc;
  }, {});

  const targetRows = normalizedEntries.map((entry) => {
    const key = entry.assign_name;
    const candidates = availableRowsByAssignName[key] ?? [];
    return candidates.shift() ?? null;
  });

  const missingEntries = normalizedEntries.filter((_, index) => !targetRows[index]);
  const createNewCount = missingEntries.length;

  if (createNewCount > 0 && !allowCreateNewRows) {
    const missingAssignNames = Array.from(new Set(missingEntries.map((entry) => entry.assign_name))).join(", ");
    return {
      status: "error",
      message: `입력 가능한 빈 행이 없는 배정자: ${missingAssignNames}`,
      parsedEntries: normalizedEntries,
      targetRows,
      create_new_rows: false
    };
  }

  if (createNewCount > 0) {
    const matchedCount = normalizedEntries.length - createNewCount;
    const message =
      matchedCount > 0
        ? `기존 빈 행 ${matchedCount}건에 입력되고 새 행 ${createNewCount}건이 추가됩니다.`
        : `새 행 ${createNewCount}건이 추가됩니다.`;

    return {
      status: "ready",
      message,
      parsedEntries: normalizedEntries,
      targetRows,
      create_new_rows: true
    };
  }

  const uniqueAssignNames = Array.from(new Set(normalizedEntries.map((entry) => entry.assign_name)));
  const summaryLabel =
    uniqueAssignNames.length === 1 ? `${uniqueAssignNames[0]} 배정자` : `배정자 ${uniqueAssignNames.length}명`;

  return {
    status: "ready",
    message: `${summaryLabel}의 빈 행 ${normalizedEntries.length}건에 입력됩니다.`,
    parsedEntries: normalizedEntries,
    targetRows,
    create_new_rows: false
  };
}

export function buildSelectedPurchaseBulkPreview(rawText, rows) {
  const selectedRows = rows.filter((row) => !row.isNew);
  const availableRows = selectedRows.filter(isPurchaseBulkTargetRow);

  if (selectedRows.length === 0) {
    return {
      status: "idle",
      message: "선택한 행이 없습니다.",
      parsedEntries: [],
      targetRows: [],
      create_new_rows: false
    };
  }

  if (!String(rawText ?? "").trim()) {
    return {
      status: "idle",
      message: `선택한 행 ${selectedRows.length}건 중 입력 가능한 빈 행 ${availableRows.length}건`,
      parsedEntries: [],
      targetRows: availableRows,
      create_new_rows: false
    };
  }

  let parsedEntries;

  try {
    parsedEntries = parsePurchaseBulkInput(rawText, { allowAssignName: true });
  } catch (error) {
    return {
      status: "error",
      message: error.message || "일괄입력 형식을 확인해주세요.",
      parsedEntries: [],
      targetRows: [],
      create_new_rows: false
    };
  }

  if (availableRows.length < parsedEntries.length) {
    return {
      status: "error",
      message: `선택한 행(빈 행): ${availableRows.length}건, 입력된 갯수: ${parsedEntries.length}개`,
      parsedEntries,
      targetRows: availableRows,
      create_new_rows: false
    };
  }

  return {
    status: "ready",
    message: `선택한 빈 행 ${parsedEntries.length}건에 입력됩니다.`,
    parsedEntries,
    targetRows: availableRows.slice(0, parsedEntries.length),
    create_new_rows: false
  };
}

export function parsePurchaseAssignLines(rawText) {
  const lines = normalizeLines(rawText);

  if (lines.length === 0) {
    throw new Error("구매자 일괄 입력 텍스트를 입력해주세요.");
  }

  const normalizeExplicitAssignName = (value) => {
    const tokens = value.trim().split(/\s+/);

    if (tokens.length >= 2 && /^\d+$/.test(tokens[tokens.length - 1])) {
      return tokens.slice(0, -1).join(" ");
    }

    return value.trim();
  };

  return lines.map((line, index) => {
    const matched = line.match(/^(\d+)\s+(.+)$/);

    if (!matched) {
      const assignName = line.trim();

      if (!assignName) {
        throw new Error(`${index + 1}번째 입력: 배정명이 비어 있습니다.`);
      }

      return {
        row_number: null,
        assign_name: assignName,
        has_explicit_row_number: false
      };
    }

    const assignName = normalizeExplicitAssignName(matched[2]);

    if (!assignName) {
      throw new Error(`${index + 1}번째 입력: 배정명이 비어 있습니다.`);
    }

    return {
      row_number: Number(matched[1]),
      assign_name: assignName,
      has_explicit_row_number: true
    };
  });
}

export function buildPurchaseAssignPreview(rawText, rowByNumberMap, maxRowNumber) {
  if (!String(rawText ?? "").trim()) {
    return { entries: [], errorMessage: "", summaryMessage: "" };
  }

  try {
    const parsedEntries = parsePurchaseAssignLines(rawText);
    const overlappingEntries = parsedEntries.filter(
      (entry) => entry.row_number != null && rowByNumberMap[entry.row_number]
    );

    const entries = parsedEntries.map((entry, index) => {
      const overwriteTarget = entry.row_number != null ? rowByNumberMap[entry.row_number] ?? null : null;

      return {
        ...entry,
        append_row_number: maxRowNumber + index + 1,
        overwrite_target: overwriteTarget
      };
    });

    let summaryMessage = `${parsedEntries.length}건이 처리됩니다.`;

    if (parsedEntries.every((entry) => !entry.has_explicit_row_number)) {
      summaryMessage = `${maxRowNumber + 1}번부터 순서대로 ${parsedEntries.length}건이 추가됩니다.`;
    } else if (overlappingEntries.length > 0) {
      summaryMessage =
        "기존 순번과 겹치는 입력이 있습니다. 완료 시 덮어쓰기 또는 다음 순번 추가 중 하나를 선택합니다.";
    } else {
      summaryMessage = `${maxRowNumber + 1}번부터 ${parsedEntries.length}건이 새 행으로 추가됩니다.`;
    }

    return { entries, errorMessage: "", summaryMessage };
  } catch (error) {
    return {
      entries: [],
      errorMessage: error.message || "구매자 일괄 입력 형식을 확인해주세요.",
      summaryMessage: ""
    };
  }
}
