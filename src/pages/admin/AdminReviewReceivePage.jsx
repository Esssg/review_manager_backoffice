import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppAlertDialog from "../../components/common/AppAlertDialog";
import AppToast from "../../components/common/AppToast";
import ProductLinkCopy from "../../components/common/ProductLinkCopy";
import ReviewReceiveProductList from "../../components/admin/review-receive/ReviewReceiveProductList";
import { useAppToast } from "../../hooks/useAppToast";
import { useBackdropDismiss } from "../../hooks/useBackdropDismiss";
import { useModalEnterConfirm } from "../../hooks/useModalEnterConfirm";
import { useAdminIncludeCompanyData } from "../../hooks/useAdminCapabilities";
import {
  ADMIN_STORAGE_KEY,
  PRODUCT_DEPOSIT_PARTY,
  PRODUCT_DEPOSIT_PARTY_OPTIONS,
  REVIEW_FEE_DEPOSIT_PARTY_OPTIONS,
  buildProductDepositGb,
  getProductDepositGbPartLabels,
  getProductDepositGbPartValues
} from "../../constants/admin";
import {
  createAdminReviewReceiveProduct,
  deleteAdminReviewReceiveProduct,
  deleteAdminReviewReceiveProductBundle,
  fetchAdminReviewReceiveProducts,
  REVIEW_RECEIVE_SUMMARY_PAGE_SIZE,
  updateAdminReviewReceiveProduct
} from "../../services/adminProducts";
import { createReviewReceiveSubmission, fetchReviewReceiveDetail } from "../../services/reviewReceive";
import {
  normalizeProductReviewerRowForSave,
  parseProductReviewerBulkInput
} from "../../utils/reviewReceiveProductReviewerBulkInput";
import { normalizeProductDescriptionAndLink } from "../../utils/productLink";
import { applyPlannedDepositorNameDefault, formatPlannedDepositorName } from "../../utils/plannedDepositorName";
import { sortReviewReceiveRowsByCreatedAt } from "../../utils/reviewReceiveRows";
import { getDeletionErrorMessage } from "../../utils/deletionContract";
import {
  REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS,
  formatDateInputValue,
  getBundleItems,
  getBundleKey,
  isMultiProductBundleRow
} from "../../utils/reviewReceiveProductList";

function normalizeOptionalValue(value) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function createInitialProductForm() {
  const productDate = formatDateInputValue(new Date());

  return {
    title: "",
    productDate,
    productName: "",
    companyName: "",
    optionName: "",
    reviewType: "",
    plannedDepositorName: formatPlannedDepositorName(productDate, ""),
    productFeeDepositGb: PRODUCT_DEPOSIT_PARTY_OPTIONS[0].value,
    reviewFeeDepositGb: PRODUCT_DEPOSIT_PARTY_OPTIONS[0].value,
    productLink: "",
    description: ""
  };
}

function getPlannedDepositorNameForSave(productForm) {
  if (
    productForm.productFeeDepositGb === PRODUCT_DEPOSIT_PARTY.COMPANY &&
    productForm.reviewFeeDepositGb === PRODUCT_DEPOSIT_PARTY.COMPANY
  ) {
    return "업체페이";
  }

  return productForm.plannedDepositorName;
}

function createInitialProductReviewerBulkState() {
  return {
    step: "input",
    text: "",
    productForm: createInitialProductForm(),
    productGroups: [],
    reviewers: [],
    message: "",
    messageType: "info"
  };
}

function getProductReviewerBulkDepositForm(productForm) {
  return {
    productFeeDepositGb: productForm.productFeeDepositGb,
    reviewFeeDepositGb: productForm.reviewFeeDepositGb
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

function getProductReviewerBulkGroups(productReviewerBulk) {
  if (Array.isArray(productReviewerBulk.productGroups) && productReviewerBulk.productGroups.length > 0) {
    return productReviewerBulk.productGroups;
  }

  if (productReviewerBulk.reviewers.length > 0 || productReviewerBulk.productForm.productName) {
    return [
      {
        clientId: "product-group-1",
        productForm: productReviewerBulk.productForm,
        reviewers: productReviewerBulk.reviewers
      }
    ];
  }

  return [];
}

function getProductReviewerBulkReviewerCount(productGroups) {
  return productGroups.reduce((sum, group) => sum + group.reviewers.length, 0);
}

function formatProductReviewerBulkGroupLabel(group, index) {
  if (!group) {
    return index >= 0 ? `품목 ${index + 1}` : "-";
  }

  const productName = group.productForm.productName || `품목 ${index + 1}`;
  const optionName = group.productForm.optionName ? ` / ${group.productForm.optionName}` : "";

  return `${productName}${optionName}`;
}

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
    productLink: product.product_link ?? "",
    description: product.description ?? ""
  };
}

function getProductPayload(productForm, adminId, options = {}) {
  const { bundleOnly = false, bundleId = null } = options;
  const title = productForm.title.trim();
  const productName = productForm.productName.trim();
  const productDate = productForm.productDate.trim();
  const companyName = productForm.companyName.trim();
  const { description, productLink } = normalizeProductDescriptionAndLink(productForm.description, productForm.productLink);

  if (bundleOnly) {
    if (!productDate || !companyName) {
      return {
        errorMessage: "등록날짜와 업체명은 필수입니다."
      };
    }

    return {
      payload: {
        manager_id: adminId,
        title: null,
        product_date: productDate,
        product_name: null,
        description: null,
        product_link: null,
        company_name: companyName,
        option_name: null,
        review_type: null,
        planned_depositor_name: null,
        deposit_GB: buildProductDepositGb(productForm.productFeeDepositGb, productForm.reviewFeeDepositGb),
        ...(bundleId != null ? { bundle_id: bundleId } : {})
      }
    };
  }

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
      description: normalizeOptionalValue(description),
      product_link: normalizeOptionalValue(productLink),
      company_name: normalizeOptionalValue(productForm.companyName),
      option_name: normalizeOptionalValue(productForm.optionName),
      review_type: normalizeOptionalValue(productForm.reviewType),
      planned_depositor_name: normalizeOptionalValue(getPlannedDepositorNameForSave(productForm)),
      deposit_GB: buildProductDepositGb(productForm.productFeeDepositGb, productForm.reviewFeeDepositGb),
      ...(bundleId != null ? { bundle_id: bundleId } : {})
    }
  };
}

function buildReviewVerifiedClipboardText(submissions) {
  const sortedSubmissions = sortReviewReceiveRowsByCreatedAt(
    Array.isArray(submissions) ? submissions : []
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

const REVIEW_RECEIVE_PRODUCT_FILTERS_STORAGE_KEY = "review_manager_review_receive_product_filters";
const REVIEW_RECEIVE_PRODUCT_FILTER_DEBOUNCE_MS = 400;

function createEmptyReviewReceiveProductFilters() {
  return REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS.reduce((filters, column) => {
    filters[column.key] = column.type === "dateRange" ? { start: "", end: "" } : "";
    return filters;
  }, {});
}

function getReviewReceiveProductFiltersStorageKey(adminId) {
  return `${REVIEW_RECEIVE_PRODUCT_FILTERS_STORAGE_KEY}:${adminId ?? "anonymous"}`;
}

function normalizeStoredReviewReceiveProductFilters(storedFilters) {
  const emptyFilters = createEmptyReviewReceiveProductFilters();

  if (!storedFilters || typeof storedFilters !== "object" || Array.isArray(storedFilters)) {
    return emptyFilters;
  }

  return REVIEW_RECEIVE_PRODUCT_FILTER_COLUMNS.reduce((filters, column) => {
    const storedValue = storedFilters[column.key];

    if (column.type === "dateRange") {
      filters[column.key] =
        storedValue && typeof storedValue === "object" && !Array.isArray(storedValue)
          ? {
              start: typeof storedValue.start === "string" ? storedValue.start : "",
              end: typeof storedValue.end === "string" ? storedValue.end : ""
            }
          : emptyFilters[column.key];
      return filters;
    }

    filters[column.key] = typeof storedValue === "string" ? storedValue : emptyFilters[column.key];
    return filters;
  }, {});
}

function readStoredReviewReceiveProductFilters(adminId) {
  if (typeof window === "undefined") {
    return createEmptyReviewReceiveProductFilters();
  }

  try {
    const storedValue = window.sessionStorage.getItem(getReviewReceiveProductFiltersStorageKey(adminId));
    return normalizeStoredReviewReceiveProductFilters(storedValue ? JSON.parse(storedValue) : null);
  } catch {
    return createEmptyReviewReceiveProductFilters();
  }
}

function writeStoredReviewReceiveProductFilters(adminId, filters) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getReviewReceiveProductFiltersStorageKey(adminId),
      JSON.stringify(normalizeStoredReviewReceiveProductFilters(filters))
    );
  } catch {
    // sessionStorage can be unavailable in restricted browser contexts.
  }
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

export default function AdminReviewReceivePage({ viewMode = "all" }) {
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  const navigate = useNavigate();
  const {
    includeCompanyData,
    adminProfile,
    scopePolicy,
    handleIncludeCompanyDataChange,
    isLoadingCapabilities,
    isIncludeCompanyDataReady,
    capabilitiesErrorMessage
  } = useAdminIncludeCompanyData(adminId);
  const [products, setProducts] = useState([]);
  const [productFilters, setProductFilters] = useState(() => readStoredReviewReceiveProductFilters(adminId));
  const [debouncedProductFilters, setDebouncedProductFilters] = useState(productFilters);
  const [openProductFilterKey, setOpenProductFilterKey] = useState("");
  const [scopeInfo, setScopeInfo] = useState({
    companyName: null,
    isCompanyScopeAvailable: false
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [listPageInfo, setListPageInfo] = useState({
    hasMore: false,
    nextCursor: null
  });
  const [listReloadKey, setListReloadKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCreateTypeDialogOpen, setIsCreateTypeDialogOpen] = useState(false);
  const [productModalMode, setProductModalMode] = useState("single");
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteTargetProduct, setDeleteTargetProduct] = useState(null);
  const [expandedBundleKey, setExpandedBundleKey] = useState(null);
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
  const productListScrollRef = useRef(null);
  const productListLoadMoreRef = useRef(null);
  const productListRequestIdRef = useRef(0);
  const productListIsLoadingMoreRef = useRef(false);
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
      const requestId = productListRequestIdRef.current + 1;
      productListRequestIdRef.current = requestId;
      setIsLoading(true);
      setIsLoadingMore(false);
      productListIsLoadingMoreRef.current = false;
      setErrorMessage("");
      setListPageInfo({
        hasMore: false,
        nextCursor: null
      });

      if (isLoadingCapabilities || !isIncludeCompanyDataReady) {
        return;
      }

      if (capabilitiesErrorMessage) {
        setProducts([]);
        setErrorMessage(capabilitiesErrorMessage);
        setIsLoading(false);
        return;
      }

      const { data, error, scope, pageInfo } = await fetchAdminReviewReceiveProducts(adminId, {
        scopePolicy,
        adminProfile,
        viewMode,
        filters: debouncedProductFilters,
        pageSize: REVIEW_RECEIVE_SUMMARY_PAGE_SIZE
      });

      if (requestId !== productListRequestIdRef.current) {
        return;
      }

      setScopeInfo({
        companyName: scope?.companyName ?? null,
        isCompanyScopeAvailable: scope?.isCompanyScopeAvailable ?? false
      });

      if (error) {
        setErrorMessage(error.message);
        setProducts([]);
      } else {
        setProducts(data ?? []);
        setListPageInfo({
          hasMore: Boolean(pageInfo?.hasMore && pageInfo?.nextCursor),
          nextCursor: pageInfo?.nextCursor ?? null
        });
      }

      setIsLoading(false);
    };

    loadProducts();
  }, [
    adminId,
    capabilitiesErrorMessage,
    debouncedProductFilters,
    includeCompanyData,
    adminProfile,
    isIncludeCompanyDataReady,
    isLoadingCapabilities,
    listReloadKey,
    scopePolicy,
    viewMode
  ]);

  useEffect(() => {
    writeStoredReviewReceiveProductFilters(adminId, productFilters);
  }, [adminId, productFilters]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedProductFilters(productFilters);
    }, REVIEW_RECEIVE_PRODUCT_FILTER_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [productFilters]);

  useEffect(() => {
    if (
      isLoading ||
      errorMessage ||
      !listPageInfo.hasMore ||
      !listPageInfo.nextCursor ||
      isLoadingCapabilities ||
      !isIncludeCompanyDataReady ||
      capabilitiesErrorMessage
    ) {
      return undefined;
    }

    const sentinel = productListLoadMoreRef.current;

    if (!sentinel) {
      return undefined;
    }

    let isCancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (!entry?.isIntersecting) {
          return;
        }

        const loadMoreProducts = async () => {
          if (productListIsLoadingMoreRef.current) {
            return;
          }

          const requestId = productListRequestIdRef.current;
          productListIsLoadingMoreRef.current = true;
          setIsLoadingMore(true);

          const { data, error, pageInfo } = await fetchAdminReviewReceiveProducts(adminId, {
            scopePolicy,
            adminProfile,
            viewMode,
            filters: debouncedProductFilters,
            pageSize: REVIEW_RECEIVE_SUMMARY_PAGE_SIZE,
            cursor: listPageInfo.nextCursor
          });

          if (isCancelled || requestId !== productListRequestIdRef.current) {
            productListIsLoadingMoreRef.current = false;
            return;
          }

          if (error) {
            setErrorMessage(error.message);
            setListPageInfo({
              hasMore: false,
              nextCursor: null
            });
          } else {
            setProducts((prev) => [...prev, ...(data ?? [])]);
            setListPageInfo({
              hasMore: Boolean(pageInfo?.hasMore && pageInfo?.nextCursor),
              nextCursor: pageInfo?.nextCursor ?? null
            });
          }

          productListIsLoadingMoreRef.current = false;
          setIsLoadingMore(false);
        };

        observer.unobserve(entry.target);
        loadMoreProducts();
      },
      {
        root: productListScrollRef.current,
        rootMargin: "260px 0px",
        threshold: 0
      }
    );

    observer.observe(sentinel);

    return () => {
      isCancelled = true;
      productListIsLoadingMoreRef.current = false;
      observer.disconnect();
    };
  }, [
    adminId,
    capabilitiesErrorMessage,
    debouncedProductFilters,
    errorMessage,
    includeCompanyData,
    adminProfile,
    isIncludeCompanyDataReady,
    isLoading,
    isLoadingCapabilities,
    listPageInfo.hasMore,
    listPageInfo.nextCursor,
    scopePolicy,
    viewMode
  ]);

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

  const filteredProducts = products;
  const hasActiveProductFilters = hasActiveReviewReceiveProductFilters(productFilters);

  const statusSummaryText =
    viewMode === "completed"
      ? "모든 submission의 입금완료체크가 true인 상품만 표시합니다."
      : viewMode === "in_progress"
        ? "submission이 없거나, 입금완료체크가 하나라도 false인 상품을 표시합니다."
        : "전체 상품 리스트를 표시합니다.";
  const productReviewerBulkGroups = getProductReviewerBulkGroups(productReviewerBulk);
  const productReviewerBulkGroupCount = productReviewerBulkGroups.length;
  const productReviewerBulkReviewerCount = getProductReviewerBulkReviewerCount(productReviewerBulkGroups);
  const isProductReviewerBulkMultiProduct = productReviewerBulkGroupCount > 1;
  const requestProductListReload = () => {
    setExpandedBundleKey(null);
    setListReloadKey((prev) => prev + 1);
  };

  const openCreateTypeDialog = () => {
    setIsCreateTypeDialogOpen(true);
  };

  const openCreateModal = (mode = "single") => {
    setProductModalErrorMessage("");
    setEditingProduct(null);
    setProductModalMode(mode);
    setProductForm(createInitialProductForm());
    setIsCreateTypeDialogOpen(false);
    setIsProductModalOpen(true);
  };

  const openEditModal = (product) => {
    setProductModalErrorMessage("");
    setActiveActionProductId(null);
    setProductModalMode("single");
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
    setActionProductId(product.id);

    const {
      productResult: { error: productError },
      submissionsResult: { data: submissions, error: submissionsError }
    } = await fetchReviewReceiveDetail(product.id, adminId, { adminProfile });

    setActionProductId(null);

    if (productError || submissionsError) {
      showToast(productError?.message ?? submissionsError?.message ?? "리뷰작성완료 데이터를 불러오지 못했습니다.", "error");
      return;
    }

    const { count, text } = buildReviewVerifiedClipboardText(submissions);

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
    setProductModalMode("single");
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

    setProductForm((prev) => applyPlannedDepositorNameDefault(prev, { [name]: value }));
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
      productForm: applyPlannedDepositorNameDefault(prev.productForm, { [name]: value }),
      productGroups:
        prev.productGroups.length === 1
          ? [
              {
                ...prev.productGroups[0],
                productForm: applyPlannedDepositorNameDefault(prev.productGroups[0].productForm, { [name]: value })
              }
            ]
          : prev.productGroups,
      message: "",
      messageType: "info"
    }));
  };

  const handleProductReviewerBulkDepositChange = (event) => {
    const { name, value } = event.target;

    setProductReviewerBulk((prev) => ({
      ...prev,
      productForm: {
        ...prev.productForm,
        [name]: value
      },
      productGroups: prev.productGroups.map((group) => ({
        ...group,
        productForm: {
          ...group.productForm,
          [name]: value
        }
      })),
      message: "",
      messageType: "info"
    }));
  };

  const handleProductReviewerBulkRowChange = (clientId, field, value) => {
    setProductReviewerBulk((prev) => ({
      ...prev,
      reviewers: prev.reviewers.map((row) => (row.clientId === clientId ? { ...row, [field]: value } : row)),
      productGroups: prev.productGroups.map((group) => ({
        ...group,
        reviewers: group.reviewers.map((row) => (row.clientId === clientId ? { ...row, [field]: value } : row))
      })),
      message: "",
      messageType: "info"
    }));
  };

  const handleProductReviewerBulkParse = () => {
    try {
      const parsed = parseProductReviewerBulkInput(productReviewerBulk.text);
      const productGroups = parsed.productGroups.map((group) => ({
        ...group,
        productForm: {
          ...createInitialProductForm(),
          ...group.productForm
        }
      }));
      const reviewers = productGroups.flatMap((group) => group.reviewers);
      const productCount = productGroups.length;

      setProductReviewerBulk((prev) => ({
        ...prev,
        step: "product",
        productForm: productGroups[0]?.productForm ?? {
          ...createInitialProductForm(),
          ...parsed.productForm
        },
        productGroups,
        reviewers,
        message:
          productCount > 1
            ? `${productCount}개 품목과 리뷰어 ${reviewers.length}명을 확인했습니다. 품목별 정보를 확인한 뒤 다음으로 진행하세요.`
            : `${reviewers.length}명의 리뷰어를 확인했습니다. 상품 정보를 수정한 뒤 다음으로 진행하세요.`,
        messageType: "success"
      }));
    } catch (error) {
      setProductReviewerBulkMessage(error.message || "상품/리뷰어 일괄 입력 형식을 확인해주세요.", "error");
    }
  };

  const handleProductReviewerBulkProductNext = () => {
    const productGroups = getProductReviewerBulkGroups(productReviewerBulk);

    if (productGroups.length === 0) {
      setProductReviewerBulkMessage("등록할 품목이 없습니다.", "error");
      return;
    }

    for (let index = 0; index < productGroups.length; index += 1) {
      const { errorMessage: validationErrorMessage } = getProductPayload(productGroups[index].productForm, adminId);

      if (validationErrorMessage) {
        setProductReviewerBulkMessage(`${index + 1}번째 품목: ${validationErrorMessage}`, "error");
        return;
      }
    }

    if (getProductReviewerBulkReviewerCount(productGroups) === 0) {
      setProductReviewerBulkMessage("등록할 리뷰어 행이 없습니다.", "error");
      return;
    }

    setProductReviewerBulk((prev) => ({
      ...prev,
      step: "reviewers",
      message:
        productGroups.length > 1
          ? "리뷰어 정보를 칸별로 수정한 뒤 완료하기를 누르면 품목별로 나눠 등록합니다."
          : "리뷰어 정보를 칸별로 수정한 뒤 완료하기를 눌러주세요.",
      messageType: "info"
    }));
  };

  const handleProductReviewerBulkReviewersNext = () => {
    const productGroups = getProductReviewerBulkGroups(productReviewerBulk);

    if (getProductReviewerBulkReviewerCount(productGroups) === 0) {
      setProductReviewerBulkMessage("등록할 리뷰어 행이 없습니다.", "error");
      return;
    }

    setProductReviewerBulk((prev) => ({
      ...prev,
      step: "deposit",
      message:
        productGroups.length > 1
          ? "선택한 입금구분을 모든 품목에 동일하게 적용합니다."
          : "선택한 입금구분을 이 품목에 적용합니다.",
      messageType: "info"
    }));
  };

  const handleProductReviewerBulkSave = async () => {
    if (!adminId) {
      setProductReviewerBulkMessage("로그인 정보가 없습니다. 다시 로그인해주세요.", "error");
      return;
    }

    const productGroups = getProductReviewerBulkGroups(productReviewerBulk);

    if (productGroups.length === 0) {
      setProductReviewerBulkMessage("등록할 품목이 없습니다.", "error");
      return;
    }

    let groupPayloads;

    try {
      groupPayloads = productGroups.map((group, groupIndex) => {
        const { payload, errorMessage: validationErrorMessage } = getProductPayload(group.productForm, adminId);

        if (validationErrorMessage) {
          throw new Error(`${groupIndex + 1}번째 품목: ${validationErrorMessage}`);
        }

        return {
          productPayload: payload,
          reviewerPayloads: group.reviewers.map((row, index) =>
            normalizeProductReviewerRowForSave(row, row.sourceLineNumber ?? index + 1)
          )
        };
      });
    } catch (error) {
      setProductReviewerBulkMessage(error.message || "리뷰어 정보를 확인해주세요.", "error");
      return;
    }

    setIsSavingProductReviewerBulk(true);
    setProductReviewerBulkMessage("");

    const createdProducts = [];
    const createdSubmissions = [];
    let bundleId = null;

    const reflectPartialSave = () => {
      if (createdProducts.length > 0) {
        requestProductListReload();
      }
    };

    for (let groupIndex = 0; groupIndex < groupPayloads.length; groupIndex += 1) {
      const productPayload =
        bundleId == null
          ? groupPayloads[groupIndex].productPayload
          : {
              ...groupPayloads[groupIndex].productPayload,
              bundle_id: bundleId
            };
      const productResult = await createAdminReviewReceiveProduct(productPayload);

      if (productResult.error || !productResult.data) {
        reflectPartialSave();
        setProductReviewerBulkMessage(
          `${groupIndex + 1}번째 품목 저장 중 오류가 발생했습니다. ${createdProducts.length}개 품목과 ${createdSubmissions.length}건의 리뷰어만 반영되었습니다.`,
          "error"
        );
        setIsSavingProductReviewerBulk(false);
        return;
      }

      bundleId = bundleId ?? productResult.data.bundle_id ?? productResult.data.id;

      const productWithSubmissions = {
        ...productResult.data,
        submissions: []
      };
      createdProducts.push(productWithSubmissions);

      for (let reviewerIndex = 0; reviewerIndex < groupPayloads[groupIndex].reviewerPayloads.length; reviewerIndex += 1) {
        const submissionResult = await createReviewReceiveSubmission({
          product_id: productResult.data.id,
          ...groupPayloads[groupIndex].reviewerPayloads[reviewerIndex]
        });

        if (submissionResult.error) {
          reflectPartialSave();
          setProductReviewerBulkMessage(
            `${groupIndex + 1}번째 품목의 ${reviewerIndex + 1}번째 리뷰어 저장 중 오류가 발생했습니다. ${createdProducts.length}개 품목과 ${createdSubmissions.length}건의 리뷰어만 반영되었습니다.`,
            "error"
          );
          setIsSavingProductReviewerBulk(false);
          return;
        }

        productWithSubmissions.submissions.push(submissionResult.data);
        createdSubmissions.push(submissionResult.data);
      }
    }

    requestProductListReload();
    showToast(`품목 ${createdProducts.length}건과 리뷰어 ${createdSubmissions.length}건을 등록했습니다.`, "success");
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

    const { payload, errorMessage: validationErrorMessage } = getProductPayload(productForm, adminId, {
      bundleOnly: productModalMode === "bundle" && !editingProduct
    });

    if (validationErrorMessage) {
      setProductModalErrorMessage(validationErrorMessage);
      return;
    }

    setIsSavingProduct(true);
    setProductModalErrorMessage("");

    const { data, error } = editingProduct
      ? await updateAdminReviewReceiveProduct(editingProduct.id, adminId, payload, { scopePolicy, adminProfile })
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

    requestProductListReload();
    showToast(editingProduct ? "리뷰받기 상품을 수정했습니다." : "리뷰받기 상품을 추가했습니다.", "success");
    setEditingProduct(null);
    setProductModalMode("single");
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

    const isBundleDelete = isMultiProductBundleRow(product);
    const result = isBundleDelete
      ? await deleteAdminReviewReceiveProductBundle(getBundleKey(product), adminId, { scopePolicy, adminProfile })
      : await deleteAdminReviewReceiveProduct(product.id, adminId, { scopePolicy, adminProfile });
    const { error } = result;

    if (error) {
      if (result.partial) {
        requestProductListReload();
        setDeleteTargetProduct(null);
      }

      showToast(getDeletionErrorMessage(result), "error");
      setActionProductId(null);
      return;
    }

    if (isBundleDelete) {
      requestProductListReload();
      showToast("다중품목 묶음을 삭제했습니다.", "success");
    } else {
      requestProductListReload();
      showToast("리뷰받기 상품을 삭제했습니다.", "success");
    }

    setDeleteTargetProduct(null);
    setActionProductId(null);
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
          <button type="button" className="admin-primary-button" onClick={openCreateTypeDialog}>
            상품 추가하기
          </button>
        </div>
      </header>

      <ReviewReceiveProductList
        viewMode={viewMode}
        onViewModeChange={(nextTab) => navigate(getReviewReceiveStatusPath(nextTab))}
        isLoading={isLoading}
        errorMessage={errorMessage}
        productListScrollRef={productListScrollRef}
        productListLoadMoreRef={productListLoadMoreRef}
        productFilters={productFilters}
        openProductFilterKey={openProductFilterKey}
        onProductFilterOpenChange={setOpenProductFilterKey}
        onProductFilterChange={handleProductFilterChange}
        onProductFilterReset={handleProductFilterReset}
        productFilterRef={productFilterRef}
        products={products}
        filteredProducts={filteredProducts}
        hasActiveProductFilters={hasActiveProductFilters}
        expandedBundleKey={expandedBundleKey}
        setExpandedBundleKey={setExpandedBundleKey}
        activeActionProductId={activeActionProductId}
        setActiveActionProductId={setActiveActionProductId}
        actionProductId={actionProductId}
        onNavigate={navigate}
        onCopyPublicUrl={handleCopyPublicUrl}
        onCopyReviewVerifiedRows={handleCopyReviewVerifiedRows}
        onOpenEditModal={openEditModal}
        onOpenDeleteDialog={openDeleteDialog}
        isLoadingMore={isLoadingMore}
        hasMore={listPageInfo.hasMore}
      />

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
                    ? "스프레드시트 행을 그대로 붙여넣으면 품목 정보가 바뀌는 구간마다 상품을 나누고 각 행을 리뷰어로 등록합니다."
                    : productReviewerBulk.step === "product"
                      ? isProductReviewerBulkMultiProduct
                        ? "붙여넣은 행에서 나뉜 품목 정보를 확인합니다."
                        : "첫 행에서 읽은 상품 정보를 확인하고 필요한 값을 수정합니다."
                      : productReviewerBulk.step === "reviewers"
                        ? "등록될 리뷰어 정보를 칸별로 확인하고 수정합니다."
                        : "제품비와 리뷰비 입금구분을 선택합니다."}
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
                    <p>날짜, 업체명, 품명, 옵션, 리뷰형태가 바뀌면 새 품목으로 나눕니다.</p>
                  </div>
                  <div className="review-receive-preview-empty">
                    <p>각 품목의 첫 행에 있는 링크와 예정 입금자명을 해당 품목 정보로 사용합니다.</p>
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
                  {isProductReviewerBulkMultiProduct ? (
                    <div className="review-receive-product-reviewer-table-scroll">
                      <table className="review-receive-product-reviewer-table">
                        <thead>
                          <tr>
                            <th>품목</th>
                            <th>등록날짜</th>
                            <th>업체명</th>
                            <th>품명</th>
                            <th>옵션</th>
                            <th>리뷰형태</th>
                            <th>링크</th>
                            <th>예정 입금자명</th>
                            <th>리뷰어</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productReviewerBulkGroups.map((group, index) => (
                            <tr key={group.clientId}>
                              <td>{index + 1}</td>
                              <td>{group.productForm.productDate}</td>
                              <td>{group.productForm.companyName || "-"}</td>
                              <td>{group.productForm.productName || "-"}</td>
                              <td>{group.productForm.optionName || "-"}</td>
                              <td>{group.productForm.reviewType || "-"}</td>
                              <td>
                                <ProductLinkCopy value={group.productForm.productLink} />
                              </td>
                              <td>{group.productForm.plannedDepositorName || "-"}</td>
                              <td>{group.reviewers.length}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
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
                    <div className="detail-summary-item review-receive-create-product-field is-full-width">
                      <label className="detail-summary-label" htmlFor="review-receive-bulk-product-link">
                        링크
                      </label>
                      <textarea
                        id="review-receive-bulk-product-link"
                        name="productLink"
                        className="review-receive-bulk-textarea review-receive-create-product-textarea"
                        value={productReviewerBulk.productForm.productLink}
                        onChange={handleProductReviewerBulkProductChange}
                        rows={3}
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
                  </div>
                  )}
                  {productReviewerBulk.message && (
                    <p className={`review-receive-bulk-message is-${productReviewerBulk.messageType}`}>
                      {productReviewerBulk.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            {productReviewerBulk.step === "deposit" && (
              <div className="review-receive-modal-body review-receive-modal-body-single">
                <div className="review-receive-review-batch-fields review-receive-product-reviewer-deposit-step">
                  <div className="review-receive-review-batch-grid review-receive-create-product-grid">
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-bulk-product-fee-deposit-gb">
                        제품비 입금구분
                      </label>
                      <select
                        id="review-receive-bulk-product-fee-deposit-gb"
                        name="productFeeDepositGb"
                        className="table-cell-input"
                        value={productReviewerBulk.productForm.productFeeDepositGb}
                        onChange={handleProductReviewerBulkDepositChange}
                        disabled={isSavingProductReviewerBulk}
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
                        onChange={handleProductReviewerBulkDepositChange}
                        disabled={isSavingProductReviewerBulk}
                      >
                        {REVIEW_FEE_DEPOSIT_PARTY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="review-receive-preview-panel">
                    <div className="review-receive-preview-header">
                      <h3>
                        {isProductReviewerBulkMultiProduct
                          ? `품목 ${productReviewerBulkGroupCount}개에 적용`
                          : "입금구분 적용"}
                      </h3>
                      <p>
                        제품비 {getProductReviewerBulkDepositForm(productReviewerBulk.productForm).productFeeDepositGb === PRODUCT_DEPOSIT_PARTY.COMPANY ? "업체입금" : "자체입금"} / 리뷰비{" "}
                        {getProductReviewerBulkDepositForm(productReviewerBulk.productForm).reviewFeeDepositGb === PRODUCT_DEPOSIT_PARTY.COMPANY ? "없음" : "자체입금"}
                      </p>
                    </div>
                    {isProductReviewerBulkMultiProduct && (
                      <div className="review-receive-product-reviewer-table-scroll is-compact">
                        <table className="review-receive-product-reviewer-table is-compact is-bulk-deposit-summary">
                          <colgroup>
                            <col className="col-index" />
                            <col className="col-product-name" />
                            <col className="col-option-name" />
                            <col className="col-reviewer-count" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>품목</th>
                              <th>품명</th>
                              <th>옵션</th>
                              <th>리뷰어</th>
                            </tr>
                          </thead>
                          <tbody>
                            {productReviewerBulkGroups.map((group, index) => (
                              <tr key={group.clientId}>
                                <td>{index + 1}</td>
                                <td>{group.productForm.productName || "-"}</td>
                                <td>{group.productForm.optionName || "-"}</td>
                                <td>{group.reviewers.length}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {productReviewerBulk.message && (
                      <p className={`review-receive-bulk-message is-${productReviewerBulk.messageType}`}>
                        {productReviewerBulk.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {productReviewerBulk.step === "reviewers" && (
              <div className="review-receive-product-reviewer-reviewers">
                <div className="review-receive-preview-header">
                  <h3>
                    {isProductReviewerBulkMultiProduct
                      ? `품목 ${productReviewerBulkGroupCount}개 / 리뷰어 ${productReviewerBulkReviewerCount}명`
                      : `리뷰어 ${productReviewerBulk.reviewers.length}명`}
                  </h3>
                  <p>각 칸을 수정할 수 있습니다. 다음 단계에서 입금구분을 선택한 뒤 등록합니다.</p>
                </div>
                <div className="review-receive-product-reviewer-table-scroll">
                  <table className="review-receive-product-reviewer-table">
                    <thead>
                      <tr>
                        <th>순번</th>
                        {isProductReviewerBulkMultiProduct && <th>품목</th>}
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
                          {isProductReviewerBulkMultiProduct && (
                            <td>
                              {formatProductReviewerBulkGroupLabel(
                                productReviewerBulkGroups.find((group) => group.clientId === row.productGroupClientId),
                                productReviewerBulkGroups.findIndex((group) => group.clientId === row.productGroupClientId)
                              )}
                            </td>
                          )}
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
                      step: prev.step === "deposit" ? "reviewers" : prev.step === "reviewers" ? "product" : "input",
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
                <button type="button" className="admin-primary-button" onClick={handleProductReviewerBulkReviewersNext}>
                  다음
                </button>
              )}
              {productReviewerBulk.step === "deposit" && (
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

      <AppAlertDialog
        isOpen={isCreateTypeDialogOpen}
        badgeLabel="상품 추가"
        title="등록 방식을 선택해주세요."
        description="단일 상품은 기존 양식을 사용하고, 여러 상품은 날짜와 업체명만 먼저 저장한 뒤 상세에서 품목을 추가합니다."
        ariaLabel="리뷰받기 상품 등록 방식 선택"
        actionsChildren={
          <>
            <button type="button" className="admin-secondary-button" onClick={() => setIsCreateTypeDialogOpen(false)}>
              취소
            </button>
          <button type="button" className="admin-secondary-button" onClick={() => openCreateModal("single")}>
              단일상품
            </button>
            <button type="button" className="admin-primary-button" onClick={() => openCreateModal("bundle")}>
              여러상품
          </button>
          </>
        }
      />

      {isProductModalOpen && (
        <div className="review-receive-modal-backdrop" role="presentation" {...productModalBackdropDismissProps}>
          <div
            className="review-receive-modal review-receive-create-product-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingProduct ? "리뷰받기 상품 수정" : productModalMode === "bundle" ? "리뷰받기 여러 상품 추가" : "리뷰받기 상품 추가"}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={productModalEnterConfirm.handleModalKeyDown}
          >
            <div className="review-receive-modal-header">
              <div>
                <h2>{editingProduct ? "리뷰받기 상품 수정" : productModalMode === "bundle" ? "여러 상품 추가" : "리뷰받기 상품 추가"}</h2>
                <p>
                  {editingProduct
                    ? "상품 기본 정보를 수정합니다. 연결된 제출 데이터는 유지됩니다."
                    : productModalMode === "bundle"
                      ? "날짜와 업체명만 먼저 저장하고, 상세 화면에서 품목 정보를 추가합니다."
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
                    {productModalMode !== "bundle" && (
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
                    )}
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
                        autoFocus={productModalMode === "bundle"}
                        required
                      />
                    </div>
                    {productModalMode !== "bundle" && (
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
                    )}
                    {productModalMode !== "bundle" && (
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
                    )}
                    {productModalMode !== "bundle" && (
                      <div className="detail-summary-item review-receive-create-product-field is-full-width">
                        <label className="detail-summary-label" htmlFor="review-receive-product-link">
                          링크
                        </label>
                        <textarea
                          id="review-receive-product-link"
                          name="productLink"
                          className="review-receive-bulk-textarea review-receive-create-product-textarea"
                          value={productForm.productLink}
                          onChange={handleProductFormChange}
                          placeholder="상품 링크가 있으면 입력하세요."
                          rows={3}
                        />
                      </div>
                    )}
                    <div className="detail-summary-item review-receive-create-product-field">
                      <label className="detail-summary-label" htmlFor="review-receive-company-name">
                        업체명 {productModalMode === "bundle" && <span className="required-indicator" aria-hidden="true">*</span>}
                      </label>
                      <input
                        id="review-receive-company-name"
                        name="companyName"
                        className="table-cell-input"
                        value={productForm.companyName}
                        onChange={handleProductFormChange}
                        placeholder="예: 나우프레시"
                        required={productModalMode === "bundle"}
                      />
                    </div>
                    {productModalMode !== "bundle" && <div className="detail-summary-item review-receive-create-product-field">
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
                    </div>}
                    {productModalMode !== "bundle" && <div className="detail-summary-item review-receive-create-product-field">
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
                    </div>}
                    {productModalMode !== "bundle" && <div className="detail-summary-item review-receive-create-product-field">
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
                    </div>}
                    {productModalMode !== "bundle" && <div className="detail-summary-item review-receive-create-product-field">
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
                    </div>}
                    {productModalMode !== "bundle" && <div className="detail-summary-item review-receive-create-product-field">
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
                        {REVIEW_FEE_DEPOSIT_PARTY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>}
                  </div>
                  <div className="review-receive-preview-panel">
                    <div className="review-receive-preview-header">
                      <h3>입력 안내</h3>
                      <p>
                        {productModalMode === "bundle"
                          ? "여러 상품 묶음은 날짜와 업체명만 먼저 저장합니다."
                          : "상품 제목과 품명은 필수입니다. 나머지 값은 비워두고 상세 화면에서 나중에 보완해도 됩니다."}
                      </p>
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
        title={isMultiProductBundleRow(deleteTargetProduct) ? "다중품목 묶음을 삭제할까요?" : "이 상품을 삭제할까요?"}
        cancelLabel="취소"
        confirmLabel="삭제하기"
        busyConfirmLabel="삭제 중..."
        isBusy={Boolean(actionProductId)}
        onCancel={closeDeleteDialog}
        onConfirm={handleDeleteProduct}
        confirmButtonClassName="admin-danger-button"
        ariaLabel="리뷰받기 상품 삭제 확인"
      >
        {isMultiProductBundleRow(deleteTargetProduct) ? (
          <p>
            같은 bundle_id에 묶인 상세 품목 <strong>{getBundleItems(deleteTargetProduct).length}개</strong>와 연결된 제출,
            사진, 단계 데이터가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </p>
        ) : (
          <p>
            <strong>{deleteTargetProduct?.title ?? deleteTargetProduct?.product_name}</strong> 상품과 연결된 제출, 사진,
            단계 데이터가 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </p>
        )}
      </AppAlertDialog>

      <AppToast toast={toast} />
    </>
  );
}
