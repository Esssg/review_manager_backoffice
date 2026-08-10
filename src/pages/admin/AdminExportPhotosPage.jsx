import { useEffect, useMemo, useState } from "react";
import ExportPageLayout from "../../components/admin/export/ExportPageLayout";
import { ADMIN_STORAGE_KEY, getProductDepositGbPartLabels } from "../../constants/admin";
import { useAdminIncludeCompanyData } from "../../hooks/useAdminCapabilities";
import { fetchAdminPhotoExportData } from "../../services/exportPhotos";
import { runWithConcurrency } from "../../utils/asyncPool";
import { buildZipBlob, downloadBlob, getExtensionFromUrl, sanitizeZipPathSegment } from "../../utils/zipFile";

const PHOTO_EXPORT_FILTER_COLUMNS = [
  { key: "manager_id", label: "관리자" },
  { key: "product_date", label: "등록일" },
  { key: "title", label: "상품 제목" },
  { key: "company_name", label: "업체명" },
  { key: "product_name", label: "품명" },
  { key: "option_name", label: "옵션" },
  { key: "review_type", label: "리뷰형태" },
  { key: "planned_depositor_name", label: "입금자명(예정)" },
  { key: "product_fee_deposit_GB", label: "제품비 입금구분" },
  { key: "review_fee_deposit_GB", label: "리뷰비 입금구분" },
  { key: "submission_count", label: "제출 수" },
  { key: "photo_count", label: "사진 수" }
];
const PHOTO_DOWNLOAD_CONCURRENCY = 4;

function normalizeFilterValue(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function createEmptyFilters() {
  return PHOTO_EXPORT_FILTER_COLUMNS.reduce((filters, column) => {
    filters[column.key] = "";
    return filters;
  }, {});
}

function buildPhotoZipFilename() {
  const pad = (value) => String(value).padStart(2, "0");
  const date = new Date();
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes())
  ].join("");

  return `리뷰매니저_사진내려받기_${timestamp}.zip`;
}

function buildProductRows(products, submissions, evidencePhotos) {
  const submissionById = new Map((submissions ?? []).map((submission) => [submission.id, submission]));
  const submissionsByProductId = (submissions ?? []).reduce((acc, submission) => {
    if (!acc[submission.product_id]) {
      acc[submission.product_id] = [];
    }

    acc[submission.product_id].push(submission);
    return acc;
  }, {});
  const photoCountByProductId = (evidencePhotos ?? []).reduce((acc, photo) => {
    const submission = submissionById.get(photo.submission_id);

    if (!submission) {
      return acc;
    }

    acc[submission.product_id] = (acc[submission.product_id] ?? 0) + 1;
    return acc;
  }, {});

  return (products ?? []).map((product) => {
    const depositLabels = getProductDepositGbPartLabels(product.deposit_GB);

    return {
      ...product,
      product_date: product.product_date ?? product.created_at?.slice(0, 10) ?? "",
      product_fee_deposit_GB: depositLabels.productFee,
      review_fee_deposit_GB: depositLabels.reviewFee,
      submission_count: submissionsByProductId[product.id]?.length ?? 0,
      photo_count: photoCountByProductId[product.id] ?? 0
    };
  });
}

function filterProductRows(rows, filters) {
  const activeFilters = PHOTO_EXPORT_FILTER_COLUMNS.reduce((acc, column) => {
    const value = normalizeFilterValue(filters[column.key]);

    if (value) {
      acc[column.key] = value;
    }

    return acc;
  }, {});

  if (Object.keys(activeFilters).length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    PHOTO_EXPORT_FILTER_COLUMNS.every((column) => {
      const filterValue = activeFilters[column.key];

      if (!filterValue) {
        return true;
      }

      return normalizeFilterValue(row[column.key]).includes(filterValue);
    })
  );
}

function buildPhotoTargets({ products, submissions, evidencePhotos, filteredRows }) {
  const productIds = new Set(filteredRows.map((row) => row.id));
  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const submissionMap = new Map((submissions ?? []).map((submission) => [submission.id, submission]));

  return (evidencePhotos ?? []).reduce((targets, photo) => {
    const submission = submissionMap.get(photo.submission_id);

    if (!submission || !productIds.has(submission.product_id) || !photo.image_url) {
      return targets;
    }

    targets.push({
      photo,
      submission,
      product: productMap.get(submission.product_id)
    });
    return targets;
  }, []);
}

function buildPhotoZipPath(target, extension, index) {
  const productFolder = `${target.product?.id ?? target.submission.product_id}_${sanitizeZipPathSegment(
    target.product?.title || target.product?.product_name,
    "product"
  )}`;
  const submissionLabel = sanitizeZipPathSegment(
    [target.submission.buyer_name, target.submission.recipient_name, target.submission.order_number]
      .filter(Boolean)
      .join("_"),
    `submission_${target.submission.id}`
  );
  const filename = `${String(index + 1).padStart(4, "0")}_${submissionLabel}.${extension}`;

  return `${productFolder}/${filename}`;
}

export default function AdminExportPhotosPage() {
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  const {
    includeCompanyData,
    adminProfile,
    scopePolicy,
    handleIncludeCompanyDataChange,
    isLoadingCapabilities,
    isIncludeCompanyDataReady,
    capabilitiesErrorMessage
  } = useAdminIncludeCompanyData(adminId);
  const [exportData, setExportData] = useState({
    products: [],
    submissions: [],
    evidencePhotos: []
  });
  const [scopeInfo, setScopeInfo] = useState({
    companyName: null,
    isCompanyScopeAvailable: false
  });
  const [filters, setFilters] = useState(createEmptyFilters);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadState, setDownloadState] = useState({
    isDownloading: false,
    current: 0,
    total: 0,
    message: "",
    failedCount: 0
  });

  useEffect(() => {
    let isMounted = true;

    const loadPhotoExportData = async () => {
      setIsLoading(true);
      setErrorMessage("");

      if (isLoadingCapabilities || !isIncludeCompanyDataReady) {
        return;
      }

      if (!adminId) {
        if (isMounted) {
          setErrorMessage("로그인 정보가 없습니다. 다시 로그인해주세요.");
          setIsLoading(false);
        }
        return;
      }

      if (capabilitiesErrorMessage) {
        if (isMounted) {
          setExportData({
            products: [],
            submissions: [],
            evidencePhotos: []
          });
          setErrorMessage(capabilitiesErrorMessage);
          setIsLoading(false);
        }
        return;
      }

      const result = await fetchAdminPhotoExportData(adminId, { scopePolicy, adminProfile });

      if (!isMounted) {
        return;
      }

      setScopeInfo({
        companyName: result.scope?.companyName ?? null,
        isCompanyScopeAvailable: result.scope?.isCompanyScopeAvailable ?? false
      });

      if (result.error) {
        setExportData({
          products: [],
          submissions: [],
          evidencePhotos: []
        });
        setErrorMessage(result.error.message ?? "사진 내보내기 데이터를 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      setExportData({
        products: result.products,
        submissions: result.submissions,
        evidencePhotos: result.evidencePhotos
      });
      setLastUpdatedAt(new Date());
      setIsLoading(false);
    };

    loadPhotoExportData();

    return () => {
      isMounted = false;
    };
  }, [
    adminId,
    capabilitiesErrorMessage,
    includeCompanyData,
    adminProfile,
    isIncludeCompanyDataReady,
    isLoadingCapabilities,
    refreshKey,
    scopePolicy
  ]);

  const productRows = useMemo(
    () => buildProductRows(exportData.products, exportData.submissions, exportData.evidencePhotos),
    [exportData.evidencePhotos, exportData.products, exportData.submissions]
  );
  const filteredRows = useMemo(() => filterProductRows(productRows, filters), [filters, productRows]);
  const photoTargets = useMemo(
    () =>
      buildPhotoTargets({
        products: exportData.products,
        submissions: exportData.submissions,
        evidencePhotos: exportData.evidencePhotos,
        filteredRows
      }),
    [exportData.evidencePhotos, exportData.products, exportData.submissions, filteredRows]
  );
  const scopeMessage = includeCompanyData
    ? scopeInfo.companyName
      ? `현재 계정과 같은 회사(${scopeInfo.companyName}) 소속 관리자 상품까지 함께 보여줍니다.`
      : "현재 계정에 회사 정보가 없어 내 계정 상품만 보여줍니다."
    : "현재 로그인한 계정의 상품만 보여줍니다.";

  const handleFilterChange = (columnKey, value) => {
    setFilters((prev) => ({
      ...prev,
      [columnKey]: value
    }));
  };

  const resetFilters = () => {
    setFilters(createEmptyFilters());
  };

  const downloadFilteredPhotos = async () => {
    if (photoTargets.length === 0) {
      setDownloadState({
        isDownloading: false,
        current: 0,
        total: 0,
        message: "필터링된 상품에 내려받을 사진이 없습니다.",
        failedCount: 0
      });
      return;
    }

    setDownloadState({
      isDownloading: true,
      current: 0,
      total: photoTargets.length,
      message: "사진을 내려받는 중입니다.",
      failedCount: 0
    });

    let failedCount = 0;
    const results = await runWithConcurrency(
      photoTargets,
      async (target, index) => {
        try {
          const response = await fetch(target.photo.image_url);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const contentType = response.headers.get("content-type") ?? "";
          const extension = getExtensionFromUrl(target.photo.image_url, contentType);
          const content = await response.arrayBuffer();

          return {
            ok: true,
            file: {
              path: buildPhotoZipPath(target, extension, index),
              content,
              lastModified: target.photo.created_at ? new Date(target.photo.created_at) : new Date()
            }
          };
        } catch {
          failedCount += 1;
          return { ok: false };
        }
      },
      {
        concurrency: PHOTO_DOWNLOAD_CONCURRENCY,
        onProgress: ({ completed, total }) => {
          setDownloadState({
            isDownloading: true,
            current: completed,
            total,
            message: `${completed}/${total}장 처리 중입니다.`,
            failedCount
          });
        }
      }
    );
    const files = results.filter((result) => result?.ok).map((result) => result.file);

    if (files.length === 0) {
      setDownloadState({
        isDownloading: false,
        current: photoTargets.length,
        total: photoTargets.length,
        message: "사진 URL을 내려받지 못했습니다. 이미지 저장소 CORS 설정을 확인해주세요.",
        failedCount
      });
      return;
    }

    const zipBlob = buildZipBlob(files);

    downloadBlob(zipBlob, buildPhotoZipFilename());
    setDownloadState({
      isDownloading: false,
      current: photoTargets.length,
      total: photoTargets.length,
      message:
        failedCount > 0
          ? `${files.length}장을 ZIP으로 내려받았습니다. ${failedCount}장은 이미지 URL 접근에 실패했습니다.`
          : `${files.length}장을 ZIP으로 내려받았습니다.`,
      failedCount
    });
  };

  return (
    <ExportPageLayout
      title="사진내려받기"
      description="상품을 필터링한 뒤 해당 상품의 모든 submission 증빙 사진을 ZIP으로 내려받습니다."
      scopeMessage={scopeMessage}
      includeCompanyData={includeCompanyData}
      isCompanyScopeAvailable={scopeInfo.isCompanyScopeAvailable}
      onIncludeCompanyDataChange={handleIncludeCompanyDataChange}
      lastUpdatedAt={lastUpdatedAt}
      onRefresh={() => setRefreshKey((prev) => prev + 1)}
    >
      {errorMessage && <p className="login-error">{errorMessage}</p>}

      <section className="export-toolbar" aria-label="사진 내보내기 요약">
        <div className="export-toolbar-stats">
          <strong>상품 {filteredRows.length}개</strong>
          <span className="export-toolbar-dot">·</span>
          <span>전체 상품 {productRows.length}개</span>
          <span className="export-toolbar-dot">·</span>
          <span>사진 {photoTargets.length}장</span>
          {isLoading && <span className="export-toolbar-loading">불러오는 중...</span>}
        </div>
        <div className="export-toolbar-actions">
          <button type="button" className="admin-secondary-button" onClick={resetFilters} disabled={isLoading}>
            필터 초기화
          </button>
          <button
            type="button"
            className="admin-primary-button"
            onClick={downloadFilteredPhotos}
            disabled={isLoading || downloadState.isDownloading || photoTargets.length === 0}
          >
            {downloadState.isDownloading ? "ZIP 생성 중..." : "필터링된 사진 ZIP 다운로드"}
          </button>
        </div>
      </section>

      {downloadState.message && (
        <p className={downloadState.failedCount > 0 ? "login-error" : "login-message"}>
          {downloadState.message}
        </p>
      )}

      <section className="export-panel" aria-label="사진내려받기 상품 목록">
        <div className="export-panel-header">
          <div>
            <h2>상품내역</h2>
            <p>필터에 남은 상품의 submission 사진만 ZIP에 포함됩니다.</p>
          </div>
          <span className="export-row-count">{filteredRows.length}개</span>
        </div>

        <div className="export-preview-table-wrap export-photo-product-table-wrap">
          <table className="export-preview-table export-photo-product-table">
            <thead>
              <tr>
                {PHOTO_EXPORT_FILTER_COLUMNS.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
              <tr>
                {PHOTO_EXPORT_FILTER_COLUMNS.map((column) => (
                  <th key={`${column.key}-filter`}>
                    <input
                      type="text"
                      className="export-photo-filter-input"
                      value={filters[column.key] ?? ""}
                      onChange={(event) => handleFilterChange(column.key, event.target.value)}
                      placeholder="필터"
                      aria-label={`${column.label} 필터`}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={PHOTO_EXPORT_FILTER_COLUMNS.length}>상품내역을 불러오는 중입니다.</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={PHOTO_EXPORT_FILTER_COLUMNS.length}>필터 조건에 맞는 상품이 없습니다.</td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    {PHOTO_EXPORT_FILTER_COLUMNS.map((column) => (
                      <td key={`${row.id}-${column.key}`}>{row[column.key] == null || row[column.key] === "" ? "-" : row[column.key]}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </ExportPageLayout>
  );
}
