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
  EXPORT_QUICK_RANGE_OPTIONS,
  getAppliedDateRangeSummary,
  isSameDateFilter
} from "../../utils/exportDateFilters";
import { EXPORT_COLUMN_PRESET } from "../../utils/exportColumns";
import { buildExportFilename } from "../../utils/exportFile";

const DEPOSIT_FIELD_OPTIONS = [{ key: "deposited_at", label: "입금일" }];

function createDefaultDepositFilterState() {
  return createDefaultDateFilterState("deposited_at", DEFAULT_EXPORT_QUICK_RANGE);
}

export default function AdminExportByDepositDatePage() {
  const [draftFilter, setDraftFilter] = useState(() => createDefaultDepositFilterState());
  const [appliedFilter, setAppliedFilter] = useState(() => createDefaultDepositFilterState());
  const [activeQuickRange, setActiveQuickRange] = useState(DEFAULT_EXPORT_QUICK_RANGE);
  const columnSelection = useExportColumnSelection({
    storageKey: "review_manager_export_columns_by_deposit_date",
    defaultPreset: EXPORT_COLUMN_PRESET.SETTLEMENT
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
    depositOnly: true,
    selectedColumnKeys: columnSelection.selectedColumnKeys
  });

  const isColumnEmpty = columnSelection.selectedColumnKeys.length === 0;
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
      title="입금일 기준 내보내기"
      description="입금완료된 제출만 입금일 범위로 걸러 정산용 Excel로 내보냅니다."
      scopeMessage={scopeMessage}
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

      {errorMessage && <p className="login-error">{errorMessage}</p>}
      <ExportToolbar
        productCount={productCount}
        submissionCount={submissionCount}
        exportRowCount={exportRows.length}
        isLoading={isLoading}
      >
        <ExportDownloadButton
          filename={buildExportFilename("입금일기준")}
          sheetName="입금일 기준"
          rows={exportRows}
          disabled={isColumnEmpty}
          isLoading={isLoading}
          emptyMessage="선택한 입금일 범위에 맞는 정산 데이터가 없습니다."
        />
      </ExportToolbar>
      {hasNoSubmissions && (
        <p className="export-empty-hint">
          선택한 기간({appliedRangeSummary})에 맞는 입금완료 데이터가 없습니다. 기간을 넓히거나 회사 데이터 포함 옵션을 확인해 주세요.
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
