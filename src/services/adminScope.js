import { supabase } from "../lib/supabase";

const ADMIN_SCOPE_SELECT = "login_id,company";

function normalizeCompanyName(companyName) {
  const trimmedCompanyName = companyName?.trim();
  return trimmedCompanyName ? trimmedCompanyName : null;
}

export async function resolveAdminManagerScope(adminId, options = {}) {
  const { includeCompanyData = false } = options;

  if (!adminId) {
    return {
      managerIds: [],
      companyName: null,
      isCompanyScopeAvailable: false,
      error: new Error("로그인 정보가 없습니다. 다시 로그인해주세요.")
    };
  }

  const adminResult = await supabase
    .from("admins")
    .select(ADMIN_SCOPE_SELECT)
    .eq("login_id", adminId)
    .maybeSingle();

  if (adminResult.error) {
    return {
      managerIds: [adminId],
      companyName: null,
      isCompanyScopeAvailable: false,
      error: adminResult.error
    };
  }

  const companyName = normalizeCompanyName(adminResult.data?.company);

  if (!includeCompanyData || !companyName) {
    return {
      managerIds: [adminId],
      companyName,
      isCompanyScopeAvailable: Boolean(companyName),
      error: null
    };
  }

  const companyAdminsResult = await supabase
    .from("admins")
    .select("login_id")
    .eq("company", companyName)
    .order("login_id", { ascending: true });

  if (companyAdminsResult.error) {
    return {
      managerIds: [adminId],
      companyName,
      isCompanyScopeAvailable: true,
      error: companyAdminsResult.error
    };
  }

  const managerIds = Array.from(
    new Set([adminId, ...(companyAdminsResult.data ?? []).map((admin) => admin.login_id).filter(Boolean)])
  );

  return {
    managerIds,
    companyName,
    isCompanyScopeAvailable: true,
    error: null
  };
}
