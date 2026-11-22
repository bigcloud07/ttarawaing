import { readFileSync } from "node:fs";

const LATENCY_MS = Number(process.env.ROUTE_LATENCY_MS ?? 250);
const REALTIME_ARRIVAL_MS = Number(process.env.REALTIME_ARRIVAL_MS ?? 400);
const ROAD_FACTOR = 1.25;
const WALK_METERS_PER_SECOND = 1.2;

const catalog = JSON.parse(
  readFileSync(new URL("../app/data/seoul-bike-stations.json", import.meta.url)),
);

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function stationsWithAvailability(known) {
  const random = seededRandom(7);
  return catalog.stations.map((station) => ({
    id: station.id,
    coordinates: [station.latitude, station.longitude],
    bikes: known ? (random() < 0.15 ? 0 : 1 + Math.floor(random() * 9)) : null,
  }));
}

function haversineMeters(a, b) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLat = toRadians(b[0] - a[0]);
  const deltaLng = toRadians(b[1] - a[1]);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a[0])) * Math.cos(toRadians(b[0])) * Math.sin(deltaLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function fakeKakaoBody(request, bikeMetersPerSecond) {
  const metersPerSecond =
    request.mode === "walk" ? WALK_METERS_PER_SECOND : bikeMetersPerSecond;
  const legs = request.coordinates.slice(0, -1).map((from, index) => {
    const to = request.coordinates[index + 1];
    const distance = Math.round(haversineMeters(from, to) * ROAD_FACTOR);
    return {
      properties: { distance, time: Math.round(distance / metersPerSecond) },
      steps: [
        {
          properties: { distance, time: 0, guidance: "이동", x: from[1], y: from[0] },
          path: { points: [[from[1], from[0]], [to[1], to[0]]] },
        },
      ],
    };
  });
  return { status: "OK", route: { properties: { landingUrl: "https://map.kakao.com/" }, legs } };
}

function installFakeFetch(bikeMetersPerSecond) {
  const stats = { requests: 0, aborted: 0, inFlight: 0, maxInFlight: 0 };
  globalThis.fetch = (_url, init = {}) => {
    const request = JSON.parse(String(init.body));
    stats.requests += 1;
    stats.inFlight += 1;
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    return new Promise((resolve, reject) => {
      const finish = () => {
        stats.inFlight -= 1;
        init.signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        clearTimeout(timer);
        finish();
        stats.aborted += 1;
        reject(new DOMException("The operation was aborted.", "AbortError"));
      };
      const timer = setTimeout(() => {
        finish();
        resolve(
          Response.json(fakeKakaoBody(request, bikeMetersPerSecond), {
            headers: {
              "X-Ttarawaing-Route-Profile": request.mode,
              ...(request.mode === "bike"
                ? { "X-Ttarawaing-Bike-Route-Mode": request.bikeRouteMode }
                : {}),
            },
          }),
        );
      }, LATENCY_MS);
      if (init.signal?.aborted) onAbort();
      else init.signal?.addEventListener("abort", onAbort, { once: true });
    });
  };
  return stats;
}

let importSequence = 0;
async function freshModules() {
  const tag = `measure-${(importSequence += 1)}`;
  const load = (path) => {
    const url = new URL(path, import.meta.url);
    url.searchParams.set("run", tag);
    return import(url.href);
  };
  const [geometry, integrated, pass] = await Promise.all([
    load("../app/route-geometry.ts"),
    load("../app/integrated-route-recommendation.ts"),
    load("../app/pass-route-recommendation.ts"),
  ]);
  return { ...geometry, ...integrated, ...pass };
}

async function recommend(modules, { origin, destination, stations, passType, signal }) {
  const bikeRouteMode = "SHORTEST";
  const integrated = await modules.recommendIntegratedRoute({
    origin,
    destination,
    stations,
    bikeRouteMode,
    signal,
    loadRoute: (input, routeSignal) =>
      modules.loadPointToPointRoute(input, { signal: routeSignal }),
  });
  const pass = await modules.recommendPassTransferRoute({
    baseInput: {
      origin,
      startStation: integrated.startStation.coordinates,
      endStation: integrated.endStation.coordinates,
      destination,
      bikeRouteMode,
    },
    baseGeometry: integrated.geometry,
    passType,
    stations,
    startStationId: integrated.startStation.id,
    endStationId: integrated.endStation.id,
    signal,
    loadGeometry: (input, routeSignal) =>
      modules.loadRouteGeometry(input, { signal: routeSignal }),
  });
  return {
    start: integrated.startStation.id,
    end: integrated.endStation.id,
    status: pass.status,
    transfers: pass.transferStops.map(({ id }) => id),
    bikeLegSeconds: pass.geometry.bikeLegs.map(({ durationSeconds }) => durationSeconds),
  };
}

const ACROSS_SEOUL = {
  origin: [37.5774, 126.8128],
  destination: [37.5568, 127.1667],
  passType: "60",
};

async function searchScenario(name, bikeMetersPerSecond) {
  const modules = await freshModules();
  const stats = installFakeFetch(bikeMetersPerSecond);
  const startedAt = performance.now();
  const route = await recommend(modules, {
    ...ACROSS_SEOUL,
    stations: stationsWithAvailability(true),
  });
  return { name, ms: Math.round(performance.now() - startedAt), ...stats, route };
}

async function restoredLaunchScenario() {
  const modules = await freshModules();
  const stats = installFakeFetch(4.2);
  const startedAt = performance.now();
  const placeholderRun = new AbortController();
  recommend(modules, {
    ...ACROSS_SEOUL,
    stations: stationsWithAvailability(false),
    signal: placeholderRun.signal,
  }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, REALTIME_ARRIVAL_MS));
  placeholderRun.abort();
  const route = await recommend(modules, {
    ...ACROSS_SEOUL,
    stations: stationsWithAvailability(true),
    signal: new AbortController().signal,
  });
  return {
    name: "restored launch, realtime lands mid-search",
    ms: Math.round(performance.now() - startedAt),
    ...stats,
    route,
  };
}

const results = [
  await searchScenario("1시간권 across Seoul", 4.2),
  await searchScenario("1시간권 across Seoul, early candidates miss", 4.0),
  await searchScenario("1시간권 across Seoul, no candidate fits", 1.5),
  await restoredLaunchScenario(),
];
for (const { inFlight, ...result } of results) {
  if (inFlight !== 0) throw new Error(`${result.name} left ${inFlight} requests open.`);
  console.log(JSON.stringify(result));
}
