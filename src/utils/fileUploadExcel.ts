// @ts-nocheck

import * as XLSX from "xlsx";
import { createFileUploadIssue } from "@/utils/fileUploadValidation";
import { parseFileUploadRows } from "@/utils/fileUploadParser";

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
