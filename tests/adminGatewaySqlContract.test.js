import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const edgeFunction = fs.readFileSync(
  path.join(projectRoot, "supabase/functions/admin-gateway/index.ts"),
  "utf8"
);
const adminGateway = fs.readFileSync(
  path.join(projectRoot, "src/services/adminGateway.ts"),
  "utf8"
);
const loginPage = fs.readFileSync(
  path.join(projectRoot, "src/pages/admin/LoginPage.tsx"),
  "utf8"
);
const gatewayMigration = [
  "20260829120000_add_admin_gateway_data_rpcs.sql",
  "20260829180000_optimize_admin_gateway_read_rpcs.sql",
  "20260829200000_optimize_admin_gateway_export_read_rpcs.sql",
  "20260829220000_fix_admin_review_receive_product_bundle_contract.sql"
]
  .map((filename) => fs.readFileSync(path.join(projectRoot, "supabase/migrations", filename), "utf8"))
  .join("\n");
const optimizedGatewayMigration = fs.readFileSync(
  path.join(projectRoot, "supabase/migrations/20260829180000_optimize_admin_gateway_read_rpcs.sql"),
  "utf8"
) + "\n" + fs.readFileSync(
  path.join(projectRoot, "supabase/migrations/20260829200000_optimize_admin_gateway_export_read_rpcs.sql"),
  "utf8"
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readEdgeRpcNames() {
  return [...edgeFunction.matchAll(/rpc:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function readGatewayFunctionBodies() {
  const matches = [...gatewayMigration.matchAll(
    /create\s+or\s+replace\s+function\s+public\.([a-z][a-z0-9_]*)\s*\(/gi
  )];

  return matches.map((match, index) => ({
    name: match[1],
    body: gatewayMigration.slice(match.index, matches[index + 1]?.index ?? gatewayMigration.length)
  }));
}

test("Edge data operation RPC allowlist의 모든 함수가 local gateway migration에 대응한다", () => {
  const rpcNames = readEdgeRpcNames();
  const functionNames = new Set(readGatewayFunctionBodies().map(({ name }) => name));

  assert.ok(rpcNames.length > 0);

  for (const rpcName of rpcNames) {
    assert.ok(functionNames.has(rpcName), `migration에 ${rpcName} 함수가 없습니다.`);
    const escapedName = escapeRegExp(rpcName);
    assert.match(
      gatewayMigration,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${escapedName}\\(`, "i"),
      `${rpcName}의 public execute revoke가 없습니다.`
    );
    assert.match(
      gatewayMigration,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${escapedName}\\([^;]*\\)\\s+to\\s+service_role`, "i"),
      `${rpcName}의 service_role execute grant가 없습니다.`
    );
  }
});

test("gateway SQL 함수는 고정 search_path와 security definer를 사용한다", () => {
  const functions = readGatewayFunctionBodies();

  assert.ok(functions.length > 0);
  for (const { name, body } of functions) {
    assert.match(body, /security\s+definer/i, `${name}이 security definer가 아닙니다.`);
    assert.match(
      body,
      /set\s+search_path\s*=\s*pg_catalog\s*,\s*public/i,
      `${name}의 search_path가 고정되지 않았습니다.`
    );
  }
});

test("gateway SQL은 관리자 데이터 RPC를 public/anon/authenticated에 직접 grant하지 않는다", () => {
  const grantLines = gatewayMigration
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^grant\s+execute\s+on\s+function/i.test(line));

  assert.ok(grantLines.length > 0);
  assert.ok(grantLines.every((line) => /\bto\s+service_role\s*;?$/i.test(line)), grantLines.join("\n"));
  assert.match(gatewayMigration, /revoke\s+all\s+on\s+function[\s\S]*from\s+public,\s*anon,\s*authenticated/i);
});

test("gateway 초안은 legacy RPC 시그니처를 교체하지 않고 actor/resource 검사를 포함한다", () => {
  assert.doesNotMatch(
    gatewayMigration,
    /create\s+or\s+replace\s+function\s+public\.(get_admin_review_receive_product_summaries|get_admin_product_overview_rows|apply_admin_bulk_submission_updates)\s*\(/i
  );
  assert.match(gatewayMigration, /admin_gateway_actor\s*\(/i);
  assert.match(gatewayMigration, /admin_gateway_product_allowed\s*\(/i);
  assert.match(gatewayMigration, /admin_gateway_submission_allowed\s*\(/i);
  assert.match(gatewayMigration, /admin_gateway_validate_payload_keys\s*\(/i);
  assert.match(gatewayMigration, /submission\.deposit\.verify/i);
  assert.match(gatewayMigration, /submission\.depositor_name\.update/i);
});

test("상품 생성만 bundle_id를 권한 검증 후 묶음 연결에 사용하고 상품 수정은 관계 필드를 허용하지 않는다", () => {
  const bundleContractMigration = fs.readFileSync(
    path.join(projectRoot, "supabase/migrations/20260829220000_fix_admin_review_receive_product_bundle_contract.sql"),
    "utf8"
  );

  assert.match(bundleContractMigration, /create\s+or\s+replace\s+function\s+public\.create_admin_review_receive_product/i);
  assert.match(bundleContractMigration, /'bundle_id'/i);
  assert.match(
    bundleContractMigration,
    /admin_gateway_product_allowed\s*\(\s*p_actor_admin_id\s*,\s*v_bundle_anchor_id\s*,\s*'product\.create'/is
  );

  const updateStart = gatewayMigration.search(
    /create\s+or\s+replace\s+function\s+public\.update_admin_review_receive_product\s*\(/i
  );
  assert.notEqual(updateStart, -1);
  const updateBody = gatewayMigration.slice(updateStart, gatewayMigration.indexOf("create or replace function", updateStart + 1));
  assert.doesNotMatch(updateBody, /'bundle_id'/i);
});

test("gateway는 기존 percent-encoded nested action도 복원한다", () => {
  assert.match(edgeFunction, /\["settings\/update", "permissions\/update"\]\.includes\(lastTwo\)/i);
  assert.match(edgeFunction, /return decodeURIComponent\(rawAction\)/i);
  assert.match(edgeFunction, /action === "permissions\/update"/i);
});

test("인증 성공 응답은 rolling session을 갱신하고 실패·logout 응답은 갱신하지 않는다", () => {
  assert.match(edgeFunction, /async function jsonWithRefreshedSession\s*\(/i);
  assert.match(edgeFunction, /"Set-Cookie"\s*:\s*createSessionCookie\(token, request\)/i);

  for (const functionName of [
    "handleAccess",
    "handleData",
    "handleSettings",
    "handleMembers",
    "handleSettingsUpdate",
    "handlePermissionUpdate"
  ]) {
    const functionStart = edgeFunction.indexOf(`async function ${functionName}`);
    assert.notEqual(functionStart, -1, `${functionName} 함수가 없습니다.`);
    const nextFunction = edgeFunction.indexOf("\nasync function ", functionStart + 1);
    const functionBody = edgeFunction.slice(functionStart, nextFunction === -1 ? edgeFunction.length : nextFunction);
    assert.match(functionBody, /jsonWithRefreshedSession\s*\(/, `${functionName}이 rolling session을 갱신하지 않습니다.`);
  }

  const errorStart = edgeFunction.indexOf("function errorResponse");
  const errorEnd = edgeFunction.indexOf("\nasync function ", errorStart + 1);
  assert.doesNotMatch(
    edgeFunction.slice(errorStart, errorEnd),
    /createSessionCookie\s*\(/,
    "실패 응답은 세션을 갱신하면 안 됩니다."
  );
  assert.match(edgeFunction, /async function handleLogout[\s\S]*?clearSessionCookie\(request\)/i);
});

test("세션 만료 응답은 쿠키를 삭제하고 프론트는 보호 요청 401에서 재로그인으로 이동한다", () => {
  assert.match(edgeFunction, /const SESSION_TTL_SECONDS = 3 \* 60 \* 60/i);
  assert.match(
    edgeFunction,
    /shouldClearSession[\s\S]*?SESSION_REQUIRED[\s\S]*?SESSION_EXPIRED[\s\S]*?clearSessionCookie\(request\)/i
  );
  assert.match(adminGateway, /SESSION_EXPIRY_ALERT\s*=\s*"인증 시간이 만료되어 재 로그인이 필요합니다\."/i);
  assert.match(adminGateway, /clearClientAdminSession\s*\(\)/i);
  assert.match(adminGateway, /setSessionStorageValue\(ADMIN_SESSION_EXPIRY_STORAGE_KEY,\s*"true"\)/i);
  assert.doesNotMatch(adminGateway, /window\.alert\s*\(/i);
  assert.match(adminGateway, /window\.location\.replace\("\/admin\/login"\)/i);
  assert.match(loginPage, /AppAlertDialog/i);
  assert.match(loginPage, /ADMIN_SESSION_EXPIRY_STORAGE_KEY/i);
  assert.match(loginPage, /SESSION_EXPIRY_ALERT/i);
  assert.match(
    adminGateway,
    /normalizedAction !== "login"[\s\S]*?normalizedAction !== "logout"[\s\S]*?response\.status === 401/i
  );
});

test("대용량 gateway read RPC는 행별 permission 재계산 대신 manager scope 배열을 재사용한다", () => {
  assert.match(optimizedGatewayMigration, /admin_gateway_allowed_manager_ids\s*\(/i);

  for (const functionName of [
    "admin_gateway_get_products",
    "get_admin_review_receive_product_summaries_gateway",
    "get_admin_dashboard_data",
    "get_admin_export_data",
    "get_admin_photo_export_data"
  ]) {
    const functionStart = optimizedGatewayMigration.search(
      new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\(`, "i")
    );
    assert.notEqual(functionStart, -1, `${functionName} 최적화 정의가 없습니다.`);
    const functionBody = optimizedGatewayMigration.slice(functionStart);
    assert.match(functionBody, /admin_gateway_allowed_manager_ids\s*\(/i, `${functionName}이 scope 배열을 계산하지 않습니다.`);
    assert.doesNotMatch(functionBody, /admin_gateway_(product|submission)_allowed\s*\(/i, `${functionName}이 행별 권한 함수를 반복 호출합니다.`);
  }
});
