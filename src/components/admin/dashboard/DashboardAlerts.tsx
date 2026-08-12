import { Link } from "react-router-dom";

function formatCount(value) {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}건`;
}

function buildAlertItems(summary) {
  const cumulativeSummary = summary?.cumulative;

  if (!cumulativeSummary) {
    return [];
  }

  const alertItems = [];

  if (cumulativeSummary.unassignedCount > 0) {
    alertItems.push({
      title: "배정명이 비어 있는 제출이 있습니다.",
      description: `${formatCount(cumulativeSummary.unassignedCount)}의 제출에 배정명이 없습니다. 상품전체보기에서 배정 상태를 확인하세요.`,
      to: "/admin/product-overview/all",
      actionLabel: "상품전체보기로 이동"
    });
  }

  if (cumulativeSummary.missingReviewPhotoCount > 0) {
    alertItems.push({
      title: "리뷰 사진이 없는 진행 중 제출이 있습니다.",
      description: `${formatCount(cumulativeSummary.missingReviewPhotoCount)}의 진행 중 제출에 리뷰 사진이 없습니다.`,
      to: "/admin/product-overview/status",
      actionLabel: "상태별보기로 이동"
    });
  }

  if (cumulativeSummary.pendingDepositLongCount > 0) {
    alertItems.push({
      title: "오래 머무른 입금 대기 제출이 있습니다.",
      description: `${cumulativeSummary.pendingDepositThresholdDays}일 이상 입금 대기 상태인 제출이 ${formatCount(
        cumulativeSummary.pendingDepositLongCount
      )} 있습니다. 현재는 리뷰 완료 시점 컬럼이 없어 제출 생성일 기준으로 근사합니다.`,
      to: "/admin/product-overview/status",
      actionLabel: "입금 대기 확인"
    });
  }

  return alertItems;
}

export default function DashboardAlerts({ summary, isLoading = false }) {
  const alertItems = buildAlertItems(summary);

  if (isLoading || alertItems.length === 0) {
    return null;
  }

  return (
    <section className="dashboard-alerts" aria-label="할 일과 알림">
      <div className="dashboard-section-heading">
        <div>
          <h2>할 일 / 알림</h2>
          <p>운영자가 우선 확인하면 좋은 항목만 표시합니다.</p>
        </div>
      </div>
      <div className="dashboard-alert-list">
        {alertItems.map((item) => (
          <Link key={item.title} className="dashboard-alert-card" to={item.to}>
            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
            <span>{item.actionLabel}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
