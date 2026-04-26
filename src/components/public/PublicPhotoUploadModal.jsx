import AppAlertDialog from "../common/AppAlertDialog";
import { useModalEnterConfirm } from "../../hooks/useModalEnterConfirm";

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }

  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}

export default function PublicPhotoUploadModal({
  editorState,
  onClose,
  onFilesSelected,
  onToggleExistingPhoto,
  onRemoveNewPhoto,
  onResetDraft,
  onSaveDraft
}) {
  const saveDraftEnterConfirm = useModalEnterConfirm({
    isOpen: Boolean(editorState?.isOpen),
    isDisabled: Boolean(editorState?.isLocked) || Boolean(editorState?.isSaving),
    actionLabel: "저장",
    confirmButtonLabel: "저장하기",
    onConfirm: onSaveDraft
  });

  if (!editorState?.isOpen) {
    return null;
  }

  const {
    row,
    rowNumber,
    isLocked,
    existingPhotos,
    newPhotos,
    feedbackMessage,
    isSaving
  } = editorState;

  const keptExistingCount = existingPhotos.filter((photo) => !photo.isRemoved).length;
  const totalAfterSave = keptExistingCount + newPhotos.length;

  return (
    <div className="review-receive-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="review-receive-modal public-photo-modal"
        role="dialog"
        aria-modal="true"
        aria-label="사진 업로드 관리"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={saveDraftEnterConfirm.handleModalKeyDown}
      >
        <div className="review-receive-modal-header">
          <div>
            <h2>사진 업로드 관리</h2>
            <p>{`순번 ${rowNumber ?? "-"} / 주문번호 ${row?.order_number || "-"} / 구매자 ${row?.buyer_name || "-"}`}</p>
          </div>
          <button type="button" className="review-receive-modal-close" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="review-receive-modal-body public-photo-modal-body">
          <div className={`public-photo-modal-note${isLocked ? " is-locked" : ""}`}>
            <strong>{isLocked ? "사진 수정이 잠겼습니다." : "사진 추가/삭제 후 저장하면 바로 반영됩니다."}</strong>
            <p>
              {isLocked
                ? "관리자가 리뷰완료 처리한 행은 더 이상 수정할 수 없습니다."
                : "저장하기를 누르면 S3 업로드와 DB 저장이 함께 진행됩니다."}
            </p>
          </div>

          <div className="public-photo-upload-controls">
            <label className={`public-photo-upload-button${isLocked ? " is-disabled" : ""}`}>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={isLocked || isSaving}
                onChange={(event) => {
                  onFilesSelected(event.target.files);
                  event.target.value = "";
                }}
              />
              사진 추가하기
            </label>
            <span className="public-photo-upload-summary">{`저장 후 표시 예정 ${totalAfterSave}장`}</span>
          </div>

          {feedbackMessage && <p className="login-message">{feedbackMessage}</p>}

          <div className="public-photo-modal-section">
            <div className="public-photo-modal-section-header">
              <h3>기존 사진</h3>
              <p>기존 DB 사진은 삭제 예정 상태로 표시할 수 있습니다.</p>
            </div>
            <div className="public-photo-grid">
              {existingPhotos.length === 0 ? (
                <div className="public-photo-empty-card">
                  <p>기존에 저장된 사진이 없습니다.</p>
                </div>
              ) : (
                existingPhotos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className={`public-photo-card${photo.isRemoved ? " is-removed" : ""}`}
                  >
                    <img src={photo.url} alt={`기존 사진 ${index + 1}`} className="public-photo-card-image" />
                    <div className="public-photo-card-body">
                      <strong>{`기존 사진 ${index + 1}`}</strong>
                      <p>{photo.isRemoved ? "삭제 예정" : "유지 예정"}</p>
                    </div>
                    <button
                      type="button"
                      className={photo.isRemoved ? "admin-secondary-button" : "admin-danger-button"}
                      onClick={() => onToggleExistingPhoto(photo.id)}
                      disabled={isLocked || isSaving}
                    >
                      {photo.isRemoved ? "복원" : "삭제 예정"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="public-photo-modal-section">
            <div className="public-photo-modal-section-header">
              <h3>새로 추가한 사진</h3>
              <p>브라우저에서 선택한 파일 미리보기입니다.</p>
            </div>
            <div className="public-photo-grid">
              {newPhotos.length === 0 ? (
                <div className="public-photo-empty-card">
                  <p>아직 새로 선택한 사진이 없습니다.</p>
                </div>
              ) : (
                newPhotos.map((photo, index) => (
                  <div key={photo.id} className="public-photo-card is-new">
                    <img src={photo.previewUrl} alt={`새 사진 ${index + 1}`} className="public-photo-card-image" />
                    <div className="public-photo-card-body">
                      <strong>{photo.file.name}</strong>
                      <p>{formatFileSize(photo.file.size)}</p>
                    </div>
                    <button
                      type="button"
                      className="admin-danger-button"
                      onClick={() => onRemoveNewPhoto(photo.id)}
                      disabled={isLocked || isSaving}
                    >
                      제거
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="review-receive-modal-actions">
          <button type="button" className="admin-secondary-button" onClick={onResetDraft} disabled={isLocked || isSaving}>
            초안 초기화
          </button>
          <button type="button" className="admin-secondary-button" onClick={onClose} disabled={isSaving}>
            취소
          </button>
          <button type="button" className="admin-primary-button" onClick={onSaveDraft} disabled={isLocked || isSaving}>
            {isSaving ? "업로드 중..." : "저장하기"}
          </button>
        </div>

        <AppAlertDialog {...saveDraftEnterConfirm.confirmDialogProps} />
      </div>
    </div>
  );
}
