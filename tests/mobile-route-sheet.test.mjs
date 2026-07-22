import assert from "node:assert/strict";
import test from "node:test";

import {
  MOBILE_ROUTE_SHEET_CLICK_SLOP_PX,
  MOBILE_ROUTE_SHEET_CLICK_SUPPRESSION_MS,
  MOBILE_ROUTE_SHEET_DRAG_THRESHOLD_PX,
  getMobileRouteSheetDragAction,
  shouldSuppressMobileRouteSheetClick,
} from "../app/mobile-route-sheet.ts";

test("drag click suppression lasts long enough for delayed mobile clicks", () => {
  assert.ok(MOBILE_ROUTE_SHEET_CLICK_SUPPRESSION_MS >= 350);
  assert.ok(MOBILE_ROUTE_SHEET_CLICK_SUPPRESSION_MS <= 600);
});

test("a downward handle drag minimizes the route details", () => {
  assert.equal(
    getMobileRouteSheetDragAction(
      { x: 40, y: 100 },
      { x: 40, y: 100 + MOBILE_ROUTE_SHEET_DRAG_THRESHOLD_PX },
    ),
    "minimize",
  );
  assert.equal(
    getMobileRouteSheetDragAction(
      { x: 40, y: 100 },
      { x: 44, y: 180 },
    ),
    "minimize",
  );
});

test("an upward handle drag expands the route details", () => {
  assert.equal(
    getMobileRouteSheetDragAction(
      { x: 40, y: 100 },
      { x: 40, y: 100 - MOBILE_ROUTE_SHEET_DRAG_THRESHOLD_PX },
    ),
    "expand",
  );
  assert.equal(
    getMobileRouteSheetDragAction(
      { x: 40, y: 100 },
      { x: 36, y: 20 },
    ),
    "expand",
  );
});

test("small or invalid handle movement keeps the current sheet state", () => {
  assert.equal(
    getMobileRouteSheetDragAction(
      { x: 40, y: 100 },
      { x: 40, y: 100 + MOBILE_ROUTE_SHEET_DRAG_THRESHOLD_PX - 1 },
    ),
    null,
  );
  assert.equal(
    getMobileRouteSheetDragAction(
      { x: 40, y: 100 },
      { x: 40, y: 100 },
    ),
    null,
  );
  assert.equal(
    getMobileRouteSheetDragAction(
      { x: Number.NaN, y: 100 },
      { x: 40, y: 160 },
    ),
    null,
  );
});

test("a mostly horizontal handle drag does not change the sheet state", () => {
  assert.equal(
    getMobileRouteSheetDragAction(
      { x: 20, y: 100 },
      { x: 100, y: 140 },
    ),
    null,
  );
});

test("pointer movement beyond tap slop suppresses the synthetic click", () => {
  assert.equal(
    shouldSuppressMobileRouteSheetClick(
      { x: 20, y: 100 },
      { x: 20 + MOBILE_ROUTE_SHEET_CLICK_SLOP_PX, y: 100 },
    ),
    true,
  );
  assert.equal(
    shouldSuppressMobileRouteSheetClick(
      { x: 20, y: 100 },
      { x: 100, y: 140 },
    ),
    true,
  );
  assert.equal(
    shouldSuppressMobileRouteSheetClick(
      { x: 20, y: 100 },
      { x: 20 + MOBILE_ROUTE_SHEET_CLICK_SLOP_PX - 1, y: 100 },
    ),
    false,
  );
});
