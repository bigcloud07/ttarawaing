import assert from "node:assert/strict";
import test from "node:test";

let importSequence = 0;

async function importFreshRouteGeometry() {
  const moduleUrl = new URL("../app/route-geometry.ts", import.meta.url);
  moduleUrl.searchParams.set("point-to-point-test", String(importSequence += 1));
  return import(moduleUrl.href);
}

function parseRouteRequest(init = {}) {
  assert.equal(init.method, "POST");
  return JSON.parse(String(init.body));
}

function successfulRouteResponse(init = {}) {
  const request = parseRouteRequest(init);
  const [from, to] = request.coordinates;
  const midpoint = [
    (from[0] + to[0]) / 2 + 0.00005,
    (from[1] + to[1]) / 2 + 0.00005,
  ];
  return Response.json(
    {
      status: "OK",
      route: {
        properties: {
          totalDistance: 321,
          totalTime: 123,
          landingUrl: "https://map.kakao.com/",
        },
        legs: [
          {
            properties: { distance: 321, time: 123 },
            steps: [
              {
                properties: {
                  distance: 321,
                  time: 123,
                  x: from[1],
                  y: from[0],
                },
                path: {
                  points: [
                    [from[1], from[0]],
                    [midpoint[1], midpoint[0]],
                    [to[1], to[0]],
                  ],
                },
              },
            ],
          },
        ],
      },
    },
    {
      headers: {
        "X-Ttarawaing-Route-Profile": request.mode,
        ...(request.mode === "bike"
          ? {
              "X-Ttarawaing-Bike-Route-Mode":
                request.bikeRouteMode ?? "SHORTEST",
            }
          : {}),
      },
    },
  );
}

test("loads and caches a strict point-to-point walking route", async (t) => {
  const { loadPointToPointRoute } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(parseRouteRequest(init));
    return successfulRouteResponse(init);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const input = {
    mode: "walk",
    from: [37.51, 126.91],
    to: [37.512, 126.912],
  };
  const first = await loadPointToPointRoute(input);
  const cached = await loadPointToPointRoute(input);

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    mode: "walk",
    coordinates: [input.from, input.to],
  });
  assert.equal(first.source, "kakao");
  assert.equal(first.distanceMeters, 321);
  assert.equal(first.durationSeconds, 123);
  assert.ok(first.path.length > 2);
  assert.deepEqual(cached, first);
});

test("loads a bicycle segment with the requested bicycle route mode", async (t) => {
  const { loadPointToPointRoute } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, init) => {
    request = parseRouteRequest(init);
    return successfulRouteResponse(init);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const segment = await loadPointToPointRoute({
    mode: "bike",
    from: [37.52, 126.92],
    to: [37.523, 126.923],
    bikeRouteMode: "BIKE_ONLY",
  });

  assert.equal(request.mode, "bike");
  assert.equal(request.bikeRouteMode, "BIKE_ONLY");
  assert.equal(segment.source, "kakao");
  assert.equal(segment.distanceMeters, 321);
});

test("rejects a Kakao failure so callers can choose an explicit direct fallback", async (t) => {
  const {
    createDirectRouteSegment,
    loadPointToPointRoute,
  } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      { error: "Route calculation is temporarily unavailable." },
      { status: 503 },
    );
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const from = [37.53, 126.93];
  const to = [37.534, 126.934];
  await assert.rejects(
    loadPointToPointRoute({ mode: "walk", from, to }),
    /Kakao route proxy returned 503/,
  );

  const fallback = createDirectRouteSegment(from, to, "walk");
  assert.equal(fallback.source, "direct");
  assert.deepEqual(fallback.path, [from, to]);
  assert.ok(Number.isFinite(fallback.distanceMeters));
  assert.ok(Number.isFinite(fallback.durationSeconds));
});

test("forwards point-to-point cancellation and does not replace it with a fallback", async (t) => {
  const { loadPointToPointRoute } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, init = {}) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener(
        "abort",
        () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        { once: true },
      );
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const controller = new AbortController();
  const pending = loadPointToPointRoute(
    {
      mode: "bike",
      from: [37.54, 126.94],
      to: [37.545, 126.945],
    },
    { signal: controller.signal },
  );
  controller.abort();

  await assert.rejects(pending, { name: "AbortError" });
});
