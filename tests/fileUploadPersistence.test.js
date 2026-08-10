import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFileUploadFailureResult,
  buildSubmissionLookup,
  createFileUploadResult,
  finalizeFileUploadResult,
  getSubmissionLookupResult
} from "../src/utils/fileUploadPersistence.js";

test("업로드 결과는 성공·부분 성공·오류에 같은 summary 계약을 사용한다", () => {
  const result = createFileUploadResult();
  result.createdProducts.push({ data: { id: 1 } });
  result.insertedSubmissions.push({ data: { id: 2 } });
  result.errors.push({ code: "SUBMISSION_SAVE_FAILED" });

  assert.deepEqual(finalizeFileUploadResult(result).summary, {
    createdProductCount: 1,
    insertedSubmissionCount: 1,
    updatedSubmissionCount: 0,
    errorCount: 1
  });

  assert.deepEqual(buildFileUploadFailureResult(new Error("조회 실패")).summary, {
    createdProductCount: 0,
    insertedSubmissionCount: 0,
    updatedSubmissionCount: 0,
    errorCount: 1
  });
});

test("주문번호 lookup은 기존 한 건·미존재·DB 중복을 구분한다", () => {
  const lookup = buildSubmissionLookup([
    { id: 10, order_number: "ORDER-1" },
    { id: 11, order_number: "ORDER-DUP" },
    { id: 12, order_number: "ORDER-DUP" }
  ]);

  assert.deepEqual(getSubmissionLookupResult(lookup, "ORDER-1"), {
    data: { id: 10, order_number: "ORDER-1" },
    error: null
  });
  assert.deepEqual(getSubmissionLookupResult(lookup, "ORDER-NEW"), { data: null, error: null });
  assert.equal(getSubmissionLookupResult(lookup, "ORDER-DUP").data, null);
  assert.equal(getSubmissionLookupResult(lookup, "ORDER-DUP").error.code, "DUPLICATE_ORDER_NUMBER_IN_DB");
});
