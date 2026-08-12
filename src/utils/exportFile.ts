// @ts-nocheck

import { loadXlsx } from "@/utils/loadXlsx";

function sanitizeSheetName(sheetName) {
  return String(sheetName || "내보내기")
    .replace(/[:\\/?*[\]]/g, " ")
    .slice(0, 31)
    .trim() || "내보내기";
}

function ensureXlsxFilename(filename) {
  const trimmedFilename = String(filename || "리뷰매니저_내보내기.xlsx").trim();

  return trimmedFilename.toLowerCase().endsWith(".xlsx") ? trimmedFilename : `${trimmedFilename}.xlsx`;
}

export function buildExportFilename(menuLabel, date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes())
  ].join("");

  return `리뷰매니저_${menuLabel}_${timestamp}.xlsx`;
}

export async function downloadExcel(filename, sheets) {
  const XLSX = await loadXlsx();
  const workbook = XLSX.utils.book_new();
  const normalizedSheets = Array.isArray(sheets) ? sheets : [sheets];

  normalizedSheets.forEach((sheet, index) => {
    const sheetName = sanitizeSheetName(sheet?.name || `시트${index + 1}`);
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    const leadingRows = Array.isArray(sheet?.leadingRows) ? sheet.leadingRows : [];
    const headers = Array.isArray(sheet?.headers) ? sheet.headers : Object.keys(rows[0] ?? {});
    const worksheet = leadingRows.length > 0
      ? XLSX.utils.aoa_to_sheet([...leadingRows, headers])
      : XLSX.utils.tson_to_sheet(rows);

    if (leadingRows.length > 0 && rows.length > 0) {
      XLSX.utils.sheet_add_json(worksheet, rows, { skipHeader: true, origin: -1 });

      if (headers.length > 1) {
        worksheet["!merges"] = leadingRows.map((_, rowIndex) => ({
          s: { r: rowIndex, c: 0 },
          e: { r: rowIndex, c: headers.length - 1 }
        }));
      }
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  XLSX.writeFile(workbook, ensureXlsxFilename(filename), {
    bookType: "xlsx",
    compression: true
  });
}
