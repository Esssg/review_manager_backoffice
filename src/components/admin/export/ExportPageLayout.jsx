export default function ExportPageLayout({
  title,
  description,
  scopeMessage,
  includeCompanyData,
  isCompanyScopeAvailable,
  onIncludeCompanyDataChange,
  showCompanyToggle = true,
  lastUpdatedAt,
  onRefresh,
  children
}) {
  return (
    <section className="admin-export-page">
      <div className="dashboard-panel export-page-header">
        <div>
          <p className="dashboard-eyebrow">내보내기</p>
          <h1>{title}</h1>
          <p>{description}</p>
          {scopeMessage && <p className="login-message">{scopeMessage}</p>}
          {lastUpdatedAt && (
            <p className="dashboard-meta">마지막 갱신: {lastUpdatedAt.toLocaleString("ko-KR")}</p>
          )}
        </div>
        <div className="export-header-actions">
          {showCompanyToggle && (
            <div className="export-company-toggle-wrap">
              <label className="dashboard-scope-toggle">
                <input
                  type="checkbox"
                  checked={includeCompanyData}
                  onChange={onIncludeCompanyDataChange}
                  disabled={!isCompanyScopeAvailable}
                />
                <span>회사 데이터 포함</span>
              </label>
              {!isCompanyScopeAvailable && (
                <p className="export-company-toggle-hint">관리자 프로필에 회사 정보가 없어 동일 회사 관리자 데이터를 함께 내보낼 수 없습니다.</p>
              )}
            </div>
          )}
          <button type="button" className="admin-secondary-button" onClick={onRefresh}>
            새로고침
          </button>
        </div>
      </div>

      <div className="admin-export-scroll">{children}</div>
    </section>
  );
}
