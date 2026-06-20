import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllRows, fetchAllRowsInChunks } from "../src/services/paginatedQuery.js";

function createQueryBuilder(rows, serverRowLimit = 1000) {
  let cursorColumn = "id";
  let cursorValue = null;
  let requestedLimit = 1000;

  const builder = {
    order(columnName) {
      cursorColumn = columnName;
      return builder;
    },
    limit(value) {
      requestedLimit = value;
      return builder;
    },
    gt(columnName, value) {
      cursorColumn = columnName;
      cursorValue = value;
      return builder;
    },
    then(resolve, reject) {
      const pageRows = rows
        .filter((row) => cursorValue == null || row[cursorColumn] > cursorValue)
        .sort((left, right) => left[cursorColumn] - right[cursorColumn])
        .slice(0, Math.min(requestedLimit, serverRowLimit));

      return Promise.resolve({ data: pageRows, error: null }).then(resolve, reject);
    }
  };

  return builder;
}

test("서버 반환 제한이 요청 크기보다 작아도 마지막 행까지 조회한다", async () => {
  const sourceRows = Array.from({ length: 2505 }, (_, index) => ({ id: index + 1 }));
  const result = await fetchAllRows(() => createQueryBuilder(sourceRows, 137));

  assert.equal(result.error, null);
  assert.equal(result.data.length, sourceRows.length);
  assert.deepEqual(result.data.map((row) => row.id), sourceRows.map((row) => row.id));
});

test("큰 IN 조건을 분할해도 모든 행을 한 번씩 반환한다", async () => {
  const filterValues = Array.from({ length: 205 }, (_, index) => index + 1);
  const sourceRows = filterValues.flatMap((groupId) => [
    { id: groupId * 10, group_id: groupId },
    { id: groupId * 10 + 1, group_id: groupId }
  ]);
  const result = await fetchAllRowsInChunks(
    filterValues,
    (chunk) => createQueryBuilder(sourceRows.filter((row) => chunk.includes(row.group_id)), 31),
    { chunkSize: 25, concurrency: 3 }
  );

  assert.equal(result.error, null);
  assert.equal(result.data.length, sourceRows.length);
  assert.equal(new Set(result.data.map((row) => row.id)).size, sourceRows.length);
});

test("커서 컬럼이 select 결과에 없으면 조용히 누락시키지 않고 오류를 반환한다", async () => {
  const result = await fetchAllRows(() => createQueryBuilder([{ value: "row" }]));

  assert.equal(result.data, null);
  assert.equal(result.error?.code, "PAGINATION_ERROR");
});
