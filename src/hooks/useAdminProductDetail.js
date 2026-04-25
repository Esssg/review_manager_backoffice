import { useEffect, useState } from "react";
import { STEP_NUMBER_BY_TAB } from "../constants/admin";
import {
  createSubmission,
  deleteEvidenceRowsIfExists,
  deleteSubmission,
  fetchApplications,
  fetchEvidencePhotos,
  fetchProductMeta,
  fetchSubmissions,
  findSubmissionByOrderNumber,
  setProductStepEnabled,
  updateApplicationConfirmed,
  updateSubmissionVerified
} from "../services/productDetail";
import { sortApplicationsByConfirmedAndCreatedAt } from "../utils/applicationRows";
import { parseSubmissionText } from "../utils/submissionParser";

export function useAdminProductDetail({ adminId, productId }) {
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
  }, [adminId, productId]);

  useEffect(() => {
    const loadTabData = async () => {
      try {
        setIsLoading(true);
        setErrorMessage("");
        setRows([]);

        if (activeTab === "applications") {
          const { data, error } = await fetchApplications(productId);

          if (error) {
            setErrorMessage(error.message);
            setRows([]);
            return;
          }

          setRows(sortApplicationsByConfirmedAndCreatedAt(data ?? []));
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
        let hasEvidencePhotoTable = true;

        if (submissionIds.length > 0) {
          const photoType = activeTab === "purchase" ? "purchase" : "review";
          const { photos, photosError, hasEvidencePhotoTable: nextHasEvidencePhotoTable } = await fetchEvidencePhotos(
            submissionIds,
            photoType
          );

          if (photosError) {
            setErrorMessage(photosError.message);
            setRows([]);
            return;
          }

          hasEvidencePhotoTable = nextHasEvidencePhotoTable;
          photoMap = (photos ?? []).reduce((acc, photo) => {
            if (!acc[photo.submission_id]) acc[photo.submission_id] = [];
            acc[photo.submission_id].push(photo.image_url);
            return acc;
          }, {});
        }

        setRows(
          (submissions ?? []).map((item) => ({
            ...item,
            photos: photoMap[item.id] ?? [],
            hasEvidencePhotoTable
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
  }, [activeTab, enabledSteps, productId]);

  const handleApplicationConfirmChange = async (applicationId, checked) => {
    const canEdit = product?.manager_id === adminId;
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
    setErrorMessage("");
    try {
      await deleteEvidenceRowsIfExists("evidence_photos", submissionId);
      await deleteEvidenceRowsIfExists("evidence_photo", submissionId);

      const { error } = await deleteSubmission(submissionId);
      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setRows((prev) => prev.filter((row) => row.id !== submissionId));
    } catch (error) {
      setErrorMessage(error?.message ?? "삭제 중 오류가 발생했습니다.");
    }
  };

  const handleStepEnabledChange = async (checked) => {
    if (!productId) return;

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
    handleStepEnabledChange,
    handleSubmissionVerifyChange,
    openPhotoViewer,
    closePhotoViewer,
    showPrevPhoto,
    showNextPhoto
  };
}
