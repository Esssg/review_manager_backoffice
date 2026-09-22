import assert from "node:assert/strict";
import test from "node:test";
import {
  cycleSortState,
  normalizeSortState,
  updateSortState
} from "../src/utils/tableSort.ts";

const allowedKeys = ["company_name", "amount", "review_photos"];

test("정렬 상태는 허용 열·방향만 남기고 중복 열을 제거한다", () => {
  assert.deepEqual(
    normalizeSortState(
      [
        { key: "company_name", direction: "ASC" },
        { key: "company_name", direction: "desc" },
        { key: "unknown", direction: "asc" },
        { key: "amount", direction: "invalid" }
      ],
      allowedKeys
    ),
    [{ key: "company_name", direction: "asc" }]
  );
});

test("메뉴 정렬은 새 열을 뒤에 추가하고 같은 방향 재선택은 제거한다", () => {
  const first = updateSortState([], "company_name", "asc", allowedKeys);
  const second = updateSortState(first, "amount", "desc", allowedKeys);
  const third = updateSortState(second, "company_name", "asc", allowedKeys);

  assert.deepEqual(second, [
    { key: "company_name", direction: "asc" },
    { key: "amount", direction: "desc" }
  ]);
  assert.deepEqual(third, [{ key: "amount", direction: "desc" }]);
});

test("상품 헤더 클릭은 오름차순·내림차순·정렬없음을 순환한다", () => {
  const first = cycleSortState([], "amount", allowedKeys);
  const second = cycleSortState(first, "amount", allowedKeys);
  const third = cycleSortState(second, "amount", allowedKeys);

  assert.deepEqual(first, [{ key: "amount", direction: "asc" }]);
  assert.deepEqual(second, [{ key: "amount", direction: "desc" }]);
  assert.deepEqual(third, []);
});
