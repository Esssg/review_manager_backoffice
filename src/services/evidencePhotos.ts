// @ts-nocheck

import { supabase } from "@/lib/supabase";
import {
  ADMIN_GATEWAY_OPERATION,
  callAdminGatewayOperation
} from "@/services/adminGatewayData";
import { isAdminGatewayConfigured } from "@/services/adminGateway";

export async function deleteEvidencePhoto(photoId) {
  const normalizedPhotoId = Number(photoId);

  if (!Number.isFinite(normalizedPhotoId)) {
    return {
      data: null,
      error: new Error("삭제할 사진을 찾지 못했습니다.")
    };
  }

  if (isAdminGatewayConfigured()) {
    const result = await callAdminGatewayOperation(ADMIN_GATEWAY_OPERATION.EVIDENCE_PHOTO_DELETE, {
      p_photo_id: normalizedPhotoId
    });
    const data = result.data?.photo ?? result.data?.data ?? (result.data?.id ? result.data : null);

    return {
      data: result.error ? null : data,
      error: result.error
    };
  }

  return supabase
    .from("evidence_photos")
    .delete()
    .eq("id", normalizedPhotoId)
    .select("id,submission_id,image_url")
    .maybeSingle();
}
