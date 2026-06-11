import { useBackdropDismiss } from "../../../hooks/useBackdropDismiss";
import { getPhotoUrl } from "../../../utils/photoItems";

export default function PhotoViewerModal({ photoViewer, onClose, onNext, onPrev, onRequestDelete, isDeleting = false }) {
  const handleClose = () => {
    if (!isDeleting) {
      onClose();
    }
  };
  const backdropDismissProps = useBackdropDismiss(handleClose);

  if (!photoViewer.isOpen || photoViewer.photos.length === 0) {
    return null;
  }

  const activePhoto = photoViewer.photos[photoViewer.activeIndex];
  const activePhotoUrl = getPhotoUrl(activePhoto);
  const showNavigation = photoViewer.photos.length > 1;

  return (
    <div className="photo-modal-backdrop" role="presentation" {...backdropDismissProps}>
      <div className="photo-modal-content" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="photo-modal-actions">
          {onRequestDelete && (
            <button
              type="button"
              className="photo-modal-delete"
              onClick={() => onRequestDelete(activePhoto)}
              disabled={isDeleting}
            >
              {isDeleting ? "삭제 중..." : "삭제"}
            </button>
          )}
          <button type="button" className="photo-modal-close" onClick={handleClose} disabled={isDeleting}>
            닫기
          </button>
        </div>
        {showNavigation && (
          <button type="button" className="photo-modal-arrow left" onClick={onPrev} aria-label="이전 사진" disabled={isDeleting}>
            ‹
          </button>
        )}
        <img
          src={activePhotoUrl}
          alt={`확대 이미지 ${photoViewer.activeIndex + 1}`}
          className="photo-modal-image"
        />
        {showNavigation && (
          <button type="button" className="photo-modal-arrow right" onClick={onNext} aria-label="다음 사진" disabled={isDeleting}>
            ›
          </button>
        )}
      </div>
    </div>
  );
}
