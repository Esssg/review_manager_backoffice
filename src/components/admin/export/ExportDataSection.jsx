import ExportColumnSelector from "./ExportColumnSelector";
import ExportDownloadButton from "./ExportDownloadButton";
import ExportPreviewTable from "./ExportPreviewTable";
import ExportToolbar from "./ExportToolbar";
import { buildExportFilename } from "../../../utils/exportFile";

export default function ExportDataSection({
  config,
  exportRows = [],
  productCount = 0,
  submissionCount = 0,
  summaryItems,
  isLoading = false,
  errorMessage = "",
  hasNoRows,
  disabled = false,
  emptyHint,
  filenameLabel = config.filenameLabel,
  sheetName = config.sheetName,
  emptyMessage = config.emptyMessage,
  columns,
  presets,
  columnSelection
}) {
  const isColumnEmpty = columnSelection.selectedColumnKeys.length === 0;
  const resolvedHasNoRows =
    hasNoRows ?? (!isLoading && !errorMessage && submissionCount === 0);
  const resolvedEmptyHint = emptyHint ?? config.emptyHint;

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
          disabled={isColumnEmpty || disabled}
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
