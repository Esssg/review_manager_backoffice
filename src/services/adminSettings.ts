// @ts-nocheck

import { supabase } from "@/lib/supabase";

const ADMIN_SETTINGS_SELECT = "login_id,username,phone_number,email,company";

export function fetchAdminSetting(adminId) {
  return supabase
    .from("admins")
    .select(ADMIN_SETTINGS_SELECT)
    .eq("login_id", adminId)
    .single();
}

export function updateAdminSetting(adminId, payload) {
  return supabase
    .from("admins")
    .update(payload)
    .eq("login_id", adminId);
}
