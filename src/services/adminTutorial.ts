// @ts-nocheck

import { supabase } from "@/lib/supabase";
import {
  ADMIN_GATEWAY_OPERATION,
  callAdminGatewayOperation
} from "@/services/adminGatewayData";
import { isAdminGatewayConfigured } from "@/services/adminGateway";

export const ADMIN_TUTORIAL_PROGRESS_TABLE = "admin_tutorial_progress";

export async function fetchAdminTutorialProgress(adminId, tutorialVersion) {
  if (!adminId || !tutorialVersion) {
    return { data: null, error: new Error("튜토리얼 진행 상태를 확인할 계정 정보가 없습니다.") };
  }

  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.TUTORIAL_READ, {
      p_tutorial_version: tutorialVersion
    });
    const data = result.data?.progress ?? result.data?.data ?? result.data ?? null;

    return {
      data: result.error ? null : data,
      error: result.error
    };
  }

  const { data, error } = await supabase
    .from(ADMIN_TUTORIAL_PROGRESS_TABLE)
    .select("admin_id,tutorial_version,status,recorded_at")
    .eq("admin_id", adminId)
    .eq("tutorial_version", tutorialVersion)
    .maybeSingle();

  return { data: data ?? null, error: error ?? null };
}

export async function saveAdminTutorialProgress(adminId, tutorialVersion, status) {
  if (!adminId || !tutorialVersion || !["skipped", "completed"].includes(status)) {
    return { data: null, error: new Error("올바른 튜토리얼 진행 상태가 아닙니다.") };
  }

  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.TUTORIAL_SAVE, {
      p_tutorial_version: tutorialVersion,
      p_status: status
    });
    const data = result.data?.progress ?? result.data?.data ?? result.data ?? null;

    return {
      data: result.error ? null : data,
      error: result.error
    };
  }

  const { data, error } = await supabase
    .from(ADMIN_TUTORIAL_PROGRESS_TABLE)
    .upsert(
      {
        admin_id: adminId,
        tutorial_version: tutorialVersion,
        status,
        recorded_at: new Date().toISOString()
      },
      { onConflict: "admin_id,tutorial_version" }
    )
    .select("admin_id,tutorial_version,status,recorded_at")
    .single();

  return { data: data ?? null, error: error ?? null };
}
