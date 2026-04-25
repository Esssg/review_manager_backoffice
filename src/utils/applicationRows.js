export function sortApplicationsByConfirmedAndCreatedAt(items) {
  return [...items].sort((a, b) => {
    const confirmedDiff = Number(Boolean(b.is_confirmed)) - Number(Boolean(a.is_confirmed));
    if (confirmedDiff !== 0) return confirmedDiff;

    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime - bTime;
  });
}
