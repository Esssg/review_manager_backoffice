import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyReviewReceiveRowFilters,
  filterReviewReceiveRowsByColumnFilters,
  getVisibleReviewReceiveRowFilterColumns,
  normalizeReviewReceiveFilterText
} from "../src/utils/reviewReceiveDetailTable.ts";

test("리뷰받기 열 필터 정규화는 전각 문자와 구분 기호를 같은 검색어로 취급한다", () => {
  assert.equal(normalizeReviewReceiveFilterText(" ＡＢＣ / 12-3 "), "abc123");
  assert.equal(normalizeReviewReceiveFilterText("국민_123.456"), "국민123456");
});

test("구매 section은 입금일·실제 입금자 열을 숨기고 date filter 초기값을 만든다", () => {
  const allColumns = getVisibleReviewReceiveRowFilterColumns(false);
  const purchaseColumns = getVisibleReviewReceiveRowFilterColumns(true);
  const filters = createEmptyReviewReceiveRowFilters();

  assert.equal(allColumns.length, 17);
  assert.equal(purchaseColumns.length, 15);
  assert.equal(filters.deposited_at.start, "");
  assert.equal(filters.deposited_at.end, "");
  assert.equal(filters.actual_depositor_name, "");
});

test("boolean·account·date 조건은 같은 row에 모두 적용되고 날짜 끝값은 inclusive다", () => {
  const rows = [
    {
      id: "matched",
      bank_name: "국민",
      bank_account: "123-456",
      account_holder: "홍길동",
      photos: [{ id: 1 }],
      is_review_verified: true,
      deposited_at: "2026-08-10"
    },
    {
      id: "outside-date",
      bank_name: "국민",
      bank_account: "123-456",
      account_holder: "홍길동",
      photos: [{ id: 2 }],
      is_review_verified: true,
      deposited_at: "2026-08-11"
    },
    {
      id: "not-verified",
      bank_name: "국민",
      bank_account: "123-456",
      account_holder: "홍길동",
      photos: [{ id: 3 }],
      is_review_verified: false,
      deposited_at: "2026-08-10"
    }
  ];
  const filters = createEmptyReviewReceiveRowFilters();
  filters.account = "국민 123456";
  filters.is_review_verified = "true";
  filters.photos = "uploaded";
  filters.deposited_at = { start: "2026-08-10", end: "2026-08-10" };

  const result = filterReviewReceiveRowsByColumnFilters(rows, filters, {
    rowNumberMap: {},
    plannedDepositorName: "",
    getPlannedDepositorName: () => ""
  });

  assert.deepEqual(result.map((row) => row.id), ["matched"]);
});
