import assert from "node:assert/strict";
import test from "node:test";
import {
  createLatestRequestGate,
  requestCurrentPositionOnce,
} from "../app/current-location-request.ts";

test("현재 위치 요청 뒤 사용자가 새 장소를 고르면 늦은 위치 응답이 덮어쓰지 않는다", () => {
  const gate = createLatestRequestGate();
  let capturedSuccess;
  let selected = "검색으로 선택한 장소";

  requestCurrentPositionOnce({
    geolocation: {
      getCurrentPosition(success) {
        capturedSuccess = success;
      },
    },
    gate,
    onSuccess() {
      selected = "내 현재 위치";
    },
    onError() {},
    onUnsupported() {},
  });

  gate.invalidate();
  capturedSuccess({ coords: { latitude: 37.5, longitude: 127 } });
  assert.equal(selected, "검색으로 선택한 장소");
});

test("위치 API 미지원과 동기 예외가 모두 종료 상태로 전달된다", () => {
  const unsupportedGate = createLatestRequestGate();
  let unsupported = false;
  requestCurrentPositionOnce({
    geolocation: null,
    gate: unsupportedGate,
    onSuccess() {},
    onError() {},
    onUnsupported() {
      unsupported = true;
    },
  });
  assert.equal(unsupported, true);

  const throwingGate = createLatestRequestGate();
  let errorCount = 0;
  requestCurrentPositionOnce({
    geolocation: {
      getCurrentPosition() {
        throw new DOMException("Blocked", "SecurityError");
      },
    },
    gate: throwingGate,
    onSuccess() {},
    onError() {
      errorCount += 1;
    },
    onUnsupported() {},
  });
  assert.equal(errorCount, 1);
});

test("위치 권한 거부 콜백은 최신 요청에만 한 번 전달된다", () => {
  const gate = createLatestRequestGate();
  let capturedError;
  let errorCount = 0;
  requestCurrentPositionOnce({
    geolocation: {
      getCurrentPosition(_success, error) {
        capturedError = error;
      },
    },
    gate,
    onSuccess() {},
    onError() {
      errorCount += 1;
    },
    onUnsupported() {},
  });
  capturedError({ code: 1 });
  assert.equal(errorCount, 1);
});
