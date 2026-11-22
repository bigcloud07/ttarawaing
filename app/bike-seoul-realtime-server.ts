export const BIKE_SEOUL_REALTIME_URL =
  "https://www.bikeseoul.com/app/station/getStationRealtimeStatus.do";
export const BIKE_SEOUL_REALTIME_ATTEMPT_TIMEOUT_MS = 1_500;
export const BIKE_SEOUL_REALTIME_RETRY_DELAYS_MS = [150, 350] as const;

type BikeSeoulRealtimeRequestOptions = {
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  attemptTimeoutMs?: number;
  retryDelaysMs?: readonly number[];
};

class BikeSeoulHttpError extends Error {
  readonly retryable: boolean;

  constructor(status: number) {
    super(`Bike Seoul returned ${status}.`);
    this.name = "BikeSeoulHttpError";
    this.retryable = status === 408 || status === 429 || status >= 500;
  }
}

function createAbortError(reason?: unknown) {
  if (reason instanceof Error) return reason;
  return new DOMException("The operation was aborted.", "AbortError");
}

async function runFetchAttempt(
  signal: AbortSignal,
  fetchImpl: typeof fetch,
  headers: Record<string, string>,
  attemptTimeoutMs: number,
) {
  if (signal.aborted) throw createAbortError(signal.reason);

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let rejectPending: ((error: unknown) => void) | undefined;
  const onParentAbort = () => {
    controller.abort(signal.reason);
    rejectPending?.(createAbortError(signal.reason));
  };

  signal.addEventListener("abort", onParentAbort, { once: true });
  try {
    return await new Promise<Response>((resolve, reject) => {
      rejectPending = reject;
      timeoutId = setTimeout(() => {
        const timeoutError = new DOMException(
          "Bike Seoul request timed out.",
          "TimeoutError",
        );
        controller.abort(timeoutError);
        reject(timeoutError);
      }, attemptTimeoutMs);

      void fetchImpl(BIKE_SEOUL_REALTIME_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Referer:
            "https://www.bikeseoul.com/app/station/moveStationRealtimeStatus.do",
          ...headers,
        },
        body: new URLSearchParams({ stationGrpSeq: "ALL" }),
        signal: controller.signal,
      }).then(resolve, reject);
    });
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    signal.removeEventListener("abort", onParentAbort);
  }
}

function waitForRetry(delayMs: number, signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.reject(createAbortError(signal.reason));
  }
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError(signal.reason));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function requestBikeSeoulRealtime({
  signal,
  fetchImpl = fetch,
  headers = {},
  attemptTimeoutMs = BIKE_SEOUL_REALTIME_ATTEMPT_TIMEOUT_MS,
  retryDelaysMs = BIKE_SEOUL_REALTIME_RETRY_DELAYS_MS,
}: BikeSeoulRealtimeRequestOptions) {
  let lastError: unknown = new Error("Bike Seoul realtime request failed.");

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    if (signal.aborted) throw createAbortError(signal.reason);

    try {
      const response = await runFetchAttempt(
        signal,
        fetchImpl,
        headers,
        attemptTimeoutMs,
      );
      if (response.ok) return response;

      const httpError = new BikeSeoulHttpError(response.status);
      if (!httpError.retryable) throw httpError;
      lastError = httpError;
      try {
        await response.body?.cancel();
      } catch {
        // The response is being discarded before the next short retry.
      }
    } catch (error) {
      if (signal.aborted) throw createAbortError(signal.reason);
      if (error instanceof BikeSeoulHttpError && !error.retryable) throw error;
      lastError = error;
    }

    const retryDelay = retryDelaysMs[attempt];
    if (retryDelay === undefined) break;
    await waitForRetry(retryDelay, signal);
  }

  throw lastError;
}

function getBikeCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function parseStation(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const station = value as Record<string, unknown>;
  const stationName =
    typeof station.stationName === "string" ? station.stationName : "";
  const id = stationName.match(/^\s*(\d+)\./)?.[1];
  if (!id) return null;

  return {
    id,
    availableBikes:
      getBikeCount(station.parkingBikeTotCnt) +
      getBikeCount(station.parkingQRBikeCnt) +
      getBikeCount(station.parkingELECBikeCnt),
  };
}

async function readUpstreamPayload(upstream: Response) {
  const body = await upstream.text();
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Bike Seoul returned a non-JSON body (status ${upstream.status}, content-type ${upstream.headers.get("content-type")}): ${body.slice(0, 400).replace(/\s+/g, " ")}`,
    );
  }
}

export async function respondWithBikeSeoulRealtime(request: Request) {
  try {
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    const upstream = await requestBikeSeoulRealtime({
      signal: request.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Ttarawaing/1.0; +https://ttarawaing.vercel.app)",
      },
    });

    const payload = await readUpstreamPayload(upstream);
    const rawStations = Array.isArray(payload.realtimeList)
      ? payload.realtimeList
      : [];
    const parsedStations = rawStations
      .map(parseStation)
      .filter((station): station is NonNullable<typeof station> => station !== null);
    const stations = [
      ...new Map(parsedStations.map((station) => [station.id, station])).values(),
    ];

    if (stations.length < 2_700) {
      throw new Error("Bike Seoul returned an incomplete station list.");
    }

    return Response.json(
      { updatedAt: new Date().toISOString(), stations },
      {
        headers: {
          "Cache-Control": fresh
            ? "no-store"
            : "public, max-age=20, s-maxage=20, stale-while-revalidate=90",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    console.error("Bike Seoul realtime request failed", error);
    return Response.json(
      { error: "Realtime bike station data is temporarily unavailable." },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
}
