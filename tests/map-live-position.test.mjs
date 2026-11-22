import assert from "node:assert/strict";
import test from "node:test";
import { createMapLivePositionStore } from "../app/map-live-position.ts";

test("live map position notifies subscribers only when a value changes", () => {
  const store = createMapLivePositionStore();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  const location = [37.5663, 126.9779];
  store.set({ location, travelHeading: 90 });
  assert.equal(notifications, 1);
  assert.deepEqual(store.get(), {
    location,
    deviceHeading: null,
    travelHeading: 90,
  });

  const snapshot = store.get();
  store.set({ location, travelHeading: 90 });
  assert.equal(notifications, 1);
  assert.equal(store.get(), snapshot);

  store.set({ deviceHeading: 12.5 });
  assert.equal(notifications, 2);
  assert.equal(store.get().location, location);

  unsubscribe();
  store.set({ deviceHeading: null });
  assert.equal(notifications, 2);
  assert.equal(store.get().deviceHeading, null);
});
