// @ts-nocheck

import { useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getAdminScopePolicy } from "@/constants/adminScope";
import { AdminAccessContext } from "@/contexts/AdminAccessContext";
import { fetchAdminCapabilities } from "@/services/adminAuth";
import { getFallbackAdminCapabilities } from "@/utils/adminCapabilities";

function useLocalAdminCapabilities(adminId, skipFetch) {
  const [capabilities, setCapabilities] = useState(() => getFallbackAdminCapabilities(adminId));
  const [adminProfile, setAdminProfile] = useState(null);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(Boolean(adminId));
  const [capabilitiesErrorMessage, setCapabilitiesErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (skipFetch) {
      return () => {
        isMounted = false;
      };
    }

    const loadCapabilities = async () => {
      if (!adminId) {
        setCapabilities(getFallbackAdminCapabilities(adminId));
        setAdminProfile(null);
        setCapabilitiesErrorMessage("로그인 정보가 없습니다. 다시 로그인해주세요.");
        setIsLoadingCapabilities(false);
        return;
      }

      setIsLoadingCapabilities(true);
      setCapabilitiesErrorMessage("");

      const { capabilities: nextCapabilities, adminProfile: nextAdminProfile, error } = await fetchAdminCapabilities(adminId);

      if (!isMounted) {
        return;
      }

      setCapabilities(nextCapabilities ?? getFallbackAdminCapabilities(adminId));
      setAdminProfile(nextAdminProfile ?? null);
      setCapabilitiesErrorMessage(error?.message ?? "");
      setIsLoadingCapabilities(false);
    };

    loadCapabilities();

    return () => {
      isMounted = false;
    };
  }, [adminId, skipFetch]);

  return {
    capabilities,
    adminProfile,
    isLoadingCapabilities,
    capabilitiesErrorMessage
  };
}

export function useAdminCapabilities(adminId) {
  const accessContext = useContext(AdminAccessContext);
  const hasMatchingAccessContext = accessContext?.adminId === adminId;
  const localAccess = useLocalAdminCapabilities(adminId, hasMatchingAccessContext);

  return hasMatchingAccessContext ? accessContext : localAccess;
}

export function useAdminIncludeCompanyData(adminId) {
  const location = useLocation();
  const {
    capabilities,
    adminProfile,
    isLoadingCapabilities,
    capabilitiesErrorMessage
  } = useAdminCapabilities(adminId);
  const [includeCompanyData, setIncludeCompanyData] = useState(false);
  const [isIncludeCompanyDataReady, setIsIncludeCompanyDataReady] = useState(false);

  useEffect(() => {
    setIsIncludeCompanyDataReady(false);
  }, [adminId]);

  useEffect(() => {
    if (!adminId || isLoadingCapabilities) {
      return;
    }

    setIncludeCompanyData(Boolean(capabilities.includeCompanyDataInclude));
    setIsIncludeCompanyDataReady(true);
  }, [adminId, capabilities.includeCompanyDataInclude, isLoadingCapabilities, location.pathname]);

  const handleIncludeCompanyDataChange = useCallback(
    (event) => {
      const nextChecked = Boolean(event.target.checked);

      setIncludeCompanyData(nextChecked);
    },
    []
  );
  const companyName = typeof adminProfile?.company === "string" ? adminProfile.company.trim() : "";
  const isCompanyScopeAvailable = Boolean(companyName);
  const scopeMessage = includeCompanyData
    ? companyName
      ? `현재 계정과 같은 회사(${companyName}) 데이터를 함께 표시합니다.`
      : "현재 계정에 회사 정보가 없어 내 계정 데이터만 표시합니다."
    : "현재 로그인한 계정의 데이터만 표시합니다.";

  return {
    capabilities,
    adminProfile,
    includeCompanyData,
    scopePolicy: getAdminScopePolicy(includeCompanyData),
    handleIncludeCompanyDataChange,
    isCompanyScopeAvailable,
    scopeMessage,
    isLoadingCapabilities,
    isIncludeCompanyDataReady,
    capabilitiesErrorMessage
  };
}
