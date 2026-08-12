import test from "node:test";
import assert from "node:assert/strict";
import {
  readStorageJson,
  readStorageValue,
  removeStorageValue,
  writeStorageJson,
  writeStorageValue
} from "../src/utils/browserStorage.ts";

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test("storage adapter는 값과 JSON을 읽고 쓰고 삭제한다", () => {
  const storage = createMemoryStorage();

  assert.equal(writeStorageValue(storage, "name", "tester"), true);
  assert.equal(readStorageValue(storage, "name", ""), "tester");
  assert.equal(writeStorageJson(storage, "filters", { query: "배송" }), true);
  assert.deepEqual(readStorageJson(storage, "filters", {}), { query: "배송" });
  assert.equal(removeStorageValue(storage, "name"), true);
  assert.equal(readStorageValue(storage, "name", "fallback"), "fallback");
});

test("깨진 JSON과 storage 예외는 fallback과 false로 안전하게 처리한다", () => {
  const storage = createMemoryStorage();
  writeStorageValue(storage, "broken", "{broken");

  assert.deepEqual(readStorageJson(storage, "broken", { safe: true }), { safe: true });

  const throwingStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    }
  };

  assert.equal(readStorageValue(throwingStorage, "key", "fallback"), "fallback");
  assert.equal(writeStorageValue(throwingStorage, "key", "value"), false);
  assert.equal(removeStorageValue(throwingStorage, "key"), false);
});
