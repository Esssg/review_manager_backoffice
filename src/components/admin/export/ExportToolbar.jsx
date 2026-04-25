export default function ExportToolbar({
  productCount = 0,
  submissionCount = 0,
  exportRowCount = 0,
  summaryItems,
  isLoading = false,
  children
}) {
  const resolvedSummaryItems =
    summaryItems && summaryItems.length > 0
      ? summaryItems
      : [`상품 ${productCount}건`, `제출 ${submissionCount}건`, `내보내기 행 ${exportRowCount}건`];

  return (
    <div className="export-toolbar" aria-label="내보내기 요약 및 동작">
      <div className="export-toolbar-stats" role="status" aria-live="polite">
        {isLoading ? (
          <span className="export-toolbar-loading">데이터를 불러오는 중...</span>
        ) : (
          <>
            {resolvedSummaryItems.map((item, index) => (
              <span key={`${item}-${index}`}>
                {index > 0 && (
                  <span className="export-toolbar-dot" aria-hidden="true">
                    {" "}
                    ·{" "}
                  </span>
                )}
                {item}
              </span>
            ))}
          </>
        )}
      </div>
      <div className="export-toolbar-actions">{children}</div>
    </div>
  );
}
