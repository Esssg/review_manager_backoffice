import { useEffect, useMemo, useState } from "react";
import ExportColumnSelector from "../../components/admin/export/ExportColumnSelector";
import ExportFilterPanel from "../../components/admin/export/ExportFilterPanel";
import ExportPageLayout from "../../components/admin/export/ExportPageLayout";
import ExportPreviewTable from "../../components/admin/export/ExportPreviewTable";
import ExportToolbar from "../../components/admin/export/ExportToolbar";
import ExportWorkbookDownloadButton from "../../components/admin/export/ExportWorkbookDownloadButton";
import useAdminExportData from "../../hooks/useAdminExportData";
import useExportColumnSelection from "../../hooks/useExportColumnSelection";
import {
  APPLICATION_EXPORT_COLUMNS,
  APPLICATION_EXPORT_COLUMN_PRESET,
  buildApplicationExportRows,
  buildSubmissionExportRows,
  getApplicationPresetColumnKeys
} from "../../utils/exportColumns";
import { buildExportFilename } from "../../utils/exportFile";

const APPLICATION_EXPORT_COLUMN_PRESETS = [
  { key: APPLICATION_EXPORT_COLUMN_PRESET.BASIC, label: "기본" },
  { key: APPLICATION_EXPORT_COLUMN_PRESET.CONFIRMED, label: "확정용" },
  { key: APPLICATION_EXPORT_COLUMN_PRESET.ALL, label: "전체" }
];

function formatProductOptionLabel(product) {
  const title = String(product?.title ?? "").trim();
  const productName = String(product?.product_name ?? "").trim();

  if (title && productName) {
    return `${product.id} · ${title} / ${productName}`;
  }

  if (title) {
    return `${product.id} · ${title}`;
  }

  if (productName) {
    return `${product.id} · ${productName}`;
  }

  return `상품 ${product?.id ?? "-"}`;
}

export default function AdminExportByProductPage() {
  const [selectedProductId, setSelectedProductId] = useState("");
  const submissionColumnSelection = useExportColumnSelection({
    storageKey: "review_manager_export_columns_by_product_submissions"
  });
  const applicationColumnSelection = useExportColumnSelection({
    storageKey: "review_manager_export_columns_by_product_applications",
    defaultPreset: APPLICATION_EXPORT_COLUMN_PRESET.BASIC,
    getPresetColumnKeysFn: getApplicationPresetColumnKeys,
    presetKeys: APPLICATION_EXPORT_COLUMN_PRESETS.map((preset) => preset.key)
  });

  const {
    includeCompanyData,
    handleIncludeCompanyDataChange,
    exportData,
    scopeInfo,
    scopeMessage,
    lastUpdatedAt,
    refreshExportData,
    isLoading,
    errorMessage
  } = useAdminExportData({
    includeApplications: true
  });

  useEffect(() => {
    if (exportData.products.length === 0) {
      if (selectedProductId) {
        setSelectedProductId("");
      }

      return;
    }

    const hasCurrentProduct = exportData.products.some((product) => String(product.id) === selectedProductId);

    if (!selectedProductId || !hasCurrentProduct) {
      setSelectedProductId(String(exportData.products[0].id));
    }
  }, [exportData.products, selectedProductId]);

  const selectedProduct = useMemo(
    () => exportData.products.find((product) => String(product.id) === selectedProductId) ?? null,
    [exportData.products, selectedProductId]
  );

  const filteredSubmissions = useMemo(() => {
    if (!selectedProductId) {
      return [];
    }

    return exportData.submissions.filter((submission) => String(submission.product_id) === selectedProductId);
  }, [exportData.submissions, selectedProductId]);

  const filteredApplications = useMemo(() => {
    if (!selectedProductId) {
      return [];
    }

    return exportData.applications.filter((application) => String(application.product_id) === selectedProductId);
  }, [exportData.applications, selectedProductId]);

  const submissionRows = useMemo(
    () =>
      buildSubmissionExportRows({
        products: exportData.products,
        submissions: filteredSubmissions,
        evidencePhotos: exportData.evidencePhotos,
        selectedColumnKeys: submissionColumnSelection.selectedColumnKeys
      }),
    [
      exportData.evidencePhotos,
      exportData.products,
      filteredSubmissions,
      submissionColumnSelection.selectedColumnKeys
    ]
  );

  const applicationRows = useMemo(
    () =>
      buildApplicationExportRows({
        products: exportData.products,
        applications: filteredApplications,
        selectedColumnKeys: applicationColumnSelection.selectedColumnKeys
      }),
    [applicationColumnSelection.selectedColumnKeys, exportData.products, filteredApplications]
  );

  const hasNoSelectedProduct = !selectedProductId;
  const disableWorkbookDownload =
    hasNoSelectedProduct ||
    (submissionColumnSelection.selectedColumnKeys.length === 0 && applicationColumnSelection.selectedColumnKeys.length === 0);
  const workbookSheets = [
    submissionColumnSelection.selectedColumnKeys.length > 0
      ? {
          name: "제출 목록",
          rows: submissionRows
        }
      : null,
    applicationColumnSelection.selectedColumnKeys.length > 0
      ? {
          name: "신청자 명단",
          rows: applicationRows
        }
      : null
  ].filter(Boolean);

  return (
    <ExportPageLayout
      title="상품별 내보내기"
      description="특정 상품 1건을 골라 그 상품의 제출 데이터와 신청자 명단을 같은 워크북으로 내보냅니다."
      scopeMessage={scopeMessage}
      includeCompanyData={includeCompanyData}
      isCompanyScopeAvailable={scopeInfo.isCompanyScopeAvailable}
      onIncludeCompanyDataChange={handleIncludeCompanyDataChange}
      lastUpdatedAt={lastUpdatedAt}
      onRefresh={refreshExportData}
    >
      <ExportFilterPanel
        title="상품 선택"
        description="내보낼 기준 상품을 하나 선택하세요. 선택한 상품의 제출과 신청자 데이터만 아래 미리보기에 표시됩니다."
      >
        <div className="export-select-row">
          <label className="export-select-field">
            <span>대상 상품</span>
            <select
              className="export-select-input"
              value={selectedProductId}
              onChange={(event) => setSelectedProductId(event.target.value)}
              disabled={exportData.products.length === 0}
            >
              {exportData.products.length === 0 ? (
                <option value="">선택 가능한 상품이 없습니다.</option>
              ) : (
                exportData.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {formatProductOptionLabel(product)}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
        {selectedProduct && <p className="dashboard-meta">선택된 상품: {formatProductOptionLabel(selectedProduct)}</p>}
      </ExportFilterPanel>

      {errorMessage && <p className="login-error">{errorMessage}</p>}
      <ExportToolbar
        summaryItems={[
          `선택 상품 ${selectedProduct ? "1건" : "0건"}`,
          `제출 ${filteredSubmissions.length}건`,
          `신청 ${filteredApplications.length}건`
        ]}
        isLoading={isLoading}
      >
        <ExportWorkbookDownloadButton
          filename={buildExportFilename("상품별")}
          sheets={workbookSheets}
          disabled={disableWorkbookDownload}
          isLoading={isLoading}
          buttonLabel={`Excel 다운로드 (제출 ${submissionRows.length}건 / 신청 ${applicationRows.length}건)`}
          emptyMessage="선택한 상품에 내보낼 제출/신청자 데이터가 없습니다."
          disabledMessage={
            hasNoSelectedProduct
              ? "내보낼 상품을 먼저 선택해주세요."
              : "제출 또는 신청자 컬럼을 1개 이상 선택해야 다운로드할 수 있습니다."
          }
        />
      </ExportToolbar>

      <section className="export-section-stack" aria-label="상품별 제출 데이터">
        <ExportColumnSelector
          activePreset={submissionColumnSelection.activePreset}
          selectedColumnKeys={submissionColumnSelection.selectedColumnKeys}
          onPresetSelect={submissionColumnSelection.applyPreset}
          onColumnToggle={submissionColumnSelection.toggleColumn}
          onSelectAll={submissionColumnSelection.selectAllColumns}
          onClear={submissionColumnSelection.clearColumns}
        />
        <ExportPreviewTable rows={submissionRows} />
      </section>

      <section className="export-section-stack" aria-label="상품별 신청자 데이터">
        <ExportColumnSelector
          columns={APPLICATION_EXPORT_COLUMNS}
          presets={APPLICATION_EXPORT_COLUMN_PRESETS}
          activePreset={applicationColumnSelection.activePreset}
          selectedColumnKeys={applicationColumnSelection.selectedColumnKeys}
          onPresetSelect={applicationColumnSelection.applyPreset}
          onColumnToggle={applicationColumnSelection.toggleColumn}
          onSelectAll={applicationColumnSelection.selectAllColumns}
          onClear={applicationColumnSelection.clearColumns}
        />
        <ExportPreviewTable rows={applicationRows} />
      </section>
    </ExportPageLayout>
  );
}
