// @ts-nocheck

import { useCallback, useState } from "react";
import { ADMIN_STORAGE_KEY, getAdminScopedStorageKey } from "@/constants/admin";
import { EXPORT_COLUMN_PRESET, EXPORT_COLUMN_PRESETS, getPresetColumnKeys } from "@/utils/exportColumns";
import { getLocalStorageValue, readLocalStorageJson, writeLocalStorageJson } from "@/utils/browserStorage";

const DEFAULT_PRESET_KEYS = EXPORT_COLUMN_PRESETS.map((preset) => preset.key);
const PRODUCT_DATE_COLUMN_KEY = "products.product_date";
const PRODUCT_MANAGER_COLUMN_KEY = "products.manager_id";
const PRODUCT_TITLE_COLUMN_KEY = "products.title";

function areColumnKeysEqual(leftColumnKeys, rightColumnKeys) {
  if (leftColumnKeys.length !== rightColumnKeys.length) {
    return false;
  }

  return leftColumnKeys.every((columnKey, index) => columnKey === rightColumnKeys[index]);
}

function normalizeProductDateColumnPosition(columnKeys, { includeByDefault = true } = {}) {
  if (!Array.isArray(columnKeys) || !columnKeys.includes(PRODUCT_TITLE_COLUMN_KEY)) {
    return columnKeys;
  }

  const hasProductDateColumn = columnKeys.includes(PRODUCT_DATE_COLUMN_KEY);
  const hasManagerColumn = columnKeys.includes(PRODUCT_MANAGER_COLUMN_KEY);

  if (!hasProductDateColumn && !includeByDefault) {
    return columnKeys;
  }

  if (hasProductDateColumn && !hasManagerColumn) {
    return columnKeys;
  }

  const nextColumnKeys = columnKeys.filter((columnKey) => columnKey !== PRODUCT_DATE_COLUMN_KEY);
  const managerIndex = nextColumnKeys.indexOf(PRODUCT_MANAGER_COLUMN_KEY);
  const titleIndex = nextColumnKeys.indexOf(PRODUCT_TITLE_COLUMN_KEY);
  const insertIndex = managerIndex >= 0 ? managerIndex + 1 : titleIndex;

  nextColumnKeys.splice(insertIndex, 0, PRODUCT_DATE_COLUMN_KEY);
  return nextColumnKeys;
}

function resolveActivePreset(columnKeys, presetKeys, resolvePresetColumnKeys) {
  const normalizedColumnKeys = normalizeProductDateColumnPosition(columnKeys);

  return (
    presetKeys.find((presetKey) =>
      areColumnKeysEqual(normalizedColumnKeys, normalizeProductDateColumnPosition(resolvePresetColumnKeys(presetKey)))
    ) ?? ""
  );
}

function resolveLegacyPresetColumnKeys(columnKeys, presetKeys, resolvePresetColumnKeys) {
  return presetKeys.find((presetKey) => {
    const presetColumnKeys = normalizeProductDateColumnPosition(resolvePresetColumnKeys(presetKey));
    const columnKeySet = new Set(columnKeys);
    const presetKeysAlreadySelected = presetColumnKeys.filter((columnKey) => columnKeySet.has(columnKey));
    const missingPresetKeyCount = presetColumnKeys.length - columnKeys.length;

    return (
      columnKeys.length > 0 &&
      missingPresetKeyCount > 0 &&
      missingPresetKeyCount <= 2 &&
      areColumnKeysEqual(columnKeys, presetKeysAlreadySelected)
    );
  });
}

function readInitialColumnSelection(
  storageKey,
  fallbackPreset,
  resolvePresetColumnKeys,
  presetKeys,
  legacyStorageKey = null
) {
  const fallbackColumnKeys = normalizeProductDateColumnPosition(resolvePresetColumnKeys(fallbackPreset));

  if (!storageKey) {
    return {
      activePreset: fallbackPreset,
      selectedColumnKeys: fallbackColumnKeys
    };
  }

  let parsedValue = readLocalStorageJson(storageKey, null);

  // 계정별 key가 처음 도입되는 시점에는 기존 공용 key를 한 번만 복사한다.
  // 이후 읽기·쓰기는 항상 계정별 key를 사용해 계정 간 상태가 섞이지 않는다.
  if (parsedValue == null && legacyStorageKey && legacyStorageKey !== storageKey) {
    parsedValue = readLocalStorageJson(legacyStorageKey, null);

    if (Array.isArray(parsedValue)) {
      writeLocalStorageJson(storageKey, parsedValue);
    }
  }

  if (Array.isArray(parsedValue)) {
    const activePreset = resolveActivePreset(parsedValue, presetKeys, resolvePresetColumnKeys);

    if (activePreset) {
      const nextColumnKeys = normalizeProductDateColumnPosition(parsedValue);

      if (!areColumnKeysEqual(parsedValue, nextColumnKeys)) {
        writeLocalStorageJson(storageKey, nextColumnKeys);
      }

      return {
        activePreset,
        selectedColumnKeys: nextColumnKeys
      };
    }

    const legacyPreset = resolveLegacyPresetColumnKeys(parsedValue, presetKeys, resolvePresetColumnKeys);

    if (legacyPreset) {
      const nextColumnKeys = normalizeProductDateColumnPosition(resolvePresetColumnKeys(legacyPreset));

      writeLocalStorageJson(storageKey, nextColumnKeys);

      return {
        activePreset: legacyPreset,
        selectedColumnKeys: nextColumnKeys
      };
    }

    const nextColumnKeys = normalizeProductDateColumnPosition(parsedValue);

    if (!areColumnKeysEqual(parsedValue, nextColumnKeys)) {
      writeLocalStorageJson(storageKey, nextColumnKeys);
    }

    return {
      activePreset: "",
      selectedColumnKeys: nextColumnKeys
    };
  }

  return {
    activePreset: fallbackPreset,
    selectedColumnKeys: fallbackColumnKeys
  };
}

export default function useExportColumnSelection({
  storageKey,
  defaultPreset = EXPORT_COLUMN_PRESET.BASIC,
  getPresetColumnKeysFn = getPresetColumnKeys,
  presetKeys = DEFAULT_PRESET_KEYS
}: any = {}) {
  const adminId = getLocalStorageValue(ADMIN_STORAGE_KEY);
  const scopedStorageKey = getAdminScopedStorageKey(storageKey, adminId);
  const [initialSelection] = useState(() =>
    readInitialColumnSelection(
      scopedStorageKey,
      defaultPreset,
      getPresetColumnKeysFn,
      presetKeys,
      storageKey
    )
  );
  const [activePreset, setActivePreset] = useState(initialSelection.activePreset);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState(initialSelection.selectedColumnKeys);

  const persistColumnKeys = useCallback(
    (nextColumnKeys) => {
      if (scopedStorageKey) {
        writeLocalStorageJson(scopedStorageKey, nextColumnKeys);
      }
    },
    [scopedStorageKey]
  );

  const applyPreset = useCallback(
    (presetKey) => {
      const nextColumnKeys = normalizeProductDateColumnPosition(getPresetColumnKeysFn(presetKey));

      setActivePreset(presetKey);
      setSelectedColumnKeys(nextColumnKeys);
      persistColumnKeys(nextColumnKeys);
    },
    [getPresetColumnKeysFn, persistColumnKeys]
  );

  const toggleColumn = useCallback(
    (columnKey) => {
      setActivePreset("");
      setSelectedColumnKeys((prevColumnKeys) => {
        const nextColumnKeys = prevColumnKeys.includes(columnKey)
          ? prevColumnKeys.filter((key) => key !== columnKey)
          : normalizeProductDateColumnPosition([...prevColumnKeys, columnKey], { includeByDefault: false });

        persistColumnKeys(nextColumnKeys);
        return nextColumnKeys;
      });
    },
    [persistColumnKeys]
  );

  const selectAllColumns = useCallback(() => {
    applyPreset(EXPORT_COLUMN_PRESET.ALL);
  }, [applyPreset]);

  const clearColumns = useCallback(() => {
    setActivePreset("");
    setSelectedColumnKeys([]);
    persistColumnKeys([]);
  }, [persistColumnKeys]);

  return {
    activePreset,
    selectedColumnKeys,
    applyPreset,
    toggleColumn,
    selectAllColumns,
    clearColumns
  };
}
