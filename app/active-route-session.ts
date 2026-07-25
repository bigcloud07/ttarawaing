import type { Coordinates } from "./route-geometry";
import { isPassType } from "./pass-planning.ts";
import type { PassType } from "./pass-planning";
import {
  readStoredValue,
  removeStoredValue,
  writeStoredValue,
} from "./safe-storage.ts";

export const ACTIVE_ROUTE_SESSION_STORAGE_KEY =
  "ttarawaing-active-route-session-v1";

export type ActiveRoutePlace = {
  id: string;
  name: string;
  address: string;
  hint: string;
  coordinates: Coordinates;
};

export type ActiveRouteSession = {
  version: 1;
  origin: ActiveRoutePlace;
  destination: ActiveRoutePlace;
  passType: PassType;
  preferBikeRoads: boolean;
  selectedEndStationId?: string;
};

function isCoordinatePair(value: unknown): value is Coordinates {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [latitude, longitude] = value;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function isActiveRoutePlace(value: unknown): value is ActiveRoutePlace {
  if (!value || typeof value !== "object") return false;
  const place = value as Partial<ActiveRoutePlace>;
  return (
    typeof place.id === "string" &&
    place.id.length > 0 &&
    typeof place.name === "string" &&
    place.name.length > 0 &&
    typeof place.address === "string" &&
    typeof place.hint === "string" &&
    isCoordinatePair(place.coordinates)
  );
}

export function parseActiveRouteSession(
  serialized: string | null,
): ActiveRouteSession | null {
  if (!serialized) return null;

  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object") return null;

    const session = value as Partial<ActiveRouteSession>;
    if (
      session.version !== 1 ||
      !isActiveRoutePlace(session.origin) ||
      !isActiveRoutePlace(session.destination) ||
      session.origin.id === session.destination.id ||
      !isPassType(session.passType) ||
      typeof session.preferBikeRoads !== "boolean"
    ) {
      return null;
    }
    if (
      session.selectedEndStationId !== undefined &&
      (typeof session.selectedEndStationId !== "string" ||
        session.selectedEndStationId.length === 0)
    ) {
      return null;
    }

    return {
      version: 1,
      origin: session.origin,
      destination: session.destination,
      passType: session.passType,
      preferBikeRoads: session.preferBikeRoads,
      selectedEndStationId: session.selectedEndStationId,
    };
  } catch {
    return null;
  }
}

export function serializeActiveRouteSession(
  session: ActiveRouteSession,
): string {
  return JSON.stringify(session);
}

export function readActiveRouteSession(
  storage: Pick<Storage, "getItem">,
): ActiveRouteSession | null {
  return parseActiveRouteSession(
    readStoredValue(storage, ACTIVE_ROUTE_SESSION_STORAGE_KEY),
  );
}

export function writeActiveRouteSession(
  storage: Pick<Storage, "setItem">,
  session: ActiveRouteSession,
): boolean {
  return writeStoredValue(
    storage,
    ACTIVE_ROUTE_SESSION_STORAGE_KEY,
    serializeActiveRouteSession(session),
  );
}

export function clearActiveRouteSession(
  storage: Pick<Storage, "removeItem">,
): boolean {
  return removeStoredValue(storage, ACTIVE_ROUTE_SESSION_STORAGE_KEY);
}
