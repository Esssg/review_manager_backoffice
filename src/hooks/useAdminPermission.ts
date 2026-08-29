// @ts-nocheck

import { useMemo } from "react";
import { isAdminGatewayConfigured } from "@/services/adminGateway";
import { useAdminAccessContext } from "@/contexts/AdminAccessContext";
import { resolveAdminActionPermission } from "@/utils/adminActionAccess";

export function useAdminPermissions(permissionCodes = [], options = {}) {
  const access = useAdminAccessContext();
  const normalizedCodes = useMemo(
    () => Array.from(new Set((Array.isArray(permissionCodes) ? permissionCodes : [permissionCodes]).filter(Boolean))),
    [permissionCodes]
  );
  const legacyFallbackAllowed = options.legacyFallbackAllowed ?? !isAdminGatewayConfigured();

  return useMemo(
    () => normalizedCodes.reduce((result, permissionCode) => {
      result[permissionCode] = resolveAdminActionPermission(permissionCode, access ?? {}, {
        ...options,
        legacyFallbackAllowed
      });
      return result;
    }, {}),
    [access, legacyFallbackAllowed, normalizedCodes, options]
  );
}

export function useAdminPermission(permissionCode, options = {}) {
  const permissions = useAdminPermissions([permissionCode], options);
  return permissions[permissionCode] ?? {
    permissionCode,
    allowed: false,
    isReady: false,
    effect: "deny",
    dataScope: null,
    source: null,
    matchedBindings: []
  };
}
