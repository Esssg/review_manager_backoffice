import { EXPORT_COLUMN_PRESETS, EXPORT_COLUMNS } from "../../../utils/exportColumns";

export default function ExportColumnSelector({
  columns = EXPORT_COLUMNS,
  presets = EXPORT_COLUMN_PRESETS,
  activePreset,
  selectedColumnKeys,
  onPresetSelect,
  onColumnToggle,
  onSelectAll,
  onClear
}) {
  const selectedColumnSet = new Set(selectedColumnKeys);
  const selectedCount = selectedColumnKeys.length;

  return (
    <section className="export-panel" aria-label="내보내기 컬럼 선택">
      <div className="export-panel-header">
        <div>
          <h2>컬럼 선택</h2>
          <p>Excel 파일에 포함할 컬럼을 선택하세요.</p>
          <p className="dashboard-meta export-selection-meta" aria-live="polite">
            현재 {selectedCount}개 선택됨
          </p>
        </div>
        <div className="export-column-actions">
          <button type="button" className="admin-secondary-button" onClick={onSelectAll}>
            전체 선택
          </button>
          <button type="button" className="admin-secondary-button" onClick={onClear}>
            선택 해제
          </button>
        </div>
      </div>

      <div className="export-preset-list" aria-label="컬럼 프리셋">
        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className={`export-preset-button${activePreset === preset.key ? " active" : ""}`}
            aria-pressed={activePreset === preset.key}
            onClick={() => onPresetSelect(preset.key)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="export-column-grid">
        {columns.map((column) => (
          <label key={column.key} className="export-column-option">
            <input
              type="checkbox"
              checked={selectedColumnSet.has(column.key)}
              onChange={() => onColumnToggle(column.key)}
            />
            <span>{column.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
