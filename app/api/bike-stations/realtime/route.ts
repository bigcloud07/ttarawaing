import { requestBikeSeoulRealtime } from "../../../bike-seoul-realtime-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  try {
    const upstream = await requestBikeSeoulRealtime({
      signal: request.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Ttarawaing/1.0; +https://ttarawaing.vercel.app)",
      },
    });

    const payload = (await upstream.json()) as Record<string, unknown>;
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
          "Cache-Control": "public, max-age=20, stale-while-revalidate=90",
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
