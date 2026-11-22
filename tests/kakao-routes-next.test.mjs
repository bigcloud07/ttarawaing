import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/routes/route.ts";

function routeRequest(init = {}) {
  return new Request("http://localhost/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "bike",
      coordinates: [
        [37.1, 127.1],
        [37.2, 127.2],
      ],
    }),
    ...init,
  });
}

function withKakao(t, fetch) {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KAKAO_REST_API_KEY;
  globalThis.fetch = fetch;
  process.env.KAKAO_REST_API_KEY = "test-rest-key";
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = originalKey;
  });
}

test("returns only the route fields the client reads", async (t) => {
  withKakao(t, async () =>
    Response.json({
      status: "OK",
      route: {
        properties: { totalDistance: 157, totalTime: 40, landingUrl: "https://map.kakao.com/" },
        legs: [
          {
            properties: { distance: 157, time: 40 },
            steps: [
              {
                properties: { distance: 157, time: 40, guidance: "157m 이동", x: 127.1, y: 37.1 },
                path: { points: [[127.1, 37.1], [127.2, 37.2]] },
              },
            ],
          },
        ],
      },
    }),
  );

  const response = await POST(routeRequest());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-ttarawaing-route-profile"), "bike");
  assert.deepEqual(await response.json(), {
    status: "OK",
    route: {
      legs: [
        {
          properties: { distance: 157, time: 40 },
          steps: [{ path: { points: [[127.1, 37.1], [127.2, 37.2]] } }],
        },
      ],
    },
  });
});

test("cancels the Kakao request when the client disconnects", async (t) => {
  let upstreamSignal;
  withKakao(t, (_url, init) => {
    upstreamSignal = init.signal;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), {
        once: true,
      });
    });
  });
  const client = new AbortController();

  const pending = POST(routeRequest({ signal: client.signal }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  client.abort();
  const response = await pending;

  assert.equal(upstreamSignal.aborted, true);
  assert.equal(response.status, 499);
});
