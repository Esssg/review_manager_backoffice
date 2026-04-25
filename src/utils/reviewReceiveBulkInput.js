function parseAmount(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function hasMeaningfulValue(value) {
  if (typeof value === "number") {
    return true;
  }

  return String(value ?? "").trim().length > 0;
}

function normalizeLines(rawText) {
  return String(rawText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseAccountChunk(accountChunk, lineNumber) {
  if (accountChunk.includes("/")) {
    throw new Error(
      `${lineNumber}번째 입력: 계좌 정보는 '은행 계좌번호 입금주' 형식이어야 합니다. '/'는 사용할 수 없습니다.`
    );
  }

  const accountParts = accountChunk.split(/\s+/).filter(Boolean);

  if (accountParts.length < 3) {
    throw new Error(
      `${lineNumber}번째 입력: 계좌 정보는 '은행 계좌번호 입금주' 형식이어야 합니다.`
    );
  }

  return {
    bank_name: accountParts[0],
    bank_account: accountParts[1],
    account_holder: accountParts.slice(2).join(" ")
  };
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

export function parsePurchaseBulkInput(rawText) {
  const lines = normalizeLines(rawText);

  if (lines.length === 0) {
    throw new Error("일괄입력 텍스트를 입력해주세요.");
  }

  return lines.map((line, index) => {
    const lineNumber = index + 1;
    const parts = line.split("/").map((part) => part.trim());

    if (parts.length !== 7 && parts.length !== 8) {
      throw new Error(
        `${lineNumber}번째 입력: '주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액' 또는 '주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액' 형식으로 입력해주세요.`
      );
    }

    const hasPurchaseAccount = parts.length === 8;
    const [
      orderNumber,
      buyerName,
      recipientName,
      purchaseAccountOrContact,
      contactOrAddress,
      addressOrAccountChunk,
      accountChunkOrAmountText,
      maybeAmountText
    ] = parts;
    const purchaseAccount = hasPurchaseAccount ? purchaseAccountOrContact : null;
    const contactText = hasPurchaseAccount ? contactOrAddress : purchaseAccountOrContact;
    const address = hasPurchaseAccount ? addressOrAccountChunk : contactOrAddress;
    const accountChunk = hasPurchaseAccount ? accountChunkOrAmountText : addressOrAccountChunk;
    const amountText = hasPurchaseAccount ? maybeAmountText : accountChunkOrAmountText;
    const contact = contactText.replace(/\D/g, "");
    const amount = parseAmount(amountText);

    if (!orderNumber) {
      throw new Error(`${lineNumber}번째 입력: 주문번호가 비어 있습니다.`);
    }

    if (!buyerName) {
      throw new Error(`${lineNumber}번째 입력: 구매자가 비어 있습니다.`);
    }

    if (!recipientName) {
      throw new Error(`${lineNumber}번째 입력: 수취인이 비어 있습니다.`);
    }

    if (contact.length < 8) {
      throw new Error(`${lineNumber}번째 입력: 연락처 형식이 올바르지 않습니다.`);
    }

    if (!address) {
      throw new Error(`${lineNumber}번째 입력: 주소가 비어 있습니다.`);
    }

    if (amount == null) {
      throw new Error(`${lineNumber}번째 입력: 금액 형식이 올바르지 않습니다.`);
    }

    return {
      order_number: orderNumber,
      buyer_name: buyerName,
      recipient_name: recipientName,
      purchase_account: purchaseAccount || null,
      contact,
      address,
      amount,
      ...parseAccountChunk(accountChunk, lineNumber)
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

  const parts = lines[0].split("/").map((part) => part.trim());

  const startsWithOrderNumber = /^\d+$/.test(parts[0] ?? "");

  if (
    (startsWithOrderNumber && parts.length !== 7 && parts.length !== 8) ||
    (!startsWithOrderNumber && parts.length !== 8 && parts.length !== 9)
  ) {
    throw new Error(
      startsWithOrderNumber
        ? "'주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액' 또는 '주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액' 형식으로 입력해주세요."
        : "'배정명 / 주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액' 또는 '배정명 / 주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액' 형식으로 입력해주세요."
    );
  }

  const hasAssignName = !startsWithOrderNumber;
  const assignName = hasAssignName ? parts[0] : "";
  const offset = hasAssignName ? 1 : 0;
  const hasPurchaseAccount = parts.length - offset === 8;
  const [
    orderNumber,
    buyerName,
    recipientName,
    purchaseAccountOrContact,
    contactOrAddress,
    addressOrAccountChunk,
    accountChunkOrAmountText,
    maybeAmountText
  ] = parts.slice(offset);
  const purchaseAccount = hasPurchaseAccount ? purchaseAccountOrContact : "";
  const contactText = hasPurchaseAccount ? contactOrAddress : purchaseAccountOrContact;
  const address = hasPurchaseAccount ? addressOrAccountChunk : contactOrAddress;
  const accountChunk = hasPurchaseAccount ? accountChunkOrAmountText : addressOrAccountChunk;
  const amountText = hasPurchaseAccount ? maybeAmountText : accountChunkOrAmountText;
  const trimmedContact = String(contactText ?? "").trim();
  const contact = trimmedContact ? trimmedContact.replace(/\D/g, "") : "";

  if (trimmedContact && contact.length < 8) {
    throw new Error("연락처 형식이 올바르지 않습니다.");
  }

  const trimmedAmountText = String(amountText ?? "").trim();
  const amount = trimmedAmountText ? parseAmount(trimmedAmountText) : null;

  if (trimmedAmountText && amount == null) {
    throw new Error("금액 형식이 올바르지 않습니다.");
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
    ...parseOptionalAccountChunk(accountChunk, 1)
  };
}

export function parseExistingRowPurchaseInfoInput(rawText) {
  const entry = parseInlinePurchaseInput(rawText);

  if (entry.assign_name) {
    throw new Error(
      "'주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액' 또는 '주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액' 형식으로 입력해주세요."
    );
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

  if (!trimmedAssignName) {
    return {
      status: "idle",
      message: "배정명을 입력하면 입력 가능한 빈 행을 찾습니다.",
      parsedEntries: [],
      targetRows: [],
      create_new_rows: false
    };
  }

  const matchedRows = rows.filter(
    (row) => !row.isNew && String(row.assign_name ?? "").trim() === trimmedAssignName
  );

  const availableRows = matchedRows.filter(isPurchaseBulkTargetRow);

  if (!String(rawText ?? "").trim()) {
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
    parsedEntries = parsePurchaseBulkInput(rawText);
  } catch (error) {
    return {
      status: "error",
      message: error.message || "일괄입력 형식을 확인해주세요.",
      parsedEntries: [],
      targetRows: [],
      create_new_rows: false
    };
  }

  if (matchedRows.length === 0) {
    return {
      status: allowCreateNewRows ? "ready" : "error",
      message: allowCreateNewRows
        ? `"${trimmedAssignName}" 배정자가 없어 새 행 ${parsedEntries.length}건이 추가됩니다.`
        : `현재 화면에서 "${trimmedAssignName}" 배정자를 찾지 못했습니다.`,
      parsedEntries,
      targetRows: [],
      create_new_rows: allowCreateNewRows
    };
  }

  if (availableRows.length < parsedEntries.length) {
    return {
      status: "error",
      message: `${trimmedAssignName} 배정자(빈 행): ${availableRows.length}명, 입력된 갯수: ${parsedEntries.length}개`,
      parsedEntries,
      targetRows: availableRows,
      create_new_rows: false
    };
  }

  return {
    status: "ready",
    message: `${trimmedAssignName} 배정자 중 빈 행 ${parsedEntries.length}건에 입력됩니다.`,
    parsedEntries,
    targetRows: availableRows.slice(0, parsedEntries.length),
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
    parsedEntries = parsePurchaseBulkInput(rawText);
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

    const assignName = matched[2].trim();

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
