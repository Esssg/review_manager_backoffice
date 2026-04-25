function formatCount(value) {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}건`;
}

export default function DashboardCompanyMembers({
  adminId,
  includeCompanyData,
  scopeInfo,
  members = [],
  isLoading = false
}) {
  if (!includeCompanyData || !scopeInfo?.companyName) {
    return null;
  }

  return (
    <section className="dashboard-company-panel" aria-label="회사 멤버 비교">
      <div className="dashboard-section-heading">
        <div>
          <h2>회사 멤버 비교</h2>
          <p>{scopeInfo.companyName} 소속 관리자별 운영 상품과 제출 현황입니다.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="dashboard-trend-empty">회사 멤버 데이터를 불러오는 중입니다.</div>
      ) : members.length > 0 ? (
        <div className="dashboard-company-table-wrap">
          <table className="dashboard-company-table">
            <thead>
              <tr>
                <th>관리자</th>
                <th>운영 상품</th>
                <th>활성 제출</th>
                <th>완료 제출</th>
                <th>전체 제출</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isCurrentAdmin = member.loginId === adminId;

                return (
                  <tr key={member.loginId} className={isCurrentAdmin ? "is-current-admin" : ""}>
                    <td>
                      <strong>{member.username || member.loginId}</strong>
                      <span>{isCurrentAdmin ? "현재 계정" : member.loginId}</span>
                    </td>
                    <td>{formatCount(member.productCount)}</td>
                    <td>{formatCount(member.activeSubmissionCount)}</td>
                    <td>{formatCount(member.completeSubmissionCount)}</td>
                    <td>{formatCount(member.submissionCount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dashboard-trend-empty">표시할 회사 멤버 데이터가 없습니다.</div>
      )}
    </section>
  );
}
