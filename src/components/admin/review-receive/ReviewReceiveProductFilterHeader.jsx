function FilterIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M2 3h12l-4.7 5.4v3.2L6.7 13V8.4L2 3Z" fill="currentColor" />
    </svg>
  );
}

export default function ReviewReceiveProductFilterHeader({
  column,
  filterValue,
  isOpen,
  onOpenChange,
  onFilterChange,
  onFilterReset,
  menuRef
}) {
  const isDateRange = column.type === "dateRange";
  const isActive = isDateRange ? Boolean(filterValue?.start || filterValue?.end) : String(filterValue ?? "").trim() !== "";
  const handleTextFilterInput = (event) => {
    onFilterChange(column.key, event.currentTarget.value);
  };

  return (
    <th
      className={`review-receive-filterable-header${isDateRange ? " is-date-range" : ""}${isOpen ? " is-open" : ""}${isActive ? " is-filtered" : ""}`}
    >
      <div className="review-receive-column-filter" ref={isOpen ? menuRef : null}>
        <span className="review-receive-column-label">{column.label}</span>
        <button
          type="button"
          className="review-receive-column-filter-button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenChange(isOpen ? "" : column.key);
          }}
          aria-label={`${column.label} 필터 열기`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          <FilterIcon />
        </button>
        {isOpen && (
          <div className="review-receive-column-filter-popover" role="dialog" aria-label={`${column.label} 필터`}>
            <div className="review-receive-column-filter-title">{column.label} 필터</div>
            {isDateRange ? (
              <div className="review-receive-date-filter-fields">
                <label>
                  <span>시작일</span>
                  <input
                    type="date"
                    className="table-cell-input"
                    value={filterValue?.start ?? ""}
                    onChange={(event) =>
                      onFilterChange(column.key, {
                        ...(filterValue ?? { start: "", end: "" }),
                        start: event.target.value
                      })
                    }
                  />
                </label>
                <label>
                  <span>종료일</span>
                  <input
                    type="date"
                    className="table-cell-input"
                    value={filterValue?.end ?? ""}
                    onChange={(event) =>
                      onFilterChange(column.key, {
                        ...(filterValue ?? { start: "", end: "" }),
                        end: event.target.value
                      })
                    }
                  />
                </label>
              </div>
            ) : (
              <input
                type="text"
                className="table-cell-input"
                value={filterValue ?? ""}
                onInput={handleTextFilterInput}
                onChange={handleTextFilterInput}
                placeholder={`${column.label} 검색`}
                autoFocus
              />
            )}
            <div className="review-receive-column-filter-actions">
              <button type="button" className="admin-secondary-button" onClick={() => onFilterReset(column.key)}>
                초기화
              </button>
              <button type="button" className="admin-primary-button" onClick={() => onOpenChange("") }>
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </th>
  );
}
