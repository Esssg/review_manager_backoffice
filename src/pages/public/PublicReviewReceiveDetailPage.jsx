import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import PhotoViewerModal from "../../components/admin/product-detail/PhotoViewerModal";
import PublicPhotoUploadModal from "../../components/public/PublicPhotoUploadModal";
import PublicReviewReceiveSection from "../../components/public/PublicReviewReceiveSection";
import {
  fetchPublicReviewReceiveEvidencePhotos,
  fetchPublicReviewReceiveProductBundle,
  fetchPublicReviewReceiveSubmissions,
  syncPublicReviewReceivePhotoUpload
} from "../../services/reviewReceivePublic";
import { formatPlannedDepositorName } from "../../utils/plannedDepositorName";
import { sortReviewReceiveRowsByCreatedAt } from "../../utils/reviewReceiveRows";

const DEFAULT_LOOKUP_TYPE = "account_holder";
const PUBLIC_LOOKUP_OPTIONS = [
  { value: "assign_name", label: "배정명" },
  { value: "account_holder", label: "예금주" }
];
const UNREGISTERED_PRODUCT_ITEM_TEXT = "품목 미등록";
const PUBLIC_PHOTO_UPLOAD_MAX_FILE_COUNT = 10;
const PUBLIC_PHOTO_UPLOAD_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const PUBLIC_PHOTO_UPLOAD_ERROR_MESSAGES = {
  "00001": "이미지 파일만 업로드할 수 있습니다.",
  "00002": "비어 있거나 읽을 수 없는 이미지 파일입니다.",
  "00003": "이미지 파일은 10MB 이하만 업로드할 수 있습니다.",
  "00004": "사진은 한 번에 최대 10장까지만 업로드할 수 있습니다.",
  "00005": "사진 미리보기를 만들지 못했습니다.",
  "00010": "사진 저장 요청이 네트워크 문제로 실패했습니다.",
  "00011": "사진 저장 요청 형식이 올바르지 않습니다.",
  "00012": "사진 업로드 권한을 확인하지 못했습니다.",
  "00013": "관리자가 리뷰완료 처리한 행은 수정할 수 없습니다.",
  "00014": "사진 저장 중 서버 설정 또는 저장소 연결 문제가 발생했습니다.",
  "00015": "사진 저장 응답이 올바르지 않습니다.",
  "00020": "사진 파일을 저장소로 전송하지 못했습니다.",
  "00021": "사진 저장소가 업로드 요청을 거부했습니다.",
  "00022": "사진 업로드 요청이 중단되었습니다.",
  "00030": "사진 정보 저장 요청이 네트워크 문제로 실패했습니다.",
  "00031": "사진 정보 저장 요청 형식이 올바르지 않습니다.",
  "00032": "사진 정보 저장 권한을 확인하지 못했습니다.",
  "00033": "관리자가 리뷰완료 처리한 행은 저장할 수 없습니다.",
  "00034": "기존 사진 정보를 확인하지 못했습니다.",
  "00035": "새 사진 정보를 DB에 저장하지 못했습니다.",
  "00036": "기존 사진 정보를 DB에서 삭제하지 못했습니다.",
  "00037": "사진 정보 저장 응답이 올바르지 않습니다.",
  "00038": "사진 정보 저장 중 서버 문제가 발생했습니다.",
  "00040": "임시 업로드 파일 정리 요청이 네트워크 문제로 실패했습니다.",
  "00041": "임시 업로드 파일 정리 권한을 확인하지 못했습니다.",
  "00042": "임시 업로드 파일을 저장소에서 삭제하지 못했습니다.",
  "00043": "업로드 실패 후 임시 파일 정리에 실패했습니다.",
  "00090": "사진 저장 중 알 수 없는 오류가 발생했습니다."
};

function getLookupValueStorageKey(productId) {
  return `review_receive_public_name:${productId}`;
}

function getLookupTypeStorageKey(productId) {
  return `review_receive_public_lookup_type:${productId}`;
}

function createEmptyPhotoEditor() {
  return {
    isOpen: false,
    row: null,
    rowNumber: null,
    isLocked: false,
    existingPhotos: [],
    newPhotos: [],
    feedbackMessage: "",
    isSaving: false
  };
}

function readStoredAssignName(productId) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(getLookupValueStorageKey(productId)) ?? "";
}

function readStoredLookupType(productId) {
  if (typeof window === "undefined") {
    return DEFAULT_LOOKUP_TYPE;
  }

  const storedType = window.sessionStorage.getItem(getLookupTypeStorageKey(productId));
  return PUBLIC_LOOKUP_OPTIONS.some((option) => option.value === storedType) ? storedType : DEFAULT_LOOKUP_TYPE;
}

function getLookupTypeLabel(lookupType) {
  return PUBLIC_LOOKUP_OPTIONS.find((option) => option.value === lookupType)?.label ?? "예금주";
}

function getLookupTypePlaceholder(lookupType) {
  if (lookupType === "account_holder") {
    return "예금주를 입력해주세요";
  }

  return `${getLookupTypeLabel(lookupType)}을 입력해주세요`;
}

function formatPublicDisplayDate(value) {
  if (!value) {
    return "-";
  }

  const inputValue = typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  const date = inputValue ? new Date(`${inputValue}T00:00:00`) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("ko-KR");
}

function getPublicPlannedDepositorName(product) {
  const storedPlannedDepositorName = String(product?.planned_depositor_name ?? "").trim();
  const generatedPlannedDepositorName = formatPlannedDepositorName(product?.product_date, product?.company_name);

  if (storedPlannedDepositorName && storedPlannedDepositorName !== "업체페이") {
    return storedPlannedDepositorName;
  }

  return generatedPlannedDepositorName || storedPlannedDepositorName || "-";
}

function getPublicDepositorNames(product) {
  const plannedDepositorName = getPublicPlannedDepositorName(product);
  const depositGb = Number(product?.deposit_GB);

  switch (depositGb) {
    case 2:
      return {
        productFeeDepositorName: plannedDepositorName,
        reviewFeeDepositorName: "없음"
      };
    case 3:
      return {
        productFeeDepositorName: "업체페이",
        reviewFeeDepositorName: plannedDepositorName
      };
    case 4:
      return {
        productFeeDepositorName: "업체페이",
        reviewFeeDepositorName: "없음"
      };
    case 1:
    default:
      return {
        productFeeDepositorName: plannedDepositorName,
        reviewFeeDepositorName: plannedDepositorName
      };
  }
}

function isPublicProductItemEmptyShell(product) {
  return [
    product?.title,
    product?.product_name,
    product?.option_name,
    product?.review_type,
    product?.description,
    product?.planned_depositor_name
  ].every((value) => !String(value ?? "").trim());
}

function getPublicProductDisplayValue(product, field, emptyText = "-") {
  if (!product || isPublicProductItemEmptyShell(product)) {
    return UNREGISTERED_PRODUCT_ITEM_TEXT;
  }

  const value = String(product[field] ?? "").trim();
  return value || emptyText;
}

function hasPhotoDraftChanges(draft) {
  return Boolean((draft?.newPhotos?.length ?? 0) > 0);
}

function buildRowPhotos(serverPhotos, draft) {
  const newPreviewUrls = (draft?.newPhotos ?? []).map((photo) => photo.previewUrl);

  if (newPreviewUrls.length > 0) {
    return newPreviewUrls;
  }

  return serverPhotos;
}

function buildRenderableRow(item, serverPhotos, draft) {
  return {
    ...item,
    serverPhotos,
    photos: buildRowPhotos(serverPhotos, draft),
    hasPendingPhotoChanges: hasPhotoDraftChanges(draft)
  };
}

function revokePhotoPreview(previewUrl) {
  if (typeof window === "undefined") {
    return;
  }

  if (previewUrl?.startsWith("blob:")) {
    window.URL.revokeObjectURL(previewUrl);
  }
}

function cleanupPhotoDraft(draft) {
  (draft?.newPhotos ?? []).forEach((photo) => {
    revokePhotoPreview(photo.previewUrl);
  });
}

function cleanupUnsavedEditorPhotos(editorState, savedDraft) {
  const savedIds = new Set((savedDraft?.newPhotos ?? []).map((photo) => photo.id));

  editorState.newPhotos.forEach((photo) => {
    if (!savedIds.has(photo.id)) {
      revokePhotoPreview(photo.previewUrl);
    }
  });
}

function buildPhotoEditorState(row, rowNumber, draft) {
  return {
    isOpen: true,
    row,
    rowNumber,
    isLocked: Boolean(row.is_review_verified),
    isSaving: false,
    existingPhotos: (row.serverPhotos ?? []).map((url, index) => ({
      id: `${index}-${url}`,
      url
    })),
    newPhotos: draft?.newPhotos ?? [],
    feedbackMessage: ""
  };
}

function buildSavedPhotoDraft(editorState) {
  return {
    newPhotos: editorState.newPhotos
  };
}

function getPhotoUploadErrorMessage(code, fallbackMessage = "") {
  return PUBLIC_PHOTO_UPLOAD_ERROR_MESSAGES[code] || fallbackMessage || PUBLIC_PHOTO_UPLOAD_ERROR_MESSAGES["00090"];
}

function createPhotoUploadError(code, options = {}) {
  const error = new Error(options.message || getPhotoUploadErrorMessage(code));

  error.code = code;
  error.stage = options.stage || "";
  error.status = options.status ?? null;
  error.fileIndex = options.fileIndex ?? null;
  error.fileName = options.fileName || "";
  error.fileSize = options.fileSize ?? null;
  error.originalErrorName = options.originalErrorName || "";
  error.originalMessage = options.originalMessage || "";
  error.debugMessage = options.debugMessage || "";
  error.isPublicPhotoUploadError = true;

  return error;
}

function normalizePhotoUploadError(error, fallbackCode, options = {}) {
  if (error?.code) {
    return createPhotoUploadError(error.code, {
      ...options,
      message: error.message || options.message,
      stage: error.stage || options.stage,
      status: error.status ?? options.status,
      fileIndex: error.fileIndex ?? options.fileIndex,
      fileName: error.fileName || options.fileName,
      fileSize: error.fileSize ?? options.fileSize,
      originalErrorName: error.originalErrorName || error.name || options.originalErrorName,
      originalMessage: error.originalMessage || error.message || options.originalMessage,
      debugMessage: error.debugMessage || options.debugMessage
    });
  }

  return createPhotoUploadError(fallbackCode, {
    ...options,
    message: options.message || error?.message || getPhotoUploadErrorMessage(fallbackCode),
    originalErrorName: error?.name || options.originalErrorName || "",
    originalMessage: error?.message || options.originalMessage || ""
  });
}

function formatPhotoUploadError(error) {
  const normalizedError = error?.isPublicPhotoUploadError ? error : normalizePhotoUploadError(error, "00090");
  const rollbackSuffix = normalizedError.rollbackCode ? ` 추가 정리 오류코드: ${normalizedError.rollbackCode}` : "";

  return `[${normalizedError.code}] ${normalizedError.message}${rollbackSuffix}`;
}

function getPhotoFileDebugInfo(file, fileIndex) {
  return {
    fileIndex,
    fileName: file?.name || "",
    fileSize: file?.size ?? null,
    contentType: file?.type || ""
  };
}

function validateSelectedPhotoFiles(fileList, existingFileCount = 0) {
  const selectedFiles = Array.from(fileList ?? []);

  if (selectedFiles.length === 0) {
    return {
      files: [],
      error: null
    };
  }

  const nextFileCount = existingFileCount + selectedFiles.length;

  if (nextFileCount > PUBLIC_PHOTO_UPLOAD_MAX_FILE_COUNT) {
    return {
      files: [],
      error: createPhotoUploadError("00004", {
        stage: "select",
        debugMessage: `selected=${selectedFiles.length}, existing=${existingFileCount}`
      })
    };
  }

  for (let index = 0; index < selectedFiles.length; index += 1) {
    const file = selectedFiles[index];
    const fileDebugInfo = getPhotoFileDebugInfo(file, index + 1);

    if (!file?.type?.startsWith("image/")) {
      return {
        files: [],
        error: createPhotoUploadError("00001", {
          stage: "select",
          ...fileDebugInfo
        })
      };
    }

    if (!Number.isFinite(file.size) || file.size <= 0) {
      return {
        files: [],
        error: createPhotoUploadError("00002", {
          stage: "select",
          ...fileDebugInfo
        })
      };
    }

    if (file.size > PUBLIC_PHOTO_UPLOAD_MAX_FILE_SIZE_BYTES) {
      return {
        files: [],
        error: createPhotoUploadError("00003", {
          stage: "select",
          ...fileDebugInfo
        })
      };
    }
  }

  return {
    files: selectedFiles,
    error: null
  };
}

function createPreviewPhoto(file) {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    previewUrl: window.URL.createObjectURL(file)
  };
}

export default function PublicReviewReceiveDetailPage() {
  const { productId } = useParams();
  const [lookupName, setLookupName] = useState(() => readStoredAssignName(productId));
  const [lookupType, setLookupType] = useState(() => readStoredLookupType(productId));
  const [activeName, setActiveName] = useState(() => readStoredAssignName(productId));
  const [activeLookupType, setActiveLookupType] = useState(() => readStoredLookupType(productId));
  const [lookupVersion, setLookupVersion] = useState(() => (readStoredAssignName(productId) ? 1 : 0));
  const [product, setProduct] = useState(null);
  const [bundleProducts, setBundleProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const [photoDrafts, setPhotoDrafts] = useState({});
  const [isProductLoading, setIsProductLoading] = useState(true);
  const [isRowsLoading, setIsRowsLoading] = useState(false);
  const [productErrorMessage, setProductErrorMessage] = useState("");
  const [lookupErrorMessage, setLookupErrorMessage] = useState("");
  const [formErrorMessage, setFormErrorMessage] = useState("");
  const [photoStatusMessage, setPhotoStatusMessage] = useState("");
  const [photoEditor, setPhotoEditor] = useState(createEmptyPhotoEditor);
  const [photoViewer, setPhotoViewer] = useState({
    isOpen: false,
    photos: [],
    activeIndex: 0
  });
  const photoDraftsRef = useRef(photoDrafts);
  const photoEditorRef = useRef(photoEditor);

  useEffect(() => {
    photoDraftsRef.current = photoDrafts;
  }, [photoDrafts]);

  useEffect(() => {
    photoEditorRef.current = photoEditor;
  }, [photoEditor]);

  useEffect(() => {
    return () => {
      Object.values(photoDraftsRef.current).forEach((draft) => {
        cleanupPhotoDraft(draft);
      });

      if (photoEditorRef.current.isOpen) {
        cleanupUnsavedEditorPhotos(
          photoEditorRef.current,
          photoDraftsRef.current[String(photoEditorRef.current.row?.id)]
        );
      }
    };
  }, []);

  useEffect(() => {
    const storedName = readStoredAssignName(productId);
    const storedLookupType = readStoredLookupType(productId);

    Object.values(photoDraftsRef.current).forEach((draft) => {
      cleanupPhotoDraft(draft);
    });

    if (photoEditorRef.current.isOpen) {
      cleanupUnsavedEditorPhotos(
        photoEditorRef.current,
        photoDraftsRef.current[String(photoEditorRef.current.row?.id)]
      );
    }

    photoDraftsRef.current = {};
    setPhotoDrafts({});
    setLookupName(storedName);
    setLookupType(storedLookupType);
    setActiveName(storedName);
    setActiveLookupType(storedLookupType);
    setLookupVersion(storedName ? 1 : 0);
    setProduct(null);
    setBundleProducts([]);
    setRows([]);
    setLookupErrorMessage("");
    setFormErrorMessage("");
    setPhotoStatusMessage("");
    setPhotoEditor(createEmptyPhotoEditor());
    setPhotoViewer({ isOpen: false, photos: [], activeIndex: 0 });
  }, [productId]);

  useEffect(() => {
    let isMounted = true;

    const loadProduct = async () => {
      setIsProductLoading(true);
      setProductErrorMessage("");

      const { data, error } = await fetchPublicReviewReceiveProductBundle(productId);

      if (!isMounted) {
        return;
      }

      if (error || !data?.product) {
        setProduct(null);
        setBundleProducts([]);
        setProductErrorMessage("존재하지 않거나 공개 접근할 수 없는 상품입니다.");
        setIsProductLoading(false);
        return;
      }

      setProduct(data.product);
      setBundleProducts(data.products ?? [data.product]);
      setIsProductLoading(false);
    };

    loadProduct();

    return () => {
      isMounted = false;
    };
  }, [productId]);

  useEffect(() => {
    let isMounted = true;

    const loadRows = async () => {
      if (!product || !activeName || lookupVersion === 0) {
        setRows([]);
        setIsRowsLoading(false);
        setLookupErrorMessage("");
        return;
      }

      setIsRowsLoading(true);
      setLookupErrorMessage("");

      const searchableProducts = bundleProducts.length > 0 ? bundleProducts : [product];
      const searchableProductIds = searchableProducts.map((item) => item?.id).filter((id) => id != null);
      const { data: submissionData, error: submissionsError } = await fetchPublicReviewReceiveSubmissions(
        searchableProductIds,
        activeLookupType,
        activeName
      );

      if (!isMounted) {
        return;
      }

      if (submissionsError) {
        setRows([]);
        setLookupErrorMessage(submissionsError.message ?? "배정된 제출 데이터를 불러오지 못했습니다.");
        setIsRowsLoading(false);
        return;
      }

      const submissionIds = (submissionData ?? []).map((item) => item.id);
      const { data: photoData, error: photoError } = await fetchPublicReviewReceiveEvidencePhotos(submissionIds);

      if (!isMounted) {
        return;
      }

      if (photoError) {
        setRows([]);
        setLookupErrorMessage(photoError.message ?? "증빙 사진을 불러오지 못했습니다.");
        setIsRowsLoading(false);
        return;
      }

      const photoMap = (photoData ?? []).reduce((acc, photo) => {
        if (!acc[photo.submission_id]) {
          acc[photo.submission_id] = [];
        }

        acc[photo.submission_id].push(photo.image_url);
        return acc;
      }, {});

      const currentDrafts = photoDraftsRef.current;
      const productMap = new Map(searchableProducts.map((item) => [Number(item.id), item]));
      const lockedDraftRowIds = [];
      const nextRows = sortReviewReceiveRowsByCreatedAt(
        (submissionData ?? []).map((item) => {
          const rowProduct = productMap.get(Number(item.product_id)) ?? null;
          const serverPhotos = photoMap[item.id] ?? [];
          const rowDraftKey = String(item.id);
          const draft = currentDrafts[rowDraftKey];
          const rowWithProduct = {
            ...item,
            product: rowProduct,
            product_name: getPublicProductDisplayValue(rowProduct, "product_name"),
            option_name: getPublicProductDisplayValue(rowProduct, "option_name"),
            review_type: getPublicProductDisplayValue(rowProduct, "review_type")
          };

          if (item.is_review_verified && draft) {
            lockedDraftRowIds.push(rowDraftKey);
            return buildRenderableRow(rowWithProduct, serverPhotos, null);
          }

          return buildRenderableRow(rowWithProduct, serverPhotos, draft ?? null);
        })
      );

      setRows(nextRows);
      setIsRowsLoading(false);

      if (lockedDraftRowIds.length > 0) {
        setPhotoDrafts((prev) => {
          const next = { ...prev };

          lockedDraftRowIds.forEach((rowId) => {
            if (next[rowId]) {
              cleanupPhotoDraft(next[rowId]);
              delete next[rowId];
            }
          });

          return next;
        });
        setPhotoStatusMessage("관리자가 리뷰완료 처리한 행이 있어 임시 사진 변경 초안을 제거했습니다.");
        setPhotoEditor((prev) => {
          if (!prev.isOpen || !lockedDraftRowIds.includes(String(prev.row?.id))) {
            return prev;
          }

          cleanupUnsavedEditorPhotos(prev, currentDrafts[String(prev.row?.id)]);
          return createEmptyPhotoEditor();
        });
      }
    };

    loadRows();

    return () => {
      isMounted = false;
    };
  }, [activeLookupType, activeName, bundleProducts, lookupVersion, product]);

  const handleSubmit = (event) => {
    event.preventDefault();

    const trimmedName = lookupName.trim();
    const lookupTypeLabel = getLookupTypeLabel(lookupType);

    if (!trimmedName) {
      setFormErrorMessage(`${lookupTypeLabel}을 입력해주세요.`);
      return;
    }

    window.sessionStorage.setItem(getLookupValueStorageKey(productId), trimmedName);
    window.sessionStorage.setItem(getLookupTypeStorageKey(productId), lookupType);
    setFormErrorMessage("");
    setLookupErrorMessage("");
    setPhotoStatusMessage("");
    setActiveName(trimmedName);
    setActiveLookupType(lookupType);
    setLookupName(trimmedName);
    setLookupVersion((prev) => prev + 1);
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

  const openPhotoManager = (row) => {
    const draft = photoDraftsRef.current[String(row.id)] ?? null;
    const rowNumber = rows.findIndex((item) => item.id === row.id) + 1;

    setPhotoEditor(buildPhotoEditorState(row, rowNumber > 0 ? rowNumber : null, draft));
  };

  const closePhotoManager = () => {
    setPhotoEditor((prev) => {
      if (!prev.isOpen) {
        return prev;
      }

      cleanupUnsavedEditorPhotos(prev, photoDraftsRef.current[String(prev.row.id)]);
      return createEmptyPhotoEditor();
    });
  };

  const handlePhotoFilesSelected = (fileList) => {
    if (!photoEditor.isOpen || photoEditor.isLocked) {
      return;
    }

    const { files: selectedFiles, error } = validateSelectedPhotoFiles(fileList, photoEditor.newPhotos.length);

    if (error) {
      console.warn("Public review photo selection failed", error);
      setPhotoEditor((prev) => ({
        ...prev,
        feedbackMessage: formatPhotoUploadError(error)
      }));
      return;
    }

    if (selectedFiles.length === 0) {
      return;
    }

    let previewPhotos = [];

    try {
      previewPhotos = selectedFiles.map(createPreviewPhoto);
    } catch (error) {
      const normalizedError = normalizePhotoUploadError(error, "00005", {
        stage: "preview",
        message: getPhotoUploadErrorMessage("00005")
      });

      console.warn("Public review photo preview failed", normalizedError);
      setPhotoEditor((prev) => ({
        ...prev,
        feedbackMessage: formatPhotoUploadError(normalizedError)
      }));
      return;
    }

    setPhotoEditor((prev) => ({
      ...prev,
      newPhotos: [...prev.newPhotos, ...previewPhotos],
      feedbackMessage: `${selectedFiles.length}장의 이미지를 초안에 추가했습니다.`
    }));
  };

  const handleRemoveNewPhoto = (photoId) => {
    setPhotoEditor((prev) => {
      const target = prev.newPhotos.find((photo) => photo.id === photoId);

      if (target) {
        const savedDraft = photoDraftsRef.current[String(prev.row.id)];
        const isSavedPhoto = (savedDraft?.newPhotos ?? []).some((photo) => photo.id === photoId);

        if (!isSavedPhoto) {
          revokePhotoPreview(target.previewUrl);
        }
      }

      return {
        ...prev,
        newPhotos: prev.newPhotos.filter((photo) => photo.id !== photoId),
        feedbackMessage: ""
      };
    });
  };

  const handleResetPhotoDraft = () => {
    setPhotoEditor((prev) => {
      const savedDraft = photoDraftsRef.current[String(prev.row.id)];

      cleanupUnsavedEditorPhotos(prev, savedDraft);

      return {
        ...prev,
        existingPhotos: (prev.row.serverPhotos ?? []).map((url, index) => ({
          id: `${index}-${url}`,
          url
        })),
        newPhotos: [],
        feedbackMessage: "현재 편집 중인 사진 변경 초안을 초기화했습니다."
      };
    });
  };

  const handleSavePhotoDraft = () => {
    if (!photoEditor.isOpen || photoEditor.isLocked || photoEditor.isSaving) {
      return;
    }

    const nextDraft = buildSavedPhotoDraft(photoEditor);

    if (nextDraft.newPhotos.length === 0) {
      setPhotoEditor((prev) => ({
        ...prev,
        feedbackMessage: "재제출할 새 사진을 먼저 추가해주세요."
      }));
      return;
    }

    const draftValidation = validateSelectedPhotoFiles(
      nextDraft.newPhotos.map((photo) => photo.file),
      0
    );

    if (draftValidation.error) {
      console.warn("Public review photo draft validation failed", draftValidation.error);
      setPhotoEditor((prev) => ({
        ...prev,
        feedbackMessage: formatPhotoUploadError(draftValidation.error)
      }));
      return;
    }

    const rowIdKey = String(photoEditor.row.id);

    const persistPhotoChanges = async () => {
      setPhotoEditor((prev) => ({
        ...prev,
        isSaving: true,
        feedbackMessage: "사진을 업로드하고 저장하는 중입니다."
      }));

      try {
        const { data: syncData, error: syncError } = await syncPublicReviewReceivePhotoUpload({
          productId: Number(photoEditor.row.product_id),
          submissionId: Number(photoEditor.row.id),
          assignName: photoEditor.row.assign_name,
          removedImageUrls: photoEditor.row.serverPhotos ?? [],
          files: nextDraft.newPhotos.map((photo) => photo.file)
        });

        if (syncError) {
          throw syncError;
        }

        if (!syncData?.photos) {
          throw createPhotoUploadError("00037", {
            stage: "sync",
            debugMessage: "syncData.photos is missing"
          });
        }

        cleanupPhotoDraft(nextDraft);

        setPhotoDrafts((prev) => {
          const next = { ...prev };
          delete next[rowIdKey];
          return next;
        });
        setRows((prev) =>
          prev.map((row) =>
            row.id === photoEditor.row.id
              ? {
                  ...row,
                  serverPhotos: syncData.photos,
                  photos: syncData.photos,
                  hasPendingPhotoChanges: false
                }
              : row
          )
        );
        setPhotoStatusMessage(`순번 ${photoEditor.rowNumber ?? "-"} 행의 사진 변경사항을 저장했습니다.`);
        setPhotoEditor(createEmptyPhotoEditor());
      } catch (error) {
        const normalizedError = normalizePhotoUploadError(error, "00090", {
          stage: "save",
          message: error?.message || getPhotoUploadErrorMessage("00090")
        });

        console.error("Public review photo upload failed", {
          code: normalizedError.code,
          stage: normalizedError.stage,
          status: normalizedError.status,
          fileIndex: normalizedError.fileIndex,
          fileName: normalizedError.fileName,
          fileSize: normalizedError.fileSize,
          originalErrorName: normalizedError.originalErrorName,
          originalMessage: normalizedError.originalMessage,
          debugMessage: normalizedError.debugMessage,
          rollbackCode: normalizedError.rollbackCode || ""
        });

        setPhotoEditor((prev) => ({
          ...prev,
          isSaving: false,
          feedbackMessage: formatPhotoUploadError(normalizedError)
        }));
      }
    };

    persistPhotoChanges();
  };

  const activeLookupTypeLabel = getLookupTypeLabel(activeLookupType);
  const publicDepositorNames = getPublicDepositorNames(product);

  return (
    <div className="public-review-page">
      <div className="public-review-shell">
        <header className="public-review-header">
          <div>
            <p className="public-review-eyebrow">Review Receive</p>
            <h1>리뷰 제출</h1>
          </div>
        </header>

        {!isProductLoading && !productErrorMessage && product && (
          <section className="dashboard-panel public-review-products-panel" aria-label="리뷰받기 상품 정보">
            <div className="detail-summary-grid">
              <div className="detail-summary-item">
                <span className="detail-summary-label">구매일자</span>
                <strong>{formatPublicDisplayDate(product.product_date)}</strong>
              </div>
              <div className="detail-summary-item">
                <span className="detail-summary-label">업체명</span>
                <strong>{product.company_name || "-"}</strong>
              </div>
              <div className="detail-summary-item">
                <span className="detail-summary-label">제품비 입금자명</span>
                <strong>{publicDepositorNames.productFeeDepositorName}</strong>
              </div>
              <div className="detail-summary-item">
                <span className="detail-summary-label">리뷰비 입금자명</span>
                <strong>{publicDepositorNames.reviewFeeDepositorName}</strong>
              </div>
            </div>
          </section>
        )}

        <section className="dashboard-panel public-review-lookup-panel" aria-label="이름 조회">
          {isProductLoading && <p className="login-message">상품 정보를 확인하는 중...</p>}
          {!isProductLoading && productErrorMessage && <p className="login-error">{productErrorMessage}</p>}
          {!isProductLoading && !productErrorMessage && (
            <>
              <form className="public-review-lookup-form" onSubmit={handleSubmit}>
                <label className="public-review-field">
                  <span>양식 제출 시 입력한 예금주로 구매 내역 검색</span>
                  <div className="public-review-input-combo">
                    <select
                      className="public-review-lookup-type-select"
                      value={lookupType}
                      onChange={(event) => {
                        setLookupType(event.target.value);
                        setFormErrorMessage("");
                      }}
                      aria-label="조회 기준"
                    >
                      {PUBLIC_LOOKUP_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      className="public-review-input public-review-input-combo-field"
                      value={lookupName}
                      onChange={(event) => {
                        setLookupName(event.target.value);
                        setFormErrorMessage("");
                      }}
                      placeholder={getLookupTypePlaceholder(lookupType)}
                      autoComplete={lookupType === "assign_name" ? "name" : "off"}
                    />
                  </div>
                </label>
                <button type="submit" className="admin-primary-button">
                  조회하기
                </button>
              </form>

              {formErrorMessage && <p className="login-error">{formErrorMessage}</p>}
              {activeName && !formErrorMessage && (
                <p className="public-review-active-name">{`현재 조회 ${activeLookupTypeLabel}: ${activeName}`}</p>
              )}
            </>
          )}
        </section>

        {!isProductLoading && !productErrorMessage && product && activeName && (
          <div className="public-review-section-stack">
            {isRowsLoading && <p className="login-message">{`${activeLookupTypeLabel} 기준 제출 데이터를 불러오는 중...`}</p>}
            {!isRowsLoading && lookupErrorMessage && <p className="login-error">{lookupErrorMessage}</p>}
            {!isRowsLoading && !lookupErrorMessage && rows.length === 0 && (
              <section className="dashboard-panel public-review-empty-state" aria-label="조회 결과 없음">
                <h2>조회된 제출이 없습니다.</h2>
                <p>{`입력한 ${activeLookupTypeLabel}과 정확히 일치하는 제출 행이 아직 없거나 공개 조회 권한이 없는 상태입니다.`}</p>
              </section>
            )}
            {!isRowsLoading && !lookupErrorMessage && rows.length > 0 && (
              <>
                {photoStatusMessage && <p className="login-message">{photoStatusMessage}</p>}
                <PublicReviewReceiveSection
                  sectionKey="purchase"
                  title="구매내역"
                  rows={rows}
                  onOpenPhotoViewer={openPhotoViewer}
                  onOpenPhotoManager={openPhotoManager}
                />
              </>
            )}
          </div>
        )}

        <PublicPhotoUploadModal
          editorState={photoEditor}
          onClose={closePhotoManager}
          onFilesSelected={handlePhotoFilesSelected}
          onRemoveNewPhoto={handleRemoveNewPhoto}
          onResetDraft={handleResetPhotoDraft}
          onSaveDraft={handleSavePhotoDraft}
        />

        <PhotoViewerModal
          photoViewer={photoViewer}
          onClose={closePhotoViewer}
          onNext={showNextPhoto}
          onPrev={showPrevPhoto}
        />
      </div>
    </div>
  );
}
