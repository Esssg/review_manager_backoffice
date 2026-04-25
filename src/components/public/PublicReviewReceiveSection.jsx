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

function getMobileFieldItems(row, options) {
  const { rowNumber, showAssign, showDepositMeta } = options;

  return [
    { label: "순번", value: rowNumber ?? "-" },
    showAssign ? { label: "배정", value: row.assign_name || "-" } : null,
    { label: "주문번호", value: row.order_number || "-" },
    { label: "구매자", value: row.buyer_name || "-" },
    { label: "수취인", value: row.recipient_name || "-" },
    { label: "구매계정", value: row.purchase_account || "-" },
    { label: "연락처", value: row.contact || "-" },
    { label: "주소", value: row.address || "-" },
    {
      label: "계좌",
      value: formatReviewReceiveAccount(row.bank_name, row.bank_account, row.account_holder) || "-"
    },
    { label: "금액", value: row.amount ?? "-" },
    showDepositMeta ? { label: "입금일", value: row.deposited_at || "-" } : null,
    showDepositMeta ? { label: "실제입금자명", value: row.actual_depositor_name || "-" } : null
  ].filter(Boolean);
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

      <div className="public-review-mobile-list" aria-label={`${title} 모바일 목록`}>
        {rows.length === 0 ? (
          <div className="public-review-mobile-empty">{`${title} 상태의 제출 데이터가 없습니다.`}</div>
        ) : (
          rows.map((row) => {
            const rowNumber = rowNumberMap[row.id] ?? "-";
            const mobileFieldItems = getMobileFieldItems(row, {
              rowNumber,
              showAssign,
              showDepositMeta
            });

            return (
              <article key={row.id} className="public-review-mobile-card">
                <div className="public-review-mobile-card-header">
                  <div>
                    <span className="public-review-mobile-card-eyebrow">{`순번 ${rowNumber}`}</span>
                    <h3>{row.recipient_name || row.buyer_name || "제출 데이터"}</h3>
                  </div>
                  {showAssign && (
                    <span className="public-review-mobile-card-badge">{`배정 ${row.assign_name || "-"}`}</span>
                  )}
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

                {isPurchaseSection && (
                  <div className="public-review-mobile-action-row">
                    {renderPhotoActionButton(row, onOpenPhotoManager)}
                    {row.hasPendingPhotoChanges && (
                      <span className="public-photo-action-hint">임시변경 있음</span>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
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
                        {renderPhotoActionButton(row, onOpenPhotoManager)}
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
