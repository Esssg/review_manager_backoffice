import { EXPORT_COLUMN_PRESETS, EXPORT_COLUMNS } from "@/utils/exportColumns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

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
    <Card className="export-panel" aria-label="내보내기 컬럼 선택">
      <div className="export-panel-header">
        <div>
          <h2>컬럼 선택</h2>
          <p>Excel 파일에 포함할 컬럼을 선택하세요.</p>
          <p className="dashboard-meta export-selection-meta" aria-live="polite">
            현재 {selectedCount}개 선택됨
          </p>
        </div>
        <div className="export-column-actions">
          <Button type="button" variant="outline" className="admin-secondary-button" onClick={onSelectAll}>
            전체 선택
          </Button>
          <Button type="button" variant="outline" className="admin-secondary-button" onClick={onClear}>
            선택 해제
          </Button>
        </div>
      </div>

      <div className="export-preset-list" aria-label="컬럼 프리셋">
        {presets.map((preset) => (
          <Button
            key={preset.key}
            type="button"
            variant="outline"
            className={`export-preset-button${activePreset === preset.key ? " active" : ""}`}
            aria-pressed={activePreset === preset.key}
            onClick={() => onPresetSelect(preset.key)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="export-column-grid">
        {columns.map((column) => (
          <label key={column.key} className="export-column-option">
            <Checkbox
              checked={selectedColumnSet.has(column.key)}
              onCheckedChange={() => onColumnToggle(column.key)}
            />
            <span>{column.label}</span>
          </label>
        ))}
      </div>
    </Card>
  );
}
