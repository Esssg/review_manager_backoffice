import { buildExportPreviewRows } from "../../../utils/exportColumns";

export default function ExportPreviewTable({ rows, limit = 50 }) {
  const previewRows = buildExportPreviewRows(rows, limit);
  const columns = Object.keys(previewRows[0] ?? {});

  return (
    <section className="export-panel" aria-label="내보내기 미리보기">
      <div className="export-panel-header">
        <div>
          <h2>미리보기</h2>
          <p>선택한 컬럼 기준으로 상위 {limit}행만 표시합니다.</p>
        </div>
        <span className="export-row-count">총 {rows.length}건</span>
      </div>

      {previewRows.length === 0 || columns.length === 0 ? (
        <p className="login-message">표시할 미리보기 데이터가 없습니다.</p>
      ) : (
        <div className="export-preview-table-wrap">
          <table className="export-preview-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, rowIndex) => (
                <tr key={`export-preview-${rowIndex}`}>
                  {columns.map((column) => (
                    <td key={`${rowIndex}-${column}`}>{row[column] == null || row[column] === "" ? "-" : row[column]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
