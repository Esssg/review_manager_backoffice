import { useEffect, useRef } from "react";

const TABLE_HORIZONTAL_SCROLL_INSET = 10;
const TABLE_HORIZONTAL_SCROLL_THUMB_SIZE = 40;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function TableHorizontalScroll({ scrollTargetRef, ariaLabel = "표 가로 스크롤" }) {
  const scrollBarRef = useRef(null);
  const scrollThumbRef = useRef(null);
  const dragStateRef = useRef(null);

  const getScrollMetrics = () => {
    const target = scrollTargetRef?.current;
    const scrollBar = scrollBarRef.current;

    if (!target || !scrollBar) return null;

    const maxScrollLeft = Math.max(0, target.scrollWidth - target.clientWidth);
    const trackWidth = Math.max(
      TABLE_HORIZONTAL_SCROLL_THUMB_SIZE,
      scrollBar.clientWidth - TABLE_HORIZONTAL_SCROLL_INSET * 2
    );
    const travel = Math.max(0, trackWidth - TABLE_HORIZONTAL_SCROLL_THUMB_SIZE);
    const scrollRatio = maxScrollLeft > 0 ? target.scrollLeft / maxScrollLeft : 0;

    return {
      target,
      scrollBar,
      maxScrollLeft,
      trackWidth,
      travel,
      thumbOffset: scrollRatio * travel
    };
  };

  const updateScrollVisual = () => {
    const metrics = getScrollMetrics();
    if (!metrics) return;

    const { target, scrollBar, maxScrollLeft, thumbOffset } = metrics;
    const scrollPercent = maxScrollLeft > 0 ? Math.round((target.scrollLeft / maxScrollLeft) * 100) : 0;

    scrollBar.style.setProperty("--table-horizontal-scroll-thumb-left", `${TABLE_HORIZONTAL_SCROLL_INSET + thumbOffset}px`);
    scrollBar.setAttribute("aria-valuemax", String(Math.round(maxScrollLeft)));
    scrollBar.setAttribute("aria-valuenow", String(Math.round(target.scrollLeft)));
    scrollBar.setAttribute("aria-valuetext", `표 가로 위치 ${scrollPercent}%`);
    scrollBar.classList.toggle("is-disabled", maxScrollLeft <= 0);
  };

  const handleTrackPointerDown = (event) => {
    const metrics = getScrollMetrics();
    if (!metrics || metrics.maxScrollLeft <= 0) return;

    const trackRect = metrics.scrollBar.getBoundingClientRect();
    const clickPosition = event.clientX - trackRect.left - TABLE_HORIZONTAL_SCROLL_INSET;
    const clickedThumbOffset = clamp(
      clickPosition - TABLE_HORIZONTAL_SCROLL_THUMB_SIZE / 2,
      0,
      metrics.travel
    );
    const clickedScrollLeft = metrics.travel > 0
      ? (clickedThumbOffset / metrics.travel) * metrics.maxScrollLeft
      : 0;
    const scrollDistance = clickedScrollLeft - metrics.target.scrollLeft;
    const pageStep = Math.max(120, metrics.target.clientWidth * 0.72);
    const nextScrollLeft = Math.abs(scrollDistance) <= pageStep
      ? clickedScrollLeft
      : metrics.target.scrollLeft + Math.sign(scrollDistance) * pageStep;

      metrics.target.scrollLeft = clamp(
        nextScrollLeft,
        0,
        metrics.maxScrollLeft
      );
  };

  const handleThumbPointerDown = (event) => {
    const metrics = getScrollMetrics();
    const thumb = scrollThumbRef.current;

    if (!metrics || !thumb || metrics.maxScrollLeft <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: metrics.target.scrollLeft,
      travel: metrics.travel,
      maxScrollLeft: metrics.maxScrollLeft,
      target: metrics.target
    };
    thumb.setPointerCapture?.(event.pointerId);
    thumb.classList.add("is-dragging");
  };

  const handleThumbPointerMove = (event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    const scrollDelta = dragState.travel > 0
      ? ((event.clientX - dragState.startX) / dragState.travel) * dragState.maxScrollLeft
      : 0;
    dragState.target.scrollLeft = clamp(
      dragState.startScrollLeft + scrollDelta,
      0,
      dragState.maxScrollLeft
    );
  };

  const handleThumbPointerUp = (event) => {
    const thumb = scrollThumbRef.current;
    if (dragStateRef.current?.pointerId !== event.pointerId) return;

    if (thumb?.hasPointerCapture?.(event.pointerId)) {
      thumb.releasePointerCapture(event.pointerId);
    }
    thumb?.classList.remove("is-dragging");
    dragStateRef.current = null;
  };

  const handleScrollBarKeyDown = (event) => {
    const metrics = getScrollMetrics();
    if (!metrics || metrics.maxScrollLeft <= 0) return;

    const step = Math.max(120, metrics.target.clientWidth * 0.72);
    let nextScrollLeft = null;

    if (event.key === "ArrowLeft") nextScrollLeft = metrics.target.scrollLeft - step;
    if (event.key === "ArrowRight") nextScrollLeft = metrics.target.scrollLeft + step;
    if (event.key === "PageUp") nextScrollLeft = metrics.target.scrollLeft - step;
    if (event.key === "PageDown") nextScrollLeft = metrics.target.scrollLeft + step;
    if (event.key === "Home") nextScrollLeft = 0;
    if (event.key === "End") nextScrollLeft = metrics.maxScrollLeft;

    if (nextScrollLeft == null) return;

    event.preventDefault();
    metrics.target.scrollLeft = clamp(nextScrollLeft, 0, metrics.maxScrollLeft);
  };

  useEffect(() => {
    const target = scrollTargetRef?.current;
    const scrollBar = scrollBarRef.current;

    if (!target || !scrollBar) return undefined;

    const syncScrollBar = () => {
      updateScrollVisual();
    };

    target.addEventListener("scroll", syncScrollBar, { passive: true });

    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(updateScrollVisual) : null;
    resizeObserver?.observe(target);
    resizeObserver?.observe(scrollBar);

    const table = target.querySelector('[data-slot="table"]');
    if (table) {
      resizeObserver?.observe(table);
    }

    const mutationObserver = typeof MutationObserver === "function" ? new MutationObserver(updateScrollVisual) : null;
    mutationObserver?.observe(target, { childList: true, subtree: true, characterData: true });

    updateScrollVisual();

    return () => {
      target.removeEventListener("scroll", syncScrollBar);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [scrollTargetRef]);

  return (
    <div
      ref={scrollBarRef}
      className="table-horizontal-scroll"
      role="scrollbar"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      aria-valuemin="0"
      aria-valuemax="0"
      aria-valuenow="0"
      aria-valuetext="표 가로 위치 0%"
      tabIndex={0}
      onPointerDown={handleTrackPointerDown}
      onKeyDown={handleScrollBarKeyDown}
    >
      <span className="table-horizontal-scroll-track" aria-hidden="true" />
      <span
        ref={scrollThumbRef}
        className="table-horizontal-scroll-thumb"
        role="presentation"
        onPointerDown={handleThumbPointerDown}
        onPointerMove={handleThumbPointerMove}
        onPointerUp={handleThumbPointerUp}
        onPointerCancel={handleThumbPointerUp}
        onLostPointerCapture={handleThumbPointerUp}
      >
        <img src="/favicon-180.png" alt="" draggable="false" />
      </span>
    </div>
  );
}
