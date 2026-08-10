import { Fragment, useEffect, useRef, useState } from "react";
import StepTabList from "../product-detail/StepTabList";
import ProductLinkCopy from "../../common/ProductLinkCopy";
import {
  getProductDepositGbPartLabels,
  REVIEW_RECEIVE_STATUS_TABS
} from "../../../constants/admin";
import {
  REVIEW_RECEIVE_ACTIONS_COLUMN_WIDTH_RATIO,
  REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS_AFTER_SUMMARY,
  REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS_BEFORE_SUMMARY,
  REVIEW_RECEIVE_PRODUCT_LIST_COLUMN_COUNT,
  REVIEW_RECEIVE_ROW_NUMBER_COLUMN_WIDTH_RATIO,
  REVIEW_RECEIVE_SUMMARY_COLUMN_WIDTH_RATIO,
  formatDisplayDate,
  formatProductItemCell,
  formatProductLinkPreview,
  getBundleKey,
  getBundleVisibleItems,
  getReviewReceiveSubmissionSummary,
  isMultiProductBundleRow,
  hasRegisteredBundleItem
} from "../../../utils/reviewReceiveProductList";
import ReviewReceiveProductFilterHeader from "./ReviewReceiveProductFilterHeader";

function renderProductLinkCopy(value) {
  return <ProductLinkCopy value={value} displayValue={formatProductLinkPreview(value)} />;
}

function renderProductItemLinkCell(product, value) {
  if (!hasRegisteredBundleItem(product)) {
    return "품목 미등록";
  }

  return renderProductLinkCopy(value);
}

function renderClampedCell(value) {
  return <span className="review-receive-clamp-cell">{value ?? "-"}</span>;
}

const REVIEW_RECEIVE_NOWRAP_BASE_FONT_SIZE = 13;
const REVIEW_RECEIVE_NOWRAP_MIN_FONT_SIZE = 10;

function ReviewReceiveNoWrapFitCell({ value }) {
  const cellRef = useRef(null);
  const text = value ?? "-";
  const [fontSize, setFontSize] = useState(REVIEW_RECEIVE_NOWRAP_BASE_FONT_SIZE);

  useEffect(() => {
    const element = cellRef.current;

    if (!element) {
      return undefined;
    }

    const updateFontSize = () => {
      element.style.fontSize = `${REVIEW_RECEIVE_NOWRAP_BASE_FONT_SIZE}px`;

      const availableWidth = element.clientWidth;
      const requiredWidth = element.scrollWidth;
      const nextFontSize =
        availableWidth > 0 && requiredWidth > availableWidth
          ? Math.max(
              REVIEW_RECEIVE_NOWRAP_MIN_FONT_SIZE,
              Math.floor((REVIEW_RECEIVE_NOWRAP_BASE_FONT_SIZE * availableWidth) / requiredWidth)
            )
          : REVIEW_RECEIVE_NOWRAP_BASE_FONT_SIZE;

      setFontSize(nextFontSize);
    };

    updateFontSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFontSize);
      return () => window.removeEventListener("resize", updateFontSize);
    }

    const resizeObserver = new ResizeObserver(updateFontSize);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [text]);

  return (
    <span ref={cellRef} className="review-receive-nowrap-fit-cell" style={{ fontSize }}>
      {text}
    </span>
  );
}

function renderNoWrapFitCell(value) {
  return <ReviewReceiveNoWrapFitCell value={value} />;
}

export default function ReviewReceiveProductList({
  viewMode,
  onViewModeChange,
  isLoading,
  errorMessage,
  productListScrollRef,
  productListLoadMoreRef,
  productFilters,
  openProductFilterKey,
  onProductFilterOpenChange,
  onProductFilterChange,
  onProductFilterReset,
  productFilterRef,
  products,
  filteredProducts,
  hasActiveProductFilters,
  expandedBundleKey,
  setExpandedBundleKey,
  activeActionProductId,
  setActiveActionProductId,
  actionProductId,
  onNavigate,
  onCopyPublicUrl,
  onCopyReviewVerifiedRows,
  onOpenEditModal,
  onOpenDeleteDialog,
  isLoadingMore,
  hasMore
}) {
  return (
    <section className="dashboard-panel review-receive-product-list-panel" aria-label="리뷰받기 상품 목록">
      <div className="product-overview-status-tab-list">
        <StepTabList
          activeTab={viewMode}
          onTabChange={onViewModeChange}
          tabs={REVIEW_RECEIVE_STATUS_TABS}
          ariaLabel="리뷰받기 상태 선택"
        />
      </div>
      {isLoading && <p className="login-message">리뷰받기 상품 데이터를 불러오는 중...</p>}
      {!isLoading && errorMessage && <p className="login-error">{errorMessage}</p>}
      {!isLoading && !errorMessage && (
        <div className="review-receive-product-list-scroll" ref={productListScrollRef}>
          <table className="review-receive-product-list-table">
            <colgroup>
              <col style={{ width: `${REVIEW_RECEIVE_ROW_NUMBER_COLUMN_WIDTH_RATIO}%` }} />
              {REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS_BEFORE_SUMMARY.map((column) => (
                <col key={column.key} style={{ width: `${column.widthRatio}%` }} />
              ))}
              <col style={{ width: `${REVIEW_RECEIVE_SUMMARY_COLUMN_WIDTH_RATIO}%` }} />
              {REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS_AFTER_SUMMARY.map((column) => (
                <col key={column.key} style={{ width: `${column.widthRatio}%` }} />
              ))}
              <col style={{ width: `${REVIEW_RECEIVE_ACTIONS_COLUMN_WIDTH_RATIO}%` }} />
            </colgroup>
            <thead>
              <tr>
                <th className="review-receive-row-number-column">No.</th>
                {REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS_BEFORE_SUMMARY.map((column) => (
                  <ReviewReceiveProductFilterHeader
                    key={column.key}
                    column={column}
                    filterValue={productFilters[column.key]}
                    isOpen={openProductFilterKey === column.key}
                    onOpenChange={onProductFilterOpenChange}
                    onFilterChange={onProductFilterChange}
                    onFilterReset={onProductFilterReset}
                    menuRef={productFilterRef}
                  />
                ))}
                <th className="review-receive-summary-column">완료현황</th>
                {REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS_AFTER_SUMMARY.map((column) => (
                  <ReviewReceiveProductFilterHeader
                    key={column.key}
                    column={column}
                    filterValue={productFilters[column.key]}
                    isOpen={openProductFilterKey === column.key}
                    onOpenChange={onProductFilterOpenChange}
                    onFilterChange={onProductFilterChange}
                    onFilterReset={onProductFilterReset}
                    menuRef={productFilterRef}
                  />
                ))}
                <th className="review-receive-actions-column">관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={REVIEW_RECEIVE_PRODUCT_LIST_COLUMN_COUNT}>
                    {products.length === 0
                      ? hasActiveProductFilters
                        ? "선택한 필터 조건에 맞는 리뷰받기 상품이 없습니다."
                        : "등록된 리뷰받기 상품이 없습니다."
                      : hasActiveProductFilters
                        ? "선택한 필터 조건에 맞는 리뷰받기 상품이 없습니다."
                        : "선택한 보기 조건에 맞는 리뷰받기 상품이 없습니다."}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product, productIndex) => {
                  const isMultiProductBundle = isMultiProductBundleRow(product);
                  const bundleKey = getBundleKey(product);
                  const visibleItems = getBundleVisibleItems(product);
                  const isExpanded = expandedBundleKey === bundleKey;

                  return (
                    <Fragment key={bundleKey}>
                      <tr
                        className="clickable-row"
                        onClick={() => onNavigate(`/admin/review-receive/specific/${product.id}`)}
                      >
                        <td className="review-receive-row-number-cell">{productIndex + 1}</td>
                        <td>{renderClampedCell(formatDisplayDate(product.product_date ?? product.created_at))}</td>
                        <td>{renderNoWrapFitCell(product.company_name)}</td>
                        <td>{renderClampedCell(formatProductItemCell(product, product.product_name))}</td>
                        <td>{renderClampedCell(formatProductItemCell(product, product.option_name))}</td>
                        <td>{renderClampedCell(formatProductItemCell(product, product.review_type))}</td>
                        <td>{renderNoWrapFitCell(formatProductItemCell(product, getProductDepositGbPartLabels(product.deposit_GB).productFee))}</td>
                        <td>{renderNoWrapFitCell(formatProductItemCell(product, getProductDepositGbPartLabels(product.deposit_GB).reviewFee))}</td>
                        <td className="review-receive-summary-cell">{renderClampedCell(getReviewReceiveSubmissionSummary(product))}</td>
                        <td>{renderProductItemLinkCell(product, product.product_link)}</td>
                        <td>{renderNoWrapFitCell(product.manager_id)}</td>
                        <td className="review-receive-actions-cell">
                          <div className="review-receive-row-actions">
                            <button
                              type="button"
                              className="review-receive-kebab-button"
                              aria-label={`${product.title ?? product.product_name ?? "리뷰받기 상품"} 관리 메뉴 열기`}
                              aria-expanded={activeActionProductId === product.id}
                              disabled={actionProductId === product.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                setActiveActionProductId((prev) => (prev === product.id ? null : product.id));
                              }}
                            >
                              <span aria-hidden="true">⋮</span>
                            </button>
                            {activeActionProductId === product.id && (
                              <div className="review-receive-row-action-menu" onClick={(event) => event.stopPropagation()}>
                                <button type="button" onClick={() => onCopyPublicUrl(product)}>
                                  URL 복사하기
                                </button>
                                {isMultiProductBundle ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedBundleKey((prev) => (prev === bundleKey ? null : bundleKey));
                                      setActiveActionProductId(null);
                                    }}
                                  >
                                    {isExpanded ? "접기" : "펼치기"}
                                  </button>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => onCopyReviewVerifiedRows(product)}>
                                      리뷰작성복사
                                    </button>
                                    <button type="button" onClick={() => onOpenEditModal(product)}>
                                      수정하기
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="is-danger"
                                  onClick={() => onOpenDeleteDialog(product)}
                                  disabled={actionProductId === product.id}
                                >
                                  {actionProductId === product.id ? "삭제 중..." : "삭제하기"}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isMultiProductBundle && isExpanded && (
                        <tr className="review-receive-bundle-expanded-row">
                          <td colSpan={REVIEW_RECEIVE_PRODUCT_LIST_COLUMN_COUNT}>
                            {visibleItems.length === 0 ? (
                              <div className="review-receive-bundle-empty">등록된 품목이 없습니다. 상세 화면에서 품목을 추가해주세요.</div>
                            ) : (
                              <div className="review-receive-bundle-expanded-panel">
                                <table>
                                  <thead>
                                    <tr>
                                      <th>상품 제목</th>
                                      <th>업체명</th>
                                      <th>품명</th>
                                      <th>옵션</th>
                                      <th>리뷰형태</th>
                                      <th>설명</th>
                                      <th>링크</th>
                                      <th>제품비 입금구분</th>
                                      <th>리뷰비 입금구분</th>
                                      <th>완료현황</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {visibleItems.map((item) => (
                                      <tr key={item.id}>
                                        <td>{renderClampedCell(item.title)}</td>
                                        <td>{renderNoWrapFitCell(item.company_name)}</td>
                                        <td>{renderClampedCell(item.product_name)}</td>
                                        <td>{renderClampedCell(item.option_name)}</td>
                                        <td>{renderClampedCell(item.review_type)}</td>
                                        <td>{renderClampedCell(item.description)}</td>
                                        <td>{renderProductLinkCopy(item.product_link)}</td>
                                        <td>{renderNoWrapFitCell(getProductDepositGbPartLabels(item.deposit_GB).productFee)}</td>
                                        <td>{renderNoWrapFitCell(getProductDepositGbPartLabels(item.deposit_GB).reviewFee)}</td>
                                        <td>{renderClampedCell(getReviewReceiveSubmissionSummary(item))}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          <div ref={productListLoadMoreRef} className="review-receive-list-load-more" aria-live="polite">
            {isLoadingMore
              ? "추가 데이터를 불러오는 중..."
              : hasMore
                ? "아래로 스크롤하면 다음 리뷰받기 상품을 불러옵니다."
                : filteredProducts.length > 0
                  ? "모든 리뷰받기 상품을 불러왔습니다."
                  : ""}
          </div>
        </div>
      )}
    </section>
  );
}
