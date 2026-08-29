import { useState } from "react";
import ExportDataSection from "@/components/admin/export/ExportDataSection";
import ExportDateFilterPanel from "@/components/admin/export/ExportDateFilterPanel";
import ExportPageLayout from "@/components/admin/export/ExportPageLayout";
import { EXPORT_PAGE_CONFIGS } from "@/constants/exportPages";
import useAdminExportData from "@/hooks/useAdminExportData";
import useExportColumnSelection from "@/hooks/useExportColumnSelection";
import {
  buildQuickRangeDates,
  createDefaultDateFilterState,
  DEFAULT_EXPORT_QUICK_RANGE,
  EXPORT_DATE_FIELD_OPTIONS,
  EXPORT_QUICK_RANGE_OPTIONS,
  getAppliedDateRangeSummary,
  getExportDateFieldLabel,
  isSameDateFilter
} from "@/utils/exportDateFilters";

export default function AdminExportByDatePage() {
  const config = EXPORT_PAGE_CONFIGS.byDate;
  const [draftFilter, setDraftFilter] = useState(() => createDefaultDateFilterState());
  const [appliedFilter, setAppliedFilter] = useState(() => createDefaultDateFilterState());
  const [activeQuickRange, setActiveQuickRange] = useState(DEFAULT_EXPORT_QUICK_RANGE);
  const columnSelection = useExportColumnSelection({
    storageKey: config.columnStorageKey
  });

  const validationMessage =
    draftFilter.startDate && draftFilter.endDate && draftFilter.startDate > draftFilter.endDate
      ? "시작일은 종료일보다 늦을 수 없습니다."
      : "";
  const hasPendingChanges = !isSameDateFilter(draftFilter, appliedFilter);

  const {
    adminId,
    adminProfile,
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
    errorMessage,
    canExport
  } = useAdminExportData({
    dateFilter: appliedFilter,
    selectedColumnKeys: columnSelection.selectedColumnKeys
  });

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

      <ExportDataSection
        config={config}
        exportRows={exportRows}
        productCount={productCount}
        submissionCount={submissionCount}
        isLoading={isLoading}
        errorMessage={errorMessage}
        canExport={canExport}
        hasNoRows={hasNoSubmissions}
        filenameLabel={downloadLabel}
        emptyHint={`선택한 기간(${appliedRangeSummary})에 맞는 제출 데이터가 없습니다. 일자 기준을 바꾸거나 기간을 넓혀 다시 조회해 보세요.`}
        columnSelection={columnSelection}
      />
    </ExportPageLayout>
  );
}
