import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchAdminCapabilities } from "../services/adminAuth";
import { getFallbackAdminCapabilities } from "../utils/adminCapabilities";

export function useAdminCapabilities(adminId) {
  const [capabilities, setCapabilities] = useState(() => getFallbackAdminCapabilities(adminId));
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(Boolean(adminId));
  const [capabilitiesErrorMessage, setCapabilitiesErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadCapabilities = async () => {
      if (!adminId) {
        setCapabilities(getFallbackAdminCapabilities(adminId));
        setCapabilitiesErrorMessage("로그인 정보가 없습니다. 다시 로그인해주세요.");
        setIsLoadingCapabilities(false);
        return;
      }

      setIsLoadingCapabilities(true);
      setCapabilitiesErrorMessage("");

      const { capabilities: nextCapabilities, error } = await fetchAdminCapabilities(adminId);

      if (!isMounted) {
        return;
      }

      setCapabilities(nextCapabilities ?? getFallbackAdminCapabilities(adminId));
      setCapabilitiesErrorMessage(error?.message ?? "");
      setIsLoadingCapabilities(false);
    };

    loadCapabilities();

    return () => {
      isMounted = false;
    };
  }, [adminId]);

  return {
    capabilities,
    isLoadingCapabilities,
    capabilitiesErrorMessage
  };
}

export function useAdminIncludeCompanyData(adminId) {
  const location = useLocation();
  const { capabilities, isLoadingCapabilities, capabilitiesErrorMessage } = useAdminCapabilities(adminId);
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
    includeCompanyData,
    handleIncludeCompanyDataChange,
    isLoadingCapabilities,
    isIncludeCompanyDataReady,
    capabilitiesErrorMessage
  };
}
