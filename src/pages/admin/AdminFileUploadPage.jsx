import { Fragment, useMemo, useRef, useState } from "react";
import AppAlertDialog from "../../components/common/AppAlertDialog";
import AppToast from "../../components/common/AppToast";
import { ADMIN_STORAGE_KEY } from "../../constants/admin";
import { useAppToast } from "../../hooks/useAppToast";
import { uploadFileUploadData } from "../../services/fileUpload";
import { buildUploadableFileUploadResult, parseFileUploadFile } from "../../utils/fileUploadParser.js";
import { downloadFileUploadTemplate } from "../../utils/fileUploadTemplate";
import { FILE_UPLOAD_COLUMNS } from "../../utils/fileUploadValidation";

const PREVIEW_LIMIT = 50;

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ko-KR") : "-";
}

function formatBoolean(value) {
  return value ? "TRUE" : "FALSE";
}

function getProductTitleByKey(products) {
  return new Map(products.map((product) => [product.clientProductKey, product.payload.title || product.payload.product_name || "-"]));
}

function formatRawCellValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString("ko-KR");
  }

  if (typeof value === "boolean") {
    return formatBoolean(value);
  }

  const text = String(value ?? "").trim();

  return text || "-";
}

function getRowDataByNumber(parseResult) {
  const rowDataByNumber = new Map();

  if (parseResult?.headerRaw) {
    rowDataByNumber.set(1, parseResult.headerRaw);
  }

  (parseResult?.rows ?? []).forEach((row) => {
    rowDataByNumber.set(row.rowNumber, row.raw);
  });

  return rowDataByNumber;
}

function IssueRowData({ raw }) {
  if (!raw) {
    return <p className="dashboard-meta">표시할 행 데이터가 없습니다.</p>;
  }

  return (
    <div className="file-upload-issue-row-data">
      {FILE_UPLOAD_COLUMNS.map((column) => (
        <div key={column.key} className="file-upload-issue-cell">
          <span>
            {column.letter} {column.header || "빈 열"}
          </span>
          <strong>{formatRawCellValue(raw[column.key])}</strong>
        </div>
      ))}
    </div>
  );
}

function IssueTable({ title, rows, emptyMessage, rowDataByNumber }) {
  return (
    <section className="dashboard-panel file-upload-panel" aria-label={title}>
      <div className="file-upload-panel-header">
        <div>
          <h2>{title}</h2>
          <p>행과 열을 기준으로 확인할 수 있습니다.</p>
        </div>
        <span className="file-upload-count-badge">{rows.length}건</span>
      </div>
      {rows.length === 0 ? (
        <p className="login-message">{emptyMessage}</p>
      ) : (
        <div className="table-scroll-wrap file-upload-table-wrap">
          <table className="file-upload-table">
            <thead>
              <tr>
                <th>행</th>
                <th>열</th>
                <th>코드</th>
                <th>내용</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((issue, index) => (
                <Fragment key={`${issue.code}-${issue.rowNumber}-${issue.column}-${index}`}>
                  <tr>
                    <td>{issue.rowNumber ?? "-"}</td>
                    <td>{issue.column || "-"}</td>
                    <td>{issue.code}</td>
                    <td>{issue.message}</td>
                  </tr>
                  {rowDataByNumber && (
                    <tr className="file-upload-issue-detail-row">
                      <td colSpan={4}>
                        <IssueRowData raw={rowDataByNumber.get(issue.rowNumber)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AdminFileUploadPage() {
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  const fileInputRef = useRef(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parseErrorMessage, setParseErrorMessage] = useState("");
  const [parseResult, setParseResult] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false });
  const { toast, showToast } = useAppToast();
  const productTitleByKey = useMemo(() => getProductTitleByKey(parseResult?.products ?? []), [parseResult]);
  const rowDataByNumber = useMemo(() => getRowDataByNumber(parseResult), [parseResult]);
  const uploadableParseResult = useMemo(
    () => (parseResult ? buildUploadableFileUploadResult(parseResult) : null),
    [parseResult]
  );
  const uploadableProductTitleByKey = useMemo(
    () => getProductTitleByKey(uploadableParseResult?.products ?? []),
    [uploadableParseResult]
  );
  const previewRows = useMemo(() => (uploadableParseResult?.submissions ?? []).slice(0, PREVIEW_LIMIT), [uploadableParseResult]);
  const canPrepareUpload = Boolean(uploadableParseResult?.summary.submissionCount > 0 && !isUploading);

  const resetFileState = () => {
    setSelectedFileName("");
    setParseErrorMessage("");
    setParseResult(null);
    setUploadResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const parseSelectedFile = async (file) => {
    if (!file) {
      return;
    }

    setSelectedFileName(file.name);
    setParseErrorMessage("");
    setParseResult(null);
    setUploadResult(null);
    setIsParsing(true);

    try {
      const result = await parseFileUploadFile(file, { adminId });
      setParseResult(result);

      if (result.errors.length > 0) {
        showToast("검증 오류가 있습니다. 오류 행은 DB 반영에서 제외됩니다.", "error");
      } else {
        showToast("Excel 파일을 읽었습니다.");
      }
    } catch (error) {
      setParseErrorMessage(error?.message ?? "파일을 읽지 못했습니다.");
      showToast("파일을 읽지 못했습니다.", "error");
    } finally {
      setIsParsing(false);
    }
  };

  const handleInputChange = (event) => {
    parseSelectedFile(event.target.files?.[0]);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    parseSelectedFile(event.dataTransfer.files?.[0]);
  };

  const handlePaste = (event) => {
    const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.name.match(/\.(xlsx|xls)$/i));

    if (!file) {
      return;
    }

    event.preventDefault();
    parseSelectedFile(file);
  };

  const handlePrepareClick = () => {
    if (!canPrepareUpload) {
      return;
    }

    setConfirmDialog({ isOpen: true });
  };

  const handleConfirmPrepare = async () => {
    if (!uploadableParseResult || isUploading) {
      return;
    }

    setConfirmDialog({ isOpen: false });
    setIsUploading(true);
    setUploadResult(null);

    try {
      const result = await uploadFileUploadData(uploadableParseResult);
      setUploadResult(result);

      if (result.errors.length > 0) {
        showToast("일부 데이터를 저장하지 못했습니다. 결과를 확인해주세요.", "error");
      } else {
        showToast("DB 반영이 완료되었습니다.");
      }
    } catch (error) {
      const fallbackResult = {
        createdProducts: [],
        insertedSubmissions: [],
        updatedSubmissions: [],
        errors: [
          {
            rowNumber: null,
            column: "",
            code: "UPLOAD_FAILED",
            message: error?.message ?? "DB 반영 중 오류가 발생했습니다."
          }
        ],
        summary: {
          createdProductCount: 0,
          insertedSubmissionCount: 0,
          updatedSubmissionCount: 0,
          errorCount: 1
        }
      };

      setUploadResult(fallbackResult);
      showToast("DB 반영 중 오류가 발생했습니다.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="file-upload-page" onPaste={handlePaste}>
      <header className="admin-header">
        <div>
          <h1>파일 업로드</h1>
          <p>Excel 파일을 읽고 상품과 제출 데이터로 들어갈 내용을 미리 확인합니다.</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="admin-secondary-button" onClick={downloadFileUploadTemplate}>
            샘플 양식 다운로드
          </button>
          <button type="button" className="admin-primary-button" onClick={handlePrepareClick} disabled={!canPrepareUpload}>
            {isUploading ? "DB 반영 중..." : "DB 반영 실행"}
          </button>
        </div>
      </header>

      <section className="dashboard-panel file-upload-drop-panel" aria-label="파일 선택">
        <div
          className={`file-upload-drop-zone${isDragging ? " is-dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div>
            <h2>Excel 파일 선택</h2>
            <p>파일을 끌어오거나, 붙여넣거나, 탐색기로 선택합니다.</p>
            {selectedFileName && <p className="file-upload-selected-file">선택된 파일: {selectedFileName}</p>}
          </div>
          <div className="file-upload-actions">
            <input
              ref={fileInputRef}
              className="file-upload-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleInputChange}
            />
            <button type="button" className="admin-secondary-button" onClick={() => fileInputRef.current?.click()}>
              파일 찾기
            </button>
            <button type="button" className="admin-link-button" onClick={resetFileState} disabled={isParsing || !parseResult}>
              초기화
            </button>
          </div>
        </div>
        {isParsing && <p className="login-message">Excel 파일을 읽는 중...</p>}
        {parseErrorMessage && <p className="login-error">{parseErrorMessage}</p>}
      </section>

      {parseResult && (
        <>
          <section className="file-upload-summary-grid" aria-label="파일 업로드 요약">
            <div className="detail-summary-item">
              <span className="detail-summary-label">상품</span>
              <strong>{formatNumber(parseResult.summary.productCount)}건</strong>
            </div>
            <div className="detail-summary-item">
              <span className="detail-summary-label">제출</span>
              <strong>{formatNumber(parseResult.summary.submissionCount)}건</strong>
            </div>
            <div className="detail-summary-item">
              <span className="detail-summary-label">스킵</span>
              <strong>{formatNumber(parseResult.summary.skippedRows)}행</strong>
            </div>
            <div className="detail-summary-item">
              <span className="detail-summary-label">오류</span>
              <strong>{formatNumber(parseResult.summary.errorCount)}건</strong>
            </div>
            <div className="detail-summary-item">
              <span className="detail-summary-label">경고</span>
              <strong>{formatNumber(parseResult.summary.warningCount)}건</strong>
            </div>
            <div className="detail-summary-item">
              <span className="detail-summary-label">저장 예정</span>
              <strong>{formatNumber(uploadableParseResult?.summary.submissionCount ?? 0)}건</strong>
            </div>
            <div className="detail-summary-item">
              <span className="detail-summary-label">오류 제외</span>
              <strong>{formatNumber(uploadableParseResult?.summary.excludedRowCount ?? 0)}행</strong>
            </div>
          </section>

          <section className="dashboard-panel file-upload-panel" aria-label="업로드 미리보기">
            <div className="file-upload-panel-header">
              <div>
                <h2>미리보기</h2>
                <p>오류 행을 제외하고 DB에 저장될 제출 데이터입니다.</p>
              </div>
              <span className="file-upload-count-badge">최대 {PREVIEW_LIMIT}건</span>
            </div>
            {previewRows.length === 0 ? (
              <p className="login-message">미리볼 제출 데이터가 없습니다.</p>
            ) : (
              <div className="table-scroll-wrap file-upload-table-wrap">
                <table className="file-upload-table">
                  <thead>
                    <tr>
                      <th>행</th>
                      <th>상품</th>
                      <th>주문번호</th>
                      <th>구매자</th>
                      <th>수취인</th>
                      <th>계좌</th>
                      <th>금액</th>
                      <th>리뷰비</th>
                      <th>리뷰</th>
                      <th>입금</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={`${row.clientProductKey}-${row.sourceRowNumber}-${row.payload.order_number}`}>
                        <td>{row.sourceRowNumber}</td>
                        <td>{uploadableProductTitleByKey.get(row.clientProductKey) ?? productTitleByKey.get(row.clientProductKey) ?? "-"}</td>
                        <td>{row.payload.order_number ?? "-"}</td>
                        <td>{row.payload.buyer_name ?? "-"}</td>
                        <td>{row.payload.recipient_name ?? "-"}</td>
                        <td>
                          {[row.payload.bank_name, row.payload.bank_account, row.payload.account_holder]
                            .filter(Boolean)
                            .join(" / ") || "-"}
                        </td>
                        <td>{formatNumber(row.payload.amount)}</td>
                        <td>{formatNumber(row.payload.review_fee)}</td>
                        <td>{formatBoolean(row.payload.is_review_verified)}</td>
                        <td>{formatBoolean(row.payload.is_deposit_verified)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(uploadableParseResult?.summary.submissionCount ?? 0) > PREVIEW_LIMIT && (
                  <p className="dashboard-meta">처음 {PREVIEW_LIMIT}건만 표시합니다.</p>
                )}
              </div>
            )}
          </section>

          <IssueTable
            title="오류"
            rows={parseResult.errors}
            emptyMessage="검증 오류가 없습니다."
            rowDataByNumber={rowDataByNumber}
          />
          <IssueTable title="경고" rows={parseResult.warnings} emptyMessage="경고가 없습니다." />

          {uploadResult && (
            <section className="dashboard-panel file-upload-panel" aria-label="DB 반영 결과">
              <div className="file-upload-panel-header">
                <div>
                  <h2>DB 반영 결과</h2>
                  <p>상품 생성과 제출 insert/update 결과입니다.</p>
                </div>
                <span className="file-upload-count-badge">{uploadResult.summary.errorCount}개 오류</span>
              </div>
              <div className="file-upload-result-grid">
                <div className="detail-summary-item">
                  <span className="detail-summary-label">생성 상품</span>
                  <strong>{formatNumber(uploadResult.summary.createdProductCount)}건</strong>
                </div>
                <div className="detail-summary-item">
                  <span className="detail-summary-label">추가 제출</span>
                  <strong>{formatNumber(uploadResult.summary.insertedSubmissionCount)}건</strong>
                </div>
                <div className="detail-summary-item">
                  <span className="detail-summary-label">수정 제출</span>
                  <strong>{formatNumber(uploadResult.summary.updatedSubmissionCount)}건</strong>
                </div>
              </div>
            </section>
          )}

          {uploadResult && (
            <IssueTable
              title="DB 반영 오류"
              rows={uploadResult.errors}
              emptyMessage="DB 반영 오류가 없습니다."
            />
          )}

          <section className="dashboard-panel file-upload-panel" aria-label="스킵된 행">
            <div className="file-upload-panel-header">
              <div>
                <h2>스킵된 행</h2>
                <p>계약에 따라 데이터 행에서 제외된 행입니다.</p>
              </div>
              <span className="file-upload-count-badge">{parseResult.skippedRows.length}행</span>
            </div>
            {parseResult.skippedRows.length === 0 ? (
              <p className="login-message">스킵된 행이 없습니다.</p>
            ) : (
              <div className="file-upload-skip-list">
                {parseResult.skippedRows.slice(0, PREVIEW_LIMIT).map((row) => (
                  <span key={row.rowNumber} className="file-upload-skip-chip">
                    {row.rowNumber}행: {row.reason}
                  </span>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <AppAlertDialog
        isOpen={confirmDialog.isOpen}
        badgeLabel="업로드 확인"
        title="DB에 반영할까요?"
        description="products를 먼저 생성하고, 주문번호 기준으로 submissions를 추가하거나 수정합니다. 중간 실패가 있으면 결과 영역에 표시됩니다."
        cancelLabel="취소"
        confirmLabel="DB 반영"
        busyConfirmLabel="반영 중..."
        isBusy={isUploading}
        onCancel={() => setConfirmDialog({ isOpen: false })}
        onConfirm={handleConfirmPrepare}
      >
        {parseResult && (
          <div className="file-upload-confirm-summary">
            <strong>저장 상품 {uploadableParseResult?.summary.productCount ?? 0}건</strong>
            <strong>저장 제출 {uploadableParseResult?.summary.submissionCount ?? 0}건</strong>
            <strong>오류 제외 {uploadableParseResult?.summary.excludedRowCount ?? 0}행</strong>
          </div>
        )}
      </AppAlertDialog>
      <AppToast toast={toast} />
    </div>
  );
}
