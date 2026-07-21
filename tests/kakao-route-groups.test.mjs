import assert from "node:assert/strict";
import test from "node:test";

import {
  KAKAO_MAX_WAYPOINTS,
  splitKakaoRoutePoints,
} from "../app/kakao-route-groups.ts";

test("카카오맵 한 링크의 경유지 제한 안에서는 경로 순서를 그대로 유지한다", () => {
  const points = Array.from({ length: KAKAO_MAX_WAYPOINTS + 2 }, (_, index) =>
    `point-${index}`,
  );

  assert.deepEqual(splitKakaoRoutePoints(points), [points]);
  assert.deepEqual(splitKakaoRoutePoints([]), []);
  assert.deepEqual(splitKakaoRoutePoints(["only"]), []);
});

test("여러 링크는 맞닿는 지점 하나만 겹치고 전체 지점을 빠짐없이 보존한다", () => {
  const points = Array.from({ length: 17 }, (_, index) => `point-${index}`);
  const groups = splitKakaoRoutePoints(points);

  assert.ok(groups.length >= 2);
  assert.ok(groups.every((group) => group.length <= KAKAO_MAX_WAYPOINTS + 2));
  groups.slice(1).forEach((group, index) => {
    assert.equal(groups[index].at(-1), group[0]);
  });

  const reconstructed = groups.flatMap((group, index) =>
    index === 0 ? group : group.slice(1),
  );
  assert.deepEqual(reconstructed, points);
});
