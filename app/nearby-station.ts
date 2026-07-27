export type NearbyCoordinates = readonly [
  latitude: number,
  longitude: number,
];

export type NearbyStationKind = "rental" | "return";

export type NearbyAvailabilityStatus = "confirmed" | "unknown";

export type NearbyStationBase = {
  id: string;
  coordinates: NearbyCoordinates;
  bikes: number | null;
};

export type NearbyRouteSegment = {
  path: readonly NearbyCoordinates[];
  source: string;
  distanceMeters: number;
  durationSeconds: number;
};

export type NearbyStationCandidate<T extends NearbyStationBase> = {
  station: T;
  straightDistanceMeters: number;
};

export type NearbyRouteLoadInput<T extends NearbyStationBase> = {
  kind: NearbyStationKind;
  from: NearbyCoordinates;
  to: NearbyCoordinates;
  station: T;
  signal?: AbortSignal;
};

export type NearbyStationSearchInput<
  T extends NearbyStationBase,
  R extends NearbyRouteSegment,
> = {
  kind: NearbyStationKind;
  currentLocation: NearbyCoordinates;
  stations: readonly T[];
  availability: NearbyAvailabilityStatus;
  loadRoute: (input: NearbyRouteLoadInput<T>) => Promise<R>;
  signal?: AbortSignal;
};

export type NearbyStationFoundResult<
  T extends NearbyStationBase,
  R extends NearbyRouteSegment,
> = {
  status: "found";
  kind: NearbyStationKind;
  currentLocation: NearbyCoordinates;
  station: T;
  route: R | NearbyDirectRouteSegment;
  distanceMeters: number;
  durationSeconds: number;
  availability: NearbyAvailabilityStatus;
  routeStatus: "actual" | "direct-fallback";
  candidatesConsidered: number;
  failedRouteCount: number;
};

export type NearbyStationNoAvailableResult = {
  status: "no-available";
  kind: "rental";
  currentLocation: NearbyCoordinates;
  availability: "confirmed";
};

export type NearbyStationNoStationsResult = {
  status: "no-stations";
  kind: NearbyStationKind;
  currentLocation: NearbyCoordinates;
  availability: NearbyAvailabilityStatus;
};

export type NearbyStationResult<
  T extends NearbyStationBase,
  R extends NearbyRouteSegment,
> =
  | NearbyStationFoundResult<T, R>
  | NearbyStationNoAvailableResult
  | NearbyStationNoStationsResult;

export type NearbyDirectRouteSegment = {
  path: readonly [NearbyCoordinates, NearbyCoordinates];
  source: "direct";
  distanceMeters: number;
  durationSeconds: number;
};

export const NEARBY_STATION_CANDIDATE_LIMIT = 5;

const EARTH_RADIUS_METERS = 6_371_000;
const WALK_METERS_PER_SECOND = 76 / 60;
const BIKE_METERS_PER_SECOND = 245 / 60;

type RankedCandidate<T extends NearbyStationBase> = NearbyStationCandidate<T> & {
  sourceIndex: number;
};

function isValidCoordinates(
  coordinates: NearbyCoordinates,
): coordinates is NearbyCoordinates {
  const [latitude, longitude] = coordinates;
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function assertValidCoordinates(coordinates: NearbyCoordinates) {
  if (!isValidCoordinates(coordinates)) {
    throw new RangeError("Current location coordinates are invalid.");
  }
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function nearbyStraightDistanceMeters(
  from: NearbyCoordinates,
  to: NearbyCoordinates,
) {
  const deltaLatitude = toRadians(to[0] - from[0]);
  const deltaLongitude = toRadians(to[1] - from[1]);
  const latitudeFrom = toRadians(from[0]);
  const latitudeTo = toRadians(to[0]);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeFrom) *
      Math.cos(latitudeTo) *
      Math.sin(deltaLongitude / 2) ** 2;

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(
      Math.sqrt(Math.max(0, haversine)),
      Math.sqrt(Math.max(0, 1 - haversine)),
    )
  );
}

function compareRankedCandidates<T extends NearbyStationBase>(
  a: RankedCandidate<T>,
  b: RankedCandidate<T>,
) {
  return (
    a.straightDistanceMeters - b.straightDistanceMeters ||
    a.sourceIndex - b.sourceIndex
  );
}

function getRankedCandidates<T extends NearbyStationBase>({
  kind,
  currentLocation,
  stations,
  availability,
}: Omit<NearbyStationSearchInput<T, NearbyRouteSegment>, "loadRoute" | "signal">) {
  assertValidCoordinates(currentLocation);

  return stations
    .map((station, sourceIndex): RankedCandidate<T> | null => {
      if (!isValidCoordinates(station.coordinates)) return null;
      if (
        kind === "rental" &&
        availability === "confirmed" &&
        !(station.bikes !== null && Number.isFinite(station.bikes) && station.bikes > 0)
      ) {
        return null;
      }
      return {
        station,
        sourceIndex,
        straightDistanceMeters: nearbyStraightDistanceMeters(
          currentLocation,
          station.coordinates,
        ),
      };
    })
    .filter((candidate): candidate is RankedCandidate<T> => candidate !== null)
    .sort(compareRankedCandidates);
}

/**
 * Returns at most five operational candidates ordered by straight-line
 * distance. Rental searches exclude empty stations only when availability has
 * been confirmed; return and unknown-availability searches keep every station.
 */
export function selectNearbyStationCandidates<T extends NearbyStationBase>(
  input: Omit<NearbyStationSearchInput<T, NearbyRouteSegment>, "loadRoute" | "signal">,
): NearbyStationCandidate<T>[] {
  return getRankedCandidates(input)
    .slice(0, NEARBY_STATION_CANDIDATE_LIMIT)
    .map(({ station, straightDistanceMeters }) => ({
      station,
      straightDistanceMeters,
    }));
}

function isAbortError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "AbortError",
  );
}

function createAbortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

function isUsableRouteSegment(
  route: NearbyRouteSegment,
): route is NearbyRouteSegment {
  return (
    Number.isFinite(route.distanceMeters) &&
    route.distanceMeters >= 0 &&
    Number.isFinite(route.durationSeconds) &&
    route.durationSeconds >= 0
  );
}

function createDirectSegment(
  from: NearbyCoordinates,
  to: NearbyCoordinates,
  kind: NearbyStationKind,
  distanceMeters: number,
): NearbyDirectRouteSegment {
  const metersPerSecond =
    kind === "rental" ? WALK_METERS_PER_SECOND : BIKE_METERS_PER_SECOND;
  return {
    path: [
      [from[0], from[1]],
      [to[0], to[1]],
    ],
    source: "direct",
    distanceMeters,
    durationSeconds: distanceMeters / metersPerSecond,
  };
}

/**
 * Compares the five straight-nearest candidates by actual route distance.
 * Individual route failures are ignored. Cancellation always rejects the
 * search. When every route fails, the straight-nearest candidate is returned
 * with an explicitly marked direct segment.
 */
export async function findNearbyStation<
  T extends NearbyStationBase,
  R extends NearbyRouteSegment,
>({
  kind,
  currentLocation,
  stations,
  availability,
  loadRoute,
  signal,
}: NearbyStationSearchInput<T, R>): Promise<NearbyStationResult<T, R>> {
  throwIfAborted(signal);
  assertValidCoordinates(currentLocation);

  const validStationCount = stations.filter((station) =>
    isValidCoordinates(station.coordinates),
  ).length;
  if (validStationCount === 0) {
    return {
      status: "no-stations",
      kind,
      currentLocation,
      availability,
    };
  }

  const rankedCandidates = getRankedCandidates({
    kind,
    currentLocation,
    stations,
    availability,
  }).slice(0, NEARBY_STATION_CANDIDATE_LIMIT);

  if (
    kind === "rental" &&
    availability === "confirmed" &&
    rankedCandidates.length === 0
  ) {
    return {
      status: "no-available",
      kind,
      currentLocation,
      availability,
    };
  }

  if (rankedCandidates.length === 0) {
    return {
      status: "no-stations",
      kind,
      currentLocation,
      availability,
    };
  }

  const routedCandidates = await Promise.all(
    rankedCandidates.map(async (candidate) => {
      try {
        const route = await loadRoute({
          kind,
          from: currentLocation,
          to: candidate.station.coordinates,
          station: candidate.station,
          signal,
        });
        throwIfAborted(signal);
        return isUsableRouteSegment(route) ? { candidate, route } : null;
      } catch (error) {
        if (isAbortError(error)) throw error;
        if (signal?.aborted) throw createAbortError();
        return null;
      }
    }),
  );
  throwIfAborted(signal);

  const successfulRoutes = routedCandidates
    .filter(
      (
        result,
      ): result is {
        candidate: RankedCandidate<T>;
        route: R;
      } => result !== null,
    )
    .sort(
      (a, b) =>
        a.route.distanceMeters - b.route.distanceMeters ||
        compareRankedCandidates(a.candidate, b.candidate),
    );

  const failedRouteCount = rankedCandidates.length - successfulRoutes.length;
  const bestRoute = successfulRoutes[0];
  if (bestRoute) {
    return {
      status: "found",
      kind,
      currentLocation,
      station: bestRoute.candidate.station,
      route: bestRoute.route,
      distanceMeters: bestRoute.route.distanceMeters,
      durationSeconds: bestRoute.route.durationSeconds,
      availability,
      routeStatus: "actual",
      candidatesConsidered: rankedCandidates.length,
      failedRouteCount,
    };
  }

  const nearest = rankedCandidates[0];
  const route = createDirectSegment(
    currentLocation,
    nearest.station.coordinates,
    kind,
    nearest.straightDistanceMeters,
  );
  return {
    status: "found",
    kind,
    currentLocation,
    station: nearest.station,
    route,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    availability,
    routeStatus: "direct-fallback",
    candidatesConsidered: rankedCandidates.length,
    failedRouteCount,
  };
}
