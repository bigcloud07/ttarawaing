export type RealtimeBikeAvailability = {
  id: string;
  availableBikes: number;
};

export type RealtimeBikeFetchOptions = {
  fetchImpl?: typeof fetch;
  attemptTimeoutMs?: number;
};

const BIKE_SEOUL_REALTIME_URL =
  "https://www.bikeseoul.com/app/station/getStationRealtimeStatus.do";
export const REALTIME_BIKE_ATTEMPT_TIMEOUT_MS = 6_000;

function toBikeCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function createAbortError(reason?: unknown) {
  if (reason instanceof Error) return reason;
  return new DOMException("The operation was aborted.", "AbortError");
}

export function normalizeRealtimeBikeAvailability(
  payload: unknown,
): RealtimeBikeAvailability[] {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as Record<string, unknown>;

  if (Array.isArray(body.stations)) {
    return body.stations.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const station = value as Record<string, unknown>;
      if (
        typeof station.id !== "string" ||
        typeof station.availableBikes !== "number" ||
        !Number.isFinite(station.availableBikes) ||
        station.availableBikes < 0
      ) {
        return [];
      }
      return [
        {
          id: station.id,
          availableBikes: Math.floor(station.availableBikes),
        },
      ];
    });
  }

  if (!Array.isArray(body.realtimeList)) return [];
  return body.realtimeList.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const station = value as Record<string, unknown>;
    const stationName =
      typeof station.stationName === "string" ? station.stationName : "";
    const id = stationName.match(/^\s*(\d+)\./)?.[1];
    if (!id) return [];

    return [
      {
        id,
        availableBikes:
          toBikeCount(station.parkingBikeTotCnt) +
          toBikeCount(station.parkingQRBikeCnt) +
          toBikeCount(station.parkingELECBikeCnt),
      },
    ];
  });
}

async function runAttemptWithTimeout<T>(
  parentSignal: AbortSignal,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (parentSignal.aborted) throw createAbortError(parentSignal.reason);

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let rejectPending: ((error: unknown) => void) | undefined;
  const onParentAbort = () => {
    controller.abort(parentSignal.reason);
    rejectPending?.(createAbortError(parentSignal.reason));
  };

  parentSignal.addEventListener("abort", onParentAbort, { once: true });
  try {
    return await new Promise<T>((resolve, reject) => {
      rejectPending = reject;
      timeoutId = setTimeout(() => {
        controller.abort(new DOMException("Request timed out.", "TimeoutError"));
        reject(new DOMException("Request timed out.", "TimeoutError"));
      }, timeoutMs);

      void operation(controller.signal).then(resolve, reject);
    });
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    parentSignal.removeEventListener("abort", onParentAbort);
  }
}

export async function fetchRealtimeBikeAvailability(
  signal: AbortSignal,
  {
    fetchImpl = fetch,
    attemptTimeoutMs = REALTIME_BIKE_ATTEMPT_TIMEOUT_MS,
  }: RealtimeBikeFetchOptions = {},
) {
  const requests = [
    (requestSignal: AbortSignal) =>
      fetchImpl(BIKE_SEOUL_REALTIME_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({ stationGrpSeq: "ALL" }),
        signal: requestSignal,
      }),
    (requestSignal: AbortSignal) =>
      fetchImpl("/api/bike-stations/realtime", {
        headers: { Accept: "application/json" },
        signal: requestSignal,
      }),
  ];

  for (const makeRequest of requests) {
    if (signal.aborted) throw createAbortError(signal.reason);
    try {
      const availability = await runAttemptWithTimeout(
        signal,
        attemptTimeoutMs,
        async (requestSignal) => {
          const response = await makeRequest(requestSignal);
          if (!response.ok) return [];
          return normalizeRealtimeBikeAvailability(await response.json());
        },
      );
      if (availability.length >= 2_700) return availability;
    } catch {
      if (signal.aborted) {
        throw createAbortError(signal.reason);
      }
      // A source timeout or failure falls through to the next safe source.
    }
  }

  throw new Error("Realtime bike status request failed.");
}
