export const EXPORT_DATE_FIELD_OPTIONS = [
  { key: "created_at", label: "제출 등록일" },
  { key: "deposited_at", label: "입금일" }
];

export const EXPORT_QUICK_RANGE_OPTIONS = [
  { key: "today", label: "오늘" },
  { key: "last_7_days", label: "7일" },
  { key: "last_30_days", label: "30일" },
  { key: "this_month", label: "이번 달" }
];

export const DEFAULT_EXPORT_DATE_FIELD = "created_at";
export const DEFAULT_EXPORT_QUICK_RANGE = "last_30_days";

export function formatExportDateInput(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const yearText = String(date.getFullYear());
  const monthText = String(date.getMonth() + 1).padStart(2, "0");
  const dayText = String(date.getDate()).padStart(2, "0");
  return `${yearText}-${monthText}-${dayText}`;
}

export function buildQuickRangeDates(rangeKey, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate = today;

  if (rangeKey === "today") {
    startDate = today;
  } else if (rangeKey === "last_7_days") {
    startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  } else if (rangeKey === "this_month") {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  } else {
    startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  }

  return {
    startDate: formatExportDateInput(startDate),
    endDate: formatExportDateInput(today)
  };
}

export function createDefaultDateFilterState(defaultField = DEFAULT_EXPORT_DATE_FIELD, defaultQuickRange = DEFAULT_EXPORT_QUICK_RANGE) {
  return {
    field: defaultField,
    ...buildQuickRangeDates(defaultQuickRange)
  };
}

export function getExportDateFieldLabel(fieldKey, fieldOptions = EXPORT_DATE_FIELD_OPTIONS) {
  return fieldOptions.find((option) => option.key === fieldKey)?.label ?? "일자";
}

export function getAppliedDateRangeSummary(filterState, fieldOptions = EXPORT_DATE_FIELD_OPTIONS) {
  const fieldLabel = getExportDateFieldLabel(filterState.field, fieldOptions);
  const startLabel = filterState.startDate || "전체";
  const endLabel = filterState.endDate || "전체";

  return `${fieldLabel} 기준 ${startLabel} ~ ${endLabel}`;
}

export function isSameDateFilter(left, right) {
  return left.field === right.field && left.startDate === right.startDate && left.endDate === right.endDate;
}
