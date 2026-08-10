function getBrowserStorage(storageType) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window[storageType] ?? null;
  } catch {
    return null;
  }
}

export function readStorageValue(storage, key, fallback = null) {
  if (!storage || !key) {
    return fallback;
  }

  try {
    return storage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStorageValue(storage, key, value) {
  if (!storage || !key) {
    return false;
  }

  try {
    storage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorageValue(storage, key) {
  if (!storage || !key) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readStorageJson(storage, key, fallback = null) {
  const storedValue = readStorageValue(storage, key, null);

  if (storedValue == null || storedValue === "") {
    return fallback;
  }

  try {
    return JSON.parse(storedValue);
  } catch {
    return fallback;
  }
}

export function writeStorageJson(storage, key, value) {
  try {
    return writeStorageValue(storage, key, JSON.stringify(value));
  } catch {
    return false;
  }
}

export function getLocalStorageValue(key, fallback = null) {
  return readStorageValue(getBrowserStorage("localStorage"), key, fallback);
}

export function setLocalStorageValue(key, value) {
  return writeStorageValue(getBrowserStorage("localStorage"), key, value);
}

export function removeLocalStorageValue(key) {
  return removeStorageValue(getBrowserStorage("localStorage"), key);
}

export function readLocalStorageJson(key, fallback = null) {
  return readStorageJson(getBrowserStorage("localStorage"), key, fallback);
}

export function writeLocalStorageJson(key, value) {
  return writeStorageJson(getBrowserStorage("localStorage"), key, value);
}

export function getSessionStorageValue(key, fallback = null) {
  return readStorageValue(getBrowserStorage("sessionStorage"), key, fallback);
}

export function setSessionStorageValue(key, value) {
  return writeStorageValue(getBrowserStorage("sessionStorage"), key, value);
}

export function readSessionStorageJson(key, fallback = null) {
  return readStorageJson(getBrowserStorage("sessionStorage"), key, fallback);
}

export function writeSessionStorageJson(key, value) {
  return writeStorageJson(getBrowserStorage("sessionStorage"), key, value);
}
