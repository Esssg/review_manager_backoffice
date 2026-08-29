// @ts-nocheck

import { supabase } from "@/lib/supabase";
import {
  isAdminGatewayConfigured,
  requestAdminGatewaySetting
} from "@/services/adminGateway";

const ADMIN_SETTINGS_SELECT = "login_id,username,phone_number,email,company";

export async function fetchAdminSetting(adminId) {
  if (isAdminGatewayConfigured()) {
    try {
      const data = await requestAdminGatewaySetting("settings", { settingType: "profile" });
      return { data: data?.profile ?? data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  return supabase
    .from("admins")
    .select(ADMIN_SETTINGS_SELECT)
    .eq("login_id", adminId)
    .single();
}

export async function updateAdminSetting(adminId, payload) {
  if (isAdminGatewayConfigured()) {
    try {
      const data = await requestAdminGatewaySetting("settings/update", {
        settingType: "profile",
        payload
      });
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  return supabase
    .from("admins")
    .update(payload)
    .eq("login_id", adminId);
}

export async function fetchAdminAccessSettings() {
  if (!isAdminGatewayConfigured()) {
    return {
      data: [],
      error: null,
      isLegacyCompatibility: true
    };
  }

  try {
    const data = await requestAdminGatewaySetting("settings", { settingType: "access" });
    return {
      data: data?.settings ?? data?.resolvedSettings ?? [],
      error: null,
      isLegacyCompatibility: false
    };
  } catch (error) {
    return {
      data: [],
      error,
      isLegacyCompatibility: false
    };
  }
}

export async function updateAdminAccessSetting(payload) {
  if (!isAdminGatewayConfigured()) {
    return {
      data: null,
      error: new Error("DB 기반 설정 서버가 아직 활성화되지 않았습니다."),
      isLegacyCompatibility: true
    };
  }

  try {
    const data = await requestAdminGatewaySetting("settings/update", payload);
    return {
      data,
      error: null,
      isLegacyCompatibility: false
    };
  } catch (error) {
    return {
      data: null,
      error,
      isLegacyCompatibility: false
    };
  }
}
