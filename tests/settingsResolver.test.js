import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ROLE,
  ADMIN_SETTING_KEY
} from "../src/constants/adminAccess.ts";
import {
  normalizeSettingValue,
  resolveSettingValue,
  validateSettingForScope
} from "../src/utils/settingsResolver.ts";

const principal = {
  adminId: "employee-1",
  companyId: "company-a",
  role: ADMIN_ROLE.EMPLOYEE
};

test("회사 → 역할 → 개인 override 순서로 설정을 상속한다", () => {
  const result = resolveSettingValue(ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH, {
    principal,
    values: [
      {
        setting_key: ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
        scope_type: "company",
        scope_id: "company-a",
        value: 3
      },
      {
        setting_key: ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
        scope_type: "role",
        scope_id: ADMIN_ROLE.EMPLOYEE,
        value: 4
      },
      {
        setting_key: ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
        scope_type: "admin",
        scope_id: "employee-1",
        value: 2
      }
    ]
  });

  assert.equal(result.value, 2);
  assert.equal(result.source, "admin");
  assert.equal(result.hasOverride, true);
});

test("개인 override 행을 제거하면 회사 기본값으로 돌아간다", () => {
  const result = resolveSettingValue(ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH, {
    principal,
    values: [
      {
        setting_key: ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
        scope_type: "company",
        scope_id: "company-a",
        value: 3
      }
    ]
  });

  assert.equal(result.value, 3);
  assert.equal(result.source, "company");
  assert.equal(result.hasOverride, true);
});

test("현재 입력값은 저장된 기본값보다 우선하지만 저장된 값은 바꾸지 않는다", () => {
  const result = resolveSettingValue(ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH, {
    principal,
    values: [
      {
        setting_key: ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
        scope_type: "company",
        scope_id: "company-a",
        value: 3
      }
    ],
    currentValue: 5
  });

  assert.equal(result.value, 5);
  assert.equal(result.source, "current");
});

test("회사명 자르기는 0~100 정수만 허용하고 초과값은 오류다", () => {
  assert.deepEqual(
    normalizeSettingValue(ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH, 0),
    { ok: true, value: 0, errorCode: null, errorMessage: "" }
  );
  assert.equal(
    normalizeSettingValue(ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH, 101).errorCode,
    "SETTING_MAX"
  );
  assert.equal(
    normalizeSettingValue(ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH, -1).errorCode,
    "SETTING_MIN"
  );
  assert.equal(
    normalizeSettingValue(ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH, "abc").errorCode,
    "SETTING_INTEGER"
  );
});

test("설정 범위와 선택형 값도 서비스 경계에서 검증한다", () => {
  assert.equal(
    validateSettingForScope(
      ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
      3,
      "admin"
    ).errorCode,
    "SETTING_SCOPE_FORBIDDEN"
  );
  assert.equal(
    validateSettingForScope(
      ADMIN_SETTING_KEY.PRODUCT_FEE_DEPOSIT_PARTY,
      "company",
      "company"
    ).ok,
    true
  );
  assert.equal(
    validateSettingForScope(
      ADMIN_SETTING_KEY.PRODUCT_FEE_DEPOSIT_PARTY,
      "invalid",
      "company"
    ).errorCode,
    "SETTING_ENUM"
  );
});
