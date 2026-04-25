import * as XLSX from "xlsx";

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

export function downloadExcel(filename, sheets) {
  const workbook = XLSX.utils.book_new();
  const normalizedSheets = Array.isArray(sheets) ? sheets : [sheets];

  normalizedSheets.forEach((sheet, index) => {
    const sheetName = sanitizeSheetName(sheet?.name || `시트${index + 1}`);
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    const worksheet = XLSX.utils.json_to_sheet(rows);

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  XLSX.writeFile(workbook, ensureXlsxFilename(filename), {
    bookType: "xlsx",
    compression: true
  });
}
