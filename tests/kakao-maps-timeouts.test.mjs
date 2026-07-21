import assert from "node:assert/strict";
import test from "node:test";
import {
  KAKAO_CONFIG_TIMEOUT_MS,
  KAKAO_PLACE_SEARCH_TIMEOUT_MS,
  getKakaoJavascriptKey,
  searchKakaoKeyword,
} from "../app/kakao-maps.ts";

function createSearchSdk(keywordSearch) {
  return {
    maps: {
      services: {
        Places: class {
          keywordSearch(...args) {
            keywordSearch(...args);
          }
        },
        Status: {
          OK: "OK",
          ZERO_RESULT: "ZERO_RESULT",
          ERROR: "ERROR",
        },
        SortBy: {
          ACCURACY: "ACCURACY",
          DISTANCE: "DISTANCE",
        },
      },
    },
  };
}

test("bounds Kakao configuration fetches and aborts the pending request", async () => {
  const originalFetch = globalThis.fetch;
  let requestWasAborted = false;
  globalThis.fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener(
        "abort",
        () => {
          requestWasAborted = true;
          reject(init.signal.reason);
        },
        { once: true },
      );
    });

  try {
    await assert.rejects(
      getKakaoJavascriptKey(5),
      /configuration request timed out/i,
    );
    assert.equal(requestWasAborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bounds Kakao configuration response body parsing", async () => {
  const originalFetch = globalThis.fetch;
  let bodyParsingStarted = false;
  globalThis.fetch = async () => ({
    ok: true,
    json: () => {
      bodyParsingStarted = true;
      return new Promise(() => {});
    },
  });

  try {
    await assert.rejects(
      getKakaoJavascriptKey(5),
      /configuration request timed out/i,
    );
    assert.equal(bodyParsingStarted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accepts a valid Kakao key before the configuration deadline", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    assert.equal(init.signal.aborted, false);
    return {
      ok: true,
      json: async () => ({ javascriptKey: "test-javascript-key" }),
    };
  };

  try {
    assert.equal(
      await getKakaoJavascriptKey(50),
      "test-javascript-key",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bounds a Kakao place search when its callback never runs", async () => {
  const sdk = createSearchSdk(() => {});

  await assert.rejects(
    searchKakaoKeyword(sdk, "서울 망원시장", 5),
    /place search request timed out/i,
  );
});

test("preserves Kakao place search success, empty, and error results", async (t) => {
  await t.test("success", async () => {
    const expected = [{ id: "1", place_name: "망원시장" }];
    const sdk = createSearchSdk((_keyword, callback) => {
      callback(expected, "OK", null);
    });
    assert.deepEqual(
      await searchKakaoKeyword(sdk, "서울 망원시장", 50),
      expected,
    );
  });

  await t.test("zero results", async () => {
    const sdk = createSearchSdk((_keyword, callback) => {
      callback([], "ZERO_RESULT", null);
    });
    assert.deepEqual(
      await searchKakaoKeyword(sdk, "서울 없는 장소", 50),
      [],
    );
  });

  await t.test("error", async () => {
    const sdk = createSearchSdk((_keyword, callback) => {
      callback([], "ERROR", null);
    });
    await assert.rejects(
      searchKakaoKeyword(sdk, "서울 오류", 50),
      /place search failed/i,
    );
  });
});

test("uses bounded production timeout defaults", () => {
  assert.ok(KAKAO_CONFIG_TIMEOUT_MS > 0);
  assert.ok(KAKAO_CONFIG_TIMEOUT_MS <= 10_000);
  assert.ok(KAKAO_PLACE_SEARCH_TIMEOUT_MS > 0);
  assert.ok(KAKAO_PLACE_SEARCH_TIMEOUT_MS <= 10_000);
});
