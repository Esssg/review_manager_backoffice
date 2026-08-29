// @ts-nocheck

import { useEffect, useState } from "react";
import { STEP_NUMBER_BY_TAB } from "@/constants/admin";
import { ADMIN_PERMISSION_CODE } from "@/constants/adminAccess";
import { useAdminPermissions } from "@/hooks/useAdminPermission";
import { isAdminGatewayConfigured } from "@/services/adminGateway";
import { deleteEvidencePhoto } from "@/services/evidencePhotos";
import { deleteSubmissionsWithEvidencePhotos } from "@/services/adminDeletion";
import {
  createSubmission,
  fetchApplications,
  fetchEvidencePhotos,
  fetchProductMeta,
  fetchSubmissions,
  findSubmissionByOrderNumber,
  setProductStepEnabled,
  updateApplicationConfirmed,
  updateSubmissionVerified
} from "@/services/productDetail";
import { sortApplicationsByConfirmedAndCreatedAt } from "@/utils/applicationRows";
import { getPhotoId, removePhotoById } from "@/utils/photoItems";
import { getDeletionErrorMessage } from "@/utils/deletionContract";
import { parseSubmissionText } from "@/utils/submissionParser";

const PRODUCT_DETAIL_PERMISSION_CODES = Object.freeze([
  ADMIN_PERMISSION_CODE.PRODUCT_READ,
  ADMIN_PERMISSION_CODE.PRODUCT_STEP_READ,
  ADMIN_PERMISSION_CODE.APPLICATION_READ,
  ADMIN_PERMISSION_CODE.SUBMISSION_READ,
  ADMIN_PERMISSION_CODE.APPLICATION_CONFIRM,
  ADMIN_PERMISSION_CODE.SUBMISSION_CREATE,
  ADMIN_PERMISSION_CODE.SUBMISSION_UPDATE,
  ADMIN_PERMISSION_CODE.SUBMISSION_DELETE,
  ADMIN_PERMISSION_CODE.PRODUCT_STEP_UPDATE,
  ADMIN_PERMISSION_CODE.PHOTO_READ,
  ADMIN_PERMISSION_CODE.PHOTO_DELETE
]);

export function useAdminProductDetail({ adminId, productId }) {
  const permissions = useAdminPermissions(PRODUCT_DETAIL_PERMISSION_CODES, {
    legacyMenuCodes: [ADMIN_PERMISSION_CODE.MENU_PRODUCT]
  });
  const canReadProduct = Boolean(permissions[ADMIN_PERMISSION_CODE.PRODUCT_READ]?.allowed);
  const canReadProductSteps = Boolean(permissions[ADMIN_PERMISSION_CODE.PRODUCT_STEP_READ]?.allowed);
  const canReadApplications = Boolean(permissions[ADMIN_PERMISSION_CODE.APPLICATION_READ]?.allowed);
  const canReadSubmissions = Boolean(permissions[ADMIN_PERMISSION_CODE.SUBMISSION_READ]?.allowed);
  const isReadPermissionReady = [
    ADMIN_PERMISSION_CODE.PRODUCT_READ,
    ADMIN_PERMISSION_CODE.PRODUCT_STEP_READ,
    ADMIN_PERMISSION_CODE.APPLICATION_READ,
    ADMIN_PERMISSION_CODE.SUBMISSION_READ
  ].every((permissionCode) => permissions[permissionCode]?.isReady);
  const canConfirmApplication = Boolean(permissions[ADMIN_PERMISSION_CODE.APPLICATION_CONFIRM]?.allowed);
  const canCreateSubmission = Boolean(permissions[ADMIN_PERMISSION_CODE.SUBMISSION_CREATE]?.allowed);
  const canUpdateSubmission = Boolean(permissions[ADMIN_PERMISSION_CODE.SUBMISSION_UPDATE]?.allowed);
  const canDeleteSubmissionPermission = Boolean(permissions[ADMIN_PERMISSION_CODE.SUBMISSION_DELETE]?.allowed);
  const canUpdateProductStep = Boolean(permissions[ADMIN_PERMISSION_CODE.PRODUCT_STEP_UPDATE]?.allowed);
  const canReadPhotos = Boolean(permissions[ADMIN_PERMISSION_CODE.PHOTO_READ]?.allowed);
  const canDeletePhoto = Boolean(permissions[ADMIN_PERMISSION_CODE.PHOTO_DELETE]?.allowed);
  const canDeleteSubmission = canDeleteSubmissionPermission && canDeletePhoto;
  const [activeTab, setActiveTab] = useState("applications");
  const [product, setProduct] = useState(null);
  const [enabledSteps, setEnabledSteps] = useState({
    applications: false,
    purchase: false,
    review: false
  });
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isUpdatingStep, setIsUpdatingStep] = useState(false);
  const [newSubmissionText, setNewSubmissionText] = useState("");
  const [isAddingSubmission, setIsAddingSubmission] = useState(false);
  const [addSubmissionMessage, setAddSubmissionMessage] = useState("");
  const [isAddSubmissionError, setIsAddSubmissionError] = useState(false);
  const [photoViewer, setPhotoViewer] = useState({
    isOpen: false,
    photos: [],
    activeIndex: 0
  });

  useEffect(() => {
    const loadProductMeta = async () => {
      if (!isReadPermissionReady) {
        return;
      }

      if (!canReadProduct || !canReadProductSteps) {
        setErrorMessage("상품과 상품 단계 조회 권한이 필요합니다.");
        setIsLoading(false);
        return;
      }

      const {
        productResult: { data: productData, error: productError },
        stepsResult: { data: stepsData, error: stepsError }
      } = await fetchProductMeta(productId, adminId);

      if (productError || stepsError) {
        setErrorMessage(productError?.message ?? stepsError?.message ?? "데이터를 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      if (!productData) {
        setErrorMessage("접근 가능한 상품이 없습니다.");
        setIsLoading(false);
        return;
      }

      const stepSet = new Set((stepsData ?? []).map((step) => step.step_number));
      setProduct(productData);
      setEnabledSteps({
        applications: stepSet.has(1),
        purchase: stepSet.has(2),
        review: stepSet.has(3)
      });
    };

    loadProductMeta();
  }, [adminId, canReadProduct, canReadProductSteps, isReadPermissionReady, productId]);

  useEffect(() => {
    if (!isReadPermissionReady) {
      return;
    }

    const loadTabData = async () => {
      try {
        setIsLoading(true);
        setErrorMessage("");
        setRows([]);

        if (activeTab === "applications") {
          if (!canReadApplications) {
            setErrorMessage("신청자 조회 권한이 없습니다.");
            return;
          }

          const { data, error } = await fetchApplications(productId);

          if (error) {
            setErrorMessage(error.message);
            setRows([]);
            return;
          }

          setRows(sortApplicationsByConfirmedAndCreatedAt(data ?? []));
          return;
        }

        if (!canReadSubmissions) {
          setErrorMessage("제출 조회 권한이 없습니다.");
          return;
        }

        const { data: submissions, error: submissionsError } = await fetchSubmissions(productId);

        if (submissionsError) {
          setErrorMessage(submissionsError.message);
          setRows([]);
          return;
        }

        const submissionIds = (submissions ?? []).map((item) => item.id);
        let photoMap = {};

        if (submissionIds.length > 0 && canReadPhotos) {
          const photoType = activeTab === "purchase" ? "purchase" : "review";
          const { photos, photosError } = await fetchEvidencePhotos(submissionIds, photoType);

          if (photosError) {
            setErrorMessage(photosError.message);
            setRows([]);
            return;
          }

          photoMap = (photos ?? []).reduce((acc, photo) => {
            if (!acc[photo.submission_id]) acc[photo.submission_id] = [];
            acc[photo.submission_id].push(photo);
            return acc;
          }, {});
        }

        setRows(
          (submissions ?? []).map((item) => ({
            ...item,
            photos: photoMap[item.id] ?? []
          }))
        );
      } catch (error) {
        setErrorMessage(error?.message ?? "탭 데이터를 불러오지 못했습니다.");
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadTabData();
  }, [activeTab, canReadApplications, canReadPhotos, canReadSubmissions, enabledSteps, isReadPermissionReady, productId]);

  const handleApplicationConfirmChange = async (applicationId, checked) => {
    const canEdit = canConfirmApplication && (isAdminGatewayConfigured() || product?.manager_id === adminId);
    if (!canEdit) return;

    const { error } = await updateApplicationConfirmed(applicationId, productId, checked);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setRows((prev) =>
      sortApplicationsByConfirmedAndCreatedAt(
        prev.map((row) => (row.id === applicationId ? { ...row, is_confirmed: checked } : row))
      )
    );
  };

  const handleSubmissionVerifyChange = async (submissionId, checked) => {
    if (!canUpdateSubmission) {
      setErrorMessage("제출 검증 권한이 없습니다.");
      return;
    }

    const targetColumn = activeTab === "purchase" ? "is_purchase_verified" : "is_review_verified";
    const { error } = await updateSubmissionVerified(submissionId, targetColumn, checked);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setRows((prev) =>
      prev.map((row) => (row.id === submissionId ? { ...row, [targetColumn]: checked } : row))
    );
  };

  const handleDeleteSubmission = async (submissionId) => {
    if (!canDeleteSubmission) {
      setErrorMessage("제출 삭제 권한이 없습니다.");
      return;
    }

    setErrorMessage("");
    const result = await deleteSubmissionsWithEvidencePhotos([submissionId]);

    if (result.error) {
      if (result.partial && result.deletedEvidenceSubmissionIds.includes(Number(submissionId))) {
        setRows((prev) =>
          prev.map((row) => (row.id === submissionId ? { ...row, photos: [] } : row))
        );
      }

      setErrorMessage(getDeletionErrorMessage(result));
      return;
    }

    setRows((prev) => prev.filter((row) => row.id !== submissionId));
  };

  const handleDeletePhoto = async (photo) => {
    if (!canDeletePhoto) {
      setErrorMessage("증빙 사진 삭제 권한이 없습니다.");
      return false;
    }

    const photoId = getPhotoId(photo);

    if (!photoId) {
      setErrorMessage("삭제할 사진을 찾지 못했습니다.");
      return false;
    }

    setErrorMessage("");

    const { data, error } = await deleteEvidencePhoto(photoId);

    if (error) {
      setErrorMessage(error.message);
      return false;
    }

    if (!data) {
      setErrorMessage("이미 삭제되었거나 접근할 수 없는 사진입니다.");
      return false;
    }

    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        photos: removePhotoById(row.photos, photoId)
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

    return true;
  };

  const handleStepEnabledChange = async (checked) => {
    if (!productId || !canUpdateProductStep) {
      setErrorMessage("상품 단계 수정 권한이 없습니다.");
      return;
    }

    const stepNumber = STEP_NUMBER_BY_TAB[activeTab];
    setIsUpdatingStep(true);
    setErrorMessage("");

    try {
      if (checked) {
        const { error } = await setProductStepEnabled(productId, stepNumber, true);
        if (error && error.code !== "23505") {
          setErrorMessage(error.message);
          return;
        }
      } else {
        const { error } = await setProductStepEnabled(productId, stepNumber, false);
        if (error) {
          setErrorMessage(error.message);
          return;
        }
      }

      setEnabledSteps((prev) => ({ ...prev, [activeTab]: checked }));
    } finally {
      setIsUpdatingStep(false);
    }
  };

  const handleAddSubmission = async () => {
    if (!canCreateSubmission) {
      setIsAddSubmissionError(true);
      setAddSubmissionMessage("제출 생성 권한이 없습니다.");
      return;
    }

    if (!newSubmissionText.trim()) {
      setIsAddSubmissionError(true);
      setAddSubmissionMessage("추가할 텍스트를 입력해주세요.");
      return;
    }

    setIsAddingSubmission(true);
    setAddSubmissionMessage("");
    setIsAddSubmissionError(false);

    try {
      const parsed = parseSubmissionText(newSubmissionText);
      const normalizedOrderNumber = String(parsed.order_number ?? "").trim();
      if (!normalizedOrderNumber) {
        setIsAddSubmissionError(true);
        setAddSubmissionMessage("주문번호를 입력해주세요.");
        return;
      }

      const { data: duplicatedRow, error: duplicateCheckError } = await findSubmissionByOrderNumber(
        productId,
        normalizedOrderNumber
      );

      if (duplicateCheckError) {
        setIsAddSubmissionError(true);
        setAddSubmissionMessage(duplicateCheckError.message);
        return;
      }

      if (duplicatedRow) {
        setIsAddSubmissionError(true);
        setAddSubmissionMessage("이미 등록된 주문번호입니다.");
        return;
      }

      const payload = {
        product_id: Number(productId),
        ...parsed,
        assign_name: String(parsed.assign_name ?? "").trim() || null,
        order_number: normalizedOrderNumber
      };

      const { data, error } = await createSubmission(payload);
      if (error) {
        setIsAddSubmissionError(true);
        setAddSubmissionMessage(error.message);
        return;
      }

      setIsAddSubmissionError(false);
      setAddSubmissionMessage("정보를 추가했습니다.");
      setNewSubmissionText("");

      if (activeTab === "purchase" || activeTab === "review") {
        setRows((prev) => [...prev, { ...data, photos: [] }]);
      }
    } catch (error) {
      setIsAddSubmissionError(true);
      setAddSubmissionMessage(error?.message ?? "정보 추가 중 오류가 발생했습니다.");
    } finally {
      setIsAddingSubmission(false);
    }
  };

  const openPhotoViewer = (photos, activeIndex) => {
    if (!canReadPhotos) {
      return;
    }

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

  const isPurchaseOrReviewTab = activeTab === "purchase" || activeTab === "review";
  const verifiedRows = isPurchaseOrReviewTab
    ? rows.filter((row) => (activeTab === "purchase" ? row.is_purchase_verified : row.is_review_verified))
    : [];
  const unverifiedRows = isPurchaseOrReviewTab
    ? rows.filter((row) => !(activeTab === "purchase" ? row.is_purchase_verified : row.is_review_verified))
    : [];

  return {
    activeTab,
    addSubmissionMessage,
    enabledSteps,
    errorMessage,
    canConfirmApplication,
    canCreateSubmission,
    canDeletePhoto,
    canDeleteSubmission,
    canReadPhotos,
    canUpdateProductStep,
    canUpdateSubmission,
    isAddSubmissionError,
    isAddingSubmission,
    isLoading,
    isPurchaseOrReviewTab,
    isUpdatingStep,
    newSubmissionText,
    photoViewer,
    product,
    rows,
    unverifiedRows,
    verifiedRows,
    setActiveTab,
    setNewSubmissionText,
    handleAddSubmission,
    handleApplicationConfirmChange,
    handleDeleteSubmission,
    handleDeletePhoto,
    handleStepEnabledChange,
    handleSubmissionVerifyChange,
    openPhotoViewer,
    closePhotoViewer,
    showPrevPhoto,
    showNextPhoto
  };
}
