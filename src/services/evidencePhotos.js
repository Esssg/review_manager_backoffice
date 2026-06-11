import { supabase } from "../lib/supabase";

export async function deleteEvidencePhoto(photoId) {
  const normalizedPhotoId = Number(photoId);

  if (!Number.isFinite(normalizedPhotoId)) {
    return {
      data: null,
      error: new Error("삭제할 사진을 찾지 못했습니다.")
    };
  }

  return supabase
    .from("evidence_photos")
    .delete()
    .eq("id", normalizedPhotoId)
    .select("id,submission_id,image_url")
    .maybeSingle();
}
