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
  EXPORT_QUICK_RANGE_OPTIONS,
  getAppliedDateRangeSummary,
  isSameDateFilter
} from "@/utils/exportDateFilters";

const DEPOSIT_FIELD_OPTIONS = [{ key: "deposited_at", label: "입금일" }];

function createDefaultDepositFilterState() {
  return createDefaultDateFilterState("deposited_at", DEFAULT_EXPORT_QUICK_RANGE);
}

export default function AdminExportByDepositDatePage() {
  const config = EXPORT_PAGE_CONFIGS.byDepositDate;
  const [draftFilter, setDraftFilter] = useState(() => createDefaultDepositFilterState());
  const [appliedFilter, setAppliedFilter] = useState(() => createDefaultDepositFilterState());
  const [activeQuickRange, setActiveQuickRange] = useState(DEFAULT_EXPORT_QUICK_RANGE);
  const columnSelection = useExportColumnSelection({
    storageKey: config.columnStorageKey,
    defaultPreset: config.defaultPreset
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
    depositOnly: true,
    selectedColumnKeys: columnSelection.selectedColumnKeys
  });

  const hasNoSubmissions = !isLoading && !errorMessage && submissionCount === 0;
  const appliedRangeSummary = getAppliedDateRangeSummary(appliedFilter, DEPOSIT_FIELD_OPTIONS);

  const handleDateInputChange = (key) => (event) => {
    setDraftFilter((prev) => ({
      ...prev,
      [key]: event.target.value
    }));
    setActiveQuickRange("");
  };

  const handleQuickRangeSelect = (rangeKey) => {
    const nextFilter = {
      field: "deposited_at",
      ...buildQuickRangeDates(rangeKey)
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
    const nextFilter = createDefaultDepositFilterState();

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
        title="입금일 필터"
        description="입금완료된 제출만 대상으로 하며, 입금일 범위를 변경하면 정산용 행 수와 다운로드 결과가 함께 갱신됩니다."
        fieldOptions={DEPOSIT_FIELD_OPTIONS}
        fieldValue="deposited_at"
        onFieldChange={() => {}}
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
        emptyHint={`선택한 기간(${appliedRangeSummary})에 맞는 입금완료 데이터가 없습니다. 기간을 넓히거나 조회 범위를 내 회사 전체로 바꿔 보세요.`}
        columnSelection={columnSelection}
      />
    </ExportPageLayout>
  );
}
