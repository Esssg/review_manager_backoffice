import { supabase } from "../lib/supabase";

const ADMIN_MENU_PERMISSIONS_SELECT = "admin_id,menu_number,menu_label";

export async function validateAdminCredentials(loginId, password) {
  return supabase
    .from("admins")
    .select("login_id,password")
    .eq("login_id", loginId)
    .eq("password", password)
    .maybeSingle();
}

export async function fetchAdminMenuPermissions(adminId) {
  return supabase
    .from("admin_menu_permissions")
    .select(ADMIN_MENU_PERMISSIONS_SELECT)
    .eq("admin_id", adminId)
    .order("menu_number", { ascending: true });
}

export function logoutAdmin() {
  localStorage.removeItem("review_manager_admin_id");
  localStorage.removeItem("review_manager_include_company_data");
  localStorage.removeItem("review_manager_admin_sidebar_collapsed");
}
