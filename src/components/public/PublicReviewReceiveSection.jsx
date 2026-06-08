function renderPhotoCell(row, onOpenPhotoViewer) {
  if (!Array.isArray(row.photos) || row.photos.length === 0) {
    return <span>제출 전</span>;
  }

  return row.photos.map((url, photoIndex) => (
    <button
      key={`${row.id}-${url}-${photoIndex}`}
      type="button"
      className="photo-thumb-button"
      onClick={() => onOpenPhotoViewer(row.photos, photoIndex)}
      aria-label={`증빙 이미지 ${photoIndex + 1} 열기`}
    >
      <img src={url} alt={`증빙 이미지 ${photoIndex + 1}`} className="photo-thumb-image" />
    </button>
  ));
}

function getMobileFieldItems(row) {
  return [
    { label: "주문번호", value: row.order_number || "-" },
    { label: "구매자", value: row.buyer_name || "-" },
    { label: "수취인", value: row.recipient_name || "-" },
    { label: "구매계정", value: row.purchase_account || "-" }
  ];
}

function renderPhotoActionButton(row, onOpenPhotoManager) {
  return (
    <button
      type="button"
      className="admin-small-button public-photo-action-button"
      onClick={() => onOpenPhotoManager(row)}
    >
      {row.hasPendingPhotoChanges ? "사진 수정" : row.photos?.length ? "사진 수정" : "사진 업로드"}
    </button>
  );
}

export default function PublicReviewReceiveSection({
  sectionKey,
  title,
  description = "",
  rows,
  onOpenPhotoViewer,
  onOpenPhotoManager
}) {
  const emptyColumnCount = 6;

  return (
    <section className="dashboard-panel review-receive-section public-review-section" aria-label={title}>
      <div className="review-receive-section-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <span className="status-badge">{`${rows.length}건`}</span>
      </div>

      <div className="public-review-mobile-list" aria-label={`${title} 모바일 목록`}>
        {rows.length === 0 ? (
          <div className="public-review-mobile-empty">{`${title} 상태의 제출 데이터가 없습니다.`}</div>
        ) : (
          rows.map((row) => {
            const mobileFieldItems = getMobileFieldItems(row);

            return (
              <article key={row.id} className="public-review-mobile-card">
                <div className="public-review-mobile-card-header">
                  <div>
                    <span className="public-review-mobile-card-eyebrow">{row.order_number || "주문번호 없음"}</span>
                    <h3>{row.recipient_name || row.buyer_name || "제출 데이터"}</h3>
                  </div>
                </div>

                <div className="public-review-mobile-meta-grid">
                  {mobileFieldItems.map((item) => (
                    <div key={`${row.id}-${item.label}`} className="public-review-mobile-meta-item">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>

                <div className="public-review-mobile-photo-block">
                  <span className="public-review-mobile-block-label">사진</span>
                  <div className="photo-link-list public-review-photo-list">
                    {renderPhotoCell(row, onOpenPhotoViewer)}
                  </div>
                </div>

                <div className="public-review-mobile-action-row">
                  {renderPhotoActionButton(row, onOpenPhotoManager)}
                  {row.hasPendingPhotoChanges && (
                    <span className="public-photo-action-hint">임시변경 있음</span>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="table-scroll-wrap">
        <table className={`review-receive-table public-review-table public-review-table-${sectionKey}`}>
          <colgroup>
            <col className="review-col-order" />
            <col className="review-col-name" />
            <col className="review-col-name" />
            <col className="review-col-purchase-account" />
            <col className="review-col-photo" />
            <col className="public-review-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>주문번호</th>
              <th>구매자</th>
              <th>수취인</th>
              <th>구매계정</th>
              <th>사진</th>
              <th>사진관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={emptyColumnCount}>{`${title} 상태의 제출 데이터가 없습니다.`}</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="review-receive-row">
                  <td>{row.order_number || "-"}</td>
                  <td>{row.buyer_name || "-"}</td>
                  <td>{row.recipient_name || "-"}</td>
                  <td>{row.purchase_account || "-"}</td>
                  <td>
                    <div className="photo-link-list public-review-photo-list">
                      {renderPhotoCell(row, onOpenPhotoViewer)}
                    </div>
                  </td>
                  <td className="public-photo-action-column">
                    <div className="public-photo-action-cell">
                      {renderPhotoActionButton(row, onOpenPhotoManager)}
                      {row.hasPendingPhotoChanges && (
                        <span className="public-photo-action-hint">임시변경 있음</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
