export type Coordinates = [number, number];

export type RouteSegment = {
  path: Coordinates[];
  source: "osrm" | "direct";
  distanceMeters: number;
  durationSeconds: number;
};

export type RouteGeometry = {
  walkTo: RouteSegment;
  bike: RouteSegment;
  walkFrom: RouteSegment;
};

export type RouteGeometryInput = {
  origin: Coordinates;
  startStation: Coordinates;
  endStation: Coordinates;
  destination: Coordinates;
};

type RouteProfile = "foot" | "bike";

type OsrmRoute = {
  distance?: unknown;
  duration?: unknown;
  geometry?: {
    type?: unknown;
    coordinates?: unknown;
  };
};

type OsrmWaypoint = {
  distance?: unknown;
};

type OsrmResponse = {
  code?: unknown;
  routes?: unknown;
  waypoints?: unknown;
};

const ROUTER_ORIGIN = "https://routing.openstreetmap.de";
const REQUEST_INTERVAL_MS = 1_100;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_DIRECT_DISTANCE_METERS = 100_000;
const MAX_GEOMETRY_POINTS = 20_000;
const SEGMENT_CACHE_LIMIT = 48;

const resolvedSegmentCache = new Map<string, RouteSegment>();
const inFlightSegmentCache = new Map<string, Promise<RouteSegment>>();

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

function segmentKey(profile: RouteProfile, from: Coordinates, to: Coordinates) {
  return `${profile}:${coordinateKey(from)}>${coordinateKey(to)}`;
}

export function createRouteGeometryKey(input: RouteGeometryInput) {
  return [
    "v1",
    `foot:${coordinateKey(input.origin)}>${coordinateKey(input.startStation)}`,
    `bike:${coordinateKey(input.startStation)}>${coordinateKey(input.endStation)}`,
    `foot:${coordinateKey(input.endStation)}>${coordinateKey(input.destination)}`,
  ].join("|");
}

function createDirectSegment(
  from: Coordinates,
  to: Coordinates,
  profile: RouteProfile,
): RouteSegment {
  const directDistance = distanceMeters(from, to);
  const metersPerSecond = profile === "foot" ? 76 / 60 : 245 / 60;
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

export function createDirectRouteGeometry(input: RouteGeometryInput): RouteGeometry {
  return {
    walkTo: createDirectSegment(input.origin, input.startStation, "foot"),
    bike: createDirectSegment(input.startStation, input.endStation, "bike"),
    walkFrom: createDirectSegment(input.endStation, input.destination, "foot"),
  };
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function scheduleRequest<T>(request: () => Promise<T>) {
  const scheduled = requestQueue.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay > 0) await wait(delay);
    nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
    return request();
  });

  requestQueue = scheduled.then(
    () => undefined,
    () => undefined,
  );
  return scheduled;
}

function buildRouteUrl(profile: RouteProfile, from: Coordinates, to: Coordinates) {
  const endpoint = profile === "foot" ? "routed-foot" : "routed-bike";
  const coordinates = [from, to]
    .map(([latitude, longitude]) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`)
    .join(";");
  const query = new URLSearchParams({
    steps: "false",
    overview: "full",
    geometries: "geojson",
    alternatives: "false",
  });
  return `${ROUTER_ORIGIN}/${endpoint}/route/v1/driving/${coordinates}?${query}`;
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

async function requestOsrmSegment(
  profile: RouteProfile,
  from: Coordinates,
  to: Coordinates,
): Promise<RouteSegment> {
  if (!isCoordinates(from) || !isCoordinates(to)) {
    throw new Error("Route coordinates are invalid.");
  }
  if (distanceMeters(from, to) > MAX_DIRECT_DISTANCE_METERS) {
    throw new Error("Route is outside the prototype service area.");
  }

  const response = await scheduleRequest(async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(buildRouteUrl(profile, from, to), {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  });

  if (!response.ok) throw new Error(`OSRM returned ${response.status}.`);

  const payload = (await response.json()) as OsrmResponse;
  if (payload.code !== "Ok" || !Array.isArray(payload.routes) || !payload.routes.length) {
    throw new Error("OSRM could not find a route.");
  }

  const route = payload.routes[0] as OsrmRoute;
  const routeDistance = readFiniteNumber(route.distance, "distance");
  const durationSeconds = readFiniteNumber(route.duration, "duration");
  const waypoints = Array.isArray(payload.waypoints)
    ? (payload.waypoints as OsrmWaypoint[])
    : [];

  if (shouldUseDirectCorrection(profile, from, to, routeDistance, waypoints)) {
    return createDirectSegment(from, to, profile);
  }

  return {
    path: attachRequestedEndpoints(parsePath(route), from, to),
    source: "osrm",
    distanceMeters: routeDistance,
    durationSeconds,
  };
}

function rememberSegment(key: string, segment: RouteSegment) {
  if (resolvedSegmentCache.has(key)) resolvedSegmentCache.delete(key);
  resolvedSegmentCache.set(key, segment);
  while (resolvedSegmentCache.size > SEGMENT_CACHE_LIMIT) {
    const oldestKey = resolvedSegmentCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    resolvedSegmentCache.delete(oldestKey);
  }
}

function loadSegment(profile: RouteProfile, from: Coordinates, to: Coordinates) {
  const key = segmentKey(profile, from, to);
  const resolved = resolvedSegmentCache.get(key);
  if (resolved) {
    rememberSegment(key, resolved);
    return Promise.resolve(resolved);
  }

  const inFlight = inFlightSegmentCache.get(key);
  if (inFlight) return inFlight;

  const pending = requestOsrmSegment(profile, from, to)
    .then((segment) => {
      rememberSegment(key, segment);
      return segment;
    })
    .finally(() => inFlightSegmentCache.delete(key));
  inFlightSegmentCache.set(key, pending);
  return pending;
}

export async function loadRouteGeometry(
  input: RouteGeometryInput,
): Promise<RouteGeometry> {
  const directGeometry = createDirectRouteGeometry(input);
  const segmentRequests: Array<{
    key: keyof RouteGeometry;
    profile: RouteProfile;
    from: Coordinates;
    to: Coordinates;
  }> = [
    {
      key: "walkTo",
      profile: "foot",
      from: input.origin,
      to: input.startStation,
    },
    {
      key: "bike",
      profile: "bike",
      from: input.startStation,
      to: input.endStation,
    },
    {
      key: "walkFrom",
      profile: "foot",
      from: input.endStation,
      to: input.destination,
    },
  ];
  const result: RouteGeometry = { ...directGeometry };

  for (const segmentRequest of segmentRequests) {
    try {
      result[segmentRequest.key] = await loadSegment(
        segmentRequest.profile,
        segmentRequest.from,
        segmentRequest.to,
      );
    } catch {
      result[segmentRequest.key] = directGeometry[segmentRequest.key];
    }
  }

  if ([result.walkTo, result.bike, result.walkFrom].every(({ source }) => source === "direct")) {
    throw new Error("Road route geometry is temporarily unavailable.");
  }
  return result;
}
