import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the route planner wires the core product funnel without precise location properties", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  for (const eventName of [
    "core_view",
    "endpoints_selected",
    "route_search_started",
    "route_search_succeeded",
    "route_search_failed",
    "bike_deeplink_clicked",
    "nearby_station_requested",
    "nearby_station_succeeded",
    "nearby_station_failed",
  ]) {
    assert.match(source, new RegExp(`trackProductEvent\\(\\s*"${eventName}"`));
  }

  assert.doesNotMatch(
    source,
    /trackProductEvent\([\s\S]{0,500}\b(?:latitude|longitude|address|station_name|origin_name|destination_name)\s*:/,
  );
  assert.match(
    source,
    /trackedEndpointSelectionKeyRef\.current =\s*`\$\{restoredRoute\.origin\.id\}\|\$\{restoredRoute\.destination\.id\}`/,
  );
  assert.match(
    source,
    /search_attempt_id: analyticsAttempt\.id,[\s\S]*?reason: "missing_endpoint"/,
  );
  assert.match(source, /bike_deeplink_clicked[\s\S]*?immediate: true/);
});

test("availability refreshes emit one isolated product event", async () => {
  const source = await readFile(
    new URL("../app/start-station-availability-control.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /trackProductEvent\("availability_refreshed"/);
  assert.match(source, /outcome: "success"/);
  assert.match(source, /outcome: "failure"/);
  assert.match(source, /recommendation_changed: recommendationChanged/);
});
