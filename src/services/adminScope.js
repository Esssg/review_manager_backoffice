import { supabase } from "../lib/supabase";
import {
  includesAdminScopeCompanyData,
  resolveAdminScopePolicy
} from "../constants/adminScope";
import { fetchAllRows } from "./paginatedQuery";

const ADMIN_SCOPE_SELECT = "login_id,company";

function normalizeCompanyName(companyName) {
  const trimmedCompanyName = companyName?.trim();
  return trimmedCompanyName ? trimmedCompanyName : null;
}

export async function resolveAdminManagerScope(adminId, options = {}) {
  const scopePolicy = resolveAdminScopePolicy(options);
  const includeCompanyData = includesAdminScopeCompanyData(scopePolicy);
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
