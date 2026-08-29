// @ts-nocheck

import { supabase } from "@/lib/supabase";
import {
  ADMIN_SCOPE_POLICY,
  includesAdminScopeCompanyData,
  resolveAdminScopePolicy
} from "@/constants/adminScope";
import { fetchAllRows } from "@/services/paginatedQuery";
import { isAdminGatewayConfigured } from "@/services/adminGateway";
import { buildGatewayScope } from "@/services/adminGatewayData";

const ADMIN_SCOPE_SELECT = "login_id,company";

function normalizeCompanyName(companyName) {
  const trimmedCompanyName = companyName?.trim();
  return trimmedCompanyName ? trimmedCompanyName : null;
}

export async function resolveAdminManagerScope(adminId, options = {}) {
  const role = options.role ?? options.adminProfile?.role ?? null;
  const scopePolicy = resolveAdminScopePolicy({ ...options, role });
  const includeCompanyData = includesAdminScopeCompanyData(scopePolicy);

  if (isAdminGatewayConfigured()) {
    return buildGatewayScope(adminId, {
      ...options,
      role,
      scopePolicy,
      includeCompanyData
    });
  }

  const suppliedAdminProfile =
    options.adminProfile?.loginId === adminId ? options.adminProfile : null;

  const buildScope = (scope) => ({
    ...scope,
    scopePolicy,
    includeCompanyData
  });

  if (!adminId) {
    return buildScope({
      managerIds: [],
      companyName: null,
      isCompanyScopeAvailable: false,
      error: new Error("로그인 정보가 없습니다. 다시 로그인해주세요.")
    });
  }

  const adminResult = suppliedAdminProfile
    ? {
        data: {
          login_id: suppliedAdminProfile.loginId,
          company: suppliedAdminProfile.company
        },
        error: null
      }
    : await supabase
        .from("admins")
        .select(ADMIN_SCOPE_SELECT)
        .eq("login_id", adminId)
        .maybeSingle();

  if (adminResult.error) {
    return buildScope({
      managerIds: [adminId],
      companyName: null,
      isCompanyScopeAvailable: false,
      error: adminResult.error
    });
  }

  const companyName = normalizeCompanyName(adminResult.data?.company);

  // developer의 전체 범위는 일반 목록뿐 아니라 상품 상세·일괄수정처럼
  // 내부적으로 별도 scope policy를 요청하는 흐름에도 동일하게 적용한다.
  if (
    role?.toLowerCase?.() === "developer" &&
    includeCompanyData &&
    scopePolicy !== ADMIN_SCOPE_POLICY.PERSONAL
  ) {
    const allAdminsResult = await fetchAllRows(
      () =>
        supabase
          .from("admins")
          .select("login_id")
          .not("login_id", "is", null),
      { cursorColumn: "login_id" }
    );

    if (allAdminsResult.error) {
      return buildScope({
        managerIds: [adminId],
        companyName,
        isCompanyScopeAvailable: true,
        error: allAdminsResult.error
      });
    }

    const managerIds = Array.from(
      new Set([adminId, ...(allAdminsResult.data ?? []).map((admin) => admin.login_id).filter(Boolean)])
    );

    return buildScope({
      managerIds,
      companyName,
      isCompanyScopeAvailable: true,
      error: null
    });
  }

  if (!includeCompanyData || !companyName) {
    return buildScope({
      managerIds: [adminId],
      companyName,
      isCompanyScopeAvailable: Boolean(companyName),
      error: null
    });
  }

  const companyAdminsResult = await fetchAllRows(
    () =>
      supabase
        .from("admins")
        .select("login_id")
        .eq("company", companyName),
    { cursorColumn: "login_id" }
  );

  if (companyAdminsResult.error) {
    return buildScope({
      managerIds: [adminId],
      companyName,
      isCompanyScopeAvailable: true,
      error: companyAdminsResult.error
    });
  }

  const managerIds = Array.from(
    new Set([adminId, ...(companyAdminsResult.data ?? []).map((admin) => admin.login_id).filter(Boolean)])
  );

  return buildScope({
    managerIds,
    companyName,
    isCompanyScopeAvailable: true,
    error: null
  });
}
