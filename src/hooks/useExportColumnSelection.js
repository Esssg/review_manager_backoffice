import { useCallback, useState } from "react";
import { EXPORT_COLUMN_PRESET, EXPORT_COLUMN_PRESETS, getPresetColumnKeys } from "../utils/exportColumns";

const DEFAULT_PRESET_KEYS = EXPORT_COLUMN_PRESETS.map((preset) => preset.key);

function areColumnKeysEqual(leftColumnKeys, rightColumnKeys) {
  if (leftColumnKeys.length !== rightColumnKeys.length) {
    return false;
  }

  return leftColumnKeys.every((columnKey, index) => columnKey === rightColumnKeys[index]);
}

function resolveActivePreset(columnKeys, presetKeys, resolvePresetColumnKeys) {
  return presetKeys.find((presetKey) => areColumnKeysEqual(columnKeys, resolvePresetColumnKeys(presetKey))) ?? "";
}

function resolveLegacyPresetColumnKeys(columnKeys, presetKeys, resolvePresetColumnKeys) {
  return presetKeys.find((presetKey) => {
    const presetColumnKeys = resolvePresetColumnKeys(presetKey);
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
  const fallbackColumnKeys = resolvePresetColumnKeys(fallbackPreset);

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
        return {
          activePreset,
          selectedColumnKeys: parsedValue
        };
      }

      const legacyPreset = resolveLegacyPresetColumnKeys(parsedValue, presetKeys, resolvePresetColumnKeys);

      if (legacyPreset) {
        const nextColumnKeys = resolvePresetColumnKeys(legacyPreset);

        localStorage.setItem(storageKey, JSON.stringify(nextColumnKeys));

        return {
          activePreset: legacyPreset,
          selectedColumnKeys: nextColumnKeys
        };
      }

      return {
        activePreset: "",
        selectedColumnKeys: parsedValue
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
      const nextColumnKeys = getPresetColumnKeysFn(presetKey);

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
          : [...prevColumnKeys, columnKey];

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
