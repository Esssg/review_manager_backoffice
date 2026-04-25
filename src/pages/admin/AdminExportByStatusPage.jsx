import { useMemo, useState } from "react";
import ExportColumnSelector from "../../components/admin/export/ExportColumnSelector";
import ExportDownloadButton from "../../components/admin/export/ExportDownloadButton";
import ExportFilterPanel from "../../components/admin/export/ExportFilterPanel";
import ExportPageLayout from "../../components/admin/export/ExportPageLayout";
import ExportPreviewTable from "../../components/admin/export/ExportPreviewTable";
import ExportToolbar from "../../components/admin/export/ExportToolbar";
import useAdminExportData from "../../hooks/useAdminExportData";
import useExportColumnSelection from "../../hooks/useExportColumnSelection";
import { buildSubmissionExportRows, getSubmissionStageLabel } from "../../utils/exportColumns";
import { buildExportFilename } from "../../utils/exportFile";

const STATUS_OPTIONS = [
  { key: "purchase", label: "구매완료" },
  { key: "review", label: "리뷰완료" },
  { key: "complete", label: "전체완료" }
];

const DEFAULT_SELECTED_STATUS_KEYS = STATUS_OPTIONS.map((option) => option.key);

export default function AdminExportByStatusPage() {
  const [selectedStatusKeys, setSelectedStatusKeys] = useState(DEFAULT_SELECTED_STATUS_KEYS);
  const columnSelection = useExportColumnSelection({
    storageKey: "review_manager_export_columns_by_status"
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
    selectedColumnKeys: columnSelection.selectedColumnKeys
  });

  const filteredSubmissions = useMemo(() => {
    const statusKeySet = new Set(selectedStatusKeys);

    return exportData.submissions.filter((submission) => {
      const stageLabel = getSubmissionStageLabel(submission);

      if (stageLabel === "구매완료") {
        return statusKeySet.has("purchase");
      }

      if (stageLabel === "리뷰완료") {
        return statusKeySet.has("review");
      }

      return statusKeySet.has("complete");
    });
  }, [exportData.submissions, selectedStatusKeys]);

  const exportRows = useMemo(
    () =>
      buildSubmissionExportRows({
        products: exportData.products,
        submissions: filteredSubmissions,
        evidencePhotos: exportData.evidencePhotos,
        selectedColumnKeys: columnSelection.selectedColumnKeys
      }),
    [columnSelection.selectedColumnKeys, exportData.evidencePhotos, exportData.products, filteredSubmissions]
  );

  const selectedStatusLabels = STATUS_OPTIONS.filter((option) => selectedStatusKeys.includes(option.key)).map(
    (option) => option.label
  );
  const isColumnEmpty = columnSelection.selectedColumnKeys.length === 0;
  const hasNoStatuses = selectedStatusKeys.length === 0;
  const hasNoRows = !isLoading && !errorMessage && filteredSubmissions.length === 0;

  const toggleStatusKey = (statusKey) => {
    setSelectedStatusKeys((prev) =>
      prev.includes(statusKey) ? prev.filter((key) => key !== statusKey) : [...prev, statusKey]
    );
  };

  return (
    <ExportPageLayout
      title="상태별 내보내기"
      description="구매완료, 리뷰완료, 전체완료 단계 기준으로 제출을 묶어 Excel로 내보냅니다."
      scopeMessage={scopeMessage}
      includeCompanyData={includeCompanyData}
      isCompanyScopeAvailable={scopeInfo.isCompanyScopeAvailable}
      onIncludeCompanyDataChange={handleIncludeCompanyDataChange}
      lastUpdatedAt={lastUpdatedAt}
      onRefresh={refreshExportData}
    >
      <ExportFilterPanel
        title="상태 선택"
        description="여러 상태를 동시에 선택할 수 있습니다. 선택한 상태에 해당하는 submission만 미리보기와 다운로드에 포함됩니다."
      >
        <div className="export-chip-list" role="group" aria-label="제출 상태 선택">
          {STATUS_OPTIONS.map((option) => (
            <label key={option.key} className="export-chip-option">
              <input
                type="checkbox"
                checked={selectedStatusKeys.includes(option.key)}
                onChange={() => toggleStatusKey(option.key)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <div className="export-date-filter-status" aria-live="polite">
          <p className="dashboard-meta">
            현재 선택: {selectedStatusLabels.length > 0 ? selectedStatusLabels.join(", ") : "없음"}
          </p>
          {hasNoStatuses && <p className="login-error">상태를 1개 이상 선택해야 내보낼 수 있습니다.</p>}
        </div>
      </ExportFilterPanel>

      {errorMessage && <p className="login-error">{errorMessage}</p>}
      <ExportToolbar
        summaryItems={[
          `상품 ${productCount}건`,
          `선택 상태 ${selectedStatusLabels.length}개`,
          `대상 제출 ${filteredSubmissions.length}건`,
          `내보내기 행 ${exportRows.length}건`
        ]}
        isLoading={isLoading}
      >
        <ExportDownloadButton
          filename={buildExportFilename("상태별")}
          sheetName="상태별"
          rows={exportRows}
          disabled={isColumnEmpty || hasNoStatuses}
          isLoading={isLoading}
          emptyMessage="선택한 상태에 맞는 내보내기 데이터가 없습니다."
        />
      </ExportToolbar>
      {hasNoRows && (
        <p className="export-empty-hint">
          선택한 상태({selectedStatusLabels.join(", ") || "없음"})에 맞는 제출 데이터가 없습니다.
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
