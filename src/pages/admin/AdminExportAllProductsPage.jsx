import ExportColumnSelector from "../../components/admin/export/ExportColumnSelector";
import ExportDownloadButton from "../../components/admin/export/ExportDownloadButton";
import ExportPageLayout from "../../components/admin/export/ExportPageLayout";
import ExportPreviewTable from "../../components/admin/export/ExportPreviewTable";
import ExportToolbar from "../../components/admin/export/ExportToolbar";
import useAdminExportData from "../../hooks/useAdminExportData";
import useExportColumnSelection from "../../hooks/useExportColumnSelection";
import { buildExportFilename } from "../../utils/exportFile";

export default function AdminExportAllProductsPage() {
  const columnSelection = useExportColumnSelection({
    storageKey: "review_manager_export_columns_all_products"
  });
  const {
    includeCompanyData,
    handleIncludeCompanyDataChange,
    exportRows,
    productCount,
    submissionCount,
    scopeInfo,
    scopeMessage,
    lastUpdatedAt,
    refreshExportData,
    isLoading,
    errorMessage
  } = useAdminExportData({
    selectedColumnKeys: columnSelection.selectedColumnKeys
  });
  const isColumnEmpty = columnSelection.selectedColumnKeys.length === 0;
  const hasNoSubmissions = !isLoading && !errorMessage && submissionCount === 0;

  return (
    <ExportPageLayout
      title="전체상품 내보내기"
      description="회사 범위 또는 본인 범위의 모든 상품과 관련 제출 데이터를 Excel로 내보냅니다."
      scopeMessage={scopeMessage}
      includeCompanyData={includeCompanyData}
      isCompanyScopeAvailable={scopeInfo.isCompanyScopeAvailable}
      onIncludeCompanyDataChange={handleIncludeCompanyDataChange}
      lastUpdatedAt={lastUpdatedAt}
      onRefresh={refreshExportData}
    >
      {errorMessage && <p className="login-error">{errorMessage}</p>}
      <ExportToolbar
        productCount={productCount}
        submissionCount={submissionCount}
        exportRowCount={exportRows.length}
        isLoading={isLoading}
      >
        <ExportDownloadButton
          filename={buildExportFilename("전체상품")}
          sheetName="전체상품"
          rows={exportRows}
          disabled={isColumnEmpty}
          isLoading={isLoading}
        />
      </ExportToolbar>
      {hasNoSubmissions && (
        <p className="export-empty-hint">
          내보낼 제출 데이터가 없습니다. 상품이 없거나 제출이 아직 없을 수 있습니다. 회사 데이터 포함을 켜 같은 회사 관리자 범위를 넓혀 보세요.
        </p>
      )}
      <ExportColumnSelector
        activePreset={columnSelection.activePreset}
        selectedColumnKeys={columnSelection.selectedColumnKeys}
        onPresetSelect={columnSelection.applyPreset}
        onColumnToggle={columnSelection.toggleColumn}
        onSelectAll={columnSelection.selectAllColumns}
        onClear={columnSelection.clearColumns}
      />
      <ExportPreviewTable rows={exportRows} />
    </ExportPageLayout>
  );
}
