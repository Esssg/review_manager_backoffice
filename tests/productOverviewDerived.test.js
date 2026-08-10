import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductOverviewSelectionQueryKey,
  buildSelectedProductOverviewSubmissionIds
} from "../src/utils/productOverviewSelection.js";
import { buildPurchaseBulkPreview } from "../src/utils/reviewReceiveBulkInput.js";

test("상품전체보기 선택 query key는 화면·상태·필터·회사 범위를 함께 구분한다", () => {
  const base = buildProductOverviewSelectionQueryKey({
    viewMode: "status",
    status: "purchase",
    filters: { order_number: "A-1" },
    includeCompanyData: false
  });
  const changedStatus = buildProductOverviewSelectionQueryKey({
    viewMode: "status",
    status: "review",
    filters: { order_number: "A-1" },
    includeCompanyData: false
  });
  const changedScope = buildProductOverviewSelectionQueryKey({
    viewMode: "status",
    status: "purchase",
    filters: { order_number: "A-1" },
    includeCompanyData: true
  });

  assert.notEqual(base, changedStatus);
  assert.notEqual(base, changedScope);
  assert.equal(
    base,
    buildProductOverviewSelectionQueryKey({
      viewMode: "status",
      status: "purchase",
      filters: { order_number: "A-1" },
      includeCompanyData: false
    })
  );
});

test("전체 선택은 현재 로드된 행에서 제외 ID만 제거한다", () => {
  const selectedIds = buildSelectedProductOverviewSubmissionIds(
    [{ submission_id: 11 }, { submission_id: 12 }, { submission_id: 13 }],
    { mode: "all_matching", excludedIds: [12], ids: [] }
  );

  assert.deepEqual([...selectedIds], [11, 13]);
});

test("ID 선택은 전체 선택과 섞이지 않고 지정된 ID만 유지한다", () => {
  const selectedIds = buildSelectedProductOverviewSubmissionIds(
    [{ submission_id: 11 }, { submission_id: 12 }],
    { mode: "ids", ids: [12], excludedIds: [] }
  );

  assert.deepEqual([...selectedIds], [12]);
});

test("구매정보 bulk preview는 빈 행 매칭과 입력 순서를 유지한다", () => {
  const result = buildPurchaseBulkPreview(
    "배정A",
    "123 / 홍길동 / 홍길동 / 010-1234-5678 / 서울 / 국민 123456 홍길동 / 10000",
    [
      {
        submission_id: 21,
        assign_name: "배정A",
        order_number: null,
        buyer_name: null,
        recipient_name: null,
        purchase_account: null,
        contact: null,
        address: null,
        bank_name: null,
        bank_account: null,
        account_holder: null,
        amount: null,
        isNew: false
      },
      {
        submission_id: 22,
        assign_name: "배정A",
        order_number: "기존 주문",
        buyer_name: "기존 구매자",
        recipient_name: "기존 수취인",
        purchase_account: null,
        contact: "01011112222",
        address: "기존 주소",
        bank_name: "국민",
        bank_account: "111111",
        account_holder: "기존",
        amount: 1000,
        isNew: false
      }
    ],
    { allowCreateNewRows: false }
  );

  assert.equal(result.status, "ready");
  assert.equal(result.create_new_rows, false);
  assert.equal(result.parsedEntries.length, 1);
  assert.equal(result.targetRows[0].submission_id, 21);
});
