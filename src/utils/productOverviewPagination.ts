// @ts-nocheck

export function normalizeProductOverviewTotalCount(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function sliceProductOverviewPage(rows, pageSize) {
  const normalizedPageSize = Math.max(1, Number(pageSize) || 1);
  const pageRows = (rows ?? []).slice(0, normalizedPageSize);
  const remainingCount = normalizeProductOverviewTotalCount(rows?.[0]?.total_count);

  return {
    pageRows,
    remainingCount,
    hasMore: remainingCount > pageRows.length
  };
}
