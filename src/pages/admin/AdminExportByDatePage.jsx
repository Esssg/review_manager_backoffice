import { useState } from "react";
import ExportColumnSelector from "../../components/admin/export/ExportColumnSelector";
import ExportDateFilterPanel from "../../components/admin/export/ExportDateFilterPanel";
import ExportDownloadButton from "../../components/admin/export/ExportDownloadButton";
import ExportPageLayout from "../../components/admin/export/ExportPageLayout";
import ExportPreviewTable from "../../components/admin/export/ExportPreviewTable";
import ExportToolbar from "../../components/admin/export/ExportToolbar";
import useAdminExportData from "../../hooks/useAdminExportData";
import useExportColumnSelection from "../../hooks/useExportColumnSelection";
import {
  buildQuickRangeDates,
  createDefaultDateFilterState,
  DEFAULT_EXPORT_QUICK_RANGE,
  EXPORT_DATE_FIELD_OPTIONS,
  EXPORT_QUICK_RANGE_OPTIONS,
  getAppliedDateRangeSummary,
  getExportDateFieldLabel,
  isSameDateFilter
} from "../../utils/exportDateFilters";
import { buildExportFilename } from "../../utils/exportFile";

export default function AdminExportByDatePage() {
  const [draftFilter, setDraftFilter] = useState(() => createDefaultDateFilterState());
  const [appliedFilter, setAppliedFilter] = useState(() => createDefaultDateFilterState());
  const [activeQuickRange, setActiveQuickRange] = useState(DEFAULT_EXPORT_QUICK_RANGE);
  const columnSelection = useExportColumnSelection({
    storageKey: "review_manager_export_columns_by_date"
  });

  const validationMessage =
    draftFilter.startDate && draftFilter.endDate && draftFilter.startDate > draftFilter.endDate
      ? "시작일은 종료일보다 늦을 수 없습니다."
      : "";
  const hasPendingChanges = !isSameDateFilter(draftFilter, appliedFilter);

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
    dateFilter: appliedFilter,
    selectedColumnKeys: columnSelection.selectedColumnKeys
  });

  const isColumnEmpty = columnSelection.selectedColumnKeys.length === 0;
  const hasNoSubmissions = !isLoading && !errorMessage && submissionCount === 0;
  const appliedRangeSummary = getAppliedDateRangeSummary(appliedFilter);
  const downloadLabel = `일자별_${getExportDateFieldLabel(appliedFilter.field)}`;

  const handleDateFieldChange = (event) => {
    const nextField = event.target.value;

    setDraftFilter((prev) => ({
      ...prev,
      field: nextField
    }));
  };

  const handleDateInputChange = (key) => (event) => {
    setDraftFilter((prev) => ({
      ...prev,
      [key]: event.target.value
    }));
    setActiveQuickRange("");
  };

  const handleQuickRangeSelect = (rangeKey) => {
    const rangeDates = buildQuickRangeDates(rangeKey);
    const nextFilter = {
      field: draftFilter.field,
      ...rangeDates
    };

    setDraftFilter(nextFilter);
    setAppliedFilter(nextFilter);
    setActiveQuickRange(rangeKey);
  };

  const handleApplyFilter = () => {
    if (validationMessage) {
      return;
    }

    setAppliedFilter(draftFilter);
  };

  const handleResetFilter = () => {
    const nextFilter = createDefaultDateFilterState();

    setDraftFilter(nextFilter);
    setAppliedFilter(nextFilter);
    setActiveQuickRange(DEFAULT_EXPORT_QUICK_RANGE);
  };

  return (
    <ExportPageLayout
      title="일자별 내보내기"
      description="제출 등록일 또는 입금일 범위로 데이터를 추려서 Excel로 내보냅니다."
      scopeMessage={scopeMessage}
      includeCompanyData={includeCompanyData}
      isCompanyScopeAvailable={scopeInfo.isCompanyScopeAvailable}
      onIncludeCompanyDataChange={handleIncludeCompanyDataChange}
      lastUpdatedAt={lastUpdatedAt}
      onRefresh={refreshExportData}
    >
      <ExportDateFilterPanel
        title="일자 필터"
        description="기준 일자를 고르고 기간을 적용하면 해당 조건에 맞는 제출만 미리보기와 Excel 다운로드에 반영됩니다."
        fieldOptions={EXPORT_DATE_FIELD_OPTIONS}
        fieldValue={draftFilter.field}
        onFieldChange={handleDateFieldChange}
        startDate={draftFilter.startDate}
        endDate={draftFilter.endDate}
        onStartDateChange={handleDateInputChange("startDate")}
        onEndDateChange={handleDateInputChange("endDate")}
        quickRangeOptions={EXPORT_QUICK_RANGE_OPTIONS}
        activeQuickRange={activeQuickRange}
        onQuickRangeSelect={handleQuickRangeSelect}
        onApply={handleApplyFilter}
        onReset={handleResetFilter}
        applyDisabled={Boolean(validationMessage) || !hasPendingChanges}
        resetLabel="최근 30일로 초기화"
        statusText={appliedRangeSummary}
        pendingMessage={
          hasPendingChanges ? "입력 중인 기간이 아직 적용되지 않았습니다. 조회하기를 누르면 다시 불러옵니다." : ""
        }
        errorMessage={validationMessage}
      />

      {errorMessage && <p className="login-error">{errorMessage}</p>}
      <ExportToolbar
        productCount={productCount}
        submissionCount={submissionCount}
        exportRowCount={exportRows.length}
        isLoading={isLoading}
      >
        <ExportDownloadButton
          filename={buildExportFilename(downloadLabel)}
          sheetName="일자별"
          rows={exportRows}
          disabled={isColumnEmpty}
          isLoading={isLoading}
          emptyMessage="선택한 기간에 맞는 내보내기 데이터가 없습니다."
        />
      </ExportToolbar>
      {hasNoSubmissions && (
        <p className="export-empty-hint">
          선택한 기간({appliedRangeSummary})에 맞는 제출 데이터가 없습니다. 일자 기준을 바꾸거나 기간을 넓혀 다시 조회해 보세요.
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
