import * as XLSX from "xlsx";
import {
  FILE_UPLOAD_COLUMNS,
  buildFileUploadProductTitle,
  createFileUploadIssue,
  isBlankCell,
  normalizeCellText,
  parseFileUploadAccount,
  parseFileUploadAmount,
  parseFileUploadBoolean,
  parseFileUploadDate,
  resolveFileUploadIsRealShipping,
  validateFileUploadHeaders
} from "./fileUploadValidation.js";

const COLUMN_BY_KEY = FILE_UPLOAD_COLUMNS.reduce((acc, column) => {
  acc[column.key] = column;
  return acc;
}, {});

const PRODUCT_FIELD_KEYS = [
  "deposit_date",
  "company_name"
];

const SUBMISSION_VALUE_KEYS = [
  "assign_name",
  "order_number",
  "buyer_name",
  "recipient_name",
  "purchase_account",
  "contact",
  "address",
  "account",
  "amount",
  "review_fee"
];

const BLOCKING_ERROR_CODES = new Set(["EMPTY_WORKBOOK", "HEADER_MISMATCH"]);

function getCell(row, key) {
  return row[COLUMN_BY_KEY[key].index];
}

function buildRawRow(row) {
  return FILE_UPLOAD_COLUMNS.reduce((acc, column) => {
    acc[column.key] = row[column.index] ?? "";
    return acc;
  }, {});
}

function addIssue(issues, issue) {
  issues.push(createFileUploadIssue(issue));
}

function hasSubmissionValues(row) {
  return SUBMISSION_VALUE_KEYS.some((key) => !isBlankCell(getCell(row, key)));
}

function isProductStartNumber(value) {
  const text = normalizeCellText(value);

  return text === "1" || text === "1.0";
}

function parseDataRow(row, rowNumber) {
  const errors = [];
  const depositDate = parseFileUploadDate(getCell(row, "deposit_date"));
  const amount = parseFileUploadAmount(getCell(row, "amount"));
  const reviewFee = parseFileUploadAmount(getCell(row, "review_fee"));
  const isReviewVerified = parseFileUploadBoolean(getCell(row, "is_review_verified"));
  const isDepositVerified = parseFileUploadBoolean(getCell(row, "is_deposit_verified"));
  const depositedAt = parseFileUploadDate(getCell(row, "deposited_at"));
  const account = parseFileUploadAccount(getCell(row, "account"));
  const productName = normalizeCellText(getCell(row, "product_name"));
  const orderNumber = normalizeCellText(getCell(row, "order_number"));
  const hasSubmissionData = hasSubmissionValues(row);

  if (depositDate.error) {
    addIssue(errors, {
      rowNumber,
      column: "A",
      code: "INVALID_DEPOSIT_DATE",
      message: depositDate.error
    });
  }

  if (!productName) {
    addIssue(errors, {
      rowNumber,
      column: "F",
      code: "MISSING_PRODUCT_NAME",
      message: "품명이 비어 있습니다."
    });
  }

  if (hasSubmissionData && !orderNumber) {
    addIssue(errors, {
      rowNumber,
      column: "J",
      code: "MISSING_ORDER_NUMBER",
      message: "주문번호가 비어 있습니다."
    });
  }

  if (account.error) {
    addIssue(errors, {
      rowNumber,
      column: "P",
      code: "INVALID_ACCOUNT",
      message: account.error
    });
  }

  if (amount.error) {
    addIssue(errors, {
      rowNumber,
      column: "Q",
      code: "INVALID_AMOUNT",
      message: amount.error
    });
  }

  if (reviewFee.error) {
    addIssue(errors, {
      rowNumber,
      column: "R",
      code: "INVALID_REVIEW_FEE",
      message: reviewFee.error
    });
  }

  if (isReviewVerified.error) {
    addIssue(errors, {
      rowNumber,
      column: "T",
      code: "INVALID_REVIEW_STATUS",
      message: isReviewVerified.error
    });
  }

  if (isDepositVerified.error) {
    addIssue(errors, {
      rowNumber,
      column: "U",
      code: "INVALID_DEPOSIT_STATUS",
      message: isDepositVerified.error
    });
  }

  return {
    rowNumber,
    raw: buildRawRow(row),
    isProductStart: isProductStartNumber(getCell(row, "numbering")),
    productValues: {
      deposit_date: depositDate.value,
      company_name: normalizeCellText(getCell(row, "company_name")) || null,
      product_name: productName || null,
      option_name: normalizeCellText(getCell(row, "option_name")) || null,
      review_type: normalizeCellText(getCell(row, "review_type")) || null,
      planned_depositor_name: normalizeCellText(getCell(row, "planned_depositor_name")) || null
    },
    submissionPayload: hasSubmissionData
      ? {
          assign_name: normalizeCellText(getCell(row, "assign_name")) || null,
          order_number: orderNumber || null,
          buyer_name: normalizeCellText(getCell(row, "buyer_name")) || null,
          recipient_name: normalizeCellText(getCell(row, "recipient_name")) || null,
          purchase_account: normalizeCellText(getCell(row, "purchase_account")) || null,
          contact: normalizeCellText(getCell(row, "contact")).replace(/\D/g, "") || null,
          address: normalizeCellText(getCell(row, "address")) || null,
          bank_name: account.value?.bank_name ?? null,
          bank_account: account.value?.bank_account ?? null,
          account_holder: account.value?.account_holder ?? null,
          amount: amount.value,
          review_fee: reviewFee.value,
          is_review_verified: isReviewVerified.value,
          is_deposit_verified: isDepositVerified.value,
          deposited_at: depositedAt.value,
          actual_depositor_name: normalizeCellText(getCell(row, "actual_depositor_name")) || null
        }
      : null,
    errors
  };
}

function buildProductPayload(rows, adminId) {
  const firstRow = rows[0];
  const firstValues = firstRow.productValues;
  const reviewFees = rows.map((row) => row.submissionPayload?.review_fee).filter((value) => value != null);
  const reviewType = rows.map((row) => row.productValues.review_type).filter(Boolean).join(" ");
  const plannedDepositorNames = Array.from(
    new Set(rows.map((row) => row.productValues.planned_depositor_name).filter(Boolean))
  );

  return {
    manager_id: adminId,
    title: buildFileUploadProductTitle(firstValues),
    ...firstValues,
    planned_depositor_name: plannedDepositorNames.length === 1 ? plannedDepositorNames[0] : null,
    is_real_shipping: resolveFileUploadIsRealShipping({
      reviewType,
      reviewFees
    })
  };
}

function findProductFieldWarnings(rows, clientProductKey) {
  const warnings = [];
  const firstValues = rows[0]?.productValues ?? {};

  rows.slice(1).forEach((row) => {
    PRODUCT_FIELD_KEYS.forEach((fieldKey) => {
      if ((row.productValues[fieldKey] ?? null) !== (firstValues[fieldKey] ?? null)) {
        const column = COLUMN_BY_KEY[fieldKey];

        addIssue(warnings, {
          rowNumber: row.rowNumber,
          column: column?.letter ?? "",
          code: "PRODUCT_FIELD_MISMATCH",
          message: `${clientProductKey} 안에서 ${column?.header ?? fieldKey} 값이 첫 행과 다릅니다. 상품 값은 첫 행 기준으로 사용됩니다.`
        });
      }
    });
  });

  return warnings;
}

function groupRowsIntoProducts(rows, adminId) {
  const products = [];
  let currentRows = [];

  rows.forEach((row) => {
    if (currentRows.length > 0 && row.isProductStart) {
      products.push(currentRows);
      currentRows = [];
    }

    currentRows.push(row);
  });

  if (currentRows.length > 0) {
    products.push(currentRows);
  }

  return products.map((productRows, index) => {
    const clientProductKey = `product-${index + 1}`;

    return {
      clientProductKey,
      sourceRowNumbers: productRows.map((row) => row.rowNumber),
      payload: buildProductPayload(productRows, adminId),
      submissions: productRows
        .filter((row) => row.submissionPayload)
        .map((row) => ({
          clientProductKey,
          sourceRowNumber: row.rowNumber,
          payload: row.submissionPayload,
          errors: row.errors
        })),
      warnings: findProductFieldWarnings(productRows, clientProductKey)
    };
  });
}

function findDuplicateOrderNumberErrors(rows) {
  const rowsByOrderNumber = rows.reduce((acc, row) => {
    const orderNumber = row.submissionPayload?.order_number;

    if (!orderNumber) {
      return acc;
    }

    if (!acc.has(orderNumber)) {
      acc.set(orderNumber, []);
    }

    acc.get(orderNumber).push(row);
    return acc;
  }, new Map());

  return Array.from(rowsByOrderNumber.entries()).flatMap(([orderNumber, duplicateRows]) => {
    if (duplicateRows.length <= 1) {
      return [];
    }

    return duplicateRows.map((row) =>
      createFileUploadIssue({
        rowNumber: row.rowNumber,
        column: "J",
        code: "DUPLICATE_ORDER_NUMBER_IN_FILE",
        message: `파일 안에서 주문번호 '${orderNumber}'가 중복되었습니다.`
      })
    );
  });
}

export function parseFileUploadRows(rows, options = {}) {
  const { adminId = null, sheetName = "" } = options;
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const headerRow = normalizedRows[0] ?? [];
  const headerErrors = validateFileUploadHeaders(headerRow);
  const dataRows = normalizedRows.slice(1);
  const skippedRows = [];
  const parsedRows = [];

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;

    if (isBlankCell(getCell(row, "deposit_date"))) {
      skippedRows.push({
        rowNumber,
        reason: "A열 날짜가 비어 있어 스킵했습니다."
      });
      return;
    }

    parsedRows.push(parseDataRow(row, rowNumber));
  });

  const duplicateOrderNumberErrors = findDuplicateOrderNumberErrors(parsedRows);
  const products = groupRowsIntoProducts(parsedRows, adminId);
  const rowErrors = parsedRows.flatMap((row) => row.errors);
  const warnings = products.flatMap((product) => product.warnings);
  const errors = [...headerErrors, ...rowErrors, ...duplicateOrderNumberErrors];
  const submissions = products.flatMap((product) => product.submissions);

  return {
    adminId,
    sheetName,
    headerRaw: buildRawRow(headerRow),
    rows: parsedRows,
    skippedRows,
    products,
    submissions,
    errors,
    warnings,
    summary: {
      totalRows: Math.max(normalizedRows.length - 1, 0),
      parsedRows: parsedRows.length,
      skippedRows: skippedRows.length,
      productCount: products.length,
      submissionCount: submissions.length,
      errorCount: errors.length,
      warningCount: warnings.length
    }
  };
}

export function buildUploadableFileUploadResult(parseResult) {
  const errors = parseResult?.errors ?? [];
  const blockingErrors = errors.filter((error) => BLOCKING_ERROR_CODES.has(error.code));
  const excludedRowNumbers = new Set(
    errors
      .map((error) => error.rowNumber)
      .filter((rowNumber) => Number.isInteger(rowNumber) && rowNumber > 1)
  );

  if (blockingErrors.length > 0) {
    return {
      adminId: parseResult?.adminId ?? null,
      sheetName: parseResult?.sheetName ?? "",
      headerRaw: parseResult?.headerRaw ?? null,
      rows: [],
      skippedRows: parseResult?.skippedRows ?? [],
      products: [],
      submissions: [],
      errors: blockingErrors,
      warnings: [],
      excludedRowNumbers,
      blockingErrors,
      summary: {
        totalRows: parseResult?.summary?.totalRows ?? 0,
        parsedRows: 0,
        skippedRows: parseResult?.summary?.skippedRows ?? 0,
        productCount: 0,
        submissionCount: 0,
        errorCount: blockingErrors.length,
        warningCount: 0,
        excludedRowCount: excludedRowNumbers.size,
        blockingErrorCount: blockingErrors.length
      }
    };
  }

  const adminId = parseResult?.adminId ?? parseResult?.products?.[0]?.payload?.manager_id ?? null;
  const rowByNumber = new Map((parseResult?.rows ?? []).map((row) => [row.rowNumber, row]));
  const products = (parseResult?.products ?? [])
    .map((product) => {
      const productRows = product.sourceRowNumbers
        .map((rowNumber) => rowByNumber.get(rowNumber))
        .filter((row) => row && !excludedRowNumbers.has(row.rowNumber));

      return {
        clientProductKey: product.clientProductKey,
        sourceRowNumbers: productRows.map((row) => row.rowNumber),
        payload: productRows.length > 0 ? buildProductPayload(productRows, adminId) : product.payload,
        submissions: productRows
          .filter((row) => row.submissionPayload)
          .map((row) => ({
            clientProductKey: product.clientProductKey,
            sourceRowNumber: row.rowNumber,
            payload: row.submissionPayload,
            errors: []
          })),
        warnings: productRows.length > 0 ? findProductFieldWarnings(productRows, product.clientProductKey) : []
      };
    })
    .filter((product) => product.submissions.length > 0);
  const warnings = products.flatMap((product) => product.warnings);
  const submissions = products.flatMap((product) => product.submissions);
  const uploadableRows = products.flatMap((product) =>
    product.sourceRowNumbers.map((rowNumber) => rowByNumber.get(rowNumber)).filter(Boolean)
  );

  return {
    adminId,
    sheetName: parseResult?.sheetName ?? "",
    headerRaw: parseResult?.headerRaw ?? null,
    rows: uploadableRows,
    skippedRows: parseResult?.skippedRows ?? [],
    products,
    submissions,
    errors: [],
    warnings,
    excludedRowNumbers,
    blockingErrors: [],
    summary: {
      totalRows: parseResult?.summary?.totalRows ?? 0,
      parsedRows: uploadableRows.length,
      skippedRows: parseResult?.summary?.skippedRows ?? 0,
      productCount: products.length,
      submissionCount: submissions.length,
      errorCount: 0,
      warningCount: warnings.length,
      excludedRowCount: excludedRowNumbers.size,
      blockingErrorCount: 0
    }
  };
}

export function parseFileUploadWorkbook(workbook, options = {}) {
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return {
      sheetName: "",
      headerRaw: null,
      rows: [],
      skippedRows: [],
      products: [],
      submissions: [],
      errors: [
        createFileUploadIssue({
          code: "EMPTY_WORKBOOK",
          message: "Excel 파일에 시트가 없습니다."
        })
      ],
      warnings: [],
      summary: {
        totalRows: 0,
        parsedRows: 0,
        skippedRows: 0,
        productCount: 0,
        submissionCount: 0,
        errorCount: 1,
        warningCount: 0
      }
    };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: true
  });

  return parseFileUploadRows(rows, {
    ...options,
    sheetName: firstSheetName
  });
}

export function parseFileUploadArrayBuffer(arrayBuffer, options = {}) {
  const workbook = XLSX.read(arrayBuffer, {
    type: "array",
    cellDates: true
  });

  return parseFileUploadWorkbook(workbook, options);
}

export async function parseFileUploadFile(file, options = {}) {
  const arrayBuffer = await file.arrayBuffer();

  return parseFileUploadArrayBuffer(arrayBuffer, options);
}
