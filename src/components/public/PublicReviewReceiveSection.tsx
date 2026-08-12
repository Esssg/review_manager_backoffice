import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

function renderPhotoCell(row, onOpenPhotoViewer) {
  if (!Array.isArray(row.photos) || row.photos.length === 0) {
    return <span>제출 전</span>;
  }

  return row.photos.map((url, photoIndex) => (
    <Button
      key={`${row.id}-${url}-${photoIndex}`}
      type="button"
      variant="ghost"
      size="icon-sm"
      className="photo-thumb-button"
      onClick={() => onOpenPhotoViewer(row.photos, photoIndex)}
      aria-label={`증빙 이미지 ${photoIndex + 1} 열기`}
    >
      <img src={url} alt={`증빙 이미지 ${photoIndex + 1}`} className="photo-thumb-image" />
    </Button>
  ));
}

function getMobileFieldItems(row) {
  return [
    { label: "품명", value: row.product_name || "-", isWide: true },
    { label: "옵션", value: row.option_name || "-", isWide: true },
    { label: "리뷰형태", value: row.review_type || "-" },
    { label: "주문번호", value: row.order_number || "-" },
    { label: "구매자", value: row.buyer_name || "-" },
    { label: "수취인", value: row.recipient_name || "-" },
    { label: "구매계정", value: row.purchase_account || "-" }
  ];
}

function renderPhotoActionButton(row, onOpenPhotoManager) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="admin-small-button public-photo-action-button"
      onClick={() => onOpenPhotoManager(row)}
    >
      {row.hasPendingPhotoChanges ? "사진 수정" : row.photos?.length ? "사진 수정" : "사진 업로드"}
    </Button>
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
  const emptyColumnCount = 9;

  return (
    <Card className="dashboard-panel review-receive-section public-review-section" aria-label={title}>
      <div className="review-receive-section-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <Badge variant="secondary" className="status-badge">{`${rows.length}건`}</Badge>
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
                    <span className="public-review-mobile-card-eyebrow">{row.product_name || "품명 없음"}</span>
                    <h3>{row.recipient_name || row.buyer_name || "제출 데이터"}</h3>
                  </div>
                </div>

                <div className="public-review-mobile-meta-grid">
                  {mobileFieldItems.map((item) => (
                    <div
                      key={`${row.id}-${item.label}`}
                      className={`public-review-mobile-meta-item${item.isWide ? " is-wide" : ""}`}
                    >
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
        <Table className={`review-receive-table public-review-table public-review-table-${sectionKey}`}>
          <colgroup>
            <col className="review-col-product" />
            <col className="review-col-option" />
            <col className="review-col-review-type" />
            <col className="review-col-order" />
            <col className="review-col-name" />
            <col className="review-col-name" />
            <col className="review-col-purchase-account" />
            <col className="review-col-photo" />
            <col className="public-review-col-actions" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>품명</TableHead>
              <TableHead>옵션</TableHead>
              <TableHead>리뷰형태</TableHead>
              <TableHead>주문번호</TableHead>
              <TableHead>구매자</TableHead>
              <TableHead>수취인</TableHead>
              <TableHead>구매계정</TableHead>
              <TableHead>사진</TableHead>
              <TableHead>사진관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={emptyColumnCount}>{`${title} 상태의 제출 데이터가 없습니다.`}</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="review-receive-row">
                  <TableCell>{row.product_name || "-"}</TableCell>
                  <TableCell>{row.option_name || "-"}</TableCell>
                  <TableCell>{row.review_type || "-"}</TableCell>
                  <TableCell>{row.order_number || "-"}</TableCell>
                  <TableCell>{row.buyer_name || "-"}</TableCell>
                  <TableCell>{row.recipient_name || "-"}</TableCell>
                  <TableCell>{row.purchase_account || "-"}</TableCell>
                  <TableCell>
                    <div className="photo-link-list public-review-photo-list">
                      {renderPhotoCell(row, onOpenPhotoViewer)}
                    </div>
                  </TableCell>
                  <TableCell className="public-photo-action-column">
                    <div className="public-photo-action-cell">
                      {renderPhotoActionButton(row, onOpenPhotoManager)}
                      {row.hasPendingPhotoChanges && (
                        <span className="public-photo-action-hint">임시변경 있음</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
