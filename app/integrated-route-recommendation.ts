import {
  createDirectRouteSegment,
} from "./route-geometry.ts";
import type {
  BikeRouteMode,
  Coordinates,
  PointToPointRouteInput,
  RouteGeometry,
  RouteSegment,
} from "./route-geometry";

export type IntegratedRouteStation = {
  id: string;
  coordinates: Coordinates;
  bikes: number | null;
};

export type IntegratedRouteRecommendation<T extends IntegratedRouteStation> = {
  startStation: T;
  endStation: T;
  alternatives: T[];
  geometry: RouteGeometry;
  adjustedForAvailability: boolean;
  optimizedForTotalRoute: boolean;
  evaluatedCombinationCount: number;
};

export type IntegratedRouteRecommendationInput<
  T extends IntegratedRouteStation,
> = {
  origin: Coordinates;
  destination: Coordinates;
  stations: readonly T[];
  bikeRouteMode: BikeRouteMode;
  selectedEndStationId?: string;
  loadRoute: (
    input: PointToPointRouteInput,
    signal?: AbortSignal,
  ) => Promise<RouteSegment>;
  signal?: AbortSignal;
  candidatePoolSize?: number;
  finalCandidateCount?: number;
  maximumConcurrency?: number;
};

type StationSegment<T extends IntegratedRouteStation> = {
  station: T;
  segment: RouteSegment;
};

type EvaluatedCombination<T extends IntegratedRouteStation> = {
  start: StationSegment<T>;
  end: StationSegment<T>;
  bike: RouteSegment;
  geometry: RouteGeometry;
  kakaoSegmentCount: number;
  totalDurationSeconds: number;
  totalDistanceMeters: number;
};

const DEFAULT_CANDIDATE_POOL_SIZE = 5;
const DEFAULT_FINAL_CANDIDATE_COUNT = 3;
const DEFAULT_MAXIMUM_CONCURRENCY = 4;

function distanceMeters(a: Coordinates, b: Coordinates) {
  const radius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(b[0] - a[0]);
  const deltaLng = toRadians(b[1] - a[1]);
  const latitudeA = toRadians(a[0]);
  const latitudeB = toRadians(b[0]);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(deltaLng / 2) ** 2;
  return (
    radius *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : Boolean(
          error &&
            typeof error === "object" &&
            "name" in error &&
            error.name === "AbortError",
        )
  );
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("The operation was aborted.", "AbortError");
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function rankByDirectDistance<T extends IntegratedRouteStation>(
  coordinates: Coordinates,
  stations: readonly T[],
) {
  return [...stations].sort(
    (a, b) =>
      distanceMeters(coordinates, a.coordinates) -
        distanceMeters(coordinates, b.coordinates) ||
      a.id.localeCompare(b.id),
  );
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  maximumConcurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
  signal?: AbortSignal,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(maximumConcurrency, values.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        throwIfAborted(signal);
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index], index);
      }
    }),
  );
  throwIfAborted(signal);
  return results;
}

async function loadRouteWithFallback(
  input: PointToPointRouteInput,
  loadRoute: (
    input: PointToPointRouteInput,
    signal?: AbortSignal,
  ) => Promise<RouteSegment>,
  signal?: AbortSignal,
) {
  try {
    return await loadRoute(input, signal);
  } catch (error: unknown) {
    if (isAbortError(error) || signal?.aborted) throw error;
    return createDirectRouteSegment(input.from, input.to, input.mode);
  }
}

function compareStationSegments<T extends IntegratedRouteStation>(
  a: StationSegment<T>,
  b: StationSegment<T>,
) {
  const sourceDifference =
    Number(b.segment.source === "kakao") -
    Number(a.segment.source === "kakao");
  return (
    sourceDifference ||
    a.segment.durationSeconds - b.segment.durationSeconds ||
    a.segment.distanceMeters - b.segment.distanceMeters ||
    a.station.id.localeCompare(b.station.id)
  );
}

function compareCombinations<T extends IntegratedRouteStation>(
  a: EvaluatedCombination<T>,
  b: EvaluatedCombination<T>,
) {
  return (
    b.kakaoSegmentCount - a.kakaoSegmentCount ||
    a.totalDurationSeconds - b.totalDurationSeconds ||
    a.totalDistanceMeters - b.totalDistanceMeters ||
    a.start.station.id.localeCompare(b.start.station.id) ||
    a.end.station.id.localeCompare(b.end.station.id)
  );
}

function includeSelectedItem<T>(
  values: T[],
  selectedValue: T | undefined,
  maximumCount: number,
  getId: (value: T) => string,
) {
  if (
    !selectedValue ||
    values.some((value) => getId(value) === getId(selectedValue))
  ) {
    return values;
  }
  if (values.length < maximumCount) return [...values, selectedValue];
  return [
    ...values.slice(0, Math.max(0, maximumCount - 1)),
    selectedValue,
  ];
}

export async function recommendIntegratedRoute<
  T extends IntegratedRouteStation,
>({
  origin,
  destination,
  stations,
  bikeRouteMode,
  selectedEndStationId,
  loadRoute,
  signal,
  candidatePoolSize = DEFAULT_CANDIDATE_POOL_SIZE,
  finalCandidateCount = DEFAULT_FINAL_CANDIDATE_COUNT,
  maximumConcurrency = DEFAULT_MAXIMUM_CONCURRENCY,
}: IntegratedRouteRecommendationInput<T>): Promise<
  IntegratedRouteRecommendation<T>
> {
  throwIfAborted(signal);
  if (!stations.length) throw new Error("Bike station catalog is empty.");

  const poolSize = clampInteger(candidatePoolSize, 1, 12);
  const finalistCount = clampInteger(finalCandidateCount, 1, poolSize);
  const concurrency = clampInteger(maximumConcurrency, 1, 8);
  const startStationsByDistance = rankByDirectDistance(origin, stations);
  const nearestStation = startStationsByDistance[0];
  const eligibleStartStations = startStationsByDistance.filter(
    (station) => station.bikes !== 0,
  );
  if (!eligibleStartStations.length) {
    throw new Error("No rental station currently has an available bike.");
  }
  const nearestEligibleStartStation = eligibleStartStations[0];
  const selectedEndStation = selectedEndStationId
    ? stations.find(({ id }) => id === selectedEndStationId)
    : undefined;
  const startPool = eligibleStartStations.slice(0, poolSize);
  const endPool = includeSelectedItem(
    rankByDirectDistance(destination, stations).slice(0, poolSize),
    selectedEndStation,
    poolSize,
    ({ id }) => id,
  );

  const [walkToPool, walkFromPool] = await Promise.all([
    mapWithConcurrency(
      startPool,
      concurrency,
      async (station) => ({
        station,
        segment: await loadRouteWithFallback(
          {
            mode: "walk",
            from: origin,
            to: station.coordinates,
          },
          loadRoute,
          signal,
        ),
      }),
      signal,
    ),
    mapWithConcurrency(
      endPool,
      concurrency,
      async (station) => ({
        station,
        segment: await loadRouteWithFallback(
          {
            mode: "walk",
            from: station.coordinates,
            to: destination,
          },
          loadRoute,
          signal,
        ),
      }),
      signal,
    ),
  ]);
  throwIfAborted(signal);

  const startFinalists = walkToPool
    .sort(compareStationSegments)
    .slice(0, finalistCount);
  const rankedEndFinalists = walkFromPool
    .sort(compareStationSegments)
    .slice(0, finalistCount);
  const selectedEndSegment = selectedEndStation
    ? walkFromPool.find(({ station }) => station.id === selectedEndStation.id)
    : undefined;
  const endFinalists = includeSelectedItem(
    rankedEndFinalists,
    selectedEndSegment,
    finalistCount,
    ({ station }) => station.id,
  );
  const pairs = startFinalists.flatMap((start) =>
    endFinalists
      .filter((end) => end.station.id !== start.station.id)
      .map((end) => ({ start, end })),
  );

  const combinations = await mapWithConcurrency(
    pairs,
    concurrency,
    async ({ start, end }) => {
      const bike = await loadRouteWithFallback(
        {
          mode: "bike",
          from: start.station.coordinates,
          to: end.station.coordinates,
          bikeRouteMode,
        },
        loadRoute,
        signal,
      );
      const geometry: RouteGeometry = {
        walkTo: start.segment,
        bike,
        bikeLegs: [
          {
            source: bike.source,
            distanceMeters: bike.distanceMeters,
            durationSeconds: bike.durationSeconds,
          },
        ],
        walkFrom: end.segment,
      };
      return {
        start,
        end,
        bike,
        geometry,
        kakaoSegmentCount: [
          start.segment,
          bike,
          end.segment,
        ].filter(({ source }) => source === "kakao").length,
        totalDurationSeconds:
          start.segment.durationSeconds +
          bike.durationSeconds +
          end.segment.durationSeconds,
        totalDistanceMeters:
          start.segment.distanceMeters +
          bike.distanceMeters +
          end.segment.distanceMeters,
      };
    },
    signal,
  );
  throwIfAborted(signal);

  const selectableCombinations = selectedEndStation
    ? combinations.filter(
        ({ end }) => end.station.id === selectedEndStation.id,
      )
    : combinations;
  const selectedCombination = [...selectableCombinations].sort(
    compareCombinations,
  )[0];
  if (!selectedCombination) {
    throw new Error("No station combination could be evaluated.");
  }

  const bestCombinationByEndStation = new Map<
    string,
    EvaluatedCombination<T>
  >();
  for (const combination of combinations) {
    const current = bestCombinationByEndStation.get(
      combination.end.station.id,
    );
    if (!current || compareCombinations(combination, current) < 0) {
      bestCombinationByEndStation.set(
        combination.end.station.id,
        combination,
      );
    }
  }
  const alternatives = [...bestCombinationByEndStation.values()]
    .sort(compareCombinations)
    .map(({ end }) => end.station);

  return {
    startStation: selectedCombination.start.station,
    endStation: selectedCombination.end.station,
    alternatives,
    geometry: selectedCombination.geometry,
    adjustedForAvailability:
      nearestStation.bikes === 0 &&
      nearestStation.id !== selectedCombination.start.station.id,
    optimizedForTotalRoute:
      nearestEligibleStartStation.id !== selectedCombination.start.station.id,
    evaluatedCombinationCount: combinations.length,
  };
}
