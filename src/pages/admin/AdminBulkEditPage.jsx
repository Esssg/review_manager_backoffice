import { useEffect, useRef, useState } from "react";
import AppAlertDialog from "../../components/common/AppAlertDialog";
import AppToast from "../../components/common/AppToast";
import { ProductOverviewTable } from "./AdminProductOverviewPage";
import { ADMIN_STORAGE_KEY } from "../../constants/admin";
import { useAdminIncludeCompanyData } from "../../hooks/useAdminCapabilities";
import { useAppToast } from "../../hooks/useAppToast";
import { useBackdropDismiss } from "../../hooks/useBackdropDismiss";
import { applyBulkEditChanges, fetchBulkEditCurrentRows } from "../../services/bulkEdit";
import {
  PRODUCT_OVERVIEW_PAGE_SIZE,
  fetchAdminProductOverview,
  fetchAllAdminProductOverviewRows
} from "../../services/productOverview";
import {
  buildBulkEditChangeSet,
  BULK_EDIT_EXCEL_GUIDE_ROWS,
  BULK_EDIT_HEADERS,
  buildBulkEditExcelRows,
  formatBulkEditValue,
  hasBulkEditDepositChanges,
  parseBulkEditExcelFile
} from "../../utils/bulkEditExcel";
import { createEmptyProductOverviewFilters } from "../../utils/productOverviewRows";
import { buildExportFilename, downloadExcel } from "../../utils/exportFile";

function createEmptyPageInfo() {
  return {
    hasMore: false,
    nextCursor: null,
    pageSize: PRODUCT_OVERVIEW_PAGE_SIZE,
    totalCount: 0
  };
}

function BulkEditPreviewValue({ value, column }) {
  const text = formatBulkEditValue(value, column);

  return <span className="bulk-edit-preview-value" title={text}>{text}</span>;
}

export default function AdminBulkEditPage() {
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  const {
    capabilities,
    adminProfile,
    includeCompanyData,
    scopePolicy,
    handleIncludeCompanyDataChange,
    isLoadingCapabilities,
    isIncludeCompanyDataReady,
    capabilitiesErrorMessage
  } = useAdminIncludeCompanyData(adminId);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(createEmptyProductOverviewFilters);
  const [debouncedFilters, setDebouncedFilters] = useState(createEmptyProductOverviewFilters);
  const [pageInfo, setPageInfo] = useState(createEmptyPageInfo);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState("upload");
  const [uploadResult, setUploadResult] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const loadMoreRef = useRef(null);
  const isLoadingMoreRef = useRef(false);
  const { toast, showToast } = useAppToast();
  const hasActiveFilters = Object.values(filters).some((value) => String(value ?? "").trim() !== "");
  const totalCount = Number(pageInfo.totalCount ?? rows.length);
  const countLabel = totalCount > rows.length ? `${rows.length.toLocaleString()}/${totalCount.toLocaleString()}건` : `${rows.length.toLocaleString()}건`;
  const queryKey = JSON.stringify({ includeCompanyData, filters: debouncedFilters, reloadKey });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedFilters(filters), 350);
    return () => window.clearTimeout(timeoutId);
  }, [filters]);

  useEffect(() => {
    let isMounted = true;

    const loadInitialRows = async () => {
      setIsLoading(true);
      setErrorMessage("");
      setRows([]);
      setPageInfo(createEmptyPageInfo());

      if (isLoadingCapabilities || !isIncludeCompanyDataReady) return;

      if (capabilitiesErrorMessage) {
        if (isMounted) {
          setErrorMessage(capabilitiesErrorMessage);
          setIsLoading(false);
        }
        return;
      }

      const result = await fetchAdminProductOverview(adminId, {
        scopePolicy,
        adminProfile,
        status: "all",
        filters: debouncedFilters,
        pageSize: PRODUCT_OVERVIEW_PAGE_SIZE
      });

      if (!isMounted) return;

      if (result.rowsResult.error) {
        setErrorMessage(result.rowsResult.error.message ?? "일괄수정 데이터를 불러오지 못했습니다.");
      } else {
        setRows(result.rowsResult.data ?? []);
        setPageInfo(result.pageInfo ?? createEmptyPageInfo());
      }

      setIsLoading(false);
    };

    loadInitialRows();
    return () => {
      isMounted = false;
    };
  }, [adminId, adminProfile, capabilitiesErrorMessage, debouncedFilters, includeCompanyData, isIncludeCompanyDataReady, isLoadingCapabilities, reloadKey, scopePolicy]);

  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || !pageInfo.hasMore || isLoading || isLoadingMore || !pageInfo.nextCursor) return undefined;

    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || isLoadingMoreRef.current) return;
      isLoadingMoreRef.current = true;
      setIsLoadingMore(true);

      const result = await fetchAdminProductOverview(adminId, {
        scopePolicy,
        adminProfile,
        status: "all",
        filters: debouncedFilters,
        cursor: pageInfo.nextCursor,
        pageSize: PRODUCT_OVERVIEW_PAGE_SIZE
      });

      if (result.rowsResult.error) {
        setErrorMessage(result.rowsResult.error.message ?? "다음 데이터를 불러오지 못했습니다.");
      } else {
        setRows((previousRows) => [...previousRows, ...(result.rowsResult.data ?? [])]);
        setPageInfo(result.pageInfo ?? createEmptyPageInfo());
      }

      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [adminId, adminProfile, debouncedFilters, includeCompanyData, isLoading, isLoadingMore, pageInfo.hasMore, pageInfo.nextCursor, scopePolicy]);

  const resetFilters = () => setFilters(createEmptyProductOverviewFilters());
  const handleFilterChange = (key, value) => setFilters((previousFilters) => ({ ...previousFilters, [key]: value }));
  const closeModal = () => {
    if (isApplying || isParsing) return;
    setIsModalOpen(false);
    setModalStep("upload");
    setUploadResult(null);
    setUploadMessage("");
  };
  const modalBackdropDismissProps = useBackdropDismiss(closeModal);

  const openModal = () => {
    setUploadResult(null);
    setUploadMessage("");
    setModalStep("upload");
    setIsModalOpen(true);
  };

  const handleExport = async () => {
    setIsExporting(true);
    const result = await fetchAllAdminProductOverviewRows(adminId, {
      scopePolicy,
      adminProfile,
      status: "all",
      filters: debouncedFilters,
      pageSize: PRODUCT_OVERVIEW_PAGE_SIZE
    });

    if (result.error) {
      showToast(result.error.message ?? "엑셀 데이터를 불러오지 못했습니다.", "error");
      setIsExporting(false);
      return;
    }

    const exportRows = result.data ?? [];
    if (exportRows.length === 0) {
      showToast("내보낼 행이 없습니다.", "error");
      setIsExporting(false);
      return;
    }

    downloadExcel(buildExportFilename("일괄수정하기"), {
      name: "일괄수정",
      headers: BULK_EDIT_HEADERS,
      leadingRows: BULK_EDIT_EXCEL_GUIDE_ROWS,
      rows: buildBulkEditExcelRows(exportRows)
    });
    showToast(`${exportRows.length.toLocaleString()}건을 엑셀로 내보냈습니다.`, "success");
    setIsExporting(false);
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsParsing(true);
    setUploadResult(null);
    setUploadMessage("");

    try {
      const parsed = await parseBulkEditExcelFile(file);
      const errors = [...parsed.errors];
      let changes = [];

      if (errors.length === 0) {
        const currentResult = await fetchBulkEditCurrentRows(adminId, parsed.rows.map((row) => row.submissionId), {
          adminProfile
        });

        if (currentResult.error) {
          errors.push({ rowNumber: null, column: "", message: currentResult.error.message ?? "현재 DB 데이터를 확인하지 못했습니다." });
        } else {
          const changeSet = buildBulkEditChangeSet(parsed.rows, currentResult.data);
          errors.push(...changeSet.errors);
          changes = changeSet.changes;

          if (hasBulkEditDepositChanges(changes) && !capabilities.canVerifyDeposit) {
            errors.push({ rowNumber: null, column: "", message: "입금완료 관련 열을 수정할 권한이 없습니다." });
          }
        }
      }

      setUploadResult({ ...parsed, errors, changes });
      if (errors.length > 0) {
        setUploadMessage("오류를 모두 수정한 뒤 다시 업로드해주세요.");
      } else if (changes.length === 0) {
        setUploadMessage("현재 DB 값과 다른 수정 항목이 없습니다.");
      } else {
        setUploadMessage(`${changes.length.toLocaleString()}개 행의 변경 사항을 확인했습니다.`);
      }
    } catch (error) {
      setUploadMessage(error?.message ?? "Excel 파일을 읽지 못했습니다.");
    } finally {
      setIsParsing(false);
    }
  };

  const canProceed = Boolean(uploadResult && uploadResult.errors.length === 0 && uploadResult.changes.length > 0);

  const handleConfirmApply = async () => {
    if (!uploadResult || isApplying) return;

    setIsApplying(true);
    const result = await applyBulkEditChanges(adminId, uploadResult.changes);

    if (result.error) {
      showToast(result.error.message ?? "일괄수정 적용에 실패했습니다.", "error");
      setIsApplying(false);
      setIsConfirmOpen(false);
      return;
    }

    showToast(`${result.data.length.toLocaleString()}건을 수정했습니다.`, "success");
    setIsApplying(false);
    setIsConfirmOpen(false);
    closeModal();
    setReloadKey((value) => value + 1);
  };

  return (
    <>
      <header className="admin-header">
        <div>
          <h1>일괄수정하기</h1>
          <p>상품전체보기 데이터를 Excel로 수정하고 변경 내용을 확인한 뒤 적용합니다.</p>
        </div>
      </header>

      <section className="dashboard-panel product-overview-toolbar-panel" aria-label="일괄수정하기 제어">
        <div className="product-overview-toolbar">
          <label className="pretty-checkbox admin-scope-toggle">
            <input type="checkbox" checked={includeCompanyData} onChange={handleIncludeCompanyDataChange} />
            <span className="checkmark" aria-hidden="true" />
            <span className="admin-scope-toggle-label">내 회사 데이터 포함</span>
          </label>
        </div>
      </section>

      {isLoading && <section className="dashboard-panel"><p className="login-message">일괄수정 데이터를 불러오는 중...</p></section>}
      {!isLoading && errorMessage && <section className="dashboard-panel"><p className="login-error">{errorMessage}</p></section>}
      {!isLoading && !errorMessage && rows.length === 0 && <section className="dashboard-panel"><p className="login-message">표시할 submission 데이터가 없습니다.</p></section>}

      {!isLoading && !errorMessage && rows.length > 0 && (
        <section className="dashboard-panel review-receive-section" aria-label="일괄수정 목록">
          <div className="review-receive-section-header">
            <div><h2>전체보기</h2><p>필터 결과를 Excel로 내보내 수정할 수 있습니다.</p></div>
            <span className="status-badge">{countLabel}</span>
          </div>
          <div className="review-receive-section-toolbar product-overview-section-toolbar">
            <div className="review-receive-toolbar-actions product-overview-reset-actions bulk-edit-actions">
              <button type="button" className="admin-secondary-button" onClick={resetFilters} disabled={!hasActiveFilters}>필터 초기화</button>
              <button type="button" className="admin-secondary-button product-overview-export-button" onClick={handleExport} disabled={isExporting}>{isExporting ? "양식 만드는 중..." : "현재화면으로 양식 다운로드"}</button>
              <button type="button" className="admin-primary-button" onClick={openModal}>일괄수정하기</button>
            </div>
          </div>
          <ProductOverviewTable
            rows={rows}
            filters={filters}
            onFilterChange={handleFilterChange}
            showSelection={false}
            isReadOnly
            isLoadingMore={isLoadingMore}
            hasMore={pageInfo.hasMore}
            loadMoreRef={loadMoreRef}
            loadedCount={rows.length}
            totalCount={totalCount}
            emptyMessage="표시할 submission 데이터가 없습니다."
            wrapClassName="is-viewport-scroll"
          />
        </section>
      )}

      {isModalOpen && (
        <div className="review-receive-modal-backdrop" role="presentation" {...modalBackdropDismissProps}>
          <div className="review-receive-modal bulk-edit-modal" role="dialog" aria-modal="true" aria-label="일괄수정하기" onClick={(event) => event.stopPropagation()}>
            <div className="review-receive-modal-header">
              <div>
                <div className="bulk-edit-modal-heading">
                  <span className="bulk-edit-modal-icon" aria-hidden="true">⇅</span>
                  <div><h2>{modalStep === "upload" ? "일괄수정 Excel 업로드" : "변경 예정 내용"}</h2><p>{modalStep === "upload" ? "내보낸 Excel 파일만 수정해 업로드해주세요." : "아래 내용이 DB에 반영됩니다."}</p></div>
                </div>
                <ol className="bulk-edit-stepper" aria-label="일괄수정 단계">
                  <li className={modalStep === "upload" ? "is-active" : "is-complete"}><span>1</span> 파일 업로드</li>
                  <li className={modalStep === "preview" ? "is-active" : ""}><span>2</span> 변경사항 확인</li>
                  <li><span>3</span> 적용</li>
                </ol>
              </div>
              <button type="button" className="review-receive-modal-close" onClick={closeModal} disabled={isParsing || isApplying}>닫기</button>
            </div>
            {modalStep === "upload" ? (
              <div className="review-receive-modal-body bulk-edit-modal-body">
                <div className="bulk-edit-upload-layout">
                  <label className="bulk-edit-file-input">
                    <span className="bulk-edit-file-icon" aria-hidden="true">↥</span>
                    <strong>수정한 Excel 파일을 선택하세요</strong>
                    <span>클릭해서 `.xlsx` 또는 `.xls` 파일을 선택할 수 있습니다.</span>
                    <span className="bulk-edit-file-button">파일 선택</span>
                    <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleFileChange} disabled={isParsing} />
                  </label>
                  <aside className="bulk-edit-upload-guide">
                    <h3>업로드 전 확인</h3>
                    <ol>
                      <li>이 화면에서 내보낸 Excel을 사용하세요.</li>
                      <li><strong>제출 ID</strong> 열과 헤더 순서는 바꾸지 마세요.</li>
                      <li>완료 상태는 <strong>TRUE</strong> 또는 <strong>FALSE</strong>로 입력하세요.</li>
                    </ol>
                  </aside>
                </div>
                {(isParsing || uploadResult || uploadMessage) && (
                  <div className={`bulk-edit-upload-result${uploadResult?.errors.length ? " is-error" : ""}`}>
                    {isParsing && <p className="login-message">파일과 현재 DB 값을 확인하는 중...</p>}
                    {uploadResult && <p className={uploadResult.errors.length > 0 ? "login-error" : "login-message"}>{uploadResult.fileName} · {uploadResult.rows.length.toLocaleString()}행</p>}
                    {uploadMessage && <p className={uploadResult?.errors.length ? "login-error" : "login-message"}>{uploadMessage}</p>}
                    {uploadResult?.errors.length > 0 && (
                      <div className="bulk-edit-error-list">
                        {uploadResult.errors.slice(0, 50).map((issue, index) => <p key={`${issue.rowNumber}-${issue.column}-${index}`}>{[issue.rowNumber ? `${issue.rowNumber}행` : "파일", issue.column, issue.message].filter(Boolean).join(" · ")}</p>)}
                        {uploadResult.errors.length > 50 && <p>오류가 더 있습니다. 총 {uploadResult.errors.length.toLocaleString()}건</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="review-receive-modal-body bulk-edit-modal-body">
                <div className="bulk-edit-preview-summary">
                  <div><span>수정 행</span><strong>{uploadResult.changes.length.toLocaleString()}건</strong></div>
                  <div><span>수정 필드</span><strong>{uploadResult.changes.reduce((count, change) => count + change.fields.length, 0).toLocaleString()}건</strong></div>
                  <p>가로로 스크롤하면 긴 이전·변경 값을 줄바꿈 없이 볼 수 있습니다.</p>
                </div>
                <div className="table-scroll-wrap bulk-edit-preview-wrap">
                  <table className="review-receive-table bulk-edit-preview-table"><colgroup><col className="bulk-edit-col-row" /><col className="bulk-edit-col-id" /><col className="bulk-edit-col-context" /><col className="bulk-edit-col-field" /><col className="bulk-edit-col-value" /><col className="bulk-edit-col-value" /></colgroup><thead><tr><th>Excel 행</th><th>제출 ID</th><th>식별 정보</th><th>수정 항목</th><th>기존 값</th><th>변경 값</th></tr></thead><tbody>
                    {uploadResult.changes.flatMap((change) => change.fields.map((field, index) => <tr key={`${change.submissionId}-${field.key}`}><td>{index === 0 ? change.rowNumber : ""}</td><td>{index === 0 ? change.submissionId : ""}</td><td>{index === 0 ? [change.assignName, change.orderNumber].filter(Boolean).join(" / ") || "-" : ""}</td><td>{field.label}</td><td><BulkEditPreviewValue value={field.previousValue} column={field.column} /></td><td><BulkEditPreviewValue value={field.nextValue} column={field.column} /></td></tr>))}
                  </tbody></table>
                </div>
              </div>
            )}
            <div className="review-receive-modal-actions">
              {modalStep === "preview" && <button type="button" className="admin-secondary-button" onClick={() => setModalStep("upload")} disabled={isApplying}>이전</button>}
              <button type="button" className="admin-secondary-button" onClick={closeModal} disabled={isParsing || isApplying}>취소</button>
              {modalStep === "upload" ? <button type="button" className="admin-primary-button" onClick={() => setModalStep("preview")} disabled={!canProceed}>다음</button> : <button type="button" className="admin-primary-button" onClick={() => setIsConfirmOpen(true)} disabled={isApplying}>{isApplying ? "적용 중..." : "적용하기"}</button>}
            </div>
          </div>
        </div>
      )}

      <AppAlertDialog isOpen={isConfirmOpen} title="일괄수정 적용 확인" message={`${uploadResult?.changes.length.toLocaleString() ?? 0}개 행의 수정 내용을 DB에 적용하시겠습니까?`} confirmLabel="적용하기" busyConfirmLabel="적용 중..." isBusy={isApplying} onCancel={() => !isApplying && setIsConfirmOpen(false)} onConfirm={handleConfirmApply} />
      <AppToast toast={toast} />
    </>
  );
}
