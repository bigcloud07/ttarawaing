import assert from "node:assert/strict";
import test from "node:test";
import {
  createDraggedRoutePlace,
  isSupportedRouteCoordinate,
} from "../app/route-endpoint-drag.ts";

test("creates a dragged place from the most useful Kakao address fields", () => {
  const place = createDraggedRoutePlace(
    "origin",
    [37.5665, 126.978],
    {
      address: "서울 중구 태평로1가 31",
      roadAddress: "서울 중구 세종대로 110",
      buildingName: "서울특별시청",
    },
  );

  assert.deepEqual(place, {
    id: "map:37.566500,126.978000",
    name: "서울특별시청",
    address: "서울 중구 세종대로 110",
    hint: "지도에서 직접 지정",
    coordinates: [37.5665, 126.978],
  });
});

test("falls back to the parcel address or a transparent map label", () => {
  const parcelPlace = createDraggedRoutePlace(
    "destination",
    [37.5, 127],
    {
      address: "서울 송파구 잠실동 40",
      roadAddress: "",
      buildingName: "",
    },
  );
  const coordinatePlace = createDraggedRoutePlace(
    "destination",
    [37.5, 127],
    null,
  );

  assert.equal(parcelPlace.name, "서울 송파구 잠실동 40");
  assert.equal(parcelPlace.address, "서울 송파구 잠실동 40");
  assert.equal(coordinatePlace.name, "지도에서 선택한 도착지");
  assert.equal(coordinatePlace.address, "위도 37.50000, 경도 127.00000");
  assert.equal(parcelPlace.id, coordinatePlace.id);
});

test("accepts Seoul and Gyeonggi coordinates and rejects distant points", () => {
  assert.equal(isSupportedRouteCoordinate([37.5665, 126.978]), true);
  assert.equal(isSupportedRouteCoordinate([37.2636, 127.0286]), true);
  assert.equal(isSupportedRouteCoordinate([35.1796, 129.0756]), false);
  assert.equal(isSupportedRouteCoordinate([Number.NaN, 127]), false);
});
