import ProductLinkCopy from "../../common/ProductLinkCopy";
import { getProductDepositGbPartLabels } from "../../../constants/admin";

export default function AdminReviewReceiveProductItems({
  visibleBundleProducts,
  rows,
  activeProductId,
  setActiveProductId,
  onOpenProductReviewerBulkModal,
  onOpenCreateProductItemModal,
  onOpenEditProductItemModal,
  onOpenDeleteProductItemDialog,
  onAddRow,
  renderSection,
  purchaseSectionRows,
  filteredPurchaseSectionRows,
  reviewCompletedRows,
  filteredReviewCompletedRows,
  fullyCompletedRows,
  filteredFullyCompletedRows
}) {
  return (
    <section className="dashboard-panel review-receive-bundle-panel" aria-label="리뷰받기 품목 목록">
      <div className="review-receive-section-header">
        <div>
          <h2>품목</h2>
          <p>같은 bundle_id를 가진 products row를 품목별로 접거나 펼쳐 관리합니다.</p>
        </div>
        <div className="review-receive-product-item-actions">
          <button type="button" className="admin-secondary-button" onClick={onOpenProductReviewerBulkModal}>
            상품/리뷰어 일괄 입력
          </button>
          <button type="button" className="admin-primary-button" onClick={onOpenCreateProductItemModal}>
            품목 추가
          </button>
        </div>
      </div>

      <div className="review-receive-bundle-items">
        {visibleBundleProducts.length === 0 ? (
          <div className="review-receive-empty-product-items">
            <p>등록된 품목이 없습니다.</p>
            <button type="button" className="admin-primary-button" onClick={onOpenCreateProductItemModal}>
              첫 품목 추가
            </button>
          </div>
        ) : visibleBundleProducts.map((item, index) => {
          const isActiveItem = Number(activeProductId) === Number(item.id);
          const itemRows = rows.filter((row) => Number(row.product_id) === Number(item.id));
          const itemBodyId = `review-receive-product-item-${item.id}`;

          return (
            <section key={item.id} className="review-receive-product-item" aria-label={`품목 ${index + 1}`}>
              <div className="review-receive-product-item-header">
                <div>
                  <h3>{item.product_name || item.title || `품목 ${index + 1}`}</h3>
                  <p>{`${itemRows.length}개 제출 데이터 / 상품 ID ${item.id}`}</p>
                </div>
                <div className="review-receive-product-item-actions">
                  <button type="button" className="admin-secondary-button" onClick={() => onOpenEditProductItemModal(item)}>
                    정보 입력/수정
                  </button>
                  <button
                    type="button"
                    className="admin-danger-button"
                    onClick={() => onOpenDeleteProductItemDialog(item)}
                    disabled={visibleBundleProducts.length <= 1}
                  >
                    품목 삭제
                  </button>
                  <button
                    type="button"
                    className="review-receive-section-toggle"
                    onClick={() => setActiveProductId((prev) => (Number(prev) === Number(item.id) ? null : Number(item.id)))}
                    aria-expanded={isActiveItem}
                    aria-controls={itemBodyId}
                  >
                    {isActiveItem ? "접기" : "펼치기"}
                  </button>
                </div>
              </div>

              <div id={itemBodyId} hidden={!isActiveItem}>
                <div className="detail-summary-grid review-receive-product-item-summary">
                  <div className="detail-summary-item">
                    <span className="detail-summary-label">품명</span>
                    <strong>{item.product_name ?? "-"}</strong>
                  </div>
                  <div className="detail-summary-item">
                    <span className="detail-summary-label">옵션</span>
                    <strong>{item.option_name ?? "-"}</strong>
                  </div>
                  <div className="detail-summary-item">
                    <span className="detail-summary-label">리뷰형태</span>
                    <strong>{item.review_type ?? "-"}</strong>
                  </div>
                  <div className="detail-summary-item">
                    <span className="detail-summary-label">제품비 입금구분</span>
                    <strong>{getProductDepositGbPartLabels(item.deposit_GB).productFee}</strong>
                  </div>
                  <div className="detail-summary-item">
                    <span className="detail-summary-label">리뷰비 입금구분</span>
                    <strong>{getProductDepositGbPartLabels(item.deposit_GB).reviewFee}</strong>
                  </div>
                  <div className="detail-summary-item">
                    <span className="detail-summary-label">설명</span>
                    <strong>{item.description ?? "-"}</strong>
                  </div>
                  <div className="detail-summary-item">
                    <span className="detail-summary-label">링크</span>
                    <ProductLinkCopy value={item.product_link} />
                  </div>
                  <div className="detail-summary-item">
                    <span className="detail-summary-label">상품 제목</span>
                    <strong>{item.title ?? "-"}</strong>
                  </div>
                </div>

                <div className="review-receive-product-item-row-actions">
                  <button type="button" className="admin-primary-button" onClick={onAddRow}>
                    행 추가
                  </button>
                </div>

                {renderSection(
                  "purchase",
                  "구매완료",
                  "리뷰완료나 입금완료 체크 여부와 관계없이 모든 제출 데이터를 보여줍니다.",
                  purchaseSectionRows,
                  filteredPurchaseSectionRows
                )}
                {renderSection(
                  "review",
                  "리뷰완료",
                  "리뷰완료는 체크됐고 입금완료는 아직 체크되지 않은 제출 데이터입니다.",
                  reviewCompletedRows,
                  filteredReviewCompletedRows
                )}
                {renderSection(
                  "complete",
                  "전체완료",
                  "리뷰완료와 입금완료가 모두 체크된 제출 데이터입니다.",
                  fullyCompletedRows,
                  filteredFullyCompletedRows
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
