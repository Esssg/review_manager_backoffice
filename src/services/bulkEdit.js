import { supabase } from "../lib/supabase";
import { ADMIN_SCOPE_POLICY } from "../constants/adminScope";
import { resolveAdminManagerScope } from "./adminScope";
import { fetchAllRows, fetchAllRowsInChunks } from "./paginatedQuery";

const BULK_EDIT_SUBMISSION_SELECT =
  "id,product_id,assign_name,order_number,buyer_name,recipient_name,purchase_account,contact,address,bank_name,bank_account,account_holder,amount,review_fee,is_review_verified,is_deposit_verified,deposited_at,actual_depositor_name";
const BULK_EDIT_APPLY_RPC = "apply_admin_bulk_submission_updates";

export async function fetchBulkEditCurrentRows(adminId, submissionIds, options = {}) {
  const uniqueSubmissionIds = Array.from(new Set((submissionIds ?? []).map(Number).filter(Number.isSafeInteger)));
  const scope = await resolveAdminManagerScope(adminId, {
    ...options,
    scopePolicy: ADMIN_SCOPE_POLICY.BULK_EDIT
  });

  if (scope.error) {
    return { data: [], error: scope.error };
  }

  if (!scope.companyName) {
    return { data: [], error: new Error("회사 정보가 없는 계정은 일괄수정을 할 수 없습니다.") };
  }

  if (uniqueSubmissionIds.length === 0) {
    return { data: [], error: null };
  }

  const productsResult = await fetchAllRows(() =>
    supabase.from("products").select("id").in("manager_id", scope.managerIds)
  );

  if (productsResult.error) {
    return { data: [], error: productsResult.error };
  }

  const allowedProductIds = new Set((productsResult.data ?? []).map((product) => Number(product.id)));
  const submissionsResult = await fetchAllRowsInChunks(uniqueSubmissionIds, (submissionIdChunk) =>
    supabase.from("submissions").select(BULK_EDIT_SUBMISSION_SELECT).in("id", submissionIdChunk)
  );

  if (submissionsResult.error) {
    return { data: [], error: submissionsResult.error };
  }

  return {
    data: (submissionsResult.data ?? [])
      .filter((submission) => allowedProductIds.has(Number(submission.product_id)))
      .map((submission) => ({ ...submission, submission_id: Number(submission.id) })),
    error: null
  };
}

export async function applyBulkEditChanges(adminId, changes) {
  const updates = (changes ?? []).map((change) => ({
    submission_id: change.submissionId,
    ...change.payload
  }));

  const { data, error } = await supabase.rpc(BULK_EDIT_APPLY_RPC, {
    p_admin_id: adminId,
    p_updates: updates
  });

  return {
    data: data ?? [],
    error
  };
}
