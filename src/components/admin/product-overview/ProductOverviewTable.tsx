import { memo } from "react";
import ProductLinkCopy from "@/components/common/ProductLinkCopy";
import { PRODUCT_OVERVIEW_PAGE_SIZE } from "@/services/productOverview";
import { PRODUCT_OVERVIEW_COLUMNS } from "@/utils/productOverviewRows";
import { getPhotoId, getPhotoUrl } from "@/utils/photoItems";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

const PRODUCT_OVERVIEW_DROPDOWN_COLUMN_TYPES = new Set(["photo", "boolean"]);
const PRODUCT_OVERVIEW_FILTER_DROPDOWN_OPTIONS = {
  review_photos: [
    { value: "", label: "전체" },
    { value: "has", label: "사진 있음" },
    { value: "none", label: "사진없음" }
  ],
  is_review_verified: [
    { value: "", label: "전체" },
    { value: "true", label: "예" },
    { value: "false", label: "아니오" }
  ],
  is_deposit_verified: [
    { value: "", label: "전체" },
    { value: "true", label: "예" },
    { value: "false", label: "아니오" }
  ]
};
const EMPTY_SELECTION_IDS = new Set();
const NOOP = (..._args: any[]) => {};

function formatCellValue(value, type) {
  if (value == null || value === "") {
    return "-";
  }

  if (type === "boolean") {
    return value ? "예" : "아니오";
  }

  if (type === "photo") {
    return Array.isArray(value) && value.length > 0 ? "제출 완료" : "제출 전";
  }

  return String(value);
}

function renderOverviewPhotoCell(row, onOpenPhotoViewer, isReadOnly) {
  const rowPhotos = Array.isArray(row.review_photos) ? row.review_photos : [];

  if (rowPhotos.length === 0) {
    return <span>제출 전</span>;
  }

  if (isReadOnly) {
    return <span>제출 완료</span>;
  }

  return (
    <div className="photo-link-list">
      {rowPhotos.map((photo, index) => {
        const url = getPhotoUrl(photo);

        return (
          <Button
            variant="ghost"
            key={`${row.submission_id}-${getPhotoId(photo) ?? url}-${index}`}
            type="button"
            className="photo-thumb-button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenPhotoViewer(rowPhotos, index);
            }}
            aria-label={`리뷰 사진 ${index + 1} 열기`}
          >
            <img src={url} alt={`리뷰 사진 ${index + 1}`} className="photo-thumb-image" loading="lazy" />
          </Button>
        );
      })}
    </div>
  );
}

function renderOverviewCell(row, column, onOpenPhotoViewer, isReadOnly = false) {
  if (column.type === "photo") {
    return renderOverviewPhotoCell(row, onOpenPhotoViewer, isReadOnly);
  }

  if (column.key === "product_link") {
    return isReadOnly ? formatCellValue(row[column.key], column.type) : <ProductLinkCopy value={row[column.key]} displayValue={row[column.key]} />;
  }

  return formatCellValue(row[column.key], column.type);
}

const ProductOverviewTableRow = memo(function ProductOverviewTableRow({
  row,
  isSelected,
  showSelection,
  isReadOnly,
  onOpenPhotoViewer = NOOP,
  onToggleRowSelection
}: {
  row: any;
  isSelected: boolean;
  showSelection: boolean;
  isReadOnly: boolean;
  onOpenPhotoViewer: (...args: any[]) => void;
  onToggleRowSelection: (submissionId: any) => void;
}) {
  return (
    <TableRow
      className={`review-receive-row${showSelection ? " clickable-row" : ""}${isSelected ? " is-selected" : ""}`}
      onClick={showSelection ? () => onToggleRowSelection(row.submission_id) : undefined}
    >
      {showSelection && (
        <TableCell className="product-overview-selection-column">
          <label
            className="pretty-checkbox product-overview-selection-control"
            onClick={(event) => event.stopPropagation()}
            aria-label={`${row.assign_name || row.order_number || row.submission_id} 행 선택`}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleRowSelection(row.submission_id)}
              aria-label={`${row.assign_name || row.order_number || row.submission_id} 행 선택`}
            />
          </label>
        </TableCell>
      )}
      {PRODUCT_OVERVIEW_COLUMNS.map((column) => (
        <TableCell
          key={`${row.submission_id}-${column.key}`}
          className={column.type === "photo" ? "product-overview-photo-cell" : ""}
        >
          {renderOverviewCell(row, column, onOpenPhotoViewer, isReadOnly)}
        </TableCell>
      ))}
    </TableRow>
  );
});

export function ProductOverviewTable({
  rows,
  filters,
  onFilterChange,
  emptyMessage,
  onOpenPhotoViewer = NOOP,
  selectedSubmissionIds = EMPTY_SELECTION_IDS,
  onToggleRowSelection = NOOP,
  onToggleAllSelection = NOOP,
  showSelection = true,
  isReadOnly = false,
  isAllMatchingSelected = false,
  isAllMatchingSelectionActive = false,
  loadMoreRef = null,
  isLoadingMore = false,
  hasMore = false,
  loadedCount = rows.length,
  totalCount = rows.length,
  wrapClassName = ""
}) {
  const columnCount = PRODUCT_OVERVIEW_COLUMNS.length + (showSelection ? 1 : 0);
  const isAllSelected =
    rows.length > 0 &&
    (isAllMatchingSelected ||
      (!isAllMatchingSelectionActive && rows.every((row) => selectedSubmissionIds.has(row.submission_id))));
  return (
    <div className={`table-scroll-wrap product-overview-table-wrap ${wrapClassName}`.trim()}>
      <Table className="review-receive-table product-overview-table">
        <TableHeader>
          <TableRow>
            {showSelection && (
              <TableHead className="product-overview-selection-column">
                <label
                  className="pretty-checkbox product-overview-selection-control"
                  onClick={(event) => event.stopPropagation()}
                  aria-label="현재 필터 결과 전체 선택"
                >
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={(checked) => onToggleAllSelection(rows, checked === true)}
                    aria-label="현재 필터 결과 전체 선택"
                  />
                </label>
              </TableHead>
            )}
            {PRODUCT_OVERVIEW_COLUMNS.map((column) => (
              <TableHead key={column.key}>{column.label}</TableHead>
            ))}
          </TableRow>
          <TableRow className="product-overview-filter-row">
            {showSelection && <TableHead className="product-overview-selection-column" />}
            {PRODUCT_OVERVIEW_COLUMNS.map((column) => (
              <TableHead key={`${column.key}-filter`}>
                {PRODUCT_OVERVIEW_DROPDOWN_COLUMN_TYPES.has(column.type) ? (
                  <Select
                    value={filters[column.key] || "all"}
                    onValueChange={(value) => onFilterChange(column.key, value === "all" ? "" : value)}
                  >
                    <SelectTrigger
                      size="sm"
                      className="table-cell-input product-overview-filter-input product-overview-filter-trigger"
                      aria-label={`${column.label} 필터`}
                    >
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      {(PRODUCT_OVERVIEW_FILTER_DROPDOWN_OPTIONS[column.key] ?? []).map((option) => (
                        <SelectItem key={option.value || "all"} value={option.value || "all"}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type="text"
                    className="table-cell-input product-overview-filter-input"
                    value={filters[column.key] ?? ""}
                    onChange={(event) => onFilterChange(column.key, event.target.value)}
                    placeholder="필터"
                    aria-label={`${column.label} 필터`}
                  />
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount}>{emptyMessage}</TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <ProductOverviewTableRow
                key={`${row.product_id}-${row.submission_id}`}
                row={row}
                isSelected={selectedSubmissionIds.has(row.submission_id)}
                showSelection={showSelection}
                isReadOnly={isReadOnly}
                onOpenPhotoViewer={onOpenPhotoViewer}
                onToggleRowSelection={onToggleRowSelection}
              />
            ))
          )}
        </TableBody>
      </Table>
      <div ref={loadMoreRef} className="review-receive-list-load-more product-overview-list-load-more">
        {isLoadingMore
          ? `다음 ${PRODUCT_OVERVIEW_PAGE_SIZE.toLocaleString()}건을 불러오는 중...`
          : hasMore
            ? `현재 ${loadedCount.toLocaleString()}건 표시 중 / 총 ${totalCount.toLocaleString()}건`
            : totalCount > 0
              ? `총 ${totalCount.toLocaleString()}건`
              : ""}
      </div>
    </div>
  );
}
