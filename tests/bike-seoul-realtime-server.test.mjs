import assert from "node:assert/strict";
import test from "node:test";
import {
  BIKE_SEOUL_REALTIME_URL,
  requestBikeSeoulRealtime,
} from "../app/bike-seoul-realtime-server.ts";

function requestWith(fetchImpl, options = {}) {
  return requestBikeSeoulRealtime({
    signal: new AbortController().signal,
    fetchImpl,
    attemptTimeoutMs: 50,
    retryDelaysMs: [0, 0],
    ...options,
  });
}

test("retries two transient network failures before succeeding", async () => {
  let calls = 0;
  const response = await requestWith(async (input, init) => {
    calls += 1;
    assert.equal(String(input), BIKE_SEOUL_REALTIME_URL);
    assert.equal(init?.method, "POST");
    assert.match(String(init?.body), /stationGrpSeq=ALL/);
    if (calls < 3) throw new TypeError("fetch failed");
    return Response.json({ realtimeList: [] });
  });

  assert.equal(calls, 3);
  assert.equal(response.status, 200);
});

test("uses a fresh abort signal when a timed-out attempt is retried", async () => {
  let calls = 0;
  const attemptSignals = [];
  const response = await requestWith(
    async (_input, init) => {
      calls += 1;
      const signal = init?.signal;
      assert.ok(signal instanceof AbortSignal);
      attemptSignals.push(signal);

      if (calls === 3) return Response.json({ realtimeList: [] });

      return new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(signal.reason),
          { once: true },
        );
      });
    },
    { attemptTimeoutMs: 5 },
  );

  assert.equal(response.status, 200);
  assert.equal(calls, 3);
  assert.equal(new Set(attemptSignals).size, 3);
  assert.equal(attemptSignals[0].aborted, true);
  assert.equal(attemptSignals[1].aborted, true);
  assert.equal(attemptSignals[2].aborted, false);
});

for (const status of [408, 429, 500, 502, 503, 599]) {
  test(`retries a transient ${status} response`, async () => {
    let calls = 0;
    const response = await requestWith(async () => {
      calls += 1;
      if (calls < 3) return new Response("", { status });
      return Response.json({ realtimeList: [] });
    });

    assert.equal(calls, 3);
    assert.equal(response.status, 200);
  });
}

for (const status of [400, 401, 403, 404, 422, 499]) {
  test(`does not retry a non-transient ${status} response`, async () => {
    let calls = 0;

    await assert.rejects(
      requestWith(async () => {
        calls += 1;
        return new Response("", { status });
      }),
      new RegExp(String(status)),
    );

    assert.equal(calls, 1);
  });
}

test("never exceeds the initial request plus two retries", async () => {
  let calls = 0;

  await assert.rejects(
    requestWith(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      if (calls === 2) return new Response("", { status: 429 });
      if (calls === 3) return new Response("", { status: 503 });
      return Response.json({ realtimeList: [] });
    }),
  );

  assert.equal(calls, 3);
});

test("an aborted client request stops the retry sequence", async () => {
  const controller = new AbortController();
  let calls = 0;

  await assert.rejects(
    requestBikeSeoulRealtime({
      signal: controller.signal,
      fetchImpl: async () => {
        calls += 1;
        controller.abort();
        throw new TypeError("fetch failed");
      },
      attemptTimeoutMs: 50,
      retryDelaysMs: [0, 0],
    }),
    { name: "AbortError" },
  );

  assert.equal(calls, 1);
});
