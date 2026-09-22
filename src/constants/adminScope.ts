// @ts-nocheck

export const ADMIN_SCOPE_POLICY = Object.freeze({
  PERSONAL: "personal",
  COMPANY: "company",
  ALL: "all",
  REVIEW_RECEIVE_DETAIL: "review_receive_detail",
  BULK_EDIT: "bulk_edit"
});

export const ADMIN_SCOPE_PREFERENCE_STORAGE_KEY = "review_manager_admin_scope_preference";

const ADMIN_SCOPE_RANK = Object.freeze({
  [ADMIN_SCOPE_POLICY.PERSONAL]: 1,
  [ADMIN_SCOPE_POLICY.COMPANY]: 2,
  [ADMIN_SCOPE_POLICY.ALL]: 3
});

export function normalizeAdminRequestedScope(value) {
  return value === ADMIN_SCOPE_POLICY.COMPANY || value === ADMIN_SCOPE_POLICY.ALL
    ? ADMIN_SCOPE_POLICY.COMPANY
    : ADMIN_SCOPE_POLICY.PERSONAL;
}

export function getAdminScopePreferenceKey(adminId) {
  return `${ADMIN_SCOPE_PREFERENCE_STORAGE_KEY}:${String(adminId ?? "anonymous")}`;
}

export function getDefaultAdminRequestedScope(adminId, companyName) {
  return String(adminId ?? "").trim() === "hyejin2054"
    && String(companyName ?? "").trim() === "시나브로"
    ? ADMIN_SCOPE_POLICY.COMPANY
    : ADMIN_SCOPE_POLICY.PERSONAL;
}

export function getNarrowerAdminScope(leftScope, rightScope) {
  const left = Object.values(ADMIN_SCOPE_POLICY).includes(leftScope) ? leftScope : ADMIN_SCOPE_POLICY.PERSONAL;
  const right = Object.values(ADMIN_SCOPE_POLICY).includes(rightScope) ? rightScope : ADMIN_SCOPE_POLICY.PERSONAL;

  return (ADMIN_SCOPE_RANK[left] ?? 1) <= (ADMIN_SCOPE_RANK[right] ?? 1) ? left : right;
}

export function clampAdminRequestedScope(requestedScope, maximumScope, isCompanyScopeAvailable = true) {
  if (!isCompanyScopeAvailable || maximumScope === ADMIN_SCOPE_POLICY.PERSONAL) {
    return ADMIN_SCOPE_POLICY.PERSONAL;
  }

  return normalizeAdminRequestedScope(requestedScope);
}

export function getEffectiveAdminScopePolicy(requestedScope, maximumScope, isCompanyScopeAvailable = true) {
  const clampedScope = clampAdminRequestedScope(requestedScope, maximumScope, isCompanyScopeAvailable);

  if (clampedScope === ADMIN_SCOPE_POLICY.PERSONAL) {
    return ADMIN_SCOPE_POLICY.PERSONAL;
  }

  return maximumScope === ADMIN_SCOPE_POLICY.ALL
    ? ADMIN_SCOPE_POLICY.ALL
    : ADMIN_SCOPE_POLICY.COMPANY;
}

const COMPANY_SCOPE_POLICIES = new Set([
  ADMIN_SCOPE_POLICY.COMPANY,
  ADMIN_SCOPE_POLICY.ALL,
  ADMIN_SCOPE_POLICY.REVIEW_RECEIVE_DETAIL,
  ADMIN_SCOPE_POLICY.BULK_EDIT
]);

export function getAdminScopePolicy(includeCompanyData = false, role = null) {
  if (String(role ?? "").toLowerCase() === "developer" && includeCompanyData) {
    return ADMIN_SCOPE_POLICY.ALL;
  }

  return includeCompanyData ? ADMIN_SCOPE_POLICY.COMPANY : ADMIN_SCOPE_POLICY.PERSONAL;
}

export function resolveAdminScopePolicy(options = {}) {
  const requestedPolicy = options.scopePolicy;
  const isKnownPolicy = Object.values(ADMIN_SCOPE_POLICY).includes(requestedPolicy);

  return isKnownPolicy
    ? requestedPolicy
    : getAdminScopePolicy(options.includeCompanyData, options.role ?? options.adminProfile?.role);
}

export function includesAdminScopeCompanyData(scopePolicy) {
  return COMPANY_SCOPE_POLICIES.has(scopePolicy);
}
