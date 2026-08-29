// @ts-nocheck

import { ADMIN_SCOPE_POLICY } from "@/constants/adminScope";
import { requestAdminGatewayData } from "@/services/adminGateway";

/**
 * 관리자 데이터 gateway operation 이름은 서비스 함수와 Edge Function 사이의
 * 명시적인 계약이다. 클라이언트가 임의의 RPC 이름을 전달하지 않도록 Edge
 * Function에서도 같은 목록을 allowlist로 유지한다.
 */
export const ADMIN_GATEWAY_OPERATION = Object.freeze({
  PRODUCTS_LIST: "products.list",
  REVIEW_RECEIVE_LIST: "review_receive.list",
  REVIEW_RECEIVE_DETAIL: "review_receive.detail",
  REVIEW_RECEIVE_PRODUCT_CREATE: "review_receive.product.create",
  REVIEW_RECEIVE_PRODUCT_UPDATE: "review_receive.product.update",
  REVIEW_RECEIVE_PRODUCT_DELETE: "review_receive.product.delete",
  REVIEW_RECEIVE_PRODUCT_BUNDLE_DELETE: "review_receive.product_bundle.delete",
  REVIEW_RECEIVE_SUBMISSION_STATUS: "review_receive.submission.status",
  REVIEW_RECEIVE_PHOTOS: "review_receive.photos",
  REVIEW_RECEIVE_SUBMISSION_CREATE: "review_receive.submission.create",
  REVIEW_RECEIVE_SUBMISSION_UPDATE: "review_receive.submission.update",
  REVIEW_RECEIVE_SUBMISSION_DELETE: "review_receive.submission.delete",
  PRODUCT_DETAIL_META: "product_detail.meta",
  PRODUCT_DETAIL_APPLICATIONS: "product_detail.applications",
  PRODUCT_DETAIL_SUBMISSIONS: "product_detail.submissions",
  PRODUCT_DETAIL_PHOTOS: "product_detail.photos",
  PRODUCT_DETAIL_APPLICATION_CONFIRM: "product_detail.application.confirm",
  PRODUCT_DETAIL_SUBMISSION_VERIFY: "product_detail.submission.verify",
  PRODUCT_DETAIL_STEP_SET: "product_detail.step.set",
  PRODUCT_DETAIL_SUBMISSION_BY_ORDER: "product_detail.submission.by_order",
  PRODUCT_DETAIL_SUBMISSION_CREATE: "product_detail.submission.create",
  PRODUCT_OVERVIEW_LIST: "product_overview.list",
  PRODUCT_OVERVIEW_SUBMISSIONS_DELETE: "product_overview.submissions.delete",
  DASHBOARD_READ: "dashboard.read",
  EXPORT_READ: "export.read",
  EXPORT_PHOTOS_READ: "export.photos.read",
  FILE_UPLOAD_APPLY: "file_upload.apply",
  BULK_EDIT_ROWS: "bulk_edit.rows",
  BULK_EDIT_APPLY: "bulk_edit.apply",
  EVIDENCE_PHOTO_DELETE: "evidence.photo.delete",
  DELETION_SUBMISSIONS_WITH_PHOTOS: "deletion.submissions_with_photos",
  DELETION_PRODUCTS_WITH_RELATED_DATA: "deletion.products_with_related_data",
  TUTORIAL_READ: "tutorial.read",
  TUTORIAL_SAVE: "tutorial.save"
});

export async function callAdminGatewayOperation(operation, payload = {}) {
  try {
    const data = await requestAdminGatewayData(operation, payload);
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export function getGatewayArray(data, keys = []) {
  if (Array.isArray(data)) {
    return data;
  }

  for (const key of keys) {
    if (Array.isArray(data?.[key])) {
      return data[key];
    }
  }

  return Array.isArray(data?.data) ? data.data : [];
}

export function getGatewayObject(data, keys = []) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  for (const key of keys) {
    if (data[key] && typeof data[key] === "object") {
      return data[key];
    }
  }

  return data;
}

/**
 * gateway 요청에서는 브라우저가 보내는 관리자 식별자를 권한 주체로
 * 사용하지 않는다. 리소스 payload 안에 남은 legacy identity 필드도
 * operation별 RPC가 세션 principal을 사용하도록 제거한다.
 */
const CLIENT_IDENTITY_KEYS = new Set([
  "adminId",
  "admin_id",
  "p_admin_id",
  "p_actor_admin_id",
  "actorAdminId",
  "actor_admin_id"
]);

const MANAGER_IDENTITY_KEYS = new Set(["manager_id", "managerId"]);

function omitIdentityFields(value, keys) {
  if (Array.isArray(value)) {
    return value.map((item) => omitIdentityFields(item, keys));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !keys.has(key))
      .map(([key, child]) => [key, omitIdentityFields(child, keys)])
  );
}

export function omitClientIdentity(payload = {}) {
  return omitIdentityFields(payload, CLIENT_IDENTITY_KEYS);
}

export function omitManagerIdentity(payload = {}) {
  return omitIdentityFields(payload, new Set([...CLIENT_IDENTITY_KEYS, ...MANAGER_IDENTITY_KEYS]));
}

export function buildGatewayScope(adminId, options = {}) {
  const profile = options.adminProfile ?? options.profile ?? {};
  const scopePolicy = options.scopePolicy ?? ADMIN_SCOPE_POLICY.PERSONAL;
  const includeCompanyData =
    options.includeCompanyData == null
      ? scopePolicy === ADMIN_SCOPE_POLICY.COMPANY || scopePolicy === ADMIN_SCOPE_POLICY.ALL
      : Boolean(options.includeCompanyData);

  return {
    adminId,
    // 실제 manager 범위는 gateway/RPC가 세션 principal을 기준으로 계산한다.
    managerIds: [],
    companyId: profile.companyId ?? profile.company_id ?? options.companyId ?? null,
    companyName: profile.company ?? options.companyName ?? null,
    role: profile.role ?? options.role ?? null,
    includeCompanyData,
    scopePolicy,
    isCompanyScopeAvailable: Boolean(profile.company ?? profile.companyId ?? profile.company_id),
    isServerResolved: true,
    error: null
  };
}

export function getGatewayPageInfo(data, fallbackPageSize = null) {
  const pageInfo = data?.pageInfo ?? data?.page_info ?? null;

  if (pageInfo && typeof pageInfo === "object") {
    return {
      hasMore: Boolean(pageInfo.hasMore ?? pageInfo.has_more),
      nextCursor: pageInfo.nextCursor ?? pageInfo.next_cursor ?? null,
      pageSize: pageInfo.pageSize ?? pageInfo.page_size ?? fallbackPageSize,
      totalCount: pageInfo.totalCount ?? pageInfo.total_count ?? 0
    };
  }

  return {
    hasMore: Boolean(data?.hasMore ?? data?.has_more),
    nextCursor: data?.nextCursor ?? data?.next_cursor ?? null,
    pageSize: fallbackPageSize,
    totalCount: Number(data?.totalCount ?? data?.total_count ?? 0)
  };
}

export function buildGatewayErrorResult(error, extra = {}) {
  return {
    data: null,
    error,
    ...extra
  };
}
