import { useEffect, useRef, useState } from "react";
import PhotoViewerModal from "../../components/admin/product-detail/PhotoViewerModal";
import StepTabList from "../../components/admin/product-detail/StepTabList";
import AppAlertDialog from "../../components/common/AppAlertDialog";
import AppToast from "../../components/common/AppToast";
import ProductLinkCopy from "../../components/common/ProductLinkCopy";
import { useAppToast } from "../../hooks/useAppToast";
import { useBackdropDismiss } from "../../hooks/useBackdropDismiss";
import { useModalEnterConfirm } from "../../hooks/useModalEnterConfirm";
import { useAdminIncludeCompanyData } from "../../hooks/useAdminCapabilities";
import {
  ADMIN_STORAGE_KEY,
  PRODUCT_OVERVIEW_STATUS_TABS
} from "../../constants/admin";
import { deleteEvidencePhoto } from "../../services/evidencePhotos";
import {
  PRODUCT_OVERVIEW_PAGE_SIZE,
  deleteAdminProductOverviewSubmissions,
  fetchAdminProductOverview,
  fetchAllAdminProductOverviewRows
} from "../../services/productOverview";
import {
  createReviewReceiveSubmission,
  updateReviewReceiveSubmission
} from "../../services/reviewReceive";
import {
  buildPurchaseAssignPreview,
  buildPurchaseBulkPreview,
  buildSelectedPurchaseBulkPreview
} from "../../utils/reviewReceiveBulkInput";
import {
  PRODUCT_OVERVIEW_COLUMNS,
  buildProductOverviewRow,
  buildProductOverviewRowPositionMaps,
  createEmptyProductOverviewFilters,
  mergeProductOverviewRows,
  replaceProductOverviewRows
} from "../../utils/productOverviewRows";
import { buildExportFilename, downloadExcel } from "../../utils/exportFile";
import { getPhotoId, getPhotoUrl, removePhotoById } from "../../utils/photoItems";
import {
  REVIEW_VERIFY_REQUIRED_FIELDS,
  formatMissingFieldLabels,
  getMissingRequiredFieldLabels
} from "../../utils/reviewVerifyValidation";

const PRODUCT_OVERVIEW_EXPORT_COLUMNS = PRODUCT_OVERVIEW_COLUMNS;
const PRODUCT_OVERVIEW_EXPORT_COLUMN_KEYS = PRODUCT_OVERVIEW_EXPORT_COLUMNS.map((column) => column.key);

function formatCellValue(value, type) {
  if (value == null || value === "") {
    return "-";
  }

  if (type === "boolean") {
    return value ? "예" : "아니오";
  }

  if (type === "photo") {
    return Array.isArray(value) && value.length > 0 ? "제출 완료" : "제출 전";
  }

  return String(value);
}

function formatExcelCellValue(row, column) {
  const value = row[column.key];

  if (column.type === "boolean") {
    return value ? "예" : "아니오";
  }

  if (column.type === "photo") {
    return Array.isArray(value) && value.length > 0 ? value.map(getPhotoUrl).filter(Boolean).join("\n") : "";
  }

  return value ?? "";
}

function buildProductOverviewExcelRows(rows, columnKeys) {
  const selectedColumnKeySet = new Set(columnKeys);
  const selectedColumns = PRODUCT_OVERVIEW_EXPORT_COLUMNS.filter((column) => selectedColumnKeySet.has(column.key));

  return rows.map((row) =>
    selectedColumns.reduce((acc, column) => {
      acc[column.label] = formatExcelCellValue(row, column);
      return acc;
    }, {})
  );
}

function getProductOverviewExportScopeLabel(scopeKey) {
  const scopeLabels = {
    all: "전체보기",
    purchase: "구매완료",
    review: "리뷰완료",
    complete: "전체완료"
  };

  return scopeLabels[scopeKey] ?? "전체보기";
}

function formatProductLabel(product) {
  if (!product) {
    return "-";
  }

  return product.title || [product.company_name, product.product_name].filter(Boolean).join(" / ") || `상품 ${product.id}`;
}

function buildBlankPurchaseAssignPayload(productId, assignName) {
  return {
    product_id: Number(productId),
    assign_name: assignName?.trim() || null,
    order_number: null,
    buyer_name: null,
    recipient_name: null,
    purchase_account: null,
    contact: null,
    address: null,
    bank_name: null,
    bank_account: null,
    account_holder: null,
    amount: null,
    is_review_verified: false,
    is_deposit_verified: false,
    deposited_at: null,
    actual_depositor_name: null
  };
}

function areRowsReviewVerifyTargets(rows) {
  return rows.length > 0 && rows.every((row) => !row.is_review_verified);
}

function areRowsDepositVerifyTargets(rows) {
  return rows.length > 0 && rows.every((row) => row.is_review_verified && !row.is_deposit_verified);
}

function areRowsDepositCancelTargets(rows) {
  return rows.length > 0 && rows.every((row) => row.is_review_verified && row.is_deposit_verified);
}

function getReviewBatchActualDepositorName(row, mode, customName) {
  if (mode === "planned") {
    return row.planned_depositor_name?.trim() || null;
  }

  return customName.trim() || null;
}

function renderOverviewPhotoCell(row, onOpenPhotoViewer, isReadOnly) {
  const rowPhotos = Array.isArray(row.review_photos) ? row.review_photos : [];

  if (rowPhotos.length === 0) {
    return <span>제출 전</span>;
  }

  if (isReadOnly) {
    return <span>제출 완료</span>;
  }

  return (
    <div className="photo-link-list">
      {rowPhotos.map((photo, index) => {
        const url = getPhotoUrl(photo);

        return (
          <button
            key={`${row.submission_id}-${getPhotoId(photo) ?? url}-${index}`}
            type="button"
            className="photo-thumb-button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenPhotoViewer(rowPhotos, index);
            }}
            aria-label={`리뷰 사진 ${index + 1} 열기`}
          >
            <img src={url} alt={`리뷰 사진 ${index + 1}`} className="photo-thumb-image" loading="lazy" />
          </button>
        );
      })}
    </div>
  );
}

function renderOverviewCell(row, column, onOpenPhotoViewer, isReadOnly = false) {
  if (column.type === "photo") {
    return renderOverviewPhotoCell(row, onOpenPhotoViewer, isReadOnly);
  }

  if (column.key === "product_link") {
    return isReadOnly ? formatCellValue(row[column.key], column.type) : <ProductLinkCopy value={row[column.key]} />;
  }

  return formatCellValue(row[column.key], column.type);
}

function buildOverviewRowFromSubmission(productMap, productId, submission, fallbackRow = null) {
  const resolvedProductId = Number(productId ?? submission?.product_id ?? fallbackRow?.product_id);
  const product = productMap.get(resolvedProductId);

  if (!product) {
    return null;
  }

  return buildProductOverviewRow(product, {
    id: submission?.id ?? fallbackRow?.submission_id,
    product_id: resolvedProductId,
    assign_name: submission?.assign_name ?? fallbackRow?.assign_name ?? null,
    order_number: submission?.order_number ?? fallbackRow?.order_number ?? null,
    buyer_name: submission?.buyer_name ?? fallbackRow?.buyer_name ?? null,
    recipient_name: submission?.recipient_name ?? fallbackRow?.recipient_name ?? null,
    purchase_account: submission?.purchase_account ?? fallbackRow?.purchase_account ?? null,
    contact: submission?.contact ?? fallbackRow?.contact ?? null,
    address: submission?.address ?? fallbackRow?.address ?? null,
    bank_name: submission?.bank_name ?? fallbackRow?.bank_name ?? null,
    bank_account: submission?.bank_account ?? fallbackRow?.bank_account ?? null,
    account_holder: submission?.account_holder ?? fallbackRow?.account_holder ?? null,
    amount: submission?.amount ?? fallbackRow?.amount ?? null,
    review_fee: submission?.review_fee ?? fallbackRow?.review_fee ?? null,
    is_purchase_verified: submission?.is_purchase_verified ?? fallbackRow?.is_purchase_verified ?? false,
    is_review_verified: submission?.is_review_verified ?? fallbackRow?.is_review_verified ?? false,
    is_deposit_verified: submission?.is_deposit_verified ?? fallbackRow?.is_deposit_verified ?? false,
    deposited_at: submission?.deposited_at ?? fallbackRow?.deposited_at ?? null,
    actual_depositor_name: submission?.actual_depositor_name ?? fallbackRow?.actual_depositor_name ?? null,
    created_at: submission?.created_at ?? fallbackRow?.submission_created_at ?? null
  }, fallbackRow?.review_photos ?? []);
}

function getVisibleProducts(rows, productMap) {
  const uniqueProductIds = Array.from(new Set(rows.map((row) => row.product_id)));

  return uniqueProductIds
    .map((productId) => productMap.get(productId))
    .filter(Boolean);
}

export function ProductOverviewTable({
  rows,
  filters,
  onFilterChange,
  emptyMessage,
  onOpenPhotoViewer,
  selectedSubmissionIds = new Set(),
  onToggleRowSelection = () => {},
  onToggleAllSelection = () => {},
  showSelection = true,
  isReadOnly = false,
  isAllMatchingSelected = false,
  isAllMatchingSelectionActive = false,
  loadMoreRef = null,
  isLoadingMore = false,
  hasMore = false,
  loadedCount = rows.length,
  totalCount = rows.length,
  wrapClassName = ""
}) {
  const columnCount = PRODUCT_OVERVIEW_COLUMNS.length + (showSelection ? 1 : 0);
  const isAllSelected =
    rows.length > 0 &&
    (isAllMatchingSelected ||
      (!isAllMatchingSelectionActive && rows.every((row) => selectedSubmissionIds.has(row.submission_id))));
  const [openFilterKey, setOpenFilterKey] = useState("");
  const filterDropdownRef = useRef(null);
  const filterDropdownLabels = {
    review_photos: {
      "": "전체",
      has: "사진 있음",
      none: "사진없음"
    },
    is_review_verified: {
      "": "전체",
      true: "예",
      false: "아니오"
    },
    is_deposit_verified: {
      "": "전체",
      true: "예",
      false: "아니오"
    }
  };
  const filterDropdownOptions = {
    review_photos: [
      { value: "", label: "전체" },
      { value: "has", label: "사진 있음" },
      { value: "none", label: "사진없음" }
    ],
    is_review_verified: [
      { value: "", label: "전체" },
      { value: "true", label: "예" },
      { value: "false", label: "아니오" }
    ],
    is_deposit_verified: [
      { value: "", label: "전체" },
      { value: "true", label: "예" },
      { value: "false", label: "아니오" }
    ]
  };

  useEffect(() => {
    if (!openFilterKey) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!filterDropdownRef.current?.contains(event.target)) {
        setOpenFilterKey("");
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpenFilterKey("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openFilterKey]);

  return (
    <div className={`table-scroll-wrap product-overview-table-wrap ${wrapClassName}`.trim()}>
      <table className="review-receive-table product-overview-table">
        <thead>
          <tr>
            {showSelection && (
              <th className="product-overview-selection-column">
                <label
                  className="pretty-checkbox product-overview-selection-control"
                  onClick={(event) => event.stopPropagation()}
                  aria-label="현재 필터 결과 전체 선택"
                >
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(event) => onToggleAllSelection(rows, event.target.checked)}
                  />
                  <span className="checkmark" aria-hidden="true" />
                </label>
              </th>
            )}
            {PRODUCT_OVERVIEW_COLUMNS.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
          <tr className="product-overview-filter-row">
            {showSelection && <th className="product-overview-selection-column" />}
            {PRODUCT_OVERVIEW_COLUMNS.map((column) => (
              <th key={`${column.key}-filter`}>
                {["photo", "boolean"].includes(column.type) ? (
                  <div className="product-overview-filter-dropdown" ref={openFilterKey === column.key ? filterDropdownRef : null}>
                    <button
                      type="button"
                      className={`table-cell-input product-overview-filter-input product-overview-filter-trigger${openFilterKey === column.key ? " is-open" : ""}`}
                      onClick={() => setOpenFilterKey((prev) => (prev === column.key ? "" : column.key))}
                      aria-haspopup="listbox"
                      aria-expanded={openFilterKey === column.key}
                      aria-label={`${column.label} 필터`}
                    >
                      <span>{filterDropdownLabels[column.key]?.[filters[column.key] ?? ""] ?? "전체"}</span>
                      <span className="product-overview-filter-trigger-arrow" aria-hidden="true">
                        ▾
                      </span>
                    </button>
                    {openFilterKey === column.key && (
                      <div className="product-overview-filter-menu" role="listbox" aria-label={`${column.label} 필터 옵션`}>
                        {filterDropdownOptions[column.key].map((option) => (
                          <button
                            key={option.value || "all"}
                            type="button"
                            className={`product-overview-filter-option${(filters[column.key] ?? "") === option.value ? " is-selected" : ""}`}
                            onClick={() => {
                              onFilterChange(column.key, option.value);
                              setOpenFilterKey("");
                            }}
                            role="option"
                            aria-selected={(filters[column.key] ?? "") === option.value}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    className="table-cell-input product-overview-filter-input"
                    value={filters[column.key] ?? ""}
                    onChange={(event) => onFilterChange(column.key, event.target.value)}
                    placeholder="필터"
                    aria-label={`${column.label} 필터`}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount}>{emptyMessage}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={`${row.product_id}-${row.submission_id}`}
                className={`review-receive-row${showSelection ? " clickable-row" : ""}${selectedSubmissionIds.has(row.submission_id) ? " is-selected" : ""}`}
                onClick={showSelection ? () => onToggleRowSelection(row.submission_id) : undefined}
              >
                {showSelection && (
                  <td className="product-overview-selection-column">
                    <label
                      className="pretty-checkbox product-overview-selection-control"
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`${row.assign_name || row.order_number || row.submission_id} 행 선택`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSubmissionIds.has(row.submission_id)}
                        onChange={() => onToggleRowSelection(row.submission_id)}
                      />
                      <span className="checkmark" aria-hidden="true" />
                    </label>
                  </td>
                )}
                {PRODUCT_OVERVIEW_COLUMNS.map((column) => (
                  <td
                    key={`${row.submission_id}-${column.key}`}
                    className={column.type === "photo" ? "product-overview-photo-cell" : ""}
                  >
                    {renderOverviewCell(row, column, onOpenPhotoViewer, isReadOnly)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div ref={loadMoreRef} className="review-receive-list-load-more product-overview-list-load-more">
        {isLoadingMore
          ? `다음 ${PRODUCT_OVERVIEW_PAGE_SIZE.toLocaleString()}건을 불러오는 중...`
          : hasMore
            ? `현재 ${loadedCount.toLocaleString()}건 표시 중 / 총 ${totalCount.toLocaleString()}건`
            : totalCount > 0
              ? `총 ${totalCount.toLocaleString()}건`
              : ""}
      </div>
    </div>
  );
}

function ProductOverviewSection({
  title,
  description,
  rows,
  filters,
  onFilterChange,
  onOpenPhotoViewer,
  selectedSubmissionIds,
  onToggleRowSelection,
  onToggleAllSelection,
  toolbar,
  countLabel,
  selectionSummary,
  isAllMatchingSelected,
  isAllMatchingSelectionActive,
  loadMoreRef,
  isLoadingMore,
  hasMore,
  loadedCount,
  totalCount,
  tableWrapClassName
}) {
  return (
    <section className="dashboard-panel review-receive-section" aria-label={title}>
      <div className="review-receive-section-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <span className="status-badge">{countLabel ?? `${rows.length}건`}</span>
      </div>

      {toolbar}
      {selectionSummary ? <p className="product-overview-selection-summary">{selectionSummary}</p> : null}

      <ProductOverviewTable
        rows={rows}
        filters={filters}
        onFilterChange={onFilterChange}
        onOpenPhotoViewer={onOpenPhotoViewer}
        selectedSubmissionIds={selectedSubmissionIds}
        onToggleRowSelection={onToggleRowSelection}
        onToggleAllSelection={onToggleAllSelection}
        isAllMatchingSelected={isAllMatchingSelected}
        isAllMatchingSelectionActive={isAllMatchingSelectionActive}
        loadMoreRef={loadMoreRef}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        loadedCount={loadedCount}
        totalCount={totalCount}
        emptyMessage={`${title} 상태의 제출 데이터가 없습니다.`}
        wrapClassName={tableWrapClassName}
      />
    </section>
  );
}

export default function AdminProductOverviewPage({ viewMode = "all" }) {
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
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(createEmptyProductOverviewFilters);
  const [debouncedFilters, setDebouncedFilters] = useState(createEmptyProductOverviewFilters);
  const [activeStatusTab, setActiveStatusTab] = useState("purchase");
  const [selection, setSelection] = useState({
    mode: "ids",
    ids: [],
    excludedIds: [],
    queryKey: "",
    totalCount: 0
  });
  const [pageInfo, setPageInfo] = useState({
    hasMore: false,
    nextCursor: null,
    pageSize: PRODUCT_OVERVIEW_PAGE_SIZE,
    totalCount: 0
  });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [listReloadKey, setListReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [photoViewer, setPhotoViewer] = useState({
    isOpen: false,
    photos: [],
    activeIndex: 0
  });
  const [deleteTargetPhoto, setDeleteTargetPhoto] = useState(null);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [purchaseBulkScope, setPurchaseBulkScope] = useState("all");
  const [isPurchaseBulkModalOpen, setIsPurchaseBulkModalOpen] = useState(false);
  const [purchaseBulkAssignName, setPurchaseBulkAssignName] = useState("");
  const [purchaseBulkText, setPurchaseBulkText] = useState("");
  const [purchaseBulkMessage, setPurchaseBulkMessage] = useState("");
  const [purchaseBulkMessageType, setPurchaseBulkMessageType] = useState("info");
  const [isApplyingPurchaseBulk, setIsApplyingPurchaseBulk] = useState(false);
  const [purchaseBulkResolvedRows, setPurchaseBulkResolvedRows] = useState(null);
  const [purchaseAssignScope, setPurchaseAssignScope] = useState("all");
  const [isPurchaseAssignModalOpen, setIsPurchaseAssignModalOpen] = useState(false);
  const [purchaseAssignText, setPurchaseAssignText] = useState("");
  const [purchaseAssignTargetProductId, setPurchaseAssignTargetProductId] = useState("");
  const [purchaseAssignMessage, setPurchaseAssignMessage] = useState("");
  const [purchaseAssignMessageType, setPurchaseAssignMessageType] = useState("info");
  const [isApplyingPurchaseAssign, setIsApplyingPurchaseAssign] = useState(false);
  const [purchaseAssignConflictDialog, setPurchaseAssignConflictDialog] = useState({
    isOpen: false,
    step: "conflict",
    duplicatedNumbers: ""
  });
  const [reviewBatchScope, setReviewBatchScope] = useState("all");
  const [isReviewBatchModalOpen, setIsReviewBatchModalOpen] = useState(false);
  const [reviewBatchDepositedAt, setReviewBatchDepositedAt] = useState("");
  const [reviewBatchActualDepositorMode, setReviewBatchActualDepositorMode] = useState("planned");
  const [reviewBatchActualDepositorName, setReviewBatchActualDepositorName] = useState("");
  const [reviewBatchMessage, setReviewBatchMessage] = useState("");
  const [reviewBatchMessageType, setReviewBatchMessageType] = useState("info");
  const [isApplyingReviewBatch, setIsApplyingReviewBatch] = useState(false);
  const [reviewBatchResolvedRows, setReviewBatchResolvedRows] = useState(null);
  const [isApplyingReviewVerify, setIsApplyingReviewVerify] = useState(false);
  const [reviewVerifyConfirmDialog, setReviewVerifyConfirmDialog] = useState({
    isOpen: false,
    scopeKey: "all",
    missingLabels: [],
    targetRows: []
  });
  const [reviewBatchConfirmDialog, setReviewBatchConfirmDialog] = useState({
    isOpen: false,
    missingLabels: []
  });
  const [depositCancelTargetRows, setDepositCancelTargetRows] = useState([]);
  const [depositCancelReason, setDepositCancelReason] = useState("");
  const [depositCancelMessage, setDepositCancelMessage] = useState("");
  const [isCancellingDeposit, setIsCancellingDeposit] = useState(false);
  const [selectedDeleteTargetRows, setSelectedDeleteTargetRows] = useState([]);
  const [isDeletingSelectedRows, setIsDeletingSelectedRows] = useState(false);
  const [exportModal, setExportModal] = useState({
    isOpen: false,
    scopeKey: "all"
  });
  const [exportColumnKeys, setExportColumnKeys] = useState(() => PRODUCT_OVERVIEW_EXPORT_COLUMN_KEYS);
  const [isExportingProductOverview, setIsExportingProductOverview] = useState(false);
  const purchaseAssignConflictResolverRef = useRef(null);
  const overviewRequestIdRef = useRef(0);
  const loadMoreTriggerRef = useRef(null);
  const isLoadingMoreRef = useRef(false);
  const { toast, showToast } = useAppToast();

  const isStatusView = viewMode === "status";
  const currentQueryStatus = isStatusView ? activeStatusTab : "all";
  const currentSelectionQueryKey = JSON.stringify({
    viewMode,
    status: currentQueryStatus,
    filters: debouncedFilters,
    includeCompanyData
  });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const activeSelection =
    selection.queryKey === currentSelectionQueryKey
      ? selection
      : { mode: "ids", ids: [], excludedIds: [], queryKey: currentSelectionQueryKey, totalCount: 0 };
  const selectedSubmissionIdSet =
    activeSelection.mode === "all_matching"
      ? new Set(
          rows
            .filter((row) => !activeSelection.excludedIds.includes(row.submission_id))
            .map((row) => row.submission_id)
        )
      : new Set(activeSelection.ids);
  const selectedCount =
    activeSelection.mode === "all_matching"
      ? Math.max(0, (activeSelection.totalCount || pageInfo.totalCount || 0) - activeSelection.excludedIds.length)
      : activeSelection.ids.length;
  const isAllMatchingSelection = activeSelection.mode === "all_matching";
  const isAllMatchingSelected = isAllMatchingSelection && activeSelection.excludedIds.length === 0 && selectedCount > 0;
  const scopeRowsByKey = {
    all: currentQueryStatus === "all" ? rows : [],
    purchase: currentQueryStatus === "purchase" ? rows : [],
    review: currentQueryStatus === "review" ? rows : [],
    complete: currentQueryStatus === "complete" ? rows : []
  };
  const selectedLoadedRows = rows.filter((row) => selectedSubmissionIdSet.has(row.submission_id));
  const selectedRowsByScope = {
    all: currentQueryStatus === "all" ? selectedLoadedRows : [],
    purchase: currentQueryStatus === "purchase" ? selectedLoadedRows : [],
    review: currentQueryStatus === "review" ? selectedLoadedRows : [],
    complete: currentQueryStatus === "complete" ? selectedLoadedRows : []
  };
  const purchaseBulkVisibleRows = scopeRowsByKey[purchaseBulkScope] ?? [];
  const purchaseBulkSelectedRows = purchaseBulkResolvedRows ?? selectedRowsByScope[purchaseBulkScope] ?? [];
  const isPurchaseBulkSelectionMode = purchaseBulkSelectedRows.length > 0;
  const purchaseAssignVisibleRows = scopeRowsByKey[purchaseAssignScope] ?? [];
  const reviewBatchVisibleRows = scopeRowsByKey[reviewBatchScope] ?? [];
  const reviewBatchSelectedRows = reviewBatchResolvedRows ?? selectedRowsByScope[reviewBatchScope] ?? [];
  const reviewBatchBaseRows = reviewBatchSelectedRows.length > 0 ? reviewBatchSelectedRows : reviewBatchVisibleRows;
  const reviewBatchTargetRows = reviewBatchBaseRows.filter(
    (row) => row.is_review_verified && !row.is_deposit_verified
  );
  const canVerifyDeposit =
    !isLoadingCapabilities && !capabilitiesErrorMessage && capabilities.canVerifyDeposit;
  const exportModalRows = scopeRowsByKey[exportModal.scopeKey] ?? [];
  const exportSelectedColumnKeySet = new Set(exportColumnKeys);
  const isAllExportColumnsSelected = exportColumnKeys.length === PRODUCT_OVERVIEW_EXPORT_COLUMN_KEYS.length;
  const purchaseAssignVisibleProducts = getVisibleProducts(purchaseAssignVisibleRows, productMap);
  const resolvedPurchaseAssignProductId =
    purchaseAssignVisibleProducts.length === 1
      ? String(purchaseAssignVisibleProducts[0].id)
      : purchaseAssignTargetProductId;
  const selectedPurchaseAssignProduct = resolvedPurchaseAssignProductId
    ? productMap.get(Number(resolvedPurchaseAssignProductId)) ?? null
    : null;
  const purchaseAssignPositionMaps = buildProductOverviewRowPositionMaps(purchaseAssignVisibleRows);
  const basePurchaseAssignPreview = buildPurchaseAssignPreview(
    purchaseAssignText,
    purchaseAssignPositionMaps.rowByNumberMap,
    purchaseAssignPositionMaps.maxRowNumber
  );
  const purchaseAssignPreview =
    purchaseAssignVisibleProducts.length > 1 &&
    !resolvedPurchaseAssignProductId &&
    basePurchaseAssignPreview.entries.length > 0 &&
    !basePurchaseAssignPreview.errorMessage
      ? {
          ...basePurchaseAssignPreview,
          errorMessage: "대상 상품을 선택해주세요."
        }
      : basePurchaseAssignPreview;
  const purchaseBulkPreview = isPurchaseBulkSelectionMode
    ? buildSelectedPurchaseBulkPreview(purchaseBulkText, purchaseBulkSelectedRows)
    : buildPurchaseBulkPreview(
        purchaseBulkAssignName,
        purchaseBulkText,
        purchaseBulkVisibleRows,
        { allowCreateNewRows: false }
      );
  const hasActiveFilters = Object.values(filters).some((value) => String(value ?? "").trim() !== "");
  const currentViewHeaderText = isStatusView ? "상태별보기 화면입니다." : "전체보기 화면입니다.";
  const activeTotalCount = Number(pageInfo.totalCount ?? rows.length);
  const activeCountLabel =
    activeTotalCount > rows.length
      ? `${rows.length.toLocaleString()}/${activeTotalCount.toLocaleString()}건`
      : `${rows.length.toLocaleString()}건`;
  const selectionSummary =
    selectedCount > 0
      ? isAllMatchingSelection
        ? `현재 필터 결과 ${selectedCount.toLocaleString()}건이 선택되었습니다.`
        : `선택한 행 ${selectedCount.toLocaleString()}건`
      : "";

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedFilters(filters);
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [filters]);

  useEffect(() => {
    const emptyFilters = createEmptyProductOverviewFilters();

    setSelection({
      mode: "ids",
      ids: [],
      excludedIds: [],
      queryKey: "",
      totalCount: 0
    });
    setFilters(emptyFilters);
    setDebouncedFilters(emptyFilters);
  }, [viewMode]);

  useEffect(() => {
    setSelection({
      mode: "ids",
      ids: [],
      excludedIds: [],
      queryKey: currentSelectionQueryKey,
      totalCount: 0
    });
  }, [currentSelectionQueryKey]);

  useEffect(() => {
    const requestId = overviewRequestIdRef.current + 1;
    overviewRequestIdRef.current = requestId;

    const loadOverview = async () => {
      setIsLoading(true);
      setIsLoadingMore(false);
      isLoadingMoreRef.current = false;
      setErrorMessage("");

      if (isLoadingCapabilities || !isIncludeCompanyDataReady) {
        return;
      }

      if (capabilitiesErrorMessage) {
        setProducts([]);
        setRows([]);
        setPageInfo({
          hasMore: false,
          nextCursor: null,
          pageSize: PRODUCT_OVERVIEW_PAGE_SIZE,
          totalCount: 0
        });
        setErrorMessage(capabilitiesErrorMessage);
        setIsLoading(false);
        return;
      }

      const {
        productsResult: { data: productData, error: productError },
        rowsResult: { data: rowData, error: rowError },
        pageInfo: nextPageInfo
      } = await fetchAdminProductOverview(adminId, {
        scopePolicy,
        adminProfile,
        status: currentQueryStatus,
        filters: debouncedFilters,
        pageSize: PRODUCT_OVERVIEW_PAGE_SIZE
      });

      if (overviewRequestIdRef.current !== requestId) {
        return;
      }

      if (productError || rowError) {
        setProducts([]);
        setRows([]);
        setPageInfo({
          hasMore: false,
          nextCursor: null,
          pageSize: PRODUCT_OVERVIEW_PAGE_SIZE,
          totalCount: 0
        });
        setErrorMessage(productError?.message ?? rowError?.message ?? "상품전체보기 데이터를 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      setProducts(productData ?? []);
      setRows(rowData ?? []);
      setPageInfo(
        nextPageInfo ?? {
          hasMore: false,
          nextCursor: null,
          pageSize: PRODUCT_OVERVIEW_PAGE_SIZE,
          totalCount: 0
        }
      );
      setIsLoading(false);
    };

    loadOverview();
  }, [
    adminId,
    capabilitiesErrorMessage,
    currentQueryStatus,
    debouncedFilters,
    includeCompanyData,
    adminProfile,
    isIncludeCompanyDataReady,
    isLoadingCapabilities,
    listReloadKey,
    scopePolicy
  ]);

  const requestOverviewReload = () => {
    setListReloadKey((prev) => prev + 1);
  };

  const resetCurrentSelection = () => {
    setSelection({
      mode: "ids",
      ids: [],
      excludedIds: [],
      queryKey: currentSelectionQueryKey,
      totalCount: 0
    });
  };

  const loadMoreOverviewRows = async () => {
    if (isLoading || isLoadingMoreRef.current || !pageInfo.hasMore || !pageInfo.nextCursor || errorMessage) {
      return;
    }

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    const {
      productsResult: { data: productData, error: productError },
      rowsResult: { data: nextRows, error: rowError },
      pageInfo: nextPageInfo
    } = await fetchAdminProductOverview(adminId, {
      scopePolicy,
      adminProfile,
      status: currentQueryStatus,
      filters: debouncedFilters,
      pageSize: PRODUCT_OVERVIEW_PAGE_SIZE,
      cursor: pageInfo.nextCursor
    });

    if (productError || rowError) {
      showToast(productError?.message ?? rowError?.message ?? "다음 데이터를 불러오지 못했습니다.", "error");
      setIsLoadingMore(false);
      isLoadingMoreRef.current = false;
      return;
    }

    setProducts((prev) => {
      const nextProductMap = new Map(prev.map((product) => [product.id, product]));

      (productData ?? []).forEach((product) => {
        nextProductMap.set(product.id, product);
      });

      return Array.from(nextProductMap.values());
    });
    setRows((prev) => {
      const existingIds = new Set(prev.map((row) => row.submission_id));
      const appendedRows = (nextRows ?? []).filter((row) => !existingIds.has(row.submission_id));

      return [...prev, ...appendedRows];
    });
    setPageInfo(
      nextPageInfo
        ? {
            ...nextPageInfo,
            totalCount: Math.max(pageInfo.totalCount, nextPageInfo.totalCount ?? 0)
          }
        : {
            hasMore: false,
            nextCursor: null,
            pageSize: PRODUCT_OVERVIEW_PAGE_SIZE,
            totalCount: pageInfo.totalCount
          }
    );
    setIsLoadingMore(false);
    isLoadingMoreRef.current = false;
  };

  useEffect(() => {
    const triggerNode = loadMoreTriggerRef.current;

    if (!triggerNode || isLoading || !pageInfo.hasMore || errorMessage) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreOverviewRows();
        }
      },
      {
        root: null,
        rootMargin: "300px 0px"
      }
    );

    observer.observe(triggerNode);

    return () => {
      observer.disconnect();
    };
  }, [currentSelectionQueryKey, errorMessage, isLoading, pageInfo.hasMore, pageInfo.nextCursor]);

  const handleFilterChange = (columnKey, value) => {
    setSelection({
      mode: "ids",
      ids: [],
      excludedIds: [],
      queryKey: currentSelectionQueryKey,
      totalCount: 0
    });
    setFilters((prev) => ({
      ...prev,
      [columnKey]: value
    }));
  };

  const handleResetFilters = () => {
    setSelection({
      mode: "ids",
      ids: [],
      excludedIds: [],
      queryKey: currentSelectionQueryKey,
      totalCount: 0
    });
    setFilters(createEmptyProductOverviewFilters());
  };

  const clearSelectedRows = (submissionIds) => {
    if (!submissionIds?.length) {
      return;
    }

    setSelection((prev) => {
      if (prev.queryKey !== currentSelectionQueryKey) {
        return prev;
      }

      if (prev.mode === "all_matching") {
        return {
          ...prev,
          excludedIds: Array.from(new Set([...prev.excludedIds, ...submissionIds]))
        };
      }

      return {
        ...prev,
        ids: prev.ids.filter((submissionId) => !submissionIds.includes(submissionId))
      };
    });
  };

  const handleToggleRowSelection = (submissionId) => {
    setSelection((prev) => {
      const baseSelection =
        prev.queryKey === currentSelectionQueryKey
          ? prev
          : {
              mode: "ids",
              ids: [],
              excludedIds: [],
              queryKey: currentSelectionQueryKey,
              totalCount: 0
            };

      if (baseSelection.mode === "all_matching") {
        const isExcluded = baseSelection.excludedIds.includes(submissionId);

        return {
          ...baseSelection,
          excludedIds: isExcluded
            ? baseSelection.excludedIds.filter((id) => id !== submissionId)
            : [...baseSelection.excludedIds, submissionId]
        };
      }

      return {
        ...baseSelection,
        ids: baseSelection.ids.includes(submissionId)
          ? baseSelection.ids.filter((id) => id !== submissionId)
          : [...baseSelection.ids, submissionId]
      };
    });
  };

  const handleToggleAllSelection = (targetRows, nextChecked) => {
    if (!nextChecked) {
      setSelection({
        mode: "ids",
        ids: [],
        excludedIds: [],
        queryKey: currentSelectionQueryKey,
        totalCount: 0
      });
      return;
    }

    setSelection({
      mode: "all_matching",
      ids: [],
      excludedIds: [],
      queryKey: currentSelectionQueryKey,
      totalCount: pageInfo.totalCount || targetRows.length
    });
  };

  const resolveSelectedRowsForScope = async (scopeKey) => {
    if (!isAllMatchingSelection || scopeKey !== currentQueryStatus) {
      return selectedRowsByScope[scopeKey] ?? [];
    }

    const result = await fetchAllAdminProductOverviewRows(adminId, {
      scopePolicy,
      adminProfile,
      status: currentQueryStatus,
      filters: debouncedFilters,
      pageSize: PRODUCT_OVERVIEW_PAGE_SIZE
    });

    if (result.error) {
      showToast(result.error.message ?? "선택된 전체 데이터를 불러오지 못했습니다.", "error");
      return null;
    }

    setProducts((prev) => {
      const nextProductMap = new Map(prev.map((product) => [product.id, product]));

      (result.products ?? []).forEach((product) => {
        nextProductMap.set(product.id, product);
      });

      return Array.from(nextProductMap.values());
    });

    const excludedIds = new Set(activeSelection.excludedIds);
    return (result.data ?? []).filter((row) => !excludedIds.has(row.submission_id));
  };

  const openPhotoViewer = (photos, activeIndex) => {
    setPhotoViewer({
      isOpen: true,
      photos,
      activeIndex
    });
  };

  const closePhotoViewer = () => {
    setPhotoViewer({ isOpen: false, photos: [], activeIndex: 0 });
  };

  const showPrevPhoto = () => {
    setPhotoViewer((prev) => ({
      ...prev,
      activeIndex: prev.activeIndex === 0 ? prev.photos.length - 1 : prev.activeIndex - 1
    }));
  };

  const showNextPhoto = () => {
    setPhotoViewer((prev) => ({
      ...prev,
      activeIndex: prev.activeIndex === prev.photos.length - 1 ? 0 : prev.activeIndex + 1
    }));
  };

  const openDeletePhotoDialog = (photo) => {
    setDeleteTargetPhoto(photo);
  };

  const closeDeletePhotoDialog = () => {
    if (isDeletingPhoto) {
      return;
    }

    setDeleteTargetPhoto(null);
  };

  const handleDeletePhoto = async () => {
    const photoId = getPhotoId(deleteTargetPhoto);

    if (!photoId) {
      showToast("삭제할 사진을 찾지 못했습니다.", "error");
      return;
    }

    setIsDeletingPhoto(true);
    const { data, error } = await deleteEvidencePhoto(photoId);

    if (error) {
      showToast(error.message, "error");
      setIsDeletingPhoto(false);
      return;
    }

    if (!data) {
      showToast("이미 삭제되었거나 접근할 수 없는 사진입니다.", "error");
      setIsDeletingPhoto(false);
      return;
    }

    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        review_photos: removePhotoById(row.review_photos, photoId)
      }))
    );

    setPhotoViewer((prev) => {
      const nextPhotos = removePhotoById(prev.photos, photoId);

      if (nextPhotos.length === 0) {
        return { isOpen: false, photos: [], activeIndex: 0 };
      }

      return {
        ...prev,
        photos: nextPhotos,
        activeIndex: Math.min(prev.activeIndex, nextPhotos.length - 1)
      };
    });

    showToast("사진을 삭제했습니다.", "success");
    setDeleteTargetPhoto(null);
    setIsDeletingPhoto(false);
  };

  const setPurchaseBulkFeedback = (message, type = "info") => {
    setPurchaseBulkMessage(message);
    setPurchaseBulkMessageType(type);
  };

  const setPurchaseAssignFeedback = (message, type = "info") => {
    setPurchaseAssignMessage(message);
    setPurchaseAssignMessageType(type);
  };

  const setReviewBatchFeedback = (message, type = "info") => {
    setReviewBatchMessage(message);
    setReviewBatchMessageType(type);
  };

  const openPurchaseBulkModal = async (scopeKey) => {
    const selectedRows = selectedCount > 0 ? await resolveSelectedRowsForScope(scopeKey) : [];

    if (selectedRows === null) {
      return;
    }

    setPurchaseBulkScope(scopeKey);
    setPurchaseBulkResolvedRows(selectedRows.length > 0 ? selectedRows : null);
    setPurchaseBulkAssignName("");
    setPurchaseBulkText("");
    setPurchaseBulkMessage("");
    setPurchaseBulkMessageType("info");
    setIsPurchaseBulkModalOpen(true);
  };

  const closePurchaseBulkModal = () => {
    if (isApplyingPurchaseBulk) {
      return;
    }

    setIsPurchaseBulkModalOpen(false);
    setPurchaseBulkResolvedRows(null);
  };

  const openPurchaseAssignModal = (scopeKey) => {
    const visibleProducts = getVisibleProducts(scopeRowsByKey[scopeKey] ?? [], productMap);

    setPurchaseAssignScope(scopeKey);
    setPurchaseAssignText("");
    setPurchaseAssignMessage("");
    setPurchaseAssignMessageType("info");
    setPurchaseAssignTargetProductId(visibleProducts.length === 1 ? String(visibleProducts[0].id) : "");
    setIsPurchaseAssignModalOpen(true);
  };

  const closePurchaseAssignModal = () => {
    if (isApplyingPurchaseAssign) {
      return;
    }

    setIsPurchaseAssignModalOpen(false);
  };

  const openReviewBatchModal = async (scopeKey) => {
    if (!canVerifyDeposit) {
      showToast("입금완료 처리 권한이 없습니다.", "error");
      return;
    }

    const selectedRows = selectedCount > 0 ? await resolveSelectedRowsForScope(scopeKey) : [];

    if (selectedRows === null) {
      return;
    }

    setReviewBatchScope(scopeKey);
    setReviewBatchResolvedRows(selectedRows.length > 0 ? selectedRows : null);
    setReviewBatchDepositedAt("");
    setReviewBatchActualDepositorMode("planned");
    setReviewBatchActualDepositorName("");
    setReviewBatchMessage("");
    setReviewBatchMessageType("info");
    setIsReviewBatchModalOpen(true);
  };

  const closeReviewBatchModal = () => {
    if (isApplyingReviewBatch) {
      return;
    }

    setIsReviewBatchModalOpen(false);
    setReviewBatchResolvedRows(null);
  };

  const closeReviewVerifyConfirmDialog = () => {
    if (isApplyingReviewVerify) {
      return;
    }

    setReviewVerifyConfirmDialog((prev) => ({
      ...prev,
      isOpen: false,
      missingLabels: [],
      targetRows: []
    }));
  };

  const closeReviewBatchConfirmDialog = () => {
    if (isApplyingReviewBatch) {
      return;
    }

    setReviewBatchConfirmDialog({
      isOpen: false,
      missingLabels: []
    });
  };

  const openDepositCancelDialog = async (scopeKey) => {
    if (!canVerifyDeposit) {
      showToast("입금완료 처리 권한이 없습니다.", "error");
      return;
    }

    const selectedRows = await resolveSelectedRowsForScope(scopeKey);

    if (selectedRows === null) {
      return;
    }

    if (selectedRows.length === 0) {
      return;
    }

    if (!areRowsDepositCancelTargets(selectedRows)) {
      showToast("입금완료 예인 전체완료 행만 선택해야 합니다.", "error");
      return;
    }

    setDepositCancelTargetRows(selectedRows);
    setDepositCancelReason("");
    setDepositCancelMessage("");
  };

  const closeDepositCancelDialog = () => {
    if (isCancellingDeposit) {
      return;
    }

    setDepositCancelTargetRows([]);
    setDepositCancelReason("");
    setDepositCancelMessage("");
  };

  const openSelectedDeleteDialog = async (scopeKey) => {
    const selectedRows = await resolveSelectedRowsForScope(scopeKey);

    if (selectedRows === null) {
      return;
    }

    if (selectedRows.length === 0) {
      return;
    }

    setSelectedDeleteTargetRows(selectedRows);
  };

  const closeSelectedDeleteDialog = () => {
    if (isDeletingSelectedRows) {
      return;
    }

    setSelectedDeleteTargetRows([]);
  };

  const openExportModal = (scopeKey) => {
    setExportModal({
      isOpen: true,
      scopeKey
    });
    setExportColumnKeys(PRODUCT_OVERVIEW_EXPORT_COLUMN_KEYS);
  };

  const closeExportModal = () => {
    setExportModal({
      isOpen: false,
      scopeKey: "all"
    });
  };

  const handleToggleExportColumn = (columnKey, nextChecked) => {
    setExportColumnKeys((prev) => {
      if (!nextChecked) {
        return prev.filter((key) => key !== columnKey);
      }

      return PRODUCT_OVERVIEW_EXPORT_COLUMN_KEYS.filter((key) => key === columnKey || prev.includes(key));
    });
  };

  const handleToggleAllExportColumns = (nextChecked) => {
    setExportColumnKeys(nextChecked ? PRODUCT_OVERVIEW_EXPORT_COLUMN_KEYS : []);
  };

  const handleDownloadProductOverviewExcel = async () => {
    if (exportModalRows.length === 0) {
      showToast("내보낼 행이 없습니다.", "error");
      return;
    }

    if (exportColumnKeys.length === 0) {
      showToast("내보낼 컬럼을 1개 이상 선택해주세요.", "error");
      return;
    }

    const scopeLabel = getProductOverviewExportScopeLabel(exportModal.scopeKey);
    setIsExportingProductOverview(true);
    const result = await fetchAllAdminProductOverviewRows(adminId, {
      scopePolicy,
      adminProfile,
      status: exportModal.scopeKey,
      filters: debouncedFilters,
      pageSize: PRODUCT_OVERVIEW_PAGE_SIZE
    });

    if (result.error) {
      showToast(result.error.message ?? "엑셀 데이터를 불러오지 못했습니다.", "error");
      setIsExportingProductOverview(false);
      return;
    }

    const exportRows = result.data ?? [];

    if (exportRows.length === 0) {
      showToast("내보낼 행이 없습니다.", "error");
      setIsExportingProductOverview(false);
      return;
    }

    try {
      await downloadExcel(buildExportFilename(`상품전체보기_${scopeLabel}`), {
        name: scopeLabel,
        rows: buildProductOverviewExcelRows(exportRows, exportColumnKeys)
      });
      showToast(`${exportRows.length}건을 엑셀로 내보냈습니다.`, "success");
      closeExportModal();
    } catch (error) {
      showToast(error?.message ?? "Excel 파일을 만들지 못했습니다.", "error");
    } finally {
      setIsExportingProductOverview(false);
    }
  };

  const handleDeleteSelectedRows = async () => {
    const targetSubmissionIds = selectedDeleteTargetRows.map((row) => row.submission_id);

    if (targetSubmissionIds.length === 0) {
      return;
    }

    setIsDeletingSelectedRows(true);

    const { data: deletedSubmissionIds, error } = await deleteAdminProductOverviewSubmissions(
      targetSubmissionIds,
      adminId,
      { scopePolicy, adminProfile }
    );

    if (error) {
      showToast(error.message, "error");
      setIsDeletingSelectedRows(false);
      return;
    }

    setRows((prev) => prev.filter((row) => !deletedSubmissionIds.includes(row.submission_id)));
    clearSelectedRows(deletedSubmissionIds);
    showToast(`${deletedSubmissionIds.length}건을 삭제했습니다.`, "success");
    setSelectedDeleteTargetRows([]);
    setIsDeletingSelectedRows(false);
    resetCurrentSelection();
    requestOverviewReload();
  };

  const closePurchaseAssignConflictDialog = (result = null) => {
    setPurchaseAssignConflictDialog({
      isOpen: false,
      step: "conflict",
      duplicatedNumbers: ""
    });

    if (purchaseAssignConflictResolverRef.current) {
      purchaseAssignConflictResolverRef.current(result);
      purchaseAssignConflictResolverRef.current = null;
    }
  };
  const purchaseBulkBackdropDismissProps = useBackdropDismiss(closePurchaseBulkModal);
  const exportBackdropDismissProps = useBackdropDismiss(closeExportModal);
  const purchaseAssignBackdropDismissProps = useBackdropDismiss(closePurchaseAssignModal);
  const reviewBatchBackdropDismissProps = useBackdropDismiss(closeReviewBatchModal);
  const purchaseAssignConflictBackdropDismissProps = useBackdropDismiss(() => closePurchaseAssignConflictDialog(null));

  const openPurchaseAssignConflictDialog = (duplicatedNumbers) =>
    new Promise((resolve) => {
      purchaseAssignConflictResolverRef.current = resolve;
      setPurchaseAssignConflictDialog({
        isOpen: true,
        step: "conflict",
        duplicatedNumbers
      });
    });

  const movePurchaseAssignConflictDialogToOverwriteStep = () => {
    setPurchaseAssignConflictDialog((prev) => ({
      ...prev,
      step: "overwrite-mode"
    }));
  };

  const handlePurchaseBulkApply = async () => {
    setPurchaseBulkFeedback("");

    if (purchaseBulkPreview.status !== "ready" || purchaseBulkPreview.create_new_rows) {
      setPurchaseBulkFeedback(
        purchaseBulkPreview.message || "현재 화면에서 입력 가능한 기존 행을 찾지 못했습니다.",
        "error"
      );
      return;
    }

    setIsApplyingPurchaseBulk(true);

    const savedRows = [];

    for (let index = 0; index < purchaseBulkPreview.parsedEntries.length; index += 1) {
      const targetRow = purchaseBulkPreview.targetRows[index];
      const entry = purchaseBulkPreview.parsedEntries[index];
      const result = await updateReviewReceiveSubmission(targetRow.submission_id, {
        product_id: targetRow.product_id,
        assign_name: (entry.assign_name ?? targetRow.assign_name)?.trim() || null,
        order_number: entry.order_number,
        buyer_name: entry.buyer_name,
        recipient_name: entry.recipient_name,
        purchase_account: entry.purchase_account?.trim() || null,
        contact: entry.contact,
        address: entry.address,
        amount: entry.amount,
        review_fee: entry.review_fee ?? targetRow.review_fee ?? null,
        bank_name: entry.bank_name,
        bank_account: entry.bank_account,
        account_holder: entry.account_holder,
        is_review_verified: Boolean(targetRow.is_review_verified),
        is_deposit_verified: Boolean(targetRow.is_deposit_verified),
        deposited_at: targetRow.deposited_at || null,
        actual_depositor_name: targetRow.actual_depositor_name?.trim() || null
      });

      if (result.error) {
        if (savedRows.length > 0) {
          setRows((prev) => replaceProductOverviewRows(prev, savedRows));
        }

        setPurchaseBulkFeedback(
          `${index + 1}번째 저장 중 오류가 발생했습니다. ${savedRows.length}건만 반영되었습니다.`,
          "error"
        );
        setIsApplyingPurchaseBulk(false);
        return;
      }

      const savedRow = buildOverviewRowFromSubmission(productMap, targetRow.product_id, result.data, targetRow);

      if (savedRow) {
        savedRows.push(savedRow);
      }
    }

    setRows((prev) => replaceProductOverviewRows(prev, savedRows));
    clearSelectedRows(savedRows.map((row) => row.submission_id));
    setPurchaseBulkText("");
    showToast(`${savedRows.length}건을 일괄입력했습니다.`, "success");
    setIsApplyingPurchaseBulk(false);
    setIsPurchaseBulkModalOpen(false);
    setPurchaseBulkResolvedRows(null);
    resetCurrentSelection();
    requestOverviewReload();
  };

  const handlePurchaseAssignApply = async () => {
    setPurchaseAssignFeedback("");

    if (purchaseAssignPreview.errorMessage) {
      setPurchaseAssignFeedback(purchaseAssignPreview.errorMessage, "error");
      return;
    }

    if (purchaseAssignPreview.entries.length === 0) {
      setPurchaseAssignFeedback("구매자 일괄 입력 텍스트를 입력해주세요.", "error");
      return;
    }

    if (!resolvedPurchaseAssignProductId) {
      setPurchaseAssignFeedback("대상 상품을 선택해주세요.", "error");
      return;
    }

    const overlappingEntries = purchaseAssignPreview.entries.filter(
      (entry) => entry.row_number != null && purchaseAssignPositionMaps.rowByNumberMap[entry.row_number]
    );
    let purchaseAssignMode = "append";

    if (overlappingEntries.length > 0) {
      const duplicatedNumbers = overlappingEntries.map((entry) => entry.row_number).join(", ");
      const conflictResolution = await openPurchaseAssignConflictDialog(duplicatedNumbers);

      if (!conflictResolution) {
        return;
      }

      purchaseAssignMode = conflictResolution;
    }

    setIsApplyingPurchaseAssign(true);

    const createdRows = [];
    const updatedRows = new Map();
    let createdCount = 0;
    let overwrittenCount = 0;

    for (let index = 0; index < purchaseAssignPreview.entries.length; index += 1) {
      const entry = purchaseAssignPreview.entries[index];
      const targetRow =
        purchaseAssignMode !== "append" && entry.row_number != null
          ? purchaseAssignPositionMaps.rowByNumberMap[entry.row_number] ?? null
          : null;
      const targetProductId = targetRow?.product_id ?? Number(resolvedPurchaseAssignProductId);
      const payload =
        purchaseAssignMode === "overwrite-rename-only" && targetRow
          ? { assign_name: entry.assign_name?.trim() || null }
          : buildBlankPurchaseAssignPayload(targetProductId, entry.assign_name);
      const result = targetRow
        ? await updateReviewReceiveSubmission(targetRow.submission_id, payload)
        : await createReviewReceiveSubmission(payload);

      if (result.error) {
        if (createdRows.length > 0 || updatedRows.size > 0) {
          setRows((prev) => mergeProductOverviewRows(prev, updatedRows, createdRows));
        }

        setPurchaseAssignFeedback(
          `${index + 1}번째 처리 중 오류가 발생했습니다. 덮어쓰기 ${overwrittenCount}건, 추가 ${createdCount}건만 반영되었습니다.`,
          "error"
        );
        setIsApplyingPurchaseAssign(false);
        return;
      }

      const savedRow = buildOverviewRowFromSubmission(productMap, targetProductId, result.data, targetRow);

      if (!savedRow) {
        continue;
      }

      if (targetRow) {
        updatedRows.set(targetRow.submission_id, savedRow);
        overwrittenCount += 1;
      } else {
        createdRows.push(savedRow);
        createdCount += 1;
      }
    }

    setRows((prev) => mergeProductOverviewRows(prev, updatedRows, createdRows));
    setPurchaseAssignText("");
    showToast(
      overwrittenCount > 0
        ? purchaseAssignMode === "overwrite-rename-only"
          ? `이름 변경 ${overwrittenCount}건, 추가 ${createdCount}건을 반영했습니다.`
          : `덮어쓰기 ${overwrittenCount}건, 추가 ${createdCount}건을 반영했습니다.`
        : `${createdCount}건의 구매자를 추가했습니다.`,
      "success"
    );
    setIsApplyingPurchaseAssign(false);
    setIsPurchaseAssignModalOpen(false);
    requestOverviewReload();
  };

  const applyReviewBatch = async () => {
    if (!canVerifyDeposit) {
      setReviewBatchFeedback("입금완료 처리 권한이 없습니다.", "error");
      return;
    }

    setIsApplyingReviewBatch(true);

    const savedRows = [];
    const normalizedDepositedAt = reviewBatchDepositedAt || null;

    for (let index = 0; index < reviewBatchTargetRows.length; index += 1) {
      const row = reviewBatchTargetRows[index];
      const normalizedActualDepositorName = getReviewBatchActualDepositorName(
        row,
        reviewBatchActualDepositorMode,
        reviewBatchActualDepositorName
      );
      const result = await updateReviewReceiveSubmission(row.submission_id, {
        is_deposit_verified: true,
        deposited_at: normalizedDepositedAt,
        actual_depositor_name: normalizedActualDepositorName
      });

      if (result.error) {
        if (savedRows.length > 0) {
          setRows((prev) => replaceProductOverviewRows(prev, savedRows));
        }

        setReviewBatchFeedback(
          `${index + 1}번째 저장 중 오류가 발생했습니다. ${savedRows.length}건만 반영되었습니다.`,
          "error"
        );
        setIsApplyingReviewBatch(false);
        return;
      }

      const savedRow = buildOverviewRowFromSubmission(productMap, row.product_id, result.data, row);

      if (savedRow) {
        savedRows.push(savedRow);
      }
    }

    setRows((prev) => replaceProductOverviewRows(prev, savedRows));
    clearSelectedRows(savedRows.map((row) => row.submission_id));
    showToast(`${savedRows.length}건을 전체완료로 처리했습니다.`, "success");
    setIsApplyingReviewBatch(false);
    setIsReviewBatchModalOpen(false);
    setReviewBatchResolvedRows(null);
    resetCurrentSelection();
    requestOverviewReload();
  };

  const handleReviewBatchApply = async () => {
    setReviewBatchFeedback("");

    if (!canVerifyDeposit) {
      setReviewBatchFeedback("입금완료 처리 권한이 없습니다.", "error");
      return;
    }

    if (reviewBatchSelectedRows.length > 0 && !areRowsDepositVerifyTargets(reviewBatchSelectedRows)) {
      setReviewBatchFeedback("리뷰완료 예이고 입금완료 전인 행만 선택해야 합니다.", "error");
      return;
    }

    if (reviewBatchTargetRows.length === 0) {
      setReviewBatchFeedback(
        reviewBatchSelectedRows.length > 0
          ? "선택한 행 중 리뷰완료 일괄처리 대상이 없습니다."
          : "현재 화면에서 리뷰완료 일괄처리 대상이 없습니다.",
        "error"
      );
      return;
    }

    const missingLabels = [
      ...(!reviewBatchDepositedAt ? ["입금일"] : []),
      ...(reviewBatchActualDepositorMode === "planned" &&
      reviewBatchTargetRows.some((row) => !row.planned_depositor_name?.trim())
        ? ["입금자명(예정)"]
        : []),
      ...(reviewBatchActualDepositorMode === "custom" && !reviewBatchActualDepositorName.trim()
        ? ["실제입금자명"]
        : [])
    ];

    if (missingLabels.length > 0) {
      setReviewBatchConfirmDialog({
        isOpen: true,
        missingLabels
      });
      return;
    }

    await applyReviewBatch();
  };

  const requestReviewVerifyApply = async (scopeKey) => {
    const selectedRows = await resolveSelectedRowsForScope(scopeKey);

    if (selectedRows === null) {
      return;
    }

    if (selectedRows.length === 0) {
      return;
    }

    if (!areRowsReviewVerifyTargets(selectedRows)) {
      showToast("선택한 행 중 리뷰완료 처리 대상이 없습니다.", "error");
      return;
    }

    setReviewVerifyConfirmDialog({
      isOpen: true,
      scopeKey,
      missingLabels: getMissingRequiredFieldLabels(selectedRows, REVIEW_VERIFY_REQUIRED_FIELDS),
      targetRows: selectedRows
    });
  };

  const applyReviewVerify = async (targetRowsFromDialog) => {
    const selectedRows = targetRowsFromDialog ?? [];
    const targetRows = areRowsReviewVerifyTargets(selectedRows) ? selectedRows : [];

    if (targetRows.length === 0) {
      showToast("선택한 행 중 리뷰완료 처리 대상이 없습니다.", "error");
      return;
    }

    setIsApplyingReviewVerify(true);

    const savedRows = [];

    for (let index = 0; index < targetRows.length; index += 1) {
      const row = targetRows[index];
      const result = await updateReviewReceiveSubmission(row.submission_id, {
        is_review_verified: true
      });

      if (result.error) {
        if (savedRows.length > 0) {
          setRows((prev) => replaceProductOverviewRows(prev, savedRows));
        }

        showToast(
          `${index + 1}번째 저장 중 오류가 발생했습니다. ${savedRows.length}건만 반영되었습니다.`,
          "error"
        );
        setIsApplyingReviewVerify(false);
        return;
      }

      const savedRow = buildOverviewRowFromSubmission(productMap, row.product_id, result.data, row);

      if (savedRow) {
        savedRows.push(savedRow);
      }
    }

    setRows((prev) => replaceProductOverviewRows(prev, savedRows));
    clearSelectedRows(savedRows.map((row) => row.submission_id));
    showToast(`${savedRows.length}건을 리뷰완료로 처리했습니다.`, "success");
    setIsApplyingReviewVerify(false);
    resetCurrentSelection();
    requestOverviewReload();
  };

  const confirmReviewVerifyApply = async () => {
    const targetRows = reviewVerifyConfirmDialog.targetRows ?? [];
    closeReviewVerifyConfirmDialog();
    await applyReviewVerify(targetRows);
  };

  const confirmReviewBatchApply = async () => {
    closeReviewBatchConfirmDialog();
    if (!canVerifyDeposit) {
      setReviewBatchFeedback("입금완료 처리 권한이 없습니다.", "error");
      return;
    }

    await applyReviewBatch();
  };

  const handleDepositCancelApply = async () => {
    setDepositCancelMessage("");

    if (!canVerifyDeposit) {
      setDepositCancelMessage("입금완료 처리 권한이 없습니다.");
      return;
    }

    if (!areRowsDepositCancelTargets(depositCancelTargetRows)) {
      setDepositCancelMessage("입금완료 예인 전체완료 행만 선택해야 합니다.");
      return;
    }

    const normalizedReason = depositCancelReason.trim();

    if (!normalizedReason) {
      setDepositCancelMessage("입금취소사유를 입력해주세요.");
      return;
    }

    setIsCancellingDeposit(true);

    const savedRows = [];

    for (let index = 0; index < depositCancelTargetRows.length; index += 1) {
      const row = depositCancelTargetRows[index];
      const result = await updateReviewReceiveSubmission(row.submission_id, {
        is_deposit_verified: false,
        deposited_at: null,
        actual_depositor_name: normalizedReason
      });

      if (result.error) {
        if (savedRows.length > 0) {
          setRows((prev) => replaceProductOverviewRows(prev, savedRows));
        }

        setDepositCancelMessage(
          `${index + 1}번째 저장 중 오류가 발생했습니다. ${savedRows.length}건만 반영되었습니다.`
        );
        setIsCancellingDeposit(false);
        return;
      }

      const savedRow = buildOverviewRowFromSubmission(productMap, row.product_id, result.data, row);

      if (savedRow) {
        savedRows.push(savedRow);
      }
    }

    setRows((prev) => replaceProductOverviewRows(prev, savedRows));
    clearSelectedRows(savedRows.map((row) => row.submission_id));
    showToast(`${savedRows.length}건의 입금완료를 취소했습니다.`, "success");
    setIsCancellingDeposit(false);
    setDepositCancelTargetRows([]);
    setDepositCancelReason("");
    resetCurrentSelection();
    requestOverviewReload();
  };

  const purchaseBulkEnterConfirm = useModalEnterConfirm({
    isOpen: isPurchaseBulkModalOpen,
    isDisabled:
      isApplyingPurchaseBulk || purchaseBulkPreview.status !== "ready" || purchaseBulkPreview.create_new_rows,
    actionLabel: "구매정보 입력 완료",
    confirmButtonLabel: "완료하기",
    onConfirm: handlePurchaseBulkApply
  });

  const purchaseAssignEnterConfirm = useModalEnterConfirm({
    isOpen: isPurchaseAssignModalOpen,
    isDisabled:
      isApplyingPurchaseAssign ||
      Boolean(purchaseAssignPreview.errorMessage) ||
      purchaseAssignPreview.entries.length === 0,
    actionLabel: "구매자 일괄 입력 완료",
    confirmButtonLabel: "완료하기",
    onConfirm: handlePurchaseAssignApply
  });

  const reviewBatchEnterConfirm = useModalEnterConfirm({
    isOpen: isReviewBatchModalOpen,
    isDisabled: !canVerifyDeposit || isApplyingReviewBatch || reviewBatchTargetRows.length === 0,
    actionLabel: "리뷰완료 일괄처리",
    confirmButtonLabel: "확인",
    onConfirm: handleReviewBatchApply
  });

  const renderPurchaseActions = (scopeKey) => (
    <div className="review-receive-toolbar-actions">
      <button
        type="button"
        className="admin-primary-button"
        onClick={() => openPurchaseBulkModal(scopeKey)}
        disabled={(scopeRowsByKey[scopeKey] ?? []).length === 0}
      >
        {(selectedRowsByScope[scopeKey] ?? []).length > 0 ? "선택한 행에 입력하기" : "구매정보 입력하기"}
      </button>
    </div>
  );

  const renderReviewActions = (scopeKey) => {
    const selectedRows = selectedRowsByScope[scopeKey] ?? [];
    const hasSelectedRows = scopeKey === currentQueryStatus && selectedCount > 0;
    const baseRows = hasSelectedRows ? selectedRows : scopeRowsByKey[scopeKey] ?? [];
    const targetRows = baseRows.filter(
      (row) => row.is_review_verified && !row.is_deposit_verified
    );
    const isDepositVerifyDisabled = isAllMatchingSelection
      ? scopeKey !== "review" && !areRowsDepositVerifyTargets(selectedRows)
      : hasSelectedRows
        ? !areRowsDepositVerifyTargets(selectedRows)
        : targetRows.length === 0;
    const disabledReason = !canVerifyDeposit ? "입금완료 처리 권한이 없습니다." : "";

    return (
      <div className="review-receive-toolbar-actions">
        <button
          type="button"
          className="admin-primary-button"
          onClick={() => openReviewBatchModal(scopeKey)}
          disabled={!canVerifyDeposit || isDepositVerifyDisabled}
          title={disabledReason}
        >
          {hasSelectedRows ? "선택한 행 입금완료 처리하기" : "입금완료 처리하기"}
        </button>
        {!canVerifyDeposit && <p className="login-error">입금완료 처리 권한이 없습니다.</p>}
      </div>
    );
  };

  const renderReviewVerifyActions = (scopeKey) => {
    const selectedRows = selectedRowsByScope[scopeKey] ?? [];
    const canApplyReviewVerify =
      isAllMatchingSelection && scopeKey === "purchase" ? selectedCount > 0 : areRowsReviewVerifyTargets(selectedRows);

    return (
      <div className="review-receive-toolbar-actions">
        <button
          type="button"
          className="admin-primary-button"
          onClick={() => requestReviewVerifyApply(scopeKey)}
          disabled={!canApplyReviewVerify || isApplyingReviewVerify}
        >
          {isApplyingReviewVerify ? "처리 중..." : "리뷰완료 처리하기"}
        </button>
      </div>
    );
  };

  const renderFilterResetAction = (scopeKey) => {
    const selectedRows = selectedRowsByScope[scopeKey] ?? [];
    const exportRows = scopeRowsByKey[scopeKey] ?? [];
    const hasSelectedRows = scopeKey === currentQueryStatus && selectedCount > 0;
    const shouldShowDepositCancelButton = scopeKey === "complete" && hasSelectedRows;
    const canCancelSelectedDeposit =
      isAllMatchingSelection && scopeKey === "complete" ? hasSelectedRows : areRowsDepositCancelTargets(selectedRows);

    return (
      <div className="review-receive-toolbar-actions product-overview-reset-actions">
        <button
          type="button"
          className="admin-secondary-button product-overview-export-button"
          onClick={() => openExportModal(scopeKey)}
          disabled={exportRows.length === 0}
        >
          엑셀로 내보내기
        </button>
        {shouldShowDepositCancelButton && (
          <button
            type="button"
            className="admin-secondary-button product-overview-deposit-cancel-button"
            onClick={() => openDepositCancelDialog(scopeKey)}
            disabled={!canVerifyDeposit || !canCancelSelectedDeposit || isCancellingDeposit}
            title={!canVerifyDeposit ? "입금완료 처리 권한이 없습니다." : ""}
          >
            입금완료 취소하기
          </button>
        )}
        <button
          type="button"
          className="admin-secondary-button"
          onClick={handleResetFilters}
          disabled={!hasActiveFilters}
        >
          필터 초기화
        </button>
        <button
          type="button"
          className="admin-danger-button product-overview-delete-selected-button"
          onClick={() => openSelectedDeleteDialog(scopeKey)}
          disabled={!hasSelectedRows || isDeletingSelectedRows}
        >
          선택 행 삭제하기
        </button>
      </div>
    );
  };

  const statusViewSectionsByKey = {
    purchase: {
      title: "구매완료",
      description: "리뷰완료가 아직 체크되지 않은 submission 목록입니다.",
      rows,
      countLabel: activeCountLabel,
      toolbar: (
        <div className="review-receive-section-toolbar product-overview-section-toolbar">
          {renderPurchaseActions("purchase")}
          {renderReviewVerifyActions("purchase")}
          {renderFilterResetAction("purchase")}
        </div>
      )
    },
    review: {
      title: "리뷰완료",
      description: "리뷰완료는 체크됐고 입금완료는 아직 체크되지 않은 submission 목록입니다.",
      rows,
      countLabel: activeCountLabel,
      toolbar: (
        <div className="review-receive-section-toolbar product-overview-section-toolbar">
          {renderReviewActions("review")}
          {renderFilterResetAction("review")}
        </div>
      )
    },
    complete: {
      title: "전체완료",
      description: "리뷰완료와 입금완료가 모두 체크된 submission 목록입니다.",
      rows,
      countLabel: activeCountLabel,
      toolbar: (
        <div className="review-receive-section-toolbar product-overview-section-toolbar">
          {renderFilterResetAction("complete")}
        </div>
      )
    }
  };
  const activeStatusSection = statusViewSectionsByKey[activeStatusTab] ?? statusViewSectionsByKey.purchase;

  return (
    <>
      <header className="admin-header">
        <div>
          <h1>상품전체보기</h1>
          <p>{currentViewHeaderText}</p>
        </div>
      </header>

      <section className="dashboard-panel product-overview-toolbar-panel" aria-label="상품전체보기 제어">
        <div className="product-overview-toolbar">
          <label className="pretty-checkbox admin-scope-toggle">
            <input type="checkbox" checked={includeCompanyData} onChange={handleIncludeCompanyDataChange} />
            <span className="checkmark" aria-hidden="true" />
            <span className="admin-scope-toggle-label">내 회사 데이터 포함</span>
          </label>
        </div>
        {isStatusView && (
          <div className="product-overview-status-tab-list">
            <StepTabList
              activeTab={activeStatusTab}
              onTabChange={setActiveStatusTab}
              tabs={PRODUCT_OVERVIEW_STATUS_TABS}
              ariaLabel="상품전체보기 상태 선택"
            />
          </div>
        )}
      </section>

      {isLoading && (
        <section className="dashboard-panel" aria-label="상품전체보기 로딩 상태">
          <p className="login-message">상품전체보기 데이터를 불러오는 중...</p>
        </section>
      )}

      {!isLoading && errorMessage && (
        <section className="dashboard-panel" aria-label="상품전체보기 오류 상태">
          <p className="login-error">{errorMessage}</p>
        </section>
      )}

      {!isLoading && !errorMessage && rows.length === 0 && (
        <section className="dashboard-panel" aria-label="상품전체보기 빈 상태">
          <p className="login-message">표시할 submission 데이터가 없습니다.</p>
        </section>
      )}

      {!isLoading && !errorMessage && rows.length > 0 && (
        <>
          {!isStatusView ? (
            <ProductOverviewSection
              title="전체보기"
              rows={rows}
              filters={filters}
              onFilterChange={handleFilterChange}
              onOpenPhotoViewer={openPhotoViewer}
              selectedSubmissionIds={selectedSubmissionIdSet}
              onToggleRowSelection={handleToggleRowSelection}
              onToggleAllSelection={handleToggleAllSelection}
              countLabel={activeCountLabel}
              selectionSummary={selectionSummary}
              isAllMatchingSelected={isAllMatchingSelected}
              isAllMatchingSelectionActive={isAllMatchingSelection}
              loadMoreRef={loadMoreTriggerRef}
              isLoadingMore={isLoadingMore}
              hasMore={pageInfo.hasMore}
              loadedCount={rows.length}
              totalCount={activeTotalCount}
              tableWrapClassName="is-viewport-scroll"
              toolbar={
                <div className="review-receive-section-toolbar product-overview-section-toolbar">
                  {renderPurchaseActions("all")}
                  {renderReviewVerifyActions("all")}
                  {renderReviewActions("all")}
                  {renderFilterResetAction("all")}
                </div>
              }
            />
          ) : (
            <ProductOverviewSection
              title={activeStatusSection.title}
              description={activeStatusSection.description}
              rows={activeStatusSection.rows}
              filters={filters}
              onFilterChange={handleFilterChange}
              onOpenPhotoViewer={openPhotoViewer}
              selectedSubmissionIds={selectedSubmissionIdSet}
              onToggleRowSelection={handleToggleRowSelection}
              onToggleAllSelection={handleToggleAllSelection}
              countLabel={activeStatusSection.countLabel}
              selectionSummary={selectionSummary}
              isAllMatchingSelected={isAllMatchingSelected}
              isAllMatchingSelectionActive={isAllMatchingSelection}
              loadMoreRef={loadMoreTriggerRef}
              isLoadingMore={isLoadingMore}
              hasMore={pageInfo.hasMore}
              loadedCount={rows.length}
              totalCount={activeTotalCount}
              tableWrapClassName="is-viewport-scroll"
              toolbar={activeStatusSection.toolbar}
            />
          )}
        </>
      )}

      {isPurchaseBulkModalOpen && (
        <div className="review-receive-modal-backdrop" role="presentation" {...purchaseBulkBackdropDismissProps}>
          <div
            className="review-receive-modal review-receive-purchase-bulk-modal"
            role="dialog"
            aria-modal="true"
            aria-label="구매정보 입력하기"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={purchaseBulkEnterConfirm.handleModalKeyDown}
          >
            <div className="review-receive-modal-header">
              <div>
                <h2>{isPurchaseBulkSelectionMode ? "선택한 행에 입력하기" : "구매정보 입력하기"}</h2>
                <p>
                  {isPurchaseBulkSelectionMode
                    ? "선택한 행 중 구매정보가 비어 있는 기존 행에만 순서대로 반영합니다."
                    : "배정명을 따로 입력하거나 각 줄 첫 칸에 배정명을 넣을 수 있습니다. 현재 화면의 빈 행에만 순서대로 반영합니다."}
                </p>
              </div>
              <button
                type="button"
                className="review-receive-modal-close"
                onClick={closePurchaseBulkModal}
                disabled={isApplyingPurchaseBulk}
              >
                닫기
              </button>
            </div>

            <div className="review-receive-modal-body">
              <div className="review-receive-bulk-fields">
                {!isPurchaseBulkSelectionMode && (
                  <input
                    className="review-receive-bulk-assign-input"
                    value={purchaseBulkAssignName}
                    onChange={(event) => {
                      setPurchaseBulkAssignName(event.target.value);
                      setPurchaseBulkMessage("");
                    }}
                    placeholder="배정명 (선택)"
                    aria-label="구매정보 입력 배정명"
                    disabled={isApplyingPurchaseBulk}
                  />
                )}
                <textarea
                  className="review-receive-bulk-textarea"
                  value={purchaseBulkText}
                  onChange={(event) => {
                    setPurchaseBulkText(event.target.value);
                    setPurchaseBulkMessage("");
                  }}
                  placeholder={
                    "탭 또는 / 로 구분해서 입력\n배정명\t주문번호\t구매자\t수취인\t구매계정\t연락처\t주소\t은행 계좌번호 입금주\t금액\t리뷰비(선택)\n또는\n배정명 / 주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 / 계좌번호 / 입금주 / 금액"
                  }
                  aria-label="구매정보 입력 텍스트"
                  disabled={isApplyingPurchaseBulk}
                />
              </div>

              <div className="review-receive-preview-panel">
                <div className="review-receive-preview-header">
                  <h3>미리보기</h3>
                  <p>{purchaseBulkPreview.message}</p>
                </div>

                {purchaseBulkPreview.status === "ready" && purchaseBulkPreview.parsedEntries.length > 0 ? (
                  <div className="review-receive-preview-list">
                    {purchaseBulkPreview.parsedEntries.map((entry, index) => {
                      const targetRow = purchaseBulkPreview.targetRows[index];
                      const targetProduct = productMap.get(targetRow?.product_id);

                      return (
                        <div key={`${targetRow?.submission_id ?? "preview"}-${index}`} className="review-receive-preview-item">
                          <div className="review-receive-preview-item-title">
                            <strong>{index + 1}번째 입력</strong>
                            <span>
                              {`${formatProductLabel(targetProduct)} / 배정 ${entry.assign_name || targetRow?.assign_name || "-"} / 주문 ${targetRow?.order_number ?? "-"}`}
                            </span>
                          </div>
                          <p>{`${entry.order_number} / ${entry.buyer_name} / ${entry.recipient_name}`}</p>
                          {entry.purchase_account && <p>{entry.purchase_account}</p>}
                          <p>{`${entry.contact} / ${entry.address}`}</p>
                          <p>{`${entry.bank_name} ${entry.bank_account} ${entry.account_holder} / ${entry.amount}`}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="review-receive-preview-empty">
                    <p>
                      {isPurchaseBulkSelectionMode
                        ? "선택한 행 중 입력 가능한 기존 행이 있으면 여기에서 어떤 행에 반영되는지 보여줍니다."
                        : "입력 가능한 기존 행이 있으면 여기에서 어떤 상품과 배정에 반영되는지 보여줍니다."}
                    </p>
                  </div>
                )}

                {purchaseBulkMessage && (
                  <p className={`review-receive-bulk-message is-${purchaseBulkMessageType}`}>{purchaseBulkMessage}</p>
                )}
              </div>
            </div>

            <div className="review-receive-modal-actions">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={closePurchaseBulkModal}
                disabled={isApplyingPurchaseBulk}
              >
                취소
              </button>
              <button
                type="button"
                className="admin-primary-button"
                onClick={handlePurchaseBulkApply}
                disabled={isApplyingPurchaseBulk || purchaseBulkPreview.status !== "ready" || purchaseBulkPreview.create_new_rows}
              >
                {isApplyingPurchaseBulk ? "입력 중..." : "완료하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {exportModal.isOpen && (
        <div className="review-receive-modal-backdrop" role="presentation" {...exportBackdropDismissProps}>
          <div
            className="review-receive-modal product-overview-export-modal"
            role="dialog"
            aria-modal="true"
            aria-label="상품전체보기 엑셀로 내보내기"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="review-receive-modal-header">
              <div>
                <h2>엑셀로 내보내기</h2>
                <p>{`${getProductOverviewExportScopeLabel(exportModal.scopeKey)} ${exportModalRows.length}건`}</p>
              </div>
              <button type="button" className="review-receive-modal-close" onClick={closeExportModal}>
                닫기
              </button>
            </div>

            <div className="review-receive-modal-body review-receive-modal-body-single">
              <div className="product-overview-export-column-panel">
                <label className="pretty-checkbox product-overview-export-select-all">
                  <input
                    type="checkbox"
                    checked={isAllExportColumnsSelected}
                    onChange={(event) => handleToggleAllExportColumns(event.target.checked)}
                  />
                  <span className="checkmark" aria-hidden="true" />
                  <span>전체 선택하기</span>
                </label>

                <div className="product-overview-export-column-grid">
                  {PRODUCT_OVERVIEW_EXPORT_COLUMNS.map((column) => (
                    <label key={column.key} className="pretty-checkbox product-overview-export-column-option">
                      <input
                        type="checkbox"
                        checked={exportSelectedColumnKeySet.has(column.key)}
                        onChange={(event) => handleToggleExportColumn(column.key, event.target.checked)}
                      />
                      <span className="checkmark" aria-hidden="true" />
                      <span>{column.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="review-receive-modal-actions">
              <button type="button" className="admin-secondary-button" onClick={closeExportModal}>
                취소
              </button>
              <button
                type="button"
                className="admin-primary-button"
                onClick={handleDownloadProductOverviewExcel}
                disabled={isExportingProductOverview || exportColumnKeys.length === 0 || exportModalRows.length === 0}
              >
                {isExportingProductOverview ? "다운로드 준비 중..." : "엑셀 다운로드"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isPurchaseAssignModalOpen && (
        <div className="review-receive-modal-backdrop" role="presentation" {...purchaseAssignBackdropDismissProps}>
          <div
            className="review-receive-modal"
            role="dialog"
            aria-modal="true"
            aria-label="구매자 일괄 입력"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={purchaseAssignEnterConfirm.handleModalKeyDown}
          >
            <div className="review-receive-modal-header">
              <div>
                <h2>구매자 일괄 입력</h2>
                <p>현재 화면에 보이는 행 기준으로 처리합니다. 여러 상품이 보이면 추가 대상 상품을 먼저 선택합니다.</p>
              </div>
              <button
                type="button"
                className="review-receive-modal-close"
                onClick={closePurchaseAssignModal}
                disabled={isApplyingPurchaseAssign}
              >
                닫기
              </button>
            </div>

            <div className="review-receive-modal-body">
              <div className="review-receive-bulk-fields">
                {purchaseAssignVisibleProducts.length > 1 && (
                  <select
                    className="table-cell-input"
                    value={resolvedPurchaseAssignProductId}
                    onChange={(event) => {
                      setPurchaseAssignTargetProductId(event.target.value);
                      setPurchaseAssignMessage("");
                    }}
                    disabled={isApplyingPurchaseAssign}
                    aria-label="구매자 일괄 입력 대상 상품"
                  >
                    <option value="">대상 상품 선택</option>
                    {purchaseAssignVisibleProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {formatProductLabel(product)}
                      </option>
                    ))}
                  </select>
                )}
                {purchaseAssignVisibleProducts.length === 1 && selectedPurchaseAssignProduct && (
                  <div className="detail-summary-item">
                    <span className="detail-summary-label">대상 상품</span>
                    <strong>{formatProductLabel(selectedPurchaseAssignProduct)}</strong>
                  </div>
                )}
                <textarea
                  className="review-receive-bulk-textarea"
                  value={purchaseAssignText}
                  onChange={(event) => {
                    setPurchaseAssignText(event.target.value);
                    setPurchaseAssignMessage("");
                  }}
                  placeholder={"이혜미\n김철수\n또는\n1 이혜미\n2 김철수"}
                  aria-label="구매자 일괄 입력 텍스트"
                  disabled={isApplyingPurchaseAssign}
                />
              </div>

              <div className="review-receive-preview-panel">
                <div className="review-receive-preview-header">
                  <h3>미리보기</h3>
                  <p>
                    {purchaseAssignPreview.errorMessage
                      ? purchaseAssignPreview.errorMessage
                      : purchaseAssignPreview.summaryMessage}
                  </p>
                </div>

                {purchaseAssignPreview.entries.length > 0 && !purchaseAssignPreview.errorMessage ? (
                  <div className="review-receive-preview-list">
                    {purchaseAssignPreview.entries.map((entry, index) => {
                      const targetProduct = entry.overwrite_target
                        ? productMap.get(entry.overwrite_target.product_id)
                        : selectedPurchaseAssignProduct;

                      return (
                        <div
                          key={`${entry.row_number ?? "append"}-${entry.assign_name}-${index}`}
                          className="review-receive-preview-item"
                        >
                          <div className="review-receive-preview-item-title">
                            <strong>{index + 1}번째 추가</strong>
                            <span>
                              {entry.has_explicit_row_number
                                ? `입력 순번 ${entry.row_number} / 배정 ${entry.assign_name}`
                                : `예상 순번 ${entry.append_row_number} / 배정 ${entry.assign_name}`}
                            </span>
                          </div>
                          <p>{`대상 상품 ${formatProductLabel(targetProduct)}`}</p>
                          {entry.has_explicit_row_number && entry.overwrite_target ? (
                            <p>
                              {`기존 순번 ${entry.row_number} / 현재 배정 ${entry.overwrite_target.assign_name || "-"} 와 겹칩니다. 완료 시 덮어쓰기 또는 ${entry.append_row_number}번부터 추가를 선택합니다.`}
                            </p>
                          ) : (
                            <p>{`실제 추가 시 ${entry.append_row_number}번부터 빈 값 상태로 생성됩니다.`}</p>
                          )}
                          <p>주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 계좌 / 금액은 모두 비어 있는 상태로 처리됩니다.</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="review-receive-preview-empty">
                    <p>입력 내용을 확인하면 여기에서 현재 화면 기준으로 처리될 목록을 보여줍니다.</p>
                  </div>
                )}

                {purchaseAssignMessage && (
                  <p className={`review-receive-bulk-message is-${purchaseAssignMessageType}`}>
                    {purchaseAssignMessage}
                  </p>
                )}
              </div>
            </div>

            <div className="review-receive-modal-actions">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={closePurchaseAssignModal}
                disabled={isApplyingPurchaseAssign}
              >
                취소
              </button>
              <button
                type="button"
                className="admin-primary-button"
                onClick={handlePurchaseAssignApply}
                disabled={
                  isApplyingPurchaseAssign ||
                  Boolean(purchaseAssignPreview.errorMessage) ||
                  purchaseAssignPreview.entries.length === 0
                }
              >
                {isApplyingPurchaseAssign ? "추가 중..." : "완료하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isReviewBatchModalOpen && (
        <div className="review-receive-modal-backdrop" role="presentation" {...reviewBatchBackdropDismissProps}>
          <div
            className="review-receive-modal"
            role="dialog"
            aria-modal="true"
            aria-label="리뷰완료 일괄처리"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={reviewBatchEnterConfirm.handleModalKeyDown}
          >
            <div className="review-receive-modal-header">
              <div>
                <h2>리뷰완료 일괄처리</h2>
                <p>
                  {reviewBatchSelectedRows.length > 0
                    ? "선택한 행 중 리뷰완료 상태인 행에만 입금일과 실제입금자명을 반영합니다."
                    : "현재 화면에서 보이는 리뷰완료 행에 입금일과 실제입금자명을 일괄 반영합니다."}
                </p>
              </div>
              <button
                type="button"
                className="review-receive-modal-close"
                onClick={closeReviewBatchModal}
                disabled={isApplyingReviewBatch}
              >
                닫기
              </button>
            </div>

            <div className="review-receive-modal-body review-receive-modal-body-single">
              <div className="review-receive-review-batch-fields">
                <div className="review-receive-review-batch-grid">
                  <div className="detail-summary-item">
                    <span className="detail-summary-label">입금일</span>
                    <input
                      type="date"
                      className="table-cell-input"
                      value={reviewBatchDepositedAt}
                      onChange={(event) => {
                        setReviewBatchDepositedAt(event.target.value);
                        setReviewBatchMessage("");
                      }}
                      disabled={isApplyingReviewBatch}
                    />
                  </div>
                  <div className="detail-summary-item">
                    <span className="detail-summary-label">실제입금자명 처리</span>
                    <select
                      className="table-cell-input"
                      value={reviewBatchActualDepositorMode}
                      onChange={(event) => {
                        setReviewBatchActualDepositorMode(event.target.value);
                        setReviewBatchMessage("");
                      }}
                      disabled={isApplyingReviewBatch}
                    >
                      <option value="planned">예정 입금자명으로 처리하기</option>
                      <option value="custom">직접입력하기</option>
                    </select>
                  </div>
                  {reviewBatchActualDepositorMode === "custom" && (
                    <div className="detail-summary-item">
                      <span className="detail-summary-label">직접 입력할 실제입금자명</span>
                      <input
                        className="table-cell-input"
                        value={reviewBatchActualDepositorName}
                        onChange={(event) => {
                          setReviewBatchActualDepositorName(event.target.value);
                          setReviewBatchMessage("");
                        }}
                        placeholder="실제입금자명"
                        disabled={isApplyingReviewBatch}
                      />
                    </div>
                  )}
                </div>

                <div className="review-receive-review-list-panel">
                  <div className="review-receive-preview-header">
                    <h3>리뷰완료 목록</h3>
                    <p>
                      {reviewBatchSelectedRows.length > 0
                        ? `선택한 행 기준으로 현재 ${reviewBatchTargetRows.length}건이 처리 대상입니다.`
                        : `현재 ${reviewBatchTargetRows.length}건이 일괄처리 대상입니다.`}
                    </p>
                  </div>

                  {reviewBatchTargetRows.length > 0 ? (
                    <div className="review-receive-preview-list">
                      {reviewBatchTargetRows.map((row, index) => (
                        <div key={row.submission_id} className="review-receive-preview-item">
                          <div className="review-receive-preview-item-title">
                            <strong>{index + 1}번째 대상</strong>
                            <span>{formatProductLabel(productMap.get(row.product_id))}</span>
                          </div>
                          <p>{`${row.assign_name || "-"} / ${row.order_number || "-"} / ${row.buyer_name || "-"}`}</p>
                          <p>{`${row.contact || "-"} / ${row.address || "-"}`}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="review-receive-preview-empty">
                      <p>
                        {reviewBatchSelectedRows.length > 0
                          ? "선택한 행 중 리뷰완료 일괄처리 대상이 없습니다."
                          : "현재 화면에서 리뷰완료 일괄처리 대상이 없습니다."}
                      </p>
                    </div>
                  )}

                  {reviewBatchMessage && (
                    <p className={`review-receive-bulk-message is-${reviewBatchMessageType}`}>{reviewBatchMessage}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="review-receive-modal-actions">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={closeReviewBatchModal}
                disabled={isApplyingReviewBatch}
              >
                취소
              </button>
              <button
                type="button"
                className="admin-primary-button"
                onClick={handleReviewBatchApply}
                disabled={!canVerifyDeposit || isApplyingReviewBatch || reviewBatchTargetRows.length === 0}
              >
                {isApplyingReviewBatch ? "처리 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      {purchaseAssignConflictDialog.isOpen && (
        <div
          className="review-receive-modal-backdrop review-receive-dialog-backdrop"
          role="presentation"
          {...purchaseAssignConflictBackdropDismissProps}
        >
          <div
            className="review-receive-modal review-receive-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="구매자 일괄 입력 충돌 확인"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="review-receive-dialog-content">
              {purchaseAssignConflictDialog.step === "conflict" ? (
                <>
                  <div className="review-receive-dialog-badge">순번 충돌</div>
                  <h2>기존 순번과 겹치는 입력이 있습니다.</h2>
                  <p>
                    {`입력한 순번 ${purchaseAssignConflictDialog.duplicatedNumbers}번이 이미 존재합니다. 덮어쓸지, ${purchaseAssignPositionMaps.maxRowNumber + 1}번부터 새로 추가할지 선택해주세요.`}
                  </p>
                  <div className="review-receive-dialog-actions">
                    <button
                      type="button"
                      className="admin-secondary-button"
                      onClick={() => closePurchaseAssignConflictDialog(null)}
                    >
                      취소하기
                    </button>
                    <button
                      type="button"
                      className="admin-secondary-button"
                      onClick={movePurchaseAssignConflictDialogToOverwriteStep}
                    >
                      덮어쓰기
                    </button>
                    <button
                      type="button"
                      className="admin-primary-button"
                      onClick={() => closePurchaseAssignConflictDialog("append")}
                    >
                      추가하기
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="review-receive-dialog-badge">덮어쓰기 방식</div>
                  <h2>덮어쓰기 방식을 선택해주세요.</h2>
                  <p>기존 순번 데이터를 비우고 새 배정명으로 넣을지, 다른 정보는 유지한 채 배정명만 바꿀지 선택합니다.</p>
                  <div className="review-receive-dialog-actions">
                    <button
                      type="button"
                      className="admin-secondary-button"
                      onClick={() => closePurchaseAssignConflictDialog(null)}
                    >
                      취소하기
                    </button>
                    <button
                      type="button"
                      className="admin-secondary-button"
                      onClick={() => closePurchaseAssignConflictDialog("overwrite-clear")}
                    >
                      정보를 지우고 추가하기
                    </button>
                    <button
                      type="button"
                      className="admin-primary-button"
                      onClick={() => closePurchaseAssignConflictDialog("overwrite-rename-only")}
                    >
                      이름만 바꾸기
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <AppAlertDialog
        {...purchaseBulkEnterConfirm.confirmDialogProps}
      />

      <AppAlertDialog
        {...purchaseAssignEnterConfirm.confirmDialogProps}
      />

      <AppAlertDialog
        {...reviewBatchEnterConfirm.confirmDialogProps}
      />

      <AppAlertDialog
        isOpen={reviewVerifyConfirmDialog.isOpen}
        badgeLabel={reviewVerifyConfirmDialog.missingLabels.length > 0 ? "빈 항목 확인" : "처리 확인"}
        title={
          reviewVerifyConfirmDialog.missingLabels.length > 0
            ? "비어 있는 항목이 있습니다."
            : "리뷰완료 처리 하시겠습니까?"
        }
        cancelLabel="취소하기"
        confirmLabel={reviewVerifyConfirmDialog.missingLabels.length > 0 ? "무시하고 처리하기" : "처리하기"}
        busyConfirmLabel="처리 중..."
        isBusy={isApplyingReviewVerify}
        onCancel={closeReviewVerifyConfirmDialog}
        onConfirm={confirmReviewVerifyApply}
        ariaLabel="상품전체보기 리뷰완료 처리 확인"
      >
        {reviewVerifyConfirmDialog.missingLabels.length > 0 ? (
          <p>
            <strong>{formatMissingFieldLabels(reviewVerifyConfirmDialog.missingLabels)}</strong> 칸이 비어있습니다.
            리뷰완료 처리 하시겠습니까?
          </p>
        ) : (
          <p>선택한 행을 리뷰완료로 처리합니다.</p>
        )}
      </AppAlertDialog>

      <AppAlertDialog
        isOpen={reviewBatchConfirmDialog.isOpen}
        badgeLabel="빈 항목 확인"
        title="비어 있는 항목이 있습니다."
        cancelLabel="취소하기"
        confirmLabel="무시하고 처리하기"
        busyConfirmLabel="처리 중..."
        isBusy={isApplyingReviewBatch}
        onCancel={closeReviewBatchConfirmDialog}
        onConfirm={confirmReviewBatchApply}
        ariaLabel="상품전체보기 입금완료 처리 확인"
      >
        <p>
          <strong>{formatMissingFieldLabels(reviewBatchConfirmDialog.missingLabels)}</strong> 칸이 비어있습니다. 입금완료
          처리 하시겠습니까?
        </p>
      </AppAlertDialog>

      <AppAlertDialog
        isOpen={depositCancelTargetRows.length > 0}
        variant="danger"
        badgeLabel="입금완료 취소"
        title="입금완료를 취소할까요?"
        cancelLabel="취소"
        confirmLabel="확인"
        busyConfirmLabel="처리 중..."
        isBusy={isCancellingDeposit}
        onCancel={closeDepositCancelDialog}
        onConfirm={handleDepositCancelApply}
        confirmButtonClassName="admin-danger-button"
        ariaLabel="상품전체보기 입금완료 취소 확인"
      >
        <p>
          선택한 <strong>{depositCancelTargetRows.length}건</strong>의 입금일을 삭제하고 입금완료를 아니오로
          바꿉니다. 입력한 사유는 실제입금자명에 저장됩니다.
        </p>
        <label className="product-overview-deposit-cancel-field">
          <span className="detail-summary-label">입금취소사유</span>
          <input
            className="table-cell-input product-overview-deposit-cancel-reason"
            value={depositCancelReason}
            onChange={(event) => {
              setDepositCancelReason(event.target.value);
              setDepositCancelMessage("");
            }}
            placeholder="입금취소사유"
            disabled={isCancellingDeposit}
            autoFocus
          />
        </label>
        {depositCancelMessage && <p className="login-error">{depositCancelMessage}</p>}
      </AppAlertDialog>

      <AppAlertDialog
        isOpen={selectedDeleteTargetRows.length > 0}
        variant="danger"
        badgeLabel="삭제 확인"
        title="선택한 행을 삭제할까요?"
        cancelLabel="취소"
        confirmLabel="삭제하기"
        busyConfirmLabel="삭제 중..."
        isBusy={isDeletingSelectedRows}
        onCancel={closeSelectedDeleteDialog}
        onConfirm={handleDeleteSelectedRows}
        confirmButtonClassName="admin-danger-button"
        ariaLabel="상품전체보기 선택 행 삭제 확인"
      >
        <p>
          선택한 <strong>{selectedDeleteTargetRows.length}건</strong>의 제출 데이터와 연결된 증빙 사진 데이터가 함께
          삭제됩니다. 이 작업은 되돌릴 수 없습니다.
        </p>
      </AppAlertDialog>

      <PhotoViewerModal
        photoViewer={photoViewer}
        onClose={closePhotoViewer}
        onNext={showNextPhoto}
        onPrev={showPrevPhoto}
        onRequestDelete={openDeletePhotoDialog}
        isDeleting={isDeletingPhoto}
      />

      <AppAlertDialog
        isOpen={Boolean(deleteTargetPhoto)}
        variant="danger"
        badgeLabel="사진 삭제"
        title="이 사진을 삭제할까요?"
        cancelLabel="취소"
        confirmLabel="삭제하기"
        busyConfirmLabel="삭제 중..."
        isBusy={isDeletingPhoto}
        onCancel={closeDeletePhotoDialog}
        onConfirm={handleDeletePhoto}
        confirmButtonClassName="admin-danger-button"
        ariaLabel="상품전체보기 증빙 사진 삭제 확인"
      >
        <p>확대 화면과 목록에서 해당 증빙 사진이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
      </AppAlertDialog>

      <AppToast toast={toast} />
    </>
  );
}
