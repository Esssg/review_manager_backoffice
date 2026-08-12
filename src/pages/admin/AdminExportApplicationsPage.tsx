import { useMemo, useState } from "react";
import ExportDataSection from "@/components/admin/export/ExportDataSection";
import ExportFilterPanel from "@/components/admin/export/ExportFilterPanel";
import ExportPageLayout from "@/components/admin/export/ExportPageLayout";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EXPORT_PAGE_CONFIGS } from "@/constants/exportPages";
import useAdminExportData from "@/hooks/useAdminExportData";
import useExportColumnSelection from "@/hooks/useExportColumnSelection";
import {
  APPLICATION_EXPORT_COLUMNS,
  APPLICATION_EXPORT_COLUMN_PRESET,
  buildApplicationExportRows,
  getApplicationPresetColumnKeys
} from "@/utils/exportColumns";

const APPLICATION_STATUS_OPTIONS = [
  { key: "all", label: "전체" },
  { key: "confirmed", label: "확정" },
  { key: "pending", label: "미확정" }
];

const APPLICATION_EXPORT_COLUMN_PRESETS = [
  { key: APPLICATION_EXPORT_COLUMN_PRESET.BASIC, label: "기본" },
  { key: APPLICATION_EXPORT_COLUMN_PRESET.CONFIRMED, label: "확정용" },
  { key: APPLICATION_EXPORT_COLUMN_PRESET.ALL, label: "전체" }
];

export default function AdminExportApplicationsPage() {
  const config = EXPORT_PAGE_CONFIGS.applications;
  const [statusFilter, setStatusFilter] = useState("all");
  const columnSelection = useExportColumnSelection({
    storageKey: config.columnStorageKey,
    defaultPreset: APPLICATION_EXPORT_COLUMN_PRESET.BASIC,
    getPresetColumnKeysFn: getApplicationPresetColumnKeys,
    presetKeys: APPLICATION_EXPORT_COLUMN_PRESETS.map((preset) => preset.key)
  });

  const {
    adminId,
    adminProfile,
    includeCompanyData,
    handleIncludeCompanyDataChange,
    exportData,
    productCount,
    scopeInfo,
    scopeMessage,
    lastUpdatedAt,
    refreshExportData,
    isLoading,
    errorMessage
  } = useAdminExportData({
    includeApplications: true
  });

  const filteredApplications = useMemo(() => {
    if (statusFilter === "confirmed") {
      return exportData.applications.filter((application) => application.is_confirmed);
    }

    if (statusFilter === "pending") {
      return exportData.applications.filter((application) => !application.is_confirmed);
    }

    return exportData.applications;
  }, [exportData.applications, statusFilter]);

  const exportRows = useMemo(
    () =>
      buildApplicationExportRows({
        products: exportData.products,
        applications: filteredApplications,
        selectedColumnKeys: columnSelection.selectedColumnKeys
      }),
    [columnSelection.selectedColumnKeys, exportData.products, filteredApplications]
  );

  const hasNoRows = !isLoading && !errorMessage && filteredApplications.length === 0;
  const confirmedCount = filteredApplications.filter((application) => application.is_confirmed).length;
  const pendingCount = filteredApplications.length - confirmedCount;

  return (
    <ExportPageLayout
      adminId={adminId}
      adminProfile={adminProfile}
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
      <ExportFilterPanel
        title="신청 상태 필터"
        description="확정 여부에 따라 신청자 명단을 분리해 볼 수 있습니다."
      >
        <RadioGroup
          className="export-chip-list"
          value={statusFilter}
          onValueChange={setStatusFilter}
          aria-label="신청 상태 필터"
        >
          {APPLICATION_STATUS_OPTIONS.map((option) => (
            <label key={option.key} className="export-chip-option">
              <RadioGroupItem
                value={option.key}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </RadioGroup>
      </ExportFilterPanel>

      <ExportDataSection
        config={config}
        exportRows={exportRows}
        productCount={productCount}
        summaryItems={[
          `상품 ${productCount}건`,
          `신청 ${filteredApplications.length}건`,
          `확정 ${confirmedCount}건`,
          `미확정 ${pendingCount}건`
        ]}
        isLoading={isLoading}
        errorMessage={errorMessage}
        hasNoRows={hasNoRows}
        emptyHint="선택한 신청 상태에 맞는 명단이 없습니다."
        columns={APPLICATION_EXPORT_COLUMNS}
        presets={APPLICATION_EXPORT_COLUMN_PRESETS}
        columnSelection={columnSelection}
      />
    </ExportPageLayout>
  );
}
