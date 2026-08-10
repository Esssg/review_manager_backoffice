export function buildProductOverviewSelectionQueryKey({
  viewMode,
  status,
  filters,
  includeCompanyData
}) {
  return JSON.stringify({
    viewMode,
    status,
    filters,
    includeCompanyData
  });
}

export function buildSelectedProductOverviewSubmissionIds(rows, selection) {
  if (selection?.mode === "all_matching") {
    const excludedIdSet = new Set(selection.excludedIds ?? []);

    return new Set(
      (rows ?? [])
        .filter((row) => !excludedIdSet.has(row.submission_id))
        .map((row) => row.submission_id)
    );
  }

  return new Set(selection?.ids ?? []);
}
