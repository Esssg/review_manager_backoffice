// @ts-nocheck

const COMPANY_DATA_DEFAULT_ON_ADMIN_IDS = new Set(["hyejin2054"]);
const DEPOSIT_VERIFY_DENIED_ADMIN_IDS = new Set(["aram2525", "kimhanbi77"]);

export function getFallbackAdminCapabilities(adminId) {
  return {
    includeCompanyDataInclude: COMPANY_DATA_DEFAULT_ON_ADMIN_IDS.has(adminId),
    canVerifyDeposit: !DEPOSIT_VERIFY_DENIED_ADMIN_IDS.has(adminId)
  };
}

export function normalizeAdminCapabilities(adminId, row) {
  const fallback = getFallbackAdminCapabilities(adminId);

  return {
    includeCompanyDataInclude:
      typeof row?.include_company_data_include === "boolean"
        ? row.include_company_data_include
        : fallback.includeCompanyDataInclude,
    canVerifyDeposit:
      typeof row?.can_verify_deposit === "boolean" ? row.can_verify_deposit : fallback.canVerifyDeposit
  };
}

export function isAdminCapabilitiesColumnError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;

  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("include_company_data_include") ||
    message.includes("can_verify_deposit")
  );
}
