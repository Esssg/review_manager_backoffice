// @ts-nocheck

/**
 * 권한과 설정의 저장 계약에서 사용하는 도메인 값이다.
 * 메뉴 번호/route 문자열은 기존 admin.ts 계약을 그대로 유지하고,
 * 아래 코드는 서버·클라이언트가 함께 사용할 수 있는 안정적인 식별자로 둔다.
 */
export const ADMIN_ROLE = Object.freeze({
  DEVELOPER: "developer",
  COMPANY_ADMIN: "company_admin",
  EMPLOYEE: "employee"
});

export const ADMIN_PERMISSION_EFFECT = Object.freeze({
  ALLOW: "allow",
  DENY: "deny"
});

export const ADMIN_PERMISSION_SCOPE = Object.freeze({
  PERSONAL: "personal",
  COMPANY: "company",
  ALL: "all"
});

export const ADMIN_PERMISSION_SUBJECT = Object.freeze({
  GLOBAL: "global",
  COMPANY: "company",
  ROLE: "role",
  ADMIN: "admin"
});

export const ADMIN_PERMISSION_CODE = Object.freeze({
  MENU_DASHBOARD: "menu.dashboard",
  MENU_PRODUCT: "menu.product",
  MENU_REVIEW_RECEIVE: "menu.review_receive",
  MENU_PRODUCT_OVERVIEW: "menu.product_overview",
  MENU_EXPORT: "menu.export",
  MENU_FILE_UPLOAD: "menu.file_upload",
  MENU_BULK_EDIT: "menu.bulk_edit",
  PRODUCT_READ: "product.read",
  PRODUCT_CREATE: "product.create",
  PRODUCT_UPDATE: "product.update",
  PRODUCT_DELETE: "product.delete",
  PRODUCT_STEP_READ: "product_step.read",
  PRODUCT_STEP_CREATE: "product_step.create",
  PRODUCT_STEP_UPDATE: "product_step.update",
  PRODUCT_STEP_DELETE: "product_step.delete",
  APPLICATION_READ: "application.read",
  APPLICATION_CREATE: "application.create",
  APPLICATION_UPDATE: "application.update",
  APPLICATION_DELETE: "application.delete",
  APPLICATION_CONFIRM: "application.confirm",
  SUBMISSION_READ: "submission.read",
  SUBMISSION_CREATE: "submission.create",
  SUBMISSION_UPDATE: "submission.update",
  SUBMISSION_DELETE: "submission.delete",
  DEPOSIT_VERIFY: "submission.deposit.verify",
  DEPOSITOR_NAME_UPDATE: "submission.depositor_name.update",
  PHOTO_READ: "submission.photo.read",
  PHOTO_UPLOAD: "submission.photo.upload",
  PHOTO_DELETE: "submission.photo.delete",
  EXPORT_EXECUTE: "export.execute",
  BULK_EDIT_EXECUTE: "bulk_edit.execute",
  ADMIN_MEMBER_READ: "admin_member.read",
  ADMIN_PERMISSION_UPDATE: "admin_permission.update",
  COMPANY_SETTING_READ: "company_setting.read",
  COMPANY_SETTING_UPDATE: "company_setting.update",
  PERSONAL_SETTING_READ: "personal_setting.read",
  PERSONAL_SETTING_UPDATE: "personal_setting.update",
  AUDIT_READ: "audit.read"
});

export const ADMIN_SETTING_KEY = Object.freeze({
  COMPANY_NAME_TRIM_LENGTH: "company_name_trim_length",
  PRODUCT_FEE_DEPOSIT_PARTY: "product_fee_deposit_party",
  REVIEW_FEE_DEPOSIT_PARTY: "review_fee_deposit_party",
  REVIEW_FEE_DEFAULT_AMOUNT: "review_fee_default_amount",
  REVIEW_TYPE_DEFAULT: "review_type_default",
  REAL_SHIPPING_DEFAULT: "real_shipping_default",
  DASHBOARD_PERIOD: "dashboard_period",
  REVIEW_RECEIVE_TAB: "review_receive_tab",
  REVIEW_RECEIVE_SCOPE: "review_receive_scope",
  EXPORT_COLUMNS: "export_columns",
  SIDEBAR_COLLAPSED: "sidebar_collapsed"
});

const integerDefinition = (key, label, options = {}) => ({
  key,
  label,
  valueType: "integer",
  unit: options.unit ?? null,
  minValue: options.minValue ?? null,
  maxValue: options.maxValue ?? null,
  defaultValue: options.defaultValue ?? null,
  nullable: options.nullable ?? false,
  allowedScopes: options.allowedScopes ?? ["company", "role", "admin"],
  applicableRoles: options.applicableRoles ?? [
    ADMIN_ROLE.DEVELOPER,
    ADMIN_ROLE.COMPANY_ADMIN,
    ADMIN_ROLE.EMPLOYEE
  ]
});

const enumDefinition = (key, label, allowedValues, options = {}) => ({
  key,
  label,
  valueType: "enum",
  unit: options.unit ?? null,
  allowedValues,
  defaultValue: options.defaultValue ?? null,
  nullable: options.nullable ?? false,
  allowedScopes: options.allowedScopes ?? ["company", "role", "admin"],
  applicableRoles: options.applicableRoles ?? [
    ADMIN_ROLE.DEVELOPER,
    ADMIN_ROLE.COMPANY_ADMIN,
    ADMIN_ROLE.EMPLOYEE
  ]
});

/**
 * 설정 정의는 DB settings_definitions의 seed와 같은 구조를 사용한다.
 * 현재 코드/운영 데이터에서 근거를 확인하지 못한 값은 null로 두어
 * 임의의 업무 기본값을 새로 만들지 않는다.
 */
export const ADMIN_SETTING_DEFINITIONS = Object.freeze([
  integerDefinition(
    ADMIN_SETTING_KEY.COMPANY_NAME_TRIM_LENGTH,
    "예정 입금자명 회사명 자르기",
    { unit: "characters", minValue: 0, maxValue: 100, defaultValue: 0, allowedScopes: ["company"] }
  ),
  enumDefinition(
    ADMIN_SETTING_KEY.PRODUCT_FEE_DEPOSIT_PARTY,
    "제품비 입금구분 기본값",
    ["self", "company"],
    { allowedScopes: ["company", "role", "admin"] }
  ),
  enumDefinition(
    ADMIN_SETTING_KEY.REVIEW_FEE_DEPOSIT_PARTY,
    "리뷰비 입금구분 기본값",
    ["self", "company"],
    { allowedScopes: ["company", "role", "admin"] }
  ),
  integerDefinition(
    ADMIN_SETTING_KEY.REVIEW_FEE_DEFAULT_AMOUNT,
    "리뷰비 기본 금액",
    { unit: "KRW", minValue: 0, nullable: true, allowedScopes: ["company", "role", "admin"] }
  ),
  {
    key: ADMIN_SETTING_KEY.REVIEW_TYPE_DEFAULT,
    label: "리뷰형태 기본값",
    valueType: "string",
    unit: null,
    defaultValue: null,
    nullable: true,
    allowedScopes: ["company", "role", "admin"],
    applicableRoles: [ADMIN_ROLE.DEVELOPER, ADMIN_ROLE.COMPANY_ADMIN, ADMIN_ROLE.EMPLOYEE]
  },
  {
    key: ADMIN_SETTING_KEY.REAL_SHIPPING_DEFAULT,
    label: "실배송 여부 기본값",
    valueType: "boolean",
    unit: null,
    defaultValue: null,
    nullable: true,
    allowedScopes: ["company", "role", "admin"],
    applicableRoles: [ADMIN_ROLE.DEVELOPER, ADMIN_ROLE.COMPANY_ADMIN, ADMIN_ROLE.EMPLOYEE]
  },
  {
    key: ADMIN_SETTING_KEY.DASHBOARD_PERIOD,
    label: "대시보드 초기 기간",
    valueType: "json",
    unit: null,
    defaultValue: null,
    nullable: true,
    allowedScopes: ["admin"],
    applicableRoles: [ADMIN_ROLE.DEVELOPER, ADMIN_ROLE.COMPANY_ADMIN, ADMIN_ROLE.EMPLOYEE]
  },
  {
    key: ADMIN_SETTING_KEY.REVIEW_RECEIVE_TAB,
    label: "리뷰받기 초기 탭",
    valueType: "string",
    unit: null,
    defaultValue: null,
    nullable: true,
    allowedScopes: ["admin"],
    applicableRoles: [ADMIN_ROLE.DEVELOPER, ADMIN_ROLE.COMPANY_ADMIN, ADMIN_ROLE.EMPLOYEE]
  },
  {
    key: ADMIN_SETTING_KEY.REVIEW_RECEIVE_SCOPE,
    label: "리뷰받기 초기 범위",
    valueType: "string",
    unit: null,
    defaultValue: null,
    nullable: true,
    allowedScopes: ["admin"],
    applicableRoles: [ADMIN_ROLE.DEVELOPER, ADMIN_ROLE.COMPANY_ADMIN, ADMIN_ROLE.EMPLOYEE]
  },
  {
    key: ADMIN_SETTING_KEY.EXPORT_COLUMNS,
    label: "내보내기 컬럼 선택",
    valueType: "json",
    unit: null,
    defaultValue: null,
    nullable: true,
    allowedScopes: ["admin"],
    applicableRoles: [ADMIN_ROLE.DEVELOPER, ADMIN_ROLE.COMPANY_ADMIN, ADMIN_ROLE.EMPLOYEE]
  },
  {
    key: ADMIN_SETTING_KEY.SIDEBAR_COLLAPSED,
    label: "사이드바 접힘 상태",
    valueType: "boolean",
    unit: null,
    defaultValue: false,
    nullable: false,
    allowedScopes: ["admin"],
    applicableRoles: [ADMIN_ROLE.DEVELOPER, ADMIN_ROLE.COMPANY_ADMIN, ADMIN_ROLE.EMPLOYEE]
  }
]);

export function getAdminSettingDefinition(key) {
  return ADMIN_SETTING_DEFINITIONS.find((definition) => definition.key === key) ?? null;
}

export function getPermissionCodeForMenuNumber(menuNumber) {
  const menuCodeByNumber = {
    1: ADMIN_PERMISSION_CODE.MENU_DASHBOARD,
    2: ADMIN_PERMISSION_CODE.MENU_PRODUCT,
    3: ADMIN_PERMISSION_CODE.MENU_REVIEW_RECEIVE,
    4: ADMIN_PERMISSION_CODE.MENU_PRODUCT_OVERVIEW,
    5: ADMIN_PERMISSION_CODE.MENU_EXPORT,
    6: ADMIN_PERMISSION_CODE.MENU_FILE_UPLOAD,
    7: ADMIN_PERMISSION_CODE.MENU_BULK_EDIT
  };

  return menuCodeByNumber[Number(menuNumber)] ?? null;
}
