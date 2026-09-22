// @ts-nocheck

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ADMIN_PERMISSION_CODE } from "@/constants/adminAccess";
import {
  ADMIN_SCOPE_POLICY,
  clampAdminRequestedScope,
  getAdminScopePreferenceKey,
  getDefaultAdminRequestedScope,
  getEffectiveAdminScopePolicy,
  getNarrowerAdminScope,
  normalizeAdminRequestedScope
} from "@/constants/adminScope";
import { AdminAccessContext } from "@/contexts/AdminAccessContext";
import { fetchAdminAccessBundle } from "@/services/adminAccess";
import { getFallbackAdminCapabilities } from "@/utils/adminCapabilities";
import { resolveAdminActionPermission } from "@/utils/adminActionAccess";
import { getLocalStorageValue, setLocalStorageValue } from "@/utils/browserStorage";

function useLocalAdminCapabilities(adminId, skipFetch) {
  const [capabilities, setCapabilities] = useState(() => getFallbackAdminCapabilities(adminId));
  const [adminProfile, setAdminProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [menuPermissions, setMenuPermissions] = useState([]);
  const [permissionBindings, setPermissionBindings] = useState([]);
  const [settings, setSettings] = useState([]);
  const [menuErrorMessage, setMenuErrorMessage] = useState("");
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
        setRole(null);
        setCompanyId(null);
        setMenuPermissions([]);
        setPermissionBindings([]);
        setSettings([]);
        setMenuErrorMessage("");
        setCapabilitiesErrorMessage("로그인 정보가 없습니다. 다시 로그인해주세요.");
        setIsLoadingCapabilities(false);
        return;
      }

      setIsLoadingCapabilities(true);
      setCapabilitiesErrorMessage("");
      setMenuErrorMessage("");

      const access = await fetchAdminAccessBundle(adminId);

      if (!isMounted) {
        return;
      }

      setCapabilities(access.capabilities ?? getFallbackAdminCapabilities(adminId));
      setAdminProfile(access.adminProfile ?? null);
      setRole(access.role ?? null);
      setCompanyId(access.companyId ?? null);
      setMenuPermissions(Array.isArray(access.menuPermissions) ? access.menuPermissions : []);
      setPermissionBindings(Array.isArray(access.permissionBindings) ? access.permissionBindings : []);
      setSettings(Array.isArray(access.settings) ? access.settings : []);
      setCapabilitiesErrorMessage(access.capabilitiesError?.message ?? "");
      setMenuErrorMessage(access.menuError?.message ?? "");
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
    role,
    companyId,
    menuPermissions,
    permissionBindings,
    settings,
    isLoadingCapabilities,
    capabilitiesErrorMessage,
    menuErrorMessage
  };
}

export function useAdminCapabilities(adminId) {
  const accessContext = useContext(AdminAccessContext);
  const hasMatchingAccessContext = accessContext?.adminId === adminId;
  const localAccess = useLocalAdminCapabilities(adminId, hasMatchingAccessContext);

  return hasMatchingAccessContext ? accessContext : localAccess;
}

const DEFAULT_SCOPE_PERMISSION_CODES = [
  ADMIN_PERMISSION_CODE.PRODUCT_READ,
  ADMIN_PERMISSION_CODE.SUBMISSION_READ
];

function normalizePermissionCodes(value) {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.filter(Boolean)));
}

function getRoleMaximumScope(role) {
  const normalizedRole = String(role ?? "").toLowerCase();

  if (normalizedRole === "developer") {
    return ADMIN_SCOPE_POLICY.ALL;
  }

  if (normalizedRole === "company_admin" || normalizedRole === "employee") {
    return ADMIN_SCOPE_POLICY.COMPANY;
  }

  return ADMIN_SCOPE_POLICY.PERSONAL;
}

function getFallbackScope(capabilities, role) {
  const legacyScope = capabilities?.includeCompanyDataInclude
    ? String(role ?? "").toLowerCase() === "developer"
      ? ADMIN_SCOPE_POLICY.ALL
      : ADMIN_SCOPE_POLICY.COMPANY
    : ADMIN_SCOPE_POLICY.PERSONAL;

  return getNarrowerAdminScope(legacyScope, getRoleMaximumScope(role));
}

export function useAdminIncludeCompanyData(adminId, options = {}) {
  const {
    capabilities,
    adminProfile,
    role,
    companyId,
    permissionBindings,
    isLoadingCapabilities,
    capabilitiesErrorMessage
  } = useAdminCapabilities(adminId);
  const permissionCodes = useMemo(
    () => normalizePermissionCodes(options.permissionCodes ?? DEFAULT_SCOPE_PERMISSION_CODES),
    [options.permissionCodes]
  );
  const legacyMenuCodes = options.legacyMenuCodes;
  const forcePersonalScope = Boolean(options.forcePersonalScope);
  const companyName = typeof adminProfile?.company === "string" ? adminProfile.company.trim() : "";
  const hasCompanyIdentity = Boolean(companyName || companyId);
  const accessSnapshot = useMemo(
    () => ({
      adminId,
      adminProfile,
      role,
      companyId,
      capabilities,
      permissionBindings,
      isLoadingCapabilities,
      capabilitiesErrorMessage,
      menuErrorMessage: ""
    }),
    [
      adminId,
      adminProfile,
      role,
      companyId,
      capabilities,
      permissionBindings,
      isLoadingCapabilities,
      capabilitiesErrorMessage
    ]
  );
  const maximumScope = useMemo(() => {
    const fallbackScope = getFallbackScope(capabilities, role);

    if (permissionCodes.length === 0) {
      return fallbackScope;
    }

    return permissionCodes.reduce((scope, permissionCode) => {
      const permission = resolveAdminActionPermission(permissionCode, accessSnapshot, {
        legacyMenuCodes,
        legacyFallbackAllowed: true
      });

      if (!permission.allowed) {
        return ADMIN_SCOPE_POLICY.PERSONAL;
      }

      return getNarrowerAdminScope(
        scope,
        getNarrowerAdminScope(permission.dataScope ?? fallbackScope, getRoleMaximumScope(role))
      );
    }, ADMIN_SCOPE_POLICY.ALL);
  }, [accessSnapshot, capabilities, legacyMenuCodes, permissionCodes, role]);
  const isCompanyScopeAvailable = maximumScope !== ADMIN_SCOPE_POLICY.PERSONAL
    && (maximumScope === ADMIN_SCOPE_POLICY.ALL || hasCompanyIdentity);
  const [requestedScope, setRequestedScope] = useState(ADMIN_SCOPE_POLICY.PERSONAL);
  const [isIncludeCompanyDataReady, setIsIncludeCompanyDataReady] = useState(false);

  useEffect(() => {
    setIsIncludeCompanyDataReady(false);
  }, [adminId]);

  useEffect(() => {
    if (!adminId || isLoadingCapabilities) {
      return;
    }

    const storedScopeValue = getLocalStorageValue(getAdminScopePreferenceKey(adminId), "");
    const hasStoredScope = Boolean(storedScopeValue);
    const storedScope = normalizeAdminRequestedScope(storedScopeValue);
    const defaultScope = getDefaultAdminRequestedScope(adminId, companyName);
    const nextScope = forcePersonalScope
      ? ADMIN_SCOPE_POLICY.PERSONAL
      : clampAdminRequestedScope(
          hasStoredScope ? storedScope : defaultScope,
          maximumScope,
          isCompanyScopeAvailable
        );

    setRequestedScope(nextScope);
    if (!forcePersonalScope) {
      setLocalStorageValue(getAdminScopePreferenceKey(adminId), nextScope);
    }
    setIsIncludeCompanyDataReady(true);
  }, [
    adminId,
    companyName,
    forcePersonalScope,
    isCompanyScopeAvailable,
    isLoadingCapabilities,
    maximumScope
  ]);

  const handleIncludeCompanyDataChange = useCallback(
    (event) => {
      const requestedValue = event?.target?.value
        ?? (event?.target?.checked ? ADMIN_SCOPE_POLICY.COMPANY : ADMIN_SCOPE_POLICY.PERSONAL);
      const nextScope = forcePersonalScope
        ? ADMIN_SCOPE_POLICY.PERSONAL
        : clampAdminRequestedScope(requestedValue, maximumScope, isCompanyScopeAvailable);

      setRequestedScope(nextScope);
      if (!forcePersonalScope && adminId) {
        setLocalStorageValue(getAdminScopePreferenceKey(adminId), nextScope);
      }
    },
    [adminId, forcePersonalScope, isCompanyScopeAvailable, maximumScope]
  );
  const scopePolicy = getEffectiveAdminScopePolicy(requestedScope, maximumScope, isCompanyScopeAvailable);
  const includeCompanyData = scopePolicy !== ADMIN_SCOPE_POLICY.PERSONAL;
  const scopeMessage = scopePolicy === ADMIN_SCOPE_POLICY.ALL
    ? "모든 회사의 관리자 데이터를 함께 표시합니다."
    : maximumScope === ADMIN_SCOPE_POLICY.PERSONAL
    ? "이 계정은 본인 데이터 범위로 설정되어 회사 전체를 볼 수 없습니다."
    : includeCompanyData
    ? companyName
      ? `현재 계정과 같은 회사(${companyName}) 데이터를 함께 표시합니다.`
      : "현재 계정에 회사 정보가 없어 내 계정 데이터만 표시합니다."
    : "현재 로그인한 계정의 데이터만 표시합니다.";

  return {
    capabilities,
    adminProfile,
    role,
    companyId,
    permissionBindings,
    includeCompanyData,
    scopePolicy,
    requestedScope,
    maximumScope,
    handleIncludeCompanyDataChange,
    isCompanyScopeAvailable,
    scopeMessage,
    isLoadingCapabilities,
    isIncludeCompanyDataReady,
    capabilitiesErrorMessage
  };
}
