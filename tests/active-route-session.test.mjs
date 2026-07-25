import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_ROUTE_SESSION_STORAGE_KEY,
  clearActiveRouteSession,
  parseActiveRouteSession,
  readActiveRouteSession,
  writeActiveRouteSession,
} from "../app/active-route-session.ts";

const activeRoute = {
  version: 1,
  origin: {
    id: "kakao:origin",
    name: "서울숲",
    address: "서울 성동구 뚝섬로 273",
    hint: "도시근린공원",
    coordinates: [37.54442, 127.03741],
  },
  destination: {
    id: "kakao:destination",
    name: "뚝섬역 2호선",
    address: "서울 성동구 아차산로 18",
    hint: "지하철역",
    coordinates: [37.54736, 127.04739],
  },
  passType: "120",
  preferBikeRoads: true,
  selectedEndStationId: "3537",
};

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("새로고침 세션에서 확정 경로와 선택한 반납 대여소를 복원한다", () => {
  const storage = createMemoryStorage();

  assert.equal(writeActiveRouteSession(storage, activeRoute), true);
  assert.deepEqual(readActiveRouteSession(storage), activeRoute);
  assert.match(
    storage.getItem(ACTIVE_ROUTE_SESSION_STORAGE_KEY),
    /"selectedEndStationId":"3537"/,
  );
});

test("명시적으로 초기화한 경로는 같은 탭에서 다시 복원되지 않는다", () => {
  const storage = createMemoryStorage();
  writeActiveRouteSession(storage, activeRoute);

  assert.equal(clearActiveRouteSession(storage), true);
  assert.equal(readActiveRouteSession(storage), null);
});

test("손상되거나 안전하지 않은 활성 경로 저장값은 무시한다", () => {
  const invalidValues = [
    "{",
    JSON.stringify({}),
    JSON.stringify({ ...activeRoute, version: 2 }),
    JSON.stringify({
      ...activeRoute,
      destination: activeRoute.origin,
    }),
    JSON.stringify({
      ...activeRoute,
      origin: { ...activeRoute.origin, coordinates: [NaN, 127] },
    }),
    JSON.stringify({
      ...activeRoute,
      destination: {
        ...activeRoute.destination,
        coordinates: [37.5, 181],
      },
    }),
    JSON.stringify({
      ...activeRoute,
      selectedEndStationId: "",
    }),
    JSON.stringify({
      ...activeRoute,
      passType: "90",
    }),
    JSON.stringify({
      ...activeRoute,
      preferBikeRoads: "true",
    }),
  ];

  for (const serialized of invalidValues) {
    assert.equal(parseActiveRouteSession(serialized), null);
  }
});

test("세션 저장소 접근이 차단돼도 경로 화면 초기화가 중단되지 않는다", () => {
  const blockedStorage = {
    getItem() {
      throw new DOMException("Blocked", "SecurityError");
    },
    setItem() {
      throw new DOMException("Blocked", "SecurityError");
    },
    removeItem() {
      throw new DOMException("Blocked", "SecurityError");
    },
  };

  assert.equal(readActiveRouteSession(blockedStorage), null);
  assert.equal(writeActiveRouteSession(blockedStorage, activeRoute), false);
  assert.equal(clearActiveRouteSession(blockedStorage), false);
});
