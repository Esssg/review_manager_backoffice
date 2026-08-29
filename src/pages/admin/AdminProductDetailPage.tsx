import { useState } from "react";
import { useParams } from "react-router-dom";
import ApplicationsTable from "@/components/admin/product-detail/ApplicationsTable";
import PhotoViewerModal from "@/components/admin/product-detail/PhotoViewerModal";
import ProductSummary from "@/components/admin/product-detail/ProductSummary";
import StepTabList from "@/components/admin/product-detail/StepTabList";
import SubmissionInput from "@/components/admin/product-detail/SubmissionInput";
import SubmissionTable from "@/components/admin/product-detail/SubmissionTable";
import AppAlertDialog from "@/components/common/AppAlertDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ADMIN_STORAGE_KEY } from "@/constants/admin";
import { isAdminGatewayConfigured } from "@/services/adminGateway";
import { useAdminProductDetail } from "@/hooks/useAdminProductDetail";
import { getLocalStorageValue } from "@/utils/browserStorage";

export default function AdminProductDetailPage() {
  const adminId = getLocalStorageValue(ADMIN_STORAGE_KEY);
  const { productId } = useParams();
  const [deleteTargetSubmissionId, setDeleteTargetSubmissionId] = useState(null);
  const [isDeletingSubmission, setIsDeletingSubmission] = useState(false);
  const [deleteTargetPhoto, setDeleteTargetPhoto] = useState(null);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const {
    activeTab,
    addSubmissionMessage,
    canConfirmApplication,
    canCreateSubmission,
    canDeletePhoto,
    canDeleteSubmission,
    canReadPhotos,
    canUpdateProductStep,
    canUpdateSubmission,
    enabledSteps,
    errorMessage,
    handleAddSubmission,
    handleApplicationConfirmChange,
    handleDeletePhoto,
    handleDeleteSubmission,
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
  const openDeletePhotoDialog = (photo) => {
    setDeleteTargetPhoto(photo);
  };
  const closeDeletePhotoDialog = () => {
    if (isDeletingPhoto) {
      return;
    }

    setDeleteTargetPhoto(null);
  };
  const confirmDeletePhoto = async () => {
    if (!deleteTargetPhoto) {
      return;
    }

    setIsDeletingPhoto(true);
    const didDelete = await handleDeletePhoto(deleteTargetPhoto);
    if (didDelete) {
      setDeleteTargetPhoto(null);
    }
    setIsDeletingPhoto(false);
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
            addSubmissionMessage={addSubmissionMessage}
            isAddSubmissionError={isAddSubmissionError}
            isAddingSubmission={isAddingSubmission}
            canCreate={canCreateSubmission}
            newSubmissionText={newSubmissionText}
            onAddSubmission={handleAddSubmission}
            onSubmissionTextChange={setNewSubmissionText}
          />
        )}

        <label className="step-toggle-box inline-step-toggle">
          <Checkbox
            checked={Boolean(enabledSteps[activeTab])}
            onCheckedChange={(checked) => handleStepEnabledChange(Boolean(checked))}
            disabled={isUpdatingStep || !canUpdateProductStep}
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
            canConfirm={canConfirmApplication}
            requireManagerMatch={!isAdminGatewayConfigured()}
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
                canDelete={canDeleteSubmission}
                canReadPhotos={canReadPhotos}
                canVerify={canUpdateSubmission}
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
                canDelete={canDeleteSubmission}
                canReadPhotos={canReadPhotos}
                canVerify={canUpdateSubmission}
                onDeleteSubmission={openDeleteSubmissionDialog}
                onOpenPhotoViewer={openPhotoViewer}
                onVerifyChange={handleSubmissionVerifyChange}
              />
            </section>
          </>
        )}
      </section>

      <PhotoViewerModal
        photoViewer={photoViewer}
        onClose={closePhotoViewer}
        onNext={showNextPhoto}
        onPrev={showPrevPhoto}
        onRequestDelete={canDeletePhoto ? openDeletePhotoDialog : undefined}
        isDeleting={isDeletingPhoto}
      />
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
        isOpen={Boolean(deleteTargetPhoto)}
        variant="danger"
        badgeLabel="사진 삭제"
        title="이 사진을 삭제할까요?"
        cancelLabel="취소"
        confirmLabel="삭제하기"
        busyConfirmLabel="삭제 중..."
        isBusy={isDeletingPhoto}
        onCancel={closeDeletePhotoDialog}
        onConfirm={confirmDeletePhoto}
        confirmButtonClassName="admin-danger-button"
        ariaLabel="증빙 사진 삭제 확인"
      >
        <p>확대 화면과 목록에서 해당 증빙 사진이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
      </AppAlertDialog>
    </>
  );
}
