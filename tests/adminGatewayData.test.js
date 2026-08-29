import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_SCOPE_POLICY } from "../src/constants/adminScope.ts";
import {
  ADMIN_GATEWAY_OPERATION,
  buildGatewayScope,
  omitClientIdentity,
  omitManagerIdentity
} from "../src/services/adminGatewayData.ts";
import { encodeAdminGatewayActionPath as encodeRequestActionPath } from "../src/services/adminGateway.ts";

test("nested gateway action path는 slash를 보존하면서 segment만 인코딩한다", () => {
  assert.equal(encodeRequestActionPath("permissions/update"), "permissions/update");
  assert.equal(encodeRequestActionPath("settings/update"), "settings/update");
  assert.equal(encodeRequestActionPath("data"), "data");
  assert.equal(encodeRequestActionPath("custom action/value"), "custom%20action/value");
});

test("관리자 데이터 operation은 고정된 dot-name allowlist를 사용한다", () => {
  const operations = Object.values(ADMIN_GATEWAY_OPERATION);

  assert.ok(operations.length > 0);
  assert.equal(new Set(operations).size, operations.length);
  assert.ok(operations.every((operation) => /^[a-z]+(?:_[a-z]+)*(?:\.[a-z]+(?:_[a-z]+)*)*$/.test(operation)));
});

test("gateway payload의 client identity는 중첩 객체에서도 제거된다", () => {
  const payload = {
    adminId: "browser-admin",
    p_admin_id: "spoofed-admin",
    manager_id: "manager-a",
    nested: [
      {
        actor_admin_id: "spoofed-actor",
        managerId: "manager-b",
        value: "kept"
      }
    ]
  };

  assert.deepEqual(omitClientIdentity(payload), {
    manager_id: "manager-a",
    nested: [{ managerId: "manager-b", value: "kept" }]
  });
  assert.deepEqual(omitManagerIdentity(payload), {
    nested: [{ value: "kept" }]
  });
  assert.equal(payload.adminId, "browser-admin");
  assert.equal(payload.nested[0].managerId, "manager-b");
});

test("gateway scope는 UI 호환 adminId와 서버 계산 표시를 구분한다", () => {
  const scope = buildGatewayScope("browser-admin", {
    adminProfile: {
      companyId: 42,
      company: "예시회사",
      role: "employee"
    },
    scopePolicy: ADMIN_SCOPE_POLICY.COMPANY
  });

  assert.equal(scope.adminId, "browser-admin");
  assert.deepEqual(scope.managerIds, []);
  assert.equal(scope.companyId, 42);
  assert.equal(scope.includeCompanyData, true);
  assert.equal(scope.isServerResolved, true);
});
