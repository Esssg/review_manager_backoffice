// @ts-nocheck

import { useEffect, useRef, useState } from "react";
import { useBackdropDismiss } from "@/hooks/useBackdropDismiss";
import { Button } from "@/components/ui/button";
import { emitAdminTutorialAction } from "@/utils/adminTutorialEvents";
import { getPhotoUrl } from "@/utils/photoItems";

const PRODUCT_OVERVIEW_METADATA_FIELDS = [
  ["company_name", "업체명"],
  ["product_name", "품명"],
  ["option_name", "옵션"],
  ["review_type", "리뷰형태"],
  ["buyer_name", "구매자"],
  ["recipient_name", "수취인"],
  ["purchase_account", "구매계정"]
];

function getMetadataValue(metadata, key) {
  const value = metadata?.[key];
  return value == null || String(value).trim() === "" ? "-" : String(value);
}

export default function PhotoViewerModal({
  photoViewer,
  onClose,
  onNext,
  onPrev,
  onRequestDelete = undefined,
  isDeleting = false,
  variant = "default",
  metadata = null,
  disableNavigationAtEnds = false,
  canGoPrev = undefined,
  canGoNext = undefined,
  isTutorialMode = false,
  isDeleteDialogOpen = false,
  returnFocusElement = null
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const wasOpenRef = useRef(false);
  const [imageError, setImageError] = useState(false);

  const handleClose = () => {
    if (!isDeleting && !isDeleteDialogOpen) {
      onClose();
    }
  };

  const backdropDismissProps = useBackdropDismiss(handleClose);
  const activePhoto = photoViewer.photos?.[photoViewer.activeIndex];
  const activePhotoUrl = getPhotoUrl(activePhoto);
  const showNavigation = variant === "product-overview" || photoViewer.photos?.length > 1;
  const resolvedCanGoPrev = disableNavigationAtEnds
    ? Boolean(canGoPrev ?? photoViewer.activeIndex > 0)
    : true;
  const resolvedCanGoNext = disableNavigationAtEnds
    ? Boolean(canGoNext ?? photoViewer.activeIndex < photoViewer.photos.length - 1)
    : true;
  const isProductOverview = variant === "product-overview";

  useEffect(() => {
    setImageError(false);
  }, [activePhotoUrl]);

  useEffect(() => {
    if (photoViewer.isOpen) {
      wasOpenRef.current = true;
      const focusTimer = window.setTimeout(() => {
        (closeButtonRef.current ?? dialogRef.current)?.focus?.();
      }, 0);

      return () => window.clearTimeout(focusTimer);
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      returnFocusElement?.focus?.();
    }

    return undefined;
  }, [photoViewer.isOpen, returnFocusElement]);

  useEffect(() => {
    if (!photoViewer.isOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (isDeleting || isDeleteDialogOpen) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleClose();
        return;
      }

      if (event.key === "ArrowLeft" && showNavigation && resolvedCanGoPrev) {
        event.preventDefault();
        event.stopPropagation();
        if (isTutorialMode) {
          emitAdminTutorialAction("photo-arrow-key");
        }
        onPrev?.();
      }

      if (event.key === "ArrowRight" && showNavigation && resolvedCanGoNext) {
        event.preventDefault();
        event.stopPropagation();
        if (isTutorialMode) {
          emitAdminTutorialAction("photo-arrow-key");
        }
        onNext?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [
    isDeleteDialogOpen,
    isDeleting,
    isTutorialMode,
    onNext,
    onPrev,
    photoViewer.isOpen,
    resolvedCanGoNext,
    resolvedCanGoPrev,
    showNavigation
  ]);

  if (!photoViewer.isOpen || !photoViewer.photos?.length) {
    return null;
  }

  const handlePrev = () => {
    if (isDeleting || isDeleteDialogOpen || !resolvedCanGoPrev) {
      return;
    }

    if (isTutorialMode) {
      emitAdminTutorialAction("photo-prev");
    }
    onPrev?.();
  };

  const handleNext = () => {
    if (isDeleting || isDeleteDialogOpen || !resolvedCanGoNext) {
      return;
    }

    if (isTutorialMode) {
      emitAdminTutorialAction("photo-next");
    }
    onNext?.();
  };

  const handleDelete = () => {
    if (isDeleting || isDeleteDialogOpen) {
      return;
    }

    if (isTutorialMode) {
      emitAdminTutorialAction("photo-delete");
      return;
    }

    onRequestDelete?.(activePhoto);
  };

  const imageContent = activePhotoUrl && !imageError ? (
    <img
      src={activePhotoUrl}
      alt={`확대 이미지 ${photoViewer.activeIndex + 1}`}
      className="photo-modal-image"
      onError={() => setImageError(true)}
    />
  ) : (
    <p className="photo-modal-image-error" role="status">
      사진을 불러올 수 없습니다.
    </p>
  );

  if (isProductOverview) {
    return (
      <div className="photo-modal-backdrop" role="presentation" {...backdropDismissProps}>
        <div
          ref={dialogRef}
          className="photo-modal-content photo-modal-content--product-overview"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-overview-photo-modal-title"
          tabIndex={-1}
        >
          <div className="photo-modal-actions">
            {onRequestDelete && (
              <Button
                variant="destructive"
                type="button"
                className="photo-modal-delete"
                data-tutorial-target="photo-delete"
                onClick={handleDelete}
                disabled={isDeleting || isDeleteDialogOpen}
              >
                {isDeleting ? "삭제 중..." : "삭제"}
              </Button>
            )}
            <Button
              ref={closeButtonRef}
              type="button"
              variant="outline"
              className="photo-modal-close"
              data-tutorial-target="photo-close"
              onClick={handleClose}
              disabled={isDeleting || isDeleteDialogOpen}
            >
              닫기
            </Button>
          </div>

          <div className="photo-modal-product-body">
            <section className="photo-modal-details" data-tutorial-target="photo-info" aria-labelledby="product-overview-photo-modal-title">
              <p className="photo-modal-eyebrow">리뷰 사진 정보</p>
              <h2 id="product-overview-photo-modal-title">사진 상세 보기</h2>
              <dl className="photo-modal-details-list">
                {PRODUCT_OVERVIEW_METADATA_FIELDS.map(([key, label]) => (
                  <div key={key} className="photo-modal-detail-row">
                    <dt>{label}</dt>
                    <dd>{getMetadataValue(metadata, key)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="photo-modal-media" data-tutorial-target="photo-media" aria-label="리뷰 사진 미리보기">
              {imageContent}
              <span className="photo-modal-counter">
                {photoViewer.activeIndex + 1} / {photoViewer.photos.length}
              </span>
            </section>
          </div>

          {showNavigation && (
            <div className="photo-modal-navigation" aria-label="사진 이동">
              <Button
                type="button"
                variant="outline"
                className="photo-modal-navigation-button"
                data-tutorial-target="photo-prev"
                onClick={handlePrev}
                disabled={isDeleting || isDeleteDialogOpen || !resolvedCanGoPrev}
              >
                이전
              </Button>
              <span className="photo-modal-navigation-hint">좌우 버튼 또는 키보드 화살표로 이동</span>
              <Button
                type="button"
                variant="outline"
                className="photo-modal-navigation-button"
                data-tutorial-target="photo-next"
                onClick={handleNext}
                disabled={isDeleting || isDeleteDialogOpen || !resolvedCanGoNext}
              >
                다음
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const defaultNavigation = showNavigation ? (
    <>
      <Button type="button" variant="ghost" size="icon" className="photo-modal-arrow left" onClick={handlePrev} aria-label="이전 사진" disabled={isDeleting || isDeleteDialogOpen}>
        ‹
      </Button>
      <Button type="button" variant="ghost" size="icon" className="photo-modal-arrow right" onClick={handleNext} aria-label="다음 사진" disabled={isDeleting || isDeleteDialogOpen}>
        ›
      </Button>
    </>
  ) : null;

  return (
    <div className="photo-modal-backdrop" role="presentation" {...backdropDismissProps}>
      <div ref={dialogRef} className="photo-modal-content" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="photo-modal-actions">
          {onRequestDelete && (
            <Button variant="destructive" type="button" className="photo-modal-delete" onClick={handleDelete} disabled={isDeleting || isDeleteDialogOpen}>
              {isDeleting ? "삭제 중..." : "삭제"}
            </Button>
          )}
          <Button ref={closeButtonRef} type="button" variant="outline" className="photo-modal-close" onClick={handleClose} disabled={isDeleting || isDeleteDialogOpen}>
            닫기
          </Button>
        </div>
        {defaultNavigation}
        {imageContent}
      </div>
    </div>
  );
}
