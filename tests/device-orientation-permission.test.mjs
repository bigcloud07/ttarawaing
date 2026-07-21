import assert from "node:assert/strict";
import test from "node:test";
import { requestDeviceOrientationPermission } from "../app/device-orientation-permission.ts";

test("방향 센서 API 미지원은 오류 대신 대체 방향 상태로 구분한다", async () => {
  assert.equal(await requestDeviceOrientationPermission(null), "unsupported");
});

test("권한 요청이 없는 표준 방향 센서는 바로 사용할 수 있다", async () => {
  assert.equal(await requestDeviceOrientationPermission({}), "granted");
});

test("방향 센서 권한 거부와 요청 예외를 모두 거부 상태로 종료한다", async () => {
  assert.equal(
    await requestDeviceOrientationPermission({
      requestPermission: async () => "denied",
    }),
    "denied",
  );
  assert.equal(
    await requestDeviceOrientationPermission({
      requestPermission: async () => {
        throw new DOMException("Blocked", "NotAllowedError");
      },
    }),
    "denied",
  );
});
