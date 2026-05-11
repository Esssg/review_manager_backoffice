import { useCallback, useState } from "react";
import { EXPORT_COLUMN_PRESET, EXPORT_COLUMN_PRESETS, getPresetColumnKeys } from "../utils/exportColumns";

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

function readInitialColumnSelection(storageKey, fallbackPreset, resolvePresetColumnKeys, presetKeys) {
  const fallbackColumnKeys = normalizeProductDateColumnPosition(resolvePresetColumnKeys(fallbackPreset));

  if (!storageKey) {
    return {
      activePreset: fallbackPreset,
      selectedColumnKeys: fallbackColumnKeys
    };
  }

  try {
    const storedValue = localStorage.getItem(storageKey);
    const parsedValue = storedValue ? JSON.parse(storedValue) : null;

    if (Array.isArray(parsedValue)) {
      const activePreset = resolveActivePreset(parsedValue, presetKeys, resolvePresetColumnKeys);

      if (activePreset) {
        const nextColumnKeys = normalizeProductDateColumnPosition(parsedValue);

        if (!areColumnKeysEqual(parsedValue, nextColumnKeys)) {
          localStorage.setItem(storageKey, JSON.stringify(nextColumnKeys));
        }

        return {
          activePreset,
          selectedColumnKeys: nextColumnKeys
        };
      }

      const legacyPreset = resolveLegacyPresetColumnKeys(parsedValue, presetKeys, resolvePresetColumnKeys);

      if (legacyPreset) {
        const nextColumnKeys = normalizeProductDateColumnPosition(resolvePresetColumnKeys(legacyPreset));

        localStorage.setItem(storageKey, JSON.stringify(nextColumnKeys));

        return {
          activePreset: legacyPreset,
          selectedColumnKeys: nextColumnKeys
        };
      }

      const nextColumnKeys = normalizeProductDateColumnPosition(parsedValue);

      if (!areColumnKeysEqual(parsedValue, nextColumnKeys)) {
        localStorage.setItem(storageKey, JSON.stringify(nextColumnKeys));
      }

      return {
        activePreset: "",
        selectedColumnKeys: nextColumnKeys
      };
    }
  } catch {
    // 저장된 컬럼 설정이 깨졌다면 기본 프리셋으로 복구한다.
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
} = {}) {
  const [initialSelection] = useState(() =>
    readInitialColumnSelection(storageKey, defaultPreset, getPresetColumnKeysFn, presetKeys)
  );
  const [activePreset, setActivePreset] = useState(initialSelection.activePreset);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState(initialSelection.selectedColumnKeys);

  const persistColumnKeys = useCallback(
    (nextColumnKeys) => {
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(nextColumnKeys));
      }
    },
    [storageKey]
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
