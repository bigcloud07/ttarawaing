import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

let importSequence = 0;

async function importFreshRouteGeometry() {
  const moduleUrl = new URL("../app/route-geometry.ts", import.meta.url);
  moduleUrl.searchParams.set("fallback-test", String(importSequence += 1));
  return import(moduleUrl.href);
}

function routeInput(offset = 0) {
  return {
    origin: [37.51 + offset, 126.91 + offset],
    startStation: [37.511 + offset, 126.911 + offset],
    endStation: [37.512 + offset, 126.912 + offset],
    destination: [37.513 + offset, 126.913 + offset],
  };
}

function parseRequestedCoordinates(url) {
  const encodedCoordinates = String(url).match(
    /\/route\/v1\/driving\/([^?]+)/,
  )?.[1];
  assert.ok(encodedCoordinates, "the OSRM URL contains route coordinates");
  return decodeURIComponent(encodedCoordinates)
    .split(";")
    .map((coordinate) => coordinate.split(",").map(Number));
}

function successfulRouteResponse(url) {
  const coordinates = parseRequestedCoordinates(url);
  const geometryCoordinates = coordinates.flatMap((coordinate, index) => {
    if (index === coordinates.length - 1) return [coordinate];
    const next = coordinates[index + 1];
    return [
      coordinate,
      [
        (coordinate[0] + next[0]) / 2 + 0.00005,
        (coordinate[1] + next[1]) / 2 + 0.00005,
      ],
    ];
  });
  const legCount = coordinates.length - 1;

  return {
    ok: true,
    status: 200,
    async json() {
      return {
        code: "Ok",
        routes: [
          {
            distance: legCount * 180,
            duration: legCount * 90,
            legs: Array.from({ length: legCount }, () => ({
              distance: 180,
              duration: 90,
            })),
            geometry: {
              type: "LineString",
              coordinates: geometryCoordinates,
            },
          },
        ],
        waypoints: coordinates.map(() => ({ distance: 0 })),
      };
    },
  };
}

function failedRouteResponse() {
  return {
    ok: false,
    status: 503,
    async json() {
      return {};
    },
  };
}

async function resolvesWithin(promise, timeoutMs = 4_000) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Route fallback did not finish in time.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

test("a failed bicycle route falls back only that segment while both walks keep road geometry", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async (url) => {
    requestCount += 1;
    return requestCount === 2
      ? failedRouteResponse()
      : successfulRouteResponse(url);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const geometry = await resolvesWithin(loadRouteGeometry(routeInput(0.01)));

  assert.equal(requestCount, 3);
  assert.equal(geometry.walkTo.source, "osrm");
  assert.ok(geometry.walkTo.path.length > 2, "the first walk keeps its road path");
  assert.equal(geometry.bike.source, "direct");
  assert.equal(geometry.bike.path.length, 2);
  assert.deepEqual(geometry.bikeLegs.map((leg) => leg.source), ["direct"]);
  assert.equal(geometry.walkFrom.source, "osrm");
  assert.ok(geometry.walkFrom.path.length > 2, "the final walk keeps its road path");
});

test("one failed walk does not discard the successful bicycle and other walk routes", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async (url) => {
    requestCount += 1;
    return requestCount === 1
      ? failedRouteResponse()
      : successfulRouteResponse(url);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const geometry = await resolvesWithin(loadRouteGeometry(routeInput(0.03)));

  assert.equal(requestCount, 3);
  assert.equal(geometry.walkTo.source, "direct");
  assert.equal(geometry.walkTo.path.length, 2);
  assert.equal(geometry.bike.source, "osrm");
  assert.ok(geometry.bike.path.length > 2, "the bicycle road path is preserved");
  assert.deepEqual(geometry.bikeLegs.map((leg) => leg.source), ["osrm"]);
  assert.equal(geometry.walkFrom.source, "osrm");
  assert.ok(geometry.walkFrom.path.length > 2, "the successful walk road path is preserved");
});

test("all failed requests return a complete direct fallback in finite time", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return failedRouteResponse();
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const geometry = await resolvesWithin(loadRouteGeometry(routeInput(0.05)));

  assert.equal(requestCount, 3);
  assert.deepEqual(
    [geometry.walkTo.source, geometry.bike.source, geometry.walkFrom.source],
    ["direct", "direct", "direct"],
  );
  assert.deepEqual(geometry.bikeLegs.map((leg) => leg.source), ["direct"]);
  for (const segment of [geometry.walkTo, geometry.bike, geometry.walkFrom]) {
    assert.equal(segment.path.length, 2);
    assert.ok(Number.isFinite(segment.distanceMeters));
    assert.ok(Number.isFinite(segment.durationSeconds));
  }
});
