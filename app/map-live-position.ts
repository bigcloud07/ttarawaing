import { useSyncExternalStore } from "react";
import type { MapLocationMode } from "./map-location-ui";
import type { Coordinates } from "./route-geometry";

export type MapLivePosition = {
  location: Coordinates | null;
  deviceHeading: number | null;
  travelHeading: number | null;
};

export type MapLivePositionStore = {
  get: () => MapLivePosition;
  set: (patch: Partial<MapLivePosition>) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createMapLivePositionStore(): MapLivePositionStore {
  let position: MapLivePosition = {
    location: null,
    deviceHeading: null,
    travelHeading: null,
  };
  const listeners = new Set<() => void>();
  return {
    get: () => position,
    set: (patch) => {
      const next = { ...position, ...patch };
      if (
        next.location === position.location &&
        next.deviceHeading === position.deviceHeading &&
        next.travelHeading === position.travelHeading
      ) {
        return;
      }
      position = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useMapLivePosition(
  store: MapLivePositionStore,
  locationMode: MapLocationMode,
) {
  const position = useSyncExternalStore(store.subscribe, store.get, store.get);
  return {
    userLocation: position.location,
    userHeading:
      locationMode === "heading"
        ? (position.deviceHeading ?? position.travelHeading)
        : null,
  };
}
