// @ts-nocheck

export const ADMIN_SCOPE_POLICY = Object.freeze({
  PERSONAL: "personal",
  COMPANY: "company",
  REVIEW_RECEIVE_DETAIL: "review_receive_detail",
  BULK_EDIT: "bulk_edit"
});

const COMPANY_SCOPE_POLICIES = new Set([
  ADMIN_SCOPE_POLICY.COMPANY,
  ADMIN_SCOPE_POLICY.REVIEW_RECEIVE_DETAIL,
  ADMIN_SCOPE_POLICY.BULK_EDIT
]);

export function getAdminScopePolicy(includeCompanyData = false) {
  return includeCompanyData ? ADMIN_SCOPE_POLICY.COMPANY : ADMIN_SCOPE_POLICY.PERSONAL;
}

export function resolveAdminScopePolicy(options = {}) {
  const requestedPolicy = options.scopePolicy;
  const isKnownPolicy = Object.values(ADMIN_SCOPE_POLICY).includes(requestedPolicy);

  return isKnownPolicy ? requestedPolicy : getAdminScopePolicy(options.includeCompanyData);
}

export function includesAdminScopeCompanyData(scopePolicy) {
  return COMPANY_SCOPE_POLICIES.has(scopePolicy);
}
