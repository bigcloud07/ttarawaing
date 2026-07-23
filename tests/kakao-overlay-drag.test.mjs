import assert from "node:assert/strict";
import test from "node:test";
import {
  getDraggedOverlayPoint,
  hasMeaningfulOverlayDrag,
} from "../app/kakao-overlay-drag.ts";

test("moves a Kakao custom overlay by the same pointer delta", () => {
  assert.deepEqual(
    getDraggedOverlayPoint(
      { x: 320, y: 180 },
      { x: 100, y: 200 },
      { x: 142, y: 169 },
    ),
    { x: 362, y: 149 },
  );
});

test("distinguishes a drag from a tap", () => {
  assert.equal(
    hasMeaningfulOverlayDrag({ x: 10, y: 10 }, { x: 12, y: 12 }),
    false,
  );
  assert.equal(
    hasMeaningfulOverlayDrag({ x: 10, y: 10 }, { x: 15, y: 10 }),
    false,
  );
  assert.equal(
    hasMeaningfulOverlayDrag({ x: 10, y: 10 }, { x: 16, y: 10 }),
    true,
  );
});
