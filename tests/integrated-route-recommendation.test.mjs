import assert from "node:assert/strict";
import test from "node:test";
import {
  recommendIntegratedRoute,
} from "../app/integrated-route-recommendation.ts";

const origin = [37.5, 127];
const destination = [37.5, 127.03];
const stations = [
  {
    id: "start-nearest",
    coordinates: [37.5, 127.001],
    bikes: 4,
  },
  {
    id: "start-faster-total",
    coordinates: [37.5, 127.004],
    bikes: 3,
  },
  {
    id: "return-nearest",
    coordinates: [37.5, 127.029],
    bikes: 1,
  },
  {
    id: "return-faster-total",
    coordinates: [37.5, 127.026],
    bikes: 2,
  },
];

function routeSegment(from, to, mode, durationSeconds, source = "kakao") {
  return {
    path: [from, to],
    source,
    distanceMeters: durationSeconds * (mode === "walk" ? 1.2 : 4),
    durationSeconds,
  };
}

function routeKey(from, to) {
  return `${from.join(",")}>${to.join(",")}`;
}

function createLoader(overrides = new Map()) {
  const calls = [];
  const loadRoute = async (input) => {
    calls.push(input);
    const override = overrides.get(routeKey(input.from, input.to));
    return routeSegment(
      input.from,
      input.to,
      input.mode,
      override?.durationSeconds ??
        (input.mode === "walk" ? 120 : 1_200),
      override?.source ?? "kakao",
    );
  };
  return { calls, loadRoute };
}

test("가장 가까운 대여소보다 전체 이동시간이 짧은 대여·반납 조합을 선택한다", async () => {
  const overrides = new Map([
    [
      routeKey(origin, stations[0].coordinates),
      { durationSeconds: 90 },
    ],
    [
      routeKey(origin, stations[1].coordinates),
      { durationSeconds: 240 },
    ],
    [
      routeKey(stations[0].coordinates, stations[2].coordinates),
      { durationSeconds: 1_800 },
    ],
    [
      routeKey(stations[0].coordinates, stations[3].coordinates),
      { durationSeconds: 1_700 },
    ],
    [
      routeKey(stations[1].coordinates, stations[2].coordinates),
      { durationSeconds: 1_100 },
    ],
    [
      routeKey(stations[1].coordinates, stations[3].coordinates),
      { durationSeconds: 900 },
    ],
    [
      routeKey(stations[2].coordinates, destination),
      { durationSeconds: 90 },
    ],
    [
      routeKey(stations[3].coordinates, destination),
      { durationSeconds: 180 },
    ],
  ]);
  const { loadRoute } = createLoader(overrides);

  const result = await recommendIntegratedRoute({
    origin,
    destination,
    stations,
    bikeRouteMode: "SHORTEST",
    loadRoute,
    candidatePoolSize: 4,
    finalCandidateCount: 4,
  });

  assert.equal(result.startStation.id, "start-faster-total");
  assert.equal(result.endStation.id, "return-faster-total");
  assert.equal(result.optimizedForTotalRoute, true);
  assert.equal(result.adjustedForAvailability, false);
  assert.equal(result.geometry.walkTo.durationSeconds, 240);
  assert.equal(result.geometry.bike.durationSeconds, 900);
  assert.equal(result.geometry.walkFrom.durationSeconds, 180);
});

test("0대로 확인된 가장 가까운 출발 대여소를 제외한다", async () => {
  const unavailableStations = stations.map((station, index) =>
    index === 0 ? { ...station, bikes: 0 } : station,
  );
  const { calls, loadRoute } = createLoader();

  const result = await recommendIntegratedRoute({
    origin,
    destination,
    stations: unavailableStations,
    bikeRouteMode: "SHORTEST",
    loadRoute,
    candidatePoolSize: 4,
    finalCandidateCount: 3,
  });

  assert.notEqual(result.startStation.id, "start-nearest");
  assert.equal(result.adjustedForAvailability, true);
  assert.equal(
    calls.some(
      ({ mode, to }) =>
        mode === "walk" &&
        routeKey(origin, to) ===
          routeKey(origin, unavailableStations[0].coordinates),
    ),
    false,
  );
});

test("사용자가 고른 반납 대여소는 유지하면서 출발 대여소를 다시 최적화한다", async () => {
  const overrides = new Map([
    [
      routeKey(origin, stations[0].coordinates),
      { durationSeconds: 60 },
    ],
    [
      routeKey(origin, stations[1].coordinates),
      { durationSeconds: 180 },
    ],
    [
      routeKey(stations[0].coordinates, stations[2].coordinates),
      { durationSeconds: 1_600 },
    ],
    [
      routeKey(stations[1].coordinates, stations[2].coordinates),
      { durationSeconds: 800 },
    ],
  ]);
  const { loadRoute } = createLoader(overrides);

  const result = await recommendIntegratedRoute({
    origin,
    destination,
    stations,
    selectedEndStationId: "return-nearest",
    bikeRouteMode: "BIKE_ONLY",
    loadRoute,
    candidatePoolSize: 4,
    finalCandidateCount: 4,
  });

  assert.equal(result.endStation.id, "return-nearest");
  assert.equal(result.startStation.id, "start-faster-total");
});

test("실제 카카오 경로가 있는 조합을 직선 폴백 조합보다 우선한다", async () => {
  const overrides = new Map([
    [
      routeKey(stations[0].coordinates, stations[2].coordinates),
      { durationSeconds: 60, source: "direct" },
    ],
    [
      routeKey(stations[1].coordinates, stations[3].coordinates),
      { durationSeconds: 1_200, source: "kakao" },
    ],
  ]);
  const { loadRoute } = createLoader(overrides);

  const result = await recommendIntegratedRoute({
    origin,
    destination,
    stations,
    bikeRouteMode: "SHORTEST",
    loadRoute,
    candidatePoolSize: 4,
    finalCandidateCount: 4,
  });

  assert.equal(result.geometry.bike.source, "kakao");
});

test("후보 도보 구간은 한 번씩만 계산하고 자전거 후보 조합만 비교한다", async () => {
  const { calls, loadRoute } = createLoader();

  const result = await recommendIntegratedRoute({
    origin,
    destination,
    stations,
    bikeRouteMode: "SHORTEST",
    loadRoute,
    candidatePoolSize: 4,
    finalCandidateCount: 3,
  });

  const walkCalls = calls.filter(({ mode }) => mode === "walk");
  const bikeCalls = calls.filter(({ mode }) => mode === "bike");
  assert.equal(walkCalls.length, 8);
  assert.equal(bikeCalls.length, 6);
  assert.equal(result.evaluatedCombinationCount, 6);
  assert.equal(
    bikeCalls.some(({ from, to }) => routeKey(from, to) === routeKey(from, from)),
    false,
  );
});
