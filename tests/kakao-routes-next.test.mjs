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
