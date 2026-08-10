import assert from "node:assert/strict";
import test from "node:test";
import { getDeletionErrorMessage } from "../src/utils/deletionContract.js";

test("삭제 오류는 부분 성공이 아니면 기존 오류 메시지를 유지한다", () => {
  const result = {
    error: new Error("제출 데이터 삭제에 실패했습니다."),
    partial: false
  };

  assert.equal(getDeletionErrorMessage(result), "제출 데이터 삭제에 실패했습니다.");
});

test("삭제 오류는 부분 성공이면 최신 상태 재조회 안내를 포함한다", () => {
  const result = {
    error: new Error("상품 삭제에 실패했습니다."),
    partial: true
  };

  assert.match(getDeletionErrorMessage(result), /상품 삭제에 실패했습니다\./);
  assert.match(getDeletionErrorMessage(result), /최신 상태를 다시 불러옵니다/);
});

test("삭제 오류가 없으면 fallback 메시지를 사용하지 않는다", () => {
  assert.equal(getDeletionErrorMessage({ error: null, partial: false }, "fallback"), "fallback");
});
