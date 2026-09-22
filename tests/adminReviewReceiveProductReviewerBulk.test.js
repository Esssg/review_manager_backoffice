import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductReviewerBulkPayload
} from "../src/services/adminReviewReceiveProductReviewerBulk.ts";
import {
  MAX_PRODUCT_REVIEWER_BULK_ROWS,
  PRODUCT_REVIEWER_BULK_CHUNK_SIZE
} from "../src/utils/reviewReceiveProductReviewerBulkInput.ts";

function createGroup(index, reviewerCount = 1) {
  return {
    productPayload: {
      manager_id: "should-not-cross-the-client-boundary",
      bundle_id: 100 + index,
      title: `상품 ${index + 1}`,
      product_name: `품명 ${index + 1}`,
      product_date: "2026-09-02",
      deposit_GB: 1
    },
    reviewerPayloads: Array.from({ length: reviewerCount }, (_, reviewerIndex) => ({
      product_id: 1000 + index,
      assign_name: "배정",
      order_number: `${index + 1}-${reviewerIndex + 1}`,
      buyer_name: "구매자",
      recipient_name: "수취인",
      amount: 10000
    }))
  };
}

test("상품/리뷰어 bulk payload는 manager·bundle·product identity를 서버 계약에서 제거한다", () => {
  const payload = buildProductReviewerBulkPayload({
    productGroups: [createGroup(0)],
    reusableProductId: 42
  });

  assert.deepEqual(payload, {
    groups: [{
      product: {
        title: "상품 1",
        product_name: "품명 1",
        product_date: "2026-09-02",
        deposit_GB: 1
      },
      submissions: [{
        assign_name: "배정",
        order_number: "1-1",
        buyer_name: "구매자",
        recipient_name: "수취인",
        amount: 10000
      }]
    }],
    reusable_product_id: 42
  });
});

test("bulk payload는 최대 500행을 허용하고 501행은 거부한다", () => {
  const withinLimit = buildProductReviewerBulkPayload({
    productGroups: [createGroup(0, MAX_PRODUCT_REVIEWER_BULK_ROWS)]
  });

  assert.equal(withinLimit.groups[0].submissions.length, MAX_PRODUCT_REVIEWER_BULK_ROWS);
  assert.equal(PRODUCT_REVIEWER_BULK_CHUNK_SIZE, 50);
  assert.throws(
    () => buildProductReviewerBulkPayload({
      productGroups: [createGroup(0, MAX_PRODUCT_REVIEWER_BULK_ROWS + 1)]
    }),
    /최대 500행까지 지원/
  );
});

test("각 품목에 리뷰어가 없으면 bulk 저장 계약을 만들지 않는다", () => {
  assert.throws(
    () => buildProductReviewerBulkPayload({ productGroups: [createGroup(0, 0)] }),
    /1번째 품목에 등록할 리뷰어 행이 없습니다/
  );
});
