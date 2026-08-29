// @ts-nocheck

import { supabase } from "@/lib/supabase";
import {
  ADMIN_INCLUDE_COMPANY_DATA_STORAGE_KEY,
  ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY,
  ADMIN_STORAGE_KEY,
  getAdminScopedStorageKey
} from "@/constants/admin";
import {
  getFallbackAdminCapabilities,
  isAdminCapabilitiesColumnError,
  normalizeAdminCapabilities
} from "@/utils/adminCapabilities";
import { fetchAllRows } from "@/services/paginatedQuery";
import { getLocalStorageValue, removeLocalStorageValue } from "@/utils/browserStorage";
import {
  isAdminGatewayConfigured,
  requestAdminGatewayAccess,
  requestAdminGatewayLogin
} from "@/services/adminGateway";

const ADMIN_MENU_PERMISSIONS_SELECT = "id,admin_id,menu_number,menu_label";
const ADMIN_CAPABILITIES_SELECT = "login_id,username,email,company,include_company_data_include,can_verify_deposit";

function normalizeAdminProfile(row) {
  if (!row) {
    return null;
  }

  return {
    loginId: row.login_id ?? row.loginId ?? null,
    username: row.username ?? null,
    email: row.email ?? null,
    company: row.company ?? null,
    companyId: row.company_id ?? row.companyId ?? null,
    role: row.role ?? null,
    isActive: row.is_active ?? row.isActive ?? true
  };
}

export async function validateAdminCredentials(loginId, password) {
  if (isAdminGatewayConfigured()) {
    try {
      const data = await requestAdminGatewayLogin(loginId, password);
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  return supabase
    .from("admins")
    .select("login_id,password")
    .eq("login_id", loginId)
    .eq("password", password)
    .maybeSingle();
}

export async function fetchAdminMenuPermissions(adminId) {
  if (isAdminGatewayConfigured()) {
    try {
      const access = await requestAdminGatewayAccess();
      return {
        data: access?.menuPermissions ?? access?.menu_permissions ?? [],
        error: null
      };
    } catch (error) {
      return { data: null, error };
    }
  }

  const result = await fetchAllRows(() =>
    supabase
      .from("admin_menu_permissions")
      .select(ADMIN_MENU_PERMISSIONS_SELECT)
      .eq("admin_id", adminId)
  );

  if (result.data) {
    result.data.sort((left, right) => left.menu_number - right.menu_number);
  }

  return result;
}

export async function fetchAdminCapabilities(adminId) {
  if (isAdminGatewayConfigured()) {
    try {
      const access = await requestAdminGatewayAccess();
      const profile = normalizeAdminProfile(access?.adminProfile ?? access?.profile ?? access?.principal);
      const gatewayCapabilities = access?.capabilities ?? {};

      return {
        capabilities: {
          includeCompanyDataInclude:
            typeof gatewayCapabilities.includeCompanyDataInclude === "boolean"
              ? gatewayCapabilities.includeCompanyDataInclude
              : Boolean(gatewayCapabilities.include_company_data_include),
          canVerifyDeposit:
            typeof gatewayCapabilities.canVerifyDeposit === "boolean"
              ? gatewayCapabilities.canVerifyDeposit
              : Boolean(gatewayCapabilities.can_verify_deposit)
        },
        adminProfile: profile,
        error: null
      };
    } catch (error) {
      return {
        capabilities: getFallbackAdminCapabilities(adminId),
        adminProfile: null,
        error
      };
    }
  }

  if (!adminId) {
    return {
      capabilities: getFallbackAdminCapabilities(adminId),
      adminProfile: null,
      error: new Error("로그인 정보가 없습니다. 다시 로그인해주세요.")
    };
  }

  const { data, error } = await supabase
    .from("admins")
    .select(ADMIN_CAPABILITIES_SELECT)
    .eq("login_id", adminId)
    .maybeSingle();

  if (error && isAdminCapabilitiesColumnError(error)) {
    const profileResult = await supabase
      .from("admins")
      .select("login_id,username,email,company")
      .eq("login_id", adminId)
      .maybeSingle();

    return {
      capabilities: getFallbackAdminCapabilities(adminId),
      adminProfile: normalizeAdminProfile(profileResult.data),
      error: null
    };
  }

  if (error) {
    return {
      capabilities: getFallbackAdminCapabilities(adminId),
      adminProfile: null,
      error
    };
  }

  return {
    capabilities: normalizeAdminCapabilities(adminId, data),
    adminProfile: normalizeAdminProfile(data),
    error: null
  };
}

export function logoutAdmin() {
  const currentAdminId = getLocalStorageValue(ADMIN_STORAGE_KEY);
  removeLocalStorageValue(ADMIN_STORAGE_KEY);
  removeLocalStorageValue(ADMIN_INCLUDE_COMPANY_DATA_STORAGE_KEY);
  removeLocalStorageValue(ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY);
  removeLocalStorageValue(getAdminScopedStorageKey(ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY, currentAdminId));
}
