import ProductLinkCopy from "@/components/common/ProductLinkCopy";
import { Button } from "@/components/ui/button";
import { getProductDepositGbPartLabels } from "@/constants/admin";

export default function AdminReviewReceiveAllProductsPanel({
  isCollapsed,
  onToggle,
  bodyId,
  onOpenProductReviewerBulkModal,
  selectedAllProduct,
  renderSection,
  allProductRows,
  filteredAllProductRows,
  allProductReviewCompletedRows,
  filteredAllProductReviewCompletedRows,
  allProductFullyCompletedRows,
  filteredAllProductFullyCompletedRows,
  allProductRowNumberMap,
  getSectionProductForRow,
  getSectionPlannedDepositorName,
  onRowActivate,
  activeRowId,
  exportProductLabel
}) {
  return (
    <section className="dashboard-panel review-receive-all-products-panel" aria-label="전체 품목">
      <div className="review-receive-section-header">
        <div>
          <h2>전체 품목</h2>
          <p>아래 모든 품목의 제출 데이터를 상태별로 한 번에 보여줍니다.</p>
        </div>
        <div className="review-receive-section-header-actions">
          <Button type="button" className="admin-secondary-button" onClick={onOpenProductReviewerBulkModal}>
            상품/리뷰어 일괄 입력
          </Button>
          <Button
            type="button"
            className="review-receive-section-toggle"
            onClick={onToggle}
            aria-expanded={!isCollapsed}
            aria-controls={bodyId}
          >
            {isCollapsed ? "펼치기" : "접기"}
          </Button>
        </div>
      </div>

      <div id={bodyId} hidden={isCollapsed}>
        <div className="detail-summary-grid review-receive-all-products-summary">
          <div className="detail-summary-item">
            <span className="detail-summary-label">품명</span>
            <strong>{selectedAllProduct?.product_name ?? ""}</strong>
          </div>
          <div className="detail-summary-item">
            <span className="detail-summary-label">옵션</span>
            <strong>{selectedAllProduct?.option_name ?? ""}</strong>
          </div>
          <div className="detail-summary-item">
            <span className="detail-summary-label">리뷰형태</span>
            <strong>{selectedAllProduct?.review_type ?? ""}</strong>
          </div>
          <div className="detail-summary-item">
            <span className="detail-summary-label">제품비 입금구분</span>
            <strong>
              {selectedAllProduct ? getProductDepositGbPartLabels(selectedAllProduct.deposit_GB).productFee : ""}
            </strong>
          </div>
          <div className="detail-summary-item">
            <span className="detail-summary-label">리뷰비 입금구분</span>
            <strong>
              {selectedAllProduct ? getProductDepositGbPartLabels(selectedAllProduct.deposit_GB).reviewFee : ""}
            </strong>
          </div>
          <div className="detail-summary-item">
            <span className="detail-summary-label">설명</span>
            <strong>{selectedAllProduct?.description ?? ""}</strong>
          </div>
          <div className="detail-summary-item">
            <span className="detail-summary-label">링크</span>
            <ProductLinkCopy value={selectedAllProduct?.product_link} emptyText="" />
          </div>
          <div className="detail-summary-item">
            <span className="detail-summary-label">상품 제목</span>
            <strong>{selectedAllProduct?.title ?? ""}</strong>
          </div>
        </div>

        {renderSection(
          "allProducts",
          "구매완료",
          "리뷰완료나 입금완료 체크 여부와 관계없이 전체 품목의 모든 제출 데이터를 보여줍니다.",
          allProductRows,
          filteredAllProductRows,
          {
            isSubsection: true,
            isPurchaseSection: true,
            showPurchaseToolbar: false,
            showPurchaseActions: false,
            showAddRow: false,
            showSelectionActions: false,
            selectRowsOnClick: false,
            sectionRowNumberMap: allProductRowNumberMap,
            getSectionProductForRow,
            getSectionPlannedDepositorName,
            onRowActivate,
            activeRowId,
            exportProductLabel
          }
        )}
        {renderSection(
          "allProductsReview",
          "리뷰완료",
          "전체 품목 중 리뷰완료는 체크됐고 입금완료는 아직 체크되지 않은 제출 데이터입니다.",
          allProductReviewCompletedRows,
          filteredAllProductReviewCompletedRows,
          {
            isSubsection: true,
            isPurchaseSection: false,
            isReviewCompletionSection: true,
            showSelectionActions: false,
            selectRowsOnClick: false,
            sectionRowNumberMap: allProductRowNumberMap,
            getSectionProductForRow,
            getSectionPlannedDepositorName,
            onRowActivate,
            activeRowId,
            exportProductLabel
          }
        )}
        {renderSection(
          "allProductsComplete",
          "전체완료",
          "전체 품목 중 리뷰완료와 입금완료가 모두 체크된 제출 데이터입니다.",
          allProductFullyCompletedRows,
          filteredAllProductFullyCompletedRows,
          {
            isSubsection: true,
            isPurchaseSection: false,
            showSelectionActions: false,
            selectRowsOnClick: false,
            sectionRowNumberMap: allProductRowNumberMap,
            getSectionProductForRow,
            getSectionPlannedDepositorName,
            onRowActivate,
            activeRowId,
            exportProductLabel
          }
        )}
      </div>
    </section>
  );
}
