import { respondWithBikeSeoulRealtime } from "../../../bike-seoul-realtime-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return respondWithBikeSeoulRealtime(request);
}
