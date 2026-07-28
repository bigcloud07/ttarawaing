import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);
const nearbyMapUrl = new URL("../app/nearby-station-map.tsx", import.meta.url);

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `source start not found: ${start}`);
  assert.notEqual(endIndex, -1, `source end not found: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("가까운 출발·반납 버튼은 최적 경로 버튼 아래에 요구 순서로 렌더링된다", async () => {
  const pageSource = await readFile(pageUrl, "utf8");
  const actionsSource = sourceBetween(
    pageSource,
    '<div\n                className="nearby-station-actions"',
    "{nearbyStationError ? (",
  );

  const findRouteIndex = pageSource.indexOf("최적 경로 찾기");
  const actionsIndex = pageSource.indexOf('className="nearby-station-actions"');
  const rentalIndex = actionsSource.indexOf("가장 가까운 출발 대여소 찾기");
  const returnIndex = actionsSource.indexOf("가장 가까운 반납 대여소 찾기");

  assert.ok(findRouteIndex >= 0);
  assert.ok(findRouteIndex < actionsIndex);
  assert.ok(rentalIndex >= 0);
  assert.ok(rentalIndex < returnIndex);
  assert.match(
    actionsSource,
    /\(\["rental", "return"\] as const\)\.map\(\(kind\) =>/,
  );
  assert.match(
    actionsSource,
    /aria-label="현재 위치에서 가까운 따릉이 대여소 찾기"/,
  );
});

test("보조 버튼은 데스크톱 2열·모바일 1열이며 최소 44px 터치 영역을 갖는다", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /\.nearby-station-actions\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(
    styles,
    /\.nearby-station-button\s*\{[^}]*(?:min-)?height:\s*(?:4[4-9]|[5-9]\d)px/s,
  );

  const mobileStyles = sourceBetween(
    styles,
    "@media (max-width: 900px)",
    "@media (max-width: 480px)",
  );
  assert.match(
    mobileStyles,
    /\.nearby-station-actions\s*\{[^}]*grid-template-columns:\s*1fr/s,
  );
});

test("반납 결과는 확인되지 않은 반납 가능 여부를 약속하지 않는다", async () => {
  const [pageSource, nearbyMapSource] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(nearbyMapUrl, "utf8"),
  ]);

  assert.doesNotMatch(pageSource, /반납 가능/);
  assert.doesNotMatch(nearbyMapSource, /반납 가능/);
  assert.match(
    nearbyMapSource,
    /kind === "rental" \? \([\s\S]*?nearby-result-card__availability/,
  );
});

test("가까운 대여소 조회는 검색 입력과 기존 전체 경로를 변경하지 않고 별도 결과만 갱신한다", async () => {
  const pageSource = await readFile(pageUrl, "utf8");
  const lookupSource = sourceBetween(
    pageSource,
    "const lookupNearbyStation = useCallback(",
    "const resetRoute =",
  );

  assert.match(lookupSource, /setNearbyStationResult\(\{/);
  assert.match(lookupSource, /setMapUserLocation\(currentLocation\)/);
  assert.doesNotMatch(
    lookupSource,
    /\bset(?:Origin|Destination|OriginQuery|DestinationQuery|CommittedRoute)\s*\(/,
  );
  assert.doesNotMatch(
    lookupSource,
    /\b(?:writeActiveRouteSession|clearActiveRouteSession)\s*\(/,
  );

  assert.match(
    pageSource,
    /plan && routeRecommendation && nextRouteLeg \? \([\s\S]*?<RouteMap[\s\S]*?nearbyStationResult=\{nearbyStationResult\}/,
  );
  assert.match(pageSource, /const nearbyLayerRef = useRef<LayerGroup \| null>/);
  assert.match(
    pageSource,
    /const nearbyMapObjectsRef = useRef<KakaoMapObject\[\]>\(\[\]\)/,
  );
});

test("가까운 결과 닫기는 임시 레이어만 정리하고 기존 경로 화면으로 돌아간다", async () => {
  const [pageSource, nearbyMapSource, styles] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(nearbyMapUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);
  const closeSource = sourceBetween(
    pageSource,
    "const closeNearbyStationResult = useCallback(",
    "const lookupNearbyStation = useCallback(",
  );
  const cancelSource = sourceBetween(
    pageSource,
    "const cancelNearbyStationLookup = useCallback(",
    "useEffect(() => {",
  );

  assert.match(closeSource, /cancelNearbyStationLookup\(\)/);
  assert.match(closeSource, /stopMapLocationTracking\(true\)/);
  assert.match(closeSource, /window\.scrollTo\(\{ top: 0, behavior: "auto" \}\)/);
  assert.match(cancelSource, /setNearbyStationResult\(null\)/);
  assert.doesNotMatch(
    `${closeSource}\n${cancelSource}`,
    /\bset(?:Origin|Destination|OriginQuery|DestinationQuery|CommittedRoute)\s*\(/,
  );
  assert.match(
    pageSource,
    /className=\{`map-panel\$\{[\s\S]*?plan \|\| nearbyStationResult \? "" : " is-empty"/,
  );
  assert.match(
    pageSource,
    /nearbyStationResult \? \([\s\S]*?className="map-location-control nearby-home-control"[\s\S]*?onClick=\{onCloseNearbyStation\}/,
  );
  assert.match(
    nearbyMapSource,
    /className="map-location-control nearby-home-control"[\s\S]*?onClick=\{onHome\}/,
  );
  assert.match(nearbyMapSource, /onHome=\{onClose\}/);
  assert.ok(
    nearbyMapSource.indexOf("<Crosshair") <
      nearbyMapSource.indexOf('className="map-location-control nearby-home-control"'),
  );
  assert.match(
    nearbyMapSource,
    /aria-label="가까운 대여소 결과를 닫고 검색 화면으로 돌아가기"/,
  );

  const mobileStyles = sourceBetween(
    styles,
    "@media (max-width: 900px)",
    "@media (max-width: 480px)",
  );
  assert.match(
    styles,
    /\.nearby-home-control\s*\{[^}]*display:\s*none/s,
  );
  assert.match(
    mobileStyles,
    /\.workspace\.has-nearby \.nearby-home-control\s*\{[^}]*display:\s*inline-flex/s,
  );
  assert.match(
    mobileStyles,
    /\.workspace\.has-nearby \.nearby-result-card__close\s*\{[^}]*display:\s*none/s,
  );
  assert.match(
    styles,
    /\.map-location-control\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s,
  );
});

test("경로가 없는 모바일 화면에서도 가까운 결과 지도를 노출하고 자동 이동한다", async () => {
  const [pageSource, styles] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);
  const mobileScrollSource = sourceBetween(
    pageSource,
    "const scrollToMobileMap = useCallback(",
    "const toggleMobileDetails = useCallback(",
  );
  const lookupSource = sourceBetween(
    pageSource,
    "const lookupNearbyStation = useCallback(",
    "const resetRoute =",
  );

  assert.match(
    pageSource,
    /plan \|\| nearbyStationResult \? "" : " is-empty"/,
  );
  assert.match(
    pageSource,
    /\) : nearbyStationResult \? \([\s\S]*?<NearbyStationMap/,
  );
  assert.match(mobileScrollSource, /matchMedia\("\(max-width: 900px\)"\)/);
  assert.match(mobileScrollSource, /mapPanelRef\.current\?\.scrollIntoView\(/);
  assert.match(
    lookupSource,
    /setNearbyStationResult\(\{[\s\S]*?\}\);[\s\S]*?scrollToMobileMap\(\)/,
  );

  const mobileStyles = sourceBetween(
    styles,
    "@media (max-width: 900px)",
    "@media (max-width: 480px)",
  );
  assert.match(mobileStyles, /\.map-panel\.is-empty\s*\{[^}]*display:\s*none/s);
  assert.match(
    mobileStyles,
    /\.workspace\.has-nearby\s*\{[^}]*height:\s*calc\(100dvh - 64px\)[^}]*min-height:\s*0/s,
  );
  assert.match(
    mobileStyles,
    /\.workspace\.has-nearby \.route-panel\s*\{[^}]*display:\s*none/s,
  );
  assert.match(
    mobileStyles,
    /\.workspace\.has-nearby \.map-panel,[\s\S]*?height:\s*100%[^}]*min-height:\s*0/s,
  );
});

test("조회 및 지도 로딩 상태는 보조기기에 알리고 중복 요청을 막는다", async () => {
  const [pageSource, nearbyMapSource] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(nearbyMapUrl, "utf8"),
  ]);
  const actionsSource = sourceBetween(
    pageSource,
    '<div\n                className="nearby-station-actions"',
    "{nearbyStationError ? (",
  );

  assert.match(actionsSource, /aria-label=\{defaultLabel\}/);
  assert.match(actionsSource, /aria-busy=\{isActive\}/);
  assert.match(
    actionsSource,
    /disabled=\{nearbyStationLookupStatus !== "idle"\}/,
  );
  assert.match(actionsSource, /<span>\{isActive \? loadingLabel : defaultLabel\}<\/span>/);
  assert.match(actionsSource, /className="is-spinning"/);
  assert.match(
    pageSource,
    /className="nearby-station-error" role="alert"/,
  );
  assert.match(
    nearbyMapSource,
    /className="map-loading nearby-map-loading"[\s\S]*?role="status"[\s\S]*?aria-live="polite"/,
  );
  assert.match(
    nearbyMapSource,
    /className=\{`nearby-result-card[\s\S]*?aria-live="polite"/,
  );
});

test("가까운 대여소 전용 지도는 기존 위치·방향 상태와 제스처를 두 지도에 공유한다", async () => {
  const [pageSource, nearbyMapSource, styles] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(nearbyMapUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  const standaloneMapSource = sourceBetween(
    pageSource,
    "<NearbyStationMap",
    "/>",
  );
  for (const prop of [
    "userLocation={mapUserLocation}",
    "userHeading={mapUserHeading}",
    "locationFocusRequestId={mapLocationFocusRequestId}",
    "locationStatus={mapLocationStatus}",
    "locationMode={mapLocationMode}",
    "headingStatus={mapHeadingStatus}",
    "onLocate={locateMapUser}",
    "onMapDragStart={handleMapDragStart}",
    "onMapTouchDragStart={handleMapTouchDragStart}",
    "onMapTouchDragEnd={handleMapTouchDragEnd}",
  ]) {
    assert.match(standaloneMapSource, new RegExp(prop.replace(/[{}]/g, "\\$&")));
  }

  assert.match(nearbyMapSource, /className="map-guide-controls nearby-map-location-controls"/);
  assert.match(nearbyMapSource, /className=\{`map-location-control \$\{locationStatus\} \$\{locationMode\}`\}/);
  assert.match(nearbyMapSource, /width:\s*44px|map-location-control/);
  assert.ok(
    (nearbyMapSource.match(/useHeadingUpMapCanvas\(\{/g) ?? []).length >= 2,
  );
  assert.ok(
    (nearbyMapSource.match(/useHeadingAwareMapTouchStart\(\{/g) ?? []).length >=
      2,
  );
  assert.ok(
    (nearbyMapSource.match(/if \(pinchActiveRef\.current\) return/g) ?? [])
      .length >= 2,
  );
  assert.match(nearbyMapSource, /map\.on\("zoomend", settleVisualHeading\)/);
  assert.match(
    nearbyMapSource,
    /sdk\.maps\.event\.addListener\(map, "idle", settleVisualHeading\)/,
  );
  assert.match(nearbyMapSource, /marker\.setLatLng\(markerCoordinates\)/);
  assert.match(nearbyMapSource, /overlay\.setPosition\(position\)/);
  assert.match(
    nearbyMapSource,
    /tryConsumeLocationFocusRequest\(locationFocusRequestId\)/,
  );

  const mobileStyles = sourceBetween(
    styles,
    "@media (max-width: 900px)",
    "@media (max-width: 480px)",
  );
  assert.match(
    mobileStyles,
    /\.workspace\.has-nearby \.nearby-map-location-controls\s*\{[^}]*display:\s*flex/s,
  );
  assert.match(
    mobileStyles,
    /\.workspace\.has-nearby \.map-guide-controls\s*\{[^}]*right:\s*14px[^}]*bottom:\s*max\(14px, env\(safe-area-inset-bottom\)\)/s,
  );
  assert.match(
    mobileStyles,
    /\.nearby-result-card,[\s\S]*?right:\s*66px[^}]*bottom:\s*max\(14px, env\(safe-area-inset-bottom\)\)/s,
  );
  assert.match(
    styles,
    /\.nearby-map-location-controls\s*\{[^}]*display:\s*none/s,
  );
});
