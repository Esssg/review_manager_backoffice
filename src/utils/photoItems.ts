// @ts-nocheck

export function getPhotoId(photo) {
  if (photo && typeof photo === "object") {
    return photo.id ?? null;
  }

  return null;
}

export function getPhotoUrl(photo) {
  if (typeof photo === "string") {
    return photo;
  }

  return photo?.image_url ?? "";
}

export function removePhotoById(photos, photoId) {
  return (photos ?? []).filter((photo) => String(getPhotoId(photo)) !== String(photoId));
}
