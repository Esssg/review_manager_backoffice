import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  sortReviewReceiveRowsByCreatedAt,
  splitReviewReceiveRows
} from "../../utils/reviewReceiveRows";

function getStorageKey(productId) {
  return `review_receive_public_name:${productId}`;
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

  return window.sessionStorage.getItem(getStorageKey(productId)) ?? "";
}

function buildRowNumberMap(rows) {
  return rows.reduce((acc, row, index) => {
    acc[row.id] = index + 1;
    return acc;
  }, {});
}

function hasPhotoDraftChanges(draft) {
  return Boolean((draft?.removedExistingUrls?.length ?? 0) > 0 || (draft?.newPhotos?.length ?? 0) > 0);
}

function buildRowPhotos(serverPhotos, draft) {
  const removedSet = new Set(draft?.removedExistingUrls ?? []);
  const keptExisting = serverPhotos.filter((url) => !removedSet.has(url));
  const newPreviewUrls = (draft?.newPhotos ?? []).map((photo) => photo.previewUrl);
  return [...keptExisting, ...newPreviewUrls];
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
  const removedSet = new Set(draft?.removedExistingUrls ?? []);

  return {
    isOpen: true,
    row,
    rowNumber,
    isLocked: Boolean(row.is_review_verified),
    isSaving: false,
    existingPhotos: (row.serverPhotos ?? []).map((url, index) => ({
      id: `${index}-${url}`,
      url,
      isRemoved: removedSet.has(url)
    })),
    newPhotos: draft?.newPhotos ?? [],
    feedbackMessage: ""
  };
}

function buildSavedPhotoDraft(editorState) {
  return {
    removedExistingUrls: editorState.existingPhotos.filter((photo) => photo.isRemoved).map((photo) => photo.url),
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
  const [activeName, setActiveName] = useState(() => readStoredAssignName(productId));
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
    setActiveName(storedName);
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

      const { data: submissionData, error: submissionsError } = await fetchPublicReviewReceiveSubmissions(productId, activeName);

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
  }, [activeName, lookupVersion, product, productId]);

  const handleSubmit = (event) => {
    event.preventDefault();

    const trimmedName = lookupName.trim();

    if (!trimmedName) {
      setFormErrorMessage("이름을 입력해주세요.");
      return;
    }

    window.sessionStorage.setItem(getStorageKey(productId), trimmedName);
    setFormErrorMessage("");
    setLookupErrorMessage("");
    setPhotoStatusMessage("");
    setActiveName(trimmedName);
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

  const handleToggleExistingPhoto = (photoId) => {
    setPhotoEditor((prev) => ({
      ...prev,
      existingPhotos: prev.existingPhotos.map((photo) =>
        photo.id === photoId ? { ...photo, isRemoved: !photo.isRemoved } : photo
      ),
      feedbackMessage: ""
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
          url,
          isRemoved: false
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
            assignName: activeName,
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
          assignName: activeName,
          removedImageUrls: nextDraft.removedExistingUrls,
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
            assignName: activeName,
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

  const { purchaseRows, reviewRows, completeRows } = useMemo(
    () => splitReviewReceiveRows(rows),
    [rows]
  );
  const rowNumberMap = useMemo(() => buildRowNumberMap(rows), [rows]);

  return (
    <div className="public-review-page">
      <div className="public-review-shell">
        <header className="public-review-header">
          <div>
            <p className="public-review-eyebrow">Review Receive</p>
            <h1>리뷰 제출 현황 확인</h1>
            <p className="public-review-description">
              배정된 이름으로 조회하면 본인에게 연결된 제출 행만 확인할 수 있습니다.
            </p>
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
                <span className="detail-summary-label">옵션</span>
                <strong>{product.option_name ?? "-"}</strong>
              </div>
              <div className="detail-summary-item">
                <span className="detail-summary-label">리뷰형태</span>
                <strong>{product.review_type ?? "-"}</strong>
              </div>
              <div className="detail-summary-item">
                <span className="detail-summary-label">설명</span>
                <strong>{product.description ?? "-"}</strong>
              </div>
              <div className="detail-summary-item">
                <span className="detail-summary-label">입금자명(예정)</span>
                <strong>{product.planned_depositor_name ?? "-"}</strong>
              </div>
            </div>
          </section>
        )}

        <section className="dashboard-panel public-review-lookup-panel" aria-label="이름 조회">
          {isProductLoading && <p className="login-message">상품 정보를 확인하는 중...</p>}
          {!isProductLoading && productErrorMessage && <p className="login-error">{productErrorMessage}</p>}
          {!isProductLoading && !productErrorMessage && (
            <>
              <div className="public-review-product-heading">
                <div>
                  <span className="detail-summary-label">상품 제목</span>
                  <strong>{product?.title ?? "-"}</strong>
                </div>
                <p>이름을 입력하면 본인에게 배정된 제출 행만 표시합니다.</p>
              </div>

              <form className="public-review-lookup-form" onSubmit={handleSubmit}>
                <label className="public-review-field">
                  <span>배정된 이름</span>
                  <input
                    type="text"
                    className="public-review-input"
                    value={lookupName}
                    onChange={(event) => {
                      setLookupName(event.target.value);
                      setFormErrorMessage("");
                    }}
                    placeholder="이름을 입력해주세요"
                    autoComplete="name"
                  />
                </label>
                <button type="submit" className="admin-primary-button">
                  조회하기
                </button>
              </form>

              {formErrorMessage && <p className="login-error">{formErrorMessage}</p>}
              {activeName && !formErrorMessage && (
                <p className="public-review-active-name">{`현재 조회 이름: ${activeName}`}</p>
              )}
            </>
          )}
        </section>

        {!isProductLoading && !productErrorMessage && product && activeName && (
          <div className="public-review-section-stack">
            {isRowsLoading && <p className="login-message">배정된 제출 데이터를 불러오는 중...</p>}
            {!isRowsLoading && lookupErrorMessage && <p className="login-error">{lookupErrorMessage}</p>}
            {!isRowsLoading && !lookupErrorMessage && rows.length === 0 && (
              <section className="dashboard-panel public-review-empty-state" aria-label="배정 없음">
                <h2>배정된 제출이 없습니다.</h2>
                <p>입력한 이름과 정확히 일치하는 제출 행이 아직 없거나 공개 조회 권한이 없는 상태입니다.</p>
              </section>
            )}
            {!isRowsLoading && !lookupErrorMessage && rows.length > 0 && (
              <>
                <div className="public-review-access-note">
                  <span className="status-badge">{`${rows.length}건 조회됨`}</span>
                  <p>구매완료 섹션에서는 사진 업로드/삭제 초안을 만들 수 있습니다.</p>
                </div>
                {photoStatusMessage && <p className="login-message">{photoStatusMessage}</p>}
                <PublicReviewReceiveSection
                  sectionKey="purchase"
                  title="구매완료"
                  description="리뷰완료 전이거나 아직 전체완료 조건을 만족하지 않은 제출 데이터입니다."
                  rows={purchaseRows}
                  rowNumberMap={rowNumberMap}
                  onOpenPhotoViewer={openPhotoViewer}
                  onOpenPhotoManager={openPhotoManager}
                />
                <PublicReviewReceiveSection
                  sectionKey="review"
                  title="리뷰완료"
                  description="관리자가 리뷰완료 처리했고 입금완료는 아직 반영되지 않은 제출 데이터입니다."
                  rows={reviewRows}
                  rowNumberMap={rowNumberMap}
                  onOpenPhotoViewer={openPhotoViewer}
                />
                <PublicReviewReceiveSection
                  sectionKey="complete"
                  title="전체완료"
                  description="리뷰완료와 입금완료가 모두 반영된 제출 데이터입니다."
                  rows={completeRows}
                  rowNumberMap={rowNumberMap}
                  onOpenPhotoViewer={openPhotoViewer}
                />
              </>
            )}
          </div>
        )}

        <PublicPhotoUploadModal
          editorState={photoEditor}
          onClose={closePhotoManager}
          onFilesSelected={handlePhotoFilesSelected}
          onToggleExistingPhoto={handleToggleExistingPhoto}
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
