import assert from "node:assert/strict";
import test from "node:test";
import {
  findNearbyStation,
  NEARBY_STATION_CANDIDATE_LIMIT,
  selectNearbyStationCandidates,
} from "../app/nearby-station.ts";

const currentLocation = [37.5, 127];

function station(id, longitudeOffset, bikes = null) {
  return {
    id,
    coordinates: [currentLocation[0], currentLocation[1] + longitudeOffset],
    bikes,
  };
}

function actualRoute(distanceMeters, durationSeconds = distanceMeters) {
  return {
    path: [currentLocation, currentLocation],
    source: "kakao",
    distanceMeters,
    durationSeconds,
  };
}

test("직선거리 후보는 입력을 바꾸지 않고 가까운 순서로 최대 5곳만 반환한다", () => {
  const stations = [
    station("sixth", 0.006),
    station("third", 0.003),
    station("first", 0.001),
    station("fifth", 0.005),
    station("second", 0.002),
    station("fourth", 0.004),
  ];

  const candidates = selectNearbyStationCandidates({
    kind: "return",
    currentLocation,
    stations,
    availability: "confirmed",
  });

  assert.equal(candidates.length, NEARBY_STATION_CANDIDATE_LIMIT);
  assert.deepEqual(
    candidates.map(({ station: candidate }) => candidate.id),
    ["first", "second", "third", "fourth", "fifth"],
  );
  assert.deepEqual(stations.map(({ id }) => id), [
    "sixth",
    "third",
    "first",
    "fifth",
    "second",
    "fourth",
  ]);
});

test("출발 검색은 수량 확인 시 0대 대여소를 건너뛰고 다음 가까운 후보를 고른다", async () => {
  const calls = [];
  const result = await findNearbyStation({
    kind: "rental",
    currentLocation,
    stations: [
      station("empty-nearest", 0.0001, 0),
      station("available-next", 0.0002, 2),
      station("available-farther", 0.0003, 1),
    ],
    availability: "confirmed",
    loadRoute: async ({ station: candidate }) => {
      calls.push(candidate.id);
      return actualRoute(candidate.id === "available-next" ? 200 : 300);
    },
  });

  assert.equal(result.status, "found");
  assert.equal(result.station.id, "available-next");
  assert.deepEqual(calls, ["available-next", "available-farther"]);
  assert.equal(result.availability, "confirmed");
});

test("수량 미확인 출발 검색은 bikes 값과 관계없이 모든 대여소를 후보로 둔다", async () => {
  const result = await findNearbyStation({
    kind: "rental",
    currentLocation,
    stations: [
      station("zero-but-unknown", 0.0001, 0),
      station("positive", 0.0002, 3),
    ],
    availability: "unknown",
    loadRoute: async ({ station: candidate }) =>
      actualRoute(candidate.id === "zero-but-unknown" ? 100 : 200),
  });

  assert.equal(result.status, "found");
  assert.equal(result.station.id, "zero-but-unknown");
  assert.equal(result.availability, "unknown");
});

test("반납 검색은 자전거 수량과 무관하게 실제 경로가 가장 짧은 대여소를 고른다", async () => {
  const result = await findNearbyStation({
    kind: "return",
    currentLocation,
    stations: [
      station("straight-nearest-empty", 0.0001, 0),
      station("route-nearest", 0.0002, 0),
    ],
    availability: "confirmed",
    loadRoute: async ({ station: candidate }) =>
      actualRoute(candidate.id === "route-nearest" ? 120 : 500),
  });

  assert.equal(result.status, "found");
  assert.equal(result.station.id, "route-nearest");
  assert.equal(result.routeStatus, "actual");
});

test("일부 실제 경로가 실패하면 실패 후보를 제외하고 성공한 후보끼리 비교한다", async () => {
  const result = await findNearbyStation({
    kind: "return",
    currentLocation,
    stations: [
      station("failed", 0.0001),
      station("long-route", 0.0002),
      station("short-route", 0.0003),
    ],
    availability: "unknown",
    loadRoute: async ({ station: candidate }) => {
      if (candidate.id === "failed") throw new Error("route unavailable");
      return actualRoute(candidate.id === "short-route" ? 180 : 250);
    },
  });

  assert.equal(result.status, "found");
  assert.equal(result.station.id, "short-route");
  assert.equal(result.failedRouteCount, 1);
  assert.equal(result.candidatesConsidered, 3);
});

test("실제 경로 거리 동률은 직선거리 순서를 유지해 비동기 완료 순서에 흔들리지 않는다", async () => {
  const result = await findNearbyStation({
    kind: "return",
    currentLocation,
    stations: [
      station("near", 0.0001),
      station("far", 0.0002),
    ],
    availability: "unknown",
    loadRoute: async ({ station: candidate }) => {
      await new Promise((resolve) =>
        setTimeout(resolve, candidate.id === "near" ? 10 : 0),
      );
      return actualRoute(300);
    },
  });

  assert.equal(result.status, "found");
  assert.equal(result.station.id, "near");
});

test("모든 실제 경로가 실패하면 직선 최근접 후보와 명시적인 직선 경로를 반환한다", async () => {
  const result = await findNearbyStation({
    kind: "rental",
    currentLocation,
    stations: [
      station("near", 0.0001, 2),
      station("far", 0.0002, 4),
    ],
    availability: "confirmed",
    loadRoute: async () => {
      throw new Error("Kakao unavailable");
    },
  });

  assert.equal(result.status, "found");
  assert.equal(result.station.id, "near");
  assert.equal(result.routeStatus, "direct-fallback");
  assert.equal(result.route.source, "direct");
  assert.deepEqual(result.route.path, [
    currentLocation,
    station("near", 0.0001).coordinates,
  ]);
  assert.ok(result.distanceMeters > 0);
  assert.ok(result.durationSeconds > 0);
  assert.equal(result.failedRouteCount, 2);
});

test("수량이 확인된 모든 출발 후보가 0대면 경로 요청 없이 no-available을 반환한다", async () => {
  let routeCalls = 0;
  const result = await findNearbyStation({
    kind: "rental",
    currentLocation,
    stations: [station("empty-a", 0.0001, 0), station("empty-b", 0.0002, 0)],
    availability: "confirmed",
    loadRoute: async () => {
      routeCalls += 1;
      return actualRoute(100);
    },
  });

  assert.deepEqual(result, {
    status: "no-available",
    kind: "rental",
    currentLocation,
    availability: "confirmed",
  });
  assert.equal(routeCalls, 0);
});

test("취소 신호는 각 경로 로더에 전달되고 AbortError를 검색 결과로 숨기지 않는다", async () => {
  const controller = new AbortController();
  const receivedSignals = [];
  const pending = findNearbyStation({
    kind: "return",
    currentLocation,
    stations: [station("one", 0.0001), station("two", 0.0002)],
    availability: "unknown",
    signal: controller.signal,
    loadRoute: ({ signal }) => {
      receivedSignals.push(signal);
      return new Promise((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      });
    },
  });

  controller.abort();

  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(receivedSignals.length, 2);
  assert.ok(receivedSignals.every((signal) => signal === controller.signal));
});

test("이미 취소된 검색은 실제 경로 로더를 호출하지 않는다", async () => {
  const controller = new AbortController();
  controller.abort();
  let routeCalls = 0;

  await assert.rejects(
    findNearbyStation({
      kind: "rental",
      currentLocation,
      stations: [station("available", 0.0001, 1)],
      availability: "confirmed",
      signal: controller.signal,
      loadRoute: async () => {
        routeCalls += 1;
        return actualRoute(100);
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(routeCalls, 0);
});
