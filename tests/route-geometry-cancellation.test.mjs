import assert from "node:assert/strict";
import test from "node:test";

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

function successfulRouteResponse(init = {}) {
  const request = JSON.parse(String(init.body));
  const legs = request.coordinates.slice(0, -1).map((from, index) => {
    const to = request.coordinates[index + 1];
    return {
      properties: { distance: 100, time: 60 },
      steps: [
        {
          properties: { distance: 100, time: 60, x: from[1], y: from[0] },
          path: { points: [[from[1], from[0]], [to[1], to[0]]] },
        },
      ],
    };
  });
  return Response.json(
    {
      status: "OK",
      route: {
        properties: {
          totalDistance: legs.length * 100,
          totalTime: legs.length * 60,
          landingUrl: "https://map.kakao.com/",
        },
        legs,
      },
    },
    {
      headers: {
        "X-Ttarawaing-Route-Profile": request.mode,
        ...(request.mode === "bike"
          ? { "X-Ttarawaing-Bike-Route-Mode": request.bikeRouteMode ?? "SHORTEST" }
          : {}),
      },
    },
  );
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

test("aborting a route cancels all three parallel Kakao segment requests", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  const requestedSignals = [];
  globalThis.fetch = hangingFetch((signal) => requestedSignals.push(signal));
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const controller = new AbortController();
  const pending = loadRouteGeometry(routeInput(0), {
    signal: controller.signal,
  });
  await waitUntil(() => requestedSignals.length === 3);

  controller.abort();
  await rejectsPromptly(pending);
  await waitUntil(() => requestedSignals.every((signal) => signal.aborted));
});

test("an already canceled route never starts a Kakao request", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Promise(() => {});
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    loadRouteGeometry(routeInput(0.04), controller.signal),
    { name: "AbortError" },
  );
  assert.equal(requestCount, 0);
});

function deferredFetch() {
  const pending = [];
  const fetch = (_url, init = {}) =>
    new Promise((resolve, reject) => {
      pending.push({ init, resolve: () => resolve(successfulRouteResponse(init)) });
      init.signal?.addEventListener("abort", () => reject(abortError()), {
        once: true,
      });
    });
  return { fetch, pending };
}

test("canceling one same-key caller keeps the shared Kakao requests for another caller", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  const upstream = deferredFetch();
  globalThis.fetch = upstream.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const input = routeInput(0.08);
  const canceledController = new AbortController();
  const canceled = loadRouteGeometry(input, canceledController.signal);
  await waitUntil(() => upstream.pending.length === 3);
  const current = loadRouteGeometry(input, new AbortController().signal);

  canceledController.abort();
  await rejectsPromptly(canceled);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(upstream.pending.some(({ init }) => init.signal.aborted), false);
  upstream.pending.forEach(({ resolve }) => resolve());
  const geometry = await current;

  assert.equal(geometry.walkTo.source, "kakao");
  assert.equal(geometry.bike.source, "kakao");
  assert.equal(geometry.walkFrom.source, "kakao");
  assert.equal(upstream.pending.length, 3);
});

test("a caller that restarts right after its abort reuses the in-flight Kakao requests", async (t) => {
  const { loadRouteGeometry } = await importFreshRouteGeometry();
  const originalFetch = globalThis.fetch;
  const upstream = deferredFetch();
  globalThis.fetch = upstream.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const input = routeInput(0.12);
  const firstRun = new AbortController();
  const first = loadRouteGeometry(input, firstRun.signal);
  await waitUntil(() => upstream.pending.length === 3);
  firstRun.abort();
  const rerun = loadRouteGeometry(input, new AbortController().signal);

  await rejectsPromptly(first);
  await new Promise((resolve) => setTimeout(resolve, 10));
  upstream.pending.forEach(({ resolve }) => resolve());
  const geometry = await rerun;

  assert.equal(geometry.bike.source, "kakao");
  assert.equal(upstream.pending.length, 3);
});
