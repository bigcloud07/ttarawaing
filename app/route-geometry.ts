export type Coordinates = [number, number];

export type RouteSegment = {
  path: Coordinates[];
  source: "osrm" | "direct";
  distanceMeters: number;
  durationSeconds: number;
};

export type BikeRouteLeg = Pick<
  RouteSegment,
  "source" | "distanceMeters" | "durationSeconds"
>;

export type RouteGeometry = {
  walkTo: RouteSegment;
  bike: RouteSegment;
  bikeLegs: BikeRouteLeg[];
  walkFrom: RouteSegment;
};

export type RouteGeometryInput = {
  origin: Coordinates;
  originAddress?: string;
  startStation: Coordinates;
  endStation: Coordinates;
  destination: Coordinates;
  destinationAddress?: string;
  transferStations?: Coordinates[];
};

export type RouteGeometryLoadOptions = {
  signal?: AbortSignal;
};

type RouteProfile = "foot" | "bike";

type OsrmRoute = {
  distance?: unknown;
  duration?: unknown;
  legs?: unknown;
  geometry?: {
    type?: unknown;
    coordinates?: unknown;
  };
};

type OsrmWaypoint = {
  distance?: unknown;
  hint?: unknown;
  location?: unknown;
  name?: unknown;
};

type OsrmResponse = {
  code?: unknown;
  routes?: unknown;
  waypoints?: unknown;
};

type OsrmNearestResponse = {
  code?: unknown;
  waypoints?: unknown;
};

type OsrmTableResponse = {
  code?: unknown;
  distances?: unknown;
};

type FootAccessEndpoint = "from" | "to";

type FootAccessPreference = {
  endpoint: FootAccessEndpoint;
  roadName: string;
};

type FootAccessCandidate = {
  coordinates: Coordinates;
  distanceMeters: number;
  name: string;
};

const ROUTER_ORIGIN = "https://routing.openstreetmap.de";
const REQUEST_INTERVAL_MS = 1_100;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_DIRECT_DISTANCE_METERS = 100_000;
const MAX_GEOMETRY_POINTS = 20_000;
const SEGMENT_CACHE_LIMIT = 48;
const FOOT_METERS_PER_SECOND = 76 / 60;
const FOOT_ACCESS_CANDIDATE_COUNT = 8;
const FOOT_ACCESS_CANDIDATE_LIMIT = 4;
const MAX_FOOT_ACCESS_SNAP_METERS = 150;

const resolvedSegmentCache = new Map<string, RouteSegment>();
const inFlightSegmentCache = new Map<string, Promise<RouteSegment>>();
const nonCacheableSegmentResults = new WeakSet<RouteSegment>();
const resolvedBikeRouteCache = new Map<
  string,
  { segment: RouteSegment; legs: BikeRouteLeg[] }
>();
const inFlightBikeRouteCache = new Map<
  string,
  Promise<{ segment: RouteSegment; legs: BikeRouteLeg[] }>
>();

let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

function isCoordinates(value: unknown): value is Coordinates {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [latitude, longitude] = value;
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function distanceMeters(a: Coordinates, b: Coordinates) {
  const radius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(b[0] - a[0]);
  const deltaLng = toRadians(b[1] - a[1]);
  const latitudeA = toRadians(a[0]);
  const latitudeB = toRadians(b[0]);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function coordinateKey([latitude, longitude]: Coordinates) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function normalizeRoadName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z가-힣]/g, "");
}

export function extractFootAccessRoadName(address?: string) {
  if (!address) return null;
  const tokens = address.normalize("NFKC").split(/\s+/);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index].replace(/^[^0-9a-z가-힣]+|[^0-9a-z가-힣]+$/gi, "");
    if (token.length >= 2 && /(?:대로|로|길)$/.test(token)) return token;
  }
  return null;
}

function createFootAccessPreference(
  address: string | undefined,
  endpoint: FootAccessEndpoint,
): FootAccessPreference | undefined {
  const roadName = extractFootAccessRoadName(address);
  return roadName ? { endpoint, roadName } : undefined;
}

function footAccessKey(preference?: FootAccessPreference) {
  return preference
    ? `@${preference.endpoint}:${normalizeRoadName(preference.roadName)}`
    : "";
}

function segmentKey(
  profile: RouteProfile,
  from: Coordinates,
  to: Coordinates,
  accessPreference?: FootAccessPreference,
) {
  return `${profile}:${coordinateKey(from)}>${coordinateKey(to)}${footAccessKey(accessPreference)}`;
}

function bikeRouteKey(coordinates: Coordinates[]) {
  return `bike:${coordinates.map(coordinateKey).join(">")}`;
}

function getBikeCoordinates(input: RouteGeometryInput) {
  return [
    input.startStation,
    ...(input.transferStations ?? []),
    input.endStation,
  ];
}

export function createRouteGeometryKey(input: RouteGeometryInput) {
  const bikeCoordinates = getBikeCoordinates(input);
  const originAccess = createFootAccessPreference(input.originAddress, "from");
  const destinationAccess = createFootAccessPreference(
    input.destinationAddress,
    "to",
  );
  return [
    "v2",
    `foot:${coordinateKey(input.origin)}>${coordinateKey(input.startStation)}${footAccessKey(originAccess)}`,
    `bike:${bikeCoordinates.map(coordinateKey).join(">")}`,
    `foot:${coordinateKey(input.endStation)}>${coordinateKey(input.destination)}${footAccessKey(destinationAccess)}`,
  ].join("|");
}

function createDirectSegment(
  from: Coordinates,
  to: Coordinates,
  profile: RouteProfile,
): RouteSegment {
  const directDistance = distanceMeters(from, to);
  const metersPerSecond = profile === "foot" ? FOOT_METERS_PER_SECOND : 245 / 60;
  return {
    path: [
      [from[0], from[1]],
      [to[0], to[1]],
    ],
    source: "direct",
    distanceMeters: directDistance,
    durationSeconds: directDistance / metersPerSecond,
  };
}

function createDirectBikeRoute(coordinates: Coordinates[]) {
  const segments = coordinates.slice(0, -1).map((from, index) =>
    createDirectSegment(from, coordinates[index + 1], "bike"),
  );
  const path = segments.flatMap((segment, index) =>
    index === 0 ? segment.path : segment.path.slice(1),
  );
  const legs = segments.map(({ source, distanceMeters, durationSeconds }) => ({
    source,
    distanceMeters,
    durationSeconds,
  }));

  return {
    segment: {
      path,
      source: "direct" as const,
      distanceMeters: legs.reduce((total, leg) => total + leg.distanceMeters, 0),
      durationSeconds: legs.reduce((total, leg) => total + leg.durationSeconds, 0),
    },
    legs,
  };
}

export function createDirectRouteGeometry(input: RouteGeometryInput): RouteGeometry {
  const directBikeRoute = createDirectBikeRoute(getBikeCoordinates(input));
  return {
    walkTo: createDirectSegment(input.origin, input.startStation, "foot"),
    bike: directBikeRoute.segment,
    bikeLegs: directBikeRoute.legs,
    walkFrom: createDirectSegment(input.endStation, input.destination, "foot"),
  };
}

function createAbortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise;
  throwIfAborted(signal);

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    const cleanup = () => signal.removeEventListener("abort", handleAbort);

    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function wait(milliseconds: number, signal?: AbortSignal) {
  throwIfAborted(signal);
  if (milliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(createAbortError());
    };
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function scheduleRequest<T>(request: () => Promise<T>, signal?: AbortSignal) {
  throwIfAborted(signal);
  const queuedRequest = requestQueue.then(async () => {
    throwIfAborted(signal);
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay > 0) await wait(delay, signal);
    throwIfAborted(signal);
    nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
    return request();
  });

  requestQueue = queuedRequest.then(
    () => undefined,
    () => undefined,
  );
  return raceWithAbort(queuedRequest, signal);
}

function formatRouterCoordinates(routeCoordinates: Coordinates[]) {
  return routeCoordinates
    .map(([latitude, longitude]) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`)
    .join(";");
}

function buildRouteUrl(profile: RouteProfile, routeCoordinates: Coordinates[]) {
  const endpoint = profile === "foot" ? "routed-foot" : "routed-bike";
  const coordinates = formatRouterCoordinates(routeCoordinates);
  const query = new URLSearchParams({
    steps: "false",
    overview: "full",
    geometries: "geojson",
    alternatives: "false",
  });
  return `${ROUTER_ORIGIN}/${endpoint}/route/v1/driving/${coordinates}?${query}`;
}

function buildFootNearestUrl(coordinates: Coordinates) {
  const query = new URLSearchParams({
    number: String(FOOT_ACCESS_CANDIDATE_COUNT),
  });
  return `${ROUTER_ORIGIN}/routed-foot/nearest/v1/driving/${formatRouterCoordinates([
    coordinates,
  ])}?${query}`;
}

function buildFootAccessTableUrl(
  endpoint: FootAccessEndpoint,
  candidates: FootAccessCandidate[],
  fixedEndpoint: Coordinates,
) {
  const candidateCoordinates = candidates.map((candidate) => candidate.coordinates);
  const coordinates =
    endpoint === "from"
      ? [...candidateCoordinates, fixedEndpoint]
      : [fixedEndpoint, ...candidateCoordinates];
  const candidateIndexes = candidates.map((_, index) =>
    endpoint === "from" ? index : index + 1,
  );
  const fixedIndex = endpoint === "from" ? coordinates.length - 1 : 0;
  const query = new URLSearchParams({
    annotations: "distance",
    sources:
      endpoint === "from" ? candidateIndexes.join(";") : String(fixedIndex),
    destinations:
      endpoint === "from" ? String(fixedIndex) : candidateIndexes.join(";"),
  });
  return `${ROUTER_ORIGIN}/routed-foot/table/v1/driving/${formatRouterCoordinates(
    coordinates,
  )}?${query}`;
}

function readFiniteNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid OSRM ${label}.`);
  }
  return value;
}

function parsePath(route: OsrmRoute) {
  const geometry = route.geometry;
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
    throw new Error("OSRM did not return a GeoJSON LineString.");
  }
  if (geometry.coordinates.length < 2 || geometry.coordinates.length > MAX_GEOMETRY_POINTS) {
    throw new Error("OSRM returned an invalid number of route points.");
  }

  return geometry.coordinates.map((rawCoordinate) => {
    if (!Array.isArray(rawCoordinate) || rawCoordinate.length < 2) {
      throw new Error("OSRM returned an invalid route coordinate.");
    }
    const longitude = rawCoordinate[0];
    const latitude = rawCoordinate[1];
    const coordinate: Coordinates = [latitude, longitude];
    if (!isCoordinates(coordinate)) {
      throw new Error("OSRM returned an out-of-range route coordinate.");
    }
    return coordinate;
  });
}

function attachRequestedEndpoints(
  path: Coordinates[],
  from: Coordinates,
  to: Coordinates,
) {
  const connected = path.map(
    ([latitude, longitude]) => [latitude, longitude] as Coordinates,
  );
  if (distanceMeters(from, connected[0]) > 1) {
    connected.unshift([from[0], from[1]]);
  } else {
    connected[0] = [from[0], from[1]];
  }

  const lastIndex = connected.length - 1;
  if (distanceMeters(connected[lastIndex], to) > 1) {
    connected.push([to[0], to[1]]);
  } else {
    connected[lastIndex] = [to[0], to[1]];
  }
  return connected;
}

function attachRequestedWaypoints(
  path: Coordinates[],
  requestedCoordinates: Coordinates[],
) {
  const connected = attachRequestedEndpoints(
    path,
    requestedCoordinates[0],
    requestedCoordinates[requestedCoordinates.length - 1],
  );
  let searchStartIndex = 1;

  for (const requested of requestedCoordinates.slice(1, -1)) {
    let closestIndex = searchStartIndex;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (let index = searchStartIndex; index < connected.length - 1; index += 1) {
      const distance = distanceMeters(requested, connected[index]);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }

    if (closestDistance <= 1) {
      connected[closestIndex] = [requested[0], requested[1]];
    } else {
      connected.splice(closestIndex, 0, [requested[0], requested[1]]);
    }
    searchStartIndex = closestIndex + 1;
  }

  return connected;
}

function shouldUseDirectCorrection(
  profile: RouteProfile,
  from: Coordinates,
  to: Coordinates,
  routeDistance: number,
  waypoints: OsrmWaypoint[],
) {
  const directDistance = distanceMeters(from, to);
  if (directDistance > MAX_DIRECT_DISTANCE_METERS) return true;

  const routeRatio = routeDistance / Math.max(1, directDistance);
  const excessiveShortWalk =
    profile === "foot" &&
    directDistance <= 250 &&
    routeDistance >= 750 &&
    routeRatio > 4;
  const excessiveSnap = waypoints.some(
    (waypoint) =>
      typeof waypoint.distance === "number" &&
      Number.isFinite(waypoint.distance) &&
      waypoint.distance > 250,
  );
  return excessiveShortWalk || excessiveSnap;
}

type OsrmRouteResult = {
  route: OsrmRoute;
  routeDistance: number;
  durationSeconds: number;
  path: Coordinates[];
  waypoints: OsrmWaypoint[];
};

async function requestOsrmPayload<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const payload = await scheduleRequest(async () => {
    throwIfAborted(signal);
    const controller = new AbortController();
    let timedOut = false;
    const handleCallerAbort = () => controller.abort();
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    signal?.addEventListener("abort", handleCallerAbort, { once: true });
    try {
      const pending = fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const fetched = await raceWithAbort(pending, controller.signal);
      throwIfAborted(signal);
      if (!fetched.ok) throw new Error(`OSRM returned ${fetched.status}.`);
      return (await raceWithAbort(
        fetched.json() as Promise<T>,
        controller.signal,
      )) as T;
    } catch (error) {
      if (signal?.aborted) throw createAbortError();
      if (timedOut) throw new Error("OSRM request timed out.");
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleCallerAbort);
    }
  }, signal);

  throwIfAborted(signal);
  return payload;
}

async function requestOsrmRoute(
  profile: RouteProfile,
  coordinates: Coordinates[],
  signal?: AbortSignal,
): Promise<OsrmRouteResult> {
  throwIfAborted(signal);
  if (coordinates.length < 2 || coordinates.some((coordinate) => !isCoordinates(coordinate))) {
    throw new Error("Route coordinates are invalid.");
  }
  if (
    coordinates
      .slice(0, -1)
      .some((coordinate, index) =>
        distanceMeters(coordinate, coordinates[index + 1]) > MAX_DIRECT_DISTANCE_METERS,
      )
  ) {
    throw new Error("Route is outside the prototype service area.");
  }

  const payload = await requestOsrmPayload<OsrmResponse>(
    buildRouteUrl(profile, coordinates),
    signal,
  );
  if (payload.code !== "Ok" || !Array.isArray(payload.routes) || !payload.routes.length) {
    throw new Error("OSRM could not find a route.");
  }

  const route = payload.routes[0] as OsrmRoute;
  const routeDistance = readFiniteNumber(route.distance, "distance");
  const durationSeconds = readFiniteNumber(route.duration, "duration");
  const waypoints = Array.isArray(payload.waypoints)
    ? (payload.waypoints as OsrmWaypoint[])
    : [];

  return {
    route,
    routeDistance,
    durationSeconds,
    path: parsePath(route),
    waypoints,
  };
}

function waypointSnapDistance(waypoint: OsrmWaypoint | undefined) {
  const distance = waypoint?.distance;
  return typeof distance === "number" && Number.isFinite(distance) && distance > 0
    ? distance
    : 0;
}

function totalWaypointSnapDistance(waypoints: OsrmWaypoint[]) {
  return waypoints.reduce(
    (total, waypoint) => total + waypointSnapDistance(waypoint),
    0,
  );
}

function isSuspiciousFootDetour(
  from: Coordinates,
  to: Coordinates,
  routeDistance: number,
  waypoints: OsrmWaypoint[],
) {
  const directDistance = distanceMeters(from, to);
  const connectedDistance = routeDistance + totalWaypointSnapDistance(waypoints);
  return (
    directDistance <= 1_000 &&
    connectedDistance - directDistance >= 180 &&
    connectedDistance / Math.max(1, directDistance) > 2.2
  );
}

function footAccessRoadMatchRank(candidateName: string, roadName: string) {
  const normalizedRoadName = normalizeRoadName(roadName);
  if (!normalizedRoadName) return null;
  const candidateRoadNames = candidateName
    .split(/[\/,·]/)
    .map(normalizeRoadName)
    .filter(Boolean);
  if (candidateRoadNames.includes(normalizedRoadName)) return 0;
  return candidateRoadNames.some((name) => name.includes(normalizedRoadName))
    ? 1
    : null;
}

async function requestFootAccessCandidates(
  coordinates: Coordinates,
  roadName: string,
  signal?: AbortSignal,
) {
  const payload = await requestOsrmPayload<OsrmNearestResponse>(
    buildFootNearestUrl(coordinates),
    signal,
  );
  if (payload.code !== "Ok" || !Array.isArray(payload.waypoints)) return [];

  const seenCoordinates = new Set<string>();
  const rankedCandidates = (payload.waypoints as OsrmWaypoint[])
    .flatMap((waypoint) => {
      const rawLocation = waypoint.location;
      const rawDistance = waypoint.distance;
      const name = typeof waypoint.name === "string" ? waypoint.name : "";
      if (
        !Array.isArray(rawLocation) ||
        rawLocation.length < 2 ||
        typeof rawDistance !== "number" ||
        !Number.isFinite(rawDistance) ||
        rawDistance < 0 ||
        rawDistance > MAX_FOOT_ACCESS_SNAP_METERS
      ) {
        return [];
      }
      const candidateCoordinates: Coordinates = [
        Number(rawLocation[1]),
        Number(rawLocation[0]),
      ];
      if (!isCoordinates(candidateCoordinates)) return [];
      const matchRank = footAccessRoadMatchRank(name, roadName);
      if (matchRank === null) return [];
      const key = coordinateKey(candidateCoordinates);
      if (seenCoordinates.has(key)) return [];
      seenCoordinates.add(key);
      return [
        {
          candidate: {
            coordinates: candidateCoordinates,
            distanceMeters: rawDistance,
            name,
          } satisfies FootAccessCandidate,
          matchRank,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.matchRank - b.matchRank ||
        a.candidate.distanceMeters - b.candidate.distanceMeters,
    );
  const bestMatchRank = rankedCandidates[0]?.matchRank;
  return rankedCandidates
    .filter(({ matchRank }) => matchRank === bestMatchRank)
    .slice(0, FOOT_ACCESS_CANDIDATE_LIMIT)
    .map(({ candidate }) => candidate);
}

function readTableDistance(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

async function selectFootAccessCandidate(
  endpoint: FootAccessEndpoint,
  candidates: FootAccessCandidate[],
  fixedEndpoint: Coordinates,
  signal?: AbortSignal,
) {
  if (!candidates.length) return null;
  const payload = await requestOsrmPayload<OsrmTableResponse>(
    buildFootAccessTableUrl(endpoint, candidates, fixedEndpoint),
    signal,
  );
  if (payload.code !== "Ok" || !Array.isArray(payload.distances)) return null;
  const distanceRows = payload.distances as unknown[][];
  let best:
    | { candidate: FootAccessCandidate; networkDistance: number; score: number }
    | undefined;

  candidates.forEach((candidate, index) => {
    const networkDistance = readTableDistance(
      endpoint === "from" ? distanceRows[index]?.[0] : distanceRows[0]?.[index],
    );
    if (networkDistance === null) return;
    const score = networkDistance + candidate.distanceMeters * 2;
    if (!best || score < best.score) {
      best = { candidate, networkDistance, score };
    }
  });
  return best?.candidate ?? null;
}

async function requestPreferredFootAccessSegment(
  from: Coordinates,
  to: Coordinates,
  originalRoute: OsrmRouteResult,
  preference: FootAccessPreference,
  signal?: AbortSignal,
): Promise<RouteSegment | null> {
  if (
    !isSuspiciousFootDetour(
      from,
      to,
      originalRoute.routeDistance,
      originalRoute.waypoints,
    )
  ) {
    return null;
  }

  const accessEndpoint = preference.endpoint === "from" ? from : to;
  const fixedEndpoint = preference.endpoint === "from" ? to : from;
  const candidates = await requestFootAccessCandidates(
    accessEndpoint,
    preference.roadName,
    signal,
  );
  const candidate = await selectFootAccessCandidate(
    preference.endpoint,
    candidates,
    fixedEndpoint,
    signal,
  );
  if (!candidate) return null;

  const correctedCoordinates: [Coordinates, Coordinates] =
    preference.endpoint === "from"
      ? [candidate.coordinates, to]
      : [from, candidate.coordinates];
  const correctedRoute = await requestOsrmRoute(
    "foot",
    correctedCoordinates,
    signal,
  );
  const accessConnectorDistance = distanceMeters(
    accessEndpoint,
    candidate.coordinates,
  );
  const connectorDistance =
    accessConnectorDistance +
    totalWaypointSnapDistance(correctedRoute.waypoints);
  const correctedDistance = correctedRoute.routeDistance + connectorDistance;
  const originalDistance =
    originalRoute.routeDistance +
    totalWaypointSnapDistance(originalRoute.waypoints);
  const minimumImprovement = Math.max(100, originalDistance * 0.2);
  if (originalDistance - correctedDistance < minimumImprovement) return null;

  const pathWithCandidate = attachRequestedEndpoints(
    correctedRoute.path,
    correctedCoordinates[0],
    correctedCoordinates[1],
  );
  return {
    path: attachRequestedEndpoints(pathWithCandidate, from, to),
    source: "osrm",
    distanceMeters: correctedDistance,
    durationSeconds:
      correctedRoute.durationSeconds + connectorDistance / FOOT_METERS_PER_SECOND,
  };
}

async function requestOsrmSegment(
  profile: RouteProfile,
  from: Coordinates,
  to: Coordinates,
  accessPreference?: FootAccessPreference,
  signal?: AbortSignal,
): Promise<RouteSegment> {
  const routeResult = await requestOsrmRoute(profile, [from, to], signal);
  const { routeDistance, durationSeconds, path, waypoints } = routeResult;
  let accessRecoveryFailed = false;

  if (profile === "foot" && accessPreference) {
    try {
      const correctedSegment = await requestPreferredFootAccessSegment(
        from,
        to,
        routeResult,
        accessPreference,
        signal,
      );
      if (correctedSegment) return correctedSegment;
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) throw createAbortError();
      accessRecoveryFailed = true;
    }
  }

  if (shouldUseDirectCorrection(profile, from, to, routeDistance, waypoints)) {
    const directSegment = createDirectSegment(from, to, profile);
    if (accessRecoveryFailed) nonCacheableSegmentResults.add(directSegment);
    return directSegment;
  }

  const connectorDistance = totalWaypointSnapDistance(waypoints);
  const connectorSpeed =
    profile === "foot" ? FOOT_METERS_PER_SECOND : 245 / 60;

  const segment: RouteSegment = {
    path: attachRequestedEndpoints(path, from, to),
    source: "osrm",
    distanceMeters: routeDistance + connectorDistance,
    durationSeconds: durationSeconds + connectorDistance / connectorSpeed,
  };
  if (accessRecoveryFailed) nonCacheableSegmentResults.add(segment);
  return segment;
}

async function requestOsrmBikeRoute(
  coordinates: Coordinates[],
  signal?: AbortSignal,
): Promise<{ segment: RouteSegment; legs: BikeRouteLeg[] }> {
  const { route, routeDistance, path, waypoints } =
    await requestOsrmRoute("bike", coordinates, signal);
  const from = coordinates[0];
  const to = coordinates[coordinates.length - 1];

  if (shouldUseDirectCorrection("bike", from, to, routeDistance, waypoints)) {
    return createDirectBikeRoute(coordinates);
  }
  if (!Array.isArray(route.legs) || route.legs.length !== coordinates.length - 1) {
    throw new Error("OSRM did not return the expected bicycle route legs.");
  }

  const snapDistances = coordinates.map((_, index) => {
    const distance = waypoints[index]?.distance;
    return typeof distance === "number" && Number.isFinite(distance) && distance > 0
      ? distance
      : 0;
  });
  const bicycleMetersPerSecond = 245 / 60;

  const legs = route.legs.map((rawLeg, index) => {
    if (!rawLeg || typeof rawLeg !== "object") {
      throw new Error(`OSRM returned an invalid bicycle route leg ${index + 1}.`);
    }
    const leg = rawLeg as { distance?: unknown; duration?: unknown };
    const connectorDistance = snapDistances[index] + snapDistances[index + 1];
    return {
      source: "osrm" as const,
      distanceMeters:
        readFiniteNumber(leg.distance, `leg ${index + 1} distance`) +
        connectorDistance,
      durationSeconds:
        readFiniteNumber(leg.duration, `leg ${index + 1} duration`) +
        connectorDistance / bicycleMetersPerSecond,
    };
  });

  return {
    segment: {
      path: attachRequestedWaypoints(path, coordinates),
      source: "osrm",
      distanceMeters: legs.reduce((total, leg) => total + leg.distanceMeters, 0),
      durationSeconds: legs.reduce((total, leg) => total + leg.durationSeconds, 0),
    },
    legs,
  };
}

function rememberSegment(key: string, segment: RouteSegment) {
  if (nonCacheableSegmentResults.has(segment)) return;
  if (resolvedSegmentCache.has(key)) resolvedSegmentCache.delete(key);
  resolvedSegmentCache.set(key, segment);
  while (resolvedSegmentCache.size > SEGMENT_CACHE_LIMIT) {
    const oldestKey = resolvedSegmentCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    resolvedSegmentCache.delete(oldestKey);
  }
}

function loadSegment(
  profile: RouteProfile,
  from: Coordinates,
  to: Coordinates,
  accessPreference?: FootAccessPreference,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const key = segmentKey(profile, from, to, accessPreference);
  const resolved = resolvedSegmentCache.get(key);
  if (resolved) {
    rememberSegment(key, resolved);
    return Promise.resolve(resolved);
  }

  // A cancelable caller owns its request. It must not share an in-flight promise
  // whose network signal could be canceled by a different route calculation.
  if (signal) {
    return requestOsrmSegment(
      profile,
      from,
      to,
      accessPreference,
      signal,
    ).then((segment) => {
      rememberSegment(key, segment);
      return segment;
    });
  }

  const inFlight = inFlightSegmentCache.get(key);
  if (inFlight) return inFlight;

  const pending = requestOsrmSegment(profile, from, to, accessPreference)
    .then((segment) => {
      rememberSegment(key, segment);
      return segment;
    })
    .finally(() => inFlightSegmentCache.delete(key));
  inFlightSegmentCache.set(key, pending);
  return pending;
}

function rememberBikeRoute(
  key: string,
  route: { segment: RouteSegment; legs: BikeRouteLeg[] },
) {
  if (resolvedBikeRouteCache.has(key)) resolvedBikeRouteCache.delete(key);
  resolvedBikeRouteCache.set(key, route);
  while (resolvedBikeRouteCache.size > SEGMENT_CACHE_LIMIT) {
    const oldestKey = resolvedBikeRouteCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    resolvedBikeRouteCache.delete(oldestKey);
  }
}

function loadBikeRoute(coordinates: Coordinates[], signal?: AbortSignal) {
  throwIfAborted(signal);
  const key = bikeRouteKey(coordinates);
  const resolved = resolvedBikeRouteCache.get(key);
  if (resolved) {
    rememberBikeRoute(key, resolved);
    return Promise.resolve(resolved);
  }

  if (signal) {
    return requestOsrmBikeRoute(coordinates, signal).then((route) => {
      rememberBikeRoute(key, route);
      return route;
    });
  }

  const inFlight = inFlightBikeRouteCache.get(key);
  if (inFlight) return inFlight;

  const pending = requestOsrmBikeRoute(coordinates)
    .then((route) => {
      rememberBikeRoute(key, route);
      return route;
    })
    .finally(() => inFlightBikeRouteCache.delete(key));
  inFlightBikeRouteCache.set(key, pending);
  return pending;
}

export async function loadRouteGeometry(
  input: RouteGeometryInput,
  signalOrOptions?: AbortSignal | RouteGeometryLoadOptions,
): Promise<RouteGeometry> {
  const signal: AbortSignal | undefined =
    signalOrOptions && "signal" in signalOrOptions
      ? signalOrOptions.signal
      : (signalOrOptions as AbortSignal | undefined);
  throwIfAborted(signal);
  const directGeometry = createDirectRouteGeometry(input);
  const result: RouteGeometry = { ...directGeometry };
  const originAccessPreference = createFootAccessPreference(
    input.originAddress,
    "from",
  );
  const destinationAccessPreference = createFootAccessPreference(
    input.destinationAddress,
    "to",
  );

  try {
    result.walkTo = await loadSegment(
      "foot",
      input.origin,
      input.startStation,
      originAccessPreference,
      signal,
    );
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw createAbortError();
    result.walkTo = directGeometry.walkTo;
  }

  try {
    const bikeRoute = await loadBikeRoute(getBikeCoordinates(input), signal);
    result.bike = bikeRoute.segment;
    result.bikeLegs = bikeRoute.legs;
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw createAbortError();
    result.bike = directGeometry.bike;
    result.bikeLegs = directGeometry.bikeLegs;
  }

  try {
    result.walkFrom = await loadSegment(
      "foot",
      input.endStation,
      input.destination,
      destinationAccessPreference,
      signal,
    );
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw createAbortError();
    result.walkFrom = directGeometry.walkFrom;
  }

  throwIfAborted(signal);
  return result;
}
