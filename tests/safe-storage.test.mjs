import assert from "node:assert/strict";
import test from "node:test";
import {
  readStoredValue,
  writeStoredValue,
} from "../app/safe-storage.ts";

test("브라우저 저장소 읽기가 차단돼도 기본 화면을 계속 사용할 수 있다", () => {
  const blockedStorage = {
    getItem() {
      throw new DOMException("Blocked", "SecurityError");
    },
    setItem() {
      throw new DOMException("Blocked", "SecurityError");
    },
  };

  assert.equal(readStoredValue(blockedStorage, "pass"), null);
  assert.equal(writeStoredValue(blockedStorage, "pass", "60"), false);
});

test("사용 가능한 저장소는 이용권과 히스토리 값을 그대로 보존한다", () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };

  assert.equal(writeStoredValue(storage, "pass", "180"), true);
  assert.equal(readStoredValue(storage, "pass"), "180");
});
