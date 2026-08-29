// @ts-nocheck

import {
  ADMIN_PERMISSION_CODE,
  getPermissionCodeForMenuNumber
} from "@/constants/adminAccess";
import {
  hasPermissionWithLegacyFallback,
  resolvePermission
} from "@/utils/permissionResolver";

const MENU_PERMISSION_CODES = Object.freeze([
  ADMIN_PERMISSION_CODE.MENU_DASHBOARD,
  ADMIN_PERMISSION_CODE.MENU_PRODUCT,
  ADMIN_PERMISSION_CODE.MENU_REVIEW_RECEIVE,
  ADMIN_PERMISSION_CODE.MENU_PRODUCT_OVERVIEW,
  ADMIN_PERMISSION_CODE.MENU_EXPORT,
  ADMIN_PERMISSION_CODE.MENU_FILE_UPLOAD,
  ADMIN_PERMISSION_CODE.MENU_BULK_EDIT
]);

function normalizeMenuPermissions(menuPermissions) {
  return Array.isArray(menuPermissions) ? menuPermissions : [];
}

export function hasLegacyMenuPermission(menuPermissions, permissionCode) {
  const menuNumber = MENU_PERMISSION_CODES.indexOf(permissionCode) + 1;

  return normalizeMenuPermissions(menuPermissions).some((permission) => {
    const rowCode = permission?.permission_code ?? permission?.permissionCode;
    const rowNumber = Number(permission?.menu_number ?? permission?.menuNumber);

    return rowCode === permissionCode || (menuNumber > 0 && rowNumber === menuNumber);
  });
}

function getDefaultLegacyMenuCodes(permissionCode) {
  if (MENU_PERMISSION_CODES.includes(permissionCode)) {
    return [permissionCode];
  }

  if (permissionCode === ADMIN_PERMISSION_CODE.EXPORT_EXECUTE) {
    return [ADMIN_PERMISSION_CODE.MENU_EXPORT];
  }

  if (permissionCode === ADMIN_PERMISSION_CODE.BULK_EDIT_EXECUTE) {
    return [ADMIN_PERMISSION_CODE.MENU_BULK_EDIT];
  }

  if (
    permissionCode === ADMIN_PERMISSION_CODE.PRODUCT_READ ||
    permissionCode === ADMIN_PERMISSION_CODE.PRODUCT_CREATE ||
    permissionCode === ADMIN_PERMISSION_CODE.PRODUCT_UPDATE ||
    permissionCode === ADMIN_PERMISSION_CODE.PRODUCT_DELETE ||
    permissionCode === ADMIN_PERMISSION_CODE.PRODUCT_STEP_READ ||
    permissionCode === ADMIN_PERMISSION_CODE.PRODUCT_STEP_CREATE ||
    permissionCode === ADMIN_PERMISSION_CODE.PRODUCT_STEP_UPDATE ||
    permissionCode === ADMIN_PERMISSION_CODE.PRODUCT_STEP_DELETE ||
    permissionCode === ADMIN_PERMISSION_CODE.APPLICATION_READ ||
    permissionCode === ADMIN_PERMISSION_CODE.APPLICATION_CREATE ||
    permissionCode === ADMIN_PERMISSION_CODE.APPLICATION_UPDATE ||
    permissionCode === ADMIN_PERMISSION_CODE.APPLICATION_DELETE ||
    permissionCode === ADMIN_PERMISSION_CODE.APPLICATION_CONFIRM
  ) {
    return [ADMIN_PERMISSION_CODE.MENU_PRODUCT];
  }

  if (
    permissionCode === ADMIN_PERMISSION_CODE.SUBMISSION_READ ||
    permissionCode === ADMIN_PERMISSION_CODE.SUBMISSION_CREATE ||
    permissionCode === ADMIN_PERMISSION_CODE.SUBMISSION_UPDATE ||
    permissionCode === ADMIN_PERMISSION_CODE.SUBMISSION_DELETE ||
    permissionCode === ADMIN_PERMISSION_CODE.DEPOSIT_VERIFY ||
    permissionCode === ADMIN_PERMISSION_CODE.DEPOSITOR_NAME_UPDATE ||
    permissionCode === ADMIN_PERMISSION_CODE.PHOTO_READ ||
    permissionCode === ADMIN_PERMISSION_CODE.PHOTO_UPLOAD ||
    permissionCode === ADMIN_PERMISSION_CODE.PHOTO_DELETE
  ) {
    return [
      ADMIN_PERMISSION_CODE.MENU_PRODUCT,
      ADMIN_PERMISSION_CODE.MENU_REVIEW_RECEIVE,
      ADMIN_PERMISSION_CODE.MENU_PRODUCT_OVERVIEW
    ];
  }

  return [];
}

export function getLegacyPermissionFallback(permissionCode, access = {}, options = {}) {
  const explicitMenuCodes = Array.isArray(options.legacyMenuCodes)
    ? options.legacyMenuCodes
    : getDefaultLegacyMenuCodes(permissionCode);
  const menuPermissions = access.menuPermissions;

  if (
    permissionCode === ADMIN_PERMISSION_CODE.DEPOSIT_VERIFY ||
    permissionCode === ADMIN_PERMISSION_CODE.DEPOSITOR_NAME_UPDATE
  ) {
    return Boolean(access.capabilities?.canVerifyDeposit) && explicitMenuCodes.some((menuCode) =>
      hasLegacyMenuPermission(menuPermissions, menuCode)
    );
  }

  if (explicitMenuCodes.length > 0) {
    return explicitMenuCodes.some((menuCode) => hasLegacyMenuPermission(menuPermissions, menuCode));
  }

  if (
    permissionCode === ADMIN_PERMISSION_CODE.PERSONAL_SETTING_READ ||
    permissionCode === ADMIN_PERMISSION_CODE.PERSONAL_SETTING_UPDATE
  ) {
    return true;
  }

  if (
    permissionCode === ADMIN_PERMISSION_CODE.COMPANY_SETTING_READ ||
    permissionCode === ADMIN_PERMISSION_CODE.COMPANY_SETTING_UPDATE
  ) {
    return ["developer", "company_admin"].includes(String(access.role ?? "").toLowerCase());
  }

  return false;
}

export function resolveAdminActionPermission(permissionCode, access = {}, options = {}) {
  const principal = {
    adminId: access.adminId ?? access.adminProfile?.loginId,
    companyId: access.companyId ?? access.adminProfile?.companyId ?? access.adminProfile?.company_id,
    role: access.role ?? access.adminProfile?.role
  };
  const bindings = Array.isArray(access.permissionBindings) ? access.permissionBindings : [];
  const isReady = options.isReady ?? Boolean(
    access &&
      !access.isLoadingCapabilities &&
      !access.capabilitiesErrorMessage &&
      !access.menuErrorMessage
  );
  const legacyFallbackAllowed = options.legacyFallbackAllowed !== false;
  const legacyFallback = legacyFallbackAllowed
    ? getLegacyPermissionFallback(permissionCode, access, options)
    : false;
  const resolved = resolvePermission(permissionCode, principal, bindings);

  return {
    ...resolved,
    allowed: Boolean(
      isReady &&
        hasPermissionWithLegacyFallback(
          permissionCode,
          principal,
          bindings,
          legacyFallback
        )
    ),
    isReady,
    legacyFallbackUsed: legacyFallbackAllowed && resolved.matchedBindings.length === 0 && legacyFallback
  };
}

export function getPermissionCodeForMenu(menuNumber) {
  return getPermissionCodeForMenuNumber(menuNumber);
}
