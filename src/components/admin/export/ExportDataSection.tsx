import ExportColumnSelector from "@/components/admin/export/ExportColumnSelector";
import ExportDownloadButton from "@/components/admin/export/ExportDownloadButton";
import ExportPreviewTable from "@/components/admin/export/ExportPreviewTable";
import ExportToolbar from "@/components/admin/export/ExportToolbar";
import { buildExportFilename } from "@/utils/exportFile";

export default function ExportDataSection({
  config,
  exportRows = [],
  productCount = 0,
  submissionCount = 0,
  summaryItems = undefined,
  isLoading = false,
  errorMessage = "",
  hasNoRows = undefined,
  disabled = false,
  canExport = true,
  emptyHint = undefined,
  filenameLabel = config.filenameLabel,
  sheetName = config.sheetName,
  emptyMessage = config.emptyMessage,
  columns = undefined,
  presets = undefined,
  columnSelection
}) {
  const isColumnEmpty = columnSelection.selectedColumnKeys.length === 0;
  const resolvedHasNoRows =
    hasNoRows ?? (!isLoading && !errorMessage && submissionCount === 0);
  const resolvedEmptyHint = emptyHint ?? config.emptyHint;
  const exportDisabled = disabled || !canExport;

  return (
    <>
      {errorMessage && <p className="login-error">{errorMessage}</p>}
      <ExportToolbar
        productCount={productCount}
        submissionCount={submissionCount}
        exportRowCount={exportRows.length}
        summaryItems={summaryItems}
        isLoading={isLoading}
      >
        <ExportDownloadButton
          filename={buildExportFilename(filenameLabel)}
          sheetName={sheetName}
          rows={exportRows}
          disabled={isColumnEmpty || exportDisabled}
          disabledMessage={
            !canExport ? "내보내기 실행 권한이 없습니다." : "다운로드할 컬럼을 1개 이상 선택해주세요."
          }
          isLoading={isLoading}
          emptyMessage={emptyMessage}
        />
      </ExportToolbar>
      {resolvedHasNoRows && resolvedEmptyHint && (
        <p className="export-empty-hint">{resolvedEmptyHint}</p>
      )}
      <ExportColumnSelector
        columns={columns}
        presets={presets}
        activePreset={columnSelection.activePreset}
        selectedColumnKeys={columnSelection.selectedColumnKeys}
        onPresetSelect={columnSelection.applyPreset}
        onColumnToggle={columnSelection.toggleColumn}
        onSelectAll={columnSelection.selectAllColumns}
        onClear={columnSelection.clearColumns}
      />
      <ExportPreviewTable rows={exportRows} />
    </>
  );
}
