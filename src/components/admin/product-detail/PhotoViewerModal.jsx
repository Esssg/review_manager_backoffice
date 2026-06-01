import { useBackdropDismiss } from "../../../hooks/useBackdropDismiss";

export default function PhotoViewerModal({ photoViewer, onClose, onNext, onPrev }) {
  const backdropDismissProps = useBackdropDismiss(onClose);

  if (!photoViewer.isOpen || photoViewer.photos.length === 0) {
    return null;
  }

  return (
    <div className="photo-modal-backdrop" role="presentation" {...backdropDismissProps}>
      <div className="photo-modal-content" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="photo-modal-close" onClick={onClose}>
          닫기
        </button>
        <button type="button" className="photo-modal-arrow left" onClick={onPrev} aria-label="이전 사진">
          ‹
        </button>
        <img
          src={photoViewer.photos[photoViewer.activeIndex]}
          alt={`확대 이미지 ${photoViewer.activeIndex + 1}`}
          className="photo-modal-image"
        />
        <button type="button" className="photo-modal-arrow right" onClick={onNext} aria-label="다음 사진">
          ›
        </button>
      </div>
    </div>
  );
}
