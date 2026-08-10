import assert from "node:assert/strict";
import test from "node:test";
import {
  getFallbackAdminCapabilities,
  isAdminCapabilitiesColumnError,
  normalizeAdminCapabilities
} from "../src/utils/adminCapabilities.js";

test("관리자 capability fallback은 현재 계정별 기본값을 유지한다", () => {
  assert.deepEqual(getFallbackAdminCapabilities("hyejin2054"), {
    includeCompanyDataInclude: true,
    canVerifyDeposit: true
  });
  assert.deepEqual(getFallbackAdminCapabilities("aram2525"), {
    includeCompanyDataInclude: false,
    canVerifyDeposit: false
  });
  assert.deepEqual(getFallbackAdminCapabilities("unknown-admin"), {
    includeCompanyDataInclude: false,
    canVerifyDeposit: true
  });
});

test("DB capability 값은 boolean일 때만 fallback을 덮어쓴다", () => {
  assert.deepEqual(
    normalizeAdminCapabilities("hyejin2054", {
      include_company_data_include: false,
      can_verify_deposit: false
    }),
    {
      includeCompanyDataInclude: false,
      canVerifyDeposit: false
    }
  );
  assert.deepEqual(
    normalizeAdminCapabilities("aram2525", {
      include_company_data_include: true,
      can_verify_deposit: null
    }),
    {
      includeCompanyDataInclude: true,
      canVerifyDeposit: false
    }
  );
});

test("capability 컬럼 오류만 레거시 fallback 대상으로 판별한다", () => {
  assert.equal(isAdminCapabilitiesColumnError({ code: "42703" }), true);
  assert.equal(isAdminCapabilitiesColumnError({ code: "PGRST204" }), true);
  assert.equal(isAdminCapabilitiesColumnError({ message: "column can_verify_deposit does not exist" }), true);
  assert.equal(isAdminCapabilitiesColumnError({ code: "42501", message: "permission denied" }), false);
});
