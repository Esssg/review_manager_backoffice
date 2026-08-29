import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_PERMISSION_CODE,
  ADMIN_PERMISSION_SCOPE,
  ADMIN_ROLE
} from "../src/constants/adminAccess.ts";
import {
  hasPermission,
  hasPermissionWithLegacyFallback,
  resolvePermission,
  resolvePermissionMap
} from "../src/utils/permissionResolver.ts";

const principal = {
  adminId: "employee-1",
  companyId: "company-a",
  role: ADMIN_ROLE.EMPLOYEE
};

test("권한이 없으면 안전하게 거부한다", () => {
  const result = resolvePermission(ADMIN_PERMISSION_CODE.PRODUCT_READ, principal, []);

  assert.equal(result.allowed, false);
  assert.equal(result.effect, "deny");
  assert.equal(result.dataScope, null);
});

test("회사·역할·개인 상속은 더 구체적인 규칙을 우선한다", () => {
  const bindings = [
    {
      subject_type: "company",
      subject_id: "company-a",
      permission_code: ADMIN_PERMISSION_CODE.PRODUCT_READ,
      effect: "allow",
      data_scope: ADMIN_PERMISSION_SCOPE.COMPANY
    },
    {
      subject_type: "role",
      subject_id: ADMIN_ROLE.EMPLOYEE,
      permission_code: ADMIN_PERMISSION_CODE.PRODUCT_READ,
      effect: "deny"
    },
    {
      subject_type: "admin",
      subject_id: "employee-1",
      permission_code: ADMIN_PERMISSION_CODE.PRODUCT_READ,
      effect: "allow",
      data_scope: ADMIN_PERMISSION_SCOPE.PERSONAL
    }
  ];

  const result = resolvePermission(ADMIN_PERMISSION_CODE.PRODUCT_READ, principal, bindings);

  assert.equal(result.allowed, true);
  assert.equal(result.dataScope, ADMIN_PERMISSION_SCOPE.PERSONAL);
  assert.equal(result.source.subjectType, "admin");
});

test("같은 수준의 명시적 거부가 허용보다 우선한다", () => {
  const bindings = [
    {
      subject_type: "role",
      subject_id: ADMIN_ROLE.EMPLOYEE,
      permission_code: ADMIN_PERMISSION_CODE.DEPOSIT_VERIFY,
      effect: "allow",
      data_scope: ADMIN_PERMISSION_SCOPE.PERSONAL
    },
    {
      subject_type: "role",
      subject_id: ADMIN_ROLE.EMPLOYEE,
      permission_code: ADMIN_PERMISSION_CODE.DEPOSIT_VERIFY,
      effect: "deny",
      data_scope: ADMIN_PERMISSION_SCOPE.PERSONAL
    }
  ];

  assert.equal(hasPermission(ADMIN_PERMISSION_CODE.DEPOSIT_VERIFY, principal, bindings), false);
});

test("같은 수준에서 허용 범위가 여러 개면 가장 넓은 범위를 사용한다", () => {
  const bindings = [
    {
      subject_type: "company",
      subject_id: "company-a",
      permission_code: ADMIN_PERMISSION_CODE.PRODUCT_READ,
      effect: "allow",
      data_scope: ADMIN_PERMISSION_SCOPE.PERSONAL
    },
    {
      subject_type: "company",
      subject_id: "company-a",
      permission_code: ADMIN_PERMISSION_CODE.PRODUCT_READ,
      effect: "allow",
      data_scope: ADMIN_PERMISSION_SCOPE.COMPANY
    }
  ];

  assert.equal(
    resolvePermission(ADMIN_PERMISSION_CODE.PRODUCT_READ, principal, bindings).dataScope,
    ADMIN_PERMISSION_SCOPE.COMPANY
  );
});

test("여러 권한을 한 번에 계산할 수 있다", () => {
  const map = resolvePermissionMap(
    [ADMIN_PERMISSION_CODE.MENU_DASHBOARD, ADMIN_PERMISSION_CODE.MENU_PRODUCT],
    principal,
    [
      {
        subject_type: "global",
        permission_code: ADMIN_PERMISSION_CODE.MENU_DASHBOARD,
        effect: "allow"
      }
    ]
  );

  assert.equal(map[ADMIN_PERMISSION_CODE.MENU_DASHBOARD].allowed, true);
  assert.equal(map[ADMIN_PERMISSION_CODE.MENU_PRODUCT].allowed, false);
});

test("다른 계정의 명시 binding은 현재 계정의 legacy fallback을 차단하지 않는다", () => {
  assert.equal(
    hasPermissionWithLegacyFallback(
      ADMIN_PERMISSION_CODE.DEPOSIT_VERIFY,
      principal,
      [{
        subject_type: "admin",
        subject_id: "another-admin",
        permission_code: ADMIN_PERMISSION_CODE.DEPOSIT_VERIFY,
        effect: "deny"
      }],
      true
    ),
    true
  );
});
