import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_MENU_NUMBER,
  getAdminScopedStorageKey,
  getAdminMenuItemByNumber,
  getAdminMenuItemByPathname
} from "../src/constants/admin.ts";

test("관리자 상위·하위 경로는 동일한 메뉴 권한 번호로 매핑된다", () => {
  const cases = [
    ["/admin", ADMIN_MENU_NUMBER.DASHBOARD],
    ["/admin/product/84", ADMIN_MENU_NUMBER.PRODUCT],
    ["/admin/review-receive/completed", ADMIN_MENU_NUMBER.REVIEW_RECEIVE],
    ["/admin/product-overview/status", ADMIN_MENU_NUMBER.PRODUCT_OVERVIEW],
    ["/admin/export/by-date", ADMIN_MENU_NUMBER.EXPORT],
    ["/admin/file-upload", ADMIN_MENU_NUMBER.FILE_UPLOAD],
    ["/admin/bulk-edit", ADMIN_MENU_NUMBER.BULK_EDIT]
  ];

  for (const [pathname, menuNumber] of cases) {
    assert.equal(getAdminMenuItemByPathname(pathname)?.menuNumber, menuNumber, pathname);
    assert.equal(getAdminMenuItemByNumber(menuNumber)?.menuNumber, menuNumber);
  }
});

test("설정·공개 경로는 관리자 메뉴 권한 경계에 포함되지 않는다", () => {
  assert.equal(getAdminMenuItemByPathname("/admin/setting"), null);
  assert.equal(getAdminMenuItemByPathname("/review/84"), null);
  assert.equal(getAdminMenuItemByPathname("/"), null);
});

test("개인 화면 상태 storage key는 관리자 계정별로 분리된다", () => {
  assert.equal(
    getAdminScopedStorageKey("review_manager_export_columns", "employee-1"),
    "review_manager_export_columns:employee-1"
  );
  assert.notEqual(
    getAdminScopedStorageKey("review_manager_export_columns", "employee-1"),
    getAdminScopedStorageKey("review_manager_export_columns", "employee-2")
  );
});
