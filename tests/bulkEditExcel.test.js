import test from "node:test";
import assert from "node:assert/strict";
import {
  BULK_EDIT_EXCEL_GUIDE_ROWS,
  buildBulkEditChangeSet,
  buildBulkEditExcelRows,
  hasBulkEditDepositChanges
} from "../src/utils/bulkEditExcel.ts";

const baseValues = {
  assign_name: "기존 배정",
  order_number: "ORDER-1",
  buyer_name: "구매자",
  recipient_name: "수취인",
  purchase_account: "buyer-id",
  contact: "01012345678",
  address: "서울",
  bank_name: "국민은행",
  bank_account: "1234",
  account_holder: "예금주",
  amount: 10000,
  review_fee: 3000,
  is_review_verified: false,
  is_deposit_verified: false,
  deposited_at: null,
  actual_depositor_name: null
};

test("일괄수정 차이 계산은 변경된 필드만 적용 payload에 담는다", () => {
  const result = buildBulkEditChangeSet(
    [{ rowNumber: 2, submissionId: 12, values: { ...baseValues, buyer_name: "수정 구매자", amount: 12000 } }],
    [{ submission_id: 12, product_id: 7, ...baseValues }]
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.changes.length, 1);
  assert.deepEqual(result.changes[0].payload, { buyer_name: "수정 구매자", amount: 12000 });
  assert.equal(result.changes[0].fields.length, 2);
});

test("같은 회사에서 조회되지 않은 제출 ID는 변경 대상에서 제외하고 오류를 반환한다", () => {
  const result = buildBulkEditChangeSet(
    [{ rowNumber: 2, submissionId: 999, values: baseValues }],
    []
  );

  assert.equal(result.changes.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /같은 회사/);
});

test("입금완료 관련 열 변경 여부를 구분한다", () => {
  const changes = [{ fields: [{ key: "is_deposit_verified" }] }];
  assert.equal(hasBulkEditDepositChanges(changes), true);
  assert.equal(hasBulkEditDepositChanges([{ fields: [{ key: "buyer_name" }] }]), false);
});

test("수정용 Excel의 완료 상태는 다시 업로드 가능한 TRUE/FALSE로 내보낸다", () => {
  const [row] = buildBulkEditExcelRows([
    { submission_id: 12, ...baseValues, is_review_verified: true, is_deposit_verified: false }
  ]);

  assert.equal(row.리뷰완료, "TRUE");
  assert.equal(row.입금완료, "FALSE");
});

test("수정용 Excel에는 제출 ID와 필터 적용 주의 안내를 포함한다", () => {
  assert.equal(BULK_EDIT_EXCEL_GUIDE_ROWS[0][0], "1. 제출 ID 열 절대 수정 금지");
  assert.match(BULK_EDIT_EXCEL_GUIDE_ROWS[1][0], /숨겨진 행도 모두 적용됨/);
});
