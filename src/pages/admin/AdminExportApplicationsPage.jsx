import { useMemo, useState } from "react";
import ExportColumnSelector from "../../components/admin/export/ExportColumnSelector";
import ExportDownloadButton from "../../components/admin/export/ExportDownloadButton";
import ExportFilterPanel from "../../components/admin/export/ExportFilterPanel";
import ExportPageLayout from "../../components/admin/export/ExportPageLayout";
import ExportPreviewTable from "../../components/admin/export/ExportPreviewTable";
import ExportToolbar from "../../components/admin/export/ExportToolbar";
import useAdminExportData from "../../hooks/useAdminExportData";
import useExportColumnSelection from "../../hooks/useExportColumnSelection";
import {
  APPLICATION_EXPORT_COLUMNS,
  APPLICATION_EXPORT_COLUMN_PRESET,
  buildApplicationExportRows,
  getApplicationPresetColumnKeys
} from "../../utils/exportColumns";
import { buildExportFilename } from "../../utils/exportFile";

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
  const [statusFilter, setStatusFilter] = useState("all");
  const columnSelection = useExportColumnSelection({
    storageKey: "review_manager_export_columns_applications",
    defaultPreset: APPLICATION_EXPORT_COLUMN_PRESET.BASIC,
    getPresetColumnKeysFn: getApplicationPresetColumnKeys,
    presetKeys: APPLICATION_EXPORT_COLUMN_PRESETS.map((preset) => preset.key)
  });

  const {
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

  const isColumnEmpty = columnSelection.selectedColumnKeys.length === 0;
  const hasNoRows = !isLoading && !errorMessage && filteredApplications.length === 0;
  const confirmedCount = filteredApplications.filter((application) => application.is_confirmed).length;
  const pendingCount = filteredApplications.length - confirmedCount;

  return (
    <ExportPageLayout
      title="신청자 명단 내보내기"
      description="applications 테이블 중심으로 확정/미확정 신청자 명단을 Excel로 내보냅니다."
      scopeMessage={scopeMessage}
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
        <div className="export-chip-list" role="radiogroup" aria-label="신청 상태 필터">
          {APPLICATION_STATUS_OPTIONS.map((option) => (
            <label key={option.key} className="export-chip-option">
              <input
                type="radio"
                name="application-status-filter"
                value={option.key}
                checked={statusFilter === option.key}
                onChange={() => setStatusFilter(option.key)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </ExportFilterPanel>

      {errorMessage && <p className="login-error">{errorMessage}</p>}
      <ExportToolbar
        summaryItems={[
          `상품 ${productCount}건`,
          `신청 ${filteredApplications.length}건`,
          `확정 ${confirmedCount}건`,
          `미확정 ${pendingCount}건`
        ]}
        isLoading={isLoading}
      >
        <ExportDownloadButton
          filename={buildExportFilename("신청자명단")}
          sheetName="신청자 명단"
          rows={exportRows}
          disabled={isColumnEmpty}
          isLoading={isLoading}
          emptyMessage="선택한 조건에 맞는 신청자 데이터가 없습니다."
        />
      </ExportToolbar>
      {hasNoRows && <p className="export-empty-hint">선택한 신청 상태에 맞는 명단이 없습니다.</p>}
      <ExportColumnSelector
        columns={APPLICATION_EXPORT_COLUMNS}
        presets={APPLICATION_EXPORT_COLUMN_PRESETS}
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
