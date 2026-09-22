import { ArrowDown, ArrowUp, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableHead } from "@/components/ui/table";

export default function ReviewReceiveFilterHeader({
  sectionKey = "",
  column,
  filterValue,
  isOpen,
  onOpenChange,
  onFilterChange,
  onFilterReset,
  menuRef,
  sortState = [],
  onSortChange = () => {}
}) {
  const isDateRange = column.type === "dateRange";
  const isActive = isDateRange ? Boolean(filterValue?.start || filterValue?.end) : String(filterValue ?? "").trim() !== "";
  const filterKey = sectionKey ? `${sectionKey}:${column.key}` : column.key;
  const normalizedSortState = Array.isArray(sortState) ? sortState : [];
  const sortIndex = normalizedSortState.findIndex((entry) => entry?.key === column.key);
  const sortEntry = sortIndex === -1 ? null : normalizedSortState[sortIndex];
  const sortPriority = sortIndex === -1 ? null : sortIndex + 1;
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

  const emitSortChange = (direction) => {
    onSortChange(column.key, direction);
    onOpenChange("");
  };

  return (
    <TableHead
      className={`review-receive-filterable-header${isDateRange ? " is-date-range" : ""}${isOpen ? " is-open" : ""}${isActive ? " is-filtered" : ""}`}
    >
      <div className="review-receive-column-filter" ref={isOpen ? menuRef : null}>
        <span className="review-receive-column-label">{column.label}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={`review-receive-column-filter-button${sortEntry ? " is-sorted" : ""}`}
              onClick={(event) => event.stopPropagation()}
              aria-label={`${column.label} 정렬 및 필터 메뉴 열기`}
            >
              <MoreVertical aria-hidden="true" focusable="false" />
              {sortPriority ? <span className="review-receive-sort-priority">{sortPriority}</span> : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="review-receive-column-menu-content">
            <DropdownMenuLabel>{column.label} 정렬</DropdownMenuLabel>
            <DropdownMenuItem
              className={`review-receive-sort-menu-item${sortEntry?.direction === "asc" ? " is-selected" : ""}`}
              onSelect={() => emitSortChange("asc")}
            >
              <ArrowUp aria-hidden="true" focusable="false" />
              <span>{sortPriority ? `${sortPriority}순위 ` : ""}오름차순 정렬</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className={`review-receive-sort-menu-item${sortEntry?.direction === "desc" ? " is-selected" : ""}`}
              onSelect={() => emitSortChange("desc")}
            >
              <ArrowDown aria-hidden="true" focusable="false" />
              <span>{sortPriority ? `${sortPriority}순위 ` : ""}내림차순 정렬</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onOpenChange(isOpen ? "" : filterKey)}>
              필터 입력
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
