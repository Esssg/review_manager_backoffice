import { useRef } from "react";
import { ProductOverviewTable } from "@/components/admin/product-overview/ProductOverviewTable";
import TableHorizontalScroll from "@/components/common/TableHorizontalScroll";
import { Badge } from "@/components/ui/badge";

export default function ProductOverviewSection({
  title,
  description = "",
  rows,
  filters,
  onFilterChange,
  onOpenPhotoViewer,
  selectedSubmissionIds,
  onToggleRowSelection,
  onToggleAllSelection,
  toolbar,
  countLabel,
  selectionSummary,
  isAllMatchingSelected,
  isAllMatchingSelectionActive,
  loadMoreRef,
  isLoadingMore,
  hasMore,
  loadedCount,
  totalCount,
  tableWrapClassName
}) {
  const tableScrollRef = useRef(null);

  return (
    <section className="dashboard-panel review-receive-section" aria-label={title}>
      <div className="review-receive-section-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <Badge variant="secondary" className="status-badge">
          {countLabel ?? `${rows.length}건`}
        </Badge>
      </div>

      {toolbar}
      <TableHorizontalScroll scrollTargetRef={tableScrollRef} ariaLabel={`${title} 표 가로 스크롤`} />
      {selectionSummary ? <p className="product-overview-selection-summary">{selectionSummary}</p> : null}

      <ProductOverviewTable
        rows={rows}
        filters={filters}
        onFilterChange={onFilterChange}
        onOpenPhotoViewer={onOpenPhotoViewer}
        selectedSubmissionIds={selectedSubmissionIds}
        onToggleRowSelection={onToggleRowSelection}
        onToggleAllSelection={onToggleAllSelection}
        isAllMatchingSelected={isAllMatchingSelected}
        isAllMatchingSelectionActive={isAllMatchingSelectionActive}
        loadMoreRef={loadMoreRef}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        loadedCount={loadedCount}
        totalCount={totalCount}
        emptyMessage={`${title} 상태의 제출 데이터가 없습니다.`}
        wrapClassName={tableWrapClassName}
        tableScrollRef={tableScrollRef}
      />
    </section>
  );
}
