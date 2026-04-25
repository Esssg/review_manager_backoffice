import { useCallback, useEffect, useMemo, useState } from "react";
import { ADMIN_INCLUDE_COMPANY_DATA_STORAGE_KEY, ADMIN_STORAGE_KEY } from "../constants/admin";
import { fetchAdminExportData } from "../services/exportData";
import { buildSubmissionExportRows } from "../utils/exportColumns";

function getStoredIncludeCompanyData() {
  return localStorage.getItem(ADMIN_INCLUDE_COMPANY_DATA_STORAGE_KEY) === "true";
}

export default function useAdminExportData(options = {}) {
  const {
    forcePersonalScope = false,
    includeApplications = false,
    dateFilter = null,
    productId = null,
    depositOnly = false,
    selectedColumnKeys = []
  } = options;
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  const [includeCompanyData, setIncludeCompanyData] = useState(getStoredIncludeCompanyData);
  const [exportData, setExportData] = useState({
    products: [],
    submissions: [],
    evidencePhotos: [],
    applications: []
  });
  const [scopeInfo, setScopeInfo] = useState({
    companyName: null,
    isCompanyScopeAvailable: false
  });
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadExportData = async () => {
      setIsLoading(true);
      setErrorMessage("");

      if (!adminId) {
        if (isMounted) {
          setErrorMessage("로그인 정보가 없습니다. 다시 로그인해주세요.");
          setIsLoading(false);
        }
        return;
      }

      const result = await fetchAdminExportData(adminId, {
        includeCompanyData,
        forcePersonalScope,
        includeApplications,
        dateFilter,
        productId,
        depositOnly
      });

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
          evidencePhotos: [],
          applications: []
        });
        setErrorMessage(result.error.message ?? "내보내기 데이터를 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      setExportData({
        products: result.products,
        submissions: result.submissions,
        evidencePhotos: result.evidencePhotos,
        applications: result.applications
      });
      setLastUpdatedAt(new Date());
      setIsLoading(false);
    };

    loadExportData();

    return () => {
      isMounted = false;
    };
  }, [adminId, dateFilter, depositOnly, forcePersonalScope, includeApplications, includeCompanyData, productId, refreshKey]);

  const handleIncludeCompanyDataChange = useCallback((event) => {
    const nextChecked = event.target.checked;

    setIncludeCompanyData(nextChecked);
    localStorage.setItem(ADMIN_INCLUDE_COMPANY_DATA_STORAGE_KEY, String(nextChecked));
  }, []);

  const refreshExportData = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const exportRows = useMemo(
    () =>
      buildSubmissionExportRows({
        products: exportData.products,
        submissions: exportData.submissions,
        evidencePhotos: exportData.evidencePhotos,
        selectedColumnKeys
      }),
    [exportData.products, exportData.submissions, exportData.evidencePhotos, selectedColumnKeys]
  );

  const productCount = exportData.products.length;
  const submissionCount = exportData.submissions.length;
  const scopeMessage = forcePersonalScope
    ? "현재 로그인한 계정의 데이터만 내보냅니다."
    : includeCompanyData
      ? scopeInfo.companyName
        ? `현재 계정과 같은 회사(${scopeInfo.companyName}) 소속 관리자 데이터까지 함께 내보냅니다.`
        : "현재 계정에 회사 정보가 없어 내 계정 데이터만 내보냅니다."
      : "현재 로그인한 계정의 데이터만 내보냅니다.";

  return {
    adminId,
    includeCompanyData,
    handleIncludeCompanyDataChange,
    exportData,
    exportRows,
    productCount,
    submissionCount,
    scopeInfo,
    scopeMessage,
    lastUpdatedAt,
    refreshExportData,
    isLoading,
    errorMessage
  };
}
