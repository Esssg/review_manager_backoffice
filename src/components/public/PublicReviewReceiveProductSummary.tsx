import { Card } from "@/components/ui/card";

export default function PublicReviewReceiveProductSummary({
  isProductLoading,
  productErrorMessage,
  product,
  publicDepositorNames,
  formatDisplayDate
}) {
  if (isProductLoading || productErrorMessage || !product) {
    return null;
  }

  return (
    <Card className="dashboard-panel public-review-products-panel" aria-label="리뷰받기 상품 정보">
      <div className="detail-summary-grid">
        <div className="detail-summary-item">
          <span className="detail-summary-label">구매일자</span>
          <strong>{formatDisplayDate(product.product_date)}</strong>
        </div>
        <div className="detail-summary-item">
          <span className="detail-summary-label">업체명</span>
          <strong>{product.company_name || "-"}</strong>
        </div>
        <div className="detail-summary-item">
          <span className="detail-summary-label">제품비 입금자명</span>
          <strong>{publicDepositorNames.productFeeDepositorName}</strong>
        </div>
        <div className="detail-summary-item">
          <span className="detail-summary-label">리뷰비 입금자명</span>
          <strong>{publicDepositorNames.reviewFeeDepositorName}</strong>
        </div>
      </div>
    </Card>
  );
}
