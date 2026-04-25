import { formatReviewReceiveAccount } from "../../utils/reviewReceiveTable";

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

export default function PublicReviewReceiveSection({
  sectionKey,
  title,
  description,
  rows,
  rowNumberMap,
  onOpenPhotoViewer,
  onOpenPhotoManager
}) {
  const isPurchaseSection = sectionKey === "purchase";
  const showAssign = sectionKey === "purchase" || sectionKey === "complete";
  const showDepositMeta = sectionKey === "complete";
  const emptyColumnCount = isPurchaseSection ? 12 : showDepositMeta ? 13 : 10;

  return (
    <section className="dashboard-panel review-receive-section public-review-section" aria-label={title}>
      <div className="review-receive-section-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="status-badge">{`${rows.length}건`}</span>
      </div>

      <div className="table-scroll-wrap">
        <table className={`review-receive-table public-review-table public-review-table-${sectionKey}`}>
          <colgroup>
            <col className="review-col-index" />
            {showAssign && <col className="public-review-col-assign" />}
            <col className="review-col-order" />
            <col className="review-col-name" />
            <col className="review-col-name" />
            <col className="review-col-purchase-account" />
            <col className="review-col-contact" />
            <col className="review-col-address" />
            <col className="review-col-account" />
            <col className="review-col-amount" />
            <col className="review-col-photo" />
            {isPurchaseSection && <col className="public-review-col-actions" />}
            {showDepositMeta && <col className="review-col-date" />}
            {showDepositMeta && <col className="review-col-actual-depositor" />}
          </colgroup>
          <thead>
            <tr>
              <th>순번</th>
              {showAssign && <th>배정</th>}
              <th>주문번호</th>
              <th>구매자</th>
              <th>수취인</th>
              <th>구매계정</th>
              <th>연락처</th>
              <th>주소</th>
              <th>계좌</th>
              <th>금액</th>
              <th>사진</th>
              {isPurchaseSection && <th>사진관리</th>}
              {showDepositMeta && <th>입금일</th>}
              {showDepositMeta && <th>실제입금자명</th>}
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
                  <td className="review-row-index">{rowNumberMap[row.id] ?? "-"}</td>
                  {showAssign && <td>{row.assign_name || "-"}</td>}
                  <td>{row.order_number || "-"}</td>
                  <td>{row.buyer_name || "-"}</td>
                  <td>{row.recipient_name || "-"}</td>
                  <td>{row.purchase_account || "-"}</td>
                  <td>{row.contact || "-"}</td>
                  <td>{row.address || "-"}</td>
                  <td>{formatReviewReceiveAccount(row.bank_name, row.bank_account, row.account_holder) || "-"}</td>
                  <td>{row.amount ?? "-"}</td>
                  <td>
                    <div className="photo-link-list public-review-photo-list">
                      {renderPhotoCell(row, onOpenPhotoViewer)}
                    </div>
                  </td>
                  {isPurchaseSection && (
                    <td className="public-photo-action-column">
                      <div className="public-photo-action-cell">
                        <button
                          type="button"
                          className="admin-small-button public-photo-action-button"
                          onClick={() => onOpenPhotoManager(row)}
                        >
                          {row.hasPendingPhotoChanges
                            ? "사진 수정"
                            : row.photos?.length
                              ? "사진 수정"
                              : "사진 업로드"}
                        </button>
                        {row.hasPendingPhotoChanges && (
                          <span className="public-photo-action-hint">임시변경 있음</span>
                        )}
                      </div>
                    </td>
                  )}
                  {showDepositMeta && <td>{row.deposited_at || "-"}</td>}
                  {showDepositMeta && <td>{row.actual_depositor_name || "-"}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
