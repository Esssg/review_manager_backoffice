import { Fragment } from "react";
import { getPhotoId, getPhotoUrl } from "../../../utils/photoItems";
import {
  getVisibleReviewReceiveRowFilterColumns,
  hasActiveReviewReceiveRowFilters
} from "../../../utils/reviewReceiveDetailTable";
import ReviewReceiveFilterHeader from "./ReviewReceiveFilterHeader";

export default function AdminReviewReceiveSubmissionSection({
  sectionKey,
  title,
  description,
  totalRows,
  filteredRows,
  options = {},
  context
}) {
  const {
    activeProduct,
    rowNumberMap,
    plannedDepositorName,
    sectionSearchQueries,
    collapsedSections,
    sectionColumnFilters,
    selectedRowIds,
    handleSectionExcelDownload,
    toggleSectionCollapsed,
    handleCopyPurchaseBuyers,
    openPurchaseAssignModal,
    openReviewFeeBatchDialog,
    filteredPurchaseSectionRows,
    openPhotoReviewBatchModal,
    photoReviewBatchTargetRows,
    openPurchaseBulkModal,
    openReviewBatchModal,
    canVerifyDeposit,
    filteredReviewCompletedRows,
    toggleRowsSelection,
    openSelectedRowsDeleteDialog,
    handleSectionSearchChange,
    openSectionColumnFilterKey,
    setOpenSectionColumnFilterKey,
    handleSectionColumnFilterChange,
    handleSectionColumnFilterReset,
    sectionColumnFilterRef,
    handleRowClick,
    handleFieldChange,
    openPhotoViewer,
    updatingRowId,
    handleReviewVerifiedChange,
    handleDepositVerifiedChange,
    handleReviewCompletionMetaSave,
    handleSaveRow,
    closeRowEditor,
    openRowEditor,
    handleDeleteRow,
    handleInlinePurchaseInfoChange,
    handleAddRow
  } = context;

  const formatAccountInfo = (row) => {
    return row.accountInfoInput?.trim() ? row.accountInfoInput : "-";
  };

  const renderEditableCell = (row, displayValue, inputNode) => (
    <td onDoubleClick={() => openRowEditor(row.id)}>
      {row.isEditing ? inputNode : displayValue || "-"}
    </td>
  );

  const renderTableColumns = (isPurchaseSection, showPurchaseActions) => (
    <colgroup>
      <col className="review-col-index" />
      <col className="review-col-assign" />
      <col className="review-col-order" />
      <col className="review-col-name" />
      <col className="review-col-name" />
      <col className="review-col-purchase-account" />
      <col className="review-col-contact" />
      <col className="review-col-address" />
      <col className="review-col-account" />
      <col className="review-col-amount" />
      <col className="review-col-amount" />
      <col className="review-col-photo" />
      <col className="review-col-planned-depositor" />
      <col className="review-col-check" />
      <col className="review-col-check" />
      {!isPurchaseSection && <col className="review-col-date" />}
      {!isPurchaseSection && <col className="review-col-actual-depositor" />}
      {showPurchaseActions && <col className="review-col-actions" />}
    </colgroup>
  );

  const renderSection = (sectionKey, title, description, totalRows, filteredRows, options = {}) => {
    const {
      bodyIntro = null,
      isSubsection = false,
      isPurchaseSection = sectionKey === "purchase",
      showPurchaseToolbar = isPurchaseSection,
      showPurchaseActions = isPurchaseSection,
      showAddRow = isPurchaseSection,
      showSelectionActions = true,
      selectRowsOnClick = true,
      isReviewCompletionSection = sectionKey === "review",
      sectionRowNumberMap = rowNumberMap,
      sectionPlannedDepositorName = plannedDepositorName,
      getSectionProductForRow = () => activeProduct,
      getSectionPlannedDepositorName = (row) =>
        getSectionProductForRow(row)?.planned_depositor_name ?? sectionPlannedDepositorName,
      onRowActivate,
      activeRowId = null,
      exportProductLabel
    } = options;
    const searchValue = sectionSearchQueries[sectionKey];
    const isCollapsed = Boolean(collapsedSections[sectionKey]);
    const sectionBodyId = `review-receive-section-body-${sectionKey}`;
    const columnFilters = sectionColumnFilters[sectionKey] ?? {};
    const visibleFilterColumns = getVisibleReviewReceiveRowFilterColumns(isPurchaseSection);
    const hasSearchQuery = Boolean(searchValue.trim());
    const hasActiveColumnFilters = hasActiveReviewReceiveRowFilters(columnFilters);
    const selectedRowsInSection = filteredRows.filter((row) => selectedRowIds.has(row.id));
    const selectedRowsInSectionCount = selectedRowsInSection.length;
    const countLabel =
      totalRows.length === filteredRows.length ? `${filteredRows.length}건` : `${filteredRows.length}/${totalRows.length}건`;
    const emptyMessage =
      totalRows.length === 0
        ? `${title} 상태의 제출 데이터가 없습니다.`
        : hasSearchQuery || hasActiveColumnFilters
          ? "필터 조건에 맞는 제출 데이터가 없습니다."
          : `${title} 상태의 제출 데이터가 없습니다.`;

    return (
      <section
        className={`${isSubsection ? "review-receive-all-products-subsection" : "dashboard-panel"} review-receive-section`}
        aria-label={title}
      >
        <div className="review-receive-section-header">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <div className="review-receive-section-header-actions">
            <span className="status-badge">{countLabel}</span>
            <button
              type="button"
              className="review-receive-section-download-button"
              onClick={() =>
                handleSectionExcelDownload(sectionKey, title, filteredRows, {
                  sectionRowNumberMap,
                  sectionPlannedDepositorName,
                  getSectionPlannedDepositorName,
                  productLabel: exportProductLabel
                })
              }
              disabled={filteredRows.length === 0}
            >
              엑셀로 내려받기
            </button>
            <button
              type="button"
              className="review-receive-section-toggle"
              onClick={() => toggleSectionCollapsed(sectionKey)}
              aria-expanded={!isCollapsed}
              aria-controls={sectionBodyId}
            >
              {isCollapsed ? "펼치기" : "접기"}
            </button>
          </div>
        </div>

        <div id={sectionBodyId} hidden={isCollapsed}>
          {bodyIntro}
          <div className="review-receive-section-toolbar">
            {showPurchaseToolbar && (
              <div className="review-receive-toolbar-actions">
                <div className="review-receive-toolbar-button-row">
                  <button type="button" className="admin-secondary-button" onClick={handleCopyPurchaseBuyers}>
                    구매자 복사하기
                  </button>
                  <button type="button" className="admin-secondary-button" onClick={openPurchaseAssignModal}>
                    구매자 일괄 입력
                  </button>
                  <button
                    type="button"
                    className="admin-secondary-button"
                    onClick={openReviewFeeBatchDialog}
                    disabled={filteredPurchaseSectionRows.length === 0}
                  >
                    리뷰비 일괄 입력하기
                  </button>
                  <button
                    type="button"
                    className="admin-secondary-button"
                    onClick={openPhotoReviewBatchModal}
                    disabled={photoReviewBatchTargetRows.length === 0}
                  >
                    리뷰완료 일괄처리
                  </button>
                  <button type="button" className="admin-primary-button" onClick={openPurchaseBulkModal}>
                    구매정보 입력하기
                  </button>
                </div>
              </div>
            )}
            {sectionKey === "review" && (
              <div className="review-receive-toolbar-actions">
                <button
                  type="button"
                  className="admin-primary-button"
                  onClick={openReviewBatchModal}
                  disabled={!canVerifyDeposit || filteredReviewCompletedRows.length === 0}
                  title={!canVerifyDeposit ? "입금완료 처리 권한이 없습니다." : undefined}
                >
                  일괄처리하기
                </button>
                {!canVerifyDeposit && <p className="login-error">입금완료 처리 권한이 없습니다.</p>}
              </div>
            )}
            {showSelectionActions && (
              <>
                <button
                  type="button"
                  className="review-receive-select-all-button"
                  onClick={() => toggleRowsSelection(filteredRows)}
                  disabled={filteredRows.length === 0}
                >
                  {filteredRows.length > 0 && selectedRowsInSectionCount === filteredRows.length
                    ? "전체 해제하기"
                    : "전체 선택하기"}
                </button>
                <button
                  type="button"
                  className="review-receive-delete-selected-button"
                  onClick={() => openSelectedRowsDeleteDialog(filteredRows)}
                  disabled={selectedRowsInSectionCount === 0}
                >
                  {selectedRowsInSectionCount > 0 ? `삭제하기 ${selectedRowsInSectionCount}` : "삭제하기"}
                </button>
              </>
            )}
            <input
              type="search"
              className="review-receive-search-input"
              value={searchValue}
              onChange={(event) => handleSectionSearchChange(sectionKey, event.target.value)}
              placeholder={`${title} 섹션 검색`}
              aria-label={`${title} 섹션 검색`}
            />
          </div>

          <div className="table-scroll-wrap review-receive-detail-table-wrap">
            <table
              className={[
                "review-receive-table",
                `review-receive-table-${isPurchaseSection ? "purchase" : sectionKey}`,
                showPurchaseActions ? "has-row-actions" : ""
              ].filter(Boolean).join(" ")}
            >
              {renderTableColumns(isPurchaseSection, showPurchaseActions)}
              <thead>
                <tr>
                  {visibleFilterColumns.map((column) => {
                    const filterKey = `${sectionKey}:${column.key}`;

                    return (
                      <ReviewReceiveFilterHeader
                        key={column.key}
                        sectionKey={sectionKey}
                        column={column}
                        filterValue={columnFilters[column.key]}
                        isOpen={openSectionColumnFilterKey === filterKey}
                        onOpenChange={setOpenSectionColumnFilterKey}
                        onFilterChange={handleSectionColumnFilterChange}
                        onFilterReset={handleSectionColumnFilterReset}
                        menuRef={sectionColumnFilterRef}
                      />
                    );
                  })}
                  {showPurchaseActions && <th>관리</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={isPurchaseSection ? (showPurchaseActions ? 16 : 15) : 17}>{emptyMessage}</td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      className={[
                        "review-receive-row",
                        row.isNew ? "is-new" : "",
                        row.isDirty ? "is-dirty" : "",
                        selectedRowIds.has(row.id) ? "is-selected" : "",
                        activeRowId === row.id ? "is-context-active" : ""
                      ].filter(Boolean).join(" ")}
                      data-row-editor-id={row.id}
                      onClick={(event) => handleRowClick(event, row, onRowActivate, selectRowsOnClick)}
                    >
                      <td className="review-row-index">{sectionRowNumberMap[row.id] ?? "-"}</td>
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.assign_name,
                            <input
                              className="table-cell-input"
                              value={row.assign_name ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "assign_name", event.target.value)}
                              placeholder="배정명"
                            />
                          )
                        : <td>{row.assign_name || "-"}</td>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.order_number,
                            <input
                              className="table-cell-input"
                              value={row.order_number ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "order_number", event.target.value)}
                              placeholder="주문번호"
                            />
                          )
                        : <td>{row.order_number || "-"}</td>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.buyer_name,
                            <input
                              className="table-cell-input"
                              value={row.buyer_name ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "buyer_name", event.target.value)}
                              placeholder="구매자"
                            />
                          )
                        : <td>{row.buyer_name || "-"}</td>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.recipient_name,
                            <input
                              className="table-cell-input"
                              value={row.recipient_name ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "recipient_name", event.target.value)}
                              placeholder="수취인"
                            />
                          )
                        : <td>{row.recipient_name || "-"}</td>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.purchase_account,
                            <input
                              className="table-cell-input"
                              value={row.purchase_account ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "purchase_account", event.target.value)}
                              placeholder="구매계정"
                            />
                          )
                        : <td>{row.purchase_account || "-"}</td>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.contact,
                            <input
                              className="table-cell-input"
                              value={row.contact ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "contact", event.target.value)}
                              placeholder="연락처"
                            />
                          )
                        : <td>{row.contact || "-"}</td>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.address,
                            <input
                              className="table-cell-input"
                              value={row.address ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "address", event.target.value)}
                              placeholder="주소"
                            />
                          )
                        : <td>{row.address || "-"}</td>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            formatAccountInfo(row),
                            <input
                              className="table-cell-input"
                              value={row.accountInfoInput ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "accountInfoInput", event.target.value)}
                              placeholder="은행 계좌번호 예금주"
                            />
                          )
                        : <td>{formatAccountInfo(row)}</td>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.amount == null ? "" : String(row.amount),
                            <input
                              className="table-cell-input table-cell-input-number"
                              value={row.amountInput ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "amountInput", event.target.value)}
                              placeholder="금액"
                            />
                          )
                        : <td>{row.amount ?? "-"}</td>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.review_fee == null ? "" : String(row.review_fee),
                            <input
                              className="table-cell-input table-cell-input-number"
                              value={row.reviewFeeInput ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "reviewFeeInput", event.target.value)}
                              placeholder="리뷰비"
                            />
                          )
                        : <td>{row.review_fee ?? "-"}</td>}
                      <td>
                        <div className="photo-link-list">
                          {row.photos?.length ? (
                            row.photos.map((photo, photoIndex) => {
                              const url = getPhotoUrl(photo);

                              return (
                                <button
                                  key={`${row.id}-${getPhotoId(photo) ?? url}-${photoIndex}`}
                                  type="button"
                                  className="photo-thumb-button"
                                  onClick={() => openPhotoViewer(row.photos, photoIndex)}
                                >
                                  <img src={url} alt={`증빙 이미지 ${photoIndex + 1}`} className="photo-thumb-image" />
                                </button>
                              );
                            })
                          ) : (
                            <span>제출 전</span>
                          )}
                        </div>
                      </td>
                      <td>{getSectionPlannedDepositorName(row) || "-"}</td>
                      <td>
                        <label className="pretty-checkbox">
                          <input
                            type="checkbox"
                            checked={Boolean(row.is_review_verified)}
                            disabled={updatingRowId === row.id}
                            onChange={(event) => handleReviewVerifiedChange(row, event.target.checked)}
                          />
                          <span className="checkmark" aria-hidden="true" />
                        </label>
                      </td>
                      <td>
                        <label className="pretty-checkbox">
                          <input
                            type="checkbox"
                            checked={Boolean(row.is_deposit_verified)}
                            disabled={updatingRowId === row.id || !row.is_review_verified || !canVerifyDeposit}
                            onChange={(event) => handleDepositVerifiedChange(row, event.target.checked)}
                          />
                          <span className="checkmark" aria-hidden="true" />
                        </label>
                      </td>
                      {!isPurchaseSection &&
                        (isReviewCompletionSection ? (
                          <>
                            <td>
                              <input
                                type="date"
                                className="table-cell-input"
                                value={row.deposited_at ?? ""}
                                onChange={(event) => handleFieldChange(row.id, "deposited_at", event.target.value)}
                                onBlur={() => handleReviewCompletionMetaSave(row)}
                                disabled={updatingRowId === row.id || !canVerifyDeposit}
                              />
                            </td>
                            <td>
                              <input
                                className="table-cell-input"
                                value={row.actual_depositor_name ?? ""}
                                onChange={(event) => handleFieldChange(row.id, "actual_depositor_name", event.target.value)}
                                onBlur={() => handleReviewCompletionMetaSave(row)}
                                placeholder="실제입금자명"
                                disabled={updatingRowId === row.id || !canVerifyDeposit}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{row.deposited_at || "-"}</td>
                            <td>{row.actual_depositor_name || "-"}</td>
                          </>
                        ))}
                      {showPurchaseActions && (
                        <td>
                          <div className="table-cell-actions">
                            {row.isEditing && (
                              <button
                                type="button"
                                className="admin-small-button"
                                onClick={() => handleSaveRow(row)}
                                disabled={updatingRowId === row.id || (!row.isDirty && !row.isNew)}
                              >
                                {row.isNew ? "추가" : "저장"}
                              </button>
                            )}
                            <button
                              type="button"
                              className="admin-small-button"
                              data-row-editor-toggle-id={row.id}
                              onClick={() => {
                                if (row.isEditing && !row.isNew && !row.isDirty) {
                                  closeRowEditor(row.id);
                                  return;
                                }

                                openRowEditor(row.id);
                              }}
                              disabled={updatingRowId === row.id}
                            >
                              구매정보
                            </button>
                            <button
                              type="button"
                              className="admin-danger-button"
                              onClick={() => handleDeleteRow(row)}
                              disabled={updatingRowId === row.id}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {showPurchaseActions && row.isEditing && (
                      <tr className="review-receive-inline-fill-row" data-row-editor-id={row.id}>
                        <td colSpan={16}>
                          <div className="review-receive-inline-fill-box">
                            <label className="review-receive-inline-fill-label" htmlFor={`inline-purchase-info-${row.id}`}>
                              구매정보 빠른입력
                            </label>
                            <input
                              id={`inline-purchase-info-${row.id}`}
                              className="review-receive-inline-fill-input"
                              value={row.inlinePurchaseInfoInput ?? ""}
                              onChange={(event) => handleInlinePurchaseInfoChange(row.id, event.target.value)}
                              placeholder={
                                row.isNew
                                  ? "주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액 또는 배정명 / 주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액"
                                  : "주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액 또는 주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액"
                              }
                            />
                            {row.inlinePurchaseInfoMessage && (
                              <p className={`review-receive-bulk-message is-${row.inlinePurchaseInfoMessageType}`}>
                                {row.inlinePurchaseInfoMessage}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
              {showAddRow && (
                <tr className="review-receive-add-row">
                  <td colSpan={15}>
                    <button
                      type="button"
                      className="review-receive-add-row-button"
                      onClick={handleAddRow}
                      aria-label="구매완료 행 추가"
                    >
                      +
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  };


  return renderSection(sectionKey, title, description, totalRows, filteredRows, options);
}
