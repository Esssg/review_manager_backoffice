// @ts-nocheck

export const SORT_DIRECTION = Object.freeze({
  ASC: "asc",
  DESC: "desc"
});

export const SORT_DIRECTIONS = new Set([SORT_DIRECTION.ASC, SORT_DIRECTION.DESC]);

export function normalizeSortState(sortState, allowedKeys = []) {
  const allowedKeySet = new Set(allowedKeys ?? []);
  const source = Array.isArray(sortState) ? sortState : [];
  const seenKeys = new Set();

  return source.reduce((normalized, entry) => {
    const key = String(entry?.key ?? "").trim();
    const direction = String(entry?.direction ?? "").trim().toLowerCase();

    if (!key || !allowedKeySet.has(key) || !SORT_DIRECTIONS.has(direction) || seenKeys.has(key)) {
      return normalized;
    }

    seenKeys.add(key);
    normalized.push({ key, direction });
    return normalized;
  }, []);
}

export function getSortEntry(sortState, key) {
  return (Array.isArray(sortState) ? sortState : []).find((entry) => entry?.key === key) ?? null;
}

export function getSortPriority(sortState, key) {
  const index = (Array.isArray(sortState) ? sortState : []).findIndex((entry) => entry?.key === key);
  return index === -1 ? null : index + 1;
}

/**
 * 메뉴형 정렬 동작: 같은 방향을 다시 선택하면 해당 열 정렬을 제거하고,
 * 다른 방향이면 우선순위 위치를 유지한 채 방향만 바꾼다.
 */
export function updateSortState(sortState, key, direction, allowedKeys = []) {
  const normalized = normalizeSortState(sortState, allowedKeys);
  const nextDirection = String(direction ?? "").trim().toLowerCase();
  const currentIndex = normalized.findIndex((entry) => entry.key === key);

  if (!SORT_DIRECTIONS.has(nextDirection) || !new Set(allowedKeys ?? []).has(key)) {
    return normalized;
  }

  if (currentIndex === -1) {
    return [...normalized, { key, direction: nextDirection }];
  }

  if (normalized[currentIndex].direction === nextDirection) {
    return normalized.filter((entry) => entry.key !== key);
  }

  return normalized.map((entry, index) =>
    index === currentIndex ? { ...entry, direction: nextDirection } : entry
  );
}

/**
 * 헤더 클릭 동작: 미선택 → 오름차순 → 내림차순 → 정렬 제거.
 * 새 열은 기존 정렬의 뒤에 추가되어 다중 정렬 우선순위를 보존한다.
 */
export function cycleSortState(sortState, key, allowedKeys = []) {
  const currentEntry = getSortEntry(sortState, key);

  if (!currentEntry) {
    return updateSortState(sortState, key, SORT_DIRECTION.ASC, allowedKeys);
  }

  if (currentEntry.direction === SORT_DIRECTION.ASC) {
    return updateSortState(sortState, key, SORT_DIRECTION.DESC, allowedKeys);
  }

  return normalizeSortState(sortState, allowedKeys).filter((entry) => entry.key !== key);
}

export function serializeSortState(sortState, allowedKeys = []) {
  return normalizeSortState(sortState, allowedKeys);
}
