import ExportFilterPanel from "@/components/admin/export/ExportFilterPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export default function ExportDateFilterPanel({
  title = "일자 필터",
  description,
  fieldOptions,
  fieldValue,
  onFieldChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  quickRangeOptions,
  activeQuickRange,
  onQuickRangeSelect,
  onApply,
  onReset,
  applyLabel = "조회하기",
  resetLabel = "초기화",
  applyDisabled = false,
  statusText,
  pendingMessage,
  errorMessage
}) {
  return (
    <ExportFilterPanel title={title} description={description}>
      <div className="export-date-filter-layout">
        <RadioGroup
          className="export-date-field-group"
          value={fieldValue}
          onValueChange={(value) => onFieldChange({ target: { value } })}
          aria-label="일자 기준 선택"
        >
          {fieldOptions.map((option) => (
            <label key={option.key} className="export-date-radio">
              <RadioGroupItem
                value={option.key}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </RadioGroup>

        <div className="export-date-input-row">
          <label className="export-date-input">
            <span>시작일</span>
            <Input type="date" value={startDate} onChange={onStartDateChange} />
          </label>
          <label className="export-date-input">
            <span>종료일</span>
            <Input type="date" value={endDate} onChange={onEndDateChange} />
          </label>
        </div>

        <div className="export-quick-range-list" aria-label="빠른 기간 선택">
          {quickRangeOptions.map((option) => (
            <Button
              key={option.key}
              type="button"
              variant="outline"
              className={`export-quick-range-button${activeQuickRange === option.key ? " active" : ""}`}
              onClick={() => onQuickRangeSelect(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="export-date-filter-actions">
          <Button type="button" className="admin-primary-button" onClick={onApply} disabled={applyDisabled}>
            {applyLabel}
          </Button>
          <Button type="button" variant="outline" className="admin-secondary-button" onClick={onReset}>
            {resetLabel}
          </Button>
        </div>

        <div className="export-date-filter-status" aria-live="polite">
          {statusText && <p className="dashboard-meta">현재 적용된 조건: {statusText}</p>}
          {pendingMessage && !errorMessage && <p className="login-message">{pendingMessage}</p>}
          {errorMessage && <p className="login-error">{errorMessage}</p>}
        </div>
      </div>
    </ExportFilterPanel>
  );
}
