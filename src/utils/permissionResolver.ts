// @ts-nocheck

import {
  ADMIN_PERMISSION_EFFECT,
  ADMIN_PERMISSION_SCOPE,
  ADMIN_PERMISSION_SUBJECT
} from "@/constants/adminAccess";

const SUBJECT_SPECIFICITY = Object.freeze({
  [ADMIN_PERMISSION_SUBJECT.GLOBAL]: 0,
  [ADMIN_PERMISSION_SUBJECT.COMPANY]: 10,
  [ADMIN_PERMISSION_SUBJECT.ROLE]: 20,
  [ADMIN_PERMISSION_SUBJECT.ADMIN]: 30
});

const SCOPE_SPECIFICITY = Object.freeze({
  [ADMIN_PERMISSION_SCOPE.PERSONAL]: 0,
  [ADMIN_PERMISSION_SCOPE.COMPANY]: 10,
  [ADMIN_PERMISSION_SCOPE.ALL]: 20
});

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeSubjectType(value) {
  const normalized = normalizeText(value)?.toLowerCase();

  if (normalized === "personal" || normalized === "admin" || normalized === "user") {
    return ADMIN_PERMISSION_SUBJECT.ADMIN;
  }

  if (normalized === "company" || normalized === "organization") {
    return ADMIN_PERMISSION_SUBJECT.COMPANY;
  }

  if (normalized === "role") {
    return ADMIN_PERMISSION_SUBJECT.ROLE;
  }

  if (normalized === "global" || normalized === "default" || normalized === "") {
    return ADMIN_PERMISSION_SUBJECT.GLOBAL;
  }

  return null;
}

function normalizeEffect(value) {
  const normalized = normalizeText(value)?.toLowerCase();
  return normalized === ADMIN_PERMISSION_EFFECT.ALLOW || normalized === ADMIN_PERMISSION_EFFECT.DENY
    ? normalized
    : null;
}

function normalizeDataScope(value) {
  const normalized = normalizeText(value)?.toLowerCase();
  return Object.values(ADMIN_PERMISSION_SCOPE).includes(normalized)
    ? normalized
    : ADMIN_PERMISSION_SCOPE.PERSONAL;
}

/**
 * DB row(snake_case)와 서버 gateway 응답(camelCase)을 동일한 판정 입력으로 변환한다.
 */
export function normalizePermissionBinding(row, index = 0) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const permissionCode = normalizeText(
    row.permission_code ?? row.permissionCode ?? row.code
  );
  const effect = normalizeEffect(row.effect ?? row.permission_effect ?? row.permissionEffect);
  const subjectType = normalizeSubjectType(
    row.subject_type ?? row.subjectType ?? row.target_type ?? row.targetType
  );

  if (!permissionCode || !effect || !subjectType) {
    return null;
  }

  const subjectId = normalizeText(
    row.subject_id ?? row.subjectId ?? row.target_id ?? row.targetId
  );
  const companyId = normalizeText(row.company_id ?? row.companyId);
  const role = normalizeText(row.role);

  return {
    id: row.id ?? `permission-${index}`,
    permissionCode,
    effect,
    dataScope: normalizeDataScope(row.data_scope ?? row.dataScope ?? row.scope),
    subjectType,
    subjectId,
    companyId,
    role,
    priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : 0,
    raw: row
  };
}

function normalizePrincipal(principal = {}) {
  return {
    adminId: normalizeText(principal.adminId ?? principal.loginId ?? principal.login_id),
    companyId: normalizeText(principal.companyId ?? principal.company_id),
    role: normalizeText(principal.role)?.toLowerCase()
  };
}

function matchesBinding(binding, principal) {
  if (binding.subjectType === ADMIN_PERMISSION_SUBJECT.GLOBAL) {
    return true;
  }

  if (binding.subjectType === ADMIN_PERMISSION_SUBJECT.ADMIN) {
    return Boolean(binding.subjectId && binding.subjectId === principal.adminId);
  }

  if (binding.subjectType === ADMIN_PERMISSION_SUBJECT.COMPANY) {
    const targetCompanyId = binding.companyId ?? binding.subjectId;
    return Boolean(targetCompanyId && targetCompanyId === principal.companyId);
  }

  if (binding.subjectType === ADMIN_PERMISSION_SUBJECT.ROLE) {
    const targetRole = (binding.role ?? binding.subjectId)?.toLowerCase();
    return Boolean(targetRole && targetRole === principal.role);
  }

  return false;
}

function compareBindingPriority(left, right) {
  const specificityDifference =
    (SUBJECT_SPECIFICITY[left.subjectType] ?? -1) -
    (SUBJECT_SPECIFICITY[right.subjectType] ?? -1);

  if (specificityDifference !== 0) {
    return specificityDifference;
  }

  return (left.priority ?? 0) - (right.priority ?? 0);
}

/**
 * 회사 → 역할 → 개인 상속을 계산한다.
 * 가장 구체적인 대상만 최종 판정에 참여하며, 같은 수준에서는 deny가 allow보다 우선한다.
 */
export function resolvePermission(permissionCode, principal = {}, bindings = []) {
  const normalizedCode = normalizeText(permissionCode);
  const normalizedPrincipal = normalizePrincipal(principal);
  const candidates = (Array.isArray(bindings) ? bindings : [])
    .map(normalizePermissionBinding)
    .filter(
      (binding) =>
        binding &&
        binding.permissionCode === normalizedCode &&
        matchesBinding(binding, normalizedPrincipal)
    )
    .sort(compareBindingPriority);

  if (candidates.length === 0) {
    return {
      permissionCode: normalizedCode,
      allowed: false,
      effect: ADMIN_PERMISSION_EFFECT.DENY,
      dataScope: null,
      source: null,
      matchedBindings: []
    };
  }

  const highestSpecificity = SUBJECT_SPECIFICITY[candidates[candidates.length - 1].subjectType];
  const highestPriority = candidates[candidates.length - 1].priority;
  const selected = candidates.filter(
    (binding) =>
      SUBJECT_SPECIFICITY[binding.subjectType] === highestSpecificity &&
      binding.priority === highestPriority
  );
  const hasDeny = selected.some((binding) => binding.effect === ADMIN_PERMISSION_EFFECT.DENY);
  const allowedBinding = selected
    .filter((binding) => binding.effect === ADMIN_PERMISSION_EFFECT.ALLOW)
    .sort((left, right) => (SCOPE_SPECIFICITY[left.dataScope] ?? 0) - (SCOPE_SPECIFICITY[right.dataScope] ?? 0))
    .slice(-1)[0];

  return {
    permissionCode: normalizedCode,
    allowed: !hasDeny && Boolean(allowedBinding),
    effect: hasDeny ? ADMIN_PERMISSION_EFFECT.DENY : ADMIN_PERMISSION_EFFECT.ALLOW,
    dataScope: hasDeny ? null : allowedBinding?.dataScope ?? null,
    source: hasDeny ? selected.find((binding) => binding.effect === ADMIN_PERMISSION_EFFECT.DENY) : allowedBinding,
    matchedBindings: selected
  };
}

export function hasPermission(permissionCode, principal = {}, bindings = []) {
  return resolvePermission(permissionCode, principal, bindings).allowed;
}

export function getPermissionDataScope(permissionCode, principal = {}, bindings = []) {
  return resolvePermission(permissionCode, principal, bindings).dataScope;
}

/**
 * 새 permission binding이 아직 backfill되지 않은 호환 기간에는 기존 capability
 * 값을 유지한다. binding이 한 건이라도 존재하면 해당 코드의 DB 판정을 우선한다.
 */
export function hasPermissionWithLegacyFallback(
  permissionCode,
  principal = {},
  bindings = [],
  legacyFallback = false
) {
  const normalizedCode = normalizeText(permissionCode);
  const normalizedPrincipal = normalizePrincipal(principal);
  const hasExplicitBinding = (Array.isArray(bindings) ? bindings : [])
    .map(normalizePermissionBinding)
    .some(
      (binding) =>
        binding?.permissionCode === normalizedCode &&
        matchesBinding(binding, normalizedPrincipal)
    );

  return hasExplicitBinding
    ? resolvePermission(normalizedCode, principal, bindings).allowed
    : Boolean(legacyFallback);
}

export function resolvePermissionMap(permissionCodes = [], principal = {}, bindings = []) {
  const codes = Array.from(
    new Set(
      (Array.isArray(permissionCodes) ? permissionCodes : [])
        .map(normalizeText)
        .filter(Boolean)
    )
  );

  return codes.reduce((result, permissionCode) => {
    result[permissionCode] = resolvePermission(permissionCode, principal, bindings);
    return result;
  }, {});
}

export function getSubjectSpecificity(subjectType) {
  return SUBJECT_SPECIFICITY[normalizeSubjectType(subjectType)] ?? -1;
}
