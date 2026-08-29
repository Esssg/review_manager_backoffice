import ExportDataSection from "@/components/admin/export/ExportDataSection";
import ExportPageLayout from "@/components/admin/export/ExportPageLayout";
import { EXPORT_PAGE_CONFIGS } from "@/constants/exportPages";
import useAdminExportData from "@/hooks/useAdminExportData";
import useExportColumnSelection from "@/hooks/useExportColumnSelection";

export default function AdminExportMyProductsPage() {
  const config = EXPORT_PAGE_CONFIGS.myProducts;
  const columnSelection = useExportColumnSelection({
    storageKey: config.columnStorageKey
  });
  const {
    adminId,
    adminProfile,
    exportRows,
    productCount,
    submissionCount,
    scopeMessage,
    lastUpdatedAt,
    refreshExportData,
    isLoading,
    errorMessage,
    canExport
  } = useAdminExportData({
    forcePersonalScope: config.forcePersonalScope,
    selectedColumnKeys: columnSelection.selectedColumnKeys
  });
  const hasNoSubmissions = !isLoading && !errorMessage && submissionCount === 0;

  return (
    <ExportPageLayout
      adminId={adminId}
      adminProfile={adminProfile}
      title={config.title}
      description={config.description}
      scopeMessage={scopeMessage}
      showCompanyToggle={config.showCompanyToggle}
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
        canExport={canExport}
        hasNoRows={hasNoSubmissions}
        columnSelection={columnSelection}
      />
    </ExportPageLayout>
  );
}
