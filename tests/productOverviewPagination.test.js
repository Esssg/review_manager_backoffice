import test from "node:test";
import assert from "node:assert/strict";
import { sliceProductOverviewPage } from "../src/utils/productOverviewPagination.js";

test("상품전체보기 페이지 크기와 반환 행 수가 같아도 total_count가 크면 다음 페이지가 있다", () => {
  const rows = Array.from({ length: 300 }, (_, index) => ({
    submission_id: index + 1,
    total_count: 1879
  }));

  const result = sliceProductOverviewPage(rows, 300);

  assert.equal(result.pageRows.length, 300);
  assert.equal(result.remainingCount, 1879);
  assert.equal(result.hasMore, true);
});

test("상품전체보기 남은 전체 수가 페이지 행 수와 같으면 다음 페이지가 없다", () => {
  const rows = Array.from({ length: 279 }, (_, index) => ({
    submission_id: index + 1,
    total_count: 279
  }));

  const result = sliceProductOverviewPage(rows, 300);

  assert.equal(result.pageRows.length, 279);
  assert.equal(result.remainingCount, 279);
  assert.equal(result.hasMore, false);
});
