export const SUPABASE_PAGE_SIZE = 1000;
export const SUPABASE_FILTER_CHUNK_SIZE = 100;

function buildPaginationError(message) {
  const error = new Error(message);
  error.code = "PAGINATION_ERROR";
  return error;
}

export function chunkValues(values, chunkSize = SUPABASE_FILTER_CHUNK_SIZE) {
  const normalizedValues = Array.from(new Set(values ?? []));
  const chunks = [];

  for (let index = 0; index < normalizedValues.length; index += chunkSize) {
    chunks.push(normalizedValues.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function fetchAllRows(buildQuery, options = {}) {
  const {
    cursorColumn = "id",
    pageSize = SUPABASE_PAGE_SIZE
  } = options;
  const rows = [];
  let cursorValue = null;

  while (true) {
    let query = buildQuery()
      .order(cursorColumn, { ascending: true })
      .limit(pageSize);

    if (cursorValue != null) {
      query = query.gt(cursorColumn, cursorValue);
    }

    const result = await query;

    if (result.error) {
      return {
        data: null,
        error: result.error
      };
    }

    const pageRows = result.data ?? [];

    if (pageRows.length === 0) {
      return {
        data: rows,
        error: null
      };
    }

    const nextCursorValue = pageRows.at(-1)?.[cursorColumn];

    if (nextCursorValue == null) {
      return {
        data: null,
        error: buildPaginationError(`전체 조회를 계속하려면 ${cursorColumn} 컬럼이 select 결과에 포함되어야 합니다.`)
      };
    }

    if (cursorValue != null && nextCursorValue === cursorValue) {
      return {
        data: null,
        error: buildPaginationError(`${cursorColumn} 커서가 진행되지 않아 전체 조회를 중단했습니다.`)
      };
    }

    rows.push(...pageRows);
    cursorValue = nextCursorValue;
  }
}

export async function fetchAllRowsInChunks(values, buildQueryForChunk, options = {}) {
  const chunks = chunkValues(values, options.chunkSize);
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const rows = [];

  for (let index = 0; index < chunks.length; index += concurrency) {
    const batch = chunks.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map((chunk) => fetchAllRows(() => buildQueryForChunk(chunk), options))
    );
    const failedResult = results.find((result) => result.error);

    if (failedResult) {
      return failedResult;
    }

    results.forEach((result) => rows.push(...(result.data ?? [])));
  }

  return {
    data: rows,
    error: null
  };
}

export function compareByCreatedAtThenId(left, right, ascending = true, idAscending = ascending) {
  const direction = ascending ? 1 : -1;
  const leftTime = left?.created_at ? new Date(left.created_at).getTime() : Number.MAX_SAFE_INTEGER;
  const rightTime = right?.created_at ? new Date(right.created_at).getTime() : Number.MAX_SAFE_INTEGER;

  if (leftTime !== rightTime) {
    return (leftTime - rightTime) * direction;
  }

  return (Number(left?.id) - Number(right?.id)) * (idAscending ? 1 : -1);
}
