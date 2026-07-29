import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeKakaoAddressResult,
  searchKakaoPlacesWithSdk,
} from "../app/kakao-maps.ts";

function createSdk({ keywordSearch, addressSearch }) {
  return {
    maps: {
      services: {
        Places: class {
          keywordSearch(...args) {
            keywordSearch(...args);
          }
        },
        Geocoder: class {
          addressSearch(...args) {
            addressSearch(...args);
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
        AnalyzeType: {
          SIMILAR: "SIMILAR",
          EXACT: "EXACT",
        },
      },
    },
  };
}

function emptyKeywordSearch(_query, callback) {
  callback([], "ZERO_RESULT", null);
}

function emptyAddressSearch(_query, callback) {
  callback([], "ZERO_RESULT", null);
}

test("keeps existing building-name search results", async () => {
  const sdk = createSdk({
    keywordSearch(query, callback) {
      if (query.startsWith("서울 ")) {
        callback(
          [
            {
              id: "seoul-forest",
              place_name: "서울숲",
              category_name: "관광명소 > 공원",
              address_name: "서울 성동구 성수동1가 685-20",
              road_address_name: "서울 성동구 뚝섬로 273",
              x: "127.037",
              y: "37.544",
            },
          ],
          "OK",
          null,
        );
        return;
      }
      callback([], "ZERO_RESULT", null);
    },
    addressSearch: emptyAddressSearch,
  });

  const results = await searchKakaoPlacesWithSdk(sdk, "서울숲");
  assert.equal(results.length, 1);
  assert.equal(results[0].result_type, "place");
  assert.equal(results[0].place_name, "서울숲");
});

test("finds both road-name and parcel addresses", async (t) => {
  await t.test("road-name address", async () => {
    const sdk = createSdk({
      keywordSearch: emptyKeywordSearch,
      addressSearch(query, callback) {
        if (query.startsWith("서울 ")) {
          callback(
            [
              {
                address_name: "서울 동작구 사당로9가길 82",
                address_type: "ROAD_ADDR",
                x: "126.967806",
                y: "37.488249",
                address: {
                  address_name: "서울 동작구 사당동 1131",
                },
                road_address: {
                  address_name: "서울 동작구 사당로9가길 82",
                  building_name: "사당경남아너스빌아파트",
                },
              },
            ],
            "OK",
            null,
          );
          return;
        }
        callback([], "ZERO_RESULT", null);
      },
    });

    const [result] = await searchKakaoPlacesWithSdk(
      sdk,
      "사당로9가길 82",
    );
    assert.equal(result.result_type, "address");
    assert.equal(result.place_name, "사당경남아너스빌아파트");
    assert.equal(result.road_address_name, "서울 동작구 사당로9가길 82");
    assert.equal(result.address_name, "서울 동작구 사당동 1131");
  });

  await t.test("parcel address", async () => {
    const sdk = createSdk({
      keywordSearch: emptyKeywordSearch,
      addressSearch(query, callback) {
        if (query.startsWith("서울 ")) {
          callback(
            [
              {
                address_name: "서울 동작구 사당동 1131",
                address_type: "REGION_ADDR",
                x: "126.967806",
                y: "37.488249",
                address: {
                  address_name: "서울 동작구 사당동 1131",
                },
                road_address: {
                  address_name: "서울 동작구 사당로9가길 82",
                  building_name: "사당경남아너스빌아파트",
                },
              },
            ],
            "OK",
            null,
          );
          return;
        }
        callback([], "ZERO_RESULT", null);
      },
    });

    const [result] = await searchKakaoPlacesWithSdk(sdk, "사당동 1131");
    assert.equal(result.result_type, "address");
    assert.equal(result.address_type, "REGION_ADDR");
    assert.match(result.id, /^address:/);
  });
});

test("normalizes address results with stable coordinates and rejects invalid ones", () => {
  const input = {
    address_name: "경기 성남시 분당구 판교역로 166",
    address_type: "ROAD_ADDR",
    x: "127.1107",
    y: "37.3947",
    road_address: {
      address_name: "경기 성남시 분당구 판교역로 166",
      building_name: "카카오판교아지트",
    },
  };
  const first = normalizeKakaoAddressResult(input);
  const second = normalizeKakaoAddressResult(input);

  assert.deepEqual(first, second);
  assert.equal(first.place_name, "카카오판교아지트");
  assert.equal(first.x, "127.1107");
  assert.equal(first.y, "37.3947");
  assert.equal(
    normalizeKakaoAddressResult({
      address_name: "서울 좌표 없는 주소",
      x: "",
      y: "",
    }),
    null,
  );
});

test("keeps partial results and filters unsupported regions", async () => {
  const sdk = createSdk({
    keywordSearch(_query, callback) {
      callback([], "ERROR", null);
    },
    addressSearch(query, callback) {
      callback(
        query.startsWith("서울 ")
          ? [
              {
                address_name: "서울 중구 세종대로 110",
                address_type: "ROAD_ADDR",
                x: "126.978",
                y: "37.5665",
                road_address: {
                  address_name: "서울 중구 세종대로 110",
                },
              },
              {
                address_name: "부산 중구 중앙대로 1",
                address_type: "ROAD_ADDR",
                x: "129.036",
                y: "35.106",
                road_address: {
                  address_name: "부산 중구 중앙대로 1",
                },
              },
            ]
          : [],
        query.startsWith("서울 ") ? "OK" : "ZERO_RESULT",
        null,
      );
    },
  });

  const results = await searchKakaoPlacesWithSdk(sdk, "세종대로 110");
  assert.equal(results.length, 1);
  assert.equal(results[0].road_address_name, "서울 중구 세종대로 110");
});

test("does not add regional prefixes to an already qualified address", async () => {
  const keywordQueries = [];
  const addressQueries = [];
  const sdk = createSdk({
    keywordSearch(query, callback) {
      keywordQueries.push(query);
      callback([], "ZERO_RESULT", null);
    },
    addressSearch(query, callback) {
      addressQueries.push(query);
      callback([], "ZERO_RESULT", null);
    },
  });

  assert.deepEqual(
    await searchKakaoPlacesWithSdk(
      sdk,
      "경기도 성남시 분당구 판교역로 166",
    ),
    [],
  );
  assert.deepEqual(keywordQueries, ["경기도 성남시 분당구 판교역로 166"]);
  assert.deepEqual(addressQueries, ["경기도 성남시 분당구 판교역로 166"]);
});
