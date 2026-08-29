// @ts-nocheck

import { useCallback, useEffect, useState } from "react";
import { ADMIN_STORAGE_KEY } from "@/constants/admin";
import { ADMIN_SCOPE_POLICY } from "@/constants/adminScope";
import { useAdminIncludeCompanyData } from "@/hooks/useAdminCapabilities";
import { fetchAdminDashboardData } from "@/services/dashboardMetrics";
import { buildDashboardMetrics } from "@/utils/dashboardMetrics";
import { getLocalStorageValue } from "@/utils/browserStorage";

export default function useAdminDashboard() {
  const adminId = getLocalStorageValue(ADMIN_STORAGE_KEY);
  const {
    includeCompanyData,
    adminProfile,
    scopePolicy,
    handleIncludeCompanyDataChange,
    isLoadingCapabilities,
    isIncludeCompanyDataReady,
    capabilitiesErrorMessage
  } = useAdminIncludeCompanyData(adminId);
  const [dashboardData, setDashboardData] = useState({
    products: [],
    submissions: [],
    applications: [],
    evidencePhotos: [],
    metrics: null
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

    const loadDashboard = async () => {
      setIsLoading(true);
      setErrorMessage("");

      if (isLoadingCapabilities || !isIncludeCompanyDataReady) {
        return;
      }

      if (!adminId) {
        if (isMounted) {
          setDashboardData({
            products: [],
            submissions: [],
            applications: [],
            evidencePhotos: [],
            metrics: null
          });
          setErrorMessage("로그인 정보가 없습니다. 다시 로그인해주세요.");
          setIsLoading(false);
        }
        return;
      }

      if (capabilitiesErrorMessage) {
        if (isMounted) {
          setDashboardData({
            products: [],
            submissions: [],
            applications: [],
            evidencePhotos: [],
            metrics: null
          });
          setErrorMessage(capabilitiesErrorMessage);
          setIsLoading(false);
        }
        return;
      }

      const result = await fetchAdminDashboardData(adminId, { scopePolicy, adminProfile });

      if (!isMounted) {
        return;
      }

      setScopeInfo({
        companyName: result.scope?.companyName ?? null,
        isCompanyScopeAvailable: result.scope?.isCompanyScopeAvailable ?? false
      });

      if (result.error) {
        setDashboardData({
          products: [],
          submissions: [],
          applications: [],
          evidencePhotos: [],
          metrics: null
        });
        setErrorMessage(result.error.message ?? "대시보드 데이터를 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      const metrics = buildDashboardMetrics({
        products: result.products,
        submissions: result.submissions,
        applications: result.applications,
        evidencePhotos: result.evidencePhotos,
        companyMembers: result.companyMembers
      });

      setDashboardData({
        products: result.products,
        submissions: result.submissions,
        applications: result.applications,
        evidencePhotos: result.evidencePhotos,
        metrics
      });
      setLastUpdatedAt(new Date());
      setIsLoading(false);
    };

    loadDashboard();

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

  const refreshDashboard = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const scopeMessage = scopePolicy === ADMIN_SCOPE_POLICY.ALL
    ? "모든 회사의 관리자 데이터를 함께 표시합니다."
    : includeCompanyData
    ? scopeInfo.companyName
      ? `현재 계정과 같은 회사(${scopeInfo.companyName}) 소속 관리자 데이터까지 함께 표시합니다.`
      : "현재 계정에 회사 정보가 없어 내 계정 데이터만 표시합니다."
    : "현재 로그인한 계정의 데이터만 표시합니다.";

  return {
    adminId,
    adminProfile,
    includeCompanyData,
    handleIncludeCompanyDataChange,
    dashboardData,
    scopeInfo,
    scopeMessage,
    lastUpdatedAt,
    refreshDashboard,
    isLoading,
    errorMessage
  };
}
