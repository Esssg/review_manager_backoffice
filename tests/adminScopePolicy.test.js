import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_SCOPE_POLICY,
  getAdminScopePolicy,
  includesAdminScopeCompanyData,
  resolveAdminScopePolicy
} from "../src/constants/adminScope.ts";

test("사용자 토글은 개인/회사 scope policy로 변환된다", () => {
  assert.equal(getAdminScopePolicy(false), ADMIN_SCOPE_POLICY.PERSONAL);
  assert.equal(getAdminScopePolicy(true), ADMIN_SCOPE_POLICY.COMPANY);
  assert.equal(includesAdminScopeCompanyData(ADMIN_SCOPE_POLICY.PERSONAL), false);
  assert.equal(includesAdminScopeCompanyData(ADMIN_SCOPE_POLICY.COMPANY), true);
});

test("고정 feature policy는 토글 값보다 우선해 현재 회사 범위를 유지한다", () => {
  assert.equal(
    resolveAdminScopePolicy({ scopePolicy: ADMIN_SCOPE_POLICY.REVIEW_RECEIVE_DETAIL, includeCompanyData: false }),
    ADMIN_SCOPE_POLICY.REVIEW_RECEIVE_DETAIL
  );
  assert.equal(
    resolveAdminScopePolicy({ scopePolicy: ADMIN_SCOPE_POLICY.BULK_EDIT, includeCompanyData: false }),
    ADMIN_SCOPE_POLICY.BULK_EDIT
  );
  assert.equal(includesAdminScopeCompanyData(ADMIN_SCOPE_POLICY.REVIEW_RECEIVE_DETAIL), true);
  assert.equal(includesAdminScopeCompanyData(ADMIN_SCOPE_POLICY.BULK_EDIT), true);
});

test("알 수 없는 policy는 안전한 토글 기준으로 되돌아간다", () => {
  assert.equal(resolveAdminScopePolicy({ scopePolicy: "unknown", includeCompanyData: false }), ADMIN_SCOPE_POLICY.PERSONAL);
  assert.equal(resolveAdminScopePolicy({ scopePolicy: "unknown", includeCompanyData: true }), ADMIN_SCOPE_POLICY.COMPANY);
});
