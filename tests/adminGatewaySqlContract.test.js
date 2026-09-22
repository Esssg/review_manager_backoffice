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
const reviewReceivePage = fs.readFileSync(
  path.join(projectRoot, "src/pages/admin/AdminReviewReceivePage.tsx"),
  "utf8"
);
const reviewReceiveProductList = fs.readFileSync(
  path.join(projectRoot, "src/components/admin/review-receive/ReviewReceiveProductList.tsx"),
  "utf8"
);
const productOverviewPage = fs.readFileSync(
  path.join(projectRoot, "src/pages/admin/AdminProductOverviewPage.tsx"),
  "utf8"
);
const adminProductsService = fs.readFileSync(
  path.join(projectRoot, "src/services/adminProducts.ts"),
  "utf8"
);
const productOverviewService = fs.readFileSync(
  path.join(projectRoot, "src/services/productOverview.ts"),
  "utf8"
);
const gatewayMigration = [
  "20260829120000_add_admin_gateway_data_rpcs.sql",
  "20260829180000_optimize_admin_gateway_read_rpcs.sql",
  "20260829200000_optimize_admin_gateway_export_read_rpcs.sql",
  "20260829220000_fix_admin_review_receive_product_bundle_contract.sql",
  "20260901120000_fix_admin_scope_filters_photo_bulk.sql",
  "20260902090000_add_admin_review_receive_product_reviewer_bulk.sql",
  "20260902120000_fix_review_receive_detail_photo_preview.sql",
  "20260903100000_fix_admin_review_receive_product_reviewer_bulk_bundle.sql",
  "20260903120000_add_server_side_sorting.sql"
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

test("상품·리뷰어 bulk RPC는 500행 원자성·빈 상품 재사용·service role 경계를 선언한다", () => {
  assert.match(edgeFunction, /review_receive\.product_reviewer\.bulk_v2/);
  assert.match(gatewayMigration, /create\s+or\s+replace\s+function\s+public\.create_admin_review_receive_product_reviewer_bulk_v2\s*\(/i);
  assert.match(gatewayMigration, /reusable_product_id/i);
  assert.match(gatewayMigration, /target_bundle_id/i);
  assert.match(gatewayMigration, /v_target_bundle_id/i);
  assert.match(gatewayMigration, /admin_gateway_insert_submission\s*\(/i);
  assert.match(gatewayMigration, /최대\s+500행/i);
  assert.match(gatewayMigration, /v_chunk_size\s+integer\s*:=\s*50/i);
  assert.match(gatewayMigration, /with\s+ordinality/i);
  assert.match(gatewayMigration, /'partial',\s*false/i);
  assert.match(gatewayMigration, /revoke\s+all\s+on\s+function\s+public\.create_admin_review_receive_product_reviewer_bulk_v2\(/i);
  assert.match(gatewayMigration, /grant\s+execute\s+on\s+function\s+public\.create_admin_review_receive_product_reviewer_bulk_v2\([^;]*\)\s+to\s+service_role/i);
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
  assert.match(edgeFunction, /\["settings\/update", "permissions\/update"(?:, "permissions\/update-pair")?\]\.includes\(lastTwo\)/i);
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
    "handlePermissionUpdate",
    "handlePermissionPairUpdate"
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

test("목록 검색의 manager_id는 신원 제거 대상과 구분해 gateway RPC까지 전달한다", () => {
  assert.match(edgeFunction, /MANAGER_FILTER_OPERATIONS\s*=\s*new Set\s*\(/i);
  assert.match(edgeFunction, /review_receive\.list/i);
  assert.match(edgeFunction, /product_overview\.list/i);
  assert.match(edgeFunction, /inFilterObject/i);
  assert.match(
    edgeFunction,
    /preserveManagerFilter:\s*MANAGER_FILTER_OPERATIONS\.has\(operation\)/i
  );
  assert.match(adminProductsService, /p_filters:\s*options\.filters/i);
  assert.match(productOverviewService, /p_filters:\s*options\.filters/i);
  assert.match(
    gatewayMigration,
    /normalize_review_receive_filter_text\(coalesce\(p_filters,\s*'\{\}'::jsonb\)\s*->>\s*'manager_id'\)/i
  );
  assert.match(
    gatewayMigration,
    /normalize_product_overview_filter_text\(coalesce\(p_filters,\s*'\{\}'::jsonb\)\s*->>\s*'manager_id'\)/i
  );
});

test("필터 재조회 중에도 목록 표 shell과 입력 상태를 유지한다", () => {
  assert.match(reviewReceivePage, /hasLoadedProductList/);
  assert.match(reviewReceiveProductList, /!isLoading\s*\|\|\s*hasLoadedOnce/);
  assert.match(productOverviewPage, /hasLoadedOverview/);
  assert.match(productOverviewPage, /rows\.length\s*>\s*0\s*\|\|\s*hasActiveFilters/);
  assert.doesNotMatch(
    productOverviewPage,
    /!isLoading\s*&&\s*!errorMessage\s*&&\s*shouldRenderOverviewSection/
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

test("목록 정렬 RPC는 화면별 allowlist와 opaque keyset cursor 계약을 사용한다", () => {
  assert.match(edgeFunction, /review_receive\.list\.sorted/);
  assert.match(edgeFunction, /product_overview\.list\.sorted/);
  assert.match(edgeFunction, /SORTED_LIST_OPERATION_KEYS/);
  assert.match(edgeFunction, /validateSortedListPayload\(operation, payload\)/);
  assert.match(gatewayMigration, /admin_gateway_validate_list_sort\s*\(/i);
  assert.match(gatewayMigration, /admin_gateway_list_sort_after\s*\(/i);
  assert.match(gatewayMigration, /admin_gateway_build_list_sort_cursor\s*\(/i);
  assert.doesNotMatch(gatewayMigration, /max\s*\(\s*to_jsonb\s*\(\s*limited_rows\s*\)\s*\)/i);
  assert.match(gatewayMigration, /admin_gateway_list_sort_order_sql\s*\(/i);
  assert.match(gatewayMigration, /get_admin_review_receive_product_summaries_gateway_v2\s*\(/i);
  assert.match(gatewayMigration, /get_admin_product_overview_rows_gateway_v2\s*\(/i);
  assert.match(gatewayMigration, /p_force_personal_scope/i);
  assert.match(gatewayMigration, /'review_photos'/i);
  assert.match(gatewayMigration, /'is_review_verified'/i);
  assert.match(
    gatewayMigration,
    /filtered_rows\s+as\s*\(\s*select\s+status_rows\.\*,\s*count\(\*\)\s+over\(\)\s+as\s+total_count/i
  );
  assert.match(
    gatewayMigration,
    /filtered_rows\s+as\s*\(\s*select\s+base_rows\.\*,\s*count\(\*\)\s+over\(\)\s+as\s+total_count/i
  );
  assert.match(gatewayMigration, /revoke\s+all\s+on\s+function\s+public\.get_admin_product_overview_rows_gateway_v2\(/i);
});
