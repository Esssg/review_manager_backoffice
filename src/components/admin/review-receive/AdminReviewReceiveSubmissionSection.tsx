import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPhotoId, getPhotoUrl } from "@/utils/photoItems";
import {
  getVisibleReviewReceiveRowFilterColumns,
  hasActiveReviewReceiveRowFilters
} from "@/utils/reviewReceiveDetailTable";
import ReviewReceiveFilterHeader from "@/components/admin/review-receive/ReviewReceiveFilterHeader";

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
    canCreateSubmission,
    canUpdateSubmission,
    canDeleteSubmission,
    canReadPhotos,
    canUpdateDepositorName,
    canExport,
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
    <TableCell onDoubleClick={() => openRowEditor(row.id)}>
      {row.isEditing ? inputNode : displayValue || "-"}
    </TableCell>
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

  const renderSection = (sectionKey, title, description, totalRows, filteredRows, options: any = {}) => {
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
            <Button
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
              disabled={filteredRows.length === 0 || !canExport}
            >
              엑셀로 내려받기
            </Button>
            <Button
              type="button"
              className="review-receive-section-toggle"
              onClick={() => toggleSectionCollapsed(sectionKey)}
              aria-expanded={!isCollapsed}
              aria-controls={sectionBodyId}
            >
              {isCollapsed ? "펼치기" : "접기"}
            </Button>
          </div>
        </div>

        <div id={sectionBodyId} hidden={isCollapsed}>
          {bodyIntro}
          <div className="review-receive-section-toolbar">
            {showPurchaseToolbar && (
              <div className="review-receive-toolbar-actions">
                <div className="review-receive-toolbar-button-row">
                  <Button type="button" className="admin-secondary-button" onClick={handleCopyPurchaseBuyers}>
                    구매자 복사하기
                  </Button>
                  <Button type="button" className="admin-secondary-button" onClick={openPurchaseAssignModal} disabled={!canCreateSubmission && !canUpdateSubmission}>
                    구매자 일괄 입력
                  </Button>
                  <Button
                    type="button"
                    className="admin-secondary-button"
                    onClick={openReviewFeeBatchDialog}
                    disabled={filteredPurchaseSectionRows.length === 0 || !canUpdateSubmission}
                  >
                    리뷰비 일괄 입력하기
                  </Button>
                  <Button
                    type="button"
                    className="admin-secondary-button"
                    onClick={openPhotoReviewBatchModal}
                    disabled={photoReviewBatchTargetRows.length === 0 || !canUpdateSubmission}
                  >
                    리뷰완료 일괄처리
                  </Button>
                  <Button type="button" className="admin-primary-button" onClick={openPurchaseBulkModal} disabled={!canCreateSubmission && !canUpdateSubmission}>
                    구매정보 입력하기
                  </Button>
                </div>
              </div>
            )}
            {sectionKey === "review" && (
              <div className="review-receive-toolbar-actions">
                <Button
                  type="button"
                  className="admin-primary-button"
                  onClick={openReviewBatchModal}
                  disabled={!canVerifyDeposit || !canUpdateSubmission || filteredReviewCompletedRows.length === 0}
                >
                  일괄처리하기
                </Button>
              </div>
            )}
            {showSelectionActions && (
              <>
                <Button
                  type="button"
                  className="review-receive-select-all-button"
                  onClick={() => toggleRowsSelection(filteredRows)}
                  disabled={filteredRows.length === 0}
                >
                  {filteredRows.length > 0 && selectedRowsInSectionCount === filteredRows.length
                    ? "전체 해제하기"
                    : "전체 선택하기"}
                </Button>
                <Button
                  type="button"
                  className="review-receive-delete-selected-button"
                  onClick={() => openSelectedRowsDeleteDialog(filteredRows)}
                  disabled={selectedRowsInSectionCount === 0 || !canDeleteSubmission}
                >
                  {selectedRowsInSectionCount > 0 ? `삭제하기 ${selectedRowsInSectionCount}` : "삭제하기"}
                </Button>
              </>
            )}
            <Input
              type="search"
              className="review-receive-search-input"
              value={searchValue}
              onChange={(event) => handleSectionSearchChange(sectionKey, event.target.value)}
              placeholder={`${title} 섹션 검색`}
              aria-label={`${title} 섹션 검색`}
            />
          </div>

          <div className="table-scroll-wrap review-receive-detail-table-wrap">
            <Table
              className={[
                "review-receive-table",
                `review-receive-table-${isPurchaseSection ? "purchase" : sectionKey}`,
                showPurchaseActions ? "has-row-actions" : ""
              ].filter(Boolean).join(" ")}
            >
              {renderTableColumns(isPurchaseSection, showPurchaseActions)}
              <TableHeader>
                <TableRow>
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
                  {showPurchaseActions && <TableHead>관리</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isPurchaseSection ? (showPurchaseActions ? 16 : 15) : 17}>{emptyMessage}</TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                  <Fragment key={row.id}>
                    <TableRow
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
                      <TableCell className="review-row-index">{sectionRowNumberMap[row.id] ?? "-"}</TableCell>
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.assign_name,
                            <Input
                              className="table-cell-input"
                              value={row.assign_name ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "assign_name", event.target.value)}
                              placeholder="배정명"
                            />
                          )
                        : <TableCell>{row.assign_name || "-"}</TableCell>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.order_number,
                            <Input
                              className="table-cell-input"
                              value={row.order_number ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "order_number", event.target.value)}
                              placeholder="주문번호"
                            />
                          )
                        : <TableCell>{row.order_number || "-"}</TableCell>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.buyer_name,
                            <Input
                              className="table-cell-input"
                              value={row.buyer_name ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "buyer_name", event.target.value)}
                              placeholder="구매자"
                            />
                          )
                        : <TableCell>{row.buyer_name || "-"}</TableCell>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.recipient_name,
                            <Input
                              className="table-cell-input"
                              value={row.recipient_name ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "recipient_name", event.target.value)}
                              placeholder="수취인"
                            />
                          )
                        : <TableCell>{row.recipient_name || "-"}</TableCell>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.purchase_account,
                            <Input
                              className="table-cell-input"
                              value={row.purchase_account ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "purchase_account", event.target.value)}
                              placeholder="구매계정"
                            />
                          )
                        : <TableCell>{row.purchase_account || "-"}</TableCell>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.contact,
                            <Input
                              className="table-cell-input"
                              value={row.contact ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "contact", event.target.value)}
                              placeholder="연락처"
                            />
                          )
                        : <TableCell>{row.contact || "-"}</TableCell>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.address,
                            <Input
                              className="table-cell-input"
                              value={row.address ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "address", event.target.value)}
                              placeholder="주소"
                            />
                          )
                        : <TableCell>{row.address || "-"}</TableCell>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            formatAccountInfo(row),
                            <Input
                              className="table-cell-input"
                              value={row.accountInfoInput ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "accountInfoInput", event.target.value)}
                              placeholder="은행 계좌번호 예금주"
                            />
                          )
                        : <TableCell>{formatAccountInfo(row)}</TableCell>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.amount == null ? "" : String(row.amount),
                            <Input
                              className="table-cell-input table-cell-input-number"
                              value={row.amountInput ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "amountInput", event.target.value)}
                              placeholder="금액"
                            />
                          )
                        : <TableCell>{row.amount ?? "-"}</TableCell>}
                      {showPurchaseActions && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.review_fee == null ? "" : String(row.review_fee),
                            <Input
                              className="table-cell-input table-cell-input-number"
                              value={row.reviewFeeInput ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "reviewFeeInput", event.target.value)}
                              placeholder="리뷰비"
                            />
                          )
                        : <TableCell>{row.review_fee ?? "-"}</TableCell>}
                      <TableCell>
                        <div className="photo-link-list">
                          {row.photos?.length ? (
                            row.photos.map((photo, photoIndex) => {
                              const url = getPhotoUrl(photo);

                              return (
                                <Button
                                  key={`${row.id}-${getPhotoId(photo) ?? url}-${photoIndex}`}
                                  type="button"
                                  className="photo-thumb-button"
                                  onClick={() => openPhotoViewer(row.photos, photoIndex)}
                                  disabled={!canReadPhotos}
                                >
                                  <img src={url} alt={`증빙 이미지 ${photoIndex + 1}`} className="photo-thumb-image" />
                                </Button>
                              );
                            })
                          ) : (
                            <span>제출 전</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getSectionPlannedDepositorName(row) || "-"}</TableCell>
                      <TableCell>
                        <Checkbox
                          checked={Boolean(row.is_review_verified)}
                          disabled={
                            updatingRowId === row.id ||
                            (row.isNew ? !canCreateSubmission : !canUpdateSubmission) ||
                            (Boolean(row.is_review_verified) && canVerifyDeposit && !canUpdateDepositorName)
                          }
                          onCheckedChange={(checked) => handleReviewVerifiedChange(row, Boolean(checked))}
                          aria-label={`${row.id} 리뷰완료`}
                        />
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={Boolean(row.is_deposit_verified)}
                          disabled={
                            updatingRowId === row.id ||
                            !row.is_review_verified ||
                            (row.isNew ? !canCreateSubmission : !canUpdateSubmission) ||
                            !canVerifyDeposit ||
                            !canUpdateDepositorName
                          }
                          onCheckedChange={(checked) => handleDepositVerifiedChange(row, Boolean(checked))}
                          aria-label={`${row.id} 입금완료`}
                        />
                      </TableCell>
                      {!isPurchaseSection &&
                        (isReviewCompletionSection ? (
                          <>
                            <TableCell>
                              <Input
                                type="date"
                                className="table-cell-input"
                                value={row.deposited_at ?? ""}
                                onChange={(event) => handleFieldChange(row.id, "deposited_at", event.target.value)}
                                onBlur={() => handleReviewCompletionMetaSave(row)}
                                disabled={updatingRowId === row.id || !canUpdateSubmission || !canUpdateDepositorName}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="table-cell-input"
                                value={row.actual_depositor_name ?? ""}
                                onChange={(event) => handleFieldChange(row.id, "actual_depositor_name", event.target.value)}
                                onBlur={() => handleReviewCompletionMetaSave(row)}
                                placeholder="실제입금자명"
                                disabled={updatingRowId === row.id || !canUpdateSubmission || !canUpdateDepositorName}
                              />
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>{row.deposited_at || "-"}</TableCell>
                            <TableCell>{row.actual_depositor_name || "-"}</TableCell>
                          </>
                        ))}
                      {showPurchaseActions && (
                        <TableCell>
                          <div className="table-cell-actions">
                            {row.isEditing && (
                              <Button
                                type="button"
                                className="admin-small-button"
                                onClick={() => handleSaveRow(row)}
                                disabled={
                                  updatingRowId === row.id ||
                                  (!row.isDirty && !row.isNew) ||
                                  (row.isNew ? !canCreateSubmission : !canUpdateSubmission) ||
                                  (Boolean(row.is_deposit_verified) && (!canVerifyDeposit || !canUpdateDepositorName))
                                }
                              >
                                {row.isNew ? "추가" : "저장"}
                              </Button>
                            )}
                            <Button
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
                              disabled={updatingRowId === row.id || (row.isNew ? !canCreateSubmission : !canUpdateSubmission)}
                            >
                              구매정보
                            </Button>
                            <Button
                              type="button"
                              className="admin-danger-button"
                              onClick={() => handleDeleteRow(row)}
                              disabled={updatingRowId === row.id || (!row.isNew && !canDeleteSubmission)}
                            >
                              삭제
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    {showPurchaseActions && row.isEditing && (
                      <TableRow className="review-receive-inline-fill-row" data-row-editor-id={row.id}>
                        <TableCell colSpan={16}>
                          <div className="review-receive-inline-fill-box">
                            <label className="review-receive-inline-fill-label" htmlFor={`inline-purchase-info-${row.id}`}>
                              구매정보 빠른입력
                            </label>
                            <Input
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
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
              {showAddRow && (
                <TableRow className="review-receive-add-row">
                  <TableCell colSpan={15}>
                    <Button
                      type="button"
                      className="review-receive-add-row-button"
                      onClick={handleAddRow}
                      disabled={!canCreateSubmission}
                      aria-label="구매완료 행 추가"
                    >
                      +
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            </Table>
          </div>
        </div>
      </section>
    );
  };


  return renderSection(sectionKey, title, description, totalRows, filteredRows, options);
}
