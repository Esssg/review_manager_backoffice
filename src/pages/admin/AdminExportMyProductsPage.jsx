import ExportColumnSelector from "../../components/admin/export/ExportColumnSelector";
import ExportDownloadButton from "../../components/admin/export/ExportDownloadButton";
import ExportPageLayout from "../../components/admin/export/ExportPageLayout";
import ExportPreviewTable from "../../components/admin/export/ExportPreviewTable";
import ExportToolbar from "../../components/admin/export/ExportToolbar";
import useAdminExportData from "../../hooks/useAdminExportData";
import useExportColumnSelection from "../../hooks/useExportColumnSelection";
import { buildExportFilename } from "../../utils/exportFile";

export default function AdminExportMyProductsPage() {
  const columnSelection = useExportColumnSelection({
    storageKey: "review_manager_export_columns_my_products"
  });
  const {
    exportRows,
    productCount,
    submissionCount,
    scopeMessage,
    lastUpdatedAt,
    refreshExportData,
    isLoading,
    errorMessage
  } = useAdminExportData({
    forcePersonalScope: true,
    selectedColumnKeys: columnSelection.selectedColumnKeys
  });
  const isColumnEmpty = columnSelection.selectedColumnKeys.length === 0;
  const hasNoSubmissions = !isLoading && !errorMessage && submissionCount === 0;

  return (
    <ExportPageLayout
      title="내상품 내보내기"
      description="로그인한 관리자 본인(manager_id)으로 등록된 상품과 관련 제출만 Excel로 내보냅니다. 회사 데이터 토글은 이 화면에 표시되지 않습니다."
      scopeMessage={scopeMessage}
      showCompanyToggle={false}
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
          filename={buildExportFilename("내상품")}
          sheetName="내상품"
          rows={exportRows}
          disabled={isColumnEmpty}
          isLoading={isLoading}
        />
      </ExportToolbar>
      {hasNoSubmissions && (
        <p className="export-empty-hint">
          내보낼 제출 데이터가 없습니다. 본인 계정으로 등록된 상품이 없거나 아직 제출이 없을 수 있습니다.
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
