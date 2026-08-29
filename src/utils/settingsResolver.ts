// @ts-nocheck

import { getAdminSettingDefinition } from "@/constants/adminAccess";

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeScopeType(value) {
  const normalized = normalizeText(value)?.toLowerCase();

  if (normalized === "company" || normalized === "organization") {
    return "company";
  }

  if (normalized === "role") {
    return "role";
  }

  if (normalized === "admin" || normalized === "personal" || normalized === "user") {
    return "admin";
  }

  if (normalized === "global" || normalized === "default" || !normalized) {
    return "global";
  }

  return null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key);
}

function getRowValue(row) {
  if (hasOwn(row, "value")) {
    return row.value;
  }

  if (hasOwn(row, "value_json")) {
    return row.value_json;
  }

  if (hasOwn(row, "valueJson")) {
    return row.valueJson;
  }

  return undefined;
}

function getScopeId(row) {
  return normalizeText(row.scope_id ?? row.scopeId ?? row.target_id ?? row.targetId);
}

export function normalizeSettingValue(definitionOrKey, value) {
  const definition =
    typeof definitionOrKey === "string"
      ? getAdminSettingDefinition(definitionOrKey)
      : definitionOrKey;

  if (!definition) {
    return {
      ok: false,
      value: undefined,
      errorCode: "SETTING_UNKNOWN",
      errorMessage: "알 수 없는 설정 항목입니다."
    };
  }

  if (value == null || (typeof value === "string" && value.trim() === "")) {
    if (definition.nullable) {
      return { ok: true, value: null, errorCode: null, errorMessage: "" };
    }

    return {
      ok: false,
      value: undefined,
      errorCode: "SETTING_REQUIRED",
      errorMessage: `${definition.label}은(는) 비워둘 수 없습니다.`
    };
  }

  if (definition.valueType === "integer") {
    const numericValue = typeof value === "number" ? value : Number(String(value).trim());

    if (!Number.isInteger(numericValue)) {
      return {
        ok: false,
        value: undefined,
        errorCode: "SETTING_INTEGER",
        errorMessage: `${definition.label}은(는) 정수로 입력해야 합니다.`
      };
    }

    if (definition.minValue != null && numericValue < definition.minValue) {
      return {
        ok: false,
        value: undefined,
        errorCode: "SETTING_MIN",
        errorMessage: `${definition.label}은(는) ${definition.minValue}${definition.unit === "characters" ? "글자" : ""} 이상이어야 합니다.`
      };
    }

    if (definition.maxValue != null && numericValue > definition.maxValue) {
      return {
        ok: false,
        value: undefined,
        errorCode: "SETTING_MAX",
        errorMessage: `${definition.label}은(는) ${definition.maxValue}${definition.unit === "characters" ? "글자" : ""} 이하이어야 합니다.`
      };
    }

    return { ok: true, value: numericValue, errorCode: null, errorMessage: "" };
  }

  if (definition.valueType === "enum") {
    const normalizedValue = String(value).trim();

    if (!definition.allowedValues?.includes(normalizedValue)) {
      return {
        ok: false,
        value: undefined,
        errorCode: "SETTING_ENUM",
        errorMessage: `${definition.label}에 허용되지 않은 값입니다.`
      };
    }

    return { ok: true, value: normalizedValue, errorCode: null, errorMessage: "" };
  }

  if (definition.valueType === "boolean") {
    if (typeof value === "boolean") {
      return { ok: true, value, errorCode: null, errorMessage: "" };
    }

    if (value === "true" || value === "false") {
      return { ok: true, value: value === "true", errorCode: null, errorMessage: "" };
    }

    return {
      ok: false,
      value: undefined,
      errorCode: "SETTING_BOOLEAN",
      errorMessage: `${definition.label}은(는) true/false 값이어야 합니다.`
    };
  }

  if (definition.valueType === "string") {
    return { ok: true, value: String(value).trim(), errorCode: null, errorMessage: "" };
  }

  if (definition.valueType === "json") {
    if (typeof value === "string") {
      try {
        return { ok: true, value: JSON.parse(value), errorCode: null, errorMessage: "" };
      } catch {
        return {
          ok: false,
          value: undefined,
          errorCode: "SETTING_JSON",
          errorMessage: `${definition.label}의 JSON 형식이 올바르지 않습니다.`
        };
      }
    }

    return { ok: true, value, errorCode: null, errorMessage: "" };
  }

  return { ok: true, value, errorCode: null, errorMessage: "" };
}

function normalizeSettingRow(row, index) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const key = normalizeText(row.setting_key ?? row.settingKey ?? row.key);
  const scopeType = normalizeScopeType(row.scope_type ?? row.scopeType ?? row.target_type ?? row.targetType);

  if (!key || !scopeType) {
    return null;
  }

  const definition = getAdminSettingDefinition(key);
  const normalized = normalizeSettingValue(definition, getRowValue(row));

  if (!normalized.ok) {
    return null;
  }

  return {
    id: row.id ?? `setting-${index}`,
    key,
    scopeType,
    scopeId: getScopeId(row),
    value: normalized.value,
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

function matchesScope(row, principal) {
  if (row.scopeType === "global") {
    return true;
  }

  if (row.scopeType === "company") {
    return Boolean(row.scopeId && row.scopeId === principal.companyId);
  }

  if (row.scopeType === "role") {
    return Boolean(row.scopeId && row.scopeId.toLowerCase() === principal.role);
  }

  if (row.scopeType === "admin") {
    return Boolean(row.scopeId && row.scopeId === principal.adminId);
  }

  return false;
}

function findScopedValue(key, scopeType, scopeId, rows) {
  const normalizedScopeId = normalizeText(scopeId);
  const matchingRows = rows
    .map(normalizeSettingRow)
    .filter(
      (row) =>
        row &&
        row.key === key &&
        row.scopeType === scopeType &&
        (scopeType === "global" || row.scopeId === normalizedScopeId)
    )
    .slice(-1);

  return matchingRows[0] ?? null;
}

/**
 * 회사 → 역할 → 개인 override → 현재 입력값 순서로 설정을 합친다.
 * 값이 없는 개인 row를 만들지 않는 것이 override 해제 계약이다.
 */
export function resolveSettingValue(key, options = {}) {
  const definition = getAdminSettingDefinition(key);
  const principal = normalizePrincipal(options.principal ?? options);
  const rows = [
    ...(Array.isArray(options.values) ? options.values : []),
    ...(Array.isArray(options.companyValues) ? options.companyValues : []),
    ...(Array.isArray(options.roleValues) ? options.roleValues : []),
    ...(Array.isArray(options.adminValues) ? options.adminValues : [])
  ];
  const normalizedRows = rows.map(normalizeSettingRow).filter(Boolean);
  const candidates = [
    normalizedRows.find(
      (row) => row.key === key && row.scopeType === "company" && row.scopeId === principal.companyId
    ),
    normalizedRows.find(
      (row) => row.key === key && row.scopeType === "role" && row.scopeId?.toLowerCase() === principal.role
    ),
    normalizedRows.find(
      (row) => row.key === key && row.scopeType === "admin" && row.scopeId === principal.adminId
    ),
    normalizedRows.find((row) => row.key === key && row.scopeType === "global")
  ].filter(Boolean);

  let resolvedValue = definition?.defaultValue;
  let source = definition ? "definition" : null;
  let hasOverride = false;

  for (const candidate of candidates) {
    resolvedValue = candidate.value;
    source = candidate.scopeType;
    hasOverride = candidate.scopeType !== "global";
  }

  const currentValueProvided = Object.prototype.hasOwnProperty.call(options, "currentValue");
  if (currentValueProvided) {
    const normalizedCurrent = normalizeSettingValue(definition, options.currentValue);
    if (normalizedCurrent.ok) {
      resolvedValue = normalizedCurrent.value;
      source = "current";
    }
  }

  return {
    key,
    value: resolvedValue,
    source,
    hasOverride,
    definition,
    error: definition ? null : new Error("알 수 없는 설정 항목입니다.")
  };
}

export function resolveSettings(keys, options = {}) {
  return (Array.isArray(keys) ? keys : []).reduce((result, key) => {
    result[key] = resolveSettingValue(key, options);
    return result;
  }, {});
}

/**
 * gateway가 이미 상속을 계산해 `{ key, value }` 배열/맵으로 내려주는 경우와
 * 아직 빈 legacy bundle을 모두 읽을 수 있는 경계 함수다.
 */
export function readResolvedSetting(settings, key, fallback = null) {
  if (Array.isArray(settings)) {
    const row = settings.find(
      (item) => item?.key === key || item?.setting_key === key || item?.settingKey === key
    );

    if (row && Object.prototype.hasOwnProperty.call(row, "value")) {
      return row.value;
    }

    if (row && Object.prototype.hasOwnProperty.call(row, "resolvedValue")) {
      return row.resolvedValue;
    }
  }

  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const value = settings[key];
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
      return value.value;
    }

    if (value !== undefined) {
      return value;
    }
  }

  return fallback;
}

export function getSettingOverrideRow(key, principal = {}, rows = []) {
  const normalizedPrincipal = normalizePrincipal(principal);
  const normalizedRows = (Array.isArray(rows) ? rows : []).map(normalizeSettingRow).filter(Boolean);

  return (
    normalizedRows.find(
      (row) =>
        row.key === key &&
        row.scopeType === "admin" &&
        row.scopeId === normalizedPrincipal.adminId
    ) ?? null
  );
}

export function validateSettingForScope(key, value, scopeType) {
  const definition = getAdminSettingDefinition(key);
  const normalizedScopeType = normalizeScopeType(scopeType);

  if (!definition || !normalizedScopeType) {
    return {
      ok: false,
      errorCode: "SETTING_SCOPE",
      errorMessage: "설정 항목 또는 저장 범위가 올바르지 않습니다.",
      value: undefined
    };
  }

  if (!definition.allowedScopes.includes(normalizedScopeType)) {
    return {
      ok: false,
      errorCode: "SETTING_SCOPE_FORBIDDEN",
      errorMessage: `${definition.label}은(는) ${normalizedScopeType} 범위에 저장할 수 없습니다.`,
      value: undefined
    };
  }

  return normalizeSettingValue(definition, value);
}
