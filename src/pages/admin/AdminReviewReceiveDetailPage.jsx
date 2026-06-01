import { Fragment, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import PhotoViewerModal from "../../components/admin/product-detail/PhotoViewerModal";
import AppAlertDialog from "../../components/common/AppAlertDialog";
import AppToast from "../../components/common/AppToast";
import { useAppToast } from "../../hooks/useAppToast";
import { useBackdropDismiss } from "../../hooks/useBackdropDismiss";
import { useModalEnterConfirm } from "../../hooks/useModalEnterConfirm";
import { ADMIN_STORAGE_KEY, getProductDepositGbLabel } from "../../constants/admin";
import {
  createReviewReceiveSubmission,
  deleteReviewReceiveSubmission,
  fetchReviewReceiveEvidencePhotos,
  fetchReviewReceiveDetail,
  updateReviewReceiveSubmission,
  updateReviewReceiveSubmissionStatus
} from "../../services/reviewReceive";
import {
  filterReviewReceiveRows,
  formatPurchaseBuyerClipboardText,
  formatReviewReceiveAccount,
  parseReviewReceiveAccount
} from "../../utils/reviewReceiveTable";
import {
  buildReviewReceiveRowPositionMaps,
  mergeReviewReceiveRows,
  replaceReviewReceiveRows,
  sortReviewReceiveRowsByCreatedAt,
  splitReviewReceiveRows
} from "../../utils/reviewReceiveRows";
import {
  buildPurchaseAssignPreview,
  buildPurchaseBulkPreview,
  parseExistingRowPurchaseInfoInput,
  parseInlinePurchaseInput,
  parsePurchaseAssignLines
} from "../../utils/reviewReceiveBulkInput";
import {
  REVIEW_VERIFY_REQUIRED_FIELDS,
  formatMissingFieldLabels,
  getMissingRequiredFieldLabels
} from "../../utils/reviewVerifyValidation";

function parseAmount(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function parseReviewFee(value) {
  const trimmedValue = String(value ?? "").trim();

  if (!trimmedValue) {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : Number.NaN;
}

function getUniqueReviewFees(rows = []) {
  return Array.from(new Set(rows.map((row) => row?.review_fee).filter((value) => value != null)));
}

function getDefaultReviewFee(rows = []) {
  const reviewFees = getUniqueReviewFees(rows);
  return reviewFees.length === 1 ? reviewFees[0] : null;
}

function formatReviewFeeSummary(rows = []) {
  const reviewFees = getUniqueReviewFees(rows);

  if (reviewFees.length === 0) {
    return "-";
  }

  if (reviewFees.length === 1) {
    return reviewFees[0];
  }

  return `혼합 (${reviewFees.length})`;
}

function buildInlinePurchaseInfoText(row, options = {}) {
  const { includeAssignName = true } = options;
  const accountChunk = row.accountInfoInput?.trim()
    ? row.accountInfoInput.trim()
    : [row.bank_name, row.bank_account, row.account_holder]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(" ");
  const amountText =
    row.amountInput != null && String(row.amountInput).trim() !== ""
      ? String(row.amountInput).trim()
      : row.amount == null
        ? ""
        : String(row.amount);
  const orderNumber = String(row.order_number ?? "").trim();
  const shouldUseAssignFirst =
    includeAssignName && (String(row.assign_name ?? "").trim() !== "" || !/^\d+$/.test(orderNumber));

  const parts = shouldUseAssignFirst
    ? [
        String(row.assign_name ?? "").trim(),
        orderNumber,
        String(row.buyer_name ?? "").trim(),
        String(row.recipient_name ?? "").trim(),
        String(row.purchase_account ?? "").trim(),
        String(row.contact ?? "").trim(),
        String(row.address ?? "").trim(),
        accountChunk,
        amountText
      ]
    : [
        orderNumber,
        String(row.buyer_name ?? "").trim(),
        String(row.recipient_name ?? "").trim(),
        String(row.purchase_account ?? "").trim(),
        String(row.contact ?? "").trim(),
        String(row.address ?? "").trim(),
        accountChunk,
        amountText
      ];

  if (parts.every((part) => !String(part ?? "").trim())) {
    return "";
  }

  return parts.join("/");
}

function buildEditableRow(item) {
  return {
    ...item,
    accountInfoInput: formatReviewReceiveAccount(item.bank_name, item.bank_account, item.account_holder),
    amountInput: item.amount == null ? "" : String(item.amount),
    reviewFeeInput: item.review_fee == null ? "" : String(item.review_fee),
    inlinePurchaseInfoInput: "",
    inlinePurchaseInfoMessage: "",
    inlinePurchaseInfoMessageType: "info",
    photos: item.photos ?? [],
    isDirty: false,
    isNew: false,
    isEditing: false
  };
}

function createEmptyRow(productId, reviewFee = null) {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    product_id: Number(productId),
    assign_name: "",
    order_number: "",
    buyer_name: "",
    recipient_name: "",
    purchase_account: "",
    contact: "",
    address: "",
    bank_name: "",
    bank_account: "",
    account_holder: "",
    accountInfoInput: "",
    amount: null,
    amountInput: "",
    review_fee: reviewFee,
    reviewFeeInput: reviewFee == null ? "" : String(reviewFee),
    inlinePurchaseInfoInput: "",
    inlinePurchaseInfoMessage: "",
    inlinePurchaseInfoMessageType: "info",
    is_review_verified: false,
    is_deposit_verified: false,
    deposited_at: "",
    actual_depositor_name: "",
    created_at: new Date().toISOString(),
    photos: [],
    isDirty: true,
    isNew: true,
    isEditing: true
  };
}

function buildBlankPurchaseAssignPayload(productId, assignName, reviewFee = null) {
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
    review_fee: reviewFee,
    is_review_verified: false,
    is_deposit_verified: false,
    deposited_at: null,
    actual_depositor_name: null
  };
}

export default function AdminReviewReceiveDetailPage() {
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [updatingRowId, setUpdatingRowId] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [deleteTargetRow, setDeleteTargetRow] = useState(null);
  const [sectionSearchQueries, setSectionSearchQueries] = useState({
    purchase: "",
    review: "",
    complete: ""
  });
  const [isPurchaseBulkModalOpen, setIsPurchaseBulkModalOpen] = useState(false);
  const [purchaseBulkAssignName, setPurchaseBulkAssignName] = useState("");
  const [purchaseBulkText, setPurchaseBulkText] = useState("");
  const [purchaseBulkMessage, setPurchaseBulkMessage] = useState("");
  const [purchaseBulkMessageType, setPurchaseBulkMessageType] = useState("info");
  const [isApplyingPurchaseBulk, setIsApplyingPurchaseBulk] = useState(false);
  const [isPurchaseAssignModalOpen, setIsPurchaseAssignModalOpen] = useState(false);
  const [purchaseAssignText, setPurchaseAssignText] = useState("");
  const [purchaseAssignMessage, setPurchaseAssignMessage] = useState("");
  const [purchaseAssignMessageType, setPurchaseAssignMessageType] = useState("info");
  const [isApplyingPurchaseAssign, setIsApplyingPurchaseAssign] = useState(false);
  const [purchaseAssignConflictDialog, setPurchaseAssignConflictDialog] = useState({
    isOpen: false,
    step: "conflict",
    duplicatedNumbers: ""
  });
  const [isReviewBatchModalOpen, setIsReviewBatchModalOpen] = useState(false);
  const [reviewBatchDepositedAt, setReviewBatchDepositedAt] = useState("");
  const [reviewBatchActualDepositorName, setReviewBatchActualDepositorName] = useState("");
  const [reviewBatchMessage, setReviewBatchMessage] = useState("");
  const [reviewBatchMessageType, setReviewBatchMessageType] = useState("info");
  const [isApplyingReviewBatch, setIsApplyingReviewBatch] = useState(false);
  const [isReviewFeeBatchDialogOpen, setIsReviewFeeBatchDialogOpen] = useState(false);
  const [reviewFeeBatchStartRow, setReviewFeeBatchStartRow] = useState("");
  const [reviewFeeBatchEndRow, setReviewFeeBatchEndRow] = useState("");
  const [reviewFeeBatchValue, setReviewFeeBatchValue] = useState("");
  const [reviewFeeBatchMessage, setReviewFeeBatchMessage] = useState("");
  const [isApplyingReviewFeeBatch, setIsApplyingReviewFeeBatch] = useState(false);
  const [reviewBatchConfirmDialog, setReviewBatchConfirmDialog] = useState({
    isOpen: false,
    missingLabels: []
  });
  const [reviewVerifyConfirmDialog, setReviewVerifyConfirmDialog] = useState({
    isOpen: false,
    rowId: null,
    missingLabels: []
  });
  const [depositVerifyConfirmDialog, setDepositVerifyConfirmDialog] = useState({
    isOpen: false,
    rowId: null,
    missingLabels: []
  });
  const [photoViewer, setPhotoViewer] = useState({
    isOpen: false,
    photos: [],
    activeIndex: 0
  });
  const purchaseAssignConflictResolverRef = useRef(null);
  const { toast, showToast } = useAppToast();

  useEffect(() => {
    const loadDetail = async () => {
      setIsLoading(true);
      setErrorMessage("");

      const {
        productResult: { data: productData, error: productError },
        submissionsResult: { data: submissionData, error: submissionsError }
      } = await fetchReviewReceiveDetail(productId, adminId);

      if (productError || submissionsError) {
        setErrorMessage(productError?.message ?? submissionsError?.message ?? "데이터를 불러오지 못했습니다.");
        setProduct(null);
        setRows([]);
        setIsLoading(false);
        return;
      }

      if (!productData) {
        setErrorMessage("접근 가능한 리뷰받기 상품이 없습니다.");
        setProduct(null);
        setRows([]);
        setIsLoading(false);
        return;
      }

      const submissionIds = (submissionData ?? []).map((item) => item.id);
      const { data: photoData, error: photoError } = await fetchReviewReceiveEvidencePhotos(submissionIds);

      if (photoError) {
        setErrorMessage(photoError.message);
        setProduct(null);
        setRows([]);
        setIsLoading(false);
        return;
      }

      const photoMap = (photoData ?? []).reduce((acc, photo) => {
        if (!acc[photo.submission_id]) acc[photo.submission_id] = [];
        acc[photo.submission_id].push(photo.image_url);
        return acc;
      }, {});

      setProduct(productData);
      setRows(
        sortReviewReceiveRowsByCreatedAt(
        (submissionData ?? []).map((item) =>
          buildEditableRow({
            ...item,
            photos: photoMap[item.id] ?? []
          })
        )
        )
      );
      setIsLoading(false);
    };

    loadDetail();
  }, [adminId, productId]);

  useEffect(() => {
    if (!editingRowId) {
      return undefined;
    }

    const activeRow = rows.find((row) => row.id === editingRowId);

    if (!activeRow || activeRow.isNew || activeRow.isDirty) {
      return undefined;
    }

    const handleDocumentMouseDown = (event) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (
        target.closest(`[data-row-editor-id="${editingRowId}"]`) ||
        target.closest(`[data-row-editor-toggle-id="${editingRowId}"]`)
      ) {
        return;
      }

      setEditingRowId(null);
      setRows((prev) =>
        prev.map((item) =>
          item.id === editingRowId
            ? {
                ...item,
                isEditing: false,
                inlinePurchaseInfoInput: "",
                inlinePurchaseInfoMessage: "",
                inlinePurchaseInfoMessageType: "info"
              }
            : item
        )
      );
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, [editingRowId, rows]);

  const formatAccountInfo = (row) => {
    return row.accountInfoInput?.trim() ? row.accountInfoInput : "-";
  };

  const updateRowLocally = (rowId, updater) => {
    setRows((prev) =>
      prev.map((item) => (item.id === rowId ? { ...item, ...updater(item), isDirty: true } : item))
    );
  };

  const handleFieldChange = (rowId, field, value) => {
    const syncFields = new Set([
      "assign_name",
      "order_number",
      "buyer_name",
      "recipient_name",
      "purchase_account",
      "contact",
      "address",
      "accountInfoInput",
      "amountInput"
    ]);

    updateRowLocally(rowId, (row) => {
      const nextRow = {
        ...row,
        [field]: value
      };

      if (!row.isEditing || !syncFields.has(field)) {
        return nextRow;
      }

      return {
        ...nextRow,
        inlinePurchaseInfoInput: buildInlinePurchaseInfoText(nextRow, { includeAssignName: row.isNew }),
        inlinePurchaseInfoMessage: "",
        inlinePurchaseInfoMessageType: "info"
      };
    });
  };

  const handleInlinePurchaseInfoChange = (rowId, value) => {
    updateRowLocally(rowId, (row) => {
      if (!String(value ?? "").trim()) {
        return {
          inlinePurchaseInfoInput: value,
          inlinePurchaseInfoMessage: "",
          inlinePurchaseInfoMessageType: "info",
          order_number: "",
          buyer_name: "",
          recipient_name: "",
          purchase_account: "",
          contact: "",
          address: "",
          bank_name: "",
          bank_account: "",
          account_holder: "",
          accountInfoInput: "",
          amount: null,
          amountInput: "",
          ...(row.isNew ? { assign_name: "" } : {})
        };
      }

      try {
        const entry = row.isNew ? parseInlinePurchaseInput(value) : parseExistingRowPurchaseInfoInput(value);

        return {
          inlinePurchaseInfoInput: value,
          inlinePurchaseInfoMessage: "입력 형식을 확인했고 각 칸에 바로 반영했습니다.",
          inlinePurchaseInfoMessageType: "success",
          ...(row.isNew ? { assign_name: entry.assign_name || "" } : {}),
          order_number: entry.order_number,
          buyer_name: entry.buyer_name,
          recipient_name: entry.recipient_name,
          purchase_account: entry.purchase_account || "",
          contact: entry.contact,
          address: entry.address,
          bank_name: entry.bank_name,
          bank_account: entry.bank_account,
          account_holder: entry.account_holder,
          accountInfoInput: formatReviewReceiveAccount(entry.bank_name, entry.bank_account, entry.account_holder),
          amount: entry.amount,
          amountInput: String(entry.amount)
        };
      } catch (error) {
        return {
          inlinePurchaseInfoInput: value,
          inlinePurchaseInfoMessage: error.message || "구매정보 입력 형식을 확인해주세요.",
          inlinePurchaseInfoMessageType: "error"
        };
      }
    });
  };

  const handleSectionSearchChange = (sectionKey, value) => {
    setSectionSearchQueries((prev) => ({
      ...prev,
      [sectionKey]: value
    }));
  };

  const handleAddRow = () => {
    setEditingRowId(null);
    setRows((prev) => sortReviewReceiveRowsByCreatedAt([...prev, createEmptyRow(productId, getDefaultReviewFee(prev))]));
  };

  const openPurchaseBulkModal = () => {
    setPurchaseBulkMessage("");
    setPurchaseBulkMessageType("info");
    setIsPurchaseBulkModalOpen(true);
  };

  const closePurchaseBulkModal = () => {
    if (isApplyingPurchaseBulk) return;
    setIsPurchaseBulkModalOpen(false);
  };

  const setPurchaseBulkFeedback = (message, type = "info") => {
    setPurchaseBulkMessage(message);
    setPurchaseBulkMessageType(type);
  };

  const openPurchaseAssignModal = () => {
    setPurchaseAssignMessage("");
    setPurchaseAssignMessageType("info");
    setIsPurchaseAssignModalOpen(true);
  };

  const closePurchaseAssignModal = () => {
    if (isApplyingPurchaseAssign) return;
    setIsPurchaseAssignModalOpen(false);
  };

  const setPurchaseAssignFeedback = (message, type = "info") => {
    setPurchaseAssignMessage(message);
    setPurchaseAssignMessageType(type);
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

  const openReviewBatchModal = () => {
    setReviewBatchMessage("");
    setReviewBatchMessageType("info");
    setIsReviewBatchModalOpen(true);
  };

  const closeReviewBatchModal = () => {
    if (isApplyingReviewBatch) return;
    setIsReviewBatchModalOpen(false);
  };

  const setReviewBatchFeedback = (message, type = "info") => {
    setReviewBatchMessage(message);
    setReviewBatchMessageType(type);
  };

  const openReviewFeeBatchDialog = () => {
    setReviewFeeBatchStartRow("");
    setReviewFeeBatchEndRow("");
    setReviewFeeBatchValue("");
    setReviewFeeBatchMessage("");
    setIsReviewFeeBatchDialogOpen(true);
  };

  const closeReviewFeeBatchDialog = () => {
    if (isApplyingReviewFeeBatch) {
      return;
    }

    setIsReviewFeeBatchDialogOpen(false);
    setReviewFeeBatchMessage("");
  };
  const purchaseBulkBackdropDismissProps = useBackdropDismiss(closePurchaseBulkModal);
  const reviewBatchBackdropDismissProps = useBackdropDismiss(closeReviewBatchModal);
  const purchaseAssignBackdropDismissProps = useBackdropDismiss(closePurchaseAssignModal);
  const purchaseAssignConflictBackdropDismissProps = useBackdropDismiss(() => closePurchaseAssignConflictDialog(null));

  const openRowEditor = (rowId) => {
    setEditingRowId(rowId);
    setRows((prev) =>
      prev.map((item) => ({
        ...item,
        isEditing: item.id === rowId ? true : item.isNew ? item.isEditing : false,
        inlinePurchaseInfoInput:
          item.id === rowId && !item.isNew
            ? buildInlinePurchaseInfoText(item, { includeAssignName: false })
            : item.inlinePurchaseInfoInput,
        inlinePurchaseInfoMessage: item.id === rowId ? "" : item.inlinePurchaseInfoMessage,
        inlinePurchaseInfoMessageType: item.id === rowId ? "info" : item.inlinePurchaseInfoMessageType
      }))
    );
  };

  const closeRowEditor = (rowId) => {
    setEditingRowId((prev) => (prev === rowId ? null : prev));
    setRows((prev) =>
      prev.map((item) =>
        item.id === rowId
          ? {
              ...item,
              isEditing: item.isNew ? item.isEditing : false,
              inlinePurchaseInfoInput: item.isNew ? item.inlinePurchaseInfoInput : "",
              inlinePurchaseInfoMessage: "",
              inlinePurchaseInfoMessageType: "info"
            }
          : item
      )
    );
  };

  const applyReviewVerifiedChange = async (row, checked) => {
    setUpdatingRowId(row.id);
    setErrorMessage("");

    const updates = checked
      ? { is_review_verified: true }
      : {
          is_review_verified: false,
          is_deposit_verified: false,
          deposited_at: null,
          actual_depositor_name: null
        };

    const { error } = await updateReviewReceiveSubmissionStatus(row.id, updates);

    if (error) {
      setErrorMessage(error.message);
      setUpdatingRowId(null);
      return;
    }

    setRows((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? {
              ...item,
              is_review_verified: checked,
              is_deposit_verified: checked ? item.is_deposit_verified : false,
              deposited_at: checked ? item.deposited_at : "",
              actual_depositor_name: checked ? item.actual_depositor_name : ""
            }
          : item
      )
    );
    setUpdatingRowId(null);
  };

  const handleReviewVerifiedChange = async (row, checked) => {
    if (row.isNew) {
      updateRowLocally(row.id, () => ({
        is_review_verified: checked,
        is_deposit_verified: checked ? row.is_deposit_verified : false,
        deposited_at: checked ? row.deposited_at : "",
        actual_depositor_name: checked ? row.actual_depositor_name : ""
      }));
      return;
    }

    if (checked) {
      const missingLabels = getMissingRequiredFieldLabels([row], REVIEW_VERIFY_REQUIRED_FIELDS);

      if (missingLabels.length > 0) {
        setReviewVerifyConfirmDialog({
          isOpen: true,
          rowId: row.id,
          missingLabels
        });
        return;
      }
    }

    await applyReviewVerifiedChange(row, checked);
  };

  const closeReviewVerifyConfirmDialog = () => {
    if (updatingRowId !== null) {
      return;
    }

    setReviewVerifyConfirmDialog({
      isOpen: false,
      rowId: null,
      missingLabels: []
    });
  };

  const confirmReviewVerifyApply = async () => {
    const targetRowId = reviewVerifyConfirmDialog.rowId;
    const targetRow = rows.find((item) => item.id === targetRowId);

    setReviewVerifyConfirmDialog({
      isOpen: false,
      rowId: null,
      missingLabels: []
    });

    if (!targetRow) {
      return;
    }

    await applyReviewVerifiedChange(targetRow, true);
  };

  const applyDepositVerifiedChange = async (row, checked) => {
    setUpdatingRowId(row.id);
    setErrorMessage("");

    const updates = checked
      ? { is_deposit_verified: true }
      : {
          is_deposit_verified: false,
          deposited_at: null,
          actual_depositor_name: null
        };

    const { error } = await updateReviewReceiveSubmissionStatus(row.id, updates);

    if (error) {
      setErrorMessage(error.message);
      setUpdatingRowId(null);
      return;
    }

    setRows((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? {
              ...item,
              is_deposit_verified: checked,
              deposited_at: checked ? item.deposited_at : "",
              actual_depositor_name: checked ? item.actual_depositor_name : ""
            }
          : item
      )
    );
    setUpdatingRowId(null);
  };

  const handleDepositVerifiedChange = async (row, checked) => {
    if (row.isNew) {
      updateRowLocally(row.id, () => ({
        is_deposit_verified: checked,
        deposited_at: checked ? row.deposited_at : "",
        actual_depositor_name: checked ? row.actual_depositor_name : ""
      }));
      return;
    }

    if (checked) {
      const missingLabels = [
        ...(!String(row.deposited_at ?? "").trim() ? ["입금일"] : []),
        ...(!String(row.actual_depositor_name ?? "").trim() ? ["실제입금자명"] : [])
      ];

      if (missingLabels.length > 0) {
        setDepositVerifyConfirmDialog({
          isOpen: true,
          rowId: row.id,
          missingLabels
        });
        return;
      }
    }

    await applyDepositVerifiedChange(row, checked);
  };

  const closeDepositVerifyConfirmDialog = () => {
    if (updatingRowId !== null) {
      return;
    }

    setDepositVerifyConfirmDialog({
      isOpen: false,
      rowId: null,
      missingLabels: []
    });
  };

  const confirmDepositVerifyApply = async () => {
    const targetRowId = depositVerifyConfirmDialog.rowId;
    const targetRow = rows.find((item) => item.id === targetRowId);

    setDepositVerifyConfirmDialog({
      isOpen: false,
      rowId: null,
      missingLabels: []
    });

    if (!targetRow) {
      return;
    }

    await applyDepositVerifiedChange(targetRow, true);
  };

  const handleReviewCompletionMetaSave = async (row) => {
    if (row.isNew) {
      return;
    }

    setUpdatingRowId(row.id);
    setErrorMessage("");

    const { error } = await updateReviewReceiveSubmission(row.id, {
      deposited_at: row.deposited_at || null,
      actual_depositor_name: row.actual_depositor_name?.trim() || null
    });

    if (error) {
      setErrorMessage(error.message);
      setUpdatingRowId(null);
      return;
    }

    setRows((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? { ...item, isDirty: false, actual_depositor_name: row.actual_depositor_name?.trim() || "" }
          : item
      )
    );
    setUpdatingRowId(null);
  };

  const handleSaveRow = async (row) => {
    setUpdatingRowId(row.id);
    setErrorMessage("");

    const accountInfo = parseReviewReceiveAccount(row.accountInfoInput);
    const reviewFee = parseReviewFee(row.reviewFeeInput);

    if (Number.isNaN(reviewFee)) {
      setErrorMessage("리뷰비는 0 이상의 숫자로 입력해주세요.");
      setUpdatingRowId(null);
      return;
    }

    const payload = {
      product_id: Number(productId),
      assign_name: row.assign_name?.trim() || null,
      order_number: row.order_number?.trim() || null,
      buyer_name: row.buyer_name?.trim() || null,
      recipient_name: row.recipient_name?.trim() || null,
      purchase_account: row.purchase_account?.trim() || null,
      contact: row.contact?.trim() || null,
      address: row.address?.trim() || null,
      amount: parseAmount(row.amountInput),
      review_fee: reviewFee,
      is_review_verified: Boolean(row.is_review_verified),
      is_deposit_verified: Boolean(row.is_deposit_verified),
      deposited_at: row.deposited_at || null,
      actual_depositor_name: row.actual_depositor_name?.trim() || null,
      ...accountInfo
    };

    const result = row.isNew
      ? await createReviewReceiveSubmission(payload)
      : await updateReviewReceiveSubmission(row.id, payload);

    if (result.error) {
      setErrorMessage(result.error.message);
      setUpdatingRowId(null);
      return;
    }

    const savedRow = buildEditableRow({
      ...(result.data ?? {}),
      photos: row.photos ?? []
    });

    setRows((prev) =>
      sortReviewReceiveRowsByCreatedAt(
        prev.map((item) => (item.id === row.id ? savedRow : item))
      )
    );
    setEditingRowId(null);
    setUpdatingRowId(null);
  };

  const handleDeleteRow = async (row) => {
    if (row.isNew) {
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      if (editingRowId === row.id) {
        setEditingRowId(null);
      }
      return;
    }

    setDeleteTargetRow(row);
  };

  const closeDeleteRowDialog = () => {
    if (updatingRowId === deleteTargetRow?.id) {
      return;
    }

    setDeleteTargetRow(null);
  };

  const confirmDeleteRow = async () => {
    if (!deleteTargetRow) {
      return;
    }

    const row = deleteTargetRow;

    setUpdatingRowId(row.id);
    setErrorMessage("");

    const { error } = await deleteReviewReceiveSubmission(row.id);

    if (error) {
      setErrorMessage(error.message);
      setUpdatingRowId(null);
      return;
    }

    setRows((prev) => prev.filter((item) => item.id !== row.id));
    if (editingRowId === row.id) {
      setEditingRowId(null);
    }
    setDeleteTargetRow(null);
    setUpdatingRowId(null);
  };

  const handlePurchaseBulkApply = async () => {
    setPurchaseBulkFeedback("");

    if (purchaseBulkPreview.status !== "ready") {
      setPurchaseBulkFeedback(purchaseBulkPreview.message, "error");
      return;
    }

    setIsApplyingPurchaseBulk(true);

    const targetRows = purchaseBulkPreview.targetRows;
    const parsedEntries = purchaseBulkPreview.parsedEntries;
    const shouldCreateNewRows = purchaseBulkPreview.create_new_rows;
    const savedRows = [];
    const createdRows = [];

    for (let index = 0; index < parsedEntries.length; index += 1) {
      const row = shouldCreateNewRows ? null : targetRows[index];
      const entry = parsedEntries[index];
      const reviewFee = row ? parseReviewFee(row.reviewFeeInput) : defaultReviewFee;

      if (Number.isNaN(reviewFee)) {
        if (savedRows.length > 0 || createdRows.length > 0) {
          setRows((prev) => mergeReviewReceiveRows(prev, savedRows, createdRows));
        }

        setPurchaseBulkFeedback(
          `${index + 1}번째 저장 전 리뷰비 값을 확인해주세요. 리뷰비는 0 이상의 숫자만 입력할 수 있습니다.`,
          "error"
        );
        setIsApplyingPurchaseBulk(false);
        return;
      }

      const payload = {
        product_id: Number(productId),
        assign_name: (entry.assign_name ?? row?.assign_name ?? purchaseBulkAssignName)?.trim() || null,
        order_number: entry.order_number,
        buyer_name: entry.buyer_name,
        recipient_name: entry.recipient_name,
        purchase_account: entry.purchase_account?.trim() || null,
        contact: entry.contact,
        address: entry.address,
        amount: entry.amount,
        review_fee: reviewFee,
        deposited_at: row?.deposited_at || null,
        actual_depositor_name: row?.actual_depositor_name?.trim() || null,
        is_review_verified: Boolean(row?.is_review_verified),
        is_deposit_verified: Boolean(row?.is_deposit_verified),
        bank_name: entry.bank_name,
        bank_account: entry.bank_account,
        account_holder: entry.account_holder
      };

      const result = row
        ? await updateReviewReceiveSubmission(row.id, payload)
        : await createReviewReceiveSubmission(payload);

      if (result.error) {
        if (savedRows.length > 0 || createdRows.length > 0) {
          setRows((prev) => mergeReviewReceiveRows(prev, savedRows, createdRows));
        }

        setPurchaseBulkFeedback(
          `${index + 1}번째 저장 중 오류가 발생했습니다. 수정 ${savedRows.length}건, 추가 ${createdRows.length}건만 반영되었습니다.`,
          "error"
        );
        setIsApplyingPurchaseBulk(false);
        return;
      }

      const savedRow = buildEditableRow({
        ...(result.data ?? {}),
        photos: row?.photos ?? []
      });

      if (row) {
        savedRows.push(savedRow);
      } else {
        createdRows.push(savedRow);
      }
    }

    setRows((prev) => mergeReviewReceiveRows(prev, savedRows, createdRows));
    setPurchaseBulkText("");
    showToast(
      shouldCreateNewRows
        ? `${createdRows.length}건의 새 행을 추가했습니다.`
        : `${savedRows.length}건을 일괄입력했습니다.`,
      "success"
    );
    setIsApplyingPurchaseBulk(false);
    setIsPurchaseBulkModalOpen(false);
  };

  const handleCopyPurchaseBuyers = async () => {
    if (sortedRows.length === 0) {
      showToast("복사할 제출 데이터가 없습니다.", "error");
      return;
    }

    const text = formatPurchaseBuyerClipboardText(sortedRows, rowNumberMap);

    try {
      await navigator.clipboard.writeText(text);
      showToast(`${sortedRows.length}건을 클립보드에 복사했습니다.`, "success");
    } catch (error) {
      showToast("클립보드 복사에 실패했습니다.", "error");
    }
  };

  const handlePurchaseAssignApply = async () => {
    setPurchaseAssignFeedback("");

    let parsedRows;

    try {
      parsedRows = parsePurchaseAssignLines(purchaseAssignText);
    } catch (error) {
      setPurchaseAssignFeedback(error.message || "구매자 일괄 입력 형식을 확인해주세요.", "error");
      return;
    }

    const overlappingEntries = parsedRows.filter(
      (entry) => entry.row_number != null && rowByNumberMap[entry.row_number]
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

    for (let index = 0; index < parsedRows.length; index += 1) {
      const entry = parsedRows[index];
      const targetRow =
        purchaseAssignMode !== "append" && entry.row_number != null ? rowByNumberMap[entry.row_number] ?? null : null;
      const payload =
        purchaseAssignMode === "overwrite-rename-only"
          ? { assign_name: entry.assign_name?.trim() || null }
          : buildBlankPurchaseAssignPayload(
              productId,
              entry.assign_name,
              targetRow?.review_fee ?? defaultReviewFee
            );
      const result = targetRow
        ? await updateReviewReceiveSubmission(targetRow.id, payload)
        : await createReviewReceiveSubmission(payload);

      if (result.error) {
        if (createdRows.length > 0 || updatedRows.size > 0) {
          setRows((prev) => mergeReviewReceiveRows(prev, updatedRows, createdRows));
        }

        setPurchaseAssignFeedback(
          `${index + 1}번째 처리 중 오류가 발생했습니다. 덮어쓰기 ${overwrittenCount}건, 추가 ${createdCount}건만 반영되었습니다.`,
          "error"
        );
        setIsApplyingPurchaseAssign(false);
        return;
      }

      const savedRow = buildEditableRow({
        ...(result.data ?? {}),
        photos: targetRow?.photos ?? []
      });

      if (targetRow) {
        updatedRows.set(targetRow.id, savedRow);
        overwrittenCount += 1;
      } else {
        createdRows.push(savedRow);
        createdCount += 1;
      }
    }

    setRows((prev) => mergeReviewReceiveRows(prev, updatedRows, createdRows));
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
  };

  const applyReviewBatch = async () => {
    setIsApplyingReviewBatch(true);

    const savedRows = [];

    for (let index = 0; index < filteredReviewCompletedRows.length; index += 1) {
      const row = filteredReviewCompletedRows[index];
      const result = await updateReviewReceiveSubmission(row.id, {
        is_deposit_verified: true,
        deposited_at: reviewBatchDepositedAt || null,
        actual_depositor_name: reviewBatchActualDepositorName.trim() || null
      });

      if (result.error) {
        if (savedRows.length > 0) {
          setRows((prev) => replaceReviewReceiveRows(prev, savedRows));
        }

        setReviewBatchFeedback(
          `${index + 1}번째 저장 중 오류가 발생했습니다. ${savedRows.length}건만 반영되었습니다.`,
          "error"
        );
        setIsApplyingReviewBatch(false);
        return;
      }

      savedRows.push(
        buildEditableRow({
          ...(result.data ?? {}),
          photos: row.photos ?? []
        })
      );
    }

    setRows((prev) => replaceReviewReceiveRows(prev, savedRows));
    showToast(`${savedRows.length}건을 전체완료로 처리했습니다.`, "success");
    setIsApplyingReviewBatch(false);
    setIsReviewBatchModalOpen(false);
  };

  const handleReviewBatchApply = async () => {
    setReviewBatchFeedback("");

    if (filteredReviewCompletedRows.length === 0) {
      setReviewBatchFeedback("리뷰완료 상태의 제출 데이터가 없습니다.", "error");
      return;
    }

    const missingLabels = [
      ...(!reviewBatchDepositedAt ? ["입금일"] : []),
      ...(!reviewBatchActualDepositorName.trim() ? ["실제입금자명"] : [])
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

  const closeReviewBatchConfirmDialog = () => {
    if (isApplyingReviewBatch) {
      return;
    }

    setReviewBatchConfirmDialog({
      isOpen: false,
      missingLabels: []
    });
  };

  const confirmReviewBatchApply = async () => {
    setReviewBatchConfirmDialog({
      isOpen: false,
      missingLabels: []
    });
    await applyReviewBatch();
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

  const { purchaseRows: purchaseCompletedRows, reviewRows: reviewCompletedRows, completeRows: fullyCompletedRows } =
    splitReviewReceiveRows(rows);
  const defaultReviewFee = getDefaultReviewFee(rows);
  const plannedDepositorName = product?.planned_depositor_name ?? "";
  const filteredPurchaseCompletedRows = filterReviewReceiveRows(
    purchaseCompletedRows,
    sectionSearchQueries.purchase,
    plannedDepositorName
  );
  const filteredReviewCompletedRows = filterReviewReceiveRows(
    reviewCompletedRows,
    sectionSearchQueries.review,
    plannedDepositorName
  );
  const filteredFullyCompletedRows = filterReviewReceiveRows(
    fullyCompletedRows,
    sectionSearchQueries.complete,
    plannedDepositorName
  );
  const purchaseBulkPreview = buildPurchaseBulkPreview(
    purchaseBulkAssignName,
    purchaseBulkText,
    filteredPurchaseCompletedRows
  );

  const renderEditableCell = (row, displayValue, inputNode) => (
    <td onDoubleClick={() => openRowEditor(row.id)}>
      {row.isEditing ? inputNode : displayValue || "-"}
    </td>
  );

  const { sortedRows, rowNumberMap, rowByNumberMap, maxRowNumber } = buildReviewReceiveRowPositionMaps(rows);
  const purchaseAssignPreview = buildPurchaseAssignPreview(purchaseAssignText, rowByNumberMap, maxRowNumber);
  const purchaseBulkEnterConfirm = useModalEnterConfirm({
    isOpen: isPurchaseBulkModalOpen,
    isDisabled: isApplyingPurchaseBulk || purchaseBulkPreview.status !== "ready",
    actionLabel: "구매정보 입력 완료",
    confirmButtonLabel: "완료하기",
    onConfirm: handlePurchaseBulkApply
  });
  const reviewBatchEnterConfirm = useModalEnterConfirm({
    isOpen: isReviewBatchModalOpen,
    isDisabled: isApplyingReviewBatch || filteredReviewCompletedRows.length === 0,
    actionLabel: "리뷰완료 일괄처리",
    confirmButtonLabel: "확인",
    onConfirm: handleReviewBatchApply
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

  const handleReviewFeeBatchApply = async () => {
    const start = Number(reviewFeeBatchStartRow);
    const end = Number(reviewFeeBatchEndRow);
    const parsedReviewFee = parseReviewFee(reviewFeeBatchValue);

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) {
      setReviewFeeBatchMessage("순번은 1 이상의 정수로 입력해주세요.");
      return;
    }

    if (start > end) {
      setReviewFeeBatchMessage("시작 순번은 끝 순번보다 클 수 없습니다.");
      return;
    }

    if (parsedReviewFee == null || Number.isNaN(parsedReviewFee)) {
      setReviewFeeBatchMessage("리뷰비는 0 이상의 숫자로 입력해주세요.");
      return;
    }

    const targetRows = filteredPurchaseCompletedRows.filter((row) => {
      const rowNumber = rowNumberMap[row.id];
      return !row.isNew && Number.isInteger(rowNumber) && rowNumber >= start && rowNumber <= end;
    });

    if (targetRows.length === 0) {
      setReviewFeeBatchMessage("지정한 순번 범위에 저장된 구매완료 행이 없습니다.");
      return;
    }

    setIsApplyingReviewFeeBatch(true);
    setReviewFeeBatchMessage("");

    const updatedRows = [];

    for (let index = 0; index < targetRows.length; index += 1) {
      const row = targetRows[index];
      const result = await updateReviewReceiveSubmission(row.id, {
        review_fee: parsedReviewFee
      });

      if (result.error) {
        if (updatedRows.length > 0) {
          const updatedMap = new Map(updatedRows.map((item) => [item.id, item]));
          setRows((prev) => prev.map((item) => updatedMap.get(item.id) ?? item));
        }

        setReviewFeeBatchMessage(
          `${rowNumberMap[row.id] ?? start + index}번 저장 중 오류가 발생했습니다. ${updatedRows.length}건만 반영되었습니다.`
        );
        setIsApplyingReviewFeeBatch(false);
        return;
      }

      updatedRows.push({
        ...row,
        ...result.data,
        review_fee: result.data?.review_fee ?? parsedReviewFee,
        reviewFeeInput: String(result.data?.review_fee ?? parsedReviewFee)
      });
    }

    if (updatedRows.length > 0) {
      const updatedMap = new Map(updatedRows.map((item) => [item.id, item]));
      setRows((prev) => prev.map((item) => updatedMap.get(item.id) ?? item));
    }

    setIsApplyingReviewFeeBatch(false);
    setIsReviewFeeBatchDialogOpen(false);
    showToast(`리뷰비 ${updatedRows.length}건을 일괄 입력했습니다.`, "success");
  };

  const renderTableColumns = (sectionKey) => (
    <colgroup>
      <col className="review-col-index" />
      <col className="review-col-assign" />
      <col className="review-col-order" />
      <col className="review-col-name" />
      <col className="review-col-name" />
      <col className="review-col-purchase-account" />
      <col className="review-col-contact" />
      <col className="review-col-address" />
      <col className="review-col-account" />
      <col className="review-col-amount" />
      <col className="review-col-amount" />
      <col className="review-col-photo" />
      <col className="review-col-planned-depositor" />
      <col className="review-col-check" />
      <col className="review-col-check" />
      {sectionKey !== "purchase" && <col className="review-col-date" />}
      {sectionKey !== "purchase" && <col className="review-col-actual-depositor" />}
      {sectionKey === "purchase" && <col className="review-col-actions" />}
    </colgroup>
  );

  const renderSection = (sectionKey, title, description, totalRows, filteredRows) => {
    const searchValue = sectionSearchQueries[sectionKey];
    const hasSearchQuery = Boolean(searchValue.trim());
    const countLabel =
      totalRows.length === filteredRows.length ? `${filteredRows.length}건` : `${filteredRows.length}/${totalRows.length}건`;
    const emptyMessage =
      totalRows.length === 0
        ? `${title} 상태의 제출 데이터가 없습니다.`
        : hasSearchQuery
          ? "검색 결과가 없습니다."
          : `${title} 상태의 제출 데이터가 없습니다.`;

    return (
      <section className="dashboard-panel review-receive-section" aria-label={title}>
        <div className="review-receive-section-header">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <span className="status-badge">{countLabel}</span>
        </div>

        <div className="review-receive-section-toolbar">
          {sectionKey === "purchase" && (
            <div className="review-receive-toolbar-actions">
              <div className="review-receive-toolbar-button-row">
                <button type="button" className="admin-secondary-button" onClick={handleCopyPurchaseBuyers}>
                  구매자 복사하기
                </button>
                <button type="button" className="admin-secondary-button" onClick={openPurchaseAssignModal}>
                  구매자 일괄 입력
                </button>
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={openReviewFeeBatchDialog}
                  disabled={filteredPurchaseCompletedRows.length === 0}
                >
                  리뷰비 일괄 입력하기
                </button>
                <button type="button" className="admin-primary-button" onClick={openPurchaseBulkModal}>
                  구매정보 입력하기
                </button>
              </div>
            </div>
          )}
          {sectionKey === "review" && (
            <div className="review-receive-toolbar-actions">
              <button
                type="button"
                className="admin-primary-button"
                onClick={openReviewBatchModal}
                disabled={filteredReviewCompletedRows.length === 0}
              >
                일괄처리하기
              </button>
            </div>
          )}
          <input
            type="search"
            className="review-receive-search-input"
            value={searchValue}
            onChange={(event) => handleSectionSearchChange(sectionKey, event.target.value)}
            placeholder={`${title} 섹션 검색`}
            aria-label={`${title} 섹션 검색`}
          />
        </div>

        <div className="table-scroll-wrap">
          <table className={`review-receive-table review-receive-table-${sectionKey}`}>
            {renderTableColumns(sectionKey)}
            <thead>
              <tr>
                <th>순번</th>
                <th>배정</th>
              <th>주문번호</th>
              <th>구매자</th>
              <th>수취인</th>
              <th>구매계정</th>
              <th>연락처</th>
              <th>주소</th>
              <th>계좌</th>
              <th>금액</th>
              <th>리뷰비</th>
              <th>사진</th>
              <th>입금자명(예정)</th>
              <th>리뷰완료</th>
              <th>입금완료</th>
              {sectionKey !== "purchase" && <th>입금일</th>}
              {sectionKey !== "purchase" && <th>실제입금자명</th>}
              {sectionKey === "purchase" && <th>관리</th>}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={sectionKey === "purchase" ? 16 : 17}>{emptyMessage}</td>
              </tr>
            ) : (
                filteredRows.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      className={row.isNew ? "review-receive-row is-new" : row.isDirty ? "review-receive-row is-dirty" : "review-receive-row"}
                      data-row-editor-id={row.id}
                    >
                      <td className="review-row-index">{rowNumberMap[row.id] ?? "-"}</td>
                      {sectionKey === "purchase" && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.assign_name,
                            <input
                              className="table-cell-input"
                              value={row.assign_name ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "assign_name", event.target.value)}
                              placeholder="배정명"
                            />
                          )
                        : <td>{row.assign_name || "-"}</td>}
                      {sectionKey === "purchase" && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.order_number,
                            <input
                              className="table-cell-input"
                              value={row.order_number ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "order_number", event.target.value)}
                              placeholder="주문번호"
                            />
                          )
                        : <td>{row.order_number || "-"}</td>}
                      {sectionKey === "purchase" && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.buyer_name,
                            <input
                              className="table-cell-input"
                              value={row.buyer_name ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "buyer_name", event.target.value)}
                              placeholder="구매자"
                            />
                          )
                        : <td>{row.buyer_name || "-"}</td>}
                      {sectionKey === "purchase" && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.recipient_name,
                            <input
                              className="table-cell-input"
                              value={row.recipient_name ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "recipient_name", event.target.value)}
                              placeholder="수취인"
                            />
                          )
                        : <td>{row.recipient_name || "-"}</td>}
                      {sectionKey === "purchase" && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.purchase_account,
                            <input
                              className="table-cell-input"
                              value={row.purchase_account ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "purchase_account", event.target.value)}
                              placeholder="구매계정"
                            />
                          )
                        : <td>{row.purchase_account || "-"}</td>}
                      {sectionKey === "purchase" && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.contact,
                            <input
                              className="table-cell-input"
                              value={row.contact ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "contact", event.target.value)}
                              placeholder="연락처"
                            />
                          )
                        : <td>{row.contact || "-"}</td>}
                      {sectionKey === "purchase" && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.address,
                            <input
                              className="table-cell-input"
                              value={row.address ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "address", event.target.value)}
                              placeholder="주소"
                            />
                          )
                        : <td>{row.address || "-"}</td>}
                      {sectionKey === "purchase" && row.isEditing
                        ? renderEditableCell(
                            row,
                            formatAccountInfo(row),
                            <input
                              className="table-cell-input"
                              value={row.accountInfoInput ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "accountInfoInput", event.target.value)}
                              placeholder="은행 계좌번호 예금주"
                            />
                          )
                        : <td>{formatAccountInfo(row)}</td>}
                      {sectionKey === "purchase" && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.amount == null ? "" : String(row.amount),
                            <input
                              className="table-cell-input table-cell-input-number"
                              value={row.amountInput ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "amountInput", event.target.value)}
                              placeholder="금액"
                            />
                          )
                        : <td>{row.amount ?? "-"}</td>}
                      {sectionKey === "purchase" && row.isEditing
                        ? renderEditableCell(
                            row,
                            row.review_fee == null ? "" : String(row.review_fee),
                            <input
                              className="table-cell-input table-cell-input-number"
                              value={row.reviewFeeInput ?? ""}
                              onChange={(event) => handleFieldChange(row.id, "reviewFeeInput", event.target.value)}
                              placeholder="리뷰비"
                            />
                          )
                        : <td>{row.review_fee ?? "-"}</td>}
                      <td>
                        <div className="photo-link-list">
                          {row.photos?.length ? (
                            row.photos.map((url, photoIndex) => (
                              <button
                                key={`${row.id}-${url}`}
                                type="button"
                                className="photo-thumb-button"
                                onClick={() => openPhotoViewer(row.photos, photoIndex)}
                              >
                                <img src={url} alt={`증빙 이미지 ${photoIndex + 1}`} className="photo-thumb-image" />
                              </button>
                            ))
                          ) : (
                            <span>제출 전</span>
                          )}
                        </div>
                      </td>
                      <td>{product?.planned_depositor_name ?? "-"}</td>
                      <td>
                        <label className="pretty-checkbox">
                          <input
                            type="checkbox"
                            checked={Boolean(row.is_review_verified)}
                            disabled={updatingRowId === row.id}
                            onChange={(event) => handleReviewVerifiedChange(row, event.target.checked)}
                          />
                          <span className="checkmark" aria-hidden="true" />
                        </label>
                      </td>
                      <td>
                        <label className="pretty-checkbox">
                          <input
                            type="checkbox"
                            checked={Boolean(row.is_deposit_verified)}
                            disabled={updatingRowId === row.id || !row.is_review_verified}
                            onChange={(event) => handleDepositVerifiedChange(row, event.target.checked)}
                          />
                          <span className="checkmark" aria-hidden="true" />
                        </label>
                      </td>
                      {sectionKey !== "purchase" &&
                        (sectionKey === "review" ? (
                          <>
                            <td>
                              <input
                                type="date"
                                className="table-cell-input"
                                value={row.deposited_at ?? ""}
                                onChange={(event) => handleFieldChange(row.id, "deposited_at", event.target.value)}
                                onBlur={() => handleReviewCompletionMetaSave(row)}
                                disabled={updatingRowId === row.id}
                              />
                            </td>
                            <td>
                              <input
                                className="table-cell-input"
                                value={row.actual_depositor_name ?? ""}
                                onChange={(event) => handleFieldChange(row.id, "actual_depositor_name", event.target.value)}
                                onBlur={() => handleReviewCompletionMetaSave(row)}
                                placeholder="실제입금자명"
                                disabled={updatingRowId === row.id}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{row.deposited_at || "-"}</td>
                            <td>{row.actual_depositor_name || "-"}</td>
                          </>
                        ))}
                      {sectionKey === "purchase" && (
                        <td>
                          <div className="table-cell-actions">
                            {row.isEditing && (
                              <button
                                type="button"
                                className="admin-small-button"
                                onClick={() => handleSaveRow(row)}
                                disabled={updatingRowId === row.id || (!row.isDirty && !row.isNew)}
                              >
                                {row.isNew ? "추가" : "저장"}
                              </button>
                            )}
                            <button
                              type="button"
                              className="admin-small-button"
                              data-row-editor-toggle-id={row.id}
                              onClick={() => {
                                if (row.isEditing && !row.isNew && !row.isDirty) {
                                  closeRowEditor(row.id);
                                  return;
                                }

                                openRowEditor(row.id);
                              }}
                              disabled={updatingRowId === row.id}
                            >
                              구매정보
                            </button>
                            <button
                              type="button"
                              className="admin-danger-button"
                              onClick={() => handleDeleteRow(row)}
                              disabled={updatingRowId === row.id}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {sectionKey === "purchase" && row.isEditing && (
                      <tr className="review-receive-inline-fill-row" data-row-editor-id={row.id}>
                        <td colSpan={16}>
                          <div className="review-receive-inline-fill-box">
                            <label className="review-receive-inline-fill-label" htmlFor={`inline-purchase-info-${row.id}`}>
                              구매정보 빠른입력
                            </label>
                            <input
                              id={`inline-purchase-info-${row.id}`}
                              className="review-receive-inline-fill-input"
                              value={row.inlinePurchaseInfoInput ?? ""}
                              onChange={(event) => handleInlinePurchaseInfoChange(row.id, event.target.value)}
                              placeholder={
                                row.isNew
                                  ? "주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액 또는 배정명 / 주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액"
                                  : "주문번호 / 구매자 / 수취인 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액 또는 주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 계좌번호 입금주 / 금액"
                              }
                            />
                            {row.inlinePurchaseInfoMessage && (
                              <p className={`review-receive-bulk-message is-${row.inlinePurchaseInfoMessageType}`}>
                                {row.inlinePurchaseInfoMessage}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
              {sectionKey === "purchase" && (
                <tr className="review-receive-add-row">
                  <td colSpan={15}>
                    <button
                      type="button"
                      className="review-receive-add-row-button"
                      onClick={handleAddRow}
                      aria-label="구매완료 행 추가"
                    >
                      +
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <>
      <header className="admin-header">
        <div>
          <h1>리뷰받기 상세</h1>
          <p>상품 메타와 `submissions` 기반 리뷰받기 데이터를 확인합니다.</p>
        </div>
        <button type="button" className="admin-primary-button" onClick={handleAddRow}>
          행 추가
        </button>
      </header>

      <section className="dashboard-panel" aria-label="리뷰받기 상품 정보">
        {isLoading && <p className="login-message">리뷰받기 상세 정보를 불러오는 중...</p>}
        {!isLoading && errorMessage && <p className="login-error">{errorMessage}</p>}
        {!isLoading && !errorMessage && product && (
          <div className="detail-summary-grid">
            <div className="detail-summary-item">
              <span className="detail-summary-label">업체명</span>
              <strong>{product.company_name ?? "-"}</strong>
            </div>
            <div className="detail-summary-item">
              <span className="detail-summary-label">품명</span>
              <strong>{product.product_name ?? "-"}</strong>
            </div>
            <div className="detail-summary-item">
              <span className="detail-summary-label">옵션</span>
              <strong>{product.option_name ?? "-"}</strong>
            </div>
            <div className="detail-summary-item">
              <span className="detail-summary-label">리뷰형태</span>
              <strong>{product.review_type ?? "-"}</strong>
            </div>
            <div className="detail-summary-item">
              <span className="detail-summary-label">입금구분</span>
              <strong>{getProductDepositGbLabel(product.deposit_GB)}</strong>
            </div>
            <div className="detail-summary-item">
              <span className="detail-summary-label">설명</span>
              <strong>{product.description ?? "-"}</strong>
            </div>
            <div className="detail-summary-item">
              <span className="detail-summary-label">상품 제목</span>
              <strong>{product.title ?? "-"}</strong>
            </div>
          </div>
        )}
      </section>

      {!isLoading && !errorMessage && (
        <>
          {renderSection(
            "purchase",
            "구매완료",
            "리뷰완료 전이거나 아직 전체완료 조건을 만족하지 않은 제출 데이터입니다.",
            purchaseCompletedRows,
            filteredPurchaseCompletedRows
          )}
          {renderSection(
            "review",
            "리뷰완료",
            "리뷰완료는 체크됐고 입금완료는 아직 체크되지 않은 제출 데이터입니다.",
            reviewCompletedRows,
            filteredReviewCompletedRows
          )}
          {renderSection(
            "complete",
            "전체완료",
            "리뷰완료와 입금완료가 모두 체크된 제출 데이터입니다.",
            fullyCompletedRows,
            filteredFullyCompletedRows
          )}
        </>
      )}

      {isPurchaseBulkModalOpen && (
        <div className="review-receive-modal-backdrop" role="presentation" {...purchaseBulkBackdropDismissProps}>
          <div
            className="review-receive-modal review-receive-purchase-bulk-modal"
            role="dialog"
            aria-modal="true"
            aria-label="구매완료 일괄입력"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={purchaseBulkEnterConfirm.handleModalKeyDown}
          >
            <div className="review-receive-modal-header">
              <div>
                <h2>구매정보 입력하기</h2>
                <p>배정명을 따로 입력하거나 각 줄 첫 칸에 배정명을 넣을 수 있습니다. 값이 있는 행은 자동으로 건너뜁니다.</p>
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
                <input
                  className="review-receive-bulk-assign-input"
                  value={purchaseBulkAssignName}
                  onChange={(event) => {
                    setPurchaseBulkAssignName(event.target.value);
                    setPurchaseBulkMessage("");
                  }}
                  placeholder="배정명 (선택)"
                  aria-label="구매완료 배정명"
                  disabled={isApplyingPurchaseBulk}
                />
                <textarea
                  className="review-receive-bulk-textarea"
                  value={purchaseBulkText}
                  onChange={(event) => {
                    setPurchaseBulkText(event.target.value);
                    setPurchaseBulkMessage("");
                  }}
                  placeholder={
                    "탭 또는 / 로 구분해서 입력\n배정명\t주문번호\t구매자\t수취인\t구매계정\t연락처\t주소\t은행 계좌번호 입금주\t금액\n또는\n배정명 / 주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 은행 / 계좌번호 / 입금주 / 금액"
                  }
                  aria-label="구매완료 일괄입력 텍스트"
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
                      const rowIndex = targetRow ? rowNumberMap[targetRow.id] : "-";

                      return (
                        <div key={`${targetRow?.id ?? "preview"}-${index}`} className="review-receive-preview-item">
                          <div className="review-receive-preview-item-title">
                            <strong>{index + 1}번째 입력</strong>
                            <span>
                              {targetRow
                                ? `순번 ${rowIndex} / 배정 ${targetRow.assign_name ?? entry.assign_name ?? "-"}`
                                : `새 행 추가 / 배정 ${entry.assign_name || purchaseBulkAssignName || "-"}`}
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
                    <p>입력 가능한 내용이 있으면 여기에서 어느 행에 반영되는지 보여줍니다.</p>
                  </div>
                )}

                {purchaseBulkMessage && (
                  <p className={`review-receive-bulk-message is-${purchaseBulkMessageType}`}>
                    {purchaseBulkMessage}
                  </p>
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
                disabled={isApplyingPurchaseBulk || purchaseBulkPreview.status !== "ready"}
              >
                {isApplyingPurchaseBulk ? "입력 중..." : "완료하기"}
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
                <p>입금일과 실제입금자명을 일괄 적용하면 리뷰완료 데이터가 전체완료로 이동합니다.</p>
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
                    <span className="detail-summary-label">실제입금자명</span>
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
                </div>

                  <div className="review-receive-review-list-panel">
                    <div className="review-receive-preview-header">
                      <h3>리뷰완료 목록</h3>
                    <p>{`현재 ${filteredReviewCompletedRows.length}건이 일괄처리 대상입니다.`}</p>
                  </div>

                  {filteredReviewCompletedRows.length > 0 ? (
                    <div className="review-receive-preview-list">
                      {filteredReviewCompletedRows.map((row, index) => (
                        <div key={row.id} className="review-receive-preview-item">
                          <div className="review-receive-preview-item-title">
                            <strong>{index + 1}번째 대상</strong>
                            <span>{`순번 ${rowNumberMap[row.id] ?? "-"} / 배정 ${row.assign_name || "-"}`}</span>
                          </div>
                          <p>{`${row.order_number || "-"} / ${row.buyer_name || "-"} / ${row.recipient_name || "-"}`}</p>
                          {row.purchase_account && <p>{row.purchase_account}</p>}
                          <p>{`${row.contact || "-"} / ${row.address || "-"}`}</p>
                          <p>{`${formatAccountInfo(row)} / ${row.amount ?? "-"}`}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="review-receive-preview-empty">
                      <p>리뷰완료 상태의 제출 데이터가 없습니다.</p>
                    </div>
                  )}

                  {reviewBatchMessage && (
                    <p className={`review-receive-bulk-message is-${reviewBatchMessageType}`}>
                      {reviewBatchMessage}
                    </p>
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
                disabled={isApplyingReviewBatch || filteredReviewCompletedRows.length === 0}
              >
                {isApplyingReviewBatch ? "처리 중..." : "확인"}
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
                <p>이름만 줄바꿈으로 입력하면 다음 순번부터 추가되고, `순번 배정` 형식은 기존 순번 충돌 시 처리 방식을 묻습니다.</p>
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
                    {purchaseAssignPreview.entries.map((entry, index) => (
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
                        {entry.has_explicit_row_number && entry.overwrite_target ? (
                          <p>
                            {`기존 순번 ${entry.row_number} / 현재 배정 ${entry.overwrite_target.assign_name || "-"} 와 겹칩니다. 완료 시 덮어쓰기 또는 ${entry.append_row_number}번부터 추가를 선택합니다.`}
                          </p>
                        ) : (
                          <p>{`실제 추가 시 ${entry.append_row_number}번부터 빈 값 상태로 생성됩니다.`}</p>
                        )}
                        <p>주문번호 / 구매자 / 수취인 / 구매계정 / 연락처 / 주소 / 계좌 / 금액은 모두 비어 있는 상태로 처리됩니다.</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="review-receive-preview-empty">
                    <p>입력 내용을 확인하면 여기에서 추가될 구매자 목록을 보여줍니다.</p>
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
                disabled={isApplyingPurchaseAssign || Boolean(purchaseAssignPreview.errorMessage) || purchaseAssignPreview.entries.length === 0}
              >
                {isApplyingPurchaseAssign ? "추가 중..." : "완료하기"}
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
                    {`입력한 순번 ${purchaseAssignConflictDialog.duplicatedNumbers}번이 이미 존재합니다. 덮어쓸지, ${maxRowNumber + 1}번부터 새로 추가할지 선택해주세요.`}
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
        {...reviewBatchEnterConfirm.confirmDialogProps}
      />

      <AppAlertDialog
        {...purchaseAssignEnterConfirm.confirmDialogProps}
      />

      <AppAlertDialog
        isOpen={isReviewFeeBatchDialogOpen}
        badgeLabel="리뷰비 일괄 입력"
        title="구매완료 순번 범위에 리뷰비를 입력할까요?"
        description="현재 구매완료 표에 보이는 순번 기준으로 시작/끝 범위를 지정합니다."
        cancelLabel="취소"
        confirmLabel="입력하기"
        busyConfirmLabel="입력 중..."
        isBusy={isApplyingReviewFeeBatch}
        onCancel={closeReviewFeeBatchDialog}
        onConfirm={handleReviewFeeBatchApply}
        ariaLabel="리뷰비 일괄 입력"
      >
        <div className="review-fee-batch-form">
          <label className="review-fee-batch-field">
            <span>시작 순번</span>
            <input
              type="number"
              min="1"
              value={reviewFeeBatchStartRow}
              onChange={(event) => setReviewFeeBatchStartRow(event.target.value)}
              placeholder="예: 3"
              disabled={isApplyingReviewFeeBatch}
            />
          </label>
          <label className="review-fee-batch-field">
            <span>끝 순번</span>
            <input
              type="number"
              min="1"
              value={reviewFeeBatchEndRow}
              onChange={(event) => setReviewFeeBatchEndRow(event.target.value)}
              placeholder="예: 7"
              disabled={isApplyingReviewFeeBatch}
            />
          </label>
          <label className="review-fee-batch-field">
            <span>리뷰비</span>
            <input
              type="number"
              min="0"
              value={reviewFeeBatchValue}
              onChange={(event) => setReviewFeeBatchValue(event.target.value)}
              placeholder="예: 1000"
              disabled={isApplyingReviewFeeBatch}
            />
          </label>
        </div>
        <p className="review-fee-batch-hint">
          예: `3`부터 `7`까지 지정하면 구매완료 표에서 순번 3~7인 저장된 행의 리뷰비를 같은 값으로 바꿉니다.
        </p>
        {reviewFeeBatchMessage && <p className="review-fee-batch-message">{reviewFeeBatchMessage}</p>}
      </AppAlertDialog>

      <AppAlertDialog
        isOpen={Boolean(deleteTargetRow)}
        variant="danger"
        badgeLabel="삭제 확인"
        title="해당 제출 데이터를 삭제할까요?"
        cancelLabel="취소"
        confirmLabel="삭제하기"
        busyConfirmLabel="삭제 중..."
        isBusy={updatingRowId === deleteTargetRow?.id}
        onCancel={closeDeleteRowDialog}
        onConfirm={confirmDeleteRow}
        confirmButtonClassName="admin-danger-button"
        ariaLabel="리뷰받기 제출 데이터 삭제 확인"
      >
        <p>선택한 제출 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
      </AppAlertDialog>

      <AppAlertDialog
        isOpen={reviewVerifyConfirmDialog.isOpen}
        badgeLabel="빈 항목 확인"
        title="비어 있는 항목이 있습니다."
        cancelLabel="취소하기"
        confirmLabel="무시하고 처리하기"
        busyConfirmLabel="처리 중..."
        isBusy={updatingRowId === reviewVerifyConfirmDialog.rowId}
        onCancel={closeReviewVerifyConfirmDialog}
        onConfirm={confirmReviewVerifyApply}
        ariaLabel="상품상세 리뷰완료 처리 확인"
      >
        <p>
          <strong>{formatMissingFieldLabels(reviewVerifyConfirmDialog.missingLabels)}</strong> 칸이 비어있습니다. 리뷰완료
          처리 하시겠습니까?
        </p>
      </AppAlertDialog>

      <AppAlertDialog
        isOpen={depositVerifyConfirmDialog.isOpen}
        badgeLabel="빈 항목 확인"
        title="비어 있는 항목이 있습니다."
        cancelLabel="취소하기"
        confirmLabel="무시하고 처리하기"
        busyConfirmLabel="처리 중..."
        isBusy={updatingRowId === depositVerifyConfirmDialog.rowId}
        onCancel={closeDepositVerifyConfirmDialog}
        onConfirm={confirmDepositVerifyApply}
        ariaLabel="상품상세 입금완료 처리 확인"
      >
        <p>
          <strong>{formatMissingFieldLabels(depositVerifyConfirmDialog.missingLabels)}</strong> 칸이 비어있습니다. 입금완료
          처리 하시겠습니까?
        </p>
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
        ariaLabel="상품상세 입금완료 일괄처리 확인"
      >
        <p>
          <strong>{formatMissingFieldLabels(reviewBatchConfirmDialog.missingLabels)}</strong> 칸이 비어있습니다. 입금완료
          처리 하시겠습니까?
        </p>
      </AppAlertDialog>

      <PhotoViewerModal photoViewer={photoViewer} onClose={closePhotoViewer} onNext={showNextPhoto} onPrev={showPrevPhoto} />

      <AppToast toast={toast} />
    </>
  );
}
