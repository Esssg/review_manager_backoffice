import DashboardAlerts from "../../components/admin/dashboard/DashboardAlerts";
import DashboardActivityPanels from "../../components/admin/dashboard/DashboardActivityPanels";
import DashboardCompanyMembers from "../../components/admin/dashboard/DashboardCompanyMembers";
import DashboardKpiGrid from "../../components/admin/dashboard/DashboardKpiGrid";
import DashboardTrendChart from "../../components/admin/dashboard/DashboardTrendChart";
import useAdminDashboard from "../../hooks/useAdminDashboard";

function formatDateTime(value) {
  if (!value) {
    return "아직 갱신 전";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function formatCount(value) {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}건`;
}

function formatCurrency(value) {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}원`;
}

export default function AdminDashboardPage() {
  const {
    includeCompanyData,
    handleIncludeCompanyDataChange,
    dashboardData,
    adminId,
    scopeInfo,
    scopeMessage,
    lastUpdatedAt,
    refreshDashboard,
    isLoading,
    errorMessage
  } = useAdminDashboard();

  const summary = dashboardData.metrics?.summary;
  const todaySummary = summary?.today;
  const cumulativeSummary = summary?.cumulative;
  const isEmpty =
    !isLoading &&
    !errorMessage &&
    dashboardData.products.length === 0 &&
    dashboardData.submissions.length === 0 &&
    dashboardData.applications.length === 0;

  const todayCards = [
    {
      title: "오늘 등록된 상품",
      value: formatCount(todaySummary?.productsCreated),
      description: `이번 달 누적 ${formatCount(todaySummary?.productsCreatedThisMonth)}`
    },
    {
      title: "오늘 추가된 제출",
      value: formatCount(todaySummary?.submissionsCreated),
      description: `어제 대비 ${Number(todaySummary?.submissionsCreatedDelta ?? 0).toLocaleString("ko-KR")}건`
    },
    {
      title: "오늘 리뷰 완료 처리",
      value: formatCount(todaySummary?.reviewVerifiedTotal),
      description: "현재 리뷰완료 처리된 제출 누적",
      note: "정확한 오늘 처리 수는 처리 시점 컬럼 추가 후 집계할 수 있습니다.",
      tone: "warning"
    },
    {
      title: "오늘 입금 완료",
      value: formatCount(todaySummary?.depositVerifiedCount),
      description: `오늘 입금 예정 합계 ${formatCurrency(todaySummary?.depositVerifiedAmountSum)}`
    },
    {
      title: "오늘 신규 신청자",
      value: formatCount(todaySummary?.applicationsCreated),
      description: `확정 ${formatCount(todaySummary?.applicationsConfirmed)} / 미확정 ${formatCount(
        todaySummary?.applicationsPending
      )}`
    },
    {
      title: "오늘 사진 업로드",
      value: formatCount(todaySummary?.photosUploaded),
      description: `리뷰 ${formatCount(todaySummary?.photosReviewUploaded)} / 구매 ${formatCount(
        todaySummary?.photosPurchaseUploaded
      )}`
    }
  ];

  const cumulativeCards = [
    {
      title: "운영 중인 상품 수",
      value: formatCount(cumulativeSummary?.productCount),
      description: `전체 제출 ${formatCount(cumulativeSummary?.submissionCount)}`
    },
    {
      title: "진행 중 제출 수",
      value: formatCount(cumulativeSummary?.purchaseCount),
      description: "구매완료 단계, 리뷰완료 전"
    },
    {
      title: "리뷰 완료 대기 입금",
      value: formatCount(cumulativeSummary?.reviewCount),
      description: "리뷰완료 후 입금완료 전",
      tone: "warning"
    },
    {
      title: "전체 완료 제출 수",
      value: formatCount(cumulativeSummary?.completeCount),
      description: "리뷰완료와 입금완료가 모두 처리됨",
      tone: "success"
    },
    {
      title: "미배정 제출 수",
      value: formatCount(cumulativeSummary?.unassignedCount),
      description: "배정명이 비어 있는 제출",
      tone: cumulativeSummary?.unassignedCount > 0 ? "warning" : "success"
    },
    {
      title: "사진 미제출",
      value: formatCount(cumulativeSummary?.missingReviewPhotoCount),
      description: "리뷰 사진이 없는 진행 중 제출",
      tone: cumulativeSummary?.missingReviewPhotoCount > 0 ? "warning" : "success"
    },
    {
      title: "입금 예정 합계",
      value: formatCurrency(cumulativeSummary?.expectedDepositSum),
      description: "진행 중/리뷰완료 제출 기준"
    },
    {
      title: "미정산 제출 수",
      value: formatCount(cumulativeSummary?.reviewCount),
      description: `입금 대기 ${cumulativeSummary?.pendingDepositThresholdDays ?? 7}일 이상 ${formatCount(
        cumulativeSummary?.pendingDepositLongCount
      )}`,
      tone: cumulativeSummary?.reviewCount > 0 ? "warning" : "success"
    }
  ];

  return (
    <>
      <header className="admin-header">
        <div>
          <h1>리뷰 매니저 대시보드</h1>
          <p>운영 현황을 실제 데이터 기준으로 확인합니다. 마지막 갱신: {formatDateTime(lastUpdatedAt)}</p>
          <p className="admin-scope-toggle-hint">{scopeMessage}</p>
        </div>
        <div className="admin-header-actions">
          <label className="pretty-checkbox admin-scope-toggle">
            <input type="checkbox" checked={includeCompanyData} onChange={handleIncludeCompanyDataChange} />
            <span className="checkmark" aria-hidden="true" />
            <span className="admin-scope-toggle-label">내 회사 데이터 포함</span>
          </label>
          <button type="button" className="admin-primary-button" onClick={refreshDashboard} disabled={isLoading}>
            {isLoading ? "불러오는 중" : "새로고침"}
          </button>
        </div>
      </header>

      {errorMessage ? (
        <section className="dashboard-panel" aria-label="대시보드 오류">
          <div className="empty-state">
            <strong>대시보드 데이터를 불러오지 못했습니다.</strong>
            <p>{errorMessage}</p>
            <button type="button" className="admin-primary-button" onClick={refreshDashboard}>
              다시 시도
            </button>
          </div>
        </section>
      ) : null}

      {!errorMessage ? (
        <>
          <DashboardKpiGrid
            title="오늘 핵심 지표"
            description="오늘 등록/제출/입금/사진 업로드 흐름을 빠르게 확인합니다."
            cards={todayCards}
            isLoading={isLoading}
          />

          <DashboardKpiGrid
            title="누적 운영 상태"
            description="현재 처리 단계와 운영상 확인이 필요한 항목을 요약합니다."
            cards={cumulativeCards}
            isLoading={isLoading}
          />

          <DashboardAlerts summary={summary} isLoading={isLoading} />

          <DashboardTrendChart
            products={dashboardData.products}
            submissions={dashboardData.submissions}
            isLoading={isLoading}
          />

          <DashboardActivityPanels
            metrics={dashboardData.metrics}
            products={dashboardData.products}
            isLoading={isLoading}
          />

          <DashboardCompanyMembers
            adminId={adminId}
            includeCompanyData={includeCompanyData}
            scopeInfo={scopeInfo}
            members={dashboardData.metrics?.companyMembers ?? []}
            isLoading={isLoading}
          />

          {isEmpty ? (
            <section className="dashboard-panel" aria-label="대시보드 빈 상태">
              <div className="empty-state">
                <strong>표시할 데이터가 없습니다.</strong>
                <p>상품 또는 제출 데이터가 등록되면 이곳에 운영 지표가 표시됩니다.</p>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
