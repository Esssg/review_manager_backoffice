import { useState } from "react";
import { useParams } from "react-router-dom";
import ApplicationsTable from "../../components/admin/product-detail/ApplicationsTable";
import PhotoViewerModal from "../../components/admin/product-detail/PhotoViewerModal";
import ProductSummary from "../../components/admin/product-detail/ProductSummary";
import StepTabList from "../../components/admin/product-detail/StepTabList";
import SubmissionInput from "../../components/admin/product-detail/SubmissionInput";
import SubmissionTable from "../../components/admin/product-detail/SubmissionTable";
import AppAlertDialog from "../../components/common/AppAlertDialog";
import { ADMIN_STORAGE_KEY } from "../../constants/admin";
import { useAdminProductDetail } from "../../hooks/useAdminProductDetail";

export default function AdminProductDetailPage() {
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  const { productId } = useParams();
  const [deleteTargetSubmissionId, setDeleteTargetSubmissionId] = useState(null);
  const [isDeletingSubmission, setIsDeletingSubmission] = useState(false);
  const [isReviewFeeBatchDialogOpen, setIsReviewFeeBatchDialogOpen] = useState(false);
  const [reviewFeeBatchStartRow, setReviewFeeBatchStartRow] = useState("");
  const [reviewFeeBatchEndRow, setReviewFeeBatchEndRow] = useState("");
  const [reviewFeeBatchValue, setReviewFeeBatchValue] = useState("");
  const [reviewFeeBatchMessage, setReviewFeeBatchMessage] = useState("");
  const [isApplyingReviewFeeBatch, setIsApplyingReviewFeeBatch] = useState(false);
  const {
    activeTab,
    addSubmissionMessage,
    enabledSteps,
    errorMessage,
    handleAddSubmission,
    handleApplicationConfirmChange,
    handleDeleteSubmission,
    handleReviewFeeBatchApply,
    handleStepEnabledChange,
    handleSubmissionVerifyChange,
    isAddSubmissionError,
    isAddingSubmission,
    isLoading,
    isPurchaseOrReviewTab,
    isUpdatingStep,
    newSubmissionText,
    openPhotoViewer,
    photoViewer,
    product,
    rows,
    setActiveTab,
    setNewSubmissionText,
    showNextPhoto,
    showPrevPhoto,
    unverifiedRows,
    verifiedRows,
    closePhotoViewer
  } = useAdminProductDetail({ adminId, productId });
  const openDeleteSubmissionDialog = (submissionId) => {
    setDeleteTargetSubmissionId(submissionId);
  };
  const closeDeleteSubmissionDialog = () => {
    if (isDeletingSubmission) {
      return;
    }

    setDeleteTargetSubmissionId(null);
  };
  const confirmDeleteSubmission = async () => {
    if (!deleteTargetSubmissionId) {
      return;
    }

    setIsDeletingSubmission(true);
    await handleDeleteSubmission(deleteTargetSubmissionId);
    setDeleteTargetSubmissionId(null);
    setIsDeletingSubmission(false);
  };

  const openReviewFeeBatchDialog = () => {
    setReviewFeeBatchStartRow(rows.length > 0 ? "1" : "");
    setReviewFeeBatchEndRow(rows.length > 0 ? String(rows.length) : "");
    setReviewFeeBatchValue("");
    setReviewFeeBatchMessage("");
    setIsReviewFeeBatchDialogOpen(true);
  };

  const closeReviewFeeBatchDialog = () => {
    if (isApplyingReviewFeeBatch) {
      return;
    }

    setIsReviewFeeBatchDialogOpen(false);
    setReviewFeeBatchMessage("");
  };

  const confirmReviewFeeBatchApply = async () => {
    setReviewFeeBatchMessage("");
    setIsApplyingReviewFeeBatch(true);

    try {
      await handleReviewFeeBatchApply({
        startRowNumber: reviewFeeBatchStartRow,
        endRowNumber: reviewFeeBatchEndRow,
        reviewFee: reviewFeeBatchValue
      });
      setIsReviewFeeBatchDialogOpen(false);
    } catch (error) {
      setReviewFeeBatchMessage(error?.message ?? "리뷰비 일괄 입력 중 오류가 발생했습니다.");
    } finally {
      setIsApplyingReviewFeeBatch(false);
    }
  };

  return (
    <>
      <header className="admin-header">
        <div>
          <h1>상품 상세</h1>
        </div>
      </header>

      <section className="step-controls">
        <div className="step-info-slot">
          <ProductSummary product={product} />
        </div>

        {isPurchaseOrReviewTab && (
          <SubmissionInput
            actionButtons={
              activeTab === "review" ? (
                <button
                  type="button"
                  className="admin-secondary-button submission-inline-secondary-button"
                  onClick={openReviewFeeBatchDialog}
                  disabled={isLoading || rows.length === 0}
                >
                  리뷰비 일괄 입력하기
                </button>
              ) : null
            }
            addSubmissionMessage={addSubmissionMessage}
            isAddSubmissionError={isAddSubmissionError}
            isAddingSubmission={isAddingSubmission}
            newSubmissionText={newSubmissionText}
            onAddSubmission={handleAddSubmission}
            onSubmissionTextChange={setNewSubmissionText}
          />
        )}

        <label className="step-toggle-box inline-step-toggle">
          <input
            type="checkbox"
            checked={Boolean(enabledSteps[activeTab])}
            onChange={(event) => handleStepEnabledChange(event.target.checked)}
            disabled={isUpdatingStep}
          />
          <span>이 단계 활성화 하기</span>
        </label>

        <StepTabList activeTab={activeTab} enabledSteps={enabledSteps} onTabChange={setActiveTab} />
      </section>

      <section className={`dashboard-panel${isPurchaseOrReviewTab ? " no-panel" : ""}`}>
        {isLoading && <p className="login-message">데이터를 불러오는 중...</p>}
        {!isLoading && errorMessage && <p className="login-error">{errorMessage}</p>}
        {!isLoading && !errorMessage && activeTab === "applications" && (
          <ApplicationsTable
            adminId={adminId}
            product={product}
            rows={rows}
            onConfirmChange={handleApplicationConfirmChange}
          />
        )}

        {!isLoading && !errorMessage && isPurchaseOrReviewTab && (
          <>
            <section className="dashboard-panel split-panel">
              <h3 className="subsection-title">미완료 항목</h3>
              <SubmissionTable
                activeTab={activeTab}
                emptyText="미완료 데이터가 없습니다."
                rows={unverifiedRows}
                onDeleteSubmission={openDeleteSubmissionDialog}
                onOpenPhotoViewer={openPhotoViewer}
                onVerifyChange={handleSubmissionVerifyChange}
              />
            </section>

            <section className="dashboard-panel split-panel">
              <h3 className="subsection-title">완료 항목</h3>
              <SubmissionTable
                activeTab={activeTab}
                emptyText="완료 데이터가 없습니다."
                rows={verifiedRows}
                onDeleteSubmission={openDeleteSubmissionDialog}
                onOpenPhotoViewer={openPhotoViewer}
                onVerifyChange={handleSubmissionVerifyChange}
              />
            </section>
          </>
        )}
      </section>

      <PhotoViewerModal photoViewer={photoViewer} onClose={closePhotoViewer} onNext={showNextPhoto} onPrev={showPrevPhoto} />
      <AppAlertDialog
        isOpen={Boolean(deleteTargetSubmissionId)}
        variant="danger"
        badgeLabel="삭제 확인"
        title="해당 항목을 삭제할까요?"
        cancelLabel="취소"
        confirmLabel="삭제하기"
        busyConfirmLabel="삭제 중..."
        isBusy={isDeletingSubmission}
        onCancel={closeDeleteSubmissionDialog}
        onConfirm={confirmDeleteSubmission}
        confirmButtonClassName="admin-danger-button"
        ariaLabel="제출 항목 삭제 확인"
      >
        <p>연결된 증빙 사진 데이터가 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
      </AppAlertDialog>
      <AppAlertDialog
        isOpen={isReviewFeeBatchDialogOpen}
        variant="info"
        badgeLabel="리뷰비 일괄 입력"
        title="순번 범위에 리뷰비를 입력할까요?"
        description={`현재 리뷰 탭 순번 기준으로 1부터 ${rows.length}까지 지정할 수 있습니다.`}
        cancelLabel="취소"
        confirmLabel="입력하기"
        busyConfirmLabel="입력 중..."
        isBusy={isApplyingReviewFeeBatch}
        onCancel={closeReviewFeeBatchDialog}
        onConfirm={confirmReviewFeeBatchApply}
        ariaLabel="리뷰비 일괄 입력"
      >
        <div className="review-fee-batch-form">
          <label className="review-fee-batch-field">
            <span>시작 순번</span>
            <input
              type="number"
              min="1"
              value={reviewFeeBatchStartRow}
              onChange={(event) => setReviewFeeBatchStartRow(event.target.value)}
              placeholder="예: 1"
              disabled={isApplyingReviewFeeBatch}
            />
          </label>
          <label className="review-fee-batch-field">
            <span>끝 순번</span>
            <input
              type="number"
              min="1"
              value={reviewFeeBatchEndRow}
              onChange={(event) => setReviewFeeBatchEndRow(event.target.value)}
              placeholder="예: 10"
              disabled={isApplyingReviewFeeBatch}
            />
          </label>
          <label className="review-fee-batch-field">
            <span>리뷰비</span>
            <input
              type="number"
              min="0"
              value={reviewFeeBatchValue}
              onChange={(event) => setReviewFeeBatchValue(event.target.value)}
              placeholder="예: 1000"
              disabled={isApplyingReviewFeeBatch}
            />
          </label>
        </div>
        <p className="review-fee-batch-hint">예: `3`부터 `7`까지 지정하면 순번 3~7 행의 리뷰비가 같은 값으로 바뀝니다.</p>
        {reviewFeeBatchMessage && <p className="login-error review-fee-batch-message">{reviewFeeBatchMessage}</p>}
      </AppAlertDialog>
    </>
  );
}
