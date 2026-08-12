import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableHead } from "@/components/ui/table";

function FilterIcon() {
  return <Filter aria-hidden="true" focusable="false" />;
}

export default function ReviewReceiveFilterHeader({
  sectionKey = "",
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
  const filterKey = sectionKey ? `${sectionKey}:${column.key}` : column.key;
  const emitFilterChange = (value) => {
    if (sectionKey) {
      onFilterChange(sectionKey, column.key, value);
      return;
    }

    onFilterChange(column.key, value);
  };
  const emitFilterReset = () => {
    if (sectionKey) {
      onFilterReset(sectionKey, column.key);
      return;
    }

    onFilterReset(column.key);
  };

  return (
    <TableHead
      className={`review-receive-filterable-header${isDateRange ? " is-date-range" : ""}${isOpen ? " is-open" : ""}${isActive ? " is-filtered" : ""}`}
    >
      <div className="review-receive-column-filter" ref={isOpen ? menuRef : null}>
        <span className="review-receive-column-label">{column.label}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="review-receive-column-filter-button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenChange(isOpen ? "" : filterKey);
          }}
          aria-label={`${column.label} 필터 열기`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          <FilterIcon />
        </Button>
        {isOpen && (
          <div className="review-receive-column-filter-popover" role="dialog" aria-label={`${column.label} 필터`}>
            <div className="review-receive-column-filter-title">{column.label} 필터</div>
            {isDateRange ? (
              <div className="review-receive-date-filter-fields">
                <Label>
                  <span>시작일</span>
                  <Input
                    type="date"
                    className="table-cell-input"
                    value={filterValue?.start ?? ""}
                    onChange={(event) =>
                      emitFilterChange({
                        ...(filterValue ?? { start: "", end: "" }),
                        start: event.target.value
                      })
                    }
                  />
                </Label>
                <Label>
                  <span>종료일</span>
                  <Input
                    type="date"
                    className="table-cell-input"
                    value={filterValue?.end ?? ""}
                    onChange={(event) =>
                      emitFilterChange({
                        ...(filterValue ?? { start: "", end: "" }),
                        end: event.target.value
                      })
                    }
                  />
                </Label>
              </div>
            ) : (
              <Input
                type="text"
                className="table-cell-input"
                value={filterValue ?? ""}
                onChange={(event) => emitFilterChange(event.currentTarget.value)}
                placeholder={`${column.label} 검색`}
                autoFocus
              />
            )}
            <div className="review-receive-column-filter-actions">
              <Button type="button" variant="outline" className="admin-secondary-button" onClick={emitFilterReset}>
                초기화
              </Button>
              <Button type="button" className="admin-primary-button" onClick={() => onOpenChange("")}>
                닫기
              </Button>
            </div>
          </div>
        )}
      </div>
    </TableHead>
  );
}
