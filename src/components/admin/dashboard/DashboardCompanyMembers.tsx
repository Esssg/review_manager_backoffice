import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

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
          <Table className="dashboard-company-table">
            <TableHeader>
              <TableRow>
                <TableHead>관리자</TableHead>
                <TableHead>운영 상품</TableHead>
                <TableHead>활성 제출</TableHead>
                <TableHead>완료 제출</TableHead>
                <TableHead>전체 제출</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isCurrentAdmin = member.loginId === adminId;

                return (
                  <TableRow key={member.loginId} className={isCurrentAdmin ? "is-current-admin" : ""}>
                    <TableCell>
                      <strong>{member.username || member.loginId}</strong>
                      {isCurrentAdmin ? (
                        <Badge variant="outline">현재 계정</Badge>
                      ) : (
                        <span>{member.loginId}</span>
                      )}
                    </TableCell>
                    <TableCell>{formatCount(member.productCount)}</TableCell>
                    <TableCell>{formatCount(member.activeSubmissionCount)}</TableCell>
                    <TableCell>{formatCount(member.completeSubmissionCount)}</TableCell>
                    <TableCell>{formatCount(member.submissionCount)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="dashboard-trend-empty">표시할 회사 멤버 데이터가 없습니다.</div>
      )}
    </section>
  );
}
