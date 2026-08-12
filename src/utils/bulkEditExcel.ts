// @ts-nocheck

import {
  normalizeCellText,
  parseFileUploadAmount,
  parseFileUploadBoolean,
  parseFileUploadDate
} from "@/utils/fileUploadValidation";
import { loadXlsx } from "@/utils/loadXlsx";

export const BULK_EDIT_COLUMNS = [
  { key: "assign_name", label: "배정명", type: "text" },
  { key: "order_number", label: "주문번호", type: "text" },
  { key: "buyer_name", label: "구매자", type: "text" },
  { key: "recipient_name", label: "수취인", type: "text" },
  { key: "purchase_account", label: "구매계정", type: "text" },
  { key: "contact", label: "연락처", type: "text" },
  { key: "address", label: "주소", type: "text" },
  { key: "bank_name", label: "은행", type: "text" },
  { key: "bank_account", label: "계좌번호", type: "text" },
  { key: "account_holder", label: "예금주", type: "text" },
  { key: "amount", label: "금액", type: "number" },
  { key: "review_fee", label: "리뷰비", type: "number" },
  { key: "is_review_verified", label: "리뷰완료", type: "boolean" },
  { key: "is_deposit_verified", label: "입금완료", type: "boolean" },
  { key: "deposited_at", label: "입금일", type: "date" },
  { key: "actual_depositor_name", label: "실제입금자명", type: "text" }
];

export const BULK_EDIT_ID_HEADER = "제출 ID";
export const BULK_EDIT_HEADERS = [BULK_EDIT_ID_HEADER, ...BULK_EDIT_COLUMNS.map((column) => column.label)];
export const BULK_EDIT_EXCEL_GUIDE_ROWS = [
  ["1. 제출 ID 열 절대 수정 금지"],
  ["2. 필터 걸어서 정렬, 필터링 가능 / 2-1. 필터 걸어서 숨겨진 행도 모두 적용됨 (주의)"]
];

function normalizeNullableText(value) {
  return normalizeCellText(value) || null;
}

function parseSubmissionId(value) {
  const text = normalizeCellText(value);

  if (!/^\d+$/.test(text) || Number(text) < 1 || !Number.isSafeInteger(Number(text))) {
    return { value: null, error: "제출 ID는 1 이상의 정수여야 합니다." };
  }

  return { value: Number(text), error: null };
}

function parseBulkEditValue(value, column) {
  if (column.type === "text") {
    return { value: normalizeNullableText(value), error: null };
  }

  if (column.type === "number") {
    return parseFileUploadAmount(value);
  }

  if (column.type === "date") {
    return parseFileUploadDate(value);
  }

  return parseFileUploadBoolean(value);
}

function normalizeCurrentValue(value, column) {
  if (column.type === "text") {
    return value == null || value === "" ? null : String(value).trim();
  }

  if (column.type === "number") {
    return value == null || value === "" ? null : Number(value);
  }

  if (column.type === "boolean") {
    return Boolean(value);
  }

  return value || null;
}

function hasSameValue(left, right) {
  return left === right || (Number.isNaN(left) && Number.isNaN(right));
}

export function formatBulkEditValue(value, column) {
  if (value == null || value === "") return "-";
  if (column.type === "boolean") return value ? "예" : "아니오";
  return String(value);
}

export function buildBulkEditExcelRows(rows) {
  return rows.map((row) =>
    BULK_EDIT_COLUMNS.reduce(
      (excelRow, column) => {
        excelRow[column.label] =
          column.type === "boolean" ? (row[column.key] ? "TRUE" : "FALSE") : row[column.key] ?? "";
        return excelRow;
      },
      { [BULK_EDIT_ID_HEADER]: row.submission_id }
    )
  );
}

function isBulkEditHeaderRow(row = []) {
  return row.length === BULK_EDIT_HEADERS.length && row.every((value, index) => normalizeCellText(value) === BULK_EDIT_HEADERS[index]);
}

export async function parseBulkEditExcelFile(file) {
  if (!file) {
    throw new Error("업로드할 Excel 파일을 선택해주세요.");
  }

  const XLSX = await loadXlsx();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("읽을 수 있는 시트가 없습니다.");
  }

  const sheet = workbook.Sheets[sheetName];
  const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const headerRowIndex = values.findIndex((row, index) => index <= BULK_EDIT_EXCEL_GUIDE_ROWS.length && isBulkEditHeaderRow(row));
  const errors = [];

  if (headerRowIndex < 0) {
    errors.push({ rowNumber: 3, column: "", message: `헤더는 '${BULK_EDIT_HEADERS.join(" | ")}' 순서여야 합니다.` });
  }

  const rows = values.slice(headerRowIndex >= 0 ? headerRowIndex + 1 : 0).reduce((result, rawRow, index) => {
    const rowNumber = index + (headerRowIndex >= 0 ? headerRowIndex + 2 : 1);

    if (rawRow.every((value) => normalizeCellText(value) === "")) {
      return result;
    }

    const idResult = parseSubmissionId(rawRow[0]);
    const rowErrors = idResult.error ? [{ rowNumber, column: BULK_EDIT_ID_HEADER, message: idResult.error }] : [];
    const valuesByKey = {};

    BULK_EDIT_COLUMNS.forEach((column, columnIndex) => {
      const parsed = parseBulkEditValue(rawRow[columnIndex + 1], column);
      valuesByKey[column.key] = parsed.value;

      if (parsed.error) {
        rowErrors.push({ rowNumber, column: column.label, message: parsed.error });
      }
    });

    errors.push(...rowErrors);
    result.push({ rowNumber, submissionId: idResult.value, values: valuesByKey });
    return result;
  }, []);

  const seenIds = new Set();
  rows.forEach((row) => {
    if (!row.submissionId) return;
    if (seenIds.has(row.submissionId)) {
      errors.push({ rowNumber: row.rowNumber, column: BULK_EDIT_ID_HEADER, message: "제출 ID가 중복되었습니다." });
      return;
    }
    seenIds.add(row.submissionId);
  });

  if (rows.length === 0) {
    errors.push({ rowNumber: null, column: "", message: "업로드할 데이터 행이 없습니다." });
  }

  return { fileName: file.name, rows, errors };
}

export function buildBulkEditChangeSet(parsedRows, currentRows) {
  const currentRowById = new Map((currentRows ?? []).map((row) => [Number(row.submission_id), row]));
  const errors = [];
  const changes = [];

  parsedRows.forEach((parsedRow) => {
    const currentRow = currentRowById.get(parsedRow.submissionId);

    if (!currentRow) {
      errors.push({
        rowNumber: parsedRow.rowNumber,
        column: BULK_EDIT_ID_HEADER,
        message: "같은 회사에서 수정 가능한 제출 데이터를 찾지 못했습니다."
      });
      return;
    }

    const fields = BULK_EDIT_COLUMNS.flatMap((column) => {
      const previousValue = normalizeCurrentValue(currentRow[column.key], column);
      const nextValue = parsedRow.values[column.key];

      if (hasSameValue(previousValue, nextValue)) return [];

      return [{ key: column.key, label: column.label, column, previousValue, nextValue }];
    });

    if (fields.length > 0) {
      changes.push({
        rowNumber: parsedRow.rowNumber,
        submissionId: parsedRow.submissionId,
        productId: currentRow.product_id,
        assignName: currentRow.assign_name,
        orderNumber: currentRow.order_number,
        fields,
        payload: fields.reduce((payload, field) => ({ ...payload, [field.key]: field.nextValue }), {})
      });
    }
  });

  return { errors, changes };
}

export function hasBulkEditDepositChanges(changes) {
  const depositKeys = new Set(["is_deposit_verified", "deposited_at", "actual_depositor_name"]);
  return changes.some((change) => change.fields.some((field) => depositKeys.has(field.key)));
}
