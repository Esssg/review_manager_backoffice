import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

export default function ApplicationsTable({ adminId, product, rows, onConfirmChange, canConfirm = true, requireManagerMatch = true }) {
  return (
    <div className="applications-table-wrap">
      <Table className="applications-table">
        <TableHeader>
          <TableRow>
            <TableHead>순번</TableHead>
            <TableHead>신청자</TableHead>
            <TableHead>확정 여부</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3}>신청자가 없습니다.</TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{row.applicant_name}</TableCell>
                <TableCell>
                  <Checkbox
                    checked={Boolean(row.is_confirmed)}
                    disabled={!canConfirm || (requireManagerMatch && product?.manager_id !== adminId)}
                    onCheckedChange={(checked) => onConfirmChange(row.id, checked === true)}
                    aria-label={`${row.applicant_name || "신청자"} 확정 여부`}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
