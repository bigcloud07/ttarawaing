import assert from "node:assert/strict";
import test from "node:test";
import {
  TRANSFER_STOP_OVERHEAD_MINUTES,
  getPassSafeRideMinutes,
  initialMinimumStopCount,
  selectRouteCorridorStations,
  validateBikeLegDurations,
} from "../app/pass-planning.ts";
import { createDirectRouteGeometry } from "../app/route-geometry.ts";

const boundaryCases = [
  {
    passType: "60",
    safeMinutes: 55,
    cases: [
      [54.99, 0],
      [55, 0],
      [55.01, 1],
      [110, 1],
      [110.01, 2],
    ],
  },
  {
    passType: "120",
    safeMinutes: 115,
    cases: [
      [114.99, 0],
      [115, 0],
      [115.01, 1],
      [230, 1],
      [230.01, 2],
    ],
  },
  {
    passType: "180",
    safeMinutes: 175,
    cases: [
      [174.99, 0],
      [175, 0],
      [175.01, 1],
      [350, 1],
      [350.01, 2],
    ],
  },
];

for (const { passType, safeMinutes, cases } of boundaryCases) {
  test(`${passType}분권은 ${safeMinutes}분 경계에서 최소 경유 수를 정확히 계산한다`, () => {
    assert.equal(getPassSafeRideMinutes(passType), safeMinutes);

    for (const [bikeMinutes, expectedStops] of cases) {
      assert.equal(
        initialMinimumStopCount(bikeMinutes, passType),
        expectedStops,
        `${bikeMinutes}분`,
      );
    }
  });

  test(`${passType}분권은 ${safeMinutes}분까지 허용하고 초과 구간만 거부한다`, () => {
    assert.deepEqual(validateBikeLegDurations([safeMinutes - 0.01, safeMinutes], passType), {
      isWithinLimit: true,
      safeMinutes,
      violatingLegIndexes: [],
    });
    assert.deepEqual(validateBikeLegDurations([safeMinutes + 0.01], passType), {
      isWithinLimit: false,
      safeMinutes,
      violatingLegIndexes: [0],
    });
  });

  test(`${passType}분권은 안전시간 두 배까지 경유 1곳으로 나누고 초과 시 최소 2곳을 검토한다`, () => {
    assert.equal(
      validateBikeLegDurations([safeMinutes, safeMinutes], passType).isWithinLimit,
      true,
    );
    assert.equal(
      validateBikeLegDurations([safeMinutes, safeMinutes + 0.01], passType)
        .isWithinLimit,
      false,
    );
    assert.equal(
      validateBikeLegDurations(
        [
          (safeMinutes * 2 + 0.01) / 3,
          (safeMinutes * 2 + 0.01) / 3,
          (safeMinutes * 2 + 0.01) / 3,
        ],
        passType,
      ).isWithinLimit,
      true,
    );
  });
}

test("상관 없음은 긴 이동과 도로 경로 실패값에도 이용권 경유·초과 판정을 만들지 않는다", () => {
  assert.equal(initialMinimumStopCount(1_000, "none"), 0);
  assert.deepEqual(
    validateBikeLegDurations([1_000, Number.NaN, Number.POSITIVE_INFINITY], "none"),
    {
      isWithinLimit: true,
      safeMinutes: null,
      violatingLegIndexes: [],
    },
  );
});

test("제한 이용권은 검증할 수 없는 구간값을 안전하다고 취급하지 않는다", () => {
  assert.deepEqual(
    validateBikeLegDurations([54, Number.NaN, -1, Number.POSITIVE_INFINITY], "60"),
    {
      isWithinLimit: false,
      safeMinutes: 55,
      violatingLegIndexes: [1, 2, 3],
    },
  );
});

const straightRoute = [
  [37.5, 126.9],
  [37.5, 127.0],
  [37.5, 127.1],
];

test("경로 회랑 선택은 출발·도착과 중복 ID를 제외하고 서로 다른 경유지를 순서대로 고른다", () => {
  const stations = [
    { id: "start", coordinates: [37.5, 126.9] },
    { id: "quarter", coordinates: [37.5001, 126.966] },
    { id: "quarter", coordinates: [37.51, 126.966] },
    { id: "three-quarter", coordinates: [37.4999, 127.034] },
    { id: "end", coordinates: [37.5, 127.1] },
  ];

  const selected = selectRouteCorridorStations({
    routePath: straightRoute,
    stations,
    stopCount: 2,
    excludedStationIds: ["start", "end"],
  });

  assert.deepEqual(selected.map(({ id }) => id), ["quarter", "three-quarter"]);
  assert.equal(new Set(selected.map(({ id }) => id)).size, selected.length);
});

test("같은 경유 수에서 실패 후보를 제외하면 다음 합리적 후보 조합을 선택할 수 있다", () => {
  const stations = [
    { id: "primary", coordinates: [37.5, 127.0] },
    { id: "secondary", coordinates: [37.5002, 127.015] },
  ];

  const first = selectRouteCorridorStations({
    routePath: straightRoute,
    stations,
    stopCount: 1,
  });
  assert.deepEqual(first.map(({ id }) => id), ["primary"]);

  const next = selectRouteCorridorStations({
    routePath: straightRoute,
    stations,
    stopCount: 1,
    excludedStationIds: new Set(["primary"]),
  });
  assert.deepEqual(next.map(({ id }) => id), ["secondary"]);
});

test("경로 주변에 필요한 수의 대여소가 없으면 빈 후보를 반환한다", () => {
  const selected = selectRouteCorridorStations({
    routePath: straightRoute,
    stations: [
      { id: "off-route", coordinates: [37.52, 127.0] },
      { id: "endpoint-only", coordinates: [37.5, 126.9] },
    ],
    stopCount: 1,
    excludedStationIds: ["endpoint-only"],
  });

  assert.deepEqual(selected, []);
});

test("직선 폴백은 요청한 모든 경유지를 구간으로 유지하되 도로 검증 성공으로 위장하지 않는다", () => {
  const geometry = createDirectRouteGeometry({
    origin: [37.49, 126.89],
    startStation: [37.5, 126.9],
    transferStations: [
      [37.5, 126.97],
      [37.5, 127.03],
    ],
    endStation: [37.5, 127.1],
    destination: [37.51, 127.11],
  });

  assert.equal(geometry.bike.source, "direct");
  assert.equal(geometry.bikeLegs.length, 3);
  assert.ok(geometry.bikeLegs.every((leg) => leg.source === "direct"));
  assert.deepEqual(
    geometry.bike.path.filter((_, index) => index > 0 && index < 3),
    [
      [37.5, 126.97],
      [37.5, 127.03],
    ],
  );
});

test("경유 처리시간 상수는 경유 0·1·다수에 대해 회당 정확히 3분이다", () => {
  assert.equal(TRANSFER_STOP_OVERHEAD_MINUTES, 3);
  assert.equal(0 * TRANSFER_STOP_OVERHEAD_MINUTES, 0);
  assert.equal(1 * TRANSFER_STOP_OVERHEAD_MINUTES, 3);
  assert.equal(4 * TRANSFER_STOP_OVERHEAD_MINUTES, 12);
});
