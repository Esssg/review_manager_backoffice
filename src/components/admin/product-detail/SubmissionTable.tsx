import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { getPhotoId, getPhotoUrl } from "@/utils/photoItems";

export default function SubmissionTable({
  activeTab,
  emptyText,
  rows,
  onDeleteSubmission,
  onOpenPhotoViewer,
  onVerifyChange
}) {
  return (
    <Table className="submission-table">
      <colgroup>
        <col className="col-id" />
        <col className="col-order" />
        <col className="col-buyer" />
        <col className="col-recipient" />
        <col className="col-amount" />
        <col className="col-photo" />
        <col className="col-check" />
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>주문번호</TableHead>
          <TableHead>구매자</TableHead>
          <TableHead>수령인</TableHead>
          <TableHead>구매계정</TableHead>
          <TableHead>사진</TableHead>
          <TableHead>완료</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7}>{emptyText}</TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const isDone = activeTab === "purchase" ? row.is_purchase_verified : row.is_review_verified;
            const rowPhotos = Array.isArray(row.photos) ? row.photos : [];

            return (
              <TableRow key={row.id}>
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.order_number ?? "-"}</TableCell>
                <TableCell>{row.buyer_name ?? "-"}</TableCell>
                <TableCell>{row.recipient_name ?? "-"}</TableCell>
                <TableCell>{row.purchase_account ?? "-"}</TableCell>
                <TableCell>
                  <div className="photo-link-list">
                    {rowPhotos.length === 0 ? (
                      <span>제출전</span>
                    ) : (
                      rowPhotos.map((photo, index) => {
                        const url = getPhotoUrl(photo);

                        return (
                          <Button
                            key={`${row.id}-${getPhotoId(photo) ?? url}-${index}`}
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="photo-thumb-button"
                            onClick={() => onOpenPhotoViewer(rowPhotos, index)}
                          >
                            <img src={url} alt={`증빙 이미지 ${index + 1}`} className="photo-thumb-image" />
                          </Button>
                        );
                      })
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="submission-actions">
                    <Checkbox
                      checked={Boolean(isDone)}
                      onCheckedChange={(checked) => onVerifyChange(row.id, checked === true)}
                      aria-label={`${row.id} 완료 여부`}
                    />
                    <Button type="button" variant="destructive" size="sm" className="admin-danger-button" onClick={() => onDeleteSubmission(row.id)}>
                      삭제
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
