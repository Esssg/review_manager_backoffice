// @ts-nocheck

import { supabase } from "@/lib/supabase";
import { chunkValues } from "@/services/paginatedQuery";

export const ADMIN_DELETION_STEP = Object.freeze({
  EVIDENCE_PHOTOS: "evidence_photos",
  SUBMISSIONS: "submissions",
  APPLICATIONS: "applications",
  PRODUCT_STEPS: "product_steps",
  PRODUCTS: "products"
});

function normalizeIds(values) {
  return Array.from(new Set((values ?? []).map(Number).filter(Number.isFinite)));
}

function normalizeManagerIds(values) {
  return Array.from(new Set((values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function createDeletionResult(scope = null) {
  return {
    data: [],
    error: null,
    scope,
    partial: false,
    completedSteps: [],
    failedStep: null,
    deletedEvidenceSubmissionIds: [],
    deletedSubmissionIds: [],
    deletedSubmissionProductIds: [],
    deletedApplicationProductIds: [],
    deletedProductStepProductIds: [],
    deletedProductIds: []
  };
}

function hasCompletedDeletion(result) {
  return [
    result.deletedEvidenceSubmissionIds,
    result.deletedSubmissionIds,
    result.deletedSubmissionProductIds,
    result.deletedApplicationProductIds,
    result.deletedProductStepProductIds,
    result.deletedProductIds
  ].some((ids) => ids.length > 0);
}

async function deleteInChunks(values, buildQuery) {
  const completedValues = [];

  for (const chunk of chunkValues(values)) {
    const { error } = await buildQuery(chunk);

    if (error) {
      return {
        completedValues,
        error
      };
    }

    completedValues.push(...chunk);
  }

  return {
    completedValues,
    error: null
  };
}

async function runDeletionStep(result, step, values, targetKey, buildQuery) {
  const normalizedValues = normalizeIds(values);

  if (normalizedValues.length === 0) {
    return true;
  }

  const stepResult = await deleteInChunks(normalizedValues, buildQuery);

  result[targetKey] = stepResult.completedValues;

  if (stepResult.completedValues.length > 0) {
    result.completedSteps.push(step);
  }

  if (stepResult.error) {
    result.error = stepResult.error;
    result.failedStep = step;
    result.partial = hasCompletedDeletion(result);
    return false;
  }

  return true;
}

function finalizeDeletionResult(result, dataKey) {
  result.data = [...result[dataKey]];
  result.partial = Boolean(result.error && hasCompletedDeletion(result));
  return result;
}

export async function deleteSubmissionsWithEvidencePhotos(submissionIds, scope = null) {
  const result = createDeletionResult(scope);
  const normalizedSubmissionIds = normalizeIds(submissionIds);

  if (
    !(await runDeletionStep(
      result,
      ADMIN_DELETION_STEP.EVIDENCE_PHOTOS,
      normalizedSubmissionIds,
      "deletedEvidenceSubmissionIds",
      (chunk) => supabase.from("evidence_photos").delete().in("submission_id", chunk)
    ))
  ) {
    return finalizeDeletionResult(result, "deletedSubmissionIds");
  }

  await runDeletionStep(
    result,
    ADMIN_DELETION_STEP.SUBMISSIONS,
    normalizedSubmissionIds,
    "deletedSubmissionIds",
    (chunk) => supabase.from("submissions").delete().in("id", chunk)
  );

  return finalizeDeletionResult(result, "deletedSubmissionIds");
}

export async function deleteProductsWithRelatedData({ productIds, submissionIds, managerIds, scope = null }) {
  const result = createDeletionResult(scope);
  const normalizedProductIds = normalizeIds(productIds);
  const normalizedManagerIds = normalizeManagerIds(managerIds);

  if (normalizedProductIds.length === 0) {
    result.error = new Error("삭제할 상품을 찾지 못했습니다.");
    result.failedStep = ADMIN_DELETION_STEP.PRODUCTS;
    return result;
  }

  if (normalizedManagerIds.length === 0) {
    result.error = new Error("삭제할 수 있는 관리자 범위가 없습니다.");
    result.failedStep = ADMIN_DELETION_STEP.PRODUCTS;
    return result;
  }

  const normalizedSubmissionIds = normalizeIds(submissionIds);

  if (
    !(await runDeletionStep(
      result,
      ADMIN_DELETION_STEP.EVIDENCE_PHOTOS,
      normalizedSubmissionIds,
      "deletedEvidenceSubmissionIds",
      (chunk) => supabase.from("evidence_photos").delete().in("submission_id", chunk)
    ))
  ) {
    return finalizeDeletionResult(result, "deletedProductIds");
  }

  if (
    !(await runDeletionStep(
      result,
      ADMIN_DELETION_STEP.SUBMISSIONS,
      normalizedProductIds,
      "deletedSubmissionProductIds",
      (chunk) => supabase.from("submissions").delete().in("product_id", chunk)
    ))
  ) {
    return finalizeDeletionResult(result, "deletedProductIds");
  }

  if (
    !(await runDeletionStep(
      result,
      ADMIN_DELETION_STEP.APPLICATIONS,
      normalizedProductIds,
      "deletedApplicationProductIds",
      (chunk) => supabase.from("applications").delete().in("product_id", chunk)
    ))
  ) {
    return finalizeDeletionResult(result, "deletedProductIds");
  }

  if (
    !(await runDeletionStep(
      result,
      ADMIN_DELETION_STEP.PRODUCT_STEPS,
      normalizedProductIds,
      "deletedProductStepProductIds",
      (chunk) => supabase.from("product_steps").delete().in("product_id", chunk)
    ))
  ) {
    return finalizeDeletionResult(result, "deletedProductIds");
  }

  await runDeletionStep(
    result,
    ADMIN_DELETION_STEP.PRODUCTS,
    normalizedProductIds,
    "deletedProductIds",
    (chunk) => supabase.from("products").delete().in("id", chunk).in("manager_id", normalizedManagerIds)
  );

  return finalizeDeletionResult(result, "deletedProductIds");
}
