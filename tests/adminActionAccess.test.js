import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_PERMISSION_CODE, ADMIN_ROLE } from "../src/constants/adminAccess.ts";
import { resolveAdminActionPermission } from "../src/utils/adminActionAccess.ts";

const baseAccess = {
  adminId: "employee-1",
  companyId: "company-a",
  role: ADMIN_ROLE.EMPLOYEE,
  capabilities: { canVerifyDeposit: true },
  menuPermissions: [
    {
      menu_number: 4,
      permission_code: ADMIN_PERMISSION_CODE.MENU_PRODUCT_OVERVIEW
    }
  ],
  permissionBindings: []
};

test("legacy 메뉴 fallback은 지정된 화면의 action만 허용한다", () => {
  const result = resolveAdminActionPermission(
    ADMIN_PERMISSION_CODE.SUBMISSION_UPDATE,
    baseAccess,
    { legacyMenuCodes: [ADMIN_PERMISSION_CODE.MENU_PRODUCT_OVERVIEW] }
  );

  assert.equal(result.allowed, true);
  assert.equal(result.legacyFallbackUsed, true);
  assert.equal(
    resolveAdminActionPermission(ADMIN_PERMISSION_CODE.BULK_EDIT_EXECUTE, baseAccess, {
      legacyMenuCodes: [ADMIN_PERMISSION_CODE.MENU_BULK_EDIT]
    }).allowed,
    false
  );
});

test("입금 권한은 기존 capability가 없으면 legacy fallback으로 허용하지 않는다", () => {
  const result = resolveAdminActionPermission(
    ADMIN_PERMISSION_CODE.DEPOSIT_VERIFY,
    { ...baseAccess, capabilities: { canVerifyDeposit: false } },
    { legacyMenuCodes: [ADMIN_PERMISSION_CODE.MENU_PRODUCT_OVERVIEW] }
  );

  assert.equal(result.allowed, false);
});

test("명시적인 개인 deny는 legacy menu fallback보다 우선한다", () => {
  const result = resolveAdminActionPermission(
    ADMIN_PERMISSION_CODE.SUBMISSION_DELETE,
    {
      ...baseAccess,
      permissionBindings: [
        {
          subject_type: "admin",
          subject_id: "employee-1",
          permission_code: ADMIN_PERMISSION_CODE.SUBMISSION_DELETE,
          effect: "deny"
        }
      ]
    },
    { legacyMenuCodes: [ADMIN_PERMISSION_CODE.MENU_PRODUCT_OVERVIEW] }
  );

  assert.equal(result.allowed, false);
  assert.equal(result.legacyFallbackUsed, false);
});

test("gateway mode는 explicit binding 없는 action을 default deny한다", () => {
  const result = resolveAdminActionPermission(
    ADMIN_PERMISSION_CODE.SUBMISSION_CREATE,
    baseAccess,
    { legacyFallbackAllowed: false, legacyMenuCodes: [ADMIN_PERMISSION_CODE.MENU_PRODUCT_OVERVIEW] }
  );

  assert.equal(result.allowed, false);
  assert.equal(result.isReady, true);
});
