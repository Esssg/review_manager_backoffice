// @ts-nocheck

export function createFileUploadResult() {
  return {
    createdProducts: [],
    insertedSubmissions: [],
    updatedSubmissions: [],
    errors: []
  };
}

export function finalizeFileUploadResult(result) {
  return {
    ...result,
    summary: {
      createdProductCount: result.createdProducts.length,
      insertedSubmissionCount: result.insertedSubmissions.length,
      updatedSubmissionCount: result.updatedSubmissions.length,
      errorCount: result.errors.length
    }
  };
}

export function buildFileUploadFailureResult(error) {
  return finalizeFileUploadResult({
    ...createFileUploadResult(),
    errors: [
      {
        rowNumber: null,
        column: "",
        code: "UPLOAD_FAILED",
        message: error?.message ?? "DB 반영 중 오류가 발생했습니다."
      }
    ]
  });
}

function toOrderNumberKey(orderNumber) {
  return orderNumber == null ? "" : String(orderNumber);
}

function buildDuplicateOrderNumberError(orderNumber) {
  const error = new Error(`주문번호 '${orderNumber}'에 해당하는 제출 데이터가 여러 건입니다.`);
  error.code = "DUPLICATE_ORDER_NUMBER_IN_DB";
  return error;
}

export function buildSubmissionLookup(rows = []) {
  const rowsByOrderNumber = rows.reduce((lookup, row) => {
    const key = toOrderNumberKey(row?.order_number);

    if (!key) {
      return lookup;
    }

    const matchingRows = lookup.get(key) ?? [];
    matchingRows.push(row);
    lookup.set(key, matchingRows);
    return lookup;
  }, new Map());

  return new Map(
    Array.from(rowsByOrderNumber.entries()).map(([orderNumber, matchingRows]) => [
      orderNumber,
      matchingRows.length === 1
        ? { data: matchingRows[0], error: null }
        : { data: null, error: buildDuplicateOrderNumberError(orderNumber) }
    ])
  );
}

export function getSubmissionLookupResult(lookup, orderNumber) {
  const key = toOrderNumberKey(orderNumber);

  if (!key) {
    return { data: null, error: null };
  }

  return lookup.get(key) ?? { data: null, error: null };
}
