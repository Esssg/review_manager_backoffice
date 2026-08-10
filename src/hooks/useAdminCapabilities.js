import { useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getAdminScopePolicy } from "../constants/adminScope";
import { AdminAccessContext } from "../contexts/AdminAccessContext";
import { fetchAdminCapabilities } from "../services/adminAuth";
import { getFallbackAdminCapabilities } from "../utils/adminCapabilities";

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

  return {
    capabilities,
    adminProfile,
    includeCompanyData,
    scopePolicy: getAdminScopePolicy(includeCompanyData),
    handleIncludeCompanyDataChange,
    isLoadingCapabilities,
    isIncludeCompanyDataReady,
    capabilitiesErrorMessage
  };
}
