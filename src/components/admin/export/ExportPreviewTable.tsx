import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import ProductLinkCopy from "@/components/common/ProductLinkCopy";
import { buildExportPreviewRows } from "@/utils/exportColumns";

export default function ExportPreviewTable({ rows, limit = 50 }) {
  const previewRows = buildExportPreviewRows(rows, limit);
  const columns = Object.keys(previewRows[0] ?? {});

  return (
    <Card className="export-panel" aria-label="내보내기 미리보기">
      <div className="export-panel-header">
        <div>
          <h2>미리보기</h2>
          <p>선택한 컬럼 기준으로 상위 {limit}행만 표시합니다.</p>
        </div>
        <Badge variant="secondary" className="export-row-count">총 {rows.length}건</Badge>
      </div>

      {previewRows.length === 0 || columns.length === 0 ? (
        <p className="login-message">표시할 미리보기 데이터가 없습니다.</p>
      ) : (
        <div className="export-preview-table-wrap">
          <Table className="export-preview-table">
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((row, rowIndex) => (
                <TableRow key={`export-preview-${rowIndex}`}>
                  {columns.map((column) => (
                    <TableCell key={`${rowIndex}-${column}`}>
                      {column === "링크" ? <ProductLinkCopy value={row[column]} displayValue={row[column]} /> : row[column] == null || row[column] === "" ? "-" : row[column]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
