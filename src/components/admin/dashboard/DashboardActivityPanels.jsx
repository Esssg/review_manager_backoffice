import { Link } from "react-router-dom";

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getProductTitle(product) {
  return product?.title || product?.product_name || `상품 ${product?.id ?? "-"}`;
}

function getSubmissionLabel(submission) {
  return (
    submission?.order_number ||
    submission?.buyer_name ||
    submission?.recipient_name ||
    submission?.assign_name ||
    `제출 ${submission?.id ?? "-"}`
  );
}

function EmptyActivity({ message }) {
  return <p className="dashboard-activity-empty">{message}</p>;
}

function ProductProgressBar({ activity }) {
  const total = activity?.totalCount ?? 0;
  const purchasePercent = total > 0 ? (activity.purchaseCount / total) * 100 : 0;
  const reviewPercent = total > 0 ? (activity.reviewCount / total) * 100 : 0;
  const completePercent = Math.max(0, 100 - purchasePercent - reviewPercent);

  return (
    <div className="dashboard-product-progress" aria-label="상품 제출 상태 분포">
      <span className="is-purchase" style={{ width: `${purchasePercent}%` }} />
      <span className="is-review" style={{ width: `${reviewPercent}%` }} />
      <span className="is-complete" style={{ width: `${completePercent}%` }} />
    </div>
  );
}

function TopProductList({ title, items, emptyMessage }) {
  return (
    <article className="dashboard-activity-card">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <div className="dashboard-top-product-list">
          {items.map(({ product, activity }) => (
            <div key={product.id} className="dashboard-top-product-item">
              <div>
                <strong>{getProductTitle(product)}</strong>
                <p>
                  구매 {activity.purchaseCount.toLocaleString("ko-KR")} / 리뷰{" "}
                  {activity.reviewCount.toLocaleString("ko-KR")} / 완료 {activity.completeCount.toLocaleString("ko-KR")}
                </p>
                <ProductProgressBar activity={activity} />
              </div>
              <div className="dashboard-top-product-links">
                <Link to={`/admin/product/specific/${product.id}`}>상품 상세</Link>
                <Link to={`/admin/review-receive/specific/${product.id}`}>리뷰받기</Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyActivity message={emptyMessage} />
      )}
    </article>
  );
}

function RecentList({ title, items, productMap, getDateValue, getTo, emptyMessage }) {
  return (
    <article className="dashboard-activity-card">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <div className="dashboard-recent-list">
          {items.map((item) => {
            const product = item.product_id ? productMap.get(item.product_id) : item;
            return (
              <Link key={`${title}-${item.id}`} className="dashboard-recent-item" to={getTo(item)}>
                <div>
                  <strong>{item.product_id ? getSubmissionLabel(item) : getProductTitle(item)}</strong>
                  <p>{getProductTitle(product)}</p>
                </div>
                <time>{formatDate(getDateValue(item))}</time>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyActivity message={emptyMessage} />
      )}
    </article>
  );
}

export default function DashboardActivityPanels({ metrics, products = [], isLoading = false }) {
  const productMap = new Map(products.map((product) => [product.id, product]));

  if (isLoading) {
    return (
      <section className="dashboard-activity-section" aria-label="상위 상품과 최근 활동">
        <div className="dashboard-trend-empty">상위 상품과 최근 활동을 불러오는 중입니다.</div>
      </section>
    );
  }

  return (
    <section className="dashboard-activity-section" aria-label="상위 상품과 최근 활동">
      <div className="dashboard-section-heading">
        <div>
          <h2>상위 상품 / 최근 활동</h2>
          <p>운영량이 많은 상품과 최근 발생한 업무 흐름을 확인합니다.</p>
        </div>
      </div>

      <div className="dashboard-activity-grid">
        <TopProductList
          title="진행 중 제출 Top 5"
          items={metrics?.topProductsByPurchase ?? []}
          emptyMessage="진행 중 제출이 있는 상품이 없습니다."
        />
        <TopProductList
          title="입금 대기 Top 5"
          items={metrics?.topProductsByReviewWaiting ?? []}
          emptyMessage="입금 대기 제출이 있는 상품이 없습니다."
        />
        <RecentList
          title="최근 등록 상품"
          items={metrics?.recent?.products ?? []}
          productMap={productMap}
          getDateValue={(item) => item.created_at}
          getTo={(item) => `/admin/product/specific/${item.id}`}
          emptyMessage="최근 등록된 상품이 없습니다."
        />
        <RecentList
          title="최근 추가 제출"
          items={metrics?.recent?.submissions ?? []}
          productMap={productMap}
          getDateValue={(item) => item.created_at}
          getTo={(item) => `/admin/review-receive/specific/${item.product_id}`}
          emptyMessage="최근 추가된 제출이 없습니다."
        />
        <RecentList
          title="최근 입금 완료"
          items={metrics?.recent?.depositedSubmissions ?? []}
          productMap={productMap}
          getDateValue={(item) => item.deposited_at}
          getTo={(item) => `/admin/review-receive/specific/${item.product_id}`}
          emptyMessage="최근 입금 완료된 제출이 없습니다."
        />
      </div>
    </section>
  );
}
