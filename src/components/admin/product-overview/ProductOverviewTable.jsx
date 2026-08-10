import { useEffect, useRef, useState } from "react";
import ProductLinkCopy from "../../common/ProductLinkCopy";
import { PRODUCT_OVERVIEW_PAGE_SIZE } from "../../../services/productOverview";
import { PRODUCT_OVERVIEW_COLUMNS } from "../../../utils/productOverviewRows";
import { getPhotoId, getPhotoUrl } from "../../../utils/photoItems";

const PRODUCT_OVERVIEW_DROPDOWN_COLUMN_TYPES = new Set(["photo", "boolean"]);
const PRODUCT_OVERVIEW_FILTER_DROPDOWN_LABELS = {
  review_photos: {
    "": "전체",
    has: "사진 있음",
    none: "사진없음"
  },
  is_review_verified: {
    "": "전체",
    true: "예",
    false: "아니오"
  },
  is_deposit_verified: {
    "": "전체",
    true: "예",
    false: "아니오"
  }
};
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
          <button
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
          </button>
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
    return isReadOnly ? formatCellValue(row[column.key], column.type) : <ProductLinkCopy value={row[column.key]} />;
  }

  return formatCellValue(row[column.key], column.type);
}

export function ProductOverviewTable({
  rows,
  filters,
  onFilterChange,
  emptyMessage,
  onOpenPhotoViewer,
  selectedSubmissionIds = new Set(),
  onToggleRowSelection = () => {},
  onToggleAllSelection = () => {},
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
  const [openFilterKey, setOpenFilterKey] = useState("");
  const filterDropdownRef = useRef(null);

  useEffect(() => {
    if (!openFilterKey) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!filterDropdownRef.current?.contains(event.target)) {
        setOpenFilterKey("");
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpenFilterKey("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openFilterKey]);

  return (
    <div className={`table-scroll-wrap product-overview-table-wrap ${wrapClassName}`.trim()}>
      <table className="review-receive-table product-overview-table">
        <thead>
          <tr>
            {showSelection && (
              <th className="product-overview-selection-column">
                <label
                  className="pretty-checkbox product-overview-selection-control"
                  onClick={(event) => event.stopPropagation()}
                  aria-label="현재 필터 결과 전체 선택"
                >
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(event) => onToggleAllSelection(rows, event.target.checked)}
                  />
                  <span className="checkmark" aria-hidden="true" />
                </label>
              </th>
            )}
            {PRODUCT_OVERVIEW_COLUMNS.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
          <tr className="product-overview-filter-row">
            {showSelection && <th className="product-overview-selection-column" />}
            {PRODUCT_OVERVIEW_COLUMNS.map((column) => (
              <th key={`${column.key}-filter`}>
                {PRODUCT_OVERVIEW_DROPDOWN_COLUMN_TYPES.has(column.type) ? (
                  <div
                    className="product-overview-filter-dropdown"
                    ref={openFilterKey === column.key ? filterDropdownRef : null}
                  >
                    <button
                      type="button"
                      className={`table-cell-input product-overview-filter-input product-overview-filter-trigger${openFilterKey === column.key ? " is-open" : ""}`}
                      onClick={() => setOpenFilterKey((prev) => (prev === column.key ? "" : column.key))}
                      aria-haspopup="listbox"
                      aria-expanded={openFilterKey === column.key}
                      aria-label={`${column.label} 필터`}
                    >
                      <span>
                        {PRODUCT_OVERVIEW_FILTER_DROPDOWN_LABELS[column.key]?.[filters[column.key] ?? ""] ?? "전체"}
                      </span>
                      <span className="product-overview-filter-trigger-arrow" aria-hidden="true">
                        ▾
                      </span>
                    </button>
                    {openFilterKey === column.key && (
                      <div className="product-overview-filter-menu" role="listbox" aria-label={`${column.label} 필터 옵션`}>
                        {PRODUCT_OVERVIEW_FILTER_DROPDOWN_OPTIONS[column.key].map((option) => (
                          <button
                            key={option.value || "all"}
                            type="button"
                            className={`product-overview-filter-option${(filters[column.key] ?? "") === option.value ? " is-selected" : ""}`}
                            onClick={() => {
                              onFilterChange(column.key, option.value);
                              setOpenFilterKey("");
                            }}
                            role="option"
                            aria-selected={(filters[column.key] ?? "") === option.value}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    className="table-cell-input product-overview-filter-input"
                    value={filters[column.key] ?? ""}
                    onChange={(event) => onFilterChange(column.key, event.target.value)}
                    placeholder="필터"
                    aria-label={`${column.label} 필터`}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount}>{emptyMessage}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={`${row.product_id}-${row.submission_id}`}
                className={`review-receive-row${showSelection ? " clickable-row" : ""}${selectedSubmissionIds.has(row.submission_id) ? " is-selected" : ""}`}
                onClick={showSelection ? () => onToggleRowSelection(row.submission_id) : undefined}
              >
                {showSelection && (
                  <td className="product-overview-selection-column">
                    <label
                      className="pretty-checkbox product-overview-selection-control"
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`${row.assign_name || row.order_number || row.submission_id} 행 선택`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSubmissionIds.has(row.submission_id)}
                        onChange={() => onToggleRowSelection(row.submission_id)}
                      />
                      <span className="checkmark" aria-hidden="true" />
                    </label>
                  </td>
                )}
                {PRODUCT_OVERVIEW_COLUMNS.map((column) => (
                  <td
                    key={`${row.submission_id}-${column.key}`}
                    className={column.type === "photo" ? "product-overview-photo-cell" : ""}
                  >
                    {renderOverviewCell(row, column, onOpenPhotoViewer, isReadOnly)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
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
