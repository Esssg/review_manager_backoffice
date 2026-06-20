import { supabase } from "../lib/supabase";
import {
  getFallbackAdminCapabilities,
  isAdminCapabilitiesColumnError,
  normalizeAdminCapabilities
} from "../utils/adminCapabilities";
import { fetchAllRows } from "./paginatedQuery";

const ADMIN_MENU_PERMISSIONS_SELECT = "id,admin_id,menu_number,menu_label";
const ADMIN_CAPABILITIES_SELECT = "login_id,include_company_data_include,can_verify_deposit";

export async function validateAdminCredentials(loginId, password) {
  return supabase
    .from("admins")
    .select("login_id,password")
    .eq("login_id", loginId)
    .eq("password", password)
    .maybeSingle();
}

export async function fetchAdminMenuPermissions(adminId) {
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
  if (!adminId) {
    return {
      capabilities: getFallbackAdminCapabilities(adminId),
      error: new Error("로그인 정보가 없습니다. 다시 로그인해주세요.")
    };
  }

  const { data, error } = await supabase
    .from("admins")
    .select(ADMIN_CAPABILITIES_SELECT)
    .eq("login_id", adminId)
    .maybeSingle();

  if (error && isAdminCapabilitiesColumnError(error)) {
    return {
      capabilities: getFallbackAdminCapabilities(adminId),
      error: null
    };
  }

  if (error) {
    return {
      capabilities: getFallbackAdminCapabilities(adminId),
      error
    };
  }

  return {
    capabilities: normalizeAdminCapabilities(adminId, data),
    error: null
  };
}

export function logoutAdmin() {
  localStorage.removeItem("review_manager_admin_id");
  localStorage.removeItem("review_manager_include_company_data");
  localStorage.removeItem("review_manager_admin_sidebar_collapsed");
}
