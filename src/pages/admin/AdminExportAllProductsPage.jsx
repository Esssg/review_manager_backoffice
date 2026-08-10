import ExportDataSection from "../../components/admin/export/ExportDataSection";
import ExportPageLayout from "../../components/admin/export/ExportPageLayout";
import { EXPORT_PAGE_CONFIGS } from "../../constants/exportPages";
import useAdminExportData from "../../hooks/useAdminExportData";
import useExportColumnSelection from "../../hooks/useExportColumnSelection";

export default function AdminExportAllProductsPage() {
  const config = EXPORT_PAGE_CONFIGS.allProducts;
  const columnSelection = useExportColumnSelection({
    storageKey: config.columnStorageKey
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
  const hasNoSubmissions = !isLoading && !errorMessage && submissionCount === 0;

  return (
    <ExportPageLayout
      title={config.title}
      description={config.description}
      scopeMessage={scopeMessage}
      showCompanyToggle={config.showCompanyToggle}
      includeCompanyData={includeCompanyData}
      isCompanyScopeAvailable={scopeInfo.isCompanyScopeAvailable}
      onIncludeCompanyDataChange={handleIncludeCompanyDataChange}
      lastUpdatedAt={lastUpdatedAt}
      onRefresh={refreshExportData}
    >
      <ExportDataSection
        config={config}
        exportRows={exportRows}
        productCount={productCount}
        submissionCount={submissionCount}
        isLoading={isLoading}
        errorMessage={errorMessage}
        hasNoRows={hasNoSubmissions}
        columnSelection={columnSelection}
      />
    </ExportPageLayout>
  );
}
