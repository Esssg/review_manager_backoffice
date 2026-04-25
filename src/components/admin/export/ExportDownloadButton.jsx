import { downloadExcel } from "../../../utils/exportFile";

export default function ExportDownloadButton({
  filename,
  sheetName,
  rows,
  disabled,
  isLoading,
  emptyMessage = "내보낼 데이터가 없습니다."
}) {
  const canDownload = !disabled && !isLoading && rows.length > 0;

  const handleDownload = () => {
    if (!canDownload) {
      return;
    }

    downloadExcel(filename, {
      name: sheetName,
      rows
    });
  };

  return (
    <div className="export-download-area">
      <button type="button" className="admin-primary-button" onClick={handleDownload} disabled={!canDownload}>
        {isLoading ? "데이터 준비 중..." : `Excel 다운로드 (${rows.length}건)`}
      </button>
      {!isLoading && rows.length === 0 && <p className="login-message">{emptyMessage}</p>}
      {disabled && rows.length > 0 && <p className="login-error">다운로드할 컬럼을 1개 이상 선택해주세요.</p>}
    </div>
  );
}
