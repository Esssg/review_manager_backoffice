import assert from "node:assert/strict";
import test from "node:test";
import {
  parseInlinePurchaseInput,
  parsePurchaseAssignLines,
  parsePurchaseBulkInput
} from "../src/utils/reviewReceiveBulkInput.ts";

test("구매정보 일괄입력은 tab 형식의 구매계정·계좌·리뷰비를 순서대로 보존한다", () => {
  const [entry] = parsePurchaseBulkInput(
    "123\t구매자\t수취인\tbuyer-id\t010-1234-5678\t서울\t국민\t123 456\t홍길동\t10000\t2000"
  );

  assert.deepEqual(entry, {
    assign_name: "",
    order_number: "123",
    buyer_name: "구매자",
    recipient_name: "수취인",
    purchase_account: "buyer-id",
    contact: "01012345678",
    address: "서울",
    amount: 10000,
    review_fee: 2000,
    bank_name: "국민",
    bank_account: "123456",
    account_holder: "홍길동"
  });
});

test("빈 줄은 제거하지만 두 줄째 오류에는 입력 line number를 붙인다", () => {
  assert.throws(
    () => parsePurchaseBulkInput("\n123 / 구매자 / 수취인 / 짧음 / 서울 / 국민 123456 홍길동 / 10000"),
    /1번째 입력: 연락처 형식이 올바르지 않습니다\./
  );
  assert.throws(
    () => parsePurchaseBulkInput("123 / 구매자 / 수취인 / 01012345678 / 서울 / 국민 123456 홍길동 / 10000\n124 / 구매자 / 수취인 / 짧음 / 서울 / 국민 123456 홍길동 / 10000"),
    /2번째 입력: 연락처 형식이 올바르지 않습니다\./
  );
});

test("구매정보 빠른입력은 한 줄만 허용하고 배정명 입력은 명시 순번을 해석한다", () => {
  assert.throws(
    () => parseInlinePurchaseInput("123 / 구매자 / 수취인 / 01012345678 / 서울 / 국민 123456 홍길동 / 10000\n124 / 구매자 / 수취인 / 01012345679 / 서울 / 국민 123456 홍길동 / 10000"),
    /한 줄만 입력할 수 있습니다/
  );

  assert.deepEqual(parsePurchaseAssignLines("1 배정A\n배정B"), [
    { row_number: 1, assign_name: "배정A", has_explicit_row_number: true },
    { row_number: null, assign_name: "배정B", has_explicit_row_number: false }
  ]);
});
