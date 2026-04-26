import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import StepTabList from "../../components/admin/product-detail/StepTabList";
import AppAlertDialog from "../../components/common/AppAlertDialog";
import AppToast from "../../components/common/AppToast";
import { useAppToast } from "../../hooks/useAppToast";
import { useModalEnterConfirm } from "../../hooks/useModalEnterConfirm";
import {
  ADMIN_INCLUDE_COMPANY_DATA_STORAGE_KEY,
  ADMIN_STORAGE_KEY,
  REVIEW_RECEIVE_STATUS_TABS
} from "../../constants/admin";
import {
  createAdminReviewReceiveProduct,
  deleteAdminReviewReceiveProduct,
  fetchAdminReviewReceiveProducts,
  updateAdminReviewReceiveProduct
} from "../../services/adminProducts";

const INITIAL_PRODUCT_FORM = {
  title: "",
  productName: "",
  companyName: "",
  optionName: "",
  reviewType: "",
  plannedDepositorName: "",
  description: ""
};

function normalizeOptionalValue(value) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function getProductFormFromProduct(product) {
  return {
    title: product.title ?? "",
    productName: product.product_name ?? "",
    companyName: product.company_name ?? "",
    optionName: product.option_name ?? "",
    reviewType: product.review_type ?? "",
    plannedDepositorName: product.planned_depositor_name ?? "",
    description: product.description ?? ""
  };
}

function getProductPayload(productForm, adminId) {
  const title = productForm.title.trim();
  const productName = productForm.productName.trim();

  if (!title || !productName) {
    return {
      errorMessage: "상품 제목과 품명은 필수입니다."
    };
  }

  return {
    payload: {
      manager_id: adminId,
      title,
      product_name: productName,
      description: normalizeOptionalValue(productForm.description),
      company_name: normalizeOptionalValue(productForm.companyName),
      option_name: normalizeOptionalValue(productForm.optionName),
      review_type: normalizeOptionalValue(productForm.reviewType),
      planned_depositor_name: normalizeOptionalValue(productForm.plannedDepositorName)
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

export default function AdminReviewReceivePage({ viewMode = "all" }) {
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
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
  const [productForm, setProductForm] = useState(INITIAL_PRODUCT_FORM);
  const productFormRef = useRef(null);
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

  const scopeMessage = includeCompanyData
    ? scopeInfo.companyName
      ? `현재 계정과 같은 회사(${scopeInfo.companyName}) 소속 관리자 데이터까지 함께 표시합니다.`
      : "현재 계정에 회사 정보가 없어 내 계정 데이터만 표시합니다."
    : "현재 로그인한 계정의 데이터만 표시합니다.";

  const filteredProducts = products.filter((product) => {
    if (viewMode === "all") {
      return true;
    }

    return getReviewReceiveProductStatus(product) === viewMode;
  });

  const statusSummaryText =
    viewMode === "completed"
      ? "모든 submission의 입금완료체크가 true인 상품만 표시합니다."
      : viewMode === "in_progress"
        ? "submission이 없거나, 입금완료체크가 하나라도 false인 상품을 표시합니다."
        : "전체 상품 리스트를 표시합니다.";

  const openCreateModal = () => {
    setProductModalErrorMessage("");
    setEditingProduct(null);
    setProductForm(INITIAL_PRODUCT_FORM);
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

  const closeProductModal = () => {
    if (isSavingProduct) {
      return;
    }

    setProductModalErrorMessage("");
    setEditingProduct(null);
    setProductForm(INITIAL_PRODUCT_FORM);
    setIsProductModalOpen(false);
  };

  const handleProductFormChange = (event) => {
    const { name, value } = event.target;

    setProductForm((prev) => ({
      ...prev,
      [name]: value
    }));
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
    setProductForm(INITIAL_PRODUCT_FORM);
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
                  <th>담당자</th>
                  <th>상품 제목</th>
                  <th>업체명</th>
                  <th>품명</th>
                  <th>옵션</th>
                  <th>리뷰형태</th>
                  <th>설명</th>
                  <th>생성일</th>
                  <th className="review-receive-actions-column">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      {products.length === 0
                        ? "등록된 리뷰받기 상품이 없습니다."
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
                      <td>{product.created_at ? new Date(product.created_at).toLocaleDateString("ko-KR") : "-"}</td>
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

      {isProductModalOpen && (
        <div className="review-receive-modal-backdrop" role="presentation" onClick={closeProductModal}>
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
