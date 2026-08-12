import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import AdminScopeCard from "@/components/common/AdminScopeCard";

export default function ExportPageLayout({
  adminId,
  adminProfile,
  title,
  description,
  scopeMessage,
  includeCompanyData = false,
  isCompanyScopeAvailable = false,
  onIncludeCompanyDataChange = (_event: any) => {},
  showCompanyToggle = true,
  lastUpdatedAt,
  onRefresh,
  children
}) {
  return (
    <section className="admin-export-page">
      <Card className="dashboard-panel export-page-header">
        <div>
          <p className="dashboard-eyebrow">내보내기</p>
          <h1>{title}</h1>
          <p>{description}</p>
          {lastUpdatedAt && (
            <p className="dashboard-meta">마지막 갱신: {lastUpdatedAt.toLocaleString("ko-KR")}</p>
          )}
        </div>
        <div className="export-header-actions">
          {showCompanyToggle && (
            <AdminScopeCard
              adminId={adminId}
              adminProfile={adminProfile}
              scopeMessage={scopeMessage}
              includeCompanyData={includeCompanyData}
              isCompanyScopeAvailable={isCompanyScopeAvailable}
              onIncludeCompanyDataChange={onIncludeCompanyDataChange}
              disableWhenUnavailable
            />
          )}
          <div className="export-header-refresh">
            <span className="admin-page-action-label">작업</span>
            <Button type="button" variant="outline" className="admin-secondary-button" onClick={onRefresh}>
              새로고침
            </Button>
          </div>
        </div>
      </Card>

      <div className="admin-export-scroll">{children}</div>
    </section>
  );
}
