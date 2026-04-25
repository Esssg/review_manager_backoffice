export function compareReviewReceiveRowsByCreatedAt(left, right) {
  const leftTime = left.created_at ? new Date(left.created_at).getTime() : Number.MAX_SAFE_INTEGER;
  const rightTime = right.created_at ? new Date(right.created_at).getTime() : Number.MAX_SAFE_INTEGER;

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return String(left.id).localeCompare(String(right.id));
}

export function sortReviewReceiveRowsByCreatedAt(items) {
  return items.slice().sort(compareReviewReceiveRowsByCreatedAt);
}

export function mergeReviewReceiveRows(items, replacements, createdRows = []) {
  const replacementMap = replacements instanceof Map ? replacements : new Map((replacements ?? []).map((row) => [row.id, row]));

  return sortReviewReceiveRowsByCreatedAt([
    ...items.map((item) => replacementMap.get(item.id) ?? item),
    ...createdRows
  ]);
}

export function replaceReviewReceiveRows(items, replacements) {
  const replacementMap = replacements instanceof Map ? replacements : new Map((replacements ?? []).map((row) => [row.id, row]));

  return items.map((item) => replacementMap.get(item.id) ?? item);
}

export function buildReviewReceiveRowPositionMaps(items) {
  const sortedRows = sortReviewReceiveRowsByCreatedAt(items);
  const rowNumberMap = sortedRows.reduce((acc, row, index) => {
    acc[row.id] = index + 1;
    return acc;
  }, {});
  const rowByNumberMap = sortedRows.reduce((acc, row, index) => {
    acc[index + 1] = row;
    return acc;
  }, {});

  return {
    sortedRows,
    rowNumberMap,
    rowByNumberMap,
    maxRowNumber: sortedRows.length
  };
}

export function splitReviewReceiveRows(items) {
  return items.reduce(
    (acc, row) => {
      if (row.is_review_verified) {
        if (row.is_deposit_verified) {
          acc.completeRows.push(row);
        } else {
          acc.reviewRows.push(row);
        }
      } else {
        acc.purchaseRows.push(row);
      }

      return acc;
    },
    {
      purchaseRows: [],
      reviewRows: [],
      completeRows: []
    }
  );
}
