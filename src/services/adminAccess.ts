// @ts-nocheck

import { getPermissionCodeForMenuNumber } from "@/constants/adminAccess";
import { fetchAdminCapabilities, fetchAdminMenuPermissions } from "@/services/adminAuth";
import {
  AdminGatewayError,
  isAdminGatewayConfigured,
  requestAdminGatewayAccess
} from "@/services/adminGateway";
import { normalizePermissionBinding } from "@/utils/permissionResolver";

function normalizeProfile(profile) {
  if (!profile) {
    return null;
  }

  return {
    ...profile,
    loginId: profile.loginId ?? profile.login_id ?? null,
    companyId: profile.companyId ?? profile.company_id ?? null,
    role: profile.role ?? null
  };
}

function menuRowsToPermissionBindings(menuRows) {
  return (Array.isArray(menuRows) ? menuRows : [])
    .map((row, index) => {
      const permissionCode = row.permission_code ?? row.permissionCode ?? getPermissionCodeForMenuNumber(row.menu_number ?? row.menuNumber);

      if (!permissionCode) {
        return null;
      }

      return normalizePermissionBinding(
        {
          ...row,
          subject_type: row.subject_type ?? "admin",
          subject_id: row.subject_id ?? row.admin_id ?? row.adminId,
          permission_code: permissionCode,
          effect: row.effect ?? "allow",
          data_scope: row.data_scope ?? "personal"
        },
        index
      );
    })
    .filter(Boolean);
}

/**
 * 권한 컨텍스트의 단일 read 계약이다.
 * 새 DB/gateway 응답이 없으면 기존 admins/admin_menu_permissions read를 사용해
 * 운영 번들의 메뉴와 capability를 그대로 보존한다.
 */
export async function fetchAdminAccessBundle(adminId) {
  if (isAdminGatewayConfigured()) {
    try {
      const access = await requestAdminGatewayAccess();
      const adminProfile = normalizeProfile(access?.adminProfile ?? access?.profile ?? access?.principal);
      const sessionAdminId = access?.principal?.adminId ?? access?.principal?.admin_id ?? adminProfile?.loginId;

      if (sessionAdminId && String(sessionAdminId) !== String(adminId)) {
        throw new AdminGatewayError("관리자 세션과 화면 계정이 일치하지 않습니다. 다시 로그인해주세요.", {
          code: "ADMIN_SESSION_PRINCIPAL_MISMATCH",
          status: 401
        });
      }
      const menuPermissions = access?.menuPermissions ?? access?.menu_permissions ?? [];
      const permissionBindings = (access?.permissionBindings ?? access?.permissions ?? menuRowsToPermissionBindings(menuPermissions))
        .map((row, index) => normalizePermissionBinding(row, index))
        .filter(Boolean);

      return {
        adminId,
        adminProfile,
        role: access?.role ?? adminProfile?.role ?? null,
        companyId: access?.companyId ?? adminProfile?.companyId ?? null,
        capabilities: access?.capabilities ?? null,
        menuPermissions,
        permissionBindings,
        settings: access?.settings ?? access?.resolvedSettings ?? [],
        capabilitiesError: null,
        menuError: null,
        error: null
      };
    } catch (error) {
      return {
        adminId,
        adminProfile: null,
        role: null,
        companyId: null,
        capabilities: null,
        menuPermissions: [],
        permissionBindings: [],
        settings: [],
        capabilitiesError: error,
        menuError: error,
        error
      };
    }
  }

  const [capabilityResult, menuResult] = await Promise.all([
    fetchAdminCapabilities(adminId),
    fetchAdminMenuPermissions(adminId)
  ]);
  const adminProfile = normalizeProfile(capabilityResult?.adminProfile);
  const menuPermissions = menuResult?.data ?? [];

  return {
    adminId,
    adminProfile,
    role: adminProfile?.role ?? null,
    companyId: adminProfile?.companyId ?? null,
    capabilities: capabilityResult?.capabilities ?? null,
    menuPermissions,
    permissionBindings: menuRowsToPermissionBindings(menuPermissions),
    settings: [],
    capabilitiesError: capabilityResult?.error ?? null,
    menuError: menuResult?.error ?? null,
    error: capabilityResult?.error ?? menuResult?.error ?? null
  };
}
