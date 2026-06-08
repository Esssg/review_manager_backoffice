import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import PhotoViewerModal from "../../components/admin/product-detail/PhotoViewerModal";
import PublicPhotoUploadModal from "../../components/public/PublicPhotoUploadModal";
import PublicReviewReceiveSection from "../../components/public/PublicReviewReceiveSection";
import {
  commitPublicReviewReceivePhotoUpload,
  fetchPublicReviewReceiveEvidencePhotos,
  fetchPublicReviewReceiveProduct,
  fetchPublicReviewReceiveSubmissions,
  preparePublicReviewReceivePhotoUpload,
  rollbackPublicReviewReceivePhotoUpload
} from "../../services/reviewReceivePublic";
import { formatPlannedDepositorName } from "../../utils/plannedDepositorName";
import { sortReviewReceiveRowsByCreatedAt } from "../../utils/reviewReceiveRows";

const DEFAULT_LOOKUP_TYPE = "account_holder";
const PUBLIC_LOOKUP_OPTIONS = [
  { value: "assign_name", label: "배정명" },
  { value: "account_holder", label: "예금주" }
];

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

function createPreviewPhoto(file) {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    previewUrl: window.URL.createObjectURL(file)
  };
}

async function uploadFileToPresignedUrl(uploadUrl, file) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream"
    },
    body: file
  });

  if (!response.ok) {
    throw new Error("S3 업로드에 실패했습니다.");
  }
}

export default function PublicReviewReceiveDetailPage() {
  const { productId } = useParams();
  const [lookupName, setLookupName] = useState(() => readStoredAssignName(productId));
  const [lookupType, setLookupType] = useState(() => readStoredLookupType(productId));
  const [activeName, setActiveName] = useState(() => readStoredAssignName(productId));
  const [activeLookupType, setActiveLookupType] = useState(() => readStoredLookupType(productId));
  const [lookupVersion, setLookupVersion] = useState(() => (readStoredAssignName(productId) ? 1 : 0));
  const [product, setProduct] = useState(null);
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

      const { data, error } = await fetchPublicReviewReceiveProduct(productId);

      if (!isMounted) {
        return;
      }

      if (error || !data) {
        setProduct(null);
        setProductErrorMessage("존재하지 않거나 공개 접근할 수 없는 상품입니다.");
        setIsProductLoading(false);
        return;
      }

      setProduct(data);
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

      const { data: submissionData, error: submissionsError } = await fetchPublicReviewReceiveSubmissions(
        productId,
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
      const lockedDraftRowIds = [];
      const nextRows = sortReviewReceiveRowsByCreatedAt(
        (submissionData ?? []).map((item) => {
          const serverPhotos = photoMap[item.id] ?? [];
          const rowDraftKey = String(item.id);
          const draft = currentDrafts[rowDraftKey];

          if (item.is_review_verified && draft) {
            lockedDraftRowIds.push(rowDraftKey);
            return buildRenderableRow(item, serverPhotos, null);
          }

          return buildRenderableRow(item, serverPhotos, draft ?? null);
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
  }, [activeLookupType, activeName, lookupVersion, product, productId]);

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

    const selectedFiles = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));

    if (selectedFiles.length === 0) {
      setPhotoEditor((prev) => ({
        ...prev,
        feedbackMessage: "이미지 파일만 추가할 수 있습니다."
      }));
      return;
    }

    setPhotoEditor((prev) => ({
      ...prev,
      newPhotos: [...prev.newPhotos, ...selectedFiles.map(createPreviewPhoto)],
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

    const rowIdKey = String(photoEditor.row.id);
    const hasChanges = hasPhotoDraftChanges(nextDraft);

    const persistPhotoChanges = async () => {
      setPhotoEditor((prev) => ({
        ...prev,
        isSaving: true,
        feedbackMessage: "사진 업로드를 준비하는 중입니다."
      }));

      const uploadedFiles = [];

      try {
        if ((nextDraft.newPhotos ?? []).length > 0) {
          const { data: prepareData, error: prepareError } = await preparePublicReviewReceivePhotoUpload({
            productId: Number(productId),
            submissionId: Number(photoEditor.row.id),
            assignName: photoEditor.row.assign_name,
            files: nextDraft.newPhotos.map((photo) => ({
              fileName: photo.file.name,
              contentType: photo.file.type || "application/octet-stream",
              size: photo.file.size
            }))
          });

          if (prepareError) {
            throw prepareError;
          }

          if (!prepareData?.uploads || prepareData.uploads.length !== nextDraft.newPhotos.length) {
            throw new Error("업로드 준비 정보를 받지 못했습니다.");
          }

          setPhotoEditor((prev) => ({
            ...prev,
            feedbackMessage: "S3에 사진을 업로드하는 중입니다."
          }));

          for (let index = 0; index < prepareData.uploads.length; index += 1) {
            const uploadTarget = prepareData.uploads[index];
            const draftPhoto = nextDraft.newPhotos[index];

            await uploadFileToPresignedUrl(uploadTarget.uploadUrl, draftPhoto.file);
            uploadedFiles.push({
              objectKey: uploadTarget.objectKey,
              imageUrl: uploadTarget.imageUrl
            });
          }
        }

        setPhotoEditor((prev) => ({
          ...prev,
          feedbackMessage: "DB에 사진 정보를 저장하는 중입니다."
        }));

        const { data: commitData, error: commitError } = await commitPublicReviewReceivePhotoUpload({
          productId: Number(productId),
          submissionId: Number(photoEditor.row.id),
          assignName: photoEditor.row.assign_name,
          removedImageUrls: photoEditor.row.serverPhotos ?? [],
          uploadedFiles
        });

        if (commitError) {
          throw commitError;
        }

        if (!commitData?.photos) {
          throw new Error("저장 결과를 받지 못했습니다.");
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
                  serverPhotos: commitData.photos,
                  photos: commitData.photos,
                  hasPendingPhotoChanges: false
                }
              : row
          )
        );
        setPhotoStatusMessage(`순번 ${photoEditor.rowNumber ?? "-"} 행의 사진 변경사항을 저장했습니다.`);
        setPhotoEditor(createEmptyPhotoEditor());
      } catch (error) {
        if (uploadedFiles.length > 0) {
          await rollbackPublicReviewReceivePhotoUpload({
            productId: Number(productId),
            submissionId: Number(photoEditor.row.id),
            assignName: photoEditor.row.assign_name,
            objectKeys: uploadedFiles.map((item) => item.objectKey)
          });
        }

        setPhotoEditor((prev) => ({
          ...prev,
          isSaving: false,
          feedbackMessage: error?.message || "사진 저장에 실패했습니다."
        }));
      }
    };

    persistPhotoChanges();
  };

  const lookupTypeLabel = getLookupTypeLabel(lookupType);
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
          <section className="dashboard-panel" aria-label="리뷰받기 상품 정보">
            <div className="detail-summary-grid">
              <div className="detail-summary-item">
                <span className="detail-summary-label">품명</span>
                <strong>{product.product_name ?? "-"}</strong>
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
                <div className="public-review-access-note">
                  <span className="status-badge">{`${rows.length}건 조회됨`}</span>
                </div>
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
