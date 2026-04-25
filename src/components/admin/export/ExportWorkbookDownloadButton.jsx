import { downloadExcel } from "../../../utils/exportFile";

export default function ExportWorkbookDownloadButton({
  filename,
  sheets,
  disabled,
  isLoading,
  buttonLabel = "Excel 다운로드",
  emptyMessage = "내보낼 데이터가 없습니다.",
  disabledMessage = ""
}) {
  const hasRows = Array.isArray(sheets) && sheets.some((sheet) => Array.isArray(sheet?.rows) && sheet.rows.length > 0);
  const canDownload = !disabled && !isLoading && hasRows;

  const handleDownload = () => {
    if (!canDownload) {
      return;
    }

    downloadExcel(filename, sheets);
  };

  return (
    <div className="export-download-area">
      <button type="button" className="admin-primary-button" onClick={handleDownload} disabled={!canDownload}>
        {isLoading ? "데이터 준비 중..." : buttonLabel}
      </button>
      {!isLoading && disabled && disabledMessage ? (
        <p className="login-error">{disabledMessage}</p>
      ) : !isLoading && !hasRows ? (
        <p className="login-message">{emptyMessage}</p>
      ) : null}
    </div>
  );
}
