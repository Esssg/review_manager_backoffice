export default function SubmissionTable({
  activeTab,
  emptyText,
  rows,
  onDeleteSubmission,
  onOpenPhotoViewer,
  onVerifyChange
}) {
  const showReviewFee = activeTab === "review";
  const columnCount = showReviewFee ? 9 : 8;

  return (
    <table className="submission-table">
      <colgroup>
        <col className="col-row-number" />
        <col className="col-id" />
        <col className="col-order" />
        <col className="col-buyer" />
        <col className="col-recipient" />
        {showReviewFee && <col className="col-review-fee" />}
        <col className="col-amount" />
        <col className="col-photo" />
        <col className="col-check" />
      </colgroup>
      <thead>
        <tr>
          <th>순번</th>
          <th>ID</th>
          <th>주문번호</th>
          <th>구매자</th>
          <th>수령인</th>
          <th>구매계정</th>
          {showReviewFee && <th>리뷰비</th>}
          <th>사진</th>
          <th>완료</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columnCount}>{emptyText}</td>
          </tr>
        ) : (
          rows.map((row) => {
            const isDone = activeTab === "purchase" ? row.is_purchase_verified : row.is_review_verified;
            const rowPhotos = Array.isArray(row.photos) ? row.photos : [];

            return (
              <tr key={row.id}>
                <td>{row.row_number ?? "-"}</td>
                <td>{row.id}</td>
                <td>{row.order_number ?? "-"}</td>
                <td>{row.buyer_name ?? "-"}</td>
                <td>{row.recipient_name ?? "-"}</td>
                <td>{row.purchase_account ?? "-"}</td>
                {showReviewFee && <td>{row.review_fee ?? "-"}</td>}
                <td>
                  <div className="photo-link-list">
                    {rowPhotos.length === 0 ? (
                      <span>제출전</span>
                    ) : (
                      rowPhotos.map((url, index) => (
                        <button
                          key={`${row.id}-${url}`}
                          type="button"
                          className="photo-thumb-button"
                          onClick={() => onOpenPhotoViewer(rowPhotos, index)}
                        >
                          <img src={url} alt={`증빙 이미지 ${index + 1}`} className="photo-thumb-image" />
                        </button>
                      ))
                    )}
                  </div>
                </td>
                <td>
                  <div className="submission-actions">
                    <label className="pretty-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(isDone)}
                        onChange={(event) => onVerifyChange(row.id, event.target.checked)}
                      />
                      <span className="checkmark" aria-hidden="true" />
                    </label>
                    <button type="button" className="admin-danger-button" onClick={() => onDeleteSubmission(row.id)}>
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
