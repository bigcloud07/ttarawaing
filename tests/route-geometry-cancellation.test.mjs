import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

let importSequence = 0;

async function importFreshRouteGeometry() {
  const moduleUrl = new URL("../app/route-geometry.ts", import.meta.url);
  moduleUrl.searchParams.set("cancellation-test", String(importSequence += 1));
  return import(moduleUrl.href);
}

function routeInput(offset = 0) {
  return {
    origin: [37.5 + offset, 126.9 + offset],
    startStation: [37.501 + offset, 126.901 + offset],
    endStation: [37.502 + offset, 126.902 + offset],
    destination: [37.503 + offset, 126.903 + offset],
  };
}

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

function hangingFetch(onRequest) {
  return (_url, init = {}) => {
    onRequest(init.signal);
    return new Promise((_resolve, reject) => {
      const signal = init.signal;
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      signal?.addEventListener("abort", () => reject(abortError()), {
        once: true,
      });
    });
  };
}

function successfulRouteResponse(url) {
  const encodedCoordinates = String(url).match(
    /\/route\/v1\/driving\/([^?]+)/,
  )?.[1];
  assert.ok(encodedCoordinates, "the OSRM URL contains route coordinates");
  const coordinates = decodeURIComponent(encodedCoordinates)
    .split(";")
    .map((coordinate) => coordinate.split(",").map(Number));
  const legCount = coordinates.length - 1;

  return {
    ok: true,
    status: 200,
    async json() {
      return {
        code: "Ok",
        routes: [
          {
            distance: legCount * 100,
            duration: legCount * 60,
            legs: Array.from({ length: legCount }, () => ({
              distance: 100,
              duration: 60,
            })),
            geometry: {
              type: "LineString",
              coordinates,
            },
          },
        ],
        waypoints: coordinates.map(() => ({ distance: 0 })),
      };
    },
  };
}

async function waitUntil(predicate, timeoutMs = 500) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out waiting for the expected test state.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function rejectsPromptly(promise, timeoutMs = 250) {
  let timeoutId;
  try {
    await Promise.race([
      assert.rejects(promise, (error) => error?.name === "AbortError"),
      new Promise((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("The canceled route did not reject promptly.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolvesWithin(promise, timeoutMs) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("The current caller was canceled too.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

test("queued and active route requests abort promptly without starting later segments", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  const requestedSignals = [];
  globalThis.fetch = hangingFetch((signal) => requestedSignals.push(signal));
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const activeController = new AbortController();
  const queuedController = new AbortController();
  const active = loadRouteGeometry(routeInput(0), {
    signal: activeController.signal,
  });
  await waitUntil(() => requestedSignals.length === 1);
  const queued = loadRouteGeometry(routeInput(0.02), queuedController.signal);

  queuedController.abort();
  await rejectsPromptly(queued);
  assert.equal(requestedSignals.length, 1, "the canceled queued request never fetched");

  activeController.abort();
  await rejectsPromptly(active);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(requestedSignals.length, 1, "abort did not start bike or final walk requests");
  assert.equal(requestedSignals[0].aborted, true, "active fetch received the abort");
});

test("aborting during the throttle wait skips the next route segment", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async (url) => {
    requestCount += 1;
    return successfulRouteResponse(url);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const controller = new AbortController();
  const pending = loadRouteGeometry(routeInput(0.04), controller.signal);
  await waitUntil(() => requestCount === 1);
  await new Promise((resolve) => setTimeout(resolve, 20));

  controller.abort();
  await rejectsPromptly(pending);
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  assert.equal(requestCount, 1, "the bicycle request was canceled before fetch");
});

test("canceling one same-key caller does not cancel another caller's request", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = (url, init = {}) => {
    requestCount += 1;
    if (requestCount === 1) {
      return hangingFetch(() => {})(url, init);
    }
    return Promise.resolve(successfulRouteResponse(url));
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const point = [37.55, 126.95];
  const input = {
    origin: point,
    startStation: point,
    endStation: point,
    destination: point,
  };
  const canceledController = new AbortController();
  const currentController = new AbortController();
  const canceled = loadRouteGeometry(input, canceledController.signal);
  await waitUntil(() => requestCount === 1);
  const current = loadRouteGeometry(input, currentController.signal);

  canceledController.abort();
  await rejectsPromptly(canceled);
  const geometry = await resolvesWithin(current, 4_000);

  assert.equal(geometry.walkTo.source, "osrm");
  assert.equal(geometry.bike.source, "osrm");
  assert.equal(geometry.walkFrom.source, "osrm");
  assert.equal(requestCount, 3, "the current caller completed its own foot and bike requests");
});
