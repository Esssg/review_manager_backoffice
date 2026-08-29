import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const migration = fs.readFileSync(
  path.join(projectRoot, "supabase/migrations/20260829150000_backfill_admin_resource_permission_bindings.sql"),
  "utf8"
);

const requiredPermissionCodes = [
  "product.read",
  "product.create",
  "product.update",
  "product.delete",
  "product_step.read",
  "product_step.create",
  "product_step.update",
  "product_step.delete",
  "application.read",
  "application.create",
  "application.update",
  "application.delete",
  "application.confirm",
  "submission.read",
  "submission.create",
  "submission.update",
  "submission.delete",
  "submission.deposit.verify",
  "submission.depositor_name.update",
  "submission.photo.read",
  "submission.photo.upload",
  "submission.photo.delete",
  "export.execute",
  "bulk_edit.execute"
];

test("Q49 backfill은 실제 admin_menu_permissions와 활성 계정에서 binding을 산출한다", () => {
  assert.match(migration, /public\.admin_menu_permissions/i);
  assert.match(migration, /from\s+public\.admins/i);
  assert.match(migration, /coalesce\(admins\.is_active,\s*true\)\s*=\s*true/i);
  assert.match(migration, /subject_type\s*=\s*'admin'/i);
  assert.match(migration, /on\s+conflict\s*\([^)]*permission_code[^)]*\)\s+do\s+nothing/i);
});

test("Q49 backfill은 정의된 resource-action을 빠짐없이 명시한다", () => {
  for (const permissionCode of requiredPermissionCodes) {
    assert.match(
      migration,
      new RegExp(`['"]${permissionCode.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}['"]`),
      `${permissionCode} backfill이 없습니다.`
    );
  }
});

test("Q49 backfill은 역할별 데이터 범위를 all/company/personal로 제한한다", () => {
  assert.match(migration, /when\s+'developer'\s+then\s+'all'/i);
  assert.match(migration, /when\s+'company_admin'\s+then\s+'company'/i);
  assert.match(migration, /else\s+'personal'/i);
  assert.match(migration, /admins\.can_verify_deposit/i);
  assert.match(migration, /'submission\.deposit\.verify'[^;]*'deny'/is);
  assert.match(migration, /'submission\.depositor_name\.update'[^;]*'deny'/is);
});

test("Q49 backfill은 destructive SQL이나 기존 admin binding 덮어쓰기를 사용하지 않는다", () => {
  assert.doesNotMatch(migration, /\b(delete|truncate|drop)\s+(from|table|schema|function)?/i);
  assert.match(migration, /not\s+exists\s*\([\s\S]*existing\.subject_type\s*=\s*'admin'/i);
  assert.doesNotMatch(migration, /on\s+conflict[\s\S]*do\s+update/i);
});
