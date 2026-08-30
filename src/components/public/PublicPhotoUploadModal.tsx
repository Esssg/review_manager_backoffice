import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PublicLoadingIndicator from "@/components/public/PublicLoadingIndicator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import AppAlertDialog from "@/components/common/AppAlertDialog";
import { useModalEnterConfirm } from "@/hooks/useModalEnterConfirm";

export default function PublicPhotoUploadModal({
  editorState,
  onClose,
  onFilesSelected,
  onRemoveNewPhoto,
  onResetDraft,
  onSaveDraft
}) {
  const hasExistingSubmission = (editorState?.existingPhotos?.length ?? 0) > 0;
  const submitActionLabel = hasExistingSubmission ? "사진 재제출" : "사진 제출";
  const submitButtonLabel = hasExistingSubmission ? "재제출하기" : "제출하기";

  const saveDraftEnterConfirm = useModalEnterConfirm({
    isOpen: Boolean(editorState?.isOpen),
    isDisabled:
      Boolean(editorState?.isLocked) || Boolean(editorState?.isSaving) || (editorState?.newPhotos?.length ?? 0) === 0,
    actionLabel: submitActionLabel,
    confirmButtonLabel: submitButtonLabel,
    onConfirm: onSaveDraft
  });
  const dragDepthRef = useRef(0);
  const [isDesktopDragEnabled, setIsDesktopDragEnabled] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(min-width: 769px) and (pointer: fine)");
    const syncDesktopDragAvailability = (event) => {
      setIsDesktopDragEnabled(event.matches);
    };

    syncDesktopDragAvailability(mediaQuery);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncDesktopDragAvailability);
      return () => {
        mediaQuery.removeEventListener("change", syncDesktopDragAvailability);
      };
    }

    mediaQuery.addListener(syncDesktopDragAvailability);
    return () => {
      mediaQuery.removeListener(syncDesktopDragAvailability);
    };
  }, []);

  useEffect(() => {
    if (editorState?.isOpen) {
      return undefined;
    }

    dragDepthRef.current = 0;
    setIsDragActive(false);
    return undefined;
  }, [editorState?.isOpen]);

  useEffect(() => {
    if (!editorState?.isOpen || editorState?.isLocked || editorState?.isSaving) {
      return undefined;
    }

    const handleDocumentPaste = (event) => {
      const clipboardItems = Array.from(event.clipboardData?.items ?? []) as DataTransferItem[];
      const pastedFiles = clipboardItems
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item, index) => {
          const file = item.getAsFile();

          if (!file) {
            return null;
          }

          const fileExtension = file.type.split("/")[1] || "png";
          return new File([file], file.name || `pasted-image-${Date.now()}-${index}.${fileExtension}`, {
            type: file.type
          });
        })
        .filter(Boolean);

      if (pastedFiles.length === 0) {
        return;
      }

      event.preventDefault();
      onFilesSelected(pastedFiles);
    };

    document.addEventListener("paste", handleDocumentPaste);
    return () => {
      document.removeEventListener("paste", handleDocumentPaste);
    };
  }, [editorState?.isLocked, editorState?.isOpen, editorState?.isSaving, onFilesSelected]);

  if (!editorState?.isOpen) {
    return null;
  }

  const {
    row,
    rowNumber,
    isLocked,
    newPhotos,
    feedbackMessage,
    isSaving
  } = editorState;

  const isDropDisabled = !isDesktopDragEnabled || isLocked || isSaving;
  const canSubmitReplacement = newPhotos.length > 0;
  const isFeedbackError = /^\[\d{5}\]/.test(feedbackMessage);

  const handleDialogOpenChange = (nextIsOpen) => {
    if (nextIsOpen || isSaving) {
      return;
    }

    onClose();
  };

  const handlePointerDownOutside = (event) => {
    if (isSaving) {
      event.preventDefault();
    }
  };

  const handleEscapeKeyDown = (event) => {
    if (isSaving) {
      event.preventDefault();
    }
  };

  const handleDragEnter = (event) => {
    if (isDropDisabled) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event) => {
    if (isDropDisabled) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event) => {
    if (isDropDisabled) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (event) => {
    if (isDropDisabled) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    onFilesSelected(event.dataTransfer?.files);
  };

  return (
    <Dialog open={Boolean(editorState?.isOpen)} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="review-receive-modal public-photo-modal"
        aria-label="사진 업로드 관리"
        showCloseButton={false}
        onPointerDownOutside={handlePointerDownOutside}
        onEscapeKeyDown={handleEscapeKeyDown}
        onKeyDown={saveDraftEnterConfirm.handleModalKeyDown}
      >
        <DialogHeader className="review-receive-modal-header">
          <div>
            <DialogTitle>사진 업로드 관리</DialogTitle>
            <DialogDescription>{`순번 ${rowNumber ?? "-"} / 주문번호 ${row?.order_number || "-"} / 구매자 ${row?.buyer_name || "-"}`}</DialogDescription>
          </div>
          <Button type="button" variant="outline" className="review-receive-modal-close" onClick={onClose} disabled={isSaving}>
            닫기
          </Button>
        </DialogHeader>

        <div className="review-receive-modal-body public-photo-modal-body">
          <div className={`public-photo-modal-note${isLocked ? " is-locked" : ""}`}>
            {(isLocked || !hasExistingSubmission) && (
              <strong>{isLocked ? "사진 수정이 잠겼습니다." : "사진을 제출하면 바로 반영됩니다."}</strong>
            )}
            <p>
              {isLocked
                ? "관리자가 리뷰완료 처리한 행은 더 이상 수정할 수 없습니다."
                : `파일 선택, 드래그앤드롭, Ctrl+V 붙여넣기로 새 사진을 넣은 뒤 ${submitButtonLabel.replace("하기", "")}할 수 있습니다.`}
            </p>
          </div>

          <div className="public-photo-upload-controls">
            <label className={`public-photo-upload-button${isLocked ? " is-disabled" : ""}`}>
              <Input
                type="file"
                accept="image/*"
                multiple
                disabled={isLocked || isSaving}
                onChange={(event) => {
                  onFilesSelected(event.target.files);
                  event.target.value = "";
                }}
              />
              {hasExistingSubmission ? "새 사진 선택하기" : "사진 선택하기"}
            </label>
          </div>

          {isDesktopDragEnabled && (
            <div
              className={`public-photo-dropzone${isDragActive ? " is-active" : ""}${isDropDisabled ? " is-disabled" : ""}`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              aria-hidden={isDropDisabled}
            >
              <strong>사진을 여기로 끌어다 놓거나 Ctrl+V로 붙여넣을 수 있습니다.</strong>
              <p>
                {isDropDisabled
                  ? "현재는 드래그 업로드를 사용할 수 없습니다."
                  : `데스크톱에서 여러 이미지를 한 번에 넣어 ${submitButtonLabel.replace("하기", "")}할 수 있습니다.`}
              </p>
            </div>
          )}

          {feedbackMessage && <p className={isFeedbackError ? "login-error" : "login-message"}>{feedbackMessage}</p>}

          <div className="public-photo-modal-section">
            <div className="public-photo-modal-section-header">
              <h3>{hasExistingSubmission ? "재제출할 새 사진" : "제출할 사진"}</h3>
            </div>
            <div className="public-photo-grid">
              {newPhotos.length === 0 ? (
                <div className="public-photo-empty-card">
                  <p>{hasExistingSubmission ? "아직 재제출할 새 사진이 없습니다." : "아직 제출할 사진이 없습니다."}</p>
                </div>
              ) : (
                newPhotos.map((photo, index) => (
                  <div key={photo.id} className="public-photo-card is-new">
                    <img src={photo.previewUrl} alt={`새 사진 ${index + 1}`} className="public-photo-card-image" />
                    <div className="public-photo-card-body">
                      <strong>{photo.file.name}</strong>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="admin-danger-button"
                      onClick={() => onRemoveNewPhoto(photo.id)}
                      disabled={isLocked || isSaving}
                    >
                      제거
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="review-receive-modal-actions">
          <Button type="button" variant="outline" className="admin-secondary-button" onClick={onResetDraft} disabled={isLocked || isSaving}>
            초안 초기화
          </Button>
          <Button type="button" variant="outline" className="admin-secondary-button" onClick={onClose} disabled={isSaving}>
            취소
          </Button>
          <Button
            type="button"
            variant="default"
            className="admin-primary-button"
            onClick={onSaveDraft}
            disabled={isLocked || isSaving || !canSubmitReplacement}
          >
            {isSaving ? <PublicLoadingIndicator label="업로드 중..." size="compact" inline /> : submitButtonLabel}
          </Button>
        </div>

        <AppAlertDialog {...saveDraftEnterConfirm.confirmDialogProps} />
      </DialogContent>
    </Dialog>
  );
}
