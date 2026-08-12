// @ts-nocheck

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getStartOfDay(value) {
  const date = toDate(value) ?? new Date();
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return startOfDay;
}

export function getDayKey(value) {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  const yearText = String(date.getFullYear());
  const monthText = String(date.getMonth() + 1).padStart(2, "0");
  const dayText = String(date.getDate()).padStart(2, "0");
  return `${yearText}-${monthText}-${dayText}`;
}

export function isSameDay(left, right) {
  const leftDate = toDate(left);
  const rightDate = toDate(right);

  if (!leftDate || !rightDate) {
    return false;
  }

  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

export function isOnOrAfterStartOfDay(value, dayBoundary) {
  const date = toDate(value);

  if (!date) {
    return false;
  }

  const boundaryDate = toDate(dayBoundary);

  if (!boundaryDate) {
    return false;
  }

  return date.getTime() >= boundaryDate.getTime();
}

export function getStartOfMonth(value) {
  const date = toDate(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function diffInDays(later, earlier) {
  const laterDate = toDate(later);
  const earlierDate = toDate(earlier);

  if (!laterDate || !earlierDate) {
    return null;
  }

  return Math.floor((laterDate.getTime() - earlierDate.getTime()) / MS_PER_DAY);
}

export const SUBMISSION_STATUS = {
  PURCHASE: "purchase",
  REVIEW: "review",
  COMPLETE: "complete"
};

export function classifySubmissionStatus(submission) {
  if (!submission) {
    return SUBMISSION_STATUS.PURCHASE;
  }

  if (submission.is_review_verified) {
    return submission.is_deposit_verified ? SUBMISSION_STATUS.COMPLETE : SUBMISSION_STATUS.REVIEW;
  }

  return SUBMISSION_STATUS.PURCHASE;
}

export function isUnassignedSubmission(submission) {
  if (!submission) {
    return false;
  }

  const assignName = String(submission.assign_name ?? "").trim();
  return assignName.length === 0;
}

function safeNumber(value) {
  if (value == null) {
    return 0;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function buildEvidencePhotoIndex(evidencePhotos = []) {
  return evidencePhotos.reduce(
    (acc, photo) => {
      if (!photo || photo.submission_id == null) {
        return acc;
      }

      const submissionId = photo.submission_id;

      if (!acc.bySubmission.has(submissionId)) {
        acc.bySubmission.set(submissionId, { review: 0, purchase: 0, total: 0 });
      }

      const entry = acc.bySubmission.get(submissionId);
      entry.total += 1;

      if (photo.photo_type === "review") {
        entry.review += 1;
      } else if (photo.photo_type === "purchase") {
        entry.purchase += 1;
      }

      return acc;
    },
    { bySubmission: new Map() }
  );
}

export function countSubmissionsMissingReviewPhoto(submissions = [], evidencePhotoIndex) {
  if (!evidencePhotoIndex) {
    return 0;
  }

  return submissions.reduce((acc, submission) => {
    if (!submission) {
      return acc;
    }

    if (submission.is_review_verified) {
      return acc;
    }

    const entry = evidencePhotoIndex.bySubmission.get(submission.id);
    const reviewCount = entry?.review ?? 0;

    if (reviewCount === 0) {
      return acc + 1;
    }

    return acc;
  }, 0);
}

export function buildDashboardSummary({
  products = [],
  submissions = [],
  applications = [],
  evidencePhotos = [],
  pendingDepositThresholdDays = 7,
  now = new Date()
}) {
  const startOfToday = getStartOfDay(now);
  const startOfMonth = getStartOfMonth(now);
  const todayKey = getDayKey(startOfToday);
  const startOfYesterday = getStartOfDay(new Date(startOfToday.getTime() - MS_PER_DAY));

  const evidencePhotoIndex = buildEvidencePhotoIndex(evidencePhotos);

  let productsToday = 0;
  let productsThisMonth = 0;

  products.forEach((product) => {
    if (isOnOrAfterStartOfDay(product.created_at, startOfToday)) {
      productsToday += 1;
    }

    if (isOnOrAfterStartOfDay(product.created_at, startOfMonth)) {
      productsThisMonth += 1;
    }
  });

  let submissionsToday = 0;
  let submissionsYesterday = 0;
  let reviewVerifiedTotal = 0;
  let depositVerifiedTodayCount = 0;
  let depositVerifiedTodayAmountSum = 0;
  let purchaseCount = 0;
  let reviewCount = 0;
  let completeCount = 0;
  let unassignedCount = 0;
  let pendingDepositLongCount = 0;
  let missingReviewPhotoCount = 0;
  let expectedDepositSum = 0;

  submissions.forEach((submission) => {
    if (!submission) {
      return;
    }

    if (isOnOrAfterStartOfDay(submission.created_at, startOfToday)) {
      submissionsToday += 1;
    }

    const createdDate = toDate(submission.created_at);

    if (
      createdDate &&
      createdDate.getTime() >= startOfYesterday.getTime() &&
      createdDate.getTime() < startOfToday.getTime()
    ) {
      submissionsYesterday += 1;
    }

    if (submission.is_review_verified) {
      reviewVerifiedTotal += 1;
    }

    if (submission.is_deposit_verified && getDayKey(submission.deposited_at) === todayKey) {
      depositVerifiedTodayCount += 1;
      depositVerifiedTodayAmountSum += safeNumber(submission.review_fee);
    }

    const status = classifySubmissionStatus(submission);

    if (status === SUBMISSION_STATUS.PURCHASE) {
      purchaseCount += 1;
    } else if (status === SUBMISSION_STATUS.REVIEW) {
      reviewCount += 1;
    } else {
      completeCount += 1;
    }

    if (isUnassignedSubmission(submission)) {
      unassignedCount += 1;
    }

    if (status === SUBMISSION_STATUS.REVIEW) {
      const days = diffInDays(now, submission.created_at);

      if (days != null && days >= pendingDepositThresholdDays) {
        pendingDepositLongCount += 1;
      }
    }

    const reviewPhotoCount = evidencePhotoIndex.bySubmission.get(submission.id)?.review ?? 0;

    if (!submission.is_review_verified && reviewPhotoCount === 0) {
      missingReviewPhotoCount += 1;
    }

    if (status !== SUBMISSION_STATUS.COMPLETE) {
      expectedDepositSum += safeNumber(submission.review_fee);
    }
  });

  let applicationsTodayCount = 0;
  let applicationsTodayConfirmedCount = 0;

  applications.forEach((application) => {
    if (!isOnOrAfterStartOfDay(application.created_at, startOfToday)) {
      return;
    }

    applicationsTodayCount += 1;

    if (application.is_confirmed) {
      applicationsTodayConfirmedCount += 1;
    }
  });

  const applicationsTodayPendingCount = applicationsTodayCount - applicationsTodayConfirmedCount;
  let photosTodayCount = 0;
  let photosTodayReviewCount = 0;
  let photosTodayPurchaseCount = 0;

  evidencePhotos.forEach((photo) => {
    if (!isOnOrAfterStartOfDay(photo.created_at, startOfToday)) {
      return;
    }

    photosTodayCount += 1;

    if (photo.photo_type === "review") {
      photosTodayReviewCount += 1;
    } else if (photo.photo_type === "purchase") {
      photosTodayPurchaseCount += 1;
    }
  });

  return {
    today: {
      productsCreated: productsToday,
      productsCreatedThisMonth: productsThisMonth,
      submissionsCreated: submissionsToday,
      submissionsCreatedYesterday: submissionsYesterday,
      submissionsCreatedDelta: submissionsToday - submissionsYesterday,
      reviewVerifiedTotal,
      depositVerifiedCount: depositVerifiedTodayCount,
      depositVerifiedAmountSum: depositVerifiedTodayAmountSum,
      applicationsCreated: applicationsTodayCount,
      applicationsConfirmed: applicationsTodayConfirmedCount,
      applicationsPending: applicationsTodayPendingCount,
      photosUploaded: photosTodayCount,
      photosReviewUploaded: photosTodayReviewCount,
      photosPurchaseUploaded: photosTodayPurchaseCount
    },
    cumulative: {
      productCount: products.length,
      submissionCount: submissions.length,
      purchaseCount,
      reviewCount,
      completeCount,
      unassignedCount,
      missingReviewPhotoCount,
      expectedDepositSum,
      pendingDepositLongCount,
      pendingDepositThresholdDays
    },
    evidencePhotoIndex
  };
}

export function buildDailyTrend({
  products = [],
  submissions = [],
  evidencePhotos: _evidencePhotos = [],
  days = 14,
  now = new Date()
}) {
  const totalDays = Math.max(1, Math.floor(days));
  const startOfToday = getStartOfDay(now);
  const buckets = [];

  for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
    const bucketDate = new Date(startOfToday.getTime() - offset * MS_PER_DAY);
    const key = getDayKey(bucketDate);
    buckets.push({
      key,
      label: key,
      productsCreated: 0,
      submissionsCreated: 0,
      depositVerified: 0
    });
  }

  const indexByKey = new Map(buckets.map((bucket, index) => [bucket.key, index]));

  products.forEach((product) => {
    const key = getDayKey(product.created_at);
    const index = indexByKey.get(key);

    if (index != null) {
      buckets[index].productsCreated += 1;
    }
  });

  submissions.forEach((submission) => {
    const createdKey = getDayKey(submission.created_at);
    const createdIndex = indexByKey.get(createdKey);

    if (createdIndex != null) {
      buckets[createdIndex].submissionsCreated += 1;
    }

    if (submission.is_deposit_verified) {
      const depositedKey = getDayKey(submission.deposited_at);
      const depositedIndex = indexByKey.get(depositedKey);

      if (depositedIndex != null) {
        buckets[depositedIndex].depositVerified += 1;
      }
    }
  });

  return buckets;
}

export function buildProductActivityIndex(submissions = []) {
  const index = new Map();

  submissions.forEach((submission) => {
    if (!submission || submission.product_id == null) {
      return;
    }

    if (!index.has(submission.product_id)) {
      index.set(submission.product_id, {
        purchaseCount: 0,
        reviewCount: 0,
        completeCount: 0,
        totalCount: 0
      });
    }

    const entry = index.get(submission.product_id);
    const status = classifySubmissionStatus(submission);

    entry.totalCount += 1;

    if (status === SUBMISSION_STATUS.PURCHASE) {
      entry.purchaseCount += 1;
    } else if (status === SUBMISSION_STATUS.REVIEW) {
      entry.reviewCount += 1;
    } else {
      entry.completeCount += 1;
    }
  });

  return index;
}

export function pickTopProductsByPurchase({
  products = [],
  submissions = [],
  limit = 5,
  activityIndex: providedActivityIndex = null
} = {}) {
  const activityIndex = providedActivityIndex ?? buildProductActivityIndex(submissions);

  return products
    .map((product) => {
      const activity = activityIndex.get(product.id) ?? {
        purchaseCount: 0,
        reviewCount: 0,
        completeCount: 0,
        totalCount: 0
      };
      return { product, activity };
    })
    .filter((item) => item.activity.purchaseCount > 0)
    .sort((left, right) => {
      if (right.activity.purchaseCount !== left.activity.purchaseCount) {
        return right.activity.purchaseCount - left.activity.purchaseCount;
      }
      return right.activity.totalCount - left.activity.totalCount;
    })
    .slice(0, limit);
}

export function pickTopProductsByReviewWaiting({
  products = [],
  submissions = [],
  limit = 5,
  activityIndex: providedActivityIndex = null
} = {}) {
  const activityIndex = providedActivityIndex ?? buildProductActivityIndex(submissions);

  return products
    .map((product) => {
      const activity = activityIndex.get(product.id) ?? {
        purchaseCount: 0,
        reviewCount: 0,
        completeCount: 0,
        totalCount: 0
      };
      return { product, activity };
    })
    .filter((item) => item.activity.reviewCount > 0)
    .sort((left, right) => {
      if (right.activity.reviewCount !== left.activity.reviewCount) {
        return right.activity.reviewCount - left.activity.reviewCount;
      }
      return right.activity.totalCount - left.activity.totalCount;
    })
    .slice(0, limit);
}

export function pickRecentProducts({ products = [], limit = 5 } = {}) {
  return products
    .filter((product) => product?.created_at)
    .slice()
    .sort((left, right) => {
      const leftTime = toDate(left.created_at)?.getTime() ?? 0;
      const rightTime = toDate(right.created_at)?.getTime() ?? 0;
      return rightTime - leftTime;
    })
    .slice(0, limit);
}

export function pickRecentSubmissions({ submissions = [], limit = 5 } = {}) {
  return submissions
    .filter((submission) => submission?.created_at)
    .slice()
    .sort((left, right) => {
      const leftTime = toDate(left.created_at)?.getTime() ?? 0;
      const rightTime = toDate(right.created_at)?.getTime() ?? 0;
      return rightTime - leftTime;
    })
    .slice(0, limit);
}

export function pickRecentDepositedSubmissions({ submissions = [], limit = 5 } = {}) {
  return submissions
    .filter((submission) => submission?.is_deposit_verified && submission?.deposited_at)
    .slice()
    .sort((left, right) => {
      const leftTime = toDate(left.deposited_at)?.getTime() ?? 0;
      const rightTime = toDate(right.deposited_at)?.getTime() ?? 0;
      return rightTime - leftTime;
    })
    .slice(0, limit);
}

export function aggregateCompanyMembers({ members = [], products = [], submissions = [] } = {}) {
  const productsByManager = products.reduce((acc, product) => {
    if (!product?.manager_id) {
      return acc;
    }

    if (!acc.has(product.manager_id)) {
      acc.set(product.manager_id, []);
    }

    acc.get(product.manager_id).push(product);
    return acc;
  }, new Map());
  const managersByProductId = products.reduce((acc, product) => {
    if (!product?.manager_id) {
      return acc;
    }

    if (!acc.has(product.id)) {
      acc.set(product.id, new Set());
    }

    acc.get(product.id).add(product.manager_id);
    return acc;
  }, new Map());
  const submissionMetricsByManager = new Map();

  submissions.forEach((submission) => {
    const managerIds = managersByProductId.get(submission?.product_id);

    if (!managerIds) {
      return;
    }

    managerIds.forEach((managerId) => {
      if (!submissionMetricsByManager.has(managerId)) {
        submissionMetricsByManager.set(managerId, {
          activeSubmissionCount: 0,
          completeSubmissionCount: 0,
          submissionCount: 0
        });
      }

      const metrics = submissionMetricsByManager.get(managerId);
      metrics.submissionCount += 1;

      if (classifySubmissionStatus(submission) === SUBMISSION_STATUS.COMPLETE) {
        metrics.completeSubmissionCount += 1;
      } else {
        metrics.activeSubmissionCount += 1;
      }
    });
  });

  return members.map((member) => {
    const managedProducts = productsByManager.get(member.login_id) ?? [];
    const submissionMetrics = submissionMetricsByManager.get(member.login_id) ?? {
      activeSubmissionCount: 0,
      completeSubmissionCount: 0,
      submissionCount: 0
    };

    return {
      loginId: member.login_id,
      username: member.username ?? null,
      productCount: managedProducts.length,
      activeSubmissionCount: submissionMetrics.activeSubmissionCount,
      completeSubmissionCount: submissionMetrics.completeSubmissionCount,
      submissionCount: submissionMetrics.submissionCount
    };
  });
}

export function buildDashboardMetrics({
  products = [],
  submissions = [],
  applications = [],
  evidencePhotos = [],
  companyMembers = [],
  pendingDepositThresholdDays = 7,
  trendDays = 14,
  topProductLimit = 5,
  recentLimit = 5,
  now = new Date()
} = {}) {
  const summary = buildDashboardSummary({
    products,
    submissions,
    applications,
    evidencePhotos,
    pendingDepositThresholdDays,
    now
  });
  const activityIndex = buildProductActivityIndex(submissions);

  const dailyTrend = buildDailyTrend({
    products,
    submissions,
    evidencePhotos,
    days: trendDays,
    now
  });

  const topProductsByPurchase = pickTopProductsByPurchase({
    products,
    submissions,
    limit: topProductLimit,
    activityIndex
  });
  const topProductsByReviewWaiting = pickTopProductsByReviewWaiting({
    products,
    submissions,
    limit: topProductLimit,
    activityIndex
  });

  const recentProducts = pickRecentProducts({ products, limit: recentLimit });
  const recentSubmissions = pickRecentSubmissions({ submissions, limit: recentLimit });
  const recentDepositedSubmissions = pickRecentDepositedSubmissions({
    submissions,
    limit: recentLimit
  });

  const companyMemberMetrics = aggregateCompanyMembers({
    members: companyMembers,
    products,
    submissions
  });

  return {
    summary,
    dailyTrend,
    topProductsByPurchase,
    topProductsByReviewWaiting,
    recent: {
      products: recentProducts,
      submissions: recentSubmissions,
      depositedSubmissions: recentDepositedSubmissions
    },
    companyMembers: companyMemberMetrics
  };
}
