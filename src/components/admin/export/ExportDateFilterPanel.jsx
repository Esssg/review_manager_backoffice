import ExportFilterPanel from "./ExportFilterPanel";

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
        <div className="export-date-field-group" role="radiogroup" aria-label="일자 기준 선택">
          {fieldOptions.map((option) => (
            <label key={option.key} className="export-date-radio">
              <input
                type="radio"
                name="export-date-field"
                value={option.key}
                checked={fieldValue === option.key}
                onChange={onFieldChange}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>

        <div className="export-date-input-row">
          <label className="export-date-input">
            <span>시작일</span>
            <input type="date" value={startDate} onChange={onStartDateChange} />
          </label>
          <label className="export-date-input">
            <span>종료일</span>
            <input type="date" value={endDate} onChange={onEndDateChange} />
          </label>
        </div>

        <div className="export-quick-range-list" aria-label="빠른 기간 선택">
          {quickRangeOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`export-quick-range-button${activeQuickRange === option.key ? " active" : ""}`}
              onClick={() => onQuickRangeSelect(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="export-date-filter-actions">
          <button type="button" className="admin-primary-button" onClick={onApply} disabled={applyDisabled}>
            {applyLabel}
          </button>
          <button type="button" className="admin-secondary-button" onClick={onReset}>
            {resetLabel}
          </button>
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
