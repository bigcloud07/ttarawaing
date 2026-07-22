import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

let importSequence = 0;

async function importFreshRouteGeometry() {
  const moduleUrl = new URL("../app/route-geometry.ts", import.meta.url);
  moduleUrl.searchParams.set("access-test", String(importSequence += 1));
  return import(moduleUrl.href);
}

const origin = [37.488248973536535, 126.96780616783967];
const startStation = [37.48683548, 126.9680481];
const endStation = [37.47608948, 126.98133087];
const destination = [37.47656223234824, 126.98155858357366];
const roadAccess = [37.487918, 126.967416];
const partialRoadAccess = [37.488, 126.9675];

const input = {
  origin,
  originAddress: "서울 동작구 사당로9가길 82",
  startStation,
  endStation,
  destination,
  destinationAddress: "서울 동작구 사당로 지하 310",
};

function parseRequestedCoordinates(url) {
  const encodedCoordinates = String(url).match(
    /\/route\/v1\/driving\/([^?]+)/,
  )?.[1];
  assert.ok(encodedCoordinates, "the OSRM URL contains route coordinates");
  return decodeURIComponent(encodedCoordinates)
    .split(";")
    .map((coordinate) => coordinate.split(",").map(Number));
}

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

function routeResponse({
  coordinates,
  distance,
  duration,
  waypointDistances,
  withLegs = false,
}) {
  return response({
    code: "Ok",
    routes: [
      {
        distance,
        duration,
        legs: withLegs
          ? Array.from({ length: coordinates.length - 1 }, () => ({
              distance,
              duration,
            }))
          : undefined,
        geometry: {
          type: "LineString",
          coordinates,
        },
      },
    ],
    waypoints: coordinates
      .filter((_, index) => index === 0 || index === coordinates.length - 1)
      .map((coordinate, index) => ({
        distance: waypointDistances[index] ?? 0,
        location: coordinate,
      })),
  });
}

function genericRouteResponse(url, withLegs = false) {
  const coordinates = parseRequestedCoordinates(url);
  return routeResponse({
    coordinates,
    distance: 120 * (coordinates.length - 1),
    duration: 72 * (coordinates.length - 1),
    waypointDistances: [0, 0],
    withLegs,
  });
}

async function resolvesWithin(promise, timeoutMs = 9_000) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Access-corrected route did not finish in time.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

test("extracts the road that should anchor an apartment access route", async () => {
  const { extractFootAccessRoadName } = await importFreshRouteGeometry();
  assert.equal(
    extractFootAccessRoadName("서울 동작구 사당로9가길 82"),
    "사당로9가길",
  );
  assert.equal(
    extractFootAccessRoadName("서울 동작구 사당로 지하 310"),
    "사당로",
  );
  assert.equal(extractFootAccessRoadName("주소 정보 없음"), null);
});

test("includes address-road access semantics in the route cache key", async () => {
  const { createRouteGeometryKey } = await importFreshRouteGeometry();
  const keyWithoutAddress = createRouteGeometryKey({
    origin,
    startStation,
    endStation,
    destination,
  });
  const keyWithAddress = createRouteGeometryKey(input);

  assert.notEqual(keyWithAddress, keyWithoutAddress);
  assert.match(keyWithAddress, /^v2\|/);
  assert.match(keyWithAddress, /from:사당로9가길/);
  assert.match(keyWithAddress, /to:사당로/);
});

test("reroutes the Sadang apartment walk through its real road access", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const requestedUrl = String(url);
    requestedUrls.push(requestedUrl);

    if (requestedUrl.includes("/nearest/v1/driving/")) {
      return response({
        code: "Ok",
        waypoints: [
          {
            name: "",
            distance: 38.54895891,
            location: [126.968138, 37.488474],
          },
          {
            name: "사당로9가길10길",
            distance: 40,
            location: [partialRoadAccess[1], partialRoadAccess[0]],
          },
          {
            name: "사당로9가길",
            distance: 50.39490207,
            location: [roadAccess[1], roadAccess[0]],
          },
          {
            name: "사당로9가길",
            distance: 53.4831265,
            location: [126.96727, 37.488026],
          },
        ],
      });
    }

    if (requestedUrl.includes("/table/v1/driving/")) {
      return response({ code: "Ok", distances: [[145.9], [163.5], [1]] });
    }

    if (requestedUrl.includes("/routed-bike/")) {
      return genericRouteResponse(requestedUrl, true);
    }

    const coordinates = parseRequestedCoordinates(requestedUrl);
    const [firstLongitude, firstLatitude] = coordinates[0];
    if (
      Math.abs(firstLatitude - origin[0]) < 0.000001 &&
      Math.abs(firstLongitude - origin[1]) < 0.000001
    ) {
      return routeResponse({
        coordinates: [
          [126.968138, 37.488474],
          [126.967611, 37.488962],
          [126.967382, 37.489311],
          [126.966196, 37.488496],
          [126.967931, 37.486928],
        ],
        distance: 541.2,
        duration: 432.7,
        waypointDistances: [38.54895891, 14.6166001],
      });
    }
    if (
      Math.abs(firstLatitude - roadAccess[0]) < 0.000001 &&
      Math.abs(firstLongitude - roadAccess[1]) < 0.000001
    ) {
      return routeResponse({
        coordinates: [
          [roadAccess[1], roadAccess[0]],
          [126.96761, 37.48752],
          [126.967931, 37.486928],
        ],
        distance: 145.9,
        duration: 116.8,
        waypointDistances: [0, 14.6166001],
      });
    }
    return genericRouteResponse(requestedUrl);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const geometry = await resolvesWithin(loadRouteGeometry(input));
  const requestCountAfterFirstLoad = requestedUrls.length;
  const cachedGeometry = await resolvesWithin(loadRouteGeometry(input), 500);

  assert.equal(requestedUrls.length, requestCountAfterFirstLoad);
  assert.equal(geometry.walkTo.source, "osrm");
  assert.deepEqual(geometry.walkTo.path[0], origin);
  assert.deepEqual(geometry.walkTo.path.at(-1), startStation);
  assert.ok(
    geometry.walkTo.path.some(
      ([latitude, longitude]) =>
        Math.abs(latitude - roadAccess[0]) < 0.000001 &&
        Math.abs(longitude - roadAccess[1]) < 0.000001,
    ),
  );
  assert.ok(
    Math.max(...geometry.walkTo.path.map(([latitude]) => latitude)) < 37.4883,
    "the corrected route no longer climbs north into the campus",
  );
  assert.ok(geometry.walkTo.distanceMeters > 209);
  assert.ok(geometry.walkTo.distanceMeters < 213);
  assert.ok(geometry.walkTo.durationSeconds > 166);
  assert.ok(geometry.walkTo.durationSeconds < 171);
  assert.deepEqual(cachedGeometry.walkTo, geometry.walkTo);
  assert.ok(requestedUrls.some((url) => url.includes("/nearest/v1/driving/")));
  const tableUrl = requestedUrls.find((url) =>
    url.includes("/table/v1/driving/"),
  );
  assert.ok(tableUrl);
  assert.doesNotMatch(
    tableUrl,
    new RegExp(`${partialRoadAccess[1].toFixed(6)},${partialRoadAccess[0].toFixed(6)}`),
  );
});

test("keeps a valid primary route but retries after transient access recovery failure", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  let primaryWalkRequests = 0;
  let nearestRequests = 0;
  globalThis.fetch = async (url) => {
    const requestedUrl = String(url);
    if (requestedUrl.includes("/nearest/v1/driving/")) {
      nearestRequests += 1;
      return response({}, 503);
    }
    if (requestedUrl.includes("/routed-bike/")) {
      return genericRouteResponse(requestedUrl, true);
    }

    const coordinates = parseRequestedCoordinates(requestedUrl);
    const [firstLongitude, firstLatitude] = coordinates[0];
    if (
      Math.abs(firstLatitude - origin[0]) < 0.000001 &&
      Math.abs(firstLongitude - origin[1]) < 0.000001
    ) {
      primaryWalkRequests += 1;
      return routeResponse({
        coordinates: [
          [126.968138, 37.488474],
          [126.967382, 37.489311],
          [126.967931, 37.486928],
        ],
        distance: 541.2,
        duration: 432.7,
        waypointDistances: [38.54895891, 14.6166001],
      });
    }
    return genericRouteResponse(requestedUrl);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const first = await resolvesWithin(loadRouteGeometry(input));
  const second = await resolvesWithin(loadRouteGeometry(input));

  assert.equal(first.walkTo.source, "osrm");
  assert.equal(second.walkTo.source, "osrm");
  assert.ok(first.walkTo.distanceMeters > 594);
  assert.ok(first.walkTo.distanceMeters < 595);
  assert.equal(primaryWalkRequests, 2);
  assert.equal(nearestRequests, 2);
});

test("does not cache a direct fallback after transient access recovery failure", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  let primaryWalkRequests = 0;
  let nearestRequests = 0;
  globalThis.fetch = async (url) => {
    const requestedUrl = String(url);
    if (requestedUrl.includes("/nearest/v1/driving/")) {
      nearestRequests += 1;
      return response({}, 503);
    }
    if (requestedUrl.includes("/routed-bike/")) {
      return genericRouteResponse(requestedUrl, true);
    }

    const coordinates = parseRequestedCoordinates(requestedUrl);
    const [firstLongitude, firstLatitude] = coordinates[0];
    if (
      Math.abs(firstLatitude - origin[0]) < 0.000001 &&
      Math.abs(firstLongitude - origin[1]) < 0.000001
    ) {
      primaryWalkRequests += 1;
      return routeResponse({
        coordinates: [
          [126.968138, 37.488474],
          [126.967382, 37.489311],
          [126.967931, 37.486928],
        ],
        distance: 801,
        duration: 640,
        waypointDistances: [38.54895891, 14.6166001],
      });
    }
    return genericRouteResponse(requestedUrl);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const first = await resolvesWithin(loadRouteGeometry(input));
  const second = await resolvesWithin(loadRouteGeometry(input));

  assert.equal(first.walkTo.source, "direct");
  assert.equal(second.walkTo.source, "direct");
  assert.equal(primaryWalkRequests, 2);
  assert.equal(nearestRequests, 2);
});
