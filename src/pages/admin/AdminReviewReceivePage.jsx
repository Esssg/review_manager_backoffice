import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import StepTabList from "../../components/admin/product-detail/StepTabList";
import AppAlertDialog from "../../components/common/AppAlertDialog";
import AppToast from "../../components/common/AppToast";
import { useAppToast } from "../../hooks/useAppToast";
import { useBackdropDismiss } from "../../hooks/useBackdropDismiss";
import { useModalEnterConfirm } from "../../hooks/useModalEnterConfirm";
import {
  ADMIN_INCLUDE_COMPANY_DATA_STORAGE_KEY,
  ADMIN_STORAGE_KEY,
  PRODUCT_DEPOSIT_PARTY_OPTIONS,
  buildProductDepositGb,
  getProductDepositGbPartLabels,
  getProductDepositGbPartValues,
  REVIEW_RECEIVE_STATUS_TABS
} from "../../constants/admin";
import {
  createAdminReviewReceiveProduct,
  deleteAdminReviewReceiveProduct,
  fetchAdminReviewReceiveProducts,
  updateAdminReviewReceiveProduct
} from "../../services/adminProducts";
import { createReviewReceiveSubmission } from "../../services/reviewReceive";
import {
  normalizeProductReviewerRowForSave,
  parseProductReviewerBulkInput
} from "../../utils/reviewReceiveProductReviewerBulkInput";
import { sortReviewReceiveRowsByCreatedAt, splitReviewReceiveRows } from "../../utils/reviewReceiveRows";

function normalizeOptionalValue(value) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function formatDateInputValue(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 10);
}

function formatDisplayDate(value) {
  const inputValue = formatDateInputValue(value);

  if (!inputValue) {
    return "-";
  }

  return new Date(`${inputValue}T00:00:00`).toLocaleDateString("ko-KR");
}

function createInitialProductForm() {
  return {
    title: "",
    productDate: formatDateInputValue(new Date()),
    productName: "",
    companyName: "",
    optionName: "",
    reviewType: "",
    plannedDepositorName: "",
    productFeeDepositGb: PRODUCT_DEPOSIT_PARTY_OPTIONS[0].value,
    reviewFeeDepositGb: PRODUCT_DEPOSIT_PARTY_OPTIONS[0].value,
    description: ""
  };
}

function createInitialProductReviewerBulkState() {
  return {
    step: "input",
    text: "",
    productForm: createInitialProductForm(),
    reviewers: [],
    message: "",
    messageType: "info"
  };
}

const PRODUCT_REVIEWER_REVIEWER_FIELDS = [
  { key: "assign_name", label: "배정", minWidth: 96 },
  { key: "order_number", label: "주문번호", minWidth: 132 },
  { key: "buyer_name", label: "구매자", minWidth: 96 },
  { key: "recipient_name", label: "수취인", minWidth: 96 },
  { key: "purchase_account", label: "아이디", minWidth: 180 },
  { key: "contact", label: "연락처", minWidth: 132 },
  { key: "address", label: "주소", minWidth: 260 },
  { key: "bank_name", label: "은행", minWidth: 100 },
  { key: "bank_account", label: "계좌번호", minWidth: 160 },
  { key: "account_holder", label: "예금주", minWidth: 110 },
  { key: "amount", label: "금액", minWidth: 100 },
  { key: "review_fee", label: "리뷰비", minWidth: 100 },
  { key: "actual_depositor_name", label: "실제입금자", minWidth: 120 }
];

function getProductFormFromProduct(product) {
  const depositGbParts = getProductDepositGbPartValues(product.deposit_GB);

  return {
    title: product.title ?? "",
    productDate: formatDateInputValue(product.product_date ?? product.created_at),
    productName: product.product_name ?? "",
    companyName: product.company_name ?? "",
    optionName: product.option_name ?? "",
    reviewType: product.review_type ?? "",
    plannedDepositorName: product.planned_depositor_name ?? "",
    productFeeDepositGb: depositGbParts.productFee,
    reviewFeeDepositGb: depositGbParts.reviewFee,
    description: product.description ?? ""
  };
}

function getProductPayload(productForm, adminId) {
  const title = productForm.title.trim();
  const productName = productForm.productName.trim();
  const productDate = productForm.productDate.trim();

  if (!title || !productName) {
    return {
      errorMessage: "상품 제목과 품명은 필수입니다."
    };
  }

  if (!productDate) {
    return {
      errorMessage: "등록날짜는 필수입니다."
    };
  }

  return {
    payload: {
      manager_id: adminId,
      title,
      product_date: productDate,
      product_name: productName,
      description: normalizeOptionalValue(productForm.description),
      company_name: normalizeOptionalValue(productForm.companyName),
      option_name: normalizeOptionalValue(productForm.optionName),
      review_type: normalizeOptionalValue(productForm.reviewType),
      planned_depositor_name: normalizeOptionalValue(productForm.plannedDepositorName),
      deposit_GB: buildProductDepositGb(productForm.productFeeDepositGb, productForm.reviewFeeDepositGb)
    }
  };
}

function getReviewReceiveProductStatus(product) {
  const submissions = Array.isArray(product?.submissions) ? product.submissions : [];

  if (submissions.length > 0 && submissions.every((submission) => submission.is_deposit_verified === true)) {
    return "completed";
  }

  return "in_progress";
}

function getReviewReceiveSubmissionSummary(product) {
  const submissions = Array.isArray(product?.submissions) ? product.submissions : [];
  const { purchaseRows, reviewRows, completeRows } = splitReviewReceiveRows(submissions);

  return `${purchaseRows.length}/${reviewRows.length}/${completeRows.length}/(총 ${submissions.length}개)`;
}

function buildReviewVerifiedClipboardText(product) {
  const sortedSubmissions = sortReviewReceiveRowsByCreatedAt(
    Array.isArray(product?.submissions) ? product.submissions : []
  );

  return {
    count: sortedSubmissions.length,
    text: sortedSubmissions.map((submission) => (submission.is_review_verified ? "TRUE" : "FALSE")).join("\n")
  };
}

function getReviewReceiveStatusPath(statusKey) {
  if (statusKey === "in_progress") {
    return "/admin/review-receive/in-progress";
  }

  if (statusKey === "completed") {
    return "/admin/review-receive/completed";
  }

  return "/admin/review-receive/all";
}

function getPublicReviewReceiveUrl(productId) {
  const publicPath = `/review-receive/specific/${productId}`;

  if (typeof window === "undefined") {
    return publicPath;
  }

  return `${window.location.origin}${publicPath}`;
}

const REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS = [
  { key: "manager_id", label: "담당자", type: "text" },
  { key: "title", label: "상품 제목", type: "text" },
  { key: "company_name", label: "업체명", type: "text" },
  { key: "product_name", label: "품명", type: "text" },
  { key: "option_name", label: "옵션", type: "text" },
  { key: "review_type", label: "리뷰형태", type: "text" },
  { key: "description", label: "설명", type: "text" },
  { key: "product_fee_deposit_GB", label: "제품비 입금구분", type: "text" },
  { key: "review_fee_deposit_GB", label: "리뷰비 입금구분", type: "text" },
  { key: "registered_date", label: "등록일", type: "dateRange" }
];

function createEmptyReviewReceiveProductFilters() {
  return REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS.reduce((filters, column) => {
    filters[column.key] = column.type === "dateRange" ? { start: "", end: "" } : "";
    return filters;
  }, {});
}

function getReviewReceiveProductFilterValue(product, columnKey) {
  if (columnKey === "product_fee_deposit_GB") {
    return getProductDepositGbPartLabels(product.deposit_GB).productFee;
  }

  if (columnKey === "review_fee_deposit_GB") {
    return getProductDepositGbPartLabels(product.deposit_GB).reviewFee;
  }

  if (columnKey === "registered_date") {
    return formatDateInputValue(product.product_date ?? product.created_at);
  }

  return product[columnKey] ?? "";
}

function normalizeReviewReceiveFilterText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s./\\|_-]+/g, "");
}

function hasActiveReviewReceiveProductFilters(filters) {
  return REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS.some((column) => {
    const value = filters[column.key];

    if (column.type === "dateRange") {
      return Boolean(value?.start || value?.end);
    }

    return String(value ?? "").trim() !== "";
  });
}

function filterReviewReceiveProducts(products, filters) {
  return products.filter((product) =>
    REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS.every((column) => {
      const filterValue = filters[column.key];

      if (column.type === "dateRange") {
        const productDate = getReviewReceiveProductFilterValue(product, column.key);
        const startDate = filterValue?.start || "";
        const endDate = filterValue?.end || "";

        if (!startDate && !endDate) {
          return true;
        }

        if (!productDate) {
          return false;
        }

        if (startDate && productDate < startDate) {
          return false;
        }

        if (endDate && productDate > endDate) {
          return false;
        }

        return true;
      }

      const searchText = normalizeReviewReceiveFilterText(filterValue);

      if (!searchText) {
        return true;
      }

      return normalizeReviewReceiveFilterText(getReviewReceiveProductFilterValue(product, column.key)).includes(searchText);
    })
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M2 3h12l-4.7 5.4v3.2L6.7 13V8.4L2 3Z" fill="currentColor" />
    </svg>
  );
}

function ReviewReceiveProductFilterHeader({
  column,
  filterValue,
  isOpen,
  onOpenChange,
  onFilterChange,
  onFilterReset,
  menuRef
}) {
  const isDateRange = column.type === "dateRange";
  const isActive = isDateRange ? Boolean(filterValue?.start || filterValue?.end) : String(filterValue ?? "").trim() !== "";
  const handleTextFilterInput = (event) => {
    onFilterChange(column.key, event.currentTarget.value);
  };

  return (
    <th
      className={`review-receive-filterable-header${isDateRange ? " is-date-range" : ""}${isOpen ? " is-open" : ""}${isActive ? " is-filtered" : ""}`}
    >
      <div className="review-receive-column-filter" ref={isOpen ? menuRef : null}>
        <span className="review-receive-column-label">{column.label}</span>
        <button
          type="button"
          className="review-receive-column-filter-button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenChange(isOpen ? "" : column.key);
          }}
          aria-label={`${column.label} 필터 열기`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          <FilterIcon />
        </button>
        {isOpen && (
          <div className="review-receive-column-filter-popover" role="dialog" aria-label={`${column.label} 필터`}>
            <div className="review-receive-column-filter-title">{column.label} 필터</div>
            {isDateRange ? (
              <div className="review-receive-date-filter-fields">
                <label>
                  <span>시작일</span>
                  <input
                    type="date"
                    className="table-cell-input"
                    value={filterValue?.start ?? ""}
                    onChange={(event) =>
                      onFilterChange(column.key, {
                        ...(filterValue ?? { start: "", end: "" }),
                        start: event.target.value
                      })
                    }
                  />
                </label>
                <label>
                  <span>종료일</span>
                  <input
                    type="date"
                    className="table-cell-input"
                    value={filterValue?.end ?? ""}
                    onChange={(event) =>
                      onFilterChange(column.key, {
                        ...(filterValue ?? { start: "", end: "" }),
                        end: event.target.value
                      })
                    }
                  />
                </label>
              </div>
            ) : (
              <input
                type="text"
                className="table-cell-input"
                value={filterValue ?? ""}
                onInput={handleTextFilterInput}
                onChange={handleTextFilterInput}
                placeholder={`${column.label} 검색`}
                autoFocus
              />
            )}
            <div className="review-receive-column-filter-actions">
              <button type="button" className="admin-secondary-button" onClick={() => onFilterReset(column.key)}>
                초기화
              </button>
              <button type="button" className="admin-primary-button" onClick={() => onOpenChange("")}>
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </th>
  );
}

export default function AdminReviewReceivePage({ viewMode = "all" }) {
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [productFilters, setProductFilters] = useState(createEmptyReviewReceiveProductFilters);
  const [openProductFilterKey, setOpenProductFilterKey] = useState("");
  const [includeCompanyData, setIncludeCompanyData] = useState(
    () => localStorage.getItem(ADMIN_INCLUDE_COMPANY_DATA_STORAGE_KEY) === "true"
  );
  const [scopeInfo, setScopeInfo] = useState({
    companyName: null,
    isCompanyScopeAvailable: false
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteTargetProduct, setDeleteTargetProduct] = useState(null);
  const [activeActionProductId, setActiveActionProductId] = useState(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [actionProductId, setActionProductId] = useState(null);
  const [productModalErrorMessage, setProductModalErrorMessage] = useState("");
  const [productForm, setProductForm] = useState(() => createInitialProductForm());
  const [isProductReviewerBulkModalOpen, setIsProductReviewerBulkModalOpen] = useState(false);
  const [productReviewerBulk, setProductReviewerBulk] = useState(() => createInitialProductReviewerBulkState());
  const [isSavingProductReviewerBulk, setIsSavingProductReviewerBulk] = useState(false);
  const productFormRef = useRef(null);
  const productFilterRef = useRef(null);
  const { toast, showToast } = useAppToast();
  const productModalEnterConfirm = useModalEnterConfirm({
    isOpen: isProductModalOpen,
    isDisabled: isSavingProduct,
    actionLabel: editingProduct ? "상품 수정" : "상품 추가",
    confirmButtonLabel: editingProduct ? "상품 수정하기" : "상품 추가하기",
    onConfirm: () => productFormRef.current?.requestSubmit()
  });

  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error, scope } = await fetchAdminReviewReceiveProducts(adminId, { includeCompanyData });

      setScopeInfo({
        companyName: scope?.companyName ?? null,
        isCompanyScopeAvailable: scope?.isCompanyScopeAvailable ?? false
      });

      if (error) {
        setErrorMessage(error.message);
        setProducts([]);
      } else {
        setProducts(data ?? []);
      }

      setIsLoading(false);
    };

    loadProducts();
  }, [adminId, includeCompanyData]);

  useEffect(() => {
    if (!openProductFilterKey) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!productFilterRef.current?.contains(event.target)) {
        setOpenProductFilterKey("");
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpenProductFilterKey("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openProductFilterKey]);

  const scopeMessage = includeCompanyData
    ? scopeInfo.companyName
      ? `현재 계정과 같은 회사(${scopeInfo.companyName}) 소속 관리자 데이터까지 함께 표시합니다.`
      : "현재 계정에 회사 정보가 없어 내 계정 데이터만 표시합니다."
    : "현재 로그인한 계정의 데이터만 표시합니다.";

  const viewFilteredProducts = products.filter((product) => {
    if (viewMode === "all") {
      return true;
    }

    return getReviewReceiveProductStatus(product) === viewMode;
  });
  const filteredProducts = filterReviewReceiveProducts(viewFilteredProducts, productFilters);
  const hasActiveProductFilters = hasActiveReviewReceiveProductFilters(productFilters);

  const statusSummaryText =
    viewMode === "completed"
      ? "모든 submission의 입금완료체크가 true인 상품만 표시합니다."
      : viewMode === "in_progress"
        ? "submission이 없거나, 입금완료체크가 하나라도 false인 상품을 표시합니다."
        : "전체 상품 리스트를 표시합니다.";

  const openCreateModal = () => {
    setProductModalErrorMessage("");
    setEditingProduct(null);
    setProductForm(createInitialProductForm());
    setIsProductModalOpen(true);
  };

  const openEditModal = (product) => {
    setProductModalErrorMessage("");
    setActiveActionProductId(null);
    setEditingProduct(product);
    setProductForm(getProductFormFromProduct(product));
    setIsProductModalOpen(true);
  };

  const handleCopyPublicUrl = async (product) => {
    setActiveActionProductId(null);

    try {
      await navigator.clipboard.writeText(getPublicReviewReceiveUrl(product.id));
      showToast("리뷰받기 공개 URL을 클립보드에 복사했습니다.", "success");
    } catch {
      showToast("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.", "error");
    }
  };

  const handleCopyReviewVerifiedRows = async (product) => {
    setActiveActionProductId(null);

    const { count, text } = buildReviewVerifiedClipboardText(product);

    if (count === 0) {
      showToast("복사할 리뷰작성 데이터가 없습니다.", "info");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast(`리뷰작성완료 ${count}건을 클립보드에 복사했습니다.`, "success");
    } catch {
      showToast("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.", "error");
    }
  };

  const closeProductModal = () => {
    if (isSavingProduct) {
      return;
    }

    setProductModalErrorMessage("");
    setEditingProduct(null);
    setProductForm(createInitialProductForm());
    setIsProductModalOpen(false);
  };
  const productModalBackdropDismissProps = useBackdropDismiss(closeProductModal);

  const closeProductReviewerBulkModal = () => {
    if (isSavingProductReviewerBulk) {
      return;
    }

    setProductReviewerBulk(createInitialProductReviewerBulkState());
    setIsProductReviewerBulkModalOpen(false);
  };
  const productReviewerBulkBackdropDismissProps = useBackdropDismiss(closeProductReviewerBulkModal);

  const openProductReviewerBulkModal = () => {
    setProductReviewerBulk(createInitialProductReviewerBulkState());
    setIsProductReviewerBulkModalOpen(true);
  };

  const handleProductFormChange = (event) => {
    const { name, value } = event.target;

    setProductForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const setProductReviewerBulkMessage = (message, type = "info") => {
    setProductReviewerBulk((prev) => ({
      ...prev,
      message,
      messageType: type
    }));
  };

  const handleProductReviewerBulkTextChange = (event) => {
    setProductReviewerBulk((prev) => ({
      ...prev,
      text: event.target.value,
      message: "",
      messageType: "info"
    }));
  };

  const handleProductReviewerBulkProductChange = (event) => {
    const { name, value } = event.target;

    setProductReviewerBulk((prev) => ({
      ...prev,
      productForm: {
        ...prev.productForm,
        [name]: value
      },
      message: "",
      messageType: "info"
    }));
  };

  const handleProductReviewerBulkRowChange = (clientId, field, value) => {
    setProductReviewerBulk((prev) => ({
      ...prev,
      reviewers: prev.reviewers.map((row) => (row.clientId === clientId ? { ...row, [field]: value } : row)),
      message: "",
      messageType: "info"
    }));
  };

  const handleProductReviewerBulkParse = () => {
    try {
      const parsed = parseProductReviewerBulkInput(productReviewerBulk.text);

      setProductReviewerBulk((prev) => ({
        ...prev,
        step: "product",
        productForm: {
          ...createInitialProductForm(),
          ...parsed.productForm
        },
        reviewers: parsed.reviewers,
        message: `${parsed.reviewers.length}명의 리뷰어를 확인했습니다. 상품 정보를 수정한 뒤 다음으로 진행하세요.`,
        messageType: "success"
      }));
    } catch (error) {
      setProductReviewerBulkMessage(error.message || "상품/리뷰어 일괄 입력 형식을 확인해주세요.", "error");
    }
  };

  const handleProductReviewerBulkProductNext = () => {
    const { errorMessage: validationErrorMessage } = getProductPayload(productReviewerBulk.productForm, adminId);

    if (validationErrorMessage) {
      setProductReviewerBulkMessage(validationErrorMessage, "error");
      return;
    }

    if (productReviewerBulk.reviewers.length === 0) {
      setProductReviewerBulkMessage("등록할 리뷰어 행이 없습니다.", "error");
      return;
    }

    setProductReviewerBulk((prev) => ({
      ...prev,
      step: "reviewers",
      message: "리뷰어 정보를 칸별로 수정한 뒤 완료하기를 눌러주세요.",
      messageType: "info"
    }));
  };

  const handleProductReviewerBulkSave = async () => {
    if (!adminId) {
      setProductReviewerBulkMessage("로그인 정보가 없습니다. 다시 로그인해주세요.", "error");
      return;
    }

    const { payload, errorMessage: validationErrorMessage } = getProductPayload(productReviewerBulk.productForm, adminId);

    if (validationErrorMessage) {
      setProductReviewerBulkMessage(validationErrorMessage, "error");
      return;
    }

    let reviewerPayloads;

    try {
      reviewerPayloads = productReviewerBulk.reviewers.map((row, index) => normalizeProductReviewerRowForSave(row, index + 1));
    } catch (error) {
      setProductReviewerBulkMessage(error.message || "리뷰어 정보를 확인해주세요.", "error");
      return;
    }

    setIsSavingProductReviewerBulk(true);
    setProductReviewerBulkMessage("");

    const productResult = await createAdminReviewReceiveProduct(payload);

    if (productResult.error || !productResult.data) {
      setProductReviewerBulkMessage(productResult.error?.message || "상품 저장 결과를 확인하지 못했습니다.", "error");
      setIsSavingProductReviewerBulk(false);
      return;
    }

    const createdSubmissions = [];

    for (let index = 0; index < reviewerPayloads.length; index += 1) {
      const submissionResult = await createReviewReceiveSubmission({
        product_id: productResult.data.id,
        ...reviewerPayloads[index]
      });

      if (submissionResult.error) {
        const productWithPartialSubmissions = {
          ...productResult.data,
          submissions: createdSubmissions
        };

        setProducts((prev) => [productWithPartialSubmissions, ...prev]);
        setProductReviewerBulkMessage(
          `상품은 생성됐지만 ${index + 1}번째 리뷰어 저장 중 오류가 발생했습니다. ${createdSubmissions.length}건만 반영되었습니다.`,
          "error"
        );
        setIsSavingProductReviewerBulk(false);
        return;
      }

      createdSubmissions.push(submissionResult.data);
    }

    setProducts((prev) => [
      {
        ...productResult.data,
        submissions: createdSubmissions
      },
      ...prev
    ]);
    showToast(`상품 1건과 리뷰어 ${createdSubmissions.length}건을 등록했습니다.`, "success");
    setProductReviewerBulk(createInitialProductReviewerBulkState());
    setIsProductReviewerBulkModalOpen(false);
    setIsSavingProductReviewerBulk(false);
  };

  const handleProductFormSubmit = async (event) => {
    event.preventDefault();

    if (!adminId) {
      setProductModalErrorMessage("로그인 정보가 없습니다. 다시 로그인해주세요.");
      return;
    }

    const { payload, errorMessage: validationErrorMessage } = getProductPayload(productForm, adminId);

    if (validationErrorMessage) {
      setProductModalErrorMessage(validationErrorMessage);
      return;
    }

    setIsSavingProduct(true);
    setProductModalErrorMessage("");

    const { data, error } = editingProduct
      ? await updateAdminReviewReceiveProduct(editingProduct.id, adminId, payload, { includeCompanyData })
      : await createAdminReviewReceiveProduct(payload);

    if (error) {
      setProductModalErrorMessage(error.message);
      setIsSavingProduct(false);
      return;
    }

    if (!data) {
      setProductModalErrorMessage("상품 저장 결과를 확인하지 못했습니다. 다시 시도해주세요.");
      setIsSavingProduct(false);
      return;
    }

    setProducts((prev) => {
      if (editingProduct) {
        return prev.map((product) =>
          product.id === editingProduct.id ? { ...data, submissions: product.submissions ?? [] } : product
        );
      }

      return [data, ...prev];
    });
    showToast(editingProduct ? "리뷰받기 상품을 수정했습니다." : "리뷰받기 상품을 추가했습니다.", "success");
    setEditingProduct(null);
    setProductForm(createInitialProductForm());
    setIsProductModalOpen(false);
    setIsSavingProduct(false);
  };

  const openDeleteDialog = (product) => {
    setActiveActionProductId(null);
    setDeleteTargetProduct(product);
  };

  const closeDeleteDialog = () => {
    if (actionProductId) {
      return;
    }

    setDeleteTargetProduct(null);
  };

  const handleDeleteProduct = async () => {
    if (!deleteTargetProduct) {
      return;
    }

    const product = deleteTargetProduct;

    setActionProductId(product.id);

    const { error } = await deleteAdminReviewReceiveProduct(product.id, adminId, { includeCompanyData });

    if (error) {
      showToast(error.message, "error");
      setActionProductId(null);
      return;
    }

    setProducts((prev) => prev.filter((item) => item.id !== product.id));
    showToast("리뷰받기 상품을 삭제했습니다.", "success");
    setDeleteTargetProduct(null);
    setActionProductId(null);
  };

  const handleIncludeCompanyDataChange = (event) => {
    const nextChecked = event.target.checked;

    setIncludeCompanyData(nextChecked);
    localStorage.setItem(ADMIN_INCLUDE_COMPANY_DATA_STORAGE_KEY, String(nextChecked));
  };

  const handleProductFilterChange = (columnKey, value) => {
    setProductFilters((prev) => ({
      ...prev,
      [columnKey]: value
    }));
  };

  const handleProductFilterReset = (columnKey) => {
    const column = REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS.find((item) => item.key === columnKey);

    setProductFilters((prev) => ({
      ...prev,
      [columnKey]: column?.type === "dateRange" ? { start: "", end: "" } : ""
    }));
  };

  return (
    <>
      <header className="admin-header">
        <div>
          <h1>리뷰받기</h1>
          <p>{statusSummaryText}</p>
          <p className="admin-scope-toggle-hint">{scopeMessage}</p>
        </div>
        <div className="admin-header-actions">
          <label className="pretty-checkbox admin-scope-toggle">
            <input type="checkbox" checked={includeCompanyData} onChange={handleIncludeCompanyDataChange} />
            <span className="checkmark" aria-hidden="true" />
            <span className="admin-scope-toggle-label">내 회사 데이터 포함</span>
          </label>
          <button type="button" className="admin-secondary-button" onClick={openProductReviewerBulkModal}>
            상품/리뷰어 일괄 입력하기
          </button>
          <button type="button" className="admin-primary-button" onClick={openCreateModal}>
            상품 추가하기
          </button>
        </div>
      </header>

      <section className="dashboard-panel review-receive-product-list-panel" aria-label="리뷰받기 상품 목록">
        <div className="product-overview-status-tab-list">
          <StepTabList
            activeTab={viewMode}
            onTabChange={(nextTab) => navigate(getReviewReceiveStatusPath(nextTab))}
            tabs={REVIEW_RECEIVE_STATUS_TABS}
            ariaLabel="리뷰받기 상태 선택"
          />
        </div>
        {isLoading && <p className="login-message">리뷰받기 상품 데이터를 불러오는 중...</p>}
        {!isLoading && errorMessage && <p className="login-error">{errorMessage}</p>}
        {!isLoading && !errorMessage && (
          <div className="review-receive-product-list-scroll">
            <table>
              <thead>
                <tr>
                  {REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS.map((column) => (
                    <ReviewReceiveProductFilterHeader
                      key={column.key}
                      column={column}
                      filterValue={productFilters[column.key]}
                      isOpen={openProductFilterKey === column.key}
                      onOpenChange={setOpenProductFilterKey}
                      onFilterChange={handleProductFilterChange}
                      onFilterReset={handleProductFilterReset}
                      menuRef={productFilterRef}
                    />
                  ))}
                  <th className="review-receive-summary-column">완료현황</th>
                  <th className="review-receive-actions-column">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS.length + 2}>
                      {products.length === 0
                        ? "등록된 리뷰받기 상품이 없습니다."
                        : hasActiveProductFilters
                          ? "선택한 필터 조건에 맞는 리뷰받기 상품이 없습니다."
                          : "선택한 보기 조건에 맞는 리뷰받기 상품이 없습니다."}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="clickable-row"
                      onClick={() => navigate(`/admin/review-receive/specific/${product.id}`)}
                    >
                      <td>{product.manager_id ?? "-"}</td>
                      <td>{product.title ?? "-"}</td>
                      <td>{product.company_name ?? "-"}</td>
                      <td>{product.product_name ?? "-"}</td>
                      <td>{product.option_name ?? "-"}</td>
                      <td>{product.review_type ?? "-"}</td>
                      <td>{product.description ?? "-"}</td>
                      <td>{getProductDepositGbPartLabels(product.deposit_GB).productFee}</td>
                      <td>{getProductDepositGbPartLabels(product.deposit_GB).reviewFee}</td>
                      <td>{formatDisplayDate(product.product_date ?? product.created_at)}</td>
                      <td className="review-receive-summary-cell">{getReviewReceiveSubmissionSummary(product)}</td>
                      <td className="review-receive-actions-cell">
                        <div className="review-receive-row-actions">
                          <button
                            type="button"
                            className="review-receive-kebab-button"
                            aria-label={`${product.title ?? product.product_name} 관리 메뉴 열기`}
                            aria-expanded={activeActionProductId === product.id}
                            disabled={actionProductId === product.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveActionProductId((prev) => (prev === product.id ? null : product.id));
                            }}
                          >
                            <span aria-hidden="true">⋮</span>
                          </button>
                          {activeActionProductId === product.id && (
                            <div className="review-receive-row-action-menu" onClick={(event) => event.stopPropagation()}>
                              <button type="button" onClick={() => handleCopyPublicUrl(product)}>
                                URL 생성하기
                              </button>
                              <button type="button" onClick={() => handleCopyReviewVerifiedRows(product)}>
                                리뷰작성복사
                              </button>
                              <button type="button" onClick={() => openEditModal(product)}>
                                수정하기
                              </button>
                              <button
                                type="button"
                                className="is-danger"
                                onClick={() => openDeleteDialog(product)}
                                disabled={actionProductId === product.id}
                              >
                                {actionProductId === product.id ? "삭제 중..." : "삭제하기"}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isProductReviewerBulkModalOpen && (
        <div className="review-receive-modal-backdrop" role="presentation" {...productReviewerBulkBackdropDismissProps}>
          <div
            className="review-receive-modal review-receive-purchase-bulk-modal review-receive-product-reviewer-bulk-modal"
            role="dialog"
            aria-modal="true"
            aria-label="상품/리뷰어 일괄 입력"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="review-receive-modal-header">
              <div>
                <h2>상품/리뷰어 일괄 입력하기</h2>
                <p>
                  {productReviewerBulk.step === "input"
                    ? "스프레드시트 행을 그대로 붙여넣으면 첫 행 기준으로 상품 정보를 만들고 각 행을 리뷰어로 등록합니다."
                    : productReviewerBulk.step === "product"
                      ? "첫 행에서 읽은 상품 정보를 확인하고 필요한 값을 수정합니다."
                      : "등록될 리뷰어 정보를 칸별로 확인하고 수정합니다."}
                </p>
              </div>
              <button
                type="button"
                className="review-receive-modal-close"
                onClick={closeProductReviewerBulkModal}
                disabled={isSavingProductReviewerBulk}
              >
                닫기
              </button>
            </div>

            {productReviewerBulk.step === "input" && (
              <div className="review-receive-modal-body">
                <div className="review-receive-bulk-fields">
                  <textarea
                    className="review-receive-bulk-textarea"
                    value={productReviewerBulk.text}
                    onChange={handleProductReviewerBulkTextChange}
                    placeholder={
                      "날짜\t업체명\t링크\t\t번호\t품명\t옵션\t리뷰형태\t배정\t주문번호\t구매자\t수취인\t아이디\t연락처\t주소\t계좌\t금액\t리뷰비\t입금자명(예정)\t리뷰작성\t입금여부"
                    }
                    aria-label="상품/리뷰어 일괄 입력 텍스트"
                    disabled={isSavingProductReviewerBulk}
                  />
                </div>
                <div className="review-receive-preview-panel">
                  <div className="review-receive-preview-header">
                    <h3>입력 형식</h3>
                    <p>첫 행의 날짜, 업체명, 링크, 품명, 옵션, 리뷰형태, 예정 입금자명을 상품 정보로 사용합니다.</p>
                  </div>
                  <div className="review-receive-preview-empty">
                    <p>리뷰작성과 입금여부는 TRUE/FALSE 값으로 입력합니다.</p>
                  </div>
                  {productReviewerBulk.message && (
                    <p className={`review-receive-bulk-message is-${productReviewerBulk.messageType}`}>
                      {productReviewerBulk.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            {productReviewerBulk.step === "product" && (
              <div className="review-receive-modal-body review-receive-modal-body-single">
                <div className="review-receive-review-batch-fields">
                  <div className="review-receive-review-batch-grid review-receive-create-product-grid">
                    <div className="detail-summary-item review-receive-create-product-field is-full-width">
                      <label className="detail-summary-label" htmlFor="review-receive-bulk-product-title">
                        상품 제목 <span className="required-indicator" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="review-receive-bulk-product-title"
                        name="title"
                        className="table-cell-input"
                        value={productReviewerBulk.productForm.title}
                        onChange={handleProductReviewerBulkProductChange}
                        required
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-bulk-product-date">
                        등록날짜 <span className="required-indicator" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="review-receive-bulk-product-date"
                        name="productDate"
                        type="date"
                        className="table-cell-input"
                        value={productReviewerBulk.productForm.productDate}
                        onChange={handleProductReviewerBulkProductChange}
                        required
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-bulk-product-name">
                        품명 <span className="required-indicator" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="review-receive-bulk-product-name"
                        name="productName"
                        className="table-cell-input"
                        value={productReviewerBulk.productForm.productName}
                        onChange={handleProductReviewerBulkProductChange}
                        required
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field is-full-width">
                      <label className="detail-summary-label" htmlFor="review-receive-bulk-description">
                        설명
                      </label>
                      <textarea
                        id="review-receive-bulk-description"
                        name="description"
                        className="review-receive-bulk-textarea review-receive-create-product-textarea"
                        value={productReviewerBulk.productForm.description}
                        onChange={handleProductReviewerBulkProductChange}
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-bulk-company-name">
                        업체명
                      </label>
                      <input
                        id="review-receive-bulk-company-name"
                        name="companyName"
                        className="table-cell-input"
                        value={productReviewerBulk.productForm.companyName}
                        onChange={handleProductReviewerBulkProductChange}
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-bulk-option-name">
                        옵션
                      </label>
                      <input
                        id="review-receive-bulk-option-name"
                        name="optionName"
                        className="table-cell-input"
                        value={productReviewerBulk.productForm.optionName}
                        onChange={handleProductReviewerBulkProductChange}
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-bulk-review-type">
                        리뷰형태
                      </label>
                      <input
                        id="review-receive-bulk-review-type"
                        name="reviewType"
                        className="table-cell-input"
                        value={productReviewerBulk.productForm.reviewType}
                        onChange={handleProductReviewerBulkProductChange}
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-bulk-planned-depositor-name">
                        예정 입금자명
                      </label>
                      <input
                        id="review-receive-bulk-planned-depositor-name"
                        name="plannedDepositorName"
                        className="table-cell-input"
                        value={productReviewerBulk.productForm.plannedDepositorName}
                        onChange={handleProductReviewerBulkProductChange}
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-bulk-product-fee-deposit-gb">
                        제품비 입금구분
                      </label>
                      <select
                        id="review-receive-bulk-product-fee-deposit-gb"
                        name="productFeeDepositGb"
                        className="table-cell-input"
                        value={productReviewerBulk.productForm.productFeeDepositGb}
                        onChange={handleProductReviewerBulkProductChange}
                      >
                        {PRODUCT_DEPOSIT_PARTY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-bulk-review-fee-deposit-gb">
                        리뷰비 입금구분
                      </label>
                      <select
                        id="review-receive-bulk-review-fee-deposit-gb"
                        name="reviewFeeDepositGb"
                        className="table-cell-input"
                        value={productReviewerBulk.productForm.reviewFeeDepositGb}
                        onChange={handleProductReviewerBulkProductChange}
                      >
                        {PRODUCT_DEPOSIT_PARTY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {productReviewerBulk.message && (
                    <p className={`review-receive-bulk-message is-${productReviewerBulk.messageType}`}>
                      {productReviewerBulk.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            {productReviewerBulk.step === "reviewers" && (
              <div className="review-receive-product-reviewer-reviewers">
                <div className="review-receive-preview-header">
                  <h3>{`리뷰어 ${productReviewerBulk.reviewers.length}명`}</h3>
                  <p>각 칸을 수정할 수 있습니다. 완료하기를 누르면 상품과 리뷰어가 함께 등록됩니다.</p>
                </div>
                <div className="review-receive-product-reviewer-table-scroll">
                  <table className="review-receive-product-reviewer-table">
                    <thead>
                      <tr>
                        <th>순번</th>
                        {PRODUCT_REVIEWER_REVIEWER_FIELDS.map((field) => (
                          <th key={field.key} style={{ minWidth: field.minWidth }}>
                            {field.label}
                          </th>
                        ))}
                        <th>리뷰작성</th>
                        <th>입금여부</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productReviewerBulk.reviewers.map((row, index) => (
                        <tr key={row.clientId}>
                          <td>{index + 1}</td>
                          {PRODUCT_REVIEWER_REVIEWER_FIELDS.map((field) => (
                            <td key={field.key}>
                              <input
                                className="table-cell-input"
                                value={row[field.key] ?? ""}
                                onChange={(event) =>
                                  handleProductReviewerBulkRowChange(row.clientId, field.key, event.target.value)
                                }
                                disabled={isSavingProductReviewerBulk}
                              />
                            </td>
                          ))}
                          <td>
                            <input
                              type="checkbox"
                              checked={Boolean(row.is_review_verified)}
                              onChange={(event) =>
                                handleProductReviewerBulkRowChange(
                                  row.clientId,
                                  "is_review_verified",
                                  event.target.checked
                                )
                              }
                              disabled={isSavingProductReviewerBulk}
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={Boolean(row.is_deposit_verified)}
                              onChange={(event) =>
                                handleProductReviewerBulkRowChange(
                                  row.clientId,
                                  "is_deposit_verified",
                                  event.target.checked
                                )
                              }
                              disabled={isSavingProductReviewerBulk}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {productReviewerBulk.message && (
                  <p className={`review-receive-bulk-message is-${productReviewerBulk.messageType}`}>
                    {productReviewerBulk.message}
                  </p>
                )}
              </div>
            )}

            <div className="review-receive-modal-actions">
              {productReviewerBulk.step === "input" ? (
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={closeProductReviewerBulkModal}
                  disabled={isSavingProductReviewerBulk}
                >
                  취소
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={() =>
                    setProductReviewerBulk((prev) => ({
                      ...prev,
                      step: prev.step === "reviewers" ? "product" : "input",
                      message: "",
                      messageType: "info"
                    }))
                  }
                  disabled={isSavingProductReviewerBulk}
                >
                  이전
                </button>
              )}
              {productReviewerBulk.step === "input" && (
                <button type="button" className="admin-primary-button" onClick={handleProductReviewerBulkParse}>
                  다음
                </button>
              )}
              {productReviewerBulk.step === "product" && (
                <button type="button" className="admin-primary-button" onClick={handleProductReviewerBulkProductNext}>
                  다음
                </button>
              )}
              {productReviewerBulk.step === "reviewers" && (
                <button
                  type="button"
                  className="admin-primary-button"
                  onClick={handleProductReviewerBulkSave}
                  disabled={isSavingProductReviewerBulk}
                >
                  {isSavingProductReviewerBulk ? "등록 중..." : "완료하기"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isProductModalOpen && (
        <div className="review-receive-modal-backdrop" role="presentation" {...productModalBackdropDismissProps}>
          <div
            className="review-receive-modal review-receive-create-product-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingProduct ? "리뷰받기 상품 수정" : "리뷰받기 상품 추가"}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={productModalEnterConfirm.handleModalKeyDown}
          >
            <div className="review-receive-modal-header">
              <div>
                <h2>{editingProduct ? "리뷰받기 상품 수정" : "리뷰받기 상품 추가"}</h2>
                <p>
                  {editingProduct
                    ? "상품 기본 정보를 수정합니다. 연결된 제출 데이터는 유지됩니다."
                    : "필수 정보만 입력해 상품을 먼저 만들고, 세부 운영 데이터는 상세 화면에서 이어서 관리할 수 있습니다."}
                </p>
              </div>
              <button
                type="button"
                className="review-receive-modal-close"
                onClick={closeProductModal}
                disabled={isSavingProduct}
              >
                닫기
              </button>
            </div>

            <form ref={productFormRef} onSubmit={handleProductFormSubmit}>
              <div className="review-receive-modal-body review-receive-modal-body-single">
                <div className="review-receive-review-batch-fields">
                  <div className="review-receive-review-batch-grid review-receive-create-product-grid">
                    <div className="detail-summary-item review-receive-create-product-field is-full-width">
                      <label className="detail-summary-label" htmlFor="review-receive-product-title">
                        상품 제목 <span className="required-indicator" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="review-receive-product-title"
                        name="title"
                        className="table-cell-input"
                        value={productForm.title}
                        onChange={handleProductFormChange}
                        placeholder="예: 2026.04.25 / 브랜드명 상품명"
                        autoFocus
                        required
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-product-date">
                        등록날짜 <span className="required-indicator" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="review-receive-product-date"
                        name="productDate"
                        type="date"
                        className="table-cell-input"
                        value={productForm.productDate}
                        onChange={handleProductFormChange}
                        required
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-product-name">
                        품명 <span className="required-indicator" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="review-receive-product-name"
                        name="productName"
                        className="table-cell-input"
                        value={productForm.productName}
                        onChange={handleProductFormChange}
                        placeholder="예: 슈퍼 워터프루프 선크림"
                        required
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field is-full-width">
                      <label className="detail-summary-label" htmlFor="review-receive-description">
                        설명
                      </label>
                      <textarea
                        id="review-receive-description"
                        name="description"
                        className="review-receive-bulk-textarea review-receive-create-product-textarea"
                        value={productForm.description}
                        onChange={handleProductFormChange}
                        placeholder="운영 메모나 상품 설명이 있으면 입력하세요."
                        rows={4}
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-company-name">
                        업체명
                      </label>
                      <input
                        id="review-receive-company-name"
                        name="companyName"
                        className="table-cell-input"
                        value={productForm.companyName}
                        onChange={handleProductFormChange}
                        placeholder="예: 나우프레시"
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-option-name">
                        옵션
                      </label>
                      <input
                        id="review-receive-option-name"
                        name="optionName"
                        className="table-cell-input"
                        value={productForm.optionName}
                        onChange={handleProductFormChange}
                        placeholder="예: 50ml x 1개"
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-review-type">
                        리뷰형태
                      </label>
                      <input
                        id="review-receive-review-type"
                        name="reviewType"
                        className="table-cell-input"
                        value={productForm.reviewType}
                        onChange={handleProductFormChange}
                        placeholder="예: 텍스트 / 사진 / 영상"
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-planned-depositor-name">
                        예정 입금자명
                      </label>
                      <input
                        id="review-receive-planned-depositor-name"
                        name="plannedDepositorName"
                        className="table-cell-input"
                        value={productForm.plannedDepositorName}
                        onChange={handleProductFormChange}
                        placeholder="예: 0425브랜드명"
                      />
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-product-fee-deposit-gb">
                        제품비 입금구분
                      </label>
                      <select
                        id="review-receive-product-fee-deposit-gb"
                        name="productFeeDepositGb"
                        className="table-cell-input"
                        value={productForm.productFeeDepositGb}
                        onChange={handleProductFormChange}
                      >
                        {PRODUCT_DEPOSIT_PARTY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-review-fee-deposit-gb">
                        리뷰비 입금구분
                      </label>
                      <select
                        id="review-receive-review-fee-deposit-gb"
                        name="reviewFeeDepositGb"
                        className="table-cell-input"
                        value={productForm.reviewFeeDepositGb}
                        onChange={handleProductFormChange}
                      >
                        {PRODUCT_DEPOSIT_PARTY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="review-receive-preview-panel">
                    <div className="review-receive-preview-header">
                      <h3>입력 안내</h3>
                      <p>상품 제목과 품명은 필수입니다. 나머지 값은 비워두고 상세 화면에서 나중에 보완해도 됩니다.</p>
                    </div>
                    {productModalErrorMessage ? (
                      <p className="login-error review-receive-create-product-message">{productModalErrorMessage}</p>
                    ) : (
                      <p className="login-message review-receive-create-product-message">
                        {editingProduct ? "수정 후 목록에 바로 반영됩니다." : "생성 후 목록 최상단에 바로 반영됩니다."}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="review-receive-modal-actions">
                <button type="button" className="admin-secondary-button" onClick={closeProductModal} disabled={isSavingProduct}>
                  취소
                </button>
                <button type="submit" className="admin-primary-button" disabled={isSavingProduct}>
                  {isSavingProduct ? "저장 중..." : editingProduct ? "상품 수정하기" : "상품 추가하기"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AppAlertDialog
        {...productModalEnterConfirm.confirmDialogProps}
      />

      <AppAlertDialog
        isOpen={Boolean(deleteTargetProduct)}
        variant="danger"
        badgeLabel="삭제 확인"
        title="이 상품을 삭제할까요?"
        cancelLabel="취소"
        confirmLabel="삭제하기"
        busyConfirmLabel="삭제 중..."
        isBusy={Boolean(actionProductId)}
        onCancel={closeDeleteDialog}
        onConfirm={handleDeleteProduct}
        confirmButtonClassName="admin-danger-button"
        ariaLabel="리뷰받기 상품 삭제 확인"
      >
        <p>
          <strong>{deleteTargetProduct?.title ?? deleteTargetProduct?.product_name}</strong> 상품과 연결된 제출, 사진,
          단계 데이터가 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
        </p>
      </AppAlertDialog>

      <AppToast toast={toast} />
    </>
  );
}
