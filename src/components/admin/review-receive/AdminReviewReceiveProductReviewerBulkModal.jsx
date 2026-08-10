import {
  PRODUCT_DEPOSIT_PARTY_OPTIONS,
  REVIEW_FEE_DEPOSIT_PARTY_OPTIONS
} from "../../../constants/admin";

export default function AdminReviewReceiveProductReviewerBulkModal({
  isOpen,
  backdropDismissProps,
  productReviewerBulk,
  isSaving,
  onClose,
  onTextChange,
  onDepositChange,
  onParse,
  onSave,
  onBackToInput
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="review-receive-modal-backdrop" role="presentation" {...backdropDismissProps}>
      <div
        className="review-receive-modal review-receive-purchase-bulk-modal review-receive-product-reviewer-bulk-modal"
        role="dialog"
        aria-modal="true"
        aria-label="상품/리뷰어 일괄 입력"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="review-receive-modal-header">
          <div>
            <h2>상품/리뷰어 일괄 입력</h2>
            <p>
              {productReviewerBulk.step === "input"
                ? "붙여넣은 행에서 품목 정보가 바뀌는 구간마다 현재 bundle_id의 품목으로 나눠 등록합니다."
                : "제품비와 리뷰비 입금구분을 선택합니다."}
            </p>
          </div>
          <button
            type="button"
            className="review-receive-modal-close"
            onClick={onClose}
            disabled={isSaving}
          >
            닫기
          </button>
        </div>

        {productReviewerBulk.step === "input" && (
          <div className="review-receive-modal-body">
            <div className="review-receive-bulk-fields">
              <textarea
                className="review-receive-bulk-textarea"
                value={productReviewerBulk.text}
                onChange={onTextChange}
                placeholder={
                  "날짜\t업체명\t링크\t\t번호\t품명\t옵션\t리뷰형태\t배정\t주문번호\t구매자\t수취인\t아이디\t연락처\t주소\t계좌\t금액\t리뷰비\t입금자명(예정)\t리뷰작성\t입금여부"
                }
                aria-label="상품/리뷰어 일괄 입력 텍스트"
                disabled={isSaving}
              />
            </div>

            <div className="review-receive-preview-panel">
              <div className="review-receive-preview-header">
                <h3>입력 안내</h3>
                <p>
                  첫 품목이 아직 없다면 처음 만들어둔 빈 products row에 저장하고, 이미 품목이 있으면 새 products row를 같은
                  bundle_id로 추가합니다.
                </p>
              </div>
              <div className="review-receive-preview-empty">
                <p>날짜, 업체명, 품명, 옵션, 리뷰형태가 바뀌면 새 품목으로 나누고 각 품목의 첫 행 링크를 사용합니다.</p>
              </div>
              {productReviewerBulk.message && (
                <p className={`review-receive-bulk-message is-${productReviewerBulk.messageType}`}>
                  {productReviewerBulk.message}
                </p>
              )}
            </div>
          </div>
        )}

        {productReviewerBulk.step === "deposit" && (
          <div className="review-receive-modal-body review-receive-modal-body-single">
            <div className="review-receive-review-batch-fields review-receive-product-reviewer-deposit-step">
              <div className="review-receive-review-batch-grid review-receive-create-product-grid">
                <div className="detail-summary-item review-receive-create-product-field">
                  <label className="detail-summary-label" htmlFor="review-receive-detail-bulk-product-fee-deposit-gb">
                    제품비 입금구분
                  </label>
                  <select
                    id="review-receive-detail-bulk-product-fee-deposit-gb"
                    name="productFeeDepositGb"
                    className="table-cell-input"
                    value={productReviewerBulk.depositForm.productFeeDepositGb}
                    onChange={onDepositChange}
                    disabled={isSaving}
                  >
                    {PRODUCT_DEPOSIT_PARTY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="detail-summary-item review-receive-create-product-field">
                  <label className="detail-summary-label" htmlFor="review-receive-detail-bulk-review-fee-deposit-gb">
                    리뷰비 입금구분
                  </label>
                  <select
                    id="review-receive-detail-bulk-review-fee-deposit-gb"
                    name="reviewFeeDepositGb"
                    className="table-cell-input"
                    value={productReviewerBulk.depositForm.reviewFeeDepositGb}
                    onChange={onDepositChange}
                    disabled={isSaving}
                  >
                    {REVIEW_FEE_DEPOSIT_PARTY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="review-receive-preview-panel">
                <div className="review-receive-preview-header">
                  <h3>{`품목 ${productReviewerBulk.productGroups.length}개 / 리뷰어 ${productReviewerBulk.reviewers.length}명`}</h3>
                  <p>기본값은 현재 상품 묶음 안의 기존 품목 입금구분을 사용합니다.</p>
                </div>
                <div className="review-receive-product-reviewer-table-scroll is-compact">
                  <table className="review-receive-product-reviewer-table is-compact is-detail-deposit-summary">
                    <colgroup>
                      <col className="col-index" />
                      <col className="col-product-date" />
                      <col className="col-company-name" />
                      <col className="col-product-name" />
                      <col className="col-option-name" />
                      <col className="col-review-type" />
                      <col className="col-reviewer-count" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>품목</th>
                        <th>등록날짜</th>
                        <th>업체명</th>
                        <th>품명</th>
                        <th>옵션</th>
                        <th>리뷰형태</th>
                        <th>리뷰어</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productReviewerBulk.productGroups.map((group, index) => (
                        <tr key={group.clientId}>
                          <td>{index + 1}</td>
                          <td>{group.productForm.productDate}</td>
                          <td>{group.productForm.companyName || "-"}</td>
                          <td>{group.productForm.productName || "-"}</td>
                          <td>{group.productForm.optionName || "-"}</td>
                          <td>{group.productForm.reviewType || "-"}</td>
                          <td>{group.reviewers.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {productReviewerBulk.message && (
                  <p className={`review-receive-bulk-message is-${productReviewerBulk.messageType}`}>
                    {productReviewerBulk.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="review-receive-modal-actions">
          {productReviewerBulk.step === "input" ? (
            <button
              type="button"
              className="admin-secondary-button"
              onClick={onClose}
              disabled={isSaving}
            >
              취소
            </button>
          ) : (
            <button
              type="button"
              className="admin-secondary-button"
              onClick={onBackToInput}
              disabled={isSaving}
            >
              이전
            </button>
          )}
          {productReviewerBulk.step === "input" && (
            <button type="button" className="admin-primary-button" onClick={onParse}>
              다음
            </button>
          )}
          {productReviewerBulk.step === "deposit" && (
            <button
              type="button"
              className="admin-primary-button"
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? "등록 중..." : "등록하기"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
