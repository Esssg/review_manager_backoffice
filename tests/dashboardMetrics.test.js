import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCompanyMembers,
  buildDashboardSummary,
  pickTopProductsByPurchase,
  pickTopProductsByReviewWaiting
} from "../src/utils/dashboardMetrics.js";

const now = new Date(2026, 7, 11, 12, 0, 0);

test("대시보드 summary의 오늘·어제·입금·사진 집계 결과를 유지한다", () => {
  const summary = buildDashboardSummary({
    now,
    products: [
      { id: 1, created_at: new Date(2026, 7, 11, 9, 0, 0) },
      { id: 2, created_at: new Date(2026, 7, 1, 9, 0, 0) }
    ],
    submissions: [
      { id: 10, product_id: 1, created_at: new Date(2026, 7, 11, 9, 0, 0), review_fee: 100, is_review_verified: false, is_deposit_verified: false },
      { id: 11, product_id: 1, created_at: new Date(2026, 7, 1, 9, 0, 0), review_fee: 200, is_review_verified: true, is_deposit_verified: false },
      { id: 12, product_id: 2, created_at: new Date(2026, 7, 11, 10, 0, 0), deposited_at: new Date(2026, 7, 11, 11, 0, 0), review_fee: 50, is_review_verified: true, is_deposit_verified: true },
      { id: 13, product_id: 2, created_at: new Date(2026, 7, 11, 11, 0, 0), review_fee: 75, is_review_verified: true, is_deposit_verified: false },
      { id: 14, product_id: 2, created_at: new Date(2026, 7, 10, 9, 0, 0), review_fee: 0, is_review_verified: false, is_deposit_verified: false }
    ],
    applications: [
      { id: 20, created_at: new Date(2026, 7, 11, 8, 0, 0), is_confirmed: true },
      { id: 21, created_at: new Date(2026, 7, 11, 8, 30, 0), is_confirmed: false }
    ],
    evidencePhotos: [
      { id: 30, submission_id: 10, photo_type: "purchase", created_at: new Date(2026, 7, 11, 8, 0, 0) },
      { id: 31, submission_id: 12, photo_type: "review", created_at: new Date(2026, 7, 11, 8, 30, 0) },
      { id: 32, submission_id: 11, photo_type: "purchase", created_at: new Date(2026, 7, 10, 8, 30, 0) }
    ]
  });

  assert.deepEqual(summary.today, {
    productsCreated: 1,
    productsCreatedThisMonth: 2,
    submissionsCreated: 3,
    submissionsCreatedYesterday: 1,
    submissionsCreatedDelta: 2,
    reviewVerifiedTotal: 3,
    depositVerifiedCount: 1,
    depositVerifiedAmountSum: 50,
    applicationsCreated: 2,
    applicationsConfirmed: 1,
    applicationsPending: 1,
    photosUploaded: 2,
    photosReviewUploaded: 1,
    photosPurchaseUploaded: 1
  });
  assert.deepEqual(summary.cumulative, {
    productCount: 2,
    submissionCount: 5,
    purchaseCount: 2,
    reviewCount: 2,
    completeCount: 1,
    unassignedCount: 5,
    missingReviewPhotoCount: 2,
    expectedDepositSum: 375,
    pendingDepositLongCount: 1,
    pendingDepositThresholdDays: 7
  });
});

test("회사 구성원 집계는 담당자별 index를 사용해 제출 상태를 분리한다", () => {
  const metrics = aggregateCompanyMembers({
    members: [
      { login_id: "manager-a", username: "A" },
      { login_id: "manager-b", username: "B" },
      { login_id: "manager-empty", username: "Empty" }
    ],
    products: [
      { id: 1, manager_id: "manager-a" },
      { id: 2, manager_id: "manager-a" },
      { id: 3, manager_id: "manager-b" }
    ],
    submissions: [
      { id: 10, product_id: 1, is_review_verified: false, is_deposit_verified: false },
      { id: 11, product_id: 2, is_review_verified: true, is_deposit_verified: true },
      { id: 12, product_id: 3, is_review_verified: true, is_deposit_verified: false },
      { id: 13, product_id: 999, is_review_verified: false, is_deposit_verified: false }
    ]
  });

  assert.deepEqual(metrics, [
    {
      loginId: "manager-a",
      username: "A",
      productCount: 2,
      activeSubmissionCount: 1,
      completeSubmissionCount: 1,
      submissionCount: 2
    },
    {
      loginId: "manager-b",
      username: "B",
      productCount: 1,
      activeSubmissionCount: 1,
      completeSubmissionCount: 0,
      submissionCount: 1
    },
    {
      loginId: "manager-empty",
      username: "Empty",
      productCount: 0,
      activeSubmissionCount: 0,
      completeSubmissionCount: 0,
      submissionCount: 0
    }
  ]);
});

test("top 상품 집계는 전달된 activity index를 재사용해도 같은 순서를 반환한다", () => {
  const products = [{ id: 1 }, { id: 2 }];
  const submissions = [
    { product_id: 1, is_review_verified: false, is_deposit_verified: false },
    { product_id: 2, is_review_verified: true, is_deposit_verified: false }
  ];

  const purchase = pickTopProductsByPurchase({ products, submissions, limit: 5 });
  const review = pickTopProductsByReviewWaiting({ products, submissions, limit: 5 });

  assert.deepEqual(purchase.map((item) => item.product.id), [1]);
  assert.deepEqual(review.map((item) => item.product.id), [2]);
});
